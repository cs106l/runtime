import { WASITimestamps, type WASIExecutionResult, type WASIFile, type WASIFS } from "@cs106l/wasi";
import { Language, RunStatus } from "../enums";
import { PackageManager } from "../packages";
import type { PackageRef, PackageWorkspace } from "../packages";
import { LanguagesConfig } from "./languages";
import { fetchWASIFS } from "../utils";
import { WASIWorkerHost, WASIWorkerHostKilledError } from "./wasi-host";
import { CanvasHost } from "./canvas/host";

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
  tarGz?: string;

  /**
   * Any additional files to supplement the chain of commands
   */
  files?: Filesystem;

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

export type WriteFn = (data: string) => void;

export type OutputConfig = {
  write?: WriteFn;
  canvas?: CanvasHost;
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
  packages?: readonly PackageRef[];
  files?: Filesystem;
  env?: Record<string, string>;
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

  const write = config.output && "write" in config.output ? config.output.write : undefined;

  const host = new WASIWorkerHost({
    core: {
      language,
      code,
      files: config.files ?? {},
      packages: config.packages ?? [],
      env: config.env ?? {},
      entrypoint: config.entrypoint ?? "/program",
    },
    
    status: config.onStatusChanged,
    stdout: write,
    stderr: write,
    canvas: config.output && "canvas" in config.output ? config.output.canvas : undefined,
  });

  config.onWorkerCreated?.(host);
  const onAbort = () => host.kill();
  config.signal?.addEventListener("abort", onAbort);

  try {
    return await host.start();
  } catch (e) {
    if (!(e instanceof WASIWorkerHostKilledError)) throw e;
  } finally {
    config.signal?.removeEventListener("abort", onAbort);
    config.signal?.throwIfAborted();
  }

  throw new Error("unexpected error");
}

export function configure(language: Language): LanguageConfiguration {
  return LanguagesConfig[language];
}

export * from "./canvas";
export * from "./canvas/host";
