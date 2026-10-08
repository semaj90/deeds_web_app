from __future__ import annotations

import math

import pytest

from atlas_graph_runtime.gnn_reference import (
    GnnInputV1,
    GnnModelV1,
    compare_gnn_outputs_v1,
    run_gnn_v1,
)
from atlas_graph_runtime.gnn_fixtures import fixture_gnn_input_v1, fixture_gnn_models_v1


def _model(architecture: str) -> GnnModelV1:
    return next(model for model in fixture_gnn_models_v1() if model.architecture == architecture)


@pytest.mark.parametrize("model", fixture_gnn_models_v1())
def test_networkx_cpu_gnn_is_deterministic_and_non_authoritative(model: GnnModelV1) -> None:
    first, first_receipt = run_gnn_v1(fixture_gnn_input_v1(), model)
    second, second_receipt = run_gnn_v1(fixture_gnn_input_v1(), model)

    assert first == second
    assert first_receipt.output_checksum == second_receipt.output_checksum
    assert first_receipt.input_checksum == fixture_gnn_input_v1().input_checksum()
    assert first_receipt.backend == "networkx_torch_cpu"
    assert first_receipt.graph_revision == "fixture:graph-v1"
    assert first_receipt.node_count == 4
    assert first_receipt.edge_count == 3
    assert not first_receipt.canonical_authority
    assert not first_receipt.writes_performed
    assert all(math.isfinite(value) for row in first.values() for value in row)


def test_graph_input_rejects_unbound_edges_and_duplicate_identity() -> None:
    base = fixture_gnn_input_v1()
    with pytest.raises(ValueError, match="GNN_EDGE_ENDPOINT_NOT_IN_ORDINAL_MAP"):
        GnnInputV1(**{**base.__dict__, "edges": ((10, 999),)})
    with pytest.raises(ValueError, match="GNN_CANONICAL_ID_DUPLICATE"):
        GnnInputV1(**{**base.__dict__, "canonical_ids": ("same", "same", "third", "fourth")})


def test_gnn_parity_requires_exact_ordinal_and_feature_shapes() -> None:
    scores, _ = run_gnn_v1(fixture_gnn_input_v1(), _model("GCN_SYMMETRIC_V1"))
    assert compare_gnn_outputs_v1(scores, scores)["parity"] is True
    with pytest.raises(ValueError, match="GNN_PARITY_ORDINAL_SET_MISMATCH"):
        compare_gnn_outputs_v1(scores, {10: scores[10]})


def test_gnn_rejects_boolean_features_in_strict_numeric_contract() -> None:
    base = fixture_gnn_input_v1()
    with pytest.raises(ValueError, match="GNN_FEATURE_MATRIX_INVALID"):
        GnnInputV1(**{**base.__dict__, "features": ((True, 0.0, 0.5),) + base.features[1:]})


def test_rgcn_binds_relation_types_and_changes_when_relation_labels_change() -> None:
    graph_input = fixture_gnn_input_v1()
    model = _model("RGCN_LAYER_V1")
    output, receipt = run_gnn_v1(graph_input, model)
    relabeled = GnnInputV1(**{
        **graph_input.__dict__,
        "relation_edges": ((10, 20, "IMPORTS"), (20, 30, "CALLS"), (20, 40, "TESTS")),
    })
    relabeled_output, relabeled_receipt = run_gnn_v1(relabeled, model)

    assert output != relabeled_output
    assert receipt.input_checksum != relabeled_receipt.input_checksum
    assert graph_input.canonical_payload()["relationEdges"] == [
        [10, 20, "CALLS"], [20, 30, "IMPORTS"], [20, 40, "TESTS"]
    ]
    with pytest.raises(ValueError, match="GNN_RGCN_RELATION_SCHEMA_MISMATCH"):
        run_gnn_v1(graph_input, GnnModelV1(**{
            **model.__dict__,
            "relation_types": ("CALLS", "IMPORTS"),
            "relation_weight_matrices": model.relation_weight_matrices[:2],
        }))


