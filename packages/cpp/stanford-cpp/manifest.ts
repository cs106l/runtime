import { execSync, spawn } from "child_process";
import { promisify } from "util";
import { Manifest } from "../../../bundler";
import path from "path";
import fs from "fs";
import { globSync } from "fast-glob";
import { Language } from "../../../src";

const manifest: Manifest = {
  name: "stanford-cpp",
  build: 0,
  version: "0.1.0",
  rootDir: "src",
};

const spawnAsync = promisify(spawn);

/**
 * Installs the WASI SDK into the `wasi-sdk` folder in the current directory.
 * Sets the WASI_SDK_PATH environment var.
 */
function installWasiSdk(release: string = "25", version: string = "25.0") {
  const platform = "x86_64-linux";

  const dir = `wasi-sdk-${version}-${platform}`;
  const tgz = `${dir}.tar.gz`;

  if (!fs.existsSync(tgz)) {
    execSync(
      `curl -LO https://github.com/WebAssembly/wasi-sdk/releases/download/wasi-sdk-${release}/${tgz}`,
      { stdio: "inherit" },
    );
  }

  execSync(`rm -rf ${dir} wasi-sdk`, { stdio: "inherit" });
  execSync(`tar xf "${tgz}"`, { stdio: "inherit" });
  execSync(`mv "${dir}" "wasi-sdk"`, { stdio: "inherit" });

  process.env.WASI_SDK_PATH = path.resolve("wasi-sdk");
}

async function compile(includes: string[], source: string, build: string) {
  const CXX = path.join(process.env.WASI_SDK_PATH!, "bin", "clang++");

  const out = path.join(build, `${path.parse(source).name}.o`);
  fs.mkdirSync(path.dirname(out), { recursive: true });

  const args = [
    `--sysroot=${process.env.WASI_SDK_PATH}/share/wasi-sysroot`,
    "-c",
    source,
    ...includes.map((inc) => `-I${inc}`),
    "-o",
    out,
  ];

  await spawnAsync(CXX, args, { stdio: "inherit" });
}

type BuildOptions = {
  /**
   * Include path globs relative to `rootDir` to include in bundled package.
   * These are the **public** includes.
   * @default ["include"]
   */
  includePathsExported?: string[];

  /**
   * Include path globs relative to `rootDir` to compile the .o files
   * These are the **public and private** includes.
   * @default ["include"]
   */
  includePathsCompiled?: string[];

  /**
   * Source file path globs relative to `rootDir` to compile
   * @default **\*.cpp
   */
  sources?: string[];
};

function build(manifest: Manifest, options?: BuildOptions): () => Promise<Manifest> {
  return async () => {
    installWasiSdk();

    options ??= {};
    const cwd = manifest.rootDir;
    const includePaths = globSync(options.includePathsCompiled ?? ["include"], { cwd });
    const sources = globSync(options.sources ?? ["**/*.cpp"], { cwd });

    const build = path.resolve("build");
    await Promise.all(sources.map((source) => compile(includePaths, source, build)));

    manifest.runtime = {
      ...manifest.runtime,
      language: Language.Cpp,
      includePaths: globSync(options.includePathsExported ?? ["include"], { cwd }),
    };

    return manifest;
  };
}

export default build(manifest, {
  includePathsExported: ["*/", "!private/"],
  includePathsCompiled: ["*/"],
});
