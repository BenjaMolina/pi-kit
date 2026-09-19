# Update CLIProxyAPI config template with native plugins

## Goal

Update `profiles/cliproxyapi/config.template.yaml` in pi-kit to include the two native plugins (`codex-catalog-display-name` and `codex-antigravity-responses-repair`), so fresh deployments bootstrapped from the template have all plugins declared by default.

## Constraints

- Preserve all existing template comments, client keys, and management settings.
- Only add the two established native plugin configurations under `plugins.configs`.
- Follow strict repository PR workflow: approved issue, conventional commit, CI pass, type label.

## Tasks

- [x] CCT-1 Create and approve GitHub issue for updating the config template. Evidence: Issue #41 created and labeled `status:approved`.
- [x] CCT-2 Update `profiles/cliproxyapi/config.template.yaml` on branch `chore/cliproxyapi-config-template`. Evidence: added `codex-catalog-display-name` and `codex-antigravity-responses-repair` under `plugins.configs`.
- [x] CCT-3 Verify with `npm test`, `npm run test:release-manifest`, `npm run test:pack`, and `git diff --check`. Evidence: 43 Bun tests pass, release manifest validates v0.5.7, pack consumer validates consumers, diff check clean.
- [ ] CCT-4 Deliver via PR with `type:chore` label and merge to `main`.
