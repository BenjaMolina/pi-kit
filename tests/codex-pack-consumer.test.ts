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
  "bin/pi-kit-copilot.ts",
  "src/codex/cli.ts",
  "src/codex/config.ts",
  "src/codex/doctor.ts",
  "src/codex/plugins.ts",
  "src/cliproxyapi/discovery.ts",
  "src/cliproxyapi/models.ts",
  "src/cliproxyapi/opencode.ts",
  "src/copilot/cli.ts",
  "src/copilot/launcher.ts",
  "src/copilot/state.ts",
  "src/copilot/vscode.ts",
  "profiles/cliproxyapi/plugins/codex-catalog-display-name/README.md",
  "profiles/cliproxyapi/plugins/codex-catalog-display-name/build-linux-amd64.ps1",
  "profiles/cliproxyapi/plugins/codex-catalog-display-name/catalog.go",
  "profiles/cliproxyapi/plugins/codex-catalog-display-name/go.mod",
  "profiles/cliproxyapi/plugins/codex-catalog-display-name/install.ps1",
  "profiles/cliproxyapi/plugins/codex-catalog-display-name/main.go",
  "profiles/cliproxyapi/plugins/codex-catalog-display-name/main_test.go",
  "profiles/cliproxyapi/plugins/codex-antigravity-responses-repair/README.md",
  "profiles/cliproxyapi/plugins/codex-antigravity-responses-repair/build-linux-amd64.ps1",
  "profiles/cliproxyapi/plugins/codex-antigravity-responses-repair/go.mod",
  "profiles/cliproxyapi/plugins/codex-antigravity-responses-repair/install.ps1",
  "profiles/cliproxyapi/plugins/codex-antigravity-responses-repair/main.go",
  "profiles/cliproxyapi/plugins/codex-antigravity-responses-repair/main_test.go",
  "profiles/cliproxyapi/plugins/codex-antigravity-responses-repair/repair.go",
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

    for (const missing of [
      "bin/pi-kit-codex.ts",
      "bin/pi-kit-copilot.ts",
      "src/codex/cli.ts",
      "src/copilot/cli.ts",
      "src/copilot/vscode.ts",
      "src/codex/config.ts",
      "src/codex/doctor.ts",
      "profiles/cliproxyapi/plugins/codex-catalog-display-name/README.md",
      "profiles/cliproxyapi/plugins/codex-antigravity-responses-repair/repair.go",
    ]) {
      expect(() => assertArchiveContents(archive(packageFiles.filter((path) => path !== missing))))
        .toThrow(`archive omits ${missing}`);
    }
  });
});
