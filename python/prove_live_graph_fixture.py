#!/usr/bin/env python3
"""Execute the bounded Parent Atlas live graph fixture and write its receipt."""

from __future__ import annotations

import argparse
import json
from pathlib import Path
import sys

REPO_ROOT = Path(__file__).resolve().parents[1]
if str(REPO_ROOT / "python") not in sys.path:
    sys.path.insert(0, str(REPO_ROOT / "python"))

from atlas_compute.live_graph_fixture import run_live_graph_fixture


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--fixture", required=True)
    parser.add_argument("--output", default=".tmp/atlas/live-graph/live-graph-fixture-receipt.json")
    args = parser.parse_args()

    fixture_path = Path(args.fixture).resolve()
    output_path = Path(args.output).resolve()
    fixture = json.loads(fixture_path.read_text(encoding="utf-8"))
    receipt = run_live_graph_fixture(fixture)
    output_path.parent.mkdir(parents=True, exist_ok=True)
    output_path.write_text(json.dumps(receipt, indent=2, sort_keys=True) + "\n", encoding="utf-8")
    print(json.dumps({
        "status": receipt["status"],
        "receipt": str(output_path),
        "vertex_count": receipt["vertex_count"],
        "edge_count": receipt["edge_count"],
        "algorithms": [metric["algorithm"] for metric in receipt["algorithms"]],
        "fixture_checksum": receipt["fixture_checksum"],
    }, indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
