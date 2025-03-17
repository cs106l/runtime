import type { WASIFS } from "@runno/wasi";
import { Language } from "..";
import { SignalOptions } from "../utils";
import { PackageMeta } from "./schema";

export class PackageNotFoundError extends Error {}

export abstract class PackageRegistry {
  abstract get name(): string;
  abstract search(
    ...args: Parameters<PackageManager["search"]>
  ): ReturnType<PackageManager["search"]>;

  abstract resolve(
    ...args: Parameters<PackageManager["resolve"]>
  ): ReturnType<PackageManager["resolve"]>;

  abstract load(...args: Parameters<PackageManager["load"]>): ReturnType<PackageManager["load"]>;
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

export class PackageManager {
  registries: readonly PackageRegistry[];

  /* Cache of previously resolved packages */
  private resolved = new Map<string, PackageMeta>();

  constructor(...registries: PackageRegistry[]) {
    this.registries = registries;
  }

  async search(label: string, options?: PackageSearchOptions): Promise<PackageMeta[]> {
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

  async resolve(name: string): Promise<PackageMeta> {
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

  async load(meta: PackageMeta, options?: SignalOptions): Promise<WASIFS> {
    const registry = this.registries.find((r) => r.name === meta.registry);
    if (!registry) throw new PackageNotFoundError(`No such registry: ${meta.registry}`);
    return registry.load(meta, options);
  }

  createWorkspace(): PackageWorkspace {
    return new PackageWorkspace(this);
  }
}

export type PackageList = (string | PackageMeta)[];

export class PackageWorkspace {
  installed: PackageMeta[] = [];

  constructor(private manager: PackageManager) {}

  async install(...packages: PackageList): Promise<void> {
    await Promise.all(packages.map((pack) => this.installOne(pack)));
  }

  private async installOne(pack: PackageList[0]): Promise<void> {
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
    path: (meta: PackageMeta) => string | undefined,
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

export * from "./schema";
