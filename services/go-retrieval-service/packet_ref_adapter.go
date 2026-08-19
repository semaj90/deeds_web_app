//go:build atlas_packet_transport

package main

import (
	"fmt"
	"strings"

	atlaspacketv1 "github.com/deeds-web-app/services/go-retrieval-service/proto/atlaspacket"
)

// PacketRefInput is the transport-neutral subset retrieval must know how to emit.
// The canonical packet/materialization owner is responsible for supplying these
// values; retrieval must not fabricate revisions or canonical IDs.
type PacketRefInput struct {
	PacketKey              string
	SourceRef              string
	CanonicalID            string
	WorkspaceRevision      string
	SourceRevision         string
	RepresentationRevision string
	FeatureRevision        string
	GraphRevision          string
	OntologyRevision       string
	EvidenceRefs           []string
	OntologyIDs            []string
	ConceptIDs             []string
	HyperedgeRefs           []string
	ContextManifestID      string
}

func BuildPacketRef(input PacketRefInput) (*atlaspacketv1.PacketRef, error) {
	required := map[string]string{
		"packet_key":              input.PacketKey,
		"source_ref":              input.SourceRef,
		"workspace_revision":      input.WorkspaceRevision,
		"source_revision":         input.SourceRevision,
		"representation_revision": input.RepresentationRevision,
	}
	for field, value := range required {
		if strings.TrimSpace(value) == "" {
			return nil, fmt.Errorf("packet ref missing canonical field %s", field)
		}
	}

	return &atlaspacketv1.PacketRef{
		PacketKey:              input.PacketKey,
		SourceRef:              input.SourceRef,
		CanonicalId:            input.CanonicalID,
		WorkspaceRevision:      input.WorkspaceRevision,
		SourceRevision:         input.SourceRevision,
		RepresentationRevision: input.RepresentationRevision,
		FeatureRevision:        input.FeatureRevision,
		GraphRevision:          input.GraphRevision,
		OntologyRevision:       input.OntologyRevision,
		EvidenceRefs:           append([]string(nil), input.EvidenceRefs...),
		OntologyIds:            append([]string(nil), input.OntologyIDs...),
		ConceptIds:             append([]string(nil), input.ConceptIDs...),
		HyperedgeRefs:          append([]string(nil), input.HyperedgeRefs...),
		ContextManifestId:      input.ContextManifestID,
	}, nil
}
