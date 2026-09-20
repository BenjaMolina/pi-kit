import { describe, expect, test } from "bun:test";
import { EventEmitter } from "node:events";
import type { CLIProxyModel } from "../src/cliproxyapi/models";
import {
  filterAndRankModels,
  filterEffortLevels,
  formatEffortLine,
  formatModelLine,
  formatTokens,
  matchSubsequence,
  renderEffortPickerLines,
  renderPickerLines,
  resolveInitialEffortIndex,
  selectCopilotModel,
  selectCopilotReasoningEffort,
} from "../src/copilot/picker";

const TEST_MODELS: CLIProxyModel[] = [
  {
    id: "anthropic/claude-3-7-sonnet",
    displayName: "Claude 3.7 Sonnet",
    owner: "Anthropic",
    source: "enriched",
    reasoning: true,
    reasoningLevels: ["low", "medium", "high"],
    input: ["text", "image"],
    contextWindow: 200_000,
    maxTokens: 64_000,
  },
  {
    id: "anthropic/claude-3-5-haiku",
    displayName: "Claude 3.5 Haiku",
    owner: "Anthropic",
    source: "enriched",
    reasoning: false,
    reasoningLevels: [],
    input: ["text"],
    contextWindow: 200_000,
    maxTokens: 8192,
  },
  {
    id: "openai/gpt-4.5-preview",
    displayName: "GPT-4.5 Preview",
    owner: "OpenAI",
    source: "enriched",
    reasoning: false,
    reasoningLevels: [],
    input: ["text", "image"],
    contextWindow: 128_000,
    maxTokens: 16_384,
  },
  {
    id: "google/gemini-2.5-pro",
    displayName: "Gemini 2.5 Pro",
    owner: "Google",
    source: "fallback",
    reasoning: true,
    reasoningLevels: ["low", "medium", "high"],
    input: ["text", "image"],
    contextWindow: 370_000,
    maxTokens: 32_000,
  },
  {
    id: "team/custom-local-model",
    displayName: "Custom Local",
    owner: "CLIProxyAPI",
    source: "enriched",
    reasoning: false,
    reasoningLevels: [],
    input: ["text"],
    contextWindow: 32_000,
    maxTokens: 4096,
  },
];

class MockStdin extends EventEmitter {
  isTTY = true;
  rawMode = false;
  resumed = false;
  paused = false;

  setRawMode(mode: boolean) {
    this.rawMode = mode;
  }

  resume() {
    this.resumed = true;
    this.paused = false;
  }

  pause() {
    this.paused = true;
    this.resumed = false;
  }

  setEncoding() {}
}

class MockStdout {
  isTTY = true;
  written: string[] = [];

  write(chunk: string): boolean {
    this.written.push(chunk);
    return true;
  }
}

