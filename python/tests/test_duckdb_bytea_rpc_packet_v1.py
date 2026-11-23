"""Tests for DuckDB BYTEA/RPC packet alignment, forbidden-state guard, and PUCT repair scorer."""
from __future__ import annotations

from pathlib import Path

import pytest

from atlas_graph_runtime.duckdb_bytea_rpc_packet_v1 import (
    decode_rpc_packet_v1,
    encode_rpc_packet_v1,
    query_duckdb_arrow_bytea_alignment_v1,
    score_agentic_repair_puct_v1,
)

ARROW_PATH = Path(__file__).resolve().parents[2] / "docs" / "reports" / "feature_matrix_5.arrow"


def test_rpc_packet_roundtrip_and_forbidden_state_guard() -> None:
    payload = {"chunkId": "c1", "candidateOrdinal": 0, "fsmState": "CPU_STAGED"}
    blob = encode_rpc_packet_v1(payload)
    assert decode_rpc_packet_v1(blob) == payload

    with pytest.raises(ValueError, match="RPC_PACKET_CHECKSUM_MISMATCH"):
        decode_rpc_packet_v1(blob[:-1] + bytes([blob[-1] ^ 0xFF]))

    with pytest.raises(ValueError, match="FORBIDDEN_RUNTIME_STATE_KEY"):
        encode_rpc_packet_v1({"chunkId": "c1", "kv_cache": [1, 2, 3]})

    with pytest.raises(ValueError, match="FORBIDDEN_RUNTIME_STATE_KEY"):
        encode_rpc_packet_v1({"nested": {"hiddenThoughts": "secret"}})


def test_duckdb_arrow_bytea_alignment_live() -> None:
    res = query_duckdb_arrow_bytea_alignment_v1(ARROW_PATH, limit=12)
    assert res["canonicalAuthority"] is False
    assert res["writesPerformed"] is False
    assert res["hiddenStatePersisted"] is False
    assert res["alignedRowCount"] == 12
    assert res["totalPayloadBytes"] > 0
    desc = res["ssrToCsrResidencyDescriptor"]
    assert desc["manifestChecksum"].startswith("sha256:")
    assert desc["fsmState"] == "CPU_STAGED"
    assert desc["transferComplete"] is False


def test_score_agentic_repair_puct_requires_verified_claims() -> None:
    ranked = score_agentic_repair_puct_v1(
        [
            {"candidateId": "fix-a", "verifiedClaim": True, "meanReward": 0.4, "prior": 0.8, "visits": 2},
            {"candidateId": "fix-b", "verifiedClaim": True, "meanReward": 0.7, "prior": 0.6, "visits": 1},
        ]
    )
    assert [r["candidateId"] for r in ranked] == ["fix-b", "fix-a"]
    assert all(r["mutationAuthorized"] is False and r["authorizationRequired"] is True for r in ranked)

    with pytest.raises(ValueError, match="UNVERIFIED_CLAIM_REJECTED"):
        score_agentic_repair_puct_v1([{"candidateId": "bad", "verifiedClaim": False}])
