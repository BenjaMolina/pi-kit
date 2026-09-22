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

- [x] **R1 — Prepare and verify manifests**: bumped exactly three manifest version fields from `0.9.0` to `0.10.0`; release manifest check, full test suite, packed-consumer runtime harness, npm pack dry-run, and diff hygiene all passed. Work-unit commit: `e6d0f1716395be3af47025ed9348351ff4179d0c`.
- [x] **R2 — Deliver green release PR**: delivered as PR #84 (https://github.com/BenjaMolina/pi-kit/pull/84), CI green at https://github.com/BenjaMolina/pi-kit/actions/runs/35748040981, merged to `main` as merge commit `c8c7b207dd3e5d72505bdede64fe8cd00ce9959f`.
- [x] **R3 — Tag, release, and publish**: annotated tag `v0.10.0` peels to `c8c7b207dd3e5d72505bdede64fe8cd00ce9959f`; GitHub Release published at https://github.com/BenjaMolina/pi-kit/releases/tag/v0.10.0 with the existing verified CLIProxyAPI plugin assets; trusted OIDC publish run https://github.com/BenjaMolina/pi-kit/actions/runs/35751560202 succeeded (event `push`, head SHA `c8c7b207dd3e5d72505bdede64fe8cd00ce9959f`).
- [x] **R4 — Verify and align global runtime**: public npm exact and `latest` both resolve `0.10.0`; Bun global install/runtime verification completed (see Evidence).
- [ ] **R5 — Preserve final evidence**: this document update is prepared on branch `docs/complete-release-v0.10.0`. Completion requires committing, opening, and merging the final evidence documentation PR.

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
- R2 release PR: PR #84 (https://github.com/BenjaMolina/pi-kit/pull/84), CI run https://github.com/BenjaMolina/pi-kit/actions/runs/35748040981 (green), merge commit `c8c7b207dd3e5d72505bdede64fe8cd00ce9959f`.
- R3 annotated tag `v0.10.0`: peels to commit `c8c7b207dd3e5d72505bdede64fe8cd00ce9959f`.
- R3 GitHub Release: https://github.com/BenjaMolina/pi-kit/releases/tag/v0.10.0.
- R3 release assets/checksums: `codex-catalog-display-name-linux-amd64-v1.1.0.so` sha256 `1fab1d7f68cfcbca5d49cc359dda190f9930715614bd911f3c2cafc145a39a64`; `codex-antigravity-responses-repair-linux-amd64-v1.0.1.so` sha256 `85686e7bc6ee21b3ea3a0ea67343f79c97958753b10b48b70db4baac1a260e00`. Reused existing verified native plugin assets, unchanged since v0.9.0.
- R3 trusted OIDC publish run: https://github.com/BenjaMolina/pi-kit/actions/runs/35751560202 — success, event `push`, head SHA `c8c7b207dd3e5d72505bdede64fe8cd00ce9959f`.
- R4 public npm exact/`latest` resolution: both `npm view @benjamolina/pi-kit@0.10.0 version` and `npm view @benjamolina/pi-kit@latest version` resolve `0.10.0`.
- R4 Bun global runtime alignment: `bun add -g @benjamolina/pi-kit@0.10.0` exited `1` with the known pre-existing `refusing to install dependency with unsafe name` warning, but confirmed installation of `@benjamolina/pi-kit@0.10.0` with `pi-kit-codex` and `pi-kit-copilot` binaries; `bun pm ls -g` confirms `0.10.0`. Runtime checks: both CLI `--help` commands succeeded; `pi-kit-codex 9router status` reported provider not registered/profile not installed (expected non-mutating status on a clean environment); `pi-kit-codex doctor` reported healthy — API key set, managed root/provider, proxy reachable, 2/2 plugins; `pi-kit-copilot doctor` reported healthy — selected `claude-sonnet-5` available, proxy reachable, VS Code managed, 55 models.
- R4 workflow warnings: GitHub Actions logs show only non-blocking warnings — Node.js 20 action-runtime deprecation with forced Node 24, and a future `ubuntu-latest` migration to Ubuntu 26. No release failure.
- R5 final evidence documentation PR: pending parent creation at this edit stage. The R5 document update is prepared on branch `docs/complete-release-v0.10.0`; the parent owns commit creation, PR opening, and merge for this evidence PR.

## Next step

Parent reviews this evidence work unit (branch `docs/complete-release-v0.10.0`, documentation-only diff to this file) and owns committing, pushing, and opening/merging the final evidence documentation PR (R5). Release delivery (R2–R4) is complete and recorded above.
