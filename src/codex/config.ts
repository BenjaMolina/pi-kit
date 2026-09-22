import { mkdir, open, readFile, rename, unlink, writeFile } from "node:fs/promises";
import { homedir as systemHomedir } from "node:os";
import { dirname, isAbsolute, join } from "node:path";
import { parse } from "@iarna/toml";
import { resolveCLIProxyBaseUrl } from "../cliproxyapi/models";

export const DEFAULT_CODEX_MODEL = "gpt-5.5";
export const DEFAULT_9ROUTER_BASE_URL = "http://127.0.0.1:20128/v1";
export const DEFAULT_9ROUTER_CODEX_MODEL = "gpt-5.5";

const ROOT_START = "# >>> pi-kit Codex CLIProxyAPI v1 root >>>";
const ROOT_END = "# <<< pi-kit Codex CLIProxyAPI v1 root <<<";
const PROVIDER_START = "# >>> pi-kit Codex CLIProxyAPI v1 provider >>>";
const PROVIDER_END = "# <<< pi-kit Codex CLIProxyAPI v1 provider <<<";
const NINEROUTER_PROVIDER_START = "# >>> pi-kit Codex 9Router v1 provider >>>";
const NINEROUTER_PROVIDER_END = "# <<< pi-kit Codex 9Router v1 provider <<<";
const NINEROUTER_PROFILE_START = "# >>> pi-kit Codex 9Router v1 profile >>>";
const NINEROUTER_PROFILE_END = "# <<< pi-kit Codex 9Router v1 profile <<<";

export type CodexConfigOptions = {
  env?: Record<string, string | undefined>;
  homedir?: () => string;
};

export type CodexConfigResult = {
  path: string;
  changed: boolean;
  managedRoot: boolean;
  managedProvider: boolean;
};

export type CodexCLIProxyAPIStatus = {
  path: string;
  selection: "managed CLIProxyAPI" | "CLIProxyAPI" | "OpenAI default" | "user selected";
  provider: "managed registered" | "user registered" | "not registered";
};

export type CodexNineRouterResult = {
  configPath: string;
  profilePath: string;
  changed: boolean;
  managedProvider: boolean;
  managedProfile: boolean;
};

export type CodexNineRouterStatus = {
  configPath: string;
  profilePath: string;
  provider: "managed registered" | "user registered" | "not registered";
  profile: "managed profile" | "user profile" | "not installed";
  model?: string;
};

type ManagedBlocks = {
  root?: Block;
  provider?: Block;
};

type Block = {
  start: number;
  end: number;
  content: string;
};

export function resolveCodexHome(
  env: Record<string, string | undefined> = process.env,
  homedir: () => string = systemHomedir,
): string {
  const configured = env.CODEX_HOME?.trim();
  if (configured) {
    if (!isAbsolute(configured)) throw new Error("CODEX_HOME must be an absolute path.");
    return configured;
  }
  return join(homedir(), ".codex");
}

export function codexConfigPath(options: CodexConfigOptions = {}): string {
  return join(resolveCodexHome(options.env, options.homedir), "config.toml");
}

export function codexNineRouterProfilePath(options: CodexConfigOptions = {}): string {
  return join(resolveCodexHome(options.env, options.homedir), "9router.config.toml");
}

export async function installCodexCLIProxyAPI(options: CodexConfigOptions = {}): Promise<CodexConfigResult> {
  const path = codexConfigPath(options);
  const original = await readConfig(path);
  const blocks = validateManagedBlocks(original);
  const parsed = validateToml(original, path);
  const existingProvider = providerFromParsedToml(parsed);
  const baseUrl = managedBaseUrl(options);

  if (existingProvider && !blocks.provider) {
    throw new Error("model_providers.cliproxyapi already exists without pi-kit markers; refusing to overwrite it.");
  }

  let next = original;
  let managedRoot = Boolean(blocks.root);
  let managedProvider = Boolean(blocks.provider);

  if (blocks.root) {
    assertRootBlock(blocks.root);
  } else if (!hasUserModelSelection(parsed)) {
    next = prependRoot(next, rootBlock(newlineFor(next)));
    managedRoot = true;
  }

  const blocksAfterRoot = validateManagedBlocks(next);
  if (blocksAfterRoot.provider) {
    assertProviderBlock(blocksAfterRoot.provider, baseUrl);
  } else {
    next = appendProvider(next, providerBlock(newlineFor(next), baseUrl));
    managedProvider = true;
  }

  if (next === original) return { path, changed: false, managedRoot, managedProvider };
  validateToml(next, path);
  await replaceAtomically(path, original, next);
  return { path, changed: true, managedRoot, managedProvider };
}

