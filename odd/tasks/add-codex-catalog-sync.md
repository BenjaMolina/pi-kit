# Add Codex catalog synchronization

## Goal

Give scoped CLIProxyAPI models unique display names in Codex graphical model pickers while preserving their real slugs, routing, provider configuration, and user-selected defaults.

## Delivery decision (pivoted after probing)

- `model_catalog_json` was probed against Codex 0.144.0/0.155.0: it is an authoritative full-catalog replacement, not a slug overlay. A partial generated catalog is unsafe and `pi-kit-codex sync` over `model_catalog_json` is **NO-GO**.
- CLIProxyAPI's existing alias mechanisms change public IDs/routing and are also unsuitable.
- Chosen path: a standalone CLIProxyAPI `response_interceptor` plugin that rewrites only enriched catalog `display_name` values, living in pi-kit so the CLIProxyAPI fork stays conflict-free on upstream syncs.

## Naming contract

- Balanced slug keeps its clean name, e.g. `GPT 5.6 Sol`.
- Scoped slugs get ` · <scope>`, e.g. `GPT 5.6 Sol · jhoel`, derived from `codex-<scope>/<model>`.
- Slugs, routing, inference bodies, headers, credentials, and all other catalog fields remain untouched; non-catalog responses fail open byte-identical.

## Tasks

- [x] Probe `model_catalog_json` behavior in isolated Codex 0.144.0 and 0.155.0 homes.
  - Official Codex source confirms full-replacement semantics; partial alias sync rejected.
- [x] Define the catalog contract, delivery path, and fail-closed conditions.
  - Standalone response-interceptor plugin in pi-kit; fail-open on any non-enriched-catalog response.
- [x] Implement the plugin with behavior-first Go tests.
  - `profiles/cliproxyapi/plugins/codex-catalog-display-name/` (ABI v1, schema v6, response_interceptor only).
  - Independently verified: registration, fail-open, slug/routing preservation, numeric metadata preservation, idempotence, no secret logging, ELF x86-64 exports, Docker Linux amd64 build, safe installer.
- [x] Add routing regressions against the live host.
  - Plugin enabled in the Docker CLIProxyAPI (config backup created), container restarted, plugin loaded.
  - Enriched catalog: scoped names now carry ` · <scope>` with clean UTF-8 U+00B7; balanced model unchanged; slug set unchanged.
  - Standard `{object,data}` model list unchanged (fail-open) and real `/v1/responses` inference returned 200 with expected content and no catalog contamination.
- [x] Verify unique labels in the actual VS Code/Codex App pickers after a full reload.
  - User-provided screenshots confirm scoped labels in both surfaces, including `GPT 5.6 Sol · jhoel`, `· asher`, `· sadier`, and `· turki`.
  - The balanced entry remains `GPT 5.6 Sol`, and the active default remains `GPT 5.6 Sol Medium`.
- [ ] Document, commit, and deliver the pi-kit change through the repository flow (issue/PR; release optional).

## Acceptance criteria

- Scoped catalog entries show unique display names in Codex GUI pickers; balanced entries stay clean.
- CLI keeps showing real prefixed slugs; routing and inference are unchanged.
- Rollback path exists and was recorded (config backup + plugin disable/restart + `.so` removal).

## Non-goals

- No Codex `model_catalog_json` generation.
- No CLIProxyAPI core modifications, fork patches, sidecars, or routing changes.
- No hiding scoped variants; display names only.
