import { execSync, spawn } from "child_process";
import { promisify } from "util";
import { Manifest } from "../../../bundler";
import path from "path";
import fs from "fs";
import { globSync } from "fast-glob";
import { getLanguageConfig, Language } from "../../../src";

const manifest: Manifest = {
  name: "stanford-cpp",
  version: "0.1.0",
  rootDir: "src",
  files: ["**/*.h", "**/*.cpp"],
};

function writeBuildH() {
  /**
   * The CS106B libraries have a private/build.h file which is auto-generated by Qt/Make
   * containing the following contents. This function generates that file.
   *
   *  ```cpp
   *  #ifndef SPL_BUILD_H
   *  #define SPL_BUILD_H
   *
   *  #define SPL_VERSION \"$$SPL_VERSION\"
   *  #define SPL_BUILD_DATE \"$$_DATE_\"
   *  #define SPL_BUILD_USER \"$$(USER)\"
   *
   *  #endif
   *  ```
   */

  const today = new Date().toISOString().split("T")[0]; // "2025-03-18"
  const user = execSync("git log -1 --pretty=%an").toString().trim(); // Commit author name

  const buildH = `
#ifndef SPL_BUILD_H
#define SPL_BUILD_H

#define SPL_VERSION "${manifest.version}"
#define SPL_BUILD_DATE "${today}"
#define SPL_BUILD_USER "${user}"

#endif
`;

  // Define the file path where we want to write the content
  const filePath = path.join(__dirname, "src", "private", "build.h");

  // Write the content to the file
  fs.writeFileSync(filePath, buildH.trim(), "utf8");

  console.log("build.h generated successfully at:", filePath);
}

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

  const sysrootUrl = getLanguageConfig(Language.Cpp).filesystem;

  if (sysrootUrl) {
    /* Rather than use the WASI SDK sysroot, we'd prefer to use the same sysroot
     * as the browser will actually use to compile code for consistency.
     * Ideally, we'd go a step further and actually run the compiled clang++
     * but hopefully this is sufficient
     */

    execSync(`rm -rf ${process.env.WASI_SDK_PATH}/share/wasi-sysroot`, { stdio: "inherit" });

    process.chdir(path.join(process.env.WASI_SDK_PATH, "share"));

    const sysrootFile = path.basename(sysrootUrl);
    execSync(`curl -LO ${sysrootUrl}`, { stdio: "inherit" });

    execSync(`tar xf "${sysrootFile}"`, { stdio: "inherit" });
    execSync(`mv sys wasi-sysroot`, { stdio: "inherit" });
    execSync(`rm -rf ${sysrootFile}`, { stdio: "inherit" });

    process.chdir(path.join(process.env.WASI_SDK_PATH, ".."));
  }
}

async function compile(includePaths: string[], source: string, build: string) {
  const CXX = path.join(process.env.WASI_SDK_PATH!, "bin", "clang++");

  const out = path.join(build, `${path.parse(source).name}.o`);
  fs.mkdirSync(path.dirname(out), { recursive: true });

  const args = [
    `--sysroot=${process.env.WASI_SDK_PATH}/share/wasi-sysroot`,
    "-c",
    source,
    ...includePaths.map((inc) => `-I${inc}`),
    "-o",
    out,
  ];

  console.log(`Compiling with args: ${args.join(" ")}`);
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
  const glob = (p: string[]) => globSync(p, { onlyFiles: false });
  return async () => {
    installWasiSdk();

    options ??= {};
    const build = path.resolve("build");

    if (manifest.rootDir) process.chdir(manifest.rootDir);
    const includePaths = glob(options.includePathsCompiled ?? ["include"]);
    const sources = glob(options.sources ?? ["**/*.cpp"]);

    await Promise.all(sources.map((source) => compile(includePaths, source, build)));

    manifest.runtime = {
      ...manifest.runtime,
      language: Language.Cpp,
      includePaths: glob(options.includePathsExported ?? ["include"]),
    };

    return manifest;
  };
}

writeBuildH();

export default build(manifest, {
  includePathsExported: ["*/", "!private/"],
  includePathsCompiled: ["*/", "./"],
});
