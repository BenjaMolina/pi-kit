import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import nineRouterDynamicProvider, {
  fetchNineRouterModels,
  NINEROUTER_DEFAULT_BASE_URL,
  NINEROUTER_PROVIDER_ID,
  requireNineRouterApiKey,
  resolveNineRouterApiKey,
  resolveNineRouterBaseUrl,
} from "../extensions/9router-dynamic-provider";
import cliproxyapiDynamicProvider from "../extensions/cliproxyapi-dynamic-provider";
import { discoverOpenCodeModels, mergeOpenCodeFreeModels } from "../src/cliproxyapi/9router";

describe("resolveNineRouterBaseUrl", () => {
  test("uses default endpoint when undefined or empty", () => {
    expect(resolveNineRouterBaseUrl()).toBe(NINEROUTER_DEFAULT_BASE_URL);
    expect(resolveNineRouterBaseUrl("   ")).toBe(NINEROUTER_DEFAULT_BASE_URL);
  });

  test("normalizes valid URLs and removes trailing slashes", () => {
    expect(resolveNineRouterBaseUrl("http://localhost:20128/v1/")).toBe("http://localhost:20128/v1");
    expect(resolveNineRouterBaseUrl("https://router.internal:8080/api/v1///")).toBe("https://router.internal:8080/api/v1");
  });

  test("rejects non-HTTP protocols, query strings, hashes, and credentials", () => {
    expect(() => resolveNineRouterBaseUrl("ftp://localhost:20128")).toThrow("Invalid 9Router endpoint");
    expect(() => resolveNineRouterBaseUrl("http://localhost:20128/v1?key=val")).toThrow("Invalid 9Router endpoint");
    expect(() => resolveNineRouterBaseUrl("http://localhost:20128/v1#hash")).toThrow("Invalid 9Router endpoint");
    expect(() => resolveNineRouterBaseUrl("http://user:pass@localhost:20128/v1")).toThrow("Invalid 9Router endpoint");
  });
});

describe("API key resolution", () => {
  test("resolves trimmed key or undefined", () => {
    expect(resolveNineRouterApiKey({ NINEROUTER_API_KEY: "  secret-key  " })).toBe("secret-key");
    expect(resolveNineRouterApiKey({ NINEROUTER_API_KEY: "   " })).toBeUndefined();
    expect(resolveNineRouterApiKey({})).toBeUndefined();
  });

  test("requireNineRouterApiKey throws clear error without disclosing credentials", () => {
    expect(requireNineRouterApiKey({ NINEROUTER_API_KEY: "my-key" })).toBe("my-key");
    expect(() => requireNineRouterApiKey({})).toThrow(
      "NINEROUTER_API_KEY is not set. Configure it in the Pi process environment before loading this provider.",
    );
  });
});

describe("fetchNineRouterModels", () => {
  test("throws when API key is missing without making network calls", async () => {
    let called = false;
    await expect(
      fetchNineRouterModels({
        env: {},
        fetch: async () => {
          called = true;
          return new Response("ok");
        },
      }),
    ).rejects.toThrow("NINEROUTER_API_KEY is not set");
    expect(called).toBe(false);
  });

  test("handles offline service and non-ok status codes", async () => {
    await expect(
      fetchNineRouterModels({
        env: { NINEROUTER_API_KEY: "key" },
        fetch: async () => { throw new Error("fetch failed: ECONNREFUSED"); },
      }),
    ).rejects.toThrow("fetch failed: ECONNREFUSED");

    await expect(
      fetchNineRouterModels({
        env: { NINEROUTER_API_KEY: "key" },
        fetch: async () => new Response("Unauthorized", { status: 401 }),
      }),
    ).rejects.toThrow("9Router catalog unavailable");
  });

  test("rejects malformed, oversized, or empty catalogs", async () => {
    for (const body of [
      "not-json",
      JSON.stringify({ not_data: [] }),
      JSON.stringify({ data: [] }),
      JSON.stringify({ data: [{ id: "bad id with space" }] }),
      JSON.stringify({ data: [{ id: "__proto__" }] }),
      JSON.stringify({ data: [{ id: "dup" }, { id: "dup" }] }),
      JSON.stringify({ data: Array.from({ length: 257 }, (_, i) => ({ id: `m${i}` })) }),
    ]) {
      await expect(
        fetchNineRouterModels({
          env: { NINEROUTER_API_KEY: "key" },
          fetch: async () => new Response(body),
        }),
      ).rejects.toThrow();
    }
  });
});

