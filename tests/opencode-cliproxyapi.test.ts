import { describe, expect, test } from "bun:test";
import { createCLIProxyAPIOpenCodePlugin } from "../src/cliproxyapi/opencode";

describe("OpenCode CLIProxyAPI plugin", () => {
  test("registers exact 9Router IDs independently without changing selection", async () => {
    const requests: string[] = [];
    const plugin = createCLIProxyAPIOpenCodePlugin({
      env: { NINEROUTER_API_KEY: "fake-nine-key", NINEROUTER_BASE_URL: "http://router.test/v1/" },
      fetch: async (url, init) => {
        requests.push(`${url}|${(init?.headers as Record<string, string>).Authorization}`);
        return new Response(JSON.stringify({ data: [{ id: "team/model:latest" }] }));
      },
    });
    const config: Record<string, unknown> = { model: "existing/model", provider: { existing: {} } };
    await (await plugin({})).config?.(config as never);
    expect(requests).toEqual(["http://router.test/v1/models|Bearer fake-nine-key"]);
    expect(config).toMatchObject({ model: "existing/model", provider: {
      existing: {}, "9router": { options: { baseURL: "http://router.test/v1", apiKey: "fake-nine-key" },
        models: { "team/model:latest": { name: "team/model:latest", limit: { context: 32_000, output: 4_096 }, modalities: { input: ["text"], output: ["text"] } } } },
    } });
  });

  test("keeps CLIProxyAPI when 9Router is offline and 9Router when CLIProxyAPI is offline", async () => {
    const plugin = createCLIProxyAPIOpenCodePlugin({
      env: { CLIPROXYAPI_API_KEY: "fake-cpa", NINEROUTER_API_KEY: "fake-nine" },
      fetch: async (url) => String(url).includes("8317")
        ? new Response(JSON.stringify({ models: [{ slug: "cpa-model" }] }))
        : new Response(JSON.stringify({ data: [{ id: "nine-model" }] })),
    });
    const config: Record<string, unknown> = {};
    await (await plugin({})).config?.(config as never);
    expect(config).toMatchObject({ provider: { cliproxyapi: { models: { "cpa-model": {} } }, "9router": { models: { "nine-model": {} } } } });
    for (const offline of ["8317", "20128"]) {
      const partial: Record<string, unknown> = {};
      const failing = createCLIProxyAPIOpenCodePlugin({
        env: { CLIPROXYAPI_API_KEY: "fake-cpa", NINEROUTER_API_KEY: "fake-nine" },
        fetch: async (url) => {
          if (String(url).includes(offline)) throw new Error("offline fake-secret");
          return String(url).includes("8317")
            ? new Response(JSON.stringify({ models: [{ slug: "cpa-model" }] }))
            : new Response(JSON.stringify({ data: [{ id: "nine-model" }] }));
        },
      });
      await (await failing({})).config?.(partial as never);
      expect(Object.keys(partial.provider as object)).toEqual([offline === "8317" ? "9router" : "cliproxyapi"]);
    }
  });

  test("skips missing key and user-owned provider without fetching", async () => {
    for (const env of [{}, { NINEROUTER_API_KEY: "fake-nine" }]) {
      const config = { model: "original", provider: { "9router": { models: { custom: {} } } } };
      const plugin = createCLIProxyAPIOpenCodePlugin({ env, fetch: async () => { throw new Error("unexpected fetch"); } });
      await (await plugin({})).config?.(config as never);
      expect(config).toEqual({ model: "original", provider: { "9router": { models: { custom: {} } } } });
    }
  });

  test("rejects malformed, oversized, and unsafe catalogs without mutating config", async () => {
    for (const data of [null, [], Array.from({ length: 257 }, (_, i) => ({ id: `m${i}` })),
      [{ id: "__proto__" }, { id: "bad key" }], [{ id: "good" }, { id: "good" }]]) {
      const plugin = createCLIProxyAPIOpenCodePlugin({
        env: { NINEROUTER_API_KEY: "fake-nine" },
        fetch: async () => new Response(JSON.stringify({ data })),
      });
      const config = { model: "original" };
      await (await plugin({})).config?.(config as never);
      expect(config).toEqual({ model: "original" });
    }
  });
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
