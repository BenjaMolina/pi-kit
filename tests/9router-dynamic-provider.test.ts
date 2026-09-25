import { describe, expect, test } from "bun:test";
import nineRouterDynamicProvider, {
  fetchNineRouterModels,
  NINEROUTER_DEFAULT_BASE_URL,
  NINEROUTER_PROVIDER_ID,
  requireNineRouterApiKey,
  resolveNineRouterApiKey,
  resolveNineRouterBaseUrl,
} from "../extensions/9router-dynamic-provider";
import cliproxyapiDynamicProvider from "../extensions/cliproxyapi-dynamic-provider";

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
  test("skips provider registration when NINEROUTER_API_KEY is not set", () => {
    const registered: unknown[] = [];
    const mockPi = {
      registerProvider: (...args: unknown[]) => registered.push(args),
    };

    nineRouterDynamicProvider(mockPi as never, { env: {} });
    expect(registered).toHaveLength(0);
  });

  test("uses process.env by default when options are omitted", () => {
    const registered: unknown[] = [];
    const mockPi = {
      registerProvider: (...args: unknown[]) => registered.push(args),
    };

    const originalKey = process.env.NINEROUTER_API_KEY;
    const originalUrl = process.env.NINEROUTER_BASE_URL;
    try {
      delete process.env.NINEROUTER_API_KEY;
      delete process.env.NINEROUTER_BASE_URL;

      // Without key, no provider registered
      nineRouterDynamicProvider(mockPi as never);
      expect(registered).toHaveLength(0);

      // With key and invalid URL, no provider registered and does not throw
      process.env.NINEROUTER_API_KEY = "env-key";
      process.env.NINEROUTER_BASE_URL = "ftp://invalid-host";
      expect(() => nineRouterDynamicProvider(mockPi as never)).not.toThrow();
      expect(registered).toHaveLength(0);

      // With key and valid default URL, provider registered with $NINEROUTER_API_KEY
      delete process.env.NINEROUTER_BASE_URL;
      nineRouterDynamicProvider(mockPi as never);
      expect(registered).toHaveLength(1);
      const [name, config] = registered[0] as [string, Record<string, unknown>];
      expect(name).toBe(NINEROUTER_PROVIDER_ID);
      expect(config.apiKey).toBe("$NINEROUTER_API_KEY");
      expect(config.baseUrl).toBe(NINEROUTER_DEFAULT_BASE_URL);
    } finally {
      if (originalKey !== undefined) process.env.NINEROUTER_API_KEY = originalKey;
      else delete process.env.NINEROUTER_API_KEY;
      if (originalUrl !== undefined) process.env.NINEROUTER_BASE_URL = originalUrl;
      else delete process.env.NINEROUTER_BASE_URL;
    }
  });

  test("skips provider registration and does not throw when NINEROUTER_BASE_URL is invalid", () => {
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
      expect(() => {
        nineRouterDynamicProvider(mockPi as never, {
          env: {
            NINEROUTER_API_KEY: "valid-key",
            NINEROUTER_BASE_URL: invalidUrl,
          },
        });
      }).not.toThrow();
      expect(registered).toHaveLength(0);
    }
  });

  test("registers 9Router provider with exact provider metadata when key is configured", () => {
    let registeredName = "";
    let registeredConfig: Record<string, unknown> = {};
    const mockPi = {
      registerProvider: (name: string, config: Record<string, unknown>) => {
        registeredName = name;
        registeredConfig = config;
      },
    };

    nineRouterDynamicProvider(mockPi as never, {
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
    expect(registeredConfig.compat).toEqual({
      supportsDeveloperRole: false,
      supportsReasoningEffort: false,
    });
    expect(typeof registeredConfig.refreshModels).toBe("function");
  });

  test("refreshModels returns discovered models when catalog is valid", async () => {
    let registeredConfig: Record<string, unknown> = {};
    const mockPi = {
      registerProvider: (_name: string, config: Record<string, unknown>) => {
        registeredConfig = config;
      },
    };

    nineRouterDynamicProvider(mockPi as never, {
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

    nineRouterDynamicProvider(mockPi as never, {
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
    nineRouterDynamicProvider(mockPi as never, {
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
  test("registers CLIProxyAPI and 9Router concurrently without interference", async () => {
    const providers = new Map<string, Record<string, unknown>>();
    const mockPi = {
      registerProvider: (name: string, config: Record<string, unknown>) => {
        providers.set(name, config);
      },
    };

    cliproxyapiDynamicProvider(mockPi as never);
    nineRouterDynamicProvider(mockPi as never, {
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

    cliproxyapiDynamicProvider(mockPi as never);
    nineRouterDynamicProvider(mockPi as never, {
      env: { NINEROUTER_API_KEY: "nine-key" },
      fetch: async () => { throw new Error("9Router service is down"); },
    });

    const nineRefresh = providers.get("9router")?.refreshModels as () => Promise<unknown[]>;
    const nineResult = await nineRefresh();
    expect(nineResult).toEqual([]);
    expect(providers.has("cliproxyapi")).toBe(true);
  });
});
