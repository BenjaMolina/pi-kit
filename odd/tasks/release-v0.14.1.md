# Prepare release 0.14.1

## Authorization and scope

User explicitly authorized preparing the patch release and installation. This task only updates the root package version fields; it does not authorize commits, pushes, tags, publishing, or installation during this work. No dependency versions or dependency graph changes are in scope.

Approved issue: #123. Feature: #122, merged PR #124. CI run 39355868537 passed. Merge commit: `3c45ac2ddb0a622c70a47b132e4e5baa5d362e3c`.

## Release constraints

- Change only the root package version in `package.json` and the root package version fields in `package-lock.json`, from 0.14.0 to 0.14.1.
- Keep native assets unchanged.
- Use only the trusted `.github/workflows/release-npm.yml` OIDC path for any later publish operation; do not use local credentials or alternate publishing routes.
- Preserve the documented patch-correction limits. Do not claim the original DeepSeek one-token failure is solved.
- Roll back only by a later patch release; never overwrite or republish this version.

## Tasks and status

- [x] Update exactly the three version fields (root package, lockfile package root, lockfile root entry); no dependency changes.
- [x] `bun run test:release-manifest` — validated `@benjamolina/pi-kit@0.14.1`.
- [x] `bun test` — 287 passed, 0 failed.
- [x] `bun run test:pack` — clean Pi, OpenCode, Codex, and Copilot consumers resolved `@benjamolina/pi-kit@0.14.1`.
- [x] `npm pack --dry-run` — succeeded; 44 files, 62.5 kB compressed, 266.2 kB unpacked.
- [x] `git diff --check` — clean.
- [ ] Delivery, publish, and install — pending; explicitly outside this preparation step.

## Prior feature evidence

Feature task `fix-9router-opencode-free-metadata.md`: implementation task done; commit `a26f876`, merged as PR #124. The user accepted the single-PR size exception. CI evidence is run 39355868537 passing. These facts do not establish that the historical DeepSeek output failure was fixed.

## Rollback

If this candidate must be withdrawn after release, issue a later patch release that corrects or supersedes it. Never overwrite or republish version 0.14.1.
