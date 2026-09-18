import { spawn } from "node:child_process";
import { resolveCLIProxyBaseUrl } from "../cliproxyapi/models";
import { readCodexConfig, resolveCodexHome, type CodexConfigOptions } from "./config";

export type CodexCommandResult = {
  available: boolean;
  version?: string;
};

export type CodexDoctorOptions = CodexConfigOptions & {
  fetch?: typeof globalThis.fetch;
  runCodex?: () => Promise<CodexCommandResult>;
};

export type CodexDoctorReport = {
  codex: string;
  apiKey: "set" | "missing";
  baseUrl: string;
  config: string;
  proxyModels: string;
};

export async function runCodexVersion(): Promise<CodexCommandResult> {
  return new Promise((resolve) => {
    const child = spawn("codex", ["--version"], { stdio: ["ignore", "pipe", "ignore"] });
    let output = "";
    child.stdout?.on("data", (chunk: Buffer) => { output += chunk.toString(); });
    child.once("error", () => resolve({ available: false }));
    child.once("close", (code) => resolve(code === 0
      ? { available: true, version: output.trim() || "available" }
      : { available: false }));
  });
}

export function sanitizeBaseUrl(value: string): string {
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

export async function doctorCodexCLIProxyAPI(options: CodexDoctorOptions = {}): Promise<CodexDoctorReport> {
  const env = options.env ?? process.env;
  resolveCodexHome(env, options.homedir);
  const apiKey = env.CLIPROXYAPI_API_KEY?.trim();
  const baseUrl = sanitizeBaseUrl(resolveCLIProxyBaseUrl(env.CLIPROXYAPI_BASE_URL));
  const codexResult = await (options.runCodex ?? runCodexVersion)();
  const config = await configState(options);
  const proxyModels = apiKey ? await probeModels(baseUrl, apiKey, options.fetch ?? globalThis.fetch) : "not checked (API key missing)";

  return {
    codex: codexResult.available ? codexResult.version ?? "available" : "not found",
    apiKey: apiKey ? "set" : "missing",
    baseUrl,
    config,
    proxyModels,
  };
}

async function configState(options: CodexConfigOptions): Promise<string> {
  try {
    const { content, blocks } = await readCodexConfig(options);
    if (!content) return "not installed";
    if (blocks.root && blocks.provider) return "managed root and provider installed";
    if (blocks.provider) return "managed provider installed (user model selection preserved)";
    return "not installed";
  } catch {
    return "invalid or unsafe";
  }
}

async function probeModels(baseUrl: string, apiKey: string, fetchModels: typeof globalThis.fetch): Promise<string> {
  try {
    const response = await fetchModels(`${baseUrl}/models`, {
      headers: { Authorization: `Bearer ${apiKey}` },
      signal: AbortSignal.timeout(5_000),
    });
    return response.ok ? "reachable" : `unreachable (HTTP ${response.status})`;
  } catch {
    return "unreachable";
  }
}
