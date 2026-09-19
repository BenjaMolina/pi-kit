# Release pi-kit v0.5.8

## Goal

Publish pi-kit v0.5.8 with the CLIProxyAPI plugin management commands for `pi-kit-codex` merged in PR #44 and config template updates merged in PR #42.

## Release scope

- Release `pi-kit-codex plugin list`, `status`, `install`, and `uninstall` commands.
- Include hybrid download and Docker build fallback for native plugins.
- Bump package version from `0.5.7` to `0.5.8` in `package.json` and `package-lock.json` only.
- Publish through trusted GitHub Actions OIDC workflow.

## Tasks

- [x] Bump manifests to `0.5.8` without changing dependency resolution. Evidence: `package.json` and `package-lock.json` updated cleanly.
- [x] Run release-manifest validation, full tests, packed-consumer verification, plugin Go tests, and `npm pack --dry-run`. Evidence: 51 tests passed; release manifest validates v0.5.8; packed consumers resolved cleanly.
- [ ] Merge the release bump to `main` through a green PR linked to approved issue #45.
- [ ] Create immutable annotated tag `v0.5.8` from the freshly fetched `origin/main` commit.
- [ ] Upload precompiled Linux amd64 `.so` assets to GitHub Release `v0.5.8`.
- [ ] Publish through `release-npm.yml` using trusted OIDC/provenance and verify npm.
