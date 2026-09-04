import sys

sys.path.insert(0, "python")

import atlas_synthesis_context_graph as scg
import pytest


def _fake_extractions(text, model_id=None):
    del text, model_id
    return [
        {
            "class": "CONCEPT",
            "text": "PostgreSQL",
            "start_char": 0,
            "end_char": 10,
            "attributes": {"concept_id": "DATABASE:POSTGRES"},
            "alignment_status": "EXACT",
        }
    ]


def _fake_extractions_no_concept_id(text, model_id=None):
    del text, model_id
    return [
        {
            "class": "CONCEPT",
            "text": "unrecognized",
            "start_char": 0,
            "end_char": 12,
            "attributes": {},
            "alignment_status": "EXACT",
        }
    ]


def test_builds_packet_mention_edges_without_oak_adapter(monkeypatch):
    monkeypatch.delenv("ATLAS_OAK_ADAPTER", raising=False)
    monkeypatch.setattr(scg.legacy, "_grounded_extractions", _fake_extractions)
    monkeypatch.setattr(scg.legacy, "_grounded_extraction_error", None, raising=False)

    request = scg.SynthesisContextGraphRequest(
        candidates=[
            scg.SynthesisContextCandidateV1(
                packet_key="pkt-1", source_ref="src/db.ts", text="PostgreSQL is used here."
            )
        ]
    )
    response = scg.build_synthesis_context_graph(request)

    assert response["schema"] == "atlas.synthesis-context-graph.v1"
    assert response["nodeCount"] == 2  # PACKET + CONCEPT_MENTION, no ONTOLOGY_CONCEPT
    assert response["edgeCount"] == 1  # MENTIONS only, no GROUNDS_TO
    node_types = {node["type"] for node in response["nodes"]}
    assert node_types == {"PACKET", "CONCEPT_MENTION"}
    edge_types = {edge_type for (_u, _v, edge_type) in response["edges"]}
    assert edge_types == {"MENTIONS"}
    assert response["grounding"]["adapterConfigured"] is False
    assert response["grounding"]["groundedCount"] == 0
    assert response["grounding"]["ungroundedCount"] == 1
    assert response["canonicalAuthority"] is False
    assert response["llmSynthesisPerformed"] is False


def test_grounds_concepts_when_adapter_configured(monkeypatch):
    monkeypatch.setattr(scg.legacy, "_grounded_extractions", _fake_extractions)
    monkeypatch.setattr(scg.legacy, "_grounded_extraction_error", None, raising=False)
    monkeypatch.setattr(scg, "_adapter_locator", lambda: "fixture://adapter")

    class FixtureAdapter:
        def label(self, entity_id):
            assert entity_id == "DATABASE:POSTGRES"
            return "PostgreSQL Database"

    monkeypatch.setattr(scg, "_adapter", lambda: FixtureAdapter())

    request = scg.SynthesisContextGraphRequest(
        candidates=[
            scg.SynthesisContextCandidateV1(
                packet_key="pkt-1", source_ref="src/db.ts", text="PostgreSQL is used here."
            )
        ],
    )
    response = scg.build_synthesis_context_graph(request)

    assert response["nodeCount"] == 3  # PACKET + CONCEPT_MENTION + ONTOLOGY_CONCEPT
    assert response["edgeCount"] == 2  # MENTIONS + GROUNDS_TO
    node_types = {node["type"] for node in response["nodes"]}
    assert node_types == {"PACKET", "CONCEPT_MENTION", "ONTOLOGY_CONCEPT"}
    concept_nodes = [node for node in response["nodes"] if node["type"] == "ONTOLOGY_CONCEPT"]
    assert concept_nodes[0]["label"] == "PostgreSQL Database"
    assert response["grounding"]["groundedCount"] == 1
    assert response["grounding"]["ungroundedCount"] == 0


