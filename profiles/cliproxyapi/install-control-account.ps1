[CmdletBinding()]
param(
  [switch]$Force
)

$ErrorActionPreference = "Stop"

$Version = "v0.6.0-rc.4"
$FileName = "control-account-linux-amd64.so"
$ExpectedSha256 = "5925524105d627eac91e39c2097e4a63c44caa8f642ce7044dd574d11ba106ea"
$Uri = "https://github.com/Clowraider/cli-control-account/releases/download/$Version/$FileName"
$PluginDirectory = Join-Path $PSScriptRoot "..\..\..\CLIProxyAPI\plugins"

if (-not (Test-Path -LiteralPath $PluginDirectory -PathType Container)) {
  throw "Plugin directory not found: $PluginDirectory. Run this script from a pi-kit checkout beside a CLIProxyAPI checkout, or copy the script into the CLIProxyAPI root before running it."
}

$Destination = Join-Path $PluginDirectory $FileName
if ((Test-Path -LiteralPath $Destination -PathType Leaf) -and -not $Force) {
  throw "Plugin already exists: $Destination. Verify its version/checksum or rerun with -Force to replace it."
}

$TemporaryFile = Join-Path $env:TEMP "$FileName.$([guid]::NewGuid().ToString('N')).download"
try {
  Invoke-WebRequest -Uri $Uri -OutFile $TemporaryFile
  $ActualSha256 = (Get-FileHash -LiteralPath $TemporaryFile -Algorithm SHA256).Hash.ToLowerInvariant()
  if ($ActualSha256 -ne $ExpectedSha256) {
    throw "Checksum mismatch. Expected $ExpectedSha256 but received $ActualSha256. The plugin was not installed."
  }

  Move-Item -LiteralPath $TemporaryFile -Destination $Destination -Force
  Write-Host "Installed $FileName ($Version) in $PluginDirectory"
}
finally {
  if (Test-Path -LiteralPath $TemporaryFile -PathType Leaf) {
    Remove-Item -LiteralPath $TemporaryFile -Force
  }
}
