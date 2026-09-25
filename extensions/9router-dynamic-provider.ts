import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import type { CLIProxyFetch } from "../src/cliproxyapi/discovery";
import {
  discoverNineRouterModels,
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

export async function fetchNineRouterModels(options: FetchNineRouterModelsOptions = {}): Promise<NineRouterPiModel[]> {
  const env = options.env ?? process.env;
  const apiKey = resolveNineRouterApiKey(env);
  if (!apiKey) {
    throw new Error(
      "NINEROUTER_API_KEY is not set. Configure it in the Pi process environment before loading this provider.",
    );
  }
  const baseUrl = resolveNineRouterBaseUrl(options.baseUrl ?? env.NINEROUTER_BASE_URL);
  const discovered = await discoverNineRouterModels(baseUrl, apiKey, options.fetch, options.signal);
  const models: NineRouterPiModel[] = [];
  for (const [id, entry] of Object.entries(discovered)) {
    const model = toPiModelFrom9Router(id, entry as any);
    if (model) {
      models.push(model);
    }
  }
  return models;
}

export default function nineRouterDynamicProvider(
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

  pi.registerProvider(NINEROUTER_PROVIDER_ID, {
    name: "9Router",
    baseUrl,
    apiKey: "$NINEROUTER_API_KEY",
    api: "openai-completions",
    compat: {
      supportsDeveloperRole: false,
      supportsReasoningEffort: false,
    },
    async refreshModels({ signal } = {}) {
      try {
        const combinedSignal = signal && options?.signal
          ? AbortSignal.any([signal, options.signal])
          : (signal ?? options?.signal);
        return await fetchNineRouterModels({ ...options, env, signal: combinedSignal });
      } catch {
        return [];
      }
    },
  });
}
