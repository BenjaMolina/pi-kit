import { describe, expect, test } from "bun:test";
import { mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { runCodexCLI } from "../src/codex/cli";

const SECRET = "cli-secret-value";

describe("pi-kit-codex CLI", () => {
  test("does not disclose API key values in install or doctor output", async () => {
    const home = await mkdtemp(join(tmpdir(), "pi-kit-codex-cli-"));
    const output: string[] = [];
    const options = {
      env: {
        CODEX_HOME: home,
        CLIPROXYAPI_BASE_URL: `http://user:${SECRET}@proxy.test/v1?token=${SECRET}#${SECRET}`,
        CLIPROXYAPI_API_KEY: SECRET,
      },
      homedir: () => "/unused-home",
      stdout: (line: string) => output.push(line),
      runCodex: async () => ({ available: true, version: "codex 0.144.0" }),
      fetch: async () => new Response(JSON.stringify({ data: [{ id: "gpt-5.5" }] })),
    };

    await expect(runCodexCLI(["install"], options)).resolves.toBe(0);
    await expect(runCodexCLI(["doctor"], options)).resolves.toBe(0);

    const report = output.join("\n");
    expect(report).not.toContain(SECRET);
    expect(report).toContain("http://proxy.test/v1");
    expect(report).toContain("API key: set");
    expect(report).toContain("Proxy models: reachable");
  });

  test("rejects relative CODEX_HOME during doctor with a safe clear error", async () => {
    const output: string[] = [];
    const errors: string[] = [];

    await expect(runCodexCLI(["doctor"], {
      env: { CODEX_HOME: "relative/.codex" },
      stdout: (line: string) => output.push(line),
      stderr: (line: string) => errors.push(line),
    })).resolves.toBe(1);

    expect(output).toEqual([]);
    expect(errors).toEqual(["pi-kit-codex: CODEX_HOME must be an absolute path."]);
  });

  test("switches providers and reports offline managed status", async () => {
    const home = await mkdtemp(join(tmpdir(), "pi-kit-codex-cli-"));
    const output: string[] = [];
    let fetchCalls = 0;
    const options = {
      env: {
        CODEX_HOME: home,
        CLIPROXYAPI_BASE_URL: "http://proxy.test/v1",
        CLIPROXYAPI_API_KEY: SECRET,
      },
      stdout: (line: string) => output.push(line),
      fetch: async () => {
        fetchCalls += 1;
        return new Response();
      },
    };

    await expect(runCodexCLI(["install"], options)).resolves.toBe(0);
    await expect(runCodexCLI(["use", "openai"], options)).resolves.toBe(0);
    await expect(runCodexCLI(["status"], options)).resolves.toBe(0);
    expect(fetchCalls).toBe(0);
    expect(output.join("\n")).toContain("Selection: OpenAI default");
    expect(output.join("\n")).toContain("Provider: managed registered");
    expect(await readFile(join(home, "config.toml"), "utf8")).toContain("Codex CLIProxyAPI v1 provider");

    await expect(runCodexCLI(["use", "cliproxyapi"], options)).resolves.toBe(0);
    expect(await readFile(join(home, "config.toml"), "utf8")).toContain('model_provider = "cliproxyapi"');

    const userHome = await mkdtemp(join(tmpdir(), "pi-kit-codex-cli-"));
    const userConfig = 'model = "user-model"\nmodel_provider = "user-provider"\n';
    await writeFile(join(userHome, "config.toml"), userConfig);
    await expect(runCodexCLI(["use", "cliproxyapi"], { ...options, env: { ...options.env, CODEX_HOME: userHome } })).resolves.toBe(0);
    expect(await readFile(join(userHome, "config.toml"), "utf8")).toContain('model_provider = "cliproxyapi"');
  });

  test("uses OpenAI for an unmanaged CLIProxyAPI selection", async () => {
    const home = await mkdtemp(join(tmpdir(), "pi-kit-codex-cli-"));
    const path = join(home, "config.toml");
    const original = 'model = "proxy-model"\nmodel_provider = "cliproxyapi"\nmodel_reasoning_effort = "high"\n';
    await writeFile(path, original);
    const output: string[] = [];
    const options = {
      env: { CODEX_HOME: home, CLIPROXYAPI_BASE_URL: "http://proxy.test/v1", CLIPROXYAPI_API_KEY: SECRET },
      stdout: (line: string) => output.push(line),
    };

    await expect(runCodexCLI(["use", "openai"], options)).resolves.toBe(0);
    expect(await readFile(path, "utf8")).toBe('model_reasoning_effort = "high"\n');
    expect(output).toContain(`Switched to OpenAI default: ${path}`);
  });

  test("switches an interleaved legacy provider block without changing unrelated sections", async () => {
    const home = await mkdtemp(join(tmpdir(), "pi-kit-codex-cli-"));
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
    const output: string[] = [];
    const options = {
      env: { CODEX_HOME: home, CLIPROXYAPI_BASE_URL: "http://proxy.test/v1", CLIPROXYAPI_API_KEY: SECRET },
      stdout: (line: string) => output.push(line),
    };

    await expect(runCodexCLI(["status"], options)).resolves.toBe(0);
    await expect(runCodexCLI(["use", "cliproxyapi"], options)).resolves.toBe(0);
    await expect(runCodexCLI(["use", "openai"], options)).resolves.toBe(0);

    expect(output.join("\n")).toContain("Provider: managed registered");
    expect(await readFile(path, "utf8")).toBe(legacyProvider);
  });

  test("switches a provider with a valid trailing TUI section without changing it", async () => {
    const home = await mkdtemp(join(tmpdir(), "pi-kit-codex-cli-"));
    const path = join(home, "config.toml");
    const trailing = '[tui]\ntheme = "default"\n';
    const provider = [
      "# >>> pi-kit Codex CLIProxyAPI v1 provider >>>",
      "[model_providers.cliproxyapi]",
      'name = "CLIProxyAPI"',
      'base_url = "http://proxy.test/v1"',
      'env_key = "CLIPROXYAPI_API_KEY"',
      'wire_api = "responses"',
      "# <<< pi-kit Codex CLIProxyAPI v1 provider <<<",
      "",
    ].join("\n");
    const original = provider + trailing;
    await writeFile(path, original);
    const options = {
      env: { CODEX_HOME: home, CLIPROXYAPI_BASE_URL: "http://proxy.test/v1", CLIPROXYAPI_API_KEY: SECRET },
      stdout: () => undefined,
    };

    await expect(runCodexCLI(["status"], options)).resolves.toBe(0);
    await expect(runCodexCLI(["use", "cliproxyapi"], options)).resolves.toBe(0);
    await expect(runCodexCLI(["use", "openai"], options)).resolves.toBe(0);
    expect(await readFile(path, "utf8")).toBe(original);
  });

  test("prints help and rejects unknown commands", async () => {
    const output: string[] = [];
    const options = { stdout: (line: string) => output.push(line) };

    await expect(runCodexCLI(["--help"], options)).resolves.toBe(0);
    expect(output.join("\n")).toContain("Usage: pi-kit-codex");
    expect(output.join("\n")).toContain("9router");
    await expect(runCodexCLI(["use", "unexpected"], options)).resolves.toBe(1);
    await expect(runCodexCLI(["unexpected"], options)).resolves.toBe(1);
  });

  test("manages 9Router profile lifecycle without disclosing credentials", async () => {
    const home = await mkdtemp(join(tmpdir(), "pi-kit-codex-cli-9r-"));
    const output: string[] = [];
    const options = {
      env: {
        CODEX_HOME: home,
        NINEROUTER_BASE_URL: `http://user:${SECRET}@127.0.0.1:20128/v1?token=${SECRET}#${SECRET}`,
        NINEROUTER_API_KEY: SECRET,
      },
      stdout: (line: string) => output.push(line),
    };

    // Initial status: not registered / not installed
    await expect(runCodexCLI(["9router", "status"], options)).resolves.toBe(0);
    expect(output.join("\n")).toContain("Provider: not registered");
    expect(output.join("\n")).toContain("Profile: not installed");
    output.length = 0;

    // Install 9router
    await expect(runCodexCLI(["9router", "install"], options)).resolves.toBe(0);
    expect(output.join("\n")).toContain("Installed 9Router Codex profile");
    expect(output.join("\n")).not.toContain(SECRET);
    output.length = 0;

    // Status after install
    await expect(runCodexCLI(["9router", "status"], options)).resolves.toBe(0);
    const statusReport = output.join("\n");
    expect(statusReport).toContain("Provider: managed registered");
    expect(statusReport).toContain("Profile: managed profile");
    expect(statusReport).toContain("Model: gpt-5.5");
    expect(statusReport).toContain(join(home, "config.toml"));
    expect(statusReport).toContain(join(home, "9router.config.toml"));
    expect(statusReport).not.toContain(SECRET);
    output.length = 0;

    // Verify config files
    const configContent = await readFile(join(home, "config.toml"), "utf8");
    expect(configContent).toContain("[model_providers.9router]");
    expect(configContent).toContain("http://127.0.0.1:20128/v1");
    expect(configContent).not.toContain(SECRET);

    const profileContent = await readFile(join(home, "9router.config.toml"), "utf8");
    expect(profileContent).toContain('model = "gpt-5.5"');
    expect(profileContent).toContain('model_provider = "9router"');

    // Repeated install is idempotent
    await expect(runCodexCLI(["9router", "install"], options)).resolves.toBe(0);
    expect(output.join("\n")).toContain("already installed");
    output.length = 0;

    // Uninstall
    await expect(runCodexCLI(["9router", "uninstall"], options)).resolves.toBe(0);
    expect(output.join("\n")).toContain("Removed managed 9Router Codex profile");
    output.length = 0;

    // Status after uninstall
    await expect(runCodexCLI(["9router", "status"], options)).resolves.toBe(0);
    expect(output.join("\n")).toContain("Provider: not registered");
    expect(output.join("\n")).toContain("Profile: not installed");
    output.length = 0;

    // Repeated uninstall
    await expect(runCodexCLI(["9router", "uninstall"], options)).resolves.toBe(0);
    expect(output.join("\n")).toContain("No managed 9Router Codex profile found");
  });

  test("handles 9Router help and invalid subcommands", async () => {
    const output: string[] = [];
    const errors: string[] = [];
    const options = {
      stdout: (line: string) => output.push(line),
      stderr: (line: string) => errors.push(line),
    };

    await expect(runCodexCLI(["9router", "--help"], options)).resolves.toBe(0);
    expect(output.join("\n")).toContain("Usage: pi-kit-codex 9router");
    output.length = 0;

    await expect(runCodexCLI(["9router", "unexpected"], options)).resolves.toBe(1);
    expect(errors.join("\n")).toContain("Unknown 9router command: unexpected");
    errors.length = 0;

    await expect(runCodexCLI(["9router", "status", "--unexpected"], options)).resolves.toBe(1);
    expect(errors.join("\n")).toContain("status does not accept options");
  });
});
