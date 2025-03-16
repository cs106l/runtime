import { Language } from "..";
import { PackageMeta, PackageRegistry } from ".";
import type { WASIFS } from "@runno/wasi";

export const BaseRegistryName: string = "base"; 

export class BaseRegistry<Lang extends Language> extends PackageRegistry<Lang> {
  get name(): string {
    return BaseRegistryName;
  }

  search(name: string): Promise<PackageMeta<Lang>[]> {
    throw new Error("Method not implemented.");
  }

  resolve(name: string): Promise<PackageMeta<Lang>> {
    throw new Error("Method not implemented.");
  }

  load(meta: PackageMeta<Lang>): Promise<WASIFS> {
    throw new Error("Method not implemented.");
  }
}
