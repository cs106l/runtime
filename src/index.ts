export enum Language {
  Cpp = "cpp",
  Python = "python",
}

export enum RunStatus {
  Installing = "Installing",
  Compiling = "Compiling",
  Linking = "Linking",
  Running = "Running",
}

export * from "./execution";
export * from "./packages";
