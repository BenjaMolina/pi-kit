import { existsSync } from "node:fs";
import { discoverCLIProxyModels } from "../cliproxyapi/discovery";
import { resolveCLIProxyBaseUrl, type CLIProxyModel } from "../cliproxyapi/models";
import {
  createCopilotLaunchPlan,
  launchCopilot,
  listCopilotModels,
  resolveCopilotExecutable,
  runCopilotVersion,
  type CopilotLauncherOptions,
} from "./launcher";
import {
  selectCopilotModel,
  selectCopilotReasoningEffort,
  type CopilotEffortPickerOptions,
  type CopilotPickerOptions,
  type CopilotPickerTerminal,
} from "./picker";
import { createCopilotState, readCopilotState, resolveCopilotStatePath, writeCopilotState } from "./state";
import { syncVSCodeCLIProxyAPI, uninstallVSCodeCLIProxyAPI, vscodeConfigStatus } from "./vscode";

export type CopilotCLIOptions = CopilotLauncherOptions & {
  stdout?: (line: string) => void;
  stderr?: (line: string) => void;
  launch?: (args: string[], options: CopilotLauncherOptions) => Promise<number>;
  picker?: (models: CLIProxyModel[], options: CopilotPickerOptions) => Promise<CLIProxyModel | undefined>;
  effortPicker?: (levels: string[], options: CopilotEffortPickerOptions) => Promise<string | undefined>;
  terminal?: CopilotPickerTerminal;
};

const HELP = [
  "Usage: pi-kit-copilot <command>",
  "",
  "Commands:",
  "  models                  List models currently discovered from CLIProxyAPI.",
  "  pick [--wire-api=...]   Interactively search, select, and persist a preferred model.",
  "  switch [--wire-api=...] Interactively select a model and resume Copilot with --continue.",
  "  use <model-id> [--wire-api=...] [--reasoning-effort=...]",
  "                          Validate and persist the preferred dynamic model selection.",
  "  status                  Report the local non-secret model selection.",
  "  launch [--pick] [--wire-api=...] [-- <args...>]",
  "                          Start Copilot CLI with BYOK environment variables.",
  "  doctor                  Check Copilot CLI, state, key, model reachability, and selection.",
  "  sync                    Synchronize the VS Code user Custom Endpoint catalog.",
  "  vscode sync             Synchronize the VS Code user Custom Endpoint catalog.",
  "  vscode status           Report VS Code Custom Endpoint configuration state.",
  "  vscode uninstall        Remove only the pi-kit VS Code Custom Endpoint provider.",
  "  --help                  Show this help message.",
  "",
  "VS Code commands modify only the user chatLanguageModels.json; they never restart VS Code.",
].join("\n");

