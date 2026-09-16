import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";

// Based on the CLIProxyAPI dynamic provider shared by j0k3r-dev-rgl.
// Reused and adapted with the author's permission.

type CPAModel = {
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

type FallbackOpenAIModel = {
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

const PROVIDER_ID = "cliproxyapi";
const DEFAULT_BASE_URL = "http://127.0.0.1:8317/v1";
const DEFAULT_MAX_TOKENS = 16_384;
const MAX_SAFE_OUTPUT_TOKENS = 65_536;

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

function resolveBaseUrl(): string {
  return (process.env.CLIPROXYAPI_BASE_URL || DEFAULT_BASE_URL).replace(/\/+$/, "");
}

function requireApiKey(): string {
  const apiKey = (process.env.CLIPROXYAPI_API_KEY || "").trim();
  if (!apiKey) {
    throw new Error(
      "CLIPROXYAPI_API_KEY is not set. Configure it in the Pi process environment before loading this provider.",
    );
  }
  return apiKey;
}

export function toPiModelFromCPA(model: CPAModel) {
  const id = typeof model.slug === "string" && model.slug.trim()
    ? model.slug.trim()
    : typeof model.id === "string"
      ? model.id.trim()
      : "";
  if (!id) return undefined;

  const lowerId = id.toLowerCase();
  const contextWindow = resolveRecommendedContextWindow(id, model.context_window);
  const maxTokens = Math.min(
    typeof model.max_tokens === "number" && Number.isFinite(model.max_tokens) && model.max_tokens > 0
      ? Math.floor(model.max_tokens)
      : DEFAULT_MAX_TOKENS,
    MAX_SAFE_OUTPUT_TOKENS,
  );

  const levels = (model.supported_reasoning_levels || [])
    .map((level) => (typeof level?.effort === "string" ? level.effort.trim().toLowerCase() : ""))
    .filter((effort): effort is string => Boolean(effort));

  const reasoning = levels.length > 0
    || Boolean(model.default_reasoning_level)
    || lowerId.includes("thinking")
    || (model.display_name?.toLowerCase().includes("thinking") ?? false);

  const supportsImages = (model.input_modalities?.includes("image") ?? false)
    || lowerId.includes("vision")
    || lowerId.includes("image")
    || lowerId.includes("gemini")
    || lowerId.includes("claude")
    || lowerId.includes("gpt");

  const owner = typeof model.owned_by === "string" && model.owned_by.trim()
    ? model.owned_by.trim()
    : "CLIProxyAPI";
  const displayName = typeof model.display_name === "string" && model.display_name.trim()
    ? model.display_name.trim()
    : id;

  return {
    id,
    name: displayName !== id ? `${displayName} (${id})` : `${id} (${owner})`,
    reasoning,
    input: supportsImages ? (["text", "image"] as const) : (["text"] as const),
    contextWindow,
    maxTokens,
    cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
    ...(reasoning ? { thinkingLevelMap: buildStrictThinkingLevelMap(levels) } : {}),
  };
}

export function toPiModelFromOpenAI(model: FallbackOpenAIModel) {
  const id = typeof model.id === "string" ? model.id.trim() : "";
  if (!id) return undefined;

  const capabilities = model.capabilities ?? {};
  const lowerId = id.toLowerCase();
  const reportedContext = typeof model.context_length === "number"
    ? model.context_length
    : typeof model.max_input_tokens === "number"
      ? model.max_input_tokens
      : undefined;
  const contextWindow = resolveRecommendedContextWindow(id, reportedContext);
  const maxTokens = Math.min(
    typeof model.max_output_tokens === "number" && model.max_output_tokens > 0
      ? Math.floor(model.max_output_tokens)
      : DEFAULT_MAX_TOKENS,
    MAX_SAFE_OUTPUT_TOKENS,
  );
  const owner = typeof model.owned_by === "string" && model.owned_by.trim()
    ? model.owned_by.trim()
    : "CLIProxyAPI";

  const supportsImages = Boolean(
    capabilities.vision
      || capabilities.image
      || capabilities.images
      || lowerId.includes("image")
      || lowerId.includes("vision")
      || lowerId.includes("gemini")
      || lowerId.includes("claude")
      || lowerId.includes("gpt"),
  );

  const reasoning = Boolean(
    capabilities.reasoning
      || capabilities.thinking
      || lowerId.includes("thinking")
      || lowerId.includes("high")
      || lowerId.includes("pro")
      || lowerId.includes("sol")
      || lowerId.includes("luna")
      || lowerId.includes("terra")
      || lowerId.includes("o1")
      || lowerId.includes("o3")
      || lowerId.includes("gpt-5"),
  );

  return {
    id,
    name: `${id} (${owner})`,
    reasoning,
    input: supportsImages ? (["text", "image"] as const) : (["text"] as const),
    contextWindow,
    maxTokens,
    cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
    ...(reasoning ? { thinkingLevelMap: buildStrictThinkingLevelMap(["low", "medium", "high"]) } : {}),
  };
}

export async function fetchCLIProxyModels(signal?: AbortSignal) {
  const baseUrl = resolveBaseUrl();
  const apiKey = requireApiKey();

  try {
    const response = await fetch(`${baseUrl}/models?client_version=1`, {
      headers: { Authorization: `Bearer ${apiKey}` },
      signal,
    });

    if (response.ok) {
      const payload = (await response.json()) as { models?: CPAModel[] };
      if (Array.isArray(payload.models) && payload.models.length > 0) {
        return payload.models
          .map(toPiModelFromCPA)
          .filter((model): model is NonNullable<ReturnType<typeof toPiModelFromCPA>> => Boolean(model));
      }
    }
  } catch {
    // Fall through to the standard OpenAI-compatible endpoint.
  }

  const response = await fetch(`${baseUrl}/models`, {
    headers: { Authorization: `Bearer ${apiKey}` },
    signal,
  });

  if (!response.ok) {
    const body = await response.text().catch(() => "");
    const detail = body ? `: ${body.slice(0, 300)}` : "";
    throw new Error(`CLIProxyAPI /v1/models failed with HTTP ${response.status}${detail}`);
  }

  const payload = (await response.json()) as { data?: FallbackOpenAIModel[] };
  return (payload.data ?? [])
    .map(toPiModelFromOpenAI)
    .filter((model): model is NonNullable<ReturnType<typeof toPiModelFromOpenAI>> => Boolean(model));
}

export default function cliproxyapiDynamicProvider(pi: ExtensionAPI) {
  pi.registerProvider(PROVIDER_ID, {
    name: "CLIProxyAPI",
    baseUrl: resolveBaseUrl(),
    apiKey: "$CLIPROXYAPI_API_KEY",
    api: "openai-completions",
    compat: {
      supportsDeveloperRole: false,
      supportsReasoningEffort: true,
      supportsUsageInStreaming: true,
      maxTokensField: "max_tokens",
    },
    async refreshModels({ signal } = {}) {
      return fetchCLIProxyModels(signal);
    },
  });
}
