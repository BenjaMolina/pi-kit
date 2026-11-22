import { describe, expect, test } from "bun:test";
import antigravityPromptRepair, {
  ANTIGRAVITY_PROMPT_REPAIR_ENV,
  isAntigravityPromptRepairEnabled,
  sanitizePiPromptForAntigravity,
} from "../extensions/antigravity-prompt-repair";

const SAMPLE_README = "C:/Users/dev/.bun/node_modules/@earendil-works/pi-coding-agent/README.md";
const SAMPLE_DOCS = "C:/Users/dev/.bun/node_modules/@earendil-works/pi-coding-agent/docs";
const SAMPLE_EXAMPLES = "C:/Users/dev/.bun/node_modules/@earendil-works/pi-coding-agent/examples";

const V085_SYSTEM_PROMPT = `You are an expert coding assistant operating inside pi, a coding agent harness. You help users by reading files, executing commands, editing code, and writing new files.

Available tools:
- read: Read file contents

Guidelines:
- Be concise in your responses

Pi documentation (read only when the user asks about pi itself, its SDK, extensions, themes, skills, or TUI):
- Main documentation: ${SAMPLE_README}
- Additional docs: ${SAMPLE_DOCS}
- Examples: ${SAMPLE_EXAMPLES} (extensions, custom tools, SDK)
- When reading pi docs or examples, resolve docs/... under Additional docs and examples/... under Examples, not the current working directory
- When asked about: extensions (docs/extensions.md, examples/extensions/), themes (docs/themes.md), skills (docs/skills.md), prompt templates (docs/prompt-templates.md), TUI components (docs/tui.md), keybindings (docs/keybindings.md), SDK integrations (docs/sdk.md), custom providers (docs/custom-provider.md), adding models (docs/models.md), pi packages (docs/packages.md), environment variables (docs/environment-variables.md)
- When working on pi topics, read the docs and examples, and follow .md cross-references before implementing
- Always read pi .md files completely and follow links to related docs (e.g., tui.md for TUI API details)

Current working directory: C:/repo`;

const V140_SYSTEM_PROMPT = `You are an expert coding assistant operating inside pi, a coding agent harness. You help users by reading files, executing commands, editing code, and writing new files.

<tools>
- read: Read file contents
</tools>

<docs>
Pi documentation (read only when the user asks about pi itself, its SDK, extensions, themes, skills, or TUI):
- Main documentation: ${SAMPLE_README}
- Additional docs: ${SAMPLE_DOCS}
- Examples: ${SAMPLE_EXAMPLES} (extensions, custom tools, SDK)
- When reading pi docs or examples, resolve docs/... under Additional docs and examples/... under Examples, not the current working directory
- When asked about: extensions (docs/extensions.md, examples/extensions/), themes (docs/themes.md), skills (docs/skills.md), prompt templates (docs/prompt-templates.md), TUI components (docs/tui.md), keybindings (docs/keybindings.md), SDK integrations (docs/sdk.md), custom providers (docs/custom-provider.md), adding models (docs/models.md), pi packages (docs/packages.md), environment variables (docs/environment-variables.md), MCP servers (docs/mcp.md), codemode scripts and non-LLM models such as classifiers and image models (docs/codemode.md)
- When working on pi topics, read the docs and examples, and follow .md cross-references before implementing
- Always read pi .md files completely and follow links to related docs (e.g., tui.md for TUI API details)
</docs>

<addendum>
You are the read-only explorer for generic ODD work.
</addendum>`;

type CapturedHandler = (
  event: { type: "before_provider_request"; payload: unknown },
  ctx: { model?: { provider: string; id: string } },
) => Promise<unknown>;

function setupExtension(options: {
  env?: Record<string, string | undefined>;
  fetch?: (input: string, init?: RequestInit) => Promise<Response>;
} = {}): CapturedHandler {
  let registered: CapturedHandler | undefined;
  antigravityPromptRepair(
    {
      on(event: string, handler: CapturedHandler) {
        if (event === "before_provider_request") registered = handler;
      },
    } as never,
    options,
  );
  if (!registered) throw new Error("before_provider_request handler was not registered");
  return registered;
}

