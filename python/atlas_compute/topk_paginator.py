"""Memory-bounded Top-K extraction and pagination for Parent Atlas.

Enables bounded multi-hop graph fanout and candidate score sorting
without allocating full sorted index arrays. Enforces canonical
SCORE_DESC_ORDINAL_ASC_ID_ASC ordering across Python CPU, PyTorch,
and TypeScript backends to eliminate nondeterministic tie discrepancies.
"""

from __future__ import annotations

import heapq
import math
from typing import Any, Mapping, NamedTuple, Sequence, TypedDict, Literal
import torch


class RankedCandidateV1(TypedDict):
    canonicalId: str
    candidateOrdinal: int
    score: float
    sourceRevision: str
    evidenceRefs: list[str]


class CanonicalTopKResultV1(TypedDict):
    schema: Literal["atlas.topk.v1"]
    totalCandidates: int
    offset: int
    k: int
    hasMore: bool
    order: Literal["SCORE_DESC_ORDINAL_ASC_ID_ASC"]
    candidates: list[RankedCandidateV1]


class TopKResult(NamedTuple):
    indices: torch.Tensor
    scores: torch.Tensor
    total_candidates: int
    k: int
    offset: int
    has_more: bool


class _MinHeapCandidate:
    """Wraps a candidate for a bounded min-heap that evicts the WORST candidate.

    Under SCORE_DESC_ORDINAL_ASC_ID_ASC, candidate A is WORSE than candidate B if:
    1. A has lower score
    2. A has HIGHER candidateOrdinal on score tie
    3. A has lexicographically GREATER canonicalId on ordinal tie

    In the min-heap, __lt__ returns True if self is WORSE than other,
    ensuring the worst candidate floats to heap[0] for eviction.
    """

    __slots__ = ("candidate", "score", "ordinal", "cid")

    def __init__(self, candidate: Mapping[str, Any]):
        raw_score = float(candidate["score"])
        if not math.isfinite(raw_score):
            raise ValueError(f"Non-finite candidate score: {raw_score}")

        self.score = raw_score
        self.ordinal = int(candidate.get("candidateOrdinal", candidate.get("candidate_ordinal", 0)))
        self.cid = str(candidate.get("canonicalId", candidate.get("canonical_id", candidate.get("id", ""))))
        self.candidate: RankedCandidateV1 = {
            "canonicalId": self.cid,
            "candidateOrdinal": self.ordinal,
            "score": self.score,
            "sourceRevision": str(candidate.get("sourceRevision", candidate.get("source_revision", ""))),
            "evidenceRefs": list(candidate.get("evidenceRefs", candidate.get("evidence_refs", []))),
        }

    def __lt__(self, other: _MinHeapCandidate) -> bool:
        if self.score != other.score:
            return self.score < other.score
        if self.ordinal != other.ordinal:
            return self.ordinal > other.ordinal
        return self.cid > other.cid


def stable_topk(
    candidates: Sequence[Mapping[str, Any]],
    k: int,
    offset: int = 0,
) -> CanonicalTopKResultV1:
    """Bounded, deterministic CPU Top-K selection conforming to atlas.topk.v1.

    Ordering rule: SCORE_DESC_ORDINAL_ASC_ID_ASC:
    1. Higher score first
    2. Lower candidateOrdinal on score ties
    3. Lexicographically smaller canonicalId on remaining ties

    Rejects non-finite scores with ValueError.
    Runs in O(N log(offset + k)) time and O(offset + k) space.
    """
    if k < 0 or offset < 0:
        raise ValueError("k and offset must be nonnegative")

    total_candidates = len(candidates)
    if k == 0 or total_candidates == 0 or offset >= total_candidates:
        return {
            "schema": "atlas.topk.v1",
            "totalCandidates": total_candidates,
            "offset": offset,
            "k": k,
            "hasMore": False,
            "order": "SCORE_DESC_ORDINAL_ASC_ID_ASC",
            "candidates": [],
        }

    target_capacity = offset + k
    heap: list[_MinHeapCandidate] = []

    for item in candidates:
        wrapped = _MinHeapCandidate(item)
        if len(heap) < target_capacity:
            heapq.heappush(heap, wrapped)
        elif heap[0] < wrapped:
            # wrapped is BETTER than the current worst in the top pool
            heapq.heapreplace(heap, wrapped)

    # Sort descending according to canonical rule:
    # 1. -score (descending score)
    # 2. ordinal (ascending ordinal)
    # 3. cid (ascending lexicographical ID)
    sorted_top = sorted(heap, key=lambda c: (-c.score, c.ordinal, c.cid))
    page_items = [c.candidate for c in sorted_top[offset : offset + k]]

    return {
        "schema": "atlas.topk.v1",
        "totalCandidates": total_candidates,
        "offset": offset,
        "k": k,
        "hasMore": offset + len(page_items) < total_candidates,
        "order": "SCORE_DESC_ORDINAL_ASC_ID_ASC",
        "candidates": page_items,
    }


