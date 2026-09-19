# Release pi-kit v0.5.9

## Goal

Publish pi-kit v0.5.9 delivering the generalized `codex-antigravity-responses-repair` v1.0.1 native plugin for Antigravity (supporting both Claude and Gemini models in Codex via CLIProxyAPI) merged in PR #48.

## Release scope

- Generalize `codex-antigravity-responses-repair` from Gemini-only to all Antigravity destination models (`ToFormat == "antigravity"`).
- Fix false 429 `RESOURCE_EXHAUSTED` rejections on Codex `/v1/responses` for Claude models (e.g. `claude-opus-4-6-thinking`).
- Bump plugin metadata to `1.0.1` and update `src/codex/plugins.ts` registry with verified SHA-256 (`85686e7bc6ee21b3ea3a0ea67343f79c97958753b10b48b70db4baac1a260e00`).
- Bump package version from `0.5.8` to `0.5.9` in `package.json` and `package-lock.json` only.
- Publish through trusted GitHub Actions OIDC workflow.

## Tasks

- [x] Bump manifests to `0.5.9` without changing dependency resolution. Evidence: `package.json` and `package-lock.json` updated cleanly.
- [x] Run release-manifest validation, full tests, packed-consumer verification, plugin Go tests, and `npm pack --dry-run`. Evidence: 51 tests passed, manifest validated v0.5.9, packed consumers resolved cleanly.
- [x] Merge the release bump to `main` through a green PR linked to approved issue #49. Evidence: PR #50 merged (`4a4cff5`).
- [x] Create immutable annotated tag `v0.5.9` from the freshly fetched `origin/main` commit. Evidence: tag `v0.5.9` pushed and verified (`4a4cff53ba96...`).
- [x] Upload precompiled Linux amd64 `.so` assets to GitHub Release `v0.5.9`. Evidence: assets uploaded with checksum `85686e7bc6ee...` and `1fab1d7f...`.
- [x] Publish through `release-npm.yml` using trusted OIDC/provenance and verify npm. Evidence: `@benjamolina/pi-kit@0.5.9` live on npm (dist-tag `latest: 0.5.9`).

## Acceptance criteria

- GitHub release `v0.5.9` points to the exact release commit on `main`.
- GitHub Actions publishes `@benjamolina/pi-kit@0.5.9` using trusted OIDC/provenance.
- npm reports exact version `0.5.9` and `latest` points to it.
- Precompiled `.so` plugin assets are attached to release `v0.5.9`.
- Claude and Gemini models on Antigravity succeed through Codex `/v1/responses`.