def test_compgcn_binds_relation_embeddings_and_is_order_deterministic() -> None:
    graph_input = fixture_gnn_input_v1()
    model = _model("COMPGCN_MULTIPLICATIVE_V1")
    output, receipt = run_gnn_v1(graph_input, model)
    reversed_edges = GnnInputV1(**{
        **graph_input.__dict__,
        "relation_edges": tuple(reversed(graph_input.relation_edges)),
    })
    reversed_output, reversed_receipt = run_gnn_v1(reversed_edges, model)
    changed_model = GnnModelV1(**{
        **model.__dict__,
        "relation_embeddings": ((1.0, 0.5, 0.25),) + model.relation_embeddings[1:],
    })
    changed_output, changed_receipt = run_gnn_v1(graph_input, changed_model)

    assert output == reversed_output
    assert receipt.output_checksum == reversed_receipt.output_checksum
    assert output != changed_output
    assert receipt.model_checksum != changed_receipt.model_checksum
    with pytest.raises(ValueError, match="GNN_COMPGCN_RELATION_EMBEDDING_COUNT_MISMATCH"):
        GnnModelV1(**{**model.__dict__, "relation_embeddings": model.relation_embeddings[:2]})


def test_ggnn_gru_propagation_is_bounded_deterministic_and_parameter_sensitive() -> None:
    graph_input = fixture_gnn_input_v1()
    model = _model("GGNN_GRU_PROPAGATION_V1")
    output, receipt = run_gnn_v1(graph_input, model)
    repeated, repeated_receipt = run_gnn_v1(graph_input, model)
    alternate = GnnModelV1(**{
        **model.__dict__,
        "gated_graph_step_count": 2,
    })
    alternate_output, alternate_receipt = run_gnn_v1(graph_input, alternate)

    assert output == repeated
    assert receipt.output_checksum == repeated_receipt.output_checksum
    assert output != alternate_output
    assert receipt.model_checksum != alternate_receipt.model_checksum
    with pytest.raises(ValueError, match="GNN_GGNN_STEP_COUNT_INVALID"):
        GnnModelV1(**{**model.__dict__, "gated_graph_step_count": 6})
    with pytest.raises(ValueError, match="GNN_GGNN_GATE_WEIGHT_SHAPE_MISMATCH"):
        GnnModelV1(**{
            **model.__dict__,
            "gated_graph_update_weight_matrices": model.gated_graph_update_weight_matrices[:2],
        })


def test_grand_dropnode_average_is_seeded_and_rejects_unbounded_parameters() -> None:
    graph_input = fixture_gnn_input_v1()
    model = _model("GRAND_DROP_NODE_AVERAGE_V1")
    output, receipt = run_gnn_v1(graph_input, model)
    repeated, repeated_receipt = run_gnn_v1(graph_input, model)
    alternate = GnnModelV1(**{**model.__dict__, "grand_seed": model.grand_seed + 1})
    alternate_output, alternate_receipt = run_gnn_v1(graph_input, alternate)

    assert output == repeated
    assert receipt.output_checksum == repeated_receipt.output_checksum
    assert output != alternate_output
    assert receipt.model_checksum != alternate_receipt.model_checksum
    with pytest.raises(ValueError, match="GNN_GRAND_SAMPLE_COUNT_INVALID"):
        GnnModelV1(**{**model.__dict__, "grand_sample_count": 9})
    with pytest.raises(ValueError, match="GNN_GRAND_DROP_PROBABILITY_INVALID"):
        GnnModelV1(**{**model.__dict__, "grand_drop_probability": 1.0})


def test_graphormer_attention_binds_degree_and_shortest_path_biases() -> None:
    graph_input = fixture_gnn_input_v1()
    model = _model("GRAPHORMER_SPATIAL_ATTENTION_V1")
    output, receipt = run_gnn_v1(graph_input, model)
    rewired = GnnInputV1(**{
        **graph_input.__dict__,
        "edges": ((10, 20), (10, 30), (30, 40)),
        "relation_edges": ((10, 20, "CALLS"), (10, 30, "IMPORTS"), (30, 40, "TESTS")),
    })
    rewired_output, rewired_receipt = run_gnn_v1(rewired, model)
    alternate = GnnModelV1(**{
        **model.__dict__,
        "graphormer_spatial_distance_biases": (0.2,) + model.graphormer_spatial_distance_biases[1:],
    })
    alternate_output, alternate_receipt = run_gnn_v1(graph_input, alternate)

    assert output != rewired_output
    assert receipt.input_checksum != rewired_receipt.input_checksum
    assert output != alternate_output
    assert receipt.model_checksum != alternate_receipt.model_checksum
    with pytest.raises(ValueError, match="GNN_GRAPHORMER_PROJECTION_SHAPE_MISMATCH"):
        GnnModelV1(**{**model.__dict__, "graphormer_query_weight_matrix": ((0.2,),)})
    expanded = GnnInputV1(**{
        **graph_input.__dict__,
        "node_ordinals": graph_input.node_ordinals + tuple(range(50, 111)),
        "canonical_ids": graph_input.canonical_ids + tuple(f"fixture:candidate-{value}" for value in range(50, 111)),
        "source_revisions": graph_input.source_revisions + tuple(f"fixture:source-{value}" for value in range(50, 111)),
        "evidence_refs": graph_input.evidence_refs + tuple((f"fixture:evidence-{value}",) for value in range(50, 111)),
        "features": graph_input.features + tuple((1.0, 0.5, 0.25) for _ in range(61)),
        "relation_edges": (),
        "node_types": graph_input.node_types + ("NODE",) * 61,
    })
    with pytest.raises(ValueError, match="GNN_GRAPHORMER_NODE_BUDGET_EXCEEDED"):
        run_gnn_v1(expanded, model)


