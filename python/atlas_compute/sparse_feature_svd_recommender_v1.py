"""Bounded, CPU-only masked low-rank feature recommendation challenger.

This is an offline proposal lane. Unobserved context/feature pairs are masked
from the fit objective; they are never converted to explicit negative labels.
The implementation uses iterative truncated SVD (soft imputation), not Tang's
sublinear algorithm, and never writes to canonical stores or retrieval ranking.
"""

from __future__ import annotations

from dataclasses import asdict, dataclass
import hashlib
import json
import math
import time
from typing import Any, Mapping, Sequence

import numpy as np

SNAPSHOT_SCHEMA = "atlas.sparse-feature-snapshot.v1"
OUTPUT_SCHEMA = "atlas.sparse-feature-svd-recommendations.v1"
MAX_CONTEXTS = 512
MAX_CANDIDATES = 512
MAX_OBSERVATIONS = 20_000
OBSERVATION_FIELDS = (
    "contextRef",
    "contextRevision",
    "candidateFeatureKey",
    "candidateSourceRef",
    "candidateSourceRevision",
    "polarity",
    "evidenceClaimIds",
    "evidenceSourceRef",
    "evidenceSourceRevision",
    "evidenceSha256",
)


@dataclass(frozen=True)
class SparseFeatureRecommendation:
    rank: int
    candidate_feature_key: str
    candidate_source_ref: str
    candidate_source_revision: str
    score: float
    supporting_claim_ids: tuple[str, ...]


@dataclass(frozen=True)
class SparseFeatureSvdReceipt:
    schema: str
    status: str
    method: str
    device: str
    snapshot_sha256: str
    configuration_sha256: str
    output_sha256: str
    context_count: int
    candidate_count: int
    observed_pair_count: int
    unknown_pair_semantics: str
    target_context_ref: str
    rank: int
    iterations: int
    elapsed_ms: float
    estimated_workspace_bytes: int
    recommendations: tuple[SparseFeatureRecommendation, ...]
    admission: str
    canonical_authority: bool
    writes_performed: bool

    def to_dict(self) -> dict[str, Any]:
        return asdict(self)


def _digest(payload: bytes) -> str:
    return hashlib.sha256(payload).hexdigest()


def _utf16_sort_key(value: str) -> bytes:
    return value.encode("utf-16-be", errors="strict")


def _compact_json(value: Any) -> bytes:
    return json.dumps(value, ensure_ascii=False, separators=(",", ":"), allow_nan=False).encode("utf-8")


def _require_string(value: Any, field: str, maximum: int) -> str:
    if not isinstance(value, str) or not value.strip() or len(value) > maximum:
        raise ValueError(f"INVALID_SNAPSHOT_FIELD:{field}")
    return value


