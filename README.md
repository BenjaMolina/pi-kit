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
| `pi-kit-codex doctor` | Read-only connectivity and configuration check. It requests `/models`; it does not send billable inference. |
| `pi-kit-codex status` | Offline-only report of the configured selection and CLIProxyAPI provider registration. It does not run Codex, contact the proxy, or read credentials. |
| `pi-kit-codex use openai` | Actively removes the CLIProxyAPI root selection and root model so Codex returns to its native OpenAI default, while retaining the managed provider registration and existing ChatGPT login. |
| `pi-kit-codex use cliproxyapi` | Actively replaces root `model` and `model_provider` selections with pi-kit's managed CLIProxyAPI selection, preserving the current model name when present. |
| `pi-kit-codex install` | Adds the managed CLIProxyAPI provider configuration and, when the user has no model selection, configures the static default `gpt-5.5`, chosen after development and interoperability testing. It does not validate that model against the current proxy. |
| `pi-kit-codex uninstall` | Removes only the configuration blocks managed by `pi-kit-codex`. |
| `pi-kit-codex plugin list` | Reports available standalone CLIProxyAPI plugins, installation status, and SHA-256 integrity. |
| `pi-kit-codex plugin install <id|all>` | Installs verified plugin `.so` binaries with checksum validation (hybrid download from GitHub release or local Docker `--build`). |
| `pi-kit-codex plugin uninstall <id|all>` | Removes installed standalone CLIProxyAPI plugin binaries. |
| `pi-kit-codex --help` | Shows the supported commands. |

### Codex prerequisites and safety

- **Bun and the command:** use the repository command above now, or Bun package invocation after the next release.
- **Codex:** install it so `codex --version` is available.
- **CLIProxyAPI:** keep the proxy running at the default URL or at the absolute URL in `CLIPROXYAPI_BASE_URL`.
- **Credentials:** set `CLIPROXYAPI_API_KEY` in the environment. It is required to check `/models` and is never written to `config.toml`; the configuration stores only its environment-variable name.

The passive installer preserves user intent: it does not overwrite an existing model or model-provider selection. The active `use` commands deliberately change root selection: `use cliproxyapi` adopts the existing model name into a managed CLIProxyAPI root block, and `use openai` removes a CLIProxyAPI root selection and model so Codex returns to its native OpenAI/ChatGPT default. Both retain the managed CLIProxyAPI registration for a later switch back. If `model_providers.cliproxyapi` already exists without pi-kit management markers, installation and activation fail closed rather than replacing it. Uninstall removes only marked managed blocks and leaves all other Codex settings intact. None of these commands accesses Codex authentication storage.

### Verify and troubleshoot Codex

Run `pi-kit-codex doctor` before and after installation. A healthy result reports a Codex version, `API key: set`, a managed configuration state, and `Proxy models: reachable`. Use `pi-kit-codex status` when an offline-only confirmation of the selected provider is sufficient.

| Symptom | Resolution |
| --- | --- |
| `CODEX_HOME must be an absolute path` | Set `CODEX_HOME` to an absolute directory, or unset it to use `~/.codex`. |
| `Codex config is not valid TOML` | Repair the reported `config.toml` syntax, then rerun `doctor` or `install`. |
| `Proxy models: unreachable` | Start CLIProxyAPI and verify `CLIPROXYAPI_BASE_URL`, network reachability, and the client API key. |
| `API key: missing` | Set `CLIPROXYAPI_API_KEY` in the terminal or user environment, then open a new terminal or refresh the current one. |
| `model_providers.cliproxyapi already exists without pi-kit markers` | Keep and manage that existing provider yourself, or remove/rename it deliberately before running `install`; pi-kit will not overwrite it. |

Codex cannot dynamically register a provider at runtime. According to OpenAI's [Codex configuration reference](https://developers.openai.com/codex/config-reference/), `model_catalog_json` is loaded at startup; catalog synchronization is outside this MVP. Restart or reload Codex after `install`, either `use` command, or after changing proxy-side model availability. Use `doctor` to check the current proxy's `/models` endpoint separately. `use cliproxyapi` intentionally replaces root model and provider selections; use `install` instead when you only want to register the managed provider without changing an existing selection.

## Copilot CLI + CLIProxyAPI: dynamic BYOK launcher

> **Availability:** Copilot CLI support is present in this repository and will ship in the next package release.

`pi-kit-copilot` dynamically discovers the models exposed by CLIProxyAPI and starts the GitHub Copilot CLI through its official OpenAI-compatible BYOK environment variables. It preserves the exact CLIProxyAPI model ID as the wire model and selects a conservative Copilot catalog ID by family (Claude, Gemini, or GPT) when Copilot's internal catalog needs one.

1. Install GitHub Copilot CLI and start CLIProxyAPI.
2. Set `CLIPROXYAPI_API_KEY`; optionally set `CLIPROXYAPI_BASE_URL` (default: `http://127.0.0.1:8317/v1`).
3. Run `bun ./bin/pi-kit-copilot.ts models`, then `bun ./bin/pi-kit-copilot.ts use <model-id>`.
4. Run `bun ./bin/pi-kit-copilot.ts launch -- <Copilot arguments...>`.

The packaged command is `pi-kit-copilot`. Its non-secret selection state is stored at `$XDG_CONFIG_HOME/pi-kit/copilot.json` (or the platform config directory); it contains only the preferred model ID and `responses`/`completions` wire API, never an API key. Set `PI_KIT_COPILOT_STATE_PATH` for an explicit state location.

| Command | Purpose |
| --- | --- |
| `pi-kit-copilot models` | Dynamically lists the current CLIProxyAPI catalog. No model list is hardcoded. |
| `pi-kit-copilot use <model-id> [--wire-api=responses|completions]` | Validates a currently discovered model and persists the non-secret selection. |
| `pi-kit-copilot status` | Reports the offline selection and state path without reading or printing credentials. |
| `pi-kit-copilot launch -- <args...>` | Locates `copilot` on `PATH` or the Windows WinGet package directory, then starts it with BYOK environment variables. |
| `pi-kit-copilot doctor` | Checks Copilot CLI/version, state, API-key presence, CLIProxyAPI model reachability, and selected-model availability without leaking credentials. |
| `pi-kit-copilot sync` / `vscode` | Reserved for the VS Code Custom Endpoint follow-up. They do not mutate VS Code yet. |

`launch` derives `COPILOT_PROVIDER_BEARER_TOKEN` from the process-local `CLIPROXYAPI_API_KEY`; it does not persist or print it. For Copilot CLI 1.0.86, it sets `COPILOT_PROVIDER_TYPE=openai`, the resolved CLIProxyAPI base URL, `COPILOT_PROVIDER_WIRE_API` (default `responses`), the exact `COPILOT_PROVIDER_WIRE_MODEL`, provider model/catalog IDs, `COPILOT_PROVIDER_MAX_OUTPUT_TOKENS` from discovered output metadata, and `COPILOT_PROVIDER_MAX_PROMPT_TOKENS` as the remaining context budget after reserving output tokens. Run `doctor` before launching when connectivity is uncertain.

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
