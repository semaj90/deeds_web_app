"""Noncanonical Parent Atlas graph-execution contracts and future adapters."""

from .contracts import (
    GraphBackend,
    GraphExecutionReceipt,
    GraphExecutionReceiptV2,
    TypedGraphEdge,
    upgrade_graph_execution_receipt_v1,
)
from .graph_projection_manifest import (
    VerifiedGraphProjectionSnapshotV1,
    build_bfs_path_receipt_v1,
    graph_ordinal_checksum_from_manifest_v1,
    graph_ordinal_map_checksum_v1,
    validate_graph_projection_artifact_v1,
    validate_graph_projection_ordinal_checksum_v1,
)
from .pagerank_parity import (
    GraphCpuGpuParityReceiptV1,
    compare_pagerank_metrics_v1,
    compare_pagerank_v2,
    pagerank_scores_checksum,
)
from .networkx_executor import run_pagerank as run_networkx_pagerank, run_sssp as run_networkx_sssp
from .networkx_executor import run_personalized_pagerank as run_networkx_personalized_pagerank
from .networkx_executor import (
    run_bfs_neighborhood as run_networkx_bfs_neighborhood,
    run_cheirank as run_networkx_cheirank,
    run_pagerank_v2 as run_networkx_pagerank_v2,
    run_sssp_v2 as run_networkx_sssp_v2,
    run_strongly_connected_components as run_networkx_strongly_connected_components,
    run_topological_order as run_networkx_topological_order,
)
from .cugraph_executor import run_personalized_pagerank as run_cugraph_personalized_pagerank
from .ppr_parity import (
    PprExecutionIdentityV1,
    PprParityReceiptV1,
    build_ppr_execution_identity_v1,
    compare_ppr_v1,
    dangling_ordinals,
    normalize_seed_weights,
)
from .rank_metrics import compare_ranked_scores

__all__ = [
    "GraphBackend",
    "GraphExecutionReceipt",
    "GraphExecutionReceiptV2",
    "TypedGraphEdge",
    "upgrade_graph_execution_receipt_v1",
    "build_bfs_path_receipt_v1",
    "VerifiedGraphProjectionSnapshotV1",
    "graph_ordinal_checksum_from_manifest_v1",
    "graph_ordinal_map_checksum_v1",
    "validate_graph_projection_artifact_v1",
    "validate_graph_projection_ordinal_checksum_v1",
    "GraphCpuGpuParityReceiptV1",
    "compare_pagerank_metrics_v1",
    "compare_pagerank_v2",
    "pagerank_scores_checksum",
    "run_networkx_pagerank",
    "run_networkx_sssp",
    "run_networkx_personalized_pagerank",
    "run_networkx_bfs_neighborhood",
    "run_networkx_cheirank",
    "run_networkx_pagerank_v2",
    "run_networkx_sssp_v2",
    "run_networkx_strongly_connected_components",
    "run_networkx_topological_order",
    "run_cugraph_personalized_pagerank",
    "PprExecutionIdentityV1",
    "PprParityReceiptV1",
    "build_ppr_execution_identity_v1",
    "compare_ppr_v1",
    "dangling_ordinals",
    "normalize_seed_weights",
    "compare_ranked_scores",
]