describe("S1: strict Antigravity model scoping", () => {
  test("sanitizes 9router ag/* and antigravity/* routes while leaving non-Antigravity routes untouched", async () => {
    const handler = setupExtension({ env: {} });
    const basePayload = {
      model: "ag/gemini-4-argon-high",
      stream: true,
      messages: [{ role: "system", content: V140_SYSTEM_PROMPT }],
    };

    const repairedAg = (await handler(
      { type: "before_provider_request", payload: basePayload },
      { model: { provider: "9router", id: "ag/gemini-4-argon-high" } },
    )) as { messages: Array<{ content: string }> };
    expect(repairedAg).toBeDefined();
    expect(repairedAg.messages[0]?.content).toContain("working on software projects");

    const repairedAlias = await handler(
      { type: "before_provider_request", payload: { ...basePayload, model: "antigravity/claude-sonnet-4-6" } },
      { model: { provider: "9router", id: "antigravity/claude-sonnet-4-6" } },
    );
    expect(repairedAlias).toBeDefined();

    for (const nonAg of ["cx/gpt-6.1-sol", "cc/claude-sonnet-4-6", "oc/gpt-5-free", "kr/claude-sonnet-4"]) {
      const untouched = await handler(
        { type: "before_provider_request", payload: { ...basePayload, model: nonAg } },
        { model: { provider: "9router", id: nonAg } },
      );
      expect(untouched).toBeUndefined();
    }

    const otherProvider = await handler(
      { type: "before_provider_request", payload: basePayload },
      { model: { provider: "openai", id: "ag/gemini-4-argon-high" } },
    );
    expect(otherProvider).toBeUndefined();
  });

  test("classifies clear cliproxyapi models synchronously and resolves ambiguous unscoped IDs lazily via /v1/models owned_by", async () => {
    let catalogCalls = 0;
    const handler = setupExtension({
      env: {
        CLIPROXYAPI_API_KEY: "test-key",
        CLIPROXYAPI_BASE_URL: "http://127.0.0.1:8317/v1/",
      },
      fetch: async (url, init) => {
        catalogCalls++;
        expect(url).toBe("http://127.0.0.1:8317/v1/models");
        expect(init?.headers).toEqual({ Authorization: "Bearer test-key" });
        return Response.json({
          data: [
            { id: "claude-sonnet-4-6", owned_by: "antigravity" },
            { id: "claude-opus-4-6-thinking", owned_by: "antigravity" },
            { id: "claude-sonnet-5-5", owned_by: "anthropic" },
          ],
        });
      },
    });

    const makeEvent = (model: string) => ({
      type: "before_provider_request" as const,
      payload: {
        model,
        messages: [{ role: "developer", content: V140_SYSTEM_PROMPT }],
      },
    });

    // Clear Antigravity IDs require zero /v1/models network lookups.
    for (const agId of ["agy-bmolina/gemini-4-argon-high", "gemini-4-carbon-high", "gpt-oss-120b-medium"]) {
      const res = await handler(makeEvent(agId), { model: { provider: "cliproxyapi", id: agId } });
      expect(res).toBeDefined();
    }
    // Clear non-Antigravity IDs require zero /v1/models network lookups.
    for (const nonAgId of ["codex_Phan/gpt-6.2-sol", "gpt-6.1-sol", "o3-mini", "claude_team/claude-sonnet-4-6"]) {
      const res = await handler(makeEvent(nonAgId), { model: { provider: "cliproxyapi", id: nonAgId } });
      expect(res).toBeUndefined();
    }
    expect(catalogCalls).toBe(0);

    // Ambiguous unscoped Claude models resolve once via /v1/models and cache owned_by.
    const agClaude = await handler(
      makeEvent("claude-sonnet-4-6"),
      { model: { provider: "cliproxyapi", id: "claude-sonnet-4-6" } },
    );
    expect(agClaude).toBeDefined();
    expect(catalogCalls).toBe(1);

    const directClaude = await handler(
      makeEvent("claude-sonnet-5-5"),
      { model: { provider: "cliproxyapi", id: "claude-sonnet-5-5" } },
    );
    expect(directClaude).toBeUndefined();
    expect(catalogCalls).toBe(1);
  });

  test("fails open without network calls when PI_OFFLINE is enabled or /v1/models fails on ambiguous IDs", async () => {
    let calls = 0;
    const offlineHandler = setupExtension({
      env: { CLIPROXYAPI_API_KEY: "test-key", PI_OFFLINE: "1" },
      fetch: async () => {
        calls++;
        throw new Error("should not fetch when offline");
      },
    });

    const ambiguousOffline = await offlineHandler(
      {
        type: "before_provider_request",
        payload: { model: "claude-sonnet-4-6", messages: [{ role: "developer", content: V140_SYSTEM_PROMPT }] },
      },
      { model: { provider: "cliproxyapi", id: "claude-sonnet-4-6" } },
    );
    expect(ambiguousOffline).toBeUndefined();
    expect(calls).toBe(0);

    // Known Antigravity IDs still sanitize while offline.
    const knownOffline = await offlineHandler(
      {
        type: "before_provider_request",
        payload: { model: "gemini-4-argon-high", messages: [{ role: "developer", content: V140_SYSTEM_PROMPT }] },
      },
      { model: { provider: "cliproxyapi", id: "gemini-4-argon-high" } },
    );
    expect(knownOffline).toBeDefined();
  });
});

