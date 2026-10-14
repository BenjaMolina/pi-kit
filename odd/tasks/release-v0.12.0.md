# Release pi-kit v0.12.0

## Objective and authority
Publish the already merged bracket-ID compatibility and verified Sol reasoning controls as @benjamolina/pi-kit0.12.0. User authorized release preparation/publication; tracking issue https://github.com/BenjaMolina/pi-kit/issues/105 verified OPEN and status:approved. Existing behavior merged via PR104 at68309327d8ccd368b9eb5cc4ce87b86a0deffd57. No new features, dependencies, Docker changes or credential reads. Publication uses existing release-npm.yml GitHub OIDC trusted publishing, never local npm publish.

## Plan and constraints
Branch chore/release-v0.12.0 created from freshly fetched origin/main6830932 with clean worktree. Registry latest0.11.2; remote v0.12.0 tag absent at preflight. Version bump is minor for new user-facing reasoning controls. Allowed manifest surfaces package.json and package-lock.json (root version and packages[""].version only); parent owns this record. Delegated bounded writer for two manifest files plus package verification. TDD not enabled by current project config; Bun runner. RDD off. Delivery strategy ask-on-risk; forecast under120 authored lines. Rollback before publication: revert version-only manifest changes and this release record. Never move/delete a published tag. Native review does not authorize publication.

## Tasks
- [x] R1 (verified; commit follows): Update manifests to0.12.0, run release manifest check, full tests, isolated package-consumer tests and npm dry-run; commit one release work unit after checks pass.
- [ ] R2 (in progress): Push release branch and open PR linked to approved issue105; observe GitHub CI. No merge until authorized continuation.
- [ ] R3 (pending): After release PR merge, fetch main and tags, create annotated immutable tag at verified main commit, publish via release-npm.yml and verify exact registry version/dist-tag and GitHub release artifacts per repository conventions.

## Checks
`RELEASE_TAG=v0.12.0 bun scripts/release-manifest-check.ts`
`bun test`
`bun run test:pack`
`npm pack --dry-run`
`git diff --check`
Package-consumer harness may install packages in isolated temporary consumers as designed; no mutation of active Pi installation or dependency manifest resolution is authorized. Existing runtime evidence from PR104:249 tests and independent installed mocked reasoning transport; user confirms visibility, live upstream effort remains unverified.

## Evidence and next step
Manifest/tag check passed. Full suite249 passed,0 failures,1060 assertions across16 files. Isolated pack-consumer tests passed for Pi0.85.1, OpenCode1.18.18, Codex and Copilot; archive58327 compressed/248343 unpacked bytes. npm pack dry-run passed44 files; git diff --check passed. Independent verifier confirmed exactly three version fields changed, parsed HEAD comparison passed and manifest/tag/diff checks repeated successfully. Native assessment unavailable due tool argument validation; independent verification used fail-closed. Release work-unit commit includes manifests and this record; identity resolves via git log -1 --format=%H -- odd/tasks/release-v0.12.0.md. Next: commit, push and open release PR linking105. No version tag, GitHub release, or npm publication yet.
