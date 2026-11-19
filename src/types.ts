export type ServerConfig = {
  type: "local" | "remote";
  command?: string[];
  cwd?: string;
  environment?: Record<string, string>;
  url?: string;
  headers?: Record<string, string>;
  oauth?: unknown;
  timeout?: unknown;
  codemode?: boolean;
  protocol?: string;
  pool?: boolean;
  disabled?: boolean;
  [key: string]: unknown;
};

export type InstallRecipe =
  | { kind: "bunx"; package: string; args?: string[] }
  | { kind: "npx"; package: string; args?: string[] }
  | { kind: "command"; command: string[] }
  | {
      kind: "git";
      repository: string;
      subdir?: string;
      install?: string[];
      build?: string[];
      entry: string;
    };

export type CatalogEntry = {
  description?: string;
  tags?: string[];
  install?: InstallRecipe;
  server: ServerConfig;
};

export type Profile = {
  description?: string;
  emoji?: string;
  servers: string[];
};

export type Store = {
  version: 1;
  lastProfile?: string;
  /** Absolute path of the real OpenCode binary, skipping the omcp wrapper. */
  opencodeBinary?: string;
  profiles: Record<string, Profile>;
  catalog: Record<string, CatalogEntry>;
};

export type RawConfig = {
  path: string;
  data: Record<string, unknown>;
  text: string;
};
