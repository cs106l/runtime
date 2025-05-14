import { WASIExecutionResult } from "@cs106l/wasi";
import type { CrashHostMessage, WorkerToHostMessage, HostToWorkerMessage } from "./wasi-worker";

import WASIWorker from "./wasi-worker?worker&inline";
import { CanvasHost } from "./canvas/host";
import { Language, RunStatus } from "../enums";
import { PackageRef } from "../packages";
import { Filesystem } from ".";

function sendMessage(worker: Worker, message: HostToWorkerMessage, transfer?: Transferable[]) {
  worker.postMessage(message, transfer ?? []);
}

export type WASIHostCoreContext = {
  language: Language;
  code: string;
  files: Filesystem;
  packages: readonly PackageRef[];
  env: Record<string, string>;
  entrypoint: string;
};

export type WASIHostContext = {
  core: WASIHostCoreContext;
  stdout?: (text: string) => void;
  stderr?: (text: string) => void;
  status?: (status: RunStatus) => void;
  canvas?: CanvasHost;
};

export class WASIWorkerHostKilledError extends Error {}

export class WASIWorkerCrashedError extends Error {
  constructor(public worker: CrashHostMessage) {
    super(worker.error.message);
  }
}

export class WASIWorkerHost {
  // 8kb should be big enough
  private stdinBuffer: SharedArrayBuffer = new SharedArrayBuffer(8 * 1024);

  private result?: Promise<WASIExecutionResult>;
  private worker?: Worker;
  private reject?: (reason?: unknown) => void;

  constructor(private context: WASIHostContext) {}

  async start() {
    if (this.result) {
      throw new Error("WASIWorker Host can only be started once");
    }

    this.context.status?.(RunStatus.Installing);

    this.result = new Promise<WASIExecutionResult>((resolve, reject) => {
      this.reject = reject;
      this.worker = new WASIWorker();

      this.worker.addEventListener("message", (messageEvent) => {
        const message: WorkerToHostMessage = messageEvent.data;
        switch (message.type) {
          case "status":
            this.context.status?.(message.status);
            break;
          case "stdout":
            this.context.stdout?.(message.text);
            break;
          case "stderr":
            this.context.stderr?.(message.text);
            break;
          case "result":
            resolve(message.result);
            break;
          case "crash":
            reject(new WASIWorkerCrashedError(message));
            break;
        }
      });

      sendMessage(this.worker, {
        target: "client",
        type: "start",
        core: this.context.core,
        stdinBuffer: this.stdinBuffer,
        canvasConnection: this.context.canvas?.connect(),
      });
    }).then((result) => {
      this.worker?.terminate();
      return result;
    });

    return this.result;
  }

  kill() {
    if (!this.worker) throw new Error("WASIWorker has not started");
    this.worker.terminate();
    this.reject?.(new WASIWorkerHostKilledError("WASI Worker was killed"));
  }

  async pushStdin(data: string) {
    const view = new DataView(this.stdinBuffer);

    // Wait until the stdinbuffer is fully consumed at the other end
    // before pushing more data on.

    // first four bytes (Int32) is the length of the text
    while (view.getInt32(0) !== 0) {
      // TODO: Switch to Atomics.waitAsync when supported by firefox
      await new Promise((resolve) => setTimeout(resolve, 0));
    }

    // Store the encoded text offset by 4 bytes
    const encodedText = new TextEncoder().encode(data);
    const buffer = new Uint8Array(this.stdinBuffer, 4);
    buffer.set(encodedText);

    // Store how long the text is in the first 4 bytes
    view.setInt32(0, encodedText.byteLength);
    Atomics.notify(new Int32Array(this.stdinBuffer), 0);
  }

  async pushEOF() {
    const view = new DataView(this.stdinBuffer);

    // TODO: Switch to Atomics.waitAsync when supported by firefox
    while (view.getInt32(0) !== 0) {
      await new Promise((resolve) => setTimeout(resolve, 0));
    }

    view.setInt32(0, -1);
    Atomics.notify(new Int32Array(this.stdinBuffer), 0);
  }
}
