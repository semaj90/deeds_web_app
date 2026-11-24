"""Unit & live-probe tests for Qdrant v1.20.2 TurboQuant + Code-BM25 + GraphRAG adapter."""

from __future__ import annotations

import pytest

from python.atlas_graph_runtime.qdrant_v120_graphrag_adapter_v1 import (
    build_qdrant_graphrag_hybrid_query_v1,
    build_turboquant_code_bm25_collection_spec_v1,
    probe_qdrant_v120_turbo_capabilities_v1,
    rejoin_qdrant_hits_with_pg18_v1,
)


def test_turboquant_code_bm25_spec_and_hybrid_query():
    spec = build_turboquant_code_bm25_collection_spec_v1(
        collection_name="atlas_graphrag_turbo16_v1",
        vector_size=768,
        datatype="turbo16",
    )
    assert spec["canonical_authority"] is False
    vec_cfg = spec["create_collection_body"]["vectors"]["content"]
    assert vec_cfg == {"size": 768, "distance": "Cosine", "datatype": "turbo16"}
    assert spec["payload_indexes"][0]["field_schema"]["tokenizer"] == "code"
    assert spec["payload_indexes"][0]["field_schema"]["scoring"] == {"type": "bm25"}
    assert spec["grpc_notes"]["port"] == 6334

    query = build_qdrant_graphrag_hybrid_query_v1(
        query_vector=[0.1] * 4,
        code_query_text="rejoin_qdrant_hits_with_pg18_v1",
        workspace_revision="74ac7d8983e",
        domain_id="ATLASDOM:retrieval",
    )
    assert query["query"] == {"fusion": "rrf"}
    assert query["prefetch"][0]["using"] == "content"
    assert query["prefetch"][1]["using"] == "code_text"


def test_rejoin_qdrant_hits_with_pg18_and_graphrag_neighbors():
    hits = [
        {
            "id": 99999,  # Qdrant projection ID must never become canonical ID
            "score": 0.94,
            "payload": {
                "candidate_id": "cand:1",
                "source_revision": "sha256:aaa",
                "workspace_revision": "74ac7d8983e",
            },
        }
    ]
    pg18 = {"cand:1": {"source_ref": "src/a.ts", "source_revision": "sha256:aaa"}}
    neighbors = {"cand:1": [{"predicate": "CALLS", "target": "cand:2"}]}

    res = rejoin_qdrant_hits_with_pg18_v1(
        qdrant_points=hits,
        expected_workspace_revision="74ac7d8983e",
        pg18_by_candidate_id=pg18,
        graphrag_neighbors_by_candidate_id=neighbors,
    )
    assert len(res) == 1
    assert res[0]["candidate_id"] == "cand:1"
    assert res[0]["admission_state"] == "PROPOSAL_ONLY"
    assert res[0]["canonical_authority"] is False
    assert res[0]["graphrag_neighbors"][0]["predicate"] == "CALLS"

    with pytest.raises(ValueError, match="QDRANT_WORKSPACE_REVISION_DRIFT"):
        rejoin_qdrant_hits_with_pg18_v1(
            qdrant_points=hits,
            expected_workspace_revision="stale-rev",
            pg18_by_candidate_id=pg18,
        )


def test_live_qdrant_v120_probe():
    probe = probe_qdrant_v120_turbo_capabilities_v1()
    assert probe["supports_turboquant"] is True
    assert probe["supports_code_bm25"] is True
    assert probe["canonical_authority"] is False


def test_live_qdrant_v120_turbo16_code_bm25_roundtrip():
    import json
    import urllib.request

    base = "http://127.0.0.1:6333"
    col = "atlas_code_hybrid_turbo16_smoke_tmp"
    spec = build_turboquant_code_bm25_collection_spec_v1(
        collection_name=col,
        vector_size=768,
        datatype="turbo16",
    )

    def _req(method: str, path: str, body: dict | None = None) -> dict:
        data = json.dumps(body).encode("utf-8") if body is not None else None
        req = urllib.request.Request(
            f"{base}{path}",
            data=data,
            headers={"Content-Type": "application/json"} if data is not None else {},
            method=method,
        )
        with urllib.request.urlopen(req, timeout=5) as resp:
            return json.loads(resp.read().decode("utf-8"))

    v1 = [0.9] + [0.0] * 767
    v2 = [0.0, 0.9] + [0.0] * 766

    try:
        try:
            _req("DELETE", f"/collections/{col}")
        except Exception:
            pass

        # 1. Create 768D turbo16 collection + code BM25 payload index
        assert _req("PUT", f"/collections/{col}", spec["create_collection_body"])["status"] == "ok"
        assert _req("PUT", f"/collections/{col}/index?wait=true", spec["payload_indexes"][0])["status"] == "ok"

        # 2. Upsert 2 768D test points
        upsert_body = {
            "points": [
                {
                    "id": 1,
                    "vector": {"content": v1},
                    "payload": {
                        "candidate_id": "cand:1",
                        "source_revision": "sha256:aaa",
                        "workspace_revision": "74ac7d8983e",
                        "code_text": "export function parse_ast_node(ctx) { return ctx; }",
                    },
                },
                {
                    "id": 2,
                    "vector": {"content": v2},
                    "payload": {
                        "candidate_id": "cand:2",
                        "source_revision": "sha256:bbb",
                        "workspace_revision": "74ac7d8983e",
                        "code_text": "export function render_palette_tile() {}",
                    },
                },
            ]
        }
        assert _req("PUT", f"/collections/{col}/points?wait=true", upsert_body)["status"] == "ok"

        # 3. Single-pass hybrid dense (768D turbo16) + code-tokenizer BM25 RRF query
        query_body = build_qdrant_graphrag_hybrid_query_v1(
            query_vector=v1,
            code_query_text="parse_ast_node",
            workspace_revision="74ac7d8983e",
            limit=2,
        )
        res = _req("POST", f"/collections/{col}/points/query", query_body)
        points = res["result"]["points"]
        assert len(points) >= 1
        assert points[0]["payload"]["candidate_id"] == "cand:1"

        rejoined = rejoin_qdrant_hits_with_pg18_v1(
            qdrant_points=points,
            expected_workspace_revision="74ac7d8983e",
            pg18_by_candidate_id={
                "cand:1": {"source_ref": "src/ast.ts", "source_revision": "sha256:aaa"},
                "cand:2": {"source_ref": "src/tile.ts", "source_revision": "sha256:bbb"},
            },
            graphrag_neighbors_by_candidate_id={
                "cand:1": [{"predicate": "CALLS", "target": "cand:2", "workspace_revision": "74ac7d8983e"}]
            },
        )
        assert rejoined[0]["admission_state"] == "PROPOSAL_ONLY"
        assert rejoined[0]["graphrag_neighbors"][0]["predicate"] == "CALLS"

        # Stale edge revision must fail closed
        with pytest.raises(ValueError, match="GRAPH_EDGE_REVISION_DRIFT"):
            rejoin_qdrant_hits_with_pg18_v1(
                qdrant_points=points,
                expected_workspace_revision="74ac7d8983e",
                pg18_by_candidate_id={
                    "cand:1": {"source_ref": "src/ast.ts", "source_revision": "sha256:aaa"},
                    "cand:2": {"source_ref": "src/tile.ts", "source_revision": "sha256:bbb"},
                },
                graphrag_neighbors_by_candidate_id={
                    "cand:1": [{"predicate": "CALLS", "target": "cand:2", "workspace_revision": "stale-rev"}]
                },
            )
    finally:
        try:
            _req("DELETE", f"/collections/{col}")
        except Exception:
            pass
