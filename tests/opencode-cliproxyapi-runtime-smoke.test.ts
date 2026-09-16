import { describe, expect, test } from "bun:test";
import { readFile } from "node:fs/promises";
import { join, resolve } from "node:path";

const projectRoot = resolve(import.meta.dir, "..");

describe("OpenCode external package entry", () => {
  test("preserves the TypeScript plugin entry for Bun-hosted external packages", async () => {
    const manifest = JSON.parse(await readFile(join(projectRoot, "package.json"), "utf8")) as Record<string, unknown>;

    expect(manifest.name).toBe("@benjamolina/pi-kit");
    expect(manifest.main).toBe("./opencode/cliproxyapi.ts");
    expect(manifest.exports).toBe("./opencode/cliproxyapi.ts");
  });
});
