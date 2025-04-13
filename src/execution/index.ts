import { WASITimestamps, type WASIExecutionResult, type WASIFile, type WASIFS } from "@cs106l/wasi";
import { Language, RunStatus } from "../enums";
import { PackageManager } from "../packages";
import type { PackageRef, PackageWorkspace } from "../packages";
import { LanguagesConfig } from "./languages";
import { fetchWASIFS } from "../utils";
import { WASIWorkerHost, WASIWorkerHostKilledError } from "./wasi-host";
import { InternalCanvasEventHandler } from "./canvas";

/*
 * ============================================================================
 * Language-specific configuration
 * ============================================================================
 */

export type ExecutionContext = {
  /**
   * The name of the file listed in the entrypoint path, without the extension.
   * For example, `/path/to/entrypoint.file.txt` becomes `entrypoint.file`
   */
  entryname: string;
  entrypoint: string;
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

  /** The environment to launch the binary with */
  env?: Record<string, string>;

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
 * Code execution
 * ============================================================================
 */

export type Filesystem = {
  /**
   * Each path is a path to a single file.
   * It should have a leading "/" and no trailing slash.
   */
  [path: string]: FileEntry;
};

export type FileEntry = (TextFile | BinaryFile) & {
  /**
   * Access, modification, and (permission) change timestamps.
   * If not provided, will be set to the time of execution.
   */
  timestamps?: WASITimestamps;
};

export type TextFile = {
  mode: "string";
  content: string;
};

export type BinaryFile = {
  mode: "binary";
  content: Uint8Array;
};

function toWasiFS(fs: Filesystem): WASIFS {
  const result: WASIFS = {};
  for (const [path, entry] of Object.entries(fs)) {
    result[path] = {
      ...entry,
      path,
      timestamps: entry.timestamps ?? {
        access: new Date(),
        modification: new Date(),
        change: new Date(),
      },
    };
  }
  return result;
}

export type WriteFn = (data: string) => void;

export type OutputConfig = {
  write?: WriteFn;
  canvas?: InternalCanvasEventHandler;
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
  files?: Filesystem;
  entrypoint?: string;
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

  /* User files */
  if (config.files) vfs = { ...vfs, ...toWasiFS(config.files) };

  /* Place user code at entrypoint file */
  vfs = {
    ...vfs,
    [context.entrypoint]: {
      path: context.entrypoint,
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
      env: hostConfig.env,
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

  const entrypoint = config.entrypoint ?? "/program";
  const entryname = getFileNameWithoutExtension(entrypoint);

  return { entryname, entrypoint, write, packages };
}

function getFileNameWithoutExtension(path: string) {
  const cleanPath = path.trim().replace(/\/+$/, "");
  const file = cleanPath.split("/").pop()!.trim();
  const parts = file.split(".");
  if (parts.length === 1) return parts[0];
  return parts.slice(0, -1).join(".");
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

export * from "./canvas";
