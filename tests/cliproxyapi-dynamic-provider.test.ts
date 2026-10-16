import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import type { ProviderConfig } from "@earendil-works/pi-coding-agent";
import cliproxyapiDynamicProvider, {
  fetchCLIProxyModels,
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

describe("CLIProxyAPI startup lifecycle", () => {
  let originalFetch: typeof fetch;
  const env = new Map<string, string | undefined>();
  beforeEach(() => {
    originalFetch = globalThis.fetch;
    for (const key of ["CLIPROXYAPI_API_KEY", "CLIPROXYAPI_BASE_URL", "PI_OFFLINE"]) {
      env.set(key, process.env[key]);
      delete process.env[key];
    }
    process.env.CLIPROXYAPI_API_KEY = "synthetic-key";
  });
  afterEach(() => {
    globalThis.fetch = originalFetch;
    for (const [key, value] of env) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
    env.clear();
  });
  async function register() {
    let config: ProviderConfig | undefined;
    await cliproxyapiDynamicProvider({
      registerProvider: (_name: string, value: ProviderConfig) => { config = value; },
    } as never);
    if (!config) throw new Error("Provider not registered");
    return config;
  }
  test("awaits real fallback models using one startup deadline and preserves later refresh", async () => {
    const signals: AbortSignal[] = [];
    globalThis.fetch = (async (url, init) => {
      signals.push(init!.signal!);
      return Response.json(String(url).includes("client_version") ? {} : { data: [{ id: "gpt-6-luna" }] });
    }) as typeof fetch;
    const config = await register();
    expect(config.models!.map((m) => m.id)).toEqual(["gpt-6-luna"]);
    expect(signals[0]).toBe(signals[1]);
    const controller = new AbortController();
    await config.refreshModels!({ signal: controller.signal } as never);
    expect(signals[2]).toBe(controller.signal);
    controller.abort();
    expect(signals[3]!.aborted).toBe(true);
  });
  test("startup errors are isolated but direct helper and refresh errors still reject", async () => {
    globalThis.fetch = (async () => { throw new Error("synthetic failure"); }) as typeof fetch;
    const config = await register();
    expect(config.models).toEqual([]);
    await expect(fetchCLIProxyModels()).rejects.toThrow("synthetic failure");
    await expect(config.refreshModels!({} as never)).rejects.toThrow("synthetic failure");
  });
  test("cache-only refresh retains last success and a valid empty response explicitly clears it", async () => {
    let calls = 0;
    let empty = false;
    globalThis.fetch = (async () => {
      calls++;
      return Response.json(empty ? { data: [] } : { models: [{ slug: "gpt-6-luna" }] });
    }) as typeof fetch;
    const config = await register();
    expect(calls).toBe(1);
    const cached = await config.refreshModels!({ allowNetwork: false } as never);
    expect(cached.map((model) => model.id)).toEqual(["gpt-6-luna"]);
    expect(calls).toBe(1);
    empty = true;
    expect(await config.refreshModels!({} as never)).toEqual([]);
    expect(await config.refreshModels!({ allowNetwork: false } as never)).toEqual([]);
    expect(calls).toBe(3);
  });

  test("offline and missing-key startup make no requests", async () => {
    let calls = 0;
    globalThis.fetch = (async () => { calls++; throw new Error("unexpected network"); }) as typeof fetch;
    for (const value of ["1", "true", "yes"]) {
      process.env.PI_OFFLINE = value;
      expect((await register()).models).toEqual([]);
    }
    delete process.env.PI_OFFLINE;
    delete process.env.CLIPROXYAPI_API_KEY;
    expect((await register()).models).toEqual([]);
    await expect(fetchCLIProxyModels()).rejects.toThrow("CLIPROXYAPI_API_KEY is not set");
    expect(calls).toBe(0);
  });
  test("the shared startup deadline aborts blocking discovery", async () => {
    let signal: AbortSignal | undefined;
    globalThis.fetch = (async (_url, init) => {
      signal = init!.signal!;
      signal.throwIfAborted();
      return new Promise<Response>((_resolve, reject) => {
        signal!.addEventListener("abort", () => reject(signal!.reason), { once: true });
      });
    }) as typeof fetch;
    expect((await register()).models).toEqual([]);
    expect(signal?.aborted).toBe(true);
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
