import type { WASIFS } from "@runno/wasi";

export enum Language {
  Cpp = "cpp",
  Python = "python",
}

export type PackageMeta<Lang extends Language> = {
  name: string;
  description?: string;
  version?: string;
  registry: string;
  source: string;
  dependencies: string[];
  runtime: RuntimeOptions<Lang>;
};

type RuntimeOptions<Lang extends Language> = CommonRuntimeOptions & RuntimeLanguageOptionsMap[Lang];

type CommonRuntimeOptions = {
  prefixFile?: string;
  postfixFile?: string;
};

type RuntimeLanguageOptionsMap = {
  [Language.Python]: PythonRuntimeOptions;
  [Language.Cpp]: CppRuntimeOptions;
};

export type PythonRuntimeOptions = {};
export type CppRuntimeOptions = {};

export class PackageNotFoundError extends Error {}

export abstract class Registry<Lang extends Language> {
  abstract get name(): string;
  abstract search: PackageManager<Lang>["search"];
  abstract resolve: PackageManager<Lang>["resolve"];
  abstract load: PackageManager<Lang>["load"];
}

export class PackageManager<Lang extends Language> {
  registries: readonly Registry<Lang>[];

  constructor(...registries: Registry<Lang>[]) {
    this.registries = registries;
  }

  async search(name: string): Promise<PackageMeta<Lang>[]> {
    const all = await Promise.all(this.registries.map((r) => r.search(name)));
    console.assert(
      !all.some((packages, idx) => packages.some((p) => p.registry !== this.registries[idx].name)),
      "PackageMeta must have same registry name as registry from which it originates",
    );
    return all.flat();
  }

  private async resolve(name: string): Promise<PackageMeta<Lang>> {
    const results = await Promise.allSettled(this.registries.map((r) => r.resolve(name)));

    const result = results.find((res, idx): res is PromiseFulfilledResult<PackageMeta<Lang>> => {
      if (res.status !== "fulfilled") return false;
      console.assert(
        res.value.registry === this.registries[idx].name,
        `Package ${res.value.name} must have same registry name as registry ${this.registries[idx].name} from which it originates`,
      );
      return true;
    });

    if (result) return result.value;
    throw new PackageNotFoundError(name);
  }

  private async load(meta: PackageMeta<Lang>): Promise<WASIFS> {
    const registry = this.registries.find((r) => r.name === meta.registry);
    if (!registry) throw new PackageNotFoundError(`No such registry: ${meta.registry}`);
    return registry.load(meta);
  }
}
