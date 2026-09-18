import { describe, expect, test } from "bun:test";
import { mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
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
