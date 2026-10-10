export interface NineRouterPiModel {
  id: string;
  name: string;
  reasoning: boolean;
  input: ["text"];
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

export function toPiModelFrom9Router(
  id: string,
  entry?: {
    limit?: { context?: number; output?: number };
    context_length?: unknown;
    max_completion_tokens?: unknown;
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

  const thinkingLevelMap = solReasoningForModel(id);
  return {
    id,
    name: id,
    reasoning: thinkingLevelMap !== undefined,
    input: ["text"],
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
