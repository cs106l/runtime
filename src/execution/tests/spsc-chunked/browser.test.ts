import { describe, it, expect } from "vitest";
import { Stream, StreamReader } from "../../stream";

import StreamWorker from "./worker?worker";
import type { WorkerMessage } from "./worker";

type TestOptions = Partial<
  Omit<WorkerMessage, "buffer"> & {
    capacity: number;
    duration: number;
    timeout: number;
  }
>;

function execute(options?: TestOptions) {
  options = {
    minLength: 1,
    maxLength: 64,
    capacity: 4096,
    duration: 5000,
    timeout: 10,
    ...options,
  };

  return async function () {
    const buffer = Stream.createBuffer(options.capacity!);
    const reader = new StreamReader(buffer);
    const worker = new StreamWorker();
    const decoder = new TextDecoder();

    worker.onmessage = (e) => console.log(e.data);
    worker.postMessage({
      buffer,
      ...options,
    } as WorkerMessage);

    let curDigit = 0;
    let messagesRead = 0;

    const start = performance.now();
    const end = start + options.duration!;

    while (performance.now() < end) {
      let view = reader.valid();

      /* Wait for 4 bytes prefix to enter the stream */
      while (view.length < 4) {
        await new Promise((res) => setTimeout(res, options.timeout));
        view = reader.valid();
      }

      const len = new DataView(view.buffer, view.byteOffset, view.byteLength).getUint32(0);
      reader.consume(4);

      view = reader.valid();

      while (view.length < len) {
        await new Promise((res) => setTimeout(res, options.timeout));
        view = reader.valid();
      }

      const chunk = new Uint8Array(len);
      chunk.set(view.subarray(0, len));
      const string = decoder.decode(chunk);
      reader.consume(len);

      // Check that all characters are identical and equal the current digit
      const expectedChar = curDigit.toString();
      expect(string.split("").every((c) => c === expectedChar)).toBe(true);
      curDigit = (curDigit + 1) % 10;

      messagesRead++;
    }

    worker.terminate();

    const durationSec = (performance.now() - start) / 1000;
    const throughput = reader.bytesRead / durationSec / 1024;
    const msgThroughput = messagesRead / durationSec;

    const parts: [string, unknown][] = [];
    parts.push(["● min message bytes", options.minLength]);
    parts.push(["● max message bytes", options.maxLength]);
    parts.push(["● stream capacity", `${options.capacity} bytes`]);
    parts.push(["● planned duration", `${(options.duration! / 1000).toFixed(2)}s`]);
    parts.push(["● async spin delay", `${options.timeout}ms`]);

    parts.push(["◎ actual duration", `${durationSec.toFixed(2)}s`]);
    parts.push(["◎ bytes read", `${reader.bytesRead}`]);
    parts.push(["◎ messages read", messagesRead]);
    parts.push(["◎ throughput", `${throughput.toFixed(2)} KiB/s`]);
    parts.push(["◎ message throughput", `${msgThroughput.toFixed(2)} msg/s`]);

    console.log(parts.map(([key, val]) => `${(key + ":").padEnd(30, " ")}${val}`).join("\n"));

    return throughput;
  };
}

describe.sequential("Varied async timeouts", () => {
  for (const timeout of [0, 1, 10, 50, 100]) {
    it(`Timeout ${timeout}`, execute({ timeout }));
  }
});

describe.sequential("Varied stream capacities", () => {
  for (const capacity of [128, 256, 512, 1024, 4 * 1024, 8 * 1024, 16 * 1024, 32 * 1024]) {
    it(`Capacity ${capacity}`, execute({ capacity }));
  }
});
