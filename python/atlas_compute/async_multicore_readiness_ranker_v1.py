"""Async + multi-core RRF fusion ranker for Parent Atlas production readiness (v1).

Composes existing Parent Atlas building blocks:
- `asyncio` (`async`/`await` + `Semaphore`) for concurrent non-blocking lane probes
- Multi-core `ThreadPoolExecutor` / `ProcessPoolExecutor` for CPU feature scoring & RRF fusion
- `packed_feature_block_v1` (`PFB1` 104B header + LSB0 bitmask + 4-bit nibbles)
- `topk_paginator.stable_topk` (`SCORE_DESC_ORDINAL_ASC_ID_ASC`) for deterministic tie-breaking

Non-canonical advisory output (`canonicalAuthority=False`, `writesPerformed=False`).
"""

from __future__ import annotations

import asyncio
import hashlib
import math
import time
from concurrent.futures import ThreadPoolExecutor
from dataclasses import asdict, dataclass
from typing import Any, Awaitable, Callable, Sequence

import numpy as np

from atlas_compute.topk_paginator import stable_topk
from atlas_graph_runtime.packed_feature_block_v1 import encode_packed_feature_block_v1

SCHEMA_READINESS_FUSION_V1 = "atlas.production-readiness-fusion-ranker.v1"
RRF_K = 60


@dataclass(frozen=True)
class ReadinessCandidateV1:
    candidate_ordinal: int
    canonical_id: str
    title: str
    lane: str
    source_revision: str
    evidence_refs: tuple[str, ...]
    # Normalized 0.0..1.0 signals
    blocker_unwrap_weight: float
    evidence_completeness: float
    parity_verified: float
    headroom_safety: float
    execution_readiness: float
    recommended_command: str


@dataclass(frozen=True)
class FusedReadinessRecommendationV1:
    rank: int
    candidate_ordinal: int
    canonical_id: str
    title: str
    lane: str
    fusion_score: float
    rrf_score: float
    weighted_signal_score: float
    readiness_pct: float
    status_gate: str
    recommended_command: str
    source_revision: str
    evidence_refs: list[str]

    def to_dict(self) -> dict[str, Any]:
        return asdict(self)


def _clamp01(value: float) -> float:
    if not math.isfinite(value):
        return 0.0
    return max(0.0, min(1.0, float(value)))


def _score_candidate_chunk_cpu(candidates: Sequence[ReadinessCandidateV1]) -> list[tuple[int, float, float, list[int], list[int]]]:
    """CPU worker function executed across multi-core threads: computes signal scores + PFB1 bits/nibbles."""
    out: list[tuple[int, float, float, list[int], list[int]]] = []
    for c in candidates:
        b_unwrap = _clamp01(c.blocker_unwrap_weight)
        ev_comp = _clamp01(c.evidence_completeness)
        parity = _clamp01(c.parity_verified)
        headroom = _clamp01(c.headroom_safety)
        exec_ready = _clamp01(c.execution_readiness)

        # Actionability priority: prioritize high blocker unwrap + high execution readiness + safe headroom,
        # boosted when completion gap (1 - ev_comp) is still open.
        open_gap = 1.0 - (0.65 * ev_comp)
        weighted = (
            0.32 * b_unwrap
            + 0.24 * exec_ready
            + 0.18 * headroom
            + 0.14 * open_gap
            + 0.12 * parity
        )
        readiness_pct = round(100.0 * (0.35 * ev_comp + 0.30 * parity + 0.20 * exec_ready + 0.15 * headroom), 2)

        bits = [
            1 if b_unwrap >= 0.5 else 0,
            1 if ev_comp >= 0.5 else 0,
            1 if parity >= 0.5 else 0,
            1 if headroom >= 0.5 else 0,
            1 if exec_ready >= 0.5 else 0,
        ]
        nibbles = [
            min(15, int(round(b_unwrap * 15))),
            min(15, int(round(ev_comp * 15))),
            min(15, int(round(parity * 15))),
            min(15, int(round(headroom * 15))),
            min(15, int(round(exec_ready * 15))),
        ]
        out.append((c.candidate_ordinal, float(weighted), readiness_pct, bits, nibbles))
    return out


def compute_multi_lane_rrf(candidates: Sequence[ReadinessCandidateV1]) -> dict[int, float]:
    """Compute Reciprocal Rank Fusion across 4 independent ranking views (blocker, readiness, headroom, gap)."""
    if not candidates:
        return {}
    views = [
        sorted(candidates, key=lambda c: (-_clamp01(c.blocker_unwrap_weight), c.candidate_ordinal)),
        sorted(candidates, key=lambda c: (-_clamp01(c.execution_readiness), c.candidate_ordinal)),
        sorted(candidates, key=lambda c: (-_clamp01(c.headroom_safety), c.candidate_ordinal)),
        sorted(candidates, key=lambda c: (_clamp01(c.evidence_completeness), c.candidate_ordinal)),
    ]
    rrf: dict[int, float] = {c.candidate_ordinal: 0.0 for c in candidates}
    for ordered in views:
        for rank_idx, cand in enumerate(ordered, start=1):
            rrf[cand.candidate_ordinal] += 1.0 / (RRF_K + rank_idx)
    # Normalize RRF to 0..1 range relative to theoretical max (4 / (RRF_K + 1))
    max_rrf = len(views) / float(RRF_K + 1)
    return {ord_id: val / max_rrf for ord_id, val in rrf.items()}


