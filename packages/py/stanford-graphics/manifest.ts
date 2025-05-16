import { Manifest } from "../../../bundler";

const manifest: Manifest = {
  name: "stanfordgraphics",
  description: "Stanford graphics library used in CS106A",
  version: "0.1.0",
  dependencies: ["context2d"],
  files: ["**/*.py"],
  importAs: "graphics"
};

export default manifest;
