# BenjaMolina Pi Kit

Personal, reusable resources for [Pi](https://github.com/earendil-works/pi-mono), packaged for consistent installation across machines.

## Included resources

### CLIProxyAPI local Docker profile

[`profiles/cliproxyapi`](profiles/cliproxyapi/README.md) is a reproducible local Docker profile: secret-free configuration templates, a loopback-only Compose override, and a checksum-verified installer for the optional Control Account quota dashboard.

### CLIProxyAPI dynamic providers

`extensions/cliproxyapi-dynamic-provider.ts` registers a Pi provider named `cliproxyapi`, while `opencode/cliproxyapi.ts` is an [OpenCode](https://opencode.ai/) local plugin for OpenCode 1.18.18. Both discover the models currently exposed by a running [CLIProxyAPI](https://github.com/router-for-me/CLIProxyAPI) instance.

They prefer CLIProxyAPI's enriched `/v1/models?client_version=1` catalog and fall back to the standard OpenAI-compatible `/v1/models` response. CLIProxyAPI remains responsible for provider credentials, account rotation, and load balancing.

## Install

Install globally from a pinned Git tag:

```powershell
pi install git:https://github.com/BenjaMolina/pi-kit.git@v0.3.0
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

## Use in OpenCode 1.18.18

This package includes a local OpenCode plugin at `opencode/cliproxyapi.ts`; it does not change Pi's extension loading. The entry module intentionally has exactly one default plugin-function export, which is OpenCode 1.18.18's external-plugin loading contract. Keep the repository available on disk, then add its file URI to an OpenCode configuration file (project or global), merging it with any existing `plugin` entries:

```json
{
  "$schema": "https://opencode.ai/config.json",
  "plugin": [
    "file:///C:/Github/Ordico/pi-kit/opencode/cliproxyapi.ts"
  ]
}
```

Use forward slashes in a Windows file URI and replace the path with your clone or installed package location. Start or reload OpenCode after setting `CLIPROXYAPI_API_KEY`; the plugin's `config` hook discovers the catalog during that load. Restart or reload OpenCode after CLIProxyAPI account/model changes because the injected catalog is a startup snapshot.

OpenCode invokes the plugin function, then invokes its returned `config` hook while resolving the model catalog. The hook registers `cliproxyapi` with `@ai-sdk/openai-compatible`, the resolved `CLIPROXYAPI_BASE_URL`, and the process-only API key. It maps safe context/output limits, text and image input modalities, and `reasoning: true` for reasoning-capable model variants. When discovered models share a display name, the unscoped model keeps the clean name and scoped variants show their scope—for example, `Gemini 3.8 Flash [agy-bmolina]`—without changing their IDs or routing. OpenCode 1.18.18 does not expose Pi's discrete thinking-level map through this provider configuration, so the catalog's reasoning variants are represented as separate model entries rather than a reasoning-effort selector.

OpenCode startup remains usable if the key is missing or CLIProxyAPI is stopped/unreachable: the plugin leaves its configuration unchanged and injects no `cliproxyapi` provider. This intentionally avoids logging or persisting credentials. The local plugin requires OpenCode 1.18.18's current `config` hook and an OpenAI-compatible CLIProxyAPI chat-completions endpoint.

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