async def run_async_multicore_readiness_ranker_v1(
    probes: Sequence[Callable[[], Awaitable[ReadinessCandidateV1]]],
    *,
    max_concurrency: int = 8,
    cpu_workers: int = 4,
    top_k: int = 10,
) -> dict[str, Any]:
    """Gather async readiness probes with bounded concurrency, score in multi-core pool, and fuse via RRF + stable_topk."""
    if max_concurrency < 1:
        raise ValueError("max_concurrency must be >= 1")
    if cpu_workers < 1:
        raise ValueError("cpu_workers must be >= 1")

    t0 = time.perf_counter()
    sem = asyncio.Semaphore(max_concurrency)

    async def _guarded(fn: Callable[[], Awaitable[ReadinessCandidateV1]]) -> ReadinessCandidateV1:
        async with sem:
            return await fn()

    gathered = await asyncio.gather(*(_guarded(p) for p in probes))
    candidates = sorted(gathered, key=lambda c: c.candidate_ordinal)
    for idx, c in enumerate(candidates):
        if c.candidate_ordinal != idx:
            raise ValueError(f"NON_DENSE_CANDIDATE_ORDINAL:{c.candidate_ordinal}!=expected:{idx}")

    probe_ms = (time.perf_counter() - t0) * 1000.0

    # Partition across multi-core worker pool
    t1 = time.perf_counter()
    chunk_size = max(1, (len(candidates) + cpu_workers - 1) // cpu_workers)
    chunks = [candidates[i : i + chunk_size] for i in range(0, len(candidates), chunk_size)]

    loop = asyncio.get_running_loop()
    with ThreadPoolExecutor(max_workers=cpu_workers) as pool:
        chunk_outputs = await asyncio.gather(
            *(loop.run_in_executor(pool, _score_candidate_chunk_cpu, ch) for ch in chunks)
        )

    flat_scores: dict[int, tuple[float, float]] = {}
    all_bits: list[int] = []
    all_nibbles: list[int] = []
    for ch_res in chunk_outputs:
        for ord_id, w_score, r_pct, bits, nibbles in ch_res:
            flat_scores[ord_id] = (w_score, r_pct)
            all_bits.extend(bits)
            all_nibbles.extend(nibbles)

    rrf_map = compute_multi_lane_rrf(candidates)
    pfb1_bytes = encode_packed_feature_block_v1(
        feature_map_rev=1,
        candidate_count=len(candidates),
        feature_count=5,
        bits=all_bits,
        nibbles=all_nibbles,
    )
    pfb1_sha256 = "sha256:" + hashlib.sha256(pfb1_bytes).hexdigest()

    topk_inputs: list[dict[str, Any]] = []
    by_ord = {c.candidate_ordinal: c for c in candidates}
    fusion_components: dict[int, tuple[float, float, float]] = {}

    for c in candidates:
        w_score, r_pct = flat_scores[c.candidate_ordinal]
        rrf_norm = rrf_map[c.candidate_ordinal]
        fusion = round(0.55 * w_score + 0.45 * rrf_norm, 6)
        fusion_components[c.candidate_ordinal] = (fusion, round(rrf_norm, 6), round(w_score, 6))
        topk_inputs.append(
            {
                "canonicalId": c.canonical_id,
                "candidateOrdinal": c.candidate_ordinal,
                "score": fusion,
                "sourceRevision": c.source_revision,
                "evidenceRefs": list(c.evidence_refs),
            }
        )

    topk_res = stable_topk(topk_inputs, k=min(top_k, max(len(topk_inputs), 1)), offset=0)
    compute_ms = (time.perf_counter() - t1) * 1000.0

    recommendations: list[dict[str, Any]] = []
    for rank_idx, item in enumerate(topk_res["candidates"], start=1):
        ord_id = item["candidateOrdinal"]
        c = by_ord[ord_id]
        fusion, rrf_s, w_s = fusion_components[ord_id]
        _, r_pct = flat_scores[ord_id]
        if c.headroom_safety < 0.4:
            gate = "BLOCKED_HEADROOM"
        elif c.execution_readiness < 0.4:
            gate = "OPERATOR_GATE_REQUIRED"
        elif r_pct >= 80.0:
            gate = "READY_FOR_VERIFICATION"
        else:
            gate = "ACTIONABLE_NEXT_STEP"

        recommendations.append(
            FusedReadinessRecommendationV1(
                rank=rank_idx,
                candidate_ordinal=ord_id,
                canonical_id=c.canonical_id,
                title=c.title,
                lane=c.lane,
                fusion_score=fusion,
                rrf_score=rrf_s,
                weighted_signal_score=w_s,
                readiness_pct=r_pct,
                status_gate=gate,
                recommended_command=c.recommended_command,
                source_revision=c.source_revision,
                evidence_refs=list(c.evidence_refs),
            ).to_dict()
        )

    return {
        "schema": SCHEMA_READINESS_FUSION_V1,
        "canonicalAuthority": False,
        "writesPerformed": False,
        "concurrency": {"asyncSemaphore": max_concurrency, "cpuWorkers": cpu_workers},
        "timingMs": {"asyncProbesMs": round(probe_ms, 2), "multicoreFusionMs": round(compute_ms, 2)},
        "pfb1Telemetry": {"bytes": len(pfb1_bytes), "sha256": pfb1_sha256},
        "totalCandidates": len(candidates),
        "order": topk_res["order"],
        "recommendations": recommendations,
    }
