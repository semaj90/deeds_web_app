"""Tests for golden-label queue export, fail-closed corpus freeze, and J-space/MLP benchmark."""
from __future__ import annotations

import pytest

from atlas_graph_runtime.golden_label_workbench_v1 import (
    benchmark_jspace_mlp_vs_oracle_v1,
    validate_and_freeze_golden_corpus_v1,
)


def test_validate_and_freeze_rejects_pending_or_below_floor() -> None:
    pending = [
        {
            "packetKey": "p1",
            "sourceRef": "a.ts",
            "sourceSha256": "sha256:1",
            "reviewStatus": "PENDING_HUMAN_REVIEW",
            "goldDomainId": None,
            "reviewer": None,
        }
    ]
    with pytest.raises(ValueError, match="UNREVIEWED_ROWS_PRESENT"):
        validate_and_freeze_golden_corpus_v1(pending, min_total=1, min_per_class=1)

    approved_small = [
        {
            "packetKey": f"p{i}",
            "sourceRef": f"a{i}.ts",
            "sourceSha256": f"sha256:{i}",
            "reviewStatus": "REVIEWED_APPROVED",
            "goldDomainId": "database.postgresql",
            "reviewer": "human-op",
        }
        for i in range(5)
    ]
    with pytest.raises(ValueError, match="GOLDEN_FLOOR_NOT_MET"):
        validate_and_freeze_golden_corpus_v1(approved_small, min_total=200, min_per_class=30)


def test_freeze_and_benchmark_jspace_mlp_fixture() -> None:
    approved = [
        {
            "packetKey": f"p{i}",
            "sourceRef": f"a{i}.ts",
            "sourceSha256": f"sha256:{i}",
            "reviewStatus": "REVIEWED_APPROVED",
            "goldDomainId": "database.postgresql" if i % 2 == 0 else "frontend.sveltekit",
            "reviewer": "human-op",
            "scores": {
                "jspacePred": "database.postgresql" if i % 2 == 0 else "frontend.sveltekit",
                "jspaceProb": 0.9,
                "mlpPred": "database.postgresql",
                "mlpProb": 0.6,
            },
        }
        for i in range(10)
    ]
    frozen = validate_and_freeze_golden_corpus_v1(approved, min_total=10, min_per_class=5)
    assert frozen["corpusSha256"].startswith("sha256:")
    bench = benchmark_jspace_mlp_vs_oracle_v1(frozen)
    assert bench["canonicalAuthority"] is False
    assert bench["writesPerformed"] is False
    assert bench["hiddenStatePersisted"] is False
    assert bench["sampleCount"] == 10
    assert bench["jspace"]["accuracy"] == 1.0
    assert bench["mlpChallenger"]["accuracy"] == 0.5