def validate_sparse_feature_snapshot(snapshot: Mapping[str, Any]) -> tuple[list[dict[str, Any]], str]:
    expected_fields = {
        "schema",
        "sourceSnapshotRef",
        "sourceSnapshotRevision",
        "candidateCatalogSnapshotSha256",
        "observations",
        "missingPairSemantics",
        "admission",
        "canonicalAuthority",
        "snapshotSha256",
    }
    if not isinstance(snapshot, Mapping) or set(snapshot) != expected_fields:
        raise ValueError("SPARSE_FEATURE_SNAPSHOT_SHAPE_INVALID")
    if snapshot["schema"] != SNAPSHOT_SCHEMA:
        raise ValueError("SPARSE_FEATURE_SNAPSHOT_SCHEMA_UNSUPPORTED")
    if snapshot["missingPairSemantics"] != "UNKNOWN_NOT_NEGATIVE":
        raise ValueError("SPARSE_FEATURE_SNAPSHOT_UNKNOWN_POLICY_INVALID")
    if snapshot["admission"] != "PROPOSAL_ONLY" or snapshot["canonicalAuthority"] is not False:
        raise ValueError("SPARSE_FEATURE_SNAPSHOT_AUTHORITY_INVALID")
    source_revision = _require_string(snapshot["sourceSnapshotRevision"], "sourceSnapshotRevision", 72)
    catalog_digest = _require_string(snapshot["candidateCatalogSnapshotSha256"], "candidateCatalogSnapshotSha256", 64)
    if not source_revision.startswith("sha256:") or len(source_revision) != 71:
        raise ValueError("SPARSE_FEATURE_SNAPSHOT_SOURCE_REVISION_INVALID")
    if len(catalog_digest) != 64 or any(char not in "0123456789abcdef" for char in catalog_digest):
        raise ValueError("SPARSE_FEATURE_SNAPSHOT_CATALOG_DIGEST_INVALID")
    _require_string(snapshot["sourceSnapshotRef"], "sourceSnapshotRef", 1_024)

    observations_value = snapshot["observations"]
    if not isinstance(observations_value, list) or len(observations_value) > MAX_OBSERVATIONS:
        raise ValueError("SPARSE_FEATURE_SNAPSHOT_OBSERVATION_LIMIT")
    observations: list[dict[str, Any]] = []
    pairs: set[tuple[str, str]] = set()
    context_revisions: dict[str, str] = {}
    candidate_revisions: dict[str, tuple[str, str]] = {}
    for raw in observations_value:
        if not isinstance(raw, Mapping) or set(raw) != set(OBSERVATION_FIELDS):
            raise ValueError("SPARSE_FEATURE_OBSERVATION_SHAPE_INVALID")
        item = {field: raw[field] for field in OBSERVATION_FIELDS}
        for field, limit in (
            ("contextRef", 1_024),
            ("candidateFeatureKey", 512),
            ("candidateSourceRef", 1_024),
            ("evidenceSourceRef", 1_024),
        ):
            item[field] = _require_string(item[field], field, limit)
        for field in ("contextRevision", "candidateSourceRevision", "evidenceSourceRevision"):
            revision = _require_string(item[field], field, 71)
            if not revision.startswith("sha256:") or len(revision) != 71:
                raise ValueError(f"INVALID_SNAPSHOT_FIELD:{field}")
        if item["polarity"] not in ("OBSERVED_ASSOCIATION", "EXPLICIT_NEGATIVE"):
            raise ValueError("SPARSE_FEATURE_OBSERVATION_POLARITY_INVALID")
        evidence_digest = _require_string(item["evidenceSha256"], "evidenceSha256", 64)
        if len(evidence_digest) != 64 or any(char not in "0123456789abcdef" for char in evidence_digest):
            raise ValueError("SPARSE_FEATURE_OBSERVATION_EVIDENCE_DIGEST_INVALID")
        if item["evidenceSourceRevision"] != f"sha256:{evidence_digest}":
            raise ValueError("SPARSE_FEATURE_OBSERVATION_EVIDENCE_REVISION_MISMATCH")
        claim_ids = item["evidenceClaimIds"]
        if not isinstance(claim_ids, list) or not 1 <= len(claim_ids) <= 16 or any(not isinstance(claim_id, str) for claim_id in claim_ids):
            raise ValueError("SPARSE_FEATURE_OBSERVATION_CLAIMS_INVALID")
        item["evidenceClaimIds"] = sorted(claim_ids, key=_utf16_sort_key)

        pair = (item["contextRef"], item["candidateFeatureKey"])
        if pair in pairs:
            raise ValueError("DUPLICATE_OR_CONFLICTING_CONTEXT_FEATURE_PAIR")
        pairs.add(pair)
        previous_context_revision = context_revisions.setdefault(item["contextRef"], item["contextRevision"])
        if previous_context_revision != item["contextRevision"]:
            raise ValueError("CONTEXT_REVISION_CONFLICT")
        candidate_revision = (item["candidateSourceRef"], item["candidateSourceRevision"])
        previous_candidate_revision = candidate_revisions.setdefault(item["candidateFeatureKey"], candidate_revision)
        if previous_candidate_revision != candidate_revision:
            raise ValueError("CANDIDATE_SOURCE_REVISION_CONFLICT")
        observations.append(item)

    observations.sort(key=lambda row: (
        _utf16_sort_key(row["contextRef"]),
        _utf16_sort_key(row["candidateFeatureKey"]),
    ))
    body = {
        "schema": SNAPSHOT_SCHEMA,
        "sourceSnapshotRef": snapshot["sourceSnapshotRef"],
        "sourceSnapshotRevision": source_revision,
        "candidateCatalogSnapshotSha256": catalog_digest,
        "observations": observations,
        "missingPairSemantics": "UNKNOWN_NOT_NEGATIVE",
        "admission": "PROPOSAL_ONLY",
        "canonicalAuthority": False,
    }
    expected_digest = _digest(_compact_json(body))
    actual_digest = _require_string(snapshot["snapshotSha256"], "snapshotSha256", 64)
    if actual_digest != expected_digest:
        raise ValueError("SPARSE_FEATURE_SNAPSHOT_DIGEST_MISMATCH")
    return observations, actual_digest


