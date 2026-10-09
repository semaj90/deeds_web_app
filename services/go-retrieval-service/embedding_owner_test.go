package main

import (
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"strings"
	"sync/atomic"
	"testing"
)

var (
	testEmbeddingModel             = "embeddinggemma:latest"
	testEmbeddingSelectionRevision = "selection:fixture-v1"
	testEmbeddingInputPolicy       = "sha256:" + strings.Repeat("a", 64)
	testEmbeddingRepresentation    = "sha256:" + strings.Repeat("b", 64)
	testEmbeddingModelDigest       = "sha256:" + strings.Repeat("c", 64)
	testEmbeddingGGUFDigest        = "sha256:" + strings.Repeat("d", 64)
)

func qualifiedEmbeddingConfig(baseURL string) config {
	return config{
		EmbeddingDimension:                768,
		EmbeddingBaseURL:                  baseURL,
		EmbeddingRepresentation:           "semantic_768",
		EmbeddingRepresentationRevision:   testEmbeddingRepresentation,
		EmbeddingContentSelectionRevision: testEmbeddingSelectionRevision,
		EmbeddingInputPolicyRevision:      testEmbeddingInputPolicy,
		EmbedModel:                        testEmbeddingModel,
	}
}

func strictEmbeddingFixture(text string, vector []float32) map[string]any {
	inputChecksum := sha256Revision([]byte(text))
	return map[string]any{
		"schema":    "atlas.embedding-response.v2",
		"status":    "OBSERVATION_ONLY",
		"embedding": vector,
		"capability": map[string]any{
			"modelName":                 testEmbeddingModel,
			"ollamaModelDigest":         testEmbeddingModelDigest,
			"ggufArtifactDigest":        testEmbeddingGGUFDigest,
			"ggufArtifactBindingStatus": "INDEPENDENT_READBACK_VERIFIED",
			"tokenizerBindingStatus":    "INDEPENDENT_READBACK_VERIFIED",
			"dimensions":                768,
			"dtype":                     "float32-le",
			"representationRevision":    testEmbeddingRepresentation,
		},
		"receipt": map[string]any{
			"inputChecksum":             inputChecksum,
			"inputArtifactChecksum":     sha256Revision(append([]byte("atlas.query-embedding-input.v1\x00"), []byte(text)...)),
			"contentSelectionRevision":  testEmbeddingSelectionRevision,
			"inputPolicyRevision":       testEmbeddingInputPolicy,
			"representationRevision":    testEmbeddingRepresentation,
			"ollamaModelDigest":         testEmbeddingModelDigest,
			"residentModelDigestBefore": testEmbeddingModelDigest,
			"residentModelDigestAfter":  testEmbeddingModelDigest,
			"responseModelName":         testEmbeddingModel,
			"runtimeBindingStatus":      "OBSERVED_PRE_POST_RESIDENT_DIGEST_STABLE",
			"atomicPerCallModelBinding": true,
			"dimensions":                768,
			"dtype":                     "float32-le",
			"normalized":                true,
			"vectorChecksum":            vectorChecksum(vector),
		},
	}
}

func TestEmbedRejectsEmptyInputWithoutServiceCall(t *testing.T) {
	var serviceCalls atomic.Int64
	service := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
		serviceCalls.Add(1)
		w.WriteHeader(http.StatusInternalServerError)
	}))
	defer service.Close()

	srv := &retrievalServer{cfg: qualifiedEmbeddingConfig(service.URL), httpClient: service.Client()}
	if _, err := srv.embed(context.Background(), " \t\n "); err == nil || !strings.Contains(err.Error(), "embedding query is empty") {
		t.Fatalf("expected empty-query rejection, got %v", err)
	}
	if serviceCalls.Load() != 0 {
		t.Fatalf("empty query called embedding service %d times", serviceCalls.Load())
	}
}

