import type { CLIProxyFetch } from "./discovery";

export { toPiModelFrom9Router, type NineRouterPiModel } from "./pi-9router";

export const NINEROUTER_DEFAULT_BASE_URL = "http://127.0.0.1:20128/v1";
export const MAX_NINEROUTER_MODELS = 256;
const MAX_MODELS = MAX_NINEROUTER_MODELS;
const MAX_BODY_BYTES = 1_000_000;
const MODELS_DEV_MAX_BODY_BYTES = 10_000_000;
const MODELS_DEV_TIMEOUT_MS = 3_000;
const MODELS_DEV_TTL_MS = 60 * 60 * 1_000;
const TIMEOUT_MS = 3_000;
const DEFAULT_CONTEXT = 32_000;
const DEFAULT_OUTPUT = 4_096;
const MAX_CONTEXT = 1_048_576;
const MAX_OUTPUT = 65_536;
const VALID_MODEL_ID = /^[A-Za-z0-9][A-Za-z0-9._:/-]*(?:\[1m\])?$/;

export type OpenCodeModelLimits = { context?: number; output?: number };

const modelsDevCache = new WeakMap<CLIProxyFetch, { expiresAt: number; models: Map<string, OpenCodeModelLimits> }>();
const modelsDevInFlight = new WeakMap<CLIProxyFetch, Promise<Map<string, OpenCodeModelLimits>>>();

export async function discoverOpenCodeModelLimits(
  fetchModels: CLIProxyFetch = globalThis.fetch,
): Promise<Map<string, OpenCodeModelLimits>> {
  const cached = modelsDevCache.get(fetchModels);
  if (cached && cached.expiresAt > Date.now()) return cached.models;
  const pending = modelsDevInFlight.get(fetchModels);
  if (pending) return pending;
  const request = (async () => {
    const controller = new AbortController();
    let timeout: ReturnType<typeof setTimeout> | undefined;
    const work = (async () => {
      const response = await fetchModels("https://models.dev/api.json", { signal: controller.signal });
      if (controller.signal.aborted) throw controller.signal.reason ?? new Error("models.dev request timed out");
      if (!response.ok) throw new Error("models.dev catalog unavailable");
      const declaredSize = Number(response.headers.get("content-length"));
      if (declaredSize > MODELS_DEV_MAX_BODY_BYTES) {
        await response.body?.cancel();
        throw new Error("models.dev catalog too large");
      }
      const reader = response.body?.getReader();
      if (!reader) throw new Error("models.dev catalog has no body");
      const chunks: Uint8Array[] = [];
      let size = 0;
      try {
        while (true) {
          const { done, value } = await reader.read();
          if (controller.signal.aborted) throw controller.signal.reason ?? new Error("models.dev request timed out");
          if (done) break;
          size += value.byteLength;
          if (size > MODELS_DEV_MAX_BODY_BYTES) {
            await reader.cancel();
            throw new Error("models.dev catalog too large");
          }
          chunks.push(value);
        }
      } finally { reader.releaseLock(); }
      if (controller.signal.aborted) throw controller.signal.reason ?? new Error("models.dev request timed out");
      const bytes = new Uint8Array(size);
      let offset = 0;
      for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.length; }
      if (controller.signal.aborted) throw controller.signal.reason ?? new Error("models.dev request timed out");
      const payload: unknown = JSON.parse(new TextDecoder().decode(bytes));
      if (!payload || typeof payload !== "object" || Array.isArray(payload)) throw new Error("Invalid models.dev catalog");
      const provider = (payload as Record<string, unknown>).opencode;
      const entries = provider && typeof provider === "object" && !Array.isArray(provider)
        ? (provider as Record<string, unknown>).models : undefined;
      if (!entries || typeof entries !== "object" || Array.isArray(entries)) throw new Error("Invalid models.dev OpenCode catalog");
      const limits = new Map<string, OpenCodeModelLimits>();
      for (const [id, raw] of Object.entries(entries).slice(0, MAX_MODELS * 4)) {
        if (id.length > 200 || !VALID_MODEL_ID.test(id) || ["__proto__", "prototype", "constructor"].includes(id)
          || !raw || typeof raw !== "object" || Array.isArray(raw)) continue;
        const limit = (raw as Record<string, unknown>).limit;
        if (!limit || typeof limit !== "object" || Array.isArray(limit)) continue;
        const source = limit as Record<string, unknown>;
        const safe: OpenCodeModelLimits = {};
        if (typeof source.context === "number" && Number.isSafeInteger(source.context) && source.context > 1) safe.context = Math.min(source.context, MAX_CONTEXT);
        if (typeof source.output === "number" && Number.isSafeInteger(source.output) && source.output > 0) safe.output = Math.min(source.output, MAX_OUTPUT);
        if (Object.keys(safe).length) limits.set(id, safe);
      }
      if (!controller.signal.aborted) modelsDevCache.set(fetchModels, { expiresAt: Date.now() + MODELS_DEV_TTL_MS, models: limits });
      return limits;
    })();
    const deadline = new Promise<Map<string, OpenCodeModelLimits>>((_resolve, reject) => {
      timeout = setTimeout(() => { controller.abort(); reject(new Error("models.dev request timed out")); }, MODELS_DEV_TIMEOUT_MS);
    });
    try { return await Promise.race([work, deadline]); }
    finally { clearTimeout(timeout); }
  })();
  modelsDevInFlight.set(fetchModels, request);
  try { return await request; }
  finally { if (modelsDevInFlight.get(fetchModels) === request) modelsDevInFlight.delete(fetchModels); }
}