export async function activateCodexCLIProxyAPI(options: CodexConfigOptions = {}): Promise<CodexConfigResult> {
  const path = codexConfigPath(options);
  const original = await readConfig(path);
  const blocks = validateManagedBlocks(original);
  const parsed = validateToml(original, path);
  const baseUrl = managedBaseUrl(options);
  if (blocks.provider) assertProviderBlock(blocks.provider, baseUrl);
  if (providerFromParsedToml(parsed) && !blocks.provider) {
    throw new Error("model_providers.cliproxyapi already exists without pi-kit markers; refusing to overwrite it.");
  }

  let next = original;
  if (blocks.root) {
    assertRootBlock(blocks.root);
  } else {
    const model = typeof parsed.model === "string" ? parsed.model : DEFAULT_CODEX_MODEL;
    next = prependRoot(removeRootSelections(next), rootBlock(newlineFor(next), model));
  }

  const blocksAfterRoot = validateManagedBlocks(next);
  const managedProvider = Boolean(blocksAfterRoot.provider);
  if (!blocksAfterRoot.provider) next = appendProvider(next, providerBlock(newlineFor(next), baseUrl));

  if (next === original) return { path, changed: false, managedRoot: true, managedProvider };
  validateToml(next, path);
  await replaceAtomically(path, original, next);
  return { path, changed: true, managedRoot: true, managedProvider: true };
}

export async function deactivateCodexCLIProxyAPI(options: CodexConfigOptions = {}): Promise<CodexConfigResult> {
  const path = codexConfigPath(options);
  const original = await readConfig(path);
  const blocks = validateManagedBlocks(original);
  validateToml(original, path);
  if (blocks.provider) assertProviderBlock(blocks.provider);
  if (blocks.root) assertRootBlock(blocks.root);

  let next = blocks.root ? original.slice(0, blocks.root.start) + original.slice(blocks.root.end) : original;
  const parsed = validateToml(next, path);
  if (blocks.root || hasUserModelSelection(parsed)) {
    next = removeRootSelections(next);
  }

  if (next === original) {
    return { path, changed: false, managedRoot: false, managedProvider: Boolean(blocks.provider) };
  }
  validateToml(next, path);
  await replaceAtomically(path, original, next);
  return { path, changed: true, managedRoot: false, managedProvider: Boolean(blocks.provider) };
}

export async function getCodexCLIProxyAPIStatus(options: CodexConfigOptions = {}): Promise<CodexCLIProxyAPIStatus> {
  const { path, content, blocks } = await readCodexConfig(options);
  const parsed = validateToml(content, path);
  if (blocks.root) assertRootBlock(blocks.root);
  if (blocks.provider) assertProviderBlock(blocks.provider);

  return {
    path,
    selection: blocks.root ? "managed CLIProxyAPI"
      : parsed.model_provider === "cliproxyapi" ? "CLIProxyAPI"
      : (!hasUserModelSelection(parsed) || parsed.model_provider === "openai") ? "OpenAI default"
      : "user selected",
    provider: blocks.provider ? "managed registered" : providerFromParsedToml(parsed) ? "user registered" : "not registered",
  };
}

export async function uninstallCodexCLIProxyAPI(options: CodexConfigOptions = {}): Promise<CodexConfigResult> {
  const path = codexConfigPath(options);
  const original = await readConfig(path);
  const blocks = validateManagedBlocks(original);
  validateToml(original, path);
  if (!blocks.root && !blocks.provider) {
    return { path, changed: false, managedRoot: false, managedProvider: false };
  }
  if (blocks.root) assertRootBlock(blocks.root);
  if (blocks.provider) assertProviderBlock(blocks.provider);

  let next = original;
  if (blocks.provider) {
    next = next.slice(0, blocks.provider.start)
      + providerInterleavedContent(blocks.provider, providerPrefix(blocks.provider, extractManagedBaseUrl(blocks.provider)))
      + next.slice(blocks.provider.end);
  }
  if (blocks.root) next = next.slice(0, blocks.root.start) + next.slice(blocks.root.end);

  if (next === original) return { path, changed: false, managedRoot: Boolean(blocks.root), managedProvider: Boolean(blocks.provider) };
  validateToml(next, path);
  await replaceAtomically(path, original, next);
  return { path, changed: true, managedRoot: Boolean(blocks.root), managedProvider: Boolean(blocks.provider) };
}

