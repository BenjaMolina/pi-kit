import type { CLIProxyFetch } from "./discovery";
import { resolveCLIProxyBaseUrl } from "./models";

export const ANTIGRAVITY_PROMPT_REPAIR_ENV = "PI_KIT_ANTIGRAVITY_PROMPT_REPAIR";

const PI_IDENTITY_ORIGINAL = "operating inside pi, a coding agent harness";
const PI_IDENTITY_REPLACEMENT = "working on software projects";

const DEFAULT_TOPICS = [
  "extensions.md",
  "examples/extensions/",
  "themes.md",
  "skills.md",
  "prompt-templates.md",
  "tui.md",
  "keybindings.md",
  "sdk.md",
  "custom-provider.md",
  "models.md",
  "packages.md",
  "environment-variables.md",
];

const PI_DOCS_EXACT_BLOCK_REGEX =
  /Pi documentation \(read only when the user asks about pi itself, its SDK, extensions, themes, skills, or TUI\):(\r?\n)- Main documentation: ([^\r\n]+)\r?\n- Additional docs: ([^\r\n]+)\r?\n- Examples: ([^\r\n]+?) \(extensions, custom tools, SDK\)\r?\n- When reading pi docs or examples, resolve docs\/\.\.\. under Additional docs and examples\/\.\.\. under Examples, not the current working directory\r?\n- When asked about: ([^\r\n]+)\r?\n- When working on pi topics, read the docs and examples, and follow \.md cross-references before implementing\r?\n- Always read pi \.md files completely and follow links to related docs \(e\.g\., tui\.md for TUI API details\)/g;

const PI_DOCS_XML_FALLBACK_REGEX =
  /<docs>(\r?\n)Pi documentation \(read only when the user asks about pi itself[\s\S]*?\r?\n<\/docs>/g;

export type AntigravityPromptRepairOptions = {
  env?: Record<string, string | undefined>;
  fetch?: CLIProxyFetch;
};

export type ProviderModelRef = {
  provider: string;
  id: string;
};

function extractTopics(source: string): string[] {
  const matches = source.match(/(?:docs|examples)\/[A-Za-z0-9._/-]+/g);
  if (!matches || matches.length === 0) return DEFAULT_TOPICS;
  const seen = new Set<string>();
  const topics: string[] = [];
  for (const raw of matches) {
    const cleaned = raw.replace(/[),.;]+$/, "");
    if (!cleaned || cleaned.includes("...")) continue;
    const normalized = cleaned.startsWith("docs/") ? cleaned.slice("docs/".length) : cleaned;
    if (normalized && !seen.has(normalized)) {
      seen.add(normalized);
      topics.push(normalized);
    }
  }
  return topics.length > 0 ? topics : DEFAULT_TOPICS;
}

function buildNeutralDocsBlock(
  newline: string,
  readmePath: string,
  docsPath: string,
  examplesPath: string,
  topics: string[],
): string {
  return [
    "Local runtime reference paths (consult only when asked about local runtime packages, extensions, themes, skills, or TUI):",
    `- Main reference: ${readmePath}`,
    `- Docs directory: ${docsPath}`,
    `- Examples directory: ${examplesPath}`,
    "- Resolve relative doc/example paths under Docs directory and Examples directory rather than the working directory.",
    `- Topic index: ${topics.join(", ")}.`,
    "- Read the relevant markdown file completely and follow related markdown links before implementing changes to those topics.",
  ].join(newline);
}

/**
 * Rewrites Pi's competing-client harness boilerplate in system instructions so
 * Antigravity backends do not reject requests with prompt-dependent HTTP 429,
 * while preserving all local documentation paths and topic file references.
 */
export function sanitizePiPromptForAntigravity(text: string): string {
  let out = text.replaceAll(PI_IDENTITY_ORIGINAL, PI_IDENTITY_REPLACEMENT);

  out = out.replace(
    PI_DOCS_EXACT_BLOCK_REGEX,
    (_match, newline: string, readmePath: string, docsPath: string, examplesPath: string, askedLine: string) =>
      buildNeutralDocsBlock(newline, readmePath, docsPath, examplesPath, extractTopics(askedLine)),
  );

  out = out.replace(PI_DOCS_XML_FALLBACK_REGEX, (block, newline: string) => {
    const readme = block.match(/- Main documentation: ([^\r\n]+)/)?.[1];
    const docs = block.match(/- Additional docs: ([^\r\n]+)/)?.[1];
    const examples = block.match(/- Examples: ([^\r\n]+?)(?: \(extensions, custom tools, SDK\))?(?:\r?\n|$)/)?.[1];
    if (!readme || !docs || !examples) return block;
    const inner = buildNeutralDocsBlock(newline, readme, docs, examples, extractTopics(block));
    return `<docs>${newline}${inner}${newline}</docs>`;
  });

  return out;
}

export function isAntigravityPromptRepairEnabled(
  env: Record<string, string | undefined> = process.env,
): boolean {
  const raw = env[ANTIGRAVITY_PROMPT_REPAIR_ENV]?.trim();
  if (!raw) return true;
  return !/^(0|false|no|off)$/i.test(raw);
}

function isOfflineEnv(env: Record<string, string | undefined>): boolean {
  return /^(1|true|yes)$/i.test(env.PI_OFFLINE?.trim() ?? "");
}

/**
 * Synchronous classification for clear model IDs:
 * - `true`: definitely routed to Antigravity
 * - `false`: definitely NOT routed to Antigravity
 * - `"ambiguous"`: unscoped `cliproxyapi` ID (e.g. `claude-sonnet-4-6`) requiring `/v1/models` `owned_by`
 */
