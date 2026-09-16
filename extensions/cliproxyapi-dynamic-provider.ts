import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { discoverCLIProxyModels } from "../src/cliproxyapi/discovery";
import {
  buildStrictThinkingLevelMap,
  type CLIProxyModel,
  type CPAModel,
  type FallbackOpenAIModel,
  normalizeCPA,
  normalizeOpenAI,
  resolveCLIProxyBaseUrl,
  resolveRecommendedContextWindow,
} from "../src/cliproxyapi/models";

// Based on the CLIProxyAPI dynamic provider shared by j0k3r-dev-rgl.
// Reused and adapted with the author's permission.

const PROVIDER_ID = "cliproxyapi";

export { buildStrictThinkingLevelMap, resolveCLIProxyBaseUrl, resolveRecommendedContextWindow };

function requireApiKey(): string {
  const apiKey = (process.env.CLIPROXYAPI_API_KEY || "").trim();
  if (!apiKey) {
    throw new Error(
      "CLIPROXYAPI_API_KEY is not set. Configure it in the Pi process environment before loading this provider.",
    );
  }
  return apiKey;
}

function toPiModel(model: CLIProxyModel) {
  return {
    id: model.id,
    name: model.source === "enriched" && model.displayName !== model.id
      ? `${model.displayName} (${model.id})`
      : `${model.id} (${model.owner})`,
    reasoning: model.reasoning,
    input: model.input,
    contextWindow: model.contextWindow,
    maxTokens: model.maxTokens,
    cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
    ...(model.reasoning ? { thinkingLevelMap: buildStrictThinkingLevelMap(model.reasoningLevels) } : {}),
  };
}

/** Public Pi mapping retained for callers that consume this extension directly. */
export function toPiModelFromCPA(model: CPAModel) {
  const normalized = normalizeCPA(model);
  return normalized ? toPiModel(normalized) : undefined;
}

/** Public Pi mapping retained for callers that consume this extension directly. */
export function toPiModelFromOpenAI(model: FallbackOpenAIModel) {
  const normalized = normalizeOpenAI(model);
  return normalized ? toPiModel(normalized) : undefined;
}

export async function fetchCLIProxyModels(signal?: AbortSignal) {
  return (await discoverCLIProxyModels({
    baseUrl: resolveCLIProxyBaseUrl(),
    apiKey: requireApiKey(),
    signal,
  })).map(toPiModel);
}

export default function cliproxyapiDynamicProvider(pi: ExtensionAPI) {
  pi.registerProvider(PROVIDER_ID, {
    name: "CLIProxyAPI",
    baseUrl: resolveCLIProxyBaseUrl(),
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
