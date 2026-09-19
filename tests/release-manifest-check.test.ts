import { describe, expect, test } from "bun:test";
import { assertReleaseManifest } from "../scripts/release-manifest-check";

const manifest = {
  name: "@benjamolina/pi-kit",
  version: "0.3.1",
  private: false,
  main: "./opencode/cliproxyapi.ts",
  exports: "./opencode/cliproxyapi.ts",
  bin: {
    "pi-kit-codex": "./bin/pi-kit-codex.ts",
    "pi-kit-copilot": "./bin/pi-kit-copilot.ts",
  },
  publishConfig: { access: "public" },
  repository: { type: "git", url: "git+https://github.com/BenjaMolina/pi-kit.git" },
};

describe("release manifest contract", () => {
  test("accepts the public package and matching version tag", () => {
    expect(() => assertReleaseManifest(manifest, { packages: { "": manifest } }, "v0.3.1")).not.toThrow();
  });

  test("rejects an external entry that would not load the OpenCode plugin", () => {
    expect(() => assertReleaseManifest(
      { ...manifest, exports: "./dist/index.js" },
      { packages: { "": manifest } },
      "v0.3.1",
    )).toThrow("exports must target the external OpenCode plugin");
  });

  test("requires exactly the Codex and Copilot bin targets", () => {
    for (const bin of [
      {},
      { "pi-kit-codex": "./bin/pi-kit-codex.ts" },
      { "pi-kit-copilot": "./bin/pi-kit-copilot.ts" },
      { ...manifest.bin, "pi-kit-codex": "./bin/other.ts" },
      { ...manifest.bin, "pi-kit-copilot": "./bin/other.ts" },
      { ...manifest.bin, another: "./bin/another.ts" },
    ]) {
      expect(() => assertReleaseManifest(
        { ...manifest, bin },
        { packages: { "": manifest } },
      )).toThrow("bin must contain exactly pi-kit-codex and pi-kit-copilot with their required targets");
    }
  });
});