describe("copilot model picker search and ranking", () => {
  test("detects ordered character subsequences and rejects out-of-order characters", () => {
    expect(matchSubsequence("cld", "claude")).toEqual({ start: 0, end: 4 });
    expect(matchSubsequence("gpt4", "openai/gpt-4.5-preview")).toEqual({ start: 7, end: 11 });
    expect(matchSubsequence("dlc", "claude")).toBeUndefined();
    expect(matchSubsequence("", "claude")).toEqual({ start: 0, end: 0 });
  });

  test("returns all models deterministically sorted by id when query is empty", () => {
    const results = filterAndRankModels(TEST_MODELS, "");
    expect(results.map((m) => m.id)).toEqual([
      "anthropic/claude-3-5-haiku",
      "anthropic/claude-3-7-sonnet",
      "google/gemini-2.5-pro",
      "openai/gpt-4.5-preview",
      "team/custom-local-model",
    ]);
  });

  test("matches models case-insensitively across display name, id, and owner", () => {
    const byName = filterAndRankModels(TEST_MODELS, "haiku");
    expect(byName).toHaveLength(1);
    expect(byName[0].id).toBe("anthropic/claude-3-5-haiku");

    const byId = filterAndRankModels(TEST_MODELS, "google/");
    expect(byId).toHaveLength(1);
    expect(byId[0].id).toBe("google/gemini-2.5-pro");

    const byOwner = filterAndRankModels(TEST_MODELS, "cliproxyapi");
    expect(byOwner).toHaveLength(1);
    expect(byOwner[0].id).toBe("team/custom-local-model");
  });

  test("supports fuzzy subsequence matching across model attributes", () => {
    // "cld37" matches "claude-3-7-sonnet"
    const fuzzy = filterAndRankModels(TEST_MODELS, "cld37");
    expect(fuzzy.length).toBeGreaterThan(0);
    expect(fuzzy[0].id).toBe("anthropic/claude-3-7-sonnet");
  });

  test("supports multi-term searches combining owner and model name", () => {
    const multi = filterAndRankModels(TEST_MODELS, "anthropic sonnet");
    expect(multi).toHaveLength(1);
    expect(multi[0].id).toBe("anthropic/claude-3-7-sonnet");
  });

  test("ranks exact and prefix matches above distant subsequence matches deterministically", () => {
    const ranked = filterAndRankModels(TEST_MODELS, "claude");
    expect(ranked.length).toBe(2);
    expect(ranked.every((m) => m.id.includes("claude"))).toBe(true);
  });

  test("returns an empty array when no models match the query", () => {
    expect(filterAndRankModels(TEST_MODELS, "nonexistent-model-xyz")).toEqual([]);
  });
});

describe("copilot model formatting and rendering", () => {
  test("formats token counts compactly", () => {
    expect(formatTokens(4096)).toBe("4.1k");
    expect(formatTokens(32_000)).toBe("32k");
    expect(formatTokens(200_000)).toBe("200k");
    expect(formatTokens(1_000_000)).toBe("1m");
  });

  test("formats model line with non-secret metadata and selection pointer", () => {
    const sonnet = TEST_MODELS[0];
    const selectedLine = formatModelLine(sonnet, true);
    expect(selectedLine).toContain("❯ ");
    expect(selectedLine).toContain("Claude 3.7 Sonnet (anthropic/claude-3-7-sonnet)");
    expect(selectedLine).toContain("200k ctx");
    expect(selectedLine).toContain("64k max");
    expect(selectedLine).toContain("reasoning");
    expect(selectedLine).toContain("vision");
    expect(selectedLine).toContain("Anthropic");

    const unselectedLine = formatModelLine(sonnet, false);
    expect(unselectedLine).toContain("  ");
    expect(unselectedLine).not.toContain("❯ ");
  });

  test("renders empty state cleanly when no models match", () => {
    const lines = renderPickerLines([], "missing", 0, 0, 8);
    expect(lines[0]).toContain("missing");
    expect(lines[1]).toContain('No models match "missing"');
    expect(lines).toHaveLength(2);
  });

  test("renders paginated window with model count and instructions", () => {
    const lines = renderPickerLines(TEST_MODELS, "", 0, 0, 3);
    expect(lines[0]).toContain("Select a Copilot model");
    expect(lines[1]).toContain("Showing 1–3 of 5 models");
    expect(lines).toHaveLength(5); // 2 header lines + 3 items
  });
});

