#!/usr/bin/env python3
"""Read-only, synthetic-fixture smoke using *existing* Parent Atlas contracts.

Never runs a model, DSPy optimizer, tool executor, service, database or cache.
Exit nonzero if the real OaK/Pydantic and DSPy validator contracts disagree.
"""
from __future__ import annotations

import json
from pathlib import Path
import sys
from types import SimpleNamespace

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT))

from python.oak_agent.structured_contracts_v1 import (
    FindFailureContextArgsV1, FailureContextEvidenceV1, build_failure_context_result_v1,
)
from python.atlas_oak_gepa_alignment_v1 import (
    prepare_oak_repair_handoff_v1, verify_oak_repair_handoff_v1, run_shadow_repair_proposal_v1,
    verify_shadow_repair_proposal_v1,
)

A = "sha256:" + "a" * 64
B = "sha256:" + "b" * 64
C = "sha256:" + "c" * 64


def main() -> None:
    args = FindFailureContextArgsV1(
        requestId="fixture:oak-gepa:1", taskProfileChecksum=A,
        admittedFactIds=("fixture:fact:1",), admittedFactChecksums=(B,),
        workspaceRevision=C, ontologyRevision="fixture:ontology:v1",
        policyRevision="fixture:policy:v1", maxNeighbors=2, maxHops=2,
        canonicalAuthority=False,
    )
    evidence = FailureContextEvidenceV1(
        factId="fixture:fact:1", factChecksum=B,
        evidenceRef="fixture:src/example.ts#symbol:fn", relation="USES_SYMBOL", distance=1,
    )
    result = build_failure_context_result_v1(
        request_id=args.requestId, status="AVAILABLE", evidence=(evidence,),
        ontology_revision=args.ontologyRevision, policy_revision=args.policyRevision,
        producer_revision="fixture:oak:v1",
    )
    handoff = prepare_oak_repair_handoff_v1(
        oak_args=args, oak_result=result,
        context_manifest_checksum=A,
        allowed_evidence_refs=[evidence.evidenceRef],
        allowed_target_ids=["fixture:function:fn"],
        query="Fixture TS2345 in example.ts",
    )
    verify_oak_repair_handoff_v1(handoff)

    def fixture_program(**kwargs):
        return SimpleNamespace(
            diagnosis="Fixture-only diagnosis, no source examined",
            target_candidates=json.dumps(["fixture:function:fn"]),
            evidence_refs=json.dumps([evidence.evidenceRef]),
            patch_plan="No patch generated; fixture only",
            validation_plan="Run repository tests if a real patch is proposed",
        )

    proposal = run_shadow_repair_proposal_v1(
        handoff, fixture_program, program_revision="fixture:dspy:program:v1"
    )
    verify_shadow_repair_proposal_v1(proposal, handoff=handoff)
    print(json.dumps({
        "schema": "atlas.oak-gepa-compat-smoke.v1",
        "status": "CONTRACT_FIXTURE_PASS",
        "realWorktreeContractsInvoked": True,
        "fixtureOnly": True,
        "handoffChecksum": handoff["handoffChecksum"],
        "proposalReceiptChecksum": proposal["proposalReceiptChecksum"],
        "dspyRuntimeInvoked": False,
        "gepaOptimizerInvoked": False,
        "validatorStatus": "NOT_RUN",
        "canonicalAuthority": False,
        "writesPerformed": False,
    }, sort_keys=True, indent=2))

if __name__ == "__main__":
    main()
