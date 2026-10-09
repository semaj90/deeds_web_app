"""Request-local graph neural feature execution over frozen Atlas ordinals.

NetworkX owns CPU topology construction for the reference path. PyTorch performs
the dense feature math on CPU or CUDA. Outputs are derived features only and
never establish graph, packet, or evidence authority.
"""

from __future__ import annotations

from dataclasses import asdict, dataclass
import hashlib
import json
import math
import random
from typing import Literal, Sequence

GnnArchitectureV1 = Literal[
    "GCN_SYMMETRIC_V1",
    "SAGE_MEAN_V1",
    "SAGE_LSTM_V1",
    "GAT_SINGLE_HEAD_V1",
    "GAT_MULTI_HEAD_V1",
    "GAT_V2_V1",
    "GIN_SUM_MLP_V1",
    "SAGE_MAXPOOL_V1",
    "SGC_K_STEP_V1",
    "APPNP_PROPAGATION_V1",
    "CHEB_CONV_V1",
    "GCNII_LAYER_V1",
    "RGCN_LAYER_V1",
    "PNA_LAYER_V1",
    "GPR_GNN_V1",
    "MIXHOP_LAYER_V1",
    "SIGN_CONCAT_V1",
    "EDGE_CONV_FIXED_GRAPH_V1",
    "JKNET_CONCAT_V1",
    "JKNET_MAXPOOL_V1",
    "JKNET_LSTM_ATTENTION_V1",
    "COMPGCN_MULTIPLICATIVE_V1",
    "GGNN_GRU_PROPAGATION_V1",
    "GRAND_DROP_NODE_AVERAGE_V1",
    "GRAPHORMER_SPATIAL_ATTENTION_V1",
    "HGT_TYPED_ATTENTION_V1",
    "H2GCN_CHANNEL_CONCAT_V1",
    "AGNN_PROPAGATION_V1",
    "HGNN_INCIDENCE_CONV_V1",
    "ARMA_RECURSIVE_V1",
    "LIGHTGCN_PROPAGATION_V1",
    "FAGCN_FREQUENCY_ADAPTATION_V1",
    "GATED_GCN_EDGE_GATE_V1",
    "MONET_GAUSSIAN_PSEUDOCOORD_V1",
    "ECC_EDGE_CONDITIONED_FILTER_V1",
]
GnnBackendV1 = Literal["networkx_torch_cpu", "networkx_torch_cuda"]


def _canonical_json(value: object) -> bytes:
    return json.dumps(value, sort_keys=True, separators=(",", ":"), ensure_ascii=False).encode("utf-8")


def _sha256(value: bytes) -> str:
    return f"sha256:{hashlib.sha256(value).hexdigest()}"


def _finite_matrix(values: Sequence[Sequence[float]], *, code: str) -> tuple[tuple[float, ...], ...]:
    if any(
        isinstance(value, bool) or not isinstance(value, (int, float))
        for row in values
        for value in row
    ):
        raise ValueError(code)
    matrix = tuple(tuple(float(value) for value in row) for row in values)
    if not matrix or not matrix[0] or any(len(row) != len(matrix[0]) for row in matrix):
        raise ValueError(code)
    if any(not math.isfinite(value) for row in matrix for value in row):
        raise ValueError(code)
    return matrix


@dataclass(frozen=True)
class GnnHyperedgeV1:
    fact_id: str
    participants: tuple[tuple[int, str], ...]
    source_revision: str
    evidence_refs: tuple[str, ...]
    producer_revision: str

    def __post_init__(self) -> None:
        if not all(isinstance(value, str) and value.strip() for value in (
            self.fact_id, self.source_revision, self.producer_revision
        )):
            raise ValueError("GNN_HYPEREDGE_LINEAGE_REQUIRED")
        if len(self.participants) < 2:
            raise ValueError("GNN_HYPEREDGE_MINIMUM_PARTICIPANTS")
        ordinals = tuple(ordinal for ordinal, _ in self.participants)
        if any(isinstance(ordinal, bool) or not isinstance(ordinal, int) for ordinal in ordinals):
            raise ValueError("GNN_HYPEREDGE_PARTICIPANT_ORDINAL_INVALID")
        if len(set(ordinals)) != len(ordinals):
            raise ValueError("GNN_HYPEREDGE_PARTICIPANT_DUPLICATE")
        if any(not isinstance(role, str) or not role.strip() for _, role in self.participants):
            raise ValueError("GNN_HYPEREDGE_PARTICIPANT_ROLE_REQUIRED")
        if not self.evidence_refs or any(not isinstance(ref, str) or not ref.strip() for ref in self.evidence_refs):
            raise ValueError("GNN_HYPEREDGE_EVIDENCE_REQUIRED")


@dataclass(frozen=True)
class GnnEdgeFeatureV1:
    source_ordinal: int
    target_ordinal: int
    values: tuple[float, ...]
    source_revision: str
    evidence_refs: tuple[str, ...]
    producer_revision: str

    def __post_init__(self) -> None:
        if any(
            isinstance(value, bool) or not isinstance(value, int)
            for value in (self.source_ordinal, self.target_ordinal)
        ) or self.source_ordinal >= self.target_ordinal:
            raise ValueError("GNN_EDGE_FEATURE_ENDPOINTS_INVALID")
        _finite_matrix((self.values,), code="GNN_EDGE_FEATURE_VALUES_INVALID")
        if not all(isinstance(value, str) and value.strip() for value in (
            self.source_revision, self.producer_revision
        )):
            raise ValueError("GNN_EDGE_FEATURE_LINEAGE_REQUIRED")
        if not self.evidence_refs or any(
            not isinstance(ref, str) or not ref.strip() for ref in self.evidence_refs
        ):
            raise ValueError("GNN_EDGE_FEATURE_EVIDENCE_REQUIRED")


@dataclass(frozen=True)
class GnnInputV1:
    candidate_snapshot_revision: str
    workspace_revision: str
    graph_revision: str
    node_ordinals: tuple[int, ...]
    canonical_ids: tuple[str, ...]
    source_revisions: tuple[str, ...]
    evidence_refs: tuple[tuple[str, ...], ...]
    edges: tuple[tuple[int, int], ...]
    features: tuple[tuple[float, ...], ...]
    relation_edges: tuple[tuple[int, int, str], ...] = ()
    node_types: tuple[str, ...] = ()
    hyperedges: tuple[GnnHyperedgeV1, ...] = ()
    edge_features: tuple[GnnEdgeFeatureV1, ...] = ()

    def __post_init__(self) -> None:
        for value, code in (
            (self.candidate_snapshot_revision, "GNN_CANDIDATE_SNAPSHOT_REVISION_REQUIRED"),
            (self.workspace_revision, "GNN_WORKSPACE_REVISION_REQUIRED"),
            (self.graph_revision, "GNN_GRAPH_REVISION_REQUIRED"),
        ):
            if not isinstance(value, str) or not value.strip():
                raise ValueError(code)
        if any(isinstance(value, bool) or not isinstance(value, int) for value in self.node_ordinals):
            raise ValueError("GNN_NODE_ORDINALS_MUST_BE_INTS")
        if not self.node_ordinals or tuple(sorted(set(self.node_ordinals))) != self.node_ordinals:
            raise ValueError("GNN_NODE_ORDINALS_MUST_BE_SORTED_UNIQUE")
        count = len(self.node_ordinals)
        if not (len(self.canonical_ids) == len(self.source_revisions) == len(self.evidence_refs) == len(self.features) == count):
            raise ValueError("GNN_NODE_BINDING_ROW_COUNT_MISMATCH")
        if any(
            not isinstance(value, str) or not value.strip()
            for value in self.canonical_ids + self.source_revisions
        ):
            raise ValueError("GNN_CANONICAL_ID_AND_SOURCE_REVISION_REQUIRED")
        if len(set(self.canonical_ids)) != count:
            raise ValueError("GNN_CANONICAL_ID_DUPLICATE")
        if self.node_types and (
            len(self.node_types) != count
            or any(not isinstance(value, str) or not value.strip() for value in self.node_types)
        ):
            raise ValueError("GNN_NODE_TYPES_INVALID")
        if any(
            not refs or any(not isinstance(ref, str) or not ref.strip() for ref in refs)
            for refs in self.evidence_refs
        ):
            raise ValueError("GNN_EVIDENCE_REF_REQUIRED_PER_NODE")
        node_set = set(self.node_ordinals)
        normalized_edges: list[tuple[int, int]] = []
        for source, target in self.edges:
            if any(isinstance(value, bool) or not isinstance(value, int) for value in (source, target)):
                raise ValueError("GNN_EDGE_ORDINALS_MUST_BE_INTS")
            if source == target:
                raise ValueError("GNN_INPUT_SELF_LOOPS_FORBIDDEN")
            if source not in node_set or target not in node_set:
                raise ValueError("GNN_EDGE_ENDPOINT_NOT_IN_ORDINAL_MAP")
            normalized_edges.append((min(source, target), max(source, target)))
        if len(set(normalized_edges)) != len(normalized_edges):
            raise ValueError("GNN_DUPLICATE_UNDIRECTED_EDGE")
        normalized_edge_set = set(normalized_edges)
        edge_feature_keys: set[tuple[int, int]] = set()
        for edge_feature in self.edge_features:
            if not isinstance(edge_feature, GnnEdgeFeatureV1):
                raise ValueError("GNN_EDGE_FEATURE_SCHEMA_INVALID")
            key = (edge_feature.source_ordinal, edge_feature.target_ordinal)
            if key not in normalized_edge_set:
                raise ValueError("GNN_EDGE_FEATURE_MISSING_TOPOLOGY_EDGE")
            if edge_feature.source_ordinal not in node_set or edge_feature.target_ordinal not in node_set:
                raise ValueError("GNN_EDGE_FEATURE_ENDPOINT_NOT_IN_ORDINAL_MAP")
            if key in edge_feature_keys:
                raise ValueError("GNN_EDGE_FEATURE_DUPLICATE_BINDING")
            edge_feature_keys.add(key)
        if self.edge_features and edge_feature_keys != normalized_edge_set:
            raise ValueError("GNN_EDGE_FEATURE_COVERAGE_MISMATCH")
        if self.edge_features and len({len(edge.values) for edge in self.edge_features}) != 1:
            raise ValueError("GNN_EDGE_FEATURE_WIDTH_MISMATCH")
        if any(not isinstance(edge, GnnHyperedgeV1) for edge in self.hyperedges):
            raise ValueError("GNN_HYPEREDGE_SCHEMA_INVALID")
        if len(self.hyperedges) > 256 or sum(len(edge.participants) for edge in self.hyperedges) > 4096:
            raise ValueError("GNN_HYPEREDGE_EXECUTION_BUDGET_EXCEEDED")
        if len({edge.fact_id for edge in self.hyperedges}) != len(self.hyperedges):
            raise ValueError("GNN_HYPEREDGE_FACT_ID_DUPLICATE")
        for hyperedge in self.hyperedges:
            if any(ordinal not in node_set for ordinal, _ in hyperedge.participants):
                raise ValueError("GNN_HYPEREDGE_PARTICIPANT_NOT_IN_ORDINAL_MAP")
        known_edges = set(normalized_edges)
        seen_relation_edges: set[tuple[int, int, str]] = set()
        for source, target, relation in self.relation_edges:
            if any(isinstance(value, bool) or not isinstance(value, int) for value in (source, target)):
                raise ValueError("GNN_RELATION_EDGE_ORDINAL_INVALID")
            if source == target or source not in node_set or target not in node_set:
                raise ValueError("GNN_RELATION_EDGE_ENDPOINT_INVALID")
            if not isinstance(relation, str) or not relation.strip():
                raise ValueError("GNN_RELATION_TYPE_REQUIRED")
            if (min(source, target), max(source, target)) not in known_edges:
                raise ValueError("GNN_RELATION_EDGE_MISSING_TOPOLOGY_EDGE")
            if (source, target, relation) in seen_relation_edges:
                raise ValueError("GNN_DUPLICATE_RELATION_EDGE")
            seen_relation_edges.add((source, target, relation))
        feature_rows = _finite_matrix(self.features, code="GNN_FEATURE_MATRIX_INVALID")
        if len(feature_rows) != count:
            raise ValueError("GNN_FEATURE_ROW_COUNT_MISMATCH")

    def canonical_payload(self) -> dict[str, object]:
        return {
            "schema": "atlas.gnn-input.v1",
            "candidateSnapshotRevision": self.candidate_snapshot_revision,
            "workspaceRevision": self.workspace_revision,
            "graphRevision": self.graph_revision,
            "nodeBindings": [
                {
                    "ordinal": ordinal,
                    "canonicalId": canonical_id,
                    "sourceRevision": source_revision,
                    "evidenceRefs": list(refs),
                }
                for ordinal, canonical_id, source_revision, refs in zip(
                    self.node_ordinals, self.canonical_ids, self.source_revisions, self.evidence_refs, strict=True
                )
            ],
            "edges": [list(edge) for edge in sorted((min(a, b), max(a, b)) for a, b in self.edges)],
            "edgeFeatures": [
                {
                    "sourceOrdinal": edge.source_ordinal,
                    "targetOrdinal": edge.target_ordinal,
                    "values": list(edge.values),
                    "sourceRevision": edge.source_revision,
                    "evidenceRefs": list(sorted(edge.evidence_refs)),
                    "producerRevision": edge.producer_revision,
                }
                for edge in sorted(self.edge_features, key=lambda item: (item.source_ordinal, item.target_ordinal))
            ],
            "relationEdges": [list(edge) for edge in sorted(self.relation_edges)],
            "nodeTypes": list(self.node_types),
            "hyperedges": [
                {
                    "factId": edge.fact_id,
                    "participants": [[ordinal, role] for ordinal, role in sorted(edge.participants)],
                    "sourceRevision": edge.source_revision,
                    "evidenceRefs": list(sorted(edge.evidence_refs)),
                    "producerRevision": edge.producer_revision,
                }
                for edge in sorted(self.hyperedges, key=lambda item: item.fact_id)
            ],
            "features": [list(row) for row in self.features],
        }

    def input_checksum(self) -> str:
        return _sha256(_canonical_json(self.canonical_payload()))


