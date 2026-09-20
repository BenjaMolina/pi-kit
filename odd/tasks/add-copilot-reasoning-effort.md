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

- [x] **T1 — Preserve authoritative reasoning metadata**: retain enriched default reasoning effort, distinguish authoritative level metadata from fallback heuristics, and cover discovery normalization. Evidence: focused tests 6/6 and full suite 131/131 passed; independent verification found no remaining issues. Commit: `857e3178b115f5daaca43680449d263d42d89a78`.
- [x] **T2 — Select and persist model-specific effort**: add the second interactive picker, optional backward-compatible state field, non-interactive `use` option, status output, cancellation semantics, and focused tests. Evidence: focused tests 108/108 and full suite 179/179 passed; independent verification found no remaining issues. Commits: `84b08f49b6f3f9552baba994b925cd05dc58983b`, `0b8598dcf4d26d2864a48467370d70ff779a1964`.
- [x] **T3 — Apply effort at launch and resume**: revalidate persisted effort against fresh model metadata, append `--reasoning-effort=<level>` without overriding explicit native arguments, and cover launch/resume behavior. Evidence: focused tests 78/78 and full suite 196/196 passed; Copilot CLI 1.0.86 help confirms `--reasoning-effort`; independent verification found no remaining issues. Commit: pending.
- [ ] **T4 — Document and verify the feature**: update user documentation; run focused tests, full tests, release-manifest/pack checks where applicable, runtime help verification, and diff hygiene.

## Delivery strategy

One feature branch with one work-unit commit per completed task. Monitor authored diff size; split into PR slices if the honest implementation approaches 400 changed lines.

## Evidence

- T1 implementation preserves provider-advertised supported effort names and order exactly except surrounding whitespace, normalizes the optional default independently, and marks fallback heuristic levels non-authoritative.
- T1 focused verification: `bun test tests/cliproxyapi-discovery.test.ts` — 6 passed, 0 failed.
- T1 full suite: `bun test` — 131 passed, 0 failed.
- T1 runtime harness: N/A because the task changes catalog normalization metadata only; launch behavior belongs to T3.
- T1 rollback boundary: `src/cliproxyapi/models.ts` and `tests/cliproxyapi-discovery.test.ts`.
- T2 implementation provides an authoritative model-specific effort picker, compatible optional state, non-interactive `use --reasoning-effort`, status output, and atomic cancellation semantics.
- T2 focused verification: `bun test tests/copilot-picker.test.ts tests/copilot-cli.test.ts` — 108 passed, 0 failed.
- T2 full suite: `bun test` — 179 passed, 0 failed.
- T2 runtime harness: N/A because applying effort to the external Copilot process belongs to T3; deterministic terminal and CLI seams cover selection/persistence.
- T2 rollback boundary: commits `84b08f4` and `0b8598d`, affecting `src/copilot/picker.ts`, `src/copilot/state.ts`, `src/copilot/cli.ts`, `tests/copilot-picker.test.ts`, and `tests/copilot-cli.test.ts`.
- T3 revalidates persisted effort against fresh authoritative model metadata, reconciles unique case-insensitive changes to current provider spelling, inserts generated flags before `--`, and preserves valid explicit native overrides independently.
- T3 focused verification: `bun test tests/copilot-cli.test.ts` — 78 passed, 0 failed.
- T3 full suite: `bun test` — 196 passed, 0 failed.
- T3 runtime harness: `copilot --version` reports 1.0.86; `copilot --help` confirms `--reasoning-effort <level>` and does not advertise `--effort`.
- T3 rollback boundary: `src/copilot/launcher.ts` and the T3 additions in `tests/copilot-cli.test.ts`.
