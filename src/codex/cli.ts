import { doctorCodexCLIProxyAPI, type CodexDoctorOptions } from "./doctor";
import {
  activateCodexCLIProxyAPI,
  deactivateCodexCLIProxyAPI,
  getCodexCLIProxyAPIStatus,
  installCodexCLIProxyAPI,
  uninstallCodexCLIProxyAPI,
  type CodexConfigOptions,
} from "./config";

export type CodexCLIOptions = CodexDoctorOptions & {
  stdout?: (line: string) => void;
  stderr?: (line: string) => void;
};

const HELP = [
  "Usage: pi-kit-codex <command>",
  "",
  "Commands:",
  "  doctor       Report Codex, configuration, and CLIProxyAPI connectivity status.",
  "  status       Report offline provider selection and registration status.",
  "  use openai   Remove only pi-kit's managed CLIProxyAPI selection.",
  "  use cliproxyapi  Activate pi-kit's managed CLIProxyAPI selection when safe.",
  "  install      Install the managed CLIProxyAPI Codex configuration blocks.",
  "  uninstall    Remove only the managed CLIProxyAPI Codex configuration blocks.",
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
      stdout(result.changed ? `Installed CLIProxyAPI Codex configuration: ${result.path}` : `CLIProxyAPI Codex configuration is already installed: ${result.path}`);
      return 0;
    }
    if (command === "uninstall") {
      const result = await uninstallCodexCLIProxyAPI(options);
      stdout(result.changed ? `Removed managed CLIProxyAPI Codex configuration: ${result.path}` : `No managed CLIProxyAPI Codex configuration found: ${result.path}`);
      return 0;
    }
    if (command === "use") {
      const target = args[1];
      if (args.length !== 2 || (target !== "openai" && target !== "cliproxyapi")) {
        throw new Error("Usage: pi-kit-codex use <openai|cliproxyapi>");
      }
      const result = target === "openai"
        ? await deactivateCodexCLIProxyAPI(options)
        : await activateCodexCLIProxyAPI(options);
      if (target === "cliproxyapi" && !result.managedRoot) {
        stdout(`CLIProxyAPI selection was not changed because an explicit user selection is present: ${result.path}`);
      } else {
        const action = target === "openai" ? "Switched to OpenAI default" : "Activated CLIProxyAPI selection";
        stdout(result.changed ? `${action}: ${result.path}` : `${action} unchanged: ${result.path}`);
      }
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
      return 0;
    }
    stderr(`Unknown command: ${command}\n\n${HELP}`);
    return 1;
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    stderr(`pi-kit-codex: ${message}`);
    return 1;
  }
}

export type { CodexConfigOptions };
