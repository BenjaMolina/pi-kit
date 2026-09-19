# Add dynamic CLIProxyAPI integration for Copilot

## Goal

Integrate CLIProxyAPI with GitHub Copilot CLI and VS Code Copilot Chat/Agent through their official BYOK and Custom Endpoint surfaces, using automatic shared model discovery and reversible configuration.

## Scope

- Associated issue: #51
- Target branch: `feat/copilot-cliproxyapi` -> `main`
- Supported local baselines: GitHub Copilot CLI 1.0.86 and VS Code 1.138.0.
- Source of truth: CLIProxyAPI enriched model catalog with OpenAI-compatible fallback.
- Non-goals: replacing inline completions, semantic search, embeddings, or undocumented Copilot traffic interception.

## Delivery strategy

The feature is expected to exceed the 400-line review budget, so it will use stacked PR-ready work units:

1. Shared state, dynamic model selection, and Copilot CLI BYOK launcher.
2. VS Code Custom Endpoint catalog synchronization and rollback.
3. Unified doctor/docs/packaging integration and live runtime verification.

Each work unit keeps tests and user-facing documentation with the behavior it verifies.

## Tasks

- [x] Confirm focused scope and create approved issue #51. Evidence: `type:feature` + `status:approved`.
- [x] Implement shared non-secret Copilot state and dynamic model discovery/selection. Evidence: `src/copilot/state.ts` stores only version, model ID, and wire API under a deterministic injectable user config path; `models` and `use` call `discoverCLIProxyModels` and reject absent catalog IDs.
- [x] Implement Copilot CLI BYOK launcher using `responses`/`completions` and discovered model metadata. Evidence: `src/copilot/launcher.ts` resolves `copilot` from PATH or Windows WinGet, passes the exact proxy ID as wire model, maps Claude/Gemini/GPT to conservative catalog IDs, and passes discovered token limits without logging the key.
- [ ] Implement safe VS Code `chatLanguageModels.json` synchronization and uninstall rollback.
- [ ] Add unified `pi-kit-copilot` CLI commands (`sync`, `use`, `launch`, `status`, `doctor`, install/uninstall variants). Work unit 1 delivered `models`, `use`, `status`, `launch`, and `doctor`; `sync`/`vscode` are explicitly reserved and no VS Code mutation exists yet.
- [ ] Add tests, package-consumer checks, and documentation. Work unit 1 added focused Copilot tests, archive requirements, real packed-consumer `models`/`use` coverage, and delivered-CLI README documentation; VS Code coverage remains pending.
- [ ] Verify Gemini and Claude with Copilot CLI; verify generated VS Code models in Chat/Agent. Automated family-mapping and injected launch-plan coverage passed; live Copilot and VS Code runtime verification remain pending.
- [ ] Deliver reviewable PR slices linked to issue #51.

## Work unit 1 evidence

- Route: delegated implementation writer context; allowed surfaces restricted to this work unit.
- Strict TDD: not active. Focused behavior tests were run after implementation, then the full suite and pack consumer.
- Focused checks: `bun test tests/copilot-cli.test.ts tests/release-manifest-check.test.ts` — 13 passed.
- Full checks: `npm test` — 61 passed.
- Pack/runtime harness: `npm run test:pack` — packed package passed isolated Pi, OpenCode, Codex, and Copilot consumers; Copilot consumer ran packaged `--help`, dynamic `models`, and `use` against the mock CLIProxyAPI catalog.
- Release manifest: `bun scripts/release-manifest-check.ts` — validated `@benjamolina/pi-kit@0.5.9` with exactly `pi-kit-codex` and `pi-kit-copilot` bin targets.
- Diff hygiene: `git diff --check` — passed.
- Rollback boundary: remove the new `pi-kit-copilot` bin entry and `src/copilot/` modules plus their corresponding tests, package assertions, release-manifest requirement, and README section. No existing user configuration, VS Code file, Copilot configuration, credential file, or API key was mutated.
- Authored changed-line estimate: 751 additions and 10 deletions across the work unit, including source, tests, package harness, release validation, README, and this task record.
- Work-unit commit: `4d7a06c` (`feat(copilot): add dynamic CLIProxyAPI launcher`).
