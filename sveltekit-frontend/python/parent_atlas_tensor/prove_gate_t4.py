"""Gate T4 proof, Python side.

Reads the ACE residency decision written by
scripts/atlas/prove-tensor-residency-gate-t4.mts and drives the real
GpuTileCache with it: promotes tiles onto the GPU in ACE's utility order
under the same byte budget ACE was told about, then checks whether the set
of tiles the cache actually keeps resident (after its own LRU eviction
logic runs) matches what ACE predicted.

This is the actual "ACE decides which logical tile; CUDA allocators choose
physical addresses" split: the decision crosses the TS/Python boundary as a
plain JSON file (matching the wire-format layering rule -- JSON describes
the decision, the GPU tensors are never serialized through it), and the
physical promote/evict is performed by GpuTileCache exactly as it would be
in production, not re-implemented here.

Usage: python -m parent_atlas_tensor.prove_gate_t4 <decision.json>
"""

from __future__ import annotations

import argparse
import json

import numpy as np

from .gpu_tile_cache import GpuTileCache


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("decision_json")
    args = parser.parse_args()

    with open(args.decision_json, "r", encoding="utf-8") as f:
        decision = json.load(f)

    if decision.get("schema") != "atlas.tensor-residency-gate-t4-decision.v1":
        raise ValueError("GATE_T4_DECISION_SCHEMA_MISMATCH")

    bytes_per_tile = int(decision["bytesPerTile"])
    gpu_budget_bytes = int(decision["gpuBudgetBytes"])
    rows = 200
    dims = 768
    assert rows * dims * 4 == bytes_per_tile, "GATE_T4_TILE_SHAPE_MISMATCH"

    cache = GpuTileCache(max_bytes=gpu_budget_bytes, device="cuda")

    # decision["tiles"] is sorted descending by utility (ACE's natural
    # ranking). promote_ranked() handles the ascending-order LRU reversal
    # internally -- see its docstring and
    # docs/reports/tensor-residency-gate-t4-proof-2026-08-23.json for why a
    # naive caller-side reversal is a real, silent footgun.
    ordered_tiles = decision["tiles"]
    ranked_input = []
    for entry in ordered_tiles:
        key = entry["tileKey"]
        seed = abs(hash(key)) % (2**32)
        rng = np.random.default_rng(seed)
        matrix = rng.standard_normal((rows, dims)).astype(np.float32)
        ranked_input.append((key, matrix))
    cache.promote_ranked(ranked_input)

    actual_resident = sorted(cache.tiles.keys())
    ace_predicted_resident = sorted(decision["acePredictedResidentAfterBudget"])

    result = {
        "schema": "atlas.tensor-residency-gate-t4-proof.v1",
        "gpuBudgetBytes": gpu_budget_bytes,
        "bytesPerTile": bytes_per_tile,
        "promotedInOrder": [t["tileKey"] for t in ordered_tiles],
        "acePredictedResidentAfterBudget": ace_predicted_resident,
        "actualGpuResidentAfterPromotion": actual_resident,
        "residencyMatchesAcePrediction": actual_resident == ace_predicted_resident,
        "actualTotalGpuBytes": cache.bytes,
        "budgetRespected": cache.bytes <= gpu_budget_bytes,
        "residentTileDevices": {
            k: str(v.tensor.device) for k, v in cache.tiles.items()
        },
    }
    print(json.dumps(result, indent=2))


if __name__ == "__main__":
    main()
