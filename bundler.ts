/**
 * Script to build all language packages in the base registry.
 */

import { z } from "zod";
import { Language } from "src";
import { PackageMetaSchema } from "src/packages";

import fs from "fs";
import path from "path";
import { execSync } from "child_process";
import { parseArgs } from "util";

const PackagesDir = "packages";
const ManifestFiles = ["manifest.json", "manifest.ts"];

export type Manifest<Lang extends Language> = z.infer<ReturnType<typeof ManifestSchema<Lang>>>;

function ManifestSchema<Lang extends Language>(lang: Lang) {
  const base = PackageMetaSchema(lang);
  return base
    .omit({
      registry: true, // Will be manually set
      source: true, // Will be manually set
    })
    .extend({
      /**
       * Path to the directory that will become the package root in the virtual filesystem.
       * This path is relative to the package dir (i.e. the dir where this schema lives).
       * @default "."
       */
      rootDir: z.string().optional(),

      /**
       * Optional array of file patterns describing what files should be packed.
       * File patterns follow a similar syntax to .gitignore, but reversed: including a
       * file, directory, or glob pattern (*, **\/*, and such) will make it so that
       * file is included in the tarball when it's packed.
       *
       * These paths/globs are relative to this package dir. The package manifest will
       * never be included.
       */
      files: z.string().array().optional(),

      /**
       * An optional command to run before packing the tarball for the package.
       * The command will be run in the package directory.
       */
      build: z.string().optional(),

      runtime: base.shape.runtime
        .unwrap()
        .extend({
          /**
           * A path, relative to the package dir, to a file whose
           * contents should be included **before** the executing program
           */
          prefixFile: z.string().optional(),

          /**
           * A path, relative to the package dir, to a file whose
           * contents should be included **after** the executing program
           *
           * This can be useful for creating test-harness packages ("runners").
           */
          postfixFile: z.string().optional(),
        })
        .optional(),
    });
}

const LanguageSchema = z.nativeEnum(Language);

function findManifestPaths(dir: string = PackagesDir): string[] {
  let manifests: string[] = [];

  for (const entry of fs.readdirSync(dir)) {
    const fullPath = path.join(dir, entry);
    if (fs.statSync(fullPath).isDirectory()) {
      manifests.push(...findManifestPaths(fullPath));
    } else if (ManifestFiles.includes(entry)) {
      manifests.push(fullPath);
    }
  }

  return manifests;
}

function getChangedManifests(): string[] {
  const manifests = findManifestPaths();

  return manifests.filter((manifest) => {
    const dir = path.join(manifest, "..");
    try {
      const changedFiles = execSync(`git diff --name-only HEAD~1 HEAD -- ${dir}`).toString().trim();
      return changedFiles.length > 0;
    } catch {
      return false;
    }
  });
}

async function loadManifest(manifestPath: string): Promise<Manifest<Language>> {
  if (!fs.existsSync(manifestPath)) throw new Error(`No such file: ${manifestPath}`);

  /* Get the manifest language by inspecting the path */
  const relPath = path.relative(PackagesDir, manifestPath);
  const rawLang = relPath.split(path.sep)[0];
  const lang = LanguageSchema.safeParse(rawLang);
  if (!lang.success)
    throw new Error(
      `Failed to infer language from manifest ${manifestPath}. Is it in a directory like ${path.join(
        PackagesDir,
        Language.Cpp,
      )}?`,
    );

  /* Load the manifest */
  const schema = ManifestSchema(lang.data);

  let rawManifest: unknown;

  if (manifestPath.endsWith(".json")) {
    const content = fs.readFileSync(manifestPath, "utf-8");
    try {
      rawManifest = JSON.parse(content);
    } catch {
      throw new Error(`Failed to parse manifest json at ${manifestPath}`);
    }
  } else if (manifestPath.endsWith(".ts") || manifestPath.endsWith(".js")) {
    const imported = (await import(manifestPath)).default;
    rawManifest = typeof imported === "function" ? imported() : imported;
  } else {
    throw new Error(`Unsupported manifest type: ${manifestPath}`);
  }

  const manifest = schema.safeParse(rawManifest);
  if (!manifest.success)
    throw new Error(
      `Failed to load manifest at ${manifestPath}. Got the following errors:\n\n${manifest.error.toString()}`,
    );

  return manifest.data;
}

async function bundleManifest(manifest: Manifest<Language>, outputDir: string) {}

/*
 * ============================================================================
 * CLI
 * ============================================================================
 */

function usage() {
  console.log(`Usage: npm run bundler -- <command> [args]

Commands:
  changed     List changed manifests
  bundle      Bundles a manifest and outputs the tarball to output_dir
  help        Show this help message
`);

  process.exit(0);
}

async function cli() {
  const [, , command] = process.argv;

  if (command === "changed") {
    console.log(getChangedManifests());
    return;
  } else if (command === "bundle") {
    const { positionals, values } = parseArgs({
      allowPositionals: true,
      options: {
        output: { type: "string", default: "export" },
      },
    });

    if (positionals.length !== 2) {
      console.error("Usage: npm run bundler bundle <manifest_path> --output <output_dir>");
      process.exit(1);
    }

    const manifestPath = positionals[1];
    const manifest = await loadManifest(manifestPath);
    bundleManifest(manifest, values.output);
    return;
  }

  if (command === "help" || !command) usage();
  console.error(`Invalid command: ${command}`);
  process.exit(1);
}

(async () => {
  await cli();
})();
