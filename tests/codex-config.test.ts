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

  test("reactivates the managed selection without overwriting a user selection", async () => {
    const home = await fixtureHome();
    const path = join(home, "config.toml");

    await installCodexCLIProxyAPI(options(home));
    await deactivateCodexCLIProxyAPI(options(home));
    const activated = await activateCodexCLIProxyAPI(options(home));
    expect(activated.changed).toBe(true);
    expect(await readFile(path, "utf8")).toContain('model_provider = "cliproxyapi"');

    const userHome = await fixtureHome();
    const userPath = join(userHome, "config.toml");
    const userConfig = 'model = "user-model"\nmodel_provider = "user-provider"\n';
    await writeFile(userPath, userConfig);
    const userActivated = await activateCodexCLIProxyAPI(options(userHome));

    expect(userActivated.managedRoot).toBe(false);
    expect(await readFile(userPath, "utf8")).toStartWith(userConfig);
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
    expect(await readFile(path, "utf8")).toBe(original);
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
