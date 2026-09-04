package main

import "testing"

func TestResolveRepresentationDefaultsToSemantic768WhenUnset(t *testing.T) {
	id, entry, reason := resolveRepresentation("")
	if id != "semantic_768" {
		t.Fatalf("expected semantic_768, got %q", id)
	}
	if entry.dimension != 768 {
		t.Fatalf("expected dimension 768, got %d", entry.dimension)
	}
	if reason != "" {
		t.Fatalf("expected no fallback reason for the default representation, got %q", reason)
	}
}

func TestResolveRepresentationHonorsExplicitSemantic768(t *testing.T) {
	id, _, reason := resolveRepresentation("semantic_768")
	if id != "semantic_768" || reason != "" {
		t.Fatalf("expected clean semantic_768 resolution, got id=%q reason=%q", id, reason)
	}
}

func TestResolveRepresentationFallsBackExplicitlyForUnknownRepresentation(t *testing.T) {
	id, _, reason := resolveRepresentation("does_not_exist")
	if id != defaultRepresentationID {
		t.Fatalf("expected fallback to %q, got %q", defaultRepresentationID, id)
	}
	if reason == "" {
		t.Fatal("expected a non-empty fallback reason for an unknown representation, got none — this is the exact silent-substitution bug this gate closes")
	}
	if reason != "REPRESENTATION_UNKNOWN:does_not_exist" {
		t.Fatalf("unexpected fallback reason: %q", reason)
	}
}

func TestResolveRepresentationFallsBackExplicitlyForNotYetQueryExecutable(t *testing.T) {
	// latent_256 is registered (real, live Qdrant collection) but has no query-side encoder yet
	// (LATENT256-QUERY-ENCODER-01, blocked). Requesting it must not silently serve semantic_768
	// results labeled as if they were latent_256.
	id, _, reason := resolveRepresentation("latent_256")
	if id != defaultRepresentationID {
		t.Fatalf("expected fallback to %q, got %q", defaultRepresentationID, id)
	}
	if reason != "REPRESENTATION_NOT_QUERY_EXECUTABLE:latent_256" {
		t.Fatalf("unexpected fallback reason: %q", reason)
	}
}

func TestRepresentationRegistryLatent256EntryMatchesLiveContract(t *testing.T) {
	// Regression guard against silently drifting from LATENT256-REPRESENTATION-CONTRACT-02's
	// frozen family (parent-atlas-retrieval-lineage-dag-convergence): latent_256 is 256-dim,
	// physical, real Qdrant collection codebase_chunks_latent256 — not a placeholder name.
	entry, ok := representationRegistry["latent_256"]
	if !ok {
		t.Fatal("latent_256 must be a registered representation, even though it is not yet query-executable")
	}
	if entry.dimension != 256 {
		t.Fatalf("expected latent_256 dimension 256, got %d", entry.dimension)
	}
	if entry.collection != "codebase_chunks_latent256" {
		t.Fatalf("expected collection codebase_chunks_latent256, got %q", entry.collection)
	}
	if entry.queryEncoder {
		t.Fatal("latent_256.queryEncoder must stay false until LATENT256-QUERY-ENCODER-01 closes — flipping this silently would make resolveRepresentation start serving unproven query-time encoding")
	}
}
