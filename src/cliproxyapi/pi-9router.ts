export interface NineRouterPiModel {
  id: string;
  name: string;
  reasoning: boolean;
  input: ["text"];
  cost: { input: number; output: number; cacheRead: number; cacheWrite: number };
  contextWindow: number;
  maxTokens: number;
  compat?: {
    supportsDeveloperRole: false;
    supportsReasoningEffort: false;
  };
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
    !/^[A-Za-z0-9][A-Za-z0-9._:/-]*$/.test(id) ||
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

  return {
    id,
    name: id,
    reasoning: false,
    input: ["text"],
    cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
    contextWindow: context,
    maxTokens: output,
    compat: {
      supportsDeveloperRole: false,
      supportsReasoningEffort: false,
    },
  };
}
