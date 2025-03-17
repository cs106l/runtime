import { WASIFS } from "@runno/wasi";

import { inflate } from "pako";
import { Archive } from "@obsidize/tar-browserify";

export type SignalOptions = {
  signal?: AbortSignal;
};

export async function fetchWASIFS(fsURL: string, options?: SignalOptions): Promise<WASIFS> {
  const response = await fetch(fsURL, options);
  const buffer = await response.arrayBuffer();
  return await extractTarGz(new Uint8Array(buffer));
}

//
// Largely taken from:
// https://github.com/taybenlor/runno/blob/main/packages/runtime/lib/tar.ts
//
async function extractTarGz(binary: Uint8Array, options?: SignalOptions): Promise<WASIFS> {
  // If we receive a tar.gz, we first need to uncompress it.
  let inflatedBinary: Uint8Array;
  try {
    inflatedBinary = inflate(binary);
  } catch (e) {
    inflatedBinary = binary;
  }

  const fs: WASIFS = {};

  for await (const entry of Archive.read(inflatedBinary)) {
    options?.signal?.throwIfAborted();

    if (!entry.isFile()) {
      continue;
    }

    // HACK: Make sure each file name starts with /
    const name = entry.fileName.replace(/^([^/])/, "/$1");
    fs[name] = {
      path: name,
      timestamps: {
        change: new Date(entry.lastModified),
        access: new Date(entry.lastModified),
        modification: new Date(entry.lastModified),
      },
      mode: "binary",
      content: entry.content!,
    };
  }

  return fs;
}