export function mergeOpenCodeFreeModels(
  discovered: Record<string, unknown>,
  publicIds: string[],
  maximum = MAX_MODELS,
  metadata: Map<string, OpenCodeModelLimits> = new Map(),
): Record<string, unknown> {
  if (!publicIds.some((id) => id.endsWith("-free"))) return discovered;
  const publicSet = new Set(publicIds);
  for (const id of Object.keys(discovered)) {
    if (id.startsWith("oc/") && !publicSet.has(id.slice(3))) delete discovered[id];
  }
  for (const id of publicIds) {
    if (!id.endsWith("-free")) continue;
    const prefixed = `oc/${id}`;
    if (!Object.hasOwn(discovered, prefixed) && Object.keys(discovered).length < maximum) {
      const limits = metadata.get(id);
      const context = limits?.context;
      const output = limits?.output;
      discovered[prefixed] = {
        name: prefixed,
        ...(context || output ? { limit: {
          context: context ?? DEFAULT_CONTEXT,
          output: Math.min(output ?? DEFAULT_OUTPUT, (context ?? DEFAULT_CONTEXT) - 1),
        } } : {}),
      };
    }
  }
  return discovered;
}

function catalogLimit(value: unknown, fallback: number, maximum: number): number {
  return typeof value === "number" && Number.isSafeInteger(value) && value > 0
    ? Math.min(value, maximum)
    : fallback;
}

export function resolveNineRouterBaseUrl(value?: string): string {
  const url = new URL(value?.trim() || NINEROUTER_DEFAULT_BASE_URL);
  if (!(["http:", "https:"].includes(url.protocol)) || url.username || url.password || url.search || url.hash) {
    throw new Error("Invalid 9Router endpoint");
  }
  return url.toString().replace(/\/+$/, "");
}

