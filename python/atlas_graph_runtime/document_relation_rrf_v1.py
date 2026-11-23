"""Document relation proposals, low-rank SVD recommendation, and RRF fusion for Parent Atlas.

Keeps predicted relevance edges (`TASK_RELEVANT_TO_DOCUMENT`) strictly separate from
verified structural/task edges (`FILE_IMPORTS_FILE`, `TASK_DEPENDS_ON_TASK`), and
verifies sourceRevision, graphRevision, and supportingSpans before ACE admission.
"""

from __future__ import annotations

import hashlib
import math
import re
from collections import defaultdict
from typing import Any, Callable, Mapping, Sequence

import numpy as np

VERIFIED_PREDICATES = frozenset({
    "DOCUMENT_HAS_CHUNK",
    "TASK_REFERENCES_DOCUMENT",
    "FILE_IMPORTS_FILE",
    "SYMBOL_CALLS_SYMBOL",
    "TASK_DEPENDS_ON_TASK",
})

OBSERVED_PREDICATES = frozenset({
    "DOCUMENT_LINKS_TO",
})

EXTRACTED_OR_PREDICTED_PREDICATES = frozenset({
    "CHUNK_MENTIONS_CONCEPT",
    "TASK_RELEVANT_TO_DOCUMENT",
})

ALL_RELATION_PREDICATES = VERIFIED_PREDICATES | OBSERVED_PREDICATES | EXTRACTED_OR_PREDICTED_PREDICATES

_SHA256 = re.compile(r"^sha256:[0-9a-f]{64}$")


def build_relation_proposal_v1(
    *,
    subject_kind: str,
    subject_id: str,
    subject_source_revision: str,
    object_kind: str,
    object_id: str,
    object_source_revision: str,
    predicate: str,
    method: str,
    source_ref: str,
    content_sha256: str,
    graph_revision: str | None = None,
) -> dict[str, Any]:
    """Build a revision-bound relation proposal packet (`canonicalAuthority=False`)."""
    if predicate not in ALL_RELATION_PREDICATES:
        raise ValueError(f"UNSUPPORTED_RELATION_PREDICATE:{predicate}")
    if not _SHA256.fullmatch(subject_source_revision) or not _SHA256.fullmatch(object_source_revision):
        raise ValueError("RELATION_SOURCE_REVISION_REQUIRED")
    if not re.fullmatch(r"^(?:sha256:)?[0-9a-f]{64}$", content_sha256):
        raise ValueError("RELATION_CONTENT_SHA256_REQUIRED")

    if predicate in EXTRACTED_OR_PREDICTED_PREDICATES:
        assertion = "PREDICTED"
    elif predicate in OBSERVED_PREDICATES:
        assertion = "OBSERVED"
    else:
        assertion = "VERIFIED"

    return {
        "schema": "atlas.relation-proposal.v1",
        "canonicalAuthority": False,
        "writesPerformed": False,
        "subject": {
            "kind": subject_kind,
            "id": subject_id,
            "sourceRevision": subject_source_revision,
        },
        "object": {
            "kind": object_kind,
            "id": object_id,
            "sourceRevision": object_source_revision,
        },
        "relation": {
            "predicate": predicate,
            "assertion": assertion,
            "method": method,
        },
        "evidence": {
            "sourceRef": source_ref,
            "contentSha256": content_sha256 if content_sha256.startswith("sha256:") else f"sha256:{content_sha256}",
        },
        "graphRevision": graph_revision,
        "admission": "PENDING",
    }


def svd_topk_recommend(
    matrix: np.ndarray,
    task_index: int,
    doc_ids: Sequence[str],
    *,
    rank_k: int = 4,
    top_k: int = 10,
) -> list[dict[str, Any]]:
    """Conventional truncated SVD approximation A ~= U_k Sigma_k V_k^T for task-document scoring."""
    arr = np.asarray(matrix, dtype=np.float64)
    if arr.ndim != 2:
        raise ValueError("SVD_MATRIX_MUST_BE_2D")
    n_tasks, n_docs = arr.shape
    if n_docs != len(doc_ids):
        raise ValueError("SVD_DOC_IDS_LENGTH_MISMATCH")
    if not (0 <= task_index < n_tasks):
        raise IndexError("SVD_TASK_INDEX_OUT_OF_RANGE")
    if n_tasks == 0 or n_docs == 0:
        return []

    k = max(1, min(rank_k, n_tasks, n_docs))
    u, s, vt = np.linalg.svd(arr, full_matrices=False)
    approx_row = (u[task_index, :k] * s[:k]) @ vt[:k, :]

    scored = [
        {"chunkId": doc_ids[j], "svdScore": float(approx_row[j])}
        for j in range(n_docs)
        if math.isfinite(float(approx_row[j]))
    ]
    scored.sort(key=lambda item: (-item["svdScore"], item["chunkId"]))
    return scored[:top_k]


