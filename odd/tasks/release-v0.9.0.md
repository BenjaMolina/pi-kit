# Release pi-kit v0.9.0

Approved Issue: https://github.com/BenjaMolina/pi-kit/issues/76

## Goal

Publish `@benjamolina/pi-kit@0.9.0` from the exact `main` history containing model-specific Copilot reasoning-effort selection, persistence, and launch/resume application.

## Scope

- Release only commits merged into `main` through PRs #71–#75.
- Exclude all unmerged work from `feat/codex-9router-profile` and other feature branches.
- Bump package manifests from `0.8.0` to `0.9.0` without dependency-resolution changes.
- Publish through the trusted GitHub Actions OIDC workflow with provenance.
- Align and verify the Bun global runtime after publication.

## Tasks

- [x] **R1 — Prepare and verify manifests**: bumped exactly three manifest version fields from `0.8.0` to `0.9.0`; release manifest, 196 tests, packed consumers, npm pack dry-run, and diff hygiene passed. Independent verification found no issues. Commit: `80d3fc4c4944396efb310b3afed612c94f66ec82`.
- [ ] **R2 — Deliver green release PR**: commit, push, open an approved release PR, wait for CI, and merge.
- [ ] **R3 — Tag, release, and publish**: create immutable annotated `v0.9.0` from fresh `origin/main`, attach verified plugin assets, and publish through trusted OIDC.
- [ ] **R4 — Verify and align global runtime**: verify npm exact/latest, update Bun global package, verify Copilot reasoning-effort behavior and Copilot/Codex doctors.
- [ ] **R5 — Preserve final evidence**: merge final release evidence into `main` through a focused documentation PR.

## Acceptance criteria

- Tag and GitHub Release point to the exact release commit on freshly fetched `origin/main`.
- Expected plugin assets and checksums are present.
- Trusted workflow publishes `@benjamolina/pi-kit@0.9.0` with provenance.
- npm exact version and `latest` report `0.9.0`.
- Global `pi-kit-copilot` exposes model-specific reasoning effort and remains credential-safe.
- Copilot and Codex doctors remain healthy.

## Evidence

- R1 manifest diff: `package.json` version plus the top-level and root-package versions in `package-lock.json`; no dependency or resolution changes.
- R1 checks: release manifest passed; `bun test` 196/196; packed Pi/OpenCode/Codex/Copilot consumers resolved `0.9.0`; npm pack dry-run passed; diff hygiene passed.
- R1 isolation: release branch is based on exact `origin/main` commit `89be00ad53a9604d6bf28f1458c9c7e8580b408c`; commits `70de275`, `6c096cf`, and `555bb4d` from `feat/codex-9router-profile` are excluded.
- R1 runtime harness: N/A until post-publication global alignment in R4.
- R1 rollback boundary: `package.json` and `package-lock.json` only.
