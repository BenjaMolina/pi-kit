[CmdletBinding()]
param(
  [string]$Version = "1.0.0"
)

$ErrorActionPreference = "Stop"
if ($Version -notmatch '^[0-9]+\.[0-9]+\.[0-9]+(?:[-+][0-9A-Za-z.-]+)?$') {
  throw "Version must be a semantic version (for example 1.0.0)."
}

$pluginDir = (Resolve-Path -LiteralPath (Split-Path -Parent $PSCommandPath)).Path
$outputName = "codex-catalog-display-name-linux-amd64-v$Version.so"
$output = Join-Path $pluginDir $outputName

# The source directory is the only mounted input/output surface. No Compose file,
# service, configuration, credentials, or container belonging to CLIProxyAPI is read.
docker run --rm --platform linux/amd64 `
  -v "${pluginDir}:/src" `
  -w /src `
  golang:1.26 `
  sh -c "CGO_ENABLED=1 GOOS=linux GOARCH=amd64 go build -buildmode=c-shared -trimpath -o '/src/$outputName' . && rm -f '/src/$($outputName -replace '\.so$', '.h')'"

if (-not (Test-Path -LiteralPath $output)) { throw "Build did not produce $output" }
Get-FileHash -Algorithm SHA256 -LiteralPath $output
Write-Host "Built $output"