@dataclass(frozen=True)
class GnnModelV1:
    architecture: GnnArchitectureV1
    model_revision: str
    weight_matrix: tuple[tuple[float, ...], ...] = ()
    attention_source: tuple[float, ...] = ()
    attention_target: tuple[float, ...] = ()
    negative_slope: float = 0.2
    weight_matrix_2: tuple[tuple[float, ...], ...] = ()
    epsilon: float = 0.0
    propagation_steps: int = 1
    head_weight_matrices: tuple[tuple[tuple[float, ...], ...], ...] = ()
    head_attention_source: tuple[tuple[float, ...], ...] = ()
    head_attention_target: tuple[tuple[float, ...], ...] = ()
    neighbor_pool_weight_matrix: tuple[tuple[float, ...], ...] = ()
    neighbor_pool_bias: tuple[float, ...] = ()
    teleport_probability: float = 0.1
    polynomial_weight_matrices: tuple[tuple[tuple[float, ...], ...], ...] = ()
    gat_v2_target_weight_matrix: tuple[tuple[float, ...], ...] = ()
    gcn_initial_residual_alpha: float = 0.1
    gcn_identity_beta: float = 0.5
    relation_types: tuple[str, ...] = ()
    relation_weight_matrices: tuple[tuple[tuple[float, ...], ...], ...] = ()
    relation_embeddings: tuple[tuple[float, ...], ...] = ()
    gated_graph_step_count: int = 0
    gated_graph_update_weight_matrices: tuple[tuple[tuple[float, ...], ...], ...] = ()
    grand_sample_count: int = 0
    grand_propagation_steps: int = 0
    grand_drop_probability: float = 0.0
    grand_seed: int = 0
    graphormer_query_weight_matrix: tuple[tuple[float, ...], ...] = ()
    graphormer_key_weight_matrix: tuple[tuple[float, ...], ...] = ()
    graphormer_degree_embedding_matrix: tuple[tuple[float, ...], ...] = ()
    graphormer_spatial_distance_biases: tuple[float, ...] = ()
    graphormer_spatial_unreachable_bias: float = 0.0
    graphormer_max_node_count: int = 0
    graphormer_edge_relation_names: tuple[str, ...] = ()
    graphormer_path_edge_biases: tuple[tuple[tuple[float, float], ...], ...] = ()
    graphormer_max_path_length: int = 0
    hgt_node_type_names: tuple[str, ...] = ()
    hgt_relation_type_names: tuple[str, ...] = ()
    hgt_query_matrices: tuple[tuple[str, tuple[tuple[float, ...], ...]], ...] = ()
    hgt_key_matrices: tuple[tuple[str, tuple[tuple[float, ...], ...]], ...] = ()
    hgt_value_matrices: tuple[tuple[str, tuple[tuple[float, ...], ...]], ...] = ()
    hgt_output_matrices: tuple[tuple[str, tuple[tuple[float, ...], ...]], ...] = ()
    hgt_relation_key_matrices: tuple[tuple[str, tuple[tuple[float, ...], ...]], ...] = ()
    hgt_relation_value_matrices: tuple[tuple[str, tuple[tuple[float, ...], ...]], ...] = ()
    hgt_relation_attention_biases: tuple[tuple[str, tuple[float, ...]], ...] = ()
    hgt_max_node_count: int = 0
    hgt_max_relation_edge_count: int = 0
    hgt_head_count: int = 0
    pna_average_log_degree: float = 1.0
    gpr_coefficients: tuple[float, ...] = ()
    mixhop_weight_matrices: tuple[tuple[tuple[float, ...], ...], ...] = ()
    sign_channel_weight_matrices: tuple[tuple[tuple[float, ...], ...], ...] = ()
    jk_layer_weight_matrices: tuple[tuple[tuple[float, ...], ...], ...] = ()
    jk_lstm_hidden_size: int = 0
    jk_lstm_weight_ih_forward: tuple[tuple[float, ...], ...] = ()
    jk_lstm_weight_hh_forward: tuple[tuple[float, ...], ...] = ()
    jk_lstm_bias_ih_forward: tuple[float, ...] = ()
    jk_lstm_bias_hh_forward: tuple[float, ...] = ()
    jk_lstm_weight_ih_reverse: tuple[tuple[float, ...], ...] = ()
    jk_lstm_weight_hh_reverse: tuple[tuple[float, ...], ...] = ()
    jk_lstm_bias_ih_reverse: tuple[float, ...] = ()
    jk_lstm_bias_hh_reverse: tuple[float, ...] = ()
    jk_lstm_attention_vector: tuple[float, ...] = ()
    h2gcn_max_node_count: int = 0
    agnn_beta: float = 0.0
    agnn_input_width: int = 0
    arma_recurrence_steps: int = 0
    arma_skip_weight_matrix: tuple[tuple[float, ...], ...] = ()
    lightgcn_embedding_width: int = 0
    lightgcn_layer_count: int = 0
    fagcn_gate_vector: tuple[float, ...] = ()
    fagcn_epsilon: float = 0.0
    fagcn_layer_count: int = 0
    gated_edge_source_vector: tuple[float, ...] = ()
    gated_edge_target_vector: tuple[float, ...] = ()
    gated_edge_feature_vector: tuple[float, ...] = ()
    gated_edge_layer_count: int = 0
    monet_kernel_centers: tuple[tuple[float, ...], ...] = ()
    monet_kernel_variances: tuple[tuple[float, ...], ...] = ()
    monet_kernel_weight_matrices: tuple[tuple[tuple[float, ...], ...], ...] = ()
    ecc_filter_generator: tuple[tuple[float, ...], ...] = ()
    ecc_root_weight_matrix: tuple[tuple[float, ...], ...] = ()
    sage_lstm_weight_ih: tuple[tuple[float, ...], ...] = ()
    sage_lstm_weight_hh: tuple[tuple[float, ...], ...] = ()
    sage_lstm_bias_ih: tuple[float, ...] = ()
    sage_lstm_bias_hh: tuple[float, ...] = ()
    sage_lstm_max_neighbor_count: int = 0

    def __post_init__(self) -> None:
        if self.architecture not in (
            "GCN_SYMMETRIC_V1",
            "SAGE_MEAN_V1",
            "SAGE_LSTM_V1",
            "GAT_SINGLE_HEAD_V1",
            "GAT_MULTI_HEAD_V1",
            "GAT_V2_V1",
            "GIN_SUM_MLP_V1",
            "SAGE_MAXPOOL_V1",
            "SGC_K_STEP_V1",
            "APPNP_PROPAGATION_V1",
            "CHEB_CONV_V1",
            "GCNII_LAYER_V1",
            "RGCN_LAYER_V1",
            "PNA_LAYER_V1",
            "GPR_GNN_V1",
            "MIXHOP_LAYER_V1",
            "SIGN_CONCAT_V1",
            "EDGE_CONV_FIXED_GRAPH_V1",
            "JKNET_CONCAT_V1",
            "JKNET_MAXPOOL_V1",
            "JKNET_LSTM_ATTENTION_V1",
            "COMPGCN_MULTIPLICATIVE_V1",
            "GGNN_GRU_PROPAGATION_V1",
            "GRAND_DROP_NODE_AVERAGE_V1",
            "GRAPHORMER_SPATIAL_ATTENTION_V1",
            "HGT_TYPED_ATTENTION_V1",
            "H2GCN_CHANNEL_CONCAT_V1",
            "AGNN_PROPAGATION_V1",
            "HGNN_INCIDENCE_CONV_V1",
            "ARMA_RECURSIVE_V1",
            "LIGHTGCN_PROPAGATION_V1",
            "FAGCN_FREQUENCY_ADAPTATION_V1",
            "GATED_GCN_EDGE_GATE_V1",
            "MONET_GAUSSIAN_PSEUDOCOORD_V1",
            "ECC_EDGE_CONDITIONED_FILTER_V1",
        ):
            raise ValueError("GNN_ARCHITECTURE_UNSUPPORTED")
        if not isinstance(self.model_revision, str) or not self.model_revision.strip():
            raise ValueError("GNN_MODEL_REVISION_REQUIRED")
        if self.architecture in ("AGNN_PROPAGATION_V1", "LIGHTGCN_PROPAGATION_V1"):
            if self.weight_matrix:
                raise ValueError(
                    "GNN_AGNN_WEIGHT_MATRIX_UNEXPECTED"
                    if self.architecture == "AGNN_PROPAGATION_V1"
                    else "GNN_LIGHTGCN_WEIGHT_MATRIX_UNEXPECTED"
                )
            input_width = self.agnn_input_width if self.architecture == "AGNN_PROPAGATION_V1" else self.lightgcn_embedding_width
            if (
                isinstance(input_width, bool)
                or not isinstance(input_width, int)
                or not 1 <= input_width <= 1024
            ):
                raise ValueError(
                    "GNN_AGNN_INPUT_WIDTH_INVALID"
                    if self.architecture == "AGNN_PROPAGATION_V1"
                    else "GNN_LIGHTGCN_EMBEDDING_WIDTH_INVALID"
                )
            weights = tuple(
                tuple(float(row == column) for column in range(input_width))
                for row in range(input_width)
            )
        elif self.architecture in ("MONET_GAUSSIAN_PSEUDOCOORD_V1", "ECC_EDGE_CONDITIONED_FILTER_V1"):
            if self.weight_matrix or self.weight_matrix_2:
                raise ValueError("GNN_EDGE_CONDITIONED_GENERIC_WEIGHT_MATRIX_UNEXPECTED")
            if self.architecture == "MONET_GAUSSIAN_PSEUDOCOORD_V1":
                if not 1 <= len(self.monet_kernel_centers) <= 8:
                    raise ValueError("GNN_MONET_KERNEL_COUNT_INVALID")
                centers = _finite_matrix(self.monet_kernel_centers, code="GNN_MONET_KERNEL_CENTERS_INVALID")
                variances = _finite_matrix(self.monet_kernel_variances, code="GNN_MONET_KERNEL_VARIANCES_INVALID")
                kernel_matrices = tuple(
                    _finite_matrix(matrix, code="GNN_MONET_KERNEL_WEIGHT_MATRIX_INVALID")
                    for matrix in self.monet_kernel_weight_matrices
                )
                if len(centers) != len(variances) or len(centers) != len(kernel_matrices):
                    raise ValueError("GNN_MONET_KERNEL_PARAMETER_COUNT_MISMATCH")
                if len(centers[0]) != len(variances[0]) or any(
                    len(row) != len(centers[0]) for row in centers + variances
                ):
                    raise ValueError("GNN_MONET_PSEUDOCOORD_WIDTH_MISMATCH")
                input_width = len(kernel_matrices[0])
                output_width = len(kernel_matrices[0][0])
                if any(
                    any(value <= 0.0 or value > 64.0 for value in row)
                    or len(matrix) != input_width
                    or any(len(row) != output_width for row in matrix)
                    for row, matrix in zip(variances, kernel_matrices, strict=True)
                ):
                    raise ValueError("GNN_MONET_KERNEL_PARAMETER_SHAPE_OR_VARIANCE_INVALID")
                if not 1 <= input_width <= 1024 or not 1 <= output_width <= 1024:
                    raise ValueError("GNN_MONET_FEATURE_WIDTH_OUT_OF_BOUNDS")
                weights = kernel_matrices[0]
            else:
                if self.monet_kernel_centers or self.monet_kernel_variances or self.monet_kernel_weight_matrices:
                    raise ValueError("GNN_ECC_MONET_PARAMETERS_UNEXPECTED")
                generator = _finite_matrix(self.ecc_filter_generator, code="GNN_ECC_FILTER_GENERATOR_INVALID")
                root_weights = _finite_matrix(self.ecc_root_weight_matrix, code="GNN_ECC_ROOT_WEIGHT_MATRIX_INVALID")
                input_width = len(root_weights)
                output_width = len(root_weights[0])
                if any(len(row) != output_width for row in root_weights) or not 1 <= input_width <= 256 or not 1 <= output_width <= 256:
                    raise ValueError("GNN_ECC_ROOT_WEIGHT_SHAPE_INVALID")
                if not 1 <= len(generator) <= 64 or any(
                    len(row) != input_width * output_width for row in generator
                ):
                    raise ValueError("GNN_ECC_FILTER_GENERATOR_SHAPE_INVALID")
                weights = root_weights
        else:
            weights = _finite_matrix(self.weight_matrix, code="GNN_WEIGHT_MATRIX_INVALID")
        if self.architecture == "SAGE_LSTM_V1":
            input_width = len(weights) // 2
            weight_ih = _finite_matrix(self.sage_lstm_weight_ih, code="GNN_SAGE_LSTM_WEIGHT_IH_INVALID")
            weight_hh = _finite_matrix(self.sage_lstm_weight_hh, code="GNN_SAGE_LSTM_WEIGHT_HH_INVALID")
            if (
                len(weights) != input_width * 2
                or len(weight_ih) != input_width * 4
                or any(len(row) != input_width for row in weight_ih)
                or len(weight_hh) != input_width * 4
                or any(len(row) != input_width for row in weight_hh)
                or len(self.sage_lstm_bias_ih) != input_width * 4
                or len(self.sage_lstm_bias_hh) != input_width * 4
                or any(
                    isinstance(value, bool)
                    or not isinstance(value, (int, float))
                    or not math.isfinite(float(value))
                    for value in self.sage_lstm_bias_ih + self.sage_lstm_bias_hh
                )
            ):
                raise ValueError("GNN_SAGE_LSTM_PARAMETER_SHAPE_INVALID")
            if (
                isinstance(self.sage_lstm_max_neighbor_count, bool)
                or not isinstance(self.sage_lstm_max_neighbor_count, int)
                or not 1 <= self.sage_lstm_max_neighbor_count <= 256
            ):
                raise ValueError("GNN_SAGE_LSTM_NEIGHBOR_BUDGET_INVALID")
        elif any((
            self.sage_lstm_weight_ih,
            self.sage_lstm_weight_hh,
            self.sage_lstm_bias_ih,
            self.sage_lstm_bias_hh,
            self.sage_lstm_max_neighbor_count,
        )):
            raise ValueError("GNN_SAGE_LSTM_PARAMETERS_UNEXPECTED")
        if self.architecture in ("GIN_SUM_MLP_V1", "FAGCN_FREQUENCY_ADAPTATION_V1", "GATED_GCN_EDGE_GATE_V1"):
            second_weights = _finite_matrix(self.weight_matrix_2, code="GNN_WEIGHT_MATRIX_2_INVALID")
            if len(second_weights) != len(weights[0]):
                mismatch_code = {
                    "GIN_SUM_MLP_V1": "GNN_GIN_HIDDEN_WIDTH_MISMATCH",
                    "FAGCN_FREQUENCY_ADAPTATION_V1": "GNN_FAGCN_OUTPUT_WEIGHT_INPUT_WIDTH_MISMATCH",
                    "GATED_GCN_EDGE_GATE_V1": "GNN_GATED_GCN_OUTPUT_WEIGHT_INPUT_WIDTH_MISMATCH",
                }[self.architecture]
                raise ValueError(mismatch_code)
            if self.architecture == "GIN_SUM_MLP_V1" and (
                isinstance(self.epsilon, bool)
                or not isinstance(self.epsilon, (int, float))
                or not math.isfinite(self.epsilon)
            ):
                raise ValueError("GNN_GIN_EPSILON_INVALID")
        elif self.weight_matrix_2:
            raise ValueError("GNN_SECOND_WEIGHT_MATRIX_UNEXPECTED")
        if self.architecture == "CHEB_CONV_V1":
            polynomial_weights = tuple(
                _finite_matrix(matrix, code="GNN_CHEB_POLYNOMIAL_WEIGHT_MATRIX_INVALID")
                for matrix in self.polynomial_weight_matrices
            )
            if not 1 <= len(polynomial_weights) <= 5:
                raise ValueError("GNN_CHEB_ORDER_OUT_OF_BOUNDS")
            output_width = len(weights[0])
            if any(len(matrix[0]) != output_width for matrix in polynomial_weights):
                raise ValueError("GNN_CHEB_OUTPUT_WIDTH_MISMATCH")
        elif self.polynomial_weight_matrices:
            raise ValueError("GNN_CHEB_PARAMETERS_UNEXPECTED")
        if self.architecture == "GAT_V2_V1":
            target_weights = _finite_matrix(
                self.gat_v2_target_weight_matrix,
                code="GNN_GAT_V2_TARGET_WEIGHT_MATRIX_INVALID",
            )
            if len(target_weights) != len(weights) or len(target_weights[0]) != len(weights[0]):
                raise ValueError("GNN_GAT_V2_PROJECTION_SHAPE_MISMATCH")
        elif self.gat_v2_target_weight_matrix:
            raise ValueError("GNN_GAT_V2_PARAMETERS_UNEXPECTED")
        if self.architecture == "GCNII_LAYER_V1":
            if len(weights) != len(weights[0]):
                raise ValueError("GNN_GCNII_WEIGHT_MATRIX_MUST_BE_SQUARE")
            for value, code, include_zero in (
                (self.gcn_initial_residual_alpha, "GNN_GCNII_ALPHA_INVALID", False),
                (self.gcn_identity_beta, "GNN_GCNII_BETA_INVALID", True),
            ):
                if (
                    isinstance(value, bool)
                    or not isinstance(value, (int, float))
                    or not math.isfinite(float(value))
                    or value < 0.0
                    or value > 1.0
                    or (not include_zero and value == 0.0)
                ):
                    raise ValueError(code)
        elif self.gcn_initial_residual_alpha != 0.1 or self.gcn_identity_beta != 0.5:
            raise ValueError("GNN_GCNII_PARAMETERS_UNEXPECTED")
        if self.architecture in ("RGCN_LAYER_V1", "COMPGCN_MULTIPLICATIVE_V1"):
            if not self.relation_types or any(not value.strip() for value in self.relation_types) or len(set(self.relation_types)) != len(self.relation_types):
                raise ValueError("GNN_RGCN_RELATION_TYPES_INVALID")
            relation_weights = tuple(
                _finite_matrix(matrix, code="GNN_RGCN_RELATION_WEIGHT_INVALID")
                for matrix in self.relation_weight_matrices
            )
            if len(relation_weights) != len(self.relation_types):
                raise ValueError("GNN_RGCN_RELATION_WEIGHT_COUNT_MISMATCH")
            if any(len(matrix) != len(weights) or len(matrix[0]) != len(weights[0]) for matrix in relation_weights):
                raise ValueError("GNN_RGCN_RELATION_WEIGHT_SHAPE_MISMATCH")
            if self.architecture == "COMPGCN_MULTIPLICATIVE_V1":
                if len(self.relation_embeddings) != len(self.relation_types):
                    raise ValueError("GNN_COMPGCN_RELATION_EMBEDDING_COUNT_MISMATCH")
                if any(
                    len(embedding) != len(weights)
                    or any(
                        isinstance(value, bool)
                        or not isinstance(value, (int, float))
                        or not math.isfinite(float(value))
                        for value in embedding
                    )
                    for embedding in self.relation_embeddings
                ):
                    raise ValueError("GNN_COMPGCN_RELATION_EMBEDDING_INVALID")
            elif self.relation_embeddings:
                raise ValueError("GNN_RGCN_RELATION_EMBEDDINGS_UNEXPECTED")
        elif self.relation_types or self.relation_weight_matrices or self.relation_embeddings:
            raise ValueError("GNN_RGCN_PARAMETERS_UNEXPECTED")
        if self.architecture == "PNA_LAYER_V1":
            if (
                isinstance(self.pna_average_log_degree, bool)
                or not isinstance(self.pna_average_log_degree, (int, float))
                or not math.isfinite(float(self.pna_average_log_degree))
                or self.pna_average_log_degree <= 0.0
            ):
                raise ValueError("GNN_PNA_AVERAGE_LOG_DEGREE_INVALID")
        elif self.pna_average_log_degree != 1.0:
            raise ValueError("GNN_PNA_PARAMETERS_UNEXPECTED")
        if self.architecture == "GPR_GNN_V1":
            if not 2 <= len(self.gpr_coefficients) <= 17 or any(
                isinstance(value, bool)
                or not isinstance(value, (int, float))
                or not math.isfinite(float(value))
                for value in self.gpr_coefficients
            ):
                raise ValueError("GNN_GPR_COEFFICIENTS_INVALID")
        elif self.gpr_coefficients:
            raise ValueError("GNN_GPR_PARAMETERS_UNEXPECTED")
        if self.architecture == "MIXHOP_LAYER_V1":
            mixhop_weights = tuple(
                _finite_matrix(matrix, code="GNN_MIXHOP_WEIGHT_MATRIX_INVALID")
                for matrix in self.mixhop_weight_matrices
            )
            if not 1 <= len(mixhop_weights) <= 4:
                raise ValueError("GNN_MIXHOP_HOP_COUNT_INVALID")
            if any(len(matrix) != len(weights) or len(matrix[0]) != len(weights[0]) for matrix in mixhop_weights):
                raise ValueError("GNN_MIXHOP_WEIGHT_SHAPE_MISMATCH")
        elif self.mixhop_weight_matrices:
            raise ValueError("GNN_MIXHOP_PARAMETERS_UNEXPECTED")
        if self.architecture == "SIGN_CONCAT_V1":
            sign_weights = tuple(
                _finite_matrix(matrix, code="GNN_SIGN_WEIGHT_MATRIX_INVALID")
                for matrix in self.sign_channel_weight_matrices
            )
            if not 1 <= len(sign_weights) <= 4:
                raise ValueError("GNN_SIGN_CHANNEL_COUNT_INVALID")
            if any(
                len(matrix) != len(weights) or len(matrix[0]) != len(weights[0])
                for matrix in sign_weights
            ):
                raise ValueError("GNN_SIGN_WEIGHT_SHAPE_MISMATCH")
        elif self.sign_channel_weight_matrices:
            raise ValueError("GNN_SIGN_PARAMETERS_UNEXPECTED")
        if self.architecture in ("JKNET_CONCAT_V1", "JKNET_MAXPOOL_V1", "JKNET_LSTM_ATTENTION_V1"):
            jk_weights = tuple(
                _finite_matrix(matrix, code="GNN_JKNET_WEIGHT_MATRIX_INVALID")
                for matrix in self.jk_layer_weight_matrices
            )
            if not 1 <= len(jk_weights) <= 3:
                raise ValueError("GNN_JKNET_LAYER_COUNT_INVALID")
            previous_width = len(weights[0])
            output_width = len(weights[0])
            for matrix in jk_weights:
                if len(matrix) != previous_width or len(matrix[0]) != output_width:
                    raise ValueError("GNN_JKNET_WEIGHT_SHAPE_MISMATCH")
                previous_width = output_width
        elif self.jk_layer_weight_matrices:
            raise ValueError("GNN_JKNET_PARAMETERS_UNEXPECTED")
        if self.architecture == "JKNET_LSTM_ATTENTION_V1":
            hidden_size = self.jk_lstm_hidden_size
            if isinstance(hidden_size, bool) or not isinstance(hidden_size, int) or not 1 <= hidden_size <= 64:
                raise ValueError("GNN_JKNET_LSTM_HIDDEN_SIZE_INVALID")
            input_width = len(weights[0])
            for direction in ("forward", "reverse"):
                weight_ih = _finite_matrix(
                    getattr(self, f"jk_lstm_weight_ih_{direction}"),
                    code="GNN_JKNET_LSTM_WEIGHT_IH_INVALID",
                )
                weight_hh = _finite_matrix(
                    getattr(self, f"jk_lstm_weight_hh_{direction}"),
                    code="GNN_JKNET_LSTM_WEIGHT_HH_INVALID",
                )
                bias_ih = getattr(self, f"jk_lstm_bias_ih_{direction}")
                bias_hh = getattr(self, f"jk_lstm_bias_hh_{direction}")
                if len(weight_ih) != 4 * hidden_size or len(weight_ih[0]) != input_width:
                    raise ValueError("GNN_JKNET_LSTM_WEIGHT_IH_SHAPE_MISMATCH")
                if len(weight_hh) != 4 * hidden_size or len(weight_hh[0]) != hidden_size:
                    raise ValueError("GNN_JKNET_LSTM_WEIGHT_HH_SHAPE_MISMATCH")
                for bias, code in (
                    (bias_ih, "GNN_JKNET_LSTM_BIAS_IH_INVALID"),
                    (bias_hh, "GNN_JKNET_LSTM_BIAS_HH_INVALID"),
                ):
                    if len(bias) != 4 * hidden_size or any(
                        isinstance(value, bool)
                        or not isinstance(value, (int, float))
                        or not math.isfinite(float(value))
                        for value in bias
                    ):
                        raise ValueError(code)
            if len(self.jk_lstm_attention_vector) != 2 * hidden_size or any(
                isinstance(value, bool)
                or not isinstance(value, (int, float))
                or not math.isfinite(float(value))
                for value in self.jk_lstm_attention_vector
            ):
                raise ValueError("GNN_JKNET_LSTM_ATTENTION_VECTOR_INVALID")
        elif any((
            self.jk_lstm_hidden_size,
            self.jk_lstm_weight_ih_forward,
            self.jk_lstm_weight_hh_forward,
            self.jk_lstm_bias_ih_forward,
            self.jk_lstm_bias_hh_forward,
            self.jk_lstm_weight_ih_reverse,
            self.jk_lstm_weight_hh_reverse,
            self.jk_lstm_bias_ih_reverse,
            self.jk_lstm_bias_hh_reverse,
            self.jk_lstm_attention_vector,
        )):
            raise ValueError("GNN_JKNET_LSTM_PARAMETERS_UNEXPECTED")
        if self.architecture == "H2GCN_CHANNEL_CONCAT_V1":
            if (
                isinstance(self.h2gcn_max_node_count, bool)
                or not isinstance(self.h2gcn_max_node_count, int)
                or not 1 <= self.h2gcn_max_node_count <= 256
            ):
                raise ValueError("GNN_H2GCN_NODE_BUDGET_INVALID")
        elif self.h2gcn_max_node_count:
            raise ValueError("GNN_H2GCN_PARAMETERS_UNEXPECTED")
        if self.architecture == "ARMA_RECURSIVE_V1":
            skip_weights = _finite_matrix(
                self.arma_skip_weight_matrix,
                code="GNN_ARMA_SKIP_WEIGHT_MATRIX_INVALID",
            )
            if len(weights) != len(weights[0]):
                raise ValueError("GNN_ARMA_RECURRENT_WEIGHT_MATRIX_MUST_BE_SQUARE")
            if len(skip_weights[0]) != len(weights[0]):
                raise ValueError("GNN_ARMA_SKIP_OUTPUT_WIDTH_MISMATCH")
            if (
                isinstance(self.arma_recurrence_steps, bool)
                or not isinstance(self.arma_recurrence_steps, int)
                or not 1 <= self.arma_recurrence_steps <= 8
            ):
                raise ValueError("GNN_ARMA_RECURRENCE_STEPS_INVALID")
        elif self.arma_recurrence_steps or self.arma_skip_weight_matrix:
            raise ValueError("GNN_ARMA_PARAMETERS_UNEXPECTED")
        if self.architecture == "LIGHTGCN_PROPAGATION_V1":
            if (
                isinstance(self.lightgcn_layer_count, bool)
                or not isinstance(self.lightgcn_layer_count, int)
                or not 1 <= self.lightgcn_layer_count <= 8
            ):
                raise ValueError("GNN_LIGHTGCN_LAYER_COUNT_INVALID")
        elif self.lightgcn_embedding_width or self.lightgcn_layer_count:
            raise ValueError("GNN_LIGHTGCN_PARAMETERS_UNEXPECTED")
        if self.architecture == "FAGCN_FREQUENCY_ADAPTATION_V1":
            hidden_width = len(weights[0])
            if len(self.fagcn_gate_vector) != 2 * hidden_width or any(
                isinstance(value, bool)
                or not isinstance(value, (int, float))
                or not math.isfinite(float(value))
                for value in self.fagcn_gate_vector
            ):
                raise ValueError("GNN_FAGCN_GATE_VECTOR_INVALID")
            if (
                isinstance(self.fagcn_epsilon, bool)
                or not isinstance(self.fagcn_epsilon, (int, float))
                or not math.isfinite(float(self.fagcn_epsilon))
                or not 0.0 <= self.fagcn_epsilon <= 1.0
            ):
                raise ValueError("GNN_FAGCN_EPSILON_INVALID")
            if (
                isinstance(self.fagcn_layer_count, bool)
                or not isinstance(self.fagcn_layer_count, int)
                or not 1 <= self.fagcn_layer_count <= 8
            ):
                raise ValueError("GNN_FAGCN_LAYER_COUNT_INVALID")
        elif self.fagcn_gate_vector or self.fagcn_epsilon or self.fagcn_layer_count:
            raise ValueError("GNN_FAGCN_PARAMETERS_UNEXPECTED")
        if self.architecture == "GATED_GCN_EDGE_GATE_V1":
            input_width = len(weights)
            if len(weights) != len(weights[0]) or len(second_weights) != input_width or len(second_weights[0]) != input_width:
                raise ValueError("GNN_GATED_GCN_WEIGHT_MATRICES_MUST_BE_SQUARE")
            for vector, code in (
                (self.gated_edge_source_vector, "GNN_GATED_GCN_SOURCE_GATE_INVALID"),
                (self.gated_edge_target_vector, "GNN_GATED_GCN_TARGET_GATE_INVALID"),
                (self.gated_edge_feature_vector, "GNN_GATED_GCN_EDGE_GATE_INVALID"),
            ):
                if len(vector) != input_width or any(
                    isinstance(value, bool) or not isinstance(value, (int, float)) or not math.isfinite(float(value))
                    for value in vector
                ):
                    raise ValueError(code)
            if (
                isinstance(self.gated_edge_layer_count, bool)
                or not isinstance(self.gated_edge_layer_count, int)
                or not 1 <= self.gated_edge_layer_count <= 4
            ):
                raise ValueError("GNN_GATED_GCN_LAYER_COUNT_INVALID")
        elif any((
            self.gated_edge_source_vector,
            self.gated_edge_target_vector,
            self.gated_edge_feature_vector,
            self.gated_edge_layer_count,
        )):
            raise ValueError("GNN_GATED_GCN_PARAMETERS_UNEXPECTED")
        if self.architecture != "MONET_GAUSSIAN_PSEUDOCOORD_V1" and any((
            self.monet_kernel_centers,
            self.monet_kernel_variances,
            self.monet_kernel_weight_matrices,
        )):
            raise ValueError("GNN_MONET_PARAMETERS_UNEXPECTED")
        if self.architecture != "ECC_EDGE_CONDITIONED_FILTER_V1" and any((
            self.ecc_filter_generator,
            self.ecc_root_weight_matrix,
        )):
            raise ValueError("GNN_ECC_PARAMETERS_UNEXPECTED")
        if self.architecture == "AGNN_PROPAGATION_V1":
            if len(weights) != len(weights[0]):
                raise ValueError("GNN_AGNN_WEIGHT_MATRIX_MUST_BE_SQUARE")
            if (
                isinstance(self.agnn_beta, bool)
                or not isinstance(self.agnn_beta, (int, float))
                or not math.isfinite(float(self.agnn_beta))
                or not 0.0 <= self.agnn_beta <= 16.0
            ):
                raise ValueError("GNN_AGNN_BETA_INVALID")
        elif self.agnn_beta != 0.0:
            raise ValueError("GNN_AGNN_PARAMETERS_UNEXPECTED")
        if self.architecture != "AGNN_PROPAGATION_V1" and self.agnn_input_width:
            raise ValueError("GNN_AGNN_PARAMETERS_UNEXPECTED")
        if self.architecture == "SAGE_MAXPOOL_V1":
            pool_weights = _finite_matrix(
                self.neighbor_pool_weight_matrix,
                code="GNN_SAGE_POOL_WEIGHT_MATRIX_INVALID",
            )
            if any(
                isinstance(value, bool)
                or not isinstance(value, (int, float))
                or not math.isfinite(float(value))
                for value in self.neighbor_pool_bias
            ):
                raise ValueError("GNN_SAGE_POOL_BIAS_INVALID")
            if len(self.neighbor_pool_bias) != len(pool_weights[0]):
                raise ValueError("GNN_SAGE_POOL_BIAS_WIDTH_MISMATCH")
        elif self.neighbor_pool_weight_matrix or self.neighbor_pool_bias:
            raise ValueError("GNN_SAGE_POOL_PARAMETERS_UNEXPECTED")
        if self.architecture == "GAT_MULTI_HEAD_V1":
            extra_heads = tuple(
                _finite_matrix(matrix, code="GNN_GAT_HEAD_WEIGHT_MATRIX_INVALID")
                for matrix in self.head_weight_matrices
            )
            if not extra_heads:
                raise ValueError("GNN_GAT_MULTI_HEAD_REQUIRED")
            if len(self.head_attention_source) != len(extra_heads) or len(self.head_attention_target) != len(extra_heads):
                raise ValueError("GNN_GAT_HEAD_COUNT_MISMATCH")
            head_dimensions = (len(weights[0]),) + tuple(len(matrix[0]) for matrix in extra_heads)
            if len(self.attention_source) != head_dimensions[0] or len(self.attention_target) != head_dimensions[0]:
                raise ValueError("GNN_GAT_ATTENTION_WIDTH_MISMATCH")
            for dimension, source, target in zip(
                head_dimensions[1:], self.head_attention_source, self.head_attention_target, strict=True
            ):
                if len(source) != dimension or len(target) != dimension:
                    raise ValueError("GNN_GAT_ATTENTION_WIDTH_MISMATCH")
                if any(
                    isinstance(value, bool)
                    or not isinstance(value, (int, float))
                    or not math.isfinite(float(value))
                    for value in source + target
                ):
                    raise ValueError("GNN_GAT_ATTENTION_VALUE_INVALID")
        elif self.head_weight_matrices or self.head_attention_source or self.head_attention_target:
            raise ValueError("GNN_GAT_HEAD_PARAMETERS_UNEXPECTED")
        if self.architecture in ("SGC_K_STEP_V1", "APPNP_PROPAGATION_V1"):
            if isinstance(self.propagation_steps, bool) or not isinstance(self.propagation_steps, int):
                raise ValueError(
                    "GNN_SGC_PROPAGATION_STEPS_INVALID"
                    if self.architecture == "SGC_K_STEP_V1"
                    else "GNN_APPNP_PROPAGATION_STEPS_INVALID"
                )
            if not 1 <= self.propagation_steps <= 16:
                raise ValueError(
                    "GNN_SGC_PROPAGATION_STEPS_INVALID"
                    if self.architecture == "SGC_K_STEP_V1"
                    else "GNN_APPNP_PROPAGATION_STEPS_INVALID"
                )
        elif self.propagation_steps != 1:
            raise ValueError("GNN_PROPAGATION_STEPS_UNEXPECTED")
        if self.architecture in ("GAT_SINGLE_HEAD_V1", "GAT_MULTI_HEAD_V1"):
            output_width = len(weights[0])
            if len(self.attention_source) != output_width or len(self.attention_target) != output_width:
                raise ValueError("GNN_GAT_ATTENTION_WIDTH_MISMATCH")
            if any(
                isinstance(value, bool)
                or not isinstance(value, (int, float))
                or not math.isfinite(float(value))
                for value in self.attention_source + self.attention_target
            ):
                raise ValueError("GNN_GAT_ATTENTION_VALUE_INVALID")
        elif self.architecture == "GAT_V2_V1":
            output_width = len(weights[0])
            if len(self.attention_source) != output_width or self.attention_target:
                raise ValueError("GNN_GAT_V2_ATTENTION_WIDTH_MISMATCH")
            if any(
                isinstance(value, bool)
                or not isinstance(value, (int, float))
                or not math.isfinite(float(value))
                for value in self.attention_source
            ):
                raise ValueError("GNN_GAT_ATTENTION_VALUE_INVALID")
        elif self.attention_source or self.attention_target:
            raise ValueError("GNN_ATTENTION_WEIGHTS_UNEXPECTED")
        if self.architecture == "APPNP_PROPAGATION_V1":
            if (
                isinstance(self.teleport_probability, bool)
                or not isinstance(self.teleport_probability, (int, float))
                or not math.isfinite(float(self.teleport_probability))
                or not 0.0 < float(self.teleport_probability) <= 1.0
            ):
                raise ValueError("GNN_APPNP_TELEPORT_PROBABILITY_INVALID")
        elif self.teleport_probability != 0.1:
            raise ValueError("GNN_APPNP_TELEPORT_PROBABILITY_UNEXPECTED")
        if self.architecture == "GGNN_GRU_PROPAGATION_V1":
            if (
                isinstance(self.gated_graph_step_count, bool)
                or not isinstance(self.gated_graph_step_count, int)
                or not 1 <= self.gated_graph_step_count <= 5
            ):
                raise ValueError("GNN_GGNN_STEP_COUNT_INVALID")
            gate_weights = tuple(
                _finite_matrix(matrix, code="GNN_GGNN_GATE_WEIGHT_INVALID")
                for matrix in self.gated_graph_update_weight_matrices
            )
            hidden_width = len(weights[0])
            if len(gate_weights) != 3 or any(
                len(matrix) != 2 * hidden_width or len(matrix[0]) != hidden_width
                for matrix in gate_weights
            ):
                raise ValueError("GNN_GGNN_GATE_WEIGHT_SHAPE_MISMATCH")
        elif self.gated_graph_step_count or self.gated_graph_update_weight_matrices:
            raise ValueError("GNN_GGNN_PARAMETERS_UNEXPECTED")
        if self.architecture == "GRAND_DROP_NODE_AVERAGE_V1":
            if (
                isinstance(self.grand_sample_count, bool)
                or not isinstance(self.grand_sample_count, int)
                or not 1 <= self.grand_sample_count <= 8
            ):
                raise ValueError("GNN_GRAND_SAMPLE_COUNT_INVALID")
            if (
                isinstance(self.grand_propagation_steps, bool)
                or not isinstance(self.grand_propagation_steps, int)
                or not 1 <= self.grand_propagation_steps <= 8
            ):
                raise ValueError("GNN_GRAND_PROPAGATION_STEPS_INVALID")
            if (
                isinstance(self.grand_drop_probability, bool)
                or not isinstance(self.grand_drop_probability, (int, float))
                or not math.isfinite(float(self.grand_drop_probability))
                or not 0.0 <= float(self.grand_drop_probability) < 1.0
            ):
                raise ValueError("GNN_GRAND_DROP_PROBABILITY_INVALID")
            if (
                isinstance(self.grand_seed, bool)
                or not isinstance(self.grand_seed, int)
                or not 0 <= self.grand_seed <= 2**32 - 1
            ):
                raise ValueError("GNN_GRAND_SEED_INVALID")
        elif (
            self.grand_sample_count
            or self.grand_propagation_steps
            or self.grand_drop_probability != 0.0
            or self.grand_seed
        ):
            raise ValueError("GNN_GRAND_PARAMETERS_UNEXPECTED")
        graphormer_fields = (
            self.graphormer_query_weight_matrix,
            self.graphormer_key_weight_matrix,
            self.graphormer_degree_embedding_matrix,
            self.graphormer_spatial_distance_biases,
            self.graphormer_edge_relation_names,
            self.graphormer_path_edge_biases,
        )
        if self.architecture == "GRAPHORMER_SPATIAL_ATTENTION_V1":
            projections = tuple(
                _finite_matrix(matrix, code="GNN_GRAPHORMER_PROJECTION_INVALID")
                for matrix in graphormer_fields[:2]
            )
            projection_width = len(weights[0])
            if any(
                len(matrix) != len(weights) or len(matrix[0]) != projection_width
                for matrix in projections
            ):
                raise ValueError("GNN_GRAPHORMER_PROJECTION_SHAPE_MISMATCH")
            degree_embeddings = _finite_matrix(
                graphormer_fields[2],
                code="GNN_GRAPHORMER_DEGREE_EMBEDDING_INVALID",
            )
            if len(degree_embeddings[0]) != projection_width:
                raise ValueError("GNN_GRAPHORMER_DEGREE_EMBEDDING_WIDTH_MISMATCH")
            if not 1 <= len(graphormer_fields[3]) <= 9 or any(
                isinstance(value, bool)
                or not isinstance(value, (int, float))
                or not math.isfinite(float(value))
                for value in graphormer_fields[3]
            ):
                raise ValueError("GNN_GRAPHORMER_SPATIAL_BIASES_INVALID")
            if (
                isinstance(self.graphormer_spatial_unreachable_bias, bool)
                or not isinstance(self.graphormer_spatial_unreachable_bias, (int, float))
                or not math.isfinite(float(self.graphormer_spatial_unreachable_bias))
            ):
                raise ValueError("GNN_GRAPHORMER_UNREACHABLE_BIAS_INVALID")
            if (
                isinstance(self.graphormer_max_node_count, bool)
                or not isinstance(self.graphormer_max_node_count, int)
                or not 1 <= self.graphormer_max_node_count <= 512
            ):
                raise ValueError("GNN_GRAPHORMER_NODE_BUDGET_INVALID")
            relation_names = self.graphormer_edge_relation_names
            if (
                not relation_names
                or any(not isinstance(name, str) or not name.strip() for name in relation_names)
                or len(set(relation_names)) != len(relation_names)
            ):
                raise ValueError("GNN_GRAPHORMER_RELATION_NAMES_INVALID")
            if (
                isinstance(self.graphormer_max_path_length, bool)
                or not isinstance(self.graphormer_max_path_length, int)
                or not 1 <= self.graphormer_max_path_length <= 16
            ):
                raise ValueError("GNN_GRAPHORMER_PATH_LENGTH_INVALID")
            if len(self.graphormer_path_edge_biases) != self.graphormer_max_path_length:
                raise ValueError("GNN_GRAPHORMER_PATH_BIAS_LENGTH_MISMATCH")
            for hop_biases in self.graphormer_path_edge_biases:
                if len(hop_biases) != len(relation_names) or any(
                    len(direction_biases) != 2
                    or any(
                        isinstance(value, bool)
                        or not isinstance(value, (int, float))
                        or not math.isfinite(float(value))
                        for value in direction_biases
                    )
                    for direction_biases in hop_biases
                ):
                    raise ValueError("GNN_GRAPHORMER_PATH_BIAS_SHAPE_INVALID")
        elif (
            any(graphormer_fields)
            or self.graphormer_spatial_unreachable_bias != 0.0
            or self.graphormer_max_node_count
            or self.graphormer_max_path_length
        ):
            raise ValueError("GNN_GRAPHORMER_PARAMETERS_UNEXPECTED")
        hgt_fields = (
            self.hgt_node_type_names,
            self.hgt_relation_type_names,
            self.hgt_query_matrices,
            self.hgt_key_matrices,
            self.hgt_value_matrices,
            self.hgt_output_matrices,
            self.hgt_relation_key_matrices,
            self.hgt_relation_value_matrices,
            self.hgt_relation_attention_biases,
        )
        if self.architecture == "HGT_TYPED_ATTENTION_V1":
            node_types = self.hgt_node_type_names
            relation_types = self.hgt_relation_type_names
            if (
                not node_types
                or any(not isinstance(value, str) or not value.strip() for value in node_types)
                or len(set(node_types)) != len(node_types)
            ):
                raise ValueError("GNN_HGT_NODE_TYPE_SCHEMA_INVALID")
            if (
                not relation_types
                or any(not isinstance(value, str) or not value.strip() for value in relation_types)
                or len(set(relation_types)) != len(relation_types)
            ):
                raise ValueError("GNN_HGT_RELATION_TYPE_SCHEMA_INVALID")
            if (
                isinstance(self.hgt_head_count, bool)
                or not isinstance(self.hgt_head_count, int)
                or not 1 <= self.hgt_head_count <= 8
                or len(weights[0]) % self.hgt_head_count != 0
            ):
                raise ValueError("GNN_HGT_HEAD_COUNT_INVALID")
            hidden_width = len(weights[0])

            def validate_named_matrices(entries, expected_names, code):
                if tuple(name for name, _ in entries) != tuple(expected_names):
                    raise ValueError(code)
                result = {}
                for name, matrix in entries:
                    value = _finite_matrix(matrix, code=code)
                    if len(value) != hidden_width or len(value[0]) != hidden_width:
                        raise ValueError("GNN_HGT_MATRIX_SHAPE_MISMATCH")
                    result[name] = value
                return result

            for entries in (
                self.hgt_query_matrices,
                self.hgt_key_matrices,
                self.hgt_value_matrices,
                self.hgt_output_matrices,
            ):
                validate_named_matrices(entries, node_types, "GNN_HGT_NODE_MATRIX_SCHEMA_MISMATCH")
            validate_named_matrices(
                self.hgt_relation_key_matrices,
                relation_types,
                "GNN_HGT_RELATION_MATRIX_SCHEMA_MISMATCH",
            )
            validate_named_matrices(
                self.hgt_relation_value_matrices,
                relation_types,
                "GNN_HGT_RELATION_MATRIX_SCHEMA_MISMATCH",
            )
            if tuple(name for name, _ in self.hgt_relation_attention_biases) != tuple(relation_types) or any(
                len(values) != self.hgt_head_count
                or any(
                    isinstance(value, bool)
                    or not isinstance(value, (int, float))
                    or not math.isfinite(float(value))
                    for value in values
                )
                for _, values in self.hgt_relation_attention_biases
            ):
                raise ValueError("GNN_HGT_RELATION_BIAS_SCHEMA_INVALID")
            if (
                isinstance(self.hgt_max_node_count, bool)
                or not isinstance(self.hgt_max_node_count, int)
                or not 1 <= self.hgt_max_node_count <= 4096
                or isinstance(self.hgt_max_relation_edge_count, bool)
                or not isinstance(self.hgt_max_relation_edge_count, int)
                or not 1 <= self.hgt_max_relation_edge_count <= 16384
            ):
                raise ValueError("GNN_HGT_EXECUTION_BUDGET_INVALID")
        elif any(hgt_fields) or self.hgt_max_node_count or self.hgt_max_relation_edge_count or self.hgt_head_count:
            raise ValueError("GNN_HGT_PARAMETERS_UNEXPECTED")
        if (
            isinstance(self.negative_slope, bool)
            or not isinstance(self.negative_slope, (int, float))
            or not math.isfinite(self.negative_slope)
            or self.negative_slope <= 0
        ):
            raise ValueError("GNN_NEGATIVE_SLOPE_INVALID")

    def canonical_payload(self) -> dict[str, object]:
        return {
            "schema": "atlas.gnn-model.v1",
            "architecture": self.architecture,
            "modelRevision": self.model_revision,
            "weightMatrix": [list(row) for row in self.weight_matrix],
            "attentionSource": list(self.attention_source),
            "attentionTarget": list(self.attention_target),
            "negativeSlope": self.negative_slope,
            "weightMatrix2": [list(row) for row in self.weight_matrix_2],
            "epsilon": self.epsilon,
            "propagationSteps": self.propagation_steps,
            "headWeightMatrices": [[list(row) for row in matrix] for matrix in self.head_weight_matrices],
            "headAttentionSource": [list(head) for head in self.head_attention_source],
            "headAttentionTarget": [list(head) for head in self.head_attention_target],
            "neighborPoolWeightMatrix": [list(row) for row in self.neighbor_pool_weight_matrix],
            "neighborPoolBias": list(self.neighbor_pool_bias),
            "sageLstmWeightIh": [list(row) for row in self.sage_lstm_weight_ih],
            "sageLstmWeightHh": [list(row) for row in self.sage_lstm_weight_hh],
            "sageLstmBiasIh": list(self.sage_lstm_bias_ih),
            "sageLstmBiasHh": list(self.sage_lstm_bias_hh),
            "sageLstmMaxNeighborCount": self.sage_lstm_max_neighbor_count,
            "teleportProbability": self.teleport_probability,
            "polynomialWeightMatrices": [
                [list(row) for row in matrix] for matrix in self.polynomial_weight_matrices
            ],
            "gatV2TargetWeightMatrix": [list(row) for row in self.gat_v2_target_weight_matrix],
            "gcnInitialResidualAlpha": self.gcn_initial_residual_alpha,
            "gcnIdentityBeta": self.gcn_identity_beta,
            "relationTypes": list(self.relation_types),
            "relationWeightMatrices": [
                [list(row) for row in matrix] for matrix in self.relation_weight_matrices
            ],
            "relationEmbeddings": [list(embedding) for embedding in self.relation_embeddings],
            "gatedGraphStepCount": self.gated_graph_step_count,
            "gatedGraphUpdateWeightMatrices": [
                [list(row) for row in matrix] for matrix in self.gated_graph_update_weight_matrices
            ],
            "grandSampleCount": self.grand_sample_count,
            "grandPropagationSteps": self.grand_propagation_steps,
            "grandDropProbability": self.grand_drop_probability,
            "grandSeed": self.grand_seed,
            "graphormerQueryWeightMatrix": [list(row) for row in self.graphormer_query_weight_matrix],
            "graphormerKeyWeightMatrix": [list(row) for row in self.graphormer_key_weight_matrix],
            "graphormerDegreeEmbeddingMatrix": [
                list(row) for row in self.graphormer_degree_embedding_matrix
            ],
            "graphormerSpatialDistanceBiases": list(self.graphormer_spatial_distance_biases),
            "graphormerSpatialUnreachableBias": self.graphormer_spatial_unreachable_bias,
            "graphormerMaxNodeCount": self.graphormer_max_node_count,
            "graphormerEdgeRelationNames": list(self.graphormer_edge_relation_names),
            "graphormerPathEdgeBiases": [
                [list(direction_biases) for direction_biases in hop_biases]
                for hop_biases in self.graphormer_path_edge_biases
            ],
            "graphormerMaxPathLength": self.graphormer_max_path_length,
            "hgtNodeTypeNames": list(self.hgt_node_type_names),
            "hgtRelationTypeNames": list(self.hgt_relation_type_names),
            "hgtQueryMatrices": [[name, [list(row) for row in matrix]] for name, matrix in self.hgt_query_matrices],
            "hgtKeyMatrices": [[name, [list(row) for row in matrix]] for name, matrix in self.hgt_key_matrices],
            "hgtValueMatrices": [[name, [list(row) for row in matrix]] for name, matrix in self.hgt_value_matrices],
            "hgtOutputMatrices": [[name, [list(row) for row in matrix]] for name, matrix in self.hgt_output_matrices],
            "hgtRelationKeyMatrices": [
                [name, [list(row) for row in matrix]] for name, matrix in self.hgt_relation_key_matrices
            ],
            "hgtRelationValueMatrices": [
                [name, [list(row) for row in matrix]] for name, matrix in self.hgt_relation_value_matrices
            ],
            "hgtRelationAttentionBiases": [
                [name, list(values)] for name, values in self.hgt_relation_attention_biases
            ],
            "hgtMaxNodeCount": self.hgt_max_node_count,
            "hgtMaxRelationEdgeCount": self.hgt_max_relation_edge_count,
            "hgtHeadCount": self.hgt_head_count,
            "pnaAverageLogDegree": self.pna_average_log_degree,
            "gprCoefficients": list(self.gpr_coefficients),
            "mixhopWeightMatrices": [
                [list(row) for row in matrix] for matrix in self.mixhop_weight_matrices
            ],
            "signChannelWeightMatrices": [
                [list(row) for row in matrix] for matrix in self.sign_channel_weight_matrices
            ],
            "jkLayerWeightMatrices": [
                [list(row) for row in matrix] for matrix in self.jk_layer_weight_matrices
            ],
            "jkLstmHiddenSize": self.jk_lstm_hidden_size,
            "jkLstmWeightIhForward": [list(row) for row in self.jk_lstm_weight_ih_forward],
            "jkLstmWeightHhForward": [list(row) for row in self.jk_lstm_weight_hh_forward],
            "jkLstmBiasIhForward": list(self.jk_lstm_bias_ih_forward),
            "jkLstmBiasHhForward": list(self.jk_lstm_bias_hh_forward),
            "jkLstmWeightIhReverse": [list(row) for row in self.jk_lstm_weight_ih_reverse],
            "jkLstmWeightHhReverse": [list(row) for row in self.jk_lstm_weight_hh_reverse],
            "jkLstmBiasIhReverse": list(self.jk_lstm_bias_ih_reverse),
            "jkLstmBiasHhReverse": list(self.jk_lstm_bias_hh_reverse),
            "jkLstmAttentionVector": list(self.jk_lstm_attention_vector),
            "h2gcnMaxNodeCount": self.h2gcn_max_node_count,
            "agnnBeta": self.agnn_beta,
            "agnnInputWidth": self.agnn_input_width,
            "armaRecurrenceSteps": self.arma_recurrence_steps,
            "armaSkipWeightMatrix": [list(row) for row in self.arma_skip_weight_matrix],
            "lightgcnEmbeddingWidth": self.lightgcn_embedding_width,
            "lightgcnLayerCount": self.lightgcn_layer_count,
            "fagcnGateVector": list(self.fagcn_gate_vector),
            "fagcnEpsilon": self.fagcn_epsilon,
            "fagcnLayerCount": self.fagcn_layer_count,
            "gatedEdgeSourceVector": list(self.gated_edge_source_vector),
            "gatedEdgeTargetVector": list(self.gated_edge_target_vector),
            "gatedEdgeFeatureVector": list(self.gated_edge_feature_vector),
            "gatedEdgeLayerCount": self.gated_edge_layer_count,
            "monetKernelCenters": [list(row) for row in self.monet_kernel_centers],
            "monetKernelVariances": [list(row) for row in self.monet_kernel_variances],
            "monetKernelWeightMatrices": [
                [list(row) for row in matrix] for matrix in self.monet_kernel_weight_matrices
            ],
            "eccFilterGenerator": [list(row) for row in self.ecc_filter_generator],
            "eccRootWeightMatrix": [list(row) for row in self.ecc_root_weight_matrix],
        }

    def model_checksum(self) -> str:
        return _sha256(_canonical_json(self.canonical_payload()))


