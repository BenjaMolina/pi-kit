import { mkdir, open, readFile, rename } from "node:fs/promises";
import { homedir as systemHomedir } from "node:os";
import { dirname, isAbsolute, join } from "node:path";
import { parse } from "@iarna/toml";
import { resolveCLIProxyBaseUrl } from "../cliproxyapi/models";

export const DEFAULT_CODEX_MODEL = "gpt-5.5";
const ROOT_START = "# >>> pi-kit Codex CLIProxyAPI v1 root >>>";
const ROOT_END = "# <<< pi-kit Codex CLIProxyAPI v1 root <<<";
const PROVIDER_START = "# >>> pi-kit Codex CLIProxyAPI v1 provider >>>";
const PROVIDER_END = "# <<< pi-kit Codex CLIProxyAPI v1 provider <<<";

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
  selection: "managed CLIProxyAPI" | "OpenAI default" | "user selected";
  provider: "managed registered" | "user registered" | "not registered";
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

export async function installCodexCLIProxyAPI(options: CodexConfigOptions = {}): Promise<CodexConfigResult> {
  const path = codexConfigPath(options);
  const original = await readConfig(path);
  const blocks = validateManagedBlocks(original);
  const parsed = validateToml(original, path);
  const existingProvider = providerFromParsedToml(parsed);
  const env = options.env ?? process.env;
  const baseUrl = configBaseUrl(resolveCLIProxyBaseUrl(env.CLIPROXYAPI_BASE_URL));

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
  return installCodexCLIProxyAPI(options);
}

export async function deactivateCodexCLIProxyAPI(options: CodexConfigOptions = {}): Promise<CodexConfigResult> {
  const path = codexConfigPath(options);
  const original = await readConfig(path);
  const blocks = validateManagedBlocks(original);
  validateToml(original, path);
  if (!blocks.root) {
    return { path, changed: false, managedRoot: false, managedProvider: Boolean(blocks.provider) };
  }
  assertRootBlock(blocks.root);
  if (blocks.provider) assertProviderBlock(blocks.provider);

  const next = original.slice(0, blocks.root.start) + original.slice(blocks.root.end);
  validateToml(next, path);
  await replaceAtomically(path, original, next);
  return { path, changed: true, managedRoot: true, managedProvider: Boolean(blocks.provider) };
}

export async function getCodexCLIProxyAPIStatus(options: CodexConfigOptions = {}): Promise<CodexCLIProxyAPIStatus> {
  const { path, content, blocks } = await readCodexConfig(options);
  const parsed = validateToml(content, path);
  if (blocks.root) assertRootBlock(blocks.root);
  if (blocks.provider) assertProviderBlock(blocks.provider);

  return {
    path,
    selection: blocks.root ? "managed CLIProxyAPI" : hasUserModelSelection(parsed) ? "user selected" : "OpenAI default",
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

  const removable = [blocks.root, blocks.provider].filter((block): block is Block => Boolean(block))
    .sort((left, right) => right.start - left.start);
  let next = original;
  for (const block of removable) next = next.slice(0, block.start) + next.slice(block.end);

  if (next === original) return { path, changed: false, managedRoot: Boolean(blocks.root), managedProvider: Boolean(blocks.provider) };
  validateToml(next, path);
  await replaceAtomically(path, original, next);
  return { path, changed: true, managedRoot: Boolean(blocks.root), managedProvider: Boolean(blocks.provider) };
}

export async function readCodexConfig(options: CodexConfigOptions = {}): Promise<{ path: string; content: string; blocks: ManagedBlocks }> {
  const path = codexConfigPath(options);
  const content = await readConfig(path);
  const blocks = validateManagedBlocks(content);
  validateToml(content, path);
  return { path, content, blocks };
}

function rootBlock(newline: string): string {
  return [ROOT_START, `model = "${DEFAULT_CODEX_MODEL}"`, 'model_provider = "cliproxyapi"', ROOT_END].join(newline);
}

function providerBlock(newline: string, baseUrl: string): string {
  return [
    PROVIDER_START,
    "[model_providers.cliproxyapi]",
    'name = "CLIProxyAPI"',
    `base_url = "${escapeTomlString(baseUrl)}"`,
    'env_key = "CLIPROXYAPI_API_KEY"',
    'wire_api = "responses"',
    PROVIDER_END,
  ].join(newline);
}

function configBaseUrl(value: string): string {
  try {
    const url = new URL(value);
    url.username = "";
    url.password = "";
    url.search = "";
    url.hash = "";
    return url.toString().replace(/\/$/, "");
  } catch {
    throw new Error("CLIPROXYAPI_BASE_URL must be an absolute URL.");
  }
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

function hasUserModelSelection(parsed: Record<string, unknown>): boolean {
  return Object.prototype.hasOwnProperty.call(parsed, "model")
    || Object.prototype.hasOwnProperty.call(parsed, "model_provider");
}

function validateManagedBlocks(content: string): ManagedBlocks {
  const root = findUniqueBlock(content, ROOT_START, ROOT_END, "root");
  const provider = findUniqueBlock(content, PROVIDER_START, PROVIDER_END, "provider");
  if (root && provider && root.start > provider.start) {
    throw new Error("Managed Codex CLIProxyAPI markers are crossed.");
  }
  if (root && root.start !== (content.startsWith("\uFEFF") ? 1 : 0)) {
    throw new Error("Managed Codex CLIProxyAPI root block is not at the document start.");
  }
  if (provider && provider.end !== content.length) {
    throw new Error("Managed Codex CLIProxyAPI provider block is not at the document end.");
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
  if (block.content !== rootBlock(newline) && block.content !== rootBlock(newline) + newline) {
    throw new Error("Managed Codex CLIProxyAPI root block has been modified; refusing to continue.");
  }
}

function assertProviderBlock(block: Block, baseUrl?: string): void {
  const newline = newlineFor(block.content);
  const expected = baseUrl ? providerBlock(newline, baseUrl) : providerBlock(newline, extractManagedBaseUrl(block.content));
  if (block.content !== expected && block.content !== expected + newline) {
    throw new Error("Managed Codex CLIProxyAPI provider block has been modified; refusing to continue.");
  }
}

function extractManagedBaseUrl(content: string): string {
  const match = /^base_url = "((?:[^"\\]|\\.)*)"$/m.exec(content);
  if (!match) throw new Error("Managed Codex CLIProxyAPI provider block has been modified; refusing to continue.");
  return match[1].replace(/\\"/g, '"').replace(/\\\\/g, "\\");
}

async function readConfig(path: string): Promise<string> {
  try {
    return await readFile(path, "utf8");
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return "";
    throw error;
  }
}

async function replaceAtomically(path: string, expected: string, next: string): Promise<void> {
  await mkdir(dirname(path), { recursive: true });
  const current = await readConfig(path);
  if (current !== expected) throw new Error("Codex config changed concurrently; refusing to overwrite it.");

  const tempPath = join(dirname(path), `.${path.split(/[\\/]/).pop()}.pi-kit-${process.pid}-${Date.now()}.tmp`);
  let handle: Awaited<ReturnType<typeof open>> | undefined;
  try {
    handle = await open(tempPath, "wx", 0o600);
    await handle.writeFile(next, "utf8");
    await handle.sync();
    await handle.close();
    handle = undefined;
    if (await readConfig(path) !== expected) throw new Error("Codex config changed concurrently; refusing to overwrite it.");
    await rename(tempPath, path);
  } finally {
    await handle?.close().catch(() => undefined);
  }
}
