from __future__ import annotations

from atlas_semantic512_reconcile import (
    CanonicalPacket,
    build_row,
    classify_candidate,
    expected_packet_key,
    normalize_source_ref,
)


def packet(**overrides):
    base = dict(
        packet_key="src/lib/a.ts:abcdef0123456789",
        packet_id="abcdef0123456789ffffffffffffffffffffffffffffffffffffffff",
        artifact_id="42",
        source_ref="src/lib/a.ts",
        tree_node_id="tree-1",
        feature_label="feature-a",
        workspace_revision=7,
        representation_revision=3,
        source_representation_id="semantic_512",
        source_dimension=512,
        qdrant_collection="codebase_chunks_512",
        qdrant_vector_dim=512,
        sha256=None,
        lineage_version="lineage-v1",
    )
    base.update(overrides)
    return CanonicalPacket(**base)


def point(point_id=42, packet_key="packet:42", source_ref="abcdef0123456789"):
    vector = [0.0] * 512
    vector[0] = 1.0
    return {
        "id": point_id,
        "vector": vector,
        "payload": {
            "packet_key": packet_key,
            "source_ref": source_ref,
            "content_hash": "abcdef0123456789ffffffffffffffffffffffffffffffffffffffff",
        },
    }


def chunk():
    return {
        "id": "42",
        "source_ref": "src/lib/a.ts",
        "content_hash": "abcdef0123456789ffffffffffffffffffffffffffffffffffffffff",
    }


def test_normalize_source_ref_preserves_case_and_normalizes_slashes():
    assert normalize_source_ref(r".\Src\Lib\A.ts") == "Src/Lib/A.ts"


def test_expected_packet_key_uses_source_ref_and_hash_prefix():
    assert expected_packet_key("src/lib/a.ts", "abcdef0123456789ffff") == "src/lib/a.ts:abcdef0123456789"


def test_unique_strong_identifiers_admit_even_when_legacy_payload_is_placeholder():
    status, classification, resolved, details = classify_candidate(point(), chunk(), [packet()])
    assert status == "ADMITTED"
    assert classification == "STRONG_CANONICAL_MATCH"
    assert resolved is not None
    assert resolved.packet_key == "src/lib/a.ts:abcdef0123456789"
    assert "LEGACY_PAYLOAD_PACKET_KEY" not in details["matchReasons"]


def test_source_ref_only_match_requires_review():
    weak = packet(
        packet_key="different-key",
        packet_id="different-id",
        artifact_id="different-artifact",
    )
    status, classification, resolved, _ = classify_candidate(point(), chunk(), [weak])
    assert status == "REVIEW"
    assert classification == "SOURCE_REF_ONLY_MATCH"
    assert resolved is not None


def test_ambiguous_strong_match_requires_review():
    first = packet(packet_key="same", packet_id="abcdef0123456789ffffffffffffffffffffffffffffffffffffffff")
    second = packet(
        packet_key="other",
        packet_id="abcdef0123456789ffffffffffffffffffffffffffffffffffffffff",
        artifact_id="99",
    )
    # Remove the artifact-id advantage from the first candidate so both resolve
    # through the same strong content-hash identity.
    first = packet(packet_key="same", artifact_id="98")
    status, classification, resolved, details = classify_candidate(point(), chunk(), [first, second])
    assert status == "REVIEW"
    assert classification == "AMBIGUOUS_TOP_MATCH"
    assert resolved is None
    assert len(details["candidatePacketKeys"]) == 2


def test_build_row_emits_source_version_receipt_without_invented_source_revision():
    status, classification, resolved, details = classify_candidate(point(), chunk(), [packet()])
    row = build_row(
        point(),
        chunk(),
        resolved,
        status,
        classification,
        details,
        "2026-08-19T00:00:00+00:00",
        {"postgresSnapshot": "1:2:", "transactionTimestamp": "2026-08-19T00:00:00+00:00"},
    )
    assert row["status"] == "ADMITTED"
    assert row["sourceVersionReceipt"]["sourceRevision"] is None
    assert row["sourceVersionReceipt"]["sourceRevisionAuthority"] == "ABSENT_IN_LIVE_ATLAS_PACKETS"
    assert row["representation"]["dimension"] == 512
    assert len(row["representation"]["vectorDigest"]) == 64
