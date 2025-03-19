/**
 * Script to build all language packages in the base registry.
 */

import { z } from "zod";
import { Language, PackageMeta, PackageMetaSchema } from "./src";

import fs from "fs";
import path from "path";
import { execSync } from "child_process";
import { parseArgs } from "util";

import glob from "fast-glob";
import { create as createTar } from "tar";
import { BaseRegistry, BundledPackageMeta } from "./src/packages/registry/base";

const PackagesDir = "packages";
const ManifestFiles = ["manifest.json", "manifest.ts", "manifest.js"];

/**
 * The manifest for a package in the root filesystem.
 *
 * **Note:**  Any file paths documented as being from the root of the virtual filesystem
 *            **should be listed instead as relative to `rootDir`.** The bundler will
 *            automatically append the necessary prefix to make it absolute on export.
 */
export type Manifest = z.infer<typeof ManifestSchema>;

const ManifestSchema = PackageMetaSchema.omit({
  registry: true, // Will be manually set
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

const baseRegistries = new Map<Language, BaseRegistry>();

async function getPublishedBuildSHA(manifestPath: string): Promise<string | null> {
  const language = getManifestLanguage(manifestPath);
  const packageName = path.basename(path.dirname(manifestPath));

  let registry = baseRegistries.get(language);
  if (!registry) {
    baseRegistries.set(language, new BaseRegistry(language));
    registry = baseRegistries.get(language)!;
  }

  const pkg = await registry.resolve(packageName);
  if (!pkg) return null;
  return (pkg.meta as BundledPackageMeta).sha;
}

async function hasManifestChanged(manifestPath: string): Promise<boolean> {
  const sha = await getPublishedBuildSHA(manifestPath);
  if (!sha) return true;

  const dir = path.dirname(manifestPath);

  try {
    execSync(`git diff --exit-code ${sha} HEAD -- "${dir}"`);
    return false;
  } catch {
    return true;
  }
}

async function getChangedManifests(): Promise<string[]> {
  const manifests = findManifestPaths();
  const changed = await Promise.all(manifests.map(hasManifestChanged));
  return manifests.filter((_, i) => changed[i]);
}

function getManifestLanguage(manifestPath: string): Language {
  /* Get the manifest language by inspecting the path */
  const relPath = path.relative(PackagesDir, manifestPath);
  const rawLang = relPath.split(path.sep)[0];
  const lang = z.nativeEnum(Language).safeParse(rawLang);
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
    const cwd = process.cwd();
    process.chdir(path.dirname(manifestPath));
    try {
      const imported = (await import(`.${path.sep}${manifestPath}`)).default;
      rawManifest = typeof imported === "function" ? await imported() : imported;
    } finally {
      process.chdir(cwd);
    }
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

  /** Extends a rootDir-relative path to its absolute VFS path */
  const extend = (relPath: string) => path.join(packagePrefix, relPath);

  const { prefixFile, postfixFile, ...runtime } = manifest.runtime ?? {};

  /* Language specific adjustments */
  if (runtime) {
    if (runtime.language === Language.Cpp) {
      runtime.includePaths = runtime.includePaths?.map(extend);
    }
  }

  const meta: BundledPackageMeta = {
    sha: execSync("git rev-parse HEAD").toString().trim(),
    name: manifest.name,
    label: manifest.label,
    description: manifest.description,
    version: manifest.version,
    registry: "base",
    source: `${sourceUrl}/${lang}/${manifest.name}.tar.gz`,
    dependencies: manifest.dependencies,
    runtime: manifest.runtime
      ? {
          prefixFile: prefixFile ? extend(prefixFile) : undefined,
          postfixFile: postfixFile ? extend(postfixFile) : undefined,
          ...runtime,
        }
      : undefined,
  };

  /* The build number is not part of the PackageMeta,
   * but we include it so that CI can determine when to re-build */
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

    const json = JSON.stringify(values.changed ? await getChangedManifests() : findManifestPaths());
    console.log(json);
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
