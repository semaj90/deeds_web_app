"""Tests for L2 Valkey centroid + LangGraph batch top-K recommendation descriptor."""
from __future__ import annotations

from datetime import datetime, timedelta, timezone

import pytest

from atlas_graph_runtime.batch_l2_centroid_topk_recs_v1 import (
    build_l2_valkey_centroid_langgraph_descriptor_v1,
)


def test_l2_descriptor_filters_stale_ranks_topk_and_blocks_l1_or_raw_bodies() -> None:
    now = datetime.now(timezone.utc)
    docs = [
        {
            "candidateId": "cand-fresh-high",
            "verifiedClaim": True,
            "indexedAt": now - timedelta(hours=1),
            "meanReward": 0.85,
            "prior": 0.9,
            "visits": 1,
        },
        {
            "candidateId": "cand-superseded",
            "verifiedClaim": True,
            "indexedAt": now - timedelta(hours=1),
            "supersededBy": "node:v2",
            "meanReward": 0.99,
            "prior": 0.99,
            "visits": 0,
        },
        {
            "candidateId": "cand-fresh-low",
            "verifiedClaim": True,
            "indexedAt": now - timedelta(hours=2),
            "meanReward": 0.2,
            "prior": 0.4,
            "visits": 3,
        },
    ]

    desc = build_l2_valkey_centroid_langgraph_descriptor_v1(
        task_id="openspec-task-42",
        centroid_manifest_revision="centroid:v3",
        workspace_revision="ws:rev-99",
        documents=docs,
        top_k=5,
    )
    assert desc["cacheTier"] == "L2_VALKEY_CENTROID_LANGGRAPH"
    assert desc["l1RamBytesRetained"] == 0
    assert desc["canonicalAuthority"] is False
    assert desc["writesPerformed"] is False
    assert desc["hiddenStatePersisted"] is False
    assert desc["skippedStaleOrSupersededCount"] == 1
    assert desc["topKCandidateIds"] == ["cand-fresh-high", "cand-fresh-low"]
    assert desc["valkeyKey"].startswith("langgraph:cache:l2:centroid:")
    assert desc["descriptorChecksum"].startswith("sha256:")

    with pytest.raises(ValueError, match="L1_IN_PROCESS_CACHE_PROHIBITED"):
        build_l2_valkey_centroid_langgraph_descriptor_v1(
            task_id="t1",
            centroid_manifest_revision="centroid:v3",
            workspace_revision="ws:rev-99",
            documents=docs,
            cache_tier="L1_IN_MEMORY",
        )

    with pytest.raises(ValueError, match="FORBIDDEN_L2_DESCRIPTOR_KEY"):
        build_l2_valkey_centroid_langgraph_descriptor_v1(
            task_id="t1",
            centroid_manifest_revision="centroid:v3",
            workspace_revision="ws:rev-99",
            documents=[{**docs[0], "embedding": [0.1, 0.2]}],
        )
