import { mkdir, readFile, rename, unlink, writeFile } from "node:fs/promises";
import { homedir as defaultHomedir } from "node:os";
import { dirname, join } from "node:path";

export type CopilotWireApi = "responses" | "completions";

export type CopilotState = {
  version: 1;
  modelId: string;
  wireApi: CopilotWireApi;
};

export type CopilotStateFileSystem = {
  mkdir: typeof mkdir;
  readFile: typeof readFile;
  rename: typeof rename;
  unlink: typeof unlink;
  writeFile: typeof writeFile;
};

const defaultFileSystem: CopilotStateFileSystem = { mkdir, readFile, rename, unlink, writeFile };

export type CopilotStateOptions = {
  env?: Record<string, string | undefined>;
  fileSystem?: CopilotStateFileSystem;
  homedir?: () => string;
  statePath?: string;
};

export function resolveCopilotStatePath(options: CopilotStateOptions = {}): string {
  if (options.statePath) return options.statePath;

  const env = options.env ?? process.env;
  if (env.PI_KIT_COPILOT_STATE_PATH?.trim()) return env.PI_KIT_COPILOT_STATE_PATH.trim();
  const home = (options.homedir ?? defaultHomedir)();
  const configHome = env.XDG_CONFIG_HOME?.trim()
    ?? (process.platform === "win32" ? env.APPDATA?.trim() : undefined)
    ?? join(home, ".config");
  return join(configHome, "pi-kit", "copilot.json");
}

export async function readCopilotState(options: CopilotStateOptions = {}): Promise<CopilotState | undefined> {
  const path = resolveCopilotStatePath(options);
  try {
    return parseState(await (options.fileSystem ?? defaultFileSystem).readFile(path, "utf8"), path);
  } catch (error) {
    if (isNotFound(error)) return undefined;
    throw error;
  }
}

export async function writeCopilotState(state: CopilotState, options: CopilotStateOptions = {}): Promise<string> {
  validateState(state, "state");
  const path = resolveCopilotStatePath(options);
  const fileSystem = options.fileSystem ?? defaultFileSystem;
  await fileSystem.mkdir(dirname(path), { recursive: true });

  // Rename makes a completed selection visible atomically. A failed write or
  // rename leaves the prior selection intact and removes the temporary file.
  const temporary = `${path}.${process.pid}.${Date.now()}.tmp`;
  try {
    await fileSystem.writeFile(temporary, `${JSON.stringify(state, null, 2)}\n`, { encoding: "utf8", mode: 0o600 });
    await fileSystem.rename(temporary, path);
  } catch (error) {
    await fileSystem.unlink(temporary).catch(() => undefined);
    throw error;
  }
  return path;
}

export function createCopilotState(modelId: string, wireApi: CopilotWireApi = "responses"): CopilotState {
  const state = { version: 1 as const, modelId: modelId.trim(), wireApi };
  validateState(state, "selection");
  return state;
}

function parseState(content: string, path: string): CopilotState {
  let parsed: unknown;
  try {
    parsed = JSON.parse(content);
  } catch {
    throw new Error(`Copilot state is not valid JSON: ${path}`);
  }
  validateState(parsed, `Copilot state at ${path}`);
  return parsed;
}

function validateState(value: unknown, label: string): asserts value is CopilotState {
  if (!value || typeof value !== "object") throw new Error(`${label} must be an object.`);
  const state = value as Partial<CopilotState>;
  if (state.version !== 1 || typeof state.modelId !== "string" || !state.modelId.trim()
    || (state.wireApi !== "responses" && state.wireApi !== "completions")) {
    throw new Error(`${label} is invalid.`);
  }
}

function isNotFound(error: unknown): boolean {
  return Boolean(error && typeof error === "object" && "code" in error && error.code === "ENOENT");
}
