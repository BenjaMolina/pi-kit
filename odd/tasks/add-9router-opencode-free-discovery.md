# Add OpenCode Free discovery to the Pi 9Router provider

Branch: `feat/9router-opencode-free-discovery` (from `main` at 752d776)

## Objective and evidence

Installed 9Router 0.5.104 accepts `oc/<id>` for current free OpenCode models (verified with real minimal calls: `glm-5.3-flash-free`, `deepseek-v4.1-flash-free`, `mimo-v2.6-flash-free`, `minimax-m3.1-flash-free`, `longcat-2.5-preview-free`, `nemotron-3.5-super-vl-free`), but its `/v1/models` only publishes four static `oc/` IDs. Two of those are dead upstream (`muse-spark-1.2-contributor-free` and `muse-spark-1.3-contributor-free` return 410 `ModelDeprecated`; `union-alpha` returns 400 unavailable). The Pi provider reads only `/v1/models`, so working free models are invisible and dead ones are offered.

Goal: keep the catalog self-maintaining. When 9Router or OpenCode rotates free models, Pi follows without code changes.

## Design

- Add an unauthenticated, bounded GET of the public catalog `https://opencode.ai/zen/v1/models` in `src/cliproxyapi/9router.ts` (no credentials sent, same body/size/time limits style as the existing discovery).
- Merge into the 9Router catalog inside `fetchNineRouterModels` only (Pi provider scope; OpenCode adapter untouched):
  - add `oc/<id>` for public IDs ending in `-free` that 9Router did not already publish (dedupe by exact ID, so a future 9Router fix needs no change);
  - when the public catalog was fetched successfully and is non-empty, drop `oc/` IDs published by 9Router that the public catalog no longer lists (retired models).
- Failure of the public fetch (network, timeout, invalid shape, oversize) never fails the 9Router catalog: fall back to today's behavior.
- Opt-out: `NINEROUTER_OPENCODE_FREE_DISCOVERY=0` skips the third-party request. `PI_OFFLINE` already skips all discovery.
- Metadata stays conservative (32k context / 4096 output). Existing ID validation applies.

## Constraints

- Single writer; allowed surfaces only: `src/cliproxyapi/9router.ts`, `extensions/9router-dynamic-provider.ts`, `tests/pi-9router-models.test.ts`, `tests/9router-dynamic-provider.test.ts`, `README.md`.
- TDD: on (source: repository convention in prior 9Router task records; runner: `bun test`). Observed RED before GREEN.
- No push, PR, release or npm publish. RDD off. No live inference in tests (mock fetch only).

## Tasks

- [x] 1. RED/GREEN: public catalog discovery plus merge/prune/fallback/opt-out in `fetchNineRouterModels`, with tests and README. Route: delegated writer (`gentle-ai-worker`), parent verifies and commits.
- [x] 2. Verify: focused tests, full `bun test`, `npm run test:pack`, `git diff --check`, and a bounded read-only check against the real local 9Router and public catalog (no inference). Route: delegated verifier.
- [ ] 3. Work-unit commit on the feature branch (Conventional Commit) and record its SHA here. Push, PR, release and local install remain user decisions.

## Evidence

- Task 1 (writer gentle-ai-worker, two rounds): RED observed (merge/prune test kept retired `oc/old-free`; regex test failed on missing helper; hanging-public test exposed added latency), then GREEN. Parent review fixed findings: double-escaped ID regex (now shared `VALID_MODEL_ID`), sequential requests exceeding the 3 s startup bound (now concurrent, raced against a cleared 3 s deadline), startup test mock counting the public request, missing cap test. Parent added the deadline `clearTimeout`.
- Task 2: independent gentle-ai-verify failed twice before reporting ("assistant reported an error", model `cliproxyapi/gpt-6.1-sol`, which the live CLIProxyAPI catalog does not list unprefixed; only `codex-asher/gpt-6.1-sol`). Parent ran the pre-declared verification commands directly: focused suites 32/0 after the parent edit; `bun test` 267 pass / 0 fail (1157 expectations, 17 files); `npm run test:pack` clean Pi 0.85.1 / OpenCode 1.18.18 / Codex / Copilot consumers; `git diff --check` ok. Live read-only check (no inference, key never printed): 9Router itself now publishes 56 models (52 non-oc + 4 static oc); kit with opt-out returns 56; kit with discovery returns 61 = 52 non-oc + 9 oc (`jev-1.13-free`, `beam-free`, `mimo-v2.6-flash-free`, `nemotron-3.5-super-vl-free`, `nemotron-3.5-lightning-free`, `longcat-2.5-preview-free`, `deepseek-v4.1-flash-free`, `glm-5.3-flash-free`, `minimax-m3.1-flash-free`); `muse-spark-*` and `union-alpha` pruned. Earlier manual real calls: six of those returned `ok` through 9Router; `beam-free`, `nemotron-3.5-lightning-free` and `jev-1.13-free` were not invoked. Native risk assessment unassessable (empty output).
