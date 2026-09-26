#!/usr/bin/env python
"""BITFROST-SIM-01 -- AtlasAceResidencyV1 locality-lift falsifiability gate.

No CUDA, no GPU, no canonical production data. Runs entirely in plain
CPython. This is the residency/LOD proving ground staged as a follow-up to
parent-atlas-gpu-mini-fabric-01 (see that change's design.md Decision 5 and
this change's own design.md).

Gate: hitRate(locality trace) - hitRate(shuffled control trace) >=
MIN_LOCALITY_LIFT, run with identical config/seed against both traces
(design.md Decision 1) -- proves AtlasAceResidencyV1's utility score is
actually exploiting graph-neighbor adjacency, not just benefiting from
per-node popularity that the shuffled control preserves.

Run:
  PYTHONPATH=. python -m atlas_compute.gpu_mini_fabric.bitfrost_sim_01
"""

from __future__ import annotations

import json
from pathlib import Path

from atlas_compute.gpu_mini_fabric.graph_fixture import (
    build_out_adjacency_with_types,
    generate_graph_fixture_v1,
)
from atlas_compute.gpu_mini_fabric.query_sequence_fixture import (
    generate_query_sequence_fixture_v1,
)
from atlas_compute.gpu_mini_fabric.atlas_ace_residency_v1 import AtlasAceResidencyV1

# Initial value before a real run exists -- design.md Decision 1 requires
# this to be finalized against the REAL observed lift once measured (task
# 4.3), not left as a guess.
MIN_LOCALITY_LIFT = 0.03

OUT_PATH = Path(__file__).resolve().parents[3] / "docs" / "reports" / "bitfrost-sim-01-residency-gate.json"


def main() -> None:
    graph_fixture = generate_graph_fixture_v1()
    adjacency = build_out_adjacency_with_types(graph_fixture)
    query_fixture = generate_query_sequence_fixture_v1(graph_fixture)

    # Fresh simulator instance per run -- no state carries over between
    # locality/control/LRU runs.
    locality_sim = AtlasAceResidencyV1(adjacency, eviction_mode="utility-score")
    locality_result = locality_sim.run(query_fixture.locality_trace)

    control_sim = AtlasAceResidencyV1(adjacency, eviction_mode="utility-score")
    control_result = control_sim.run(query_fixture.control_trace)

    lift = locality_result.hit_rate - control_result.hit_rate
    gate_pass = lift >= MIN_LOCALITY_LIFT

    # LRU baseline (task 5) -- reference point for the future SOM-CACHE-01
    # tournament, NOT itself a pass/fail condition of this change.
    lru_sim = AtlasAceResidencyV1(adjacency, eviction_mode="lru")
    lru_result = lru_sim.run(query_fixture.locality_trace)

    report = {
        "schema": "atlas.bitfrost-sim-01.residency-gate-result.v1",
        "test": "BITFROST-SIM-01",
        "read_only": True,
        "canonical_production_data_touched": False,
        "canonical_production_data_mutated": False,
        "graph_fixture": graph_fixture.to_manifest_dict(),
        "query_sequence_fixture": query_fixture.to_manifest_dict(),
        "residency_config": {
            "hot_capacity": 100,
            "warm_capacity": 500,
            "recency_decay": 0.98,
        },
        "utility_score_mode": {
            "locality_trace_result": locality_result.to_dict(),
            "control_trace_result": control_result.to_dict(),
            "lift": lift,
            "min_locality_lift_threshold": MIN_LOCALITY_LIFT,
        },
        "lru_baseline_mode": {
            "note": "Reference baseline for the future SOM-CACHE-01 4-way tournament; not a pass/fail condition of this change.",
            "locality_trace_result": lru_result.to_dict(),
        },
        "gate": {
            "criterion": "hitRate(locality, utility-score) - hitRate(control, utility-score) >= MIN_LOCALITY_LIFT",
            "observed_lift": lift,
            "threshold": MIN_LOCALITY_LIFT,
            "RESULT": "PASS" if gate_pass else "FAIL",
        },
    }

    OUT_PATH.parent.mkdir(parents=True, exist_ok=True)
    OUT_PATH.write_text(json.dumps(report, indent=2) + "\n")
    print(json.dumps(report, indent=2))
    print("Report:", OUT_PATH)


if __name__ == "__main__":
    main()
