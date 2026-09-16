import { describe, expect, test } from "bun:test";
import { mkdir } from "node:fs/promises";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";

const projectRoot = resolve(import.meta.dir, "..");
const smokeRoot = join(projectRoot, "tests", ".opencode-runtime-smoke");
const pluginUrl = pathToFileURL(join(projectRoot, "opencode", "cliproxyapi.ts")).href;

async function runOpenCode(name: string, env: Record<string, string | undefined>) {
  const home = join(smokeRoot, `${name}-${crypto.randomUUID()}`);
  const configDir = join(home, ".config", "opencode");
  await mkdir(configDir, { recursive: true });
  await Bun.write(join(configDir, "opencode.json"), JSON.stringify({ plugin: [pluginUrl] }));

  const child = Bun.spawn(["opencode", "models", "cliproxyapi", "--log-level", "DEBUG"], {
    cwd: projectRoot,
    env: {
      ...process.env,
      ...env,
      HOME: home,
      USERPROFILE: home,
      APPDATA: join(home, "AppData", "Roaming"),
      LOCALAPPDATA: join(home, "AppData", "Local"),
      XDG_CONFIG_HOME: join(home, ".config"),
    },
    stdout: "pipe",
    stderr: "pipe",
  });
  const [stdout, stderr, exitCode] = await Promise.all([
    new Response(child.stdout).text(),
    new Response(child.stderr).text(),
    child.exited,
  ]);
  return { exitCode, output: `${stdout}\n${stderr}` };
}

describe("OpenCode 1.18.18 CLIProxyAPI runtime smoke", () => {
  test("loads a file-URL plugin and lists a discovered model", async () => {
    const server = Bun.serve({
      port: 0,
      fetch(request) {
        const url = new URL(request.url);
        if (url.pathname === "/v1/models") {
          return Response.json({ data: [{ id: "mock-discovered-model", owned_by: "smoke" }] });
        }
        return new Response("not found", { status: 404 });
      },
    });

    try {
      const result = await runOpenCode("available", {
        CLIPROXYAPI_API_KEY: "smoke-key",
        CLIPROXYAPI_BASE_URL: `http://127.0.0.1:${server.port}/v1`,
      });
      expect(result.exitCode).toBe(0);
      expect(result.output).toContain("mock-discovered-model");
    } finally {
      server.stop(true);
    }
  }, 120_000);

  test("leaves the provider absent without a key or reachable proxy", async () => {
    for (const [name, env] of [
      ["missing-key", { CLIPROXYAPI_BASE_URL: "http://127.0.0.1:1/v1" }],
      ["unavailable", { CLIPROXYAPI_API_KEY: "smoke-key", CLIPROXYAPI_BASE_URL: "http://127.0.0.1:1/v1" }],
    ] as const) {
      const result = await runOpenCode(name, env);
      expect(result.exitCode).toBe(1);
      expect(result.output).toContain("Provider not found: cliproxyapi");
    }
  }, 120_000);
});
