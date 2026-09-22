# Release pi-kit v0.10.0

Approved Issue: https://github.com/BenjaMolina/pi-kit/issues/83

## Goal

Publish `@benjamolina/pi-kit@0.10.0` from the exact `main` history containing the managed 9Router Codex profile integration, so users can install the supported `pi-kit-codex 9router` lifecycle and launch Codex with `codex -p 9router`.

## Scope

- Release only commits merged into `main` through Issue #79 and PRs #80, #81, #82 (managed 9Router Codex provider/profile integration), on top of the v0.9.0 release baseline.
- Bump package manifests from `0.9.0` to `0.10.0` without dependency-resolution changes.
- Publish through the trusted GitHub Actions OIDC workflow with provenance.
- Verify the public npm registry after publication.
- Preserve final ODD evidence in a follow-up documentation PR.

## Delivery strategy

- Strategy: `single-pr`, explicitly selected. The change is a manifest-only version bump touching exactly two files (`package.json`, `package-lock.json`), well under any chained-PR size threshold.

## Strict TDD context (resolved from the v0.9.0 release convention)

- Mode: not applicable to behavior implementation. This is a manifest-only release: no source or behavior code changes, so there is no RED/GREEN/TRIANGULATE/REFACTOR cycle to run.
- Established convention (from `odd/tasks/release-v0.9.0.md`, task R1): a manifest-only release substitutes the exact release verification checks for RED/GREEN behavior evidence. The verification record below (`release-manifest-check.ts`, `bun test`, `pack-consumer.ts`, `npm pack --dry-run`, `git diff --check`) is the release's test evidence.
- No RED behavior cycle exists or is required for this task; the release-manifest-check assertion (name, version format, `private`, `main`/`exports`, `bin`, `publishConfig`, `repository`, lockfile root name/version, and tag-match when `RELEASE_TAG` is set) is itself the verification contract this release must satisfy, and it was run and observed passing exactly as written.

## Route and delegation

- Exploration: delegated to `gentle-ai-explore` because mapping the release required four or more repository files. The mapper confirmed the exact three-field manifest bump, issue/PR policy, release workflow, asset requirements, and R1–R5 sequence.
- Implementation: delegated to `gentle-ai-worker` because the authorized work touched two manifests plus this ODD document. The worker was bounded to exactly these three edit surfaces.
- Verification: executed by the delegated writer using the exact parent-authorized commands, followed by parent structural readback and diff hygiene checks.

## Task states

- [x] **R1 — Prepare and verify manifests**: bumped exactly three manifest version fields from `0.9.0` to `0.10.0`; release manifest check, full test suite, packed-consumer runtime harness, npm pack dry-run, and diff hygiene all passed. Work-unit commit: _pending — parent owns commit creation_.
- [ ] **R2 — Deliver green release PR**: not started. Parent opens and merges the release PR after reviewing this work unit.
- [ ] **R3 — Tag, release, and publish**: not started. Requires an annotated `v0.10.0` tag on the merged release commit, GitHub Release with the existing verified CLIProxyAPI plugin assets, and a trusted OIDC publish run.
- [ ] **R4 — Verify and align global runtime**: not started. Requires public npm exact/`latest` resolution to `0.10.0` and a healthy Bun global runtime alignment check.
- [ ] **R5 — Preserve final evidence**: not started. Merge final release evidence into `main` through a focused documentation PR, mirroring the v0.9.0 PR #78 pattern.

## Expected release scope

