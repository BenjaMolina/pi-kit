# Release pi-kit v0.13.0

## Objective and authorization

User authorized merging PR #113, releasing, and installing in Pi ("Hazlo y cambiate a BenjaMolina"). Release issue #114 approved (`status:approved`) by account BenjaMolina. Base: merged main `3d69b09d0721ba4273cb5b00a4fe334831be4d19` (PR #113, OpenCode Free discovery). Minor bump because the release adds a feature. Version fields only; no new dependencies. Publish solely through the trusted `release-npm.yml` OIDC workflow; no local npm publish.

## Tasks

- [x] R1. Bump the three version fields to 0.13.0 and run release checks. Observed: release manifest check `Validated @benjamolina/pi-kit@0.13.0`; `bun test` 267 pass / 0 fail (1157 expectations, 17 files); `bun run test:pack` clean Pi 0.85.1 / OpenCode 1.18.18 / Codex / Copilot consumers; `npm pack --dry-run` 44 files, 59.9 kB packed, 254.9 kB unpacked; `git diff --check` ok.
- [ ] R2. PR linking #114, CI green, merge.
- [ ] R3. Annotated `v0.13.0` on merged main, GitHub Release with the unchanged native plugin assets from v0.12.1, monitor trusted publish, verify npm exact and `latest`.
- [ ] R4. `pi install npm:@benjamolina/pi-kit@0.13.0`; verify installed version and the 9Router catalog from the installed extension. Restart of Pi is the user's step.

## Rollback

Before publication: revert the version-only commit. After publication: never overwrite 0.13.0; ship a later version.
