import { execFileSync } from "node:child_process";
import { existsSync, mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";

const ROOT = process.cwd();
const PACKAGE_NAME = "@benjamolina/pi-kit";
const PACKAGE_VERSION = "0.3.1";
const PI_VERSION = "0.85.1";
const OPENCODE_VERSION = "1.18.18";
const REQUIRED_FILES = [
  "LICENSE",
  "README.md",
  "package.json",
  "extensions/cliproxyapi-dynamic-provider.ts",
  "opencode/cliproxyapi.ts",
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
  const npmCli = process.env.npm_execpath ?? join(dirname(process.execPath), "node_modules", "npm", "bin", "npm-cli.js");
  const isNpm = command === "npm";
  assert(!isNpm || npmCli, "npm_execpath is required to invoke npm safely from the pack harness");
  const executable = isNpm ? (process.platform === "win32" ? "node.exe" : process.execPath) : command;
  return execFileSync(executable, isNpm ? [npmCli!, ...args] : args, {
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

function pack(destination: string): PackedArchive {
  const output = run("npm", ["pack", "--json", `--pack-destination=${resolve(destination)}`]);
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

function createRegistryMock(archivePath: string): RegistryMock {
  const requests: RegistryRequest[] = [];
  const server = Bun.serve({
    port: 0,
    fetch(request) {
      const url = new URL(request.url);
      requests.push({ method: request.method, path: url.pathname });
      if (url.pathname === "/v1/models") {
        return Response.json({ models: [{ slug: "mock-cli-proxy-model", display_name: "Mock CLIProxyAPI Model" }] });
      }
      if (decodeURIComponent(url.pathname).replace(/^\//, "") === PACKAGE_NAME) {
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
      if (url.pathname === `/tarballs/pi-kit-${PACKAGE_VERSION}.tgz`) {
        return new Response(readFileSync(archivePath), { headers: { "content-type": "application/octet-stream" } });
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

async function verifyOpenCodeConsumer(consumer: string, registry: RegistryMock): Promise<void> {
  const home = join(consumer, "home");
  const configDir = join(home, ".config", "opencode");
  mkdirSync(configDir, { recursive: true });
  writeFileSync(join(home, ".npmrc"), `@benjamolina:registry=${registry.url}\n`);
  await Bun.write(join(configDir, "opencode.json"), JSON.stringify({ plugin: [`${PACKAGE_NAME}@${PACKAGE_VERSION}`] }));

  const output = await runCommand(["opencode", "models", "cliproxyapi"], consumer, isolatedEnvironment(home, registry.url, {
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
    const piConsumer = join(temporary, "pi-consumer");
    const openCodeConsumer = join(temporary, "opencode-consumer");
    mkdirSync(piConsumer);
    mkdirSync(openCodeConsumer);

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

    console.log(`Packed ${archive.filename}: ${archive.size} bytes compressed, ${archive.unpackedSize} bytes unpacked`);
    console.log(`Clean Pi ${PI_VERSION} and OpenCode ${OPENCODE_VERSION} consumers resolved ${PACKAGE_NAME}@${PACKAGE_VERSION}`);
  } finally {
    rmSync(temporary, { recursive: true, force: true });
  }
}

if (import.meta.main) await main();
