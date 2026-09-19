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
- [x] Task 2: Enhance `src/copilot/vscode.ts` to preserve existing `${input:...}` apiKey references, integrate automated SecretStorage injection during `sync`, and report secret state in `vscodeConfigStatus`.
- [x] Task 3: Update `src/copilot/cli.ts` (`doctor` and `vscode status`), update tests in `tests/copilot-vscode.test.ts` and `tests/copilot-cli.test.ts`, update documentation in `README.md`, and run full test suites.
- [x] Task 4: Submit Pull Request for Issue #55, verify all CI checks, and merge to `main`.

## Verification Evidence
- Issue #55 created and approved with `type:feature`, `status:approved`.
- Pull Request #56 (`feat(copilot): automate VS Code SecretStorage injection and preserve credentials (#55)`) passed all CI checks and merged cleanly into `main` (`86c011c`).
- Work-unit commits:
  1. `52cc9f7 feat(copilot): add VS Code SecretStorage DPAPI and AES-256-GCM management`
  2. `81ce847 feat(copilot): preserve custom endpoint credentials and sync VS Code SecretStorage`
  3. `6b855fd feat(copilot): report VS Code secret status in doctor and status commands`
- Full repository test suite: 78 passing tests across 13 files.
- Package manifest and consumer pack verification passed (`Validated @benjamolina/pi-kit@0.6.0`).
- Live runtime check: `pi-kit-copilot doctor` and `pi-kit-copilot vscode status` reporting `VS Code secret: configured`.
- Empirically verified VS Code Copilot Chat communicating with `CLIProxyAPI` models (Gemini 3.8 Flash reading postmortem document) with HTTP 200 responses.

