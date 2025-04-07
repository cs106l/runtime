import { type WASIExecutionResult, type WASIFile, type WASIFS } from "@cs106l/wasi";
import { Language, RunStatus } from "../enums";
import { PackageManager } from "../packages";
import type { PackageRef, PackageWorkspace } from "../packages";
import { LanguagesConfig } from "./languages";
import { fetchWASIFS } from "../utils";
import { WASIWorkerHost, WASIWorkerHostKilledError } from "./wasi-host";
import { BaseCanvasEvent, CanvasID } from "./drive";

/*
 * ============================================================================
 * Language-specific configuration
 * ============================================================================
 */

export type ExecutionContext = {
  packages: PackageWorkspace;
  write: WriteFn;
};

export type WorkerHostConfig = {
  /**
   * The WASM binary that should be executed
   * Can either be a URL to a WASM file to be fetched, an absolute path to a file on `fs`, or a WASIFile (e.g. from a previous steps filesystem)
   */
  binary: string | WASIFile;

  /** The command that the host will run */
  args: [string, ...string[]];

  /**
   * The file system to execute the command with.
   * Defaults to the previous filesystem in the chain if not passed.
   */
  fs?: WASIFS;
};

export type LanguageStep = {
  status: RunStatus;

  /**
   * Configures this step. Either a WorkerHostConfig or a function that produces one from the previous step's result.
   * @param context The execution context for the current run
   * @param prev    The result of running the previous step.
   *                The first step will always have a file `/program` with the contents of the code to be executed.
   * @returns A configuration which can be used to run this step.
   */
  run:
    | WorkerHostConfig
    | ((
        context: ExecutionContext,
        prev: WASIExecutionResult,
      ) => WorkerHostConfig | Promise<WorkerHostConfig>);
};

export type LanguageConfiguration = {
  language: Language;

  /** An optional URL to a .tar.gz containing the initial contents of the filesystem for this language */
  filesystem?: string;
  steps: [LanguageStep, ...LanguageStep[]];
  packages: PackageManager;
};

/*
 * ============================================================================
 * Canvas support
 * ============================================================================
 */

export interface CanvasEventHandler {
  onEvent(event: BaseCanvasEvent): unknown;
}

export class CanvasContainer implements CanvasEventHandler {
  public context: CanvasRenderingContext2D;

  constructor(public canvas: HTMLCanvasElement) {
    const context = canvas.getContext("2d");
    if (context === null) throw new Error(`Unable to get rendering context for created canvas`);
    this.context = context;
  }

  onEvent(event: BaseCanvasEvent): unknown {
    switch (event.action) {
      case "sleep":
      case "new":
        return;
      case "width":
        return this.canvas.width;
      case "setWidth":
        return (this.canvas.width = event.args[0]);
      case "height":
        return this.canvas.height;
      case "setHeight":
        return (this.canvas.height = event.args[0]);
      case "fillRect":
        return this.context.fillRect(...event.args);
    }
  }
}

export type CanvasManagerOptions = {
  getCanvas: () => HTMLCanvasElement;
  onEvent?: (event: BaseCanvasEvent) => void;
}

export class CanvasManager implements CanvasEventHandler {
  public canvases = new Map<CanvasID, CanvasContainer>();

  constructor(protected options: CanvasManagerOptions) {}

  onEvent(event: BaseCanvasEvent) {
    this.options.onEvent?.(event);
    
    if (event.action === "sleep") return;

    if (event.action === "new") {
      const id = crypto.randomUUID();
      this.getContainer(id);
      return id;
    }

    const container = this.getContainer(event.id);
    container.onEvent(event);
  }

  protected getContainer(id: CanvasID) {
    let container = this.canvases.get(id);
    if (!container) {
      const canvas = this.options.getCanvas();
      container = new CanvasContainer(canvas);
      this.canvases.set(id, container);
    }
    return container;
  }
}

/*
 * ============================================================================
 * Code execution
 * ============================================================================
 */

export type WriteFn = (data: string) => void;

export type OutputConfig = {
  write?: WriteFn;
  canvas?: CanvasEventHandler;
};

