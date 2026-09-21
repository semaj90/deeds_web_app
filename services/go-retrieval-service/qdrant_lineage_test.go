package main

import "testing"

func TestApplyCanonicalChunkLineageRequiresProvenFields(t *testing.T) {
	chunk := qdrantChunk{ID: "qdrant-1"}
	lineage := classifyCanonicalChunkLineage(canonicalChunkLineage{
		QdrantID:               "qdrant-1",
		ChunkID:                "chunk-row-1",
		PacketKey:              "packet-1",
		CanonicalChunkID:       "canonical-chunk-1",
		SourceRef:              "repo/src/file.ts",
		ContentHash:            "sha256:content",
		WorkspaceRevision:      "sha256:workspace",
		SourceRevision:         "sha256:source",
		RepresentationRevision: "semantic-768-v1",
		RevisionStatus:         "PROVEN",
		BindingCount:           1,
	})
	applyCanonicalChunkLineage(&chunk, lineage)

	if chunk.CanonicalLineageStatus != "QUALIFIED" || chunk.CandidateID != "canonical-chunk-1" || chunk.SourceRef != "repo/src/file.ts" || chunk.SourceRevision != "sha256:source" {
		t.Fatalf("canonical bridge was not applied: %#v", chunk)
	}
	if chunk.PacketKey != "packet-1" {
		t.Fatalf("qualified packet key = %q, want packet-1", chunk.PacketKey)
	}
}

func TestApplyCanonicalChunkLineageDoesNotInventFromProjectionID(t *testing.T) {
	chunk := qdrantChunk{ID: "qdrant-1"}
	lineage := classifyCanonicalChunkLineage(canonicalChunkLineage{QdrantID: "qdrant-1"})
	applyCanonicalChunkLineage(&chunk, lineage)
	if chunk.CandidateID != "" || chunk.SourceRevision != "" || chunk.WorkspaceRevision != "" || chunk.CanonicalLineageReason != "NO_PROVEN_LINEAGE" {
		t.Fatalf("projection id was promoted without an explicit bridge: %#v", chunk)
	}
}
