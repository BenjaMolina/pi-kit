import { describe, expect, test } from "bun:test";
import { toPiModelFrom9Router } from "../src/cliproxyapi/pi-9router";
import { discoverNineRouterModels } from "../src/cliproxyapi/9router";

describe("9Router Pi model mapping and limits", () => {
  test("maps catalog model with exact wire ID and conservative text capability", () => {
    const model = toPiModelFrom9Router("team/model:latest", {
      limit: { context: 64_000, output: 8_192 },
    });

    expect(model).toEqual({
      id: "team/model:latest",
      name: "team/model:latest",
      reasoning: false,
      input: ["text"],
      cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
      contextWindow: 64_000,
      maxTokens: 8_192,
      compat: {
        supportsDeveloperRole: false,
        supportsReasoningEffort: false,
      },
    });
  });

  test("accepts raw catalog metadata format", () => {
    const model = toPiModelFrom9Router("custom-model", {
      context_length: 128_000,
      max_completion_tokens: 16_384,
    });

    expect(model).toMatchObject({
      id: "custom-model",
      name: "custom-model",
      contextWindow: 128_000,
      maxTokens: 16_384,
    });
  });

  test("falls back to default limits when metadata is missing or invalid", () => {
    const missing = toPiModelFrom9Router("default-limits", {});
    expect(missing?.contextWindow).toBe(32_000);
    expect(missing?.maxTokens).toBe(4_096);

    const invalid = toPiModelFrom9Router("invalid-limits", {
      limit: { context: -100, output: -50 },
    });
    expect(invalid?.contextWindow).toBe(32_000);
    expect(invalid?.maxTokens).toBe(4_096);
  });

  test("enforces maximum bounds and context/output headroom", () => {
    const oversize = toPiModelFrom9Router("oversize", {
      limit: { context: 5_000_000, output: 200_000 },
    });
    expect(oversize?.contextWindow).toBe(1_048_576);
    expect(oversize?.maxTokens).toBe(65_536);

    const boundary = toPiModelFrom9Router("boundary", {
      limit: { context: 2, output: 10 },
    });
    expect(boundary?.contextWindow).toBe(2);
    expect(boundary?.maxTokens).toBe(1);
  });

  test("rejects invalid, unsafe, or blank model IDs", () => {
    expect(toPiModelFrom9Router("")).toBeUndefined();
    expect(toPiModelFrom9Router("   ")).toBeUndefined();
    expect(toPiModelFrom9Router("__proto__")).toBeUndefined();
    expect(toPiModelFrom9Router("prototype")).toBeUndefined();
    expect(toPiModelFrom9Router("constructor")).toBeUndefined();
    expect(toPiModelFrom9Router("has space")).toBeUndefined();
    expect(toPiModelFrom9Router("has$dollar")).toBeUndefined();
    expect(toPiModelFrom9Router("a".repeat(201))).toBeUndefined();
  });
});

describe("9Router catalog discovery", () => {
  test("requests the authenticated model catalog and validates discovered entries", async () => {
    let requestedUrl = "";
    let authorization = "";
    const models = await discoverNineRouterModels(
      "http://127.0.0.1:20128/v1",
      "test-auth-key",
      async (url, init) => {
        requestedUrl = String(url);
        authorization = new Headers(init?.headers).get("Authorization") ?? "";
        return new Response(JSON.stringify({
          data: [
            { id: "meta-llama/Llama-3.3", context_length: 131_072, max_completion_tokens: 8_192 },
            { id: "qwen/coder" },
          ],
        }));
      },
    );

    expect(requestedUrl).toBe("http://127.0.0.1:20128/v1/models");
    expect(authorization).toBe("Bearer test-auth-key");
    expect(models["meta-llama/Llama-3.3"]).toMatchObject({
      limit: { context: 131_072, output: 8_192 },
      modalities: { input: ["text"], output: ["text"] },
    });
    expect(models["qwen/coder"]).toMatchObject({ limit: { context: 32_000, output: 4_096 } });
  });

  test("rejects unavailable, malformed, empty, oversized, and unsafe catalogs", async () => {
    await expect(discoverNineRouterModels(
      "http://localhost/v1", "key", async () => new Response("", { status: 401 }),
    )).rejects.toThrow("9Router catalog unavailable");

    for (const body of [
      "not-json",
      JSON.stringify({ not_data: [] }),
      JSON.stringify({ data: [] }),
      JSON.stringify({ data: [{ id: "bad id" }] }),
      JSON.stringify({ data: [{ id: "__proto__" }] }),
      JSON.stringify({ data: [{ id: "duplicate" }, { id: "duplicate" }] }),
      JSON.stringify({ data: Array.from({ length: 257 }, (_, i) => ({ id: `model-${i}` })) }),
    ]) {
      await expect(discoverNineRouterModels(
        "http://localhost/v1", "key", async () => new Response(body),
      )).rejects.toThrow();
    }
  });

  test("honors an already-aborted signal and remains compatible with default signal behavior", async () => {
    const controller = new AbortController();
    controller.abort(new Error("Pre-aborted test signal"));
    await expect(discoverNineRouterModels(
      "http://localhost/v1", "key", globalThis.fetch, controller.signal,
    )).rejects.toThrow();

    const result = await discoverNineRouterModels(
      "http://localhost/v1", "key",
      async () => new Response(JSON.stringify({ data: [{ id: "model-compat" }] })),
    );
    expect(Object.keys(result)).toEqual(["model-compat"]);
  });
});
