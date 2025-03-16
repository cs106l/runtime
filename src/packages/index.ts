import type { WASIFS } from "@runno/wasi";
import { Language } from "..";
import { z } from "zod";

export type PackageMeta<Lang extends Language> = z.infer<
  ReturnType<typeof PackageMetaSchema<Lang>>
>;

export function PackageMetaSchema<Lang extends Language>(language: Lang) {
  return z.object({
    /**
     * The name of the package
     *
     * This is an unambiguous, unique identifier for the package across **all** registries.
     */
    name: z.string(),

    /**
     * The name of the package as it should be shown to the end user
     * @default name
     */
    label: z.string().optional(),

    /**
     * A short, one-sentence description of the package that can be shown to the end user
     */
    description: z.string().optional(),

    /**
     * The package version, using [semantic versioning](https://semver.org/)
     *
     * Currently, this version string is purely informative and does not participate in package resolution.
     */
    version: z.string().optional(),

    /**
     * Which package registry to load the package from
     */
    registry: z.string(),

    /**
     * Where the package can be found
     *
     * There are no hard requirements on the contents of this string--package registries will use this internally
     * to load packages into the virtual filesystem. For example, this might be a URL to a tarball.
     */
    source: z.string(),

    /**
     * A list of packages that should be installed first for this package to be functional
     * @default []
     */
    dependencies: z.string().array().optional(),

    /**
     * Language-specific runtime information needed to use this package
     *
     * For example, C++ packages might use this to encode compiler/linker flags to ensure the package
     * headers can be included.
     */
    runtime: CommonRuntimeOptionsSchema.merge(RuntimeLanguageOptionsSchemas[language]).optional(),
  });
}

const CommonRuntimeOptionsSchema = z.object({
  /**
   * A path, relative to the virtual file system root, to a file whose
   * contents should be included **before** the executing program
   */
  prefixFile: z.string().optional(),

  /**
   * A path, relative to the virtual file system root, to a file whose
   * contents should be included **after** the executing program
   *
   * This can be useful for creating test-harness packages ("runners").
   */
  postfixFile: z.string().optional(),
});

const RuntimeLanguageOptionsSchemas = {
  [Language.Python]: z.object({}),
  [Language.Cpp]: z.object({}),
};

export class PackageNotFoundError extends Error {}

export abstract class PackageRegistry<Lang extends Language> {
  abstract get name(): string;
  abstract search(
    ...args: Parameters<PackageManager<Lang>["search"]>
  ): ReturnType<PackageManager<Lang>["search"]>;

  abstract resolve(
    ...args: Parameters<PackageManager<Lang>["resolve"]>
  ): ReturnType<PackageManager<Lang>["resolve"]>;

  abstract load(
    ...args: Parameters<PackageManager<Lang>["load"]>
  ): ReturnType<PackageManager<Lang>["load"]>;
}

export class PackageManager<Lang extends Language> {
  registries: readonly PackageRegistry<Lang>[];
  installed: PackageMeta<Lang>[] = [];

  /* Cache of previously resolved packages */
  private resolved = new Map<string, PackageMeta<Lang>>();

  constructor(...registries: PackageRegistry<Lang>[]) {
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

  async fs(): Promise<WASIFS> {
    const fsList = await Promise.all(this.installed.map((meta) => this.load(meta)));
    return Object.assign({}, ...fsList);
  }

  async install(name: string | PackageMeta<Lang>): Promise<PackageMeta<Lang>> {
    const meta = typeof name === "string" ? await this.resolve(name) : name;
    const existing = this.installed.find((m) => m.name === meta.name);
    if (existing) return existing;
    this.installed.push(meta);

    // Install dependencies recursively
    if (meta.dependencies) await Promise.all(meta.dependencies.map((dep) => this.install(dep)));
    return meta;
  }

  private async resolve(name: string): Promise<PackageMeta<Lang>> {
    if (this.resolved.has(name)) return this.resolved.get(name)!;

    const results = await Promise.allSettled(this.registries.map((r) => r.resolve(name)));

    const result = results.find((res, idx) => {
      if (res.status !== "fulfilled") return false;
      console.assert(
        res.value.registry === this.registries[idx].name,
        `Package ${res.value.name} must have same registry name as registry ${this.registries[idx].name} from which it originates`,
      );
      return true;
    });

    if (result?.status === "fulfilled") {
      this.resolved.set(name, result.value);
      return result.value;
    }

    throw new PackageNotFoundError(name);
  }

  private async load(meta: PackageMeta<Lang>): Promise<WASIFS> {
    const registry = this.registries.find((r) => r.name === meta.registry);
    if (!registry) throw new PackageNotFoundError(`No such registry: ${meta.registry}`);
    return registry.load(meta);
  }
}
