import { doctorCodexCLIProxyAPI, type CodexDoctorOptions } from "./doctor";
import {
  activateCodexCLIProxyAPI,
  deactivateCodexCLIProxyAPI,
  getCodexCLIProxyAPIStatus,
  installCodexCLIProxyAPI,
  uninstallCodexCLIProxyAPI,
  type CodexConfigOptions,
} from "./config";
import {
  installPlugin,
  listPluginStatuses,
  MANAGED_PLUGINS,
  resolveCLIProxyPluginDirectory,
  uninstallPlugin,
  type InstallPluginOptions,
  type PluginLocationOptions,
} from "./plugins";

export type CodexCLIOptions = CodexDoctorOptions &
  InstallPluginOptions & {
    stdout?: (line: string) => void;
    stderr?: (line: string) => void;
  };

const HELP = [
  "Usage: pi-kit-codex <command>",
  "",
  "Commands:",
  "  doctor       Report Codex, configuration, and CLIProxyAPI connectivity status.",
  "  status       Report offline provider selection and registration status.",
  "  use openai   Actively switch to the native OpenAI default selection.",
  "  use cliproxyapi  Actively switch to pi-kit's managed CLIProxyAPI selection.",
  "  install      Install the managed CLIProxyAPI Codex configuration blocks.",
  "  uninstall    Remove only the managed CLIProxyAPI Codex configuration blocks.",
  "  plugin list  List available CLIProxyAPI plugins and installation status.",
  "  plugin status  Report CLIProxyAPI plugins installation status.",
  "  plugin install <id|all> [--build] [--force] [--target <dir>]",
  "               Install verified CLIProxyAPI plugins with hybrid download/build.",
  "  plugin uninstall <id|all> [--target <dir>]",
  "               Remove managed CLIProxyAPI plugin binaries.",
  "  --help       Show this help message.",
].join("\n");

export async function runCodexCLI(args: string[], options: CodexCLIOptions = {}): Promise<number> {
  const stdout = options.stdout ?? console.log;
  const stderr = options.stderr ?? console.error;
  const [command] = args;

  if (!command || command === "--help" || command === "-h" || command === "help") {
    stdout(HELP);
    return 0;
  }

  try {
    if (command === "install") {
      const result = await installCodexCLIProxyAPI(options);
      stdout(
        result.changed
          ? `Installed CLIProxyAPI Codex configuration: ${result.path}`
          : `CLIProxyAPI Codex configuration is already installed: ${result.path}`
      );
      return 0;
    }
    if (command === "uninstall") {
      const result = await uninstallCodexCLIProxyAPI(options);
      stdout(
        result.changed
          ? `Removed managed CLIProxyAPI Codex configuration: ${result.path}`
          : `No managed CLIProxyAPI Codex configuration found: ${result.path}`
      );
      return 0;
    }
    if (command === "use") {
      const target = args[1];
      if (args.length !== 2 || (target !== "openai" && target !== "cliproxyapi")) {
        throw new Error("Usage: pi-kit-codex use <openai|cliproxyapi>");
      }
      const result =
        target === "openai"
          ? await deactivateCodexCLIProxyAPI(options)
          : await activateCodexCLIProxyAPI(options);
      const action = target === "openai" ? "Switched to OpenAI default" : "Activated CLIProxyAPI selection";
      stdout(result.changed ? `${action}: ${result.path}` : `${action} unchanged: ${result.path}`);
      return 0;
    }
    if (command === "status") {
      if (args.length !== 1) throw new Error("status does not accept options");
      const status = await getCodexCLIProxyAPIStatus(options);
      stdout(`Selection: ${status.selection}`);
      stdout(`Provider: ${status.provider}`);
      stdout(`Config: ${status.path}`);
      return 0;
    }
    if (command === "doctor") {
      if (args.length > 1 && args[1] !== "--probe") throw new Error(`Unknown doctor option: ${args[1]}`);
      const report = await doctorCodexCLIProxyAPI(options);
      stdout(`Codex: ${report.codex}`);
      stdout(`API key: ${report.apiKey}`);
      stdout(`Base URL: ${report.baseUrl}`);
      stdout(`Config: ${report.config}`);
      stdout(`Proxy models: ${report.proxyModels}`);
      stdout(`Plugins: ${report.plugins}`);
      return 0;
    }
    if (command === "plugin") {
      return await runPluginCommand(args.slice(1), options, stdout);
    }
    stderr(`Unknown command: ${command}\n\n${HELP}`);
    return 1;
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    stderr(`pi-kit-codex: ${message}`);
    return 1;
  }
}

