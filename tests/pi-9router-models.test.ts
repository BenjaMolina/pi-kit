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

  test("enables only exact provider-qualified Sol model reasoning levels", () => {
    const sixLevels = { off: null, minimal: null, low: "low", medium: "medium", high: "high", xhigh: "xhigh", max: "max" };
    for (const id of ["cx/gpt-6.1-sol", "cx/gpt-6-sol"]) {
      expect(toPiModelFrom9Router(id)).toMatchObject({
        reasoning: true,
        thinkingLevelMap: sixLevels,
        compat: { supportsDeveloperRole: false, supportsReasoningEffort: true },
      });
    }
    expect(toPiModelFrom9Router("cx/gpt-5.6-sol[1m]")).toMatchObject({
      reasoning: true,
      thinkingLevelMap: { off: "none", minimal: "minimal", low: "low", medium: "medium", high: "high", xhigh: "xhigh", max: "max" },
      compat: { supportsDeveloperRole: false, supportsReasoningEffort: true },
    });
    for (const id of [
      "other/gpt-6-sol", "cx/gpt-6-sol[1m]", "cx/gpt-6.1-sol[1m]", "cx/GPT-6-sol",
      "cx/gpt-5.6-sol", "cx/gpt-5.6-sol[1m][1m]", "cx/gpt-5.6-sol[1m]extra", "gpt-6-sol",
    ]) {
      const model = toPiModelFrom9Router(id);
      if (model) {
        expect(model).toMatchObject({
          reasoning: false,
          compat: { supportsDeveloperRole: false, supportsReasoningEffort: false },
        });
        expect(model.thinkingLevelMap).toBeUndefined();
      } else {
        expect(model).toBeUndefined();
      }
    }
  });

  test("maps capability-driven thinking levels and excludes effort-suffixed IDs", () => {
    const allLevels = { off: "none", minimal: null, low: "low", medium: "medium", high: "high", xhigh: "xhigh", max: "max" };
    const adaptive = toPiModelFrom9Router("cc/claude-sonnet-5", { capabilities: { reasoning: true, thinkingFormat: "claude-adaptive", thinkingCanDisable: true } });
    expect(adaptive).toMatchObject({ reasoning: true, thinkingLevelMap: allLevels, compat: { supportsReasoningEffort: true } });
    expect(toPiModelFrom9Router("cc/claude-sonnet-5", { capabilities: { reasoning: true, thinkingFormat: "claude-adaptive", thinkingCanDisable: false } })?.thinkingLevelMap?.off).toBeNull();
    expect(toPiModelFrom9Router("ag/gemini-3.1-pro", { capabilities: { reasoning: true, thinkingFormat: "gemini-level" } })?.thinkingLevelMap).toEqual({ off: null, minimal: "minimal", low: "low", medium: "medium", high: "high", xhigh: null, max: null });
    expect(toPiModelFrom9Router("ag/gemini-4-pro", { capabilities: { reasoning: true, thinkingFormat: "gemini-level" } })?.thinkingLevelMap).toEqual({ off: null, minimal: null, low: "low", medium: "medium", high: "high", xhigh: null, max: null });
    expect(toPiModelFrom9Router("ag/claude-sonnet-4-6", { capabilities: { reasoning: true, thinkingFormat: "claude-adaptive" } })?.thinkingLevelMap).toEqual({ off: "none", minimal: null, low: "low", medium: "medium", high: "high", xhigh: null, max: "max" });
    for (const level of ["high", "medium", "low"]) expect(toPiModelFrom9Router(`ag/claude-sonnet-5-5-${level}`, { capabilities: { reasoning: true, thinkingFormat: "claude-adaptive" } })).toMatchObject({ reasoning: false, compat: { supportsReasoningEffort: false } });
    expect(toPiModelFrom9Router("oc/model-free", { capabilities: { name: "hostile" } })).toMatchObject({ reasoning: false });
  });

  test("strips the [1m] suffix before checking effort-suffixed IDs and maps other formats", () => {
    const adaptive = { capabilities: { reasoning: true, thinkingFormat: "claude-adaptive", thinkingCanDisable: true } };
    expect(toPiModelFrom9Router("ag/claude-sonnet-5-5-high[1m]", adaptive)).toMatchObject({ reasoning: false });
    expect(toPiModelFrom9Router("cc/claude-sonnet-5[1m]", adaptive)).toMatchObject({ reasoning: true });
    expect(toPiModelFrom9Router("cc/claude-haiku-4-5-20251001", { capabilities: { reasoning: true, thinkingFormat: "claude-budget", thinkingCanDisable: true } })?.thinkingLevelMap)
      .toEqual({ off: "none", minimal: null, low: "low", medium: "medium", high: "high", xhigh: "xhigh", max: "max" });
    expect(toPiModelFrom9Router("mmf/mimo-auto", { capabilities: { reasoning: true, thinkingFormat: "deepseek", thinkingCanDisable: false } })?.thinkingLevelMap)
      .toEqual({ off: null, minimal: null, low: null, medium: null, high: "high", xhigh: null, max: "max" });
  });

  test("preserves image input only when catalog modality explicitly declares it", () => {
    expect(toPiModelFrom9Router("image-model", { modalities: { input: ["text", "image"] } })?.input).toEqual(["text", "image"]);
    expect(toPiModelFrom9Router("image-without-text", { modalities: { input: ["image"] } })?.input).toEqual(["text", "image"]);
    expect(toPiModelFrom9Router("text-model", { modalities: { input: ["text"] } })?.input).toEqual(["text"]);
    expect(toPiModelFrom9Router("missing-modalities", {})?.input).toEqual(["text"]);
    expect(toPiModelFrom9Router("malformed-modalities", { modalities: { input: "image" } })?.input).toEqual(["text"]);
    expect(toPiModelFrom9Router("oversized-modalities", { modalities: { input: [...Array(16).fill("text"), "image"] } })?.input).toEqual(["text"]);
    expect(toPiModelFrom9Router("non-string-modality", { modalities: { input: ["text", "image", 1] } })?.input).toEqual(["text"]);
    expect(toPiModelFrom9Router("overlong-modality", { modalities: { input: ["text", "image", "x".repeat(33)] } })?.input).toEqual(["text"]);
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

  test("accepts only the optional trailing [1m] suffix on valid model IDs", () => {
    for (const id of ["cx/gpt-6-astra[1m]", "cx/gpt-6-sol[1m]", "cx/gpt-5.6-sol[1m]"]) {
      expect(toPiModelFrom9Router(id)?.id).toBe(id);
    }

    for (const id of ["cx/model[1m]tail", "cx/model[[1m]", "cx/model[1m]]", "cx/model[1m][1m]", "cx/model[2m]"]) {
      expect(toPiModelFrom9Router(id)).toBeUndefined();
    }
  });

  test("preserves the 200-character limit for suffixed IDs", () => {
    expect(toPiModelFrom9Router(`${"a".repeat(196)}[1m]`)?.id).toBe(`${"a".repeat(196)}[1m]`);
    expect(toPiModelFrom9Router(`${"a".repeat(197)}[1m]`)).toBeUndefined();
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
            { id: "vision/model", modalities: { input: ["text", "image"], output: ["text"], unrelated: "discard" }, raw: "discard" },
            { id: "malformed/model", modalities: { input: ["text", { image: true }] } },
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
    expect(models["qwen/coder"]).toMatchObject({ limit: { context: 32_000, output: 4_096 }, modalities: { input: ["text"], output: ["text"] } });
    expect(models["vision/model"]).toEqual({ name: "vision/model", limit: { context: 32_000, output: 4_096 }, modalities: { input: ["text", "image"], output: ["text"] } });
    expect(models["malformed/model"]).toMatchObject({ modalities: { input: ["text"], output: ["text"] } });
  });

  test("sanitizes discovered capabilities", async () => {
    const models = await discoverNineRouterModels("http://localhost/v1", "key", async () => Response.json({ data: [{ id: "model", capabilities: { reasoning: true, thinkingFormat: "claude-adaptive", thinkingCanDisable: false, extra: { nested: true }, huge: "x".repeat(1000), __proto__: { polluted: true }, bad: 1 } }] }));
    expect(models.model).toMatchObject({ capabilities: { reasoning: true, thinkingFormat: "claude-adaptive", thinkingCanDisable: false } });
    expect((models.model as { capabilities: object }).capabilities).toEqual({ reasoning: true, thinkingFormat: "claude-adaptive", thinkingCanDisable: false });
  });

  test("discovers realistic suffixed IDs alongside ordinary IDs and preserves the 200-character boundary", async () => {
    const ids = ["cx/gpt-6-astra[1m]", "cx/gpt-6-sol[1m]", "cx/gpt-5.6-sol[1m]", "ordinary/model"];
    const models = await discoverNineRouterModels(
      "http://localhost/v1",
      "key",
      async () => new Response(JSON.stringify({
        data: [...ids.map((id) => ({ id })), { id: `${"a".repeat(196)}[1m]` }],
      })),
    );

    expect(Object.keys(models)).toEqual([...ids, `${"a".repeat(196)}[1m]`]);
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
      ...["model[1m]tail", "model[[1m]", "model[1m]]", "model[1m][1m]", "model[2m]", `${"a".repeat(197)}[1m]`]
        .map((id) => JSON.stringify({ data: [{ id }] })),
      JSON.stringify({ data: [{ id: "__proto__" }] }),
      JSON.stringify({ data: [{ id: "duplicate" }, { id: "duplicate" }] }),
      JSON.stringify({ data: [{ id: "duplicate[1m]" }, { id: "duplicate[1m]" }] }),
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
