import { discoverCLIProxyModels, type CLIProxyFetch } from "./discovery";
import { resolveCLIProxyBaseUrl, type CLIProxyModel } from "./models";

type OpenCodeConfig = {
  provider?: Record<string, unknown>;
};

type OpenCodePluginHooks = {
  config?: (config: OpenCodeConfig) => Promise<void>;
};

export type OpenCodePluginFactory = (input: unknown) => Promise<OpenCodePluginHooks>;

export type CLIProxyAPIOpenCodePluginOptions = {
  env?: Record<string, string | undefined>;
  fetch?: CLIProxyFetch;
};

function scopeFromModelId(id: string): string | undefined {
  const separator = id.lastIndexOf("/");
  const scope = separator > 0 ? id.slice(0, separator).trim() : "";
  return scope || undefined;
}

function disambiguateDisplayNames(models: CLIProxyModel[]): Map<string, string> {
  const names = new Map<string, string>();
  const groups = new Map<string, CLIProxyModel[]>();

  for (const model of models) {
    const group = groups.get(model.displayName) ?? [];
    group.push(model);
    groups.set(model.displayName, group);
  }

  for (const [displayName, group] of groups) {
    if (group.length === 1) {
      names.set(group[0].id, displayName);
      continue;
    }

    const scopeCounts = new Map<string, number>();
    for (const model of group) {
      const scope = scopeFromModelId(model.id);
      if (scope) scopeCounts.set(scope, (scopeCounts.get(scope) ?? 0) + 1);
    }

    const generalModel = group
      .filter((model) => !scopeFromModelId(model.id))
      .sort((left, right) => left.id.localeCompare(right.id))[0];

    for (const model of group) {
      const scope = scopeFromModelId(model.id);
      if (model === generalModel) {
        names.set(model.id, displayName);
      } else if (scope && scopeCounts.get(scope) === 1) {
        names.set(model.id, `${displayName} [${scope}]`);
      } else {
        names.set(model.id, `${displayName} [${model.id}]`);
      }
    }
  }

  return names;
}

function toOpenCodeModel(model: CLIProxyModel, name: string) {
  return {
    name,
    ...(model.reasoning ? { reasoning: true } : {}),
    limit: { context: model.contextWindow, output: model.maxTokens },
    modalities: { input: [...model.input], output: ["text"] },
  };
}

/**
 * Creates an OpenCode config hook. Discovery failures deliberately leave the
 * existing config untouched so a stopped local CLIProxyAPI never blocks startup.
 */
export function createCLIProxyAPIOpenCodePlugin(
  { env = process.env, fetch = globalThis.fetch }: CLIProxyAPIOpenCodePluginOptions = {},
): OpenCodePluginFactory {
  return async () => ({
    config: async (config) => {
      const apiKey = env.CLIPROXYAPI_API_KEY?.trim();
      if (!apiKey) return;

      try {
        const baseUrl = resolveCLIProxyBaseUrl(env.CLIPROXYAPI_BASE_URL);
        const models = await discoverCLIProxyModels({ baseUrl, apiKey, fetch });
        const displayNames = disambiguateDisplayNames(models);
        config.provider ??= {};
        config.provider.cliproxyapi = {
          npm: "@ai-sdk/openai-compatible",
          name: "CLIProxyAPI",
          options: { baseURL: baseUrl, apiKey },
          models: Object.fromEntries(models.map((model) => [
            model.id,
            toOpenCodeModel(model, displayNames.get(model.id) ?? model.displayName),
          ])),
        };
      } catch {
        // Keep OpenCode usable when the optional local proxy is unavailable.
      }
    },
  });
}
