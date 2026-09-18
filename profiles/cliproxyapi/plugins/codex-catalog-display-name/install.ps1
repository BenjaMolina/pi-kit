[CmdletBinding()]
param(
  [Parameter(Mandatory = $true)]
  [string]$Artifact,
  [Parameter(Mandatory = $true)]
  [string]$Sha256,
  [string]$Target,
  [switch]$Force
)

$ErrorActionPreference = "Stop"
$pluginID = "codex-catalog-display-name"
$artifactPath = (Resolve-Path -LiteralPath $Artifact).Path
if ((Split-Path -Leaf $artifactPath) -notmatch '^codex-catalog-display-name-linux-amd64-v.+\.so$') {
  throw "Artifact must be a versioned codex-catalog-display-name Linux amd64 .so file."
}
if ($Sha256 -notmatch '^[a-fA-F0-9]{64}$') { throw "Sha256 must be a 64-character hexadecimal SHA-256 digest." }
$actual = (Get-FileHash -Algorithm SHA256 -LiteralPath $artifactPath).Hash
if (-not [string]::Equals($actual, $Sha256, [StringComparison]::OrdinalIgnoreCase)) {
  throw "SHA-256 mismatch; refusing to install artifact."
}

if (-not $Target) {
  # This source tree is pi-kit/profiles/cliproxyapi/plugins/<plugin>; the
  # documented default is a sibling CLIProxyAPI checkout under its parent.
  $checkoutParent = Split-Path -Parent (Split-Path -Parent (Split-Path -Parent (Split-Path -Parent (Split-Path -Parent $PSScriptRoot))))
  $defaultCLIProxyRoot = Join-Path $checkoutParent "CLIProxyAPI"
  $composeFiles = Get-ChildItem -Path $defaultCLIProxyRoot -Filter 'docker-compose*.yml' -File -ErrorAction SilentlyContinue
  $mountLine = $composeFiles | Select-String -Pattern '\$\{CLI_PROXY_PLUGIN_PATH:-\./plugins\}:/CLIProxyAPI/plugins' | Select-Object -First 1
  if (-not $mountLine) {
    throw "Could not detect the standard CLIProxyAPI Compose plugin mount. Pass -Target <CLIProxyAPI plugins directory>."
  }
  $Target = Join-Path (Split-Path -Parent $mountLine.Path) "plugins"
}

$targetDir = [IO.Path]::GetFullPath($Target)
if (-not (Test-Path -LiteralPath $targetDir -PathType Container)) { throw "Target directory does not exist: $targetDir" }
$destination = Join-Path $targetDir "$pluginID.so"
if ((Test-Path -LiteralPath $destination) -and -not $Force) {
  throw "Refusing to overwrite $destination. Re-run with -Force only after verifying the target."
}
Copy-Item -LiteralPath $artifactPath -Destination $destination -Force:$Force
$installed = (Get-FileHash -Algorithm SHA256 -LiteralPath $destination).Hash
if (-not [string]::Equals($installed, $Sha256, [StringComparison]::OrdinalIgnoreCase)) {
  throw "Installed file checksum mismatch; inspect $destination before use."
}
Write-Host "Installed $destination"
