# BenjaMolina Pi Kit

Reusable resources for [Pi](https://github.com/earendil-works/pi-mono) and an [OpenCode](https://opencode.ai/) CLIProxyAPI plugin, published as `@benjamolina/pi-kit`.

## Codex + CLIProxyAPI: quick path

> **Availability:** Codex support is present in this repository and will ship in the next package release. The currently published `@benjamolina/pi-kit@0.3.1` does not include it.

For Codex CLI, the IDE extension, or the desktop app:

1. Install [Codex](https://developers.openai.com/codex/cli/) and start CLIProxyAPI.
2. Set `CLIPROXYAPI_API_KEY` to a CLIProxyAPI **client** API key. Optionally set `CLIPROXYAPI_BASE_URL`; it defaults to `http://127.0.0.1:8317/v1`.
3. From this checkout, run `bun ./bin/pi-kit-codex.ts doctor`, then `bun ./bin/pi-kit-codex.ts install`.

The packaged command is `pi-kit-codex`. After the next release includes this integration, invoke it with Bun as:

```powershell
bunx --package @benjamolina/pi-kit@<released-version> pi-kit-codex doctor
bunx --package @benjamolina/pi-kit@<released-version> pi-kit-codex install
```

According to OpenAI's [Codex configuration documentation](https://developers.openai.com/codex/config/), Codex CLI, the IDE extension, and the desktop app share the user-level `config.toml`. One install therefore applies to all three.

### Codex command reference

| Command | Purpose |
| --- | --- |
| `pi-kit-codex doctor` | Read-only status check for Codex, environment, managed configuration, and CLIProxyAPI. It requests `/models`; it does not send billable inference. |
| `pi-kit-codex install` | Adds the managed CLIProxyAPI provider configuration and, when the user has no model selection, configures the static default `gpt-5.5`, chosen after development and interoperability testing. It does not validate that model against the current proxy. |
| `pi-kit-codex uninstall` | Removes only the configuration blocks managed by `pi-kit-codex`. |
| `pi-kit-codex --help` | Shows the supported commands. |

### Codex prerequisites and safety

- **Bun and the command:** use the repository command above now, or Bun package invocation after the next release.
- **Codex:** install it so `codex --version` is available.
- **CLIProxyAPI:** keep the proxy running at the default URL or at the absolute URL in `CLIPROXYAPI_BASE_URL`.
- **Credentials:** set `CLIPROXYAPI_API_KEY` in the environment. It is required to check `/models` and is never written to `config.toml`; the configuration stores only its environment-variable name.

The installer preserves user intent: it does not overwrite an existing model or model-provider selection. If `model_providers.cliproxyapi` already exists without pi-kit management markers, installation fails closed rather than replacing it. Uninstall removes only marked managed blocks and leaves all other Codex settings intact.

### Verify and troubleshoot Codex

Run `pi-kit-codex doctor` before and after installation. A healthy result reports a Codex version, `API key: set`, a managed configuration state, and `Proxy models: reachable`.

| Symptom | Resolution |
| --- | --- |
| `CODEX_HOME must be an absolute path` | Set `CODEX_HOME` to an absolute directory, or unset it to use `~/.codex`. |
| `Codex config is not valid TOML` | Repair the reported `config.toml` syntax, then rerun `doctor` or `install`. |
| `Proxy models: unreachable` | Start CLIProxyAPI and verify `CLIPROXYAPI_BASE_URL`, network reachability, and the client API key. |
| `API key: missing` | Set `CLIPROXYAPI_API_KEY` in the terminal or user environment, then open a new terminal or refresh the current one. |
| `model_providers.cliproxyapi already exists without pi-kit markers` | Keep and manage that existing provider yourself, or remove/rename it deliberately before running `install`; pi-kit will not overwrite it. |

Codex cannot dynamically register a provider at runtime. According to OpenAI's [Codex configuration reference](https://developers.openai.com/codex/config-reference/), `model_catalog_json` is loaded at startup; catalog synchronization is outside this MVP. Restart Codex after installation or after changing proxy-side model availability. Use `doctor` to check the current proxy's `/models` endpoint separately.

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

npm releases use Trusted Publishing from the public GitHub repository through `.github/workflows/release-npm.yml`. The workflow requests a short-lived OIDC identity and publishes with npm provenance; it does not accept `NPM_TOKEN` or another long-lived npm credential.

Configure the npm package's GitHub Actions Trusted Publisher with organization or user `BenjaMolina`, repository `pi-kit`, workflow filename `release-npm.yml`, no environment, and direct `npm publish` allowed.

## Attribution

The initial CLIProxyAPI dynamic-provider implementation is based on code shared by [j0k3r-dev-rgl](https://github.com/j0k3r-dev-rgl) and reused with the author's permission. It was adapted for this package and Pi's current dynamic-provider API.

## License

MIT
