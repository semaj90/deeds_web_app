package main

import (
	"crypto/sha256"
	"fmt"
	"testing"
)

func TestLexicalEnvelopeQueryChecksumAndMetadata(t *testing.T) {
	query := "postgres retrieval lexical"
	wantChecksum := fmt.Sprintf("sha256:%x", sha256.Sum256([]byte(query)))
	if wantChecksum == "" {
		t.Fatal("query checksum unexpectedly empty")
	}
	result := map[string]any{
		"score_type": "PG_TS_RANK_CD", "scorer_revision": "postgres-18-ts-rank-cd-v1",
		"text_search_config": "english", "rank": 1, "candidate_count": 3,
	}
	if result["score_type"] != "PG_TS_RANK_CD" || result["scorer_revision"] != "postgres-18-ts-rank-cd-v1" {
		t.Fatalf("unexpected scorer metadata: %#v", result)
	}
	if result["text_search_config"] != "english" || result["rank"] != 1 || result["candidate_count"] != 3 {
		t.Fatalf("incomplete lexical envelope: %#v", result)
	}
}
