# Release pi-kit v0.5.0

## Goal

Publish pi-kit v0.5.0 with the standalone CLIProxyAPI Codex catalog display-name plugin introduced by issue #25 and PRs #26–#28.

## Release scope

- Package and publish the already-merged plugin source, tests, Linux amd64 build script, checksum-verified installer, profile documentation, and generated-artifact ignores.
- Bump the package version from `0.4.0` to `0.5.0` in `package.json` and `package-lock.json` only.
- Publish through the repository's GitHub Actions trusted npm workflow; never run local `npm publish`.

## Tasks

- [ ] Bump manifests to `0.5.0` without changing dependency resolution.
- [ ] Run release-manifest validation, full tests, packed-consumer verification, plugin Go tests/vet, and `npm pack --dry-run`.
- [ ] Confirm the npm tarball contains the plugin source, build/install scripts, and documentation, but no generated `.so`/`.h` artifacts.
- [ ] Commit and push the release bump to `main` after verification.
- [ ] Create immutable annotated tag `v0.5.0` from the freshly fetched `origin/main` commit.
- [ ] Create the GitHub release and dispatch the trusted `release-npm.yml` workflow from `main` for `v0.5.0`.
- [ ] Verify the workflow conclusion and npm registry version/dist-tag.

## Acceptance criteria

- GitHub release `v0.5.0` points to the exact release commit on `main`.
- GitHub Actions publishes `@benjamolina/pi-kit@0.5.0` using trusted OIDC/provenance.
- npm reports exact version `0.5.0` and `latest` points to it.
- The final repository worktree is clean and synchronized with `origin/main`.
