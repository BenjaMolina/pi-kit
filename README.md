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
| `pi-kit-codex 9router install` | Adds the managed 9Router provider to `config.toml` and creates the managed `$CODEX_HOME/9router.config.toml` profile selecting 9Router and default model `gpt-5.5` without altering root/default Codex selection. |
| `pi-kit-codex 9router status` | Offline-only report of the 9Router provider and profile registration status without contacting the proxy or reading credentials. |
| `pi-kit-codex 9router uninstall` | Removes only the managed 9Router provider block from `config.toml` and the managed `9router.config.toml` profile. |
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
| `model_providers.9router already exists without pi-kit markers` | Keep and manage that existing provider yourself, or remove/rename it deliberately before running `9router install`; pi-kit will not overwrite it. |
| `9router profile already exists without pi-kit markers` | Manage the existing `$CODEX_HOME/9router.config.toml` profile yourself, or remove/rename it before running `9router install`. |
| `NINEROUTER_BASE_URL must be an absolute URL` | Set `NINEROUTER_BASE_URL` to a valid absolute URL (e.g. `http://127.0.0.1:20128/v1`). |

Codex cannot dynamically register a provider at runtime. According to OpenAI's [Codex configuration reference](https://developers.openai.com/codex/config-reference/), `model_catalog_json` is loaded at startup; catalog synchronization is outside this MVP. Restart or reload Codex after `install`, either `use` command, or after changing proxy-side model availability. Use `doctor` to check the current proxy's `/models` endpoint separately. `use cliproxyapi` intentionally replaces root model and provider selections; use `install` instead when you only want to register the managed provider without changing an existing selection.

### Codex + 9Router profile

