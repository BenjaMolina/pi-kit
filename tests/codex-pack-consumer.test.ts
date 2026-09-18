import { describe, expect, test } from "bun:test";
import packageManifest from "../package.json" with { type: "json" };
import { assertArchiveContents, packageIdentity } from "../scripts/pack-consumer";

const packageFiles = [
  "LICENSE",
  "README.md",
  "package.json",
  "extensions/cliproxyapi-dynamic-provider.ts",
  "opencode/cliproxyapi.ts",
  "bin/pi-kit-codex.ts",
  "src/codex/cli.ts",
  "src/codex/config.ts",
  "src/codex/doctor.ts",
  "src/cliproxyapi/discovery.ts",
  "src/cliproxyapi/models.ts",
  "src/cliproxyapi/opencode.ts",
];

function archive(paths = packageFiles) {
  return {
    filename: `pi-kit-${packageIdentity.version}.tgz`,
    size: 1,
    unpackedSize: 1,
    files: paths.map((path) => ({ path })),
  };
}

describe("Codex packed archive contract", () => {
  test("uses the current package manifest identity", () => {
    expect(packageIdentity).toEqual({ name: packageManifest.name, version: packageManifest.version });
  });

  test("requires the Codex bin and every runtime source module", () => {
    expect(() => assertArchiveContents(archive())).not.toThrow();

    for (const missing of ["bin/pi-kit-codex.ts", "src/codex/cli.ts", "src/codex/config.ts", "src/codex/doctor.ts"]) {
      expect(() => assertArchiveContents(archive(packageFiles.filter((path) => path !== missing))))
        .toThrow(`archive omits ${missing}`);
    }
  });
});
