# BenjaMolina Pi Kit

Personal, reusable resources for [Pi](https://github.com/earendil-works/pi-mono), packaged for consistent installation across machines.

## Included resources

### CLIProxyAPI local Docker profile

[`profiles/cliproxyapi`](profiles/cliproxyapi/README.md) is a reproducible local Docker profile: secret-free configuration templates, a loopback-only Compose override, and a checksum-verified installer for the optional Control Account quota dashboard.

### CLIProxyAPI dynamic provider

`extensions/cliproxyapi-dynamic-provider.ts` registers a Pi provider named `cliproxyapi`. It discovers the models currently exposed by a running [CLIProxyAPI](https://github.com/router-for-me/CLIProxyAPI) instance.

The extension prefers CLIProxyAPI's enriched model catalog and falls back to the standard OpenAI-compatible `/v1/models` response. CLIProxyAPI remains responsible for provider credentials, account rotation, and load balancing.

## Install

Install globally from a pinned Git tag:

```powershell
pi install git:https://github.com/BenjaMolina/pi-kit.git@v0.1.0
```

For local development:

```powershell
pi install C:\Github\Ordico\pi-kit
```

Pi packages run with the current user's permissions. Review extensions before installing or updating them.

## Configure CLIProxyAPI

CLIProxyAPI must be running and its client API key (from `config.yaml` under `api-keys`, not the management key) must be available to the Pi process.

### 1. Set environment variables (persistent)

In PowerShell:

```powershell
[Environment]::SetEnvironmentVariable(
  "CLIPROXYAPI_BASE_URL",
  "http://127.0.0.1:8317/v1",
  "User"
)

[Environment]::SetEnvironmentVariable(
  "CLIPROXYAPI_API_KEY",
  "replace-with-the-client-api-key",
  "User"
)
```

`CLIPROXYAPI_BASE_URL` is optional and defaults to `http://127.0.0.1:8317/v1`. Never commit the actual API key.

### 2. Refresh existing terminal without closing

If you already have a PowerShell window open, refresh the environment variables into the current session immediately:

```powershell
'CLIPROXYAPI_API_KEY','CLIPROXYAPI_BASE_URL' | ForEach-Object {
  Set-Item "Env:$_" ([Environment]::GetEnvironmentVariable($_, 'User'))
}
```

Alternatively, fully close all Windows Terminal windows and open a new one.

Verify they are loaded:

```powershell
$env:CLIPROXYAPI_API_KEY
```

## Use in Pi

1. Start CLIProxyAPI.
2. Start or reload Pi.
3. Open `/model` or press `Ctrl+L`.
4. Search for the `cliproxyapi` provider.
5. Select a model. Press `Ctrl+S` to save it as the startup default.

After adding or removing provider accounts in CLIProxyAPI, use `/reload`, restart Pi, or run `pi update --models` to refresh the catalog.

## Enable only what you need

This repository can contain extensions, themes, skills, and prompts. Use `pi config` to enable or disable individual resources after installation.

The package follows Pi's conventional resource directories:

```text
extensions/
themes/
skills/
prompts/
```

Machine-specific secrets and endpoints must stay in environment variables or ignored local files.

## Develop

Run the focused tests:

```powershell
bun test
```

Try the package without installing it permanently:

```powershell
pi -e C:\Github\Ordico\pi-kit --list-models cliproxyapi
```

## Attribution

The initial CLIProxyAPI dynamic-provider implementation is based on code shared by [j0k3r-dev-rgl](https://github.com/j0k3r-dev-rgl) and reused with the author's permission. It was adapted for this package and Pi's current dynamic-provider API.
