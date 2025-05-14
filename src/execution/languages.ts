import { BaseRegistry } from "../packages/registry/base";
import type { LanguageConfiguration } from ".";
import { Language, RunStatus } from "../enums";
import { PackageManager } from "../packages";

const Cpp: LanguageConfiguration = {
  language: Language.Cpp,
  tarGz: "https://runno.dev/langs/clang-fs.tar.gz",
  packages: new PackageManager(new BaseRegistry(Language.Cpp)),
  steps: [
    {
      status: RunStatus.Compiling,
      run: (ctx) => ({
        binary: "https://runno.dev/langs/clang.wasm",
        args: [
          "clang",
          "-cc1",
          "-Werror",
          "-emit-obj",
          "-disable-free",
          "-isysroot",
          "/sys",
          "-internal-isystem",
          "/sys/include/c++/v1",
          "-internal-isystem",
          "/sys/include",
          "-internal-isystem",
          "/sys/lib/clang/8.0.1/include",
          "-ferror-limit",
          "4",
          "-fmessage-length",
          "80",
          "-fcolor-diagnostics",
          "-O2",
          "-o",
          `/${ctx.entryname}.o`,
          "-x",
          "c++",
          ctx.entrypoint,
        ],
      }),
    },
    {
      status: RunStatus.Linking,
      run: (ctx) => ({
        binary: "https://runno.dev/langs/wasm-ld.wasm",
        args: [
          "wasm-ld",
          "--no-threads",
          "--export-dynamic",
          "-z",
          "stack-size=1048576",
          "-L/sys/lib/wasm32-wasi",
          "/sys/lib/wasm32-wasi/crt1.o",
          `/${ctx.entryname}.o`,
          "-lc",
          "-lc++",
          "-lc++abi",
          "-o",
          "/program.wasm",
        ],
      }),
    },
    {
      status: RunStatus.Running,
      run: {
        binary: "/program.wasm",
        args: ["program"],
      },
    },
  ],
};

const pySiteCustomize = `
import time

def busy_sleep(seconds):
    import time as _time
    start = _time.perf_counter()
    while _time.perf_counter() - start < seconds:
        pass

time.sleep = busy_sleep`;

const Python: LanguageConfiguration = {
  language: Language.Python,
  tarGz: "https://runno.dev/langs/python-3.11.3.tar.gz",
  packages: new PackageManager(new BaseRegistry(Language.Python)),
  files: {
    "/.packages/sitecustomize.py": {
      mode: "string",
      content: pySiteCustomize,
    },
  },
  steps: [
    {
      status: RunStatus.Running,
      run: (ctx) => ({
        binary: "https://runno.dev/langs/python-3.11.3.wasm",
        args: ["python", ctx.entrypoint],
        env: { PYTHONUNBUFFERED: "1", PYTHONPATH: "/.packages" },
      }),
    },
  ],
};

export const LanguagesConfig: Record<Language, LanguageConfiguration> = {
  [Language.Cpp]: Cpp,
  [Language.Python]: Python,
};
