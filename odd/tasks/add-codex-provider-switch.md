# Add Codex Provider Switch

## Objective

Add a safe, reversible command-line switch between the user's native OpenAI/ChatGPT Codex provider and the managed CLIProxyAPI provider, while preserving login state and unrelated Codex configuration.

## Problem

`pi-kit-codex install` currently makes CLIProxyAPI the default when no user model selection exists, while `uninstall` removes both the active selection and provider registration. Users need a low-friction switch that works through the shared user-level Codex configuration used by CLI, Desktop, and VS Code.

## Scope

- Add `pi-kit-codex use openai`.
- Add `pi-kit-codex use cliproxyapi`.
- Add offline `pi-kit-codex status`.
- Preserve `install`, `uninstall`, and `doctor` compatibility.
- Preserve ChatGPT login state and all configuration outside verified pi-kit-managed blocks.
- Document restart/reload expectations and explicit user-selection limitations.

## Constraints

- Do not access or mutate Codex authentication storage.
- Do not overwrite explicit user-owned `model` or `model_provider` selections.
- Keep TOML validation, fail-closed marker checks, and atomic replacement.
- `use openai` removes only the verified managed root selection and retains the managed CLIProxyAPI provider registration.
- Technical artifacts remain in English.

## Delivery strategy

- Strategy: `ask-on-risk`.
- Forecast: under 400 authored changed lines.
- Branch: `feat/codex-provider-switch`.
- Commits remain pending because the user has not explicitly authorized committing.

## TDD

- Mode: enabled by behavior-first repository convention for this change.
- Source: existing focused Codex unit tests and requested behavior.
- Runner: `bun test tests/codex-config.test.ts tests/codex-cli.test.ts`.

## Tasks

- [x] **CPS-1 — Define provider-switch configuration behavior**
  - Route: delegated writer; multi-file write trigger.
  - Add failing tests for root-only deactivation, preservation, idempotence, status state, and safe reactivation.
  - Implement configuration APIs without touching login state or unrelated TOML.
  - Checks: focused config tests pass.

- [x] **CPS-2 — Expose switch and status commands**
  - Route: delegated writer; same bounded implementation thread.
  - Add CLI tests for `use openai`, `use cliproxyapi`, `status`, help, and invalid targets.
  - Implement clear offline status output and backward-compatible command parsing.
  - Checks: focused CLI tests pass.

- [x] **CPS-3 — Document and verify packaged behavior**
  - Route: delegated writer for docs; independent verifier selected after native assessment.
  - Update README command reference, safety behavior, and restart guidance.
  - Run focused tests, full tests, and packed-consumer verification.
  - Checks: `bun test`; `bun run test:pack`; `git diff --check`.

## Acceptance criteria

1. `pi-kit-codex use openai` removes only pi-kit's active proxy selection and leaves the managed CLIProxyAPI provider registered.
2. `pi-kit-codex use cliproxyapi` safely activates the managed provider when no user-owned selection blocks activation.
3. `pi-kit-codex status` performs no network request and clearly reports active selection and provider registration.
4. Existing explicit user model/provider selections are never overwritten.
5. No authentication or credential store is accessed.
6. Existing install, uninstall, and doctor behavior remains compatible.
7. Focused, full, packaging, and diff checks pass.

## Progress

- Focused behavior-first tests now cover root-only deactivation, provider retention, idempotence, safe reactivation, offline status, CLI parsing, help, and invalid targets.
- `use openai` removes only the verified managed root block; `use cliproxyapi` reuses install's fail-closed ownership checks and user-selection protection.
- `status` reads and validates only `config.toml`; it does not invoke Codex, fetch proxy resources, or read environment credentials.

## Verification evidence

- RED: `bun test tests/codex-config.test.ts tests/codex-cli.test.ts` failed before implementation because the new config exports and `use` CLI command did not exist.
- GREEN: focused tests passed after implementation (11 tests, 0 failures, 48 expectations).
- Parent spot check: focused tests passed again (11 tests, 0 failures).
- Independent verification: completed with no blocking, high, medium, or low findings.
- `bun test`: passed (32 tests, 0 failures, 96 expectations).
- `bun run test:pack`: passed; isolated Pi, OpenCode, and Codex consumers resolved the packed archive.
- `git diff --check`: passed.
- Native risk assessment was unavailable because the native command returned empty output; policy treated the change as high risk and required the completed independent verification.

## Next step

Optionally exercise the new commands against the user's live Codex configuration, then commit and deliver only with explicit user authorization.
