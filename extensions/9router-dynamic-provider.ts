import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import type { CLIProxyFetch } from "../src/cliproxyapi/discovery";
import {
  discoverNineRouterModels,
  discoverOpenCodeModels,
  discoverOpenCodeModelLimits,
  mergeOpenCodeFreeModels,
  MAX_NINEROUTER_MODELS,
  NINEROUTER_DEFAULT_BASE_URL,
  resolveNineRouterBaseUrl,
} from "../src/cliproxyapi/9router";
import { toPiModelFrom9Router, type NineRouterPiModel } from "../src/cliproxyapi/pi-9router";

export { toPiModelFrom9Router } from "../src/cliproxyapi/pi-9router";

export const NINEROUTER_PROVIDER_ID = "9router";

export { NINEROUTER_DEFAULT_BASE_URL, resolveNineRouterBaseUrl };

export function resolveNineRouterApiKey(env: Record<string, string | undefined> = process.env): string | undefined {
  const key = env.NINEROUTER_API_KEY?.trim();
  return key || undefined;
}

export function requireNineRouterApiKey(env: Record<string, string | undefined> = process.env): string {
  const key = resolveNineRouterApiKey(env);
  if (!key) {
    throw new Error(
      "NINEROUTER_API_KEY is not set. Configure it in the Pi process environment before loading this provider.",
    );
  }
  return key;
}

export type { NineRouterPiModel } from "../src/cliproxyapi/pi-9router";

export type FetchNineRouterModelsOptions = {
  baseUrl?: string;
  signal?: AbortSignal;
  fetch?: CLIProxyFetch;
  env?: Record<string, string | undefined>;
};

async function raceWithSignal<T>(work: Promise<T>, signal?: AbortSignal): Promise<T> {
  if (!signal) return work;
  signal.throwIfAborted();
  let onAbort!: () => void;
  const aborted = new Promise<never>((_resolve, reject) => {
    onAbort = () => reject(signal.reason);
    signal.addEventListener("abort", onAbort, { once: true });
  });
  try { return await Promise.race([work, aborted]); }
  finally { signal.removeEventListener("abort", onAbort); }
}

export async function fetchNineRouterModels(options: FetchNineRouterModelsOptions = {}): Promise<NineRouterPiModel[]> {
  const env = options.env ?? process.env;
  const apiKey = resolveNineRouterApiKey(env);
  if (!apiKey) {
    throw new Error(
      "NINEROUTER_API_KEY is not set. Configure it in the Pi process environment before loading this provider.",
    );
  }
  const baseUrl = resolveNineRouterBaseUrl(options.baseUrl ?? env.NINEROUTER_BASE_URL);
  const startedAt = Date.now();
  const disabled = /^(0|false|no)$/i.test(env.NINEROUTER_OPENCODE_FREE_DISCOVERY ?? "");
  const publicCatalog = disabled
    ? undefined
    : discoverOpenCodeModels(options.fetch, options.signal).then((ids) => ids, () => undefined);
  const discovered = await discoverNineRouterModels(baseUrl, apiKey, options.fetch, options.signal);
  let publicIds: string[] | undefined;
  if (publicCatalog) {
    let zenDeadline: ReturnType<typeof setTimeout> | undefined;
    publicIds = await raceWithSignal(Promise.race([
      publicCatalog,
      new Promise<undefined>((resolve) => { zenDeadline = setTimeout(resolve, Math.max(0, 3_000 - (Date.now() - startedAt))); }),
    ]).finally(() => clearTimeout(zenDeadline)), options.signal);
  }
  options.signal?.throwIfAborted();
  if (publicIds) {
    const remaining = Math.max(0, 3_000 - (Date.now() - startedAt));
    let metadata = new Map();
    if (publicIds.some((id) => id.endsWith("-free")) && remaining > 0) {
      const pending = discoverOpenCodeModelLimits(options.fetch).catch(() => new Map());
      let deadline: ReturnType<typeof setTimeout> | undefined;
      const result = await raceWithSignal(Promise.race([
        pending.then((limits) => ({ limits })),
        new Promise<{ limits: Map<string, never> }>((resolve) => { deadline = setTimeout(() => resolve({ limits: new Map() }), remaining); }),
      ]).finally(() => clearTimeout(deadline)), options.signal);
      options.signal?.throwIfAborted();
      metadata = result.limits;
    }
    options.signal?.throwIfAborted();
    mergeOpenCodeFreeModels(discovered, publicIds, MAX_NINEROUTER_MODELS, metadata);
  }
  const models: NineRouterPiModel[] = [];
  for (const [id, entry] of Object.entries(discovered)) {
    const model = toPiModelFrom9Router(id, entry as any);
    if (model) {
      models.push(model);
    }
  }
  return models;
}

export default async function nineRouterDynamicProvider(
  pi: ExtensionAPI,
  options?: FetchNineRouterModelsOptions,
) {
  const env = options?.env ?? process.env;
  const apiKey = resolveNineRouterApiKey(env);
  if (!apiKey) {
    return;
  }

  let baseUrl: string;
  try {
    baseUrl = resolveNineRouterBaseUrl(options?.baseUrl ?? env.NINEROUTER_BASE_URL);
  } catch {
    return;
  }

  const isOffline = () => /^(1|true|yes)$/i.test(env.PI_OFFLINE ?? "")
    || /^(1|true|yes)$/i.test(process.env.PI_OFFLINE ?? "");
  let models: NineRouterPiModel[] = [];
  if (!isOffline()) {
    try {
      models = await fetchNineRouterModels({ ...options, env });
    } catch {
      // Keep startup usable when the live catalog is unavailable.
      models = [];
    }
  }

  pi.registerProvider(NINEROUTER_PROVIDER_ID, {
    name: "9Router",
    baseUrl,
    apiKey: "$NINEROUTER_API_KEY",
    api: "openai-completions",
    models,
    compat: {
      supportsDeveloperRole: false,
    },
    async refreshModels({ signal, allowNetwork }: { signal?: AbortSignal; allowNetwork?: boolean } = {}) {
      if (allowNetwork === false || isOffline()) {
        return models;
      }
      try {
        const combinedSignal = signal && options?.signal
          ? AbortSignal.any([signal, options.signal])
          : (signal ?? options?.signal);
        models = await fetchNineRouterModels({ ...options, env, signal: combinedSignal });
        return models;
      } catch {
        // Discovery rejects invalid/empty catalogs; retain only a real last-good list.
        return models;
      }
    },
  });
}
