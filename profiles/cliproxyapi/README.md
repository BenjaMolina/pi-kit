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

This profile pins `v0.6.1`, tested with CLIProxyAPI `v7.3.7` at upstream commit `b773607`. Install and verify its Linux amd64 binary:

From a pi-kit checkout whose repository root is a sibling of the `CLIProxyAPI` checkout, run `profiles/cliproxyapi/install-control-account.ps1`. The script must remain in that pi-kit checkout so its fixed `../../../CLIProxyAPI/plugins` path resolves to the CLIProxyAPI plugin directory.

The script downloads `control-account-linux-amd64.so` into `CLIProxyAPI\plugins\` and requires SHA-256:

```text
760d7c230959735c8fd8b9942e0fe1d41a613deecff8dc600b322eff35c430bd
```

It refuses to overwrite an existing binary. To intentionally replace it:

Re-run the same script with `-Force` only when intentionally replacing the existing binary.

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

For OpenCode 1.18.18, load `@benjamolina/pi-kit@0.3.1` through OpenCode's `plugin` configuration. The root [OpenCode instructions](../../README.md#use-in-opencode-11818) include the portable npm installation, reload behavior, and graceful behavior when this local service is unavailable.

For Codex CLI, the IDE extension, or the desktop app, use the repository command `bun ./bin/pi-kit-codex.ts doctor` followed by `bun ./bin/pi-kit-codex.ts install`. This support is unreleased: the published `@benjamolina/pi-kit@0.3.1` package does not include it. The installation updates their shared user-level `config.toml`; see the root [Codex quick path](../../README.md#codex--cliproxyapi-quick-path) for prerequisites, safety semantics, and troubleshooting.

## Update safely

Keep the CLIProxyAPI fork synchronized with upstream first. Before changing the plugin version, review its release notes and checksum, update this profile in a separate commit, and validate `docker compose config --quiet` before restarting the service.