export async function runCopilotCLI(args: string[], options: CopilotCLIOptions = {}): Promise<number> {
  const stdout = options.stdout ?? console.log;
  const stderr = options.stderr ?? console.error;
  const [command] = args;
  if (!command || command === "--help" || command === "-h" || command === "help") {
    stdout(HELP);
    return 0;
  }

  try {
    if (command === "models") {
      if (args.length !== 1) throw new Error("models does not accept options");
      for (const model of await listCopilotModels(options)) {
        stdout(`${model.id}\t${model.displayName}\tcontext=${model.contextWindow}\tmaxTokens=${model.maxTokens}`);
      }
      return 0;
    }
    if (command === "pick") {
      const wireApi = parseWireApiOption(args, "Usage: pi-kit-copilot pick [--wire-api=responses|completions]");
      await selectAndPersistCopilotModel(wireApi, options, stdout);
      return 0;
    }
    if (command === "switch") {
      const wireApi = parseWireApiOption(args, "Usage: pi-kit-copilot switch [--wire-api=responses|completions]");
      const selected = await selectAndPersistCopilotModel(wireApi, options, stdout);
      if (!selected) return 0;
      return await (options.launch ?? launchCopilot)(["--continue"], options);
    }
    if (command === "use") {
      const { modelId, wireApi, rawEffort } = parseUseArgs(args);
      const models = await listCopilotModels(options);
      const targetModel = models.find((model) => model.id === modelId);
      if (!targetModel) throw new Error(`Model is not currently available from CLIProxyAPI: ${modelId}`);

      let matchedEffort: string | undefined;
      if (rawEffort !== undefined) {
        if (targetModel.reasoningLevelsAuthoritative !== true || targetModel.reasoningLevels.length === 0) {
          throw new Error(`Model does not support authoritative reasoning effort: ${modelId}`);
        }
        const matchResult = matchReasoningEffort(rawEffort, targetModel.reasoningLevels);
        if (matchResult.ambiguous) {
          throw new Error(
            `Reasoning effort "${rawEffort}" is ambiguous for model ${modelId}. Advertised levels: ${targetModel.reasoningLevels.join(", ")}`,
          );
        }
        if (!matchResult.matched) {
          throw new Error(
            `Reasoning effort "${rawEffort}" is not supported for model ${modelId}. Supported levels: ${targetModel.reasoningLevels.join(", ")}`,
          );
        }
        matchedEffort = matchResult.matched;
      }

      const path = await writeCopilotState(createCopilotState(modelId, wireApi, matchedEffort), options);
      stdout(`Selected Copilot model: ${modelId}`);
      if (matchedEffort) {
        stdout(`Reasoning effort: ${matchedEffort}`);
      }
      stdout(`State: ${path}`);
      return 0;
    }
    if (command === "status") {
      if (args.length !== 1) throw new Error("status does not accept options");
      const state = await readCopilotState(options);
      stdout(`State: ${resolveCopilotStatePath(options)}`);
      stdout(`Selection: ${state?.modelId ?? "none"}`);
      stdout(`Wire API: ${state?.wireApi ?? "responses"}`);
      stdout(`Reasoning effort: ${state?.reasoningEffort ?? "none"}`);
      return 0;
    }
    if (command === "launch") {
      const separator = args.indexOf("--");
      const optionsBefore = separator === -1 ? args.slice(1) : args.slice(1, separator);
      const launchArgs = separator === -1 ? [] : args.slice(separator + 1);

      let pick = false;
      let wireApi: "responses" | "completions" = "responses";

      for (const opt of optionsBefore) {
        if (opt === "--pick") {
          pick = true;
        } else if (opt.startsWith("--wire-api=")) {
          const api = opt.slice("--wire-api=".length);
          if (api !== "responses" && api !== "completions") {
            throw new Error("--wire-api must be responses or completions");
          }
          wireApi = api;
        } else {
          if (separator === -1) {
            throw new Error("Use -- before Copilot arguments");
          }
          throw new Error("Usage: pi-kit-copilot launch [--pick] [--wire-api=responses|completions] [-- <copilot args...>]");
        }
      }

      if (!pick && optionsBefore.some((opt) => opt.startsWith("--wire-api="))) {
        throw new Error("--wire-api can only be used with --pick");
      }

      if (separator === -1 && !pick && args.length > 1) {
        throw new Error("Use -- before Copilot arguments");
      }

      if (pick) {
        const selected = await selectAndPersistCopilotModel(wireApi, options, stdout);
        if (!selected) return 0;
      }

      return await (options.launch ?? launchCopilot)(launchArgs, options);
    }
    if (command === "sync") {
      if (args.length !== 1) throw new Error("sync does not accept options");
      const result = await syncVSCodeCLIProxyAPI(options);
      const secretNote = result.secretInjected ? ", secret stored in SecretStorage" : "";
      stdout(`VS Code Custom Endpoint: ${result.changed ? "synchronized" : "already current"} (${result.modelCount} models${secretNote})`);
      stdout(`VS Code config: ${result.path}`);
      return 0;
    }
    if (command === "vscode") {
      const subcommand = args[1];
      if (subcommand === "sync" && args.length === 2) {
        const result = await syncVSCodeCLIProxyAPI(options);
        const secretNote = result.secretInjected ? ", secret stored in SecretStorage" : "";
        stdout(`VS Code Custom Endpoint: ${result.changed ? "synchronized" : "already current"} (${result.modelCount} models${secretNote})`);
        stdout(`VS Code config: ${result.path}`);
        return 0;
      }
      if (subcommand === "status" && args.length === 2) {
        const result = await vscodeConfigStatus(options);
        stdout(`VS Code config: ${result.path}`);
        stdout(`VS Code Custom Endpoint: ${result.state}`);
        stdout(`VS Code secret: ${result.secretStatus ?? "not installed"}`);
        stdout(`VS Code models: ${result.modelCount}`);
        return 0;
      }
      if (subcommand === "uninstall" && args.length === 2) {
        const result = await uninstallVSCodeCLIProxyAPI(options);
        stdout(`VS Code Custom Endpoint: ${result.changed ? "removed" : "not installed"} (${result.modelCount} models)`);
        stdout(`VS Code config: ${result.path}`);
        return 0;
      }
      throw new Error("Usage: pi-kit-copilot vscode <sync|status|uninstall>");
    }
    if (command === "doctor") {
      if (args.length !== 1) throw new Error("doctor does not accept options");
      const report = await doctorCopilot(options);
      stdout(`Copilot: ${report.copilot}`);
      stdout(`State: ${report.state}`);
      stdout(`API key: ${report.apiKey}`);
      stdout(`Base URL: ${report.baseUrl}`);
      stdout(`Proxy models: ${report.proxyModels}`);
      stdout(`Selection: ${report.selection}`);
      stdout(`VS Code config: ${report.vscode}`);
      stdout(`VS Code secret: ${report.vscodeSecret}`);
      stdout(`VS Code models: ${report.vscodeModels}`);
      return 0;
    }
    stderr(`Unknown command: ${command}\n\n${HELP}`);
    return 1;
  } catch (error) {
    stderr(`pi-kit-copilot: ${error instanceof Error ? error.message : "Unknown error"}`);
    return 1;
  }
}

