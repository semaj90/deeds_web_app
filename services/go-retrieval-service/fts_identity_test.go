package main

import "testing"

func TestFTSIdentityStatusRequiresRevisionQualifiedFields(t *testing.T) {
	status, reason := ftsIdentityStatus("chunk-1", "sha256:content", "sha256:workspace", "sha256:source")
	if status != "PASS" || reason != "" {
		t.Fatalf("qualified FTS row status=%q reason=%q, want PASS", status, reason)
	}

	for name, values := range map[string][4]string{
		"missing id":                 {"", "sha256:content", "sha256:workspace", "sha256:source"},
		"missing content hash":       {"chunk-1", "", "sha256:workspace", "sha256:source"},
		"missing workspace revision": {"chunk-1", "sha256:content", "", "sha256:source"},
		"missing source revision":    {"chunk-1", "sha256:content", "sha256:workspace", ""},
	} {
		t.Run(name, func(t *testing.T) {
			status, reason := ftsIdentityStatus(values[0], values[1], values[2], values[3])
			if status != "REVIEW_REQUIRED" || reason != "ATLAS_FTS_REVISION_INCOMPLETE" {
				t.Fatalf("status=%q reason=%q, want review-required revision failure", status, reason)
			}
		})
	}
}
