import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, rmSync, unlinkSync, writeFileSync } from "node:fs";
import { isAbsolute, join, resolve } from "node:path";
import { spawn } from "node:child_process";

export type PluginManifest = {
  id: string;
  name: string;
  version: string;
  description: string;
  binaryName: string;
  releaseArtifact: string;
  releaseTag: string;
  sha256: string;
  sourceDir: string;
  recommended: boolean;
};

export const MANAGED_PLUGINS: Record<string, PluginManifest> = {
  "codex-catalog-display-name": {
    id: "codex-catalog-display-name",
    name: "Codex catalog display-name",
    version: "1.1.0",
    description: "Disambiguates scoped model entries in CLIProxyAPI model catalog",
    binaryName: "codex-catalog-display-name.so",
    releaseArtifact: "codex-catalog-display-name-linux-amd64-v1.1.0.so",
    releaseTag: "v0.5.7",
    sha256: "1fab1d7f68cfcbca5d49cc359dda190f9930715614bd911f3c2cafc145a39a64",
    sourceDir: "profiles/cliproxyapi/plugins/codex-catalog-display-name",
    recommended: true,
  },
  "codex-antigravity-responses-repair": {
    id: "codex-antigravity-responses-repair",
    name: "Codex Antigravity responses repair",
    version: "1.0.0",
    description: "Repairs Codex GPT-5 identity for Antigravity Gemini Responses requests",
    binaryName: "codex-antigravity-responses-repair.so",
    releaseArtifact: "codex-antigravity-responses-repair-linux-amd64-v1.0.0.so",
    releaseTag: "v0.5.7",
    sha256: "669596041d7c9c99121d6c5b6f368d4eab88012900311658887ffbc1db8720cb",
    sourceDir: "profiles/cliproxyapi/plugins/codex-antigravity-responses-repair",
    recommended: true,
  },
};

export type PluginLocationOptions = {
  target?: string;
  env?: Record<string, string | undefined>;
  cwd?: string;
};

export type PluginStatus = {
  id: string;
  name: string;
  version: string;
  installed: boolean;
  sha256Match?: boolean;
  actualSha256?: string;
  expectedSha256: string;
  path: string;
  description: string;
};

export type InstallPluginOptions = PluginLocationOptions & {
  build?: boolean;
  force?: boolean;
  fetch?: typeof globalThis.fetch;
  runBuild?: (plugin: PluginManifest, destination: string) => Promise<void>;
  sourceRootDir?: string;
};

export type InstallPluginResult = {
  id: string;
  installed: boolean;
  method: "download" | "build" | "existing";
  path: string;
  sha256: string;
  warning?: string;
};

export type UninstallPluginResult = {
  id: string;
  uninstalled: boolean;
  path: string;
};

export function computeFileSha256(filePath: string): string {
  const content = readFileSync(filePath);
  return createHash("sha256").update(content).digest("hex").toLowerCase();
}

export function computeBufferSha256(buffer: Uint8Array | Buffer): string {
  return createHash("sha256").update(buffer).digest("hex").toLowerCase();
}

export function resolveCLIProxyPluginDirectory(options: PluginLocationOptions = {}): string {
  if (options.target?.trim()) {
    return resolve(options.target.trim());
  }

  const env = options.env ?? process.env;
  if (env.CLI_PROXY_PLUGIN_PATH?.trim()) {
    return resolve(env.CLI_PROXY_PLUGIN_PATH.trim());
  }

  const cwd = options.cwd ?? process.cwd();

  // 1. Direct plugins folder in current directory
  const currentPlugins = join(cwd, "plugins");
  if (existsSync(currentPlugins)) {
    return currentPlugins;
  }

  // 2. Sibling CLIProxyAPI checkout
  const siblingCLIProxy = resolve(cwd, "..", "CLIProxyAPI", "plugins");
  if (existsSync(siblingCLIProxy)) {
    return siblingCLIProxy;
  }

  // 3. Parent's sibling if inside a nested subpath (e.g. pi-kit/profiles/cliproxyapi)
  const nestedSibling = resolve(cwd, "..", "..", "CLIProxyAPI", "plugins");
  if (existsSync(nestedSibling)) {
    return nestedSibling;
  }

  // Fallback to default expected sibling layout
  return siblingCLIProxy;
}

