# Enrich OpenCode Free model limits in the Pi 9Router provider

## Authorization and scope

User approved keeping Zen as availability authority and enriching exact free IDs from models.dev, with bounded fetching, cache, graceful fallback, and no invented thinking levels. User separately authorized issue approval, PR merge, release 0.14.1, and install; those actions are not inferred as completed here. No inference is authorized.

Branch: `fix/9router-opencode-free-metadata` from main. Route: delegated direct writer (multiple runtime/test files), independent verification per native assessment. Delivery strategy: ask-on-risk; forecast approximately 300 authored changed lines. TDD on, following prior 9Router task convention; runner `bun test`.

## Design and evidence

- Zen `/zen/v1/models` remains the sole public availability authority; models.dev must never add IDs by itself.
- Optional public unauthenticated GET `https://models.dev/api.json`, extracting only exact `opencode.models` entries. No paid-model inheritance or stripping `-free`.
- Exact DeepSeek Free metadata observed: context 200000/output 32000, unlike paid base 1000000/384000. Eight of nine current Zen free IDs matched; jev missing.
- Module-memory cache with finite TTL, bounded body, schema/value validation, no credentials/disk state. Scope cache to fetch implementation to isolate callers/tests; coalesce concurrent fetches and don't permanently cache failure. Do not let an aborted caller poison later callers.
- Metadata enrichment only after successful Zen discovery with free IDs, within the existing shared startup budget; guard against injected fetch implementations ignoring AbortSignal. Opt-out/offline skip public requests as before.
- Preserve existing 9Router entries. New merged free entries get validated limits from exact metadata; unknown/invalid fields retain conservative defaults. Preserve existing safety caps (context 1048576/output65536/context-minus-one).
- Reasoning boolean is not evidence of effort levels. Inspect Pi's selector behavior before propagating it; do not expose inferred default effort choices or send unsupported reasoning_effort. No speculative multimodal/tool capability enablement.
- Failure mechanism previously observed: final length/one reasoning token/no report. Pi can floor output to one token with fallback32k plus safety4096 and growing context; actual historical wire max_tokens not captured, so causation not proven.

## Tasks

- [x] Implement exact-ID metadata enrichment/cache/deadline with mocked tests and README (delegated writer). Writer final full suite: 287 passed, 0 failed; pack clean.
- [x] Assess diff, run required independent checks and read-only live catalog verification (no inference). Independent final focused suite: 64 passed, 0 failed; diff check clean. An earlier independent full suite passed 285, 0, and pack was clean before the final two tests were added. Independent assessment marked unavailable was treated as high; independent verifier completed.
- [x] Commit coherent work unit and record evidence: commit `a26f876`, merged as PR #124. The user accepted the single-PR size exception. No push, release, or install is recorded as completed.

## Verification and rollback

Focused tests: `bun test tests/9router-dynamic-provider.test.ts tests/pi-9router-models.test.ts tests/pi-dynamic-provider-startup.test.ts`.
Full checks: `bun test`, `bun run test:pack`, `git diff --check`.
Live runtime harness: import feature extension and fetch catalogs only, print selected model limits and no secrets.
Rollback: revert this metadata-enrichment work unit to restore Zen ID-only discovery and conservative fallback limits; unrelated providers unchanged.

## Final verified evidence

- Live read-only catalog check found 61 models; first request took 955 ms and repeat took 120 ms. No second `models.dev` GET occurred.
- DeepSeek, Mimo, and GLM limits were verified at 200000 context / 32000 output; jev was 200000 / 64000, preserved from the existing 9Router entry despite its absence from models.dev.
- Listener cleanup, TTL expiry, and shared-cancellation behavior were tested.
- Delivery sizing exception: user explicitly accepted the single-PR size exception (407 tracked changed lines plus this task document). Record as exception-ok; this is not commit or merge evidence.
- The historical one-token failure is not claimed resolved: actual subagent retry evidence is still required before making that causal claim.
