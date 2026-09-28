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


@dataclass(frozen=True)
class GraphExecutionReceiptV2:
    """Additive, evidence-bound receipt; V1 field names and meanings are retained."""

    schema: Literal["atlas.graph-execution-receipt.v2"]
    operation: str
    requested_backend: GraphBackend
    effective_backend: str
    graph_revision: str
    node_count: int
    edge_count: int
    status: Literal["PROVEN", "DEGRADED", "FAILED"]
    executor_revision: str
    input_checksum: str
    output_checksum: str
    canonical_authority: bool = False
    writes_performed: bool = False
    error: str | None = None


def upgrade_graph_execution_receipt_v1(
    receipt: GraphExecutionReceipt,
    *,
    executor_revision: str,
    input_checksum: str,
    output_checksum: str,
) -> GraphExecutionReceiptV2:
    """Wrap a V1 result without changing its vocabulary or inventing provenance."""
    for name, value in (
        ("executor_revision", executor_revision),
        ("input_checksum", input_checksum),
        ("output_checksum", output_checksum),
    ):
        if not isinstance(value, str) or not value.strip():
            raise ValueError(f"GRAPH_RECEIPT_V2_{name.upper()}_REQUIRED")

    checksums = (input_checksum, output_checksum)
    if any(
        len(checksum) != 71
        or not checksum.startswith("sha256:")
        or any(char not in "0123456789abcdef" for char in checksum[7:])
        for checksum in checksums
    ):
        raise ValueError("GRAPH_RECEIPT_V2_CHECKSUM_FORMAT_INVALID")
    if receipt.canonical_authority:
        raise ValueError("GRAPH_RECEIPT_V2_CANONICAL_AUTHORITY_FORBIDDEN")

    return GraphExecutionReceiptV2(
        schema="atlas.graph-execution-receipt.v2",
        operation=receipt.operation,
        requested_backend=receipt.requested_backend,
        effective_backend=receipt.effective_backend,
        graph_revision=receipt.graph_revision,
        node_count=receipt.node_count,
        edge_count=receipt.edge_count,
        status=receipt.status,
        executor_revision=executor_revision,
        input_checksum=input_checksum,
        output_checksum=output_checksum,
        canonical_authority=False,
        writes_performed=False,
        error=receipt.error,
    )
