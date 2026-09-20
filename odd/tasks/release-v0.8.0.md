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
- [ ] **R2 — Deliver green release PR**: commit, push, open approved PR, wait for CI, and merge.
- [ ] **R3 — Tag, release, and publish**: create immutable annotated `v0.8.0` from fresh `origin/main`, attach plugin assets, and publish through trusted OIDC.
- [ ] **R4 — Verify and align global runtime**: verify npm exact/latest, update Bun global package, and verify Copilot/Codex help and doctors.

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
- Native assessment remains unavailable due to the missing package-local Gentle AI binary and failed closed to independent verification, which is in progress.

## Next step

Reconcile independent verification, commit the release work unit, and open the approved release PR.