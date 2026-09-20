import { spawn as nodeSpawn, type ChildProcess } from "node:child_process";
import { existsSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { discoverCLIProxyModels, type CLIProxyFetch } from "../cliproxyapi/discovery";
import { resolveCLIProxyBaseUrl, type CLIProxyModel } from "../cliproxyapi/models";
import { readCopilotState, type CopilotStateOptions, type CopilotWireApi } from "./state";

export type CopilotExecutable = { command: string; source: "PATH" | "WinGet" };
export type CopilotCommandResult = { available: boolean; version?: string };
export type CopilotSpawn = (command: string, args: string[], options: { env: NodeJS.ProcessEnv; stdio: "inherit" }) => ChildProcess;

export type CopilotExecutableResolverOptions = {
  exists?: (path: string) => boolean;
  platform?: NodeJS.Platform;
  readdir?: (path: string) => string[];
};

export type CopilotLauncherOptions = CopilotStateOptions & CopilotExecutableResolverOptions & {
  fetch?: CLIProxyFetch;
  findExecutable?: (env: Record<string, string | undefined>) => CopilotExecutable | undefined;
  runCopilot?: (executable: CopilotExecutable) => Promise<CopilotCommandResult>;
  spawn?: CopilotSpawn;
};

export type CopilotLaunchPlan = {
  executable: CopilotExecutable;
  args: string[];
  env: NodeJS.ProcessEnv;
  model: CLIProxyModel;
  catalogModelId?: string;
  reasoningEffort?: string;
};

export function copilotCatalogModelId(modelId: string): string | undefined {
  const normalized = modelId.toLowerCase();
  if (normalized.includes("claude")) return "claude-sonnet-4";
  if (normalized.includes("gemini")) return "gemini-2.5-pro";
  if (normalized.includes("gpt") || normalized.includes("openai")) return "gpt-4.1";
  return undefined;
}

export function isCopilotResumeInvocation(args: string[]): boolean {
  const terminatorIndex = args.indexOf("--");
  const options = terminatorIndex === -1 ? args : args.slice(0, terminatorIndex);
  return options.some((arg) => arg === "--continue" || arg === "--resume" || arg.startsWith("--resume="));
}

export function hasCopilotExplicitModelOverride(args: string[]): boolean {
  const terminatorIndex = args.indexOf("--");
  const options = terminatorIndex === -1 ? args : args.slice(0, terminatorIndex);

  for (let i = 0; i < options.length; i++) {
    const arg = options[i];
    if (arg.startsWith("--model=")) {
      if (arg.slice("--model=".length).trim() !== "") return true;
    } else if (arg === "--model") {
      const next = options[i + 1];
      if (next !== undefined && next.trim() !== "" && !next.startsWith("-")) return true;
    }
  }
  return false;
}

export function hasCopilotExplicitReasoningEffortOverride(args: string[]): boolean {
  const terminatorIndex = args.indexOf("--");
  const options = terminatorIndex === -1 ? args : args.slice(0, terminatorIndex);

  for (let i = 0; i < options.length; i++) {
    const arg = options[i];
    if (arg.startsWith("--reasoning-effort=")) {
      if (arg.slice("--reasoning-effort=".length).trim() !== "") return true;
    } else if (arg === "--reasoning-effort") {
      const next = options[i + 1];
      if (next !== undefined && next.trim() !== "" && !next.startsWith("-")) return true;
    }
  }
  return false;
}

export function reconcileReasoningEffort(
  storedEffort: string,
  model: CLIProxyModel,
): string {
  if (model.reasoningLevelsAuthoritative !== true || !model.reasoningLevels || model.reasoningLevels.length === 0) {
    throw new Error(`Selected Copilot model does not support authoritative reasoning effort: ${model.id}`);
  }

  const trimmed = storedEffort.trim();
  if (!trimmed) {
    throw new Error(`Invalid persisted reasoning effort for model ${model.id}`);
  }

  const exact = model.reasoningLevels.find((level) => level === trimmed);
  if (exact !== undefined) {
    return exact;
  }

  const lower = trimmed.toLowerCase();
  const ciMatches = model.reasoningLevels.filter((level) => level.toLowerCase() === lower);
  if (ciMatches.length === 1) {
    return ciMatches[0];
  }
  if (ciMatches.length > 1) {
    throw new Error(
      `Persisted reasoning effort "${storedEffort}" is ambiguous for model ${model.id}. Advertised levels: ${model.reasoningLevels.join(", ")}`,
    );
  }

  throw new Error(
    `Persisted reasoning effort "${storedEffort}" is not supported by model ${model.id}. Advertised levels: ${model.reasoningLevels.join(", ")}`,
  );
}

export function normalizeCopilotLaunchArgs(
  args: string[],
  catalogModelId?: string,
  reasoningEffort?: string,
): string[] {
  const shouldAppendModel = Boolean(
    catalogModelId && isCopilotResumeInvocation(args) && !hasCopilotExplicitModelOverride(args),
  );
  const shouldAppendEffort = Boolean(
    reasoningEffort && !hasCopilotExplicitReasoningEffortOverride(args),
  );

  if (!shouldAppendModel && !shouldAppendEffort) {
    return args;
  }

  const terminatorIndex = args.indexOf("--");
  const optionsBefore = terminatorIndex === -1 ? args : args.slice(0, terminatorIndex);
  const terminatorAndRest = terminatorIndex === -1 ? [] : args.slice(terminatorIndex);

  const normalized = [...optionsBefore];
  if (shouldAppendModel) {
    normalized.push(`--model=${catalogModelId}`);
  }
  if (shouldAppendEffort) {
    normalized.push(`--reasoning-effort=${reasoningEffort}`);
  }
  return [...normalized, ...terminatorAndRest];
}

export async function listCopilotModels(options: CopilotLauncherOptions = {}): Promise<CLIProxyModel[]> {
  const env = options.env ?? process.env;
  const apiKey = requiredApiKey(env);
  return discoverCLIProxyModels({
    baseUrl: resolveCLIProxyBaseUrl(env.CLIPROXYAPI_BASE_URL),
    apiKey,
    fetch: options.fetch,
  });
}

export async function createCopilotLaunchPlan(args: string[], options: CopilotLauncherOptions = {}): Promise<CopilotLaunchPlan> {
  const env = options.env ?? process.env;
  const selection = await readCopilotState(options);
  if (!selection) throw new Error("No Copilot model is selected. Run pi-kit-copilot use <model-id> first.");

  const models = await listCopilotModels(options);
  const model = models.find((candidate) => candidate.id === selection.modelId);
  if (!model) throw new Error(`Selected Copilot model is not available from CLIProxyAPI: ${selection.modelId}`);

  let reasoningEffort: string | undefined;
  if (selection.reasoningEffort !== undefined) {
    reasoningEffort = reconcileReasoningEffort(selection.reasoningEffort, model);
  }

  const executable = options.findExecutable
    ? options.findExecutable(env)
    : resolveCopilotExecutable(env, options);
  if (!executable) throw new Error("GitHub Copilot CLI was not found on PATH or in the WinGet package directory.");

  const catalogModelId = copilotCatalogModelId(model.id);

  return {
    executable,
    args: normalizeCopilotLaunchArgs(args, catalogModelId, reasoningEffort),
    model,
    catalogModelId,
    reasoningEffort,
    env: buildCopilotEnvironment(env, model, selection.wireApi),
  };
}

export async function launchCopilot(args: string[], options: CopilotLauncherOptions = {}): Promise<number> {
  const plan = await createCopilotLaunchPlan(args, options);
  const child = (options.spawn ?? nodeSpawn)(plan.executable.command, plan.args, { env: plan.env, stdio: "inherit" });
  return new Promise((resolve, reject) => {
    child.once("error", reject);
    child.once("close", (code) => resolve(code ?? 1));
  });
}

export function buildCopilotEnvironment(
  env: Record<string, string | undefined>,
  model: CLIProxyModel,
  wireApi: CopilotWireApi = "responses",
): NodeJS.ProcessEnv {
  const apiKey = requiredApiKey(env);
  const catalogModelId = copilotCatalogModelId(model.id);
  const next: NodeJS.ProcessEnv = {
    ...env,
    COPILOT_PROVIDER_TYPE: "openai",
    COPILOT_PROVIDER_BASE_URL: resolveCLIProxyBaseUrl(env.CLIPROXYAPI_BASE_URL),
    COPILOT_PROVIDER_BEARER_TOKEN: apiKey,
    COPILOT_PROVIDER_WIRE_API: wireApi,
    COPILOT_PROVIDER_WIRE_MODEL: model.id,
    COPILOT_PROVIDER_MODEL_ID: catalogModelId ?? model.id,
    COPILOT_PROVIDER_MAX_PROMPT_TOKENS: String(resolveMaxPromptTokens(model)),
    COPILOT_PROVIDER_MAX_OUTPUT_TOKENS: String(model.maxTokens),
  };
  if (catalogModelId) next.COPILOT_MODEL = catalogModelId;
  return next;
}

export function resolveCopilotExecutable(
  env: Record<string, string | undefined> = process.env,
  options: CopilotExecutableResolverOptions = {},
): CopilotExecutable | undefined {
  const platform = options.platform ?? process.platform;
  const exists = options.exists ?? existsSync;
  const readdir = options.readdir ?? readdirSync;
  const names = platform === "win32" ? ["copilot.exe", "copilot.cmd", "copilot"] : ["copilot"];
  const pathDelimiter = platform === "win32" ? ";" : ":";
  for (const directory of (env.PATH ?? "").split(pathDelimiter).filter(Boolean)) {
    for (const name of names) {
      const candidate = join(directory, name);
      if (exists(candidate)) return { command: candidate, source: "PATH" };
    }
  }

  if (platform !== "win32" || !env.LOCALAPPDATA) return undefined;
  const packages = join(env.LOCALAPPDATA, "Microsoft", "WinGet", "Packages");
  try {
    for (const directory of readdir(packages)) {
      if (!directory.toLowerCase().startsWith("github.copilot_")) continue;
      for (const name of names) {
        const candidate = join(packages, directory, name);
        if (exists(candidate)) return { command: candidate, source: "WinGet" };
      }
    }
  } catch {
    // WinGet is optional; PATH remains the primary supported lookup.
  }
  return undefined;
}

export function resolveMaxPromptTokens(model: CLIProxyModel): number {
  // Reserve the discovered output budget inside the total context window. The
  // provider never receives a prompt allowance larger than its context limit.
  return Math.max(1, model.contextWindow - model.maxTokens);
}

export async function runCopilotVersion(executable: CopilotExecutable): Promise<CopilotCommandResult> {
  return new Promise((resolve) => {
    const child = nodeSpawn(executable.command, ["--version"], { stdio: ["ignore", "pipe", "ignore"] });
    let output = "";
    child.stdout?.on("data", (chunk: Buffer) => { output += chunk.toString(); });
    child.once("error", () => resolve({ available: false }));
    child.once("close", (code) => resolve(code === 0 ? { available: true, version: output.trim() || "available" } : { available: false }));
  });
}

function requiredApiKey(env: Record<string, string | undefined>): string {
  const apiKey = env.CLIPROXYAPI_API_KEY?.trim();
  if (!apiKey) throw new Error("CLIPROXYAPI_API_KEY is required.");
  return apiKey;
}