export async function doctorCopilot(options: CopilotCLIOptions = {}): Promise<Record<string, string>> {
  const env = options.env ?? process.env;
  const executable = options.findExecutable
    ? options.findExecutable(env)
    : resolveCopilotExecutable(env, options);
  const version = executable ? await (options.runCopilot ?? runCopilotVersion)(executable) : { available: false };
  const state = await readCopilotState(options);
  const apiKey = env.CLIPROXYAPI_API_KEY?.trim();
  let models: Awaited<ReturnType<typeof discoverCLIProxyModels>> | undefined;
  let proxyModels: string;
  if (!apiKey) {
    proxyModels = "not checked (API key missing)";
  } else {
    try {
      models = await listCopilotModels(options);
      proxyModels = "reachable";
    } catch {
      proxyModels = "unreachable";
    }
  }
  const selected = state?.modelId;
  const selection = !selected ? "none" : !models ? `${selected} (not checked)` : models.some((model) => model.id === selected)
    ? `${selected} (available)` : `${selected} (unavailable)`;

  const vscode = await vscodeConfigStatus(options);
  return {
    copilot: version.available ? version.version ?? "available" : "not found",
    state: existsSync(resolveCopilotStatePath(options)) ? `present (${resolveCopilotStatePath(options)})` : "not created",
    apiKey: apiKey ? "set" : "missing",
    baseUrl: safeBaseUrl(resolveCLIProxyBaseUrl(env.CLIPROXYAPI_BASE_URL)),
    proxyModels,
    selection,
    vscode: vscode.state,
    vscodeSecret: vscode.secretStatus ?? "not installed",
    vscodeModels: String(vscode.modelCount),
  };
}

export function matchReasoningEffort(
  rawEffort: string,
  advertisedLevels: string[],
): { matched?: string; ambiguous?: boolean } {
  const trimmed = rawEffort.trim();
  if (!trimmed) return {};

  const exact = advertisedLevels.find((level) => level === trimmed);
  if (exact !== undefined) return { matched: exact };

  const lower = trimmed.toLowerCase();
  const ci = advertisedLevels.filter((l) => l.toLowerCase() === lower);
  if (ci.length === 1) return { matched: ci[0] };
  if (ci.length > 1) return { ambiguous: true };

  return {};
}

