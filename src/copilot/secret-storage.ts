import { execFileSync } from "node:child_process";
import crypto from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { homedir as defaultHomedir } from "node:os";
import { join } from "node:path";

export type SecretStorageOptions = {
  env?: Record<string, string | undefined>;
  homedir?: () => string;
  platform?: NodeJS.Platform;
  localStatePath?: string;
  stateDbPath?: string;
  localStateContent?: string;
  decryptDPAPI?: (blob: Buffer) => Promise<Buffer> | Buffer;
  sqliteRun?: (dbPath: string, sql: string, params: unknown[]) => Promise<void> | void;
  sqliteGet?: (dbPath: string, sql: string, params: unknown[]) => Promise<unknown> | unknown;
};

export function resolveVSCodeLocalStatePath(options: SecretStorageOptions = {}): string {
  if (options.localStatePath) return options.localStatePath;
  const env = options.env ?? process.env;
  const home = (options.homedir ?? defaultHomedir)();
  const platform = options.platform ?? process.platform;
  if (platform === "win32") {
    const root = env.APPDATA?.trim() || join(home, "AppData", "Roaming");
    return join(root, "Code", "Local State");
  }
  return join(home, ".config", "Code", "Local State");
}

export function resolveVSCodeStateDbPath(options: SecretStorageOptions = {}): string {
  if (options.stateDbPath) return options.stateDbPath;
  const env = options.env ?? process.env;
  const home = (options.homedir ?? defaultHomedir)();
  const platform = options.platform ?? process.platform;
  if (platform === "win32") {
    const root = env.APPDATA?.trim() || join(home, "AppData", "Roaming");
    return join(root, "Code", "User", "globalStorage", "state.vscdb");
  }
  return join(home, ".config", "Code", "User", "globalStorage", "state.vscdb");
}

export function encryptChromiumPayload(plaintext: string, aesKey: Buffer, nonceOverride?: Buffer): string {
  const nonce = nonceOverride ?? crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", aesKey, nonce);
  const ciphertext = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  const payload = Buffer.concat([Buffer.from("v10"), nonce, ciphertext, tag]);
  return JSON.stringify({ type: "Buffer", data: Array.from(payload) });
}

export function decryptChromiumPayload(rawPayload: Buffer, aesKey: Buffer): string {
  if (rawPayload.subarray(0, 3).toString("utf8") !== "v10") {
    throw new Error("Unsupported Chromium payload format: missing v10 prefix");
  }
  const nonce = rawPayload.subarray(3, 15);
  const ciphertextAndTag = rawPayload.subarray(15);
  const ciphertext = ciphertextAndTag.subarray(0, ciphertextAndTag.length - 16);
  const tag = ciphertextAndTag.subarray(ciphertextAndTag.length - 16);

  const decipher = crypto.createDecipheriv("aes-256-gcm", aesKey, nonce);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString("utf8");
}

async function runSqlite(dbPath: string, sql: string, params: unknown[], options: SecretStorageOptions): Promise<void> {
  if (options.sqliteRun) {
    await options.sqliteRun(dbPath, sql, params);
    return;
  }
  await executeDefaultSqlite(dbPath, sql, params, false);
}

async function getSqlite(dbPath: string, sql: string, params: unknown[], options: SecretStorageOptions): Promise<unknown> {
  if (options.sqliteGet) {
    return await options.sqliteGet(dbPath, sql, params);
  }
  return await executeDefaultSqlite(dbPath, sql, params, true);
}

async function executeDefaultSqlite(dbPath: string, sql: string, params: unknown[], isQuery: boolean): Promise<unknown> {
  // Try bun:sqlite
  try {
    const { Database } = await import("bun:sqlite" as string);
    const db = new Database(dbPath);
    try {
      if (isQuery) {
        return (db.query(sql) as { get: (...args: unknown[]) => unknown }).get(...params);
      }
      db.run(sql, params as unknown[]);
      return undefined;
    } finally {
      db.close();
    }
  } catch {}

  // Try node:sqlite
  try {
    const { DatabaseSync } = await import("node:sqlite" as string);
    const db = new DatabaseSync(dbPath);
    try {
      if (isQuery) {
        return (db.prepare(sql) as { get: (...args: unknown[]) => unknown }).get(...params);
      }
      (db.prepare(sql) as { run: (...args: unknown[]) => unknown }).run(...params);
      return undefined;
    } finally {
      db.close();
    }
  } catch {}

  throw new Error("No supported SQLite engine (bun:sqlite or node:sqlite) found.");
}

function defaultDecryptDPAPI(rawBlob: Buffer): Buffer {
  const b64 = rawBlob.toString("base64");
  const script = `Add-Type -AssemblyName System.Security; [Convert]::ToBase64String([System.Security.Cryptography.ProtectedData]::Unprotect([Convert]::FromBase64String('${b64}'), $null, [System.Security.Cryptography.DataProtectionScope]::CurrentUser))`;
  const result = execFileSync("powershell.exe", ["-NoProfile", "-NonInteractive", "-Command", script], { encoding: "utf8" }).trim();
  return Buffer.from(result, "base64");
}

export async function hasVSCodeSecret(secretKey: string, options: SecretStorageOptions = {}): Promise<boolean> {
  const platform = options.platform ?? process.platform;
  if (platform !== "win32" && !options.sqliteGet) return false;

  const dbPath = resolveVSCodeStateDbPath(options);
  if (!options.sqliteGet && !existsSync(dbPath)) return false;

  try {
    const row = await getSqlite(dbPath, "SELECT key FROM ItemTable WHERE key = ? LIMIT 1", [`secret://${secretKey}`], options);
    return Boolean(row);
  } catch {
    return false;
  }
}

export async function injectVSCodeSecret(secretKey: string, secretValue: string, options: SecretStorageOptions = {}): Promise<boolean> {
  const platform = options.platform ?? process.platform;
  if (platform !== "win32" && !options.decryptDPAPI) return false;

  const localStatePath = resolveVSCodeLocalStatePath(options);
  let localStateText: string | undefined = options.localStateContent;
  if (localStateText === undefined) {
    if (!existsSync(localStatePath)) return false;
    localStateText = readFileSync(localStatePath, "utf8");
  }

  let encryptedKeyB64: string | undefined;
  try {
    const parsed = JSON.parse(localStateText);
    encryptedKeyB64 = parsed?.os_crypt?.encrypted_key;
  } catch {
    return false;
  }

  if (!encryptedKeyB64) return false;

  const rawEncryptedKey = Buffer.from(encryptedKeyB64, "base64");
  // Check DPAPI prefix (5 bytes: 'DPAPI')
  if (rawEncryptedKey.subarray(0, 5).toString("utf8") !== "DPAPI") return false;

  const dpapiBlob = rawEncryptedKey.subarray(5);
  const decrypt = options.decryptDPAPI ?? defaultDecryptDPAPI;
  const aesKey = await decrypt(dpapiBlob);
  if (!aesKey || aesKey.length !== 32) return false;

  const payloadJson = encryptChromiumPayload(secretValue, aesKey);
  const dbPath = resolveVSCodeStateDbPath(options);
  if (!options.sqliteRun && !existsSync(dbPath)) return false;

  try {
    await runSqlite(
      dbPath,
      "INSERT OR REPLACE INTO ItemTable (key, value) VALUES (?, ?)",
      [`secret://${secretKey}`, payloadJson],
      options,
    );
    return true;
  } catch {
    return false;
  }
}
