import {
  type CLIProxyModel,
  type CPAModel,
  type FallbackOpenAIModel,
  normalizeCPA,
  normalizeOpenAI,
  resolveCLIProxyBaseUrl,
} from "./models";

export type CLIProxyFetch = (input: string, init?: RequestInit) => Promise<Response>;

export type CLIProxyDiscoveryOptions = {
  baseUrl: string;
  apiKey: string;
  signal?: AbortSignal;
  fetch?: CLIProxyFetch;
};

function toModels<T>(models: T[], normalize: (model: T) => CLIProxyModel | undefined): CLIProxyModel[] {
  return models.map(normalize).filter((model): model is CLIProxyModel => Boolean(model));
}

export async function discoverCLIProxyModels({
  baseUrl,
  apiKey,
  signal,
  fetch: fetchModels = globalThis.fetch,
}: CLIProxyDiscoveryOptions): Promise<CLIProxyModel[]> {
  const headers = { Authorization: `Bearer ${apiKey}` };
  const normalizedBaseUrl = resolveCLIProxyBaseUrl(baseUrl);
  const enrichedUrl = `${normalizedBaseUrl}/models?client_version=1`;

  try {
    const response = await fetchModels(enrichedUrl, { headers, signal });
    if (response.ok) {
      const payload = (await response.json()) as { models?: CPAModel[] };
      if (Array.isArray(payload.models)) {
        const models = toModels(payload.models, normalizeCPA);
        if (models.length > 0) return models;
      }
    }
  } catch {
    // CLIProxyAPI versions before the enriched endpoint still expose /models.
  }

  const response = await fetchModels(`${normalizedBaseUrl}/models`, { headers, signal });
  if (!response.ok) {
    const body = await response.text().catch(() => "");
    const detail = body ? `: ${body.slice(0, 300)}` : "";
    throw new Error(`CLIProxyAPI /v1/models failed with HTTP ${response.status}${detail}`);
  }

  const payload = (await response.json()) as { data?: FallbackOpenAIModel[] };
  return toModels(Array.isArray(payload.data) ? payload.data : [], normalizeOpenAI);
}