def test_hgt_typed_attention_binds_node_and_relation_types() -> None:
    graph_input = fixture_gnn_input_v1()
    model = _model("HGT_TYPED_ATTENTION_V1")
    output, receipt = run_gnn_v1(graph_input, model)
    repeated, repeated_receipt = run_gnn_v1(graph_input, model)
    changed_node_types = GnnInputV1(**{
        **graph_input.__dict__,
        "node_types": ("SYMBOL", "FILE", "FUNCTION", "TEST"),
    })
    changed_output, changed_receipt = run_gnn_v1(changed_node_types, model)
    changed_prior = GnnModelV1(**{
        **model.__dict__,
        "hgt_relation_attention_biases": (("CALLS", (0.3, -0.1)),) + model.hgt_relation_attention_biases[1:],
    })
    prior_output, prior_receipt = run_gnn_v1(graph_input, changed_prior)

    assert output == repeated
    assert receipt.output_checksum == repeated_receipt.output_checksum
    assert output != changed_output
    assert receipt.input_checksum != changed_receipt.input_checksum
    assert output != prior_output
    assert receipt.model_checksum != prior_receipt.model_checksum
    with pytest.raises(ValueError, match="GNN_HGT_NODE_TYPE_SCHEMA_MISMATCH"):
        run_gnn_v1(GnnInputV1(**{**graph_input.__dict__, "node_types": ("FILE",) * 4}), model)
    with pytest.raises(ValueError, match="GNN_HGT_EXECUTION_BUDGET_INVALID"):
        GnnModelV1(**{**model.__dict__, "hgt_max_relation_edge_count": 0})
    with pytest.raises(ValueError, match="GNN_HGT_HEAD_COUNT_INVALID"):
        GnnModelV1(**{**model.__dict__, "hgt_head_count": 3})


def test_graph_input_rejects_relation_edge_without_topology_binding() -> None:
    graph_input = fixture_gnn_input_v1()
    with pytest.raises(ValueError, match="GNN_RELATION_EDGE_MISSING_TOPOLOGY_EDGE"):
        GnnInputV1(**{**graph_input.__dict__, "relation_edges": ((10, 30, "CALLS"),)})


def test_pna_uses_degree_scalers_and_handles_isolated_candidates() -> None:
    graph_input = fixture_gnn_input_v1()
    pna = _model("PNA_LAYER_V1")
    scaled, _ = run_gnn_v1(graph_input, pna)
    alternate_reference = GnnModelV1(**{**pna.__dict__, "pna_average_log_degree": 1.25})
    alternate, _ = run_gnn_v1(graph_input, alternate_reference)
    assert scaled != alternate

    isolated_input = GnnInputV1(**{
        **graph_input.__dict__,
        "edges": (),
        "relation_edges": (),
    })
    isolated, _ = run_gnn_v1(isolated_input, pna)
    assert all(math.isfinite(value) for row in isolated.values() for value in row)

    with pytest.raises(ValueError, match="GNN_PNA_WEIGHT_INPUT_WIDTH_MISMATCH"):
        run_gnn_v1(graph_input, GnnModelV1(
            architecture="PNA_LAYER_V1",
            model_revision="fixture:invalid-pna-width",
            weight_matrix=((0.1, 0.2),) * 3,
            pna_average_log_degree=0.5,
        ))
    with pytest.raises(ValueError, match="GNN_PNA_AVERAGE_LOG_DEGREE_INVALID"):
        GnnModelV1(
            architecture="PNA_LAYER_V1",
            model_revision="fixture:invalid-pna-degree",
            weight_matrix=((0.1, 0.2),) * 36,
            pna_average_log_degree=0.0,
        )


