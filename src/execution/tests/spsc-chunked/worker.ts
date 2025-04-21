/**
 * A simple producer which will emit randomly-sized, length prefixed strings to a stream
 * of the form;
 *
 * "0"
 * "111"
 * "22"
 * "333333"
 *
 * The lengths are random, but the digit number will always be increasing.
 * The idea is to test the throughput of the SPSC queue under a workload of many small chunks.
 *
 * The worker will continue to emit messages until it is terminated.
 */

import { StreamWriter } from "../../stream";

export type WorkerMessage = {
  buffer: SharedArrayBuffer;
  minLength: number;
  maxLength: number;
};

self.onmessage = (e) => {
  const message = e.data as WorkerMessage;
  const { buffer, minLength, maxLength } = message;
  const writer = new StreamWriter(buffer);

  let curDigit = 0;
  const encoder = new TextEncoder();

  while (true) {
    const length = Math.floor(Math.random() * (maxLength - minLength + 1)) + minLength;

    /* Write the length prefix to the stream */
    let res = writer.reserve(4);
    while (res === null) {
      res = writer.reserve(4);
    }

    res.view.setUint32(0, length);
    res.commit();

    /* Write the chunk to the stream */
    res = writer.reserve(length);
    while (res === null) {
      res = writer.reserve(length);
    }

    const string = curDigit.toString().repeat(length);
    const chunk = encoder.encode(string);
    curDigit = (curDigit + 1) % 10;

    res.data.set(chunk);
    res.commit();
  }
};

self.onerror = (e) => self.postMessage(e);
