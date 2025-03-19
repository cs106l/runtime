import { WASIFS } from "@runno/wasi";

import { inflate } from "pako";
import { Archive } from "@obsidize/tar-browserify";
import { PackageMeta, Package } from "./packages";

export type FetchOptions = {
  /**
   * A signal to stop the request
   */
  signal?: AbortSignal;

  /**
   * Where the tarball should be extracted to in the virtual filesystem
   */
  path?: string;
};

export async function fetchWASIFS(fsURL: string, options?: FetchOptions): Promise<WASIFS> {
  options ??= {};
  const response = await fetch(fsURL, options);
  const buffer = await response.arrayBuffer();
  return await extractTarGz(new Uint8Array(buffer), options);
}

//
// Largely taken from:
// https://github.com/taybenlor/runno/blob/main/packages/runtime/lib/tar.ts
//
async function extractTarGz(binary: Uint8Array, options: FetchOptions): Promise<WASIFS> {
  const path = options.path?.replace(/\/+$/, "") ?? "";

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
    let name = entry.fileName.replace(/^([^/])/, "/$1");
    name = `${path}${name}`;

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

export class ArchivePackage extends Package {
  constructor(
    meta: PackageMeta,
    private readonly url: string,
    private readonly options: Omit<FetchOptions, "signal"> = {},
  ) {
    super(meta);
  }

  load(signal?: AbortSignal): Promise<WASIFS> {
    return fetchWASIFS(this.url, { ...this.options, signal });
  }
}
