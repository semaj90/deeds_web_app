"""Diagnostic INT4 comparison over the checked-in frozen semantic canary.

This deliberately does not query a live index or promote a representation. The
source export is a 15-row halfvec snapshot, and its receipt's PROVEN label
conflicts with identityAuthority=false; results are diagnostic only.
"""

from __future__ import annotations

import json
import hashlib
from pathlib import Path
import sys

import numpy as np
import pytest

from scripts.atlas.ampere_quantization import pack_int4, unpack_int4
from atlas_numpy_cpu_reference_v1 import exact_cosine_topk


ROOT = Path(__file__).resolve().parents[2]
VECTOR_PATH = ROOT / "docs/reports/semantic-768-canary-vectors-v1.json"
RECEIPT_PATH = ROOT / "docs/reports/lineage-semantic-768-cohort-v1.json"
TOP_K = 10


def _load_frozen_canary() -> tuple[dict, dict, list[dict], np.ndarray]:
    export = json.loads(VECTOR_PATH.read_text(encoding="utf-8"))
    receipt = json.loads(RECEIPT_PATH.read_text(encoding="utf-8"))
    candidates = sorted(export["candidates"], key=lambda row: row["candidateOrdinal"])

    if export.get("schema") != "atlas.semantic-768-canary-vectors.v1":
        raise ValueError("FROZEN_EXPORT_SCHEMA_MISMATCH")
    if export.get("sourceReceipt") != "docs/reports/lineage-semantic-768-cohort-v1.json":
        raise ValueError("SOURCE_RECEIPT_REFERENCE_MISMATCH")
    if export.get("candidateCount") != len(candidates) or not candidates:
        raise ValueError("FROZEN_EXPORT_ROW_COUNT_MISMATCH")
    if export.get("dimensions") != 768:
        raise ValueError("FROZEN_EXPORT_DIMENSION_MISMATCH")
    if not export.get("candidateSnapshotRevision") or not export.get("ordinalMapChecksum"):
        raise ValueError("FROZEN_SNAPSHOT_BINDING_MISSING")
    if export.get("vectorColumn") != "content_embedding" or export.get("sourceStorageDtype") != "halfvec":
        raise ValueError("UNEXPECTED_VECTOR_SOURCE_CONTRACT")
    if receipt.get("contract", {}).get("representationId") != "semantic_768":
        raise ValueError("REPRESENTATION_NOT_SEMANTIC_768")

    expected = sorted(receipt["candidates"], key=lambda row: row["candidateOrdinal"])
    ordinals = [row["candidateOrdinal"] for row in candidates]
    if ordinals != list(range(len(candidates))) or len(expected) != len(candidates):
        raise ValueError("CANDIDATE_ORDINAL_BINDING_INVALID")
    for actual, source in zip(candidates, expected, strict=True):
        if actual["codebaseChunkId"] != source["codebaseChunkId"]:
            raise ValueError("CANONICAL_CANDIDATE_BINDING_MISMATCH")
        if not source.get("sourceRevision") or not source.get("workspaceRevision"):
            raise ValueError("SOURCE_LINEAGE_MISSING")

    vectors = np.asarray([row["vector"] for row in candidates], dtype=np.float32)
    if vectors.shape != (len(candidates), 768) or not np.isfinite(vectors).all():
        raise ValueError("FROZEN_VECTOR_MATRIX_INVALID")
    vector_checksum = hashlib.sha256(np.ascontiguousarray(vectors, dtype="<f4").tobytes()).hexdigest()
    if vector_checksum != export.get("inputVectorsChecksum"):
        raise ValueError("FROZEN_VECTOR_CHECKSUM_MISMATCH")
    binding = ",".join(f"{row['candidateOrdinal']}:{row['codebaseChunkId']}" for row in candidates)
    binding_checksum = hashlib.sha256(binding.encode("utf-8")).hexdigest()
    if binding_checksum != export.get("orderedCandidateBindingChecksum"):
        raise ValueError("ORDERED_CANDIDATE_BINDING_CHECKSUM_MISMATCH")
    return export, receipt, candidates, vectors


def _load_candidate_map(receipt: dict) -> dict:
    relative_path = str(receipt["candidateMap"]["path"]).replace("\\", "/")
    return json.loads((ROOT / relative_path).read_text(encoding="utf-8"))


def _normalized_rows(matrix: np.ndarray) -> np.ndarray:
    norms = np.linalg.norm(matrix, axis=1, keepdims=True)
    if np.any(norms <= 0):
        raise ValueError("ZERO_NORM_VECTOR")
    return matrix / norms


