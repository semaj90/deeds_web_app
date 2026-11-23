import asyncio
import pytest

from atlas_compute.async_dag_worker_v1 import WorkerBinding
from atlas_compute.candidate_concept_tile_v1 import materialize_batch, sealed_ordinal_map_checksum
from atlas_compute.rlm_dspy_tournament_dag_v1 import (
    TournamentCandidatePromptV1,
    TournamentProposalOutputV1,
    run_prefill_error_fix_tournament_v1,
    run_tiled_topk_recommendation_v1,
)


@pytest.mark.asyncio
async def test_tournament_dag_selects_highest_verified_candidate_and_drops_stale():
    candidates = [
        TournamentCandidatePromptV1(
            candidate_ordinal=0,
            canonical_id="fix:a",
            agent_role="dspy_json_repair",
            subprompt_id="SUBPROMPT-REPAIR-A",
            model_revision="gemma4-legal-iq4xs-direct.gguf",
            source_revision="src:r1",
            evidence_refs=("src/lib/foo.ts#L10",),
        ),
        TournamentCandidatePromptV1(
            candidate_ordinal=1,
            canonical_id="fix:b",
            agent_role="rlm_ast_patch",
            subprompt_id="SUBPROMPT-REPAIR-B",
            model_revision="gemma4-legal-iq4xs-direct.gguf",
            source_revision="src:r1",
            evidence_refs=("src/lib/foo.ts#L10",),
        ),
        TournamentCandidatePromptV1(
            candidate_ordinal=2,
            canonical_id="fix:c_stale",
            agent_role="stale_challenger",
            subprompt_id="SUBPROMPT-REPAIR-C",
            model_revision="gemma4-legal-iq4xs-direct.gguf",
            source_revision="src:r1",
            evidence_refs=("src/lib/foo.ts#L10",),
        ),
    ]

    async def claim(_binding: WorkerBinding) -> bool:
        return True

    async def read_current(binding: WorkerBinding) -> WorkerBinding:
        if binding.step_id.endswith(":2"):
            return WorkerBinding(
                binding.run_id,
                binding.step_id,
                binding.dag_revision,
                "src:r2_stale",
                binding.workspace_revision,
                binding.graph_revision,
                binding.model_revision,
                binding.lease_id,
                binding.claim_generation,
            )
        return binding

    async def propose(cand: TournamentCandidatePromptV1) -> TournamentProposalOutputV1:
        await asyncio.sleep(0.005)
        if cand.candidate_ordinal == 0:
            return TournamentProposalOutputV1(score=0.72, patch_targets=("src/lib/foo.ts",), rationale="A", verifier_passed=True)
        if cand.candidate_ordinal == 1:
            return TournamentProposalOutputV1(score=0.91, patch_targets=("src/lib/foo.ts",), rationale="B", verifier_passed=True)
        return TournamentProposalOutputV1(score=0.99, patch_targets=("src/lib/foo.ts",), rationale="Stale", verifier_passed=True)

    receipt = await run_prefill_error_fix_tournament_v1(
        run_id="run-1",
        dag_revision="dag-v1",
        workspace_revision="ws-v1",
        graph_revision="gr-v1",
        candidates=candidates,
        claim=claim,
        read_current=read_current,
        propose_fn=propose,
    )

    assert receipt["canonicalAuthority"] is False
    assert receipt["writesPerformed"] is False
    assert receipt["candidateCount"] == 3
    assert receipt["admissibleCount"] == 2
    assert receipt["winner"]["canonicalId"] == "fix:b"
    assert receipt["winner"]["score"] == 0.91
    assert receipt["outcomes"][2]["workerStatus"] == "STALE"


@pytest.mark.asyncio
async def test_tiled_4096_topk_recommendation_runs_under_async_dag_worker():
    n = 4096
    rows = [
        {
            "packet_key": f"p{i}",
            "source_revision": "sr1",
            "workspace_revision": "wr1",
            "graph_revision": "gr1",
            "representation_revision": "rr1",
            "domain_taxonomy_revision": "dr1",
            "feature_schema_revision": "fr1",
            "revision_status": "PROVEN",
            "exact_match": float((i % 7) + 1) / 7.0,
            "nary_facts": [
                {
                    "fact_id": "f",
                    "checksum": "abc",
                    "evidence_refs": ["e"],
                    "participant_ids": ["p1", "p2"],
                    "participant_roles": ["subject", "object"],
                    "graph_revision": "gr1",
                }
            ],
        }
        for i in range(n)
    ]
    groups = [rows[k : k + 4] for k in range(0, n, 4)]
    ordinals = [list(range(k, min(k + 4, n))) for k in range(0, n, 4)]
    sealed_map = {
        "candidateSnapshotRevision": "snapshot-v1",
        "workspaceRevision": "wr1",
        "rowCount": n,
        "candidates": [
            {
                "candidateOrdinal": i,
                "canonicalId": f"c{i}",
                "packetKey": f"p{i}",
                "sourceRevision": "sr1",
                "workspaceRevision": "wr1",
                "candidateSnapshotRevision": "snapshot-v1",
            }
            for i in range(n)
        ],
    }
    sealed_map["ordinalMapChecksum"] = sealed_ordinal_map_checksum(sealed_map)

    batch = materialize_batch(groups, ordinals=ordinals, sealed_ordinal_map=sealed_map)
    binding = WorkerBinding("run-tile", "tile-step", "dag1", "sr1", "wr1", "gr1", "rlm-tile-v1", "lease-tile", 1)

    async def claim(_b: WorkerBinding) -> bool:
        return True

    async def read_current(b: WorkerBinding) -> WorkerBinding:
        return b

    res = await run_tiled_topk_recommendation_v1(
        batch=batch,
        weights=[1.0, 0.0, 0.0, 0.0, 0.0, 0.0],
        bias=0.0,
        top_k=5,
        binding=binding,
        claim=claim,
        read_current=read_current,
        sealed_map=sealed_map,
    )
    assert res.status == "PROPOSED"
    assert res.payload["schema"] == "atlas.candidate-score-receipt.v2"
    assert res.payload["canonicalAuthority"] is False
    assert res.payload["writesPerformed"] is False
    assert len(res.payload["topKOrdinals"]) == 5
    # Deterministic ordinal tie-break: first 5 ordinals with i % 7 == 6 (6, 13, 20, 27, 34)
    assert res.payload["topKOrdinals"] == [6, 13, 20, 27, 34]
