# Release pi-kit v0.14.0

## Objective and authorization

User authorized the issue, approval, release and local install ("si, dale el issue, apruebalo y crear una nueva version e instalalo"). Feature issue #117 and PR #118 (per-model thinking levels for the Pi 9Router provider) were merged by BenjaMolina at `b094f49018d7346a2767b2a10a63c0180d2bbeaf` after CI `verify` passed. Release issue #119 approved (`status:approved`). Minor bump because the release adds a feature. Version fields only; no new dependencies. Publish solely through the trusted `release-npm.yml` OIDC workflow; no local npm publish.

## Tasks

- [x] R1. Bump the three version fields to 0.14.0 and run release checks. Observed: release manifest check `Validated @benjamolina/pi-kit@0.14.0`; `bun test` 271 pass / 0 fail; `bun run test:pack` clean Pi 0.85.1 / OpenCode 1.18.18 / Codex / Copilot consumers; `npm pack --dry-run` 44 files, 61.0 kB packed, 259.1 kB unpacked; `git diff --check` ok.
- [x] R2. PR #120 linking #119; CI `verify` run `39323488336` passed; merged as `a519764dc7188b490b7abebf8cdc31093055c231`.
- [x] R3. Annotated `v0.14.0` peels to merge `a519764dc7188b490b7abebf8cdc31093055c231`. GitHub Release: https://github.com/BenjaMolina/pi-kit/releases/tag/v0.14.0; unchanged native assets have SHA256 values verified identical to `v0.13.0`. Trusted publish workflow succeeded: https://github.com/BenjaMolina/pi-kit/actions/runs/39323732010. npm exact/latest readback: `0.14.0`.
- [x] R4. `pi install npm:@benjamolina/pi-kit@0.14.0` exited 0. Independent verifier confirmed installed manifest and settings package pin at 0.14.0. Installed extension fetched the local catalog (HTTP 200, 56 models, public discovery disabled for this check only), with expected maps for `cc/claude-sonnet-5`, `cc/claude-opus-5-5` (no off) and `ag/claude-sonnet-4-6` (no xhigh). No inference or credentials printed. Pi restart remains the user step; selector UI not exercised.

## Rollback

Before publication: revert the version-only commit. After publication: never overwrite 0.14.0; ship a later version.
