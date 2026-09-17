import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";

const workflow = readFileSync(new URL("../.github/workflows/release-npm.yml", import.meta.url), "utf8");
const publishScript = workflow.match(
  /- name: Publish the missing exact version with trusted OIDC and verify propagation\r?\n        run: \|\r?\n([\s\S]*?)\r?\n\s*$/,
)?.[1];

function assertPublishScript(): string {
  expect(publishScript).toBeDefined();
  return publishScript!;
}

describe("npm Trusted Publishing workflow contract", () => {
  test("uses GitHub OIDC rather than an npm token or setup-node auth shim", () => {
    expect(workflow).toContain("id-token: write");
    expect(workflow).not.toMatch(/\$\{\{\s*secrets\.(?:NPM_TOKEN|NODE_AUTH_TOKEN)\s*\}\}/);
    expect(workflow).not.toContain("registry-url:");
    expect(workflow).not.toContain("always-auth:");

    const script = assertPublishScript();
    expect(script).toContain('[ -n "${NODE_AUTH_TOKEN:-}" ] || [ -n "${NPM_TOKEN:-}" ]');
  });

  test("installs a Node 22-compatible pinned npm CLI before publishing with provenance", () => {
    expect(workflow).toMatch(/node-version: 22\b/);

    const npmInstall = workflow.indexOf("npm install --global npm@11.5.1");
    const publish = assertPublishScript().indexOf("npm publish --access public --provenance");
    expect(npmInstall).toBeGreaterThan(-1);
    expect(publish).toBeGreaterThan(-1);
    expect(npmInstall).toBeLessThan(workflow.indexOf("npm publish --access public --provenance"));
  });

  test("exits for an existing exact version before credential checks or publishing", () => {
    const script = assertPublishScript();
    const existingVersion = script.indexOf("if query_exact_version; then");
    const earlyExit = script.indexOf("exit 0", existingVersion);
    const credentialCheck = script.indexOf('[ -n "${NODE_AUTH_TOKEN:-}" ] || [ -n "${NPM_TOKEN:-}" ]');
    const publish = script.indexOf("npm publish --access public --provenance");

    expect(existingVersion).toBeGreaterThan(-1);
    expect(earlyExit).toBeGreaterThan(existingVersion);
    expect(credentialCheck).toBeGreaterThan(earlyExit);
    expect(publish).toBeGreaterThan(credentialCheck);
  });
});
