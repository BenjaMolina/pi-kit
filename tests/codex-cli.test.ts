import { describe, expect, test } from "bun:test";
import { mkdtemp } from "node:fs/promises";
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

  test("prints help and rejects unknown commands", async () => {
    const output: string[] = [];
    const options = { stdout: (line: string) => output.push(line) };

    await expect(runCodexCLI(["--help"], options)).resolves.toBe(0);
    expect(output.join("\n")).toContain("Usage: pi-kit-codex");
    await expect(runCodexCLI(["unexpected"], options)).resolves.toBe(1);
  });
});