describe("copilot model picker interactive terminal session", () => {
  test("refuses non-TTY execution with an actionable message", async () => {
    const stdin = new MockStdin();
    stdin.isTTY = false;
    const stdout = new MockStdout();

    await expect(selectCopilotModel(TEST_MODELS, { terminal: { stdin, stdout, isTTY: false } }))
      .rejects.toThrow("pi-kit-copilot pick requires an interactive terminal (TTY)");
  });

  test("rejects when no models are available", async () => {
    const stdin = new MockStdin();
    const stdout = new MockStdout();

    await expect(selectCopilotModel([], { terminal: { stdin, stdout, isTTY: true } }))
      .rejects.toThrow("No models are currently available");
  });

  test("selects the first model on immediate Enter confirmation and restores terminal", async () => {
    const stdin = new MockStdin();
    const stdout = new MockStdout();

    const selectPromise = selectCopilotModel(TEST_MODELS, { terminal: { stdin, stdout, isTTY: true } });
    expect(stdin.rawMode).toBe(true);
    expect(stdout.written.some((w) => w.includes("\x1b[?25l"))).toBe(true); // cursor hidden

    stdin.emit("data", "\r");
    const selected = await selectPromise;

    expect(selected).toBeDefined();
    expect(selected?.id).toBe("anthropic/claude-3-5-haiku"); // alphabetically first
    expect(stdin.rawMode).toBe(false);
    expect(stdout.written.some((w) => w.includes("\x1b[?25h"))).toBe(true); // cursor restored
  });

  test("navigates with Down/Up arrows before confirming with Enter", async () => {
    const stdin = new MockStdin();
    const stdout = new MockStdout();

    const selectPromise = selectCopilotModel(TEST_MODELS, { terminal: { stdin, stdout, isTTY: true } });
    stdin.emit("data", "\x1b[B"); // down
    stdin.emit("data", "\x1b[B"); // down
    stdin.emit("data", "\x1b[A"); // up
    stdin.emit("data", "\n"); // enter

    const selected = await selectPromise;
    expect(selected?.id).toBe("anthropic/claude-3-7-sonnet"); // index 1
  });

  test("filters models dynamically and confirms the filtered result", async () => {
    const stdin = new MockStdin();
    const stdout = new MockStdout();

    const selectPromise = selectCopilotModel(TEST_MODELS, { terminal: { stdin, stdout, isTTY: true } });
    stdin.emit("data", "g");
    stdin.emit("data", "p");
    stdin.emit("data", "t");
    stdin.emit("data", "\r");

    const selected = await selectPromise;
    expect(selected?.id).toBe("openai/gpt-4.5-preview");
  });

  test("handles backspace during filtering", async () => {
    const stdin = new MockStdin();
    const stdout = new MockStdout();

    const selectPromise = selectCopilotModel(TEST_MODELS, { terminal: { stdin, stdout, isTTY: true } });
    stdin.emit("data", "g");
    stdin.emit("data", "e");
    stdin.emit("data", "m");
    stdin.emit("data", "\x7f"); // backspace
    stdin.emit("data", "\x7f"); // backspace
    stdin.emit("data", "\x7f"); // backspace
    stdin.emit("data", "\r"); // enter on empty query

    const selected = await selectPromise;
    expect(selected?.id).toBe("anthropic/claude-3-5-haiku"); // first item
  });

  test("clears query with Ctrl+U", async () => {
    const stdin = new MockStdin();
    const stdout = new MockStdout();

    const selectPromise = selectCopilotModel(TEST_MODELS, { terminal: { stdin, stdout, isTTY: true } });
    stdin.emit("data", "xyz");
    stdin.emit("data", "\x15"); // Ctrl+U
    stdin.emit("data", "\r");

    const selected = await selectPromise;
    expect(selected).toBeDefined();
  });

  test("cancels on Escape key and returns undefined without error", async () => {
    const stdin = new MockStdin();
    const stdout = new MockStdout();

    const selectPromise = selectCopilotModel(TEST_MODELS, { terminal: { stdin, stdout, isTTY: true } });
    stdin.emit("data", "\x1b"); // Escape

    const selected = await selectPromise;
    expect(selected).toBeUndefined();
    expect(stdin.rawMode).toBe(false);
    expect(stdout.written.some((w) => w.includes("\x1b[?25h"))).toBe(true);
  });

  test("cancels on Ctrl+C and returns undefined without error", async () => {
    const stdin = new MockStdin();
    const stdout = new MockStdout();

    const selectPromise = selectCopilotModel(TEST_MODELS, { terminal: { stdin, stdout, isTTY: true } });
    stdin.emit("data", "\x03"); // Ctrl+C

    const selected = await selectPromise;
    expect(selected).toBeUndefined();
    expect(stdin.rawMode).toBe(false);
    expect(stdout.written.some((w) => w.includes("\x1b[?25h"))).toBe(true);
  });

  test("handles stream end as safe cancellation", async () => {
    const stdin = new MockStdin();
    const stdout = new MockStdout();

    const selectPromise = selectCopilotModel(TEST_MODELS, { terminal: { stdin, stdout, isTTY: true } });
    stdin.emit("end");

    const selected = await selectPromise;
    expect(selected).toBeUndefined();
    expect(stdin.rawMode).toBe(false);
  });

  test("restores terminal and raw mode when an error occurs", async () => {
    const stdin = new MockStdin();
    const stdout = new MockStdout();

    const selectPromise = selectCopilotModel(TEST_MODELS, { terminal: { stdin, stdout, isTTY: true } });
    stdin.emit("error", new Error("Simulated stream error"));

    await expect(selectPromise).rejects.toThrow("Simulated stream error");
    expect(stdin.rawMode).toBe(false);
    expect(stdout.written.some((w) => w.includes("\x1b[?25h"))).toBe(true);
  });

  test("handles split Up and Down arrow escape sequences identically to unsplit sequences", async () => {
    const stdin = new MockStdin();
    const stdout = new MockStdout();

    const selectPromise = selectCopilotModel(TEST_MODELS, { terminal: { stdin, stdout, isTTY: true } });
    // Split Down arrow across chunks: \x1b then [B
    stdin.emit("data", "\x1b");
    stdin.emit("data", "[B");
    // Split Down arrow across chunks again
    stdin.emit("data", "\x1b");
    stdin.emit("data", "[B");
    // Split Up arrow across chunks: \x1b then [A
    stdin.emit("data", "\x1b");
    stdin.emit("data", "[A");
    // Confirm with Enter
    stdin.emit("data", "\r");

    const selected = await selectPromise;
    expect(selected).toBeDefined();
    // Started at 0, down to 1, down to 2, up to 1
    expect(selected?.id).toBe("anthropic/claude-3-7-sonnet");
  });

  test("handles escape sequences split across three chunks and SS3 sequences", async () => {
    const stdin = new MockStdin();
    const stdout = new MockStdout();

    const selectPromise = selectCopilotModel(TEST_MODELS, { terminal: { stdin, stdout, isTTY: true } });
    // Three chunks for Down arrow: \x1b then [ then B
    stdin.emit("data", "\x1b");
    stdin.emit("data", "[");
    stdin.emit("data", "B");
    // Split SS3 Up arrow: \x1b then OA
    stdin.emit("data", "\x1b");
    stdin.emit("data", "OA");
    // Split SS3 Down arrow: \x1b then OB
    stdin.emit("data", "\x1b");
    stdin.emit("data", "OB");
    stdin.emit("data", "\r");

    const selected = await selectPromise;
    expect(selected?.id).toBe("anthropic/claude-3-7-sonnet");
  });

  test("handles split Page Down escape sequences", async () => {
    const stdin = new MockStdin();
    const stdout = new MockStdout();

    const selectPromise = selectCopilotModel(TEST_MODELS, {
      maxVisible: 2,
      terminal: { stdin, stdout, isTTY: true },
    });
    // Split Page Down: \x1b then [6~
    stdin.emit("data", "\x1b");
    stdin.emit("data", "[6~");
    stdin.emit("data", "\r");

    const selected = await selectPromise;
    expect(selected?.id).toBe("google/gemini-2.5-pro"); // index 2 after paging down by 2
  });

  test("cancels promptly on standalone Escape using deterministic test seam", async () => {
    const stdin = new MockStdin();
    const stdout = new MockStdout();
    let flushEscape: (() => void) | undefined;

    const selectPromise = selectCopilotModel(TEST_MODELS, {
      terminal: { stdin, stdout, isTTY: true },
      onEscapePending: (flush) => {
        flushEscape = flush;
      },
    });

    stdin.emit("data", "\x1b");
    expect(flushEscape).toBeDefined();
    flushEscape?.();

    const selected = await selectPromise;
    expect(selected).toBeUndefined();
    expect(stdin.rawMode).toBe(false);
    expect(stdout.written.some((w) => w.includes("\x1b[?25h"))).toBe(true);
  });

  test("cancels promptly on standalone Escape with injectable escapeTimeoutMs: 0", async () => {
    const stdin = new MockStdin();
    const stdout = new MockStdout();

    const selectPromise = selectCopilotModel(TEST_MODELS, {
      terminal: { stdin, stdout, isTTY: true },
      escapeTimeoutMs: 0,
    });

    stdin.emit("data", "\x1b");
    const selected = await selectPromise;
    expect(selected).toBeUndefined();
    expect(stdin.rawMode).toBe(false);
  });

  test("cancels when Escape is followed by a non-sequence character", async () => {
    const stdin = new MockStdin();
    const stdout = new MockStdout();

    const selectPromise = selectCopilotModel(TEST_MODELS, { terminal: { stdin, stdout, isTTY: true } });
    stdin.emit("data", "\x1b");
    stdin.emit("data", "x"); // 'x' is not '[' or 'O', confirming \x1b was standalone Escape

    const selected = await selectPromise;
    expect(selected).toBeUndefined();
    expect(stdin.rawMode).toBe(false);
  });

  test("restores terminal and raw mode when initial terminal write fails on cursor hide", async () => {
    const stdin = new MockStdin();
    const stdout = new MockStdout();
    let writeCalls = 0;
    stdout.write = (chunk: string) => {
      writeCalls++;
      if (writeCalls === 1) {
        throw new Error("Initial cursor hide write failed");
      }
      stdout.written.push(chunk);
      return true;
    };

    await expect(
      selectCopilotModel(TEST_MODELS, { terminal: { stdin, stdout, isTTY: true } }),
    ).rejects.toThrow("Initial cursor hide write failed");

    expect(stdin.rawMode).toBe(false);
    expect(stdin.paused).toBe(true);
    expect(stdin.listenerCount("data")).toBe(0);
    expect(stdout.written.some((w) => w.includes("\x1b[?25h"))).toBe(true);
  });

  test("restores terminal and raw mode when initial render write fails after cursor hide", async () => {
    const stdin = new MockStdin();
    const stdout = new MockStdout();
    stdout.write = (chunk: string) => {
      if (chunk.includes("Select a Copilot model")) {
        throw new Error("Initial render write failed");
      }
      stdout.written.push(chunk);
      return true;
    };

    await expect(
      selectCopilotModel(TEST_MODELS, { terminal: { stdin, stdout, isTTY: true } }),
    ).rejects.toThrow("Initial render write failed");

    expect(stdin.rawMode).toBe(false);
    expect(stdin.paused).toBe(true);
    expect(stdin.listenerCount("data")).toBe(0);
    expect(stdout.written.some((w) => w.includes("\x1b[?25h"))).toBe(true);
  });
});