describe("9Router dynamic provider Pi lifecycle", () => {
  test("accepts valid public [1m] IDs and rejects literal backslashes", async () => {
    await expect(discoverOpenCodeModels(async () => Response.json({ data: [
      { id: "model[1m]" }, { id: "model\\\\[1m\\\\]" },
    ] }))).resolves.toEqual(["model[1m]"]);
  });

  test("merge helper preserves 9Router entries and caps extras", () => {
    const original = Object.fromEntries(Array.from({ length: 256 }, (_, i) => [`m${i}`, {}]));
    const merged = mergeOpenCodeFreeModels(original, ["new-free"]);
    expect(Object.keys(merged)).toHaveLength(256);
    expect(merged.m0).toBeDefined();
    expect(merged["oc/new-free"]).toBeUndefined();
  });

  test("merges OpenCode free models without credentials, deduplicates and prunes retired oc models", async () => {
    const requests: Array<{ url: string; authorization: string | null }> = [];
    const models = await fetchNineRouterModels({
      env: { NINEROUTER_API_KEY: "private-key" },
      fetch: async (url, init) => {
        requests.push({ url: String(url), authorization: new Headers(init?.headers).get("Authorization") });
        if (String(url).includes("opencode.ai")) {
          return Response.json({ data: [{ id: "jev-1.13" }, { id: "jev-1.13-free" }, { id: "bad id-free" }] });
        }
        return Response.json({ data: [{ id: "oc/old-free" }, { id: "oc/jev-1.13" }, { id: "oc/jev-1.13-free" }, { id: "ordinary" }] });
      },
    });
    expect(models.map((model) => model.id)).toEqual(["oc/jev-1.13", "oc/jev-1.13-free", "ordinary"]);
    expect(requests.find((request) => request.url.includes("opencode.ai"))?.authorization).toBeNull();
  });

  test("runs public discovery concurrently and absorbs its failure when 9Router fails", async () => {
    let publicReject!: (error: Error) => void;
    const unhandled: unknown[] = [];
    const listener = (error: unknown) => unhandled.push(error);
    process.on("unhandledRejection", listener);
    try {
      await expect(fetchNineRouterModels({
        env: { NINEROUTER_API_KEY: "key" },
        fetch: async (url) => {
          if (String(url).startsWith("https://opencode.ai/")) {
            return new Promise<Response>((_resolve, reject) => { publicReject = reject; });
          }
          publicReject(new Error("late public failure"));
          throw new Error("9Router failure");
        },
      })).rejects.toThrow("9Router failure");
      await new Promise((resolve) => setTimeout(resolve, 0));
      expect(unhandled).toEqual([]);
    } finally {
      process.off("unhandledRejection", listener);
    }
  });

  test("slow public discovery does not add latency beyond its own timeout", async () => {
    const started = Date.now();
    const models = await fetchNineRouterModels({
      env: { NINEROUTER_API_KEY: "key" },
      fetch: async (url) => String(url).startsWith("https://opencode.ai/")
        ? new Promise<Response>(() => {})
        : Response.json({ data: [{ id: "ordinary" }] }),
    });
    expect(models.map((model) => model.id)).toEqual(["ordinary"]);
    expect(Date.now() - started).toBeLessThan(3_500);
  });

  test("falls back on public catalog failure and supports opt-out", async () => {
    for (const disabled of ["0", "false", "NO"]) {
      let calls = 0;
      const models = await fetchNineRouterModels({
        env: { NINEROUTER_API_KEY: "key", NINEROUTER_OPENCODE_FREE_DISCOVERY: disabled },
        fetch: async () => { calls++; return Response.json({ data: [{ id: "ordinary" }] }); },
      });
      expect(calls).toBe(1);
      expect(models.map((model) => model.id)).toEqual(["ordinary"]);
    }
    let calls = 0;
    const fallback = await fetchNineRouterModels({
      env: { NINEROUTER_API_KEY: "key" },
      fetch: async (url) => {
        calls++;
        if (String(url).startsWith("https://opencode.ai/")) throw new Error("public unavailable");
        return Response.json({ data: [{ id: "ordinary" }, { id: "oc/retired" }] });
      },
    });
    expect(fallback.map((model) => model.id)).toEqual(["ordinary", "oc/retired"]);
  });

  test("offline startup skips discovery but later refresh keeps injected dependencies", async () => {
    for (const PI_OFFLINE of ["1", "true", "yes"]) {
      let calls = 0;
      let config: Record<string, unknown> = {};
      const injected = new AbortController();
      const caller = new AbortController();
      let received: AbortSignal | undefined;
      await nineRouterDynamicProvider({ registerProvider: (_name: string, value: Record<string, unknown>) => { config = value; } } as never, {
        env: { NINEROUTER_API_KEY: "synthetic-key", PI_OFFLINE },
        signal: injected.signal,
        fetch: async (_url, init) => {
          calls++;
          received = init?.signal as AbortSignal;
          return Response.json({ data: [{ id: "test-model" }] });
        },
      });
      expect(config.models).toEqual([]);
      expect(calls).toBe(0);
      const refresh = config.refreshModels as (ctx: { signal: AbortSignal }) => Promise<unknown[]>;
      expect(await refresh({ signal: caller.signal })).toEqual([]);
      expect(calls).toBe(0);
      injected.abort();
      expect(received).toBeUndefined();
    }
  });

  test("retains last good catalog on invalid/empty/failing discovery and replaces it only on success", async () => {
    let config: Record<string, unknown> = {};
    let body = JSON.stringify({ data: [{ id: "first-model" }] });
    let fail = false;
    const injected = new AbortController();
    let received: AbortSignal | undefined;
    await nineRouterDynamicProvider({ registerProvider: (_name: string, value: Record<string, unknown>) => { config = value; } } as never, {
      env: { NINEROUTER_API_KEY: "synthetic-key" }, signal: injected.signal,
      fetch: async (_url, init) => {
        received = init?.signal as AbortSignal;
        received.throwIfAborted();
        if (fail) throw new Error("synthetic failure");
        return new Response(body);
      },
    });
    const refresh = config.refreshModels as (ctx?: { signal?: AbortSignal; allowNetwork?: boolean }) => Promise<Array<{ id: string }>>;
    for (const invalid of ["not-json", JSON.stringify({ data: [] }), JSON.stringify({ data: [{ id: "bad id" }] })]) {
      body = invalid;
      expect((await refresh()).map((model) => model.id)).toEqual(["first-model"]);
    }
    fail = true;
    expect((await refresh()).map((model) => model.id)).toEqual(["first-model"]);
    fail = false;
    body = JSON.stringify({ data: [{ id: "second-model" }] });
    expect((await refresh()).map((model) => model.id)).toEqual(["second-model"]);
    const caller = new AbortController();
    await refresh({ signal: caller.signal });
    caller.abort();
    expect(received?.aborted).toBe(true);
    injected.abort();
    expect((await refresh()).map((model) => model.id)).toEqual(["second-model"]);
  });

  test("startup rejects no catalog globally and forwards injected cancellation", async () => {
    for (const body of ["not-json", JSON.stringify({ data: [] }), JSON.stringify({ data: [{ id: "bad id" }] })]) {
      let config: Record<string, unknown> = {};
      await nineRouterDynamicProvider({ registerProvider: (_name: string, value: Record<string, unknown>) => { config = value; } } as never, {
        env: { NINEROUTER_API_KEY: "synthetic-key" },
        fetch: async () => new Response(body),
      });
      expect(config.models).toEqual([]);
    }
    const controller = new AbortController();
    controller.abort();
    let config: Record<string, unknown> = {};
    await nineRouterDynamicProvider({ registerProvider: (_name: string, value: Record<string, unknown>) => { config = value; } } as never, {
      env: { NINEROUTER_API_KEY: "synthetic-key" }, signal: controller.signal,
      fetch: async (_url, init) => {
        expect(init?.signal?.aborted).toBe(true);
        init?.signal?.throwIfAborted();
        throw new Error("unreachable");
      },
    });
    expect(config.models).toEqual([]);
  });
  test("skips provider registration when NINEROUTER_API_KEY is not set", async () => {
    const registered: unknown[] = [];
    const mockPi = {
      registerProvider: (...args: unknown[]) => registered.push(args),
    };

    await nineRouterDynamicProvider(mockPi as never, { env: {} });
    expect(registered).toHaveLength(0);
  });

  test("uses process.env by default when options are omitted", async () => {
    const registered: unknown[] = [];
    const mockPi = {
      registerProvider: (...args: unknown[]) => registered.push(args),
    };

    const originalFetch = globalThis.fetch;
    globalThis.fetch = (async () => Response.json({ data: [{ id: "test-model" }] })) as typeof fetch;
    const originalKey = process.env.NINEROUTER_API_KEY;
    const originalUrl = process.env.NINEROUTER_BASE_URL;
    try {
      delete process.env.NINEROUTER_API_KEY;
      delete process.env.NINEROUTER_BASE_URL;

      // Without key, no provider registered
      await nineRouterDynamicProvider(mockPi as never);
      expect(registered).toHaveLength(0);

      // With key and invalid URL, no provider registered and does not throw
      process.env.NINEROUTER_API_KEY = "env-key";
      process.env.NINEROUTER_BASE_URL = "ftp://invalid-host";
      await nineRouterDynamicProvider(mockPi as never);
      expect(registered).toHaveLength(0);

      // With key and valid default URL, provider registered with $NINEROUTER_API_KEY
      delete process.env.NINEROUTER_BASE_URL;
      await nineRouterDynamicProvider(mockPi as never);
      expect(registered).toHaveLength(1);
      const [name, config] = registered[0] as [string, Record<string, unknown>];
      expect(name).toBe(NINEROUTER_PROVIDER_ID);
      expect(config.apiKey).toBe("$NINEROUTER_API_KEY");
      expect(config.baseUrl).toBe(NINEROUTER_DEFAULT_BASE_URL);
    } finally {
      globalThis.fetch = originalFetch;
      if (originalKey !== undefined) process.env.NINEROUTER_API_KEY = originalKey;
      else delete process.env.NINEROUTER_API_KEY;
      if (originalUrl !== undefined) process.env.NINEROUTER_BASE_URL = originalUrl;
      else delete process.env.NINEROUTER_BASE_URL;
    }
  });

  test("skips provider registration and does not throw when NINEROUTER_BASE_URL is invalid", async () => {
    const registered: unknown[] = [];
    const mockPi = {
      registerProvider: (...args: unknown[]) => registered.push(args),
    };

    const invalidUrls = [
      "ftp://localhost:20128",
      "not-a-valid-url",
      "://bad-url",
      "http://localhost:20128/v1?token=secret",
      "http://localhost:20128/v1#section",
      "http://user:pass@localhost:20128/v1",
    ];

    for (const invalidUrl of invalidUrls) {
      registered.length = 0;
      await nineRouterDynamicProvider(mockPi as never, {
          env: {
            NINEROUTER_API_KEY: "valid-key",
            NINEROUTER_BASE_URL: invalidUrl,
          },
        });
      expect(registered).toHaveLength(0);
    }
  });

  test("registers 9Router provider with exact provider metadata when key is configured", async () => {
    let registeredName = "";
    let registeredConfig: Record<string, unknown> = {};
    const mockPi = {
      registerProvider: (name: string, config: Record<string, unknown>) => {
        registeredName = name;
        registeredConfig = config;
      },
    };

    await nineRouterDynamicProvider(mockPi as never, {
      fetch: async () => Response.json({ data: [{ id: "test-model" }] }),
      env: {
        NINEROUTER_API_KEY: "custom-test-key",
        NINEROUTER_BASE_URL: "http://127.0.0.1:20128/v1/",
      },
    });

    expect(registeredName).toBe(NINEROUTER_PROVIDER_ID);
    expect(registeredConfig.name).toBe("9Router");
    expect(registeredConfig.baseUrl).toBe("http://127.0.0.1:20128/v1");
    expect(registeredConfig.apiKey).toBe("$NINEROUTER_API_KEY");
    expect(registeredConfig.api).toBe("openai-completions");
    expect(registeredConfig.compat).toEqual({ supportsDeveloperRole: false });
    expect(typeof registeredConfig.refreshModels).toBe("function");
  });

  test("refreshModels retains ordinary and suffixed model IDs from mixed catalogs", async () => {
    let registeredConfig: Record<string, unknown> = {};
    const ids = ["cx/gpt-6-astra[1m]", "cx/gpt-6-sol[1m]", "cx/gpt-5.6-sol[1m]", "ordinary/model"];
    await nineRouterDynamicProvider({
      registerProvider: (_name: string, config: Record<string, unknown>) => { registeredConfig = config; },
    } as never, {
      env: { NINEROUTER_API_KEY: "test-key" },
      fetch: async () => new Response(JSON.stringify({ data: ids.map((id) => ({ id })) })),
    });

    const refreshModels = registeredConfig.refreshModels as (ctx?: unknown) => Promise<Array<{ id: string }>>;
    const models = await refreshModels();
    expect(models.map((model) => model.id)).toEqual(ids);
  });

  test("refreshModels retains exact Sol reasoning maps and conservative fallbacks", async () => {
    let registeredConfig: Record<string, unknown> = {};
    await nineRouterDynamicProvider({
      registerProvider: (_name: string, config: Record<string, unknown>) => { registeredConfig = config; },
    } as never, {
      env: { NINEROUTER_API_KEY: "test-key" },
      fetch: async () => new Response(JSON.stringify({ data: [
        { id: "cx/gpt-6.1-sol" },
        { id: "cx/gpt-6-sol" },
        { id: "cx/gpt-5.6-sol[1m]" },
        { id: "other/gpt-6-sol" },
        { id: "cx/gpt-6-sol[1m]" },
        { id: "ordinary/model" },
      ] })),
    });

    const refreshModels = registeredConfig.refreshModels as () => Promise<Array<Record<string, unknown>>>;
    const models = await refreshModels();
    expect(models.map((model) => model.id)).toEqual([
      "cx/gpt-6.1-sol", "cx/gpt-6-sol", "cx/gpt-5.6-sol[1m]",
      "other/gpt-6-sol", "cx/gpt-6-sol[1m]", "ordinary/model",
    ]);
    for (const model of models.slice(0, 2)) {
      expect(model).toMatchObject({
        reasoning: true,
        thinkingLevelMap: { off: null, minimal: null, low: "low", medium: "medium", high: "high", xhigh: "xhigh", max: "max" },
        compat: { supportsReasoningEffort: true },
      });
    }
    expect(models[2]).toMatchObject({
      reasoning: true,
      thinkingLevelMap: { off: "none", minimal: "minimal", low: "low", medium: "medium", high: "high", xhigh: "xhigh", max: "max" },
      compat: { supportsReasoningEffort: true },
    });
    for (const model of models.slice(3)) {
      expect(model).toMatchObject({ reasoning: false, compat: { supportsReasoningEffort: false } });
      expect(model.thinkingLevelMap).toBeUndefined();
    }
  });

  test("refreshModels returns discovered models when catalog is valid", async () => {
    let registeredConfig: Record<string, unknown> = {};
    const mockPi = {
      registerProvider: (_name: string, config: Record<string, unknown>) => {
        registeredConfig = config;
      },
    };

    await nineRouterDynamicProvider(mockPi as never, {
      env: { NINEROUTER_API_KEY: "test-key" },
      fetch: async () => new Response(JSON.stringify({
        data: [{ id: "mock-model-1", context_length: 64_000, max_completion_tokens: 4_096 }],
      })),
    });

    const refreshModels = registeredConfig.refreshModels as (ctx?: unknown) => Promise<unknown[]>;
    const models = await refreshModels();
    expect(models).toHaveLength(1);
    expect((models[0] as { id: string }).id).toBe("mock-model-1");
  });

  test("refreshModels returns empty array safely when offline or malformed", async () => {
    let registeredConfig: Record<string, unknown> = {};
    const mockPi = {
      registerProvider: (_name: string, config: Record<string, unknown>) => {
        registeredConfig = config;
      },
    };

    await nineRouterDynamicProvider(mockPi as never, {
      env: { NINEROUTER_API_KEY: "test-key" },
      fetch: async () => { throw new Error("connection reset by peer"); },
    });

    const refreshModels = registeredConfig.refreshModels as (ctx?: unknown) => Promise<unknown[]>;
    const result = await refreshModels();
    expect(result).toEqual([]);
  });

  test("refreshModels forwards external cancellation signal", async () => {
    let receivedSignal: AbortSignal | undefined;
    let registeredConfig: Record<string, unknown> = {};
    const mockPi = {
      registerProvider: (_name: string, config: Record<string, unknown>) => {
        registeredConfig = config;
      },
    };

    const controller = new AbortController();
    await nineRouterDynamicProvider(mockPi as never, {
      env: { NINEROUTER_API_KEY: "test-key" },
      fetch: async (_url, init) => {
        receivedSignal = init?.signal as AbortSignal;
        return new Response(JSON.stringify({ data: [{ id: "test-model" }] }));
      },
    });

    const refreshModels = registeredConfig.refreshModels as (ctx: { signal?: AbortSignal }) => Promise<unknown[]>;
    await refreshModels({ signal: controller.signal });
    expect(receivedSignal).toBeDefined();
    expect(receivedSignal?.aborted).toBe(false);

    controller.abort();
    expect(receivedSignal?.aborted).toBe(true);
  });
});

