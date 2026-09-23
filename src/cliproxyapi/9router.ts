import type { CLIProxyFetch } from "./discovery";

export const NINEROUTER_DEFAULT_BASE_URL = "http://127.0.0.1:20128/v1";
const MAX_MODELS = 256;
const MAX_BODY_BYTES = 1_000_000;
const TIMEOUT_MS = 3_000;

export function resolveNineRouterBaseUrl(value?: string): string {
  const url = new URL(value?.trim() || NINEROUTER_DEFAULT_BASE_URL);
  if (!(["http:", "https:"].includes(url.protocol)) || url.username || url.password || url.search || url.hash) {
    throw new Error("Invalid 9Router endpoint");
  }
  return url.toString().replace(/\/+$/, "");
}

export async function discoverNineRouterModels(baseUrl: string, apiKey: string, fetchModels: CLIProxyFetch): Promise<Record<string, unknown>> {
  const response = await fetchModels(`${baseUrl}/models`, {
    headers: { Authorization: `Bearer ${apiKey}` },
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });
  if (!response.ok) throw new Error("9Router catalog unavailable");
  const declaredSize = Number(response.headers.get("content-length"));
  if (declaredSize > MAX_BODY_BYTES) throw new Error("9Router catalog too large");
  const reader = response.body?.getReader();
  if (!reader) throw new Error("9Router catalog has no body");
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > MAX_BODY_BYTES) throw new Error("9Router catalog too large");
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }
  const bytes = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.length; }
  const payload: unknown = JSON.parse(new TextDecoder().decode(bytes));
  if (!payload || typeof payload !== "object" || !Array.isArray((payload as { data?: unknown }).data)) {
    throw new Error("Invalid 9Router catalog");
  }
  const data = (payload as { data: unknown[] }).data;
  if (data.length === 0 || data.length > MAX_MODELS) throw new Error("Invalid 9Router catalog size");
  const models: Record<string, unknown> = Object.create(null);
  for (const entry of data) {
    const id = entry && typeof entry === "object" ? (entry as { id?: unknown }).id : undefined;
    if (typeof id !== "string" || id.length > 200 || !/^[A-Za-z0-9][A-Za-z0-9._:/-]*$/.test(id) || ["__proto__", "prototype", "constructor"].includes(id) || Object.hasOwn(models, id)) {
      throw new Error("Invalid 9Router model ID");
    }
    models[id] = {
      name: id,
      limit: { context: 32_000, output: 4_096 },
      modalities: { input: ["text"], output: ["text"] },
    };
  }
  return models;
}
