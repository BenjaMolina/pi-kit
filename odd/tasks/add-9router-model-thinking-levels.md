# Expose per-model thinking levels for every 9Router model

Branch: `feat/9router-model-thinking-levels` (from `main` at a135a4f)

## Objective and evidence

The Pi 9Router provider marks only three hardcoded `cx/...sol` IDs as reasoning models (`src/cliproxyapi/pi-9router.ts`). Every other model, including all `cc/` Claude models, is registered with `reasoning: false` and `supportsReasoningEffort: false`, so Pi shows no thinking selector and never sends `reasoning_effort`.

Verified against the local 9Router 0.5.104 (real calls, minimal prompts):

- `/v1/models` already publishes per-model `capabilities.reasoning`, `capabilities.thinkingFormat` (`openai`, `claude-adaptive`, `claude-budget`, `gemini-level`, `deepseek`) and `capabilities.thinkingCanDisable`. It does NOT publish the accepted level list.
- `cc/claude-sonnet-5` with `reasoning_effort: "high"` streams `reasoning_content` deltas; with `"none"` it streams none.
- Unsupported Pi levels never error: `cc/claude-haiku-4-5` with `xhigh`, `cc/claude-sonnet-5` with `max`, `ag/gemini-3.8-flash-high` with `xhigh` all returned 200. 9Router silently downgrades them (`xhigh` to `high` for `claude-adaptive` when the model does not list it; `max`/`ultra` to `xhigh`). Only a non-level string such as `bogus` returns 400.
- Consequence: offering a level a model lacks is not an error but is misleading (the user picks `xhigh` and silently gets `high`). The selector must show only the levels each model really has.
- 9Router resolves levels from an internal table (container chunk, function `o`): per-format defaults plus model-pattern overrides. The relevant rules are mirrored below.

## Design

Inputs per model: `capabilities.reasoning`, `capabilities.thinkingFormat`, `capabilities.thinkingCanDisable` from `/v1/models`, plus the model ID.

Level resolution (mirror of 9Router 0.5.104; first matching override wins, else the format default):

| Override (pattern on the ID without provider prefix) | Levels |
| --- | --- |
| `*gemini-4*` | low, medium, high |
| `*claude*4.6*`, `*claude*4-6*` | none, low, medium, high, max |
| `cx/` + `*gpt-6*` | none, minimal, low, medium, high, xhigh, max |
| `cx/` + `*gpt-5.6-sol*`, `*gpt-5.6-terra*` | same as gpt-6 (+ `ultra`, not a Pi level, ignored) |
| `cx/` + `*gpt-5.6-luna*` | same as gpt-6 |
| `*codex*` | low, medium, high, xhigh |
| `*mimo*v2.6*`, `*mimo*v2.5-pro*` | none, low, medium, high, xhigh |
| `*deepseek-v4.*` | none, low, medium, high, xhigh, max |

Format defaults: `openai` none/minimal/low/medium/high/xhigh; `claude-adaptive` and `claude-budget` none/low/medium/high/xhigh/max; `gemini-level` minimal/low/medium/high; `deepseek` none/high/max; any other format none/low/medium/high.

Rules:

- `none` is removed when `thinkingCanDisable === false`.
- Pi `thinkingLevelMap`: each Pi level maps to itself when present, else `null`; Pi `off` maps to `"none"` when `none` is present, else `null`.
- The three existing hardcoded Sol maps stay exactly as they are (existing tests).
- Models whose ID ends in `-high`, `-medium` or `-low` after the provider prefix already encode effort in the ID (`ag/...-high`): no selector, `reasoning: false` (current behavior). Not verified which one wins upstream.
- `capabilities.reasoning !== true`, or models without capabilities (for example merged `oc/*-free`): `reasoning: false` as today.
- Sanitize the three capability fields in discovery (boolean/short string only); never copy other fields.

## Constraints

- Allowed edit surfaces: `src/cliproxyapi/pi-9router.ts`, `src/cliproxyapi/9router.ts`, `tests/9router-dynamic-provider.test.ts`, `tests/pi-9router-models.test.ts`, `README.md`.
- TDD on (runner `bun test`); observe RED before GREEN.
- No live inference in tests (mock fetch only). No push, PR, release or publish without the user. RDD off.

## Tasks

- [x] 1. RED/GREEN: carry sanitized `capabilities` through discovery and resolve per-model thinking maps in `toPiModelFrom9Router`, with tests and a README note. Route: delegated writer (`gentle-ai-worker`).
- [x] 2. Verify: focused suites, full `bun test`, `npm run test:pack`, `git diff --check`, and a read-only check of the real catalog (no inference). Route: parent runs the commands.
- [x] 3. Work-unit commit on the feature branch (Conventional Commit); record the SHA. Push, PR and release remain user decisions.

## Evidence

- Task 1 (writer, two rounds): RED observed (new mapping and sanitization tests failed before implementation; second round reproduced the `[1m]` suffix bug). Parent review found a double-escaped regex (`/\\[1m\\]$/` matched a literal backslash, so `[1m]` was never stripped); the second writer round fixed it and added the missing end-to-end `refreshModels` test.
- Task 2: focused suites 44/0; full `bun test` 271 pass / 0 fail (the first run's one Copilot launcher failure was a 5 s timeout, not reproduced); `npm run test:pack` clean (Pi 0.85.1, OpenCode 1.18.18, Codex, Copilot); `git diff --check` ok. Live read-only check against the local 9Router (opt-out of the public OpenCode request, no inference): 56 models, 31 with a thinking selector. Examples: `cc/claude-opus-5-5` low..max without `off` (cannot disable); `cc/claude-sonnet-5` off..max; `ag/gemini-3.8-flash` minimal..high; `ag/claude-sonnet-4-6` off,low,medium,high,max (no xhigh); `mmf/mimo-auto` high,max; every `ag/*-high|medium|low` has no selector.
- Known limits: the level table mirrors 9Router 0.5.104 and can drift; `cx/gpt-6-sol[1m]` gets the table's full list while the retained hardcoded `cx/gpt-6-sol` keeps its narrower exact map (existing tests lock the hardcoded maps); `ultra` (9Router-only) is not a Pi level; what 9Router does with an effort-suffixed ID plus `reasoning_effort` was not verified; the Pi selector UI itself was not exercised, only the model maps.