export function getPluginStatus(pluginId: string, options: PluginLocationOptions = {}): PluginStatus {
  const plugin = MANAGED_PLUGINS[pluginId];
  if (!plugin) {
    throw new Error(`Unknown plugin: ${pluginId}. Supported plugins: ${Object.keys(MANAGED_PLUGINS).join(", ")}`);
  }

  const pluginDir = resolveCLIProxyPluginDirectory(options);
  const pluginPath = join(pluginDir, plugin.binaryName);

  if (!existsSync(pluginPath)) {
    return {
      id: plugin.id,
      name: plugin.name,
      version: plugin.version,
      installed: false,
      expectedSha256: plugin.sha256,
      path: pluginPath,
      description: plugin.description,
    };
  }

  const actualSha256 = computeFileSha256(pluginPath);
  const sha256Match = actualSha256.toLowerCase() === plugin.sha256.toLowerCase();

  return {
    id: plugin.id,
    name: plugin.name,
    version: plugin.version,
    installed: true,
    sha256Match,
    actualSha256,
    expectedSha256: plugin.sha256,
    path: pluginPath,
    description: plugin.description,
  };
}

export function listPluginStatuses(options: PluginLocationOptions = {}): PluginStatus[] {
  return Object.keys(MANAGED_PLUGINS).map((id) => getPluginStatus(id, options));
}

export async function installPlugin(
  pluginId: string,
  options: InstallPluginOptions = {}
): Promise<InstallPluginResult> {
  const plugin = MANAGED_PLUGINS[pluginId];
  if (!plugin) {
    throw new Error(`Unknown plugin: ${pluginId}. Supported plugins: ${Object.keys(MANAGED_PLUGINS).join(", ")}`);
  }

  const pluginDir = resolveCLIProxyPluginDirectory(options);
  if (!existsSync(pluginDir)) {
    mkdirSync(pluginDir, { recursive: true });
  }

  const destination = join(pluginDir, plugin.binaryName);
  if (existsSync(destination) && !options.force) {
    const existingSha256 = computeFileSha256(destination);
    if (existingSha256.toLowerCase() === plugin.sha256.toLowerCase()) {
      return {
        id: plugin.id,
        installed: true,
        method: "existing",
        path: destination,
        sha256: existingSha256,
      };
    }
    throw new Error(
      `Plugin binary already exists at ${destination} with different checksum. Re-run with --force to overwrite.`
    );
  }

  // Option 1: Explicit build requested
  if (options.build) {
    return runBuildAndInstall(plugin, destination, options);
  }

  // Option 2: Default download attempt from GitHub Releases
  const fetchFn = options.fetch ?? globalThis.fetch;
  const downloadUrl = `https://github.com/BenjaMolina/pi-kit/releases/download/${plugin.releaseTag}/${plugin.releaseArtifact}`;

  try {
    const response = await fetchFn(downloadUrl, {
      signal: AbortSignal.timeout(15_000),
    });

    if (response.ok) {
      const buffer = Buffer.from(await response.arrayBuffer());
      const downloadedSha256 = computeBufferSha256(buffer);

      if (downloadedSha256.toLowerCase() !== plugin.sha256.toLowerCase()) {
        throw new Error(
          `Checksum mismatch for downloaded asset ${plugin.releaseArtifact}. Expected ${plugin.sha256}, got ${downloadedSha256}.`
        );
      }

      writeFileSync(destination, buffer);
      return {
        id: plugin.id,
        installed: true,
        method: "download",
        path: destination,
        sha256: downloadedSha256,
      };
    }
  } catch (error) {
    // If build was explicitly disabled, do not attempt build fallback
    if (options.build === false) {
      throw error;
    }
    // Fallback to local Docker build
  }

  return runBuildAndInstall(plugin, destination, options);
}

