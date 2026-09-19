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
- Work-unit commit: `f501faf` (`feat(codex): add provider switch commands`).

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

- [x] **CPS-4 — Accept unrelated Codex sections inside the legacy managed delimiter**
  - Route: delegated writer; production compatibility defect after v0.5.2.
  - Reproduce the live shape where `[hooks.state]` and `[tui]` appear after the exact provider payload but before the provider end marker.
  - Preserve fail-closed validation for changed provider keys while allowing unrelated valid TOML sections to survive status and switch operations.
  - Add regression tests and verify against a sanitized copy of the live structure.
  - Checks: focused tests, full tests, packed consumers, and `git diff --check`.

- [x] **CPS-5 — Accept realistic whitespace before interleaved Codex sections**
  - Route: delegated writer; follow-up production compatibility defect after v0.5.3.
  - Reproduce the exact structural separator: one blank line between `wire_api` and `[hooks.state]`.
  - Accept valid whitespace without weakening exact managed provider semantics or marker checks.
  - Preserve the original whitespace and unrelated sections byte-for-byte through status, switching, and uninstall.
  - Checks: focused tests, full tests, packed consumers, live read-only status, and `git diff --check`.

- [x] **CPS-6 — Accept valid Codex sections after the managed provider marker**
  - Route: delegated writer; production drift observed after v0.5.4 live success.
  - Reproduce a valid trailing `[tui]` table after the managed provider end marker.
  - Remove the assumption that the managed provider marker must terminate the document while keeping unique, ordered markers and exact provider semantics.
  - Preserve trailing content byte-for-byte through status, switching, install, and uninstall; uninstall removes only the managed payload and markers.
  - Checks: focused tests, full tests, packed consumers, live read-only status, and `git diff --check`.

- [x] **CPS-7 — Active provider switching for existing and unmanaged selections**
  - Route: delegated writer; architectural fix for switch command usability.
  - Separate passive `install` from active `use`: `use cliproxyapi` must actively switch to CLIProxyAPI by adopting or replacing existing root provider selections into the managed root block.
  - Relax `assertRootBlock` to accept any user-selected model name within the managed root block, requiring only `model_provider = "cliproxyapi"`.
  - `use openai` must actively switch to OpenAI by removing `blocks.root` AND any unmanaged top-level `model_provider = "cliproxyapi"` or proxy model lines, leaving Codex in clean native default.
  - `status` reports CLIProxyAPI whenever `model_provider = "cliproxyapi"`, managed or unmanaged, and OpenAI default when neither is set.
  - Preserve all unrelated configuration (reasoning effort, hooks, tui, other sections) byte-for-byte.
  - Checks: focused tests, full tests, packed consumers, live status and live switch verification, and `git diff --check`.

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
- Work-unit commit: `f501faf` (`feat(codex): add provider switch commands`).
- v0.5.2 was published and installed successfully, but live `status` reproduced a compatibility defect: Codex-added `[hooks.state]` and `[tui]` sections were enclosed before the managed provider end marker, so byte-exact validation refused the otherwise unchanged provider payload.
- Issue #31 was reopened and branch `fix/codex-managed-block-compat` created for CPS-4.
- CPS-4 RED: the new sanitized legacy-shape regression failed because byte-exact provider-block validation rejected the interleaved `[hooks.state]` and `[tui]` sections.
- CPS-4 GREEN: focused tests passed after validation was narrowed to the exact managed provider payload while preserving verified unrelated interleaved sections byte-for-byte. A changed managed `wire_api` value still fails closed without modifying the file.
- CPS-4 parent spot check: 14 focused tests passed, 0 failures, 60 expectations.
- CPS-4 independent verification: no critical, high, medium, or low findings; 35 full tests passed, packed consumers passed, and `git diff --check` passed.
- Native risk assessment was schema-incompatible and therefore unavailable; policy treated CPS-4 as high risk and required the completed independent verification.
- CPS-4 shipped as v0.5.3, but the first live status check exposed a narrower formatting mismatch: the real file has one blank line between `wire_api` and `[hooks.state]`, while the regression fixture placed the table header immediately on the next line.
- The live provider values and markers still match exactly; CPS-5 tracks whitespace compatibility without weakening provider ownership.
- Issue #31 was reopened and branch `fix/codex-managed-block-whitespace` created.
- CPS-5 RED: after adding the faithful blank separator to the sanitized config and CLI legacy fixtures, `bun test tests/codex-config.test.ts tests/codex-cli.test.ts` failed because provider-interleaved validation required the first character after the managed payload newline to be `[`. The test run reported 12 passing and 2 failing tests; no config fixture was mutated after rejection.
- CPS-5 GREEN: provider-interleaved validation now permits separator whitespace only when its first non-whitespace character begins an unrelated TOML table. Focused tests passed (14 tests, 0 failures, 60 expectations).
- CPS-5 exact preservation evidence: the config fixture asserts byte-exact content after status, `use cliproxyapi`, and `use openai`; its uninstall assertion preserves the original leading blank separator before `[hooks.state]`. The CLI fixture asserts the original blank-separated block byte-for-byte after status and both switch commands.
- CPS-5 parent spot check: 14 focused tests passed, 0 failures, 60 expectations.
- CPS-5 independent verification: no critical, high, medium, or low findings; 35 full tests passed, packed consumers passed, and `git diff --check` passed.
- Native risk assessment remained schema-incompatible and unavailable; policy treated CPS-5 as high risk and required the completed independent verification.
- CPS-5 shipped as v0.5.4 and the first live read-only status passed. A later status call after global Bun installation revealed new Codex drift: a valid trailing `[tui]` table had been written after the managed provider end marker.
- Managed provider keys/values and markers remain exact; CPS-6 removes only the brittle document-end ownership assumption.
- Issue #31 was reopened and branch `fix/codex-managed-block-trailing-content` created.
- CPS-6 RED: after adding sanitized config and CLI regressions with a valid trailing `[tui]` table, `bun test tests/codex-config.test.ts tests/codex-cli.test.ts` failed because validation required the managed provider block to be document-final. The run reported 14 passing and 2 failing tests; rejected fixtures were not mutated.
- CPS-6 GREEN: focused tests passed after removing only the provider document-end constraint while retaining unique-marker, root-position, non-crossing, and exact-payload checks (17 tests, 0 failures, 89 expectations).
- CPS-6 byte-preservation evidence: the config regression verifies exact original bytes after status and idempotent install, provider-plus-trailing bytes after deactivation, full restoration after activation, and preservation of the interleaved `[hooks.state]` plus trailing `[tui]` after uninstall. The CLI regression verifies status and both switch directions leave the trailing `[tui]` fixture byte-exact.
- CPS-6 verification: focused tests passed (17 tests, 0 failures, 89 expectations); full tests passed (38 tests, 0 failures, 137 expectations); packed Pi, OpenCode, and Codex consumers passed; and `git diff --check` passed.
- CPS-6 scope: no live Codex configuration, authentication or credential storage, versions, release metadata, commands, flags, or state fields were read or changed.
- CPS-6 parent spot check: 17 focused tests passed, 0 failures, 89 expectations.
- CPS-6 independent verification: no critical, high, medium, or low findings; 38 full tests passed, packed consumers passed, and `git diff --check` passed.
- Native risk assessment remained schema-incompatible and unavailable; policy treated CPS-6 as high risk and required the completed independent verification.