`pi-kit-codex 9router` manages a dedicated profile that lets Codex CLI connect to [9Router](http://127.0.0.1:20128/v1) on demand via `codex -p 9router`:

- **Coexistence:** registers `[model_providers.9router]` in the shared `$CODEX_HOME/config.toml` and creates a separate `$CODEX_HOME/9router.config.toml` layered profile. It leaves root `model` and `model_provider` selections untouched, allowing CLIProxyAPI, native OpenAI, and 9Router to coexist concurrently.
- **Invocation:** launch Codex with `codex -p 9router` to activate 9Router for that session. Regular `codex` invocations continue to use the default provider.
- **Environment variables:**
  - `NINEROUTER_API_KEY`: client API key. Referenced in `config.toml` via `env_key = "NINEROUTER_API_KEY"`; never written to disk or printed.
  - `NINEROUTER_BASE_URL`: optional base URL, defaulting to `http://127.0.0.1:20128/v1`.
  - `NINEROUTER_MODEL`: optional default model identifier override used when creating `$CODEX_HOME/9router.config.toml`, defaulting to `gpt-5.5`.
- **Model overrides:** defaults to `model = "gpt-5.5"`. Override at installation time by setting `NINEROUTER_MODEL`, for a single session using `codex -p 9router -m <model>`, or edit `model = "..."` in `9router.config.toml` directly (pi-kit preserves customized profile models across reinstalls).
- **Safety and rollback:** fails closed on unmarked collisions (`model_providers.9router` in `config.toml` or pre-existing unmanaged `9router.config.toml`). Sequential file mutations in `install` and `uninstall` restore prior bytes and existence if a later step fails, and atomic file replacements clean up temporary files on failure. `pi-kit-codex 9router uninstall` removes only the pi-kit-managed blocks.

## Copilot CLI + CLIProxyAPI: dynamic BYOK launcher

> **Availability:** Copilot CLI support is present in this repository and will ship in the next package release.

`pi-kit-copilot` dynamically discovers the models exposed by CLIProxyAPI and starts the GitHub Copilot CLI through its official OpenAI-compatible BYOK environment variables. It preserves the exact CLIProxyAPI model ID as the wire model and selects a conservative Copilot catalog ID by family (Claude, Gemini, or GPT) when Copilot's internal catalog needs one.

1. Install GitHub Copilot CLI and start CLIProxyAPI.
2. Set `CLIPROXYAPI_API_KEY`; optionally set `CLIPROXYAPI_BASE_URL` (default: `http://127.0.0.1:8317/v1`).
3. Interactively select a model with `bun ./bin/pi-kit-copilot.ts pick`, or launch directly with `bun ./bin/pi-kit-copilot.ts launch --pick -- <Copilot arguments...>`. Use `switch` to select a model and resume Copilot with `--continue`.
4. For scripts and automation, list models with `models` and persist selections with `use <model-id> [--wire-api=...] [--reasoning-effort=<advertised-value>]`, then launch with `launch -- <Copilot arguments...>`.

The packaged command is `pi-kit-copilot`. Its non-secret selection state is stored at `$XDG_CONFIG_HOME/pi-kit/copilot.json` (or the platform config directory); it contains only the preferred model ID, `responses`/`completions` wire API, and optional non-secret `reasoningEffort`, never an API key. Existing state files without `reasoningEffort` remain valid and backward-compatible. Set `PI_KIT_COPILOT_STATE_PATH` for an explicit state location.

| Command | Purpose |
| --- | --- |
| `pi-kit-copilot pick [--wire-api=responses|completions]` | Interactively searches and selects a CLIProxyAPI model, then prompts for reasoning effort when the model advertises authoritative levels, and persists the selection. |
| `pi-kit-copilot switch [--wire-api=responses|completions]` | Interactively selects a model and optional reasoning effort, persists selection, and resumes Copilot with `--continue` and automatic catalog-model override. |
| `pi-kit-copilot models` | Dynamically lists the current CLIProxyAPI catalog. No model list is hardcoded. |
| `pi-kit-copilot use <model-id> [--wire-api=responses|completions] [--reasoning-effort=<level>]` | Validates a currently discovered model and optional model-specific reasoning effort, persisting the non-secret selection for automation. |
| `pi-kit-copilot status` | Reports the offline model selection, wire API, reasoning effort, and state path without reading or printing credentials. |
| `pi-kit-copilot launch [--pick] [--wire-api=...] [-- <args...>]` | Starts Copilot CLI with BYOK environment variables; optionally prompts for model and effort selection (`--pick`) before launch. |
| `pi-kit-copilot doctor` | Checks Copilot CLI/version, state, API-key presence, CLIProxyAPI model reachability, and selected-model availability without leaking credentials. |
| `pi-kit-copilot sync` / `pi-kit-copilot vscode sync` | Discovers the current CLIProxyAPI catalog and synchronizes only pi-kit's user-level VS Code Custom Endpoint provider. It does not restart VS Code. |
| `pi-kit-copilot vscode status` | Reports the managed VS Code provider state and model count without reading or printing credentials. |
| `pi-kit-copilot vscode uninstall` | Removes only the unique pi-kit-managed VS Code Custom Endpoint provider; it is idempotent when absent. |

### Interactive model picker & launch

`pi-kit-copilot pick` opens a dependency-free interactive terminal picker to search and select models from the live CLIProxyAPI catalog:
- **Search & ranking**: live case-insensitive fuzzy and subsequence matching across display name, model ID, and owner, with deterministic ranking and tie-breaking.
- **Navigation & controls**: arrow keys (↑/↓), PageUp/PageDown, Home/End for scrolling through visible models; Enter confirms; Escape or Ctrl+C cancels.
- **Model-specific reasoning effort picker**: when a selected model advertises authoritative reasoning levels in CLIProxyAPI's enriched metadata (`supported_reasoning_levels`), a second interactive picker immediately opens to select the reasoning effort. Available effort options are strictly model-specific and derived solely from each model's authoritative metadata (for example, one model might advertise `low`/`medium`/`high`, another might offer `none`/`minimal`/`xhigh`, or distinct provider-defined levels; options vary by model and agent). pi-kit never assumes a hardcoded universal effort list. If CLIProxyAPI does not advertise authoritative reasoning metadata for the model (or only provides fallback heuristic levels), the second picker is automatically skipped. When the model advertises a default reasoning level, it is preselected.
- **Cancellation**: cancelling either the model picker or the reasoning effort picker with Escape or Ctrl+C is an atomic, safe no-op (exit 0) that leaves previous state untouched, does not persist partial selections, and does not launch Copilot.
- **Session switch & resume**: `pi-kit-copilot switch [--wire-api=responses|completions]` prompts to select a model (and reasoning effort when authoritative levels exist), saves the selection, and immediately resumes Copilot's most recent session using `--continue`. Because native Copilot session journals persist an authoritative catalog model that would otherwise override the new BYOK selection, launch plans for resumed sessions (`--continue`, `--resume`, or `--resume=<value>`) automatically append `--model=<catalogModelId>` when no explicit native `--model` override is present. The exact CLIProxyAPI model ID is always preserved in `COPILOT_PROVIDER_WIRE_MODEL`. Advanced workflows requiring extra native Copilot flags alongside resume should use `pi-kit-copilot launch --pick -- --continue <args...>` (or `--resume=<id> <args...>`), which benefits from the same automatic catalog-model and reasoning-effort handling while preserving your custom flags and explicit model overrides.
- **Combined launch**: `pi-kit-copilot launch --pick [--wire-api=responses|completions] -- <args...>` prompts for a model and reasoning effort first, saves the selection, and immediately launches Copilot with the forwarded arguments. Ordinary `launch -- <args...>` remains deterministic and non-interactive. To pass `--pick` directly to Copilot CLI itself, place it after the separator: `pi-kit-copilot launch -- --pick`.
- **Automation & CLI persistence (`use`)**: for CI and non-interactive scripting, `pi-kit-copilot use <model-id> [--wire-api=responses|completions] [--reasoning-effort=<advertised-value>]` validates that `<model-id>` is currently discovered and that `<advertised-value>` matches one of that model's authoritative advertised levels (matched case-insensitively when unique, preserving provider-advertised casing). The `--reasoning-effort` and `--wire-api` options may be supplied in any order. Specifying `--reasoning-effort` for a model without authoritative reasoning metadata, or passing an unsupported or ambiguous value, fails immediately without modifying state. Non-TTY environments cleanly refuse interactive `pick` and `switch` with an actionable message.

### Why native Copilot `/model` shows GitHub subscription models

GitHub Copilot CLI connects to third-party endpoints only via process-level BYOK environment variables (`COPILOT_PROVIDER_*`). Its built-in `/model` slash command is hardcoded to GitHub's subscription catalog and cannot discover or switch to external proxy models at runtime. pi-kit provides a pre-launch picker so you can select and launch any CLIProxyAPI model before Copilot starts.

### VS Code Custom Endpoint safety

VS Code 1.138.0 reads Custom Endpoints from the user `chatLanguageModels.json`: `%APPDATA%/Code/User/chatLanguageModels.json` on Windows, `$XDG_CONFIG_HOME/Code/User/chatLanguageModels.json` on Linux, and the user Application Support directory on macOS. Set `PI_KIT_COPILOT_VSCODE_PATH` to an absolute path for an explicit test or alternate user-config location. The command never reads or writes workspace settings.

Synchronization creates exactly one `pi-kit CLIProxyAPI` provider with the official `customendpoint`/`responses` format. Its dynamically discovered models use full `/v1/responses` URLs and include tool, vision, context, token, and supported reasoning metadata. The API key remains a secure input reference (`${input:pi-kit-cliproxyapi-api-key}` or an existing user-configured `${input:...}` reference), never a plaintext credential in JSON. On Windows, `sync` automatically encrypts `CLIPROXYAPI_API_KEY` with Windows DPAPI and AES-256-GCM and stores it in VS Code's `state.vscdb` SecretStorage database. Run `pi-kit-copilot doctor` or `pi-kit-copilot vscode status` to verify SecretStorage presence.

The provider is the managed boundary: all unrelated providers and models remain structural JSON values, but JSON formatting may normalize after synchronization. Existing `${input:...}` credential references are preserved across syncs. Synchronization fails closed on malformed JSON, an unsupported root/providers shape, duplicate pi-kit providers, or an ambiguous pi-kit-named provider. Atomic temporary-file replacement leaves the prior file intact if writing or renaming fails; uninstall removes only the unique managed provider and does not launch or restart VS Code.

### Launch and resume behavior

`launch` derives `COPILOT_PROVIDER_BEARER_TOKEN` from the process-local `CLIPROXYAPI_API_KEY`; it does not persist or print it. For Copilot CLI 1.0.86, it sets `COPILOT_PROVIDER_TYPE=openai`, the resolved CLIProxyAPI base URL, `COPILOT_PROVIDER_WIRE_API` (default `responses`), the exact `COPILOT_PROVIDER_WIRE_MODEL`, provider model/catalog IDs, `COPILOT_PROVIDER_MAX_OUTPUT_TOKENS` from discovered output metadata, and `COPILOT_PROVIDER_MAX_PROMPT_TOKENS` as the remaining context budget after reserving output tokens.

When resuming a session via `--continue`, `--resume`, or `--resume=<value>`, the launch plan automatically appends `--model=<catalogModelId>` to override the session journal's persisted model unless an explicit user `--model` override is provided, ensuring Copilot's internal validation succeeds while routing to the exact proxy wire model.

When a persisted `reasoningEffort` is present in state, `launch` revalidates it against fresh CLIProxyAPI metadata at startup. If the model still advertises authoritative levels containing that effort (reconciled case-insensitively when unique to the provider's advertised spelling), pi-kit passes `--reasoning-effort=<level>` to GitHub Copilot CLI for both new and resumed sessions. Explicit native reasoning effort overrides passed directly to Copilot (such as `--reasoning-effort <level>` or `--reasoning-effort=<level>`) always take precedence over the persisted selection. If the persisted effort is no longer supported, the model no longer exposes authoritative reasoning levels, or the value is ambiguous, launch fails fast with an actionable error instead of silently downgrading or dropping the effort. Run `doctor` before launching when connectivity is uncertain.

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