@dataclass(frozen=True)
class GnnExecutionReceiptV1:
    schema: Literal["atlas.gnn-execution-receipt.v1"]
    architecture: GnnArchitectureV1
    backend: GnnBackendV1
    executor_revision: str
    model_revision: str
    model_checksum: str
    candidate_snapshot_revision: str
    workspace_revision: str
    graph_revision: str
    input_checksum: str
    output_checksum: str
    node_count: int
    edge_count: int
    dtype: Literal["float32"]
    canonical_authority: Literal[False]
    writes_performed: Literal[False]

    def to_dict(self) -> dict[str, object]:
        return asdict(self)


def run_gnn_v1(
    graph_input: GnnInputV1,
    model: GnnModelV1,
    *,
    backend: GnnBackendV1 = "networkx_torch_cpu",
) -> tuple[dict[int, tuple[float, ...]], GnnExecutionReceiptV1]:
    """Run one frozen GNN layer on CPU or CUDA using NetworkX topology input."""
    import networkx as nx
    import torch
    import torch.nn.functional as functional

    if backend not in ("networkx_torch_cpu", "networkx_torch_cuda"):
        raise ValueError("GNN_BACKEND_UNSUPPORTED")
    expected_weight_input_width = len(graph_input.features[0]) * (
        2 if model.architecture in ("SAGE_MEAN_V1", "SAGE_MAXPOOL_V1", "SAGE_LSTM_V1") else
        2 if model.architecture == "EDGE_CONV_FIXED_GRAPH_V1" else
        3 if model.architecture == "H2GCN_CHANNEL_CONCAT_V1" else
        12 if model.architecture == "PNA_LAYER_V1" else 1
    )
    if model.architecture not in (
        "AGNN_PROPAGATION_V1",
        "ARMA_RECURSIVE_V1",
        "LIGHTGCN_PROPAGATION_V1",
        "MONET_GAUSSIAN_PSEUDOCOORD_V1",
        "ECC_EDGE_CONDITIONED_FILTER_V1",
    ) and len(model.weight_matrix) != expected_weight_input_width:
        if model.architecture == "PNA_LAYER_V1":
            raise ValueError("GNN_PNA_WEIGHT_INPUT_WIDTH_MISMATCH")
        if model.architecture == "AGNN_PROPAGATION_V1":
            raise ValueError("GNN_AGNN_INPUT_WIDTH_MISMATCH")
        raise ValueError("GNN_WEIGHT_INPUT_WIDTH_MISMATCH")
    if model.architecture == "SAGE_MAXPOOL_V1":
        if len(model.neighbor_pool_weight_matrix) != len(graph_input.features[0]):
            raise ValueError("GNN_SAGE_POOL_INPUT_WIDTH_MISMATCH")
        if len(model.weight_matrix) != len(graph_input.features[0]) + len(model.neighbor_pool_bias):
            raise ValueError("GNN_WEIGHT_INPUT_WIDTH_MISMATCH")
    if model.architecture == "SAGE_LSTM_V1" and any(
        sum(ordinal in edge for edge in graph_input.edges) > model.sage_lstm_max_neighbor_count
        for ordinal in graph_input.node_ordinals
    ):
        raise ValueError("GNN_SAGE_LSTM_NEIGHBOR_BUDGET_EXCEEDED")
    if model.architecture == "CHEB_CONV_V1" and any(
        len(matrix) != len(graph_input.features[0]) for matrix in model.polynomial_weight_matrices
    ):
        raise ValueError("GNN_CHEB_INPUT_WIDTH_MISMATCH")
    if model.architecture == "GAT_V2_V1" and len(model.gat_v2_target_weight_matrix) != len(graph_input.features[0]):
        raise ValueError("GNN_GAT_V2_INPUT_WIDTH_MISMATCH")
    if model.architecture == "GCNII_LAYER_V1" and (
        len(model.weight_matrix) != len(graph_input.features[0])
        or len(model.weight_matrix[0]) != len(graph_input.features[0])
    ):
        raise ValueError("GNN_GCNII_INPUT_WIDTH_MISMATCH")
    if model.architecture == "AGNN_PROPAGATION_V1" and model.agnn_input_width != len(graph_input.features[0]):
        raise ValueError("GNN_AGNN_INPUT_WIDTH_MISMATCH")
    if model.architecture == "ARMA_RECURSIVE_V1" and len(model.arma_skip_weight_matrix) != len(graph_input.features[0]):
        raise ValueError("GNN_ARMA_SKIP_INPUT_WIDTH_MISMATCH")
    if model.architecture == "LIGHTGCN_PROPAGATION_V1" and model.lightgcn_embedding_width != len(graph_input.features[0]):
        raise ValueError("GNN_LIGHTGCN_INPUT_WIDTH_MISMATCH")
    if model.architecture == "HGNN_INCIDENCE_CONV_V1" and not graph_input.hyperedges:
        raise ValueError("GNN_HGNN_HYPEREDGES_REQUIRED")
    if model.architecture in ("RGCN_LAYER_V1", "COMPGCN_MULTIPLICATIVE_V1"):
        if tuple(sorted({relation for _, _, relation in graph_input.relation_edges})) != tuple(sorted(model.relation_types)):
            raise ValueError("GNN_RGCN_RELATION_SCHEMA_MISMATCH")
        if not graph_input.relation_edges:
            raise ValueError("GNN_RGCN_RELATION_EDGES_REQUIRED")
    if model.architecture == "HGT_TYPED_ATTENTION_V1":
        if tuple(sorted(set(graph_input.node_types))) != tuple(sorted(model.hgt_node_type_names)):
            raise ValueError("GNN_HGT_NODE_TYPE_SCHEMA_MISMATCH")
        if tuple(sorted({relation for _, _, relation in graph_input.relation_edges})) != tuple(
            sorted(model.hgt_relation_type_names)
        ):
            raise ValueError("GNN_HGT_RELATION_TYPE_SCHEMA_MISMATCH")
        if not graph_input.node_types or not graph_input.relation_edges:
            raise ValueError("GNN_HGT_TYPED_INPUT_REQUIRED")
        if len(graph_input.node_ordinals) > model.hgt_max_node_count:
            raise ValueError("GNN_HGT_NODE_BUDGET_EXCEEDED")
        if len(graph_input.relation_edges) > model.hgt_max_relation_edge_count:
            raise ValueError("GNN_HGT_RELATION_EDGE_BUDGET_EXCEEDED")
    if (
        model.architecture == "GRAPHORMER_SPATIAL_ATTENTION_V1"
        and len(graph_input.node_ordinals) > model.graphormer_max_node_count
    ):
        raise ValueError("GNN_GRAPHORMER_NODE_BUDGET_EXCEEDED")
    if model.architecture == "GRAPHORMER_SPATIAL_ATTENTION_V1":
        input_edge_pairs = {(min(source, target), max(source, target)) for source, target in graph_input.edges}
        relation_edge_pairs = {
            (min(source, target), max(source, target)) for source, target, _ in graph_input.relation_edges
        }
        if len(graph_input.relation_edges) != len(input_edge_pairs) or relation_edge_pairs != input_edge_pairs:
            raise ValueError("GNN_GRAPHORMER_RELATION_EDGE_COVERAGE_MISMATCH")
        relation_names = tuple(sorted({relation for _, _, relation in graph_input.relation_edges}))
        if relation_names != tuple(sorted(model.graphormer_edge_relation_names)):
            raise ValueError("GNN_GRAPHORMER_RELATION_SCHEMA_MISMATCH")
    if (
        model.architecture == "H2GCN_CHANNEL_CONCAT_V1"
        and len(graph_input.node_ordinals) > model.h2gcn_max_node_count
    ):
        raise ValueError("GNN_H2GCN_NODE_BUDGET_EXCEEDED")
    if model.architecture == "GAT_MULTI_HEAD_V1" and any(
        len(matrix) != len(graph_input.features[0]) for matrix in model.head_weight_matrices
    ):
        raise ValueError("GNN_GAT_HEAD_INPUT_WIDTH_MISMATCH")
    if model.architecture == "GATED_GCN_EDGE_GATE_V1":
        if not graph_input.edge_features or len(graph_input.edge_features) != len(graph_input.edges):
            raise ValueError("GNN_GATED_GCN_EDGE_FEATURES_REQUIRED")
        if any(len(edge.values) != len(graph_input.features[0]) for edge in graph_input.edge_features):
            raise ValueError("GNN_GATED_GCN_EDGE_FEATURE_WIDTH_MISMATCH")
    if model.architecture == "MONET_GAUSSIAN_PSEUDOCOORD_V1":
        if not graph_input.edge_features or len(graph_input.edge_features) != len(graph_input.edges):
            raise ValueError("GNN_MONET_EDGE_PSEUDOCOORDS_REQUIRED")
        if any(len(edge.values) != len(model.monet_kernel_centers[0]) for edge in graph_input.edge_features):
            raise ValueError("GNN_MONET_PSEUDOCOORD_WIDTH_MISMATCH")
        if len(graph_input.features[0]) != len(model.monet_kernel_weight_matrices[0]):
            raise ValueError("GNN_MONET_INPUT_FEATURE_WIDTH_MISMATCH")
    if model.architecture == "ECC_EDGE_CONDITIONED_FILTER_V1":
        if not graph_input.edge_features or len(graph_input.edge_features) != len(graph_input.edges):
            raise ValueError("GNN_ECC_EDGE_FEATURES_REQUIRED")
        if any(len(edge.values) != len(model.ecc_filter_generator) for edge in graph_input.edge_features):
            raise ValueError("GNN_ECC_EDGE_FEATURE_WIDTH_MISMATCH")
        if len(graph_input.features[0]) != len(model.ecc_root_weight_matrix):
            raise ValueError("GNN_ECC_INPUT_FEATURE_WIDTH_MISMATCH")
    if backend == "networkx_torch_cuda" and not torch.cuda.is_available():
        raise RuntimeError("GNN_CUDA_UNAVAILABLE")

    graph = nx.Graph()
    graph.add_nodes_from(graph_input.node_ordinals)
    graph.add_edges_from(graph_input.edges)
    order = list(graph_input.node_ordinals)
    ordinal_to_index = {ordinal: index for index, ordinal in enumerate(order)}
    adjacency_values = nx.to_numpy_array(graph, nodelist=order, dtype="float32", weight=None)
    device = torch.device("cuda" if backend == "networkx_torch_cuda" else "cpu")
    adjacency = torch.as_tensor(adjacency_values, dtype=torch.float32, device=device)
    features = torch.as_tensor(graph_input.features, dtype=torch.float32, device=device)
    weights = torch.as_tensor(model.weight_matrix, dtype=torch.float32, device=device)
    identity = torch.eye(len(order), dtype=torch.float32, device=device)
    adjacency_with_self = adjacency + identity

    if model.architecture == "GCN_SYMMETRIC_V1":
        degree = adjacency_with_self.sum(dim=1).clamp_min(1.0)
        inverse_sqrt = degree.rsqrt()
        normalized = inverse_sqrt[:, None] * adjacency_with_self * inverse_sqrt[None, :]
        output = functional.relu(normalized @ features @ weights)
    elif model.architecture == "ARMA_RECURSIVE_V1":
        degree = adjacency_with_self.sum(dim=1).clamp_min(1.0)
        inverse_sqrt = degree.rsqrt()
        normalized = inverse_sqrt[:, None] * adjacency_with_self * inverse_sqrt[None, :]
        skip_weights = torch.as_tensor(model.arma_skip_weight_matrix, dtype=torch.float32, device=device)
        skip = features @ skip_weights
        hidden = skip
        for _ in range(model.arma_recurrence_steps):
            hidden = functional.relu(normalized @ hidden @ weights + skip)
        output = hidden
    elif model.architecture == "LIGHTGCN_PROPAGATION_V1":
        degree = adjacency.sum(dim=1).clamp_min(1.0)
        inverse_sqrt = degree.rsqrt()
        normalized = inverse_sqrt[:, None] * adjacency * inverse_sqrt[None, :]
        layer_embeddings = [features]
        hidden = features
        for _ in range(model.lightgcn_layer_count):
            hidden = normalized @ hidden
            layer_embeddings.append(hidden)
        output = torch.stack(layer_embeddings, dim=0).mean(dim=0)
    elif model.architecture == "FAGCN_FREQUENCY_ADAPTATION_V1":
        degree = adjacency.sum(dim=1).clamp_min(1.0)
        inverse_sqrt = degree.rsqrt()
        gate = torch.as_tensor(model.fagcn_gate_vector, dtype=torch.float32, device=device)
        initial = functional.relu(features @ weights)
        gate_coefficients = torch.zeros_like(adjacency)
        for source_index, source_ordinal in enumerate(order):
            for target_ordinal in sorted(graph.neighbors(source_ordinal)):
                target_index = ordinal_to_index[target_ordinal]
                pair_features = torch.cat((initial[source_index], initial[target_index]))
                gate_coefficients[source_index, target_index] = torch.tanh(torch.dot(gate, pair_features))
        normalized_gates = inverse_sqrt[:, None] * gate_coefficients * inverse_sqrt[None, :]
        hidden = initial
        for _ in range(model.fagcn_layer_count):
            hidden = model.fagcn_epsilon * initial + normalized_gates @ hidden
        output_weights = torch.as_tensor(model.weight_matrix_2, dtype=torch.float32, device=device)
        output = hidden @ output_weights
    elif model.architecture == "GATED_GCN_EDGE_GATE_V1":
        edge_features_by_pair = {
            (edge.source_ordinal, edge.target_ordinal): torch.as_tensor(
                edge.values, dtype=torch.float32, device=device
            )
            for edge in graph_input.edge_features
        }
        source_gate = torch.as_tensor(model.gated_edge_source_vector, dtype=torch.float32, device=device)
        target_gate = torch.as_tensor(model.gated_edge_target_vector, dtype=torch.float32, device=device)
        edge_gate = torch.as_tensor(model.gated_edge_feature_vector, dtype=torch.float32, device=device)
        message_weights = torch.as_tensor(model.weight_matrix_2, dtype=torch.float32, device=device)
        hidden = features
        for _ in range(model.gated_edge_layer_count):
            updated_rows: list[torch.Tensor] = []
            for target_ordinal in order:
                target_index = ordinal_to_index[target_ordinal]
                neighbors = sorted(graph.neighbors(target_ordinal))
                gate_values: list[torch.Tensor] = []
                messages: list[torch.Tensor] = []
                for source_ordinal in neighbors:
                    source_index = ordinal_to_index[source_ordinal]
                    pair = (min(source_ordinal, target_ordinal), max(source_ordinal, target_ordinal))
                    edge_value = edge_features_by_pair[pair]
                    gate_logit = (
                        torch.dot(hidden[target_index], source_gate)
                        + torch.dot(hidden[source_index], target_gate)
                        + torch.dot(edge_value, edge_gate)
                    )
                    gate_values.append(torch.sigmoid(gate_logit))
                    messages.append(hidden[source_index] @ message_weights)
                if gate_values:
                    gate_tensor = torch.stack(gate_values)
                    normalized_gates = gate_tensor / (gate_tensor.sum() + 1e-6)
                    aggregate = torch.sum(
                        normalized_gates[:, None] * torch.stack(messages), dim=0
                    )
                else:
                    aggregate = torch.zeros_like(hidden[target_index])
                updated_rows.append(
                    hidden[target_index] + functional.relu(hidden[target_index] @ weights + aggregate)
                )
            hidden = torch.stack(updated_rows)
        output = hidden
    elif model.architecture == "MONET_GAUSSIAN_PSEUDOCOORD_V1":
        edge_features_by_pair = {
            (edge.source_ordinal, edge.target_ordinal): torch.as_tensor(
                edge.values, dtype=torch.float32, device=device
            )
            for edge in graph_input.edge_features
        }
        centers = [
            torch.as_tensor(row, dtype=torch.float32, device=device)
            for row in model.monet_kernel_centers
        ]
        variances = [
            torch.as_tensor(row, dtype=torch.float32, device=device)
            for row in model.monet_kernel_variances
        ]
        kernel_weights = [
            torch.as_tensor(matrix, dtype=torch.float32, device=device)
            for matrix in model.monet_kernel_weight_matrices
        ]
        output_rows: list[torch.Tensor] = []
        for target_ordinal in order:
            target_messages: list[torch.Tensor] = []
            for source_ordinal in sorted(graph.neighbors(target_ordinal)):
                pair = (min(source_ordinal, target_ordinal), max(source_ordinal, target_ordinal))
                pseudo_coordinates = edge_features_by_pair[pair]
                source_features = features[ordinal_to_index[source_ordinal]]
                for center, variance, kernel_weight in zip(
                    centers, variances, kernel_weights, strict=True
                ):
                    kernel_weighting = torch.exp(
                        -0.5 * (((pseudo_coordinates - center) ** 2) / variance).sum()
                    )
                    target_messages.append(kernel_weighting * (source_features @ kernel_weight))
            if target_messages:
                aggregate = torch.stack(target_messages).sum(dim=0)
            else:
                aggregate = torch.zeros(
                    len(model.monet_kernel_weight_matrices[0][0]),
                    dtype=torch.float32,
                    device=device,
                )
            output_rows.append(functional.relu(aggregate))
        output = torch.stack(output_rows)
    elif model.architecture == "ECC_EDGE_CONDITIONED_FILTER_V1":
        edge_features_by_pair = {
            (edge.source_ordinal, edge.target_ordinal): torch.as_tensor(
                edge.values, dtype=torch.float32, device=device
            )
            for edge in graph_input.edge_features
        }
        filter_generator = torch.as_tensor(
            model.ecc_filter_generator, dtype=torch.float32, device=device
        )
        root_weights = torch.as_tensor(
            model.ecc_root_weight_matrix, dtype=torch.float32, device=device
        )
        output_rows: list[torch.Tensor] = []
        output_width = root_weights.shape[1]
        for target_ordinal in order:
            target_index = ordinal_to_index[target_ordinal]
            messages: list[torch.Tensor] = []
            for source_ordinal in sorted(graph.neighbors(target_ordinal)):
                pair = (min(source_ordinal, target_ordinal), max(source_ordinal, target_ordinal))
                edge_vector = edge_features_by_pair[pair]
                generated_filter = (edge_vector @ filter_generator).reshape(
                    len(graph_input.features[0]), output_width
                )
                messages.append(features[ordinal_to_index[source_ordinal]] @ generated_filter)
            neighbor_sum = (
                torch.stack(messages).sum(dim=0)
                if messages
                else torch.zeros(output_width, dtype=torch.float32, device=device)
            )
            output_rows.append(
                functional.relu(features[target_index] @ root_weights + neighbor_sum)
            )
        output = torch.stack(output_rows)
    elif model.architecture == "HGNN_INCIDENCE_CONV_V1":
        incidence_graph = nx.Graph()
        node_keys = [("node", ordinal) for ordinal in order]
        hyperedge_keys = [("hyperedge", edge.fact_id) for edge in graph_input.hyperedges]
        incidence_graph.add_nodes_from((key, {"bipartite": 0}) for key in node_keys)
        incidence_graph.add_nodes_from((key, {"bipartite": 1}) for key in hyperedge_keys)
        for edge in graph_input.hyperedges:
            edge_key = ("hyperedge", edge.fact_id)
            incidence_graph.add_edges_from(
                (("node", ordinal), edge_key) for ordinal, _role in edge.participants
            )
        incidence = nx.to_numpy_array(
            incidence_graph,
            nodelist=node_keys + hyperedge_keys,
            dtype="float32",
            weight=None,
        )[:len(node_keys), len(node_keys):]
        incidence_tensor = torch.as_tensor(incidence, dtype=torch.float32, device=device)
        node_degree = incidence_tensor.sum(dim=1).clamp_min(1.0)
        hyperedge_degree = incidence_tensor.sum(dim=0).clamp_min(1.0)
        inverse_sqrt_node_degree = node_degree.rsqrt()
        normalized_incidence = inverse_sqrt_node_degree[:, None] * incidence_tensor
        normalized_hyperedge_incidence = normalized_incidence / hyperedge_degree[None, :]
        normalized_adjacency = normalized_hyperedge_incidence @ normalized_incidence.T
        output = functional.relu(normalized_adjacency @ features @ weights)
    elif model.architecture == "SAGE_MEAN_V1":
        degree = adjacency.sum(dim=1).clamp_min(1.0)
        neighbor_mean = (adjacency @ features) / degree[:, None]
        output = functional.relu(torch.cat((features, neighbor_mean), dim=1) @ weights)
    elif model.architecture == "SAGE_LSTM_V1":
        input_width = len(graph_input.features[0])
        aggregator = torch.nn.LSTM(input_width, input_width, batch_first=True).to(device)
        aggregator.load_state_dict({
            "weight_ih_l0": torch.as_tensor(model.sage_lstm_weight_ih, dtype=torch.float32, device=device),
            "weight_hh_l0": torch.as_tensor(model.sage_lstm_weight_hh, dtype=torch.float32, device=device),
            "bias_ih_l0": torch.as_tensor(model.sage_lstm_bias_ih, dtype=torch.float32, device=device),
            "bias_hh_l0": torch.as_tensor(model.sage_lstm_bias_hh, dtype=torch.float32, device=device),
        }, strict=True)
        aggregator.eval()
        aggregated_rows = []
        for ordinal in order:
            neighbors = sorted(graph.neighbors(ordinal))
            if not neighbors:
                aggregated_rows.append(torch.zeros(input_width, dtype=torch.float32, device=device))
                continue
            indices = torch.as_tensor(
                [ordinal_to_index[neighbor] for neighbor in neighbors], dtype=torch.long, device=device
            )
            sequence = features.index_select(0, indices).unsqueeze(0)
            _sequence_outputs, (hidden_state, _cell_state) = aggregator(sequence)
            aggregated_rows.append(hidden_state[-1, 0])
        aggregate = torch.stack(aggregated_rows)
        output = functional.relu(torch.cat((features, aggregate), dim=1) @ weights)
    elif model.architecture == "EDGE_CONV_FIXED_GRAPH_V1":
        messages_by_node = []
        for ordinal in order:
            center_index = ordinal_to_index[ordinal]
            neighbor_ordinals = sorted(graph.neighbors(ordinal))
            if not neighbor_ordinals:
                messages_by_node.append(torch.zeros(len(model.weight_matrix[0]), dtype=torch.float32, device=device))
                continue
            neighbor_indices = torch.as_tensor(
                [ordinal_to_index[neighbor] for neighbor in neighbor_ordinals], dtype=torch.long, device=device
            )
            neighbor_features = features.index_select(0, neighbor_indices)
            center_features = features[center_index].expand_as(neighbor_features)
            edge_features = torch.cat((center_features, neighbor_features - center_features), dim=1)
            messages = functional.relu(edge_features @ weights)
            messages_by_node.append(messages.max(dim=0).values)
        output = torch.stack(messages_by_node)
    elif model.architecture in ("JKNET_CONCAT_V1", "JKNET_MAXPOOL_V1", "JKNET_LSTM_ATTENTION_V1"):
        degree = adjacency_with_self.sum(dim=1).clamp_min(1.0)
        inverse_sqrt = degree.rsqrt()
        normalized = inverse_sqrt[:, None] * adjacency_with_self * inverse_sqrt[None, :]
        hidden = features
        layer_outputs = []
        layer_weights = (model.weight_matrix,) + model.jk_layer_weight_matrices
        for layer_matrix in layer_weights:
            layer_tensor = torch.as_tensor(layer_matrix, dtype=torch.float32, device=device)
            hidden = functional.relu(normalized @ hidden @ layer_tensor)
            layer_outputs.append(hidden)
        if model.architecture == "JKNET_MAXPOOL_V1":
            output = torch.stack(layer_outputs, dim=0).max(dim=0).values
        elif model.architecture == "JKNET_LSTM_ATTENTION_V1":
            sequence = torch.stack(layer_outputs, dim=1)
            lstm = torch.nn.LSTM(
                input_size=sequence.shape[2],
                hidden_size=model.jk_lstm_hidden_size,
                num_layers=1,
                bidirectional=True,
                batch_first=True,
            ).to(device)
            state = {}
            for direction, suffix in (("forward", ""), ("reverse", "_reverse")):
                state[f"weight_ih_l0{suffix}"] = torch.as_tensor(
                    getattr(model, f"jk_lstm_weight_ih_{direction}"), dtype=torch.float32, device=device
                )
                state[f"weight_hh_l0{suffix}"] = torch.as_tensor(
                    getattr(model, f"jk_lstm_weight_hh_{direction}"), dtype=torch.float32, device=device
                )
                state[f"bias_ih_l0{suffix}"] = torch.as_tensor(
                    getattr(model, f"jk_lstm_bias_ih_{direction}"), dtype=torch.float32, device=device
                )
                state[f"bias_hh_l0{suffix}"] = torch.as_tensor(
                    getattr(model, f"jk_lstm_bias_hh_{direction}"), dtype=torch.float32, device=device
                )
            lstm.load_state_dict(state, strict=True)
            lstm.eval()
            recurrent_output, _ = lstm(sequence)
            attention_vector = torch.as_tensor(
                model.jk_lstm_attention_vector, dtype=torch.float32, device=device
            )
            attention_logits = torch.tanh(recurrent_output) @ attention_vector
            layer_attention = torch.softmax(attention_logits, dim=1)
            output = (sequence * layer_attention.unsqueeze(-1)).sum(dim=1)
        else:
            output = torch.cat(layer_outputs, dim=1)
    elif model.architecture == "H2GCN_CHANNEL_CONCAT_V1":
        one_hop_rows = []
        two_hop_rows = []
        for ordinal in order:
            distances = nx.single_source_shortest_path_length(graph, ordinal, cutoff=2)
            one_hop_indices = [
                ordinal_to_index[neighbor]
                for neighbor, distance in sorted(distances.items())
                if distance == 1
            ]
            two_hop_indices = [
                ordinal_to_index[neighbor]
                for neighbor, distance in sorted(distances.items())
                if distance == 2
            ]
            one_hop_rows.append(
                features[one_hop_indices].mean(dim=0)
                if one_hop_indices
                else torch.zeros(features.shape[1], dtype=torch.float32, device=device)
            )
            two_hop_rows.append(
                features[two_hop_indices].mean(dim=0)
                if two_hop_indices
                else torch.zeros(features.shape[1], dtype=torch.float32, device=device)
            )
        separated_channels = torch.cat((features, torch.stack(one_hop_rows), torch.stack(two_hop_rows)), dim=1)
        output = functional.relu(separated_channels @ weights)
    elif model.architecture == "AGNN_PROPAGATION_V1":
        normalized = functional.normalize(features, p=2, dim=1, eps=1e-12)
        logits = model.agnn_beta * (normalized @ normalized.transpose(0, 1))
        logits = logits.masked_fill(adjacency_with_self <= 0, float("-inf"))
        output = torch.softmax(logits, dim=1) @ features
    elif model.architecture == "GAT_SINGLE_HEAD_V1":
        projected = features @ weights
        attention_source = torch.as_tensor(model.attention_source, dtype=torch.float32, device=device)
        attention_target = torch.as_tensor(model.attention_target, dtype=torch.float32, device=device)
        source_score = projected @ attention_source
        target_score = projected @ attention_target
        logits = functional.leaky_relu(
            source_score[:, None] + target_score[None, :], negative_slope=model.negative_slope
        )
        neighbor_mask = adjacency_with_self > 0
        logits = logits.masked_fill(~neighbor_mask, float("-inf"))
        output = functional.relu(torch.softmax(logits, dim=1) @ projected)
    elif model.architecture == "GAT_MULTI_HEAD_V1":
        head_matrices = (model.weight_matrix,) + model.head_weight_matrices
        head_sources = (model.attention_source,) + model.head_attention_source
        head_targets = (model.attention_target,) + model.head_attention_target
        neighbor_mask = adjacency_with_self > 0
        outputs = []
        for matrix, source_values, target_values in zip(head_matrices, head_sources, head_targets, strict=True):
            head_weights = torch.as_tensor(matrix, dtype=torch.float32, device=device)
            projected = features @ head_weights
            source = torch.as_tensor(source_values, dtype=torch.float32, device=device)
            target = torch.as_tensor(target_values, dtype=torch.float32, device=device)
            logits = functional.leaky_relu(
                (projected @ source)[:, None] + (projected @ target)[None, :],
                negative_slope=model.negative_slope,
            )
            logits = logits.masked_fill(~neighbor_mask, float("-inf"))
            outputs.append(torch.softmax(logits, dim=1) @ projected)
        output = functional.relu(torch.cat(outputs, dim=1))
    elif model.architecture == "GAT_V2_V1":
        target_weights = torch.as_tensor(
            model.gat_v2_target_weight_matrix, dtype=torch.float32, device=device
        )
        projected_source = features @ weights
        projected_target = features @ target_weights
        attention = torch.as_tensor(model.attention_source, dtype=torch.float32, device=device)
        pair_features = projected_source[:, None, :] + projected_target[None, :, :]
        logits = functional.leaky_relu(pair_features, negative_slope=model.negative_slope) @ attention
        logits = logits.masked_fill(adjacency_with_self <= 0, float("-inf"))
        output = functional.relu(torch.softmax(logits, dim=1) @ projected_target)
    elif model.architecture == "GIN_SUM_MLP_V1":
        aggregated = adjacency @ features + (1.0 + float(model.epsilon)) * features
        hidden_weights = torch.as_tensor(model.weight_matrix, dtype=torch.float32, device=device)
        output_weights = torch.as_tensor(model.weight_matrix_2, dtype=torch.float32, device=device)
        output = functional.relu(functional.relu(aggregated @ hidden_weights) @ output_weights)
    elif model.architecture == "SAGE_MAXPOOL_V1":
        pool_weights = torch.as_tensor(model.neighbor_pool_weight_matrix, dtype=torch.float32, device=device)
        pool_bias = torch.as_tensor(model.neighbor_pool_bias, dtype=torch.float32, device=device)
        pooled_rows = []
        for ordinal in order:
            neighbor_ordinals = sorted(graph.neighbors(ordinal))
            if not neighbor_ordinals:
                pooled_rows.append(torch.zeros(len(model.neighbor_pool_bias), dtype=torch.float32, device=device))
                continue
            neighbor_indices = torch.as_tensor(
                [ordinal_to_index[neighbor] for neighbor in neighbor_ordinals], dtype=torch.long, device=device
            )
            transformed = functional.relu(features.index_select(0, neighbor_indices) @ pool_weights + pool_bias)
            pooled_rows.append(transformed.max(dim=0).values)
        pooled = torch.stack(pooled_rows)
        output = functional.relu(torch.cat((features, pooled), dim=1) @ weights)
    elif model.architecture == "SGC_K_STEP_V1":
        degree = adjacency_with_self.sum(dim=1).clamp_min(1.0)
        inverse_sqrt = degree.rsqrt()
        normalized = inverse_sqrt[:, None] * adjacency_with_self * inverse_sqrt[None, :]
        propagated = features
        for _ in range(model.propagation_steps):
            propagated = normalized @ propagated
        output = functional.relu(propagated @ weights)
    elif model.architecture == "APPNP_PROPAGATION_V1":
        degree = adjacency_with_self.sum(dim=1).clamp_min(1.0)
        inverse_sqrt = degree.rsqrt()
        normalized = inverse_sqrt[:, None] * adjacency_with_self * inverse_sqrt[None, :]
        initial = functional.relu(features @ weights)
        propagated = initial
        teleport = float(model.teleport_probability)
        for _ in range(model.propagation_steps):
            propagated = (1.0 - teleport) * (normalized @ propagated) + teleport * initial
        output = propagated
    elif model.architecture == "GPR_GNN_V1":
        degree = adjacency_with_self.sum(dim=1).clamp_min(1.0)
        inverse_sqrt = degree.rsqrt()
        normalized = inverse_sqrt[:, None] * adjacency_with_self * inverse_sqrt[None, :]
        hidden = features @ weights
        propagated = hidden
        coefficients = model.gpr_coefficients
        output = float(coefficients[0]) * hidden
        for coefficient in coefficients[1:]:
            propagated = normalized @ propagated
            output = output + float(coefficient) * propagated
    elif model.architecture == "MIXHOP_LAYER_V1":
        degree = adjacency_with_self.sum(dim=1).clamp_min(1.0)
        inverse_sqrt = degree.rsqrt()
        normalized = inverse_sqrt[:, None] * adjacency_with_self * inverse_sqrt[None, :]
        hop_weights = (model.weight_matrix,) + model.mixhop_weight_matrices
        hop_features = [features]
        for _ in range(len(hop_weights) - 1):
            hop_features.append(normalized @ hop_features[-1])
        output = sum(
            (hop_values @ torch.as_tensor(matrix, dtype=torch.float32, device=device)
             for hop_values, matrix in zip(hop_features, hop_weights, strict=True)),
            torch.zeros(
                (len(graph_input.node_ordinals), len(model.weight_matrix[0])),
                dtype=torch.float32,
                device=device,
            ),
        )
        output = functional.relu(output)
    elif model.architecture == "SIGN_CONCAT_V1":
        degree = adjacency_with_self.sum(dim=1).clamp_min(1.0)
        inverse_sqrt = degree.rsqrt()
        normalized = inverse_sqrt[:, None] * adjacency_with_self * inverse_sqrt[None, :]
        channel_weights = (model.weight_matrix,) + model.sign_channel_weight_matrices
        propagated = features
        channels = []
        for channel_index, channel_matrix in enumerate(channel_weights):
            if channel_index:
                propagated = normalized @ propagated
            channel_projection = torch.as_tensor(channel_matrix, dtype=torch.float32, device=device)
            channels.append(functional.relu(propagated @ channel_projection))
        output = torch.cat(channels, dim=1)
    elif model.architecture == "CHEB_CONV_V1":
        degree = adjacency.sum(dim=1).clamp_min(1.0)
        inverse_sqrt = degree.rsqrt()
        normalized_adjacency = inverse_sqrt[:, None] * adjacency * inverse_sqrt[None, :]
        scaled_laplacian = -normalized_adjacency
        terms = [features]
        if model.polynomial_weight_matrices:
            terms.append(scaled_laplacian @ features)
        for polynomial_order in range(2, len(model.polynomial_weight_matrices) + 1):
            terms.append(2.0 * (scaled_laplacian @ terms[-1]) - terms[-2])
        coefficient_matrices = (model.weight_matrix,) + model.polynomial_weight_matrices
        output = sum(
            (term @ torch.as_tensor(matrix, dtype=torch.float32, device=device)
             for term, matrix in zip(terms, coefficient_matrices, strict=True)),
            torch.zeros(
                (len(graph_input.node_ordinals), len(model.weight_matrix[0])),
                dtype=torch.float32,
                device=device,
            ),
        )
        output = functional.relu(output)
    elif model.architecture == "GCNII_LAYER_V1":
        degree = adjacency_with_self.sum(dim=1).clamp_min(1.0)
        inverse_sqrt = degree.rsqrt()
        normalized = inverse_sqrt[:, None] * adjacency_with_self * inverse_sqrt[None, :]
        alpha = float(model.gcn_initial_residual_alpha)
        beta = float(model.gcn_identity_beta)
        mixed = (1.0 - alpha) * (normalized @ features) + alpha * features
        identity_mapping = (1.0 - beta) * torch.eye(
            len(graph_input.features[0]), dtype=torch.float32, device=device
        ) + beta * weights
        output = functional.relu(mixed @ identity_mapping)
    elif model.architecture == "RGCN_LAYER_V1":
        output = features @ weights
        for relation, relation_matrix in zip(
            model.relation_types, model.relation_weight_matrices, strict=True
        ):
            relation_graph = nx.DiGraph()
            relation_graph.add_nodes_from(order)
            relation_graph.add_edges_from(
                (source, target)
                for source, target, edge_relation in graph_input.relation_edges
                if edge_relation == relation
            )
            relation_adjacency_values = nx.to_numpy_array(
                relation_graph, nodelist=order, dtype="float32", weight=None
            )
            relation_adjacency = torch.as_tensor(relation_adjacency_values, dtype=torch.float32, device=device)
            relation_degree = relation_adjacency.sum(dim=0).clamp_min(1.0)
            relation_weights = torch.as_tensor(relation_matrix, dtype=torch.float32, device=device)
            output = output + ((relation_adjacency.T @ features) / relation_degree[:, None]) @ relation_weights
        output = functional.relu(output)
    elif model.architecture == "COMPGCN_MULTIPLICATIVE_V1":
        relation_embeddings = {
            relation: torch.as_tensor(embedding, dtype=torch.float32, device=device)
            for relation, embedding in zip(model.relation_types, model.relation_embeddings, strict=True)
        }
        relation_weights = {
            relation: torch.as_tensor(matrix, dtype=torch.float32, device=device)
            for relation, matrix in zip(model.relation_types, model.relation_weight_matrices, strict=True)
        }
        incoming_messages: list[list[torch.Tensor]] = [[] for _ in graph_input.node_ordinals]
        for source, target, relation in sorted(graph_input.relation_edges):
            source_features = features[ordinal_to_index[source]]
            composed = source_features * relation_embeddings[relation]
            message = functional.relu(composed @ relation_weights[relation])
            incoming_messages[ordinal_to_index[target]].append(message)
        aggregate_rows = []
        for messages in incoming_messages:
            if messages:
                aggregate_rows.append(torch.stack(messages).mean(dim=0))
            else:
                aggregate_rows.append(torch.zeros(len(model.weight_matrix[0]), dtype=torch.float32, device=device))
        output = functional.relu(features @ weights + torch.stack(aggregate_rows))
    elif model.architecture == "GGNN_GRU_PROPAGATION_V1":
        incoming_degree = adjacency.sum(dim=0).clamp_min(1.0)
        hidden = functional.relu(features @ weights)
        update_weights, reset_weights, candidate_weights = tuple(
            torch.as_tensor(matrix, dtype=torch.float32, device=device)
            for matrix in model.gated_graph_update_weight_matrices
        )
        for _ in range(model.gated_graph_step_count):
            messages = (adjacency.T @ hidden) / incoming_degree[:, None]
            joined = torch.cat((messages, hidden), dim=1)
            update_gate = torch.sigmoid(joined @ update_weights)
            reset_gate = torch.sigmoid(joined @ reset_weights)
            candidate_input = torch.cat((messages, reset_gate * hidden), dim=1)
            candidate = torch.tanh(candidate_input @ candidate_weights)
            hidden = (1.0 - update_gate) * hidden + update_gate * candidate
        output = hidden
    elif model.architecture == "GRAND_DROP_NODE_AVERAGE_V1":
        degree = adjacency_with_self.sum(dim=1).clamp_min(1.0)
        row_normalized = adjacency_with_self / degree[:, None]
        generator = random.Random(model.grand_seed)
        sample_outputs = []
        for _ in range(model.grand_sample_count):
            keep_mask = torch.as_tensor(
                [generator.random() >= model.grand_drop_probability for _ in order],
                dtype=torch.float32,
                device=device,
            )
            propagated = features * keep_mask[:, None]
            for _ in range(model.grand_propagation_steps):
                propagated = row_normalized @ propagated
            sample_outputs.append(functional.relu(propagated @ weights))
        output = torch.stack(sample_outputs).mean(dim=0)
    elif model.architecture == "GRAPHORMER_SPATIAL_ATTENTION_V1":
        query_weights = torch.as_tensor(model.graphormer_query_weight_matrix, dtype=torch.float32, device=device)
        key_weights = torch.as_tensor(model.graphormer_key_weight_matrix, dtype=torch.float32, device=device)
        degree_embeddings = torch.as_tensor(
            model.graphormer_degree_embedding_matrix, dtype=torch.float32, device=device
        )
        degree_indices = torch.as_tensor(
            [min(graph.degree(ordinal), degree_embeddings.shape[0] - 1) for ordinal in order],
            dtype=torch.long,
            device=device,
        )
        centrality = degree_embeddings[degree_indices]
        queries = features @ query_weights + centrality
        keys = features @ key_weights + centrality
        values = features @ weights + centrality
        shortest_paths = dict(nx.all_pairs_shortest_path_length(graph))
        from collections import deque

        relation_ids = {name: index for index, name in enumerate(model.graphormer_edge_relation_names)}
        directed_relations = {}
        for source, target, relation in graph_input.relation_edges:
            directed_relations[(source, target)] = (relation_ids[relation], 0)
            directed_relations[(target, source)] = (relation_ids[relation], 1)
        bounded_paths_by_source = {}
        for source in order:
            paths = {source: (source,)}
            queue = deque((source,))
            while queue:
                current = queue.popleft()
                current_path = paths[current]
                if len(current_path) - 1 >= model.graphormer_max_path_length:
                    continue
                for neighbor in sorted(graph.neighbors(current)):
                    if neighbor not in paths:
                        paths[neighbor] = current_path + (neighbor,)
                        queue.append(neighbor)
            bounded_paths_by_source[source] = paths
        spatial_biases = model.graphormer_spatial_distance_biases
        bias_values = []
        for source in order:
            row = []
            for target in order:
                distance = shortest_paths.get(source, {}).get(target)
                if distance is None:
                    row.append(float(model.graphormer_spatial_unreachable_bias))
                    continue
                bias = float(spatial_biases[min(distance, len(spatial_biases) - 1)])
                path = bounded_paths_by_source[source].get(target, ())
                for hop, (path_source, path_target) in enumerate(zip(path, path[1:])):
                    relation_id, direction_id = directed_relations[(path_source, path_target)]
                    bias += float(model.graphormer_path_edge_biases[hop][relation_id][direction_id])
                row.append(bias)
            bias_values.append(row)
        spatial_bias = torch.as_tensor(bias_values, dtype=torch.float32, device=device)
        logits = (queries @ keys.T) / math.sqrt(queries.shape[1]) + spatial_bias
        attention = torch.softmax(logits, dim=1)
        output = functional.relu(attention @ values)
    elif model.architecture == "HGT_TYPED_ATTENTION_V1":
        projected = features @ weights
        query_matrices = {
            name: torch.as_tensor(matrix, dtype=torch.float32, device=device)
            for name, matrix in model.hgt_query_matrices
        }
        key_matrices = {
            name: torch.as_tensor(matrix, dtype=torch.float32, device=device)
            for name, matrix in model.hgt_key_matrices
        }
        value_matrices = {
            name: torch.as_tensor(matrix, dtype=torch.float32, device=device)
            for name, matrix in model.hgt_value_matrices
        }
        output_matrices = {
            name: torch.as_tensor(matrix, dtype=torch.float32, device=device)
            for name, matrix in model.hgt_output_matrices
        }
        relation_key_matrices = {
            name: torch.as_tensor(matrix, dtype=torch.float32, device=device)
            for name, matrix in model.hgt_relation_key_matrices
        }
        relation_value_matrices = {
            name: torch.as_tensor(matrix, dtype=torch.float32, device=device)
            for name, matrix in model.hgt_relation_value_matrices
        }
        relation_biases = dict(model.hgt_relation_attention_biases)
        head_count = model.hgt_head_count
        head_width = projected.shape[1] // head_count
        node_type_by_index = graph_input.node_types
        queries = torch.stack([
            projected[index] @ query_matrices[node_type]
            for index, node_type in enumerate(node_type_by_index)
        ])
        keys = torch.stack([
            projected[index] @ key_matrices[node_type]
            for index, node_type in enumerate(node_type_by_index)
        ])
        values = torch.stack([
            projected[index] @ value_matrices[node_type]
            for index, node_type in enumerate(node_type_by_index)
        ])
        scores_by_target: list[list[torch.Tensor]] = [[] for _ in order]
        messages_by_target: list[list[torch.Tensor]] = [[] for _ in order]
        scale = math.sqrt(float(head_width))
        for target_index in range(len(order)):
            target_query = queries[target_index].reshape(head_count, head_width)
            self_key = keys[target_index].reshape(head_count, head_width)
            scores_by_target[target_index].append((target_query * self_key).sum(dim=1) / scale)
            messages_by_target[target_index].append(values[target_index].reshape(head_count, head_width))
        for source, target, relation in sorted(graph_input.relation_edges):
            source_index = ordinal_to_index[source]
            target_index = ordinal_to_index[target]
            relation_key = keys[source_index] @ relation_key_matrices[relation]
            relation_value = values[source_index] @ relation_value_matrices[relation]
            target_query = queries[target_index].reshape(head_count, head_width)
            relation_key = relation_key.reshape(head_count, head_width)
            relation_value = relation_value.reshape(head_count, head_width)
            score = (target_query * relation_key).sum(dim=1) / scale
            score = score + torch.as_tensor(relation_biases[relation], dtype=torch.float32, device=device)
            scores_by_target[target_index].append(score)
            messages_by_target[target_index].append(relation_value)
        aggregate_rows = []
        for target_index, node_type in enumerate(node_type_by_index):
            attention = torch.softmax(torch.stack(scores_by_target[target_index]), dim=0)
            aggregate = torch.sum(
                attention[:, :, None] * torch.stack(messages_by_target[target_index]),
                dim=0,
            ).reshape(-1)
            aggregate_rows.append(
                functional.relu(projected[target_index] + aggregate @ output_matrices[node_type])
            )
        output = torch.stack(aggregate_rows)
    elif model.architecture == "PNA_LAYER_V1":
        aggregator_rows = []
        degree_reference = float(model.pna_average_log_degree)
        for ordinal in order:
            neighbor_ordinals = sorted(graph.neighbors(ordinal))
            if not neighbor_ordinals:
                aggregator_rows.append(torch.zeros(12 * features.shape[1], dtype=torch.float32, device=device))
                continue
            neighbor_indices = torch.as_tensor(
                [ordinal_to_index[neighbor] for neighbor in neighbor_ordinals], dtype=torch.long, device=device
            )
            neighbor_features = features.index_select(0, neighbor_indices)
            mean = neighbor_features.mean(dim=0)
            aggregators = (
                mean,
                neighbor_features.max(dim=0).values,
                neighbor_features.min(dim=0).values,
                torch.sqrt(torch.mean((neighbor_features - mean) ** 2, dim=0)),
            )
            log_degree = math.log1p(len(neighbor_ordinals))
            amplification = log_degree / degree_reference
            attenuation = degree_reference / log_degree
            scales = (1.0, amplification, attenuation)
            aggregator_rows.append(torch.cat(tuple(aggregator * scale for aggregator in aggregators for scale in scales)))
        aggregated = torch.stack(aggregator_rows)
        output = functional.relu(aggregated @ weights)
    else:  # pragma: no cover - guarded by Literal/type validation at construction sites
        raise ValueError("GNN_ARCHITECTURE_UNSUPPORTED")

    values = output.detach().to(device="cpu", dtype=torch.float32).tolist()
    score_map = {
        ordinal: tuple(float(value) for value in row)
        for ordinal, row in zip(order, values, strict=True)
    }
    stable_output = [
        [ordinal, [round(value, 8) for value in score_map[ordinal]]]
        for ordinal in order
    ]
    receipt = GnnExecutionReceiptV1(
        schema="atlas.gnn-execution-receipt.v1",
        architecture=model.architecture,
        backend=backend,
        executor_revision=f"networkx:{nx.__version__}+torch:{torch.__version__}:gnn-v1",
        model_revision=model.model_revision,
        model_checksum=model.model_checksum(),
        candidate_snapshot_revision=graph_input.candidate_snapshot_revision,
        workspace_revision=graph_input.workspace_revision,
        graph_revision=graph_input.graph_revision,
        input_checksum=graph_input.input_checksum(),
        output_checksum=_sha256(_canonical_json(stable_output)),
        node_count=len(order),
        edge_count=graph.number_of_edges(),
        dtype="float32",
        canonical_authority=False,
        writes_performed=False,
    )
    return score_map, receipt


def compare_gnn_outputs_v1(
    reference: dict[int, tuple[float, ...]],
    challenger: dict[int, tuple[float, ...]],
    *,
    tolerance: float = 1e-5,
) -> dict[str, float | int | bool]:
    if not math.isfinite(tolerance) or tolerance < 0:
        raise ValueError("GNN_PARITY_TOLERANCE_INVALID")
    if set(reference) != set(challenger):
        raise ValueError("GNN_PARITY_ORDINAL_SET_MISMATCH")
    if any(len(reference[key]) != len(challenger[key]) for key in reference):
        raise ValueError("GNN_PARITY_FEATURE_WIDTH_MISMATCH")
    max_absolute_error = max(
        (abs(left - right) for key in reference for left, right in zip(reference[key], challenger[key], strict=True)),
        default=0.0,
    )
    return {
        "nodeCount": len(reference),
        "maxAbsoluteError": max_absolute_error,
        "tolerance": tolerance,
        "parity": max_absolute_error <= tolerance,
    }