- CPS-6 shipped as v0.5.5 and passed 3 consecutive read-only status checks on the real config.
- A critical UX/architectural flaw was discovered: `use` commands reused passive `install` checks (`hasUserModelSelection`), meaning `use cliproxyapi` refused to activate when a model was already selected, and `use openai` refused to touch unmanaged `model_provider = "cliproxyapi"` lines.
- Branch `fix/codex-active-provider-switch` created for CPS-7.
- CPS-7 RED: `bun test tests/codex-config.test.ts tests/codex-cli.test.ts` failed as intended after behavior tests were added: active activation retained an unmanaged root selection, unmanaged CLIProxyAPI deactivation was unchanged, and a user-updated managed model was rejected (15 passing, 5 failing, 89 expectations).
- CPS-7 GREEN: active activation now adopts root `model`/`model_provider` selections into the managed root block, preserves unrelated root keys and sections, and registers the provider; active deactivation removes the managed root or unmanaged CLIProxyAPI selection plus root model while retaining unrelated bytes and the managed provider registration.
- CPS-7 root validation parses the marked block and accepts any string model when `model_provider = "cliproxyapi"`; it still rejects malformed markers and non-proxy managed roots.
- CPS-7 status distinguishes managed CLIProxyAPI, unmanaged CLIProxyAPI, OpenAI default, and other user selections. CLI output no longer reports a refusal for active `use cliproxyapi`.
- CPS-7 focused verification: `bun test tests/codex-config.test.ts tests/codex-cli.test.ts` passed (22 tests, 0 failures, 102 expectations).
- CPS-7 full verification: `bun test` passed (43 tests, 0 failures, 150 expectations).
- CPS-7 packed-consumer verification: `bun run test:pack` passed; isolated Pi, OpenCode, and Codex consumers resolved the packed archive.
- CPS-7 diff verification: `git diff --check` passed.
- CPS-7 scope: no live Codex configuration, authentication or credential storage, versions, or release metadata were read or changed.

## Next step

Review CPS-7 changes, then decide whether to commit, release, and perform user-authorized live switch verification.