export async function discoverOpenCodeModels(
  fetchModels: CLIProxyFetch = globalThis.fetch,
  signal?: AbortSignal,
): Promise<string[]> {
  const requestSignal = signal
    ? AbortSignal.any([signal, AbortSignal.timeout(TIMEOUT_MS)])
    : AbortSignal.timeout(TIMEOUT_MS);
  const response = await fetchModels("https://opencode.ai/zen/v1/models", { signal: requestSignal });
  if (!response.ok) throw new Error("OpenCode catalog unavailable");
  const declaredSize = Number(response.headers.get("content-length"));
  if (declaredSize > MAX_BODY_BYTES) throw new Error("OpenCode catalog too large");
  const reader = response.body?.getReader();
  if (!reader) throw new Error("OpenCode catalog has no body");
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    while (true) {
      if (requestSignal.aborted) throw requestSignal.reason ?? new Error("Request aborted");
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > MAX_BODY_BYTES) throw new Error("OpenCode catalog too large");
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
    throw new Error("Invalid OpenCode catalog");
  }
  const data = (payload as { data: unknown[] }).data;
  if (data.length === 0 || data.length > MAX_MODELS) throw new Error("Invalid OpenCode catalog size");
  const ids = new Set<string>();
  for (const entry of data) {
    const id = entry && typeof entry === "object" ? (entry as { id?: unknown }).id : undefined;
    if (typeof id === "string" && id.length <= 200 && VALID_MODEL_ID.test(id)
      && !["__proto__", "prototype", "constructor"].includes(id)) ids.add(id);
  }
  if (ids.size === 0) throw new Error("Empty OpenCode catalog");
  return [...ids];
}

export async function discoverNineRouterModels(
  baseUrl: string,
  apiKey: string,
  fetchModels: CLIProxyFetch = globalThis.fetch,
  signal?: AbortSignal,
): Promise<Record<string, unknown>> {
  const requestSignal = signal
    ? AbortSignal.any([signal, AbortSignal.timeout(TIMEOUT_MS)])
    : AbortSignal.timeout(TIMEOUT_MS);
  const response = await fetchModels(`${baseUrl}/models`, {
    headers: { Authorization: `Bearer ${apiKey}` },
    signal: requestSignal,
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
      if (requestSignal.aborted) throw requestSignal.reason ?? new Error("Request aborted");
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
    if (typeof id !== "string" || id.length > 200 || !VALID_MODEL_ID.test(id) || ["__proto__", "prototype", "constructor"].includes(id) || Object.hasOwn(models, id)) {
      throw new Error("Invalid 9Router model ID");
    }
    const metadata = entry as { context_length?: unknown; max_completion_tokens?: unknown };
    const reportedContext = catalogLimit(metadata.context_length, DEFAULT_CONTEXT, MAX_CONTEXT);
    const context = reportedContext > 1 ? reportedContext : DEFAULT_CONTEXT;
    const output = Math.min(catalogLimit(metadata.max_completion_tokens, DEFAULT_OUTPUT, MAX_OUTPUT), context - 1);
    const rawModalities = (entry as { modalities?: unknown }).modalities;
    const rawInput = rawModalities && typeof rawModalities === "object" && !Array.isArray(rawModalities)
      ? (rawModalities as { input?: unknown }).input
      : undefined;
    const inputModalities: string[] = Array.isArray(rawInput) && rawInput.length <= 16
      && rawInput.every((modality) => typeof modality === "string" && modality.length <= 32)
      && rawInput.includes("image")
      ? ["text", "image"]
      : ["text"];
    const rawCapabilities = (entry as { capabilities?: unknown }).capabilities;
    const capabilities: Record<string, unknown> = {};
    if (rawCapabilities && typeof rawCapabilities === "object" && !Array.isArray(rawCapabilities)) {
      const source = rawCapabilities as Record<string, unknown>;
      if (typeof source.reasoning === "boolean") capabilities.reasoning = source.reasoning;
      if (typeof source.thinkingFormat === "string" && source.thinkingFormat.length <= 40 && /^[a-z0-9-]+$/.test(source.thinkingFormat)) capabilities.thinkingFormat = source.thinkingFormat;
      if (typeof source.thinkingCanDisable === "boolean") capabilities.thinkingCanDisable = source.thinkingCanDisable;
    }
    models[id] = {
      name: id,
      limit: { context, output },
      modalities: { input: inputModalities, output: ["text"] },
      ...(Object.keys(capabilities).length ? { capabilities } : {}),
    };
  }
  return models;
}
