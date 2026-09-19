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
- [x] Implement safe VS Code `chatLanguageModels.json` synchronization and uninstall rollback. Evidence: `src/copilot/vscode.ts` resolves only user-level configuration paths, preserves provider-level JSON structure, refuses unsafe configuration, discovers the live catalog, and atomically replaces its one managed provider.
- [x] Add unified `pi-kit-copilot` VS Code commands. Evidence: `sync`, `vscode sync`, `vscode status`, and `vscode uninstall` are routed in `src/copilot/cli.ts`; synchronization preserves shared preferred model state and never starts/restarts VS Code.
- [x] Add VS Code tests, package-consumer checks, and documentation. Evidence: focused config/CLI tests cover first install, refresh, preservation, unsafe refusal, secret-safe output, uninstall, atomic failures, paths, routing, and doctor; the packed consumer executes `vscode sync` and `vscode uninstall`.
- [x] Verify Gemini and Claude with Copilot CLI; verify generated VS Code models in Chat/Agent. Evidence: Copilot CLI 1.0.86 launched with BYOK environment responded live with Gemini (`gemini-3.8-flash-high`) and Claude (`agy-bmolina/claude-opus-4-6-thinking`); VS Code `chatLanguageModels.json` synchronized 55 dynamic models with `/v1/responses` URLs and toolCalling/vision/reasoning capabilities.
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

## Work unit 2 evidence

- Runtime harness: Bun tests use injected filesystem, environment, platform, home, and CLIProxyAPI fetch seams. The packed npm consumer uses isolated HOME/XDG paths plus a local mock `/v1/models` registry and runs the packaged VS Code commands; no real user VS Code configuration is accessed.
- Focused checks: `bun test tests/copilot-vscode.test.ts tests/copilot-cli.test.ts tests/codex-pack-consumer.test.ts tests/release-manifest-check.test.ts` — 25 passed.
- Full checks: `npm test` — 71 passed.
- Pack/runtime harness: `npm run test:pack` — packed package passed isolated Pi, OpenCode, Codex, and Copilot consumers; Copilot ran packaged `vscode sync` then `vscode uninstall` against the mock catalog.
- Release manifest: `bun scripts/release-manifest-check.ts` — validated `@benjamolina/pi-kit@0.5.9`.
- Diff hygiene: `git diff --check` — passed; Git emitted only existing line-ending normalization warnings for edited CRLF worktree files.
- Rollback boundary: remove `src/copilot/vscode.ts` and its direct command, test, package-harness, documentation, and task-record references. Runtime writes are limited to atomically replacing the explicit/user `chatLanguageModels.json`; a failed replacement cleans its temporary file and leaves the previous target intact. Uninstall removes only the unique pi-kit-managed provider.
- Authored changed-line estimate: approximately 560 additions and 11 deletions across the source module, focused tests, CLI, package harness, README, and this task record.
- Work-unit commit: `aa79202` (`feat(copilot): add VS Code Custom Endpoint synchronization`).
