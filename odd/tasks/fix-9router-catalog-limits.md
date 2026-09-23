# Fix OpenCode 9Router catalog limits

Issue: https://github.com/BenjaMolina/pi-kit/issues/91 (user-authorized `status:approved`, confirmed by atomic label readback)
Branch: `fix/9router-catalog-limits`

## Objective and evidence

`@benjamolina/pi-kit@0.11.0` hardcodes 32,000 context / 4,096 output for each discovered 9Router model. The local authenticated catalog reports 1,048,576 / 65,536 for `ag/gemini-3.8-flash`. A full OpenCode global session compacted 8–18 times and repeated the same synthetic continuation for 17–37 turns while upstream usage remained `ok`; an isolated minimal session completed. Fix model metadata at discovery, not the user's global agent or provider override. Preserve credentials and user-owned config.

## Tasks

- [ ] 1. Reproduce the metadata regression with a failing mocked-catalog test; implement per-model validated, bounded limits with conservative per-field fallback, update tests and README, and verify focused tests plus the packaged consumer. Work-unit commit: pending. Runtime evidence: packaged consumer passed; independently verified live 9Router catalog returned 200 and 48 models, with `ag/gemini-3.8-flash` limit 1,048,576/65,536 via updated source (read-only key, not printed). Rollback: revert this work-unit commit (source, tests, docs).
  - RED: mocked reported limits failed on unchanged source (9 pass / 1 fail, actual 32,000/4,096 instead of 1,048,576/65,536).
  - GREEN: focused `bun test tests/opencode-cliproxyapi.test.ts` 11 pass / 0 fail; independent verifier repeated the focused test and `npm run test:pack` (clean Pi/OpenCode/Codex/Copilot consumers, OpenCode 1.18.18).
  - Independent full regression: `bun test` 218 pass / 0 fail (919 expectations, 14 files), `npm pack --dry-run` success (42 files including changed 9router.ts), `git diff --check` success. Native risk assessment was unassessable (empty output), so an independent verifier ran.
- [ ] 2. Deliver the focused fix through issue-authorized PR and green checks. Issue #91 must receive exact maintainer approval before any protected status change; PR creation and merge follow repository policy. Work-unit identity and PR evidence: pending.
- [ ] 3. Prepare and publish patch release 0.11.1 through the repository's trusted GitHub workflow, verify npm, update local installations and rerun bounded global OpenCode smoke. Separate release issue/authorization and release commit/tag evidence: pending.

## Constraints

- Single writer on feature branch; do not edit private OpenCode config as workaround.
- Catalog numbers are untrusted: accept only positive safe integers, cap their range, and avoid impossible output >= context; retain fallback for missing/invalid metadata without rejecting a valid model.
- Run test first red, then green, package harness, and a bounded runtime check. Do not retry a runaway global agent or leave orphaned processes.
- Publish through trusted CI, never local npm publish; no push/PR/merge without the specific applicable gates.
