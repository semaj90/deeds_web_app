package main

import "testing"

func TestBuildCodebaseTagFiltersUsesCanonicalAndLegacyFields(t *testing.T) {
	filters := buildCodebaseTagFilters([]string{" canonical ", "", "x"})
	if len(filters) != 2 {
		t.Fatalf("expected two valid tag filters, got %d", len(filters))
	}

	first := filters[0].GetFilter()
	if first == nil || len(first.Should) != 2 {
		t.Fatalf("expected a two-branch compatibility filter, got %#v", first)
	}
	if got := first.Should[0].GetField().GetKey(); got != "tags" {
		t.Fatalf("expected canonical tags field, got %q", got)
	}
	if got := first.Should[0].GetField().GetMatch().GetKeyword(); got != "canonical" {
		t.Fatalf("expected trimmed tag value, got %q", got)
	}
	if got := first.Should[1].GetField().GetKey(); got != "qdrant_tags" {
		t.Fatalf("expected legacy qdrant_tags field, got %q", got)
	}
}

func TestBuildCodebaseTagFiltersRejectsOversizedTags(t *testing.T) {
	filters := buildCodebaseTagFilters([]string{string(make([]byte, 201))})
	if len(filters) != 0 {
		t.Fatalf("expected oversized tag to be rejected, got %d filters", len(filters))
	}
}
