import type { WASIFS } from "@runno/wasi";
import { Language } from "..";
import { z } from "zod";
import { SignalOptions } from "src/utils";

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
    runtime: CommonRuntimeOptionsSchema.and(RuntimeLanguageOptionsSchemas[language]).optional(),
  });
}

export const CommonRuntimeOptionsSchema = z.object({
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

export const RuntimeLanguageOptionsSchemas = {
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

export type PackageSearchOptions = {
  /**
   * Restrict search to these registries
   */
  registries?: string[];

  /**
   * Try to match packages whose `name` matches this pattern.
   *
   * **Note:** This is only a suggestion.
   *  Package registries are free to ignore this if it is inconvient/impossible to implement this query.
   *  The base registry will always respect this, however.
   */
  name?: RegExp;
};

export class PackageManager<Lang extends Language> {
  registries: readonly PackageRegistry<Lang>[];

  /* Cache of previously resolved packages */
  private resolved = new Map<string, PackageMeta<Lang>>();

  constructor(...registries: PackageRegistry<Lang>[]) {
    this.registries = registries;
  }

  async search(label: string, options?: PackageSearchOptions): Promise<PackageMeta<Lang>[]> {
    options ??= {};
    const all = await Promise.all(
      this.registries
        .filter((r) => options.registries?.includes(r.name) ?? true)
        .map((r) => r.search(label, options)),
    );
    console.assert(
      !all.some((packages, idx) => packages.some((p) => p.registry !== this.registries[idx].name)),
      "PackageMeta must have same registry name as registry from which it originates",
    );
    return all.flat();
  }

  async resolve(name: string): Promise<PackageMeta<Lang>> {
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

  async load(meta: PackageMeta<Lang>, options?: SignalOptions): Promise<WASIFS> {
    const registry = this.registries.find((r) => r.name === meta.registry);
    if (!registry) throw new PackageNotFoundError(`No such registry: ${meta.registry}`);
    return registry.load(meta, options);
  }

  createWorkspace(): PackageWorkspace<Lang> {
    return new PackageWorkspace(this);
  }
}

export type PackageList<Lang extends Language = Language> = (string | PackageMeta<Lang>)[];

export class PackageWorkspace<Lang extends Language> {
  installed: PackageMeta<Lang>[] = [];

  constructor(private manager: PackageManager<Lang>) {}

  async install(...packages: PackageList<Lang>): Promise<void> {
    await Promise.all(packages.map((pack) => this.installOne(pack)));
  }

  private async installOne(pack: PackageList<Lang>[0]): Promise<void> {
    const meta = typeof pack === "string" ? await this.manager.resolve(pack) : pack;
    const existing = this.installed.find((m) => m.name === meta.name);
    if (existing) return;
    this.installed.push(meta);

    // Install dependencies recursively
    if (meta.dependencies) await this.install(...meta.dependencies);
  }

  async build(options?: SignalOptions): Promise<WASIFS> {
    const fsList = await Promise.all(
      this.installed.map((meta) => this.manager.load(meta, options)),
    );
    return Object.assign({}, ...fsList);
  }

  prefixCode(fs: WASIFS): string {
    return this.gatherText(fs, (meta) => meta.runtime?.prefixFile, "append");
  }

  postfixCode(fs: WASIFS): string {
    return this.gatherText(fs, (meta) => meta.runtime?.postfixFile, "prepend");
  }

  private gatherText(
    fs: WASIFS,
    path: (meta: PackageMeta<Lang>) => string | undefined,
    appendMode: "append" | "prepend",
    delim: string = "\n",
  ) {
    const decoder = new TextDecoder();
    let code = "";

    for (const meta of this.installed) {
      const filePath = path(meta);
      if (!filePath) continue;
      const file = fs[filePath];
      if (!file) continue;
      let fileContent: string;
      if (file.mode === "string") fileContent = file.content;
      else if (file.mode === "binary") fileContent = decoder.decode(file.content);
      else throw new Error(`Unhandled WASIFS file mode: ${(file as any).mode}`);
      fileContent += delim;

      if (appendMode === "append") code = `${code}${fileContent}\n`;
      else code = `\n${fileContent}${code}`;
    }

    return code;
  }
}
