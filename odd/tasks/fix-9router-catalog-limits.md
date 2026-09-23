# Fix OpenCode 9Router catalog limits

Issue: https://github.com/BenjaMolina/pi-kit/issues/91 (user-authorized `status:approved`, confirmed by atomic label readback)
Branch: `fix/9router-catalog-limits`

## Objective and evidence

`@benjamolina/pi-kit@0.11.0` hardcodes 32,000 context / 4,096 output for each discovered 9Router model. The local authenticated catalog reports 1,048,576 / 65,536 for `ag/gemini-3.8-flash`. A full OpenCode global session compacted 8–18 times and repeated the same synthetic continuation for 17–37 turns while upstream usage remained `ok`; an isolated minimal session completed. Fix model metadata at discovery, not the user's global agent or provider override. Preserve credentials and user-owned config.

## Tasks

- [x] 1. Reproduce the metadata regression with a failing mocked-catalog test; implement per-model validated, bounded limits with conservative per-field fallback, update tests and README, and verify focused tests plus the packaged consumer. Work-unit commit: `017f33cae0260fe814b09dcbcb983446fc6dba44` (`fix(opencode): honor bounded 9Router catalog limits`). Runtime evidence: packaged consumer passed; independently verified live 9Router catalog returned 200 and 48 models, with `ag/gemini-3.8-flash` limit 1,048,576/65,536 via updated source (read-only key, not printed). Rollback: revert this work-unit commit (source, tests, docs).
  - RED: mocked reported limits failed on unchanged source (9 pass / 1 fail, actual 32,000/4,096 instead of 1,048,576/65,536).
  - GREEN: focused `bun test tests/opencode-cliproxyapi.test.ts` 11 pass / 0 fail; independent verifier repeated the focused test and `npm run test:pack` (clean Pi/OpenCode/Codex/Copilot consumers, OpenCode 1.18.18).
  - Independent full regression: `bun test` 218 pass / 0 fail (919 expectations, 14 files), `npm pack --dry-run` success (42 files including changed 9router.ts), `git diff --check` success. Native risk assessment was unassessable (empty output), so an independent verifier ran.
- [x] 2. Deliver the focused fix through issue-authorized PR and green checks. Issue #91 was approved by an exact maintainer instruction and atomic label readback; PR #92 https://github.com/BenjaMolina/pi-kit/pull/92 carried `type:bug` and CI `verify` passed (https://github.com/BenjaMolina/pi-kit/actions/runs/35820049837). The two task-1 work-unit commits were merged into main at `727fa7838188f7abb9242d2d6bf22db58ee27625`.
- [ ] 3. Prepare and publish patch release 0.11.1 through the repository's trusted GitHub workflow, verify npm, update local installations and rerun bounded global OpenCode smoke. Release issue https://github.com/BenjaMolina/pi-kit/issues/93 received exact maintainer `status:approved` (atomic label readback). Release branch: `chore/release-v0.11.1` from exact origin/main `727fa7838188f7abb9242d2d6bf22db58ee27625`. Manifest candidate changes exactly three version fields to 0.11.1 with unchanged dependencies/resolutions. Writer and independent verifier both observed release manifest check, `bun test` 218/0 (919 assertions), packed Pi/OpenCode/Codex/Copilot consumers, `npm pack --dry-run` 42 files and `git diff --check` exit 0 (one LF→CRLF task-doc warning); native risk assessment was unassessable. Release commit/tag evidence: pending.

## Constraints

- Single writer on feature branch; do not edit private OpenCode config as workaround.
- Catalog numbers are untrusted: accept only positive safe integers, cap their range, and avoid impossible output >= context; retain fallback for missing/invalid metadata without rejecting a valid model.
- Run test first red, then green, package harness, and a bounded runtime check. Do not retry a runaway global agent or leave orphaned processes.
- Publish through trusted CI, never local npm publish; no push/PR/merge without the specific applicable gates.
