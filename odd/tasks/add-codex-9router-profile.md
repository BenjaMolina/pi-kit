# Add managed 9Router profile for Codex CLI

## Objective

Add a safe, reversible pi-kit integration that lets Codex CLI use 9Router on demand with `codex -p 9router`, while preserving the existing default provider and all user-owned Codex configuration.

## Problem

Users can manually register 9Router as a Codex custom provider, but that workflow is error-prone, stores no installation ownership, and is difficult to reproduce or uninstall safely. pi-kit already manages CLIProxyAPI configuration with marker validation, atomic writes, credential indirection, and compatibility checks. 9Router should use the same safety discipline without replacing CLIProxyAPI or native OpenAI as the default.

## Why

A managed 9Router profile gives users explicit per-session provider selection, keeps multiple providers installed concurrently, avoids manual TOML edits, and makes installation and rollback reproducible.

## Scope

- Add managed 9Router provider registration to the shared Codex `config.toml`.
- Add a managed `$CODEX_HOME/9router.config.toml` profile selected by `codex -p 9router`.
- Add `pi-kit-codex 9router install`, `status`, and `uninstall` commands.
- Default the profile to 9Router's Codex route and a currently supported model identifier.
- Reference the API key through `NINEROUTER_API_KEY`; never persist or print its value.
- Support `NINEROUTER_BASE_URL`, defaulting to `http://127.0.0.1:20128/v1`.
- Document coexistence with CLIProxyAPI and native OpenAI.

## Non-goals

- Do not install, start, update, or configure the 9Router Docker service.
- Do not import provider credentials or ChatGPT account tokens into 9Router.
- Do not change the user's root/default Codex provider selection.
- Do not store the 9Router API key in repository files or Codex TOML.
- Do not generalize every Codex provider in this work unit unless required by the smallest safe implementation.

## Constraints

- Preserve existing CLIProxyAPI commands and managed blocks unchanged.
- Preserve unrelated Codex configuration byte-for-byte.
- Fail closed on unmanaged collisions for `model_providers.9router` or the `9router.config.toml` profile.
- Reuse TOML validation, marker ownership, URL sanitization, and atomic replacement patterns.
- The installed profile must follow the current Codex CLI contract: `-p <name>` layers `$CODEX_HOME/<name>.config.toml`.
- Technical artifacts remain in English.

## TDD

- Mode: enabled.
- Source: established behavior-first convention in existing Codex ODD work and focused test suites.
- Focused runner: `bun test tests/codex-config.test.ts tests/codex-cli.test.ts`.
- Required cycle: observe RED for new behavior, implement GREEN, then refactor while keeping tests green.

## Route and delegation

- Exploration: delegated to `gentle-ai-explore` because understanding crossed the four-file mapping threshold.
- Implementation: delegated to one `gentle-ai-worker` because the change touches multiple non-trivial source, test, and documentation files.
- Verification: writer self-verification plus native assessment-directed follow-up.

## Delivery strategy

- Strategy: `ask-on-risk`.
- Initial forecast: approximately 250–380 authored changed lines.
- Current uncommitted implementation: 1,070 authored changed lines across code and tests, plus this ODD document. The original forecast was materially low because safe two-file transactions and failure-injection coverage required substantial implementation and test evidence.
- Strategy trigger: `ask-on-risk` is active because the running change exceeds the 400-line review threshold.
- Chain strategy: `feature-branch-chain`, explicitly selected by the user.
- Honest slice assessment: provider/profile lifecycle plus its behavior and failure-injection tests is the dominant cohesive slice and remains over 400 lines; CLI/docs form a smaller second slice.
- Size exception: explicitly authorized by the user for the first cohesive lifecycle slice.
- Planned slice boundaries:
  - Slice 1: `src/codex/config.ts` + `tests/codex-config.test.ts` (managed provider/profile lifecycle, transactional rollback, and behavior/failure tests).
  - Slice 2: `src/codex/cli.ts` + `tests/codex-cli.test.ts` + `README.md` + ODD progress document (CLI surface, documentation, and feature evidence).
- Commit creation still requires explicit user authorization, per the conversation agreement.

## Tasks

- [x] **C9R-1 — Define managed provider and profile behavior with TDD**
  - Add failing tests for fresh installation, idempotence, coexistence with CLIProxyAPI, unmanaged provider/profile collisions, malformed managed content, URL sanitization, secret non-persistence, and clean uninstall.
  - Implement managed 9Router provider registration in `config.toml` and managed `9router.config.toml` profile creation/removal.
  - Confirm the profile uses the current Codex file-layer contract rather than an obsolete inline profiles table assumption.
  - Checks: focused Codex tests pass.

- [x] **C9R-2 — Expose 9Router lifecycle commands with TDD**
  - Add `pi-kit-codex 9router install|status|uninstall`.
  - Add help and CLI output tests.
  - Status must remain offline and must not reveal credentials.
  - Checks: focused Codex tests pass.

