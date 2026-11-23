"""RLM / DSPy Multi-Agentic Error-Fixing Prefill DAG Tournament (v1).

Composes existing Parent Atlas owners without creating a second scheduler or FSM:
- `AsyncDagWorker` (`atlas_compute.async_dag_worker_v1`) for bounded, revision-locked execution
- `stable_topk` (`atlas_compute.topk_paginator`) for deterministic tournament winner selection

Produces proposal-only (`canonicalAuthority=False`, `writesPerformed=False`) receipts
ready for external admission and readback gates.
"""

from __future__ import annotations

import asyncio
from dataclasses import dataclass
from typing import Any, Awaitable, Callable, Sequence

from atlas_compute.async_dag_worker_v1 import AsyncDagWorker, WorkerBinding, WorkerResult
from atlas_compute.candidate_concept_tile_v1 import (
    ConceptTileBatchV1,
    bind_batch_to_sealed_map,
    score_batch_cpu,
    scoring_receipt,
)
from atlas_compute.topk_paginator import stable_topk


@dataclass(frozen=True)
class TournamentCandidatePromptV1:
    candidate_ordinal: int
    canonical_id: str
    agent_role: str
    subprompt_id: str
    model_revision: str
    source_revision: str
    evidence_refs: tuple[str, ...]
    max_tokens: int = 1024


@dataclass(frozen=True)
class TournamentProposalOutputV1:
    score: float
    patch_targets: tuple[str, ...]
    rationale: str
    verifier_passed: bool


async def run_prefill_error_fix_tournament_v1(
    *,
    run_id: str,
    dag_revision: str,
    workspace_revision: str,
    graph_revision: str,
    candidates: Sequence[TournamentCandidatePromptV1],
    claim: Callable[[WorkerBinding], Awaitable[bool]],
    read_current: Callable[[WorkerBinding], Awaitable[WorkerBinding]],
    propose_fn: Callable[[TournamentCandidatePromptV1], Awaitable[TournamentProposalOutputV1]],
    worker: AsyncDagWorker | None = None,
    timeout_seconds: float = 15.0,
) -> dict[str, Any]:
    """Run bounded parallel DSPy/RLM repair proposals and select a deterministic tournament winner."""
    runner = worker or AsyncDagWorker(io_limit=4, cpu_limit=2, gpu_limit=1)

    async def execute_candidate(cand: TournamentCandidatePromptV1) -> WorkerResult:
        binding = WorkerBinding(
            run_id=run_id,
            step_id=f"tournament:{cand.agent_role}:{cand.candidate_ordinal}",
            dag_revision=dag_revision,
            source_revision=cand.source_revision,
            workspace_revision=workspace_revision,
            graph_revision=graph_revision,
            model_revision=cand.model_revision,
            lease_id=f"lease:{run_id}:{cand.candidate_ordinal}",
            claim_generation=1,
        )
        return await runner.run(
            kind="io",
            binding=binding,
            claim=claim,
            read_current=read_current,
            operation=lambda c=cand: propose_fn(c),
            timeout_seconds=timeout_seconds,
        )

    worker_results = await asyncio.gather(*(execute_candidate(c) for c in candidates))

    admissible_for_ranking: list[dict[str, Any]] = []
    by_ordinal: dict[int, dict[str, Any]] = {}
    outcomes: list[dict[str, Any]] = []

    for cand, res in zip(candidates, worker_results):
        entry = {
            "candidateOrdinal": cand.candidate_ordinal,
            "canonicalId": cand.canonical_id,
            "agentRole": cand.agent_role,
            "subpromptId": cand.subprompt_id,
            "workerStatus": res.status,
            "reason": res.reason,
            "sourceRevision": cand.source_revision,
            "evidenceRefs": list(cand.evidence_refs),
        }
        if res.status == "PROPOSED" and isinstance(res.payload, TournamentProposalOutputV1):
            payload = res.payload
            if payload.verifier_passed and len(cand.evidence_refs) > 0:
                entry["score"] = float(payload.score)
                entry["patchTargets"] = list(payload.patch_targets)
                entry["rationale"] = payload.rationale
                admissible_for_ranking.append(entry)
                by_ordinal[cand.candidate_ordinal] = entry
        outcomes.append(entry)

    topk_result = stable_topk(admissible_for_ranking, k=1, offset=0)
    winner = by_ordinal[topk_result["candidates"][0]["candidateOrdinal"]] if topk_result["candidates"] else None

    return {
        "schema": "atlas.rlm-dspy-tournament-dag.v1",
        "authorityLabel": "TOURNAMENT_PREFILL_PROPOSAL",
        "canonicalAuthority": False,
        "writesPerformed": False,
        "runId": run_id,
        "dagRevision": dag_revision,
        "candidateCount": len(candidates),
        "admissibleCount": len(admissible_for_ranking),
        "topkSchema": topk_result["schema"],
        "winner": winner,
        "outcomes": outcomes,
    }


async def run_tiled_topk_recommendation_v1(
    *,
    batch: ConceptTileBatchV1,
    weights: Sequence[float],
    bias: float,
    top_k: int,
    binding: WorkerBinding,
    claim: Callable[[WorkerBinding], Awaitable[bool]],
    read_current: Callable[[WorkerBinding], Awaitable[WorkerBinding]],
    sealed_map: dict[str, Any] | None = None,
    worker: AsyncDagWorker | None = None,
) -> WorkerResult:
    """Execute read-only 4,096-row candidate tile scoring + top-K receipt inside AsyncDagWorker."""
    runner = worker or AsyncDagWorker(io_limit=4, cpu_limit=2, gpu_limit=1)

    async def _score_tile() -> dict[str, Any]:
        if sealed_map is not None:
            bind_batch_to_sealed_map(batch, sealed_map)
        scores = score_batch_cpu(batch, weights, bias)
        return scoring_receipt(batch, scores, model_revision=binding.model_revision, top_k=top_k)

    return await runner.run(
        kind="cpu",
        binding=binding,
        claim=claim,
        read_current=read_current,
        operation=_score_tile,
    )
