import { describe, expect, test } from "bun:test";
import { createCLIProxyAPIOpenCodePlugin } from "../src/cliproxyapi/opencode";

describe("OpenCode CLIProxyAPI plugin", () => {
  test("injects an OpenAI-compatible provider from the enriched catalog", async () => {
    const plugin = createCLIProxyAPIOpenCodePlugin({
      env: {
        CLIPROXYAPI_BASE_URL: "http://proxy.test/v1/",
        CLIPROXYAPI_API_KEY: "test-key",
      },
      fetch: async () => new Response(JSON.stringify({
        models: [{
          slug: "gemini-thinking",
          display_name: "Gemini Thinking",
          context_window: 1_000_000,
          max_tokens: 100_000,
          input_modalities: ["text", "image"],
          supported_reasoning_levels: [{ effort: "low" }, { effort: "high" }],
        }],
      })),
    });
    const hooks = await plugin({} as never);
    const config: Record<string, unknown> = { provider: {} };

    await hooks.config?.(config as never);

    expect(config).toEqual({
      provider: {
        cliproxyapi: {
          npm: "@ai-sdk/openai-compatible",
          name: "CLIProxyAPI",
          options: {
            baseURL: "http://proxy.test/v1",
            apiKey: "test-key",
          },
          models: {
            "gemini-thinking": {
              name: "Gemini Thinking",
              reasoning: true,
              limit: { context: 370_000, output: 65_536 },
              modalities: { input: ["text", "image"], output: ["text"] },
            },
          },
        },
      },
    });
  });

  test("disambiguates duplicate display names without changing model IDs", async () => {
    const plugin = createCLIProxyAPIOpenCodePlugin({
      env: { CLIPROXYAPI_API_KEY: "test-key" },
      fetch: async () => new Response(JSON.stringify({
        models: [
          { slug: "gemini-3.8-flash-high", display_name: "Gemini 3.8 Flash" },
          { slug: "agy-bmolina/gemini-3.8-flash-high", display_name: "Gemini 3.8 Flash" },
          { slug: "another-team/gemini-3.8-flash-high", display_name: "Gemini 3.8 Flash" },
          { slug: "shared/alpha", display_name: "Shared Model" },
          { slug: "shared/beta", display_name: "Shared Model" },
          { slug: "alpha", display_name: "General Model" },
          { slug: "beta", display_name: "General Model" },
        ],
      })),
    });
    const hooks = await plugin({} as never);
    const config: Record<string, unknown> = {};

    await hooks.config?.(config as never);

    expect(config).toMatchObject({
      provider: {
        cliproxyapi: {
          models: {
            "gemini-3.8-flash-high": { name: "Gemini 3.8 Flash" },
            "agy-bmolina/gemini-3.8-flash-high": { name: "Gemini 3.8 Flash [agy-bmolina]" },
            "another-team/gemini-3.8-flash-high": { name: "Gemini 3.8 Flash [another-team]" },
            "shared/alpha": { name: "Shared Model [shared/alpha]" },
            "shared/beta": { name: "Shared Model [shared/beta]" },
            alpha: { name: "General Model" },
            beta: { name: "General Model [beta]" },
          },
        },
      },
    });
  });

  test("injects fallback catalog capabilities when the enriched endpoint is unavailable", async () => {
    const plugin = createCLIProxyAPIOpenCodePlugin({
      env: { CLIPROXYAPI_API_KEY: "test-key" },
      fetch: async (input) => {
        if (String(input).includes("client_version=1")) return new Response("missing", { status: 404 });
        return new Response(JSON.stringify({
          data: [{
            id: "claude-opus-thinking",
            context_length: 500_000,
            max_output_tokens: 32_000,
            capabilities: { vision: true, reasoning: true },
          }],
        }));
      },
    });
    const hooks = await plugin({} as never);
    const config: Record<string, unknown> = {};

    await hooks.config?.(config as never);

    expect(config).toMatchObject({
      provider: {
        cliproxyapi: {
          models: {
            "claude-opus-thinking": {
              reasoning: true,
              limit: { context: 200_000, output: 32_000 },
              modalities: { input: ["text", "image"], output: ["text"] },
            },
          },
        },
      },
    });
  });

  test("leaves configuration unchanged when the API key is absent", async () => {
    const plugin = createCLIProxyAPIOpenCodePlugin({
      env: { CLIPROXYAPI_BASE_URL: "http://proxy.test/v1" },
      fetch: async () => {
        throw new Error("discovery must not run without a key");
      },
    });
    const hooks = await plugin({} as never);
    const config = { provider: { existing: { name: "Existing" } } };

    await hooks.config?.(config as never);

    expect(config).toEqual({ provider: { existing: { name: "Existing" } } });
  });

  test("leaves configuration unchanged when CLIProxyAPI is unavailable", async () => {
    const plugin = createCLIProxyAPIOpenCodePlugin({
      env: { CLIPROXYAPI_API_KEY: "test-key" },
      fetch: async () => {
        throw new Error("connection refused");
      },
    });
    const hooks = await plugin({} as never);
    const config = { provider: { existing: { name: "Existing" } } };

    await hooks.config?.(config as never);

    expect(config).toEqual({ provider: { existing: { name: "Existing" } } });
  });
});
