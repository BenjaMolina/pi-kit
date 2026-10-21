export interface NineRouterPiModel {
  id: string;
  name: string;
  reasoning: boolean;
  input: ("text" | "image")[];
  cost: { input: number; output: number; cacheRead: number; cacheWrite: number };
  contextWindow: number;
  maxTokens: number;
  thinkingLevelMap?: Record<string, string | null>;
  compat: {
    supportsDeveloperRole: false;
    supportsReasoningEffort: boolean;
  };
}

const SOL_REASONING_LEVELS = {
  off: null,
  minimal: null,
  low: "low",
  medium: "medium",
  high: "high",
  xhigh: "xhigh",
  max: "max",
} as const;

const SOL_5_6_REASONING_LEVELS = {
  off: "none",
  minimal: "minimal",
  low: "low",
  medium: "medium",
  high: "high",
  xhigh: "xhigh",
  max: "max",
} as const;

function solReasoningForModel(id: string): Record<string, string | null> | undefined {
  if (id === "cx/gpt-6.1-sol" || id === "cx/gpt-6-sol") return SOL_REASONING_LEVELS;
  if (id === "cx/gpt-5.6-sol[1m]") return SOL_5_6_REASONING_LEVELS;
  return undefined;
}

type NineRouterCapabilities = { reasoning?: unknown; thinkingFormat?: unknown; thinkingCanDisable?: unknown };
type LevelOverride = { provider?: string; test: string; levels: readonly string[] };

const FORMAT_LEVELS: Record<string, readonly string[]> = {
  openai: ["none", "minimal", "low", "medium", "high", "xhigh"],
  "claude-adaptive": ["none", "low", "medium", "high", "xhigh", "max"],
  "claude-budget": ["none", "low", "medium", "high", "xhigh", "max"],
  "gemini-level": ["minimal", "low", "medium", "high"],
  deepseek: ["none", "high", "max"],
};
const GPT6_LEVELS = ["none", "minimal", "low", "medium", "high", "xhigh", "max"];
// Mirrors 9Router 0.5.104's internal table, which /v1/models does not publish.
const LEVEL_OVERRIDES: LevelOverride[] = [
  { test: "*gemini-4*", levels: ["low", "medium", "high"] },
  { test: "*claude*4.6*", levels: ["none", "low", "medium", "high", "max"] },
  { test: "*claude*4-6*", levels: ["none", "low", "medium", "high", "max"] },
  { provider: "cx", test: "*gpt-6*", levels: GPT6_LEVELS },
  { provider: "cx", test: "*gpt-5.6-sol*", levels: GPT6_LEVELS },
  { provider: "cx", test: "*gpt-5.6-terra*", levels: GPT6_LEVELS },
  { provider: "cx", test: "*gpt-5.6-luna*", levels: GPT6_LEVELS },
  { test: "*codex*", levels: ["low", "medium", "high", "xhigh"] },
  { test: "*mimo*v2.6*", levels: ["none", "low", "medium", "high", "xhigh"] },
  { test: "*mimo*v2.5-pro*", levels: ["none", "low", "medium", "high", "xhigh"] },
  { test: "*deepseek-v4.*", levels: ["none", "low", "medium", "high", "xhigh", "max"] },
];

function globMatches(pattern: string, value: string): boolean {
  const escaped = pattern.split("*").map((part) => part.replace(/[|\\{}()[\]^$+?.]/g, "\\$&")).join(".*");
  return new RegExp(`^${escaped}$`).test(value);
}

function reasoningMap(id: string, capabilities?: NineRouterCapabilities): Record<string, string | null> | undefined {
  const hardcoded = solReasoningForModel(id);
  if (hardcoded) return hardcoded;
  if (capabilities?.reasoning !== true) return undefined;
  const slash = id.indexOf("/");
  const provider = slash < 0 ? "" : id.slice(0, slash);
  const modelId = (slash < 0 ? id : id.slice(slash + 1)).replace(/\[1m\]$/, "");
  if (/(?:-high|-medium|-low)$/.test(modelId)) return undefined;
  const override = LEVEL_OVERRIDES.find((item) => (!item.provider || item.provider === provider) && globMatches(item.test, modelId));
  const format = typeof capabilities.thinkingFormat === "string" ? capabilities.thinkingFormat : "";
  let levels = override?.levels ?? FORMAT_LEVELS[format] ?? ["none", "low", "medium", "high"];
  if (capabilities.thinkingCanDisable === false) levels = levels.filter((level) => level !== "none");
  const set = new Set(levels);
  return { off: set.has("none") ? "none" : null, minimal: set.has("minimal") ? "minimal" : null, low: set.has("low") ? "low" : null, medium: set.has("medium") ? "medium" : null, high: set.has("high") ? "high" : null, xhigh: set.has("xhigh") ? "xhigh" : null, max: set.has("max") ? "max" : null };
}

export function toPiModelFrom9Router(
  id: string,
  entry?: {
    limit?: { context?: number; output?: number };
    context_length?: unknown;
    max_completion_tokens?: unknown;
    capabilities?: NineRouterCapabilities;
    modalities?: { input?: unknown };
  },
): NineRouterPiModel | undefined {
  if (
    typeof id !== "string" ||
    !id.trim() ||
    id.length > 200 ||
    !/^[A-Za-z0-9][A-Za-z0-9._:/-]*(?:\[1m\])?$/.test(id) ||
    ["__proto__", "prototype", "constructor"].includes(id)
  ) {
    return undefined;
  }

  const rawContext = entry?.limit?.context ?? entry?.context_length;
  const context = typeof rawContext === "number" && Number.isSafeInteger(rawContext) && rawContext > 1
    ? Math.min(rawContext, 1_048_576)
    : 32_000;
  const rawOutput = entry?.limit?.output ?? entry?.max_completion_tokens;
  const maxOutputLimit = Math.min(65_536, context - 1);
  const output = typeof rawOutput === "number" && Number.isSafeInteger(rawOutput) && rawOutput > 0
    ? Math.min(rawOutput, maxOutputLimit)
    : Math.min(4_096, maxOutputLimit);

  const thinkingLevelMap = reasoningMap(id, entry?.capabilities);
  return {
    id,
    name: id,
    reasoning: thinkingLevelMap !== undefined,
    input: Array.isArray(entry?.modalities?.input)
      && entry.modalities.input.length <= 16
      && entry.modalities.input.every((modality) => typeof modality === "string" && modality.length <= 32)
      && entry.modalities.input.includes("image")
      ? ["text", "image"]
      : ["text"],
    cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
    contextWindow: context,
    maxTokens: output,
    ...(thinkingLevelMap ? { thinkingLevelMap: { ...thinkingLevelMap } } : {}),
    compat: {
      supportsDeveloperRole: false,
      supportsReasoningEffort: thinkingLevelMap !== undefined,
    },
  };
}
