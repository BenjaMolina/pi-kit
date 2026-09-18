package main

import (
	"encoding/base64"
	"encoding/json"
	"testing"
)

func TestHandleMethod(t *testing.T) {
	catalog := `{"models":[{"slug":"codex-team-a/gpt-5","display_name":"GPT-5","rank":9007199254740993,"extra":{"nested":1.25}},{"slug":"codex-team-b/gpt-5","display_name":"GPT-5"},{"slug":"codex-gpt-5","display_name":"GPT-5"}]}`
	request := func(body string, source string, status int, stream bool) []byte {
		payload, err := json.Marshal(map[string]any{
			"SourceFormat": source, "StatusCode": status, "Stream": stream,
			"ResponseHeaders": map[string][]string{"X-Test": {"unchanged"}}, "Body": []byte(body),
		})
		if err != nil {
			t.Fatal(err)
		}
		return payload
	}

	tests := []struct {
		name          string
		method        string
		request       []byte
		wantOK        bool
		wantEmptyBody bool
		wantBody      string
	}{
		{name: "register declares current version", method: "plugin.register", request: []byte(`{"schema_version":6}`), wantOK: true, wantBody: `"Version":"1.1.0"`},
		{name: "reconfigure accepts schema six", method: "plugin.reconfigure", request: []byte(`{"schema_version":6}`), wantOK: true, wantBody: `"response_interceptor":true`},
		{name: "multiple scopes preserve numbers and unknown fields", method: "response.intercept_after", request: request(catalog, "openai", 200, false), wantOK: true, wantBody: `"display_name":"GPT-5 · codex-team-a"`},
		{name: "balanced model remains unchanged", method: "response.intercept_after", request: request(`{"models":[{"slug":"codex-gpt-5","display_name":"GPT-5"}]}`, "openai", 200, false), wantOK: true, wantEmptyBody: true},
		{name: "suffix is idempotent", method: "response.intercept_after", request: request(`{"models":[{"slug":"codex-team/gpt-5","display_name":"GPT-5 · codex-team"}]}`, "openai", 200, false), wantOK: true, wantEmptyBody: true},
		{name: "malformed JSON fails open", method: "response.intercept_after", request: request(`{bad`, "openai", 200, false), wantOK: true, wantEmptyBody: true},
		{name: "standard OpenAI data list fails open", method: "response.intercept_after", request: request(`{"object":"list","data":[{"id":"codex-team/gpt-5"}]}`, "openai", 200, false), wantOK: true, wantEmptyBody: true},
		{name: "inference response fails open", method: "response.intercept_after", request: request(`{"id":"chatcmpl-1","object":"chat.completion","choices":[]}`, "openai", 200, false), wantOK: true, wantEmptyBody: true},
		{name: "wrong source format fails open", method: "response.intercept_after", request: request(catalog, "anthropic", 200, false), wantOK: true, wantEmptyBody: true},
		{name: "non-success status fails open", method: "response.intercept_after", request: request(catalog, "openai", 500, false), wantOK: true, wantEmptyBody: true},
		{name: "stream fails open", method: "response.intercept_after", request: request(catalog, "openai", 200, true), wantOK: true, wantEmptyBody: true},
		{name: "mixed entries only change eligible models", method: "response.intercept_after", request: request(`{"models":[{"slug":"codex-work/gpt-5","display_name":"GPT-5","future":true},{"slug":"codex-work/no-name"},{"slug":7,"display_name":"Ignore"},{"slug":"codex-gpt-5","display_name":"GPT-5"}]}`, "openai", 200, false), wantOK: true, wantBody: `"display_name":"GPT-5 · codex-work"`},
		{name: "unknown method has structured error", method: "not.supported", request: nil, wantOK: false, wantBody: `"code":"unknown_method"`},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			raw, err := handleMethod(tt.method, tt.request)
			if err != nil {
				t.Fatalf("handleMethod: %v", err)
			}
			var envelope rpcEnvelope
			if err := json.Unmarshal(raw, &envelope); err != nil {
				t.Fatalf("decode envelope: %v", err)
			}
			if envelope.OK != tt.wantOK {
				t.Fatalf("ok = %v, want %v; raw=%s", envelope.OK, tt.wantOK, raw)
			}
			var result interceptResponse
			if envelope.OK && tt.wantEmptyBody {
				if string(envelope.Result) != `{}` {
					t.Fatalf("result = %s, want empty result", envelope.Result)
				}
			} else if envelope.OK {
				if err := json.Unmarshal(envelope.Result, &result); err != nil {
					t.Fatalf("decode result: %v", err)
				}
			}
			observed := string(raw)
			if len(result.Body) > 0 {
				observed = string(result.Body)
			}
			if tt.wantBody != "" && !contains(observed, tt.wantBody) {
				t.Fatalf("response %s does not contain %s", observed, tt.wantBody)
			}
			if tt.name == "multiple scopes preserve numbers and unknown fields" {
				if !contains(observed, `"rank":9007199254740993`) || !contains(observed, `"nested":1.25`) {
					t.Fatalf("catalog metadata was not preserved: %s", observed)
				}
			}
		})
	}
}

