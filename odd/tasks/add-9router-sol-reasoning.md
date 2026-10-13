# Add verified 9Router Sol reasoning control

## Intent and constraints
User authorized checking the running container and implementing Pi thinking controls if supported. Container 9router v0.5.95 confirmed Codex flat reasoning_effort -> nested reasoning.effort. Read-only getThinkingLevels proved exact `cx/gpt-6.1-sol` and `cx/gpt-6-sol`: low, medium, high, xhigh, max; `cx/gpt-5.6-sol[1m]`: none, minimal, low, medium, high, xhigh, max, ultra. No inference was requested. Unauthenticated catalog returns 401; no credentials accessed.
Scope uses exact proven provider+ID combinations only, not arbitrary namespace stripping or suffix inference. Unknown routes/models remain conservative. Do not offer off/minimal for 6.x despite coarse canDisable:true, because exact level registry omits them. For the verified 5.6 [1m] entry off explicitly sends none; ultra is not exposed by Pi. Preserve all existing limits and ID protections, including prior committed bracket fix.

## Route and checks
Delegated bounded writer then risk assessment/independent verifier. TDD not enabled per current project map, runner Bun. RDD off. Delivery strategy ask-on-risk; forecast below 250 authored lines. User subsequently authorized a local commit with tests for this feature. Push/PR/release remain unauthorized. Keep prior d533e35 intact on existing branch; uncommitted change remains separately reviewable.
Allowed behavior files: src/cliproxyapi/pi-9router.ts, extensions/9router-dynamic-provider.ts only if precedence requires change, tests/pi-9router-models.test.ts, tests/9router-dynamic-provider.test.ts, README.md. Do not change catalog discovery unless a demonstrated requirement demands a new parent scope decision. Parent owns this task record and installed deployment.
Checks: `bun test tests/pi-9router-models.test.ts tests/9router-dynamic-provider.test.ts tests/opencode-cliproxyapi.test.ts`, `bun test`, `git diff --check`. Required transport test uses installed Pi AI adapter with mock fetch/no credentials: selected high emits reasoning_effort:high, unsupported off clamps to low for 6.1, verified 5.6 off emits none, unknown nonreasoning omits effort. Determine actual active installed package before syncing minimal verified changes. Rollback: remove exact Sol reasoning map, transport tests and docs; retain prior suffix fix. No Docker modifications.

## Tasks
- [x] T1 (source checks completed): Implement exact scoped reasoning mapping with full explicit level map and test real Pi adapter payload behavior. Resolve SDK version/import path from actual installation, not assumption. Run focused/full checks and document verified level coverage.
- [x] T2 (completed): Independent verification as required; verify installed path, apply minimal hotfix and test installed behavior without network. Record limitations and user reload step.

## Progress and verification
Writer source focused tests 42 passed; full suite 249 passed; diff check passed. Real Pi AI adapter mocked harness reports high -> high, 6.1 off -> low, 5.6 off -> none, unknown no effort. Active package verified as session npm installation @benjamolina/pi-kit0.11.2 and Pi0.85.1, not earlier speculative Bun global path. Parent baseline-compared installed mapper/extension to source HEAD then synced minimal two changed files; content readback passed. Provider-level reasoning false removed because actual registration override precedence required model per-entry flags to survive (independent check pending). Source diff116 authored lines. Native assessment unavailable, independent verification required. No inference requests, Docker mutations, commit or push performed for this feature.

## Independent verification
Configured gentle-ai-verify failed before execution: model cliproxyapi/gpt-6.1-sol:high unavailable. Fresh gentle-ai-worker used as explicitly read-only verification fallback; no writes. Focused tests 42 passed, diff check passed, installed mapper and extension match source ignoring line endings. Real installed Pi AI0.85.1 streamSimple mock harness independently confirmed high->high,6.1 off->low,5.6 off->none,unknown omission, without network. Actual SDK compat composition inspected: absence of conflicting provider false preserves per-model flags/maps. Full suite249 passed from writer evidence. No live inference or reload performed. Engram full feature mirror pending: session bound to unrelated project.

## Runtime confirmation and precommit evidence
User confirmed reasoning is visible in Pi after reload. Actual upstream inference/effort effect remains unverified. Fresh read-only precommit verification: focused suite42 passed,0 failed,160 assertions; full suite249 passed,0 failed,1060 assertions across16 files; git diff --check passed. No unexpected changes. Commit includes five behavior/test/documentation files and this record, separately from prior d533e35 suffix fix. Local commit identity can be resolved with `git log -1 --format=%H -- odd/tasks/add-9router-sol-reasoning.md`.

## Next step
Create authorized local work-unit commit; await separate authorization for push/PR/publication. Installed hotfix may be overwritten on update; permanent release remains pending.
