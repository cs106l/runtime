import { describe, expect, it } from "vitest";
import { DataStreamWriter, Stream } from "../../stream";
import { FinishedReadingMessage, HostToWorkerMessage, WorkerToHostMessage } from "./worker";

import StreamWorker from "./worker?worker";

function testSingle<Async extends boolean, T>(
  method: keyof DataStreamWriter<Async>,
  async: Async,
  values: readonly T[],
  capacity = 256,
) {
  return async function () {
    const buffer = Stream.createBuffer(capacity);
    const writer = new StreamWorker();
    const reader = new StreamWorker();

    try {
      const writerMessage: HostToWorkerMessage<Async> = {
        type: "writer",
        values,
        buffer,
        async,
        method,
      };

      const readerMessage: HostToWorkerMessage<Async> = {
        type: "reader",
        values,
        buffer,
        async,
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
  it(`${name ?? method} (async)`, testSingle(method, true, values, capacity));
  it(`${name ?? method} (sync)`, testSingle(method, false, values, capacity));
}

function randomBytes(n: number) {
  const arr = new Uint8Array(n);
  crypto.getRandomValues(arr);
  return arr;
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
  test("uint8",   numerics.map(n => n % 2 ** 8),          capacity);
  test("uint16",  numerics.map(n => n % 2 ** 16),         capacity);
  test("uint32",  numerics.map(n => n % 2 ** 32),         capacity);
  test("uint64",  numerics,                               capacity);
  test("int8",    numerics.map(n => n % 2 ** (8 - 1)),    capacity);
  test("int16",   numerics.map(n => n % 2 ** (16 - 1)),   capacity);
  test("int32",   numerics.map(n => n % 2 ** (32 - 1)),   capacity);
  test("int64",   numerics,                               capacity);
  test("float32", numerics.map(n => n % 255),             capacity);
  test("float64", numerics.map(n => n % 255),             capacity);

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

describe("many items, minimum capacity", () => {
  fullSuite({
    numerics: Array.from(randomBytes(1000)),
    bytes: [randomBytes(5), randomBytes(1)],
    strings: ["Hey there! How is tit going out there....", "This is a test!", "Will it work????"],
    capacity: 15,
  });
});
