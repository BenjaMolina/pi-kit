# Tasks: Automate VS Code SecretStorage injection and preserve credentials

Approved Issue: https://github.com/BenjaMolina/pi-kit/issues/55

## Context
In VS Code 1.138.0 with GitHub Copilot Chat, `chatLanguageModels.json` uses the `customendpoint` provider where `apiKey` is treated as an ID reference into VS Code's encrypted `SecretStorage` (`state.vscdb`). When set to `${input:pi-kit-cliproxyapi-api-key}` without the corresponding encrypted entry in `state.vscdb`, Copilot sends an empty `Authorization: Bearer ` header, causing HTTP 401 from CLIProxyAPI.

Furthermore:
1. `pi-kit-copilot vscode sync` currently overwrites `apiKey` with a hardcoded `${input:pi-kit-cliproxyapi-api-key}`, clobbering any existing SecretStorage reference configured by the user.
2. Users struggle to locate the nested "Update API Key" UI action in VS Code.
3. `pi-kit-copilot doctor` and `vscode status` do not report whether the SecretStorage entry actually exists.

## Work Units
- [x] Task 1: Implement `src/copilot/secret-storage.ts` supporting DPAPI + AES-256-GCM encryption and SQLite injection into `state.vscdb` on Windows, with comprehensive unit tests.
- [ ] Task 2: Enhance `src/copilot/vscode.ts` to preserve existing `${input:...}` apiKey references, integrate automated SecretStorage injection during `sync`, and report secret state in `vscodeConfigStatus`.
- [ ] Task 3: Update `src/copilot/cli.ts` (`doctor` and `vscode status`), update tests in `tests/copilot-vscode.test.ts` and `tests/copilot-cli.test.ts`, update documentation in `README.md`, and run full test suites.
- [ ] Task 4: Submit Pull Request for Issue #55, verify all CI checks, and merge to `main`.
