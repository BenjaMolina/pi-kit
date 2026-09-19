# Task: Release v0.5.9

## Scope
- Associated issue: #49
- Target branch: `chore/release-v0.5.9` -> `main`

## Context
Delivers generalized `codex-antigravity-responses-repair` v1.0.1 supporting all Antigravity models (Claude, Gemini) in Codex via CLIProxyAPI.

## Tasks
- [x] Bump manifests to `0.5.9` without changing dependency resolution. Evidence: `package.json` and `package-lock.json` updated.
- [x] Run release-manifest validation, full tests, packed-consumer verification, plugin Go tests, and `npm pack --dry-run`. Evidence: 51 tests passed, manifest validated v0.5.9, packed consumers resolved cleanly.
- [ ] Merge the release bump to `main` through a green PR linked to approved issue #49.
- [ ] Create immutable annotated tag `v0.5.9` from the freshly fetched `origin/main` commit.
- [ ] Upload precompiled Linux amd64 `.so` assets to GitHub Release `v0.5.9`.
- [ ] Publish through `release-npm.yml` using trusted OIDC/provenance and verify npm.
