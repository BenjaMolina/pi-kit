# Add Codex Antigravity Responses repair plugin

## Goal

Ship the proven Codex-to-Antigravity Gemini compatibility repair as a standalone CLIProxyAPI plugin owned by pi-kit, leaving the CLIProxyAPI fork free of source patches.

## Constraints

- Gate strictly on OpenAI Responses to Antigravity Gemini translation requests.
- Rewrite only translated system-instruction text; never user, history, tool, or credential content.
- Fail open for malformed or nonmatching requests and remain idempotent.
- Follow the existing catalog plugin's isolated build, checksum-verified install, documentation, and npm packaging patterns.
- Preserve unrelated local changes in both repositories.

## Tasks

- [x] CAR-1 Add the standalone plugin module with behavior and registration tests. Evidence: `gofmt -w main.go repair.go main_test.go` completed; `go test ./...` passed in `profiles/cliproxyapi/plugins/codex-antigravity-responses-repair`.
- [x] CAR-2 Add isolated Linux amd64 build and checksum-verified installer scripts. Evidence: build mounts only the plugin source directory and removes its generated header; installer verifies SHA-256 before and after copying, detects the sibling public Compose mount, refuses overwrite absent `-Force`, and neither restarts the service nor edits configuration.
- [x] CAR-3 Document behavior, deployment, activation, verification, update, and rollback. Evidence: plugin README and profile README document source ownership, narrow rewrite scope, fail-open behavior, build/install safety, operator-approved activation, verification, update, and rollback.
- [x] CAR-4 Extend package verification to include the new plugin source while excluding generated native artifacts. Evidence: `scripts/pack-consumer.ts` requires all source, script, and README files for both native plugins and excludes only generalized generated `.so`/`.h` files; matching generalized Git ignores protect local artifacts.
- [x] CAR-5 Install from pi-kit, remove the provisional fork source, and verify Codex Gemini, Codex GPT, and Pi Gemini paths. Evidence: isolated Docker build produced v1.0.0 with SHA-256 `866E4136E2FAB4FFBE2D8D0ED17C8DDD12EDE91B92C7A13F8EC0DCB8E17A8817`; checksum installer deployed the stable `.so`; CLIProxyAPI loaded plugin version 1.0.0; Codex Gemini returned `pi-kit plugin works`, Codex GPT returned `gpt unchanged`, and Gemini chat completions returned `pi unchanged`. The provisional plugin source/task and versioned prototype binaries were removed from the fork.

## Evidence

- Delivery strategy: single cohesive PR with `size:exception`; 704 changed lines keep the plugin behavior, tests, build/install safety, documentation, and package verification reviewable as one rollback unit. Splitting would make intermediate slices incomplete or undistributable.
- Branch: `feat/codex-antigravity-responses-repair`
- Proven upstream trigger: Antigravity returns 429 for `You are Codex, ... based on GPT-5.` system identities; changing only the comma after `Codex` to a semicolon succeeds.
- Existing CLIProxyAPI `request_normalizer` capability is sufficient; no core or ABI extension is required.
