# Add dynamic 9Router provider to Pi

## Objective and context

Expose the local 9Router catalog as a separate Pi model provider via the existing pi-kit package. OpenCode already supports 9Router, but the Pi extension currently registers only CLIProxyAPI. Keep the exact 9Router model IDs on the wire and preserve native/default model selection.

## Scope and constraints

- Add a separate Pi `9router` provider, opt-in through `NINEROUTER_API_KEY`, using `NINEROUTER_BASE_URL` or the current local default. Reuse bounded authenticated discovery; no credential persistence or logging.
- Map only catalog-supported limits and conservative text capability to Pi; do not guess reasoning, vision, or pricing. Never change the existing CLIProxyAPI or OpenCode provider behavior.
- Handle missing key/offline/malformed catalog without disrupting unrelated providers. Respect Pi provider registration/config precedence as actually observed; never overwrite live user configuration.
- Test with mock catalogs and isolated packaged Pi consumer; no real inference or changes to installed user configuration. Publishing/installing globally is out of scope.

## TDD and execution route

- TDD: not enabled by current project/session configuration; previous task-specific settings do not apply. Source: repository conventions and read-only map. Behavior-first functional verification applies.
- Runner: `bun test`; focused `bun test tests/9router-dynamic-provider.test.ts`; package `bun run test:pack`; full `bun test`.
- Route: delegated exploration (4+ files), then one scoped delegated writer for coordinated source/tests/docs/package smoke. Parent owns task evidence and commit.
- Delivered 210 authored lines in PI9-1, 448 authored lines in PI9-2 (additions + deletions), excluding this task record. Delivery strategy: `feature-branch-chain` explicitly chosen by user. User accepted a `size:exception` for the smallest honest second slice (~448 lines). No tests/docs dropped or code compressed for size.

## Work units

- [x] **PI9-1 — Pure Pi 9Router catalog mapping and cancellable discovery.** Deliver `src/cliproxyapi/pi-9router.ts`, `src/cliproxyapi/9router.ts`, and `tests/pi-9router-models.test.ts` together. Check focused `bun test tests/pi-9router-models.test.ts`, full `bun test`, `git diff --check` in the first-branch tree; runtime harness N/A because pure mapping/discovery has no Pi registration boundary yet. Rollback boundary: these three paths. Route: already delegated multi-file writer; parent verifies and commits on first branch.
- [x] **PI9-2 — Register and prove Pi 9Router provider in packaged consumer.** Deliver `extensions/9router-dynamic-provider.ts`, `tests/9router-dynamic-provider.test.ts`, `scripts/pack-consumer.ts`, and `README.md` on a successive branch based on PI9-1. Check focused tests, `bun run test:pack` with Pi `--list-models`, full `bun test`, and `git diff --check`; no live inference or user config edits. Rollback boundary: these four paths. Route: already delegated multi-file writer; parent verifies and commits second slice.

## Acceptance and evidence

- `9router/<exact-model-id>` is selectable in Pi with configured environment key and valid catalog; no default changes.
- Missing/offline/bad catalog leaves other Pi providers usable; no secret printed or persisted.
- Packaged installed consumer resolves extension and catalogs; observed checks and any limitations recorded honestly.

## Progress

- Read-only exploration mapped the existing Pi and OpenCode implementations; branch `feat/pi-9router-provider` from `cc5d85a14d4201c7c990aa494438074c91d67dac` (clean `main` before tracking file). Native review switch: off.
- PI9-1 implementation drafted by delegated writer across `extensions/9router-dynamic-provider.ts`, `src/cliproxyapi/9router.ts`, `tests/9router-dynamic-provider.test.ts`, `scripts/pack-consumer.ts`, and `README.md`. Writer reported focused tests 23/23, package consumer passed, full suite 241/241, and `git diff --check` clean; these results have not yet been independently verified by the parent. Isolated mock Pi consumer ran without live inference or user config edits.
- User subsequently chose `feature-branch-chain` delivery. Independent verifier observed focused 23/23, full suite 241/241, package consumer pass and clean diff, but found that initial package proof called the helper rather than Pi itself, and invalid endpoint/key injection defects. A bounded writer corrected these: now reports focused 25/25, suite 243/243, package consumer pass with actual `pi --list-models`, and clean diff; independent re-verification remains pending.
- After user chose to restructure, delegated writers separated pure catalog mapping/discovery and their tests from provider registration/lifecycle/package proof. User explicitly accepted the second slice `size:exception` while retaining the feature-branch chain. Read-only scout launch failed because its configured `cliproxyapi/gemini-3.8-flash-high:high` model is unavailable; diagnosed as a local subagent config mismatch without altering configuration.
- PI9-1 independently verified in disposable HEAD + exactly the three first-slice paths (second-slice files excluded): `bun test tests/pi-9router-models.test.ts` 8 passed/0 failed, `bun test` 226 passed/0 failed across 15 files, CRLF-aware whitespace check and `git diff --check -- src/cliproxyapi/9router.ts` clean. First attempted isolated run failed due to missing Bun Windows dependency junction; corrected and rerun. A no-index whitespace check gave CRLF false positives; Git staged `diff --check` is clean. Runtime harness N/A: pure model mapping and discovery have no Pi registration boundary yet. Staged slice exact 208 insertions + 2 deletions = 210 authored lines. Rollback: three first-slice paths. Work-unit commit `bb641f8e3bd609d2c8826ee2ee96023709eb49a9` (`feat(pi): map and discover 9Router models`) on `feat/pi-9router-provider`.
- PI9-2 completed on `feat/pi-9router-provider-runtime`, branched from PI9-1 commit `bb641f8e3bd609d2c8826ee2ee96023709eb49a9`. Independent verification after final staged normalization: `bun test tests/pi-9router-models.test.ts tests/9router-dynamic-provider.test.ts` 25 passed/0 failed; `bun run test:pack` passed with isolated Pi 0.85.1 `--list-models --approve` asserting `9router` and `mock-nine-router-model` on the same row; `bun test` 243 passed/0 failed across 16 files; `git diff --cached --check` clean. Runtime harness was isolated packed Pi consumer with mocked catalog, no live inference or live config edits. Work-unit commit `c6b689a6de8b5b479e96c60ad10aa1ba8d8a02ef` (`feat(pi): register 9Router dynamic provider`), exact 445 insertions + 3 deletions = 448 authored lines. Rollback boundary: extension, focused lifecycle tests, package consumer assertions and README. Pack consumer does not test failure paths in real Pi (unit tests cover missing key, invalid URL, offline and malformed catalogs). Live 9Router inference and user installation remain untested/out of scope. No PR or release created.
- Chain boundaries: proposed first PR `feat/pi-9router-provider` → `main` contains `bb641f8`; proposed second PR `feat/pi-9router-provider-runtime` → `feat/pi-9router-provider` contains `c6b689a`. Push and PR creation require user decision; no remote mutations made.
