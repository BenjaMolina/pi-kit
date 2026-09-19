package main

import (
	"encoding/json"
	"testing"
)

func TestLifecycleAndSchemaGuard(t *testing.T) {
	tests := []struct {
		name       string
		method     string
		request    []byte
		wantError  bool
		wantResult string
	}{
		{name: "register declares request normalizer", method: "plugin.register", request: []byte(`{"schema_version":6}`), wantResult: `"request_normalizer":true`},
		{name: "reconfigure accepts newer schema", method: "plugin.reconfigure", request: []byte(`{"schema_version":7}`), wantResult: `"Name":"codex-antigravity-responses-repair"`},
		{name: "schema five is rejected", method: "plugin.register", request: []byte(`{"schema_version":5}`), wantError: true},
		{name: "malformed lifecycle is rejected", method: "plugin.reconfigure", request: []byte(`{`), wantError: true},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			raw, err := handleMethod(tt.method, tt.request)
			if (err != nil) != tt.wantError {
				t.Fatalf("handleMethod error = %v, wantError %v", err, tt.wantError)
			}
			if tt.wantError {
				return
			}
			if !contains(string(raw), tt.wantResult) {
				t.Fatalf("response %s does not contain %s", raw, tt.wantResult)
			}
		})
	}
}

func TestRequestNormalization(t *testing.T) {
	identityOne := "You are Codex, an AI coding agent based on GPT-5."
	identityTwo := "You are Codex, OpenAI's coding agent."
	body := func(systemParts []string, userText string) string {
		parts := make([]map[string]string, len(systemParts))
		for index, text := range systemParts {
			parts[index] = map[string]string{"text": text}
		}
		payload := map[string]any{
			"request": map[string]any{
				"systemInstruction": map[string]any{"parts": parts},
				"contents": []any{
					map[string]any{"role": "user", "parts": []any{map[string]string{"text": userText}}},
					map[string]any{"role": "model", "parts": []any{map[string]string{"text": identityTwo}}},
				},
				"tools": []any{map[string]any{"functionDeclarations": []any{map[string]string{"description": identityOne}}}},
			},
		}
		raw, err := json.Marshal(payload)
		if err != nil {
			t.Fatal(err)
		}
		return string(raw)
	}
	request := func(body, from, to, model string) []byte {
		raw, err := json.Marshal(map[string]any{"FromFormat": from, "ToFormat": to, "Model": model, "Body": []byte(body)})
		if err != nil {
			t.Fatal(err)
		}
		return raw
	}

	tests := []struct {
		name          string
		request       []byte
		wantChanged   bool
		wantFragments []string
	}{
		{name: "known Codex GPT five identity", request: request(body([]string{identityOne}, "ordinary user text"), "openai-response", "antigravity", "gemini-3-pro"), wantChanged: true, wantFragments: []string{"You are Codex; an AI coding agent based on GPT-5.", "ordinary user text", identityOne}},
		{name: "known Codex OpenAI identity", request: request(body([]string{identityTwo}, "ordinary user text"), "OPENAI-RESPONSE", "ANTIGRAVITY", "GEMINI-2.5-PRO"), wantChanged: true, wantFragments: []string{"You are Codex; OpenAI's coding agent."}},
		{name: "multiple system parts", request: request(body([]string{"unchanged", identityOne, identityTwo}, "ordinary user text"), "openai-response", "antigravity", "gemini"), wantChanged: true, wantFragments: []string{"You are Codex; an AI coding agent based on GPT-5.", "You are Codex; OpenAI's coding agent."}},
		{name: "non Gemini model fails open", request: request(body([]string{identityOne}, "ordinary user text"), "openai-response", "antigravity", "gpt-5"), wantChanged: false},
		{name: "wrong source format fails open", request: request(body([]string{identityOne}, "ordinary user text"), "openai-chat", "antigravity", "gemini"), wantChanged: false},
		{name: "wrong target format fails open", request: request(body([]string{identityOne}, "ordinary user text"), "openai-response", "vertex", "gemini"), wantChanged: false},
		{name: "user content only fails open", request: request(body([]string{"ordinary system instruction"}, identityOne), "openai-response", "antigravity", "gemini"), wantChanged: false},
		{name: "malformed JSON fails open", request: request(`{"request":`, "openai-response", "antigravity", "gemini"), wantChanged: false},
		{name: "missing request fails open", request: request(`{}`, "openai-response", "antigravity", "gemini"), wantChanged: false},
		{name: "missing system instruction fails open", request: request(`{"request":{}}`, "openai-response", "antigravity", "gemini"), wantChanged: false},
		{name: "missing parts fails open", request: request(`{"request":{"systemInstruction":{}}}`, "openai-response", "antigravity", "gemini"), wantChanged: false},
		{name: "no identity match fails open", request: request(body([]string{"You are another agent,"}, "ordinary user text"), "openai-response", "antigravity", "gemini"), wantChanged: false},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			result := normalizeResult(t, tt.request)
			if tt.wantChanged != (len(result.Body) > 0) {
				t.Fatalf("body replacement = %q, want changed %v", result.Body, tt.wantChanged)
			}
			for _, fragment := range tt.wantFragments {
				if !contains(string(result.Body), fragment) {
					t.Fatalf("replacement %s does not contain %q", result.Body, fragment)
				}
			}
		})
	}
}

func TestNormalizationIsIdempotent(t *testing.T) {
	body := `{"request":{"systemInstruction":{"parts":[{"text":"You are Codex, an AI coding agent based on GPT-5."}]}}}`
	raw, err := json.Marshal(map[string]any{"FromFormat": "openai-response", "ToFormat": "antigravity", "Model": "gemini-3-pro", "Body": []byte(body)})
	if err != nil {
		t.Fatal(err)
	}
	first := normalizeResult(t, raw)
	if len(first.Body) == 0 {
		t.Fatal("first normalization did not replace the body")
	}
	secondRaw, err := json.Marshal(map[string]any{"FromFormat": "openai-response", "ToFormat": "antigravity", "Model": "gemini-3-pro", "Body": first.Body})
	if err != nil {
		t.Fatal(err)
	}
	second := normalizeResult(t, secondRaw)
	if len(second.Body) != 0 {
		t.Fatalf("idempotent normalization returned replacement %s", second.Body)
	}
}

func normalizeResult(t *testing.T, raw []byte) normalizeResponse {
	t.Helper()
	response, err := handleMethod("request.normalize", raw)
	if err != nil {
		t.Fatalf("handleMethod: %v", err)
	}
	var envelope rpcEnvelope
	if err := json.Unmarshal(response, &envelope); err != nil {
		t.Fatalf("decode envelope: %v", err)
	}
	if !envelope.OK {
		t.Fatalf("normalization failed: %s", response)
	}
	if string(envelope.Result) == `{}` {
		return normalizeResponse{}
	}
	var result normalizeResponse
	if err := json.Unmarshal(envelope.Result, &result); err != nil {
		t.Fatalf("decode normalization result: %v", err)
	}
	return result
}
