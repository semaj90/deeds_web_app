package main

import "testing"

type ftsIdentityTestRow struct {
	id, canonicalChunkID, packetKey, sourceRef     string
	contentHash, workspaceRevision, sourceRevision string
	provenLineageCount, boundLineageCount          int
}

func TestFTSIdentityStatusRequiresCanonicalLineage(t *testing.T) {
	const digest = "sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"
	valid := ftsIdentityTestRow{
		id: "row-1", canonicalChunkID: "chunk-1", packetKey: "packet:1", sourceRef: "src/main.go",
		contentHash: digest, workspaceRevision: digest, sourceRevision: digest,
		provenLineageCount: 1, boundLineageCount: 1,
	}

	cases := []struct {
		name, wantReason string
		mutate           func(*ftsIdentityTestRow)
	}{
		{"qualified row", "", func(*ftsIdentityTestRow) {}},
		{"missing id", "ATLAS_FTS_REVISION_INCOMPLETE", func(v *ftsIdentityTestRow) { v.id = "" }},
		{"missing content hash", "ATLAS_FTS_REVISION_INCOMPLETE", func(v *ftsIdentityTestRow) { v.contentHash = "" }},
		{"missing canonical chunk", "ATLAS_FTS_REVISION_INCOMPLETE", func(v *ftsIdentityTestRow) { v.canonicalChunkID = "" }},
		{"missing packet key", "ATLAS_FTS_REVISION_INCOMPLETE", func(v *ftsIdentityTestRow) { v.packetKey = "" }},
		{"missing source reference", "ATLAS_FTS_REVISION_INCOMPLETE", func(v *ftsIdentityTestRow) { v.sourceRef = "" }},
		{"invalid workspace revision", "ATLAS_FTS_REVISION_INCOMPLETE", func(v *ftsIdentityTestRow) { v.workspaceRevision = "probe-rev" }},
		{"invalid source revision", "ATLAS_FTS_REVISION_INCOMPLETE", func(v *ftsIdentityTestRow) { v.sourceRevision = "probe-rev" }},
		{"missing proven lineage", "PROVEN_LINEAGE_MISSING_OR_AMBIGUOUS", func(v *ftsIdentityTestRow) { v.provenLineageCount = 0 }},
		{"ambiguous proven lineage", "PROVEN_LINEAGE_MISSING_OR_AMBIGUOUS", func(v *ftsIdentityTestRow) { v.provenLineageCount = 2 }},
		{"missing exact source binding", "SOURCE_BINDING_MISSING_OR_AMBIGUOUS", func(v *ftsIdentityTestRow) { v.boundLineageCount = 0 }},
		{"ambiguous source binding", "SOURCE_BINDING_MISSING_OR_AMBIGUOUS", func(v *ftsIdentityTestRow) { v.boundLineageCount = 2 }},
	}

	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			row := valid
			tc.mutate(&row)
			status, reason := ftsIdentityStatus(row.id, row.canonicalChunkID, row.packetKey, row.sourceRef, row.contentHash, row.workspaceRevision, row.sourceRevision, row.provenLineageCount, row.boundLineageCount)
			if tc.wantReason == "" {
				if status != "PASS" || reason != "" {
					t.Fatalf("status=%q reason=%q, want PASS", status, reason)
				}
				return
			}
			if status != "REVIEW_REQUIRED" || reason != tc.wantReason {
				t.Fatalf("status=%q reason=%q, want REVIEW_REQUIRED/%s", status, reason, tc.wantReason)
			}
		})
	}
}
