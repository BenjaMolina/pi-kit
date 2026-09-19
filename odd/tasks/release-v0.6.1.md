# Release pi-kit v0.6.1

Approved Issue: https://github.com/BenjaMolina/pi-kit/issues/57

## Goal

Publish `@benjamolina/pi-kit@0.6.1` delivering automated VS Code SecretStorage injection (Windows DPAPI + AES-256-GCM), credential preservation in `chatLanguageModels.json`, and secret auditing in `doctor` and `vscode status` (merged in PR #56, Issue #55).

## Release scope

- Automated VS Code SecretStorage injection on Windows using Windows DPAPI and AES-256-GCM directly into `state.vscdb`.
- Preserves existing `${input:...}` apiKey references across VS Code Custom Endpoint synchronizations.
- Audits SecretStorage status (`configured`, `missing`, `unsupported platform`) in `pi-kit-copilot doctor` and `pi-kit-copilot vscode status`.
- Bump package version from `0.6.0` to `0.6.1` in `package.json` and `package-lock.json` only.
- Publish through trusted GitHub Actions OIDC workflow.

## Tasks

- [x] Bump manifests to `0.6.1` without changing dependency resolution. Evidence: `package.json` and `package-lock.json` updated cleanly.
- [x] Run release-manifest validation, full tests, packed-consumer verification, and `npm pack --dry-run`. Evidence: 78 tests passed across 13 files, manifest validated v0.6.1, packed consumers resolved cleanly.
- [x] Merge the release bump to `main` through a green PR linked to approved issue #57. Evidence: PR #58 merged (`e5347c8`).
- [x] Create immutable annotated tag `v0.6.1` from the freshly fetched `origin/main` commit. Evidence: tag `v0.6.1` pushed and verified (`e5347c8b9f9...`).
- [x] Upload precompiled Linux amd64 `.so` assets to GitHub Release `v0.6.1`. Evidence: release assets uploaded (`1fab1d7f...` and `85686e7b...`).
- [x] Publish through `release-npm.yml` using trusted OIDC/provenance and verify npm. Evidence: `@benjamolina/pi-kit@0.6.1` published and verified live on npm (`npm view @benjamolina/pi-kit version` -> `0.6.1`).
- [x] Align Bun global package to `@benjamolina/pi-kit@0.6.1`. Evidence: `pi-kit-copilot doctor` reports `VS Code secret: configured`.

## Acceptance criteria

- GitHub release `v0.6.1` points to the exact release commit on `main`.
- GitHub Actions publishes `@benjamolina/pi-kit@0.6.1` using trusted OIDC/provenance.
- npm reports exact version `0.6.1` and `latest` points to it.
- Bun global CLI is updated to `@benjamolina/pi-kit@0.6.1`.
