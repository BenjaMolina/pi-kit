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
    expect(await readFile(join(userHome, "config.toml"), "utf8")).toStartWith(userConfig);
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
    await expect(runCodexCLI(["use", "unexpected"], options)).resolves.toBe(1);
    await expect(runCodexCLI(["unexpected"], options)).resolves.toBe(1);
  });
});
