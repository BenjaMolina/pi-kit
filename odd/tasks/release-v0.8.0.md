# Release pi-kit v0.8.0

Approved Issue: https://github.com/BenjaMolina/pi-kit/issues/67

## Goal

Publish `@benjamolina/pi-kit@0.8.0` delivering `pi-kit-copilot switch` with safe model switching and native session resume.

## Release scope

- `pi-kit-copilot switch [--wire-api=responses|completions]`.
- Resume-model override protection for `--continue`, `--resume`, and `--resume=<id>` while preserving exact CLIProxyAPI wire models.
- Version bump from `0.7.0` to `0.8.0` in package manifests only.
- GitHub Release with existing Linux amd64 plugin assets.
- Trusted OIDC npm publication and global Bun alignment.

## Tasks

- [x] **R1 — Prepare and verify manifests**: bump package manifests only; run release manifest, full tests, packed consumer, npm pack dry-run, and diff hygiene.
- [x] **R2 — Deliver green release PR**: commit, push, open approved PR, wait for CI, and merge.
- [x] **R3 — Tag, release, and publish**: create immutable annotated `v0.8.0` from fresh `origin/main`, attach plugin assets, and publish through trusted OIDC.
- [x] **R4 — Verify and align global runtime**: verify npm exact/latest, update Bun global package, and verify Copilot/Codex help and doctors.

## Acceptance criteria

- Tag and GitHub Release point to exact release commit on fresh `origin/main`.
- Expected plugin assets and checksums are present.
- Trusted workflow publishes `@benjamolina/pi-kit@0.8.0` with provenance.
- npm exact version and `latest` report `0.8.0`.
- Global Bun package exposes `switch`; Copilot and Codex doctors remain healthy.

## Delivery strategy

Single PR; manifests plus evidence remain below 400 authored changed lines.

## Progress

- Issue #67 created and read back successfully.
- User explicitly authorized exact Issue #67 approval.
- Maintainer account verified with `ADMIN`; atomic transition confirmed `type:feature`, `status:approved`.
- Branch created: `release/v0.8.0`.
- Manifest bump completed with exactly three version fields changed from `0.7.0` to `0.8.0`; dependency sections and resolutions remain unchanged.
- Writer verification passed: release manifest validated, 127 tests passed, packed consumers resolved `0.8.0`, npm pack dry-run passed, and diff hygiene passed.
- Parent spot check validated `0.8.0` and the exact manifest-only diff.
- Independent verification passed every R1 check and found no manifest defect.
- Release commit `855e848` delivered through PR #68; CI passed and PR merged as `dd00684353f5ce20054c4311044b6693e92aa2d8`.
- Annotated tag `v0.8.0` was created from the exact freshly fetched `origin/main` commit and verified after push.
- GitHub Release: https://github.com/BenjaMolina/pi-kit/releases/tag/v0.8.0 with both verified Linux amd64 plugin assets (SHA-256 `1fab1d7f...` and `85686e7b...`).
- Trusted OIDC publish run succeeded: https://github.com/BenjaMolina/pi-kit/actions/runs/35481072162.
- Public npm registry verified exact `0.8.0`; `latest` points to `0.8.0`.
- Bun global state resolves `@benjamolina/pi-kit@0.8.0`; help exposes `switch`; Copilot doctor is healthy; Codex doctor reports managed provider and 2/2 plugins verified.
- Bun again returned a nonzero status because of the known pre-existing empty dependency key in its managed global manifest, but package resolution, binaries, help, and runtime doctors confirm successful alignment.

## Next step

None. Release v0.8.0 is complete; reasoning-effort work may begin as a separate feature.