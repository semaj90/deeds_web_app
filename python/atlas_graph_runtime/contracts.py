"""Transport contracts for graph executors; never canonical identity owners.

GraphNodeKeyV1 and GraphOrdinalMapV1 remain owned upstream by the Parent Atlas
TypeScript contracts. Python receives their already-frozen ordinal projection.
"""

from __future__ import annotations

from dataclasses import dataclass
from typing import Literal

GraphBackend = Literal["networkx", "cugraph"]


@dataclass(frozen=True)
class TypedGraphEdge:
    src_ordinal: int
    dst_ordinal: int
    kind: str
    weight: float = 1.0


@dataclass(frozen=True)
class GraphExecutionReceipt:
    schema: str
    operation: str
    requested_backend: GraphBackend
    effective_backend: str
    graph_revision: str
    node_count: int
    edge_count: int
    status: Literal["PROVEN", "DEGRADED", "FAILED"]
    canonical_authority: bool = False
    error: str | None = None
