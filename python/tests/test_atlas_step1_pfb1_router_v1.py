"""Tests for :8095 CPU NLP sidecar /step1/pack-pfb1 router."""

from __future__ import annotations

from python.atlas_graph_runtime.packed_feature_block_v1 import (
    decode_packed_feature_block_v1,
    unpack_nibble_v1,
)
from python.atlas_step1_pfb1_router_v1 import (
    QueryIntentRequest,
    Step1PackItem,
    Step1PackRequest,
    pack_step1_pfb1,
    propose_query_intent,
    router as step1_pfb1_router,
)


def test_step1_pack_pfb1_endpoint_roundtrip():
    routes = {r.path for r in step1_pfb1_router.routes}
    assert "/step1/pack-pfb1" in routes

    req = Step1PackRequest(
        workspace_revision="74ac7d8983e",
        feature_map_revision=1,
        items=[
            Step1PackItem(source_ref="src/a.ts", symbol_name="foo", score=1.0, active=True),
            Step1PackItem(source_ref="src/b.cu", symbol_name="bar", score=0.5, active=False),
            Step1PackItem(source_ref="src/c.py", symbol_name="baz", score=0.0, active=True),
        ],
    )
    body = pack_step1_pfb1(req)
    assert body["canonical_authority"] is False
    assert body["writes_performed"] is False
    assert body["lod_tiers"] == ["LOD_1_5", "LOD_6_14", "LOD_15_20"]

    decoded = decode_packed_feature_block_v1(bytes.fromhex(body["pfb1_hex"]), expected_feature_map_rev=1)
    assert decoded.logical_bit_count == 3
    assert decoded.nibble_count == 3
    assert unpack_nibble_v1(decoded.nibble_bytes, 0, 3) == 15
    assert unpack_nibble_v1(decoded.nibble_bytes, 1, 3) == 8
    assert unpack_nibble_v1(decoded.nibble_bytes, 2, 3) == 0


def test_step1_query_intent_proposal():
    routes = {r.path for r in step1_pfb1_router.routes}
    assert "/step1/query-intent" in routes

    res = propose_query_intent(QueryIntentRequest(query="Find CUDA functions that launch kernels"))
    assert res["canonical_authority"] is False
    assert res["writes_performed"] is False
    assert res["intent"] == "code_retrieval"
    assert res["domain_candidates"][0]["concept_id"] == "ATLASLANG:cuda_cpp"
    assert res["domain_candidates"][0]["authority"] == "PROPOSAL_ONLY"
    assert res["symbol_filters"]["kinds"] == ["function"]
    assert "CALLS" in res["symbol_filters"]["operations"]
