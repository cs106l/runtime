// vite.config.js
import typescript from "@rollup/plugin-typescript";
import { resolve } from "path";
import { defineConfig } from "vite";

export default defineConfig({
  build: {
    copyPublicDir: false, // Public dir contains testing binaries
    lib: {
      entry: resolve(__dirname, "src/index.ts"),
      name: "runtime",
    },
    rollupOptions: {
      // make sure to externalize deps that shouldn't be bundled
      // into your library
      external: [],
      output: {
        // Provide global variables to use in the UMD build
        // for externalized deps
        globals: {},
      },
    },
  },
  plugins: [
    {
      ...typescript({ outDir: "dist" }),
      apply: "build",
    },
  ]
});