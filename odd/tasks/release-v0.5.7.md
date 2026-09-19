# Release pi-kit v0.5.7

## Goal

Publish pi-kit v0.5.7 with the standalone CLIProxyAPI Codex Antigravity Responses repair plugin merged by PR #38.

## Release scope

- Publish the merged plugin source, tests, isolated Linux amd64 build, checksum installer, profile documentation, and package-consumer verification.
- Bump the package version from `0.5.6` to `0.5.7` in `package.json` and `package-lock.json` only.
- Publish through the repository's GitHub Actions trusted npm workflow; never run local `npm publish`.
- Keep future `pi-kit-codex` plugin-management automation out of this release.

## Tasks

- [x] Bump manifests to `0.5.7` without changing dependency resolution. Evidence: only the three root package version fields changed from `0.5.6` to `0.5.7`.
- [x] Run release-manifest validation, full tests, packed-consumer verification, plugin Go tests, and `npm pack --dry-run`. Evidence: release manifest validated `0.5.7`; 43 Bun tests passed; clean Pi, OpenCode, and Codex consumers resolved the tarball; both plugin module test suites passed; package dry-run succeeded.
- [x] Confirm the npm tarball contains both plugin source trees and no generated `.so`/`.h` artifacts. Evidence: dry-run reported 33 entries with both plugins' source/scripts/docs and no native artifacts.
- [ ] Merge the release bump to `main` through a green PR linked to approved issue #39.
- [ ] Create immutable annotated tag `v0.5.7` from the freshly fetched `origin/main` commit.
- [ ] Create the GitHub release and publish through `release-npm.yml` using trusted OIDC/provenance.
- [ ] Verify the workflow conclusion and npm exact version/dist-tag.

## Acceptance criteria

- GitHub release `v0.5.7` points to the exact release commit on `main`.
- GitHub Actions publishes `@benjamolina/pi-kit@0.5.7` using trusted OIDC/provenance.
- npm reports exact version `0.5.7` and `latest` points to it.
- The release includes the repair plugin but no generated native binary artifacts.