describe("provider coexistence", () => {
  let originalFetch: typeof fetch;
  let originalKey: string | undefined;
  beforeEach(() => {
    originalFetch = globalThis.fetch;
    originalKey = process.env.CLIPROXYAPI_API_KEY;
    process.env.CLIPROXYAPI_API_KEY = "synthetic-key";
    globalThis.fetch = (async () => Response.json({ models: [{ slug: "test-model" }] })) as typeof fetch;
  });
  afterEach(() => {
    globalThis.fetch = originalFetch;
    if (originalKey === undefined) delete process.env.CLIPROXYAPI_API_KEY;
    else process.env.CLIPROXYAPI_API_KEY = originalKey;
  });
  test("registers CLIProxyAPI and 9Router concurrently without interference", async () => {
    const providers = new Map<string, Record<string, unknown>>();
    const mockPi = {
      registerProvider: (name: string, config: Record<string, unknown>) => {
        providers.set(name, config);
      },
    };

    await cliproxyapiDynamicProvider(mockPi as never);
    await nineRouterDynamicProvider(mockPi as never, {
      env: { NINEROUTER_API_KEY: "nine-key" },
      fetch: async () => new Response(JSON.stringify({ data: [{ id: "nine-model" }] })),
    });

    expect(providers.has("cliproxyapi")).toBe(true);
    expect(providers.has("9router")).toBe(true);

    const nineRefresh = providers.get("9router")?.refreshModels as () => Promise<unknown[]>;
    const nineModels = await nineRefresh();
    expect(nineModels).toHaveLength(1);
    expect((nineModels[0] as { id: string }).id).toBe("nine-model");
  });

  test("CLIProxyAPI and 9Router failures do not disrupt each other", async () => {
    const providers = new Map<string, Record<string, unknown>>();
    const mockPi = {
      registerProvider: (name: string, config: Record<string, unknown>) => {
        providers.set(name, config);
      },
    };

    await cliproxyapiDynamicProvider(mockPi as never);
    await nineRouterDynamicProvider(mockPi as never, {
      env: { NINEROUTER_API_KEY: "nine-key" },
      fetch: async () => { throw new Error("9Router service is down"); },
    });

    const nineRefresh = providers.get("9router")?.refreshModels as () => Promise<unknown[]>;
    const nineResult = await nineRefresh();
    expect(nineResult).toEqual([]);
    expect(providers.has("cliproxyapi")).toBe(true);
  });
});
