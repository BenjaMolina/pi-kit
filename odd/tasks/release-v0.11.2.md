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
- [x] **R2 — Approved release PR and CI.** Push one release branch, open PR linked to #100 with `type:feature`, await CI green and merge into `main`; record PR, workflow and exact merge SHA.
- [x] **R3 — Immutable tag, GitHub Release and trusted npm publication.** Fetch `origin/main`, create annotated `v0.11.2` targeting exact release merge SHA only if unused, push tag once, watch tag-triggered publish. Attach existing verified native Linux plugin binaries to GitHub Release if still applicable; never rebuild unrelated plugins.
- [x] **R4 — Verify npm and close evidence.** Verify exact registry version and latest dist-tag, GitHub Release assets/workflow; finish this record in a separate small docs PR if necessary. No local `npm publish`.

## Evidence and next step

- Initial release preflight: issue #100 is `status:approved`; `v0.11.2` tag absent and npm exact version lookup returned confirmed E404. Branch clean at `1e4aec1` before first write.
- R1 delegated writer and independent verifier both observed `RELEASE_TAG=v0.11.2 bun scripts/release-manifest-check.ts` passing, `bun test` 243 passed/0 failed across 16 files, `bun run test:pack` passing for isolated Pi 0.85.1/OpenCode 1.18.18/Codex/Copilot consumers, `npm pack --dry-run` passing (44 files, 58.0 kB, version 0.11.2), and `git diff --check` clean. Parent independently reran manifest check and diff readback. Exactly three version fields changed; dependencies untouched. Native risk assessment unavailable (empty native output) with RDD off, so independent verifier was required and completed. No live inference on the release bump; prior Pi Luna smoke belongs to the merged feature.
- R1 work-unit commit `ab3e6b0c4310ad255705c59fe23337f3ebcefb12` (`chore(release): prepare pi-kit v0.11.2`).
- R2 release PR https://github.com/BenjaMolina/pi-kit/pull/101 linked approved issue #100 with exactly one `type:feature` label. CI `verify` passed: https://github.com/BenjaMolina/pi-kit/actions/runs/36087470399. Merged into `main` at `1eec9cbffbc195211dfdc4bd509e99bd48775c57`; issue #100 closed automatically.
- R3 annotated tag `v0.11.2` object `da8c9507eed91ba3dce261354a87ca831fa25793` was pushed only after checking fresh `origin/main` and peels to exact release merge commit `1eec9cbffbc195211dfdc4bd509e99bd48775c57`. Tag-triggered OIDC trusted npm publication workflow https://github.com/BenjaMolina/pi-kit/actions/runs/36087637263 concluded `success`, head SHA matches release commit; manifest, tests, packed consumers and publish/propagation steps passed. No local npm publish.
- R3 GitHub Release: https://github.com/BenjaMolina/pi-kit/releases/tag/v0.11.2 (published, not draft/prerelease). Existing Linux native plugin binaries were downloaded from v0.11.1, SHA-256 verified, and attached unchanged: `codex-catalog-display-name-linux-amd64-v1.1.0.so` (`1fab1d7f68cfcbca5d49cc359dda190f9930715614bd911f3c2cafc145a39a64`) and `codex-antigravity-responses-repair-linux-amd64-v1.0.1.so` (`85686e7bc6ee21b3ea3a0ea67343f79c97958753b10b48b70db4baac1a260e00`). Release asset readback matches both digests.
- R4 npm registry confirms exact `@benjamolina/pi-kit@0.11.2`, `latest` 0.11.2, tarball integrity `sha512-zJN3IH2sTPDw6OTMbbf+GpLw9RKa3ba05AbaC9izpN4U5rzHlHrJvfcnw0r5en+NDs+B051lNq/uXpLIRonyBQ==`. GitHub Actions emitted non-blocking runner notices about Node 20 action-runtime deprecation and upcoming Ubuntu 26 migration. Installed local Pi package was not changed.
- Independent read-only verifier confirmed PR, CI, annotated tag target, workflow, asset digests, npm exact/latest/integrity, and issue #100 state; `git diff --check` passed. Historical local actions above are parent-observed, not independently established by the remote readback.
- This completion record is pending a separate documentation-only PR against `main`; the published tag remains immutable. Next: commit and merge this evidence PR after CI passes; optional local package upgrade is a separate user decision.
