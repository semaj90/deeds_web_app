from __future__ import annotations

import asyncio
import sys
from pathlib import Path

import pytest

REPO_ROOT = Path(__file__).resolve().parents[2]
PYTHON_ROOT = REPO_ROOT / "python"
if str(PYTHON_ROOT) not in sys.path:
    sys.path.insert(0, str(PYTHON_ROOT))

from atlas_compute.async_multicore_readiness_ranker_v1 import (
    ReadinessCandidateV1,
    run_async_multicore_readiness_ranker_v1,
)


def test_async_multicore_rrf_fusion_and_deterministic_tie_breaking() -> None:
    async def p0() -> ReadinessCandidateV1:
        await asyncio.sleep(0.005)
        return ReadinessCandidateV1(
            candidate_ordinal=0,
            canonical_id="step:disk-headroom",
            title="Reclaim C: disk headroom above 8 GiB floor",
            lane="infrastructure",
            source_revision="sha256:" + "a" * 64,
            evidence_refs=("scripts/atlas/assert-resource-headroom-v1.mjs",),
            blocker_unwrap_weight=0.98,
            evidence_completeness=0.30,
            parity_verified=1.0,
            headroom_safety=1.0,
            execution_readiness=0.95,
            recommended_command="node scripts/atlas/assert-resource-headroom-v1.mjs",
        )

    async def p1() -> ReadinessCandidateV1:
        await asyncio.sleep(0.005)
        return ReadinessCandidateV1(
            candidate_ordinal=1,
            canonical_id="step:already-done",
            title="Already completed baseline",
            lane="baseline",
            source_revision="sha256:" + "b" * 64,
            evidence_refs=("docs/reports/eg2-onnx-encoder-inspection-v1.json",),
            blocker_unwrap_weight=0.10,
            evidence_completeness=1.0,
            parity_verified=1.0,
            headroom_safety=0.20,
            execution_readiness=0.20,
            recommended_command="echo ok",
        )

    res = asyncio.run(run_async_multicore_readiness_ranker_v1([p1, p0], max_concurrency=4, cpu_workers=2, top_k=5))
    assert res["canonicalAuthority"] is False
    assert res["writesPerformed"] is False
    assert res["totalCandidates"] == 2
    assert res["order"] == "SCORE_DESC_ORDINAL_ASC_ID_ASC"
    assert res["recommendations"][0]["canonical_id"] == "step:disk-headroom"
    assert res["recommendations"][1]["status_gate"] == "BLOCKED_HEADROOM"
    assert res["pfb1Telemetry"]["bytes"] > 104
