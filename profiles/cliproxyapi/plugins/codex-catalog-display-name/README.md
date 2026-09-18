# Codex catalog display-name plugin

A standalone CLIProxyAPI ABI v1 / RPC schema v6 Go shared-library plugin. It
adds each scoped catalog entry's account scope to its display name, so duplicate
entries remain distinguishable in clients that consume CLIProxyAPI's
`{"models":[...]}` catalog.

It deliberately declares **only** `response_interceptor` and serves only:

```text
plugin.register
plugin.reconfigure
response.intercept_after
```

Unknown methods return a structured RPC error. The plugin has no configuration,
no network access, and no logging.

## Behavior and safety

The interceptor changes a response only when all of these are true:

- `SourceFormat` is `openai`, `StatusCode` is `200`, and `Stream` is `false`.
- The root body is a JSON object containing a `models` array.
- An entry has a structurally valid `slug` matching `<scope>/<model>` and a
  non-empty `display_name`. Both scope and model must be nonblank after
  trimming whitespace.

It rewrites only that display name to `display_name · <scope>`, where `<scope>`
is the complete prefix before the first `/`. For example,
`claude-gedo/claude-fable-5` becomes `Claude Fable 5 · claude-gedo`,
`agy-bmolina/gemini-3.8-flash-high` becomes
`Gemini 3.8 Flash · agy-bmolina`, and
`codex-jhoel/gpt-5.6-sol` becomes `GPT 5.6 Sol · codex-jhoel`. The plugin does
not use a provider or model allowlist; a later slash remains part of the model
component. A name already ending in that exact complete-scope suffix is
unchanged. Unscoped entries, malformed scoped entries, other entries, headers,
and all non-target fields stay untouched. Non-catalog
OpenAI `{"object":"list","data":[...]}` responses, inference responses, bad
JSON, and every unrelated response fail open: the plugin returns no body or
header replacement, leaving host bytes and headers unchanged.

The body is decoded with Go JSON semantics (`[]byte` accepts base64, and
headers decode as `map[string][]string`). Untouched values remain raw JSON;
changed catalogs retain unknown fields and numeric tokens. The plugin never
logs bodies, headers, credentials, or instructions.

## Build Linux amd64

Docker is required. From this directory:

```powershell
.\build-linux-amd64.ps1 -Version 1.1.0
```

This creates `codex-catalog-display-name-linux-amd64-v1.1.0.so`, prints its
SHA-256, and deletes the c-shared generated `.h` header. The script mounts only
this source directory and does not read, write, start, or restart CLIProxyAPI.

## Install without restarting CLIProxyAPI

First copy the digest printed by the build step. The installer detects the
standard sibling `CLIProxyAPI/docker-compose*.yml` plugin mount, or accepts an
explicit plugin directory. It reads Compose files only to recognize the public
plugin mount; it does not read configuration, `.env`, auth, or secrets.

```powershell
# Standard sibling checkout layout
.\install.ps1 `
  -Artifact .\codex-catalog-display-name-linux-amd64-v1.1.0.so `
  -Sha256 '<build-output-sha256>'

# Non-standard checkout or custom CLI_PROXY_PLUGIN_PATH mount
.\install.ps1 `
  -Artifact .\codex-catalog-display-name-linux-amd64-v1.1.0.so `
  -Sha256 '<build-output-sha256>' `
  -Target 'C:\path\to\CLIProxyAPI\plugins'
```

The destination is `codex-catalog-display-name.so`. Installation verifies the
checksum before and after copying, and refuses to overwrite it unless `-Force`
is supplied intentionally.

## Configure and verify manually

Add this plugin to the CLIProxyAPI configuration according to the host's
existing plugin configuration convention, using the plugin ID
`codex-catalog-display-name`. Ensure plugins are enabled and the library is
visible under the Compose-mounted `plugins` directory. Do **not** paste secrets
into plugin configuration; this plugin has no settings.

After the next operator-approved CLIProxyAPI restart/reload, use a non-secret
client request to the existing model catalog endpoint and confirm scoped entries
show ` · <scope>` while balanced and malformed entries do not. Also verify a
normal inference request and a standard OpenAI `{object,data}` model list remain
unchanged. Inspect the service's normal plugin-load status/logs without copying
request bodies or authorization headers.

## Rollback

Disable the plugin in CLIProxyAPI's plugin configuration, then perform the next
operator-approved service reload/restart. Once it is confirmed unloaded, remove
only `plugins/codex-catalog-display-name.so`. Keeping the versioned build file
outside the mounted plugin directory allows an intentional re-install later.

## Development verification

```powershell
go test ./...
```

The table-driven tests cover registration/reconfiguration, complete generic
scopes (including Codex, Claude, and Gemini slugs), first-slash behavior,
balanced, malformed, and idempotent names, source/status/stream guards, mixed
entries, Go JSON base64/header semantics, and preservation of unknown fields and
large numeric values.
