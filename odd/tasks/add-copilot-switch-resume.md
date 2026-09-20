# Add Copilot model switch-and-resume command

Approved Issue: https://github.com/BenjaMolina/pi-kit/issues/65

## Objective

Add `pi-kit-copilot switch [--wire-api=responses|completions]` to select a new CLIProxyAPI model and resume the most recent native Copilot CLI session with `--continue`.

## Problem and why

The existing picker supports changing models before a new launch, but changing models during an active workflow requires exiting, selecting, and manually remembering `--continue`. A focused `switch` command removes that repetition without modifying native Copilot or its closed `/model` catalog.

## Scope and decisions

- Reuse the live CLIProxyAPI catalog, existing searchable picker, atomic non-secret state writer, and existing launcher seam.
- On confirmation, persist the selected model and resume native Copilot with `--continue` plus the selected conservative Copilot catalog-model override. Live evidence proved `--continue` alone restores the session journal's previous model and overrides the new BYOK selection.
- Default wire API is `responses`; optional `--wire-api=completions` mirrors `pick`.
- Cancellation is a successful no-op: no write and no launch.
- No arbitrary Copilot passthrough arguments. Users needing extra flags retain `launch --pick -- --continue <args...>`.
- No launcher, state-schema, picker, package-bin, or native Copilot changes.
- Delivery strategy: `single-pr`; forecast 100–190 authored lines.
- TDD mode not explicitly enabled; ordinary functional checks use Bun/npm.

## Tasks

- [x] **T1 — Implement switch command and focused contracts**
  - Add help and strict parser behavior.
  - Extract a small CLI-local selection/persistence helper to avoid a third duplicate flow.
  - Resume only after confirmation; the launch-plan layer must add `--model=<catalogModelId>` to `--continue`/`--resume` unless the user supplied an explicit native model override.
  - Cover default/completions, exit-code propagation, cancellation with/without state, invalid syntax, and regressions.
  - Route: delegated writer; multi-file write trigger.
  - Edit surfaces: `src/copilot/cli.ts`, `tests/copilot-cli.test.ts`.

- [x] **T2 — Document and verify packaged command surface**
  - Add command-table and workflow guidance.
  - Distinguish from `launch --pick -- --continue <args...>`.
  - Exercise non-TTY refusal/state safety in the packed consumer.
  - Route: delegated writer; multi-file write trigger.
  - Edit surfaces: `README.md`, `scripts/pack-consumer.ts`.

- [ ] **T3 — Verify, deliver, and validate live resume**
  - Run focused/full tests, pack consumer, release manifest, and diff hygiene.
  - Perform live Windows model switch and confirm the most recent Copilot session resumes through BYOK.
  - Commit, open a green PR linked to Issue #65, and merge according to ordinary policy.

## Acceptance criteria

- `switch` dynamically discovers and displays current CLIProxyAPI models.
- Confirmation atomically persists only model ID and wire API.
- Switch requests `--continue`, and the launch plan adds the selected catalog-model override while preserving the exact proxy wire model; command propagates the native exit code.
- Cancellation preserves existing state or absence and never launches.
- Invalid syntax fails without state/launch side effects.
- Existing picker and launch workflows remain compatible.
- Help, README, and packed npm consumer expose the command.
- Live Windows flow resumes the most recent Copilot session with the selected BYOK model.

## Progress

- Issue #65 created from the Feature Request form and read back successfully.
- User explicitly authorized exact Issue #65 approval.
- Maintainer account verified with `ADMIN`; atomic label transition confirmed `type:feature`, `status:approved`.
- Read-only exploration mapped the smallest implementation and exact edit surfaces.
- Branch created: `feat/copilot-switch-resume`.
- Initial bounded writer implemented T1–T2 with a shared CLI-local select/persist helper and strict `switch` parser.
- Initial automated verification passed: 25 focused tests, 122 full-suite tests, packed consumers, release-manifest validation, and diff hygiene.
- PR #66 opened and CI passed, but live Windows validation reproduced a deterministic resume defect before merge: after switching from Sonnet to Gemini, Copilot restored `claude-sonnet-4` from the native session journal and CLIProxyAPI rejected it with `400 unknown provider for model claude-sonnet-4`.
- Read-only diagnosis verified that Copilot session journals persist an authoritative selected catalog model. A new BYOK environment alone does not override it. The documented precedence mechanism is an explicit native `--model` argument.
- Correction scope: centralize resume-model override in `createCopilotLaunchPlan` for `--continue`, `--resume`, and `--resume=<id>`; preserve explicit user `--model`; retain the selected exact CLIProxyAPI ID in `COPILOT_PROVIDER_WIRE_MODEL`.
- Bounded correction implemented in `src/copilot/launcher.ts` with comprehensive launch-plan tests and README clarification.
- Correction verification passed: 30 focused tests, 127 full-suite tests, packed consumers, release-manifest validation, and diff hygiene.
- Parent spot check: `bun test tests/copilot-cli.test.ts` — 30 passed, 0 failed, 155 expectations; diff hygiene passed.
- Independent correction verification passed every automated check and found no deterministic defect; status remained partial only pending the real provider/session test.
- Correction commit `8a57486` was pushed to PR #66; CI `verify` passed and the PR is clean.
- Live Windows validation passed after the correction: a session created under Sonnet was switched to `gemini-3.8-flash-high`, resumed successfully, retained the conversation fact `ORQUÍDEA`, showed Gemini in the footer, and produced no provider-routing error.
- A separate native auxiliary-model issue involving `gpt-5.4-nano` was observed but is outside Issue #65 and will not broaden this correction.
- Follow-up observation: the current picker selects a model but does not select/persist Copilot's `--reasoning-effort`; reasoning-level selection is new product scope and is not included in Issue #65.

## Next step

Merge PR #66 after explicit authorization. Handle reasoning-effort selection as a separate approved feature so the verified switch-and-resume fix remains focused.