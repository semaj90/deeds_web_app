"""Noncanonical Parent Atlas graph-execution contracts and future adapters."""

from .contracts import GraphBackend, GraphExecutionReceipt, TypedGraphEdge
from .graph_projection_manifest import (
    build_bfs_path_receipt_v1,
    graph_ordinal_checksum_from_manifest_v1,
    graph_ordinal_map_checksum_v1,
    validate_graph_projection_ordinal_checksum_v1,
)

__all__ = [
    "GraphBackend",
    "GraphExecutionReceipt",
    "TypedGraphEdge",
    "build_bfs_path_receipt_v1",
    "graph_ordinal_checksum_from_manifest_v1",
    "graph_ordinal_map_checksum_v1",
    "validate_graph_projection_ordinal_checksum_v1",
]
