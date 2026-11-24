package main

import (
	"encoding/json"
	"strings"
	"testing"
)

func TestBuildCodebaseStageTrace(t *testing.T) {
	trace := buildCodebaseStageTrace("codebase_chunks_768", "content", 3, false)
	if trace.QdrantCollection != "codebase_chunks_768" {
		t.Fatalf("unexpected collection: %s", trace.QdrantCollection)
	}
	if len(trace.DensePrefetchVectors) != 2 || trace.DensePrefetchVectors[0] != "content" || trace.DensePrefetchVectors[1] != "signature" {
		t.Fatalf("unexpected prefetch vectors: %+v", trace.DensePrefetchVectors)
	}
	if trace.QdrantBM25BranchActive {
		t.Fatal("expected QdrantBM25BranchActive=false")
	}
	if !trace.RRFUsed {
		t.Fatal("expected RRFUsed=true")
	}
	if trace.PGReconciledCount != 3 || trace.GraphExpansionCount != 0 {
		t.Fatalf("unexpected counts: %+v", trace)
	}

	raw, err := json.Marshal(trace)
	if err != nil {
		t.Fatalf("marshal error: %v", err)
	}
	if strings.Contains(string(raw), "embedding") || strings.Contains(string(raw), "query_text") {
		t.Fatalf("sensitive field leaked in trace: %s", string(raw))
	}
}

func TestBuildCodebasePrefetchQueries(t *testing.T) {
	vec := []float32{0.1, 0.2}
	denseOnly := buildCodebasePrefetchQueries("content", "signature", vec, "drizzle schema", false, 30)
	if len(denseOnly) != 2 {
		t.Fatalf("expected 2 prefetches when bm25 disabled, got %d", len(denseOnly))
	}
	withBM25 := buildCodebasePrefetchQueries("content", "signature", vec, "drizzle schema", true, 30)
	if len(withBM25) != 3 || withBM25[2].GetUsing() != "code_text" {
		t.Fatalf("expected 3rd code_text BM25 prefetch when enabled, got %+v", withBM25)
	}
}
