package main

import (
	"testing"

	sharedpb "github.com/deeds-web-app/services/go-retrieval-service/proto/shared"
)

func testReceiptContext() *sharedpb.AtlasRequestContextV2 {
	return &sharedpb.AtlasRequestContextV2{
		ToolCallId:        "tool-call-1",
		RunId:             "run-1",
		WorkspaceId:       "workspace-1",
		WorkspaceRevision: "workspace-rev-1",
		PacketKey:         "packet-1",
		PacketRevision:    "packet-rev-1",
	}
}

func TestCodebaseReceiptPreservesIdentityAndReplayChecksum(t *testing.T) {
	ctx := testReceiptContext()
	first := codebaseReceipt(ctx, true, 2, 0.75, "PASS", "", "sha256:output")
	second := codebaseReceipt(ctx, true, 2, 0.75, "PASS", "", "sha256:output")

	if first == nil || second == nil {
		t.Fatal("expected identity-qualified receipt")
	}
	if first.GetSchema() != "atlas.tool-receipt.v2" || first.GetToolName() != "atlas.retrieve" {
		t.Fatalf("unexpected receipt identity: %#v", first)
	}
	if first.GetRunId() != ctx.GetRunId() || first.GetWorkspaceRevision() != ctx.GetWorkspaceRevision() || first.GetPacketRevision() != ctx.GetPacketRevision() {
		t.Fatalf("receipt did not preserve context identity: %#v", first)
	}
	if first.GetReceiptChecksum() == "" || first.GetReceiptChecksum() != second.GetReceiptChecksum() {
		t.Fatalf("receipt checksum is not replay-stable: %q / %q", first.GetReceiptChecksum(), second.GetReceiptChecksum())
	}
}

func TestCodebaseReceiptFailsClosedWithoutCompleteIdentity(t *testing.T) {
	ctx := testReceiptContext()
	ctx.PacketRevision = ""
	if receipt := codebaseReceipt(ctx, true, 1, 0.5, "PASS", "", "sha256:output"); receipt != nil {
		t.Fatalf("expected no receipt for incomplete identity: %#v", receipt)
	}
}

func TestCodebaseReceiptCarriesUnavailableFailure(t *testing.T) {
	receipt := codebaseReceipt(testReceiptContext(), false, 0, -1, "FAIL", "ATLAS_RETRIEVAL_ADAPTER_UNAVAILABLE", "")
	if receipt == nil {
		t.Fatal("expected identity-qualified failure receipt")
	}
	if receipt.GetSucceeded() || receipt.GetEvidenceCount() != 0 || receipt.GetValidationStatus() != "FAIL" || receipt.GetErrorCode() != "ATLAS_RETRIEVAL_ADAPTER_UNAVAILABLE" {
		t.Fatalf("unexpected unavailable receipt: %#v", receipt)
	}
}
