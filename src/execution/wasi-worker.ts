import { WASI, WASIContextOptions, WASIExecutionResult, WASIFS } from "@cs106l/wasi";
import { SerializedStream } from "./connection";
import { BaseCanvasEvent, CanvasEvent, voidActions } from "./canvas";
import { CanvasAwareDrive } from "./drive";

type StartWorkerMessage = {
  target: "client";
  type: "start";
  binaryURL: string;
  stdinBuffer: SharedArrayBuffer;
  fs: WASIFS;
  canvasBuffer: SharedArrayBuffer;
} & Partial<Omit<WASIContextOptions, "stdin" | "stdout" | "stderr" | "debug" | "fs">>;

export type WorkerMessage = StartWorkerMessage;

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

type CrashHostMessage = {
  target: "host";
  type: "crash";
  error: {
    message: string;
    type: string;
  };
};

type CanvasEventMessage = {
  target: "host";
  type: "canvasEvent";
  events: BaseCanvasEvent[];
};

export type HostMessage =
  | StdoutHostMessage
  | StderrHostMessage
  | ResultHostMessage
  | CrashHostMessage
  | CanvasEventMessage;

onmessage = async (ev: MessageEvent) => {
  const data = ev.data as WorkerMessage;

  switch (data.type) {
    case "start":
      try {
        const result = await start(data);
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
          };
        } else {
          error = {
            message: `unknown error - ${e}`,
            type: "Unknown",
          };
        }
        sendMessage({
          target: "host",
          type: "crash",
          error,
        });
      }
      break;
  }
};

function sendMessage(message: HostMessage) {
  postMessage(message);
}

let drive: CanvasAwareDrive | null = null;

function createDrive(message: StartWorkerMessage) {
  const sleep = new Int32Array(new SharedArrayBuffer(4));
  const canvasStream = new SerializedStream(message.canvasBuffer);
  const events: BaseCanvasEvent[] = [];

  drive = new CanvasAwareDrive(
    {
      onEvent(event) {
        if (event.action === "sleep") {
          /* Sleep is handled specially, we just wait for some number of milliseconds.
           * No communication with the main thread is needed */
          Atomics.wait(sleep, 0, 0, event.args[0] as number);
          return;
        }

        if (!voidActions.includes(event.action)) {
          events.push(event);
          sendMessage({ target: "host", type: "canvasEvent", events });
          const result = canvasStream.receive();
          events.length = 0;
          return result;
        }
        
        events.push(event);
        if (event.action === "commit") {
          sendMessage({ target: "host", type: "canvasEvent", events });
          events.length = 0;
        }
      },
    },
    message.fs,
  );
  return drive;
}

async function start(message: StartWorkerMessage) {
  return WASI.start(fetch(message.binaryURL), {
    ...message,
    stdout: sendStdout,
    stderr: sendStderr,
    stdin: (maxByteLength) => getStdin(maxByteLength, message.stdinBuffer),
    fs: createDrive(message),
  });
}

function sendStdout(out: string) {
  console.log("Sending stdout");
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
