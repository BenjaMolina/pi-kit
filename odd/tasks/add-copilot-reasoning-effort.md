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
- [x] **T3 — Apply effort at launch and resume**: revalidate persisted effort against fresh model metadata, append `--reasoning-effort=<level>` without overriding explicit native arguments, and cover launch/resume behavior. Evidence: focused tests 78/78 and full suite 196/196 passed; Copilot CLI 1.0.86 help confirms `--reasoning-effort`; independent verification found no remaining issues. Commit: `83434cbf51b724dd44adb6cb961b6964791aa61c`.
- [x] **T4 — Document and verify the feature**: update user documentation; run focused tests, full tests, release-manifest/pack checks where applicable, runtime help verification, and diff hygiene. Evidence: 196/196 tests, release manifest, packed consumers, npm pack dry-run, runtime help, and diff hygiene passed; independent final verification found no issues. Commit: `419ee2f67b948fe1f681828986a80418ff27ceb3`.

## Delivery strategy

Stacked PRs to `main`, preserving work-unit boundaries. Merge and retarget in order so each PR shows only its own slice:

1. PR #71 — metadata foundation (`main` ← `feat/copilot-reasoning-metadata`), 194 changed lines.
2. PR #72 — reusable picker core (base: `feat/copilot-reasoning-metadata`), 275 changed lines.
3. PR #73 — selection and persistence (base: `refactor/copilot-picker-core`), 509 changed lines with user-authorized `size:exception` because picker, state, CLI workflow, and safety tests are one atomic behavior.
4. PR #74 — launch and resume application (base: `feat/copilot-reasoning-selection`), 647 changed lines with user-authorized `size:exception` because process-boundary behavior and its complete safety matrix cannot be separated honestly.
5. PR #75 — documentation and final evidence (base: `feat/copilot-reasoning-launch`), 42 changed lines.

Chain: https://github.com/BenjaMolina/pi-kit/pull/71 → https://github.com/BenjaMolina/pi-kit/pull/72 → https://github.com/BenjaMolina/pi-kit/pull/73 → https://github.com/BenjaMolina/pi-kit/pull/74 → https://github.com/BenjaMolina/pi-kit/pull/75.

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
- T4 documentation explains model-specific authoritative effort choices, optional non-secret state, non-interactive selection, launch/resume revalidation, explicit override precedence, and fail-fast stale metadata handling.
- T4 final suite: `bun test` — 196 passed, 0 failed.
- T4 release checks: `npm run test:release-manifest`, `npm run test:pack`, and `npm pack --dry-run` all passed.
- T4 runtime evidence: local GitHub Copilot CLI 1.0.86 advertises `--reasoning-effort <level>`; no provider call was made.
- T4 diff hygiene: `git diff --check` passed with only the repository's Windows LF→CRLF warning for this ODD document.
- Independent final verification reported no findings. Live provider end-to-end execution was intentionally not run.
- Review workload: branch implementation is over 400 changed lines; preserve the existing work-unit commit boundaries and use chained PR slices if delivering for external review.
