import { DataStreamReader, DataStreamWriter } from "../../stream";

export type HostToWorkerMessage<Async extends boolean, T = unknown> =
  | StartWritingMessage<Async, T>
  | StartReadingMessage<Async, T>;

export type StartWritingMessage<Async extends boolean, T> = {
  type: "writer";
  async: Async;
  values: readonly T[];
  buffer: SharedArrayBuffer;
  method: keyof DataStreamWriter<Async>;
};

export type StartReadingMessage<Async extends boolean, T> = {
  type: "reader";
  async: Async;
  buffer: SharedArrayBuffer;
  method: keyof DataStreamWriter<Async>;
  values: readonly T[];
};

export type WorkerToHostMessage = WorkerErrorMessage | FinishedReadingMessage<unknown>;

export type WorkerErrorMessage = {
  type: "error";
  reason: unknown;
};

export type FinishedReadingMessage<T> = {
  type: "finished";
  values: readonly T[];
  ms: number;
};

function sendMessage(message: WorkerToHostMessage) {
  self.postMessage(message);
}

async function writer<Async extends boolean, T>(message: StartWritingMessage<Async, T>) {
  const stream = new DataStreamWriter({ async: message.async, buffer: message.buffer });
  let method = stream[message.method] as (value: T) => Promise<void>;

  if (typeof method !== "function") {
    throw new Error(`Cannot write: ${message.method} is not a function`);
  }

  method = method.bind(stream);

  for (const value of message.values) {
    await method(value);
  }
}

async function reader<Async extends boolean, T>(message: StartReadingMessage<Async, T>) {
  const stream = new DataStreamReader({ async: message.async, buffer: message.buffer });
  let method = stream[message.method] as () => Promise<T>;

  if (typeof method !== "function") {
    throw new Error(`Cannot read: ${message.method} is not a function`);
  }

  method = method.bind(stream);

  const values: T[] = [];

  let ms = 0;

  for (const value of message.values) {

    const start = performance.now();

    if (message.method === "bytesRaw") {
      // If we are reading raw bytes, we need to pass a count to the method
      const array = value as Uint8Array;
      const bytesRaw = method as (count: number) => Promise<Uint8Array>;
      values.push((await bytesRaw(array.length)) as T);
    } else {
      values.push(await method());
    }

    ms += performance.now() - start;

    /**
     * Need to slice byte buffer copies or we get a contract violation
     */
    if (["bytes", "bytesRaw"].includes(message.method)) {
      values[values.length - 1] = (values[values.length - 1] as Uint8Array).slice() as T;
    }
  }

  sendMessage({ type: "finished", values, ms });
}

self.onmessage = async (e) => {
  try {
    const message = e.data as HostToWorkerMessage<boolean, unknown>;

    if (message.type === "writer") {
      await writer(message);
    } else if (message.type === "reader") {
      await reader(message);
    } else {
      throw new Error(`Unknown message type: ${JSON.stringify(message)}`);
    }
  } catch (e) {
    sendMessage({ type: "error", reason: e });
  }
};

self.onerror = (e) => sendMessage({ type: "error", reason: e });
