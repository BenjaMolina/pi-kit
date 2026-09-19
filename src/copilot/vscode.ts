import { mkdir, readFile, rename, unlink, writeFile } from "node:fs/promises";
import { homedir as defaultHomedir } from "node:os";
import { dirname, isAbsolute, join } from "node:path";
import { discoverCLIProxyModels, type CLIProxyFetch } from "../cliproxyapi/discovery";
import { resolveCLIProxyBaseUrl, type CLIProxyModel } from "../cliproxyapi/models";

const MANAGED_PROVIDER_NAME = "pi-kit CLIProxyAPI";
const API_KEY_REFERENCE = "${input:pi-kit-cliproxyapi-api-key}";

export type VSCodeFileSystem = {
  mkdir: typeof mkdir;
  readFile: typeof readFile;
  rename: typeof rename;
  unlink: typeof unlink;
  writeFile: typeof writeFile;
};

const defaultFileSystem: VSCodeFileSystem = { mkdir, readFile, rename, unlink, writeFile };

export type VSCodeOptions = {
  env?: Record<string, string | undefined>;
  fetch?: CLIProxyFetch;
  fileSystem?: VSCodeFileSystem;
  homedir?: () => string;
  platform?: NodeJS.Platform;
  vscodeConfigPath?: string;
};

export type VSCodeConfigResult = {
  path: string;
  changed: boolean;
  modelCount: number;
};

export type VSCodeConfigStatus = {
  path: string;
  state: "not installed" | "managed" | "invalid or unsafe";
  modelCount: number;
};

type VSCodeProvider = Record<string, unknown>;

type ParsedVSCodeConfig =
  | { kind: "array"; providers: VSCodeProvider[] }
  | { kind: "object"; config: Record<string, unknown>; providers: VSCodeProvider[] };

/**
 * Resolves VS Code's user-level Custom Endpoint file. This deliberately never
 * considers workspace configuration: Custom Endpoints are installed only in
 * the user's Code/User directory.
 */
export function resolveVSCodeConfigPath(options: VSCodeOptions = {}): string {
  const env = options.env ?? process.env;
  const configured = options.vscodeConfigPath?.trim() || env.PI_KIT_COPILOT_VSCODE_PATH?.trim();
  if (configured) {
    if (!isAbsolute(configured)) throw new Error("PI_KIT_COPILOT_VSCODE_PATH must be an absolute path.");
    return configured;
  }

  const home = (options.homedir ?? defaultHomedir)();
  const platform = options.platform ?? process.platform;
  if (platform === "win32") {
    // APPDATA is Windows' canonical user configuration root. Falling back to
    // the home directory keeps the resolver testable and avoids a workspace
    // path when a constrained process does not expose APPDATA.
    return join(env.APPDATA?.trim() || join(home, "AppData", "Roaming"), "Code", "User", "chatLanguageModels.json");
  }
  if (platform === "darwin") return join(home, "Library", "Application Support", "Code", "User", "chatLanguageModels.json");
  return join(env.XDG_CONFIG_HOME?.trim() || join(home, ".config"), "Code", "User", "chatLanguageModels.json");
}

export async function syncVSCodeCLIProxyAPI(options: VSCodeOptions = {}): Promise<VSCodeConfigResult> {
  const env = options.env ?? process.env;
  const models = await discoverModels(options);
  const path = resolveVSCodeConfigPath(options);
  const original = await readConfig(path, options);
  const parsed = parseConfig(original, path);
  const managedIndex = managedProviderIndex(parsed.providers, path);
  const provider = managedProvider(models, resolveCLIProxyBaseUrl(env.CLIPROXYAPI_BASE_URL));
  const nextProviders = managedIndex === undefined
    ? [...parsed.providers, provider]
    : parsed.providers.map((current, index) => index === managedIndex ? provider : current);
  const content = serializeConfig(parsed, nextProviders);

  if (content !== original) await replaceAtomically(path, content, options);
  return { path, changed: content !== original, modelCount: models.length };
}

export async function uninstallVSCodeCLIProxyAPI(options: VSCodeOptions = {}): Promise<VSCodeConfigResult> {
  const path = resolveVSCodeConfigPath(options);
  const original = await readConfig(path, options);
  if (original === undefined) return { path, changed: false, modelCount: 0 };

  const parsed = parseConfig(original, path);
  const managedIndex = managedProviderIndex(parsed.providers, path);
  if (managedIndex === undefined) return { path, changed: false, modelCount: 0 };

  const removed = parsed.providers[managedIndex] as VSCodeProvider;
  const modelCount = Array.isArray(removed.models) ? removed.models.length : 0;
  const nextProviders = parsed.providers.filter((_, index) => index !== managedIndex);
  const content = serializeConfig(parsed, nextProviders);
  await replaceAtomically(path, content, options);
  return { path, changed: true, modelCount };
}

