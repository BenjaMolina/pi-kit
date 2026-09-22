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
- [x] **R2 — Deliver green release PR**: PR #77 passed CI and merged as `bbe43b8f3f20b81d7e044f804810e78adae98a04`.
- [x] **R3 — Tag, release, and publish**: annotated `v0.9.0` targets exact fresh `origin/main`; GitHub Release assets were checksum-verified; trusted OIDC run succeeded.
- [x] **R4 — Verify and align global runtime**: npm exact/latest report `0.9.0`; Bun global package, lock resolution, shims, Copilot reasoning-effort state/help, and Copilot/Codex doctors are healthy.
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
- R2 release PR: https://github.com/BenjaMolina/pi-kit/pull/77; CI passed; merge commit `bbe43b8f3f20b81d7e044f804810e78adae98a04`.
- R3 annotated tag `v0.9.0` peels to `bbe43b8f3f20b81d7e044f804810e78adae98a04` and was verified after push against fresh `origin/main`.
- R3 GitHub Release: https://github.com/BenjaMolina/pi-kit/releases/tag/v0.9.0.
- R3 release assets: `codex-catalog-display-name-linux-amd64-v1.1.0.so` SHA-256 `1fab1d7f68cfcbca5d49cc359dda190f9930715614bd911f3c2cafc145a39a64`; `codex-antigravity-responses-repair-linux-amd64-v1.0.1.so` SHA-256 `85686e7bc6ee21b3ea3a0ea67343f79c97958753b10b48b70db4baac1a260e00`.
- R3 trusted OIDC publish run succeeded: https://github.com/BenjaMolina/pi-kit/actions/runs/35684093186.
- R4 public npm exact `@benjamolina/pi-kit@0.9.0` and `latest` both resolve to `0.9.0`.
- R4 Bun global manifest, lockfile, installed package, and both command shims resolve `@benjamolina/pi-kit@0.9.0`.
- R4 `pi-kit-copilot --help` advertises `use <model-id> ... --reasoning-effort=...`; status preserves `claude-sonnet-5` with reasoning effort `high`; Copilot and Codex doctors report healthy managed configurations without exposing credentials.
- R4 install command returned exit 1 only because of the known pre-existing empty dependency key in Bun's global manifest; package files, lock resolution, binaries, help, status, and doctors prove successful alignment. No release remediation is required.
