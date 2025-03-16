/**
 * Script to build all language packages in the base registry.
 */

import { z } from "zod";
import { Language } from "../src";
import { PackageMetaSchema } from "../src/packages/packages";

/*
 * ============================================================================
 * Schema/Validation
 * ============================================================================
 */

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
    });
}
