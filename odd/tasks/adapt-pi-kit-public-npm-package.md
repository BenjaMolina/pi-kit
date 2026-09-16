# Adapt pi-kit to a public npm package

## Goal

Ship `@benjamolina/pi-kit@0.3.1` as one public npm package consumable by Pi and OpenCode without changing user configuration.

## Tasks

- [x] Establish the public package manifest, npm lockfile, package boundaries, and source-runtime decision.
- [x] Add a real-tarball clean-consumer verification for both Pi and OpenCode 1.18.18.
- [x] Add PR/main CI and a tag-triggered npm-only release workflow.
- [x] Update npm-first installation documentation and validate the package contract.
- [x] Complete release workflow hardening: dependency order, tag ancestry, fail-closed registry handling, bootstrap-only authentication, retry verification, and propagation checks.
- [x] Make clean Pi and OpenCode consumers resolve the package name through an isolated registry mock and record registry requests.
- [x] Document the bootstrap-only NPM_TOKEN release path and the post-publication Trusted Publisher migration.
- [x] Run the required package, consumer, archive, and whitespace validations.

## Constraints

- Keep the Pi manifest and OpenCode external `main`/`exports` entry.
- Package TypeScript only if both Bun-hosted consumers load it from the packed tarball.
- Do not publish, tag, create GitHub releases, or modify real user configuration.
