# Prepare release 0.14.1

## Authorization and scope

User explicitly authorized the full release lifecycle: issue/PR approval, merge, publish, and installation. Earlier preparation restrictions were scoped to that worker task and did not limit the overall authorization. No dependency versions or dependency graph changes were in scope.

Approved issue: #123. Feature: #122. PR #124 merged with CI run 39355868537 passing at `3c45ac2ddb0a622c70a47b132e4e5baa5d362e3c`. Release PR #125 passed CI run 39356396848 and merged at `ca69d96a7da051b8e81eaa46f9f6d069fa3cb358`.

## Release constraints and final evidence

- The package version was advanced from 0.14.0 to 0.14.1 in the root package and lockfile fields.
- Native assets are unchanged; their SHA256 hashes were verified against 0.14.0.
- Annotated tag `v0.14.1` points to the same merge commit, `ca69d96a7da051b8e81eaa46f9f6d069fa3cb358`.
- Published release: https://github.com/BenjaMolina/pi-kit/releases/tag/v0.14.1
- Trusted npm publish workflow run 39359125252 succeeded. npm exact version and `latest` are both 0.14.1.
- `pi install npm:@benjamolina/pi-kit@0.14.1` exited 0. Independent checks confirmed installed manifest and settings pin 0.14.1.
- Installed-catalog GET completed in 988 ms and returned 61 models; DeepSeek, MiMo, and GLM each reported 200000 context and 32000 output tokens.
- Do not infer that the original DeepSeek one-token failure is solved. The original subagent failure remains unverified; a user restart is needed to investigate it.
- Never overwrite or republish this version; any correction requires a later patch release.

## Tasks and status

- [x] Update exactly the three version fields (root package, lockfile package root, lockfile root entry); no dependency changes.
- [x] `bun run test:release-manifest` — validated `@benjamolina/pi-kit@0.14.1`.
- [x] `bun test` — 287 passed, 0 failed.
- [x] `bun run test:pack` — clean Pi, OpenCode, Codex, and Copilot consumers resolved `@benjamolina/pi-kit@0.14.1`.
- [x] `npm pack --dry-run` — succeeded; 44 files, 62.5 kB compressed, 266.2 kB unpacked.
- [x] `git diff --check` — clean.
- [x] Delivery completed: PR #125 CI passed and merged; annotated tag and GitHub release published; trusted npm publish succeeded; package installed and independently verified at 0.14.1.

## Prior feature evidence

Feature task `fix-9router-opencode-free-metadata.md`: implementation task done; commit `a26f876`, merged as PR #124. The user accepted the single-PR size exception. CI evidence is run 39355868537 passing. These facts do not establish that the historical DeepSeek output failure was fixed.

## Rollback

If this candidate must be withdrawn after release, issue a later patch release that corrects or supersedes it. Never overwrite or republish version 0.14.1.