def fuse_topk(
    lexical_ids: Sequence[str],
    dense_ids: Sequence[str],
    graph_ids: Sequence[str],
    lowrank_ids: Sequence[str],
    *,
    k: int = 10,
    rrf_constant: int = 60,
) -> list[dict[str, Any]]:
    """Reciprocal Rank Fusion across lexical, dense, graph, and low-rank candidate lanes."""
    if rrf_constant < 1:
        raise ValueError("RRF_CONSTANT_MUST_BE_POSITIVE")
    lanes = {
        "lexical": lexical_ids,
        "dense": dense_ids,
        "graph": graph_ids,
        "lowrank": lowrank_ids,
    }
    scores: dict[str, float] = defaultdict(float)
    contributing_lanes: dict[str, list[str]] = defaultdict(list)
    lane_ranks: dict[str, dict[str, int]] = defaultdict(dict)

    for lane, ids in lanes.items():
        for rank, doc_id in enumerate(dict.fromkeys(ids), 1):
            scores[doc_id] += 1.0 / (rrf_constant + rank)
            contributing_lanes[doc_id].append(lane)
            lane_ranks[doc_id][lane] = rank

    ordered = sorted(scores, key=lambda doc_id: (-scores[doc_id], doc_id))
    return [
        {
            "chunkId": doc_id,
            "fusionScore": scores[doc_id],
            "contributingLanes": contributing_lanes[doc_id],
            "laneRanks": lane_ranks[doc_id],
        }
        for doc_id in ordered[:k]
    ]


def admit_verified_topk(
    fused_candidates: Sequence[Mapping[str, Any]],
    lookup_candidate: Callable[[str], Mapping[str, Any] | None],
    *,
    limit: int = 10,
    expected_crawl_revision: str | None = None,
    require_domain_tags: bool = False,
) -> list[dict[str, Any]]:
    """Verify sourceRevision, graphRevision, crawlRevision/supersededBy, domainTags, and supportingSpans before ACE admission."""
    results: list[dict[str, Any]] = []
    for cand in fused_candidates:
        chunk_id = str(cand.get("chunkId") or "")
        record = lookup_candidate(chunk_id)
        if record is None:
            results.append({
                "chunkId": chunk_id,
                "fusionScore": cand.get("fusionScore", 0.0),
                "contributingLanes": cand.get("contributingLanes", []),
                "admissionStatus": "UNRESOLVED",
                "rejectionReason": "CHUNK_NOT_FOUND",
                "supportingSpans": [],
            })
            continue

        source_rev = record.get("sourceRevision")
        graph_rev = record.get("graphRevision")
        spans = record.get("supportingSpans") or []
        uses_graph = "graph" in (cand.get("contributingLanes") or [])
        superseded_by = record.get("supersededBy")
        crawl_rev = record.get("crawlRevision")
        domain_tags = record.get("domainTags")

        if superseded_by:
            status = "REJECTED"
            reason = "SUPERSEDED_DOC_CHUNK"
        elif expected_crawl_revision is not None and crawl_rev != expected_crawl_revision:
            status = "REJECTED"
            reason = "STALE_CRAWL_REVISION"
        elif require_domain_tags and (not isinstance(domain_tags, list) or len(domain_tags) == 0):
            status = "REJECTED"
            reason = "DOMAIN_TAGS_UNPOPULATED"
        elif not isinstance(source_rev, str) or not _SHA256.fullmatch(source_rev):
            status = "REJECTED"
            reason = "MISSING_SOURCE_REVISION"
        elif uses_graph and (not isinstance(graph_rev, str) or not _SHA256.fullmatch(graph_rev)):
            status = "UNRESOLVED"
            reason = "GRAPH_REVISION_REQUIRED"
        elif not isinstance(spans, list) or len(spans) == 0:
            status = "REJECTED"
            reason = "MISSING_SUPPORTING_SPANS"
        else:
            status = "ADMITTED"
            reason = None

        results.append({
            "chunkId": chunk_id,
            "taskKey": record.get("taskKey"),
            "fusionScore": float(cand.get("fusionScore", 0.0)),
            "scoreBreakdown": {
                "fusion": float(cand.get("fusionScore", 0.0)),
                "laneRanks": cand.get("laneRanks", {}),
            },
            "relationPaths": record.get("relationPaths", []),
            "sourceRevision": source_rev,
            "graphRevision": graph_rev,
            "admissionStatus": status,
            "rejectionReason": reason,
            "supportingSpans": spans,
        })
        if len([r for r in results if r["admissionStatus"] == "ADMITTED"]) >= limit:
            break
    return results
