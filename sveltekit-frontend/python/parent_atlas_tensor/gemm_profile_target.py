from __future__ import annotations

"""Single-lane GEMM target for Nsight Systems/Compute profiling.

Only one CUDA GEMM lane is executed per process so any cuBLAS/cuBLASLt API
trace captured for the bounded benchmark can be attributed to that requested
lane without mixing evidence from sibling lanes.
"""

import argparse
import json
from pathlib import Path

from .gemm_primitives import DEFAULT_LANES, GemmLane, run_gemm_suite


def _lane_by_id(lane_id: str) -> GemmLane:
    for lane in DEFAULT_LANES:
        if lane.lane_id == lane_id:
            return lane
    known = ",".join(lane.lane_id for lane in DEFAULT_LANES)
    raise ValueError(f"GEMM_PROFILE_UNKNOWN_LANE:{lane_id}:known={known}")


def run_profile_target(
    *,
    lane_id: str,
    m: int,
    n: int,
    k: int,
    seed: int,
    warmup: int,
    repeats: int,
    output_path: str | None,
) -> dict:
    lane = _lane_by_id(lane_id)
    receipt = run_gemm_suite(
        m=m,
        n=n,
        k=k,
        seed=seed,
        warmup=warmup,
        repeats=repeats,
        require_cuda=True,
        lanes=(lane,),
        producer_revision="parent-atlas-gemm-profile-target.v1",
    )
    receipt["profileTarget"] = {
        "singleCudaLaneProcess": True,
        "requestedLaneId": lane_id,
        "requestedPreferredBlas": lane.preferred_blas,
        "requestedFp32Precision": lane.fp32_precision,
        "nvtxRange": f"parent-atlas::{lane_id}",
        "canonicalWritesAllowed": False,
    }
    if output_path:
        target = Path(output_path).expanduser().resolve()
        target.parent.mkdir(parents=True, exist_ok=True)
        target.write_text(json.dumps(receipt, indent=2, allow_nan=False) + "\n", encoding="utf-8")
        receipt["profileTarget"]["receiptPath"] = str(target)
    return receipt


def main() -> None:
    parser = argparse.ArgumentParser(prog="parent-atlas-gemm-profile-target")
    parser.add_argument("--lane", required=True, choices=[lane.lane_id for lane in DEFAULT_LANES])
    parser.add_argument("--m", type=int, default=2048)
    parser.add_argument("--n", type=int, default=2048)
    parser.add_argument("--k", type=int, default=2048)
    parser.add_argument("--seed", type=lambda value: int(value, 0), default=0xA71A5)
    parser.add_argument("--warmup", type=int, default=5)
    parser.add_argument("--repeats", type=int, default=10)
    parser.add_argument("--output", type=str, default=None)
    args = parser.parse_args()

    receipt = run_profile_target(
        lane_id=args.lane,
        m=args.m,
        n=args.n,
        k=args.k,
        seed=args.seed,
        warmup=args.warmup,
        repeats=args.repeats,
        output_path=args.output,
    )
    print(json.dumps(receipt, separators=(",", ":"), allow_nan=False))
    if receipt["summary"]["executedLaneCount"] != 1:
        raise SystemExit(2)


if __name__ == "__main__":
    main()
