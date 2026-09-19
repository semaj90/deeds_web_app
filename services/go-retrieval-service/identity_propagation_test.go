package main

import "testing"

func TestCodebaseResponsePreservesCanonicalIdentityMetadata(t *testing.T) {
	result := buildCodebaseSearchChunkResult(qdrantChunk{
		ID:                     "qdrant-point-42",
		FilePath:               "src/example.ts",
		ChunkIndex:             7,
		PacketKey:              "packet-42",
		SourceRef:              "src/example.ts#chunk-7",
		WorkspaceRevision:      "sha256:workspace-revision",
		SourceRevision:         "sha256:source-revision",
		RepresentationID:       "semantic_768",
		RepresentationRevision: "semantic-768-v1",
		ContentHash:            "sha256:content",
		CandidateID:            "chunk-42",
	})

	if result == nil || result.GetSourceMetadata() == nil {
		t.Fatal("expected a response with source metadata")
	}

	metadata := result.GetSourceMetadata().GetMetadata()
	wants := map[string]string{
		"packet_key":              "packet-42",
		"source_ref":              "src/example.ts#chunk-7",
		"workspace_revision":      "sha256:workspace-revision",
		"source_revision":         "sha256:source-revision",
		"representation_id":       "semantic_768",
		"representation_revision": "semantic-768-v1",
		"content_hash":            "sha256:content",
		"candidate_id":            "chunk-42",
	}
	for key, want := range wants {
		if got := metadata[key]; got != want {
			t.Fatalf("metadata[%q] = %q, want %q", key, got, want)
		}
	}

	if metadata["packet_key"] == result.GetId() {
		t.Fatal("packet identity must not fall back to the projection identifier")
	}
}
