import { describe, expect, test } from "bun:test";
import { mkdtemp, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { VSCodeFileSystem } from "../src/copilot/vscode";
import { runCopilotCLI } from "../src/copilot/cli";
import {
  buildCopilotEnvironment,
  copilotCatalogModelId,
  createCopilotLaunchPlan,
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

function catalogFetch(models = [MODEL]) {
  return async () => new Response(JSON.stringify({ models }));
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
});
