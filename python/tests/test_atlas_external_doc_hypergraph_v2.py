"""Unit tests for Grounded Hypergraph V2 adapter."""

from __future__ import annotations

import struct
import pytest

from python.atlas_external_doc_hypergraph_v2 import (
    FEATURE_FLAG_BYTEA_ALIGNED,
    FEATURE_FLAG_MANIFOLD_4D,
    FEATURE_FLAG_MODE7_AFFINE,
    FEATURE_FLAG_TEXTURE_VERTEX,
    GroundedFactParticipantV2,
    HyperedgeV2,
    Manifold4DCoordinatesV1,
    build_hyperedge_v2,
    classify_domain_queue_tier_v2,
    pack_vertex_stream_for_web_worker_v2,
    project_mode7_affine_v2,
)
from python.atlas_graph_runtime.duckdb_bytea_rpc_packet_v1 import (
    decode_rpc_packet_v1,
    encode_rpc_packet_v1,
    score_agentic_repair_puct_v1,
)


def test_manifold_4d_coordinates_and_isoquant():
    coords = Manifold4DCoordinatesV1(x=0.3, y=0.4, z=1.2, w=0.85)
    assert coords.x == 0.3
    assert coords.y == 0.4
    assert coords.z == 1.2
    assert coords.w == 0.85
    # Isoquant radius = sqrt(0.3^2 + 0.4^2 + 1.2^2) = sqrt(0.09 + 0.16 + 1.44) = sqrt(1.69) = 1.3
    assert pytest.approx(coords.isoquant_radius, 1e-6) == 1.3

    with pytest.raises(ValueError, match="MANIFOLD_REWARD_W_OUT_OF_RANGE"):
        Manifold4DCoordinatesV1(x=0.0, y=0.0, z=0.0, w=1.5)


def test_project_mode7_affine_v2():
    # Affine: scale x by 2, translate by 10; scale y by 3, translate by -5
    affine = (2.0, 0.0, 10.0, 0.0, 3.0, -5.0)
    wx, wy = project_mode7_affine_v2(affine, 1.5, 2.0)
    assert pytest.approx(wx) == 2.0 * 1.5 + 10.0  # 13.0
    assert pytest.approx(wy) == 3.0 * 2.0 - 5.0   # 1.0


def test_build_hyperedge_v2_n_ary_proposal():
    coords = Manifold4DCoordinatesV1(x=0.5, y=0.5, z=0.1, w=0.92)
    participants = [
        GroundedFactParticipantV2("concept:cuda", "concept", "subject", "CUDA", tile_uv=(1.0, 2.0)),
        GroundedFactParticipantV2("concept:ptx", "concept", "object", "PTX", tile_uv=(3.0, 4.0)),
        GroundedFactParticipantV2("concept:rtx_gpu", "concept", "context", "RTX", tile_uv=(0.5, 0.5)),
    ]
    edge = build_hyperedge_v2(
        fact_id="fact:cuda-ptx-rtx",
        predicate="COMPLIES_WITH",
        source_ref="src/cuda/kernel.cu",
        source_revision="sha256:rev1",
        workspace_revision="sha256:work1",
        producer_revision="extractor:v2",
        evidence_start_byte=100,
        evidence_end_byte=150,
        evidence_text="__global__ void kernel()",
        evidence_checksum="sha256:dummy",
        participants=participants,
        manifold_4d=coords,
        mode7_affine=(1.0, 0.0, 5.0, 0.0, 1.0, -2.0),
        confidence=0.95,
    )

    assert edge.schema == "atlas.external-doc-hypergraph.v2"
    assert edge.admission_state == "PROPOSAL_ONLY"
    assert edge.canonical_authority is False
    assert edge.writes_performed is False
    assert edge.graph_revision is None
    assert len(edge.participants) == 3
    assert len(edge.proposal_checksum) == 64

    # Verify domain tier classification
    tier = classify_domain_queue_tier_v2(edge)
    assert tier == "HOT"


