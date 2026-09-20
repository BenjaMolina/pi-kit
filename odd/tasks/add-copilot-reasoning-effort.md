# Add model-specific Copilot reasoning effort

Approved Issue: https://github.com/BenjaMolina/pi-kit/issues/70

## Goal

Allow `pi-kit-copilot` users to select and persist the reasoning effort advertised by each selected CLIProxyAPI model, then pass that exact effort to GitHub Copilot CLI for new and resumed sessions.

## Constraints

- Reasoning levels are model-specific. Never impose a universal capability list or rename provider-advertised values.
- Interactive options come only from authoritative enriched `supported_reasoning_levels` metadata.
- Fallback catalog heuristics must not be presented as authoritative effort choices.
- GitHub Copilot CLI transport accepts `--reasoning-effort`; preserve an explicit user-provided override.
- Existing model-only state remains readable.
- Cancellation must not persist a partial model/effort selection.

## Tasks

- [x] **T1 — Preserve authoritative reasoning metadata**: retain enriched default reasoning effort, distinguish authoritative level metadata from fallback heuristics, and cover discovery normalization. Evidence: focused tests 6/6 and full suite 131/131 passed; independent verification found no remaining issues. Commit: pending.
- [ ] **T2 — Select and persist model-specific effort**: add the second interactive picker, optional backward-compatible state field, non-interactive `use` option, status output, cancellation semantics, and focused tests.
- [ ] **T3 — Apply effort at launch and resume**: revalidate persisted effort against fresh model metadata, append `--reasoning-effort=<level>` without overriding explicit native arguments, and cover launch/resume behavior.
- [ ] **T4 — Document and verify the feature**: update user documentation; run focused tests, full tests, release-manifest/pack checks where applicable, runtime help verification, and diff hygiene.

## Delivery strategy

One feature branch with one work-unit commit per completed task. Monitor authored diff size; split into PR slices if the honest implementation approaches 400 changed lines.

## Evidence

- T1 implementation preserves provider-advertised supported effort names and order exactly except surrounding whitespace, normalizes the optional default independently, and marks fallback heuristic levels non-authoritative.
- T1 focused verification: `bun test tests/cliproxyapi-discovery.test.ts` — 6 passed, 0 failed.
- T1 full suite: `bun test` — 131 passed, 0 failed.
- T1 runtime harness: N/A because the task changes catalog normalization metadata only; launch behavior belongs to T3.
- T1 rollback boundary: `src/cliproxyapi/models.ts` and `tests/cliproxyapi-discovery.test.ts`.