export async function installCodexNineRouter(options: CodexConfigOptions = {}): Promise<CodexNineRouterResult> {
  const configPath = codexConfigPath(options);
  const profilePath = codexNineRouterProfilePath(options);

  const configSnapshot = await snapshotFile(configPath);
  const profileSnapshot = await snapshotFile(profilePath);

  // 1. Prepare config.toml with managed 9Router provider
  const originalConfig = configSnapshot.content;
  const configBlock = validateNineRouterProviderBlock(originalConfig);
  const cliProxyBlocks = validateManagedBlocks(originalConfig);
  assertBlocksDoNotCross(configBlock, cliProxyBlocks.root);
  assertBlocksDoNotCross(configBlock, cliProxyBlocks.provider);

  const parsedConfig = validateToml(originalConfig, configPath);
  const existingProvider = nineRouterProviderFromParsedToml(parsedConfig);
  const baseUrl = managedNineRouterBaseUrl(options);

  if (existingProvider && !configBlock) {
    throw new Error("model_providers.9router already exists without pi-kit markers; refusing to overwrite it.");
  }

  let nextConfig = originalConfig;
  let managedProvider = Boolean(configBlock);

  if (configBlock) {
    assertNineRouterProviderBlock(configBlock, baseUrl);
  } else {
    nextConfig = appendProvider(nextConfig, nineRouterProviderBlock(newlineFor(nextConfig), baseUrl));
    managedProvider = true;
  }
  validateToml(nextConfig, configPath);

  // 2. Prepare 9router.config.toml with managed profile
  const originalProfile = profileSnapshot.content;
  let nextProfile = originalProfile;
  let managedProfile = false;

  if (originalProfile.trim().length > 0) {
    const profileBlock = validateNineRouterProfileBlock(originalProfile);
    validateToml(originalProfile, profilePath);
    if (!profileBlock) {
      throw new Error("9router profile already exists without pi-kit markers; refusing to overwrite it.");
    }
    assertNineRouterProfileBlock(profileBlock);
    managedProfile = true;
  } else {
    const model = options.env?.NINEROUTER_MODEL?.trim() || DEFAULT_9ROUTER_CODEX_MODEL;
    nextProfile = nineRouterProfileBlock(newlineFor(originalProfile), model);
    validateToml(nextProfile, profilePath);
    managedProfile = true;
  }

  let configChanged = false;
  let profileChanged = false;
  const rolledBack: FileSnapshot[] = [];

  try {
    if (nextConfig !== originalConfig) {
      await replaceAtomically(configPath, originalConfig, nextConfig);
      rolledBack.push(configSnapshot);
      configChanged = true;
    }

    if (nextProfile !== originalProfile) {
      await replaceAtomically(profilePath, originalProfile, nextProfile);
      rolledBack.push(profileSnapshot);
      profileChanged = true;
    }
  } catch (error) {
    await rollbackMutations(rolledBack, error);
  }

  return {
    configPath,
    profilePath,
    changed: configChanged || profileChanged,
    managedProvider,
    managedProfile,
  };
}