describe("copilot reasoning effort filtering and rendering", () => {
  const CUSTOM_LEVELS = ["Budget-4K", "Deep_Thought", "xHigh", "MAX", "low"];

  test("preserves exact advertised order, filters case-insensitively/fuzzy, and formats lines", () => {
    expect(filterEffortLevels(CUSTOM_LEVELS, "")).toEqual(CUSTOM_LEVELS);
    expect(filterEffortLevels(CUSTOM_LEVELS, "thought")).toEqual(["Deep_Thought"]);
    expect(filterEffortLevels(CUSTOM_LEVELS, "max")).toEqual(["MAX"]);
    expect(filterEffortLevels(CUSTOM_LEVELS, "xhi")).toEqual(["xHigh"]);
    expect(filterEffortLevels(CUSTOM_LEVELS, "bg4")).toEqual(["Budget-4K"]);
    expect(filterEffortLevels(CUSTOM_LEVELS, "missing")).toEqual([]);

    expect(formatEffortLine("Medium", true)).toBe("❯ Medium");
    expect(formatEffortLine("Medium", false)).toBe("  Medium");

    const withModel = renderEffortPickerLines(["LOW", "Medium", "high"], "", 1, 0, 8, "claude-3-7-sonnet");
    expect(withModel[0]).toBe("? Select reasoning effort for claude-3-7-sonnet (type to filter): ");
    expect(withModel[1]).toContain("Showing 1–3 of 3 levels");
    expect(withModel[3]).toBe("❯ Medium");

    const empty = renderEffortPickerLines([], "missing", 0, 0, 8);
    expect(empty[0]).toBe("? Select reasoning effort (type to filter): missing");
    expect(empty[1]).toContain('No reasoning levels match "missing"');
  });

  test("resolveInitialEffortIndex handles exact, unique case-insensitive, and ambiguous matches", () => {
    expect(resolveInitialEffortIndex(["low", "medium", "high"], "medium")).toBe(1);
    expect(resolveInitialEffortIndex(["LOW", "Medium", "high"], "medium")).toBe(1);
    expect(resolveInitialEffortIndex(["low", "LOW"], "LOW")).toBe(1);
    expect(resolveInitialEffortIndex(["low", "LOW"], "Low")).toBe(0);
    expect(resolveInitialEffortIndex(["high", "low", "LOW"], "Low")).toBe(0);
    expect(resolveInitialEffortIndex(["low", "medium"], "unknown")).toBe(0);
    expect(resolveInitialEffortIndex(["low", "medium"])).toBe(0);
  });
});

