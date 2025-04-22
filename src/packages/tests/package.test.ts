import { expect, test } from "vitest";
import { DecodedPackageRef, Package } from "..";

test("Decode package refs", () => {
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

  decoded("", { name: "" });
  decoded("  ", { name: "" });
  decoded(":", { name: "" });
  decoded("  : ", { name: "" })
  decoded("@", { name: "" });
  decoded(":@", { name: "" });
  decoded("@:", { name: "", registry: "@" });
  decoded("registry:   @version", { name: "", registry: "registry", version: "version" })

  /** Ref names can include "@" in the package name, but if so the version must be given */
  decoded("@cs106l/runtime@0.1.0", { name: "@cs106l/runtime", version: "0.1.0" });
});