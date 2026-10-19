# Release pi-kit v0.14.0

## Objective and authorization

User authorized the issue, approval, release and local install ("si, dale el issue, apruebalo y crear una nueva version e instalalo"). Feature issue #117 and PR #118 (per-model thinking levels for the Pi 9Router provider) were merged by BenjaMolina at `b094f49018d7346a2767b2a10a63c0180d2bbeaf` after CI `verify` passed. Release issue #119 approved (`status:approved`). Minor bump because the release adds a feature. Version fields only; no new dependencies. Publish solely through the trusted `release-npm.yml` OIDC workflow; no local npm publish.

## Tasks

- [x] R1. Bump the three version fields to 0.14.0 and run release checks. Observed: release manifest check `Validated @benjamolina/pi-kit@0.14.0`; `bun test` 271 pass / 0 fail; `bun run test:pack` clean Pi 0.85.1 / OpenCode 1.18.18 / Codex / Copilot consumers; `npm pack --dry-run` 44 files, 61.0 kB packed, 259.1 kB unpacked; `git diff --check` ok.
- [ ] R2. PR linking #119, CI `verify`, merge.
- [ ] R3. Annotated `v0.14.0` tag, GitHub Release with the unchanged native assets, trusted publish, npm readback.
- [ ] R4. `pi install npm:@benjamolina/pi-kit@0.14.0`, readback of settings and installed manifest. Pi restart is the user step.

## Rollback

Before publication: revert the version-only commit. After publication: never overwrite 0.14.0; ship a later version.
