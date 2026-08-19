"""Parent Atlas deterministic compute references and GPU challenger helpers.

These modules never own canonical application truth. They consume frozen,
revision-qualified tensors and emit derived rankings/proof receipts.
"""

from .ann_compare import AnnComparisonReceipt, compare_cuvs_exact_and_cagra
from .cugraph_ppr import CuGraphPprParityReceipt, run_cugraph_ppr_parity
from .determinism import TorchDeterminismReceipt, configure_torch_determinism
from .exact_semantic import ExactSemanticSearchReceipt, exact_semantic_search
from .graph_programs import BfsReceipt, CondensationDagReceipt, deterministic_bfs, condense_and_lexicographically_sort
from .hypergraph_tensor import HypergraphTensorPprReceipt, run_tensor_ppr
from .interpolation import TensorInterpolationReceipt, interpolate_topology_field
from .low_rank import LowRankComparisonReceipt, compare_low_rank_recommendations
from .neural_router import NeuralRouterReceipt, train_receipt_router
from .rapids_matrix import (
    RapidsKMeansReceipt,
    RapidsPcaReceipt,
    deterministic_farthest_first_ordinals,
    run_cuvs_kmeans,
    run_cuvs_pca,
)
from .representation_compare import RepresentationComparisonReceipt, compare_representations
from .spectral import SpectralReceipt, symmetric_eigenspace

__all__ = [
    "AnnComparisonReceipt",
    "compare_cuvs_exact_and_cagra",
    "CuGraphPprParityReceipt",
    "run_cugraph_ppr_parity",
    "TorchDeterminismReceipt",
    "configure_torch_determinism",
    "ExactSemanticSearchReceipt",
    "exact_semantic_search",
    "BfsReceipt",
    "CondensationDagReceipt",
    "deterministic_bfs",
    "condense_and_lexicographically_sort",
    "HypergraphTensorPprReceipt",
    "run_tensor_ppr",
    "TensorInterpolationReceipt",
    "interpolate_topology_field",
    "LowRankComparisonReceipt",
    "compare_low_rank_recommendations",
    "NeuralRouterReceipt",
    "train_receipt_router",
    "RapidsKMeansReceipt",
    "RapidsPcaReceipt",
    "deterministic_farthest_first_ordinals",
    "run_cuvs_kmeans",
    "run_cuvs_pca",
    "RepresentationComparisonReceipt",
    "compare_representations",
    "SpectralReceipt",
    "symmetric_eigenspace",
]
