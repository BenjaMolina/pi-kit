# Fix 9Router bracket model IDs

## Intent
Accept the exact optional trailing `[1m]` suffix in 9Router catalog discovery and Pi mapping, preserving existing ID length, character, reserved-name and duplicate protections. Prevent one supported ID from hiding the provider. Apply the verified minimal patch to the installed local package as a temporary runtime hotfix. User subsequently authorized a local work-unit commit. Publication and push remain unauthorized.

## Scope and checks
- Source: `src/cliproxyapi/9router.ts`, `src/cliproxyapi/pi-9router.ts`.
- Tests: `tests/pi-9router-models.test.ts`, `tests/9router-dynamic-provider.test.ts`.
- Local runtime: same two source files in the installed `@benjamolina/pi-kit` package.
- TDD: not enabled; source: read-only exploration of current project/session configuration. Behavior-first functional checks use Bun.
- Route: delegated writer (two source validators plus tests); delegated verification as required by assessment.
- RDD: off per session. Delivery strategy: ask-on-risk. Forecast: under 150 authored diff lines.
- Rollback: revert only this suffix validation and its new tests; restore installed validators to their previous expressions.
- Work-unit commit: authorized on branch `fix/9router-bracket-model-ids`; includes validators, regression tests and this task record.

## Tasks
- [x] T1 (completed): Update both validators and add positive, malformed-suffix, boundary and provider retention regression tests. Run `bun test tests/pi-9router-models.test.ts tests/9router-dynamic-provider.test.ts tests/opencode-cliproxyapi.test.ts` and `bun test`.
- [x] T2 (completed): Assess source diff and perform required independent verification. Sync exact validated source changes into installed package, verify installed behavior with a synthetic mixed catalog (no credentials), and record reload guidance.

## Acceptance
Only a single optional trailing `[1m]` is newly accepted. Mixed catalogs retain ordinary and suffixed models. Malformed brackets, other suffixes, blank/unsafe IDs, overlength IDs and duplicates remain rejected. Runtime hotfix matches verified source.

## Progress
Read-only map found both discovery and mapper rejection points. Source repository clean on main at cfdecdd. Current session repository is unrelated and will remain untouched.

## Verification evidence
Writer (gpt-6-luna, effort unset): focused tests passed (40), full `bun test` passed (247 across 16 files), `git diff --check` passed. Diff: 50 authored changed lines. Both installed validators patched with identical minimal substitutions. Native assessment unavailable (empty output); independent verification required and completed below. Engram mirror unavailable: runtime session belongs to a different project; local task file retained.

## Independent verification
Focused tests: 40 pass, 0 fail, 133 assertions. Installed fresh-process Bun synthetic harness: 20 assertions passed across 9 catalogs; all four ordinary/suffixed IDs retained, seven invalid IDs rejected by both validators, duplicate suffixed catalog rejected. `git diff --check` passed. Literal byte comparison failed because source is CRLF and installed is LF; `diff --strip-trailing-cr` passed for both files, confirming content parity. No source mutations by verifier. Full suite evidence remains writer-reported: 247 tests passed. Native assessment unavailable; required independent verification completed. No build/pack, live server, inference or currently loaded Pi extension check was performed.

## Runtime confirmation and delivery
User confirmed that 9Router models are visible again in Pi after reload/restart. Inference remains unverified. Source checks above apply to the unchanged source/test candidate now being committed. Work-unit commit identity is discoverable with `git log -1 --format=%H -- odd/tasks/fix-9router-bracket-model-ids.md` on branch `fix/9router-bracket-model-ids`.

## Next step
Create the authorized local commit, then await separate authorization for push/PR/publication. Installed hotfix may be overwritten by a package update/reinstall. Local durable task complete; Engram mirror remains unavailable due to session project binding.