describe("copilot reasoning effort interactive picker session", () => {
  test("refuses non-TTY execution or empty levels with actionable errors", async () => {
    const stdin = new MockStdin();
    stdin.isTTY = false;
    const stdout = new MockStdout();
    await expect(
      selectCopilotReasoningEffort(["low"], { terminal: { stdin, stdout, isTTY: false } }),
    ).rejects.toThrow("pi-kit-copilot pick requires an interactive terminal (TTY)");

    await expect(
      selectCopilotReasoningEffort([], { terminal: { stdin: new MockStdin(), stdout: new MockStdout(), isTTY: true } }),
    ).rejects.toThrow("No reasoning levels are available");
  });

  test.each([
    { desc: "selects first level on immediate Enter when defaultLevel is absent", levels: ["LOW", "Medium", "high"], defaultLevel: undefined, expected: "LOW" },
    { desc: "uses exact defaultReasoningLevel as initial selection hint", levels: ["LOW", "Medium", "high"], defaultLevel: "Medium", expected: "Medium" },
    { desc: "uses case-insensitive defaultReasoningLevel when unique and returns exact advertised spelling", levels: ["LOW", "Medium", "high"], defaultLevel: "medium", expected: "Medium" },
    { desc: "retains normal initial index when case-insensitive defaultLevel is ambiguous for low/LOW", levels: ["low", "LOW"], defaultLevel: "Low", expected: "low" },
    { desc: "retains normal initial index when case-insensitive defaultLevel is ambiguous with preceding items", levels: ["high", "low", "LOW"], defaultLevel: "Low", expected: "high" },
    { desc: "prefers exact match even when another case-insensitive variant exists", levels: ["low", "LOW"], defaultLevel: "LOW", expected: "LOW" },
    { desc: "defaults to index 0 when defaultReasoningLevel does not match any advertised level", levels: ["LOW", "Medium", "high"], defaultLevel: "unknown-level", expected: "LOW" },
    { desc: "preserves arbitrary provider-advertised names, casing, and order", levels: ["Budget-4K", "Deep_Thought", "xHigh", "MAX"], defaultLevel: "deep_thought", expected: "Deep_Thought" },
  ])("$desc", async ({ levels, defaultLevel, expected }) => {
    const stdin = new MockStdin();
    const stdout = new MockStdout();
    const promise = selectCopilotReasoningEffort(levels, {
      defaultLevel,
      terminal: { stdin, stdout, isTTY: true },
    });
    stdin.emit("data", "\r");
    expect(await promise).toBe(expected);
    expect(stdin.rawMode).toBe(false);
  });

  test("navigates with Down/Up arrows before Enter", async () => {
    const stdin = new MockStdin();
    const stdout = new MockStdout();
    const promise = selectCopilotReasoningEffort(["low", "medium", "high", "xhigh"], {
      terminal: { stdin, stdout, isTTY: true },
    });
    stdin.emit("data", "\x1b[B"); // down -> medium
    stdin.emit("data", "\x1b[B"); // down -> high
    stdin.emit("data", "\x1b[A"); // up -> medium
    stdin.emit("data", "\n");
    expect(await promise).toBe("medium");
  });

  test("filters levels dynamically with typing, backspace, and confirms", async () => {
    const stdin = new MockStdin();
    const stdout = new MockStdout();
    const promise = selectCopilotReasoningEffort(["low", "medium", "high", "xhigh"], {
      terminal: { stdin, stdout, isTTY: true },
    });
    stdin.emit("data", "x");
    stdin.emit("data", "h");
    stdin.emit("data", "\x7f"); // backspace -> 'x'
    stdin.emit("data", "h"); // -> 'xh'
    stdin.emit("data", "\r");
    expect(await promise).toBe("xhigh");
  });

  test.each([
    { name: "Escape key", emit: (stdin: MockStdin) => stdin.emit("data", "\x1b"), opts: { escapeTimeoutMs: 0 } },
    { name: "Ctrl+C", emit: (stdin: MockStdin) => stdin.emit("data", "\x03"), opts: {} },
    { name: "stream end", emit: (stdin: MockStdin) => stdin.emit("end"), opts: {} },
  ])("cancels on $name and returns undefined without error", async ({ emit, opts }) => {
    const stdin = new MockStdin();
    const stdout = new MockStdout();
    const promise = selectCopilotReasoningEffort(["low", "high"], {
      ...opts,
      terminal: { stdin, stdout, isTTY: true },
    });
    emit(stdin);
    expect(await promise).toBeUndefined();
    expect(stdin.rawMode).toBe(false);
  });

  test("handles split escape sequences and scrolling when initialIndex exceeds maxVisible", async () => {
    const stdin1 = new MockStdin();
    const stdout1 = new MockStdout();
    const splitPromise = selectCopilotReasoningEffort(["low", "medium", "high"], {
      terminal: { stdin: stdin1, stdout: stdout1, isTTY: true },
    });
    stdin1.emit("data", "\x1b");
    stdin1.emit("data", "[B");
    stdin1.emit("data", "\r");
    expect(await splitPromise).toBe("medium");

    const levels = ["l1", "l2", "l3", "l4", "l5", "l6", "l7", "l8", "l9", "l10"];
    const stdin2 = new MockStdin();
    const stdout2 = new MockStdout();
    const scrollPromise = selectCopilotReasoningEffort(levels, {
      defaultLevel: "l9",
      maxVisible: 3,
      terminal: { stdin: stdin2, stdout: stdout2, isTTY: true },
    });
    stdin2.emit("data", "\r");
    expect(await scrollPromise).toBe("l9");
  });
});