export async function vscodeConfigStatus(options: VSCodeOptions = {}): Promise<VSCodeConfigStatus> {
  const path = resolveVSCodeConfigPath(options);
  try {
    const original = await readConfig(path, options);
    if (original === undefined) return { path, state: "not installed", modelCount: 0 };
    const parsed = parseConfig(original, path);
    const index = managedProviderIndex(parsed.providers, path);
    if (index === undefined) return { path, state: "not installed", modelCount: 0 };
    const provider = parsed.providers[index] as VSCodeProvider;
    return { path, state: "managed", modelCount: Array.isArray(provider.models) ? provider.models.length : 0 };
  } catch {
    return { path, state: "invalid or unsafe", modelCount: 0 };
  }
}

async function discoverModels(options: VSCodeOptions): Promise<CLIProxyModel[]> {
  const env = options.env ?? process.env;
  const apiKey = env.CLIPROXYAPI_API_KEY?.trim();
  if (!apiKey) throw new Error("CLIPROXYAPI_API_KEY is required.");
  return discoverCLIProxyModels({
    baseUrl: resolveCLIProxyBaseUrl(env.CLIPROXYAPI_BASE_URL),
    apiKey,
    fetch: options.fetch,
  });
}

function managedProvider(models: CLIProxyModel[], baseUrl: string): VSCodeProvider {
  return {
    name: MANAGED_PROVIDER_NAME,
    vendor: "customendpoint",
    apiKey: API_KEY_REFERENCE,
    apiType: "responses",
    models: models.map((model) => ({
      id: model.id,
      name: model.displayName,
      url: `${baseUrl}/responses`,
      toolCalling: true,
      vision: model.input.includes("image"),
      maxInputTokens: Math.max(1, model.contextWindow - model.maxTokens),
      maxOutputTokens: model.maxTokens,
      contextWindow: model.contextWindow,
      ...(model.reasoning ? {
        thinking: true,
        supportsReasoningEffort: model.reasoningLevels.length > 0
          ? model.reasoningLevels
          : ["low", "medium", "high"],
        reasoningEffortFormat: "openai",
      } : {}),
    })),
  };
}

async function readConfig(path: string, options: VSCodeOptions): Promise<string | undefined> {
  try {
    return await (options.fileSystem ?? defaultFileSystem).readFile(path, "utf8");
  } catch (error) {
    if (isNotFound(error)) return undefined;
    throw error;
  }
}

function parseConfig(content: string | undefined, path: string): ParsedVSCodeConfig {
  if (content === undefined || !content.trim()) return { kind: "array", providers: [] };
  let parsed: unknown;
  try {
    parsed = JSON.parse(content);
  } catch {
    throw new Error(`VS Code Custom Endpoint config is not valid JSON: ${path}`);
  }

  if (Array.isArray(parsed)) {
    if (!parsed.every(isRecord)) {
      throw new Error(`VS Code Custom Endpoint config array entries must be objects: ${path}`);
    }
    return { kind: "array", providers: parsed };
  }

  if (isRecord(parsed)) {
    if (parsed.providers === undefined) {
      return { kind: "object", config: parsed, providers: [] };
    }
    if (!Array.isArray(parsed.providers)) {
      throw new Error(`VS Code Custom Endpoint config providers must be an array: ${path}`);
    }
    if (!parsed.providers.every(isRecord)) {
      throw new Error(`VS Code Custom Endpoint config providers must contain objects: ${path}`);
    }
    return { kind: "object", config: parsed, providers: parsed.providers };
  }

  throw new Error(`VS Code Custom Endpoint config must be a JSON array or object: ${path}`);
}

function serializeConfig(parsed: ParsedVSCodeConfig, nextProviders: VSCodeProvider[]): string {
  if (parsed.kind === "array") {
    return `${JSON.stringify(nextProviders, null, 2)}\n`;
  }
  const next = { ...parsed.config, providers: nextProviders };
  return `${JSON.stringify(next, null, 2)}\n`;
}

function managedProviderIndex(providers: VSCodeProvider[], path: string): number | undefined {
  const named = providers.filter((provider) => provider.name === MANAGED_PROVIDER_NAME);
  if (named.length > 1) throw new Error(`VS Code Custom Endpoint config has duplicate ${MANAGED_PROVIDER_NAME} providers: ${path}`);
  if (named.length === 0) return undefined;

  const provider = named[0];
  if (provider.vendor !== "customendpoint" || provider.apiType !== "responses") {
    throw new Error(`VS Code Custom Endpoint config has an ambiguous ${MANAGED_PROVIDER_NAME} provider: ${path}`);
  }
  return providers.indexOf(provider);
}

async function replaceAtomically(path: string, content: string, options: VSCodeOptions): Promise<void> {
  const fileSystem = options.fileSystem ?? defaultFileSystem;
  await fileSystem.mkdir(dirname(path), { recursive: true });
  const temporary = `${path}.${process.pid}.${Date.now()}.tmp`;
  try {
    await fileSystem.writeFile(temporary, content, { encoding: "utf8", mode: 0o600 });
    await fileSystem.rename(temporary, path);
  } catch (error) {
    await fileSystem.unlink(temporary).catch(() => undefined);
    throw error;
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function isNotFound(error: unknown): boolean {
  return Boolean(error && typeof error === "object" && "code" in error && error.code === "ENOENT");
}
