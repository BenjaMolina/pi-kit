# Release pi-kit v0.11.2

Approved issue: https://github.com/BenjaMolina/pi-kit/issues/100
Merged feature: https://github.com/BenjaMolina/pi-kit/pull/97 (main commit `1e4aec1b9b483c60b45081b8cf9eb33ae7f7a6b0`)

## Objective and scope

Publish `@benjamolina/pi-kit@0.11.2` from the main history containing the tested Pi 9Router provider. Change only the version fields in `package.json`/`package-lock.json` and this evidence document. No dependency or runtime changes; no live user configuration edits. Publish only via GitHub Actions OIDC Trusted Publishing triggered by an immutable annotated tag, never local npm publish.

## Route and verification

- Release branch `chore/release-v0.11.2` from freshly fetched `origin/main` at `1e4aec1b9b483c60b45081b8cf9eb33ae7f7a6b0`.
- Delivery: one PR linked to approved #100 with exactly one `type:feature` label; no chain required for this small manifest-only change.
- TDD: N/A for version metadata. Source: prior `odd/tasks/release-v0.11.0.md` convention. Verify contract with `RELEASE_TAG=v0.11.2 bun scripts/release-manifest-check.ts`, `bun test`, `bun run test:pack`, `npm pack --dry-run`, `git diff --check`.
- Route: delegated read-only release mapping completed; scoped delegated writer for two manifests; independent verification before PR. Parent owns GitHub issue/PR/tag/release and registry verification.
- Forecast: fewer than 150 authored lines including this document; no size exception. Rollback boundary before tag: three version field substitutions and this task file; after tag/publish, version is immutable and recovery requires a new release, not retagging.

## Tasks

- [x] **R1 — Manifest version and release-candidate verification.** Bump only manifest and two lockfile root version fields from `0.11.1` to `0.11.2`; run checks above. Runtime harness: isolated packed Pi/OpenCode/Codex/Copilot consumers; no real inference required for the metadata-only bump.
- [ ] **R2 — Approved release PR and CI.** Push one release branch, open PR linked to #100 with `type:feature`, await CI green and merge into `main`; record PR, workflow and exact merge SHA.
- [ ] **R3 — Immutable tag, GitHub Release and trusted npm publication.** Fetch `origin/main`, create annotated `v0.11.2` targeting exact release merge SHA only if unused, push tag once, watch tag-triggered publish. Attach existing verified native Linux plugin binaries to GitHub Release if still applicable; never rebuild unrelated plugins.
- [ ] **R4 — Verify npm and close evidence.** Verify exact registry version and latest dist-tag, GitHub Release assets/workflow; finish this record in a separate small docs PR if necessary. No local `npm publish`.

## Evidence and next step

- Initial release preflight: issue #100 is `status:approved`; `v0.11.2` tag absent and npm exact version lookup returned confirmed E404. Branch clean at `1e4aec1` before first write.
- R1 delegated writer and independent verifier both observed `RELEASE_TAG=v0.11.2 bun scripts/release-manifest-check.ts` passing, `bun test` 243 passed/0 failed across 16 files, `bun run test:pack` passing for isolated Pi 0.85.1/OpenCode 1.18.18/Codex/Copilot consumers, `npm pack --dry-run` passing (44 files, 58.0 kB, version 0.11.2), and `git diff --check` clean. Parent independently reran manifest check and diff readback. Exactly three version fields changed; dependencies untouched. Native risk assessment unavailable (empty native output) with RDD off, so independent verifier was required and completed. No live inference on the release bump; prior Pi Luna smoke belongs to the merged feature.
- Next: commit R1, open linked release PR and wait for CI. No tag or publication yet.
