import { describe, expect, test } from "bun:test";
import { join } from "node:path";
import {
  resolveVSCodeConfigPath,
  syncVSCodeCLIProxyAPI,
  uninstallVSCodeCLIProxyAPI,
  vscodeConfigStatus,
  type VSCodeFileSystem,
} from "../src/copilot/vscode";

const SECRET = "vscode-test-secret";
const MODEL = {
  id: "team/reasoning-vision-model",
  displayName: "Reasoning Vision Model",
  owner: "CLIProxyAPI",
  source: "enriched" as const,
  reasoning: true,
  reasoningLevels: ["low", "high"],
  input: ["text", "image"] as const,
  contextWindow: 128_000,
  maxTokens: 32_000,
};

function catalogFetch(models = [MODEL]) {
  return async () => new Response(JSON.stringify({
    models: models.map((model) => ({
      slug: model.id,
      display_name: model.displayName,
      owned_by: model.owner,
      context_window: model.contextWindow,
      max_tokens: model.maxTokens,
      input_modalities: model.input,
      default_reasoning_level: model.reasoning ? "high" : null,
      supported_reasoning_levels: model.reasoningLevels.map((effort) => ({ effort })),
    })),
  }));
}

function memoryFileSystem(initial: Record<string, string> = {}, fail?: "write" | "rename") {
  const files = new Map(Object.entries(initial));
  const fileSystem = {
    mkdir: async () => undefined,
    readFile: async (path: string) => {
      const value = files.get(path);
      if (value === undefined) throw Object.assign(new Error("not found"), { code: "ENOENT" });
      return value;
    },
    writeFile: async (path: string, content: string) => {
      if (fail === "write") throw new Error("write failed");
      files.set(path, content);
    },
    rename: async (from: string, to: string) => {
      if (fail === "rename") throw new Error("rename failed");
      files.set(to, files.get(from)!);
      files.delete(from);
    },
    unlink: async (path: string) => { files.delete(path); },
  } as unknown as VSCodeFileSystem;
  return { files, fileSystem };
}

function options(fileSystem: VSCodeFileSystem, path = "/isolated/chatLanguageModels.json") {
  return {
    vscodeConfigPath: path,
    fileSystem,
    env: { CLIPROXYAPI_API_KEY: SECRET, CLIPROXYAPI_BASE_URL: "http://proxy.test/v1/" },
    fetch: catalogFetch(),
  };
}

