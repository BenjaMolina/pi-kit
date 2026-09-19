import { describe, expect, test } from "bun:test";
import { mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  activateCodexCLIProxyAPI,
  deactivateCodexCLIProxyAPI,
  getCodexCLIProxyAPIStatus,
  installCodexCLIProxyAPI,
  resolveCodexHome,
  uninstallCodexCLIProxyAPI,
} from "../src/codex/config";

async function fixtureHome(): Promise<string> {
  return mkdtemp(join(tmpdir(), "pi-kit-codex-"));
}

function options(home: string) {
  return {
    env: {
      CODEX_HOME: home,
      CLIPROXYAPI_BASE_URL: "http://proxy.test/v1/",
      CLIPROXYAPI_API_KEY: "test-only-key",
    },
    homedir: () => "/unused-home",
  };
}

describe("Codex CLIProxyAPI configuration", () => {
  test("installs managed configuration and remains idempotent", async () => {
    const home = await fixtureHome();
    const path = join(home, "config.toml");

    await installCodexCLIProxyAPI(options(home));
    const first = await readFile(path, "utf8");
    const repeated = await installCodexCLIProxyAPI(options(home));

    expect(first).toContain('model = "gpt-5.5"');
    expect(first).toContain("[model_providers.cliproxyapi]");
    expect(first).toContain('env_key = "CLIPROXYAPI_API_KEY"');
    expect(first).not.toContain("test-only-key");
    expect(repeated.changed).toBe(false);
    expect(await readFile(path, "utf8")).toBe(first);
  });

  test("preserves user selection and removes only managed blocks", async () => {
    const home = await fixtureHome();
    const path = join(home, "config.toml");
    const original = 'model = "user-model"\nmodel_provider = "user-provider"\n';
    await writeFile(path, original);

    const installed = await installCodexCLIProxyAPI(options(home));
    expect(installed.managedRoot).toBe(false);
    expect(await readFile(path, "utf8")).toStartWith(original);

    await uninstallCodexCLIProxyAPI(options(home));
    expect(await readFile(path, "utf8")).toBe(original);
  });

  test("deactivates only the verified managed selection and retains the provider", async () => {
    const home = await fixtureHome();
    const path = join(home, "config.toml");

    await installCodexCLIProxyAPI(options(home));
    const deactivated = await deactivateCodexCLIProxyAPI(options(home));
    const content = await readFile(path, "utf8");
    const repeated = await deactivateCodexCLIProxyAPI(options(home));

    expect(deactivated.changed).toBe(true);
    expect(content).not.toContain("Codex CLIProxyAPI v1 root");
    expect(content).not.toContain('model_provider = "cliproxyapi"');
    expect(content).toContain("Codex CLIProxyAPI v1 provider");
    expect(repeated.changed).toBe(false);
  });

  test("actively adopts an unmanaged selection while preserving unrelated configuration", async () => {
    const home = await fixtureHome();
    const path = join(home, "config.toml");
    const original = [
      'model = "user-model"',
      'model_provider = "user-provider"',
      'model_reasoning_effort = "high"',
      "[hooks.state]",
      'last_checked = "sanitized"',
      "[tui]",
      'theme = "default"',
      "",
    ].join("\n");
    await writeFile(path, original);

    const activated = await activateCodexCLIProxyAPI(options(home));
    const content = await readFile(path, "utf8");

    expect(activated).toMatchObject({ changed: true, managedRoot: true, managedProvider: true });
    expect(content).toStartWith([
      "# >>> pi-kit Codex CLIProxyAPI v1 root >>>",
      'model = "user-model"',
      'model_provider = "cliproxyapi"',
      "# <<< pi-kit Codex CLIProxyAPI v1 root <<<",
      'model_reasoning_effort = "high"',
      "[hooks.state]",
      'last_checked = "sanitized"',
      "[tui]",
      'theme = "default"',
      "",
    ].join("\n"));
    expect(await getCodexCLIProxyAPIStatus(options(home))).toMatchObject({ selection: "managed CLIProxyAPI" });
    expect(await activateCodexCLIProxyAPI(options(home))).toMatchObject({ changed: false, managedRoot: true, managedProvider: true });
  });

  test("actively returns unmanaged CLIProxyAPI selections to the OpenAI default", async () => {
    const home = await fixtureHome();
    const path = join(home, "config.toml");
    const original = [
      'model = "proxy-model"',
      'model_provider = "cliproxyapi"',
      'model_reasoning_effort = "high"',
      "[hooks.state]",
      'last_checked = "sanitized"',
      "[tui]",
      'theme = "default"',
      "",
    ].join("\n");
    const expected = [
      'model_reasoning_effort = "high"',
      "[hooks.state]",
      'last_checked = "sanitized"',
      "[tui]",
      'theme = "default"',
      "",
    ].join("\n");
    await writeFile(path, original);

    expect(await deactivateCodexCLIProxyAPI(options(home))).toMatchObject({ changed: true, managedRoot: false, managedProvider: false });
    expect(await readFile(path, "utf8")).toBe(expected);
    expect(await getCodexCLIProxyAPIStatus(options(home))).toMatchObject({ selection: "OpenAI default" });
  });

  test("accepts a user-updated managed model when deactivating", async () => {
    const home = await fixtureHome();
    const path = join(home, "config.toml");
    await installCodexCLIProxyAPI(options(home));
    const original = await readFile(path, "utf8");
    const changedModel = original.replace('model = "gpt-5.5"', 'model = "gemini-3.8-flash-high"');
    await writeFile(path, changedModel);

    expect(await deactivateCodexCLIProxyAPI(options(home))).toMatchObject({ changed: true, managedRoot: false });
    expect(await readFile(path, "utf8")).toContain("Codex CLIProxyAPI v1 provider");
  });

  test("actively switches any non-default root selection to the OpenAI default", async () => {
    const home = await fixtureHome();
    const path = join(home, "config.toml");
    await writeFile(path, 'model = "user-model"\nmodel_provider = "user-provider"\n');

    expect(await deactivateCodexCLIProxyAPI(options(home))).toMatchObject({ changed: true, managedRoot: false, managedProvider: false });
    expect(await readFile(path, "utf8")).toBe("");
    expect(await getCodexCLIProxyAPIStatus(options(home))).toMatchObject({ selection: "OpenAI default" });
  });

  test("reports unmanaged CLIProxyAPI and OpenAI default selections", async () => {
    const home = await fixtureHome();
    const path = join(home, "config.toml");
    await writeFile(path, 'model_provider = "cliproxyapi"\n');

    expect(await getCodexCLIProxyAPIStatus(options(home))).toMatchObject({ selection: "CLIProxyAPI" });
    await writeFile(path, 'model_provider = "openai"\n');
    expect(await getCodexCLIProxyAPIStatus(options(home))).toMatchObject({ selection: "OpenAI default" });
  });

  test("reports managed selection and provider registration without reading credentials", async () => {
    const home = await fixtureHome();
    await installCodexCLIProxyAPI(options(home));

    expect(await getCodexCLIProxyAPIStatus(options(home))).toMatchObject({
      selection: "managed CLIProxyAPI",
      provider: "managed registered",
    });

    await deactivateCodexCLIProxyAPI(options(home));
    expect(await getCodexCLIProxyAPIStatus(options(home))).toMatchObject({
      selection: "OpenAI default",
      provider: "managed registered",
    });
  });

  test("preserves unrelated legacy sections interleaved before the managed provider end marker", async () => {
    const home = await fixtureHome();
    const path = join(home, "config.toml");
    const legacyProvider = [
      "# >>> pi-kit Codex CLIProxyAPI v1 provider >>>",
      "[model_providers.cliproxyapi]",
      'name = "CLIProxyAPI"',
      'base_url = "http://proxy.test/v1"',
      'env_key = "CLIPROXYAPI_API_KEY"',
      'wire_api = "responses"',
      "",
      "[hooks.state]",
      'last_checked = "sanitized"',
      "[tui]",
      'theme = "default"',
      "# <<< pi-kit Codex CLIProxyAPI v1 provider <<<",
      "",
    ].join("\n");
    await writeFile(path, legacyProvider);

    expect(await getCodexCLIProxyAPIStatus(options(home))).toMatchObject({
      selection: "OpenAI default",
      provider: "managed registered",
    });
    expect(await readFile(path, "utf8")).toBe(legacyProvider);

    await activateCodexCLIProxyAPI(options(home));
    expect(await readFile(path, "utf8")).toEndWith(legacyProvider);

    await deactivateCodexCLIProxyAPI(options(home));
    expect(await readFile(path, "utf8")).toBe(legacyProvider);

    await uninstallCodexCLIProxyAPI(options(home));
    expect(await readFile(path, "utf8")).toBe('\n[hooks.state]\nlast_checked = "sanitized"\n[tui]\ntheme = "default"\n');
  });

  test("preserves interleaved and trailing sections after a managed provider marker", async () => {
    const home = await fixtureHome();
    const path = join(home, "config.toml");
    const root = [
      "# >>> pi-kit Codex CLIProxyAPI v1 root >>>",
      'model = "gpt-5.5"',
      'model_provider = "cliproxyapi"',
      "# <<< pi-kit Codex CLIProxyAPI v1 root <<<",
      "",
    ].join("\n");
    const provider = [
      "# >>> pi-kit Codex CLIProxyAPI v1 provider >>>",
      "[model_providers.cliproxyapi]",
      'name = "CLIProxyAPI"',
      'base_url = "http://proxy.test/v1"',
      'env_key = "CLIPROXYAPI_API_KEY"',
      'wire_api = "responses"',
      "",
      "[hooks.state]",
      'last_checked = "sanitized"',
      "# <<< pi-kit Codex CLIProxyAPI v1 provider <<<",
      "",
    ].join("\n");
    const trailing = '[tui]\ntheme = "default"\n';
    const original = root + provider + trailing;
    await writeFile(path, original);

    expect(await getCodexCLIProxyAPIStatus(options(home))).toMatchObject({
      selection: "managed CLIProxyAPI",
      provider: "managed registered",
    });
    expect(await readFile(path, "utf8")).toBe(original);

    expect((await installCodexCLIProxyAPI(options(home))).changed).toBe(false);
    expect(await readFile(path, "utf8")).toBe(original);

    await deactivateCodexCLIProxyAPI(options(home));
    expect(await readFile(path, "utf8")).toBe(provider + trailing);

    await activateCodexCLIProxyAPI(options(home));
    expect(await readFile(path, "utf8")).toBe(original);

    await uninstallCodexCLIProxyAPI(options(home));
    expect(await readFile(path, "utf8")).toBe('\n[hooks.state]\nlast_checked = "sanitized"\n[tui]\ntheme = "default"\n');
  });

  test("refuses a changed managed provider payload in a legacy interleaved block", async () => {
    const home = await fixtureHome();
    const path = join(home, "config.toml");
    const original = [
      "# >>> pi-kit Codex CLIProxyAPI v1 provider >>>",
      "[model_providers.cliproxyapi]",
      'name = "CLIProxyAPI"',
      'base_url = "http://proxy.test/v1"',
      'env_key = "CLIPROXYAPI_API_KEY"',
      'wire_api = "chat"',
      "[hooks.state]",
      'last_checked = "sanitized"',
      "# <<< pi-kit Codex CLIProxyAPI v1 provider <<<",
      "",
    ].join("\n");
    await writeFile(path, original);

    await expect(getCodexCLIProxyAPIStatus(options(home))).rejects.toThrow("provider block has been modified");
    await expect(installCodexCLIProxyAPI(options(home))).rejects.toThrow("provider block has been modified");
    await expect(deactivateCodexCLIProxyAPI(options(home))).rejects.toThrow("provider block has been modified");
    await expect(uninstallCodexCLIProxyAPI(options(home))).rejects.toThrow("provider block has been modified");
    expect(await readFile(path, "utf8")).toBe(original);
  });

  test("rejects duplicated, missing, or crossed managed markers without modifying configuration", async () => {
    const home = await fixtureHome();
    const path = join(home, "config.toml");
    const validPayload = [
      "[model_providers.cliproxyapi]",
      'name = "CLIProxyAPI"',
      'base_url = "http://proxy.test/v1"',
      'env_key = "CLIPROXYAPI_API_KEY"',
      'wire_api = "responses"',
    ].join("\n");
    const malformedConfigs = [
      [
        "# >>> pi-kit Codex CLIProxyAPI v1 provider >>>",
        "# >>> pi-kit Codex CLIProxyAPI v1 provider >>>",
        validPayload,
        "# <<< pi-kit Codex CLIProxyAPI v1 provider <<<",
        "",
      ].join("\n"),
      [
        "# >>> pi-kit Codex CLIProxyAPI v1 provider >>>",
        validPayload,
        "",
      ].join("\n"),
      [
        "# >>> pi-kit Codex CLIProxyAPI v1 root >>>",
        'model = "gpt-5.5"',
        'model_provider = "cliproxyapi"',
        "# >>> pi-kit Codex CLIProxyAPI v1 provider >>>",
        validPayload,
        "# <<< pi-kit Codex CLIProxyAPI v1 root <<<",
        "# <<< pi-kit Codex CLIProxyAPI v1 provider <<<",
        "",
      ].join("\n"),
    ];

    for (const original of malformedConfigs) {
      await writeFile(path, original);
      const error = original.includes("# <<< pi-kit Codex CLIProxyAPI v1 root <<<") ? "markers are crossed" : "markers are malformed or duplicated";
      await expect(getCodexCLIProxyAPIStatus(options(home))).rejects.toThrow(error);
      await expect(installCodexCLIProxyAPI(options(home))).rejects.toThrow(error);
      await expect(deactivateCodexCLIProxyAPI(options(home))).rejects.toThrow(error);
      await expect(uninstallCodexCLIProxyAPI(options(home))).rejects.toThrow(error);
      expect(await readFile(path, "utf8")).toBe(original);
    }
  });

  test("refuses an unmarked provider without modifying it", async () => {
    const home = await fixtureHome();
    const path = join(home, "config.toml");
    const original = '[model_providers.cliproxyapi]\nname = "User proxy"\n';
    await writeFile(path, original);

    await expect(installCodexCLIProxyAPI(options(home))).rejects.toThrow("already exists without pi-kit markers");
    expect(await readFile(path, "utf8")).toBe(original);
  });

  test("rejects malformed TOML and relative CODEX_HOME", async () => {
    const home = await fixtureHome();
    const path = join(home, "config.toml");
    await writeFile(path, "model = [\n");

    await expect(installCodexCLIProxyAPI(options(home))).rejects.toThrow("not valid TOML");
    expect(() => resolveCodexHome({ CODEX_HOME: "relative/.codex" }, () => "/home/tester"))
      .toThrow("CODEX_HOME must be an absolute path");
  });
});
