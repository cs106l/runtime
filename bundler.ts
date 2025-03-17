/**
 * Script to build all language packages in the base registry.
 */

import { z } from "zod";
import {
  BaseRuntimeSchema,
  Language,
  LanguageSchema,
  LanguagesRuntimeSchema,
  PackageMeta,
  PackageMetaSchema,
} from "./src";

import fs from "fs";
import path from "path";
import { execSync } from "child_process";
import { parseArgs } from "util";

import glob from "fast-glob";
import { create as createTar } from "tar";

const PackagesDir = "packages";
const ManifestFiles = ["manifest.json", "manifest.ts", "manifest.js"];

export type Manifest = z.infer<typeof ManifestSchema>;

const ManifestSchema = PackageMetaSchema.omit({
  registry: true, // Will be manually set
  source: true, // Will be manually set
}).extend({
  /**
   * Path to the directory that will become the package root in the virtual filesystem.
   * This path is relative to the package dir (i.e. the dir where this manifest lives).
   * @default "."
   */
  rootDir: z.string().optional(),

  /**
   * Optional array of file patterns describing what files should be packed.
   * File patterns follow a similar syntax to .gitignore, but reversed: including a
   * file, directory, or glob pattern (*, **\/*, and such) will make it so that
   * file is included in the tarball when it's packed.
   *
   * These paths/globs are relative to the `rootDir`. The package manifest will
   * never be included.
   */
  files: z.string().array().optional(),

  /**
   * An optional command to run before packing the tarball for the package.
   * The command will be run in the package directory.
   */
  build: z.string().optional(),

  runtime: LanguagesRuntimeSchema.and(
    BaseRuntimeSchema.extend({
      /**
       * A path, relative to `rootDir`, to a file whose
       * contents should be included **before** the executing program
       */
      prefixFile: z.string().optional(),

      /**
       * A path, relative to `rootDir`, to a file whose
       * contents should be included **after** the executing program
       *
       * This can be useful for creating test-harness packages ("runners").
       */
      postfixFile: z.string().optional(),
    }),
  ).optional(),
});

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

function getManifestLanguage(manifestPath: string): Language {
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
  return lang.data;
}

async function loadManifest(manifestPath: string): Promise<Manifest> {
  if (!fs.existsSync(manifestPath)) throw new Error(`No such file: ${manifestPath}`);

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

  const manifest = ManifestSchema.safeParse(rawManifest);
  if (!manifest.success)
    throw new Error(
      `Failed to load manifest at ${manifestPath}. Got the following errors:\n\n${manifest.error.toString()}`,
    );

  return manifest.data;
}

async function bundleManifest(manifestPath: string, outputDir: string, sourceUrl: string) {
  const packageDir = path.dirname(manifestPath);
  const manifest = await loadManifest(manifestPath);

  /* Run build hook if needed */
  if (manifest.build) execSync(manifest.build, { cwd: packageDir });

  /* Glob package files and tar */
  const cwd = path.join(packageDir, manifest.rootDir ?? ".");
  const files = await glob(manifest.files ?? "**/*", {
    cwd,
    ignore: [path.relative(cwd, manifestPath)],
  });

  files.push("."); // Ensures empty directories can be tarred

  const packagePrefix = `/packages/${manifest.name}`;
  const lang = getManifestLanguage(manifestPath);
  const langDir = path.join(outputDir, lang);

  if (!fs.existsSync(langDir)) fs.mkdirSync(langDir, { recursive: true });

  await createTar(
    {
      cwd,
      gzip: true,
      file: path.join(langDir, `${manifest.name}.tar.gz`),
      prefix: packagePrefix,
      noDirRecurse: true,
      portable: true,
    },
    files,
  );

  const { prefixFile, postfixFile, ...runtime } = manifest.runtime ?? {};

  const meta: PackageMeta = {
    name: manifest.name,
    label: manifest.label,
    description: manifest.description,
    version: manifest.version,
    registry: "base",
    source: `${sourceUrl}/${lang}/${manifest.name}.tar.gz`,
    dependencies: manifest.dependencies,
    runtime: manifest.runtime
      ? {
          prefixFile: prefixFile ? path.join(packagePrefix, prefixFile) : undefined,
          postfixFile: postfixFile ? path.join(packagePrefix, postfixFile) : undefined,
          ...runtime,
        }
      : undefined,
  };

  fs.writeFileSync(path.join(langDir, `${manifest.name}.json`), JSON.stringify(meta));
}

function writeRegistry(lang: Language, outputDir: string) {
  const langDir = path.join(outputDir, lang);
  if (!fs.existsSync(langDir)) fs.mkdirSync(langDir, { recursive: true });

  const files = fs
    .readdirSync(langDir)
    .filter((file) => file.endsWith(".json") && file !== "registry.json");
  const registry: any[] = [];

  for (const file of files) {
    const filePath = path.join(langDir, file);
    const content = JSON.parse(fs.readFileSync(filePath, "utf8"));
    registry.push(content);
  }

  fs.writeFileSync(path.join(langDir, "registry.json"), JSON.stringify(registry, null, 2));
}

/*
 * ============================================================================
 * CLI
 * ============================================================================
 */

function usage(): never {
  console.log(`Usage: npm run bundler -- <command> [args]

Commands:
  list        List all or modified manifests
  bundle      Bundles a manifest and outputs the tarball to output_dir
  registry    Build registry file after bundling 
  help        Show this help message
`);

  process.exit(0);
}

async function cli() {
  const [, , command] = process.argv;

  if (command === "list") {
    const { values } = parseArgs({
      allowPositionals: true,
      options: {
        changed: { type: "boolean", default: false },
      },
    });

    console.log(values.changed ? getChangedManifests() : findManifestPaths());
    return;
  } else if (command === "bundle") {
    const { positionals, values } = parseArgs({
      allowPositionals: true,
      options: {
        output: { type: "string", default: "export" },
        source: { type: "string" },
      },
    });

    if (positionals.length !== 2)
      throw new Error("Usage: npm run bundler -- bundle <manifest_path> --output <output_dir>");

    if (!values.source)
      throw new Error(
        "You must pass --source with the prefix of the URL where bundles will ultimately be located.",
      );

    bundleManifest(positionals[1], values.output, values.source);
    return;
  } else if (command === "registry") {
    const { values } = parseArgs({
      options: {
        output: { type: "string", default: "export" },
      },
      allowPositionals: true,
    });

    for (const lang of Object.values(Language)) {
      writeRegistry(lang as Language, values.output);
    }
    return;
  }

  if (command === "help" || !command) usage();
  throw new Error(`Invalid command: ${command}`);
}

(async () => {
  try {
    await cli();
  } catch (e: any) {
    console.error(e.message ?? e);
  }
})();
