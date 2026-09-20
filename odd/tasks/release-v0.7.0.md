# Release pi-kit v0.7.0

Approved Issue: https://github.com/BenjaMolina/pi-kit/issues/62

## Goal

Publish `@benjamolina/pi-kit@0.7.0` delivering the searchable Copilot CLI model picker merged through Issues/PRs #59–#61.

## Release scope

- `pi-kit-copilot pick [--wire-api=responses|completions]` with dynamic CLIProxyAPI discovery, fuzzy search, keyboard navigation, cancellation, and cleanup-safe terminal behavior.
- `pi-kit-copilot launch --pick [--wire-api=...] -- <copilot args...>` while preserving explicit automation commands and ordinary launch behavior.
- Version bump from `0.6.1` to `0.7.0` in `package.json` and `package-lock.json` only.
- GitHub Release with existing precompiled Linux amd64 plugin assets.
- Trusted GitHub Actions OIDC npm publication and global Bun alignment.

## Tasks

- [x] **R1 — Prepare and verify release manifests**
  - Bump package manifests to `0.7.0` without dependency-resolution changes.
  - Run release-manifest validation, full tests, packed-consumer verification, `npm pack --dry-run`, and diff hygiene.
  - Route: delegated writer; multi-file write trigger.

- [x] **R2 — Deliver release commit through approved PR**
  - Commit the version bump and release evidence using Conventional Commits.
  - Push `release/v0.7.0`, open a PR linked to Issue #62 with `type:feature`, wait for green CI, and merge to `main`.

- [x] **R3 — Create immutable release and publish**
  - Fetch fresh `origin/main` and tags; create annotated `v0.7.0` on the exact release commit.
  - Create GitHub Release and upload expected `.so` assets with checksums.
  - Publish via `.github/workflows/release-npm.yml` from trusted GitHub Actions and monitor to success.

- [x] **R4 — Verify registry and align installed runtimes**
  - Verify exact npm version and `latest` dist-tag.
  - Update Bun global `@benjamolina/pi-kit@0.7.0`.
  - Verify global `pi-kit-copilot --help` exposes `pick` and `launch --pick` and run doctor.

## Acceptance criteria

- GitHub Release `v0.7.0` points to the exact freshly fetched release commit on `main`.
- Expected plugin assets are attached with verified checksums.
- GitHub Actions publishes `@benjamolina/pi-kit@0.7.0` using trusted OIDC/provenance.
- npm exact version and `latest` both report `0.7.0`.
- Global Bun CLI resolves `@benjamolina/pi-kit@0.7.0` and exposes the picker commands.

## Review workload forecast

- Small release-only change: manifests plus ODD evidence, expected below 400 authored changed lines.
- Delivery strategy: `single-pr` because the release bump is one cohesive, low-line-count work unit.

## Progress

- Issue #62 created from the repository Feature Request form and read back successfully.
- User explicitly authorized exact Issue #62 approval.
- Maintainer account `BenjaMolina` verified with `ADMIN`; atomic label transition confirmed `type:feature`, `status:approved`.
- Release branch created: `release/v0.7.0`.
- Manifest bump completed with only the three intended version fields changed from `0.6.1` to `0.7.0`; dependency sections and resolutions are unchanged.
- Writer verification passed: release manifest validated, 116 tests passed, packed consumers resolved `0.7.0`, `npm pack --dry-run` produced a clean 41-file package preview, and diff hygiene passed.
- Parent spot check: `npm run test:release-manifest` validated `0.7.0`; `git diff --check` passed; manifest diff contains only the intended version fields.
- Native assessment was unavailable and failed closed to independent verification; independent verification passed every preparation check and found no manifest defect.
- Release commit `6b28117` delivered through PR #63; CI `verify` passed and PR merged as `bc2de3942fd2f48c7551979cc419bd61c67c120f`.
- Annotated tag `v0.7.0` was created from the freshly fetched exact `origin/main` release commit and verified after push.
- GitHub Release: https://github.com/BenjaMolina/pi-kit/releases/tag/v0.7.0 with both verified Linux amd64 plugin assets (SHA-256 `1fab1d7f...` and `85686e7b...`).
- Trusted OIDC publish run succeeded: https://github.com/BenjaMolina/pi-kit/actions/runs/35476935836.
- Public npm registry verified `@benjamolina/pi-kit@0.7.0`; `latest` points to `0.7.0`.
- Bun global state resolves `@benjamolina/pi-kit@0.7.0`; `pi-kit-copilot --help` exposes `pick` and `launch --pick`; Copilot doctor is healthy; Codex doctor reports managed provider and both plugins verified.
- Bun returned a nonzero install status due to a pre-existing malformed empty dependency key in Bun's global manifest, but independent diagnosis and direct command/package evidence confirm the requested package and both binary shims are correctly installed at `0.7.0`. No release remediation is required.

## Next step

None. Release v0.7.0 is complete.