#!/usr/bin/env python3
"""Run the frozen Parent Atlas domainClassMatch shadow ablation.

Input is NDJSON with explicit qid, packet identity, relevance label, frozen
baseline features, and the lineage-qualified shadow comparison output. This
script writes only a local JSON receipt; it never updates a model or service.
"""

from __future__ import annotations

import argparse
import json
from pathlib import Path

from atlas_compute.domain_rerank_ablation import load_frozen_rows
from atlas_compute.domain_rerank_ablation_gate import run_gated_domain_rerank_ablation


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--input", required=True, help="Frozen domain ablation NDJSON")
    parser.add_argument("--output", required=True, help="Receipt JSON path")
    parser.add_argument("--k", type=int, default=10)
    parser.add_argument("--seed", type=int, default=42)
    parser.add_argument("--validation-fraction", type=float, default=0.2)
    parser.add_argument("--device", default="cpu", choices=["cpu", "cuda"])
    args = parser.parse_args()

    rows = load_frozen_rows(args.input)
    receipt = run_gated_domain_rerank_ablation(
        rows,
        eval_k=args.k,
        seed=args.seed,
        validation_fraction=args.validation_fraction,
        device=args.device,
    )

    output = Path(args.output)
    output.parent.mkdir(parents=True, exist_ok=True)
    output.write_text(json.dumps(receipt.to_dict(), indent=2, sort_keys=True) + "\n", encoding="utf-8")

    print(json.dumps(receipt.to_dict(), indent=2, sort_keys=True))
    print(f"receipt={output}")
    print("status=DOMAIN_MATCH_ABLATION_MEASURED_NOT_PROMOTED")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