function parseUseArgs(args: string[]): {
  modelId: string;
  wireApi: "responses" | "completions";
  rawEffort?: string;
} {
  const usage = "Usage: pi-kit-copilot use <model-id> [--wire-api=responses|completions] [--reasoning-effort=<level>]";
  const tokens = args.slice(1);
  if (tokens.length === 0) {
    throw new Error(usage);
  }

  let modelId: string | undefined;
  let wireApi: "responses" | "completions" = "responses";
  let rawEffort: string | undefined;
  let seenWireApi = false;
  let seenReasoningEffort = false;

  for (const token of tokens) {
    if (token === "--wire-api" || (token.startsWith("--wire-api=") && !token.slice("--wire-api=".length).trim())) {
      throw new Error("--wire-api requires a value");
    }
    if (token.startsWith("--wire-api=")) {
      if (seenWireApi) {
        throw new Error("Duplicate option: --wire-api");
      }
      seenWireApi = true;
      const api = token.slice("--wire-api=".length).trim();
      if (api !== "responses" && api !== "completions") {
        throw new Error("--wire-api must be responses or completions");
      }
      wireApi = api;
      continue;
    }

    if (token === "--reasoning-effort" || (token.startsWith("--reasoning-effort=") && !token.slice("--reasoning-effort=".length).trim())) {
      throw new Error("--reasoning-effort requires a value");
    }
    if (token.startsWith("--reasoning-effort=")) {
      if (seenReasoningEffort) {
        throw new Error("Duplicate option: --reasoning-effort");
      }
      seenReasoningEffort = true;
      rawEffort = token.slice("--reasoning-effort=".length).trim();
      continue;
    }

    if (token.startsWith("--")) {
      throw new Error(`Unknown option: ${token}`);
    }

    if (modelId !== undefined) {
      throw new Error(usage);
    }
    modelId = token;
  }

  if (!modelId) {
    throw new Error(usage);
  }

  return { modelId, wireApi, rawEffort };
}

function parseWireApiOption(args: string[], usage: string): "responses" | "completions" {
  if (args.length === 1) return "responses";
  if (args.length === 2) {
    if (!args[1].startsWith("--wire-api=")) {
      throw new Error(usage);
    }
    const api = args[1].slice("--wire-api=".length);
    if (api !== "responses" && api !== "completions") {
      throw new Error("--wire-api must be responses or completions");
    }
    return api;
  }
  throw new Error(usage);
}

async function selectAndPersistCopilotModel(
  wireApi: "responses" | "completions",
  options: CopilotCLIOptions,
  stdout: (line: string) => void,
): Promise<boolean> {
  const models = await listCopilotModels(options);
  const pickerFn = options.picker ?? selectCopilotModel;
  const selected = await pickerFn(models, { terminal: options.terminal });
  if (!selected) return false;

  let effort: string | undefined;
  if (selected.reasoningLevelsAuthoritative === true && selected.reasoningLevels.length > 0) {
    const effortPickerFn = options.effortPicker ?? selectCopilotReasoningEffort;
    effort = await effortPickerFn(selected.reasoningLevels, {
      terminal: options.terminal,
      defaultLevel: selected.defaultReasoningLevel,
      modelId: selected.id,
    });
    if (effort === undefined) return false;
  }

  const path = await writeCopilotState(createCopilotState(selected.id, wireApi, effort), options);
  stdout(`Selected Copilot model: ${selected.id}`);
  if (effort) {
    stdout(`Reasoning effort: ${effort}`);
  }
  stdout(`State: ${path}`);
  return true;
}

function safeBaseUrl(value: string): string {
  try {
    const url = new URL(value);
    url.username = "";
    url.password = "";
    url.search = "";
    url.hash = "";
    return url.toString().replace(/\/$/, "");
  } catch {
    return "invalid URL";
  }
}