export function classifyAntigravityModelSync(
  provider: string | undefined,
  modelId: string | undefined,
): boolean | "ambiguous" {
  const normalizedProvider = provider?.trim().toLowerCase();
  const id = modelId?.trim() ?? "";
  if (!normalizedProvider || !id) return false;

  if (normalizedProvider === "9router") {
    return /^(?:ag|antigravity)\//i.test(id);
  }

  if (normalizedProvider !== "cliproxyapi") {
    return false;
  }

  if (id.includes("/")) {
    if (/^(?:agy|ag|antigravity)(?:[-_][^/]*)?\//i.test(id)) return true;
    return false;
  }

  if (/^(?:gemini-|gpt-oss-)/i.test(id)) return true;
  if (/^(?:gpt-(?!oss-)|o[134](?:$|-)|codex)/i.test(id)) return false;

  return "ambiguous";
}

function sanitizeMessageContent(content: unknown): { value: unknown; changed: boolean } {
  if (typeof content === "string") {
    const updated = sanitizePiPromptForAntigravity(content);
    return { value: updated, changed: updated !== content };
  }

  if (!Array.isArray(content)) {
    return { value: content, changed: false };
  }

  let changed = false;
  const nextParts = content.map((part) => {
    if (
      typeof part === "object"
      && part !== null
      && (part as { type?: unknown }).type === "text"
      && typeof (part as { text?: unknown }).text === "string"
    ) {
      const originalText = (part as { text: string }).text;
      const updatedText = sanitizePiPromptForAntigravity(originalText);
      if (updatedText !== originalText) {
        changed = true;
        return { ...(part as Record<string, unknown>), text: updatedText };
      }
    }
    return part;
  });

  return { value: changed ? nextParts : content, changed };
}

/**
 * Sanitizes only `system` and `developer` messages in an OpenAI Chat Completions
 * payload. Returns `undefined` when no change is needed or payload shape is unrecognized.
 */
export function sanitizeOpenAICompletionsPayload(payload: unknown): Record<string, unknown> | undefined {
  if (typeof payload !== "object" || payload === null || Array.isArray(payload)) {
    return undefined;
  }

  const record = payload as Record<string, unknown>;
  if (!Array.isArray(record.messages)) {
    return undefined;
  }

  let changed = false;
  const nextMessages = record.messages.map((message) => {
    if (typeof message !== "object" || message === null || Array.isArray(message)) {
      return message;
    }
    const msgRecord = message as Record<string, unknown>;
    if (msgRecord.role !== "system" && msgRecord.role !== "developer") {
      return message;
    }
    const sanitized = sanitizeMessageContent(msgRecord.content);
    if (!sanitized.changed) {
      return message;
    }
    changed = true;
    return { ...msgRecord, content: sanitized.value };
  });

  if (!changed) return undefined;
  return { ...record, messages: nextMessages };
}

export function createAntigravityRequestRepairHandler(options: AntigravityPromptRepairOptions = {}) {
  const getEnv = () => options.env ?? process.env;
  const fetchImpl: CLIProxyFetch = options.fetch ?? globalThis.fetch;
  let cachedOwners: Map<string, string> | undefined;
  let pendingLookup: Promise<Map<string, string> | undefined> | undefined;

  async function resolveCLIProxyOwners(env: Record<string, string | undefined>): Promise<Map<string, string> | undefined> {
    if (cachedOwners) return cachedOwners;
    if (pendingLookup) return pendingLookup;

    const apiKey = env.CLIPROXYAPI_API_KEY?.trim();
    if (!apiKey || isOfflineEnv(env)) return undefined;

    pendingLookup = (async () => {
      try {
        const baseUrl = resolveCLIProxyBaseUrl(env.CLIPROXYAPI_BASE_URL);
        const response = await fetchImpl(`${baseUrl}/models`, {
          headers: { Authorization: `Bearer ${apiKey}` },
          signal: AbortSignal.timeout(2_000),
        });
        if (!response.ok) return undefined;
        const body = (await response.json()) as { data?: Array<{ id?: unknown; owned_by?: unknown }> };
        if (!Array.isArray(body.data)) return undefined;
        const map = new Map<string, string>();
        for (const item of body.data) {
          if (typeof item?.id === "string" && typeof item?.owned_by === "string") {
            const id = item.id.trim();
            const owner = item.owned_by.trim().toLowerCase();
            if (id && owner) map.set(id, owner);
          }
        }
        cachedOwners = map;
        return map;
      } catch {
        return undefined;
      } finally {
        pendingLookup = undefined;
      }
    })();

    return pendingLookup;
  }

  return async (
    event: { type: "before_provider_request"; payload: unknown },
    ctx: { model?: ProviderModelRef },
  ): Promise<Record<string, unknown> | undefined> => {
    const env = getEnv();
    if (!isAntigravityPromptRepairEnabled(env)) {
      return undefined;
    }

    const provider = ctx.model?.provider;
    const payloadObj = typeof event?.payload === "object" && event.payload !== null && !Array.isArray(event.payload)
      ? (event.payload as Record<string, unknown>)
      : undefined;
    if (!payloadObj) return undefined;

    const wireModelId = typeof payloadObj.model === "string" && payloadObj.model.trim()
      ? payloadObj.model.trim()
      : ctx.model?.id;

    const syncDecision = classifyAntigravityModelSync(provider, wireModelId);
    if (syncDecision === false) return undefined;

    if (syncDecision === "ambiguous") {
      const owners = await resolveCLIProxyOwners(env);
      if (!wireModelId || owners?.get(wireModelId) !== "antigravity") {
        return undefined;
      }
    }

    return sanitizeOpenAICompletionsPayload(payloadObj);
  };
}
