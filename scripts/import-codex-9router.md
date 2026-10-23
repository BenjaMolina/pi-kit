# Import an isolated Codex login into 9Router

This helper imports Codex OAuth tokens into the local 9Router instance. It does not perform device login or modify Codex files.

## 1. Create an isolated Codex login

Use a separate `CODEX_HOME` so the login does not replace or modify your existing Codex authentication. This example saves and restores the prior value even if device login fails, checks Codex's exit status, and keeps the isolated path in `$loginHome` for the later import:

```powershell
$previousCodexHome = $env:CODEX_HOME
$loginHome = Join-Path $env:TEMP 'codex-9router-import'
New-Item -ItemType Directory -Force -Path $loginHome | Out-Null
try {
    $env:CODEX_HOME = $loginHome
    codex login --device-auth
    if ($LASTEXITCODE -ne 0) {
        throw "codex login failed with exit code $LASTEXITCODE"
    }
}
finally {
    $env:CODEX_HOME = $previousCodexHome
}

$authPath = Join-Path $loginHome 'auth.json'
```

Keep that file private. The script reads it only to build the import request; it does not write to it or print token contents.

## 2. Import into 9Router

Start 9Router locally, then run this repository script from the repository root:

```powershell
.\scripts\import-codex-9router.ps1 -AuthPath $authPath
```

You will be prompted for the 9Router dashboard password as a SecureString. To supply one programmatically, pass a `SecureString` using `-Password`; avoid putting plaintext passwords in command history.

The default endpoint is `http://127.0.0.1:20128`. Override it only with another local loopback HTTP URL:

```powershell
.\scripts\import-codex-9router.ps1 -AuthPath $authPath -BaseUrl 'http://localhost:20128'
```

The script sends the password to `/api/auth/login`, then sends only the access, refresh, and ID tokens to `/api/oauth/codex/bulk-import` using the same session. It rejects redirects and non-loopback URLs. Output contains no credentials. If an import request fails, the result may be ambiguous: check the 9Router dashboard before running the script again.

The script does not create the isolated `CODEX_HOME`, invoke Codex login, alter existing Codex configuration, or retry requests.
