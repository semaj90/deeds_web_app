from __future__ import annotations

from pathlib import Path
import json
import tempfile

import pytest

import numpy as np

from atlas_graph_runtime.mcts_grpo_array_queue_v1 import (
    BoundedLinkedQueueV1,
    build_feature_and_topology_arrays_v1,
    load_grpo_pairs_jsonl,
    run_mcts_grpo_rollout_v1,
)

REPO_ROOT = Path(__file__).resolve().parents[2]


def test_bounded_linked_queue_o1_touch_and_eviction():
    q = BoundedLinkedQueueV1(max_items=2, max_bytes=128)
    assert q.push_or_touch("a", 1, byte_size=32) == []
    assert q.push_or_touch("b", 2, byte_size=32) == []
    # Touch 'a' so 'b' becomes oldest
    assert q.push_or_touch("a", 10, byte_size=32) == []
    assert q.keys_in_order() == ["b", "a"]
    # Adding 'c' evicts 'b'
    evicted = q.push_or_touch("c", 3, byte_size=32)
    assert evicted == ["b"]
    assert q.keys_in_order() == ["a", "c"]
    assert q.pop_front() == ("a", 10)


def test_feature_and_4d_topology_arrays_are_contiguous_float32():
    rows = [[0.1, 0.2, 0.3, 0.4, 0.5], [0.9, 0.8, 0.7, 0.6, 0.5], [0.4, 0.5, 0.6, 0.7, 0.8]]
    out = build_feature_and_topology_arrays_v1(rows, prefer_cuml_umap=True)
    assert out["featureArray"].dtype == np.float32
    assert out["featureArray"].flags["C_CONTIGUOUS"]
    assert out["topologyShape"] == [3, 4]
    assert out["derivedMetadataOnly"] is True
    assert out["canonicalAuthority"] is False


def test_mcts_rejects_heuristic_doc14_pairs_as_unverified_training_data():
    pairs_path = REPO_ROOT / "docs" / "reports" / "doc14-grpo-pairs-v1.jsonl"
    with pytest.raises(ValueError, match="PREFERENCE_PAIR_NOT_INDEPENDENTLY_VERIFIED"):
        load_grpo_pairs_jsonl(pairs_path)


def test_mcts_accepts_only_verified_preference_pairs_without_promotion():
    pair = {
        "schema": "atlas.verified-preference-pair.v1",
        "chosen": "chunk-a",
        "rejected": "chunk-b",
        "chosenReward": 1.0,
        "rejectedReward": 0.25,
        "rewardSource": "INDEPENDENTLY_VERIFIED",
        "rewardReceiptId": "review-receipt-01",
        "evidenceRefs": ["review://preference/01"],
        "trainingEligible": True,
    }
    with tempfile.TemporaryDirectory() as directory:
        pairs_path = Path(directory) / "pairs.jsonl"
        pairs_path.write_text(json.dumps(pair) + "\n", encoding="utf-8")
        pairs = load_grpo_pairs_jsonl(pairs_path)
    res = run_mcts_grpo_rollout_v1(pairs, max_simulations=24)
    assert res["status"] == "ROLLOUT_COMPLETE"
    assert res["simulations"] == 24
    assert res["schema"] == "atlas.mcts-preference-diagnostic.v1"
    assert len(res["normalizedRewardMargins"]) == len(pairs)
    assert res["rewardSource"] == "INDEPENDENTLY_VERIFIED_INPUT"
    assert res["experimentalLane"] is True
    assert res["promotionAllowed"] is False
    assert res["canonicalAuthority"] is False
    assert res["writesPerformed"] is False
    assert res["trainingRunPerformed"] is False
    assert res["policyUpdated"] is False
