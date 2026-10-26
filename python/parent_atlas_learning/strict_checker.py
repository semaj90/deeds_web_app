"""Strict deterministic checker for Parent Atlas episode verification.

The checker never uses an LLM as judge. It enforces hard binary gates
(schema, task identity, evidence allowlist, scope compliance, and test pass).
Any hard failure zeros the reward immediately.
"""

from __future__ import annotations

from typing import Any, Mapping, Sequence, Set
from .contracts import CheckResult


def check_episode(
    proposal: Mapping[str, Any],
    *,
    allowed_evidence: Set[str],
    approved_task_id: str,
    tests_passed: bool,
    scope_valid: bool,
    latency_ms: float = 120.0,
    max_latency_ms: float = 2000.0,
) -> CheckResult:
    """Validate one episode proposal against deterministic criteria.

    Parameters:
        proposal: The JSON proposal emitted by the agent or DSPy program.
        allowed_evidence: Whitelisted evidence references from the ContextManifest.
        approved_task_id: Canonical Kanban task ID authorized for this run.
        tests_passed: Grounded boolean result from the test harness.
        scope_valid: Grounded boolean result confirming only allowed files were touched.
        latency_ms: Execution duration in milliseconds.
        max_latency_ms: Upper bound for latency scoring.

    Returns:
        CheckResult with eligible=True and reward in [0.6, 1.0], or eligible=False and reward=0.0.
    """
    failures: list[str] = []

    # 1. Schema check
    schema = proposal.get("schema")
    if schema != "atlas.ace-packet-proposal.v1":
        failures.append("INVALID_SCHEMA")

    # 2. Task identity check
    task_id = proposal.get("taskId")
    if task_id != approved_task_id:
        failures.append("WRONG_TASK")

    # 3. Evidence qualification check
    refs = proposal.get("evidenceRefs")
    if not isinstance(refs, (list, tuple)) or not refs:
        failures.append("MISSING_EVIDENCE")
    else:
        unqualified = [ref for ref in refs if not isinstance(ref, str) or ref not in allowed_evidence]
        if unqualified:
            failures.append(f"UNQUALIFIED_EVIDENCE:{','.join(sorted(map(str, unqualified)))}")

    # 4. Scope and security bounds
    if not scope_valid:
        failures.append("SCOPE_VIOLATION")

    # 5. Test suite verification
    if not tests_passed:
        failures.append("TEST_FAILURE")

    # Check for unauthorized mutations or hidden thoughts
    if proposal.get("writesPerformed", False) is True:
        failures.append("UNAUTHORIZED_MUTATION")
    if any(k in proposal for k in ("hiddenThoughts", "chainOfThought", "kv_cache", "raw_tensor")):
        failures.append("FORBIDDEN_PERSISTENCE")

    # Hard failure evaluation
    if failures:
        return CheckResult(
            eligible=False,
            reward=0.0,
            failures=tuple(failures),
            diagnostics={
                "reason": "Hard gate failure",
                "failures_count": len(failures),
                "tests_passed": tests_passed,
                "scope_valid": scope_valid,
            },
        )

    # 6. Smooth reward for eligible completions [0.60, 1.00]
    base_reward = 0.60

    # Evidence efficiency: reward citing exact required evidence without bloat
    evidence_count = len(refs) if isinstance(refs, (list, tuple)) else 1
    evidence_efficiency = max(0.0, 1.0 - max(0, evidence_count - 2) * 0.1)
    evidence_bonus = 0.20 * evidence_efficiency

    # Latency efficiency: reward faster responses
    latency_ratio = min(1.0, max(0.0, latency_ms / max(1.0, max_latency_ms)))
    latency_bonus = 0.20 * (1.0 - latency_ratio)

    total_reward = round(base_reward + evidence_bonus + latency_bonus, 4)

    return CheckResult(
        eligible=True,
        reward=total_reward,
        failures=(),
        diagnostics={
            "base_reward": base_reward,
            "evidence_bonus": round(evidence_bonus, 4),
            "latency_bonus": round(latency_bonus, 4),
            "evidence_count": evidence_count,
            "latency_ms": latency_ms,
        },
    )
