# Codex Antigravity Responses repair plugin

A standalone CLIProxyAPI ABI v1 / RPC schema v6 Go shared-library plugin. It
repairs the translated Codex system identity that Antigravity Gemini rejects,
without modifying the CLIProxyAPI fork.

It deliberately declares **only** `request_normalizer` and serves only:

```text
plugin.register
plugin.reconfigure
request.normalize
```

Unknown methods return a structured RPC error. The plugin has no configuration,
no network access, and no logging.

## Behavior and safety

The normalizer changes a request only when all of these are true:

- `FromFormat` equals `openai-response` case-insensitively.
- `ToFormat` equals `antigravity` case-insensitively.
- `Model` contains `gemini` case-insensitively.
- The request body is one valid JSON object with
  `request.systemInstruction.parts[*].text` containing the exact fragment
  `You are Codex,`.

Only those exact fragments in system-instruction part text are replaced with
`You are Codex;`. User, history, tool, credential, and every other field remain
untouched. The replacement is idempotent. Missing structure, malformed JSON,
nonmatching formats or model, and system text without the exact fragment all
fail open: the plugin returns no body replacement, so CLIProxyAPI keeps the
original host bytes. It never logs request bodies, headers, credentials, or
instructions.

The body uses Go JSON semantics (`[]byte` accepts base64). Changed objects retain
unknown fields and numeric tokens outside the rewritten system text.

## Build Linux amd64

Docker is required. From this directory:

```powershell
.\build-linux-amd64.ps1 -Version 1.0.0
```

This creates `codex-antigravity-responses-repair-linux-amd64-v1.0.0.so`, prints
its SHA-256, and deletes the c-shared generated `.h` header. The script mounts
only this source directory and does not read, write, start, or restart
CLIProxyAPI.

## Install without restarting CLIProxyAPI

First copy the digest printed by the build step. The installer detects the
standard sibling `CLIProxyAPI/docker-compose*.yml` plugin mount, or accepts an
explicit plugin directory. It reads Compose files only to recognize the public
plugin mount; it does not read configuration, `.env`, auth, or secrets.

```powershell
# Standard sibling checkout layout
.\install.ps1 `
  -Artifact .\codex-antigravity-responses-repair-linux-amd64-v1.0.0.so `
  -Sha256 '<build-output-sha256>'

# Non-standard checkout or custom CLI_PROXY_PLUGIN_PATH mount
.\install.ps1 `
  -Artifact .\codex-antigravity-responses-repair-linux-amd64-v1.0.0.so `
  -Sha256 '<build-output-sha256>' `
  -Target 'C:\path\to\CLIProxyAPI\plugins'
```

The destination is `codex-antigravity-responses-repair.so`. Installation
verifies the checksum before and after copying, and refuses to overwrite it
unless `-Force` is supplied intentionally. It does not restart CLIProxyAPI or
edit its configuration.

## Configure and verify manually

Add this plugin to CLIProxyAPI's plugin configuration according to the host's
existing plugin configuration convention, using the plugin ID
`codex-antigravity-responses-repair`. Ensure plugins are enabled and the library
is visible under the Compose-mounted `plugins` directory. Do **not** paste
secrets into plugin configuration; this plugin has no settings.

After the next operator-approved CLIProxyAPI restart/reload, send a non-secret
Codex OpenAI Responses request targeting a Gemini Antigravity model. Confirm the
request succeeds and that only translated system identity text is repaired.
Also verify a Codex GPT request, a non-Gemini Antigravity request, and a request
whose user content alone contains `You are Codex,` remain unchanged. Inspect the
service's normal plugin-load status/logs without copying request bodies or
authorization headers.

## Update and rollback

Build a new versioned artifact and verify its SHA-256 before replacing the
stable library with `-Force`. Activation remains an operator-approved later
restart/reload. To roll back, disable the plugin in CLIProxyAPI configuration,
perform the next operator-approved service reload/restart, and only then remove
`plugins/codex-antigravity-responses-repair.so`.

## Development verification

```powershell
go test ./...
```

The focused tests cover registration, reconfiguration, schema guards, both known
Codex identity variants, case-insensitive target matching, non-Gemini and wrong
format guards, user-content-only, malformed and missing structures, multiple
system parts, no-match behavior, and idempotence.
