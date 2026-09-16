import { describe, expect, test } from "bun:test";
import { assertReleaseManifest } from "../scripts/release-manifest-check";

const manifest = {
  name: "@benjamolina/pi-kit",
  version: "0.3.1",
  private: false,
  main: "./opencode/cliproxyapi.ts",
  exports: "./opencode/cliproxyapi.ts",
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
});
