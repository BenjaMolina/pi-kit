import { describe, expect, test } from "bun:test";
import { discoverCLIProxyModels } from "../src/cliproxyapi/discovery";

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
    })]);
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
    })]);
  });
});
