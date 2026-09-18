# Generalize Codex catalog scope labels

## Goal

Disambiguate every scoped CLIProxyAPI model in Codex Desktop and VS Code, not only slugs whose scope starts with `codex-`.

## Corrected contract

- Any enriched catalog slug shaped as `<scope>/<model>` receives ` · <scope>` in `display_name`.
- The complete scope segment before the first `/` is preserved verbatim, for example:
  - `claude-gedo/claude-fable-5` → `Claude Fable 5 · claude-gedo`
  - `agy-bmolina/gemini-3.8-flash-high` → `Gemini 3.8 Flash · agy-bmolina`
  - `codex-jhoel/gpt-5.6-sol` → `GPT 5.6 Sol · codex-jhoel`
- Slugs without `/` remain clean balanced entries.
- No provider, account, or model allowlist is permitted; present and future scoped models use the same structural rule.
- Slugs, routing, inference, headers, credentials, unknown metadata, standard model lists, malformed responses, and streams remain unchanged.

## Tasks

- [x] Add failing tests for `claude-gedo`, `agy-bmolina`, complete `codex-jhoel`, malformed scope slugs, and idempotence.
- [x] Replace Codex-only scope parsing with generic full-scope extraction.
- [x] Run Go tests/vet and build the Linux amd64 c-shared plugin.
  - Built plugin v1.1.0 with SHA-256 `1FAB1D7F68CFCBCA5D49CC359DDA190F9930715614BD911F3C2CAFC145A39A64`.
- [x] Install and activate the new artifact in the live CLIProxyAPI service.
  - CLIProxyAPI logs confirm plugin v1.1.0 loaded and registered.
- [x] Verify every formerly duplicated enriched-catalog display group is now unique, while balanced names remain clean and all slugs remain unchanged.
  - Live catalog: 104 models, 69 scoped rows, zero scope violations, and zero duplicate `display_name` groups.
- [x] Verify standard `/models` and real inference remain unaffected.
  - Standard endpoint retained `{object,data}` with 104 entries; a real `gpt-5.6-sol` Responses API call returned 200 and the expected output.
- [ ] Deliver the correction through issue/PR/release policy after live verification.

## Acceptance criteria

- All current duplicate GUI labels caused by balanced/scoped pairs are eliminated automatically.
- Future `<scope>/<model>` slugs are disambiguated without code changes.
- The complete scope shown after ` · ` exactly matches the slug segment before `/`.
- Existing fail-open and routing guarantees continue to pass.
