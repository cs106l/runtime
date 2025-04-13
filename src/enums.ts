/**
 * An enumeration of runnable languages.
 * 
 * The string value of each of these is the same as that language's file extension.
 * For example, the value of `Language.Python` is `"py"`.
 */
export enum Language {
  Cpp = "cpp",
  Python = "py",
}

export enum RunStatus {
  Installing = "Installing",
  Compiling = "Compiling",
  Linking = "Linking",
  Running = "Running",
}
