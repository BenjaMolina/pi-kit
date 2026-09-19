# Release pi-kit v0.6.0

## Goal

Publish pi-kit v0.6.0 delivering the dynamic CLIProxyAPI integration for GitHub Copilot CLI and VS Code Copilot Chat/Agent (`pi-kit-copilot`) merged in PR #52.

## Release scope

- Add `pi-kit-copilot` binary for GitHub Copilot CLI and VS Code Custom Endpoint management.
- Provide automatic dynamic model discovery from CLIProxyAPI; no hardcoded model lists.
- Copilot CLI 1.0.86 BYOK launcher using official environment variables and safe prompt budgets.
- VS Code 1.138.0 Custom Endpoint synchronization supporting canonical array-root and object-root configurations with rollback.
- Bump package version from `0.5.9` to `0.6.0` in `package.json` and `package-lock.json` only.
- Publish through trusted GitHub Actions OIDC workflow.

## Tasks

- [x] Bump manifests to `0.6.0` without changing dependency resolution. Evidence: `package.json` and `package-lock.json` updated cleanly.
- [x] Run release-manifest validation, full tests, packed-consumer verification, and `npm pack --dry-run`. Evidence: 71 tests passed across 12 files, manifest validated v0.6.0, packed consumers resolved cleanly.
- [ ] Merge the release bump to `main` through a green PR linked to approved issue #53.
- [ ] Create immutable annotated tag `v0.6.0` from the freshly fetched `origin/main` commit.
- [ ] Upload precompiled Linux amd64 `.so` assets to GitHub Release `v0.6.0`.
- [ ] Publish through `release-npm.yml` using trusted OIDC/provenance and verify npm.

## Acceptance criteria

- GitHub release `v0.6.0` points to the exact release commit on `main`.
- GitHub Actions publishes `@benjamolina/pi-kit@0.6.0` using trusted OIDC/provenance.
- npm reports exact version `0.6.0` and `latest` points to it.
- Copilot CLI and VS Code Copilot Chat/Agent work with dynamic CLIProxyAPI models.
