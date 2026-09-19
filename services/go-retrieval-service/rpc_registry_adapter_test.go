package main

import (
	"context"
	"testing"

	pb "github.com/deeds-web-app/services/go-retrieval-service/proto/retrieval"
	sharedpb "github.com/deeds-web-app/services/go-retrieval-service/proto/shared"
)

func TestPacketRegistryAdapterFailsClosedWithoutIdentity(t *testing.T) {
	server := &retrievalServer{}
	resp, err := server.GetPacketRegistry(context.Background(), &pb.PacketRegistryRequest{})
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if resp == nil || resp.GetReceipt() == nil {
		t.Fatal("expected unavailable receipt")
	}
	if resp.GetReceipt().GetErrorCode() != "ATLAS_RPC_IDENTITY_INCOMPLETE" {
		t.Fatalf("unexpected error code: %q", resp.GetReceipt().GetErrorCode())
	}
	if len(resp.GetEntries()) != 0 || resp.GetReceipt().GetWritesPerformed() {
		t.Fatal("adapter must return no rows and perform no writes")
	}
}

func TestSemanticAstAdapterDoesNotFabricateCanonicalRows(t *testing.T) {
	server := &retrievalServer{}
	ctx := &sharedpb.AtlasRequestContextV2{
		ToolCallId: "tool-1", RunId: "run-1", WorkspaceId: "workspace-1",
		WorkspaceRevision: "workspace-rev-1", PacketKey: "packet-1", PacketRevision: "packet-rev-1",
	}
	resp, err := server.GetSemanticAstPackets(context.Background(), &pb.SemanticAstPacketRequest{AtlasContext: ctx})
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if resp == nil || resp.GetReceipt() == nil {
		t.Fatal("expected unavailable receipt")
	}
	if resp.GetReceipt().GetErrorCode() != "ATLAS_SEMANTIC_AST_JOIN_UNAVAILABLE" {
		t.Fatalf("unexpected error code: %q", resp.GetReceipt().GetErrorCode())
	}
	if resp.GetReceipt().GetPacketRevision() != "packet-rev-1" || len(resp.GetPackets()) != 0 {
		t.Fatal("adapter must preserve request identity and return no fabricated packets")
	}
}
