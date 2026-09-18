import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const PACKAGE_NAME = "@benjamolina/pi-kit";
const REPOSITORY_URL = "git+https://github.com/BenjaMolina/pi-kit.git";
const STABLE_SEMVER = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/;

type Manifest = {
  name?: unknown;
  version?: unknown;
  main?: unknown;
  exports?: unknown;
  bin?: unknown;
  private?: unknown;
  publishConfig?: unknown;
  repository?: unknown;
};

type Lockfile = { packages?: Record<string, Manifest> };

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

export function assertReleaseManifest(manifest: Manifest, lockfile: Lockfile, tag?: string): void {
  assert(manifest.name === PACKAGE_NAME, `package name must be ${PACKAGE_NAME}`);
  assert(typeof manifest.version === "string" && STABLE_SEMVER.test(manifest.version), "package version must be stable semver");
  assert(manifest.private === false, "package must set private to false");
  assert(manifest.main === "./opencode/cliproxyapi.ts", "main must target the external OpenCode plugin");
  assert(manifest.exports === "./opencode/cliproxyapi.ts", "exports must target the external OpenCode plugin");
  assert(typeof manifest.bin === "object" && manifest.bin !== null && !Array.isArray(manifest.bin)
    && Object.keys(manifest.bin).length === 1
    && (manifest.bin as Record<string, unknown>)["pi-kit-codex"] === "./bin/pi-kit-codex.ts",
  "bin must contain exactly pi-kit-codex targeting ./bin/pi-kit-codex.ts");
  assert(typeof manifest.publishConfig === "object" && manifest.publishConfig !== null
    && (manifest.publishConfig as { access?: unknown }).access === "public", "publishConfig.access must be public");
  assert(typeof manifest.repository === "object" && manifest.repository !== null
    && (manifest.repository as { type?: unknown }).type === "git"
    && (manifest.repository as { url?: unknown }).url === REPOSITORY_URL, "repository metadata must target BenjaMolina/pi-kit");

  const locked = lockfile.packages?.[""];
  assert(locked?.name === PACKAGE_NAME && locked.version === manifest.version, "package-lock root must match package name and version");
  if (tag !== undefined) assert(tag === `v${manifest.version}`, `tag ${tag} must equal v${manifest.version}`);
}

if (import.meta.main) {
  const root = process.cwd();
  const manifest = JSON.parse(readFileSync(resolve(root, "package.json"), "utf8")) as Manifest;
  const lockfile = JSON.parse(readFileSync(resolve(root, "package-lock.json"), "utf8")) as Lockfile;
  assertReleaseManifest(manifest, lockfile, process.env.RELEASE_TAG);
  console.log(`Validated ${PACKAGE_NAME}@${manifest.version}`);
}
