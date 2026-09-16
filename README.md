# BenjaMolina Pi Kit

Reusable resources for [Pi](https://github.com/earendil-works/pi-mono) and an [OpenCode](https://opencode.ai/) CLIProxyAPI plugin, published as `@benjamolina/pi-kit`.

## Included resources

### CLIProxyAPI local Docker profile

[`profiles/cliproxyapi`](profiles/cliproxyapi/README.md) is a reproducible local Docker profile: secret-free configuration templates, a loopback-only Compose override, and a checksum-verified installer for the optional Control Account quota dashboard.

### CLIProxyAPI dynamic providers

`extensions/cliproxyapi-dynamic-provider.ts` registers a Pi provider named `cliproxyapi`; the package's external OpenCode entry is `opencode/cliproxyapi.ts`. Both discover models currently exposed by a running [CLIProxyAPI](https://github.com/router-for-me/CLIProxyAPI) instance.

They prefer CLIProxyAPI's enriched `/v1/models?client_version=1` catalog and fall back to the standard OpenAI-compatible `/v1/models` response. CLIProxyAPI remains responsible for provider credentials, account rotation, and load balancing.

## Install

### Pi

Install the pinned npm package:

```powershell
pi install npm:@benjamolina/pi-kit@0.3.1
```

A pinned Git tag remains available as a Pi-only fallback when npm is unavailable:

```powershell
pi install git:https://github.com/BenjaMolina/pi-kit.git@v0.3.1
```

### OpenCode 1.18.18

Add the pinned package name to an OpenCode project or global configuration file, merging with existing `plugin` values:

```json
{
  "$schema": "https://opencode.ai/config.json",
  "plugin": [
    "@benjamolina/pi-kit@0.3.1"
  ]
}
```

OpenCode resolves the package's external `main`/`exports` entry automatically. No checkout path, file URI, or local plugin reference is required.

Pi packages and OpenCode plugins run with the current user's permissions. Review extensions before installing or updating them.

## Configure CLIProxyAPI

CLIProxyAPI must be running and its client API key (from `config.yaml` under `api-keys`, not the management key) must be available to the Pi or OpenCode process.

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

### 2. Refresh an existing terminal

```powershell
'CLIPROXYAPI_API_KEY','CLIPROXYAPI_BASE_URL' | ForEach-Object {
  Set-Item "Env:$_" ([Environment]::GetEnvironmentVariable($_, 'User'))
}
```

Alternatively, open a new terminal. Verify the key is loaded:

```powershell
$env:CLIPROXYAPI_API_KEY
```

## Use in Pi

1. Start CLIProxyAPI.
2. Start or reload Pi.
3. Open `/model` or press `Ctrl+L`.
4. Search for the `cliproxyapi` provider.
5. Select a model. Press `Ctrl+S` to save it as the startup default.

After CLIProxyAPI account or model changes, use `/reload`, restart Pi, or run `pi update --models` to refresh the catalog.

## Use in OpenCode 1.18.18

Restart or reload OpenCode after setting `CLIPROXYAPI_API_KEY`. Its plugin config hook discovers the catalog and registers `cliproxyapi` through `@ai-sdk/openai-compatible`, using the resolved base URL and only the process-local API key.

The catalog maps safe context/output limits, text and image input modalities, and `reasoning: true` for reasoning-capable model variants. If display names collide, the unscoped model retains the clean name and scoped variants include their scope without changing IDs. OpenCode does not expose Pi's discrete thinking-level map through this provider configuration, so reasoning variants are represented as separate model entries.

Startup remains usable when the key is missing or CLIProxyAPI is unreachable: the plugin leaves the existing OpenCode configuration unchanged and injects no `cliproxyapi` provider. Credentials are neither logged nor persisted.

## Develop

```powershell
npm ci
npm test
npm run test:pack
```

`npm run test:pack` creates a real npm tarball, rejects repository-only files, installs it into isolated temporary consumers, then verifies Pi and OpenCode 1.18.18 load the packaged TypeScript sources. It sets isolated home/config/cache paths and never reads or writes user configuration.

## Maintainer release

The initial `v0.3.1` npm publication uses the `NPM_TOKEN` GitHub repository secret as a bootstrap-only credential. After that first publication, configure npm Trusted Publisher for repository `BenjaMolina/pi-kit` and workflow `release-npm.yml`, then remove the secret and update the release workflow to use trusted publishing.

## Attribution

The initial CLIProxyAPI dynamic-provider implementation is based on code shared by [j0k3r-dev-rgl](https://github.com/j0k3r-dev-rgl) and reused with the author's permission. It was adapted for this package and Pi's current dynamic-provider API.

## License

MIT
