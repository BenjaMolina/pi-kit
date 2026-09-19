import { describe, expect, test } from "bun:test";
import crypto from "node:crypto";
import {
  decryptChromiumPayload,
  encryptChromiumPayload,
  hasVSCodeSecret,
  injectVSCodeSecret,
  resolveVSCodeLocalStatePath,
  resolveVSCodeStateDbPath,
  type SecretStorageOptions,
} from "../src/copilot/secret-storage";

describe("VS Code SecretStorage management", () => {
  const TEST_AES_KEY = crypto.randomBytes(32);
  const TEST_API_KEY = "api-test-credential-123456789";
  const TEST_SECRET_ID = "pi-kit-cliproxyapi-api-key";

  test("resolves Windows local state and state.vscdb paths", () => {
    const options: SecretStorageOptions = {
      env: { APPDATA: "C:\\Users\\tester\\AppData\\Roaming" },
      platform: "win32",
    };
    expect(resolveVSCodeLocalStatePath(options).replaceAll("\\", "/")).toBe("C:/Users/tester/AppData/Roaming/Code/Local State");
    expect(resolveVSCodeStateDbPath(options).replaceAll("\\", "/")).toBe("C:/Users/tester/AppData/Roaming/Code/User/globalStorage/state.vscdb");
  });

  test("encrypts and decrypts payload matching Chromium OSCrypt v10 format", () => {
    const nonce = crypto.randomBytes(12);
    const serialized = encryptChromiumPayload(TEST_API_KEY, TEST_AES_KEY, nonce);
    const parsed = JSON.parse(serialized);
    expect(parsed.type).toBe("Buffer");
    expect(Array.isArray(parsed.data)).toBe(true);

    const raw = Buffer.from(parsed.data);
    expect(raw.subarray(0, 3).toString("utf8")).toBe("v10");
    expect(raw.subarray(3, 15)).toEqual(nonce);

    const decrypted = decryptChromiumPayload(raw, TEST_AES_KEY);
    expect(decrypted).toBe(TEST_API_KEY);
  });

  test("injects secret into mock SQLite storage and verifies existence", async () => {
    const storage = new Map<string, string>();
    const options: SecretStorageOptions = {
      platform: "win32",
      decryptDPAPI: async () => TEST_AES_KEY,
      localStateContent: JSON.stringify({
        os_crypt: {
          encrypted_key: Buffer.concat([Buffer.from("DPAPI"), crypto.randomBytes(64)]).toString("base64"),
        },
      }),
      sqliteRun: async (_dbPath, _sql, params) => {
        const [key, value] = params as [string, string];
        storage.set(key, value);
      },
      sqliteGet: async (_dbPath, _sql, params) => {
        const [key] = params as [string];
        const value = storage.get(key);
        return value !== undefined ? { key, value } : undefined;
      },
    };

    expect(await hasVSCodeSecret(TEST_SECRET_ID, options)).toBe(false);

    const changed = await injectVSCodeSecret(TEST_SECRET_ID, TEST_API_KEY, options);
    expect(changed).toBe(true);
    expect(storage.has(`secret://${TEST_SECRET_ID}`)).toBe(true);

    const storedJson = storage.get(`secret://${TEST_SECRET_ID}`)!;
    const parsed = JSON.parse(storedJson);
    const decrypted = decryptChromiumPayload(Buffer.from(parsed.data), TEST_AES_KEY);
    expect(decrypted).toBe(TEST_API_KEY);

    expect(await hasVSCodeSecret(TEST_SECRET_ID, options)).toBe(true);
  });

  test("skips non-windows platforms gracefully unless explicit mock is provided", async () => {
    const options: SecretStorageOptions = {
      platform: "linux",
    };
    expect(await injectVSCodeSecret(TEST_SECRET_ID, TEST_API_KEY, options)).toBe(false);
    expect(await hasVSCodeSecret(TEST_SECRET_ID, options)).toBe(false);
  });
});