- Managed 9Router Codex profile (Issue #79; PRs #80 tracker, #81 core lifecycle, #82 CLI surface): `pi-kit-codex 9router install|status|uninstall`, managed `model_providers.9router` registration in Codex `config.toml`, managed `$CODEX_HOME/9router.config.toml` profile, `codex -p 9router` selection, `NINEROUTER_API_KEY`/`NINEROUTER_BASE_URL`/`NINEROUTER_MODEL` environment support, fail-closed collision guards, and coexistence with CLIProxyAPI and native OpenAI without altering the root/default Codex provider.
- No source behavior changes are introduced by this release work unit itself; the above scope was already merged to `main` prior to this branch.

## Acceptance criteria

- Tag and GitHub Release point to the exact release commit on freshly fetched `origin/main`.
- Expected plugin assets and checksums are present.
- Trusted workflow publishes `@benjamolina/pi-kit@0.10.0` with provenance.
- npm exact version and `latest` report `0.10.0`.
- Managed 9Router Codex profile lifecycle (`install`/`status`/`uninstall`) is available from the published package.
- Existing CLIProxyAPI and native OpenAI Codex behavior remain unchanged; no 9Router credential is persisted or printed.

## Evidence

- R1 branch: `release/v0.10.0`, created from freshly fetched `origin/main` at exact commit `523c56ad6cac4abd76445e055d98d1c9011ef671`.
- R1 manifest diff: `package.json` `version` field; `package-lock.json` top-level `version` field and root package (`packages[""].version`) field — three fields total, `0.9.0` → `0.10.0`. No dependency, `license`, `dependencies`, or `devDependencies` entries changed.
- R1 changed files: `package.json` (1 line changed), `package-lock.json` (2 lines changed), `odd/tasks/release-v0.10.0.md` (this document, new file).
- R1 checks:
  - `RELEASE_TAG=v0.10.0 bun scripts/release-manifest-check.ts` → `Validated @benjamolina/pi-kit@0.10.0`.
  - `bun test` → 212 pass, 0 fail, 904 expect() calls across 14 files.
  - `bun scripts/pack-consumer.ts` → packed `benjamolina-pi-kit-0.10.0.tgz` (54,641 bytes compressed, 235,161 bytes unpacked); Pi 0.85.1, OpenCode 1.18.18, Codex, and Copilot isolated consumers all resolved `@benjamolina/pi-kit@0.10.0` from the mocked registry.
  - `npm pack --dry-run` → 41 files, package size 54.6 kB, unpacked size 235.2 kB, version `0.10.0` confirmed in tarball metadata.
  - `git diff --check` → clean, no whitespace/format issues (exit 0).
- R1 runtime harness (from `pack-consumer.ts`): isolated Pi consumer installed and listed the package via `pi install`/`pi list`; isolated OpenCode consumer resolved the plugin via `opencode models cliproxyapi` and listed the mock model; isolated Codex consumer's packaged `pi-kit-codex --help`, `install`, and `uninstall` wrote and cleanly removed managed configuration; isolated Copilot consumer's packaged `pi-kit-copilot --help`, `pick`/`switch` (non-TTY refusal), `models`, `use`, and `vscode sync`/`uninstall` all behaved correctly against the mocked CLIProxyAPI registry. All four consumers report exact version `0.10.0`.
- R1 isolation: release branch is based on exact `origin/main` commit `523c56ad6cac4abd76445e055d98d1c9011ef671`, which already contains the merged 9Router integration (PRs #80, #81, #82); no unmerged feature-branch work is included.
- R1 rollback boundary: `package.json` and `package-lock.json` only. Reverting these two files' version fields to `0.9.0` fully reverses this task's manifest change; this ODD document is additive documentation and carries no runtime effect.
- R2 release PR: _pending — parent opens after reviewing this work unit._
- R3 annotated tag `v0.10.0`: _pending._
- R3 GitHub Release: _pending._
- R3 release assets/checksums: _pending — expected to reuse the existing verified `codex-catalog-display-name` and `codex-antigravity-responses-repair` native plugin assets, unchanged since v0.9.0 unless a new build is required._
- R3 trusted OIDC publish run: _pending._
- R4 public npm exact/`latest` resolution: _pending._
- R4 Bun global runtime alignment: _pending._
- R5 final evidence documentation PR: _pending._

## Next step

Parent reviews this work unit (branch `release/v0.10.0`, two-file manifest diff, and this document), then owns committing, pushing, opening the release PR (R2), and the subsequent tag/release/publish/verification/evidence tasks (R3–R5).
