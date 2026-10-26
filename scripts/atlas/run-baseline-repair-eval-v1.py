#!/usr/bin/env python3
"""run-baseline-repair-eval-v1.py — PA-GEPA-01 Baseline Evaluation Receipt Runner.

Executes evaluate_baseline_repair_program_v1 across frozen validation examples,
verifies output boundaries and deterministic score hashing, and persists the
content-addressed receipt to .tmp/atlas/baseline-repair-eval-receipt-v1.json.
"""

from __future__ import annotations

import json
from pathlib import Path
from types import SimpleNamespace
import sys

# Ensure python/ is on import path
REPO_ROOT = Path(__file__).resolve().parent.parent.parent
sys.path.insert(0, str(REPO_ROOT / "python"))

from parent_atlas_dspy_repair import evaluate_baseline_repair_program_v1

FROZEN_VALIDATION_EXAMPLES = [
    {
        "example_id": "val-auth-001",
        "query_text": "Verify JWT signature handling with null payload",
        "allowed_targets": ["packet::auth_verifier", "packet::session_manager"],
        "allowed_evidence_refs": ["file:///src/auth/token.ts#verify"],
        "expected_targets": ["packet::auth_verifier"],
        "expected_evidence_refs": ["file:///src/auth/token.ts#verify"],
        "manifest_checksum": "sha256:0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef",
    },
    {
        "example_id": "val-routing-002",
        "query_text": "Typecheck mismatch in sparse router shifter bounds",
        "allowed_targets": ["packet::sparse_packer", "packet::avx2_shifter"],
        "allowed_evidence_refs": ["file:///src/tensors/packer.ts#encode"],
        "expected_targets": ["packet::sparse_packer"],
        "expected_evidence_refs": ["file:///src/tensors/packer.ts#encode"],
        "manifest_checksum": "sha256:0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef",
    },
    {
        "example_id": "val-cache-003",
        "query_text": "Valkey session token cache invalidation race condition",
        "allowed_targets": ["packet::valkey_adapter", "packet::redis_client"],
        "allowed_evidence_refs": ["file:///src/cache/valkey.ts#evict"],
        "expected_targets": ["packet::valkey_adapter"],
        "expected_evidence_refs": ["file:///src/cache/valkey.ts#evict"],
        "manifest_checksum": "sha256:0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef",
    },
]


def baseline_program(**kwargs):
    query = str(kwargs.get("diagnostic_query", ""))
    allowed_targets = kwargs.get("allowed_target_candidates", [])
    allowed_evidence = kwargs.get("allowed_evidence_refs", [])

    # Deterministic baseline heuristic: select first target and first evidence
    chosen_target = [allowed_targets[0]] if allowed_targets else []
    chosen_evidence = [allowed_evidence[0]] if allowed_evidence else []

    return SimpleNamespace(
        diagnosis=f"Baseline diagnosis for query: {query[:40]}",
        target_candidates=chosen_target,
        evidence_refs=chosen_evidence,
        patch_plan="Apply guarded null-check and boundary validation",
        validation_plan="npm test",
    )


def main() -> int:
    out_dir = REPO_ROOT / ".tmp" / "atlas"
    out_dir.mkdir(parents=True, exist_ok=True)
    out_file = out_dir / "baseline-repair-eval-receipt-v1.json"

    print(f"Running evaluate_baseline_repair_program_v1 across {len(FROZEN_VALIDATION_EXAMPLES)} examples...")
    receipt = evaluate_baseline_repair_program_v1(baseline_program, FROZEN_VALIDATION_EXAMPLES)

    assert receipt["schema"] == "atlas.baseline-eval-result.v1", "Invalid schema"
    assert receipt["example_count"] == len(FROZEN_VALIDATION_EXAMPLES)
    assert receipt["canonical_authority"] is False, "Canonical authority must be False"
    assert receipt["receipt_hash"].startswith("sha256:"), "Missing receipt_hash"

    with open(out_file, "w", encoding="utf-8") as f:
        json.dump(receipt, f, indent=2, sort_keys=True)

    print(f"[OK] Baseline evaluation receipt generated successfully:")
    print(f"   - File: {out_file}")
    print(f"   - Examples: {receipt['example_count']}")
    print(f"   - Mean Score: {receipt['mean_score']}")
    print(f"   - Hard Gate Failures: {receipt['hard_gate_failures']}")
    print(f"   - Receipt Hash: {receipt['receipt_hash']}")
    print(f"   - Canonical Authority: {receipt['canonical_authority']}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
