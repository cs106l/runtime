import { z } from "zod";
import { Language } from "../enums";

export const BaseRuntimeSchema = z.object({
  /**
   * A path, relative to the virtual file system root, to a file whose
   * contents should be included **before** the executing program
   */
  prefixFile: z.string().optional(),

  /**
   * A path, relative to the virtual file system root, to a file whose
   * contents should be included **after** the executing program
   *
   * This can be useful for creating test-harness packages ("runners").
   */
  postfixFile: z.string().optional(),
});

export const CppRuntimeSchema = z.object({
  language: z.literal(Language.Cpp),

  /**
   * An array of include paths relative to the virtual file system root
   * where headers can be searched for.
   */
  includePaths: z.string().array().optional(),
});

export const PythonRuntimeSchema = z.object({
  language: z.literal(Language.Python),
});

export const LanguagesRuntimeSchema = z.discriminatedUnion("language", [
  z.object({ language: z.literal(undefined) }),
  CppRuntimeSchema,
  PythonRuntimeSchema,
]);

export const RuntimeOptionsSchema = LanguagesRuntimeSchema.and(BaseRuntimeSchema);

export const PackageMetaSchema = z.object({
  /**
   * The name of the package
   *
   * This is an unambiguous, unique identifier for the package across **all** registries.
   */
  name: z.string(),

  /**
   * The package version
   */
  version: z.string(),

  /**
   * The name of the registry where this package originates
   */
  registry: z.string(),

  /**
   * The name of the package as it should be shown to the end user
   * @default name
   */
  label: z.string().optional(),

  /**
   * A short, one-sentence description of the package that can be shown to the end user
   */
  description: z.string().optional(),

  /**
   * A list of package refs that must be installed for this package to be functional
   * @default []
   */
  dependencies: z.string().array().optional(),

  /**
   * Language-specific runtime information needed to use this package
   *
   * For example, C++ packages might use this to encode compiler/linker flags to ensure the package
   * headers can be included.
   */
  runtime: RuntimeOptionsSchema.optional(),
});

export type BaseRuntime = z.infer<typeof BaseRuntimeSchema>;
export type CppRuntime = z.infer<typeof CppRuntimeSchema>;
export type PythonRuntime = z.infer<typeof PythonRuntimeSchema>;
export type RuntimeOptions = z.infer<typeof RuntimeOptionsSchema>;
export type PackageMeta = z.infer<typeof PackageMetaSchema>;
