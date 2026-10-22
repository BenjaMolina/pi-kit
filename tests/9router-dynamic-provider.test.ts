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
import { discoverOpenCodeModelLimits, discoverOpenCodeModels, mergeOpenCodeFreeModels } from "../src/cliproxyapi/9router";

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

  test("enriches only newly added exact OpenCode free IDs from models.dev limits", async () => {
    const models = await fetchNineRouterModels({
      env: { NINEROUTER_API_KEY: "key" },
      fetch: async (url) => {
        if (String(url).includes("opencode.ai")) return Response.json({ data: [{ id: "deepseek-r2-free" }, { id: "jev-1.13-free" }, { id: "not-listed-free" }] });
        if (String(url).includes("models.dev")) return Response.json({ opencode: { models: {
          "deepseek-r2-free": { limit: { context: 200_000, output: 32_000 } },
          "jev-1.13-free": { limit: { context: 150_000, output: 24_000 } },
        } } });
        return Response.json({ data: [{ id: "oc/jev-1.13-free", context_length: 90_000, max_completion_tokens: 8_000 }] });
      },
    });
    expect(models.find((model) => model.id === "oc/deepseek-r2-free")).toMatchObject({ contextWindow: 200_000, maxTokens: 32_000 });
    expect(models.find((model) => model.id === "oc/jev-1.13-free")).toMatchObject({ contextWindow: 90_000, maxTokens: 8_000 });
    expect(models.find((model) => model.id === "oc/not-listed-free")).toMatchObject({ contextWindow: 32_000, maxTokens: 4_096 });
  });

  test("models.dev declared oversized body falls back to Zen IDs", async () => {
    const models = await fetchNineRouterModels({ env: { NINEROUTER_API_KEY: "key" }, fetch: async (url) => {
      if (String(url).includes("opencode.ai")) return Response.json({ data: [{ id: "declared-free" }] });
      if (String(url).includes("models.dev")) return new Response("", { headers: { "content-length": "10000001" } });
      return Response.json({ data: [{ id: "ordinary" }] });
    } });
    expect(models.find((model) => model.id === "oc/declared-free")).toMatchObject({ contextWindow: 32_000, maxTokens: 4_096 });
  });

  test("models.dev streamed oversized body cancels stream and falls back to Zen IDs", async () => {
    let canceled = false;
    const body = new ReadableStream<Uint8Array>({
      pull(controller) {
        if (controller.desiredSize === null) return;
        controller.enqueue(new Uint8Array(10_000_001));
      },
      cancel() { canceled = true; },
    });
    const models = await fetchNineRouterModels({ env: { NINEROUTER_API_KEY: "key" }, fetch: async (url) => {
      if (String(url).includes("opencode.ai")) return Response.json({ data: [{ id: "streamed-free" }] });
      if (String(url).includes("models.dev")) return new Response(body);
      return Response.json({ data: [{ id: "ordinary" }] });
    } });
    expect(models.find((model) => model.id === "oc/streamed-free")).toMatchObject({ contextWindow: 32_000, maxTokens: 4_096 });
    expect(canceled).toBe(true);
  });

  test("models.dev invalid numeric limits are ignored and valid limits obey safety caps", async () => {
    const invalid = [-1, 0, "200000", 1.5, Number.MAX_SAFE_INTEGER + 1];
    const models = await fetchNineRouterModels({ env: { NINEROUTER_API_KEY: "key" }, fetch: async (url) => {
      if (String(url).includes("opencode.ai")) return Response.json({ data: [
        ...invalid.map((_, index) => ({ id: `invalid-${index}-free` })),
        { id: "context-cap-free" }, { id: "output-cap-free" }, { id: "headroom-free" },
      ] });
      if (String(url).includes("models.dev")) return Response.json({ opencode: { models: Object.fromEntries([
        ...invalid.map((value, index) => [`invalid-${index}-free`, { limit: { context: value, output: value } }]),
        ["context-cap-free", { limit: { context: 2_000_000, output: 80_000 } }],
        ["output-cap-free", { limit: { context: 100_000, output: 80_000 } }],
        ["headroom-free", { limit: { context: 32, output: 65_536 } }],
      ]) } });
      return Response.json({ data: [{ id: "ordinary" }] });
    } });
    for (let index = 0; index < invalid.length; index++) {
      expect(models.find((model) => model.id === `oc/invalid-${index}-free`)).toMatchObject({ contextWindow: 32_000, maxTokens: 4_096 });
    }
    expect(models.find((model) => model.id === "oc/context-cap-free")).toMatchObject({ contextWindow: 1_048_576, maxTokens: 65_536 });
    expect(models.find((model) => model.id === "oc/output-cap-free")).toMatchObject({ contextWindow: 100_000, maxTokens: 65_536 });
    expect(models.find((model) => model.id === "oc/headroom-free")).toMatchObject({ contextWindow: 32, maxTokens: 31 });
  });

  test("missing exact free metadata does not inherit paid base limits", async () => {
    const models = await fetchNineRouterModels({ env: { NINEROUTER_API_KEY: "key" }, fetch: async (url) => {
      if (String(url).includes("opencode.ai")) return Response.json({ data: [{ id: "deepseek-free" }] });
      if (String(url).includes("models.dev")) return Response.json({ opencode: { models: {
        "deepseek": { limit: { context: 1_000_000, output: 384_000 } },
      } } });
      return Response.json({ data: [{ id: "ordinary" }] });
    } });
    expect(models.find((model) => model.id === "oc/deepseek-free")).toMatchObject({ contextWindow: 32_000, maxTokens: 4_096 });
  });

  test("public Zen and models.dev requests never receive authorization or API keys", async () => {
    const requests: Array<{ url: string; authorization: string | null }> = [];
    await fetchNineRouterModels({ env: { NINEROUTER_API_KEY: "private-key" }, fetch: async (url, init) => {
      requests.push({ url: String(url), authorization: new Headers(init?.headers).get("Authorization") });
      if (String(url).includes("opencode.ai")) return Response.json({ data: [{ id: "header-free" }] });
      if (String(url).includes("models.dev")) return Response.json({ opencode: { models: {} } });
      return Response.json({ data: [{ id: "ordinary" }] });
    } });
    for (const request of requests.filter(({ url }) => url.includes("opencode.ai") || url.includes("models.dev"))) {
      expect(request.authorization).toBeNull();
    }
    expect(requests.filter(({ url }) => url.includes("opencode.ai") || url.includes("models.dev"))).toHaveLength(2);
  });

  test("models.dev failures and invalid metadata leave Zen IDs available with conservative limits", async () => {
    for (const metadataResponse of [new Response("unavailable", { status: 503 }), new Response("not-json"), Response.json({ other: {} })]) {
      const models = await fetchNineRouterModels({ env: { NINEROUTER_API_KEY: "key" }, fetch: async (url) => {
        if (String(url).includes("opencode.ai")) return Response.json({ data: [{ id: "fallback-free" }] });
        if (String(url).includes("models.dev")) return metadataResponse;
        return Response.json({ data: [{ id: "ordinary" }] });
      } });
      expect(models.find((model) => model.id === "oc/fallback-free")).toMatchObject({ contextWindow: 32_000, maxTokens: 4_096 });
    }
  });

  test("models.dev cache is scoped by fetch, coalesces requests, and expires", async () => {
    const originalNow = Date.now;
    let now = originalNow();
    Date.now = () => now;
    try {
      let calls = 0;
      let release!: (response: Response) => void;
      const fetcher = async () => {
        calls++;
        if (calls === 1) return new Promise<Response>((resolve) => { release = resolve; });
        return Response.json({ opencode: { models: {} } });
      };
      const first = discoverOpenCodeModelLimits(fetcher);
      const second = discoverOpenCodeModelLimits(fetcher);
      await new Promise((resolve) => setTimeout(resolve, 0));
      expect(calls).toBe(1);
      release(Response.json({ opencode: { models: { "x-free": { limit: { context: 20_000, output: 2_000 } } } } }));
      await Promise.all([first, second]);
      await discoverOpenCodeModelLimits(fetcher);
      expect(calls).toBe(1);
      await discoverOpenCodeModelLimits(async () => { calls++; return Response.json({ opencode: { models: {} } }); });
      expect(calls).toBe(2);
      now += 60 * 60 * 1_000 + 1;
      await discoverOpenCodeModelLimits(fetcher);
      expect(calls).toBe(3);
    } finally { Date.now = originalNow; }
  });

  test("does not admit late metadata completion after internal timeout", async () => {
    let calls = 0;
    const fetcher = async () => {
      calls++;
      if (calls === 1) return new Promise<Response>((resolve) => {
        setTimeout(() => resolve(Response.json({ opencode: { models: { "late-free": { limit: { context: 99_000, output: 9_000 } } } } })), 3_100);
      });
      return Response.json({ opencode: { models: { "current-free": { limit: { context: 21_000, output: 2_100 } } } } });
    };
    const late = discoverOpenCodeModelLimits(fetcher).then(() => "resolved", () => "rejected");
    await new Promise((resolve) => setTimeout(resolve, 3_200));
    expect(await late).toBe("rejected");
    await discoverOpenCodeModelLimits(fetcher);
    const cached = await discoverOpenCodeModelLimits(fetcher);
    expect(calls).toBe(2);
    expect(cached.has("current-free")).toBe(true);
  });

  test("skips both public catalogs when free discovery is opted out", async () => {
    let calls = 0;
    await fetchNineRouterModels({ env: { NINEROUTER_API_KEY: "key", NINEROUTER_OPENCODE_FREE_DISCOVERY: "0" }, fetch: async () => {
      calls++;
      return Response.json({ data: [{ id: "ordinary" }] });
    } });
    expect(calls).toBe(1);
  });

  test("keeps Zen availability and pruning when models.dev never resolves", async () => {
    const started = Date.now();
    const models = await fetchNineRouterModels({ env: { NINEROUTER_API_KEY: "key" }, fetch: async (url) => {
      if (String(url).includes("opencode.ai")) return Response.json({ data: [{ id: "fresh-free" }] });
      if (String(url).includes("models.dev")) return new Promise<Response>(() => {});
      return Response.json({ data: [{ id: "ordinary" }, { id: "oc/retired-free" }] });
    } });
    expect(models.map((model) => model.id)).toEqual(["ordinary", "oc/fresh-free"]);
    expect(Date.now() - started).toBeLessThan(3_500);
  });

  test("cleans caller abort listeners after successful and canceled metadata waits", async () => {
    const controller = new AbortController();
    const signal = controller.signal;
    const add = signal.addEventListener.bind(signal);
    const remove = signal.removeEventListener.bind(signal);
    let added = 0;
    let removed = 0;
    signal.addEventListener = ((type: string, listener: EventListenerOrEventListenerObject, options?: boolean | AddEventListenerOptions) => {
      if (type === "abort") added++;
      return add(type, listener, options);
    }) as typeof signal.addEventListener;
    signal.removeEventListener = ((type: string, listener: EventListenerOrEventListenerObject, options?: boolean | EventListenerOptions) => {
      if (type === "abort") removed++;
      return remove(type, listener, options);
    }) as typeof signal.removeEventListener;
    const run = (abortAfterMetadata: boolean) => fetchNineRouterModels({ signal, env: { NINEROUTER_API_KEY: "key" }, fetch: async (url) => {
      if (String(url).includes("opencode.ai")) return Response.json({ data: [{ id: "listener-free" }] });
      if (String(url).includes("models.dev")) {
        if (abortAfterMetadata) {
          setTimeout(() => controller.abort(), 0);
          return new Promise<Response>(() => {});
        }
        return Response.json({ opencode: { models: {} } });
      }
      return Response.json({ data: [{ id: "ordinary" }] });
    } });
    await run(false);
    await expect(run(true)).rejects.toThrow();
    expect(added).toBe(removed);
  });

  test("aborting one caller does not cancel shared metadata fetch for another caller", async () => {
    const controller = new AbortController();
    let release!: (response: Response) => void;
    let metadataCalls = 0;
    const fetcher = async (url: string | URL | Request, init?: RequestInit) => {
      if (String(url).includes("opencode.ai")) return Response.json({ data: [{ id: "shared-free" }] });
      if (String(url).includes("models.dev")) {
        metadataCalls++;
        expect(init?.signal?.aborted).toBe(false);
        return new Promise<Response>((resolve) => { release = resolve; });
      }
      return Response.json({ data: [{ id: "ordinary" }] });
    };
    const aborted = fetchNineRouterModels({ signal: controller.signal, env: { NINEROUTER_API_KEY: "key" }, fetch: fetcher });
    const healthy = fetchNineRouterModels({ env: { NINEROUTER_API_KEY: "key" }, fetch: fetcher });
    await new Promise((resolve) => setTimeout(resolve, 0));
    controller.abort();
    await expect(aborted).rejects.toThrow();
    release(Response.json({ opencode: { models: { "shared-free": { limit: { context: 20_000, output: 2_000 } } } } }));
    expect((await healthy).find((model) => model.id === "oc/shared-free")).toMatchObject({ contextWindow: 20_000, maxTokens: 2_000 });
    expect(metadataCalls).toBe(1);
  });

  test("cancellation during optional metadata wait rejects refresh", async () => {
    const controller = new AbortController();
    let calls = 0;
    const request = fetchNineRouterModels({ signal: controller.signal, env: { NINEROUTER_API_KEY: "key" }, fetch: async (url) => {
      calls++;
      if (String(url).includes("opencode.ai")) return Response.json({ data: [{ id: "fresh-free" }] });
      if (String(url).includes("models.dev")) {
        setTimeout(() => controller.abort(), 10);
        return new Promise<Response>(() => {});
      }
      return Response.json({ data: [{ id: "ordinary" }] });
    } });
    await expect(request).rejects.toThrow();
    expect(calls).toBe(3);
  });

  test("Zen consuming most of the shared deadline still keeps IDs when metadata hangs", async () => {
    const started = Date.now();
    const models = await fetchNineRouterModels({ env: { NINEROUTER_API_KEY: "key" }, fetch: async (url) => {
      if (String(url).includes("opencode.ai")) {
        await new Promise((resolve) => setTimeout(resolve, 2_600));
        return Response.json({ data: [{ id: "late-zen-free" }] });
      }
      if (String(url).includes("models.dev")) return new Promise<Response>(() => {});
      return Response.json({ data: [{ id: "ordinary" }] });
    } });
    expect(models.map((model) => model.id)).toEqual(["ordinary", "oc/late-zen-free"]);
    expect(Date.now() - started).toBeLessThan(3_500);
  });

  test("merges Zen IDs after optional metadata exceeds the shared startup deadline", async () => {
    const started = Date.now();
    const models = await fetchNineRouterModels({ env: { NINEROUTER_API_KEY: "key" }, fetch: async (url) => {
      if (String(url).includes("opencode.ai")) return Response.json({ data: [{ id: "fresh-free" }] });
      if (String(url).includes("models.dev")) return new Promise<Response>(() => {});
      return Response.json({ data: [{ id: "ordinary" }] });
    } });
    expect(models.map((model) => model.id)).toEqual(["ordinary", "oc/fresh-free"]);
    expect(Date.now() - started).toBeLessThan(3_500);
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
        if (String(url).includes("models.dev")) return Response.json({ opencode: { models: {} } });
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

  test("refreshModels enables vision from sanitized catalog capability without modality metadata", async () => {
    let registeredConfig: Record<string, unknown> = {};
    await nineRouterDynamicProvider({
      registerProvider: (_name: string, config: Record<string, unknown>) => { registeredConfig = config; },
    } as never, {
      env: { NINEROUTER_API_KEY: "test-key", NINEROUTER_OPENCODE_FREE_DISCOVERY: "0" },
      fetch: async () => Response.json({ data: [
        { id: "cx/gpt-5.6-terra", modalities: null, capabilities: { vision: true, unknown: "ignored" } },
        { id: "cx/not-vision", modalities: null, capabilities: { vision: "true" } },
      ] }),
    });

    const refreshModels = registeredConfig.refreshModels as () => Promise<Array<Record<string, unknown>>>;
    const models = await refreshModels();
    expect(models.find((model) => model.id === "cx/gpt-5.6-terra")?.input).toEqual(["text", "image"]);
    expect(models.find((model) => model.id === "cx/not-vision")?.input).toEqual(["text"]);
  });

  test("refreshModels maps capability-driven thinking levels and suffixes end to end", async () => {
    let registeredConfig: Record<string, unknown> = {};
    await nineRouterDynamicProvider({
      registerProvider: (_name: string, config: Record<string, unknown>) => { registeredConfig = config; },
    } as never, {
      env: { NINEROUTER_API_KEY: "test-key", NINEROUTER_OPENCODE_FREE_DISCOVERY: "0" },
      fetch: async () => new Response(JSON.stringify({ data: [
        { id: "cc/claude-sonnet-5", capabilities: { reasoning: true, thinkingFormat: "claude-adaptive", thinkingCanDisable: true } },
        { id: "cc/claude-opus-5-5", capabilities: { reasoning: true, thinkingFormat: "claude-adaptive", thinkingCanDisable: false } },
        { id: "ag/gemini-3.1-pro-high", capabilities: { reasoning: true, thinkingFormat: "gemini-level" } },
        { id: "cx/gpt-6.1-sol", capabilities: { reasoning: false } },
        { id: "ordinary/no-capabilities" },
      ] })),
    });

    const refreshModels = registeredConfig.refreshModels as () => Promise<Array<Record<string, unknown>>>;
    const models = await refreshModels();
    expect(models.map((model) => model.id)).toEqual([
      "cc/claude-sonnet-5", "cc/claude-opus-5-5", "ag/gemini-3.1-pro-high", "cx/gpt-6.1-sol", "ordinary/no-capabilities",
    ]);
    expect(models[0]).toMatchObject({ reasoning: true, compat: { supportsReasoningEffort: true }, thinkingLevelMap: { off: "none", low: "low", high: "high" } });
    expect(models[1]).toMatchObject({ reasoning: true, compat: { supportsReasoningEffort: true }, thinkingLevelMap: { off: null, low: "low", high: "high" } });
    expect(models[2]).toMatchObject({ reasoning: false, compat: { supportsReasoningEffort: false } });
    expect(models[2].thinkingLevelMap).toBeUndefined();
    expect(models[3]).toMatchObject({ reasoning: true, compat: { supportsReasoningEffort: true }, thinkingLevelMap: { off: null, low: "low", high: "high", xhigh: "xhigh", max: "max" } });
    expect(models[4]).toMatchObject({ reasoning: false, compat: { supportsReasoningEffort: false } });
    expect(models[4].thinkingLevelMap).toBeUndefined();
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