func TestEmbedDoesNotFallbackWhenStrictServiceFails(t *testing.T) {
	var serviceCalls atomic.Int64
	var alternateCalls atomic.Int64
	service := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		serviceCalls.Add(1)
		if r.URL.Path != "/embed/v2" {
			t.Errorf("unexpected strict service path %q", r.URL.Path)
		}
		http.Error(w, "temporarily unavailable", http.StatusServiceUnavailable)
	}))
	defer service.Close()
	alternate := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
		alternateCalls.Add(1)
		w.WriteHeader(http.StatusOK)
	}))
	defer alternate.Close()

	srv := &retrievalServer{cfg: qualifiedEmbeddingConfig(service.URL), httpClient: service.Client()}
	_, err := srv.embed(context.Background(), "same logical semantic query")
	if err == nil || !strings.Contains(err.Error(), "unqualified fallbacks are disabled") {
		t.Fatalf("expected fail-closed service error, got %v", err)
	}
	if serviceCalls.Load() != 1 || alternateCalls.Load() != 0 {
		t.Fatalf("unexpected executor calls: service=%d alternate=%d", serviceCalls.Load(), alternateCalls.Load())
	}
}

func TestEmbedUsesStrictReceiptAndVerifiesQueryIdentity(t *testing.T) {
	vector := make([]float32, 768)
	vector[0] = 1
	var serviceCalls atomic.Int64
	service := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		serviceCalls.Add(1)
		if r.Method != http.MethodPost || r.URL.Path != "/embed/v2" {
			t.Errorf("unexpected service request %s %s", r.Method, r.URL.Path)
		}
		var request map[string]string
		if err := json.NewDecoder(r.Body).Decode(&request); err != nil {
			t.Errorf("decode request: %v", err)
		}
		wantChecksum := sha256Revision([]byte("query"))
		wantArtifactChecksum := sha256Revision(append([]byte("atlas.query-embedding-input.v1\x00"), []byte("query")...))
		if request["text"] != "query" || request["inputChecksum"] != wantChecksum ||
			request["inputArtifactChecksum"] != wantArtifactChecksum ||
			request["contentSelectionRevision"] != testEmbeddingSelectionRevision ||
			request["inputPolicyRevision"] != testEmbeddingInputPolicy {
			t.Errorf("unexpected strict request identity: %#v", request)
		}
		w.Header().Set("Content-Type", "application/json")
		if err := json.NewEncoder(w).Encode(strictEmbeddingFixture("query", vector)); err != nil {
			t.Errorf("encode response: %v", err)
		}
	}))
	defer service.Close()

	srv := &retrievalServer{cfg: qualifiedEmbeddingConfig(service.URL), httpClient: service.Client()}
	got, err := srv.embed(context.Background(), "query")
	if err != nil {
		t.Fatalf("strict embedding failed: %v", err)
	}
	if len(got) != 768 || got[0] != 1 || serviceCalls.Load() != 1 {
		t.Fatalf("unexpected strict result: dimensions=%d first=%v calls=%d", len(got), got[0], serviceCalls.Load())
	}
}

func TestEmbedRejectsUnprovenOrMismatchedStrictReceipt(t *testing.T) {
	tests := []struct {
		name   string
		mutate func(map[string]any)
	}{
		{
			name: "runtime not atomically bound",
			mutate: func(response map[string]any) {
				receipt := response["receipt"].(map[string]any)
				receipt["atomicPerCallModelBinding"] = false
			},
		},
		{
			name: "representation revision mismatch",
			mutate: func(response map[string]any) {
				capability := response["capability"].(map[string]any)
				capability["representationRevision"] = "sha256:" + strings.Repeat("e", 64)
			},
		},
		{
			name: "vector checksum mismatch",
			mutate: func(response map[string]any) {
				receipt := response["receipt"].(map[string]any)
				receipt["vectorChecksum"] = "sha256:" + strings.Repeat("e", 64)
			},
		},
	}

	for _, test := range tests {
		t.Run(test.name, func(t *testing.T) {
			vector := make([]float32, 768)
			vector[0] = 1
			response := strictEmbeddingFixture("query", vector)
			test.mutate(response)
			service := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
				w.Header().Set("Content-Type", "application/json")
				_ = json.NewEncoder(w).Encode(response)
			}))
			defer service.Close()

			srv := &retrievalServer{cfg: qualifiedEmbeddingConfig(service.URL), httpClient: service.Client()}
			if _, err := srv.embed(context.Background(), "query"); err == nil {
				t.Fatal("expected strict receipt rejection")
			}
		})
	}
}

func TestEmbedRequiresRevisionConfiguration(t *testing.T) {
	srv := &retrievalServer{cfg: config{EmbeddingDimension: 768}}
	if _, err := srv.embedViaService(context.Background(), "query"); err == nil || !strings.Contains(err.Error(), "expected representation revision is not configured") {
		t.Fatalf("expected missing revision error, got %v", err)
	}
}
