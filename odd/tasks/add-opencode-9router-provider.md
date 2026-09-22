# Add first-party 9Router discovery to OpenCode

## Objective and context

Expose the locally running 9Router model catalog as a separate `9router` provider through the existing `@benjamolina/pi-kit` OpenCode plugin. The packaged entry currently exports only `opencode/cliproxyapi.ts`, so a separate entry file would not load through npm. A community plugin was evaluated: discovery succeeded behind a wrapper, but its v0.9.0 default export did not load directly in OpenCode 1.18.31. First-party integration avoids that dependency and preserves CLIProxyAPI coexistence.

## Scope and constraints

- Extend the existing single OpenCode plugin entry; retain the existing `cliproxyapi` behavior and default/package export.
- Use an opt-in `NINEROUTER_API_KEY` environment variable (same secret indirection as the Codex profile) and `NINEROUTER_BASE_URL` override, default `http://127.0.0.1:20128/v1`.
- Query the authenticated OpenAI-compatible `/v1/models` catalog at startup; map safely to OpenCode model configuration with conservative capabilities/limits. Never persist or log credentials.
- Do not overwrite a user-owned `provider.9router` entry or change the selected/default model. Missing credentials or unreachable 9Router must leave OpenCode startup and CLIProxyAPI behavior intact.
- Keep tests with behavior, document activation and limitations, and verify packaged consumer behavior. No edits to live OpenCode or 9Router configuration.

## TDD and execution route

- TDD mode: not explicitly enabled by current project/session configuration; prior task-specific TDD settings do not apply. Source: repository configuration and previous ODD task conventions. Ordinary behavior-first functional verification applies.
- Runner: `bun test`; focused: `bun test tests/opencode-cliproxyapi.test.ts tests/opencode-cliproxyapi-runtime-smoke.test.ts`; package: `bun run test:pack`.
- Route: one bounded delegated writer for multi-file implementation and preparation after delegated read-only exploration (4+ files). Parent owns task reconciliation and branch state. A separate verifier follows native risk assessment if required.
- Initial forecast: approximately 250–400 authored changed lines across source, tests, docs and this task document; delivery strategy `ask-on-risk` if accumulated branch exceeds ~400 lines. The budget is advisory, never a reason to omit tests or compress code.

## Work units

- [x] **OC9-1 — Dynamic 9Router provider alongside CLIProxyAPI.** Implement authenticated, bounded catalog discovery and safe provider mapping within the packaged entry; add focused coexistence, collision, no-secret/no-key, malformed/unavailable, and exact-ID tests. Check: focused Bun tests pass. Runtime harness: isolated OpenCode 1.18.31 using local 9Router; avoid live configuration edits. Rollback boundary: new 9Router discovery and call site plus focused tests, with existing CLIProxyAPI behavior unchanged. Route: delegated writer, multi-file change.
- [x] **OC9-2 — Packaged runtime and usage guidance.** Cover package entry behavior in runtime smoke/pack consumer as needed and document env/endpoint and `9router/<id>` selection. Check: `bun run test:pack`, focused runtime smoke, and full `bun test` if feasible. Rollback boundary: package-consumer 9Router assertions and user-facing guidance. Route: delegated writer for coordinated files, parent reconciles evidence.

## Acceptance and evidence

- Authenticated 9Router catalog appears under `9router` with actual model IDs; existing CLIProxyAPI provider still behaves as before.
- Missing key, offline service, malformed catalog, and user-owned `9router` config do not break OpenCode startup or overwrite ownership.
- Selected model and root configuration are unchanged, with no secret value logged or written to repo/user config.
- The locally packed npm entry exposes the behavior; focused, package, and runtime checks report observed outcomes. Publishing a new version is separate.

## Progress

- Exploration complete: `package.json` exports `opencode/cliproxyapi.ts`, current config hook lives in `src/cliproxyapi/opencode.ts`.
- Branch: `feat/opencode-9router-provider`, branched from `main` at `992f1db`.
- OC9-1 focused tests passed: `bun test tests/opencode-cliproxyapi.test.ts tests/opencode-cliproxyapi-runtime-smoke.test.ts` (10 pass, 0 fail, independently repeated by parent). CLIProxyAPI coexistence, ownership, missing/offline key and malformed catalog covered with injected fetch.
- OC9-2 isolated package consumer passed: `bun run test:pack` loaded both mock catalogs through the npm entry in OpenCode 1.18.18; authenticated GET `/nine/v1/models` observed. The fixture initially missed the new source module, then was corrected without weakening the package requirement. `bun test` passed (216 pass, 0 fail); `bun test tests/codex-pack-consumer.test.ts` passed (2 pass, 0 fail) in independent read-only verification.
- Live runtime harness passed with a temporary HOME and config file outside the repository: OpenCode 1.18.31 loaded this branch's plugin, listed 48 `9router` models including `9router/ag/gemini-3.8-flash`, and `opencode run` with that model returned exact `LIVE_OK` (exit 0). The key stayed in child process environment and was not printed or saved to config. The harness printed no cleanup error, though deletion was not independently checked. Its child output was suppressed, so default-agent overhead is unknown.
- `git diff --check` passed in independent verification and parent readback. Native risk assessment returned `unassessable` because the native assess command returned empty output; RDD off, so an independent verifier was run. No native review or receipt claimed. No live user config edited.
- Delivery: one cohesive work-unit commit `6a873b80fc38c5262f57a41253947d461badc8ca` contains both behaviors, tests and docs (215 authored diff lines including this task document before closeout). Commit assessment against `992f1db` returned high risk due to the pack-consumer process boundary, with RDD off and an independent verifier already completed on the same candidate. No PR created; issue-first approval applies before PR preparation. Package release and user installation belong to separate authorization.
- Next: preserve this evidence closeout; hand off the clean feature branch for an approved issue/PR decision.
