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
	pluginID      = "codex-antigravity-responses-repair"
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
	RequestNormalizer bool `json:"request_normalizer"`
}

// The names match CLIProxyAPI's RequestNormalizeRequest serialization. []byte
// uses Go JSON's base64 semantics; unknown request fields remain untouched.
type normalizeRequest struct {
	FromFormat string
	ToFormat   string
	Model      string
	Body       []byte
}

type normalizeResponse struct {
	Body []byte
}

func handleMethod(method string, request []byte) ([]byte, error) {
	switch method {
	case "plugin.register", "plugin.reconfigure":
		if err := validateLifecycleRequest(request); err != nil {
			return nil, err
		}
		return okEnvelope(pluginRegistration())
	case "request.normalize":
		return normalize(request)
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
			Name: pluginID, Version: "1.0.1", Author: "pi-kit",
			GitHubRepository: "https://github.com/benjamolina/pi-kit", ConfigFields: []any{},
		},
		Capabilities: capabilities{RequestNormalizer: true},
	}
}

func normalize(raw []byte) ([]byte, error) {
	var request normalizeRequest
	if err := json.Unmarshal(raw, &request); err != nil {
		return okEnvelope(struct{}{})
	}
	if !matchesTarget(request) {
		return okEnvelope(struct{}{})
	}
	body, changed := rewriteSystemInstruction(request.Body)
	if !changed {
		return okEnvelope(struct{}{})
	}
	return okEnvelope(normalizeResponse{Body: body})
}

func matchesTarget(request normalizeRequest) bool {
	return strings.EqualFold(request.FromFormat, "openai-response") &&
		strings.EqualFold(request.ToFormat, "antigravity")
}

// rewriteSystemInstruction changes exact Codex identity fragments only in
// request.systemInstruction.parts[*].text. It preserves all other raw JSON
// values and fails open unless the complete body is one JSON object.
func rewriteSystemInstruction(body []byte) ([]byte, bool) {
	decoder := json.NewDecoder(bytes.NewReader(body))
	decoder.UseNumber()
	var root map[string]json.RawMessage
	if decoder.Decode(&root) != nil || !decoderFinished(decoder) {
		return nil, false
	}
	requestRaw, exists := root["request"]
	if !exists {
		return nil, false
	}
	var request map[string]json.RawMessage
	if json.Unmarshal(requestRaw, &request) != nil {
		return nil, false
	}
	systemInstructionRaw, exists := request["systemInstruction"]
	if !exists {
		return nil, false
	}
	var systemInstruction map[string]json.RawMessage
	if json.Unmarshal(systemInstructionRaw, &systemInstruction) != nil {
		return nil, false
	}
	partsRaw, exists := systemInstruction["parts"]
	if !exists {
		return nil, false
	}
	var parts []json.RawMessage
	if json.Unmarshal(partsRaw, &parts) != nil {
		return nil, false
	}

	changed := false
	for index, rawPart := range parts {
		part, partChanged := rewriteSystemPart(rawPart)
		if partChanged {
			parts[index] = part
			changed = true
		}
	}
	if !changed {
		return nil, false
	}
	encodedParts, err := json.Marshal(parts)
	if err != nil {
		return nil, false
	}
	systemInstruction["parts"] = encodedParts
	encodedSystemInstruction, err := json.Marshal(systemInstruction)
	if err != nil {
		return nil, false
	}
	request["systemInstruction"] = encodedSystemInstruction
	encodedRequest, err := json.Marshal(request)
	if err != nil {
		return nil, false
	}
	root["request"] = encodedRequest
	result, err := json.Marshal(root)
	if err != nil {
		return nil, false
	}
	return result, true
}

func rewriteSystemPart(raw json.RawMessage) (json.RawMessage, bool) {
	var part map[string]json.RawMessage
	if json.Unmarshal(raw, &part) != nil {
		return raw, false
	}
	var text string
	if json.Unmarshal(part["text"], &text) != nil || !strings.Contains(text, "You are Codex,") {
		return raw, false
	}
	encodedText, err := json.Marshal(strings.ReplaceAll(text, "You are Codex,", "You are Codex;"))
	if err != nil {
		return raw, false
	}
	part["text"] = encodedText
	result, err := json.Marshal(part)
	if err != nil {
		return raw, false
	}
	return result, true
}

func decoderFinished(decoder *json.Decoder) bool {
	var extra any
	return decoder.Decode(&extra) == io.EOF
}

func okEnvelope(value any) ([]byte, error) {
	result, err := json.Marshal(value)
	if err != nil {
		return nil, err
	}
	return json.Marshal(rpcEnvelope{OK: true, Result: result})
}

func contains(value, fragment string) bool { return strings.Contains(value, fragment) }

func errorEnvelope(code, message string) []byte {
	result, err := json.Marshal(rpcEnvelope{OK: false, Error: &rpcError{Code: code, Message: message}})
	if err != nil {
		return []byte(`{"ok":false,"error":{"code":"plugin_error","message":"response encoding failed"}}`)
	}
	return result
}