async function runPluginCommand(
  subArgs: string[],
  options: CodexCLIOptions,
  stdout: (line: string) => void
): Promise<number> {
  const [subCommand] = subArgs;
  if (!subCommand || subCommand === "--help" || subCommand === "-h" || subCommand === "help") {
    stdout([
      "Usage: pi-kit-codex plugin <command> [options]",
      "",
      "Commands:",
      "  list                     List plugins and their status.",
      "  status                   Report plugins installation status.",
      "  install <id|all>         Install plugin(s) with checksum verification.",
      "                           Flags: --build (force local Docker build), --force (overwrite), --target <dir>",
      "  uninstall <id|all>       Uninstall plugin(s).",
      "                           Flags: --target <dir>",
    ].join("\n"));
    return 0;
  }

  const { flags, positional } = parsePluginFlags(subArgs.slice(1));
  const mergedOptions: CodexCLIOptions = {
    ...options,
    ...flags,
  };

  if (subCommand === "list" || subCommand === "status") {
    const dir = resolveCLIProxyPluginDirectory(mergedOptions);
    const statuses = listPluginStatuses(mergedOptions);
    stdout(`CLIProxyAPI Plugins (${dir}):`);
    for (const status of statuses) {
      const state = status.installed
        ? status.sha256Match
          ? "installed (verified)"
          : "installed (hash mismatch!)"
        : "not installed";
      stdout(`- ${status.id} (v${status.version}): ${state}`);
      stdout(`  ${status.description}`);
    }
    return 0;
  }

  if (subCommand === "install") {
    const targetId = positional[0];
    if (!targetId) {
      throw new Error("Usage: pi-kit-codex plugin install <id|all> [--build] [--force] [--target <dir>]");
    }

    const pluginIds = targetId === "all" ? Object.keys(MANAGED_PLUGINS) : [targetId];
    for (const id of pluginIds) {
      const result = await installPlugin(id, mergedOptions);
      if (result.method === "existing") {
        stdout(`${id} is already installed with matching checksum: ${result.path}`);
      } else {
        stdout(`Installed ${id} (${result.method}): ${result.path}`);
      }
    }
    return 0;
  }

  if (subCommand === "uninstall") {
    const targetId = positional[0];
    if (!targetId) {
      throw new Error("Usage: pi-kit-codex plugin uninstall <id|all> [--target <dir>]");
    }

    const pluginIds = targetId === "all" ? Object.keys(MANAGED_PLUGINS) : [targetId];
    for (const id of pluginIds) {
      const result = uninstallPlugin(id, mergedOptions);
      if (result.uninstalled) {
        stdout(`Uninstalled ${id}: ${result.path}`);
      } else {
        stdout(`${id} is not installed: ${result.path}`);
      }
    }
    return 0;
  }

  throw new Error(`Unknown plugin command: ${subCommand}`);
}

function parsePluginFlags(args: string[]): {
  flags: { build?: boolean; force?: boolean; target?: string };
  positional: string[];
} {
  const flags: { build?: boolean; force?: boolean; target?: string } = {};
  const positional: string[] = [];

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg === "--build") {
      flags.build = true;
    } else if (arg === "--force") {
      flags.force = true;
    } else if (arg === "--target") {
      const next = args[++i];
      if (!next) throw new Error("--target requires a directory path");
      flags.target = next;
    } else if (arg.startsWith("--target=")) {
      flags.target = arg.slice("--target=".length);
    } else if (arg.startsWith("-")) {
      throw new Error(`Unknown option: ${arg}`);
    } else {
      positional.push(arg);
    }
  }

  return { flags, positional };
}

export type { CodexConfigOptions };
