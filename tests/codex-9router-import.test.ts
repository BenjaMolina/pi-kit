import { describe, expect, test } from "bun:test";
import { spawnSync } from "node:child_process";
import { resolve } from "node:path";

const SCRIPT = resolve(import.meta.dir, "../scripts/import-codex-9router.ps1");
const ACCESS = "synthetic-access-token";
const REFRESH = "synthetic-refresh-token";
const ID = "synthetic-id-token";
const PASSWORD = "synthetic-password";
const powershell = process.env.PWSH ?? (process.platform === "win32" ? "powershell.exe" : "pwsh");

function runPowerShell(body: string) {
  const escapedScript = SCRIPT.replaceAll("'", "''");
  const command = `
$ErrorActionPreference = 'Stop'
$global:capturedOutput = @()
$global:requests = [System.Collections.Generic.List[object]]::new()
$global:mode = 'normal'
function Test-Path { param($LiteralPath, [switch]$PathType) return $LiteralPath -eq 'synthetic-auth.json' }
function Get-Content { param($LiteralPath, [switch]$Raw, $ErrorAction) if ($LiteralPath -ne 'synthetic-auth.json') { throw 'unexpected auth path' }; return $global:authJson }
function Read-Host { param($Prompt, [switch]$AsSecureString); return ConvertTo-SecureString '${PASSWORD}' -AsPlainText -Force }
function Invoke-RestMethod {
  param($Method, $Uri, $WebSession, $Body, $ContentType, $MaximumRedirection, $ErrorAction)
  $global:requests.Add([pscustomobject]@{ Method=$Method; Uri=[string]$Uri; Session=[string]([Runtime.CompilerServices.RuntimeHelpers]::GetHashCode($WebSession)); Body=$Body; Redirect=$MaximumRedirection })
  if ($Uri -like '*/api/auth/login') {
    if ($global:mode -eq 'login-reject') { return @{ success = $false } }
    return @{ success = $true }
  }
  if ($global:mode -eq 'import-error') { throw 'raw response ${ACCESS} ${PASSWORD}' }
  if ($global:mode -eq 'zero-import') { return @{ success = 0; failed = 1; results = @(@{ index = 0; ok = $false }) } }
  if ($global:mode -eq 'boolean-import') { return @{ success = $true; failed = 0; results = @(@{ index = 0; ok = $true; id = 'synthetic-id' }) } }
  if ($global:mode -eq 'wrong-index') { return @{ success = 1; failed = 0; results = @(@{ index = 1; ok = $true; id = 'synthetic-id' }) } }
  if ($global:mode -eq 'missing-index') { return @{ success = 1; failed = 0; results = @(@{ ok = $true; id = 'synthetic-id' }) } }
  return @{ success = 1; failed = 0; results = @(@{ index = 0; ok = $true; id = 'synthetic-id' }) }
}
${body}
$result = [ordered]@{ caught=$false; message=''; requests=@($global:requests); output=@($global:capturedOutput) }
try {
  & '${escapedScript}' -AuthPath 'synthetic-auth.json' -BaseUrl $global:baseUrl -Password (ConvertTo-SecureString '${PASSWORD}' -AsPlainText -Force) 6>&1 | ForEach-Object { $global:capturedOutput += [string]$_ }
} catch { $result.caught=$true; $result.message=$_.Exception.Message }
$result.requests=@($global:requests)
$result.output=@($global:capturedOutput)
$result | Microsoft.PowerShell.Utility\\ConvertTo-Json -Depth 8 -Compress
exit 0
`;
  return spawnSync(powershell, ["-NoLogo", "-NoProfile", "-NonInteractive", "-Command", command], {
    encoding: "utf8",
    timeout: 15_000,
  });
}

function execute(mode: string, authJson: string, baseUrl = "http://127.0.0.1:20128") {
  const setup = `$global:mode='${mode}'; $global:authJson='${authJson.replaceAll("'", "''")}'; $global:baseUrl='${baseUrl.replaceAll("'", "''")}'; $global:capturedOutput=@()`;
  const result = runPowerShell(`${setup}\n`);
  expect(result.error).toBeUndefined();
  expect(result.status, result.stderr).toBe(0);
  const line = result.stdout.trim().split(/\r?\n/).at(-1)!;
  return JSON.parse(line) as { caught: boolean; message: string; requests: Array<Record<string, unknown>>; output: string[] };
}

