import type { WASIFS } from "@runno/wasi";
import type { PackageMeta } from "./schema";
import combineAsyncIterators from "combine-async-iterators";

export class PackageNotFoundError extends Error {}

/**
 * A reference to a package or packages. It has the format:
 *
 * ```
 * [<registry>:]<package_name>[@<version>]
 * ```
 *
 * For example, all of the following are valid package references:
 *
 * ```
 * numpy
 * numpy
 * base:numpy
 * numpy@1.0.0
 * base:numpy@>=1.0.0
 * ```
 */
export type PackageRef = string;

export type DecodedPackageRef = {
  name: string;
  registry?: string;
  version?: string;
};

export abstract class Package {
  constructor(public readonly meta: PackageMeta) {}
  abstract load(signal?: AbortSignal): Promise<WASIFS>;

  get ref(): PackageRef {
    return Package.encodeRef({
      name: this.meta.name,
      version: this.meta.version,
      registry: this.meta.registry,
    });
  }

  static encodeRef({ name, version, registry }: DecodedPackageRef): string {
    const reg = registry ? `${registry}:` : "";
    const ver = version ? `@${version}` : "";
    return `${reg}${name}${ver}`;
  }

  static decodeRef(ref: PackageRef): DecodedPackageRef {
    ref = ref.trim();
    if (ref.startsWith(":") || ref.endsWith("@")) throw new PackageNotFoundError(ref);
    if (ref.startsWith("@")) return { name: ref };

    let colon = ref.indexOf(":");
    if (colon < 0) colon = 0;
    const registry = ref.substring(0, colon).trim() || undefined;

    let at = ref.lastIndexOf("@");
    if (at < 0) at = ref.length;
    if (ref.substring(colon + 1, at).trim().length == 0) at = ref.length;
    const version = ref.substring(at + 1).trim() || undefined;

    const name = ref.substring(colon + 1, at);
    return { registry, name, version };
  }
}

export abstract class PackageRegistry {
  abstract get name(): string;

  abstract search(query: string, options?: RegistrySearchOptions): AsyncIterableIterator<Package>;

  /**
   * Attempts to find the metadata for a package.
   *
   * @param name      The name of the package
   * @param version   A version or version range to match against, if provided
   * @returns         A promise that resolves with the `PackageMeta` if it could be found,
   *                  or `null` if no package could be found
   *
   * #### Note to Implementers
   *
   * This function implements package resolution at the registry level.
   * It returns a `Package` that encapsulates both the package metadata and also
   * how to to download the package to the virtual filesystem at a later point, if desired.
   *
   * `name` refers to the package's name, and it is expected (although not enforced) that the
   * returned loader's `meta.name` will have this value. Similarly, `meta.registry` should match
   * this registry's name.
   *
   * `version` is the raw version string supplied to `PackageManager.resolve` (i.e. everything
   * after the "@" character, if present) and is not guarantee to conform to any particular versioning standard.
   * It is up to you to determine the semantics and handling for package versions.
   *
   * If your registry uses semantic versioning, for instance, you could first verify that `version` is a
   * valid semver and return `undefined` if it's not. `version` might not refer to a specific
   * package version: it could indicate a version range as well, in which case this function might implement
   * logic to determine which version of a package is best matched by `version` among multiple
   * alternatives. Again, it is up to you how you want to handle versioning.
   */
  abstract resolve(name: string, version?: string, signal?: AbortSignal): Promise<Package | null>;
}

export type RegistrySearchOptions = {
  signal?: AbortSignal;
};

export type PackageSearchOptions = RegistrySearchOptions & {
  /**
   * Restrict search to these registries
   */
  registries?: string[];
};

export class PackageManager {
  private cache: Map<PackageRef, Package> = new Map();

  registries: readonly PackageRegistry[];

  constructor(...registries: PackageRegistry[]) {
    this.registries = registries;
  }

  async *search(query: string, options?: PackageSearchOptions): AsyncIterableIterator<Package> {
    options ??= {};
    options.signal?.throwIfAborted();

    const active = this.activeRegistries(options.registries);
    const queries = active.map((r) => r.search(query, options));

    for await (const pkg of combineAsyncIterators(...queries)) {
      options.signal?.throwIfAborted();
      yield pkg;
    }
  }

  async resolve(ref: PackageRef, signal?: AbortSignal): Promise<Package> {
    signal?.throwIfAborted();
    if (this.cache.has(ref)) return this.cache.get(ref)!;

    const { registry, name, version } = Package.decodeRef(ref);
    console.log(registry, name, version);
    let active = this.activeRegistries(registry ? [registry] : undefined);
    const results = await Promise.allSettled(active.map((a) => a.resolve(name, version, signal)));

    signal?.throwIfAborted();

    const failed = results.find((r) => r.status === "rejected");
    if (failed) throw failed.reason;

    for (const result of results) {
      const success = result as PromiseFulfilledResult<Package>;
      if (success.value) {
        this.cache.set(ref, success.value);
        return success.value;
      }
    }

    throw new PackageNotFoundError(ref);
  }

  createWorkspace(): PackageWorkspace {
    return new PackageWorkspace(this);
  }

  private activeRegistries(registries?: string[]) {
    if (!registries) return this.registries;
    return this.registries.filter((r) => registries.includes(r.name));
  }
}

export class PackageWorkspace {
  installed: Package[] = [];

  constructor(private manager: PackageManager) {}

  async install(...refs: PackageRef[]): Promise<void> {
    await Promise.all(refs.map((pkg) => this.installOne(pkg)));
  }

  private async installOne(ref: PackageRef): Promise<void> {
    // TODO: There is a race condition in this code.
    // Conflicting packages will be handled in a non-deterministic way
    // that depends on the order in which they finish resolving.
    const pkg = await this.manager.resolve(ref);
    const conflict = this.installed.find((p) => p.meta.name === pkg.meta.name);
    if (conflict) return;
    this.installed.push(pkg);
    if (pkg.meta.dependencies) await this.install(...pkg.meta.dependencies);
  }

  async build(signal?: AbortSignal): Promise<WASIFS> {
    const fs = await Promise.all(this.installed.map((p) => p.load(signal)));
    return Object.assign({}, ...fs);
  }

  prefixCode(fs: WASIFS): string {
    return this.gatherText(fs, (meta) => meta.runtime?.prefixFile, "append");
  }

  postfixCode(fs: WASIFS): string {
    return this.gatherText(fs, (meta) => meta.runtime?.postfixFile, "prepend");
  }

  private gatherText(
    fs: WASIFS,
    path: (pkg: PackageMeta) => string | undefined,
    appendMode: "append" | "prepend",
    delim: string = "\n",
  ) {
    const decoder = new TextDecoder();
    let code = "";

    for (const pkg of this.installed) {
      const filePath = path(pkg.meta);
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
