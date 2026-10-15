"""Fail-closed INT4 retrieval benchmark scaffold.

A quantization result is only reportable against a frozen, lineage-qualified cohort and an exact
FP32 Top-K baseline. Without both, the benchmark reports BLOCKED and makes no claim.

Self-tests here use a seeded synthetic matrix only to check the harness logic. They are not evidence
for the real corpus.
"""
from __future__ import annotations

import hashlib
import json
import os
from pathlib import Path

import numpy as np
import pytest

K = 10
BLOCK = 32  # blockwise scale: one scale per 32 values along each row


def _topk(scores: np.ndarray, k: int) -> np.ndarray:
    return np.argsort(-scores, axis=1, kind="stable")[:, :k]


def _recall(candidate: np.ndarray, baseline: np.ndarray) -> float:
    return float(np.mean([len(set(c) & set(b)) / len(b) for c, b in zip(candidate, baseline)]))


def _int4_blockwise(x: np.ndarray) -> np.ndarray:
    """Quantize to signed 4-bit with one scale per BLOCK values, then dequantize."""
    n, d = x.shape
    assert d % BLOCK == 0, "dims must be divisible by the block size"
    blocks = x.reshape(n, d // BLOCK, BLOCK)
    scale = np.abs(blocks).max(axis=2, keepdims=True) / 7.0
    scale = np.where(scale == 0, 1.0, scale)
    q = np.clip(np.round(blocks / scale), -8, 7)
    return (q * scale).reshape(n, d).astype(np.float32)


def load_frozen_cohort():
    """Return (vectors, queries, lineage) only when a frozen cohort is declared. Otherwise None.

    Required env: ATLAS_FROZEN_COHORT (path to .npz with 'vectors', 'queries') and
    ATLAS_FROZEN_COHORT_SHA256 (expected sha256 of that file), plus ATLAS_COHORT_LINEAGE (JSON file
    naming source_ref, sourceRevision and packet_key for each row).
    """
    path = os.environ.get("ATLAS_FROZEN_COHORT")
    expected = os.environ.get("ATLAS_FROZEN_COHORT_SHA256")
    lineage_path = os.environ.get("ATLAS_COHORT_LINEAGE")
    if not (path and expected and lineage_path):
        return None
    raw = Path(path).read_bytes()
    if hashlib.sha256(raw).hexdigest() != expected:
        raise AssertionError("frozen cohort checksum mismatch: refusing to benchmark")
    data = np.load(path)
    lineage = json.loads(Path(lineage_path).read_text(encoding="utf-8"))
    if len(lineage) != data["vectors"].shape[0]:
        raise AssertionError("lineage row count does not match vectors: refusing to benchmark")
    return data["vectors"].astype(np.float32), data["queries"].astype(np.float32), lineage


def test_harness_refuses_without_frozen_cohort():
    """Fail-closed: with no declared cohort, the benchmark must report BLOCKED, not a number."""
    if os.environ.get("ATLAS_FROZEN_COHORT"):
        pytest.skip("cohort declared; BLOCKED path not applicable")
    assert load_frozen_cohort() is None


def test_checksum_mismatch_refuses(tmp_path, monkeypatch):
    npz = tmp_path / "cohort.npz"
    np.savez(npz, vectors=np.zeros((4, 32), np.float32), queries=np.zeros((1, 32), np.float32))
    lin = tmp_path / "lineage.json"
    lin.write_text("[]", encoding="utf-8")
    monkeypatch.setenv("ATLAS_FROZEN_COHORT", str(npz))
    monkeypatch.setenv("ATLAS_FROZEN_COHORT_SHA256", "0" * 64)
    monkeypatch.setenv("ATLAS_COHORT_LINEAGE", str(lin))
    with pytest.raises(AssertionError, match="checksum mismatch"):
        load_frozen_cohort()


def test_lineage_row_count_must_match(tmp_path, monkeypatch):
    npz = tmp_path / "cohort.npz"
    np.savez(npz, vectors=np.zeros((4, 32), np.float32), queries=np.zeros((1, 32), np.float32))
    digest = hashlib.sha256(npz.read_bytes()).hexdigest()
    lin = tmp_path / "lineage.json"
    lin.write_text("[]", encoding="utf-8")
    monkeypatch.setenv("ATLAS_FROZEN_COHORT", str(npz))
    monkeypatch.setenv("ATLAS_FROZEN_COHORT_SHA256", digest)
    monkeypatch.setenv("ATLAS_COHORT_LINEAGE", str(lin))
    with pytest.raises(AssertionError, match="lineage row count"):
        load_frozen_cohort()


def test_harness_parity_on_synthetic_matrix():
    """Harness self-check only: exact FP32 vs itself must give recall 1.0; INT4 recall is reported, not judged."""
    rng = np.random.default_rng(5)
    x = rng.standard_normal((512, 128)).astype(np.float32)
    q = rng.standard_normal((16, 128)).astype(np.float32)
    x /= np.linalg.norm(x, axis=1, keepdims=True)
    q /= np.linalg.norm(q, axis=1, keepdims=True)
    baseline = _topk(q @ x.T, K)
    assert _recall(_topk(q @ x.T, K), baseline) == 1.0
    int4 = _int4_blockwise(x)
    recall = _recall(_topk(q @ int4.T, K), baseline)
    assert 0.0 <= recall <= 1.0  # measured, not a pass/fail threshold on synthetic data