/**
 * A WASI worker host. Use this to pass standard in.
 *
 * This is the same as `@runno/wasi`'s `WASIWorkerHost`
 * except it's `kill` method is omitted. To "kill" a worker host,
 * use `AbortController`.
 */
export type WorkerHost = Omit<WASIWorkerHost, "kill" | "reject">;

export type RunConfig = {
  onStatusChanged?: (status: RunStatus) => void;
  onWorkerCreated?: (host: WorkerHost) => void;
  output?: WriteFn | OutputConfig;
  packages?: PackageWorkspace | PackageRef[];
  signal?: AbortSignal;
};

/**
 * Runs a code snippet
 * @param language
 * @param code
 * @param config
 *
 * @throws `config.signal.reason` if aborted.
 *
 * @returns
 */
export async function run(
  language: Language,
  code: string,
  config?: RunConfig,
): Promise<WASIExecutionResult> {
  config ??= {};
  config.onStatusChanged?.(RunStatus.Installing);

  const langConfig = LanguagesConfig[language];
  const context = await createContext(langConfig, config);
  config.signal?.throwIfAborted();

  let vfs: WASIFS = {};

  /* Load base filesystem */
  if (langConfig.filesystem) {
    const filesystem = await fetchWASIFS(langConfig.filesystem, config);
    vfs = { ...vfs, ...filesystem };
  }

  /* Download packages */
  const filesystem = await context.packages.build(config.signal);
  vfs = { ...vfs, ...filesystem };

  /* Place user code at /program file */
  vfs = {
    ...vfs,
    "/program": {
      path: "program",
      content: `${context.packages.prefixCode(vfs)}${code}${context.packages.postfixCode(vfs)}`,
      mode: "string",
      timestamps: {
        access: new Date(),
        modification: new Date(),
        change: new Date(),
      },
    },
  };

  /* Run steps to execute code */
  let prevResult: WASIExecutionResult = { exitCode: 0, fs: vfs };
  for (const step of langConfig.steps) {
    config.onStatusChanged?.(step.status);

    let hostConfig: WorkerHostConfig;
    if (typeof step.run === "function") hostConfig = await step.run(context, prevResult);
    else hostConfig = { ...step.run };
    config.signal?.throwIfAborted();

    hostConfig.fs ??= prevResult.fs;

    const host = new WASIWorkerHost(toBinaryURL(hostConfig.fs, hostConfig.binary), {
      args: hostConfig.args,
      env: {},
      fs: hostConfig.fs,
      stdout: context.write,
      stderr: context.write,
      canvas: config.output && "canvas" in config.output ? config.output.canvas : undefined,
    });

    config.onWorkerCreated?.(host);
    const onAbort = () => host.kill();
    config.signal?.throwIfAborted();
    config.signal?.addEventListener("abort", onAbort, { once: true });

    try {
      prevResult = await host.start();
    } catch (e) {
      if (!(e instanceof WASIWorkerHostKilledError)) throw e;
    } finally {
      config.signal?.removeEventListener("abort", onAbort);
      config.signal?.throwIfAborted();
    }

    if (prevResult.exitCode !== 0) return prevResult;
  }

  return prevResult;
}

async function createContext(
  langConfig: LanguageConfiguration,
  config: RunConfig,
): Promise<ExecutionContext> {
  let write: WriteFn;
  let output = config.output ?? {};

  if (typeof output === "function") write = output;
  else write = output.write ?? (() => {});

  let packages: PackageWorkspace;
  const pm = langConfig.packages;

  if (config.packages) {
    if (Array.isArray(config.packages)) {
      packages = pm.createWorkspace();
      await packages.install(...config.packages);
    } else packages = config.packages;
  } else packages = pm.createWorkspace();

  return { write, packages };
}

function toBinaryURL(fs: WASIFS, binary: WorkerHostConfig["binary"]): string {
  if (typeof binary === "string" && !binary.startsWith("/")) return binary;

  let file: WASIFile;
  if (typeof binary === "object") file = binary;
  else {
    file = fs[binary];
    if (!file) throw new Error(`Missing binary file expected in filesystem at ${binary}`);
  }

  return URL.createObjectURL(new Blob([file.content], { type: "application/wasm" }));
}

export function configure(language: Language): LanguageConfiguration {
  return LanguagesConfig[language];
}
