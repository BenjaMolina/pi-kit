package main

import (
	"bytes"
	"encoding/json"
	"fmt"
	"io"
	"strings"
)

const (
	schemaVersion = 6
	pluginID      = "codex-catalog-display-name"
)

type rpcEnvelope struct {
	OK     bool            `json:"ok"`
	Result json.RawMessage `json:"result,omitempty"`
	Error  *rpcError       `json:"error,omitempty"`
}

type rpcError struct {
	Code    string `json:"code"`
	Message string `json:"message"`
}

type lifecycleRequest struct {
	ConfigYAML    []byte `json:"config_yaml"`
	SchemaVersion uint32 `json:"schema_version"`
}

type registration struct {
	SchemaVersion uint32       `json:"schema_version"`
	Metadata      metadata     `json:"metadata"`
	Capabilities  capabilities `json:"capabilities"`
}

type metadata struct {
	Name             string `json:"Name"`
	Version          string `json:"Version"`
	Author           string `json:"Author"`
	GitHubRepository string `json:"GitHubRepository"`
	Logo             string `json:"Logo"`
	ConfigFields     []any  `json:"ConfigFields"`
}

type capabilities struct {
	ResponseInterceptor bool `json:"response_interceptor"`
}

// The names match CLIProxyAPI's ResponseInterceptRequest serialization. []byte
// uses Go JSON's base64 semantics; headers use map[string][]string semantics.
type interceptRequest struct {
	SourceFormat    string
	Stream          bool
	ResponseHeaders map[string][]string
	Body            []byte
	StatusCode      int
}

type interceptResponse struct {
	Headers      map[string][]string
	Body         []byte
	ClearHeaders []string
}

func handleMethod(method string, request []byte) ([]byte, error) {
	switch method {
	case "plugin.register", "plugin.reconfigure":
		if err := validateLifecycleRequest(request); err != nil {
			return nil, err
		}
		return okEnvelope(pluginRegistration())
	case "response.intercept_after":
		return interceptAfter(request)
	default:
		return errorEnvelope("unknown_method", "unsupported plugin method"), nil
	}
}

func validateLifecycleRequest(raw []byte) error {
	var request lifecycleRequest
	if len(raw) == 0 || json.Unmarshal(raw, &request) != nil {
		return fmt.Errorf("invalid lifecycle request")
	}
	if request.SchemaVersion < schemaVersion {
		return fmt.Errorf("CLIProxyAPI schema version 6 or newer is required")
	}
	return nil
}

func pluginRegistration() registration {
	return registration{
		SchemaVersion: schemaVersion,
		Metadata: metadata{
			Name: pluginID, Version: "1.1.0", Author: "pi-kit",
			GitHubRepository: "https://github.com/benjamolina/pi-kit", ConfigFields: []any{},
		},
		Capabilities: capabilities{ResponseInterceptor: true},
	}
}

func interceptAfter(raw []byte) ([]byte, error) {
	var request interceptRequest
	if err := json.Unmarshal(raw, &request); err != nil {
		return nil, fmt.Errorf("invalid response interceptor request")
	}
	if request.SourceFormat != "openai" || request.StatusCode != 200 || request.Stream {
		return okEnvelope(struct{}{})
	}
	body, changed := rewriteCatalog(request.Body)
	if !changed {
		return okEnvelope(struct{}{})
	}
	return okEnvelope(interceptResponse{Body: body})
}

// rewriteCatalog requires a root object with a models array. Raw values are
// retained until an eligible display name is changed, preserving numeric tokens
// and unknown metadata without ever inspecting or logging request credentials.
func rewriteCatalog(body []byte) ([]byte, bool) {
	decoder := json.NewDecoder(bytes.NewReader(body))
	decoder.UseNumber()
	var root map[string]json.RawMessage
	if decoder.Decode(&root) != nil || !decoderFinished(decoder) {
		return nil, false
	}
	modelsRaw, exists := root["models"]
	if !exists {
		return nil, false
	}
	var models []json.RawMessage
	if json.Unmarshal(modelsRaw, &models) != nil {
		return nil, false
	}

	changed := false
	for index, rawModel := range models {
		model, modelChanged := rewriteModel(rawModel)
		if modelChanged {
			models[index] = model
			changed = true
		}
	}
	if !changed {
		return nil, false
	}
	encodedModels, err := json.Marshal(models)
	if err != nil {
		return nil, false
	}
	root["models"] = encodedModels
	result, err := json.Marshal(root)
	if err != nil {
		return nil, false
	}
	return result, true
}

func decoderFinished(decoder *json.Decoder) bool {
	var extra any
	return decoder.Decode(&extra) == io.EOF
}

func rewriteModel(raw json.RawMessage) (json.RawMessage, bool) {
	var fields map[string]json.RawMessage
	if json.Unmarshal(raw, &fields) != nil {
		return raw, false
	}
	var slug, displayName string
	if json.Unmarshal(fields["slug"], &slug) != nil || json.Unmarshal(fields["display_name"], &displayName) != nil {
		return raw, false
	}
	scope, ok := scopedSlug(slug)
	if !ok || displayName == "" || strings.HasSuffix(displayName, " · "+scope) {
		return raw, false
	}
	name, err := json.Marshal(displayName + " · " + scope)
	if err != nil {
		return raw, false
	}
	fields["display_name"] = name
	result, err := json.Marshal(fields)
	if err != nil {
		return raw, false
	}
	return result, true
}

// scopedSlug extracts the complete nonblank prefix before the first slash from
// a structurally valid <scope>/<model> slug. Provider naming is deliberately
// not interpreted so every scoped catalog entry can be disambiguated.
func scopedSlug(slug string) (string, bool) {
	separator := strings.IndexByte(slug, '/')
	if separator <= 0 || separator == len(slug)-1 {
		return "", false
	}
	scope, model := slug[:separator], slug[separator+1:]
	if strings.TrimSpace(scope) == "" || strings.TrimSpace(model) == "" {
		return "", false
	}
	return scope, true
}

func okEnvelope(value any) ([]byte, error) {
	result, err := json.Marshal(value)
	if err != nil {
		return nil, err
	}
	return json.Marshal(rpcEnvelope{OK: true, Result: result})
}

func errorEnvelope(code, message string) []byte {
	result, err := json.Marshal(rpcEnvelope{OK: false, Error: &rpcError{Code: code, Message: message}})
	if err != nil {
		return []byte(`{"ok":false,"error":{"code":"plugin_error","message":"response encoding failed"}}`)
	}
	return result
}

func contains(value, fragment string) bool { return strings.Contains(value, fragment) }
