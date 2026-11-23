from __future__ import annotations

import json
from pathlib import Path

import numpy as np
import pytest

from atlas_graph_runtime.task_feature_gate_v1 import (
    build_idempotent_queue_proposals_v1,
    build_task_domain_csr_v1,
    build_task_keyword_csr_v1,
    evaluate_tournament_promotion_gate_v1,
    validate_task_batch_v1,
)

REPO_ROOT = Path(__file__).resolve().parents[2]
SHA_A = "sha256:" + "a" * 64
SHA_B = "sha256:" + "b" * 64


def _sample_tasks():
    return [
        {
            "taskId": "DOC-13",
            "taskRevision": "rev-1",
            "scope": "repo:deeds",
            "sourceRef": "src/a.ts",
            "sourceSha256": SHA_A,
            "text": "postgres pgvector index retrieval",
            "proposedDomains": ["database.postgresql", "retrieval", "documentation"],
        },
        {
            "taskId": "MEM-04",
            "taskRevision": "rev-2",
            "scope": "repo:deeds",
            "sourceRef": "src/b.ts",
            "sourceSha256": SHA_B,
            "text": "vram lease gpu eviction retrieval",
            "proposedDomains": ["gpu"],
        },
    ]


def test_rejects_duplicate_task_ids_and_cross_scope_candidates():
    tasks = _sample_tasks()
    with pytest.raises(ValueError, match="CROSS_SCOPE_TASK_REJECTED"):
        validate_task_batch_v1(tasks, expected_scope="other:scope")

    with pytest.raises(ValueError, match="DUPLICATE_TASK_ID"):
        validate_task_batch_v1([tasks[0], tasks[0]])


def test_builds_deterministic_keyword_and_proposed_domain_csr_arrays():
    tasks = _sample_tasks()
    kw = build_task_keyword_csr_v1(tasks)
    assert kw["shape"][0] == 2
    assert kw["indptr"].dtype == np.int32
    assert kw["data"].dtype == np.float32
    assert kw["canonicalAuthority"] is False

    dom = build_task_domain_csr_v1(
        tasks,
        allowed_domains=["database.postgresql", "retrieval", "gpu"],
    )
    assert dom["shape"] == [2, 3]
    assert dom["nnz"] == 3
    assert dom["unresolvedProposedDomains"] == ["documentation"]
    assert dom["proposalOnly"] is True

    proposals = build_idempotent_queue_proposals_v1(tasks)
    assert len(proposals) == 2
    assert proposals[0]["status"] == "PROPOSED"
    assert proposals[0]["idempotencyKey"].startswith("sha256:")


def test_blocks_promotion_of_live_cpu_tournament_when_eval_rows_below_30_or_utility_masked():
    tourney = json.loads(
        (REPO_ROOT / "docs" / "reports" / "cpu-challenger-tournament-v1.json").read_text(encoding="utf-8")
    )
    receipt = json.loads(
        (REPO_ROOT / "docs" / "reports" / "feature-matrix-5-receipt-v1.json").read_text(encoding="utf-8")
    )
    gate = evaluate_tournament_promotion_gate_v1(tourney, receipt, min_eval_rows=30)
    assert gate["promotionAllowed"] is False
    assert any(r.startswith("INSUFFICIENT_EVAL_GROUPS:") for r in gate["reasons"])
    assert any(r.startswith("EXECUTION_UTILITY_MASKED:") for r in gate["reasons"])
    assert gate["canonicalAuthority"] is False
    assert gate["writesPerformed"] is False
