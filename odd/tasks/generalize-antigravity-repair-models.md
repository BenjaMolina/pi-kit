# Task: Generalize codex-antigravity-responses-repair to all Antigravity models

## Scope
- Associated issue: #47
- Target branch: `fix/generalize-antigravity-repair-models` -> `main`

## Context
Google Antigravity serves both Gemini and Anthropic Claude models. The upstream gateway (`daily-cloudcode-pa.googleapis.com`) checks the system instruction and triggers a false 429 when it starts with `You are Codex,`.
In v1.0.0, the plugin only applied when `request.Model` contained `gemini`. Claude models like `claude-opus-4-6-thinking` were skipped and thus failed with 429.

## Tasks
- [x] Create approved issue #47 and feature branch `fix/generalize-antigravity-repair-models`. Evidence: Issue #47 labeled `status:approved` and `type:bug`.
- [x] Update `profiles/cliproxyapi/plugins/codex-antigravity-responses-repair/repair.go` to remove the `gemini` name restriction and target any Antigravity request. Evidence: `matchesTarget` checks `openai-response` -> `antigravity`.
- [x] Add unit tests in `main_test.go` covering Claude models on Antigravity and non-Antigravity models. Evidence: `go test ./...` passed.
- [x] Bump plugin version in `main.go` and `build-linux-amd64.ps1` to `1.0.1`. Evidence: plugin reports version `1.0.1`.
- [x] Rebuild Linux amd64 binary, calculate SHA-256, and update `MANAGED_PLUGINS` in `src/codex/plugins.ts`. Evidence: SHA-256 `85686e7bc6ee21b3ea3a0ea67343f79c97958753b10b48b70db4baac1a260e00`.
- [x] Update documentation and tests in `pi-kit`. Evidence: 51 tests passed.
- [x] Open PR linked to #47, verify CI, merge to `main`. Evidence: PR #48 merged to `main` (`0286eb9`).
- [x] Prepare release v0.5.9 and deploy updated plugin locally. Evidence: PR #50 merged, release v0.5.9 published to npm, plugin installed and verified with Claude via Codex /v1/responses returning 200 in 3.9s.
