import { describe, expect, it } from "vitest";
import { DataStreamReader, DataStreamWriter, ReaderFn, Stream, WriterFn } from "../../stream";
import {
  FinishedReadingMessage,
  HostToWorkerMessage,
  WorkerErrorMessage,
  WorkerToHostMessage,
} from "./worker";

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

      writer.addEventListener("message", (event: MessageEvent<WorkerToHostMessage>) => {
        if (event.data.type === "error") throw event.data.reason;
      });

      writer.postMessage(writerMessage);

      const response = await new Promise<FinishedReadingMessage<unknown>>((resolve, reject) => {
        const handleMessage = (event: MessageEvent<WorkerToHostMessage>) => {
          reader.removeEventListener("message", handleMessage);
          if (event.data.type === "error") reject(event.data.reason);
          else resolve(event.data);
        };
        reader.addEventListener("message", handleMessage);
        reader.postMessage(readerMessage);
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

function randomBytes(n: number, max: number = 255) {
  const arr = new Uint8Array(n);
  crypto.getRandomValues(arr);
  return arr.map((v) => v % max);
}

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
  test("uint8", numerics, capacity);
  test("uint16", numerics, capacity);
  test("uint32", numerics, capacity);
  test("uint64", numerics, capacity);
  test("int8", numerics, capacity);
  test("int16", numerics, capacity);
  test("int32", numerics, capacity);
  test("int64", numerics, capacity);
  test("float32", numerics, capacity);
  test("float64", numerics, capacity);

  test("bytesRaw", bytes, capacity);
  test("bytes", bytes, capacity);
  test("string", strings, capacity);
}

describe("small items with plenty of capacity", () => {
  fullSuite({
    numerics: [103, 106, 14],
    bytes: [randomBytes(5), randomBytes(1)],
    strings: ["Hey there! How is tit going out there....", "This is a test!", "Will it work????"],
    capacity: 256,
  });
});

describe("many items, tiny capacity", () => {
  // fullSuite({
  //   numerics: [103, 106, 14],
  //   bytes: [randomBytes(5), randomBytes(1)],
  //   strings: ["Hey there! How is tit going out there....", "This is a test!", "Will it work????"],
  //   capacity: 8,
  // });

  // test("int64", [103, 106, 100, 100, 100, 100, 100, 100], 14);
  test("string", ["01234567", "hello my name is dun dun"], 14);
});