func TestScopedSlugsUseCompletePrefixBeforeFirstSlash(t *testing.T) {
	request := func(body string) []byte {
		payload, err := json.Marshal(map[string]any{
			"SourceFormat": "openai", "StatusCode": 200, "Body": []byte(body),
		})
		if err != nil {
			t.Fatal(err)
		}
		return payload
	}

	t.Run("any nonblank scope is appended in full", func(t *testing.T) {
		raw, err := handleMethod("response.intercept_after", request(`{"models":[{"slug":"claude-gedo/claude-fable-5","display_name":"Claude Fable 5"},{"slug":"agy-bmolina/gemini-3.8-flash-high","display_name":"Gemini 3.8 Flash High"},{"slug":"codex-jhoel/gpt-5.6-sol","display_name":"GPT-5.6 Sol"},{"slug":"team/model/variant","display_name":"Nested"}]}`))
		if err != nil {
			t.Fatalf("handleMethod: %v", err)
		}
		var envelope rpcEnvelope
		if err := json.Unmarshal(raw, &envelope); err != nil {
			t.Fatalf("decode envelope: %v", err)
		}
		var response interceptResponse
		if err := json.Unmarshal(envelope.Result, &response); err != nil {
			t.Fatalf("decode result: %v", err)
		}
		for _, want := range []string{
			`"display_name":"Claude Fable 5 · claude-gedo"`,
			`"display_name":"Gemini 3.8 Flash High · agy-bmolina"`,
			`"display_name":"GPT-5.6 Sol · codex-jhoel"`,
			`"display_name":"Nested · team"`,
		} {
			if !contains(string(response.Body), want) {
				t.Fatalf("response %s does not contain %s", response.Body, want)
			}
		}
	})

	t.Run("balanced and malformed slugs fail open", func(t *testing.T) {
		raw, err := handleMethod("response.intercept_after", request(`{"models":[{"slug":"codex-gpt-5","display_name":"Balanced"},{"slug":"/model","display_name":"Blank scope"},{"slug":"  /model","display_name":"Whitespace scope"},{"slug":"scope/","display_name":"Blank model"},{"slug":"scope/  ","display_name":"Whitespace model"}]}`))
		if err != nil {
			t.Fatalf("handleMethod: %v", err)
		}
		var envelope rpcEnvelope
		if err := json.Unmarshal(raw, &envelope); err != nil {
			t.Fatalf("decode envelope: %v", err)
		}
		if string(envelope.Result) != `{}` {
			t.Fatalf("result = %s, want empty result", envelope.Result)
		}
	})

	t.Run("complete scope suffix is idempotent", func(t *testing.T) {
		raw, err := handleMethod("response.intercept_after", request(`{"models":[{"slug":"claude-gedo/claude-fable-5","display_name":"Claude Fable 5 · claude-gedo"}]}`))
		if err != nil {
			t.Fatalf("handleMethod: %v", err)
		}
		var envelope rpcEnvelope
		if err := json.Unmarshal(raw, &envelope); err != nil {
			t.Fatalf("decode envelope: %v", err)
		}
		if string(envelope.Result) != `{}` {
			t.Fatalf("result = %s, want empty result", envelope.Result)
		}
	})
}

func TestResponseRequestUsesGoJSONByteAndHeaderSemantics(t *testing.T) {
	body := []byte(`{"models":[{"slug":"codex-scope/model","display_name":"Model"}]}`)
	raw := []byte(`{"SourceFormat":"openai","StatusCode":200,"Stream":false,"ResponseHeaders":{"X-Rate-Limit":["1"]},"Body":"` + base64.StdEncoding.EncodeToString(body) + `"}`)
	result, err := handleMethod("response.intercept_after", raw)
	if err != nil {
		t.Fatal(err)
	}
	var envelope rpcEnvelope
	if err := json.Unmarshal(result, &envelope); err != nil {
		t.Fatal(err)
	}
	var response interceptResponse
	if err := json.Unmarshal(envelope.Result, &response); err != nil {
		t.Fatal(err)
	}
	if !contains(string(response.Body), `"display_name":"Model · codex-scope"`) {
		t.Fatalf("response = %s", response.Body)
	}
}
