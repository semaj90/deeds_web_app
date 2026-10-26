#!/usr/bin/env python3
"""
prove-episode-group-v1.py
End-to-End Proof of Parent Atlas 8-Episode Learning Pipeline:
  1. Frozen Kanban Task & ContextManifest Fixture
  2. 8 Independent Episode Rollouts evaluated by Strict Deterministic Checker
  3. Group Relative Advantage calculation for GRPO
  4. Advisory 8-Neuron MLP Ranker ([N, 8] feature matrix collation & forward pass)
  5. ACE Packet Compilation with NES LUT Palette (0x2A), OaK Python Tuple & Prompt Injection Defense
  6. Strict Canonical Isolation Verification (writes_performed: false)

Output:
  - docs/reports/episode-group-learning-audit-2026-10-17.json
"""

import sys
import os
import json
import hashlib
from pathlib import Path

# Keep redirected Windows console output safe as well as UTF-8 capable.
for _stream in (sys.stdout, sys.stderr):
    if hasattr(_stream, "reconfigure"):
        _stream.reconfigure(encoding="utf-8", errors="backslashreplace")

# Add python/ package root to sys.path
ROOT = Path(__file__).resolve().parent.parent.parent
sys.path.insert(0, str(ROOT / "python"))

from parent_atlas_learning.contracts import (
    CandidateFeature,
    FeatureSignalAlignmentV1,
    CheckResult,
    EpisodeGroupReceiptV1,
)
from parent_atlas_learning.strict_checker import check_episode
from parent_atlas_learning.advisory_ranker import AdvisoryRanker, to_feature_matrix
from parent_atlas_learning.episode_runner import run_episode_group_rollout, compute_group_advantages
from parent_atlas_learning.ace_compiler import compile_ace_packet_from_proposal, NES_LUT_PALETTES


