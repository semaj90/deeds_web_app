"""Parent Atlas deterministic compute references and GPU challenger helpers.

These modules never own canonical application truth. They consume frozen,
revision-qualified tensors and emit derived rankings/proof receipts.
"""

from .aligned_snapshot_experiment_v2 import AlignedSnapshotExperimentV2Receipt, run_aligned_snapshot_experiment_v2
from .ann_compare import AnnComparisonReceipt, compare_cuvs_exact_and_cagra
from .cluster_softmax import CuvsSoftKMeansReceipt, run_cuvs_soft_kmeans
from .contextual_windows import ContextualWindowReceipt, contextualize_sliding_windows
from .cugraph_ppr import CuGraphPprParityReceipt, run_cugraph_ppr_parity
from .cuvs_analytics import (
    CuvsAllNeighborsReceipt,
    CuvsBinaryQuantizationReceipt,
    CuvsExactKnnReceipt,
    CuvsPairwiseReceipt,
    run_cuvs_all_neighbors,
    run_cuvs_binary_quantization,
    run_cuvs_exact_knn,
    run_cuvs_pairwise_distance,
)
from .determinism import TorchDeterminismReceipt, configure_torch_determinism
from .exact_semantic import ExactSemanticSearchReceipt, exact_semantic_search
from .feature_alignment import FeatureBlock, FeatureMatrixAlignmentReceipt, align_feature_blocks, make_feature_block
from .gpu_memory import GpuMemoryReceipt, GpuMemorySampler
from .graph_programs import BfsReceipt, CondensationDagReceipt, deterministic_bfs, condense_and_lexicographically_sort
from .hypergraph_tensor import HypergraphTensorPprReceipt, run_tensor_ppr
from .interpolation import TensorInterpolationReceipt, interpolate_topology_field
from .low_rank import LowRankComparisonReceipt, compare_low_rank_recommendations
from .model_topology import ModelTopologyDetection, audit_model_manifest, detect_model_topology
from .moe_grouped_mm import MoeGroupedMmReceipt, run_grouped_mm_experiment
from .nary_feature_propagation import NaryFeaturePropagationReceipt, propagate_nary_features
from .neural_router import NeuralRouterReceipt, train_receipt_router
from .ordered_context import OrderedContextReceipt, contextualize_explicit_order
from .qdrant_exact_alignment import QdrantExactAlignmentReceipt, compare_pytorch_and_qdrant_exact
from .rapids_matrix import (
    RapidsKMeansReceipt,
    RapidsPcaReceipt,
    deterministic_farthest_first_ordinals,
    run_cuvs_kmeans,
    run_cuvs_pca,
)
from .representation_compare import RepresentationComparisonReceipt, compare_representations
from .semantic_snapshot_freeze import (
    FrozenSemanticRow,
    FrozenSemanticSnapshotReceipt,
    freeze_semantic_snapshot,
    load_and_verify_frozen_snapshot,
)
from .som import SomLatticeReceipt, SomReceipt, aggregate_som_lattice, train_deterministic_som
from .sparse_relations import (
    SparseComputePolicyReceipt,
    SparseRelationReceipt,
    SparseSoftmaxReceipt,
    SparseSpmmReceipt,
    build_binary_incidence,
    choose_sparse_compute_mode,
    sparse_relation_softmax,
    sparse_relation_spmm,
)
from .spectral import SpectralReceipt, symmetric_eigenspace
from .torch_kernel_experiment import TorchKernelExperimentReceipt, run_torch_kernel_experiment

__all__ = [name for name in globals() if not name.startswith("_")]
