#!/usr/bin/env python3
"""Strict entrypoint for the real Parent Atlas aligned-snapshot proof.

The base proof runner is reused unchanged except its Qdrant evaluator is bound
to the fail-closed aggregate+worst-query implementation before main() runs.
This keeps one proof-envelope implementation while making the real-corpus
command unable to issue HNSW after a worst-query exact mismatch.
"""

from __future__ import annotations

import prove_aligned_snapshot_experiment as base
from atlas_compute.qdrant_scoped_ann_strict import evaluate_qdrant_scoped_ann_strict

base.evaluate_qdrant_scoped_ann = evaluate_qdrant_scoped_ann_strict


if __name__ == "__main__":
    raise SystemExit(base.main())
