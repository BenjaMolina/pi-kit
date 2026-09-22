import { describe, expect, spyOn, test } from "bun:test";
import * as fsPromises from "node:fs/promises";
import { mkdtemp, readdir, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  activateCodexCLIProxyAPI,
  codexNineRouterProfilePath,
  deactivateCodexCLIProxyAPI,
  getCodexCLIProxyAPIStatus,
  getCodexNineRouterStatus,
  installCodexCLIProxyAPI,
  installCodexNineRouter,
  replaceAtomically,
  resolveCodexHome,
  uninstallCodexCLIProxyAPI,
  uninstallCodexNineRouter,
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

function nineRouterOptions(home: string, extraEnv: Record<string, string | undefined> = {}) {
  return {
    env: {
      CODEX_HOME: home,
      NINEROUTER_BASE_URL: "http://127.0.0.1:20128/v1",
      NINEROUTER_API_KEY: "test-9router-key",
      ...extraEnv,
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

describe("Codex 9Router profile configuration", () => {
  test("installs managed 9Router provider in config.toml and 9router profile, remaining idempotent", async () => {
    const home = await fixtureHome();
    const configPath = join(home, "config.toml");
    const profilePath = join(home, "9router.config.toml");

    const result = await installCodexNineRouter(nineRouterOptions(home));
    expect(result.changed).toBe(true);
    expect(result.configPath).toBe(configPath);
    expect(result.profilePath).toBe(profilePath);

    const configContent = await readFile(configPath, "utf8");
    expect(configContent).toContain("[model_providers.9router]");
    expect(configContent).toContain('name = "9Router"');
    expect(configContent).toContain('base_url = "http://127.0.0.1:20128/v1"');
    expect(configContent).toContain('env_key = "NINEROUTER_API_KEY"');
    expect(configContent).toContain('wire_api = "responses"');
    expect(configContent).not.toContain("test-9router-key");
    // Root default provider is preserved (not set to 9router)
    expect(configContent).not.toContain('model_provider = "9router"');

    const profileContent = await readFile(profilePath, "utf8");
    expect(profileContent).toContain('model = "gpt-5.5"');
    expect(profileContent).toContain('model_provider = "9router"');
    expect(profileContent).toContain("# >>> pi-kit Codex 9Router v1 profile >>>");
    expect(profileContent).toContain("# <<< pi-kit Codex 9Router v1 profile <<<");

    const repeated = await installCodexNineRouter(nineRouterOptions(home));
    expect(repeated.changed).toBe(false);
    expect(await readFile(configPath, "utf8")).toBe(configContent);
    expect(await readFile(profilePath, "utf8")).toBe(profileContent);
  });

  test("preserves coexistence with CLIProxyAPI in shared config.toml", async () => {
    const home = await fixtureHome();
    const configPath = join(home, "config.toml");
    const profilePath = join(home, "9router.config.toml");

    const combinedOptions = {
      env: {
        CODEX_HOME: home,
        CLIPROXYAPI_BASE_URL: "http://proxy.test/v1/",
        CLIPROXYAPI_API_KEY: "cliproxy-key",
        NINEROUTER_BASE_URL: "http://127.0.0.1:20128/v1",
        NINEROUTER_API_KEY: "9router-key",
      },
      homedir: () => "/unused-home",
    };

    await installCodexCLIProxyAPI(combinedOptions);
    await installCodexNineRouter(combinedOptions);

    const configContent = await readFile(configPath, "utf8");
    expect(configContent).toContain("[model_providers.cliproxyapi]");
    expect(configContent).toContain("[model_providers.9router]");

    const cliproxyStatus = await getCodexCLIProxyAPIStatus(combinedOptions);
    expect(cliproxyStatus.selection).toBe("managed CLIProxyAPI");
    expect(cliproxyStatus.provider).toBe("managed registered");

    const nineRouterStatus = await getCodexNineRouterStatus(combinedOptions);
    expect(nineRouterStatus.provider).toBe("managed registered");
    expect(nineRouterStatus.profile).toBe("managed profile");

    // Uninstall 9Router, CLIProxyAPI remains
    const uninstall9R = await uninstallCodexNineRouter(combinedOptions);
    expect(uninstall9R.changed).toBe(true);
    const configAfter9RUninstall = await readFile(configPath, "utf8");
    expect(configAfter9RUninstall).toContain("[model_providers.cliproxyapi]");
    expect(configAfter9RUninstall).not.toContain("[model_providers.9router]");
    expect(await readFile(profilePath, "utf8").catch(() => null)).toBeNull();

    // Reinstall 9Router and uninstall CLIProxyAPI, 9Router remains
    await installCodexNineRouter(combinedOptions);
    await uninstallCodexCLIProxyAPI(combinedOptions);
    const configAfterCLIProxyUninstall = await readFile(configPath, "utf8");
    expect(configAfterCLIProxyUninstall).not.toContain("[model_providers.cliproxyapi]");
    expect(configAfterCLIProxyUninstall).toContain("[model_providers.9router]");

    // Switching with CLIProxyAPI activate/deactivate preserves 9Router provider
    await activateCodexCLIProxyAPI(combinedOptions);
    expect(await readFile(configPath, "utf8")).toContain("[model_providers.9router]");
    expect(await readFile(configPath, "utf8")).toContain('model_provider = "cliproxyapi"');

    await deactivateCodexCLIProxyAPI(combinedOptions);
    expect(await readFile(configPath, "utf8")).toContain("[model_providers.9router]");
    expect(await readFile(configPath, "utf8")).not.toContain('model_provider = "cliproxyapi"');
  });

  test("preserves user-customized model in 9router.config.toml on reinstall", async () => {
    const home = await fixtureHome();
    const profilePath = join(home, "9router.config.toml");

    await installCodexNineRouter(nineRouterOptions(home));
    const originalProfile = await readFile(profilePath, "utf8");
    const customized = originalProfile.replace('model = "gpt-5.5"', 'model = "o3"');
    await writeFile(profilePath, customized);

    const reinstalled = await installCodexNineRouter(nineRouterOptions(home));
    expect(reinstalled.changed).toBe(false);
    expect(await readFile(profilePath, "utf8")).toBe(customized);

    const status = await getCodexNineRouterStatus(nineRouterOptions(home));
    expect(status.model).toBe("o3");
  });

  test("refuses an unmarked model_providers.9router collision without modifying it", async () => {
    const home = await fixtureHome();
    const configPath = join(home, "config.toml");
    const original = '[model_providers.9router]\nname = "Custom 9Router"\n';
    await writeFile(configPath, original);

    await expect(installCodexNineRouter(nineRouterOptions(home))).rejects.toThrow(
      "model_providers.9router already exists without pi-kit markers",
    );
    expect(await readFile(configPath, "utf8")).toBe(original);
  });

  test("refuses an unmanaged 9router.config.toml collision without modifying it", async () => {
    const home = await fixtureHome();
    const profilePath = join(home, "9router.config.toml");
    const original = 'model = "user-model"\nmodel_provider = "9router"\n';
    await writeFile(profilePath, original);

    await expect(installCodexNineRouter(nineRouterOptions(home))).rejects.toThrow(
      "9router profile already exists without pi-kit markers",
    );
    expect(await readFile(profilePath, "utf8")).toBe(original);
  });

  test("sanitizes NINEROUTER_BASE_URL and rejects malformed URL", async () => {
    const home = await fixtureHome();
    const configPath = join(home, "config.toml");

    await installCodexNineRouter(
      nineRouterOptions(home, {
        NINEROUTER_BASE_URL: "http://user:secret@127.0.0.1:20128/v1?token=secret#hash",
      }),
    );
    const content = await readFile(configPath, "utf8");
    expect(content).toContain('base_url = "http://127.0.0.1:20128/v1"');
    expect(content).not.toContain("secret");

    const badHome = await fixtureHome();
    await expect(
      installCodexNineRouter(nineRouterOptions(badHome, { NINEROUTER_BASE_URL: "not-a-url" })),
    ).rejects.toThrow("NINEROUTER_BASE_URL must be an absolute URL.");
  });

  test("clean uninstall removes only managed 9Router artifacts and preserves user profile content", async () => {
    const home = await fixtureHome();
    const profilePath = join(home, "9router.config.toml");
    const configPath = join(home, "config.toml");

    await installCodexNineRouter(nineRouterOptions(home));
    // Add user section to profile file
    const profileOriginal = await readFile(profilePath, "utf8");
    await writeFile(profilePath, profileOriginal + '\n[tui]\ntheme = "dark"\n');

    const result = await uninstallCodexNineRouter(nineRouterOptions(home));
    expect(result.changed).toBe(true);
    expect(await readFile(configPath, "utf8")).not.toContain("9router");
    expect(await readFile(profilePath, "utf8")).toBe('\n[tui]\ntheme = "dark"\n');

    // Repeated uninstall when no managed block exists
    const repeated = await uninstallCodexNineRouter(nineRouterOptions(home));
    expect(repeated.changed).toBe(false);

    // Fresh install and uninstall with no user content completely removes profile file
    const cleanHome = await fixtureHome();
    const cleanProfile = join(cleanHome, "9router.config.toml");
    await installCodexNineRouter(nineRouterOptions(cleanHome));
    expect(await readFile(cleanProfile, "utf8")).toBeTruthy();
    await uninstallCodexNineRouter(nineRouterOptions(cleanHome));
    expect(await readFile(cleanProfile, "utf8").catch(() => null)).toBeNull();
  });

  test("rejects duplicated, missing, or crossed managed 9Router markers", async () => {
    const home = await fixtureHome();
    const configPath = join(home, "config.toml");
    const profilePath = join(home, "9router.config.toml");

    const validPayload = [
      "[model_providers.9router]",
      'name = "9Router"',
      'base_url = "http://127.0.0.1:20128/v1"',
      'env_key = "NINEROUTER_API_KEY"',
      'wire_api = "responses"',
    ].join("\n");

    const malformedConfig = [
      "# >>> pi-kit Codex 9Router v1 provider >>>",
      "# >>> pi-kit Codex 9Router v1 provider >>>",
      validPayload,
      "# <<< pi-kit Codex 9Router v1 provider <<<",
      "",
    ].join("\n");

    await writeFile(configPath, malformedConfig);
    await expect(getCodexNineRouterStatus(nineRouterOptions(home))).rejects.toThrow("markers are malformed or duplicated");
    await expect(installCodexNineRouter(nineRouterOptions(home))).rejects.toThrow("markers are malformed or duplicated");
    await expect(uninstallCodexNineRouter(nineRouterOptions(home))).rejects.toThrow("markers are malformed or duplicated");

    const malformedProfile = [
      "# >>> pi-kit Codex 9Router v1 profile >>>",
      'model = "gpt-5.5"',
      "",
    ].join("\n");
    await writeFile(configPath, "");
    await writeFile(profilePath, malformedProfile);
    await expect(getCodexNineRouterStatus(nineRouterOptions(home))).rejects.toThrow("markers are malformed or duplicated");
    await expect(installCodexNineRouter(nineRouterOptions(home))).rejects.toThrow("markers are malformed or duplicated");
    await expect(uninstallCodexNineRouter(nineRouterOptions(home))).rejects.toThrow("markers are malformed or duplicated");
  });

  test("reports offline 9Router status without reading credentials", async () => {
    const home = await fixtureHome();
    const notInstalled = await getCodexNineRouterStatus(nineRouterOptions(home));
    expect(notInstalled).toMatchObject({
      provider: "not registered",
      profile: "not installed",
    });

    await installCodexNineRouter(nineRouterOptions(home));
    const installed = await getCodexNineRouterStatus(nineRouterOptions(home));
    expect(installed).toMatchObject({
      provider: "managed registered",
      profile: "managed profile",
      model: "gpt-5.5",
    });

    // Unmanaged provider and profile
    const unmanagedHome = await fixtureHome();
    await writeFile(join(unmanagedHome, "config.toml"), '[model_providers.9router]\nname = "user"\n');
    await writeFile(join(unmanagedHome, "9router.config.toml"), 'model = "custom"\nmodel_provider = "9router"\n');
    const unmanaged = await getCodexNineRouterStatus(nineRouterOptions(unmanagedHome));
    expect(unmanaged).toMatchObject({
      provider: "user registered",
      profile: "user profile",
      model: "custom",
    });
  });

  test("replaceAtomically unlinks temporary file on failure", async () => {
    const home = await fixtureHome();
    const filePath = join(home, "atomic-test.toml");
    await writeFile(filePath, "initial-content\n");

    const origRename = fsPromises.rename;
    const renameSpy = spyOn(fsPromises, "rename").mockImplementation(async (oldPath, newPath) => {
      if (typeof newPath === "string" && newPath.endsWith("atomic-test.toml")) {
        throw new Error("injected atomic rename failure");
      }
      return origRename.call(fsPromises, oldPath, newPath);
    });

    try {
      await expect(replaceAtomically(filePath, "initial-content\n", "new-content\n"))
        .rejects.toThrow("injected atomic rename failure");
    } finally {
      renameSpy.mockRestore();
    }

    const entries = await readdir(home);
    const tempFiles = entries.filter((e) => e.includes(".pi-kit-"));
    expect(tempFiles).toEqual([]);
    expect(await readFile(filePath, "utf8")).toBe("initial-content\n");
  });

  test("installCodexNineRouter rolls back mutated config.toml when profile creation fails", async () => {
    // 1. Fresh installation: config.toml did not exist initially
    const cleanHome = await fixtureHome();
    const cleanConfig = join(cleanHome, "config.toml");
    const cleanProfile = join(cleanHome, "9router.config.toml");

    const origRename = fsPromises.rename;
    let renameSpy = spyOn(fsPromises, "rename").mockImplementation(async (oldPath, newPath) => {
      if (typeof newPath === "string" && newPath.endsWith("9router.config.toml")) {
        throw new Error("injected profile write failure");
      }
      return origRename.call(fsPromises, oldPath, newPath);
    });

    try {
      await expect(installCodexNineRouter(nineRouterOptions(cleanHome)))
        .rejects.toThrow("injected profile write failure");
    } finally {
      renameSpy.mockRestore();
    }

    // Rolled back: neither config.toml nor 9router.config.toml should exist
    expect(await readFile(cleanConfig, "utf8").catch(() => null)).toBeNull();
    expect(await readFile(cleanProfile, "utf8").catch(() => null)).toBeNull();
    const cleanEntries = await readdir(cleanHome);
    expect(cleanEntries.filter((e) => e.includes(".pi-kit-"))).toEqual([]);

    // 2. Pre-existing user config.toml: must restore exact prior bytes
    const userHome = await fixtureHome();
    const userConfig = join(userHome, "config.toml");
    const userProfile = join(userHome, "9router.config.toml");
    const initialUserContent = '[tui]\ntheme = "custom-theme"\n';
    await writeFile(userConfig, initialUserContent);

    renameSpy = spyOn(fsPromises, "rename").mockImplementation(async (oldPath, newPath) => {
      if (typeof newPath === "string" && newPath.endsWith("9router.config.toml")) {
        throw new Error("injected profile write failure");
      }
      return origRename.call(fsPromises, oldPath, newPath);
    });

    try {
      await expect(installCodexNineRouter(nineRouterOptions(userHome)))
        .rejects.toThrow("injected profile write failure");
    } finally {
      renameSpy.mockRestore();
    }

    // Rolled back: user config.toml has exact prior bytes, profile is absent
    expect(await readFile(userConfig, "utf8")).toBe(initialUserContent);
    expect(await readFile(userProfile, "utf8").catch(() => null)).toBeNull();
  });

  test("uninstallCodexNineRouter rolls back already-mutated files when later step fails", async () => {
    // 1. Fresh install where profile is completely unlinked: rollback must recreate profile
    const home = await fixtureHome();
    const configPath = join(home, "config.toml");
    const profilePath = join(home, "9router.config.toml");
    await installCodexNineRouter(nineRouterOptions(home));
    const priorConfig = await readFile(configPath, "utf8");
    const priorProfile = await readFile(profilePath, "utf8");

    const origRename = fsPromises.rename;
    let renameSpy = spyOn(fsPromises, "rename").mockImplementation(async (oldPath, newPath) => {
      if (typeof newPath === "string" && newPath.endsWith("config.toml") && !newPath.endsWith("9router.config.toml")) {
        throw new Error("injected config.toml write failure");
      }
      return origRename.call(fsPromises, oldPath, newPath);
    });

    try {
      await expect(uninstallCodexNineRouter(nineRouterOptions(home)))
        .rejects.toThrow("injected config.toml write failure");
    } finally {
      renameSpy.mockRestore();
    }

    // Rolled back: profile was unlinked first, so rollback must restore prior profile bytes
    expect(await readFile(profilePath, "utf8")).toBe(priorProfile);
    expect(await readFile(configPath, "utf8")).toBe(priorConfig);

    // 2. Profile has user content alongside managed block: rollback must preserve user content
    const userHome = await fixtureHome();
    const userConfig = join(userHome, "config.toml");
    const userProfile = join(userHome, "9router.config.toml");
    await installCodexNineRouter(nineRouterOptions(userHome));
    const userProfileContent = (await readFile(userProfile, "utf8")) + '\n[tui]\ntheme = "nord"\n';
    await writeFile(userProfile, userProfileContent);
    const userConfigContent = await readFile(userConfig, "utf8");

    renameSpy = spyOn(fsPromises, "rename").mockImplementation(async (oldPath, newPath) => {
      if (typeof newPath === "string" && newPath.endsWith("config.toml") && !newPath.endsWith("9router.config.toml")) {
        throw new Error("injected config.toml write failure");
      }
      return origRename.call(fsPromises, oldPath, newPath);
    });

    try {
      await expect(uninstallCodexNineRouter(nineRouterOptions(userHome)))
        .rejects.toThrow("injected config.toml write failure");
    } finally {
      renameSpy.mockRestore();
    }

    // Rolled back: user profile retains its exact prior content including user section
    expect(await readFile(userProfile, "utf8")).toBe(userProfileContent);
    expect(await readFile(userConfig, "utf8")).toBe(userConfigContent);
  });

  test("reports rollback failure clearly without hiding the original failure", async () => {
    const home = await fixtureHome();
    const configPath = join(home, "config.toml");

    // Profile write will fail, triggering rollback of config.toml.
    // We then make rollback fail (e.g. unlink of config.toml throws).
    const origRename = fsPromises.rename;
    const origUnlink = fsPromises.unlink;

    const renameSpy = spyOn(fsPromises, "rename").mockImplementation(async (oldPath, newPath) => {
      if (typeof newPath === "string" && newPath.endsWith("9router.config.toml")) {
        throw new Error("injected primary profile failure");
      }
      return origRename.call(fsPromises, oldPath, newPath);
    });

    const unlinkSpy = spyOn(fsPromises, "unlink").mockImplementation(async (targetPath) => {
      if (typeof targetPath === "string" && targetPath.endsWith("config.toml")) {
        throw new Error("injected rollback unlink failure");
      }
      return origUnlink.call(fsPromises, targetPath);
    });

    let caughtError: unknown;
    try {
      await installCodexNineRouter(nineRouterOptions(home));
    } catch (err) {
      caughtError = err;
    } finally {
      renameSpy.mockRestore();
      unlinkSpy.mockRestore();
    }

    expect(caughtError).toBeInstanceOf(Error);
    const error = caughtError as Error;
    expect(error.message).toContain("injected primary profile failure");
    expect(error.message).toContain("rollback failed");
    expect(error.message).toContain("injected rollback unlink failure");
    expect((error as any).cause?.message).toBe("injected primary profile failure");
  });

  test("supports NINEROUTER_MODEL environment override during install", async () => {
    const home = await fixtureHome();
    const profilePath = join(home, "9router.config.toml");

    await installCodexNineRouter(
      nineRouterOptions(home, { NINEROUTER_MODEL: "claude-3-5-sonnet" }),
    );

    const profileContent = await readFile(profilePath, "utf8");
    expect(profileContent).toContain('model = "claude-3-5-sonnet"');

    const status = await getCodexNineRouterStatus(nineRouterOptions(home));
    expect(status.model).toBe("claude-3-5-sonnet");
  });
});
