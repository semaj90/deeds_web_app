"""Tests for memory-mapped Arrow + ephemeral-hidden-state FeatureMatrix MLP challenger."""
from __future__ import annotations

import logging
from pathlib import Path

import numpy as np

from atlas_graph_runtime.feature_matrix_mlp_challenger_v1 import (
    load_arrow_feature_tensors_v1,
    score_feature_matrix_arrow_v1,
)

ARROW_PATH = Path(__file__).resolve().parents[2] / "docs" / "reports" / "feature_matrix_5.arrow"


def test_load_arrow_feature_tensors_v1_mmap_and_telemetry(caplog) -> None:
    with caplog.at_level(logging.INFO, logger="atlas.feature_matrix_mlp_challenger_v1"):
        loaded = load_arrow_feature_tensors_v1(ARROW_PATH)
    assert loaded["features"].shape == (200, 5)
    assert loaded["presence_mask"].shape == (200, 5)
    assert loaded["features"].dtype == np.float32
    telemetry = loaded["memoryTelemetry"]
    assert telemetry["mmapUsed"] is True
    assert telemetry["zeroCopyValuesView"] is True
    assert telemetry["bufferReleased"] is True
    assert telemetry["tracemallocPeakBytes"] > 0
    assert any("arrow_mmap_loaded" in rec.message for rec in caplog.records)


def test_score_feature_matrix_arrow_v1_ephemeral_and_bounded() -> None:
    result = score_feature_matrix_arrow_v1(ARROW_PATH, top_k=3)
    assert result["backend"] == "numpy_cpu_oracle"
    assert result["canonicalAuthority"] is False
    assert result["writesPerformed"] is False
    assert result["hiddenStatePersisted"] is False
    assert result["rowCount"] == 200
    assert result["tensorShape"] == [200, 5]
    assert result["fullyMaskedColumnCount"] >= 1
    assert result["memoryTelemetry"]["mmapUsed"] is True
    assert result["memoryTelemetry"]["bufferReleased"] is True
    assert 0.0 <= result["scoreMin"] <= result["scoreMax"] <= 1.0
    assert len(result["topTuples"]) == 3
    for tup in result["topTuples"]:
        assert tup[4] == "PROPOSED"
        assert "hidden" not in str(tup).lower()
