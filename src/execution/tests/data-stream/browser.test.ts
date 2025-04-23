import { describe, expect, it } from "vitest";
import { DataStreamWriter, Stream } from "../../stream";
import { FinishedReadingMessage, HostToWorkerMessage, WorkerToHostMessage } from "./worker";

import StreamWorker from "./worker?worker";

type TestOptions<AsyncWriter extends boolean, AsyncReader extends boolean, T> = {
  method: keyof DataStreamWriter<AsyncWriter>;
  asyncWriter: AsyncWriter;
  asyncReader: AsyncReader;
  values: readonly T[];
  capacity?: number;
};

function testSingle<AsyncWriter extends boolean, AsyncReader extends boolean, T>({
  method,
  asyncWriter,
  asyncReader,
  values,
  capacity = 256,
}: TestOptions<AsyncWriter, AsyncReader, T>) {
  return async function () {
    const buffer = Stream.createBuffer(capacity);
    const writer = new StreamWorker();
    const reader = new StreamWorker();

    try {
      const writerMessage: HostToWorkerMessage<AsyncWriter> = {
        type: "writer",
        values,
        buffer,
        async: asyncWriter,
        method,
      };

      const readerMessage: HostToWorkerMessage<AsyncReader> = {
        type: "reader",
        values,
        buffer,
        async: asyncReader,
        method,
      };

      const response = await new Promise<FinishedReadingMessage<unknown>>((resolve, reject) => {
        const handleMessage = (event: MessageEvent<WorkerToHostMessage>) => {
          if (event.data.type === "finished") resolve(event.data);
          else reject(event.data.reason);
        };

        reader.addEventListener("message", handleMessage);
        writer.addEventListener("message", handleMessage);
        reader.postMessage(readerMessage);
        writer.postMessage(writerMessage);
      });

      expect(response.values).toEqual(values);

      return response;
    } finally {
      writer.terminate();
      reader.terminate();
    }
  };
}

function test<T>(
  method: keyof DataStreamWriter<true>,
  values: readonly T[],
  capacity?: number,
  name?: string,
) {
  it(
    `${name ?? method} (async)`,
    testSingle({ method, asyncWriter: true, asyncReader: true, values, capacity }),
  );
  it(
    `${name ?? method} (sync)`,
    testSingle({ method, asyncWriter: false, asyncReader: false, values, capacity }),
  );
}

function throughputTest<AsyncWriter extends boolean, AsyncReader extends boolean>(
  options: Omit<TestOptions<AsyncWriter, AsyncReader, number>, "values" | "method">,
) {
  return async function () {
    const numbers = Array.from({ length: 1000000 }, () => Math.floor(Math.random() * 10000));
    const response = await testSingle({
      ...options,
      values: numbers,
      method: "uint32",
    })();

    const seconds = response.ms / 1000;
    const messageThroughput = numbers.length / seconds;
    const bytesThroughput = (numbers.length * 4) / 1024 / seconds;

    console.log(
      `Throughput: ${messageThroughput.toFixed(2)} uint32/sec, ${bytesThroughput.toFixed(
        2,
      )} KB/sec`,
    );
  };
}

function randomBytes(min: number, max?: number) {
  max ??= min;
  const n = Math.floor(Math.random() * (max - min)) + min;
  const arr = new Uint8Array(n);
  crypto.getRandomValues(arr);
  return arr;
}

function randomString(min: number, max?: number) {
  max ??= min;
  const n = Math.floor(Math.random() * (max - min)) + min;
  return Array.from({ length: n }, () =>
    String.fromCharCode(Math.floor(Math.random() * 95) + 32),
  ).join("");
}

// prettier-ignore
function fullSuite({
  numerics,
  bytes,
  strings,
  capacity,
}: {
  numerics: readonly number[];
  bytes: readonly Uint8Array[];
  strings: readonly string[];
  capacity?: number;
}) {
  test("uint8",     numerics.map(n => n % 2 ** 8),          capacity);
  test("uint16",    numerics.map(n => n % 2 ** 16),         capacity);
  test("uint32",    numerics.map(n => n % 2 ** 32),         capacity);
  test("uint64",    numerics,                               capacity);
  test("int8",      numerics.map(n => n % 2 ** (8 - 1)),    capacity);
  test("int16",     numerics.map(n => n % 2 ** (16 - 1)),   capacity);
  test("int32",     numerics.map(n => n % 2 ** (32 - 1)),   capacity);
  test("int64",     numerics,                               capacity);
  test("float32",   numerics.map(n => n % 255),             capacity);
  test("float64",   numerics.map(n => n % 255),             capacity);

  test("bytesRaw",  bytes,    capacity);
  test("bytes",     bytes,    capacity);
  test("string",    strings,  capacity);
}

describe("small number of items with plenty of capacity", () => {
  fullSuite({
    numerics: [103, 106, 14],
    bytes: [randomBytes(5), randomBytes(1)],
    strings: ["Hey there! How is tit going out there....", "This is a test!", "Will it work????"],
    capacity: 256,
  });
});

describe("empty bytes and strings", () => {
  test("bytesRaw", [new Uint8Array(0)], 256);
  test("bytes", [new Uint8Array(0)], 256);
  test("string", [""], 256);
});

describe("many items, minimum capacity", () => {
  fullSuite({
    numerics: Array.from(randomBytes(100)),
    bytes: Array.from({ length: 20 }).map((_, i) => randomBytes(i)),
    strings: Array.from({ length: 20 }, () => randomString(0, 20)),
    capacity: 15,
  });
});

describe("stress test many byte arrays of random sizes", () => {
  test("bytes", Array.from({ length: 1000 }, () => randomBytes(0, 1024)), 2048);
})

describe("test throughput", () => {
  for (const asyncWriter of [true, false]) {
    for (const asyncReader of [true, false]) {
      it(
        `${asyncWriter ? "async" : "sync"} writer → ${
          asyncReader ? "async" : "sync"
        } reader throughput"`,
        throughputTest({ asyncWriter, asyncReader, capacity: 256 * 1024 }),
      );
    }
  }
});