def topk_paginate(
    scores: torch.Tensor,
    k: int = 10,
    offset: int = 0,
    descending: bool = True,
    ordinals: torch.Tensor | None = None,
    canonical_ids: Sequence[str] | None = None,
    expansion_budget: int = 1024,
) -> TopKResult:
    """Extract a paginated Top-K slice from a 1D score tensor with boundary tie resolution.

    PyTorch torch.topk does not guarantee stable index ordering on value ties.
    This function inspects ties at the selection boundary. When boundary scores
    tie, candidates equal to the cutoff are expanded and ordered deterministically
    using ordinals and canonical_ids.

    Args:
        scores: 1D Tensor of shape [N] containing candidate scores.
        k: Page size (number of candidates to return).
        offset: Starting index within the sorted candidates.
        descending: If True, highest scores first (default).
        ordinals: Optional 1D Tensor of shape [N] for deterministic tie-breaking.
        canonical_ids: Optional sequence of strings for tertiary tie-breaking.
        expansion_budget: Max candidates to expand at boundary before CPU failover.

    Returns:
        TopKResult containing paginated indices, scores, total count, and has_more flag.
    """
    if scores.ndim != 1:
        raise ValueError(f"scores tensor must be 1-dimensional, got ndim={scores.ndim}")
    if k <= 0:
        raise ValueError(f"k must be positive, got {k}")
    if offset < 0:
        raise ValueError(f"offset must be non-negative, got {offset}")

    if not torch.isfinite(scores).all():
        raise ValueError("Non-finite candidate score in tensor")

    total_candidates = scores.shape[0]
    if total_candidates == 0 or offset >= total_candidates:
        empty_idx = torch.empty(0, dtype=torch.long, device=scores.device)
        empty_scores = torch.empty(0, dtype=scores.dtype, device=scores.device)
        return TopKResult(
            indices=empty_idx,
            scores=empty_scores,
            total_candidates=total_candidates,
            k=k,
            offset=offset,
            has_more=False,
        )

    target_capacity = min(offset + k, total_candidates)

    if not descending:
        # For ascending sorts, negate scores and recurse
        res = topk_paginate(
            -scores,
            k=k,
            offset=offset,
            descending=True,
            ordinals=ordinals,
            canonical_ids=canonical_ids,
            expansion_budget=expansion_budget,
        )
        return TopKResult(
            indices=res.indices,
            scores=-res.scores,
            total_candidates=res.total_candidates,
            k=res.k,
            offset=res.offset,
            has_more=res.has_more,
        )

    # 1. Shortlist extraction via torch.topk
    top_scores, top_indices = torch.topk(
        scores,
        k=target_capacity,
        dim=0,
        largest=True,
        sorted=True,
    )

    cutoff_score = top_scores[-1].item()

    # 2. Check if boundary ties exist
    # If the cutoff score occurs multiple times across the tensor, torch.topk
    # might have picked arbitrary indices.
    tie_mask = scores == cutoff_score
    tie_count = int(tie_mask.sum().item())

    if tie_count > 1 and (ordinals is not None or canonical_ids is not None):
        # Boundary tie detected!
        # Check if total candidates with score >= cutoff_score fit within expansion budget
        strict_better_mask = scores > cutoff_score
        candidate_count = int(strict_better_mask.sum().item()) + tie_count

        if candidate_count <= expansion_budget:
            # Expand and sort exactly on CPU using canonical tie break
            better_indices = torch.nonzero(strict_better_mask).squeeze(-1).tolist()
            tie_indices = torch.nonzero(tie_mask).squeeze(-1).tolist()
            candidate_pool_indices = better_indices + tie_indices

            ord_list = ordinals.tolist() if ordinals is not None else [0] * total_candidates
            cid_list = list(canonical_ids) if canonical_ids is not None else [f"cand_{i}" for i in range(total_candidates)]
            score_list = scores.tolist()

            candidate_records = [
                {
                    "idx": idx,
                    "score": score_list[idx],
                    "candidateOrdinal": ord_list[idx],
                    "canonicalId": cid_list[idx],
                }
                for idx in candidate_pool_indices
            ]

            # Canonical sort: (-score, ordinal, cid)
            candidate_records.sort(
                key=lambda c: (-c["score"], c["candidateOrdinal"], c["canonicalId"])
            )

            sorted_indices = [c["idx"] for c in candidate_records[:target_capacity]]
            sorted_scores = [c["score"] for c in candidate_records[:target_capacity]]

            page_indices_list = sorted_indices[offset:target_capacity]
            page_scores_list = sorted_scores[offset:target_capacity]

            device = scores.device
            page_idx = torch.tensor(page_indices_list, dtype=torch.long, device=device)
            page_sc = torch.tensor(page_scores_list, dtype=scores.dtype, device=device)

            return TopKResult(
                indices=page_idx,
                scores=page_sc,
                total_candidates=total_candidates,
                k=k,
                offset=offset,
                has_more=offset + page_idx.shape[0] < total_candidates,
            )
        else:
            # Exceeded budget: fail over to stable_topk CPU heap
            ord_list = ordinals.tolist() if ordinals is not None else [0] * total_candidates
            cid_list = list(canonical_ids) if canonical_ids is not None else [f"cand_{i}" for i in range(total_candidates)]
            score_list = scores.tolist()
            all_records = [
                {
                    "idx": i,
                    "score": score_list[i],
                    "candidateOrdinal": ord_list[i],
                    "canonicalId": cid_list[i],
                }
                for i in range(total_candidates)
            ]
            cpu_res = stable_topk(all_records, k=k, offset=offset)
            page_idx_list = [int(c["canonicalId"].replace("cand_", "")) if c["canonicalId"].startswith("cand_") else 0 for c in cpu_res["candidates"]]
            page_sc_list = [c["score"] for c in cpu_res["candidates"]]
            return TopKResult(
                indices=torch.tensor(page_idx_list, dtype=torch.long, device=scores.device),
                scores=torch.tensor(page_sc_list, dtype=scores.dtype, device=scores.device),
                total_candidates=total_candidates,
                k=k,
                offset=offset,
                has_more=cpu_res["hasMore"],
            )

    # 3. If no ties at boundary or no ordinals, check if within top_scores there are ties
    if ordinals is not None and target_capacity > 1:
        # Check if any ties exist strictly within the selected top_scores
        diffs = top_scores[:-1] == top_scores[1:]
        if diffs.any():
            ord_list = ordinals[top_indices].tolist()
            cid_list = [canonical_ids[i] for i in top_indices.tolist()] if canonical_ids is not None else [f"cand_{i}" for i in top_indices.tolist()]
            sc_list = top_scores.tolist()
            top_idx_list = top_indices.tolist()

            zipped = list(zip(top_idx_list, sc_list, ord_list, cid_list))
            zipped.sort(key=lambda x: (-x[1], x[2], x[3]))

            top_indices = torch.tensor([x[0] for x in zipped], dtype=torch.long, device=scores.device)
            top_scores = torch.tensor([x[1] for x in zipped], dtype=scores.dtype, device=scores.device)

    page_scores = top_scores[offset:target_capacity]
    page_indices = top_indices[offset:target_capacity]
    has_more = offset + page_indices.shape[0] < total_candidates

    return TopKResult(
        indices=page_indices,
        scores=page_scores,
        total_candidates=total_candidates,
        k=k,
        offset=offset,
        has_more=has_more,
    )