def test_gpr_gnn_binds_adaptive_coefficients_and_rejects_unbounded_depth() -> None:
    graph_input = fixture_gnn_input_v1()
    gpr = _model("GPR_GNN_V1")
    output, receipt = run_gnn_v1(graph_input, gpr)
    changed = GnnModelV1(**{
        **gpr.__dict__,
        "gpr_coefficients": (0.5, -0.25, 0.25, 0.5),
    })
    changed_output, changed_receipt = run_gnn_v1(graph_input, changed)
    assert output != changed_output
    assert receipt.model_checksum != changed_receipt.model_checksum

    with pytest.raises(ValueError, match="GNN_GPR_COEFFICIENTS_INVALID"):
        GnnModelV1(
            architecture="GPR_GNN_V1",
            model_revision="fixture:invalid-gpr-depth",
            weight_matrix=((0.5,), (0.1,), (0.4,)),
            gpr_coefficients=(1.0,) * 18,
        )


def test_mixhop_binds_distinct_hop_channels_and_bounds_depth() -> None:
    graph_input = fixture_gnn_input_v1()
    mixhop = _model("MIXHOP_LAYER_V1")
    output, receipt = run_gnn_v1(graph_input, mixhop)
    changed = GnnModelV1(**{
        **mixhop.__dict__,
        "mixhop_weight_matrices": (
            ((0.8, 0.1), (0.1, 0.8), (0.6, 0.2)),
            mixhop.mixhop_weight_matrices[1],
        ),
    })
    changed_output, changed_receipt = run_gnn_v1(graph_input, changed)
    assert output != changed_output
    assert receipt.model_checksum != changed_receipt.model_checksum

    with pytest.raises(ValueError, match="GNN_MIXHOP_HOP_COUNT_INVALID"):
        GnnModelV1(
            architecture="MIXHOP_LAYER_V1",
            model_revision="fixture:invalid-mixhop-depth",
            weight_matrix=((0.5,), (0.1,), (0.4,)),
            mixhop_weight_matrices=(((0.2,), (0.3,), (0.4,)),) * 5,
        )


def test_sign_concatenates_hop_channels_and_binds_each_projection() -> None:
    graph_input = fixture_gnn_input_v1()
    sign = _model("SIGN_CONCAT_V1")
    output, receipt = run_gnn_v1(graph_input, sign)
    changed = GnnModelV1(**{
        **sign.__dict__,
        "sign_channel_weight_matrices": (
            ((0.8, 0.1), (0.1, 0.8), (0.6, 0.2)),
            sign.sign_channel_weight_matrices[1],
        ),
    })
    changed_output, changed_receipt = run_gnn_v1(graph_input, changed)

    assert all(len(row) == 6 for row in output.values())
    assert output != changed_output
    assert receipt.model_checksum != changed_receipt.model_checksum
    with pytest.raises(ValueError, match="GNN_SIGN_CHANNEL_COUNT_INVALID"):
        GnnModelV1(
            architecture="SIGN_CONCAT_V1",
            model_revision="fixture:invalid-sign-channel-count",
            weight_matrix=((1.0,), (1.0,), (1.0,)),
            sign_channel_weight_matrices=(((1.0,), (1.0,), (1.0,)),) * 5,
        )
    with pytest.raises(ValueError, match="GNN_SIGN_WEIGHT_SHAPE_MISMATCH"):
        GnnModelV1(
            architecture="SIGN_CONCAT_V1",
            model_revision="fixture:invalid-sign-shape",
            weight_matrix=((1.0,), (1.0,), (1.0,)),
            sign_channel_weight_matrices=(((1.0, 2.0), (1.0, 2.0), (1.0, 2.0)),),
        )


