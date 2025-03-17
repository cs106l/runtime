import { Language } from "..";
import { PackageMeta, PackageNotFoundError, PackageRegistry, PackageSearchOptions } from ".";
import type { WASIFS } from "@runno/wasi";
import { fetchWASIFS, SignalOptions } from "src/utils";

export class BaseRegistry<Lang extends Language> extends PackageRegistry<Lang> {
  private _registry?: PackageMeta<Lang>[];

  constructor(private language: Lang) {
    super();
  }

  get name(): string {
    return "base";
  }

  async search(label: string, options?: PackageSearchOptions): Promise<PackageMeta<Lang>[]> {
    const registry = await this.fetchRegistry();
    const packages = registry
      .filter((p) => {
        if (!label) return true;
        const packageLabel = p.label ?? p.name;
        return packageLabel.toLocaleLowerCase().includes(label.toLocaleLowerCase());
      })
      .filter((p) => {
        if (!options?.name) return true;
        return options.name.test(p.name);
      });
    return packages;
  }

  async resolve(name: string): Promise<PackageMeta<Lang>> {
    const registry = await this.fetchRegistry();
    const meta = registry.find((p) => p.name === name);
    if (!meta) throw new PackageNotFoundError(name);
    return meta;
  }

  load(meta: PackageMeta<Lang>, options?: SignalOptions): Promise<WASIFS> {
    return fetchWASIFS(meta.source, options);
  }

  private async fetchRegistry(): Promise<NonNullable<typeof this._registry>> {
    if (this._registry) return this._registry;
    const registryUrl = `https://raw.githubusercontent.com/cs106l/runtime/dist/${this.language}/registry.json`;
    const res = await fetch(registryUrl);
    if (!res.ok) {
      if (res.status === 404) this._registry = [];
      throw new Error(`Failed to fetch package registry: ${res.statusText}`);
    } else {
      this._registry = await res.json();
    }
    return this._registry!;
  }
}
