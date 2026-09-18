# Add Codex CLIProxyAPI MVP

## Goal

Prove Codex can use the local CLIProxyAPI through the Responses API, then add a safe packaged adapter that can diagnose, install, and remove the managed Codex configuration without overwriting unrelated user settings.

## Scope

- Use an isolated `CODEX_HOME` for protocol and configuration validation.
- Reuse the existing CLIProxyAPI discovery and normalization core.
- Add a Codex-facing CLI with `doctor`, `install`, and `uninstall` commands.
- Preserve unrelated `config.toml` content and never persist API-key values.
- Add focused tests, packed-package verification, and user documentation.

## Tasks

- [x] Validate Codex 0.144.0 against CLIProxyAPI `/v1/responses` in an isolated home.
  - Verified with `gpt-5.5`, custom provider `cliproxyapi`, and `wire_api = "responses"`.
  - `GET /models` returned HTTP 200 and `codex exec` completed with exit code 0.
  - The real Codex home and repository sources were not modified; temporary artifacts were removed.
- [x] Define the managed configuration contract and safe TOML update strategy.
  - Manage uniquely marked root/provider blocks while preserving all unrelated bytes.
  - Never overwrite user-owned model selection or an unmarked `model_providers.cliproxyapi` collision.
  - Parse before mutation, fail closed on malformed TOML/markers, and replace atomically without unlink fallback.
  - Resolve Codex state from absolute `CODEX_HOME` or `~/.codex`; reference the API key only through `env_key`.
  - Keep backups explicit rather than automatic because arbitrary existing config may contain secrets.
- [x] Implement the Codex adapter and CLI entry point.
  - Added `pi-kit-codex` with `doctor`, `install`, `uninstall`, and help.
  - Added fail-closed TOML validation, semantic collision protection, idempotent marked-block edits, and atomic replacement.
  - Independent verification accepted the implementation after a falsy-provider collision regression was fixed.
- [x] Add behavior-focused tests and packed-consumer coverage.
  - Codex configuration/CLI tests pass with malformed-input, collision, preservation, idempotence, and secret-redaction coverage.
  - The real packed tarball exposes and executes `pi-kit-codex`; isolated install/uninstall succeeds without touching user config.
  - Release manifest validation requires the exact Codex bin while preserving Pi and OpenCode packaging checks.
- [x] Document installation, diagnostics, rollback, and current model-catalog limitations.
  - Added an unreleased Codex quick path, command reference, preservation guarantees, troubleshooting, and official Codex references.
  - Clarified that `gpt-5.5` is a static interoperability-tested default and that `doctor` separately probes the live `/models` endpoint.
- [x] Run final verification and inspect the resulting candidate.
  - `npm test`: 36 passed, 0 failed, 97 assertions.
  - Release manifest and packed Pi/OpenCode/Codex consumer checks passed.
  - CLI help and isolated install/reinstall/uninstall smoke passed without touching real user config.
  - Diff, artifact, and credential scans passed; no functional blockers remain.

## Acceptance criteria

- A real isolated Codex invocation reaches CLIProxyAPI successfully, or the exact protocol incompatibility is recorded before implementation continues.
- `doctor` reports Codex availability, environment readiness, proxy reachability, Responses API compatibility, and managed configuration state without exposing secrets.
- `install` creates or updates only the pi-kit-managed Codex configuration and is idempotent.
- `uninstall` removes only pi-kit-managed configuration and preserves unrelated settings.
- The API key is referenced by environment-variable name and is never written into generated files.
- Tests cover fresh install, existing configuration preservation, repeated install, uninstall, malformed configuration, and missing prerequisites.
- The packed npm artifact contains and can execute the Codex integration entry point.