export async function uninstallCodexNineRouter(options: CodexConfigOptions = {}): Promise<CodexNineRouterResult> {
  const configPath = codexConfigPath(options);
  const profilePath = codexNineRouterProfilePath(options);

  const configSnapshot = await snapshotFile(configPath);
  const profileSnapshot = await snapshotFile(profilePath);

  // 1. Process config.toml
  const originalConfig = configSnapshot.content;
  const configBlock = validateNineRouterProviderBlock(originalConfig);
  validateToml(originalConfig, configPath);
  if (configBlock) assertNineRouterProviderBlock(configBlock);

  let nextConfig = originalConfig;
  if (configBlock) {
    nextConfig = nextConfig.slice(0, configBlock.start)
      + nineRouterProviderInterleavedContent(
        configBlock,
        nineRouterProviderPrefix(configBlock, extractManagedNineRouterBaseUrl(configBlock))
      )
      + nextConfig.slice(configBlock.end);
    validateToml(nextConfig, configPath);
  }

  // 2. Process 9router.config.toml
  const originalProfile = profileSnapshot.content;
  let profileAction: "none" | "remove" | "replace" = "none";
  let profileNext = originalProfile;

  if (originalProfile.trim().length > 0) {
    validateToml(originalProfile, profilePath);
    const profileBlock = validateNineRouterProfileBlock(originalProfile);
    if (profileBlock) {
      assertNineRouterProfileBlock(profileBlock);
      const remainder = originalProfile.slice(0, profileBlock.start) + originalProfile.slice(profileBlock.end);
      if (remainder.trim().length === 0) {
        profileAction = "remove";
      } else {
        validateToml(remainder, profilePath);
        profileNext = remainder;
        profileAction = "replace";
      }
    }
  }

  let configChanged = false;
  let profileChanged = false;
  const rolledBack: FileSnapshot[] = [];

  try {
    if (profileAction === "remove") {
      await removeFileIfPresent(profilePath, originalProfile);
      rolledBack.push(profileSnapshot);
      profileChanged = true;
    } else if (profileAction === "replace") {
      await replaceAtomically(profilePath, originalProfile, profileNext);
      rolledBack.push(profileSnapshot);
      profileChanged = true;
    }

    if (nextConfig !== originalConfig) {
      await replaceAtomically(configPath, originalConfig, nextConfig);
      rolledBack.push(configSnapshot);
      configChanged = true;
    }
  } catch (error) {
    await rollbackMutations(rolledBack, error);
  }

  return {
    configPath,
    profilePath,
    changed: configChanged || profileChanged,
    managedProvider: false,
    managedProfile: false,
  };
}

export async function getCodexNineRouterStatus(options: CodexConfigOptions = {}): Promise<CodexNineRouterStatus> {
  const configPath = codexConfigPath(options);
  const profilePath = codexNineRouterProfilePath(options);

  const configContent = await readConfig(configPath);
  const configBlock = validateNineRouterProviderBlock(configContent);
  const parsedConfig = validateToml(configContent, configPath);
  if (configBlock) assertNineRouterProviderBlock(configBlock);

  const provider: CodexNineRouterStatus["provider"] = configBlock
    ? "managed registered"
    : nineRouterProviderFromParsedToml(parsedConfig)
    ? "user registered"
    : "not registered";

  const profileContent = await readConfig(profilePath);
  let profile: CodexNineRouterStatus["profile"] = "not installed";
  let model: string | undefined;

  if (profileContent.trim().length > 0) {
    const parsedProfile = validateToml(profileContent, profilePath);
    const profileBlock = validateNineRouterProfileBlock(profileContent);
    if (profileBlock) {
      assertNineRouterProfileBlock(profileBlock);
      profile = "managed profile";
    } else {
      profile = "user profile";
    }
    if (typeof parsedProfile.model === "string") {
      model = parsedProfile.model;
    }
  }

  return {
    configPath,
    profilePath,
    provider,
    profile,
    model,
  };
}

export async function readCodexConfig(options: CodexConfigOptions = {}): Promise<{ path: string; content: string; blocks: ManagedBlocks }> {
  const path = codexConfigPath(options);
  const content = await readConfig(path);
  const blocks = validateManagedBlocks(content);
  validateToml(content, path);
  return { path, content, blocks };
}

function rootBlock(newline: string, model = DEFAULT_CODEX_MODEL): string {
  return [ROOT_START, `model = "${escapeTomlString(model)}"`, 'model_provider = "cliproxyapi"', ROOT_END].join(newline);
}

function providerBlock(newline: string, baseUrl: string): string {
  return [PROVIDER_START, providerPayload(newline, baseUrl), PROVIDER_END].join(newline);
}

function providerPayload(newline: string, baseUrl: string): string {
  return [
    "[model_providers.cliproxyapi]",
    'name = "CLIProxyAPI"',
    `base_url = "${escapeTomlString(baseUrl)}"`,
    'env_key = "CLIPROXYAPI_API_KEY"',
    'wire_api = "responses"',
  ].join(newline);
}

function managedBaseUrl(options: CodexConfigOptions): string {
  const env = options.env ?? process.env;
  return configBaseUrl(resolveCLIProxyBaseUrl(env.CLIPROXYAPI_BASE_URL), "CLIPROXYAPI_BASE_URL");
}

