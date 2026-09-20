import { describe, expect, test } from "bun:test";
import { discoverCLIProxyModels } from "../src/cliproxyapi/discovery";
import { normalizeCPA, normalizeOpenAI } from "../src/cliproxyapi/models";

describe("CLIProxyAPI catalog discovery", () => {
  test("prefers and normalizes the enriched catalog", async () => {
    const requests: string[] = [];
    const models = await discoverCLIProxyModels({
      baseUrl: "http://proxy.test/v1/",
      apiKey: "test-key",
      fetch: async (input, init) => {
        requests.push(String(input));
        expect(init?.headers).toEqual({ Authorization: "Bearer test-key" });
        return new Response(JSON.stringify({
          models: [{
            slug: "gemini-thinking",
            display_name: "Gemini Thinking",
            context_window: 1_000_000,
            max_tokens: 100_000,
            input_modalities: ["text", "image"],
            supported_reasoning_levels: [{ effort: "low" }, { effort: "high" }],
          }],
        }));
      },
    });

    expect(requests).toEqual(["http://proxy.test/v1/models?client_version=1"]);
    expect(models).toEqual([expect.objectContaining({
      id: "gemini-thinking",
      reasoning: true,
      input: ["text", "image"],
      contextWindow: 370_000,
      maxTokens: 65_536,
      reasoningLevels: ["low", "high"],
      reasoningLevelsAuthoritative: true,
    })]);
    expect(models[0]?.defaultReasoningLevel).toBeUndefined();
  });

  test("preserves authoritative enriched default reasoning level and supported levels", async () => {
    const models = await discoverCLIProxyModels({
      baseUrl: "http://proxy.test/v1",
      apiKey: "test-key",
      fetch: async () => new Response(JSON.stringify({
        models: [
          {
            slug: "gemini-3.8-flash-high",
            display_name: "Gemini 3.8 Flash High",
            default_reasoning_level: "  Medium  ",
            supported_reasoning_levels: [
              { effort: "  LOW  " },
              { effort: "Medium" },
              { effort: "high" },
            ],
          },
          {
            slug: "gemini-blank-default",
            display_name: "Gemini Blank Default",
            default_reasoning_level: "   ",
            supported_reasoning_levels: [{ effort: "low" }],
          },
        ],
      })),
    });

    expect(models[0]).toEqual(expect.objectContaining({
      id: "gemini-3.8-flash-high",
      reasoning: true,
      defaultReasoningLevel: "medium",
      reasoningLevels: ["LOW", "Medium", "high"],
      reasoningLevelsAuthoritative: true,
    }));

    expect(models[1]).toEqual(expect.objectContaining({
      id: "gemini-blank-default",
      reasoning: true,
      reasoningLevels: ["low"],
      reasoningLevelsAuthoritative: true,
    }));
    expect(models[1]?.defaultReasoningLevel).toBeUndefined();
  });

  test("preserves arbitrary model-specific reasoning levels including xhigh/max and future custom names", () => {
    const xhighModel = normalizeCPA({
      slug: "o3-mini-reasoning",
      display_name: "o3-mini",
      default_reasoning_level: "xhigh",
      supported_reasoning_levels: [{ effort: "low" }, { effort: "medium" }, { effort: "high" }, { effort: "xhigh" }, { effort: "max" }],
    });

    expect(xhighModel).toEqual(expect.objectContaining({
      id: "o3-mini-reasoning",
      reasoning: true,
      defaultReasoningLevel: "xhigh",
      reasoningLevels: ["low", "medium", "high", "xhigh", "max"],
      reasoningLevelsAuthoritative: true,
    }));

    const customModel = normalizeCPA({
      slug: "future-thinking-model",
      display_name: "Future Thinking Model",
      default_reasoning_level: "Budget-4K",
      supported_reasoning_levels: [
        { effort: "  Budget-4K  " },
        { effort: "Deep_Thought" },
        { effort: "xHigh" },
        { effort: "MAX" },
      ],
    });

    expect(customModel).toEqual(expect.objectContaining({
      id: "future-thinking-model",
      reasoning: true,
      defaultReasoningLevel: "budget-4k",
      reasoningLevels: ["Budget-4K", "Deep_Thought", "xHigh", "MAX"],
      reasoningLevelsAuthoritative: true,
    }));
  });

  test("normalizes enriched models without supported reasoning levels as non-authoritative", () => {
    const noReasoningLevels = normalizeCPA({
      slug: "gpt-4o",
      display_name: "GPT-4o",
    });

    expect(noReasoningLevels).toEqual(expect.objectContaining({
      id: "gpt-4o",
      reasoning: false,
      reasoningLevels: [],
      reasoningLevelsAuthoritative: false,
    }));
    expect(noReasoningLevels?.defaultReasoningLevel).toBeUndefined();

    const emptyReasoningLevels = normalizeCPA({
      slug: "gpt-4o-empty",
      display_name: "GPT-4o Empty",
      supported_reasoning_levels: [],
    });

    expect(emptyReasoningLevels).toEqual(expect.objectContaining({
      id: "gpt-4o-empty",
      reasoning: false,
      reasoningLevels: [],
      reasoningLevelsAuthoritative: false,
    }));
  });

  test("falls back to the standard catalog when enriched discovery is unavailable", async () => {
    const requests: string[] = [];
    const models = await discoverCLIProxyModels({
      baseUrl: "http://proxy.test/v1",
      apiKey: "test-key",
      fetch: async (input) => {
        requests.push(String(input));
        if (String(input).includes("client_version=1")) return new Response("missing", { status: 404 });
        return new Response(JSON.stringify({
          data: [{
            id: "claude-opus-thinking",
            owned_by: "proxy",
            context_length: 500_000,
            max_output_tokens: 32_000,
            capabilities: { vision: true, reasoning: true },
          }],
        }));
      },
    });

    expect(requests).toEqual([
      "http://proxy.test/v1/models?client_version=1",
      "http://proxy.test/v1/models",
    ]);
    expect(models).toEqual([expect.objectContaining({
      id: "claude-opus-thinking",
      reasoning: true,
      input: ["text", "image"],
      contextWindow: 200_000,
      maxTokens: 32_000,
      reasoningLevels: ["low", "medium", "high"],
      reasoningLevelsAuthoritative: false,
    })]);
    expect(models[0]?.defaultReasoningLevel).toBeUndefined();
  });

  test("explicitly marks fallback reasoning levels as non-authoritative", () => {
    const fallbackWithReasoning = normalizeOpenAI({
      id: "o1-preview",
      capabilities: { reasoning: true },
    });

    expect(fallbackWithReasoning).toEqual(expect.objectContaining({
      id: "o1-preview",
      reasoning: true,
      reasoningLevels: ["low", "medium", "high"],
      reasoningLevelsAuthoritative: false,
    }));
    expect(fallbackWithReasoning?.defaultReasoningLevel).toBeUndefined();

    const fallbackWithoutReasoning = normalizeOpenAI({
      id: "gpt-4-turbo",
      capabilities: { reasoning: false },
    });

    expect(fallbackWithoutReasoning).toEqual(expect.objectContaining({
      id: "gpt-4-turbo",
      reasoning: false,
      reasoningLevels: [],
      reasoningLevelsAuthoritative: false,
    }));
    expect(fallbackWithoutReasoning?.defaultReasoningLevel).toBeUndefined();
  });
});
