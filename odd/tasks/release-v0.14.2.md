# Prepare release 0.14.2

## Authorization and scope

The user explicitly authorized the full release lifecycle: issue/PR completion, merge, publication, and installation. This patch release publishes the merged 9Router image/vision capability fix from issue #127 and PR #128.

## Constraints

- Bump only the root package and package-lock version fields; do not alter dependencies.
- Validate the package before delivery.
- Publish only through `.github/workflows/release-npm.yml` using npm Trusted Publishing; never local `npm publish`.
- Create an annotated `v0.14.2` tag from the merged release commit on `origin/main`.

## Tasks

- [x] Create release branch and bump package version to 0.14.2.
- [ ] Verify the release candidate and merge its release PR.
- [ ] Tag, create the GitHub release, dispatch trusted npm publication, and verify registry/install.

## Evidence

- Feature: issue #127; PR #128 merged at `fcbaca4323c018c3075c097f8b24f0bb4ee1d25d` after CI run 39708913706 passed.
- Candidate version fields: root package and both package-lock root entries advanced from 0.14.1 to 0.14.2; no dependency graph change.
- Local verification passed: `npm run test:release-manifest`; `bun test` 290 pass / 0 fail (1,239 assertions); `npm run test:pack` clean with Pi, OpenCode, Codex, and Copilot consumers resolving 0.14.2; `npm pack --dry-run` passed (44 files, 62.7 kB compressed); `git diff --check` passed.