function managedNineRouterBaseUrl(options: CodexConfigOptions): string {
  const env = options.env ?? process.env;
  const raw = env.NINEROUTER_BASE_URL?.trim() || DEFAULT_9ROUTER_BASE_URL;
  return configBaseUrl(raw, "NINEROUTER_BASE_URL");
}

function configBaseUrl(value: string, envName = "CLIPROXYAPI_BASE_URL"): string {
  try {
    const url = new URL(value);
    url.username = "";
    url.password = "";
    url.search = "";
    url.hash = "";
    return url.toString().replace(/\/$/, "");
  } catch {
    throw new Error(`${envName} must be an absolute URL.`);
  }
}

function nineRouterProviderBlock(newline: string, baseUrl: string): string {
  return [NINEROUTER_PROVIDER_START, nineRouterProviderPayload(newline, baseUrl), NINEROUTER_PROVIDER_END].join(newline);
}

function nineRouterProviderPayload(newline: string, baseUrl: string): string {
  return [
    "[model_providers.9router]",
    'name = "9Router"',
    `base_url = "${escapeTomlString(baseUrl)}"`,
    'env_key = "NINEROUTER_API_KEY"',
    'wire_api = "responses"',
  ].join(newline);
}

function nineRouterProfileBlock(newline: string, model = DEFAULT_9ROUTER_CODEX_MODEL): string {
  return [
    NINEROUTER_PROFILE_START,
    `model = "${escapeTomlString(model)}"`,
    'model_provider = "9router"',
    NINEROUTER_PROFILE_END,
    "",
  ].join(newline);
}

function escapeTomlString(value: string): string {
  return value.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
}

function prependRoot(original: string, root: string): string {
  const bom = original.startsWith("\uFEFF") ? "\uFEFF" : "";
  const rest = bom ? original.slice(1) : original;
  const newline = newlineFor(original);
  return bom + root + (rest ? newline + rest : "");
}

function appendProvider(original: string, provider: string): string {
  if (!original) return provider;
  const newline = newlineFor(original);
  return original + (original.endsWith(newline) ? "" : newline) + provider;
}

function newlineFor(content: string): string {
  return content.includes("\r\n") ? "\r\n" : "\n";
}

function validateToml(content: string, path: string): Record<string, unknown> {
  if (!content) return {};
  try {
    return parse(content.startsWith("\uFEFF") ? content.slice(1) : content) as Record<string, unknown>;
  } catch (error) {
    const detail = error instanceof Error ? error.message : "unknown parse error";
    throw new Error(`Codex config is not valid TOML (${path}): ${detail}`);
  }
}

function providerFromParsedToml(parsed: Record<string, unknown>): boolean {
  const providers = parsed.model_providers;
  return Boolean(providers && typeof providers === "object" && !Array.isArray(providers)
    && Object.prototype.hasOwnProperty.call(providers, "cliproxyapi"));
}

function nineRouterProviderFromParsedToml(parsed: Record<string, unknown>): boolean {
  const providers = parsed.model_providers;
  return Boolean(providers && typeof providers === "object" && !Array.isArray(providers)
    && Object.prototype.hasOwnProperty.call(providers, "9router"));
}

function hasUserModelSelection(parsed: Record<string, unknown>): boolean {
  return Object.prototype.hasOwnProperty.call(parsed, "model")
    || Object.prototype.hasOwnProperty.call(parsed, "model_provider");
}

