package main

import (
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"
)

func TestResolveRepresentationEG2(t *testing.T) {
	id, entry, reason := resolveRepresentation("embeddinggemma2_768")
	if id != "embeddinggemma2_768" || !entry.queryEncoder || entry.dimension != 768 || reason != "" {
		t.Fatalf("unexpected EG2 resolution: id=%s entry=%+v reason=%s", id, entry, reason)
	}

	id2, entry2, reason2 := resolveRepresentation("embeddinggemma2-trt-rtx-code-retrieval-doc-v1")
	if id2 != "embeddinggemma2-trt-rtx-code-retrieval-doc-v1" || !entry2.queryEncoder || reason2 != "" {
		t.Fatalf("unexpected EG2 TRT-RTX resolution: id=%s entry=%+v reason=%s", id2, entry2, reason2)
	}
}

func TestEmbedEG2(t *testing.T) {
	vec768 := make([]float32, 768)
	for i := range vec768 {
		vec768[i] = 0.01
	}
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path != "/embed" || r.Method != http.MethodPost {
			t.Fatalf("unexpected request: %s %s", r.Method, r.URL.Path)
		}
		var body struct {
			Texts []string `json:"texts"`
		}
		if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
			t.Fatalf("decode request: %v", err)
		}
		if len(body.Texts) != 1 || body.Texts[0] != "task: code retrieval | query: search runtime" {
			t.Fatalf("expected EG2 code retrieval prefix, got %+v", body.Texts)
		}
		_ = json.NewEncoder(w).Encode(map[string]any{
			"embeddings": map[string]any{
				"768": [][]float32{vec768},
			},
		})
	}))
	defer srv.Close()

	s := &retrievalServer{
		cfg: config{
			EG2EmbedServiceURL: srv.URL,
		},
		httpClient: srv.Client(),
	}
	got, err := s.embedEG2(context.Background(), "search runtime")
	if err != nil {
		t.Fatalf("embedEG2 failed: %v", err)
	}
	if len(got) != 768 {
		t.Fatalf("expected 768 dims, got %d", len(got))
	}
}