describe("Codex 9Router import script", () => {
  test("rejects malformed auth without making requests", () => {
    const result = execute("normal", JSON.stringify({ tokens: { access_token: ACCESS, refresh_token: "", id_token: ID } }));
    expect(result.caught).toBe(true);
    expect(result.message).toContain("invalid refresh_token");
    expect(result.requests).toHaveLength(0);
  });

  test("rejects non-loopback URLs before making requests", () => {
    const result = execute("normal", JSON.stringify({ tokens: { access_token: ACCESS, refresh_token: REFRESH, id_token: ID } }), "http://example.com");
    expect(result.caught).toBe(true);
    expect(result.message).toContain("loopback-only HTTP URL");
    expect(result.requests).toHaveLength(0);
  });

  test("performs sequential requests with one session and only allowlisted token fields", () => {
    const result = execute("normal", JSON.stringify({ tokens: { access_token: ACCESS, refresh_token: REFRESH, id_token: ID, extra: "must-not-send" }, other: "ignored" }));
    expect(result.caught, result.message).toBe(false);
    expect(result.requests).toHaveLength(2);
    const [login, bulk] = result.requests;
    expect(login.Uri).toBe("http://127.0.0.1:20128/api/auth/login");
    expect(bulk.Uri).toBe("http://127.0.0.1:20128/api/oauth/codex/bulk-import");
    expect(login.Session).toBe(bulk.Session);
    expect(login.Redirect).toBe(0);
    expect(bulk.Redirect).toBe(0);
    expect(JSON.parse(String(login.Body))).toEqual({ password: PASSWORD });
    expect(JSON.parse(String(bulk.Body))).toEqual({ accounts: [{ accessToken: ACCESS, refreshToken: REFRESH, idToken: ID }] });
    expect(result.output.join(" ")).not.toMatch(new RegExp(`${ACCESS}|${REFRESH}|${ID}|${PASSWORD}`));
  });

  test("login rejection prevents import", () => {
    const result = execute("login-reject", JSON.stringify({ tokens: { access_token: ACCESS, refresh_token: REFRESH, id_token: ID } }));
    expect(result.caught).toBe(true);
    expect(result.requests).toHaveLength(1);
    expect(result.message).not.toContain(ACCESS);
  });

  test("rejects an import with zero successes and one failure", () => {
    const result = execute("zero-import", JSON.stringify({ tokens: { access_token: ACCESS, refresh_token: REFRESH, id_token: ID } }));
    expect(result.caught).toBe(true);
    expect(result.requests).toHaveLength(2);
    expect(result.message.toLowerCase()).toContain("check");
    expect(result.message.toLowerCase()).toContain("dashboard");
  });

  test("rejects boolean success instead of exact numeric counts", () => {
    const result = execute("boolean-import", JSON.stringify({ tokens: { access_token: ACCESS, refresh_token: REFRESH, id_token: ID } }));
    expect(result.caught).toBe(true);
    expect(result.requests).toHaveLength(2);
  });

  test("rejects missing token properties with a specific safe message", () => {
    const result = execute("normal", JSON.stringify({ tokens: { access_token: ACCESS, id_token: ID } }));
    expect(result.caught).toBe(true);
    expect(result.message).toContain("invalid refresh_token");
    expect(result.requests).toHaveLength(0);
  });

  test("rejects a result with the wrong account index", () => {
    const result = execute("wrong-index", JSON.stringify({ tokens: { access_token: ACCESS, refresh_token: REFRESH, id_token: ID } }));
    expect(result.caught).toBe(true);
    expect(result.requests).toHaveLength(2);
    expect(result.message.toLowerCase()).toContain("check");
  });

  test("rejects a result with a missing account index", () => {
    const result = execute("missing-index", JSON.stringify({ tokens: { access_token: ACCESS, refresh_token: REFRESH, id_token: ID } }));
    expect(result.caught).toBe(true);
    expect(result.requests).toHaveLength(2);
  });

  test("sanitizes ambiguous import failure and never retries or prints secrets", () => {
    const result = execute("import-error", JSON.stringify({ tokens: { access_token: ACCESS, refresh_token: REFRESH, id_token: ID } }));
    expect(result.caught).toBe(true);
    expect(result.requests).toHaveLength(2);
    expect(`${result.message} ${result.output.join(" ")}`).not.toMatch(new RegExp(`${ACCESS}|${PASSWORD}`));
    expect(result.message.toLowerCase()).toContain("check");
    expect(result.message.toLowerCase()).toContain("dashboard");
  });

  test("PowerShell parser accepts the script", () => {
    const parsed = spawnSync(powershell, ["-NoLogo", "-NoProfile", "-NonInteractive", "-Command", `$tokens=$null; $errors=$null; [System.Management.Automation.Language.Parser]::ParseFile('${SCRIPT.replaceAll("'", "''")}', [ref]$tokens, [ref]$errors) | Out-Null; if ($errors.Count) { $errors | ForEach-Object { Write-Error $_.Message }; exit 1 }`], { encoding: "utf8", timeout: 15_000 });
    expect(parsed.error).toBeUndefined();
    expect(parsed.status).toBe(0);
  });
});
