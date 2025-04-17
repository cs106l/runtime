import { expect, test } from "vitest";
import { DecodedPackageRef, Package, PackageNotFoundError } from "..";

test("Decode package refs: valid", () => {
  function decoded(input: string, expected: DecodedPackageRef) {
    expect(Package.decodeRef(input)).toEqual(expected);
  }

  decoded("name", { name: "name" });
  decoded("  name  ", { name: "name" });
  decoded("registry:name", { name: "name", registry: "registry" });
  decoded("  registry  :  name  ", { name: "name", registry: "registry" });
  decoded("registry:name@version", { name: "name", registry: "registry", version: "version" });
  decoded("  registry  :  name  @  version  ", { name: "name", registry: "registry", version: "version" });

  decoded("@registry:name@:version", { name: "name", registry: "@registry", version: ":version"});
  decoded("::", { name: ":" });
  decoded("@@", { name: "@" });
});

test("Decode package refs: invalid", () => {
  function invalid(input: string) {
    expect(() => Package.decodeRef(input)).toThrow(new PackageNotFoundError(input));
  }

  invalid("");
  invalid("  ");
  invalid(":");
  invalid("  : ")
  invalid("@");
  invalid(":@");
  invalid("@:");
  invalid("registry:   @version")
});
