# Release pi-kit v0.11.0

Approved Issue: https://github.com/BenjaMolina/pi-kit/issues/88
Merged feature: https://github.com/BenjaMolina/pi-kit/pull/87 (commit `cc5df5217025676d051adb2aed60e8c468d4f47b`)

## Objective and scope

Publish `@benjamolina/pi-kit@0.11.0` from the exact main history containing first-party 9Router discovery for OpenCode. This release task changes only three version fields in `package.json` and `package-lock.json` plus this evidence document. Do not change dependencies or live user configurations. Publish through the existing GitHub Actions OIDC Trusted Publishing workflow only; never publish from the local machine.

## Route, strategy and TDD

- Branch: `chore/release-v0.11.0` from freshly fetched `origin/main` commit `cc5df5217025676d051adb2aed60e8c468d4f47b`.
- Delivery: `single-pr`; a manifest-only bump plus ODD evidence is well under 400 authored diff lines. One coherent release PR linked to approved Issue #88; exactly one `type:feature` label.
- TDD: not applicable to a manifest-only release; the manifest contract, full tests, packed consumer and dry-run packaging substitute for behavior RED/GREEN. Source: `odd/tasks/release-v0.10.0.md` convention. Exact runner `bun` / `npm` as declared in `package.json`.
- Route: delegated exploration of repository release gates (four or more files), bounded delegated writer for two manifests plus evidence, independent verification per native risk assessment. Parent owns issue/PR/tag/release publication.

## Tasks

- [x] **R1 — Manifest-only version bump and verification.** Change only `package.json` version and `package-lock.json` top-level/root versions to `0.11.0`. Check `RELEASE_TAG=v0.11.0 bun scripts/release-manifest-check.ts`, `bun test`, `bun run test:pack`, `npm pack --dry-run`, `git diff --check`. Runtime harness: isolated package consumer must load `9router` and `cliproxyapi`; no live credentials. Rollback boundary: three manifest version fields and this evidence document.
- [ ] **R2 — Approved release PR and CI.** Open single PR linked to approved Issue #88, with `type:feature`; wait for CI and merge via normal main policy. Record PR, check run, exact main merge SHA.
- [ ] **R3 — Immutable tag, GitHub Release and trusted npm publication.** Fetch origin/main, tag exact release merge SHA with annotated `v0.11.0`, verify peeled target and remote, publish GitHub Release with verified existing native plugin assets if still applicable. Watch automatic `.github/workflows/release-npm.yml` tag-triggered run. Never use local npm publish or move a tag.
- [ ] **R4 — Verify registry and evidence.** Confirm npm exact and latest `0.11.0`, expected packed OpenCode behavior, record immutable URLs/SHAs. Complete evidence in a separate docs PR if required by branch protection, without moving the already-created tag.

## Evidence

- Preflight: v0.10.0 is latest local tag and manifests report `0.10.0`; npm exact `0.11.0` returned confirmed E404 before release.
- Feature PR #87 is merged into `origin/main` at `cc5df5217025676d051adb2aed60e8c468d4f47b`; source feature tests and isolated OpenCode 1.18.31 runtime had passed before merging.
- R1 manifest diff contains exactly three version-field substitutions `0.10.0` → `0.11.0` (one in `package.json`, two in `package-lock.json`), no dependency or resolution changes.
- R1 writer and independent verifier observed `RELEASE_TAG=v0.11.0 bun scripts/release-manifest-check.ts` passed; `bun test` 216 pass/0 fail across 14 files; `bun run test:pack` passed with clean Pi/OpenCode/Codex/Copilot consumers and OpenCode mock requests to both `/v1/models` and `/nine/v1/models`. Writer observed `npm pack --dry-run` passed (42 files, no working-tree tarball); independent verifier did not rerun that command. Parent independently reran manifest check and diff hygiene with exit 0.
- Native read-only assessment of the uncommitted candidate returned `unassessable` (empty native output) with RDD off; independent verifier completed before commit. No review receipt claimed.
- R2–R4 pending. Next: commit manifest-only R1 work unit, push release branch and open PR linked to Issue #88.