describe("VS Code Custom Endpoint synchronization", () => {
  test("resolves only injectable user configuration paths", () => {
    expect(resolveVSCodeConfigPath({ vscodeConfigPath: "/isolated/config.json" })).toBe("/isolated/config.json");
    expect(resolveVSCodeConfigPath({ env: { PI_KIT_COPILOT_VSCODE_PATH: "/isolated/config.json" } })).toBe("/isolated/config.json");
    expect(resolveVSCodeConfigPath({ env: { APPDATA: "C:/Users/test/AppData/Roaming" }, platform: "win32" }).replaceAll("\\", "/"))
      .toBe("C:/Users/test/AppData/Roaming/Code/User/chatLanguageModels.json");
    expect(resolveVSCodeConfigPath({ env: { XDG_CONFIG_HOME: "/isolated/config" }, platform: "linux" }))
      .toBe(join("/isolated/config", "Code", "User", "chatLanguageModels.json"));
    expect(() => resolveVSCodeConfigPath({ env: { PI_KIT_COPILOT_VSCODE_PATH: "relative.json" } })).toThrow("absolute");
  });

  test("installs one official dynamic responses provider without persisting secrets", async () => {
    const { files, fileSystem } = memoryFileSystem();
    const result = await syncVSCodeCLIProxyAPI(options(fileSystem));
    const content = files.get(result.path)!;
    const config = JSON.parse(content);
    expect(result).toEqual({ path: result.path, changed: true, modelCount: 1 });
    expect(Array.isArray(config)).toBe(true);
    expect(config).toHaveLength(1);
    expect(config[0]).toMatchObject({
      name: "pi-kit CLIProxyAPI",
      vendor: "customendpoint",
      apiKey: "${input:pi-kit-cliproxyapi-api-key}",
      apiType: "responses",
      models: [{
        id: MODEL.id,
        name: MODEL.displayName,
        url: "http://proxy.test/v1/responses",
        toolCalling: true,
        vision: true,
        maxInputTokens: 96_000,
        maxOutputTokens: 32_000,
        contextWindow: 128_000,
        thinking: true,
        supportsReasoningEffort: ["low", "high"],
        reasoningEffortFormat: "openai",
      }],
    });
    expect(content).not.toContain(SECRET);
  });

  test("replaces a legacy literal credential in the managed provider without exposing it", async () => {
    const path = "/isolated/chatLanguageModels.json";
    const legacySecret = "legacy-literal-credential";
    const { files, fileSystem } = memoryFileSystem({
      [path]: JSON.stringify({ providers: [{
        name: "pi-kit CLIProxyAPI",
        vendor: "customendpoint",
        apiType: "responses",
        apiKey: legacySecret,
        models: [],
      }] }),
    });
    await syncVSCodeCLIProxyAPI(options(fileSystem, path));
    const content = files.get(path)!;
    expect(content).toContain("${input:pi-kit-cliproxyapi-api-key}");
    expect(content).not.toContain(legacySecret);
  });

  test("refreshes the dynamic catalog and preserves unrelated providers structurally", async () => {
    const path = "/isolated/chatLanguageModels.json";
    const unrelated = { name: "User endpoint", vendor: "customendpoint", apiType: "chatCompletions", models: [{ id: "user-model" }] };
    const { files, fileSystem } = memoryFileSystem({ [path]: JSON.stringify({ providers: [unrelated], extra: { keep: true } }) });
    await syncVSCodeCLIProxyAPI(options(fileSystem, path));
    await syncVSCodeCLIProxyAPI({ ...options(fileSystem, path), fetch: catalogFetch([{ ...MODEL, id: "new-model", displayName: "New Model", reasoning: false, input: ["text"] as const }]) });
    const config = JSON.parse(files.get(path)!);
    expect(config.extra).toEqual({ keep: true });
    expect(config.providers[0]).toEqual(unrelated);
    expect(config.providers).toHaveLength(2);
    expect(config.providers[1].models).toEqual([expect.objectContaining({ id: "new-model", vision: false })]);
  });

  test("refuses malformed, duplicate, and ambiguous managed configurations", async () => {
    const path = "/isolated/chatLanguageModels.json";
    for (const content of [
      "{ broken",
      JSON.stringify({ providers: { invalid: true } }),
      JSON.stringify({ providers: [
        { name: "pi-kit CLIProxyAPI", vendor: "customendpoint", apiType: "responses" },
        { name: "pi-kit CLIProxyAPI", vendor: "customendpoint", apiType: "responses" },
      ] }),
      JSON.stringify({ providers: [{ name: "pi-kit CLIProxyAPI", vendor: "other", apiType: "responses" }] }),
    ]) {
      const { fileSystem } = memoryFileSystem({ [path]: content });
      await expect(syncVSCodeCLIProxyAPI(options(fileSystem, path))).rejects.toThrow();
    }
  });

  test("uninstalls only the unique managed provider and is idempotent", async () => {
    const path = "/isolated/chatLanguageModels.json";
    const unrelated = { name: "Keep me", models: [] };
    const { files, fileSystem } = memoryFileSystem({ [path]: JSON.stringify([unrelated]) });
    await syncVSCodeCLIProxyAPI(options(fileSystem, path));
    await expect(uninstallVSCodeCLIProxyAPI(options(fileSystem, path))).resolves.toMatchObject({ changed: true, modelCount: 1 });
    expect(JSON.parse(files.get(path)!)).toEqual([unrelated]);
    await expect(uninstallVSCodeCLIProxyAPI(options(fileSystem, path))).resolves.toMatchObject({ changed: false, modelCount: 0 });
  });

  test("preserves real-world array-root configuration and appends managed provider", async () => {
    const path = "/isolated/chatLanguageModels.json";
    const copilotProvider = {
      name: "Copilot",
      vendor: "copilot",
      settings: { "gpt-5.4": { contextSize: 922000 } },
    };
    const { files, fileSystem } = memoryFileSystem({
      [path]: JSON.stringify([copilotProvider]),
    });
    const result = await syncVSCodeCLIProxyAPI(options(fileSystem, path));
    expect(result).toEqual({ path, changed: true, modelCount: 1 });
    const content = files.get(path)!;
    const array = JSON.parse(content);
    expect(Array.isArray(array)).toBe(true);
    expect(array).toHaveLength(2);
    expect(array[0]).toEqual(copilotProvider);
    expect(array[1].name).toBe("pi-kit CLIProxyAPI");

    await expect(vscodeConfigStatus({ vscodeConfigPath: path, fileSystem })).resolves.toMatchObject({
      state: "managed",
      modelCount: 1,
    });

    await expect(uninstallVSCodeCLIProxyAPI(options(fileSystem, path))).resolves.toMatchObject({
      changed: true,
      modelCount: 1,
    });
    expect(JSON.parse(files.get(path)!)).toEqual([copilotProvider]);
  });

  test("keeps the previous config and cleans temporary files on atomic write failures", async () => {
    const path = "/isolated/chatLanguageModels.json";
    const original = JSON.stringify([]);
    for (const failure of ["write", "rename"] as const) {
      const { files, fileSystem } = memoryFileSystem({ [path]: original }, failure);
      await expect(syncVSCodeCLIProxyAPI(options(fileSystem, path))).rejects.toThrow(`${failure} failed`);
      expect(files.get(path)).toBe(original);
      expect([...files.keys()]).toEqual([path]);
    }
  });

  test("reports managed status without accessing credentials", async () => {
    const { fileSystem } = memoryFileSystem();
    await syncVSCodeCLIProxyAPI(options(fileSystem));
    await expect(vscodeConfigStatus({ vscodeConfigPath: "/isolated/chatLanguageModels.json", fileSystem })).resolves.toMatchObject({ state: "managed", modelCount: 1 });
  });
});
