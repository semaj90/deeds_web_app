"""Backend-neutral spectral assignment parity receipt.

Cluster labels are intentionally compared by membership agreement, not raw
numeric label equality, because every backend may number clusters differently.
"""

from __future__ import annotations

from hashlib import sha256
import json
from typing import Sequence

import numpy as np

from .spectral_reference import adjusted_rand_index


def _checksum(assignments: Sequence[dict[str, int]]) -> str:
    ordered = sorted(assignments, key=lambda row: int(row["ordinal"]))
    return sha256(json.dumps(ordered, separators=(",", ":")).encode()).hexdigest()


def compare_spectral_assignments(
    cpu_assignments: Sequence[dict[str, int]],
    gpu_assignments: Sequence[dict[str, int]],
    *,
    graph_checksum: str,
    ordinal_map_checksum: str,
    cluster_count: int,
    num_eigenvectors: int,
    seed: int,
    ari_threshold: float = 0.99,
) -> dict[str, object]:
    cpu = sorted(cpu_assignments, key=lambda row: int(row["ordinal"]))
    gpu = sorted(gpu_assignments, key=lambda row: int(row["ordinal"]))
    cpu_ordinals = [int(row["ordinal"]) for row in cpu]
    gpu_ordinals = [int(row["ordinal"]) for row in gpu]
    if cpu_ordinals != gpu_ordinals:
        raise ValueError("SPECTRAL_ORDINAL_MAP_MISMATCH")
    cpu_labels = [int(row["cluster"]) for row in cpu]
    gpu_labels = [int(row["cluster"]) for row in gpu]
    ari = adjusted_rand_index(cpu_labels, gpu_labels)
    return {
        "schema": "atlas.spectral-gpu-parity-receipt.v1",
        "graph_checksum": graph_checksum,
        "ordinal_map_checksum": ordinal_map_checksum,
        "cluster_count": int(cluster_count),
        "num_eigenvectors": int(num_eigenvectors),
        "seed": int(seed),
        "cpu_assignment_checksum": _checksum(cpu),
        "gpu_assignment_checksum": _checksum(gpu),
        "adjusted_rand_index": ari,
        "ari_threshold": float(ari_threshold),
        "partition_parity_passed": bool(ari >= ari_threshold),
        "canonical_authority": False,
        "projection_write_allowed": False,
        "runtime_receipt_required": True,
    }