def test_fixed_graph_edgeconv_uses_neighbor_max_and_handles_isolates() -> None:
    graph_input = fixture_gnn_input_v1()
    edgeconv = _model("EDGE_CONV_FIXED_GRAPH_V1")
    output, receipt = run_gnn_v1(graph_input, edgeconv)
    reversed_edges = GnnInputV1(**{**graph_input.__dict__, "edges": tuple(reversed(graph_input.edges))})
    reversed_output, _ = run_gnn_v1(reversed_edges, edgeconv)
    isolated_input = GnnInputV1(**{**graph_input.__dict__, "edges": (), "relation_edges": ()})
    isolated_output, _ = run_gnn_v1(isolated_input, edgeconv)

    assert output == reversed_output
    assert receipt.architecture == "EDGE_CONV_FIXED_GRAPH_V1"
    assert all(math.isfinite(value) for row in isolated_output.values() for value in row)
    assert isolated_output[10] == (0.0, 0.0)
    with pytest.raises(ValueError, match="GNN_WEIGHT_INPUT_WIDTH_MISMATCH"):
        run_gnn_v1(graph_input, GnnModelV1(
            architecture="EDGE_CONV_FIXED_GRAPH_V1",
            model_revision="fixture:invalid-edgeconv-width",
            weight_matrix=((1.0,),) * 5,
        ))


def test_jknet_concat_binds_layer_stack_and_preserves_each_depth() -> None:
    graph_input = fixture_gnn_input_v1()
    jknet = _model("JKNET_CONCAT_V1")
    output, receipt = run_gnn_v1(graph_input, jknet)
    changed = GnnModelV1(**{
        **jknet.__dict__,
        "jk_layer_weight_matrices": (
            ((0.9, 0.1), (0.2, 0.6)),
            jknet.jk_layer_weight_matrices[1],
        ),
    })
    changed_output, changed_receipt = run_gnn_v1(graph_input, changed)

    assert all(len(row) == 6 for row in output.values())
    assert output != changed_output
    assert receipt.model_checksum != changed_receipt.model_checksum
    with pytest.raises(ValueError, match="GNN_JKNET_LAYER_COUNT_INVALID"):
        GnnModelV1(
            architecture="JKNET_CONCAT_V1",
            model_revision="fixture:invalid-jk-depth",
            weight_matrix=((1.0,), (1.0,), (1.0,)),
            jk_layer_weight_matrices=(((1.0,),),) * 4,
        )
    with pytest.raises(ValueError, match="GNN_JKNET_WEIGHT_SHAPE_MISMATCH"):
        GnnModelV1(
            architecture="JKNET_CONCAT_V1",
            model_revision="fixture:invalid-jk-shape",
            weight_matrix=((1.0,), (1.0,), (1.0,)),
            jk_layer_weight_matrices=(((1.0, 2.0),),),
        )


def test_gin_and_sgc_model_parameters_are_bounded_and_checksum_bound() -> None:
    gin = _model("GIN_SUM_MLP_V1")
    sgc = _model("SGC_K_STEP_V1")
    assert gin.model_checksum() != sgc.model_checksum()
    with pytest.raises(ValueError, match="GNN_GIN_HIDDEN_WIDTH_MISMATCH"):
        GnnModelV1(
            architecture="GIN_SUM_MLP_V1",
            model_revision="fixture:invalid-gin",
            weight_matrix=((1.0, 0.0),),
            weight_matrix_2=((1.0,),),
        )
    with pytest.raises(ValueError, match="GNN_SGC_PROPAGATION_STEPS_INVALID"):
        GnnModelV1(
            architecture="SGC_K_STEP_V1",
            model_revision="fixture:invalid-sgc",
            weight_matrix=((1.0,),),
            propagation_steps=17,
        )


def test_gat_multi_head_and_graphsage_pool_are_permutation_invariant() -> None:
    graph_input = fixture_gnn_input_v1()
    models = fixture_gnn_models_v1()
    multi_head_gat = _model("GAT_MULTI_HEAD_V1")
    sage_pool = _model("SAGE_MAXPOOL_V1")
    reordered = GnnInputV1(**{
        **graph_input.__dict__,
        "edges": tuple(reversed(graph_input.edges)),
    })
    for model in (
        multi_head_gat,
        sage_pool,
        _model("PNA_LAYER_V1"),
        _model("GPR_GNN_V1"),
        _model("MIXHOP_LAYER_V1"),
        _model("SIGN_CONCAT_V1"),
        _model("EDGE_CONV_FIXED_GRAPH_V1"),
        _model("JKNET_CONCAT_V1"),
    ):
        expected, _ = run_gnn_v1(graph_input, model)
        actual, _ = run_gnn_v1(reordered, model)
        assert actual == expected


