from __future__ import annotations
from dataclasses import dataclass
from typing import Iterable
import numpy as np
import pyarrow as pa

@dataclass(frozen=True)
class Member:
    hyperedge_id: str
    vertex_id: str
    role: str
    weight: float = 1.0


def incidence_batch(members: Iterable[Member]) -> pa.RecordBatch:
    rows = sorted(members, key=lambda m: (m.hyperedge_id, m.role, m.vertex_id))
    return pa.RecordBatch.from_arrays([
        pa.array([r.hyperedge_id for r in rows], type=pa.string()),
        pa.array([r.vertex_id for r in rows], type=pa.string()),
        pa.array([r.role for r in rows], type=pa.string()),
        pa.array([r.weight for r in rows], type=pa.float32()),
    ], ["hyperedge_id", "vertex_id", "role", "weight"])
