import { WASI, WASIExecutionResult, WASIFile, WASIFS } from "@cs106l/wasi";
import { CanvasConnection } from "./canvas/host";
import { DriveConnection, VirtualDrive } from "./drive";
import { RunStatus } from "../enums";
import { LanguagesConfig } from "./languages";
import { ExecutionContext, Filesystem, LanguageConfiguration, WorkerHostConfig } from ".";
import { WASIHostCoreContext } from "./wasi-host";
import { fetchWASIFS } from "../utils";

type StartWorkerMessage = {
  target: "client";
  type: "start";
  core: WASIHostCoreContext;
  stdinBuffer: SharedArrayBuffer;
  canvasConnection?: CanvasConnection;
};

type StatusMessage = {
  target: "host";
  type: "status";
  status: RunStatus;
};

type StdoutHostMessage = {
  target: "host";
  type: "stdout";
  text: string;
};

type StderrHostMessage = {
  target: "host";
  type: "stderr";
  text: string;
};

type ResultHostMessage = {
  target: "host";
  type: "result";
  result: WASIExecutionResult;
};

export type CrashHostMessage = {
  target: "host";
  type: "crash";
  error: {
    message: string;
    type?: string;
    stack?: string;
  };
};

export type HostToWorkerMessage = StartWorkerMessage;

export type WorkerToHostMessage =
  | StatusMessage
  | StdoutHostMessage
  | StderrHostMessage
  | ResultHostMessage
  | CrashHostMessage;

onmessage = async (ev: MessageEvent) => {
  const data = ev.data as HostToWorkerMessage;

  switch (data.type) {
    case "start":
      const connection = new DriveConnection(data.canvasConnection);
      try {
        const result = await start(data, connection);
        sendMessage({
          target: "host",
          type: "result",
          result,
        });
      } catch (e) {
        let error;
        if (e instanceof Error) {
          error = {
            message: e.message,
            type: e.constructor.name,
            stack: e.stack,
          };
        } else {
          error = {
            message: String(e),
          };
        }
        sendMessage({
          target: "host",
          type: "crash",
          error,
        });
      } finally {
        connection.disconnect();
      }
      break;
  }
};

function sendMessage(message: WorkerToHostMessage) {
  postMessage(message);
}

function onStatusChanged(status: RunStatus) {
  sendMessage({
    target: "host",
    type: "status",
    status,
  });
}

async function start(msg: StartWorkerMessage, cxn: DriveConnection) {
  const langConfig = LanguagesConfig[msg.core.language];
  const context = await createContext(langConfig, msg.core);

  let vfs: WASIFS = {};

  /* Load base filesystem */
  if (langConfig.tarGz) {
    const filesystem = await fetchWASIFS(langConfig.tarGz);
    vfs = { ...vfs, ...filesystem };
  }

  /* Add supplemental files */
  if (langConfig.files) vfs = { ...vfs, ...toWasiFS(langConfig.files) };

  /* Download packages */
  const filesystem = await context.packages.build();
  vfs = { ...vfs, ...filesystem };

  /* User files */
  vfs = { ...vfs, ...toWasiFS(msg.core.files) };

  /* Place user code at entrypoint file */
  vfs = {
    ...vfs,
    [context.entrypoint]: {
      path: context.entrypoint,
      content: `${context.packages.prefixCode(vfs)}${msg.core.code}${context.packages.postfixCode(
        vfs,
      )}`,
      mode: "string",
      timestamps: {
        access: new Date(),
        modification: new Date(),
        change: new Date(),
      },
    },
  };

  const drive = new VirtualDrive(vfs, cxn);

  /* Run steps to execute code */
  let prevResult: WASIExecutionResult = { exitCode: 0, fs: vfs };
  for (const step of langConfig.steps) {
    onStatusChanged(step.status);

    let hostConfig: WorkerHostConfig;
    if (typeof step.run === "function") hostConfig = await step.run(context, prevResult);
    else hostConfig = { ...step.run };

    const binaryURL = toBinaryURL(drive.fs, hostConfig.binary);
    prevResult = await WASI.start(fetch(binaryURL), {
      fs: drive,
      args: hostConfig.args,
      env: { ...hostConfig.env, ...msg.core.env },
      stdout: sendStdout,
      stderr: sendStderr,
      stdin: (maxByteLength) => getStdin(maxByteLength, msg.stdinBuffer),
    });
  }

  return prevResult;
}

function sendStdout(out: string) {
  sendMessage({
    target: "host",
    type: "stdout",
    text: out,
  });
}

function sendStderr(err: string) {
  sendMessage({
    target: "host",
    type: "stderr",
    text: err,
  });
}

function getStdin(maxByteLength: number, stdinBuffer: SharedArrayBuffer): string | null {
  // Wait until the integer at the start of the buffer has a length in it
  Atomics.wait(new Int32Array(stdinBuffer), 0, 0);

  // First four bytes are a Int32 of how many bytes are in the buffer
  const view = new DataView(stdinBuffer);
  const numBytes = view.getInt32(0);
  if (numBytes < 0) {
    view.setInt32(0, 0);
    return null;
  }

  const buffer = new Uint8Array(stdinBuffer, 4, numBytes);

  // Decode the buffer into text, but only as much as was asked for
  const returnValue = new TextDecoder().decode(buffer.slice(0, maxByteLength));

  // Rewrite the buffer with the remaining bytes
  const remaining = buffer.slice(maxByteLength, buffer.length);
  view.setInt32(0, remaining.byteLength);
  buffer.set(remaining);

  return returnValue;
}

async function createContext(
  langConfig: LanguageConfiguration,
  core: WASIHostCoreContext,
): Promise<ExecutionContext> {
  const pm = langConfig.packages;
  const packages = pm.createWorkspace();
  await packages.install(...core.packages);

  const entrypoint = core.entrypoint;
  const entryname = getFileNameWithoutExtension(entrypoint);

  return { entryname, entrypoint, packages };
}

function getFileNameWithoutExtension(path: string) {
  const cleanPath = path.trim().replace(/\/+$/, "");
  const file = cleanPath.split("/").pop()!.trim();
  const parts = file.split(".");
  if (parts.length === 1) return parts[0];
  return parts.slice(0, -1).join(".");
}

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