async function runBuildAndInstall(
  plugin: PluginManifest,
  destination: string,
  options: InstallPluginOptions
): Promise<InstallPluginResult> {
  if (options.runBuild) {
    await options.runBuild(plugin, destination);
    const builtSha256 = computeFileSha256(destination);
    return {
      id: plugin.id,
      installed: true,
      method: "build",
      path: destination,
      sha256: builtSha256,
    };
  }

  const rootDir = options.sourceRootDir ?? resolvePackageRoot(options.cwd);
  const pluginSourceDir = join(rootDir, plugin.sourceDir);

  if (!existsSync(pluginSourceDir)) {
    throw new Error(
      `Plugin source directory not found at ${pluginSourceDir}. Ensure pi-kit source tree is available to build locally.`
    );
  }

  const outputArtifact = `${plugin.id}-linux-amd64-build.so`;
  const builtOutput = join(pluginSourceDir, outputArtifact);

  await executeDockerBuild(pluginSourceDir, outputArtifact);

  if (!existsSync(builtOutput)) {
    throw new Error(`Docker build completed but artifact was not found at ${builtOutput}`);
  }

  try {
    const builtSha256 = computeFileSha256(builtOutput);
    if (builtSha256.toLowerCase() !== plugin.sha256.toLowerCase()) {
      throw new Error(
        `Built artifact checksum mismatch. Expected ${plugin.sha256}, got ${builtSha256}.`
      );
    }

    const binary = readFileSync(builtOutput);
    writeFileSync(destination, binary);

    return {
      id: plugin.id,
      installed: true,
      method: "build",
      path: destination,
      sha256: builtSha256,
    };
  } finally {
    rmSync(builtOutput, { force: true });
    const headerPath = builtOutput.replace(/\.so$/, ".h");
    rmSync(headerPath, { force: true });
  }
}

function resolvePackageRoot(cwd?: string): string {
  let current = cwd ? resolve(cwd) : process.cwd();
  for (let i = 0; i < 5; i++) {
    if (existsSync(join(current, "package.json")) && existsSync(join(current, "profiles", "cliproxyapi"))) {
      return current;
    }
    const parent = resolve(current, "..");
    if (parent === current) break;
    current = parent;
  }
  return cwd ? resolve(cwd) : process.cwd();
}

async function executeDockerBuild(sourceDir: string, outputName: string): Promise<void> {
  const normalizedSource = sourceDir.replace(/\\/g, "/");
  const headerName = outputName.replace(/\.so$/, ".h");
  const command = `CGO_ENABLED=1 GOOS=linux GOARCH=amd64 /usr/local/go/bin/go build -buildmode=c-shared -trimpath -o '/src/${outputName}' . && rm -f '/src/${headerName}'`;

  return new Promise((resolvePromise, rejectPromise) => {
    const child = spawn(
      "docker",
      [
        "run",
        "--rm",
        "--platform",
        "linux/amd64",
        "-v",
        `${normalizedSource}:/src`,
        "-w",
        "/src",
        "golang:1.26",
        "sh",
        "-c",
        command,
      ],
      {
        stdio: ["ignore", "pipe", "pipe"],
        env: { ...process.env, MSYS_NO_PATHCONV: "1" },
      }
    );

    let stderr = "";
    child.stderr?.on("data", (chunk: Buffer) => {
      stderr += chunk.toString();
    });

    child.once("error", (err) => {
      rejectPromise(new Error(`Docker build execution failed: ${err.message}`));
    });

    child.once("close", (code) => {
      if (code === 0) {
        resolvePromise();
      } else {
        rejectPromise(new Error(`Docker build failed with exit code ${code}:\n${stderr}`));
      }
    });
  });
}

export function uninstallPlugin(
  pluginId: string,
  options: PluginLocationOptions = {}
): UninstallPluginResult {
  const plugin = MANAGED_PLUGINS[pluginId];
  if (!plugin) {
    throw new Error(`Unknown plugin: ${pluginId}. Supported plugins: ${Object.keys(MANAGED_PLUGINS).join(", ")}`);
  }

  const pluginDir = resolveCLIProxyPluginDirectory(options);
  const destination = join(pluginDir, plugin.binaryName);

  if (!existsSync(destination)) {
    return {
      id: plugin.id,
      uninstalled: false,
      path: destination,
    };
  }

  unlinkSync(destination);
  return {
    id: plugin.id,
    uninstalled: true,
    path: destination,
  };
}
