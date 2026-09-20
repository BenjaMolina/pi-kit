# Add Copilot model switch-and-resume command

Approved Issue: https://github.com/BenjaMolina/pi-kit/issues/65

## Objective

Add `pi-kit-copilot switch [--wire-api=responses|completions]` to select a new CLIProxyAPI model and resume the most recent native Copilot CLI session with `--continue`.

## Problem and why

The existing picker supports changing models before a new launch, but changing models during an active workflow requires exiting, selecting, and manually remembering `--continue`. A focused `switch` command removes that repetition without modifying native Copilot or its closed `/model` catalog.

## Scope and decisions

- Reuse the live CLIProxyAPI catalog, existing searchable picker, atomic non-secret state writer, and existing launcher seam.
- On confirmation, persist the selected model and invoke native Copilot with exactly `--continue`.
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
  - Launch exactly `['--continue']` only after confirmation.
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
- Launcher receives exactly `--continue`; command propagates its exit code.
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
- Bounded writer implemented T1–T2 with a shared CLI-local select/persist helper and strict `switch` parser.
- Writer verification passed: 25 focused tests, 122 full-suite tests, packed consumers, release-manifest validation, and diff hygiene.
- Parent spot check: `bun test tests/copilot-cli.test.ts` — 25 passed, 0 failed, 135 expectations; diff hygiene passed.
- Native assessment was unavailable because the package-local Gentle AI binary is missing after the recent global package alignment; assessment failed closed to an independent verifier, which is in progress. This tooling condition does not alter the candidate code.

## Next step

Reconcile independent verification, commit the work unit, open the approved PR, then perform live Windows switch-and-resume validation before merge.