def test_pack_vertex_stream_for_web_worker():
    coords = Manifold4DCoordinatesV1(x=0.1, y=0.2, z=0.3, w=0.7)
    affine = (1.0, 0.0, 0.0, 0.0, 1.0, 0.0)
    participants = [
        GroundedFactParticipantV2("entity:1", "node", "arg1", tile_uv=(2.0, 3.0)),
        GroundedFactParticipantV2("entity:2", "node", "arg2", tile_uv=(4.0, 5.0)),
    ]
    edge = build_hyperedge_v2(
        fact_id="fact:simple",
        predicate="RELATES",
        source_ref="ref",
        source_revision="rev",
        workspace_revision="work",
        producer_revision="prod",
        evidence_start_byte=0,
        evidence_end_byte=10,
        evidence_text="test text",
        evidence_checksum="sha256:c",
        participants=participants,
        manifold_4d=coords,
        mode7_affine=affine,
    )

    # 2 participants x 32 bytes per vertex = 64 bytes
    buffer = pack_vertex_stream_for_web_worker_v2(edge, char_progress=0.75)
    assert len(buffer) == 64

    # Unpack first vertex (6 x f32, 1 x u32 feature_bitmask, 1 x f32 char_progress)
    v1 = struct.unpack("<6fIf", buffer[:32])
    # [world_x, world_y, manifold_z, manifold_w, u, v, feature_bitmask, char_progress]
    assert pytest.approx(v1[0]) == 2.0
    assert pytest.approx(v1[1]) == 3.0
    assert pytest.approx(v1[2]) == 0.3
    assert pytest.approx(v1[3]) == 0.7
    assert pytest.approx(v1[4]) == 2.0
    assert pytest.approx(v1[5]) == 3.0
    assert v1[6] == edge.feature_bitmask
    assert pytest.approx(v1[7]) == 0.75


def test_arpc_bytea_rpc_packet_integration():
    coords = Manifold4DCoordinatesV1(x=0.5, y=0.5, z=0.2, w=0.88)
    edge = build_hyperedge_v2(
        fact_id="fact:arpc-test",
        predicate="CONNECTED_TO",
        source_ref="ref",
        source_revision="rev",
        workspace_revision="work",
        producer_revision="prod",
        evidence_start_byte=10,
        evidence_end_byte=20,
        evidence_text="sample evidence",
        evidence_checksum="checksum",
        participants=[
            GroundedFactParticipantV2("a", "node", "src"),
            GroundedFactParticipantV2("b", "node", "dst"),
        ],
        manifold_4d=coords,
    )

    # Wrap hyperedge payload into ARPC packet
    packet_bytes = encode_rpc_packet_v1(edge.to_dict())

    assert packet_bytes[:4] == b"ARPC"

    # Parse back and verify integrity
    parsed = decode_rpc_packet_v1(packet_bytes)
    assert parsed["predicate"] == "CONNECTED_TO"
    assert parsed["schema"] == "atlas.external-doc-hypergraph.v2"
    assert parsed["admission_state"] == "PROPOSAL_ONLY"
    assert parsed["feature_bitmask"] == edge.feature_bitmask

    # Verify zlib-compressed ARPC envelope round-trip
    zlib_bytes = encode_rpc_packet_v1(edge.to_dict(), compression="zlib")
    assert zlib_bytes[:4] == b"ARPC"
    parsed_zlib = decode_rpc_packet_v1(zlib_bytes)
    assert parsed_zlib["proposal_checksum"] == edge.proposal_checksum

    # Verify lz4 fails closed cleanly if lz4 package is not installed
    try:
        lz4_bytes = encode_rpc_packet_v1(edge.to_dict(), compression="lz4")
        assert decode_rpc_packet_v1(lz4_bytes)["proposal_checksum"] == edge.proposal_checksum
    except RuntimeError as err:
        assert "RPC_LZ4_CODEC_UNAVAILABLE" in str(err)
