# Add searchable Copilot CLI model picker

## Objective

Add a dependency-free, searchable pre-launch model picker to `pi-kit-copilot` so users can discover, choose, and launch CLIProxyAPI models without copying long model IDs, while preserving explicit commands for automation.

## Problem and why

GitHub Copilot CLI accepts custom providers only through BYOK process environment variables. Its native `/model` menu remains tied to GitHub's subscription catalog and does not enumerate CLIProxyAPI models. The current `models` → `use <model-id>` → `launch` flow works but is less ergonomic than the searchable model selectors available in Codex and VS Code.

## Scope

- Approved issue: https://github.com/BenjaMolina/pi-kit/issues/59
- Branch: `feat/copilot-model-picker`
- Add a searchable terminal picker backed by `listCopilotModels()`.
- Persist confirmed choices through the existing atomic, non-secret state writer.
- Add an explicit picker-and-launch flow without changing ordinary deterministic `launch` semantics.
- Preserve `models`, `use <model-id>`, and existing automation behavior.
- Document the owned pre-launch picker and the native Copilot `/model` limitation.

## Constraints and decisions

- No hardcoded model list and no second discovery implementation.
- No new runtime dependency unless built-in terminal APIs prove insufficient.
- No attempt to patch or intercept Copilot CLI's closed native picker.
- Non-interactive input must fail clearly rather than hang.
- Cancellation and failures must leave prior state untouched and restore terminal state.
- Picker output must never expose API keys or sensitive environment values.
- ODD delivery strategy: `ask-on-risk`.
- Chain strategy: `stacked-to-main`, selected by the user after the implementation exceeded the review budget.
- TDD mode: not explicitly enabled by project/session configuration; ordinary functional checks apply. Runner: `bun test` / `npm test`.

## Tasks

- [ ] **T1 — Implement picker domain and terminal interaction**
  - Add deterministic case-insensitive filtering across ID, display name, and owner.
  - Render compact non-secret metadata.
  - Support filtering, keyboard navigation, confirmation, cancellation, and cleanup.
  - Refuse non-TTY operation with an actionable message.
  - Route: delegated writer; trigger: multi-file write.
  - Allowed work-unit surfaces: `src/copilot/picker.ts`, `tests/copilot-picker.test.ts`.
  - Checks: focused picker tests, terminal cleanup/cancellation tests.

- [ ] **T2 — Integrate selection and picker-plus-launch command flow**
  - Add `pick [--wire-api=responses|completions]`.
  - Add an explicit picker-and-launch composition while preserving the existing `--` boundary.
  - Persist only after confirmed selection via existing state APIs.
  - Preserve current commands and deterministic ordinary `launch` behavior.
  - Route: delegated writer; trigger: multi-file write.
  - Allowed work-unit surfaces: `src/copilot/cli.ts`, `tests/copilot-cli.test.ts`.
  - Checks: focused CLI tests for routing, cancellation, state safety, and argument forwarding.

- [ ] **T3 — Update documentation and packaged runtime coverage**
  - Document interactive and automated workflows, cancellation, state behavior, and the native picker limitation.
  - Extend packed-consumer coverage for the published command surface without requiring a real TTY or credential.
  - Route: delegated writer; trigger: multi-file write.
  - Allowed work-unit surfaces: `README.md`, `scripts/pack-consumer.ts`.
  - Checks: packed consumer and release-manifest validation.

- [ ] **T4 — Verify live behavior and prepare delivery**
  - Run focused tests, full suite, package harness, release-manifest validation, and diff hygiene.
  - Perform a live Windows terminal selection and BYOK Copilot response check.
  - Record authored changed-line count, work-unit commit identities, RDD assessment outcomes, and PR slice boundaries.
  - Route: delegated verifier when required by native assessment; parent performs one reported-command spot check.

## Acceptance criteria

- A searchable picker discovers the current CLIProxyAPI catalog dynamically.
- Search matches model IDs, display names, and owners case-insensitively with deterministic ordering.
- Keyboard interaction supports filtering, moving selection, confirming, and cancelling.
- Terminal state is restored after confirmation, cancellation, and errors.
- Confirmation stores only model ID and wire API through the existing atomic state path.
- Cancellation, empty results, picker failures, and non-TTY execution do not corrupt or unexpectedly replace existing state.
- Existing explicit commands remain compatible for scripts and automation.
- Picker-and-launch forwards only arguments after the Copilot `--` boundary.
- Help and README accurately explain both workflows and the native `/model` boundary.
- No credentials are displayed or persisted.

## Review workload forecast

- T1: approximately 280–430 authored changed lines.
- T2: approximately 120–230 authored changed lines.
- T3: approximately 50–120 authored changed lines.
- Total forecast: approximately 450–780 authored changed lines depending on terminal UI depth.
- Actual uncommitted implementation plus ODD record: approximately 1,129 additions/deletions before final reconciliation.
- Selected delivery: stacked PRs to `main`.
- Planned slice 1: picker domain, terminal interaction, and focused picker tests (`src/copilot/picker.ts`, `tests/copilot-picker.test.ts`). This cohesive unit is approximately 787 lines and cannot honestly fit the 400-line budget without separating tests from behavior; request a documented `size:exception` for this slice rather than compressing or omitting coverage.
- Planned slice 2: CLI integration, state/launch composition, CLI tests, README, package harness, and ODD evidence. Retarget/rebase onto `main` after slice 1 merges so only this work unit appears.

## Progress and evidence

- Issue #59 created from the repository Feature Request form and read back successfully with `type:feature` and `status:needs-review`.
- User explicitly authorized approval of exact issue #59.
- Maintainer account `BenjaMolina` verified with `ADMIN` permission; atomic label transition read back as `type:feature`, `status:approved`.
- Read-only exploration confirmed the existing discovery, state, launch, test, and package seams; native Copilot CLI provides no observed dynamic external-catalog picker extension surface.
- Feature branch created: `feat/copilot-model-picker`.
- Bounded writer implemented T1–T3 and reported: focused tests 41 passed; full suite 108 passed; packed consumer passed; release-manifest validation passed; `git diff --check` passed.
- User selected `stacked-to-main` after the actual implementation exceeded the review budget.
- Native assessment was unavailable and failed closed to an independent-verifier requirement.
- First independent verification passed every requested command but found two deterministic defects: split ANSI escape sequences could cancel as standalone Escape, and an initial render failure could leave terminal state altered.
- A bounded correction added incremental escape buffering with deterministic timeout seams and moved initialization into a cleanup-safe lifecycle; correction checks reported 49 focused tests and 116 full-suite tests passing.
- Parent spot check: `bun test tests/copilot-picker.test.ts tests/copilot-cli.test.ts` — 49 passed, 0 failed, 164 expectations.
- Independent re-verification of the corrected candidate is in progress.

## Next step

Reconcile independent re-verification, create the two work-unit commits, then request exact authorization for the slice-1 `size:exception` before opening the stacked PRs.