def recommend_sparse_features_v1(
    snapshot: Mapping[str, Any],
    target_context_ref: str,
    *,
    rank: int = 8,
    max_iterations: int = 12,
    tolerance: float = 1e-5,
    top_k: int = 10,
) -> SparseFeatureSvdReceipt:
    """Fit masked truncated-SVD completion on CPU and propose unknown pairs."""
    if not isinstance(rank, int) or isinstance(rank, bool) or not 1 <= rank <= 32:
        raise ValueError("RANK_OUT_OF_BOUNDS")
    if not isinstance(max_iterations, int) or isinstance(max_iterations, bool) or not 1 <= max_iterations <= 20:
        raise ValueError("ITERATIONS_OUT_OF_BOUNDS")
    if not isinstance(tolerance, (int, float)) or not math.isfinite(float(tolerance)) or not 0 < tolerance <= 0.01:
        raise ValueError("TOLERANCE_OUT_OF_BOUNDS")
    if not isinstance(top_k, int) or isinstance(top_k, bool) or not 1 <= top_k <= 50:
        raise ValueError("TOP_K_OUT_OF_BOUNDS")
    target_context_ref = _require_string(target_context_ref, "target_context_ref", 1_024)
    observations, snapshot_digest = validate_sparse_feature_snapshot(snapshot)
    contexts = sorted({row["contextRef"] for row in observations}, key=_utf16_sort_key)
    candidates = sorted({row["candidateFeatureKey"] for row in observations}, key=_utf16_sort_key)
    if len(contexts) > MAX_CONTEXTS or len(candidates) > MAX_CANDIDATES:
        raise ValueError("SPARSE_FEATURE_MATRIX_LIMIT")
    if target_context_ref not in contexts:
        raise ValueError("TARGET_CONTEXT_NOT_IN_SNAPSHOT")

    configuration = {
        "algorithm": "masked_soft_impute_truncated_svd_cpu_v1",
        "rank": rank,
        "maxIterations": max_iterations,
        "tolerance": float(tolerance),
        "topK": top_k,
        "missingPairSemantics": "UNKNOWN_NOT_NEGATIVE",
        "device": "cpu",
    }
    configuration_digest = _digest(_compact_json(configuration))
    started = time.perf_counter()
    context_index = {value: index for index, value in enumerate(contexts)}
    candidate_index = {value: index for index, value in enumerate(candidates)}
    values = np.zeros((len(contexts), len(candidates)), dtype=np.float64)
    observed = np.zeros(values.shape, dtype=np.bool_)
    by_pair: dict[tuple[str, str], dict[str, Any]] = {}
    candidate_identity: dict[str, tuple[str, str]] = {}
    for row in observations:
        i = context_index[row["contextRef"]]
        j = candidate_index[row["candidateFeatureKey"]]
        observed[i, j] = True
        values[i, j] = 1.0 if row["polarity"] == "OBSERVED_ASSOCIATION" else -1.0
        by_pair[(row["contextRef"], row["candidateFeatureKey"])] = row
        candidate_identity[row["candidateFeatureKey"]] = (
            row["candidateSourceRef"], row["candidateSourceRevision"],
        )

    context_count, candidate_count = values.shape
    if context_count < 2 or candidate_count < 2 or int(observed.sum()) < 3:
        elapsed_ms = round((time.perf_counter() - started) * 1_000, 3)
        return _receipt(
            status="INSUFFICIENT_DATA",
            snapshot_digest=snapshot_digest,
            configuration_digest=configuration_digest,
            contexts=contexts,
            candidates=candidates,
            observed=observed,
            target_context_ref=target_context_ref,
            rank=rank,
            iterations=0,
            elapsed_ms=elapsed_ms,
            estimated_workspace_bytes=int(values.nbytes * 4),
            recommendations=(),
        )

    effective_rank = min(rank, context_count, candidate_count)
    completed = np.where(observed, values, 0.0)
    iterations = 0
    for iteration in range(max_iterations):
        left, singular_values, right = np.linalg.svd(completed, full_matrices=False)
        reconstruction = (left[:, :effective_rank] * singular_values[:effective_rank]) @ right[:effective_rank, :]
        updated = np.where(observed, values, reconstruction)
        difference = float(np.linalg.norm(updated - completed))
        baseline = max(float(np.linalg.norm(completed)), 1e-12)
        completed = updated
        iterations = iteration + 1
        if difference / baseline <= tolerance:
            break

    target_index = context_index[target_context_ref]
    known_positive = {
        key for (context_ref, key), row in by_pair.items()
        if context_ref == target_context_ref and row["polarity"] == "OBSERVED_ASSOCIATION"
    }
    known_any = {key for (context_ref, key) in by_pair if context_ref == target_context_ref}
    candidate_scores = [
        (float(completed[target_index, candidate_index[key]]), key)
        for key in candidates if key not in known_any and key not in known_positive
    ]
    candidate_scores.sort(key=lambda item: (-item[0], _utf16_sort_key(item[1])))
    recommendations: list[SparseFeatureRecommendation] = []
    target_support = [
        row for row in observations
        if row["contextRef"] == target_context_ref and row["polarity"] == "OBSERVED_ASSOCIATION"
    ]
    for score, key in candidate_scores[:top_k]:
        cross_context_support = [
            row for row in observations
            if row["candidateFeatureKey"] == key and row["polarity"] == "OBSERVED_ASSOCIATION"
        ]
        support_ids = sorted({
            claim_id
            for row in [*target_support, *cross_context_support]
            for claim_id in row["evidenceClaimIds"]
        }, key=_utf16_sort_key)
        source_ref, source_revision = candidate_identity[key]
        recommendations.append(SparseFeatureRecommendation(
            rank=len(recommendations) + 1,
            candidate_feature_key=key,
            candidate_source_ref=source_ref,
            candidate_source_revision=source_revision,
            score=round(score, 12),
            supporting_claim_ids=tuple(support_ids[:16]),
        ))

    elapsed_ms = round((time.perf_counter() - started) * 1_000, 3)
    return _receipt(
        status="PROPOSED",
        snapshot_digest=snapshot_digest,
        configuration_digest=configuration_digest,
        contexts=contexts,
        candidates=candidates,
        observed=observed,
        target_context_ref=target_context_ref,
        rank=effective_rank,
        iterations=iterations,
        elapsed_ms=elapsed_ms,
        estimated_workspace_bytes=int(values.nbytes * 4),
        recommendations=tuple(recommendations),
    )


