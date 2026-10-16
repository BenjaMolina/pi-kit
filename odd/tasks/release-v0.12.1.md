# Release pi-kit v0.12.1

## Objective and authorization
User authorized completing release and installing published0.12.1. Issue110 verified OPEN,status:approved. Base freshly fetched origin/main5577c1e45e83e61596c7b4a30b0962e1846b2c38 contains merged startup corrections108/109. No new runtime functionality/dependencies; update manifest versions only, preserve existing package resources and installed routing. Publish solely through existing release-npm.yml trusted OIDC; no local npm publish, credentials or Docker modifications.

## Method
Branch chore/release-v0.12.1 from clean fetched main. Delegated writer changes package.json version and two root package-lock.json versions. TDD not enabled current configuration; runner Bun ordinary checks. RDD off. Delivery ask-on-risk, forecast under100 authored lines. Parent owns commits, PR, merge, annotated immutable tag pinned to merged main, GitHub release and active Pi install. No tag moves or blind publication retries. Rollback prior publication: version-only files and task record; after publication use future version, never overwrite0.12.1.

## Tasks
- [x] P1 (verified; commit follows): Bump version fields and run full manifest/test/consumer/pack checks; commit and push release work unit.
- [ ] P2 (in progress): Open PR linking approved110, observe CI, merge exact verified head per user authorization.
- [ ] P3 (pending): Fetch merged main, create verified annotatedv0.12.1, GitHub release with unchanged checksum-verified plugin assets; monitor tag-triggered trusted publication and verify npm exact/latest.
- [ ] P4 (pending): pi install npm:@benjamolina/pi-kit@0.12.1 only; check pin/version, published extension parity and synthetic startup safeguards. Do not change model routing or restart active process; report restart requirement.

## Required checks
RELEASE_TAG=v0.12.1 bun scripts/release-manifest-check.ts
bun test
bun run test:pack
npm pack --dry-run
git diff --check

## Progress and next step
Issue approval and clean main verified. Prior runtime startup fix261 tests,54 independent focused tests, real Luna panel smoke high/OK. Manifest writer completed:261 tests/1139 assertions/17files passed, pack-consumers Pi/OpenCode/Codex/Copilot passed, dry-run44files59226 compressed250318 unpacked bytes, tag-manifest and diff checks passed. Independent parsed comparison confirmed only three0.12.0->0.12.1version fields changed, tag-manifest/diff checks repeated passed. Assessment unavailable; independent verification completed. Commit identity resolves through git log -1 --format=%H -- odd/tasks/release-v0.12.1.md. Next commit/push/PR and CI. Full Engram task mirror pending because session project differs from explicit target repository.