describe("S2: surgical prompt rewrite preserving docs paths and payload safety", () => {
  test("rewrites both Pi v0.85 plain text and Pi v1.4 <docs> prompts while preserving all paths and topic files", () => {
    for (const [label, input, extraTopics] of [
      ["v085", V085_SYSTEM_PROMPT, []],
      ["v140-lf", V140_SYSTEM_PROMPT, ["mcp.md", "codemode.md"]],
      ["v140-crlf", V140_SYSTEM_PROMPT.replace(/\n/g, "\r\n"), ["mcp.md", "codemode.md"]],
    ] as const) {
      const sanitized = sanitizePiPromptForAntigravity(input);
      expect(sanitized).not.toContain("operating inside pi, a coding agent harness");
      expect(sanitized).not.toContain("Pi documentation (read only when the user asks about pi itself");
      expect(sanitized).not.toContain("When working on pi topics, read the docs and examples");
      expect(sanitized).not.toContain("Always read pi .md files completely");

      expect(sanitized).toContain("working on software projects");
      expect(sanitized).toContain(SAMPLE_README);
      expect(sanitized).toContain(SAMPLE_DOCS);
      expect(sanitized).toContain(SAMPLE_EXAMPLES);
      for (const topic of [
        "extensions.md",
        "examples/extensions/",
        "themes.md",
        "skills.md",
        "prompt-templates.md",
        "tui.md",
        "keybindings.md",
        "sdk.md",
        "custom-provider.md",
        "models.md",
        "packages.md",
        "environment-variables.md",
        ...extraTopics,
      ]) {
        expect(sanitized).toContain(topic);
      }
      if (label.startsWith("v140")) {
        expect(sanitized).toContain("<docs>");
        expect(sanitized).toContain("</docs>");
        expect(sanitized).toContain("You are the read-only explorer for generic ODD work.");
      }
      // Idempotent on second pass.
      expect(sanitizePiPromptForAntigravity(sanitized)).toBe(sanitized);
    }
  });

  test("rewrites system and developer messages (string and text parts) without mutating input or touching user/assistant/tool messages", async () => {
    const handler = setupExtension({ env: {} });
    const originalPayload = {
      model: "gemini-4-argon-high",
      stream: true,
      reasoning_effort: "high",
      tools: [{ type: "function", function: { name: "read" } }],
      messages: [
        { role: "developer", content: V140_SYSTEM_PROMPT },
        {
          role: "system",
          content: [{ type: "text", text: " Prefix: operating inside pi, a coding agent harness." }],
        },
        {
          role: "user",
          content: "Why does operating inside pi, a coding agent harness fail?",
        },
        {
          role: "tool",
          content: "operating inside pi, a coding agent harness",
        },
      ],
    };
    const snapshot = JSON.stringify(originalPayload);

    const updated = (await handler(
      { type: "before_provider_request", payload: originalPayload },
      { model: { provider: "cliproxyapi", id: "gemini-4-argon-high" } },
    )) as typeof originalPayload;

    // Input payload is never mutated in place.
    expect(JSON.stringify(originalPayload)).toBe(snapshot);

    expect(updated).toBeDefined();
    expect(updated.reasoning_effort).toBe("high");
    expect(updated.tools).toEqual(originalPayload.tools);
    expect(updated.messages[0]?.content).toContain("working on software projects");
    expect((updated.messages[1]?.content as Array<{ text: string }>)[0]?.text).toBe(
      " Prefix: working on software projects.",
    );
    // User and tool messages remain byte-identical.
    expect(updated.messages[2]).toBe(originalPayload.messages[2]);
    expect(updated.messages[3]).toBe(originalPayload.messages[3]);

    // Already-clean payload returns undefined (no-op) and malformed payloads fail open.
    expect(
      await handler(
        { type: "before_provider_request", payload: updated },
        { model: { provider: "cliproxyapi", id: "gemini-4-argon-high" } },
      ),
    ).toBeUndefined();
    expect(
      await handler(
        { type: "before_provider_request", payload: null },
        { model: { provider: "cliproxyapi", id: "gemini-4-argon-high" } },
      ),
    ).toBeUndefined();
  });
});

describe("S3: reversible environment kill-switch", () => {
  test("is enabled by default and disabled immediately for 0, false, no, and off", async () => {
    expect(ANTIGRAVITY_PROMPT_REPAIR_ENV).toBe("PI_KIT_ANTIGRAVITY_PROMPT_REPAIR");
    expect(isAntigravityPromptRepairEnabled({})).toBe(true);
    expect(isAntigravityPromptRepairEnabled({ PI_KIT_ANTIGRAVITY_PROMPT_REPAIR: "1" })).toBe(true);
    expect(isAntigravityPromptRepairEnabled({ PI_KIT_ANTIGRAVITY_PROMPT_REPAIR: "true" })).toBe(true);

    for (const disabledValue of ["0", "false", "FALSE", "no", "off", "  0  "]) {
      expect(isAntigravityPromptRepairEnabled({ PI_KIT_ANTIGRAVITY_PROMPT_REPAIR: disabledValue })).toBe(false);
      let calls = 0;
      const handler = setupExtension({
        env: {
          PI_KIT_ANTIGRAVITY_PROMPT_REPAIR: disabledValue,
          CLIPROXYAPI_API_KEY: "test-key",
        },
        fetch: async () => {
          calls++;
          return Response.json({ data: [] });
        },
      });
      const result = await handler(
        {
          type: "before_provider_request",
          payload: { model: "claude-sonnet-4-6", messages: [{ role: "developer", content: V140_SYSTEM_PROMPT }] },
        },
        { model: { provider: "cliproxyapi", id: "claude-sonnet-4-6" } },
      );
      expect(result).toBeUndefined();
      expect(calls).toBe(0);
    }
  });
});
