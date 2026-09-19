import { existsSync } from "node:fs";
import { discoverCLIProxyModels } from "../cliproxyapi/discovery";
import { resolveCLIProxyBaseUrl } from "../cliproxyapi/models";
import {
  createCopilotLaunchPlan,
  launchCopilot,
  listCopilotModels,
  resolveCopilotExecutable,
  runCopilotVersion,
  type CopilotLauncherOptions,
} from "./launcher";
import { createCopilotState, readCopilotState, resolveCopilotStatePath, writeCopilotState } from "./state";

export type CopilotCLIOptions = CopilotLauncherOptions & {
  stdout?: (line: string) => void;
  stderr?: (line: string) => void;
  launch?: (args: string[], options: CopilotLauncherOptions) => Promise<number>;
};

const HELP = [
  "Usage: pi-kit-copilot <command>",
  "",
  "Commands:",
  "  models                  List models currently discovered from CLIProxyAPI.",
  "  use <model-id>          Validate and persist the preferred dynamic model selection.",
  "  status                  Report the local non-secret model selection.",
  "  launch [-- <args...>]   Start Copilot CLI with BYOK environment variables.",
  "  doctor                  Check Copilot CLI, state, key, model reachability, and selection.",
  "  sync                    Reserved for future VS Code Custom Endpoint synchronization.",
  "  vscode                  Reserved for future VS Code Custom Endpoint commands.",
  "  --help                  Show this help message.",
  "",
  "VS Code configuration is a follow-up work unit; these commands do not modify VS Code.",
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
    if (command === "use") {
      const modelId = args[1];
      if (!modelId || args.length > 3 || (args.length === 3 && !args[2].startsWith("--wire-api="))) {
        throw new Error("Usage: pi-kit-copilot use <model-id> [--wire-api=responses|completions]");
      }
      const wireApi = args[2]?.slice("--wire-api=".length) ?? "responses";
      if (wireApi !== "responses" && wireApi !== "completions") throw new Error("--wire-api must be responses or completions");
      const models = await listCopilotModels(options);
      if (!models.some((model) => model.id === modelId)) throw new Error(`Model is not currently available from CLIProxyAPI: ${modelId}`);
      const path = await writeCopilotState(createCopilotState(modelId, wireApi), options);
      stdout(`Selected Copilot model: ${modelId}`);
      stdout(`State: ${path}`);
      return 0;
    }
    if (command === "status") {
      if (args.length !== 1) throw new Error("status does not accept options");
      const state = await readCopilotState(options);
      stdout(`State: ${resolveCopilotStatePath(options)}`);
      stdout(`Selection: ${state?.modelId ?? "none"}`);
      stdout(`Wire API: ${state?.wireApi ?? "responses"}`);
      return 0;
    }
    if (command === "launch") {
      const separator = args.indexOf("--");
      if (separator !== -1 && separator !== 1) throw new Error("Usage: pi-kit-copilot launch [-- <copilot args...>]");
      const launchArgs = separator === -1 ? args.slice(1) : args.slice(2);
      if (separator === -1 && launchArgs.length > 0) throw new Error("Use -- before Copilot arguments");
      return await (options.launch ?? launchCopilot)(launchArgs, options);
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
      return 0;
    }
    if (command === "sync" || command === "vscode") throw new Error(`${command} is reserved for the VS Code follow-up and is not implemented.`);
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

  return {
    copilot: version.available ? version.version ?? "available" : "not found",
    state: existsSync(resolveCopilotStatePath(options)) ? `present (${resolveCopilotStatePath(options)})` : "not created",
    apiKey: apiKey ? "set" : "missing",
    baseUrl: safeBaseUrl(resolveCLIProxyBaseUrl(env.CLIPROXYAPI_BASE_URL)),
    proxyModels,
    selection,
  };
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
