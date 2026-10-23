# Reusable Codex device login import

## Goal

Provide a repository PowerShell script for importing an isolated official Codex device login into local 9Router with renewable OAuth credentials. No hardcoded user paths or credentials.

## Scope and constraints

- Script: `scripts/import-codex-9router.ps1`; usage: adjacent Markdown file; mocked regression tests in `tests/codex-9router-import.test.ts`.
- Accept an explicit AuthPath; prompt hidden for dashboard password; use management login and bulk-import routes. Preserve refresh and ID tokens.
- Allow loopback-only HTTP endpoints; never send credentials via redirects or log response bodies/secrets. No automatic retry after import ambiguity.
- Do not execute a real import or alter existing credentials during tests.
- TDD enabled consistent with earlier feature work; runner `bun test tests/codex-9router-import.test.ts`, using PowerShell with synthetic HTTP mocks.
- User explicitly authorized a local work-unit commit after implementation and successful manual import. No push or publication authorized.

## Tasks

- [x] Delegated implementation: reusable script, usage documentation, mocked tests. Route: gentle-ai-worker (multi-file write).
- [x] Independently verify credential safety and focused checks. Route: gentle-ai-verify; findings corrected by writer and checked by parent.
- [ ] Create the user-authorized local work-unit commit.

## Evidence

- Implementation required correcting synthetic PowerShell mock switch/pipeline bindings and numeric bulk-import response handling; no live account changes.
- Writer final focused suite: `bun test tests/codex-9router-import.test.ts` passed 9/0 (51 assertions); PowerShell AST parse passed. Initial missing-script failures are not evidence of token validation.
- Native assessment unavailable (empty output), RDD off; conservative independent verifier completed. No native review authority created.
- Independent tests passed 9/0 on Windows PowerShell and pwsh; review found CODEX_HOME restoration absent in guide and account-result index unchecked. Corrective TDD reproduced wrong/missing index then passed 11/0 (60 assertions) in both selected shells; guide now restores environment in finally. Parent corrected Markdown fence and reran focused suite: 11/0 (60 assertions). No live import was performed by agents. The user then ran the script successfully; the dashboard confirmed an active OAuth connection and five passed validation checks with zero failures. Local commit authorized; no push or publication.

## Delivery

Forecast: about 250–350 authored lines; single focused work unit, ask-on-risk delivery strategy. Rollback: remove only script, adjacent guide, tests, and this task document.