def test_gat_v2_uses_dynamic_pair_attention() -> None:
    graph_input = fixture_gnn_input_v1()
    models = fixture_gnn_models_v1()
    gat = _model("GAT_SINGLE_HEAD_V1")
    gat_v2 = _model("GAT_V2_V1")
    gat_output, _ = run_gnn_v1(graph_input, gat)
    gat_v2_output, _ = run_gnn_v1(graph_input, gat_v2)

    assert gat_v2_output != gat_output
    with pytest.raises(ValueError, match="GNN_GAT_V2_ATTENTION_WIDTH_MISMATCH"):
        GnnModelV1(
            architecture="GAT_V2_V1",
            model_revision="fixture:invalid-gat-v2",
            weight_matrix=((1.0,), (1.0,), (1.0,)),
            attention_source=(1.0, 2.0),
            gat_v2_target_weight_matrix=((1.0,), (1.0,), (1.0,)),
        )
    with pytest.raises(ValueError, match="GNN_GAT_V2_PROJECTION_SHAPE_MISMATCH"):
        GnnModelV1(
            architecture="GAT_V2_V1",
            model_revision="fixture:invalid-gat-v2-projection",
            weight_matrix=((1.0,), (1.0,), (1.0,)),
            attention_source=(1.0,),
            gat_v2_target_weight_matrix=((1.0, 2.0), (1.0, 2.0), (1.0, 2.0)),
        )


def test_appnp_teleport_and_step_parameters_change_propagation() -> None:
    graph_input = fixture_gnn_input_v1()
    appnp = _model("APPNP_PROPAGATION_V1")
    one_step = GnnModelV1(**{**appnp.__dict__, "propagation_steps": 1})
    full_output, _ = run_gnn_v1(graph_input, appnp)
    one_step_output, _ = run_gnn_v1(graph_input, one_step)

    assert full_output != one_step_output
    with pytest.raises(ValueError, match="GNN_APPNP_TELEPORT_PROBABILITY_INVALID"):
        GnnModelV1(
            architecture="APPNP_PROPAGATION_V1",
            model_revision="fixture:invalid-appnp",
            weight_matrix=((1.0,), (1.0,), (1.0,)),
            teleport_probability=0.0,
        )


def test_chebyshev_convolution_bounds_order_and_feature_width() -> None:
    graph_input = fixture_gnn_input_v1()
    cheb = _model("CHEB_CONV_V1")
    output, receipt = run_gnn_v1(graph_input, cheb)

    assert receipt.architecture == "CHEB_CONV_V1"
    assert all(len(row) == 2 for row in output.values())
    with pytest.raises(ValueError, match="GNN_CHEB_ORDER_OUT_OF_BOUNDS"):
        GnnModelV1(
            architecture="CHEB_CONV_V1",
            model_revision="fixture:invalid-cheb-order",
            weight_matrix=((1.0,), (1.0,), (1.0,)),
            polynomial_weight_matrices=tuple(
                ((1.0,), (1.0,), (1.0,)) for _ in range(6)
            ),
        )
    mismatched = GnnModelV1(
        architecture="CHEB_CONV_V1",
        model_revision="fixture:invalid-cheb-width",
        weight_matrix=((1.0,), (1.0,), (1.0,)),
        polynomial_weight_matrices=(((1.0,),),),
    )
    with pytest.raises(ValueError, match="GNN_CHEB_INPUT_WIDTH_MISMATCH"):
        run_gnn_v1(graph_input, mismatched)


def test_gcnii_initial_residual_and_identity_mapping_controls() -> None:
    graph_input = fixture_gnn_input_v1()
    baseline = _model("GCNII_LAYER_V1")
    identity_layer = GnnModelV1(**{
        **baseline.__dict__,
        "gcn_initial_residual_alpha": 1.0,
        "gcn_identity_beta": 0.0,
    })
    actual, receipt = run_gnn_v1(graph_input, identity_layer)

    assert receipt.architecture == "GCNII_LAYER_V1"
    assert actual == {
        ordinal: tuple(value for value in row)
        for ordinal, row in zip(graph_input.node_ordinals, graph_input.features, strict=True)
    }
    with pytest.raises(ValueError, match="GNN_GCNII_WEIGHT_MATRIX_MUST_BE_SQUARE"):
        GnnModelV1(
            architecture="GCNII_LAYER_V1",
            model_revision="fixture:invalid-gcnii-shape",
            weight_matrix=((1.0, 0.0), (0.0, 1.0), (0.5, 0.5)),
        )