def _compare_frozen_int4(vectors: np.ndarray, row_ids: list[str]) -> dict[str, float | int | str]:
    queries = vectors
    decoded = unpack_int4(pack_int4(vectors))
    quantized_queries = unpack_int4(pack_int4(queries))
    exact_rankings = [
        exact_cosine_topk(vectors, query, k=min(TOP_K, len(vectors)), row_ids=row_ids)
        for query in queries
    ]
    int4_rankings = [
        exact_cosine_topk(decoded, query, k=min(TOP_K, len(vectors)), row_ids=row_ids)
        for query in quantized_queries
    ]
    recalls = [
        len({row_id for row_id, _ in exact}.intersection(row_id for row_id, _ in candidate)) / len(exact)
        for exact, candidate in zip(exact_rankings, int4_rankings, strict=True)
    ]
    normalized_original = _normalized_rows(vectors)
    normalized_decoded = _normalized_rows(decoded)
    return {
        "rows": int(vectors.shape[0]),
        "dimensions": int(vectors.shape[1]),
        "packedBytesPerRow": int(pack_int4(vectors[:1]).shape[1]),
        "meanRecallAt10": float(np.mean(recalls)),
        "minRecallAt10": float(np.min(recalls)),
        "meanCosineReconstruction": float(np.mean(np.sum(normalized_original * normalized_decoded, axis=1))),
        "maxAbsoluteComponentError": float(np.max(np.abs(vectors - decoded))),
        "scoringScope": "FROZEN_EXPORT_EXACT_DENSE_REFERENCE_NOT_LIVE_INDEX",
        "promotionStatus": "DIAGNOSTIC_ONLY",
    }


def test_noncanonical_frozen_export_stays_diagnostic_only() -> None:
    export, receipt, candidates, vectors = _load_frozen_canary()
    candidate_map = _load_candidate_map(receipt)

    assert export["candidateCount"] == len(candidates) == 15
    assert vectors.shape == (15, 768)
    assert export["canonicalAuthority"] is False
    assert candidate_map["identityAuthority"] is False


def test_legacy_proven_label_does_not_override_non_authoritative_identity() -> None:
    export, receipt, _candidates, _vectors = _load_frozen_canary()
    candidate_map = _load_candidate_map(receipt)

    assert receipt["status"] == "SEMANTIC_768_COHORT_PROVEN"
    assert candidate_map["identityAuthority"] is False
    assert export["canonicalAuthority"] is False


def test_int4_comparison_is_deterministic_and_not_live_index_claim() -> None:
    _export, _receipt, candidates, vectors = _load_frozen_canary()
    row_ids = [row["codebaseChunkId"] for row in candidates]

    first = _compare_frozen_int4(vectors, row_ids)
    second = _compare_frozen_int4(vectors.copy(), row_ids)

    assert first == second
    assert first["packedBytesPerRow"] == 384
    assert first["meanRecallAt10"] <= 1.0
    assert first["minRecallAt10"] >= 0.0
    assert first["scoringScope"] == "FROZEN_EXPORT_EXACT_DENSE_REFERENCE_NOT_LIVE_INDEX"
    assert first["promotionStatus"] == "DIAGNOSTIC_ONLY"


def test_frozen_canary_exposes_quantizer_quality_without_promoting_it() -> None:
    _export, _receipt, candidates, vectors = _load_frozen_canary()

    result = _compare_frozen_int4(vectors, [row["codebaseChunkId"] for row in candidates])

    assert result["rows"] == 15
    assert result["dimensions"] == 768
    assert result["meanRecallAt10"] < 1.0
    assert result["promotionStatus"] == "DIAGNOSTIC_ONLY"


@pytest.mark.parametrize(
    ("field", "error"),
    [
        ("inputVectorsChecksum", "FROZEN_VECTOR_CHECKSUM_MISMATCH"),
        ("orderedCandidateBindingChecksum", "ORDERED_CANDIDATE_BINDING_CHECKSUM_MISMATCH"),
    ],
)
def test_frozen_export_checksum_drift_fails_closed(tmp_path: Path, monkeypatch, field: str, error: str) -> None:
    export = json.loads(VECTOR_PATH.read_text(encoding="utf-8"))
    export[field] = "0" * 64
    corrupted = tmp_path / "corrupted-canary.json"
    corrupted.write_text(json.dumps(export), encoding="utf-8")
    monkeypatch.setattr(sys.modules[__name__], "VECTOR_PATH", corrupted)

    with pytest.raises(ValueError, match=error):
        _load_frozen_canary()
