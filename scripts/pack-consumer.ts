import { execFileSync } from "node:child_process";
import { existsSync, mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

const ROOT = process.cwd();
type PackageManifest = { name: string; version: string };

function currentPackageIdentity(): PackageManifest {
  const manifest = JSON.parse(readFileSync(join(ROOT, "package.json"), "utf8")) as Partial<PackageManifest>;
  assert(typeof manifest.name === "string" && manifest.name.length > 0, "package.json must define a package name");
  assert(typeof manifest.version === "string" && manifest.version.length > 0, "package.json must define a package version");
  return { name: manifest.name, version: manifest.version };
}

export const packageIdentity = currentPackageIdentity();
const { name: PACKAGE_NAME, version: PACKAGE_VERSION } = packageIdentity;
const PI_VERSION = "0.85.1";
const OPENCODE_VERSION = "1.18.18";
const TOML_PACKAGE_NAME = "@iarna/toml";
const TOML_VERSION = "2.2.5";
const TOML_INTEGRITY = "sha512-trnsAYxU3xnS1gPHPyU961coFyLkh4gAD/0zQ5mymY4yOZ+CYvsPqUbOFSw0aDM4y0tV7tiFxL/1XfXPNC6IPg==";
const OPENCODE_BIN = process.platform === "win32"
  ? join(ROOT, "node_modules", ".bin", "opencode.cmd")
  : join(ROOT, "node_modules", ".bin", "opencode");
const REQUIRED_FILES = [
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

type PackedFile = { path: string };
type PackedArchive = { filename: string; size: number; unpackedSize: number; files: PackedFile[] };
type RegistryRequest = { method: string; path: string };
type RegistryMock = { url: string; requests: RegistryRequest[]; stop(): void };

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

function run(command: string, args: string[], cwd = ROOT, env?: Record<string, string>): string {
  const executable = command === "npm" && process.platform === "win32" ? "cmd.exe" : command;
  const commandArgs = command === "npm" && process.platform === "win32" ? ["/d", "/s", "/c", "npm.cmd", ...args] : args;
  return execFileSync(executable, commandArgs, {
    cwd,
    env: { ...process.env, ...env },
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  });
}

async function runCommand(command: string[], cwd: string, env: Record<string, string>): Promise<string> {
  const child = Bun.spawn(command, { cwd, env: { ...process.env, ...env }, stdout: "pipe", stderr: "pipe" });
  const [stdout, stderr, exitCode] = await Promise.all([new Response(child.stdout).text(), new Response(child.stderr).text(), child.exited]);
  const output = `${stdout}\n${stderr}`;
  assert(exitCode === 0, `${command.join(" ")} failed with ${exitCode}:\n${output}`);
  return output;
}

async function runNpmCommand(args: string[], cwd: string, env: Record<string, string>): Promise<string> {
  const command = process.platform === "win32" ? ["cmd.exe", "/d", "/s", "/c", "npm.cmd", ...args] : ["npm", ...args];
  return runCommand(command, cwd, env);
}

function pack(destination: string): PackedArchive {
  const output = run("npm", ["pack", ".", "--ignore-scripts", "--json", `--pack-destination=${resolve(destination)}`]);
  const archive = JSON.parse(output) as PackedArchive[];
  assert(archive.length === 1, "npm pack must produce exactly one archive");
  return archive[0];
}

export function assertArchiveContents(archive: PackedArchive): void {
  const paths = archive.files.map((file) => file.path);
  for (const required of REQUIRED_FILES) assert(paths.includes(required), `archive omits ${required}`);
  for (const path of paths) {
    assert(!/(^|\/)(?:tests?|\.github|\.git|node_modules|coverage|\.cache)(?:\/|$)/.test(path), `archive includes repository-only path ${path}`);
    assert(!/(^|\/)(?:\.env(?:\.|$)|[^/]+\.(?:tgz|log))$/.test(path), `archive includes secret or local artifact ${path}`);
    assert(!/^[A-Za-z]:[\\/]|^\//.test(path), `archive includes local absolute path ${path}`);
  }
}

function packageDirectory(consumer: string): string {
  return join(consumer, "node_modules", "@benjamolina", "pi-kit");
}

function cachedNpmArchive(integrity: string): string {
  const [algorithm, digest] = integrity.split("-", 2);
  assert(algorithm === "sha512" && digest, `unsupported npm cache integrity ${integrity}`);
  const hex = Buffer.from(digest, "base64").toString("hex");
  const cache = process.env.NPM_CONFIG_CACHE ?? process.env.npm_config_cache
    ?? join(process.env.LOCALAPPDATA ?? process.env.APPDATA ?? process.env.HOME ?? tmpdir(), "npm-cache");
  const archive = join(cache, "_cacache", "content-v2", algorithm, hex.slice(0, 2), hex.slice(2, 4), hex.slice(4));
  assert(existsSync(archive), `npm cache lacks ${TOML_PACKAGE_NAME}@${TOML_VERSION}; run npm ci before the pack test`);
  return archive;
}

function isolatedEnvironment(home: string, registryUrl: string, extra: Record<string, string> = {}): Record<string, string> {
  return {
    HOME: home,
    USERPROFILE: home,
    APPDATA: join(home, "AppData", "Roaming"),
    LOCALAPPDATA: join(home, "AppData", "Local"),
    XDG_CONFIG_HOME: join(home, ".config"),
    XDG_CACHE_HOME: join(home, ".cache"),
    XDG_DATA_HOME: join(home, ".local", "share"),
    NPM_CONFIG_CACHE: join(home, ".npm-cache"),
    NPM_CONFIG_USERCONFIG: join(home, ".npmrc"),
    NPM_CONFIG_REGISTRY: registryUrl,
    ...extra,
  };
}

function createRegistryMock(archivePath: string, tomlArchivePath?: string): RegistryMock {
  const requests: RegistryRequest[] = [];
  const server = Bun.serve({
    port: 0,
    fetch(request) {
      const url = new URL(request.url);
      requests.push({ method: request.method, path: url.pathname });
      if (url.pathname === "/v1/models") {
        return Response.json({ models: [{ slug: "mock-cli-proxy-model", display_name: "Mock CLIProxyAPI Model" }] });
      }
      const packageName = decodeURIComponent(url.pathname).replace(/^\//, "");
      if (packageName === PACKAGE_NAME) {
        return Response.json({
          name: PACKAGE_NAME,
          "dist-tags": { latest: PACKAGE_VERSION },
          versions: {
            [PACKAGE_VERSION]: {
              name: PACKAGE_NAME,
              version: PACKAGE_VERSION,
              dist: { tarball: `http://127.0.0.1:${server.port}/tarballs/pi-kit-${PACKAGE_VERSION}.tgz` },
            },
          },
        });
      }
      if (packageName === TOML_PACKAGE_NAME && tomlArchivePath) {
        return Response.json({
          name: TOML_PACKAGE_NAME,
          "dist-tags": { latest: TOML_VERSION },
          versions: {
            [TOML_VERSION]: {
              name: TOML_PACKAGE_NAME,
              version: TOML_VERSION,
              dist: { tarball: `http://127.0.0.1:${server.port}/tarballs/iarna-toml-${TOML_VERSION}.tgz` },
            },
          },
        });
      }
      if (url.pathname === `/tarballs/pi-kit-${PACKAGE_VERSION}.tgz`) {
        return new Response(readFileSync(archivePath), { headers: { "content-type": "application/octet-stream" } });
      }
      if (url.pathname === `/tarballs/iarna-toml-${TOML_VERSION}.tgz` && tomlArchivePath) {
        return new Response(readFileSync(tomlArchivePath), { headers: { "content-type": "application/octet-stream" } });
      }
      return new Response("not found", { status: 404 });
    },
  });
  return { url: `http://127.0.0.1:${server.port}/`, requests, stop: () => server.stop(true) };
}

function assertRegistryResolution(requests: RegistryRequest[], consumerName: string): void {
  const packageMetadataRequested = requests.some((request) => decodeURIComponent(request.path).replace(/^\//, "") === PACKAGE_NAME);
  const tarballPath = `/tarballs/pi-kit-${PACKAGE_VERSION}.tgz`;
  assert(packageMetadataRequested, `${consumerName} did not request encoded package metadata for ${PACKAGE_NAME} from the registry mock`);
  assert(requests.some((request) => request.path === tarballPath), `${consumerName} did not request ${tarballPath} from the registry mock`);
  console.log(`${consumerName} registry requests: ${requests.map((request) => `${request.method} ${request.path}`).join(", ")}`);
}

async function verifyPiConsumer(consumer: string, registry: RegistryMock): Promise<void> {
  const home = join(consumer, "home");
  const project = join(consumer, "project");
  mkdirSync(home, { recursive: true });
  mkdirSync(project, { recursive: true });
  writeFileSync(join(home, ".npmrc"), `@benjamolina:registry=${registry.url}\n`);
  writeFileSync(join(project, "package.json"), JSON.stringify({ private: true, name: "pi-pack-consumer" }));
  const environment = isolatedEnvironment(home, registry.url, {
    CLIPROXYAPI_API_KEY: "pack-consumer-key",
    CLIPROXYAPI_BASE_URL: `${registry.url}v1`,
  });

  await runCommand(["pi", "install", "--local", "--approve", `npm:${PACKAGE_NAME}@${PACKAGE_VERSION}`], project, environment);
  const packageDir = join(project, ".pi", "npm", "node_modules", "@benjamolina", "pi-kit");
  assert(existsSync(join(packageDir, "package.json")), "Pi did not install the named packed package into its project package manager");
  const listed = await runCommand(["pi", "list", "--approve"], project, environment);
  assert(listed.includes(PACKAGE_NAME), `Pi ${PI_VERSION} did not list the installed package:\n${listed}`);
  assertRegistryResolution(registry.requests, "Pi");
}

async function verifyCodexConsumer(consumer: string, archivePath: string, registry: RegistryMock): Promise<void> {
  const home = join(consumer, "home");
  const codexHome = join(consumer, "codex-home");
  mkdirSync(home, { recursive: true });
  writeFileSync(join(consumer, "package.json"), JSON.stringify({ private: true, name: "codex-pack-consumer" }));
  const environment = isolatedEnvironment(home, registry.url, {
    CODEX_HOME: codexHome,
    CLIPROXYAPI_API_KEY: "pack-consumer-fake-key",
    CLIPROXYAPI_BASE_URL: "http://127.0.0.1:9/v1",
  });

  await runNpmCommand(["install", "--ignore-scripts", "--legacy-peer-deps", archivePath], consumer, environment);
  const packageDir = packageDirectory(consumer);
  assert(existsSync(join(packageDir, "package.json")), "npm did not install the packed package into the isolated consumer");
  const bin = join(consumer, "node_modules", ".bin", process.platform === "win32" ? "pi-kit-codex.cmd" : "pi-kit-codex");
  assert(existsSync(bin), "npm did not expose the pi-kit-codex package bin");

  const help = await runCommand([bin, "--help"], consumer, environment);
  assert(help.includes("Usage: pi-kit-codex"), `packaged pi-kit-codex --help did not print usage:\n${help}`);
  await runCommand([bin, "install"], consumer, environment);
  const installed = readFileSync(join(codexHome, "config.toml"), "utf8");
  assert(installed.includes("pi-kit Codex CLIProxyAPI v1 root") && installed.includes("pi-kit Codex CLIProxyAPI v1 provider"),
    "packaged pi-kit-codex install did not write managed configuration");
  await runCommand([bin, "uninstall"], consumer, environment);
  const uninstalled = readFileSync(join(codexHome, "config.toml"), "utf8");
  assert(!uninstalled.includes("pi-kit Codex CLIProxyAPI v1"), "packaged pi-kit-codex uninstall left managed configuration behind");
  const tomlMetadataRequested = registry.requests.some((request) => decodeURIComponent(request.path).replace(/^\//, "") === TOML_PACKAGE_NAME);
  assert(tomlMetadataRequested && registry.requests.some((request) => request.path === `/tarballs/iarna-toml-${TOML_VERSION}.tgz`),
    "Codex consumer did not resolve its runtime dependency from the isolated registry mock");
}

async function verifyOpenCodeConsumer(consumer: string, registry: RegistryMock): Promise<void> {
  const home = join(consumer, "home");
  const configDir = join(home, ".config", "opencode");
  mkdirSync(configDir, { recursive: true });
  writeFileSync(join(home, ".npmrc"), `@benjamolina:registry=${registry.url}\n`);
  await Bun.write(join(configDir, "opencode.json"), JSON.stringify({ plugin: [`${PACKAGE_NAME}@${PACKAGE_VERSION}`] }));

  assert(existsSync(OPENCODE_BIN), `OpenCode ${OPENCODE_VERSION} binary is missing; run npm ci first`);
  const output = await runCommand([OPENCODE_BIN, "models", "cliproxyapi"], consumer, isolatedEnvironment(home, registry.url, {
    CLIPROXYAPI_API_KEY: "pack-consumer-key",
    CLIPROXYAPI_BASE_URL: `${registry.url}v1`,
  }));
  assert(output.includes("mock-cli-proxy-model"), `OpenCode ${OPENCODE_VERSION} did not list the mock model:\n${output}`);
  assertRegistryResolution(registry.requests, "OpenCode");
}

async function main(): Promise<void> {
  const temporary = mkdtempSync(join(tmpdir(), "pi-kit-pack-"));
  try {
    const archive = pack(temporary);
    assertArchiveContents(archive);
    const archivePath = join(temporary, archive.filename);
    const tomlArchivePath = cachedNpmArchive(TOML_INTEGRITY);
    const piConsumer = join(temporary, "pi-consumer");
    const openCodeConsumer = join(temporary, "opencode-consumer");
    const codexConsumer = join(temporary, "codex-consumer");
    mkdirSync(piConsumer);
    mkdirSync(openCodeConsumer);
    mkdirSync(codexConsumer);

    const piRegistry = createRegistryMock(archivePath);
    try {
      await verifyPiConsumer(piConsumer, piRegistry);
    } finally {
      piRegistry.stop();
    }

    const openCodeRegistry = createRegistryMock(archivePath);
    try {
      await verifyOpenCodeConsumer(openCodeConsumer, openCodeRegistry);
    } finally {
      openCodeRegistry.stop();
    }

    const codexRegistry = createRegistryMock(archivePath, tomlArchivePath);
    try {
      await verifyCodexConsumer(codexConsumer, archivePath, codexRegistry);
    } finally {
      codexRegistry.stop();
    }

    console.log(`Packed ${archive.filename}: ${archive.size} bytes compressed, ${archive.unpackedSize} bytes unpacked`);
    console.log(`Clean Pi ${PI_VERSION}, OpenCode ${OPENCODE_VERSION}, and Codex consumers resolved ${PACKAGE_NAME}@${PACKAGE_VERSION}`);
  } finally {
    rmSync(temporary, { recursive: true, force: true });
  }
}

if (import.meta.main) await main();
