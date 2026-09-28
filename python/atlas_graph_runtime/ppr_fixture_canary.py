"""Run a tiny, synthetic NetworkX/cuGraph PPR parity canary (no persistence)."""

from __future__ import annotations

import json
import argparse
from pathlib import Path

from .cugraph_executor import run_personalized_pagerank as run_cugraph_ppr
from .networkx_executor import run_personalized_pagerank as run_networkx_ppr
from .ppr_parity import (
    build_ppr_execution_identity_v1,
    compare_ppr_v1,
    dangling_ordinals,
)


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--output", type=Path)
    args = parser.parse_args()
    identity = build_ppr_execution_identity_v1(
        graph_revision="fixture:directed-ppr-dangling-v1",
        candidate_snapshot_revision="fixture:candidate-snapshot-v1",
        candidate_ordinal_map_checksum="sha256:" + "a" * 64,
        graph_ordinal_map_checksum="sha256:" + "b" * 64,
        candidate_ordinals=[0, 1, 2, 3, 4],
        edge_ordinals=[(0, 1), (1, 2), (2, 0), (0, 3)],
        seed_weights={0: 0.7, 2: 0.3},
        alpha=0.85,
        epsilon=1e-9,
        max_iterations=1000,
    )
    cpu_scores, cpu_receipt = run_networkx_ppr(identity=identity)
    gpu_scores, gpu_receipt = run_cugraph_ppr(identity=identity)
    receipt = compare_ppr_v1(
        identity=identity,
        reference_receipt=cpu_receipt,
        challenger_receipt=gpu_receipt,
        reference_scores=cpu_scores,
        challenger_scores=gpu_scores,
        dangling_ordinals=dangling_ordinals(identity),
        tolerance=1e-6,
        rank_displacement_tolerance=0,
    )
    payload = {
        "schema": "atlas.graph-ppr-fixture-canary.v1",
        "fixtureOnly": True,
        "receipt": receipt.to_dict(),
        "networkxScores": cpu_scores,
        "cugraphScores": gpu_scores,
    }
    rendered = json.dumps(payload, sort_keys=True, indent=2) + "\n"
    if args.output:
        args.output.parent.mkdir(parents=True, exist_ok=True)
        with args.output.open("x", encoding="utf-8", newline="\n") as handle:
            handle.write(rendered)
    print(rendered, end="")
    if receipt.status != "PARITY_PROVEN":
        raise SystemExit("PPR_FIXTURE_PARITY_DIVERGED")


if __name__ == "__main__":
    main()
