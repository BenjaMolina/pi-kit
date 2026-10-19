# Release pi-kit v0.13.0

## Objective and authorization

User authorized merging PR #113, releasing, and installing in Pi ("Hazlo y cambiate a BenjaMolina"). Release issue #114 approved (`status:approved`) by account BenjaMolina. Base: merged main `3d69b09d0721ba4273cb5b00a4fe334831be4d19` (PR #113, OpenCode Free discovery). Minor bump because the release adds a feature. Version fields only; no new dependencies. Publish solely through the trusted `release-npm.yml` OIDC workflow; no local npm publish.

## Tasks

- [x] R1. Bump the three version fields to 0.13.0 and run release checks. Observed: release manifest check `Validated @benjamolina/pi-kit@0.13.0`; `bun test` 267 pass / 0 fail (1157 expectations, 17 files); `bun run test:pack` clean Pi 0.85.1 / OpenCode 1.18.18 / Codex / Copilot consumers; `npm pack --dry-run` 44 files, 59.9 kB packed, 254.9 kB unpacked; `git diff --check` ok.
- [x] R2. PR #115 linking #114; CI `verify` pass (run 39310637952); merged by BenjaMolina at `43ec8a84526533c0152b460906eeafcb062fd0e9`.
- [x] R3. Annotated `v0.13.0` (tag object `9e56c079a0448850acfd1f2e32c58127f7be2150`) peels to `43ec8a8`. GitHub Release https://github.com/BenjaMolina/pi-kit/releases/tag/v0.13.0 carries both v0.12.1 native assets, SHA-256 verified identical (`85686e7b...0e00`, `1fab1d7f...9a64`). Trusted publish run https://github.com/BenjaMolina/pi-kit/actions/runs/39310790476 succeeded; npm exact and `latest` report 0.13.0 (integrity `sha512-5woq1BWuIxwv77ojL9V0hkW+VDX0xvxROPyBaZjsT3OhTZjimf0LnsfsKLyj9ksdGYbSl+4VHsTEJbEms2xzOA==`).
- [x] R4. `pi install npm:@benjamolina/pi-kit@0.13.0` exit 0; settings pin and installed manifest report 0.13.0; installed extension against real 9Router returns 61 models including 9 `oc/*-free`. Pi restart is the user step.

## Rollback

Before publication: revert the version-only commit. After publication: never overwrite 0.13.0; ship a later version.