def _receipt(
    *,
    status: str,
    snapshot_digest: str,
    configuration_digest: str,
    contexts: Sequence[str],
    candidates: Sequence[str],
    observed: np.ndarray,
    target_context_ref: str,
    rank: int,
    iterations: int,
    elapsed_ms: float,
    estimated_workspace_bytes: int,
    recommendations: tuple[SparseFeatureRecommendation, ...],
) -> SparseFeatureSvdReceipt:
    results = [asdict(item) for item in recommendations]
    deterministic_output = {
        "schema": OUTPUT_SCHEMA,
        "status": status,
        "snapshotSha256": snapshot_digest,
        "configurationSha256": configuration_digest,
        "targetContextRef": target_context_ref,
        "recommendations": results,
        "admission": "PROPOSAL_ONLY",
        "canonicalAuthority": False,
        "writesPerformed": False,
    }
    return SparseFeatureSvdReceipt(
        schema=OUTPUT_SCHEMA,
        status=status,
        method="masked_soft_impute_truncated_svd_cpu_v1",
        device="cpu",
        snapshot_sha256=snapshot_digest,
        configuration_sha256=configuration_digest,
        output_sha256=_digest(_compact_json(deterministic_output)),
        context_count=len(contexts),
        candidate_count=len(candidates),
        observed_pair_count=int(observed.sum()),
        unknown_pair_semantics="UNKNOWN_NOT_NEGATIVE",
        target_context_ref=target_context_ref,
        rank=rank,
        iterations=iterations,
        elapsed_ms=elapsed_ms,
        estimated_workspace_bytes=estimated_workspace_bytes,
        recommendations=recommendations,
        admission="PROPOSAL_ONLY",
        canonical_authority=False,
        writes_performed=False,
    )
