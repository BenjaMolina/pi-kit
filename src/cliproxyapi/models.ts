export type CPAModel = {
  slug?: string;
  id?: string;
  display_name?: string;
  owned_by?: string;
  context_window?: number;
  max_tokens?: number;
  input_modalities?: string[];
  default_reasoning_level?: string | null;
  supported_reasoning_levels?: Array<{ effort: string; description?: string }>;
};

export type FallbackOpenAIModel = {
  id?: unknown;
  owned_by?: unknown;
  context_length?: unknown;
  max_input_tokens?: unknown;
  max_output_tokens?: unknown;
  capabilities?: {
    reasoning?: unknown;
    thinking?: unknown;
    vision?: unknown;
    image?: unknown;
    images?: unknown;
  };
};

export type CLIProxyModel = {
  id: string;
  displayName: string;
  owner: string;
  source: "enriched" | "fallback";
  reasoning: boolean;
  reasoningLevels: string[];
  reasoningLevelsAuthoritative?: boolean;
  defaultReasoningLevel?: string;
  input: readonly ["text"] | readonly ["text", "image"];
  contextWindow: number;
  maxTokens: number;
};

export const DEFAULT_BASE_URL = "http://127.0.0.1:8317/v1";
const DEFAULT_MAX_TOKENS = 16_384;
const MAX_SAFE_OUTPUT_TOKENS = 65_536;

export function resolveCLIProxyBaseUrl(baseUrl?: string): string {
  return (baseUrl || DEFAULT_BASE_URL).replace(/\/+$/, "");
}

export function buildStrictThinkingLevelMap(levels: string[]): Record<string, string | null> {
  if (levels.length === 0) {
    return {
      off: null,
      minimal: null,
      low: "low",
      medium: "medium",
      high: "high",
      xhigh: null,
      max: null,
    };
  }

  const supported = new Set(levels.map((level) => level.toLowerCase()));
  return {
    off: null,
    minimal: supported.has("minimal") ? "minimal" : null,
    low: supported.has("low") ? "low" : null,
    medium: supported.has("medium") ? "medium" : null,
    high: supported.has("high") ? "high" : null,
    xhigh: supported.has("xhigh") ? "xhigh" : null,
    max: supported.has("max") ? "max" : null,
  };
}

export function resolveRecommendedContextWindow(modelId: string, reportedContext?: number): number {
  const id = modelId.toLowerCase();
  let recommendedCap = 128_000;

  if (id.includes("gpt") || id.includes("codex") || id.includes("openai")) {
    recommendedCap = 272_000;
  } else if (id.includes("claude")) {
    recommendedCap = 200_000;
  } else if (id.includes("gemini")) {
    recommendedCap = 370_000;
  }

  if (typeof reportedContext === "number" && Number.isFinite(reportedContext) && reportedContext > 0) {
    return Math.min(Math.floor(reportedContext), recommendedCap);
  }

  return recommendedCap;
}

function toSafeMaxTokens(reportedMaxTokens: unknown): number {
  const maxTokens = typeof reportedMaxTokens === "number"
    && Number.isFinite(reportedMaxTokens)
    && reportedMaxTokens > 0
    ? Math.floor(reportedMaxTokens)
    : DEFAULT_MAX_TOKENS;
  return Math.min(maxTokens, MAX_SAFE_OUTPUT_TOKENS);
}

function supportsImages(id: string, capabilities?: FallbackOpenAIModel["capabilities"], modalities?: string[]): boolean {
  const lowerId = id.toLowerCase();
  return Boolean(
    modalities?.includes("image")
      || capabilities?.vision
      || capabilities?.image
      || capabilities?.images
      || lowerId.includes("image")
      || lowerId.includes("vision")
      || lowerId.includes("gemini")
      || lowerId.includes("claude")
      || lowerId.includes("gpt"),
  );
}

function toDefaultReasoningLevel(model: CPAModel): string | undefined {
  if (typeof model.default_reasoning_level !== "string") return undefined;
  const normalized = model.default_reasoning_level.trim().toLowerCase();
  return normalized || undefined;
}

function toReasoningLevels(model: CPAModel): string[] {
  return (model.supported_reasoning_levels || [])
    .map((level) => (typeof level?.effort === "string" ? level.effort.trim() : ""))
    .filter((effort): effort is string => Boolean(effort));
}

export function normalizeCPA(model: CPAModel): CLIProxyModel | undefined {
  const id = typeof model.slug === "string" && model.slug.trim()
    ? model.slug.trim()
    : typeof model.id === "string"
      ? model.id.trim()
      : "";
  if (!id) return undefined;

  const defaultReasoningLevel = toDefaultReasoningLevel(model);
  const reasoningLevels = toReasoningLevels(model);
  const reasoningLevelsAuthoritative = reasoningLevels.length > 0;
  const reasoning = reasoningLevels.length > 0
    || Boolean(defaultReasoningLevel)
    || id.toLowerCase().includes("thinking")
    || (model.display_name?.toLowerCase().includes("thinking") ?? false);

  return {
    id,
    displayName: typeof model.display_name === "string" && model.display_name.trim() ? model.display_name.trim() : id,
    owner: typeof model.owned_by === "string" && model.owned_by.trim() ? model.owned_by.trim() : "CLIProxyAPI",
    source: "enriched",
    reasoning,
    reasoningLevels,
    reasoningLevelsAuthoritative,
    ...(defaultReasoningLevel ? { defaultReasoningLevel } : {}),
    input: supportsImages(id, undefined, model.input_modalities) ? ["text", "image"] : ["text"],
    contextWindow: resolveRecommendedContextWindow(id, model.context_window),
    maxTokens: toSafeMaxTokens(model.max_tokens),
  };
}

export function normalizeOpenAI(model: FallbackOpenAIModel): CLIProxyModel | undefined {
  const id = typeof model.id === "string" ? model.id.trim() : "";
  if (!id) return undefined;

  const capabilities = model.capabilities ?? {};
  const reasoning = Boolean(
    capabilities.reasoning
      || capabilities.thinking
      || id.toLowerCase().includes("thinking")
      || id.toLowerCase().includes("high")
      || id.toLowerCase().includes("pro")
      || id.toLowerCase().includes("sol")
      || id.toLowerCase().includes("luna")
      || id.toLowerCase().includes("terra")
      || id.toLowerCase().includes("o1")
      || id.toLowerCase().includes("o3")
      || id.toLowerCase().includes("gpt-5"),
  );
  const reportedContext = typeof model.context_length === "number"
    ? model.context_length
    : typeof model.max_input_tokens === "number"
      ? model.max_input_tokens
      : undefined;

  return {
    id,
    displayName: id,
    owner: typeof model.owned_by === "string" && model.owned_by.trim() ? model.owned_by.trim() : "CLIProxyAPI",
    source: "fallback",
    reasoning,
    reasoningLevels: reasoning ? ["low", "medium", "high"] : [],
    reasoningLevelsAuthoritative: false,
    input: supportsImages(id, capabilities) ? ["text", "image"] : ["text"],
    contextWindow: resolveRecommendedContextWindow(id, reportedContext),
    maxTokens: toSafeMaxTokens(model.max_output_tokens),
  };
}