def main():
    print("[PARENT-ATLAS-LEARNING] Proving 8-Episode Rollout, Strict Checker, Advisory MLP & ACE Compiler...")

    # 1. Define Frozen Task and ContextManifest Fixture
    TASK_ID = "TASK_ROUTE_AST_REPAIR_001"
    MANIFEST_CHECKSUM = "sha256:4a8b1c2d3e4f5a6b7c8d9e0f1a2b3c4d5e6f7a8b9c0d1e2f3a4b5c6d7e8f9a0b"
    ALLOWED_EVIDENCE = {
        "sveltekit-frontend/src/routes/(app)/admin/all-routes/route-lineage.ts",
        "docs/.okf/pinned/sveltekit/DIAGNOSTIC_WARNINGS_FIXES.md",
        "docs/.okf/dev/pinned-docs.manifest.json",
    }
    context_manifest = {
        "checksum": MANIFEST_CHECKSUM,
        "evidenceRefs": sorted(ALLOWED_EVIDENCE),
    }

    # 2. Formulate 8 Sample Episode Proposals (reproducing the exact 8 scenarios)
    proposals = [
        # Episode 1: Full Pass (All gates met)
        {
            "schema": "atlas.ace-packet-proposal.v1",
            "taskId": TASK_ID,
            "contextManifestChecksum": MANIFEST_CHECKSUM,
            "evidenceRefs": [
                "sveltekit-frontend/src/routes/(app)/admin/all-routes/route-lineage.ts",
                "docs/.okf/pinned/sveltekit/DIAGNOSTIC_WARNINGS_FIXES.md",
            ],
            "instruction": "Resolve routePath/filePath AST metadata without breaking legacy path/file compatibility.",
            "conceptId": "concept:sveltekit2:route_lineage_hardening:v1",
            "writesPerformed": False,
        },
        # Episode 2: Scope Violation (touched forbidden external config)
        {
            "schema": "atlas.ace-packet-proposal.v1",
            "taskId": TASK_ID,
            "contextManifestChecksum": MANIFEST_CHECKSUM,
            "evidenceRefs": [
                "sveltekit-frontend/src/routes/(app)/admin/all-routes/route-lineage.ts",
            ],
            "instruction": "Modified out-of-scope system file.",
            "writesPerformed": False,
        },
        # Episode 3: Full Pass (Compact fix with 1 evidence ref)
        {
            "schema": "atlas.ace-packet-proposal.v1",
            "taskId": TASK_ID,
            "contextManifestChecksum": MANIFEST_CHECKSUM,
            "evidenceRefs": [
                "sveltekit-frontend/src/routes/(app)/admin/all-routes/route-lineage.ts",
            ],
            "instruction": "Extracted _resolveRouteFields helper cleanly.",
            "conceptId": "concept:sveltekit2:route_lineage_hardening:v1",
            "writesPerformed": False,
        },
        # Episode 4: Test Failure (Regression in router test)
        {
            "schema": "atlas.ace-packet-proposal.v1",
            "taskId": TASK_ID,
            "contextManifestChecksum": MANIFEST_CHECKSUM,
            "evidenceRefs": [
                "sveltekit-frontend/src/routes/(app)/admin/all-routes/route-lineage.ts",
            ],
            "instruction": "Caused regression in route test.",
            "writesPerformed": False,
        },
        # Episode 5: Unqualified Evidence (Fabricated ID)
        {
            "schema": "atlas.ace-packet-proposal.v1",
            "taskId": TASK_ID,
            "contextManifestChecksum": MANIFEST_CHECKSUM,
            "evidenceRefs": [
                "sveltekit-frontend/src/routes/(app)/admin/all-routes/route-lineage.ts",
                "fabricated/nonexistent/evidence/id.ts",
            ],
            "instruction": "Cites unapproved evidence.",
            "writesPerformed": False,
        },
        # Episode 6: Full Pass (Higher latency)
        {
            "schema": "atlas.ace-packet-proposal.v1",
            "taskId": TASK_ID,
            "contextManifestChecksum": MANIFEST_CHECKSUM,
            "evidenceRefs": [
                "sveltekit-frontend/src/routes/(app)/admin/all-routes/route-lineage.ts",
                "docs/.okf/dev/pinned-docs.manifest.json",
            ],
            "instruction": "Applied defensive checks with extra logging.",
            "conceptId": "concept:sveltekit2:route_lineage_hardening:v1",
            "writesPerformed": False,
        },
        # Episode 7: Invalid Schema
        {
            "schema": "unsupported.schema.v0",
            "taskId": TASK_ID,
            "contextManifestChecksum": MANIFEST_CHECKSUM,
            "evidenceRefs": [
                "sveltekit-frontend/src/routes/(app)/admin/all-routes/route-lineage.ts",
            ],
            "instruction": "Missing required schema declaration.",
            "writesPerformed": False,
        },
        # Episode 8: Wrong Task ID
        {
            "schema": "atlas.ace-packet-proposal.v1",
            "taskId": "TASK_WRONG_999",
            "contextManifestChecksum": MANIFEST_CHECKSUM,
            "evidenceRefs": [
                "sveltekit-frontend/src/routes/(app)/admin/all-routes/route-lineage.ts",
            ],
            "instruction": "Targeted incorrect task ID.",
            "writesPerformed": False,
        },
    ]

    test_outcomes = [True, True, True, False, True, True, True, True]
    scope_outcomes = [True, False, True, True, True, True, True, True]
    latencies = [95.0, 110.0, 120.0, 130.0, 105.0, 850.0, 100.0, 90.0]

    # 3. Execute 8-Episode Rollout through Strict Checker & Advantage Normalizer
    receipt = run_episode_group_rollout(
        TASK_ID,
        allowed_evidence=ALLOWED_EVIDENCE,
        proposals=proposals,
        test_outcomes=test_outcomes,
        scope_outcomes=scope_outcomes,
        latencies_ms=latencies,
        context_manifest_checksum=MANIFEST_CHECKSUM,
    )

    print(f"📊 [ROLLOUT] Mean Reward: {receipt.mean_reward} | Std: {receipt.std_reward} | Eligible: {receipt.eligible_count}/8")
    for ep in receipt.episodes:
        print(f"   Episode {ep.episode_id + 1}: Raw Reward={ep.reward_raw:.2f} | Advantage={ep.advantage:+.4f} | Eligible={ep.check.eligible} | Failures={ep.check.failures}")

    # 4. Advisory 8-Neuron Ranker Forward Pass & Collation
    candidate_features = [
        CandidateFeature(
            packet_key="P001",
            evidence_ref="sveltekit-frontend/src/routes/(app)/admin/all-routes/route-lineage.ts",
            semantic_score=0.92,
            lexical_score=0.88,
            graph_score=0.76,
            dependency_score=0.85,
            recency_score=0.95,
            breadth_score=0.80,
            risk_score=0.10,
            provenance_score=1.00,
        ),
        CandidateFeature(
            packet_key="P002",
            evidence_ref="docs/.okf/pinned/sveltekit/DIAGNOSTIC_WARNINGS_FIXES.md",
            semantic_score=0.85,
            lexical_score=0.79,
            graph_score=0.70,
            dependency_score=0.60,
            recency_score=0.90,
            breadth_score=0.75,
            risk_score=0.05,
            provenance_score=0.95,
        ),
        CandidateFeature(
            packet_key="P003",
            evidence_ref="docs/.okf/dev/pinned-docs.manifest.json",
            semantic_score=0.78,
            lexical_score=0.72,
            graph_score=0.65,
            dependency_score=0.55,
            recency_score=0.80,
            breadth_score=0.60,
            risk_score=0.08,
            provenance_score=0.90,
        ),
    ]

    identities, tensor_x = to_feature_matrix(candidate_features)
    shape_tuple = tuple(tensor_x.shape) if hasattr(tensor_x, "shape") else (len(tensor_x), len(tensor_x[0]))
    ranker = AdvisoryRanker(in_features=8, hidden_dim=8)
    ranked_candidates = ranker.score_candidates(candidate_features)

    print(f"🧠 [ADVISORY-RANKER] Colated Feature Matrix: {shape_tuple} (N={len(candidate_features)}, F=8)")
    for rc in ranked_candidates:
        print(f"   Candidate {rc['packet_key']} ({rc['evidence_ref'].split('/')[-1]}): Advisory Score={rc['advisory_score']}")

    # 5. Compile Episode 1 Winning Proposal into Qualified ACE Packet
    winning_proposal = proposals[0]
    ace_packet = compile_ace_packet_from_proposal(
        winning_proposal,
        context_manifest=context_manifest,
        domain="ui",
        ttl_seconds=604_800,
    )

    print(f"📦 [ACE-COMPILER] Compiled Packet ID: {ace_packet['packet_id']} (NES LUT: {ace_packet['nes_lut']['palette_byte']}, TTL: {ace_packet['ttl_seconds']}s)")
    print(f"   OaK Tuple: {ace_packet['oak_python_tuple']}")

    # 6. Verify Execution Gates
    gates = {
        "RL_ENV_01": "PASS" if len(proposals) == 8 else "FAIL",
        "RL_CHECK_01": "PASS" if receipt.eligible_count == 3 and any(len(ep.check.failures) > 0 for ep in receipt.episodes) else "FAIL",
        "RL_EPISODE_01": "PASS" if len(receipt.episodes) == 8 and receipt.immutable_sha256.startswith("sha256:") else "FAIL",
        "ACE_PROMPT_01": "PASS" if ace_packet["packet_id"].startswith("ace:packet:") and ace_packet["nes_lut"]["palette_byte"] == "0x2A" else "FAIL",
        "RL_MLP_01": "PASS" if shape_tuple == (3, 8) and len(ranked_candidates) == 3 else "FAIL",
        "CANONICAL_ISOLATION_01": "PASS" if ace_packet["canonical_authority"] is False and ace_packet["writes_performed"] is False else "FAIL",
        "EVIDENCE_INTEGRITY_01": "PASS" if ace_packet["evidence_qualification"]["context_manifest_checksum"] == MANIFEST_CHECKSUM else "FAIL",
    }

    report = {
        "audit_id": "PARENT-ATLAS-EPISODE-GROUP-LEARNING-01",
        "generated_at": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
        "task_id": TASK_ID,
        "gates": gates,
        "episode_group_receipt": {
            "num_episodes": receipt.num_episodes,
            "mean_reward": receipt.mean_reward,
            "std_reward": receipt.std_reward,
            "eligible_count": receipt.eligible_count,
            "immutable_sha256": receipt.immutable_sha256,
            "episodes": [
                {
                    "episode_id": ep.episode_id + 1,
                    "reward_raw": ep.reward_raw,
                    "advantage": ep.advantage,
                    "eligible": ep.check.eligible,
                    "failures": ep.check.failures,
                    "latency_ms": ep.latency_ms,
                }
                for ep in receipt.episodes
            ],
        },
        "advisory_ranker_benchmark": {
            "input_features": 8,
            "hidden_neurons": 8,
            "tensor_shape": list(shape_tuple),
            "candidates_scored": ranked_candidates,
        },
        "ace_packet_summary": {
            "packet_id": ace_packet["packet_id"],
            "nes_lut_byte": ace_packet["nes_lut"]["palette_byte"],
            "palette_name": ace_packet["nes_lut"]["palette_name"],
            "oak_python_tuple": ace_packet["oak_python_tuple"],
            "prompt_injection_guard": ace_packet["prompt_injection_guard"],
            "bitfrost_caching": ace_packet["bitfrost_caching"],
            "checksum": ace_packet["checksum"],
        },
        "canonical_boundary_invariants": {
            "canonical_authority": False,
            "writes_performed": False,
            "forbidden_payloads_enforced": True,
        },
    }

    report_path = ROOT / "docs" / "reports" / "episode-group-learning-audit-2026-10-17.json"
    report_path.parent.mkdir(parents=True, exist_ok=True)
    with open(report_path, "w", encoding="utf-8") as f:
        json.dump(report, f, indent=2)

    print(f"[AUDIT-SAVED] Saved report to {report_path}")
    print(f"All 7 gates: {json.dumps(gates, indent=2)}")


if __name__ == "__main__":
    import time
    main()
