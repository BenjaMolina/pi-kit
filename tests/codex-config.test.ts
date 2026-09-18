import { describe, expect, test } from "bun:test";
import { mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  installCodexCLIProxyAPI,
  resolveCodexHome,
  uninstallCodexCLIProxyAPI,
} from "../src/codex/config";

const SECRET = "super-secret-api-key";

async function fixtureHome(): Promise<string> {
  return mkdtemp(join(tmpdir(), "pi-kit-codex-"));
}

function options(home: string, extra: Record<string, string | undefined> = {}) {
  return {
    env: {
      CODEX_HOME: home,
      CLIPROXYAPI_BASE_URL: "http://proxy.test/v1/",
      CLIPROXYAPI_API_KEY: SECRET,
      ...extra,
    },
    homedir: () => "/unused-home",
  };
}

describe("Codex CLIProxyAPI configuration", () => {
  test("installs marked root and provider blocks into a fresh config", async () => {
    const home = await fixtureHome();

    await installCodexCLIProxyAPI(options(home));

    expect(await readFile(join(home, "config.toml"), "utf8")).toBe([
      "# >>> pi-kit Codex CLIProxyAPI v1 root >>>",
      'model = "gpt-5.5"',
      'model_provider = "cliproxyapi"',
      "# <<< pi-kit Codex CLIProxyAPI v1 root <<<",
      "# >>> pi-kit Codex CLIProxyAPI v1 provider >>>",
      "[model_providers.cliproxyapi]",
      'name = "CLIProxyAPI"',
      'base_url = "http://proxy.test/v1"',
      'env_key = "CLIPROXYAPI_API_KEY"',
      'wire_api = "responses"',
      "# <<< pi-kit Codex CLIProxyAPI v1 provider <<<",
    ].join("\n"));
  });

  test("preserves unrelated bytes and inserts the root block after a BOM", async () => {
    const home = await fixtureHome();
    const path = join(home, "config.toml");
    const original = "\uFEFF# User comment\r\nexperimental_feature = true\r\n";
    await writeFile(path, original);

    await installCodexCLIProxyAPI(options(home));

    const config = await readFile(path, "utf8");
    expect(config).toContain("\uFEFF# >>> pi-kit Codex CLIProxyAPI v1 root >>>\r\n");
    expect(config).toContain("# User comment\r\nexperimental_feature = true\r\n");
    expect(config).toContain('base_url = "http://proxy.test/v1"');
    expect(config.replace(/\r\n/g, "").includes("\n")).toBe(false);
  });

  test("sanitizes userinfo, query, and fragment from the configured base URL", async () => {
    const home = await fixtureHome();
    await installCodexCLIProxyAPI(options(home, {
      CLIPROXYAPI_BASE_URL: "http://user:secret@proxy.test/v1?token=secret#secret",
    }));

    const config = await readFile(join(home, "config.toml"), "utf8");
    expect(config).toContain('base_url = "http://proxy.test/v1"');
    expect(config).not.toContain("secret");
  });

  test("installs only the provider when a user-owned model selection exists", async () => {
    const home = await fixtureHome();
    const path = join(home, "config.toml");
    const original = 'model = "user-model"\nmodel_provider = "user-provider"\n';
    await writeFile(path, original);

    const result = await installCodexCLIProxyAPI(options(home));
    const config = await readFile(path, "utf8");

    expect(result.managedRoot).toBe(false);
    expect(config).toStartWith(original);
    expect(config).not.toContain("Codex CLIProxyAPI v1 root");
    expect(config).toContain("Codex CLIProxyAPI v1 provider");
  });

  test("aborts without writes when an unmarked CLIProxyAPI provider exists", async () => {
    const home = await fixtureHome();
    const path = join(home, "config.toml");
    const original = '[model_providers.cliproxyapi]\nname = "User proxy"\n';
    await writeFile(path, original);

    await expect(installCodexCLIProxyAPI(options(home))).rejects.toThrow("already exists without pi-kit markers");
    expect(await readFile(path, "utf8")).toBe(original);
  });

  test("rejects a falsy scalar CLIProxyAPI provider key without writes", async () => {
    const home = await fixtureHome();
    const path = join(home, "config.toml");
    const original = "[model_providers]\ncliproxyapi = false\n";
    await writeFile(path, original);

    await expect(installCodexCLIProxyAPI(options(home))).rejects.toThrow("already exists without pi-kit markers");
    expect(await readFile(path, "utf8")).toBe(original);
  });

  test("validates planned TOML before writing when a scalar provider namespace conflicts", async () => {
    const home = await fixtureHome();
    const path = join(home, "config.toml");
    const original = "model_providers = false\n";
    await writeFile(path, original);

    await expect(installCodexCLIProxyAPI(options(home))).rejects.toThrow("not valid TOML");
    expect(await readFile(path, "utf8")).toBe(original);
  });

  test("is byte-idempotent", async () => {
    const home = await fixtureHome();
    const path = join(home, "config.toml");
    await installCodexCLIProxyAPI(options(home));
    const first = await readFile(path, "utf8");

    const result = await installCodexCLIProxyAPI(options(home));

    expect(result.changed).toBe(false);
    expect(await readFile(path, "utf8")).toBe(first);
  });

  test("uninstall removes only managed blocks", async () => {
    const home = await fixtureHome();
    const path = join(home, "config.toml");
    await writeFile(path, '# User comment\nexperimental_feature = true\n');
    await installCodexCLIProxyAPI(options(home));

    const result = await uninstallCodexCLIProxyAPI(options(home));
    const config = await readFile(path, "utf8");

    expect(result.changed).toBe(true);
    expect(config).toContain("# User comment\nexperimental_feature = true\n");
    expect(config).not.toContain("pi-kit Codex CLIProxyAPI");
    expect(config).not.toContain("model_providers.cliproxyapi");
  });

  test("rejects malformed TOML and malformed managed markers without writes", async () => {
    const home = await fixtureHome();
    const path = join(home, "config.toml");
    const malformedToml = "model = [\n";
    await writeFile(path, malformedToml);
    await expect(installCodexCLIProxyAPI(options(home))).rejects.toThrow("not valid TOML");
    expect(await readFile(path, "utf8")).toBe(malformedToml);

    const malformedMarkers = "# >>> pi-kit Codex CLIProxyAPI v1 root >>>\nmodel = \"gpt-5.5\"\n";
    await writeFile(path, malformedMarkers);
    await expect(uninstallCodexCLIProxyAPI(options(home))).rejects.toThrow("markers are malformed");
    expect(await readFile(path, "utf8")).toBe(malformedMarkers);
  });

  test("rejects managed blocks outside their required document positions", async () => {
    const home = await fixtureHome();
    const path = join(home, "config.toml");
    const misplacedRoot = "# User content\n# >>> pi-kit Codex CLIProxyAPI v1 root >>>\nmodel = \"gpt-5.5\"\nmodel_provider = \"cliproxyapi\"\n# <<< pi-kit Codex CLIProxyAPI v1 root <<<\n";
    await writeFile(path, misplacedRoot);
    await expect(uninstallCodexCLIProxyAPI(options(home))).rejects.toThrow("root block is not at the document start");
    expect(await readFile(path, "utf8")).toBe(misplacedRoot);

    const misplacedProvider = "# >>> pi-kit Codex CLIProxyAPI v1 provider >>>\n[model_providers.cliproxyapi]\nname = \"CLIProxyAPI\"\nbase_url = \"http://proxy.test/v1\"\nenv_key = \"CLIPROXYAPI_API_KEY\"\nwire_api = \"responses\"\n# <<< pi-kit Codex CLIProxyAPI v1 provider <<<\n# User content\n";
    await writeFile(path, misplacedProvider);
    await expect(uninstallCodexCLIProxyAPI(options(home))).rejects.toThrow("provider block is not at the document end");
    expect(await readFile(path, "utf8")).toBe(misplacedProvider);
  });

  test("rejects duplicate, crossed, and modified managed markers without writes", async () => {
    const home = await fixtureHome();
    const path = join(home, "config.toml");
    const cases = [
      [
        "duplicate",
        "# >>> pi-kit Codex CLIProxyAPI v1 root >>>\nmodel = \"gpt-5.5\"\nmodel_provider = \"cliproxyapi\"\n# <<< pi-kit Codex CLIProxyAPI v1 root <<<\n# >>> pi-kit Codex CLIProxyAPI v1 root >>>\nmodel = \"gpt-5.5\"\nmodel_provider = \"cliproxyapi\"\n# <<< pi-kit Codex CLIProxyAPI v1 root <<<\n",
        "markers are malformed or duplicated",
      ],
      [
        "crossed",
        "# >>> pi-kit Codex CLIProxyAPI v1 provider >>>\n# <<< pi-kit Codex CLIProxyAPI v1 provider <<<\n# >>> pi-kit Codex CLIProxyAPI v1 root >>>\nmodel = \"gpt-5.5\"\nmodel_provider = \"cliproxyapi\"\n# <<< pi-kit Codex CLIProxyAPI v1 root <<<\n",
        "markers are crossed",
      ],
      [
        "modified",
        "# >>> pi-kit Codex CLIProxyAPI v1 root >>>\nmodel = \"other-model\"\nmodel_provider = \"cliproxyapi\"\n# <<< pi-kit Codex CLIProxyAPI v1 root <<<\n",
        "root block has been modified",
      ],
    ] as const;

    for (const [, content, message] of cases) {
      await writeFile(path, content);
      await expect(uninstallCodexCLIProxyAPI(options(home))).rejects.toThrow(message);
      expect(await readFile(path, "utf8")).toBe(content);
    }
  });

  test("rejects a relative CODEX_HOME", () => {
    expect(() => resolveCodexHome({ CODEX_HOME: "relative/.codex" }, () => "/home/tester"))
      .toThrow("CODEX_HOME must be an absolute path");
  });
});
