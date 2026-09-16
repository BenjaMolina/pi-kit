# CLIProxyAPI local Docker profile

This profile reproduces the local CLIProxyAPI setup used by the Pi provider extension: upstream Docker Compose, loopback-only host ports, the bundled management panel, and the Control Account dashboard.

It is a template, not a source of credentials. Keep `config.yaml`, `docker-compose.override.yml`, `auths/`, `logs/`, and downloaded plugin binaries out of Git.

## Prerequisites

- Docker Desktop with Docker Compose
- PowerShell
- A clone or fork of [CLIProxyAPI](https://github.com/router-for-me/CLIProxyAPI)
- A clone of this `pi-kit` repository next to it

Expected layout:

```text
C:\Github\Ordico\
├── CLIProxyAPI\
└── pi-kit\
```

## 1. Prepare the local server configuration

From the `CLIProxyAPI` directory:

```powershell
Copy-Item ..\pi-kit\profiles\cliproxyapi\config.template.yaml .\config.yaml
Copy-Item ..\pi-kit\profiles\cliproxyapi\docker-compose.override.template.yml .\docker-compose.override.yml
```

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

This profile pins the prerelease `v0.6.0-rc.4`, tested with CLIProxyAPI `v7.3.4` at upstream commit `8335eac`. Install and verify its Linux amd64 binary:

```powershell
..\pi-kit\profiles\cliproxyapi\install-control-account.ps1
```

The script downloads `control-account-linux-amd64.so` into `CLIProxyAPI\plugins\` and requires SHA-256:

```text
5925524105d627eac91e39c2097e4a63c44caa8f642ce7044dd574d11ba106ea
```

It refuses to overwrite an existing binary. To intentionally replace it:

```powershell
..\pi-kit\profiles\cliproxyapi\install-control-account.ps1 -Force
```

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

## 5. Connect Pi

Install `pi-kit`, configure `CLIPROXYAPI_API_KEY` using the client API key from `config.yaml`, then select a `cliproxyapi` model through `/model`. See the root [README](../../README.md#configure-cliproxyapi) for the Pi environment-variable instructions.

## Update safely

Keep the CLIProxyAPI fork synchronized with upstream first. Before changing the plugin version, review its release notes and checksum, update this profile in a separate commit, and validate `docker compose config --quiet` before restarting the service.
