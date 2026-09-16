import { describe, expect, test } from "bun:test";
import {
  buildStrictThinkingLevelMap,
  resolveRecommendedContextWindow,
  toPiModelFromCPA,
  toPiModelFromOpenAI,
} from "../extensions/cliproxyapi-dynamic-provider";

describe("CLIProxyAPI model mapping", () => {
  test("maps enriched model metadata", () => {
    const model = toPiModelFromCPA({
      slug: "gemini-3.8-flash-high",
      display_name: "Gemini 3.8 Flash High",
      context_window: 1_000_000,
      max_tokens: 100_000,
      input_modalities: ["text", "image"],
      default_reasoning_level: "medium",
      supported_reasoning_levels: [
        { effort: "low" },
        { effort: "medium" },
        { effort: "high" },
      ],
    });

    expect(model).toMatchObject({
      id: "gemini-3.8-flash-high",
      reasoning: true,
      input: ["text", "image"],
      contextWindow: 370_000,
      maxTokens: 65_536,
      thinkingLevelMap: {
        off: null,
        minimal: null,
        low: "low",
        medium: "medium",
        high: "high",
        xhigh: null,
        max: null,
      },
    });
  });

  test("maps standard OpenAI fallback metadata", () => {
    const model = toPiModelFromOpenAI({
      id: "claude-opus-4-6-thinking",
      owned_by: "antigravity",
      context_length: 500_000,
      max_output_tokens: 32_000,
      capabilities: { vision: true, reasoning: true },
    });

    expect(model).toMatchObject({
      id: "claude-opus-4-6-thinking",
      reasoning: true,
      input: ["text", "image"],
      contextWindow: 200_000,
      maxTokens: 32_000,
    });
  });

  test("rejects blank model identifiers", () => {
    expect(toPiModelFromCPA({})).toBeUndefined();
    expect(toPiModelFromOpenAI({ id: "  " })).toBeUndefined();
  });
});

describe("provider safety limits", () => {
  test("caps context windows by model family", () => {
    expect(resolveRecommendedContextWindow("gpt-5-codex", 500_000)).toBe(272_000);
    expect(resolveRecommendedContextWindow("claude-opus", 500_000)).toBe(200_000);
    expect(resolveRecommendedContextWindow("gemini-pro", 1_000_000)).toBe(370_000);
  });

  test("exposes only reported thinking levels", () => {
    expect(buildStrictThinkingLevelMap(["minimal", "high", "max"])).toEqual({
      off: null,
      minimal: "minimal",
      low: null,
      medium: null,
      high: "high",
      xhigh: null,
      max: "max",
    });
  });
});
