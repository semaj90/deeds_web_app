#!/usr/bin/env python3
"""Receipt wrapper scaffold for the existing cugraph-pagerank.py owner.

This does NOT reimplement PageRank. It defines the eventual subprocess boundary
for capturing graph/config identity and normalizing the live GPU owner's result
into atlas.pagerank-execution-receipt.v1.

TODO(TEST-LATER): the current cugraph-pagerank.py writes scores to Postgres and
prints human-readable logs. Add a machine-readable --receipt-json output mode to
that script before this wrapper is enabled.
"""
from __future__ import annotations

import argparse
import json
import subprocess
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
DEFAULT_OWNER = ROOT / "sveltekit-frontend/scripts/atlas/cugraph-pagerank.py"


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--owner", type=Path, default=DEFAULT_OWNER)
    ap.add_argument("--graph-revision", required=True)
    ap.add_argument("--projection-revision", required=True)
    ap.add_argument("--projection-hash", required=True)
    ap.add_argument("--alpha", type=float, default=0.85)
    ap.add_argument("--max-iter", type=int, default=100)
    ap.add_argument("--tol", type=float, default=1e-6)
    ap.add_argument("--execute", action="store_true")
    args = ap.parse_args()

    command = [
        "python", str(args.owner), "--dry-run",
        "--damping", str(args.alpha),
        "--iterations", str(args.max_iter),
        "--tol", str(args.tol),
        # TODO(INTEGRATION): append --receipt-json - after the owner implements it.
    ]
    plan = {
        "schema": "atlas.cugraph-pagerank-receipt-runner-plan.v1",
        "status": "BLOCKED_OWNER_JSON_RECEIPT" if args.execute else "PLAN_ONLY",
        "owner": str(args.owner),
        "graphRevision": args.graph_revision,
        "projectionRevision": args.projection_revision,
        "projectionHash": args.projection_hash,
        "config": {"alpha": args.alpha, "max_iter": args.max_iter, "tol": args.tol},
        "command": command,
        "todo": [
            "TODO(INTEGRATION): add --receipt-json to cugraph-pagerank.py without changing its compute owner role.",
            "TODO(TEST-LATER): compare normalized receipt with NetworkX oracle using pagerank-parity-compare.py.",
            "TODO(TEST-LATER): persist only after projection/config identity is proven equal.",
        ],
    }
    print(json.dumps(plan, sort_keys=True))
    if not args.execute:
        return 0

    # Fail closed until the owner exposes structured receipt output.
    return 2


if __name__ == "__main__":
    raise SystemExit(main())
