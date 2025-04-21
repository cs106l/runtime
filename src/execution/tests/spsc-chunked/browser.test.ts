import { describe, it, expect, afterAll } from "vitest";
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

const throughputGroups: Record<string, number[]> = {};

function recordThroughput(group: string, throughput: number) {
  if (!throughputGroups[group]) {
    throughputGroups[group] = [];
  }
  throughputGroups[group].push(throughput);
}

function execute(options?: TestOptions, group = "default") {
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
    let spinTime = 0;

    const start = performance.now();
    const end = start + options.duration!;

    while (performance.now() < end) {
      let view = reader.valid();

      /* Wait for 4 bytes prefix to enter the stream */
      let spinStart = performance.now();
      while (view.length < 4) {
        await new Promise((res) => setTimeout(res, options.timeout));
        view = reader.valid();
      }
      spinTime += performance.now() - spinStart;

      const len = new DataView(view.buffer, view.byteOffset, view.byteLength).getUint32(0);
      reader.consume(4);

      view = reader.valid();

      spinStart = performance.now();
      while (view.length < len) {
        await new Promise((res) => setTimeout(res, options.timeout));
        view = reader.valid();
      }
      spinTime += performance.now() - spinStart;

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
    parts.push(["◎ spin time", `${spinTime.toFixed(2)}ms (${(spinTime / (durationSec * 1000) * 100).toFixed(2)}%)`]);
    parts.push(["◎ bytes read", `${reader.bytesRead}`]);
    parts.push(["◎ messages read", messagesRead]);
    parts.push(["◎ throughput", `${throughput.toFixed(2)} KiB/s`]);
    parts.push(["◎ message throughput", `${msgThroughput.toFixed(2)} msg/s`]);

    console.log(parts.map(([key, val]) => `${(key + ":").padEnd(30, " ")}${val}`).join("\n"));

    recordThroughput(group, throughput);

    return throughput;
  };
}

describe.sequential("Varied async timeouts", () => {
  for (const timeout of [0, 1, 10, 50, 100]) {
    it(`Timeout ${timeout}`, execute({ timeout }, "timeout"));
  }
});

describe.sequential("Varied stream capacities", () => {
  for (const capacity of [128, 256, 512, 1024, 4 * 1024, 8 * 1024, 16 * 1024, 32 * 1024]) {
    it(`Capacity ${capacity}`, execute({ capacity }, "capacity"));
  }
});

afterAll(() => {
  const parts = [];

  parts.push("=== Average Throughput by Group ===");
  for (const [group, values] of Object.entries(throughputGroups)) {
    const avg = values.reduce((a, b) => a + b, 0) / values.length;
    parts.push(`${group.padEnd(15)}: ${avg.toFixed(2)} KiB/s`);
  }

  const all = Object.values(throughputGroups).flat();
  const totalAvg = all.reduce((a, b) => a + b, 0) / all.length;
  parts.push(`\n${"TOTAL".padEnd(15)}: ${totalAvg.toFixed(2)} KiB/s`);

  console.log(parts.join("\n"));
});
