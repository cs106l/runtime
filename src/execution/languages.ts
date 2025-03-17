import { BaseRegistry } from "../packages/BaseRegistry";
import type { LanguageConfiguration } from ".";
import { Language, RunStatus } from "..";
import { PackageManager } from "../packages";

const Cpp: LanguageConfiguration<Language.Cpp> = {
  language: Language.Cpp,
  filesystem: "https://runno.dev/langs/clang-fs.tar.gz",
  packages: new PackageManager(new BaseRegistry(Language.Cpp)),
  steps: [
    {
      status: RunStatus.Compiling,
      run: {
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
          "/program.o",
          "-x",
          "c++",
          "/program",
        ],
      },
    },
    {
      status: RunStatus.Linking,
      run: {
        binary: "https://runno.dev/langs/wasm-ld.wasm",
        args: [
          "wasm-ld",
          "--no-threads",
          "--export-dynamic",
          "-z",
          "stack-size=1048576",
          "-L/sys/lib/wasm32-wasi",
          "/sys/lib/wasm32-wasi/crt1.o",
          "/program.o",
          "-lc",
          "-lc++",
          "-lc++abi",
          "-o",
          "/program.wasm",
        ],
      },
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

const Python: LanguageConfiguration<Language.Python> = {
  language: Language.Python,
  filesystem: "https://runno.dev/langs/python-3.11.3.tar.gz",
  packages: new PackageManager(new BaseRegistry(Language.Python)),
  steps: [
    {
      status: RunStatus.Running,
      run: {
        binary: "https://runno.dev/langs/python-3.11.3.wasm",
        args: ["python", "/program"],
      },
    },
  ],
};

export const LanguagesConfig: {
  [P in Language]: LanguageConfiguration<P>;
} = {
  [Language.Cpp]: Cpp,
  [Language.Python]: Python,
};
