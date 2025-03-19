import { Language } from "../..";
import { PackageMeta, Package, PackageRegistry, PackageSearchOptions } from "..";
import { ArchivePackage } from "../../utils";

export type BundledPackageMeta = PackageMeta & {
  /**
   * A URL to where the package tarball can be downloaded
   */
  source: string;

  /**
   * The last commit when this package was built
   */
  sha: string;
};

export class BaseRegistry extends PackageRegistry {
  private _registry?: BundledPackageMeta[];

  constructor(private language: Language) {
    super();
  }

  get name(): string {
    return "base";
  }

  async *search(query: string, options?: PackageSearchOptions): AsyncIterableIterator<Package> {
    for (const meta of await this.fetchRegistry(options?.signal)) {
      const label = meta.label ?? meta.name;
      if (!query || label.toLocaleLowerCase().includes(query.toLocaleLowerCase()))
        yield new ArchivePackage(meta, meta.source);
    }
  }

  async resolve(name: string, _?: string, signal?: AbortSignal): Promise<Package | null> {
    const registry = await this.fetchRegistry(signal);
    const meta = registry.find((meta) => meta.name === name);
    if (!meta) return null;
    return new ArchivePackage(meta, meta.source);
  }

  private async fetchRegistry(signal?: AbortSignal): Promise<NonNullable<typeof this._registry>> {
    signal?.throwIfAborted();
    if (this._registry) return this._registry;
    const registryUrl = `https://raw.githubusercontent.com/cs106l/runtime/dist/${this.language}/registry.json`;
    const res = await fetch(registryUrl, { signal });
    if (!res.ok) {
      if (res.status === 404) this._registry = [];
      else throw new Error(`Failed to fetch package registry: ${res.statusText}`);
    } else {
      this._registry = await res.json();
    }
    return this._registry!;
  }
}
