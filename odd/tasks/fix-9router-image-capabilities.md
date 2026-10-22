# Preserve 9Router image capabilities

## Objective

Expose image input in Pi only for 9Router models whose authenticated `/v1/models` catalog explicitly declares vision/image input. Keep models with missing, malformed, or text-only metadata text-only.

## Scope

- `src/cliproxyapi/9router.ts`
- `src/cliproxyapi/pi-9router.ts`
- `tests/pi-9router-models.test.ts`
- `tests/9router-dynamic-provider.test.ts`
- `extensions/9router-dynamic-provider.ts`

## Constraints

- TDD: observe a focused RED test before implementation.
- Catalog metadata is untrusted; strictly sanitize modalities.
- No live inference, publishing, push, or PR.
- One work-unit commit on a feature branch after independent verification.

## Tasks

- [x] Create the feature branch and add tests for image capability propagation and conservative fallback.
- [x] Propagate sanitized input modalities through 9Router discovery and Pi model conversion.
- [x] Commit the initial modality-based work unit.
- [x] Extend the fix for catalog-declared boolean `capabilities.vision`, then install and retry the smoke test.
- [ ] Commit the independently verified vision-capability follow-up (awaiting explicit user authorization).

## Evidence

- Branch: `fix/9router-image-capabilities` from `main`.
- Task 1 branch setup completed.
- Task 2 delegated to `gentle-ai-worker`: RED observed in `bun test tests/pi-9router-models.test.ts` because image input was dropped. Initial GREEN: `bun test tests/pi-9router-models.test.ts tests/9router-dynamic-provider.test.ts` passed, 61/0.
- Independent verification found a medium-severity gap: direct exported model conversion still enabled image for malformed or oversized raw modality arrays. The corrective TDD pass added the same boundary validation and direct regression cases: RED 15 pass / 1 fail, then GREEN 16 pass / 0 fail (92 assertions).
- Final independent verification: discovery and converter both require an input array of at most 16 string entries, each at most 32 characters, that explicitly contains `image`; otherwise the model remains text-only. Focused suite passed 61/0 (255 assertions), `git diff --check` passed. Earlier full `bun test` passed 288/0 (1,230 assertions) before the converter-only hardening; the independent verifier assessed the correction as safe based on focused coverage. User explicitly authorized the work-unit commit.
- Work-unit commit: `fd066e5` (`fix(9router): preserve image model capabilities`). Rollback boundary: revert this commit.
- Local installation inspection found the actual authenticated 9Router catalog declares `capabilities.vision: true` for `cx/gpt-5.6-terra` but omits `modalities`. The vision follow-up preserves only actual boolean `vision` values and accepts only `vision === true` at conversion; malformed truthy values remain text-only. RED observed before implementation; focused tests passed 63/0 (261 assertions), `git diff --check` passed, and independent verification approved the change.
- Installed the local checkout as the active Pi package and removed the duplicate npm package entry. Fresh catalog smoke: `pi --list-models '9router/cx/gpt-5.6-terra'` reports `images yes`. Inference smoke with the supplied screenshot completed successfully and returned `420x640`, proving the image reached `9router/cx/gpt-5.6-terra`.
