# Sync CLIProxyAPI to upstream v7.3.8 and verify runtime plugins

## Goal

Synchronize the `CLIProxyAPI` fork to upstream release `v7.3.8`, upgrade the running container image to `v7.3.8`, and verify that all pi-kit plugins (`codex-catalog-display-name` and `codex-antigravity-responses-repair`) load and operate correctly end to end.

## Constraints

- Keep the `CLIProxyAPI` fork completely clean of pi-kit plugin source code, temporary tasks, and unneeded modifications.
- Preserve host-mounted configurations: `config.yaml`, `auths/`, `logs/`, `plugins/`, and local backups.
- Preserve unrelated local changes: `.gitignore` local additions, `.codegraph/`, and backup files.
- Verify end-to-end paths on runtime v7.3.8: Codex Gemini, Codex GPT, Pi Gemini chat completions, and catalog display names.

## Tasks

- [x] SCU-1 Synchronize `main` in `C:\Github\Ordico\CLIProxyAPI` to `upstream/main` (`v7.3.8`) and push to `origin/main`. Evidence: `main` fast-forwarded from `8335eac7` to `c93978c4` (tag `v7.3.8`); pushed cleanly to `origin/main`.
- [x] SCU-2 Clean up the temporary prototype branch `fix/codex-gemini-responses-plugin` after ensuring no unique commits exist. Evidence: deleted local branch `fix/codex-gemini-responses-plugin`.
- [x] SCU-3 Recreate the `cli-proxy-api` Docker service with the official `v7.3.8` image while preserving all bind mounts. Evidence: `docker compose down && docker compose up -d` launched image `CLIProxyAPI Version: v7.3.8, Commit: c93978c, BuiltAt: 2026-09-18T21:18:20Z`.
- [x] SCU-4 Verify runtime version, plugin loading (catalog + repair), and run the full verification matrix. Evidence: runtime reports `v7.3.8 (c93978c)`; `codex-antigravity-responses-repair` loads as `1.0.0` and `codex-catalog-display-name` as `1.1.0`; Codex Gemini `/v1/responses` returned `gemini v7.3.8 works`; Codex GPT returned `gpt v7.3.8 unchanged`; Gemini `/v1/chat/completions` returned `chat v7.3.8 works`; enriched catalog returned 104 models with scoped ` · <scope>` display names.

## Evidence

- Upstream release: `v7.3.8` (commit `c93978c4ea2e908255a2a06c37599fda3651554a`)
- Local checkout: `C:\Github\Ordico\CLIProxyAPI`
- Pulled official Docker image: `eceasy/cli-proxy-api:latest` / `v7.3.8` (digest `sha256:6c2c8a7904799bd29a3f7f92a598555d8321b6a5682000b87af4495c5704fa72`)
