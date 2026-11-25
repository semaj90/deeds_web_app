"""Tests for bounded Neo4j expansion, ACE manifest validator, and safe rg arg-array search."""

from __future__ import annotations

import pytest

from python.atlas_graph_runtime.neo4j_bounded_expansion_v1 import (
    assemble_ace_context_manifest_v2,
    build_bounded_neo4j_expansion_query_v1,
)
from python.atlas_graph_runtime.safe_rg_symbol_search_v1 import safe_rg_symbol_search_v1


def test_bounded_neo4j_expansion_query_and_limits():
    q = build_bounded_neo4j_expansion_query_v1(
        seed_ids=["cand:1", "cand:2"],
        workspace_revision="74ac7d8983e",
        max_hops=1,
        limit=50,
    )
    assert "r.status = 'ADMITTED'" in q["cypher"]
    assert "r.workspace_revision = $revision" in q["cypher"]
    assert q["params"]["seed_ids"] == ["cand:1", "cand:2"]

    with pytest.raises(ValueError, match="MAX_HOPS_OUT_OF_BOUNDS"):
        build_bounded_neo4j_expansion_query_v1(
            seed_ids=["cand:1"],
            workspace_revision="74ac7d8983e",
            max_hops=4,
        )


def test_ace_context_manifest_computes_proof_usable_fail_closed():
    reviewed = [
        {
            "candidate_id": "cand:1",
            "source_revision": "sha256:abc",
            "workspace_revision": "74ac7d8983e",
            "evidence_refs": ["ev:1"],
            "admission": "REVIEWED",
        }
    ]
    ok_manifest = assemble_ace_context_manifest_v2(
        task_id="task:1",
        workspace_revision="74ac7d8983e",
        embedding_model_revision="embeddinggemma@768",
        strategy="dense_bm25_rrf_graph",
        candidates=reviewed,
        ordinal_map_digest="sha256:ord",
    )
    assert ok_manifest["proof_usable"] is True

    unreviewed = [{**reviewed[0], "admission": "PROPOSED"}]
    blocked_manifest = assemble_ace_context_manifest_v2(
        task_id="task:1",
        workspace_revision="74ac7d8983e",
        embedding_model_revision="embeddinggemma@768",
        strategy="dense_bm25_rrf_graph",
        candidates=unreviewed,
        ordinal_map_digest="sha256:ord",
    )
    assert blocked_manifest["proof_usable"] is False


def test_safe_rg_symbol_search_v1_rejects_escape_and_finds_real_symbol():
    with pytest.raises(ValueError, match="SEARCH_ROOT_OUTSIDE_REPO"):
        safe_rg_symbol_search_v1(pattern="foo", search_root="../../outside", repo_root="python")

    hits = safe_rg_symbol_search_v1(
        pattern="build_bounded_neo4j_expansion_query_v1",
        search_root="python/atlas_graph_runtime",
        repo_root=".",
        max_count=5,
    )
    assert len(hits) >= 1
    assert hits[0]["source_ref"] == "python/atlas_graph_runtime/neo4j_bounded_expansion_v1.py"
    assert hits[0]["canonical_authority"] is False
