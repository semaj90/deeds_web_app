package main

import (
	"testing"

	sharedpb "github.com/deeds-web-app/services/go-retrieval-service/proto/shared"
	"google.golang.org/protobuf/proto"
)

func testReceiptContext() *sharedpb.AtlasRequestContextV2 {
	return &sharedpb.AtlasRequestContextV2{
		ToolCallId:        "tool-call-1",
		RunId:             "run-1",
		WorkspaceId:       "workspace-1",
		WorkspaceRevision: "workspace-rev-1",
		PacketKey:         "packet-1",
		PacketRevision:    "packet-rev-1",
		SourceRevision:    "sha256:source-revision-1",
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
	if first.GetPacketKey() != ctx.GetPacketKey() || first.GetSourceRevision() != ctx.GetSourceRevision() {
		t.Fatalf("receipt did not preserve packet/source identity: %#v", first)
	}
	if first.GetReceiptChecksum() == "" || first.GetReceiptChecksum() != second.GetReceiptChecksum() {
		t.Fatalf("receipt checksum is not replay-stable: %q / %q", first.GetReceiptChecksum(), second.GetReceiptChecksum())
	}
}

func TestCodebaseSourceRevisionFilterPreservesExactValue(t *testing.T) {
	ctx := testReceiptContext()
	ctx.SourceRevision = "sha256:CaseSensitive-Revision"
	filter := codebaseSourceRevisionFilter(ctx)
	if filter == nil || filter.GetField() == nil {
		t.Fatal("expected exact source-revision filter")
	}
	if filter.GetField().GetKey() != "source_revision" || filter.GetField().GetMatch().GetKeyword() != ctx.GetSourceRevision() {
		t.Fatalf("source revision was normalized or omitted: %#v", filter.GetField())
	}
}

func TestCodebaseSourceRevisionFilterOmitsUnscopedRequests(t *testing.T) {
	ctx := testReceiptContext()
	ctx.SourceRevision = ""
	if filter := codebaseSourceRevisionFilter(ctx); filter != nil {
		t.Fatalf("unscoped request must not add a source revision filter: %#v", filter)
	}
}

func TestSourceRevisionFieldsRoundTripOverProtobuf(t *testing.T) {
	request := testReceiptContext()
	receipt := codebaseReceipt(request, true, 1, 0.5, "PASS", "", "sha256:output")
	requestBytes, err := proto.Marshal(request)
	if err != nil {
		t.Fatalf("marshal request: %v", err)
	}
	var decodedRequest sharedpb.AtlasRequestContextV2
	if err := proto.Unmarshal(requestBytes, &decodedRequest); err != nil {
		t.Fatalf("unmarshal request: %v", err)
	}
	if decodedRequest.GetSourceRevision() != request.GetSourceRevision() {
		t.Fatalf("request source revision did not survive protobuf round trip: %q", decodedRequest.GetSourceRevision())
	}

	receiptBytes, err := proto.Marshal(receipt)
	if err != nil {
		t.Fatalf("marshal receipt: %v", err)
	}
	var decodedReceipt sharedpb.AtlasToolReceiptV2
	if err := proto.Unmarshal(receiptBytes, &decodedReceipt); err != nil {
		t.Fatalf("unmarshal receipt: %v", err)
	}
	if decodedReceipt.GetSourceRevision() != request.GetSourceRevision() {
		t.Fatalf("receipt source revision did not survive protobuf round trip: %q", decodedReceipt.GetSourceRevision())
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