- [x] **C9R-3 — Document and verify packaged behavior**
  - Document environment variables, installation, coexistence, `codex -p 9router`, model override usage, and troubleshooting.
  - Run focused tests, full tests, packed-consumer verification, and diff hygiene.
  - Perform a runtime profile smoke test using an isolated `CODEX_HOME` without modifying the live user configuration.
  - Checks: `bun test`; `bun run test:pack`; `git diff --check`; isolated runtime smoke test.

- [x] **C9R-4 — Close the work unit**
  - Reviewed final diff and authored line count.
  - User selected `feature-branch-chain` and explicitly authorized the first-slice size exception.
  - User explicitly authorized both Conventional Commits.
  - Recorded commit identities, slice boundaries, and verification outcome.

## Acceptance criteria

1. `pi-kit-codex 9router install` registers 9Router and creates a usable `9router.config.toml` profile without changing the root/default Codex provider.
2. `codex -p 9router` selects the 9Router provider and configured model.
3. CLIProxyAPI, native OpenAI, and 9Router can remain installed concurrently.
4. Repeated installation is idempotent.
5. Uninstallation removes only pi-kit-managed 9Router artifacts.
6. Existing unmanaged provider/profile definitions are never overwritten.
7. API key values are never written to TOML or printed.
8. Existing Codex and package-consumer tests remain green.

## Progress

- Read-only exploration completed and identified the existing marker, atomic write, CLI dispatch, test, and documentation surfaces.
- Current Codex CLI help confirms `-p <name>` layers `$CODEX_HOME/<name>.config.toml`; implementation uses that contract.
- Feature branch created: `feat/codex-9router-profile`.
- Tasks C9R-1 through C9R-3 implemented under strict TDD:
  - Added behavior tests covering installation, idempotence, coexistence with CLIProxyAPI, unmanaged provider/profile collision guards, URL sanitization, secret non-disclosure, marker integrity, and clean uninstall.
  - Observed RED: missing export `getCodexNineRouterStatus` and CLI routing failure.
  - Implemented GREEN in `src/codex/config.ts` and `src/codex/cli.ts` with atomic replacement, fail-closed collision checks, and credential protection.
  - Documented 9Router usage, coexistence, environment variables, model overrides, and troubleshooting in `README.md`.
  - Triangulated edge cases: model customization preservation across reinstalls, CLIProxyAPI activate/deactivate coexistence, and trailing whitespace/newlines.
- Addressed independent verification findings under strict TDD:
  - Added failure-injection tests for sequential mutation rollback across `installCodexNineRouter` and `uninstallCodexNineRouter`, restoring prior bytes and file existence when a later mutation fails.
  - Added test and clear reporting for rollback failures, preserving the primary error message and attaching it as the cause without masking the rollback failure.
  - Added failure-path test and best-effort cleanup of temporary `.tmp` files in `replaceAtomically` on rename or concurrency failure.
  - Documented `NINEROUTER_MODEL` environment variable override in `README.md` and added test coverage.

## Verification evidence

- `bun test tests/codex-config.test.ts tests/codex-cli.test.ts`: passed (38 pass, 0 fail, 217 expect calls).
- `bun test`: passed (212 pass across 14 test files, 0 fail, 904 expect calls).
- `bun run test:pack`: passed (valid archive built, packaged bin/runtime modules resolved in isolated Pi and OpenCode consumers).
- `git diff --check`: passed (clean whitespace and format check, 0 issues).
- Isolated runtime smoke test: passed. Created temporary `CODEX_HOME`, invoked `pi-kit-codex 9router install`, verified `config.toml` `[model_providers.9router]` and `$CODEX_HOME/9router.config.toml`, verified offline status and clean uninstall without modifying live `~/.codex`.
- Independent verification initially found a medium multi-file transaction issue and a low temporary-file cleanup issue. Both were fixed under TDD with rollback and failure-injection coverage.
- Independent re-verification: PASS with no findings. Focused tests passed (38 tests, 217 assertions); full suite passed (212 tests, 904 assertions); packed consumers and `git diff --check` passed.
- Parent spot check: `bun test tests/codex-config.test.ts tests/codex-cli.test.ts` passed (38 tests, 0 failures, 217 assertions).

## Commit evidence

- Slice 1: `70de275` — `feat(codex): add managed 9Router profile lifecycle`
  - Files: `src/codex/config.ts`, `tests/codex-config.test.ts`.
  - Size exception: explicitly authorized for the cohesive lifecycle and failure-injection test unit.
- Slice 2: `6c096cf` — `feat(codex): expose 9Router profile commands`
  - Files: `src/codex/cli.ts`, `tests/codex-cli.test.ts`, `README.md`, and this ODD document.
- Evidence closeout: user explicitly authorized a minimal third commit to persist the final slice identity after slice 2 existed.

## Next step

Feature implementation and verification are complete. Decide whether to push the branch and open the feature-branch PR chain.
