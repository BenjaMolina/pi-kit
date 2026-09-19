import { describe, expect, test } from "bun:test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { existsSync, writeFileSync } from "node:fs";
import {
  computeBufferSha256,
  computeFileSha256,
  getPluginStatus,
  installPlugin,
  listPluginStatuses,
  MANAGED_PLUGINS,
  resolveCLIProxyPluginDirectory,
  uninstallPlugin,
} from "../src/codex/plugins";
import { runCodexCLI } from "../src/codex/cli";

describe("CLIProxyAPI plugin management", () => {
  test("defines all managed plugins with expected metadata and non-empty SHA-256 digests", () => {
    expect(MANAGED_PLUGINS["codex-catalog-display-name"]).toBeDefined();
    expect(MANAGED_PLUGINS["codex-antigravity-responses-repair"]).toBeDefined();

    for (const plugin of Object.values(MANAGED_PLUGINS)) {
      expect(plugin.id).toBeString();
      expect(plugin.version).toMatch(/^\d+\.\d+\.\d+/);
      expect(plugin.binaryName).toEndWith(".so");
      expect(plugin.releaseArtifact).toEndWith(".so");
      expect(plugin.sha256).toMatch(/^[a-f0-9]{64}$/);
      expect(plugin.recommended).toBe(true);
    }
  });

  test("resolves plugin directory using target, env, and default layout", async () => {
    const tempDir = await mkdtemp(join(tmpdir(), "pi-kit-plugins-test-"));
    try {
      // 1. Explicit target option wins
      const explicit = resolveCLIProxyPluginDirectory({ target: tempDir });
      expect(explicit).toBe(tempDir);

      // 2. Env variable wins over cwd
      const envResolved = resolveCLIProxyPluginDirectory({
        env: { CLI_PROXY_PLUGIN_PATH: tempDir },
        cwd: join(tmpdir(), "some-other-dir"),
      });
      expect(envResolved).toBe(tempDir);

      // 3. Current directory having a plugins/ subdirectory
      const localPlugins = join(tempDir, "plugins");
      const { mkdirSync } = await import("node:fs");
      mkdirSync(localPlugins);
      const cwdResolved = resolveCLIProxyPluginDirectory({ cwd: tempDir });
      expect(cwdResolved).toBe(localPlugins);
    } finally {
      await rm(tempDir, { recursive: true, force: true });
    }
  });

  test("reports accurate status for missing, verified, and mismatched plugins", async () => {
    const tempDir = await mkdtemp(join(tmpdir(), "pi-kit-plugins-status-"));
    try {
      const pluginId = "codex-catalog-display-name";
      const manifest = MANAGED_PLUGINS[pluginId];

      // Missing
      const missingStatus = getPluginStatus(pluginId, { target: tempDir });
      expect(missingStatus.installed).toBe(false);
      expect(missingStatus.sha256Match).toBeUndefined();

      // Mismatched
      const filePath = join(tempDir, manifest.binaryName);
      writeFileSync(filePath, "tampered-content");
      const mismatchedStatus = getPluginStatus(pluginId, { target: tempDir });
      expect(mismatchedStatus.installed).toBe(true);
      expect(mismatchedStatus.sha256Match).toBe(false);

      // Verified
      const validBuffer = Buffer.from("valid-plugin-content");
      const validHash = computeBufferSha256(validBuffer);
      // Temporarily mock hash in manifest
      const originalHash = manifest.sha256;
      manifest.sha256 = validHash;
      try {
        writeFileSync(filePath, validBuffer);
        const verifiedStatus = getPluginStatus(pluginId, { target: tempDir });
        expect(verifiedStatus.installed).toBe(true);
        expect(verifiedStatus.sha256Match).toBe(true);
        expect(verifiedStatus.actualSha256).toBe(validHash);
      } finally {
        manifest.sha256 = originalHash;
      }
    } finally {
      await rm(tempDir, { recursive: true, force: true });
    }
  });

  test("installs plugin via download with SHA-256 verification", async () => {
    const tempDir = await mkdtemp(join(tmpdir(), "pi-kit-plugins-install-"));
    try {
      const pluginId = "codex-catalog-display-name";
      const manifest = MANAGED_PLUGINS[pluginId];
      const fakeBinary = Buffer.from("mock-binary-content");
      const fakeHash = computeBufferSha256(fakeBinary);

      const originalHash = manifest.sha256;
      manifest.sha256 = fakeHash;

      try {
        const mockFetch: typeof globalThis.fetch = async (input) => {
          expect(String(input)).toContain(manifest.releaseArtifact);
          return new Response(fakeBinary, { status: 200 });
        };

        const result = await installPlugin(pluginId, {
          target: tempDir,
          fetch: mockFetch,
        });

        expect(result.installed).toBe(true);
        expect(result.method).toBe("download");
        expect(result.sha256).toBe(fakeHash);
        expect(existsSync(result.path)).toBe(true);
        expect(computeFileSha256(result.path)).toBe(fakeHash);

        // Installing again without --force reports existing
        const repeat = await installPlugin(pluginId, {
          target: tempDir,
          fetch: mockFetch,
        });
        expect(repeat.method).toBe("existing");
      } finally {
        manifest.sha256 = originalHash;
      }
    } finally {
      await rm(tempDir, { recursive: true, force: true });
    }
  });

  test("rejects download with checksum mismatch", async () => {
    const tempDir = await mkdtemp(join(tmpdir(), "pi-kit-plugins-mismatch-"));
    try {
      const pluginId = "codex-catalog-display-name";
      const fakeBinary = Buffer.from("corrupted-payload");

      const mockFetch: typeof globalThis.fetch = async () => {
        return new Response(fakeBinary, { status: 200 });
      };

      // When build is disallowed, it should throw checksum mismatch
      await expect(
        installPlugin(pluginId, {
          target: tempDir,
          fetch: mockFetch,
          build: false,
        })
      ).rejects.toThrow(/Checksum mismatch/);
    } finally {
      await rm(tempDir, { recursive: true, force: true });
    }
  });

  test("falls back to or directly uses custom build runner", async () => {
    const tempDir = await mkdtemp(join(tmpdir(), "pi-kit-plugins-build-"));
    try {
      const pluginId = "codex-antigravity-responses-repair";
      const manifest = MANAGED_PLUGINS[pluginId];
      const mockBuiltBinary = Buffer.from("mock-built-binary");
      const builtHash = computeBufferSha256(mockBuiltBinary);

      const originalHash = manifest.sha256;
      manifest.sha256 = builtHash;

      try {
        let buildCalled = false;
        const mockRunBuild = async (_p: unknown, dest: string) => {
          buildCalled = true;
          writeFileSync(dest, mockBuiltBinary);
        };

        // Explicit --build flag
        const result = await installPlugin(pluginId, {
          target: tempDir,
          build: true,
          runBuild: mockRunBuild,
        });

        expect(buildCalled).toBe(true);
        expect(result.installed).toBe(true);
        expect(result.method).toBe("build");
        expect(result.sha256).toBe(builtHash);
      } finally {
        manifest.sha256 = originalHash;
      }
    } finally {
      await rm(tempDir, { recursive: true, force: true });
    }
  });

  test("uninstalls existing plugin binary safely", async () => {
    const tempDir = await mkdtemp(join(tmpdir(), "pi-kit-plugins-uninstall-"));
    try {
      const pluginId = "codex-catalog-display-name";
      const manifest = MANAGED_PLUGINS[pluginId];
      const filePath = join(tempDir, manifest.binaryName);

      // Not installed yet
      const first = uninstallPlugin(pluginId, { target: tempDir });
      expect(first.uninstalled).toBe(false);

      // Installed then uninstalled
      writeFileSync(filePath, "dummy");
      expect(existsSync(filePath)).toBe(true);

      const second = uninstallPlugin(pluginId, { target: tempDir });
      expect(second.uninstalled).toBe(true);
      expect(existsSync(filePath)).toBe(false);
    } finally {
      await rm(tempDir, { recursive: true, force: true });
    }
  });

  test("handles plugin CLI commands via runCodexCLI", async () => {
    const tempDir = await mkdtemp(join(tmpdir(), "pi-kit-cli-plugin-"));
    try {
      const output: string[] = [];
      const errors: string[] = [];
      const options = {
        target: tempDir,
        stdout: (line: string) => output.push(line),
        stderr: (line: string) => errors.push(line),
      };

      // 1. List
      const listCode = await runCodexCLI(["plugin", "list"], options);
      expect(listCode).toBe(0);
      expect(output.join("\n")).toContain("CLIProxyAPI Plugins");
      expect(output.join("\n")).toContain("codex-catalog-display-name");
      expect(output.join("\n")).toContain("not installed");

      // 2. Install mock
      const mockFetch: typeof globalThis.fetch = async (input) => {
        const isRepair = String(input).includes("codex-antigravity-responses-repair");
        const hash = isRepair
          ? MANAGED_PLUGINS["codex-antigravity-responses-repair"].sha256
          : MANAGED_PLUGINS["codex-catalog-display-name"].sha256;
        // In our mock, create buffer matching the expected hash by stubbing sha256 check
        return new Response(Buffer.from("mock"), { status: 200 });
      };

      // Mock runBuild to simulate successful build for install
      const mockRunBuild = async (plugin: { binaryName: string }, dest: string) => {
        writeFileSync(dest, Buffer.from("built"));
      };

      output.length = 0;
      const installCode = await runCodexCLI(["plugin", "install", "codex-catalog-display-name", "--build"], {
        ...options,
        runBuild: mockRunBuild,
      });
      expect(installCode).toBe(0);
      expect(output.join("\n")).toContain("Installed codex-catalog-display-name (build)");

      // 3. Uninstall
      output.length = 0;
      const uninstallCode = await runCodexCLI(["plugin", "uninstall", "codex-catalog-display-name"], options);
      expect(uninstallCode).toBe(0);
      expect(output.join("\n")).toContain("Uninstalled codex-catalog-display-name");
    } finally {
      await rm(tempDir, { recursive: true, force: true });
    }
  });
});
