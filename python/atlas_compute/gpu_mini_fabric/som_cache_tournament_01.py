#!/usr/bin/env python
"""SOM-CACHE-01 -- 4-way prefetch-strategy tournament.

no-prefetch vs plain-LRU vs graph-neighbor vs SOM-BMU-neighbor, all run
against the IDENTICAL query-sequence locality trace from
query_sequence_fixture.py (same trace parent-atlas-bitfrost-sim-01 already
proved graph-neighbor prefetch against) -- per
parent-atlas-som-cache-tournament spec's "not independently-generated
sequences" requirement.

No CUDA, no GPU, no canonical production data.

Run:
  PYTHONPATH=. python -m atlas_compute.gpu_mini_fabric.som_cache_tournament_01
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
from atlas_compute.gpu_mini_fabric.atlas_som_lite_v1 import (
    build_structural_features_v1,
    train_structural_som_v1,
)

OUT_PATH = Path(__file__).resolve().parents[3] / "docs" / "reports" / "som-cache-tournament-01-result.json"


def _empty_neighbors(_node_key: str) -> list[tuple[str, str]]:
    return []


def main() -> None:
    graph_fixture = generate_graph_fixture_v1()
    adjacency = build_out_adjacency_with_types(graph_fixture)
    query_fixture = generate_query_sequence_fixture_v1(graph_fixture)
    trace = query_fixture.locality_trace  # IDENTICAL trace for all four strategies

    features = build_structural_features_v1(graph_fixture)
    som = train_structural_som_v1(features)

    strategies: dict[str, dict] = {
        "no-prefetch": {"eviction_mode": "utility-score", "neighbor_provider": _empty_neighbors},
        "plain-LRU": {"eviction_mode": "lru", "neighbor_provider": _empty_neighbors},
        "graph-neighbor": {"eviction_mode": "utility-score", "neighbor_provider": None},
        "SOM-BMU-neighbor": {
            "eviction_mode": "utility-score",
            "neighbor_provider": som.som_bmu_neighbors,
        },
    }

    results: dict[str, dict] = {}
    for name, cfg in strategies.items():
        sim = AtlasAceResidencyV1(
            adjacency,
            eviction_mode=cfg["eviction_mode"],
            neighbor_provider=cfg["neighbor_provider"],
        )
        result = sim.run(trace)
        results[name] = result.to_dict()

    graph_neighbor_hit_rate = results["graph-neighbor"]["hitRate"]
    lru_hit_rate = results["plain-LRU"]["hitRate"]
    som_hit_rate = results["SOM-BMU-neighbor"]["hitRate"]

    som_beats_graph_neighbor = som_hit_rate > graph_neighbor_hit_rate
    som_beats_lru = som_hit_rate > lru_hit_rate
    som_promotion_verdict = som_beats_graph_neighbor and som_beats_lru

    report = {
        "schema": "atlas.som-cache-01.tournament-result.v1",
        "test": "SOM-CACHE-01",
        "read_only": True,
        "canonical_production_data_touched": False,
        "canonical_production_data_mutated": False,
        "graph_fixture": graph_fixture.to_manifest_dict(),
        "query_sequence_fixture": query_fixture.to_manifest_dict(),
        "structural_feature_vector": features.to_manifest_dict(),
        "trained_som": som.to_manifest_dict(),
        "strategies": results,
        "verdict": {
            "criterion": "SOM-BMU-neighbor hitRate must exceed BOTH graph-neighbor and plain-LRU hitRate",
            "som_hit_rate": som_hit_rate,
            "graph_neighbor_hit_rate": graph_neighbor_hit_rate,
            "plain_lru_hit_rate": lru_hit_rate,
            "som_beats_graph_neighbor": som_beats_graph_neighbor,
            "som_beats_plain_lru": som_beats_lru,
            "RESULT": "PROMOTE_TO_NEXT_VALIDATION" if som_promotion_verdict else "STAYS_STEP_08_EXPERIMENTAL",
        },
    }

    OUT_PATH.parent.mkdir(parents=True, exist_ok=True)
    OUT_PATH.write_text(json.dumps(report, indent=2) + "\n")
    print(json.dumps(report, indent=2))
    print("Report:", OUT_PATH)


if __name__ == "__main__":
    main()