def test_never_grounds_an_extraction_with_no_concept_id(monkeypatch):
    monkeypatch.setattr(scg.legacy, "_grounded_extractions", _fake_extractions_no_concept_id)
    monkeypatch.setattr(scg.legacy, "_grounded_extraction_error", None, raising=False)
    monkeypatch.setattr(scg, "_adapter_locator", lambda: "fixture://adapter")

    class FixtureAdapter:
        def label(self, entity_id):
            raise AssertionError("label() must not be called when no concept_id was extracted")

    monkeypatch.setattr(scg, "_adapter", lambda: FixtureAdapter())

    request = scg.SynthesisContextGraphRequest(
        candidates=[
            scg.SynthesisContextCandidateV1(packet_key="pkt-1", source_ref="src/x.ts", text="unrecognized text")
        ],
    )
    response = scg.build_synthesis_context_graph(request)

    assert response["grounding"]["groundedCount"] == 0
    assert response["grounding"]["ungroundedCount"] == 0
    node_types = {node["type"] for node in response["nodes"]}
    assert node_types == {"PACKET", "CONCEPT_MENTION"}


def test_degrades_when_adapter_construction_fails(monkeypatch):
    monkeypatch.setattr(scg.legacy, "_grounded_extractions", _fake_extractions)
    monkeypatch.setattr(scg.legacy, "_grounded_extraction_error", None, raising=False)
    monkeypatch.setattr(scg, "_adapter_locator", lambda: "fixture://adapter")

    def _raise():
        raise RuntimeError("adapter unavailable")

    monkeypatch.setattr(scg, "_adapter", _raise)

    request = scg.SynthesisContextGraphRequest(
        candidates=[
            scg.SynthesisContextCandidateV1(packet_key="pkt-1", source_ref="src/db.ts", text="PostgreSQL here.")
        ],
    )
    response = scg.build_synthesis_context_graph(request)

    assert response["grounding"]["adapterConfigured"] is True
    assert response["grounding"]["groundedCount"] == 0
    assert response["grounding"]["ungroundedCount"] == 1
    node_types = {node["type"] for node in response["nodes"]}
    assert node_types == {"PACKET", "CONCEPT_MENTION"}


def test_records_source_representation_ref_without_embedding_vectors(monkeypatch):
    monkeypatch.setattr(scg.legacy, "_grounded_extractions", lambda text, model_id=None: [])
    monkeypatch.setattr(scg.legacy, "_grounded_extraction_error", None, raising=False)

    request = scg.SynthesisContextGraphRequest(
        candidates=[
            scg.SynthesisContextCandidateV1(
                packet_key="pkt-1",
                source_ref="src/db.ts",
                text="no extractable concepts",
                source_representation_ref="sha256:" + "a" * 64,
            )
        ],
    )
    response = scg.build_synthesis_context_graph(request)

    packet_node = next(node for node in response["nodes"] if node["type"] == "PACKET")
    assert packet_node["source_representation_ref"] == "sha256:" + "a" * 64


def test_candidate_count_is_bounded():
    with pytest.raises(Exception):
        scg.SynthesisContextGraphRequest(
            candidates=[
                scg.SynthesisContextCandidateV1(packet_key=f"pkt-{i}", source_ref="src/x.ts", text="x")
                for i in range(scg.MAX_CANDIDATES + 1)
            ],
        )


def test_graph_checksum_is_deterministic(monkeypatch):
    monkeypatch.setattr(scg.legacy, "_grounded_extractions", _fake_extractions)
    monkeypatch.setattr(scg.legacy, "_grounded_extraction_error", None, raising=False)

    request = scg.SynthesisContextGraphRequest(
        candidates=[scg.SynthesisContextCandidateV1(packet_key="pkt-1", source_ref="src/db.ts", text="PostgreSQL.")],
    )
    first = scg.build_synthesis_context_graph(request)
    second = scg.build_synthesis_context_graph(request)
    assert first["graphChecksum"] == second["graphChecksum"]
