import { describe, expect, test } from "bun:test";
import { mkdtemp, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { VSCodeFileSystem } from "../src/copilot/vscode";
import { matchReasoningEffort, runCopilotCLI } from "../src/copilot/cli";
import {
  buildCopilotEnvironment,
  copilotCatalogModelId,
  createCopilotLaunchPlan,
  hasCopilotExplicitModelOverride,
  hasCopilotExplicitReasoningEffortOverride,
  isCopilotResumeInvocation,
  launchCopilot,
  normalizeCopilotLaunchArgs,
  reconcileReasoningEffort,
  resolveCopilotExecutable,
  type CopilotExecutable,
} from "../src/copilot/launcher";
import {
  createCopilotState,
  readCopilotState,
  resolveCopilotStatePath,
  writeCopilotState,
  type CopilotStateFileSystem,
} from "../src/copilot/state";

const SECRET = "copilot-test-secret";
const MODEL = {
  id: "team/claude-opus-4.6",
  displayName: "Claude Opus",
  owner: "CLIProxyAPI",
  source: "enriched" as const,
  reasoning: false,
  reasoningLevels: [],
  input: ["text"] as const,
  contextWindow: 200_000,
  maxTokens: 32_000,
};

const REASONING_MODEL = {
  slug: "anthropic/claude-3-7-sonnet",
  id: "anthropic/claude-3-7-sonnet",
  display_name: "Claude 3.7 Sonnet",
  default_reasoning_level: "medium",
  supported_reasoning_levels: [
    { effort: "LOW" },
    { effort: "Medium" },
    { effort: "high" },
  ],
  context_window: 200_000,
  max_tokens: 64_000,
};

const CUSTOM_MODEL = {
  slug: "team/future-thinker",
  id: "team/future-thinker",
  display_name: "Future Thinker",
  default_reasoning_level: "budget-4k",
  supported_reasoning_levels: [
    { effort: "Budget-4K" },
    { effort: "Deep_Thought" },
    { effort: "xHigh" },
    { effort: "MAX" },
  ],
  context_window: 128_000,
  max_tokens: 32_000,
};

const HEURISTIC_MODEL = {
  slug: "google/gemini-fallback",
  id: "google/gemini-fallback",
  display_name: "Gemini Fallback",
  supported_reasoning_levels: [],
  context_window: 200_000,
  max_tokens: 32_000,
};

const AMBIGUOUS_MODEL = {
  slug: "team/ambiguous-thinker",
  id: "team/ambiguous-thinker",
  display_name: "Ambiguous Thinker",
  supported_reasoning_levels: [
    { effort: "low" },
    { effort: "LOW" },
  ],
  context_window: 64_000,
  max_tokens: 8192,
};

function catalogFetch(models = [MODEL]) {
  return async () => new Response(JSON.stringify({ models }));
}

function reasoningCatalogFetch() {
  return catalogFetch([MODEL, REASONING_MODEL, CUSTOM_MODEL, HEURISTIC_MODEL, AMBIGUOUS_MODEL]);
}

async function fixture() {
  const home = await mkdtemp(join(tmpdir(), "pi-kit-copilot-"));
  return {
    env: {
      XDG_CONFIG_HOME: join(home, "config"),
      CLIPROXYAPI_BASE_URL: "http://user:ignored@proxy.test/v1?token=ignored",
      CLIPROXYAPI_API_KEY: SECRET,
    },
    fetch: catalogFetch(),
  };
}

describe("pi-kit-copilot state and discovery", () => {
  test("uses an injectable deterministic config path and stores no credential", async () => {
    const options = await fixture();
    const path = resolveCopilotStatePath(options);
    expect(path.replaceAll("\\", "/")).toEndWith("config/pi-kit/copilot.json");

    await writeCopilotState(createCopilotState(MODEL.id), options);
    expect(await readCopilotState(options)).toEqual({ version: 1, modelId: MODEL.id, wireApi: "responses" });
    expect(await readFile(path, "utf8")).not.toContain(SECRET);
  });

  test("accepts injected state paths and homes", () => {
    expect(resolveCopilotStatePath({ statePath: "/isolated/copilot.json" })).toBe("/isolated/copilot.json");
    expect(resolveCopilotStatePath({ env: {}, homedir: () => "/isolated/home" }).replaceAll("\\", "/"))
      .toBe("/isolated/home/.config/pi-kit/copilot.json");
  });

  test("keeps the previous selection when a later state mutation is invalid", async () => {
    const options = await fixture();
    await writeCopilotState(createCopilotState(MODEL.id), options);
    await expect(writeCopilotState({ version: 1, modelId: "", wireApi: "responses" }, options)).rejects.toThrow("state is invalid");
    expect(await readCopilotState(options)).toEqual({ version: 1, modelId: MODEL.id, wireApi: "responses" });
  });

  test("keeps prior state and cleans temporary files after write or rename failures", async () => {
    const path = "/isolated/copilot.json";
    const original = JSON.stringify(createCopilotState("previous-model"));
    const files = new Map([[path, original]]);
    const temporary: string[] = [];
    let fail: "write" | "rename" = "write";
    const fileSystem = {
      mkdir: async () => undefined,
      readFile: async (target: string) => {
        const content = files.get(target);
        if (content === undefined) {
          const error = Object.assign(new Error("not found"), { code: "ENOENT" });
          throw error;
        }
        return content;
      },
      writeFile: async (target: string, content: string) => {
        temporary.push(target);
        if (fail === "write") throw new Error("write failed");
        files.set(target, content);
      },
      rename: async (from: string, to: string) => {
        if (fail === "rename") throw new Error("rename failed");
        files.set(to, files.get(from)!);
        files.delete(from);
      },
      unlink: async (target: string) => { files.delete(target); },
    } as unknown as CopilotStateFileSystem;

    await expect(writeCopilotState(createCopilotState(MODEL.id), { statePath: path, fileSystem })).rejects.toThrow("write failed");
    expect(files.get(path)).toBe(original);
    expect([...files.keys()]).toEqual([path]);

    fail = "rename";
    await expect(writeCopilotState(createCopilotState(MODEL.id), { statePath: path, fileSystem })).rejects.toThrow("rename failed");
    expect(temporary).toHaveLength(2);
    expect(files.get(path)).toBe(original);
    expect([...files.keys()]).toEqual([path]);
  });

  test("lists dynamically discovered models and rejects an unknown selection without changing state", async () => {
    const options = await fixture();
    const output: string[] = [];
    const errors: string[] = [];
    await expect(runCopilotCLI(["models"], { ...options, stdout: (line) => output.push(line) })).resolves.toBe(0);
    expect(output.join("\n")).toContain(MODEL.id);

    await expect(runCopilotCLI(["use", MODEL.id], { ...options, stdout: () => undefined })).resolves.toBe(0);
    await expect(runCopilotCLI(["use", "not-in-catalog"], { ...options, stderr: (line) => errors.push(line) })).resolves.toBe(1);
    expect(errors.join("\n")).toContain("Model is not currently available");
    expect((await readCopilotState(options))?.modelId).toBe(MODEL.id);
  });

  test("reads legacy version 1 state without reasoningEffort and accepts optional reasoningEffort", async () => {
    const options = await fixture();
    const path = resolveCopilotStatePath(options);
    const legacyJson = JSON.stringify({ version: 1, modelId: MODEL.id, wireApi: "responses" });
    const { mkdir: fsMkdir, writeFile: fsWriteFile } = await import("node:fs/promises");
    const { dirname: pathDirname } = await import("node:path");
    await fsMkdir(pathDirname(path), { recursive: true });
    await fsWriteFile(path, `${legacyJson}\n`, "utf8");

    const state = await readCopilotState(options);
    expect(state).toEqual({ version: 1, modelId: MODEL.id, wireApi: "responses" });
    expect(state?.reasoningEffort).toBeUndefined();

    await writeCopilotState(createCopilotState(MODEL.id, "responses", "Budget-4K"), options);
    const updated = await readCopilotState(options);
    expect(updated?.reasoningEffort).toBe("Budget-4K");
  });

  test("rejects invalid reasoningEffort values in createCopilotState and writeCopilotState", async () => {
    const options = await fixture();
    expect(() => createCopilotState(MODEL.id, "responses", "")).toThrow("selection is invalid");
    expect(() => createCopilotState(MODEL.id, "responses", "   ")).toThrow("selection is invalid");
    await expect(writeCopilotState({ version: 1, modelId: MODEL.id, wireApi: "responses", reasoningEffort: "" }, options))
      .rejects.toThrow("state is invalid");
    await expect(writeCopilotState({ version: 1, modelId: MODEL.id, wireApi: "responses", reasoningEffort: "   " }, options))
      .rejects.toThrow("state is invalid");
    await expect(writeCopilotState({ version: 1, modelId: MODEL.id, wireApi: "responses", reasoningEffort: 123 as any }, options))
      .rejects.toThrow("state is invalid");
  });
});

describe("pi-kit-copilot BYOK launcher", () => {
  test("maps provider-specific IDs conservatively while preserving the exact wire model", () => {
    expect(copilotCatalogModelId("team/claude-opus-4.6")).toBe("claude-sonnet-4");
    expect(copilotCatalogModelId("gemini-3-pro")).toBe("gemini-2.5-pro");
    expect(copilotCatalogModelId("gpt-5.4-mini")).toBe("gpt-4.1");
    expect(copilotCatalogModelId("custom-local-model")).toBeUndefined();

    const env = buildCopilotEnvironment({ CLIPROXYAPI_API_KEY: SECRET, CLIPROXYAPI_BASE_URL: "http://proxy.test/v1/" }, MODEL);
    expect(env).toMatchObject({
      COPILOT_PROVIDER_TYPE: "openai",
      COPILOT_PROVIDER_BASE_URL: "http://proxy.test/v1",
      COPILOT_PROVIDER_BEARER_TOKEN: SECRET,
      COPILOT_PROVIDER_WIRE_API: "responses",
      COPILOT_PROVIDER_WIRE_MODEL: MODEL.id,
      COPILOT_PROVIDER_MODEL_ID: "claude-sonnet-4",
      COPILOT_PROVIDER_MAX_PROMPT_TOKENS: "168000",
      COPILOT_PROVIDER_MAX_OUTPUT_TOKENS: "32000",
      COPILOT_MODEL: "claude-sonnet-4",
    });
    expect(env).not.toHaveProperty("COPILOT_PROVIDER_CONTEXT_WINDOW");
    expect(env).not.toHaveProperty("COPILOT_PROVIDER_MAX_TOKENS");
  });

  test("resolves Copilot from PATH and the Windows WinGet package directory through platform seams", () => {
    const pathExecutable = resolveCopilotExecutable({ PATH: "/tools:/other" }, {
      platform: "linux",
      exists: (path) => path.replaceAll("\\", "/") === "/tools/copilot",
    });
    expect(pathExecutable).toEqual({ command: expect.stringMatching(/tools[\\/]copilot$/), source: "PATH" });

    const winGetExecutable = resolveCopilotExecutable({ PATH: "", LOCALAPPDATA: "C:\\Local" }, {
      platform: "win32",
      readdir: () => ["GitHub.Copilot_8wekyb3d8bbwe", "Other.Package_8wekyb3d8bbwe"],
      exists: (path) => path.includes("GitHub.Copilot_8wekyb3d8bbwe") && path.endsWith("copilot.exe"),
    });
    expect(winGetExecutable).toEqual({ command: expect.stringMatching(/GitHub\.Copilot_8wekyb3d8bbwe[\\/]copilot\.exe$/), source: "WinGet" });
  });

  test("builds a launch plan using injected executable resolution and preserves arguments", async () => {
    const options = await fixture();
    await writeCopilotState(createCopilotState(MODEL.id, "completions"), options);
    const executable: CopilotExecutable = { command: "/test/bin/copilot", source: "WinGet" };
    const plan = await createCopilotLaunchPlan(["--allow-all-tools", "hello"], {
      ...options,
      findExecutable: () => executable,
    });
    expect(plan.executable).toEqual(executable);
    expect(plan.args).toEqual(["--allow-all-tools", "hello"]);
    expect(plan.env.COPILOT_PROVIDER_WIRE_API).toBe("completions");
    expect(plan.env.COPILOT_PROVIDER_WIRE_MODEL).toBe(MODEL.id);
  });

  test("normalizes native resume invocations (--continue, --resume, --resume=<id>) by appending catalog model override", async () => {
    const options = await fixture();
    await writeCopilotState(createCopilotState(MODEL.id), options);
    const executable: CopilotExecutable = { command: "/test/bin/copilot", source: "PATH" };
    const launcherOpts = { ...options, findExecutable: () => executable };

    const continuePlan = await createCopilotLaunchPlan(["--continue"], launcherOpts);
    expect(continuePlan.args).toEqual(["--continue", "--model=claude-sonnet-4"]);

    const resumePlan = await createCopilotLaunchPlan(["--resume"], launcherOpts);
    expect(resumePlan.args).toEqual(["--resume", "--model=claude-sonnet-4"]);

    const resumeIdPlan = await createCopilotLaunchPlan(["--resume=sess-456"], launcherOpts);
    expect(resumeIdPlan.args).toEqual(["--resume=sess-456", "--model=claude-sonnet-4"]);

    const multiArgPlan = await createCopilotLaunchPlan(["--allow-all-tools", "--continue"], launcherOpts);
    expect(multiArgPlan.args).toEqual(["--allow-all-tools", "--continue", "--model=claude-sonnet-4"]);
  });

  test("preserves explicit user model overrides (--model value and --model=value) without duplicating or overriding", async () => {
    const options = await fixture();
    await writeCopilotState(createCopilotState(MODEL.id), options);
    const executable: CopilotExecutable = { command: "/test/bin/copilot", source: "PATH" };
    const launcherOpts = { ...options, findExecutable: () => executable };

    const explicitValuePlan = await createCopilotLaunchPlan(["--continue", "--model", "custom-model"], launcherOpts);
    expect(explicitValuePlan.args).toEqual(["--continue", "--model", "custom-model"]);

    const resumeExplicitValuePlan = await createCopilotLaunchPlan(["--resume", "--model", "custom-model"], launcherOpts);
    expect(resumeExplicitValuePlan.args).toEqual(["--resume", "--model", "custom-model"]);

    const explicitEqualsPlan = await createCopilotLaunchPlan(["--continue", "--model=custom-model"], launcherOpts);
    expect(explicitEqualsPlan.args).toEqual(["--continue", "--model=custom-model"]);

    const resumeIdExplicitEqualsPlan = await createCopilotLaunchPlan(["--resume=sess-456", "--model=custom-model"], launcherOpts);
    expect(resumeIdExplicitEqualsPlan.args).toEqual(["--resume=sess-456", "--model=custom-model"]);
  });

  test("leaves ordinary non-resume launches completely unchanged", async () => {
    const options = await fixture();
    await writeCopilotState(createCopilotState(MODEL.id), options);
    const executable: CopilotExecutable = { command: "/test/bin/copilot", source: "PATH" };
    const launcherOpts = { ...options, findExecutable: () => executable };

    const plan1 = await createCopilotLaunchPlan(["--allow-all-tools", "hello"], launcherOpts);
    expect(plan1.args).toEqual(["--allow-all-tools", "hello"]);

    const plan2 = await createCopilotLaunchPlan([], launcherOpts);
    expect(plan2.args).toEqual([]);
  });

  test("leaves resume arguments unchanged when model has no Copilot catalog mapping", async () => {
    const unknownModel = {
      ...MODEL,
      id: "custom-local-model",
      displayName: "Custom Model",
    };
    const options = await fixture();
    options.fetch = catalogFetch([unknownModel]);
    await writeCopilotState(createCopilotState(unknownModel.id), options);
    const executable: CopilotExecutable = { command: "/test/bin/copilot", source: "PATH" };

    const plan = await createCopilotLaunchPlan(["--continue"], {
      ...options,
      findExecutable: () => executable,
    });
    expect(plan.args).toEqual(["--continue"]);
    expect(plan.catalogModelId).toBeUndefined();
    expect(plan.env.COPILOT_PROVIDER_WIRE_MODEL).toBe("custom-local-model");
    expect(plan.env.COPILOT_PROVIDER_MODEL_ID).toBe("custom-local-model");
    expect(plan.env).not.toHaveProperty("COPILOT_MODEL");
  });

  test("separates Gemini wire model from native catalog override on resume", async () => {
    const geminiModel = {
      id: "google/gemini-2.5-flash",
      displayName: "Gemini 2.5 Flash",
      owner: "CLIProxyAPI",
      source: "enriched" as const,
      reasoning: false,
      reasoningLevels: [],
      input: ["text"] as const,
      contextWindow: 1_000_000,
      maxTokens: 64_000,
    };
    const options = await fixture();
    options.fetch = catalogFetch([geminiModel]);
    await writeCopilotState(createCopilotState(geminiModel.id), options);
    const executable: CopilotExecutable = { command: "/test/bin/copilot", source: "PATH" };

    const plan = await createCopilotLaunchPlan(["--continue"], {
      ...options,
      findExecutable: () => executable,
    });

    expect(plan.args).toEqual(["--continue", "--model=gemini-2.5-pro"]);
    expect(plan.catalogModelId).toBe("gemini-2.5-pro");
    expect(plan.env.COPILOT_PROVIDER_WIRE_MODEL).toBe("google/gemini-2.5-flash");
    expect(plan.env.COPILOT_PROVIDER_MODEL_ID).toBe("gemini-2.5-pro");
    expect(plan.env.COPILOT_MODEL).toBe("gemini-2.5-pro");
  });

  test("does not leak credentials through doctor output and marks unavailable selected models", async () => {
    const options = await fixture();
    await writeCopilotState(createCopilotState(MODEL.id), options);
    const output: string[] = [];
    await expect(runCopilotCLI(["doctor"], {
      ...options,
      fetch: catalogFetch([]),
      findExecutable: () => ({ command: "/test/bin/copilot", source: "PATH" }),
      runCopilot: async () => ({ available: true, version: "copilot 1.0.86" }),
      stdout: (line) => output.push(line),
    })).resolves.toBe(0);

    const report = output.join("\n");
    expect(report).not.toContain(SECRET);
    expect(report).not.toContain("ignored");
    expect(report).toContain("Copilot: copilot 1.0.86");
    expect(report).toContain("API key: set");
    expect(report).toContain("Proxy models: reachable");
    expect(report).toContain(`${MODEL.id} (unavailable)`);
  });

  test("routes VS Code synchronization, status, uninstall, and doctor without printing secrets", async () => {
    const path = "/isolated/chatLanguageModels.json";
    const files = new Map<string, string>();
    const fileSystem = {
      mkdir: async () => undefined,
      readFile: async (target: string) => {
        const content = files.get(target);
        if (content === undefined) throw Object.assign(new Error("not found"), { code: "ENOENT" });
        return content;
      },
      writeFile: async (target: string, content: string) => { files.set(target, content); },
      rename: async (from: string, to: string) => { files.set(to, files.get(from)!); files.delete(from); },
      unlink: async (target: string) => { files.delete(target); },
    } as unknown as VSCodeFileSystem;
    const output: string[] = [];
    const options = { ...(await fixture()), vscodeConfigPath: path, fileSystem, stdout: (line: string) => output.push(line) };
    await expect(runCopilotCLI(["sync"], options)).resolves.toBe(0);
    await expect(runCopilotCLI(["vscode", "status"], options)).resolves.toBe(0);
    await expect(runCopilotCLI(["vscode", "uninstall"], options)).resolves.toBe(0);
    await expect(runCopilotCLI(["doctor"], { ...options, findExecutable: () => undefined })).resolves.toBe(0);
    expect(output.join("\n")).toContain("VS Code Custom Endpoint: synchronized");
    expect(output.join("\n")).toContain("VS Code Custom Endpoint: managed");
    expect(output.join("\n")).toContain("VS Code secret:");
    expect(output.join("\n")).toContain("VS Code Custom Endpoint: removed");
    expect(output.join("\n")).not.toContain(SECRET);
  });

  test("passes launch arguments only after -- and rejects invalid VS Code commands", async () => {
    const options = await fixture();
    const calls: string[][] = [];
    await expect(runCopilotCLI(["launch", "--", "--allow-all-tools", "hello"], {
      ...options,
      launch: async (args) => { calls.push(args); return 23; },
    })).resolves.toBe(23);
    expect(calls).toEqual([["--allow-all-tools", "hello"]]);

    const errors: string[] = [];
    await expect(runCopilotCLI(["launch", "hello"], { ...options, stderr: (line) => errors.push(line) })).resolves.toBe(1);
    await expect(runCopilotCLI(["vscode", "unknown"], { ...options, stderr: (line) => errors.push(line) })).resolves.toBe(1);
    expect(errors.join("\n")).toContain("Use -- before Copilot arguments");
    expect(errors.join("\n")).toContain("Usage: pi-kit-copilot vscode");
  });

  test("interactively selects a model and persists non-secret state via pick", async () => {
    const options = await fixture();
    const output: string[] = [];
    let pickerCalled = false;

    await expect(runCopilotCLI(["pick"], {
      ...options,
      picker: async (models) => {
        pickerCalled = true;
        return models[0];
      },
      stdout: (line) => output.push(line),
    })).resolves.toBe(0);

    expect(pickerCalled).toBe(true);
    expect(output.join("\n")).toContain(`Selected Copilot model: ${MODEL.id}`);
    expect(await readCopilotState(options)).toEqual({ version: 1, modelId: MODEL.id, wireApi: "responses" });
  });

  test("persists completions wire API when requested via pick --wire-api=completions", async () => {
    const options = await fixture();
    await expect(runCopilotCLI(["pick", "--wire-api=completions"], {
      ...options,
      picker: async (models) => models[0],
      stdout: () => undefined,
    })).resolves.toBe(0);

    expect(await readCopilotState(options)).toEqual({ version: 1, modelId: MODEL.id, wireApi: "completions" });
  });

  test("cancellation in pick is a successful no-op and does not modify state", async () => {
    const options = await fixture();
    await writeCopilotState(createCopilotState("previous-model"), options);

    await expect(runCopilotCLI(["pick"], {
      ...options,
      picker: async () => undefined,
      stdout: () => undefined,
    })).resolves.toBe(0);

    expect((await readCopilotState(options))?.modelId).toBe("previous-model");
  });

  test("rejects invalid pick arguments and reports usage or wire-api errors", async () => {
    const options = await fixture();
    const errors: string[] = [];
    const stderr = (line: string) => errors.push(line);

    await expect(runCopilotCLI(["pick", "--invalid"], { ...options, stderr })).resolves.toBe(1);
    await expect(runCopilotCLI(["pick", "--wire-api=invalid"], { ...options, stderr })).resolves.toBe(1);
    await expect(runCopilotCLI(["pick", "extra", "args"], { ...options, stderr })).resolves.toBe(1);

    expect(errors.some((e) => e.includes("Usage: pi-kit-copilot pick"))).toBe(true);
    expect(errors.some((e) => e.includes("--wire-api must be responses or completions"))).toBe(true);
  });

  test("composes picker and launch with launch --pick and forwards post--- arguments", async () => {
    const options = await fixture();
    const launchCalls: string[][] = [];
    const output: string[] = [];

    await expect(runCopilotCLI(["launch", "--pick", "--wire-api=completions", "--", "--allow-all-tools", "task"], {
      ...options,
      picker: async (models) => models[0],
      launch: async (args) => {
        launchCalls.push(args);
        return 42;
      },
      stdout: (line) => output.push(line),
    })).resolves.toBe(42);

    expect(output.join("\n")).toContain(`Selected Copilot model: ${MODEL.id}`);
    expect(await readCopilotState(options)).toEqual({ version: 1, modelId: MODEL.id, wireApi: "completions" });
    expect(launchCalls).toEqual([["--allow-all-tools", "task"]]);
  });

  test("cancellation in launch --pick is a successful no-op that does not launch or persist", async () => {
    const options = await fixture();
    let launchCalled = false;

    await expect(runCopilotCLI(["launch", "--pick", "--", "hello"], {
      ...options,
      picker: async () => undefined,
      launch: async () => {
        launchCalled = true;
        return 0;
      },
      stdout: () => undefined,
    })).resolves.toBe(0);

    expect(launchCalled).toBe(false);
    expect(await readCopilotState(options)).toBeUndefined();
  });

  test("ordinary launch -- --pick passes --pick directly to Copilot without invoking the picker", async () => {
    const options = await fixture();
    await writeCopilotState(createCopilotState(MODEL.id), options);
    let pickerCalled = false;
    const launchCalls: string[][] = [];

    await expect(runCopilotCLI(["launch", "--", "--pick"], {
      ...options,
      picker: async () => {
        pickerCalled = true;
        return undefined;
      },
      launch: async (args) => {
        launchCalls.push(args);
        return 0;
      },
    })).resolves.toBe(0);

    expect(pickerCalled).toBe(false);
    expect(launchCalls).toEqual([["--pick"]]);
  });

  test("rejects --wire-api without --pick and missing -- separator in launch", async () => {
    const options = await fixture();
    const errors: string[] = [];
    const stderr = (line: string) => errors.push(line);

    await expect(runCopilotCLI(["launch", "--wire-api=completions", "--", "hello"], { ...options, stderr })).resolves.toBe(1);
    await expect(runCopilotCLI(["launch", "--pick", "missing-separator"], { ...options, stderr })).resolves.toBe(1);

    expect(errors.some((e) => e.includes("--wire-api can only be used with --pick"))).toBe(true);
    expect(errors.some((e) => e.includes("Use -- before Copilot arguments"))).toBe(true);
  });

  test("interactively selects a model, persists state, and forwards --continue to injected launch seam via switch", async () => {
    const options = await fixture();
    const launchCalls: string[][] = [];
    const output: string[] = [];
    let pickerCalled = false;

    await expect(runCopilotCLI(["switch"], {
      ...options,
      picker: async (models) => {
        pickerCalled = true;
        return models[0];
      },
      launch: async (args) => {
        launchCalls.push(args);
        return 17;
      },
      stdout: (line) => output.push(line),
    })).resolves.toBe(17);

    expect(pickerCalled).toBe(true);
    // Injected launch seam receives the requested switch arguments (["--continue"]);
    // launch-plan construction normalizes subprocess args by appending --model=<catalogModelId>.
    expect(launchCalls).toEqual([["--continue"]]);
    expect(output.join("\n")).toContain(`Selected Copilot model: ${MODEL.id}`);
    expect(await readCopilotState(options)).toEqual({ version: 1, modelId: MODEL.id, wireApi: "responses" });
  });

  test("persists completions wire API and forwards --continue to injected launch seam via switch --wire-api=completions", async () => {
    const options = await fixture();
    const launchCalls: string[][] = [];

    await expect(runCopilotCLI(["switch", "--wire-api=completions"], {
      ...options,
      picker: async (models) => models[0],
      launch: async (args) => {
        launchCalls.push(args);
        return 0;
      },
      stdout: () => undefined,
    })).resolves.toBe(0);

    // Injected launch seam receives ["--continue"] directly; normalization occurs during launch-plan construction
    expect(launchCalls).toEqual([["--continue"]]);
    expect(await readCopilotState(options)).toEqual({ version: 1, modelId: MODEL.id, wireApi: "completions" });
  });

  test("cancellation in switch returns 0, does not launch, and preserves existing state byte-for-byte", async () => {
    const options = await fixture();
    const statePath = resolveCopilotStatePath(options);
    await writeCopilotState(createCopilotState("previous-model", "completions"), options);
    const beforeBytes = await readFile(statePath, "utf8");
    let launchCalled = false;

    await expect(runCopilotCLI(["switch"], {
      ...options,
      picker: async () => undefined,
      launch: async () => {
        launchCalled = true;
        return 0;
      },
      stdout: () => undefined,
    })).resolves.toBe(0);

    expect(launchCalled).toBe(false);
    const afterBytes = await readFile(statePath, "utf8");
    expect(afterBytes).toBe(beforeBytes);
    expect(await readCopilotState(options)).toEqual({ version: 1, modelId: "previous-model", wireApi: "completions" });
  });

  test("cancellation in switch with no prior state does not create a state file and does not launch", async () => {
    const options = await fixture();
    const statePath = resolveCopilotStatePath(options);
    let launchCalled = false;

    await expect(runCopilotCLI(["switch"], {
      ...options,
      picker: async () => undefined,
      launch: async () => {
        launchCalled = true;
        return 0;
      },
      stdout: () => undefined,
    })).resolves.toBe(0);

    expect(launchCalled).toBe(false);
    expect(await readCopilotState(options)).toBeUndefined();
    const { existsSync } = await import("node:fs");
    expect(existsSync(statePath)).toBe(false);
  });

  test("rejects invalid switch arguments, positional args, and passthrough without writing state or launching", async () => {
    const options = await fixture();
    const invalidInvocations = [
      ["switch", "--invalid"],
      ["switch", "positional"],
      ["switch", "--"],
      ["switch", "--", "--continue"],
      ["switch", "--wire-api=invalid"],
      ["switch", "--wire-api=responses", "extra"],
      ["switch", "--wire-api=responses", "--wire-api=completions"],
    ];

    for (const invocation of invalidInvocations) {
      const errors: string[] = [];
      let launchCalled = false;
      let pickerCalled = false;

      await expect(runCopilotCLI(invocation, {
        ...options,
        picker: async () => {
          pickerCalled = true;
          return MODEL;
        },
        launch: async () => {
          launchCalled = true;
          return 0;
        },
        stderr: (line) => errors.push(line),
      })).resolves.toBe(1);

      expect(pickerCalled).toBe(false);
      expect(launchCalled).toBe(false);
      expect(await readCopilotState(options)).toBeUndefined();
      expect(errors.some((e) =>
        e.includes("Usage: pi-kit-copilot switch [--wire-api=responses|completions]") ||
        e.includes("--wire-api must be responses or completions")
      )).toBe(true);
    }
  });

  test("displays help message including switch command and updated use options", async () => {
    const output: string[] = [];
    await expect(runCopilotCLI(["--help"], { stdout: (line) => output.push(line) })).resolves.toBe(0);
    const text = output.join("\n");
    expect(text).toContain("switch [--wire-api=...]");
    expect(text).toContain("use <model-id> [--wire-api=...] [--reasoning-effort=...]");
  });
});

describe("pi-kit-copilot reasoning effort CLI workflows", () => {
  test.each([
    { state: undefined, expectedEffort: "none", expectedModel: "none", expectedWireApi: "responses" },
    { state: createCopilotState(MODEL.id), expectedEffort: "none", expectedModel: MODEL.id, expectedWireApi: "responses" },
    { state: createCopilotState(REASONING_MODEL.id, "completions", "Medium"), expectedEffort: "Medium", expectedModel: REASONING_MODEL.id, expectedWireApi: "completions" },
  ])("status reports model, wireApi, and reasoning effort: $expectedEffort", async ({ state, expectedEffort, expectedModel, expectedWireApi }) => {
    const options = await fixture();
    if (state) await writeCopilotState(state, options);
    const output: string[] = [];
    await expect(runCopilotCLI(["status"], { ...options, stdout: (line) => output.push(line) })).resolves.toBe(0);
    const text = output.join("\n");
    expect(text).toContain(`Selection: ${expectedModel}`);
    expect(text).toContain(`Wire API: ${expectedWireApi}`);
    expect(text).toContain(`Reasoning effort: ${expectedEffort}`);
  });

  test("matchReasoningEffort handles exact, unique CI, ambiguous CI, and missing values", () => {
    const levels = ["LOW", "Medium", "high"];
    expect(matchReasoningEffort("LOW", levels)).toEqual({ matched: "LOW" });
    expect(matchReasoningEffort("low", levels)).toEqual({ matched: "LOW" });
    expect(matchReasoningEffort("MEDIUM", levels)).toEqual({ matched: "Medium" });
    expect(matchReasoningEffort("extreme", levels)).toEqual({});
    expect(matchReasoningEffort("", levels)).toEqual({});

    const ambiguous = ["low", "LOW"];
    expect(matchReasoningEffort("low", ambiguous)).toEqual({ matched: "low" });
    expect(matchReasoningEffort("LOW", ambiguous)).toEqual({ matched: "LOW" });
    expect(matchReasoningEffort("Low", ambiguous)).toEqual({ ambiguous: true });
  });

  test.each([
    {
      desc: "exact advertised reasoning effort",
      args: ["use", REASONING_MODEL.id, "--reasoning-effort=Medium"],
      expectedModel: REASONING_MODEL.id,
      expectedWireApi: "responses" as const,
      expectedEffort: "Medium",
    },
    {
      desc: "unique case-insensitive match preserving exact advertised spelling",
      args: ["use", REASONING_MODEL.id, "--reasoning-effort=low"],
      expectedModel: REASONING_MODEL.id,
      expectedWireApi: "responses" as const,
      expectedEffort: "LOW",
    },
    {
      desc: "--wire-api before --reasoning-effort",
      args: ["use", REASONING_MODEL.id, "--wire-api=completions", "--reasoning-effort=high"],
      expectedModel: REASONING_MODEL.id,
      expectedWireApi: "completions" as const,
      expectedEffort: "high",
    },
    {
      desc: "--reasoning-effort before --wire-api",
      args: ["use", CUSTOM_MODEL.id, "--reasoning-effort=Budget-4K", "--wire-api=responses"],
      expectedModel: CUSTOM_MODEL.id,
      expectedWireApi: "responses" as const,
      expectedEffort: "Budget-4K",
    },
    {
      desc: "exact match on model with multiple case variants",
      args: ["use", AMBIGUOUS_MODEL.id, "--reasoning-effort=low"],
      expectedModel: AMBIGUOUS_MODEL.id,
      expectedWireApi: "responses" as const,
      expectedEffort: "low",
    },
    {
      desc: "model without effort option omitting effort in state and output",
      args: ["use", REASONING_MODEL.id],
      expectedModel: REASONING_MODEL.id,
      expectedWireApi: "responses" as const,
      expectedEffort: undefined,
    },
  ])("use successfully handles $desc", async ({ args, expectedModel, expectedWireApi, expectedEffort }) => {
    const options = await fixture();
    options.fetch = reasoningCatalogFetch();
    const output: string[] = [];
    await expect(runCopilotCLI(args, { ...options, stdout: (line) => output.push(line) })).resolves.toBe(0);

    const text = output.join("\n");
    expect(text).toContain(`Selected Copilot model: ${expectedModel}`);
    if (expectedEffort) {
      expect(text).toContain(`Reasoning effort: ${expectedEffort}`);
    } else {
      expect(text).not.toContain("Reasoning effort:");
    }
    expect(await readCopilotState(options)).toEqual({
      version: 1,
      modelId: expectedModel,
      wireApi: expectedWireApi,
      ...(expectedEffort ? { reasoningEffort: expectedEffort } : {}),
    });
  });

  test.each([
    { args: ["use", REASONING_MODEL.id, "--wire-api=responses", "--wire-api=completions"], expectedErr: "Duplicate option: --wire-api" },
    { args: ["use", REASONING_MODEL.id, "--reasoning-effort=low", "--reasoning-effort=high"], expectedErr: "Duplicate option: --reasoning-effort" },
    { args: ["use", REASONING_MODEL.id, "--reasoning-effort"], expectedErr: "--reasoning-effort requires a value" },
    { args: ["use", REASONING_MODEL.id, "--reasoning-effort="], expectedErr: "--reasoning-effort requires a value" },
    { args: ["use", REASONING_MODEL.id, "--wire-api"], expectedErr: "--wire-api requires a value" },
    { args: ["use", REASONING_MODEL.id, "--wire-api="], expectedErr: "--wire-api requires a value" },
    { args: ["use", REASONING_MODEL.id, "--unknown=val"], expectedErr: "Unknown option: --unknown=val" },
    { args: ["use"], expectedErr: "Usage: pi-kit-copilot use" },
    { args: ["use", REASONING_MODEL.id, "extra-model"], expectedErr: "Usage: pi-kit-copilot use" },
    { args: ["use", MODEL.id, "--reasoning-effort=high"], expectedErr: "Model does not support authoritative reasoning effort" },
    { args: ["use", HEURISTIC_MODEL.id, "--reasoning-effort=high"], expectedErr: "Model does not support authoritative reasoning effort" },
    { args: ["use", REASONING_MODEL.id, "--reasoning-effort=extreme"], expectedErr: 'Reasoning effort "extreme" is not supported' },
    { args: ["use", AMBIGUOUS_MODEL.id, "--reasoning-effort=Low"], expectedErr: 'Reasoning effort "Low" is ambiguous' },
  ])("use rejects invalid invocation $args: $expectedErr", async ({ args, expectedErr }) => {
    const options = await fixture();
    options.fetch = reasoningCatalogFetch();
    await writeCopilotState(createCopilotState("previous-model"), options);
    const errors: string[] = [];
    await expect(runCopilotCLI(args, { ...options, stderr: (line) => errors.push(line) })).resolves.toBe(1);
    expect(errors.join("\n")).toContain(expectedErr);
    expect((await readCopilotState(options))?.modelId).toBe("previous-model");
  });

  test("invokes effortPicker for authoritative models and skips for non-authoritative models during pick", async () => {
    const options = await fixture();
    options.fetch = reasoningCatalogFetch();
    const output: string[] = [];
    let effortPickerReceived: any = null;

    await expect(runCopilotCLI(["pick"], {
      ...options,
      picker: async (models) => models.find((m) => m.id === REASONING_MODEL.id),
      effortPicker: async (levels, opts) => {
        effortPickerReceived = { levels, opts };
        return "Medium";
      },
      stdout: (line) => output.push(line),
    })).resolves.toBe(0);

    expect(effortPickerReceived.levels).toEqual(["LOW", "Medium", "high"]);
    expect(effortPickerReceived.opts.defaultLevel).toBe("medium");
    expect(effortPickerReceived.opts.modelId).toBe(REASONING_MODEL.id);
    expect(output.join("\n")).toContain(`Selected Copilot model: ${REASONING_MODEL.id}`);
    expect(output.join("\n")).toContain("Reasoning effort: Medium");
    expect(await readCopilotState(options)).toEqual({
      version: 1,
      modelId: REASONING_MODEL.id,
      wireApi: "responses",
      reasoningEffort: "Medium",
    });

    let nonAuthEffortPickerCalled = false;
    await expect(runCopilotCLI(["pick"], {
      ...options,
      picker: async (models) => models.find((m) => m.id === HEURISTIC_MODEL.id),
      effortPicker: async () => {
        nonAuthEffortPickerCalled = true;
        return "high";
      },
      stdout: () => undefined,
    })).resolves.toBe(0);

    expect(nonAuthEffortPickerCalled).toBe(false);
    expect(await readCopilotState(options)).toEqual({
      version: 1,
      modelId: HEURISTIC_MODEL.id,
      wireApi: "responses",
    });
  });

  test.each([
    {
      command: ["pick"],
      setup: async (opts: any) => {
        await writeCopilotState(createCopilotState("previous-model", "completions", "low"), opts);
      },
      verify: async (opts: any, beforeBytes: string | undefined, launchCalled: boolean) => {
        expect(launchCalled).toBe(false);
        const afterBytes = await readFile(resolveCopilotStatePath(opts), "utf8");
        expect(afterBytes).toBe(beforeBytes!);
        expect(await readCopilotState(opts)).toEqual({
          version: 1,
          modelId: "previous-model",
          wireApi: "completions",
          reasoningEffort: "low",
        });
      },
    },
    {
      command: ["switch"],
      setup: async (opts: any) => {
        await writeCopilotState(createCopilotState("previous-model", "responses"), opts);
      },
      verify: async (opts: any, beforeBytes: string | undefined, launchCalled: boolean) => {
        expect(launchCalled).toBe(false);
        const afterBytes = await readFile(resolveCopilotStatePath(opts), "utf8");
        expect(afterBytes).toBe(beforeBytes!);
      },
    },
    {
      command: ["switch"],
      setup: async () => {},
      verify: async (opts: any, _before: any, launchCalled: boolean) => {
        expect(launchCalled).toBe(false);
        expect(await readCopilotState(opts)).toBeUndefined();
        const { existsSync } = await import("node:fs");
        expect(existsSync(resolveCopilotStatePath(opts))).toBe(false);
      },
    },
    {
      command: ["launch", "--pick", "--", "hello"],
      setup: async () => {},
      verify: async (opts: any, _before: any, launchCalled: boolean) => {
        expect(launchCalled).toBe(false);
        expect(await readCopilotState(opts)).toBeUndefined();
      },
    },
  ])("cancellation in effortPicker for $command is a successful no-op preserving previous state byte-for-byte and not launching", async ({ command, setup, verify }) => {
    const options = await fixture();
    options.fetch = reasoningCatalogFetch();
    await setup(options);
    const statePath = resolveCopilotStatePath(options);
    const { existsSync } = await import("node:fs");
    const beforeBytes = existsSync(statePath) ? await readFile(statePath, "utf8") : undefined;
    let launchCalled = false;

    await expect(runCopilotCLI(command, {
      ...options,
      picker: async (models) => models.find((m) => m.id === REASONING_MODEL.id),
      effortPicker: async () => undefined, // cancelled
      launch: async () => {
        launchCalled = true;
        return 0;
      },
      stdout: () => undefined,
    })).resolves.toBe(0);

    await verify(options, beforeBytes, launchCalled);
  });

  test("does not leak credentials through status, use, or pick output", async () => {
    const options = await fixture();
    options.fetch = reasoningCatalogFetch();
    const output: string[] = [];
    const stdout = (line: string) => output.push(line);

    await runCopilotCLI(["use", REASONING_MODEL.id, "--reasoning-effort=Medium"], { ...options, stdout });
    await runCopilotCLI(["status"], { ...options, stdout });
    await runCopilotCLI(["pick"], {
      ...options,
      picker: async (models) => models.find((m) => m.id === CUSTOM_MODEL.id),
      effortPicker: async () => "xHigh",
      stdout,
    });

    const fullOutput = output.join("\n");
    expect(fullOutput).not.toContain(SECRET);
    expect(fullOutput).not.toContain("ignored");
    const stateContent = await readFile(resolveCopilotStatePath(options), "utf8");
    expect(stateContent).not.toContain(SECRET);
  });
});

describe("pi-kit-copilot BYOK launcher reasoning effort handling", () => {
  const executable: CopilotExecutable = { command: "/test/bin/copilot", source: "PATH" };

  test("appends reasoning effort to ordinary new launches when persisted in state", async () => {
    const options = await fixture();
    options.fetch = reasoningCatalogFetch();
    await writeCopilotState(createCopilotState(REASONING_MODEL.id, "responses", "Medium"), options);
    const launcherOpts = { ...options, findExecutable: () => executable };

    const plan1 = await createCopilotLaunchPlan(["--allow-all-tools", "hello"], launcherOpts);
    expect(plan1.args).toEqual(["--allow-all-tools", "hello", "--reasoning-effort=Medium"]);
    expect(plan1.reasoningEffort).toBe("Medium");
    expect(plan1.env.COPILOT_PROVIDER_WIRE_MODEL).toBe(REASONING_MODEL.id);

    const plan2 = await createCopilotLaunchPlan([], launcherOpts);
    expect(plan2.args).toEqual(["--reasoning-effort=Medium"]);
    expect(plan2.reasoningEffort).toBe("Medium");
  });

  test("appends both catalog model override and reasoning effort to all resume forms", async () => {
    const options = await fixture();
    options.fetch = reasoningCatalogFetch();
    await writeCopilotState(createCopilotState(REASONING_MODEL.id, "responses", "Medium"), options);
    const launcherOpts = { ...options, findExecutable: () => executable };

    const continuePlan = await createCopilotLaunchPlan(["--continue"], launcherOpts);
    expect(continuePlan.args).toEqual(["--continue", "--model=claude-sonnet-4", "--reasoning-effort=Medium"]);
    expect(continuePlan.reasoningEffort).toBe("Medium");

    const resumePlan = await createCopilotLaunchPlan(["--resume"], launcherOpts);
    expect(resumePlan.args).toEqual(["--resume", "--model=claude-sonnet-4", "--reasoning-effort=Medium"]);
    expect(resumePlan.reasoningEffort).toBe("Medium");

    const resumeIdPlan = await createCopilotLaunchPlan(["--resume=sess-456"], launcherOpts);
    expect(resumeIdPlan.args).toEqual(["--resume=sess-456", "--model=claude-sonnet-4", "--reasoning-effort=Medium"]);
    expect(resumeIdPlan.reasoningEffort).toBe("Medium");

    const multiArgPlan = await createCopilotLaunchPlan(["--allow-all-tools", "--continue"], launcherOpts);
    expect(multiArgPlan.args).toEqual(["--allow-all-tools", "--continue", "--model=claude-sonnet-4", "--reasoning-effort=Medium"]);
    expect(multiArgPlan.reasoningEffort).toBe("Medium");
  });

  test("respects model and reasoning effort overrides independently", async () => {
    const options = await fixture();
    options.fetch = reasoningCatalogFetch();
    await writeCopilotState(createCopilotState(REASONING_MODEL.id, "responses", "Medium"), options);
    const launcherOpts = { ...options, findExecutable: () => executable };

    // Explicit model override, default reasoning effort
    const explicitModelValPlan = await createCopilotLaunchPlan(["--continue", "--model", "custom-model"], launcherOpts);
    expect(explicitModelValPlan.args).toEqual(["--continue", "--model", "custom-model", "--reasoning-effort=Medium"]);

    const explicitModelEqPlan = await createCopilotLaunchPlan(["--continue", "--model=custom-model"], launcherOpts);
    expect(explicitModelEqPlan.args).toEqual(["--continue", "--model=custom-model", "--reasoning-effort=Medium"]);

    const resumeIdExplicitModelPlan = await createCopilotLaunchPlan(["--resume=sess-456", "--model=custom-model"], launcherOpts);
    expect(resumeIdExplicitModelPlan.args).toEqual(["--resume=sess-456", "--model=custom-model", "--reasoning-effort=Medium"]);

    // Explicit reasoning effort override, default model override
    const explicitEffortValPlan = await createCopilotLaunchPlan(["--continue", "--reasoning-effort", "low"], launcherOpts);
    expect(explicitEffortValPlan.args).toEqual(["--continue", "--reasoning-effort", "low", "--model=claude-sonnet-4"]);

    const explicitEffortEqPlan = await createCopilotLaunchPlan(["--continue", "--reasoning-effort=low"], launcherOpts);
    expect(explicitEffortEqPlan.args).toEqual(["--continue", "--reasoning-effort=low", "--model=claude-sonnet-4"]);

    const resumeIdExplicitEffortPlan = await createCopilotLaunchPlan(["--resume=sess-456", "--reasoning-effort=low"], launcherOpts);
    expect(resumeIdExplicitEffortPlan.args).toEqual(["--resume=sess-456", "--reasoning-effort=low", "--model=claude-sonnet-4"]);

    // Both explicit overrides present on resume
    const bothExplicitPlan = await createCopilotLaunchPlan(
      ["--continue", "--model=custom-model", "--reasoning-effort=low"],
      launcherOpts,
    );
    expect(bothExplicitPlan.args).toEqual(["--continue", "--model=custom-model", "--reasoning-effort=low"]);

    // Ordinary launch with explicit reasoning effort override
    const ordinaryExplicitValPlan = await createCopilotLaunchPlan(
      ["--allow-all-tools", "--reasoning-effort", "low", "hello"],
      launcherOpts,
    );
    expect(ordinaryExplicitValPlan.args).toEqual(["--allow-all-tools", "--reasoning-effort", "low", "hello"]);

    const ordinaryExplicitEqPlan = await createCopilotLaunchPlan(
      ["--allow-all-tools", "--reasoning-effort=low", "hello"],
      launcherOpts,
    );
    expect(ordinaryExplicitEqPlan.args).toEqual(["--allow-all-tools", "--reasoning-effort=low", "hello"]);
  });

  test("reconciles case-insensitively when unique and emits provider-advertised spelling", async () => {
    const options = await fixture();
    options.fetch = reasoningCatalogFetch();
    const launcherOpts = { ...options, findExecutable: () => executable };

    // "medium" -> "Medium"
    await writeCopilotState(createCopilotState(REASONING_MODEL.id, "responses", "medium"), options);
    const plan1 = await createCopilotLaunchPlan(["--continue"], launcherOpts);
    expect(plan1.args).toEqual(["--continue", "--model=claude-sonnet-4", "--reasoning-effort=Medium"]);
    expect(plan1.reasoningEffort).toBe("Medium");

    // "low" -> "LOW"
    await writeCopilotState(createCopilotState(REASONING_MODEL.id, "responses", "low"), options);
    const plan2 = await createCopilotLaunchPlan(["--allow-all-tools"], launcherOpts);
    expect(plan2.args).toEqual(["--allow-all-tools", "--reasoning-effort=LOW"]);
    expect(plan2.reasoningEffort).toBe("LOW");

    // "budget-4k" -> "Budget-4K" (model with no catalog model ID)
    await writeCopilotState(createCopilotState(CUSTOM_MODEL.id, "responses", "budget-4k"), options);
    const plan3 = await createCopilotLaunchPlan(["--continue"], launcherOpts);
    expect(plan3.args).toEqual(["--continue", "--reasoning-effort=Budget-4K"]);
    expect(plan3.reasoningEffort).toBe("Budget-4K");
    expect(plan3.catalogModelId).toBeUndefined();
  });

  test("rejects stale or unsupported reasoning effort with an actionable error before spawn", async () => {
    const options = await fixture();
    options.fetch = reasoningCatalogFetch();
    await writeCopilotState(createCopilotState(REASONING_MODEL.id, "responses", "extreme"), options);

    await expect(createCopilotLaunchPlan(["--continue"], { ...options, findExecutable: () => executable }))
      .rejects.toThrow('Persisted reasoning effort "extreme" is not supported by model anthropic/claude-3-7-sonnet. Advertised levels: LOW, Medium, high');
  });

  test("rejects ambiguous case-insensitive reasoning effort with an actionable error before spawn", async () => {
    const options = await fixture();
    options.fetch = reasoningCatalogFetch();
    await writeCopilotState(createCopilotState(AMBIGUOUS_MODEL.id, "responses", "Low"), options);

    await expect(createCopilotLaunchPlan(["--continue"], { ...options, findExecutable: () => executable }))
      .rejects.toThrow('Persisted reasoning effort "Low" is ambiguous for model team/ambiguous-thinker. Advertised levels: low, LOW');
  });

  test("rejects non-authoritative model metadata with an actionable error before spawn", async () => {
    const options = await fixture();
    options.fetch = reasoningCatalogFetch();
    await writeCopilotState(createCopilotState(HEURISTIC_MODEL.id, "responses", "high"), options);

    await expect(createCopilotLaunchPlan(["--continue"], { ...options, findExecutable: () => executable }))
      .rejects.toThrow("Selected Copilot model does not support authoritative reasoning effort: google/gemini-fallback");
  });

  test("rejects empty-authority model metadata with an actionable error before spawn", async () => {
    const options = await fixture();
    options.fetch = reasoningCatalogFetch();
    await writeCopilotState(createCopilotState(MODEL.id, "responses", "high"), options);

    await expect(createCopilotLaunchPlan(["--continue"], { ...options, findExecutable: () => executable }))
      .rejects.toThrow("Selected Copilot model does not support authoritative reasoning effort: team/claude-opus-4.6");
  });

  test("leaves arguments and plan effort undefined for legacy state without reasoning effort", async () => {
    const options = await fixture();
    options.fetch = reasoningCatalogFetch();
    await writeCopilotState(createCopilotState(REASONING_MODEL.id, "responses"), options);
    const launcherOpts = { ...options, findExecutable: () => executable };

    const ordinaryPlan = await createCopilotLaunchPlan(["--allow-all-tools", "hello"], launcherOpts);
    expect(ordinaryPlan.args).toEqual(["--allow-all-tools", "hello"]);
    expect(ordinaryPlan.reasoningEffort).toBeUndefined();

    const resumePlan = await createCopilotLaunchPlan(["--continue"], launcherOpts);
    expect(resumePlan.args).toEqual(["--continue", "--model=claude-sonnet-4"]);
    expect(resumePlan.reasoningEffort).toBeUndefined();
  });

  test("does not spawn Copilot CLI when reasoning effort validation fails", async () => {
    const options = await fixture();
    options.fetch = reasoningCatalogFetch();
    await writeCopilotState(createCopilotState(REASONING_MODEL.id, "responses", "invalid-level"), options);

    let spawnCalled = false;
    const mockSpawn = () => {
      spawnCalled = true;
      return {} as any;
    };

    await expect(
      launchCopilot(["--continue"], {
        ...options,
        findExecutable: () => executable,
        spawn: mockSpawn as any,
      }),
    ).rejects.toThrow('Persisted reasoning effort "invalid-level" is not supported by model anthropic/claude-3-7-sonnet');

    expect(spawnCalled).toBe(false);
  });

  test("hasCopilotExplicitReasoningEffortOverride recognizes confirmed forms and ignores non-confirmed aliases", () => {
    expect(hasCopilotExplicitReasoningEffortOverride(["--reasoning-effort", "low"])).toBe(true);
    expect(hasCopilotExplicitReasoningEffortOverride(["--reasoning-effort=low"])).toBe(true);
    expect(hasCopilotExplicitReasoningEffortOverride(["--other", "--reasoning-effort", "high"])).toBe(true);
    expect(hasCopilotExplicitReasoningEffortOverride(["--reasoning-effort"])).toBe(false);
    expect(hasCopilotExplicitReasoningEffortOverride(["--effort", "low"])).toBe(false);
    expect(hasCopilotExplicitReasoningEffortOverride(["--effort=low"])).toBe(false);
    expect(hasCopilotExplicitReasoningEffortOverride(["--model", "custom"])).toBe(false);
  });

  test("hardened override detection ignores malformed forms and tokens after terminator", () => {
    // Empty equals forms are malformed and not valid overrides
    expect(hasCopilotExplicitReasoningEffortOverride(["--reasoning-effort="])).toBe(false);
    expect(hasCopilotExplicitReasoningEffortOverride(["--reasoning-effort=   "])).toBe(false);
    expect(hasCopilotExplicitModelOverride(["--model="])).toBe(false);
    expect(hasCopilotExplicitModelOverride(["--model=   "])).toBe(false);

    // Separate forms followed by another option or empty token are malformed
    expect(hasCopilotExplicitReasoningEffortOverride(["--reasoning-effort", "--continue"])).toBe(false);
    expect(hasCopilotExplicitReasoningEffortOverride(["--reasoning-effort", "-p"])).toBe(false);
    expect(hasCopilotExplicitReasoningEffortOverride(["--reasoning-effort", ""])).toBe(false);
    expect(hasCopilotExplicitModelOverride(["--model", "--allow-all-tools"])).toBe(false);
    expect(hasCopilotExplicitModelOverride(["--model", "-p"])).toBe(false);
    expect(hasCopilotExplicitModelOverride(["--model", ""])).toBe(false);

    // Separate form at end of options before terminator is malformed
    expect(hasCopilotExplicitReasoningEffortOverride(["--reasoning-effort", "--", "hello"])).toBe(false);
    expect(hasCopilotExplicitModelOverride(["--model", "--", "hello"])).toBe(false);

    // Valid forms before terminator
    expect(hasCopilotExplicitReasoningEffortOverride(["--reasoning-effort", "low", "--", "hello"])).toBe(true);
    expect(hasCopilotExplicitReasoningEffortOverride(["--reasoning-effort=low", "--", "hello"])).toBe(true);
    expect(hasCopilotExplicitModelOverride(["--model", "custom", "--", "hello"])).toBe(true);
    expect(hasCopilotExplicitModelOverride(["--model=custom", "--", "hello"])).toBe(true);

    // Tokens after terminator must not count as overrides
    expect(hasCopilotExplicitReasoningEffortOverride(["--", "--reasoning-effort", "low"])).toBe(false);
    expect(hasCopilotExplicitReasoningEffortOverride(["--", "--reasoning-effort=low"])).toBe(false);
    expect(hasCopilotExplicitModelOverride(["--", "--model", "custom"])).toBe(false);
    expect(hasCopilotExplicitModelOverride(["--", "--model=custom"])).toBe(false);

    // isCopilotResumeInvocation ignores tokens after terminator
    expect(isCopilotResumeInvocation(["--continue"])).toBe(true);
    expect(isCopilotResumeInvocation(["--resume"])).toBe(true);
    expect(isCopilotResumeInvocation(["--resume=sess-123"])).toBe(true);
    expect(isCopilotResumeInvocation(["--", "--continue"])).toBe(false);
    expect(isCopilotResumeInvocation(["--", "--resume"])).toBe(false);
  });

  test("reconcileReasoningEffort handles exact match, unique CI, ambiguous, unsupported, and invalid levels", () => {
    const model = {
      id: "test-model",
      displayName: "Test Model",
      owner: "CLIProxyAPI",
      source: "enriched" as const,
      reasoning: true,
      reasoningLevels: ["LOW", "Medium", "high"],
      reasoningLevelsAuthoritative: true,
      input: ["text"] as const,
      contextWindow: 128000,
      maxTokens: 16000,
    };

    // Exact matches
    expect(reconcileReasoningEffort("LOW", model)).toBe("LOW");
    expect(reconcileReasoningEffort("Medium", model)).toBe("Medium");
    expect(reconcileReasoningEffort("high", model)).toBe("high");

    // Case-insensitive match emitting provider-advertised spelling
    expect(reconcileReasoningEffort("low", model)).toBe("LOW");
    expect(reconcileReasoningEffort("medium", model)).toBe("Medium");
    expect(reconcileReasoningEffort("HIGH", model)).toBe("high");

    // Blank or whitespace-only
    expect(() => reconcileReasoningEffort("  ", model)).toThrow("Invalid persisted reasoning effort");

    // Unsupported
    expect(() => reconcileReasoningEffort("ultra", model)).toThrow('Persisted reasoning effort "ultra" is not supported');

    // Ambiguous
    const ambiguousModel = { ...model, reasoningLevels: ["low", "LOW"] };
    expect(() => reconcileReasoningEffort("Low", ambiguousModel)).toThrow('Persisted reasoning effort "Low" is ambiguous');
    // But exact match preferred:
    expect(reconcileReasoningEffort("low", ambiguousModel)).toBe("low");
    expect(reconcileReasoningEffort("LOW", ambiguousModel)).toBe("LOW");

    // Non-authoritative
    const nonAuthModel = { ...model, reasoningLevelsAuthoritative: false };
    expect(() => reconcileReasoningEffort("Medium", nonAuthModel)).toThrow("does not support authoritative reasoning effort");

    // Empty levels
    const emptyModel = { ...model, reasoningLevels: [] };
    expect(() => reconcileReasoningEffort("Medium", emptyModel)).toThrow("does not support authoritative reasoning effort");
  });

  test("normalizeCopilotLaunchArgs inserts before terminator and preserves all argument order", () => {
    // Both added before terminator
    expect(normalizeCopilotLaunchArgs(["--continue", "--", "prompt text"], "claude-sonnet-4", "Medium")).toEqual([
      "--continue",
      "--model=claude-sonnet-4",
      "--reasoning-effort=Medium",
      "--",
      "prompt text",
    ]);

    // Ordinary launch with arguments before and after terminator
    expect(normalizeCopilotLaunchArgs(["--allow-all-tools", "hello", "--", "fix bug"], "claude-sonnet-4", "Medium")).toEqual([
      "--allow-all-tools",
      "hello",
      "--reasoning-effort=Medium",
      "--",
      "fix bug",
    ]);

    // Tokens after terminator do not count as overrides and are preserved after injected flags
    expect(
      normalizeCopilotLaunchArgs(
        ["--continue", "--", "--model=custom", "--reasoning-effort=low"],
        "claude-sonnet-4",
        "Medium",
      ),
    ).toEqual([
      "--continue",
      "--model=claude-sonnet-4",
      "--reasoning-effort=Medium",
      "--",
      "--model=custom",
      "--reasoning-effort=low",
    ]);
  });

  test("normalizeCopilotLaunchArgs preserves malformed overrides untouched and injects valid flags", () => {
    // Empty equals forms do not suppress persisted effort or model
    expect(normalizeCopilotLaunchArgs(["--continue", "--reasoning-effort="], "claude-sonnet-4", "Medium")).toEqual([
      "--continue",
      "--reasoning-effort=",
      "--model=claude-sonnet-4",
      "--reasoning-effort=Medium",
    ]);

    expect(normalizeCopilotLaunchArgs(["--continue", "--model="], "claude-sonnet-4", "Medium")).toEqual([
      "--continue",
      "--model=",
      "--model=claude-sonnet-4",
      "--reasoning-effort=Medium",
    ]);

    // Malformed separate form followed by another flag
    expect(
      normalizeCopilotLaunchArgs(
        ["--continue", "--reasoning-effort", "--allow-all-tools"],
        "claude-sonnet-4",
        "Medium",
      ),
    ).toEqual([
      "--continue",
      "--reasoning-effort",
      "--allow-all-tools",
      "--model=claude-sonnet-4",
      "--reasoning-effort=Medium",
    ]);

    expect(
      normalizeCopilotLaunchArgs(
        ["--continue", "--model", "--allow-all-tools"],
        "claude-sonnet-4",
        "Medium",
      ),
    ).toEqual([
      "--continue",
      "--model",
      "--allow-all-tools",
      "--model=claude-sonnet-4",
      "--reasoning-effort=Medium",
    ]);

    // Malformed separate form before terminator
    expect(
      normalizeCopilotLaunchArgs(
        ["--continue", "--reasoning-effort", "--", "prompt"],
        "claude-sonnet-4",
        "Medium",
      ),
    ).toEqual([
      "--continue",
      "--reasoning-effort",
      "--model=claude-sonnet-4",
      "--reasoning-effort=Medium",
      "--",
      "prompt",
    ]);
  });

  test("normalizeCopilotLaunchArgs handles independent valid and malformed override combinations", () => {
    // Valid model override, malformed effort override -> model respected, effort injected
    expect(
      normalizeCopilotLaunchArgs(
        ["--continue", "--model=custom", "--reasoning-effort="],
        "claude-sonnet-4",
        "Medium",
      ),
    ).toEqual([
      "--continue",
      "--model=custom",
      "--reasoning-effort=",
      "--reasoning-effort=Medium",
    ]);

    // Malformed model override, valid effort override -> model injected, effort respected
    expect(
      normalizeCopilotLaunchArgs(
        ["--continue", "--model=", "--reasoning-effort=low"],
        "claude-sonnet-4",
        "Medium",
      ),
    ).toEqual([
      "--continue",
      "--model=",
      "--reasoning-effort=low",
      "--model=claude-sonnet-4",
    ]);

    // Valid model override, valid effort override with terminator -> neither injected
    const validWithTerminator = ["--continue", "--model=custom", "--reasoning-effort=low", "--", "prompt"];
    expect(normalizeCopilotLaunchArgs(validWithTerminator, "claude-sonnet-4", "Medium")).toBe(validWithTerminator);

    // Both added (ordinary launch with no terminator)
    expect(normalizeCopilotLaunchArgs(["--continue"], "claude-sonnet-4", "Medium")).toEqual([
      "--continue",
      "--model=claude-sonnet-4",
      "--reasoning-effort=Medium",
    ]);

    // Model only (no effort specified)
    expect(normalizeCopilotLaunchArgs(["--continue"], "claude-sonnet-4")).toEqual([
      "--continue",
      "--model=claude-sonnet-4",
    ]);

    // Effort only (not a resume invocation)
    expect(normalizeCopilotLaunchArgs(["hello"], "claude-sonnet-4", "Medium")).toEqual([
      "hello",
      "--reasoning-effort=Medium",
    ]);

    // Effort only (resume invocation with no catalog mapping)
    expect(normalizeCopilotLaunchArgs(["--continue"], undefined, "Medium")).toEqual([
      "--continue",
      "--reasoning-effort=Medium",
    ]);

    // Explicit model override, effort added
    expect(normalizeCopilotLaunchArgs(["--continue", "--model=custom"], "claude-sonnet-4", "Medium")).toEqual([
      "--continue",
      "--model=custom",
      "--reasoning-effort=Medium",
    ]);

    // Explicit effort override, model added
    expect(normalizeCopilotLaunchArgs(["--continue", "--reasoning-effort=low"], "claude-sonnet-4", "Medium")).toEqual([
      "--continue",
      "--reasoning-effort=low",
      "--model=claude-sonnet-4",
    ]);

    // Both explicitly overridden
    const bothExplicit = ["--continue", "--model=custom", "--reasoning-effort=low"];
    expect(normalizeCopilotLaunchArgs(bothExplicit, "claude-sonnet-4", "Medium")).toBe(bothExplicit);

    // Neither added (ordinary launch without effort)
    const ordinary = ["--allow-all-tools", "hello"];
    expect(normalizeCopilotLaunchArgs(ordinary, "claude-sonnet-4")).toBe(ordinary);
  });

  test("createCopilotLaunchPlan handles terminator insertion and malformed overrides end-to-end", async () => {
    const options = await fixture();
    options.fetch = reasoningCatalogFetch();
    await writeCopilotState(createCopilotState(REASONING_MODEL.id, "responses", "Medium"), options);
    const launcherOpts = { ...options, findExecutable: () => executable };

    // Terminator insertion preserves arguments after terminator and inserts before --
    const plan1 = await createCopilotLaunchPlan(["--continue", "--", "inspect", "main.ts"], launcherOpts);
    expect(plan1.args).toEqual([
      "--continue",
      "--model=claude-sonnet-4",
      "--reasoning-effort=Medium",
      "--",
      "inspect",
      "main.ts",
    ]);

    // Empty equals form preserves malformed arg and injects valid effort
    const plan2 = await createCopilotLaunchPlan(["--continue", "--reasoning-effort="], launcherOpts);
    expect(plan2.args).toEqual([
      "--continue",
      "--reasoning-effort=",
      "--model=claude-sonnet-4",
      "--reasoning-effort=Medium",
    ]);

    // Separate form followed by another option preserves malformed arg and injects valid effort
    const plan3 = await createCopilotLaunchPlan(
      ["--continue", "--reasoning-effort", "--allow-all-tools", "--", "prompt"],
      launcherOpts,
    );
    expect(plan3.args).toEqual([
      "--continue",
      "--reasoning-effort",
      "--allow-all-tools",
      "--model=claude-sonnet-4",
      "--reasoning-effort=Medium",
      "--",
      "prompt",
    ]);

    // Tokens after terminator do not override
    const plan4 = await createCopilotLaunchPlan(
      ["--continue", "--", "--reasoning-effort=low", "--model=custom"],
      launcherOpts,
    );
    expect(plan4.args).toEqual([
      "--continue",
      "--model=claude-sonnet-4",
      "--reasoning-effort=Medium",
      "--",
      "--reasoning-effort=low",
      "--model=custom",
    ]);
  });
});
