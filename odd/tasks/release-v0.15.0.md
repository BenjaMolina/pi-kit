# Prepare release 0.15.0

## Authorization and scope

The user explicitly authorized the full release lifecycle (`Aprobar #133 y publicar v0.15.0`): issue/PR completion, merge, trusted npm publication, and local update. This minor release publishes the reversible Pi Antigravity system prompt repair extension (issue #133, PR #134, commit `902b385`) and the reusable Codex 9Router OAuth import script (issue #131, PR #132).

## Constraints

- Bump only the root `package.json` and `package-lock.json` version fields; do not alter dependencies.
- Validate the package manifest, unit suite, and packed consumers before delivery.
- Publish only through `.github/workflows/release-npm.yml` using npm Trusted Publishing; never local `npm publish`.
- Create an annotated `v0.15.0` tag from the merged release commit on `origin/main`.

## Tasks

- [x] Create release branch `chore/release-v0.15.0` and bump package version to `0.15.0`.
- [ ] Verify the release candidate and merge its release PR (issue #135).
- [ ] Tag `v0.15.0`, verify trusted npm publication workflow, and update local Pi installations.

## Evidence

- Feature merged: issue #133; PR #134 merged at `902b385` after CI job `137164224134` passed.
- Release issue: #135 (`status:approved`).
- Candidate version fields: root `package.json` and `package-lock.json` advanced from `0.14.2` to `0.15.0`; no dependency graph change.
- Local verification passed: `bun run test:release-manifest` (`Validated @benjamolina/pi-kit@0.15.0`); `bun test ./tests/` (`307 pass / 0 fail`, 1,431 assertions); `bun run test:pack` clean with Pi 0.85.1, OpenCode 1.18.18, Codex, and Copilot consumers resolving `0.15.0`.
