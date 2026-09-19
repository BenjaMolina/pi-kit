# Add CLIProxyAPI plugin management to pi-kit-codex

## Goal

Provide automated, cross-platform plugin management in `pi-kit-codex` (`list`, `status`, `install`, `uninstall`) using a hybrid strategy: download verified precompiled binaries from GitHub releases with fallback or explicit `--build` via Docker, with checksum validation and overwrite protection.

## Constraints

- Pure Node/Bun cross-platform code; no shell script dependencies.
- Strict SHA-256 verification on all installed binaries against a baked plugin registry.
- Support `--force` for intentional overwrites and `--target` for custom plugin directories.
- Auto-detect CLIProxyAPI plugin directory from `CLI_PROXY_PLUGIN_PATH`, sibling checkout, or Docker Compose mount.
- Audit plugin state in `pi-kit-codex doctor`.
- Maintain single-threaded testable design with dependency injection for network and filesystem operations.

## Tasks

- [x] CPM-1 Define the plugin registry, manifest types, and discovery/path resolution in `src/codex/plugins.ts`. Evidence: `MANAGED_PLUGINS` records both plugins with exact binaryNames, release tags, and sha256 checksums; `resolveCLIProxyPluginDirectory` supports target, env, and sibling layouts.
- [x] CPM-2 Implement plugin status inspection (`list` / `status`) and `doctor` integration. Evidence: `getPluginStatus` / `listPluginStatuses` check file existence and checksum match; `doctorCodexCLIProxyAPI` audits installed plugins.
- [x] CPM-3 Implement hybrid plugin installation (download from release assets + sha256 verification + Docker build fallback/flag). Evidence: download verified via GitHub release assets with SHA-256 validation; Docker build fallback verified with `--build` and custom runner.
- [x] CPM-4 Implement plugin uninstallation with safe guards. Evidence: `uninstallPlugin` removes destination `.so` only and reports accurate status.
- [x] CPM-5 Wire commands into `src/codex/cli.ts` (`pi-kit-codex plugin <list|status|install|uninstall>`). Evidence: flags `--build`, `--force`, `--target` parsed cleanly; help text updated.
- [x] CPM-6 Add comprehensive unit tests in `tests/codex-plugins.test.ts` and update `tests/codex-cli.test.ts`. Evidence: 51 tests pass across 10 files with 200 assertions.
- [x] CPM-7 Update documentation in `README.md` and verify package packaging. Evidence: `README.md` command reference updated; `scripts/pack-consumer.ts` requires `src/codex/plugins.ts` and passes.
- [ ] CPM-8 Deliver via PR linked to approved issue #43 and merge to `main`.

## Evidence

- Issue: #43
- Branch: `feat/codex-plugin-management`
- Released plugin binaries on GitHub `v0.5.7`:
  - `codex-catalog-display-name-linux-amd64-v1.1.0.so` (sha256: `1fab1d7f68cfcbca5d49cc359dda190f9930715614bd911f3c2cafc145a39a64`)
  - `codex-antigravity-responses-repair-linux-amd64-v1.0.0.so` (sha256: `669596041d7c9c99121d6c5b6f368d4eab88012900311658887ffbc1db8720cb`)
