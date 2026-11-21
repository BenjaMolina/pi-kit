# CLIProxyAPI local Docker profile

This profile reproduces the local CLIProxyAPI setup used by the Pi provider extension: upstream Docker Compose, loopback-only host ports, the bundled management panel, and the Control Account dashboard.

It is a template, not a source of credentials. Keep `config.yaml`, `docker-compose.override.yml`, `auths/`, `logs/`, and downloaded plugin binaries out of Git.

## Prerequisites

- Docker Desktop with Docker Compose
- PowerShell
- A clone or fork of [CLIProxyAPI](https://github.com/router-for-me/CLIProxyAPI)
- A checkout of this repository beside the `CLIProxyAPI` checkout when using the Control Account installer

## 1. Prepare the local server configuration

From the `CLIProxyAPI` directory:

Copy the two templates from your installed `@benjamolina/pi-kit` package (or this repository checkout) into the CLIProxyAPI root as `config.yaml` and `docker-compose.override.yml`. Keep the resulting server configuration out of version control.

Generate two distinct long random values and replace the placeholders in `config.yaml`:

- `api-keys[0]`: client key used by Pi and other API clients
- `remote-management.secret-key`: management key used by the web panels

For example:

```powershell
[Convert]::ToBase64String((1..48 | ForEach-Object { Get-Random -Maximum 256 }))
```

Use each generated value once. Save the plaintext management key in a password manager. CLIProxyAPI hashes it after startup, so it cannot be recovered later.

The Compose override binds every published port to `127.0.0.1`. Keep `remote-management.allow-remote: true`: Docker accesses the application across its bridge network even though no service is exposed beyond the local host.

## 2. Install the Control Account dashboard

The dashboard is trusted in-process dynamic-library code. Review the project and release before using it.

This profile pins Control Account `v0.6.1`. Its loading and registration were verified with CLIProxyAPI `v8.0.80` (upstream commit `f5c5681`); dashboard behavior was not exercised in that check. Install and verify its Linux amd64 binary:

From a pi-kit checkout whose repository root is a sibling of the `CLIProxyAPI` checkout, run `profiles/cliproxyapi/install-control-account.ps1`. The script must remain in that pi-kit checkout so its fixed `../../../CLIProxyAPI/plugins` path resolves to the CLIProxyAPI plugin directory.

The script downloads `control-account-linux-amd64.so` into `CLIProxyAPI\plugins\` and requires SHA-256:

```text
760d7c230959735c8fd8b9942e0fe1d41a613deecff8dc600b322eff35c430bd
```

It refuses to overwrite an existing binary. To intentionally replace it:

Re-run the same script with `-Force` only when intentionally replacing the existing binary.

## Native CLIProxyAPI plugins

pi-kit owns the source for standalone plugins; CLIProxyAPI loads only the installed shared-library binary from its mounted `plugins` directory. The [Codex catalog display-name plugin](plugins/codex-catalog-display-name/README.md) disambiguates scoped entries in the enriched model catalog. The [Codex Antigravity Responses repair plugin](plugins/codex-antigravity-responses-repair/README.md) repairs the translated Codex system identity only for Gemini Antigravity OpenAI Responses requests. Each README covers Docker Linux amd64 builds, checksum-verified installation, configuration, manual verification, update, and rollback. Building or copying a library does not start or restart the service; activation is an operator-approved later step.

## 3. Start and verify

```powershell
docker compose config --quiet
docker compose up -d
docker compose ps
```

Open the bundled management panel:

```text
http://127.0.0.1:8317/management.html
```

Open the Control Account quota dashboard:

```text
http://127.0.0.1:8317/v0/resource/plugins/control-account-linux-amd64/quota
```

Both interfaces require the management key.

## 4. Authenticate providers

Use the management panel or run provider logins inside the container. For Codex device-code login:

```powershell
docker compose exec cli-proxy-api /CLIProxyAPI/CLIProxyAPI -no-browser -codex-device-login
```

Open `https://auth.openai.com/codex/device`, enter the one-time code shown in the terminal, and leave the command running until it confirms that the credential was saved.

Provider credentials persist under `auths/` and must never be committed or copied casually between machines.

## 5. Connect Pi, OpenCode, or Codex

Install `pi-kit`, configure `CLIPROXYAPI_API_KEY` using the client API key from `config.yaml`, then select a `cliproxyapi` model through Pi's `/model`. See the root [README](../../README.md#configure-cliproxyapi) for the shared environment-variable instructions.

For OpenCode 1.18.18, load a released version of `@benjamolina/pi-kit` through OpenCode's `plugin` configuration. Follow the root [OpenCode instructions](../../README.md#use-in-opencode-11818) for package version selection, portable npm installation, reload behavior, and graceful behavior when this local service is unavailable.

For Codex CLI, the IDE extension, or the desktop app, use the repository command `bun ./bin/pi-kit-codex.ts doctor` followed by `bun ./bin/pi-kit-codex.ts install`, or the released-package commands in the root [Codex quick path](../../README.md#codex--cliproxyapi-quick-path). The installation updates their shared user-level `config.toml`; that guide covers prerequisites, safety semantics, and troubleshooting.

## Verified server and Neon smoke tests

The local Docker deployment was upgraded from CLIProxyAPI `v8.0.66` to `v8.0.80` (commit `f5c5681`). The following checks passed after the update:

| Check | Observed result |
| --- | --- |
| Server startup | Running with no container restarts; five auth entries retained |
| Network bindings | All six published ports bound only to `127.0.0.1` |
| Plugin loading and registration | `codex-catalog-display-name` `1.1.0`, `codex-antigravity-responses-repair` `1.0.1`, and Control Account `0.6.1` |
| Antigravity model catalog | `gemini-4-neon-xhigh` available through `/v1/models` |
| Non-streaming completion | HTTP 200 and the exact requested response |
| Streaming completion | HTTP 200, the exact requested content, and a final `[DONE]` event |
| Tool-call round trip | Correct function name and arguments, followed by an exact response using the supplied tool result |

The completion checks used `/v1/chat/completions` directly with `gemini-4-neon-xhigh`; the non-streaming response reported the upstream model as `gemini-4-neon`. These are bounded smoke tests, not a guarantee of long-session or load stability. They do not verify plugin-specific behavior, Codex `/v1/responses` repair, dashboard behavior, or end-to-end Pi, Codex, and OpenCode integrations. The repository test suite was not run as part of that deployment update.

## Update safely

Keep the CLIProxyAPI fork synchronized with upstream first. Before changing a plugin version, review its release notes and checksum and update this profile separately. Native plugin loading alone does not establish functional compatibility with a newer server.

For a server image update, run from the CLIProxyAPI checkout:

1. Validate Compose with `docker compose config --quiet`. Retain the loopback-only override.
2. Record and retain the running image ID for rollback before pulling a new image.
3. Run `docker compose pull cli-proxy-api`.
4. Stop only `cli-proxy-api` and back up `config.yaml`, `auths/`, the entire `plugins/` directory, and both Compose files. Stop the service before archiving plugin SQLite state so database and WAL files remain consistent. Keep this sensitive backup outside version control.
5. Run `docker compose up -d --no-deps --pull never cli-proxy-api` to recreate only that service.
6. Check the server version, auth count, plugin registrations, loopback bindings, and real model requests. Exercise plugin-specific paths separately before claiming full compatibility.

Keep the old image and backup until verification is complete. A rollback to the old image does not undo changes to persistent data; restoring that data requires a separate, deliberate operation with the service stopped.