function removeRootSelections(content: string): string {
  let inRootTable = true;
  return content.split(/(?<=\n)/).filter((line) => {
    if (/^\uFEFF?[ \t]*\[/.test(line)) inRootTable = false;
    if (!inRootTable) return true;
    if (/^\uFEFF?[ \t]*model[ \t]*=/.test(line)) return false;
    if (/^\uFEFF?[ \t]*model_provider[ \t]*=/.test(line)) return false;
    return true;
  }).join("");
}

function validateManagedBlocks(content: string): ManagedBlocks {
  const root = findUniqueBlock(content, ROOT_START, ROOT_END, "root");
  const provider = findUniqueBlock(content, PROVIDER_START, PROVIDER_END, "provider");
  if (root && provider && root.end > provider.start) {
    throw new Error("Managed Codex CLIProxyAPI markers are crossed.");
  }
  if (root && root.start !== (content.startsWith("\uFEFF") ? 1 : 0)) {
    throw new Error("Managed Codex CLIProxyAPI root block is not at the document start.");
  }
  return { root, provider };
}

function findUniqueBlock(content: string, startMarker: string, endMarker: string, name: string): Block | undefined {
  const starts = markerOffsets(content, startMarker);
  const ends = markerOffsets(content, endMarker);
  if (starts.length === 0 && ends.length === 0) return undefined;
  if (starts.length !== 1 || ends.length !== 1 || ends[0] < starts[0]) {
    throw new Error(`Managed Codex CLIProxyAPI ${name} markers are malformed or duplicated.`);
  }
  const end = endOfLine(content, ends[0] + endMarker.length);
  const contentBlock = content.slice(starts[0], end);
  return { start: starts[0], end, content: contentBlock };
}

function markerOffsets(content: string, marker: string): number[] {
  const offsets: number[] = [];
  let start = 0;
  while (true) {
    const found = content.indexOf(marker, start);
    if (found === -1) return offsets;
    offsets.push(found);
    start = found + marker.length;
  }
}

function endOfLine(content: string, markerEnd: number): number {
  if (content.slice(markerEnd, markerEnd + 2) === "\r\n") return markerEnd + 2;
  if (content[markerEnd] === "\n") return markerEnd + 1;
  return markerEnd;
}

function assertRootBlock(block: Block): void {
  const newline = newlineFor(block.content);
  const terminal = block.content.endsWith(ROOT_END + newline) ? ROOT_END + newline : ROOT_END;
  if (!block.content.startsWith(ROOT_START + newline) || !block.content.endsWith(terminal)) {
    throw new Error("Managed Codex CLIProxyAPI root block has been modified; refusing to continue.");
  }
  try {
    const parsed = parse(block.content) as Record<string, unknown>;
    if (typeof parsed.model !== "string" || parsed.model_provider !== "cliproxyapi") {
      throw new Error("invalid managed root selection");
    }
  } catch {
    throw new Error("Managed Codex CLIProxyAPI root block has been modified; refusing to continue.");
  }
}

function assertProviderBlock(block: Block, baseUrl?: string): void {
  const managedBaseUrl = baseUrl ?? extractManagedBaseUrl(block);
  const prefix = providerPrefix(block, managedBaseUrl);
  if (!block.content.startsWith(prefix)) {
    throw new Error("Managed Codex CLIProxyAPI provider block has been modified; refusing to continue.");
  }
  providerInterleavedContent(block, prefix);
  const parsed = parse(block.content) as Record<string, unknown>;
  const provider = parsed.model_providers;
  const managedProvider = provider && typeof provider === "object" && !Array.isArray(provider)
    ? (provider as Record<string, unknown>).cliproxyapi
    : undefined;
  if (!isExactManagedProvider(managedProvider, managedBaseUrl)) {
    throw new Error("Managed Codex CLIProxyAPI provider block has been modified; refusing to continue.");
  }
}

function providerPrefix(block: Block, baseUrl: string): string {
  return [PROVIDER_START, providerPayload(newlineFor(block.content), baseUrl)].join(newlineFor(block.content));
}

function providerInterleavedContent(block: Block, prefix: string): string {
  const newline = newlineFor(block.content);
  const remainder = block.content.slice(prefix.length);
  const markerSuffix = `${newline}${PROVIDER_END}`;
  const terminal = remainder.endsWith(markerSuffix + newline) ? markerSuffix + newline
    : remainder.endsWith(markerSuffix) ? markerSuffix
    : undefined;
  if (!terminal) throw new Error("Managed Codex CLIProxyAPI provider block has been modified; refusing to continue.");
  if (remainder === terminal) return "";
  if (!remainder.startsWith(newline)) {
    throw new Error("Managed Codex CLIProxyAPI provider block has been modified; refusing to continue.");
  }
  const interleaved = remainder.slice(newline.length, -terminal.length);
  const firstTable = interleaved.search(/\S/);
  if (firstTable === -1 || interleaved[firstTable] !== "[") {
    throw new Error("Managed Codex CLIProxyAPI provider block has been modified; refusing to continue.");
  }
  return interleaved + newline;
}

function extractManagedBaseUrl(block: Block): string {
  const newline = newlineFor(block.content);
  const prefix = `${PROVIDER_START}${newline}[model_providers.cliproxyapi]${newline}name = "CLIProxyAPI"${newline}base_url = "`;
  if (!block.content.startsWith(prefix)) {
    throw new Error("Managed Codex CLIProxyAPI provider block has been modified; refusing to continue.");
  }
  const match = /^((?:[^"\\]|\\.)*)"/.exec(block.content.slice(prefix.length));
  if (!match) throw new Error("Managed Codex CLIProxyAPI provider block has been modified; refusing to continue.");
  return match[1].replace(/\\"/g, '"').replace(/\\\\/g, "\\");
}

function validateNineRouterProviderBlock(content: string): Block | undefined {
  return findUniqueBlock(content, NINEROUTER_PROVIDER_START, NINEROUTER_PROVIDER_END, "9Router provider");
}

function validateNineRouterProfileBlock(content: string): Block | undefined {
  return findUniqueBlock(content, NINEROUTER_PROFILE_START, NINEROUTER_PROFILE_END, "9Router profile");
}

function assertBlocksDoNotCross(a?: Block, b?: Block): void {
  if (!a || !b) return;
  if (a.start < b.end && b.start < a.end) {
    throw new Error("Managed Codex markers are crossed.");
  }
}

function assertNineRouterProviderBlock(block: Block, baseUrl?: string): void {
  const managedBaseUrl = baseUrl ?? extractManagedNineRouterBaseUrl(block);
  const prefix = nineRouterProviderPrefix(block, managedBaseUrl);
  if (!block.content.startsWith(prefix)) {
    throw new Error("Managed Codex 9Router provider block has been modified; refusing to continue.");
  }
  nineRouterProviderInterleavedContent(block, prefix);
  const parsed = parse(block.content) as Record<string, unknown>;
  const provider = parsed.model_providers;
  const managedProvider = provider && typeof provider === "object" && !Array.isArray(provider)
    ? (provider as Record<string, unknown>)["9router"]
    : undefined;
  if (!isExactManagedNineRouterProvider(managedProvider, managedBaseUrl)) {
    throw new Error("Managed Codex 9Router provider block has been modified; refusing to continue.");
  }
}

function nineRouterProviderPrefix(block: Block, baseUrl: string): string {
  return [NINEROUTER_PROVIDER_START, nineRouterProviderPayload(newlineFor(block.content), baseUrl)].join(newlineFor(block.content));
}

function nineRouterProviderInterleavedContent(block: Block, prefix: string): string {
  const newline = newlineFor(block.content);
  const remainder = block.content.slice(prefix.length);
  const markerSuffix = `${newline}${NINEROUTER_PROVIDER_END}`;
  const terminal = remainder.endsWith(markerSuffix + newline) ? markerSuffix + newline
    : remainder.endsWith(markerSuffix) ? markerSuffix
    : undefined;
  if (!terminal) throw new Error("Managed Codex 9Router provider block has been modified; refusing to continue.");
  if (remainder === terminal) return "";
  if (!remainder.startsWith(newline)) {
    throw new Error("Managed Codex 9Router provider block has been modified; refusing to continue.");
  }
  const interleaved = remainder.slice(newline.length, -terminal.length);
  const firstTable = interleaved.search(/\S/);
  if (firstTable === -1 || interleaved[firstTable] !== "[") {
    throw new Error("Managed Codex 9Router provider block has been modified; refusing to continue.");
  }
  return interleaved + newline;
}

function extractManagedNineRouterBaseUrl(block: Block): string {
  const newline = newlineFor(block.content);
  const prefix = `${NINEROUTER_PROVIDER_START}${newline}[model_providers.9router]${newline}name = "9Router"${newline}base_url = "`;
  if (!block.content.startsWith(prefix)) {
    throw new Error("Managed Codex 9Router provider block has been modified; refusing to continue.");
  }
  const match = /^((?:[^"\\]|\\.)*)"/.exec(block.content.slice(prefix.length));
  if (!match) throw new Error("Managed Codex 9Router provider block has been modified; refusing to continue.");
  return match[1].replace(/\\"/g, '"').replace(/\\\\/g, "\\");
}

function isExactManagedProvider(value: unknown, baseUrl: string): boolean {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const provider = value as Record<string, unknown>;
  const keys = Object.keys(provider).sort();
  return keys.length === 4
    && keys.every((key, index) => key === ["base_url", "env_key", "name", "wire_api"][index])
    && provider.name === "CLIProxyAPI"
    && provider.base_url === baseUrl
    && provider.env_key === "CLIPROXYAPI_API_KEY"
    && provider.wire_api === "responses";
}

function isExactManagedNineRouterProvider(value: unknown, baseUrl: string): boolean {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const provider = value as Record<string, unknown>;
  const keys = Object.keys(provider).sort();
  return keys.length === 4
    && keys.every((key, index) => key === ["base_url", "env_key", "name", "wire_api"][index])
    && provider.name === "9Router"
    && provider.base_url === baseUrl
    && provider.env_key === "NINEROUTER_API_KEY"
    && provider.wire_api === "responses";
}

function assertNineRouterProfileBlock(block: Block): void {
  const newline = newlineFor(block.content);
  const terminal = block.content.endsWith(NINEROUTER_PROFILE_END + newline)
    ? NINEROUTER_PROFILE_END + newline
    : NINEROUTER_PROFILE_END;
  if (!block.content.startsWith(NINEROUTER_PROFILE_START + newline) || !block.content.endsWith(terminal)) {
    throw new Error("Managed Codex 9Router profile block has been modified; refusing to continue.");
  }
  try {
    const parsed = parse(block.content) as Record<string, unknown>;
    if (typeof parsed.model !== "string" || parsed.model.length === 0 || parsed.model_provider !== "9router") {
      throw new Error("invalid managed 9router profile selection");
    }
  } catch {
    throw new Error("Managed Codex 9Router profile block has been modified; refusing to continue.");
  }
}

async function removeFileIfPresent(path: string, expectedContent?: string): Promise<void> {
  try {
    if (expectedContent !== undefined) {
      const current = await readConfig(path);
      if (current !== expectedContent) {
        throw new Error("Codex 9router profile changed concurrently; refusing to overwrite it.");
      }
    }
    await unlink(path);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return;
    throw error;
  }
}

async function readConfig(path: string): Promise<string> {
  try {
    return await readFile(path, "utf8");
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return "";
    throw error;
  }
}

type FileSnapshot = {
  path: string;
  exists: boolean;
  content: string;
};

async function snapshotFile(path: string): Promise<FileSnapshot> {
  try {
    const content = await readFile(path, "utf8");
    return { path, exists: true, content };
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      return { path, exists: false, content: "" };
    }
    throw error;
  }
}

async function restoreFileSnapshot(snapshot: FileSnapshot): Promise<void> {
  if (snapshot.exists) {
    await mkdir(dirname(snapshot.path), { recursive: true });
    await writeFile(snapshot.path, snapshot.content, "utf8");
  } else {
    try {
      await unlink(snapshot.path);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") {
        throw error;
      }
    }
  }
}

async function rollbackMutations(snapshots: FileSnapshot[], primaryError: unknown): Promise<never> {
  const rollbackErrors: unknown[] = [];
  for (let i = snapshots.length - 1; i >= 0; i--) {
    const snapshot = snapshots[i];
    try {
      await restoreFileSnapshot(snapshot);
    } catch (err) {
      rollbackErrors.push(err);
    }
  }

  if (rollbackErrors.length > 0) {
    const primaryMsg = primaryError instanceof Error ? primaryError.message : String(primaryError);
    const rollbackMsgs = rollbackErrors.map((e) => (e instanceof Error ? e.message : String(e))).join("; ");
    const combinedError = new Error(`${primaryMsg}; rollback failed: ${rollbackMsgs}`, {
      cause: primaryError,
    });
    throw combinedError;
  }

  throw primaryError;
}

export async function replaceAtomically(path: string, expected: string, next: string): Promise<void> {
  await mkdir(dirname(path), { recursive: true });
  const current = await readConfig(path);
  if (current !== expected) throw new Error("Codex config changed concurrently; refusing to overwrite it.");

  const tempPath = join(dirname(path), `.${path.split(/[\\/]/).pop()}.pi-kit-${process.pid}-${Date.now()}.tmp`);
  let handle: Awaited<ReturnType<typeof open>> | undefined;
  let renamed = false;
  try {
    handle = await open(tempPath, "wx", 0o600);
    await handle.writeFile(next, "utf8");
    await handle.sync();
    await handle.close();
    handle = undefined;
    if (await readConfig(path) !== expected) throw new Error("Codex config changed concurrently; refusing to overwrite it.");
    await rename(tempPath, path);
    renamed = true;
  } finally {
    await handle?.close().catch(() => undefined);
    if (!renamed) {
      await unlink(tempPath).catch(() => undefined);
    }
  }
}
