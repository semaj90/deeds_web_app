from __future__ import annotations

from .gnn_reference import GnnHyperedgeV1, GnnInputV1, GnnModelV1


def fixture_gnn_input_v1() -> GnnInputV1:
    return GnnInputV1(
        candidate_snapshot_revision="fixture:candidate-snapshot-v1",
        workspace_revision="fixture:workspace-v1",
        graph_revision="fixture:graph-v1",
        node_ordinals=(10, 20, 30, 40),
        canonical_ids=("fixture:candidate-10", "fixture:candidate-20", "fixture:candidate-30", "fixture:candidate-40"),
        source_revisions=("fixture:source-10", "fixture:source-20", "fixture:source-30", "fixture:source-40"),
        evidence_refs=(("fixture:evidence-10",), ("fixture:evidence-20",), ("fixture:evidence-30",), ("fixture:evidence-40",)),
        edges=((10, 20), (20, 30), (20, 40)),
        features=((1.0, 0.0, 0.5), (0.0, 1.0, 0.25), (0.25, 0.5, 1.0), (0.75, 0.25, 0.0)),
        relation_edges=((10, 20, "CALLS"), (20, 30, "IMPORTS"), (20, 40, "TESTS")),
        node_types=("FILE", "SYMBOL", "FUNCTION", "TEST"),
        hyperedges=(
            GnnHyperedgeV1(
                fact_id="fixture:fact-1",
                participants=((10, "source"), (20, "target"), (30, "validator")),
                source_revision="fixture:fact-source-r1",
                evidence_refs=("fixture:fact-evidence-1",),
                producer_revision="fixture:grounded-fact-producer-r1",
            ),
            GnnHyperedgeV1(
                fact_id="fixture:fact-2",
                participants=((20, "subject"), (40, "test")),
                source_revision="fixture:fact-source-r2",
                evidence_refs=("fixture:fact-evidence-2",),
                producer_revision="fixture:grounded-fact-producer-r1",
            ),
        ),
    )


def fixture_gnn_models_v1() -> tuple[GnnModelV1, ...]:
    return (
        GnnModelV1(
            architecture="GCN_SYMMETRIC_V1",
            model_revision="fixture:gcn-r1",
            weight_matrix=((0.5, 0.2), (0.1, 0.8), (0.4, 0.3)),
        ),
        GnnModelV1(
            architecture="SAGE_MEAN_V1",
            model_revision="fixture:sage-r1",
            weight_matrix=((0.5, 0.1), (0.2, 0.6), (0.1, 0.4), (0.3, 0.5), (0.7, 0.2), (0.4, 0.3)),
        ),
        GnnModelV1(
            architecture="GAT_SINGLE_HEAD_V1",
            model_revision="fixture:gat-r1",
            weight_matrix=((0.5, 0.2), (0.1, 0.8), (0.4, 0.3)),
            attention_source=(0.4, -0.2),
            attention_target=(0.3, 0.5),
        ),
        GnnModelV1(
            architecture="GAT_MULTI_HEAD_V1",
            model_revision="fixture:gat-multi-r1",
            weight_matrix=((0.5, 0.2), (0.1, 0.8), (0.4, 0.3)),
            attention_source=(0.4, -0.2),
            attention_target=(0.3, 0.5),
            head_weight_matrices=(((0.2, 0.3), (0.5, 0.1), (0.1, 0.6)),),
            head_attention_source=((0.2, 0.1),),
            head_attention_target=((-0.1, 0.4),),
        ),
        GnnModelV1(
            architecture="GIN_SUM_MLP_V1",
            model_revision="fixture:gin-r1",
            weight_matrix=((0.5, 0.2), (0.1, 0.8), (0.4, 0.3)),
            weight_matrix_2=((0.4, 0.1), (0.2, 0.7)),
            epsilon=0.1,
        ),
        GnnModelV1(
            architecture="SGC_K_STEP_V1",
            model_revision="fixture:sgc-r1",
            weight_matrix=((0.5, 0.2), (0.1, 0.8), (0.4, 0.3)),
            propagation_steps=2,
        ),
        GnnModelV1(
            architecture="SAGE_MAXPOOL_V1",
            model_revision="fixture:sage-maxpool-r1",
            weight_matrix=((0.5, 0.2), (0.1, 0.8), (0.4, 0.3), (0.3, 0.1), (0.2, 0.7), (0.6, 0.2)),
            neighbor_pool_weight_matrix=((0.5, 0.1, 0.2), (0.1, 0.7, 0.3), (0.4, 0.2, 0.8)),
            neighbor_pool_bias=(0.05, 0.0, -0.1),
        ),
        GnnModelV1(
            architecture="GAT_V2_V1",
            model_revision="fixture:gat-v2-r1",
            weight_matrix=((0.5, 0.2), (0.1, 0.8), (0.4, 0.3)),
            attention_source=(0.4, -0.2),
            gat_v2_target_weight_matrix=((0.2, 0.3), (0.6, 0.1), (0.1, 0.7)),
        ),
        GnnModelV1(
            architecture="APPNP_PROPAGATION_V1",
            model_revision="fixture:appnp-r1",
            weight_matrix=((0.5, 0.2), (0.1, 0.8), (0.4, 0.3)),
            propagation_steps=3,
            teleport_probability=0.2,
        ),
        GnnModelV1(
            architecture="CHEB_CONV_V1",
            model_revision="fixture:cheb-r1",
            weight_matrix=((0.5, 0.2), (0.1, 0.8), (0.4, 0.3)),
            polynomial_weight_matrices=(
                ((0.1, 0.4), (0.3, 0.2), (0.2, 0.5)),
                ((0.2, 0.1), (0.5, 0.3), (0.1, 0.6)),
            ),
        ),
        GnnModelV1(
            architecture="GCNII_LAYER_V1",
            model_revision="fixture:gcnii-layer-r1",
            weight_matrix=((0.7, 0.1, 0.0), (0.0, 0.6, 0.2), (0.1, 0.0, 0.8)),
            gcn_initial_residual_alpha=0.2,
            gcn_identity_beta=0.4,
        ),
        GnnModelV1(
            architecture="RGCN_LAYER_V1",
            model_revision="fixture:rgcn-r1",
            weight_matrix=((0.5, 0.2), (0.1, 0.8), (0.4, 0.3)),
            relation_types=("CALLS", "IMPORTS", "TESTS"),
            relation_weight_matrices=(
                ((0.1, 0.3), (0.4, 0.2), (0.2, 0.5)),
                ((0.3, 0.2), (0.1, 0.5), (0.4, 0.1)),
                ((0.2, 0.4), (0.3, 0.1), (0.5, 0.2)),
            ),
        ),
        GnnModelV1(
            architecture="COMPGCN_MULTIPLICATIVE_V1",
            model_revision="fixture:compgcn-multiplicative-r1",
            weight_matrix=((0.5, 0.2), (0.1, 0.8), (0.4, 0.3)),
            relation_types=("CALLS", "IMPORTS", "TESTS"),
            relation_weight_matrices=(
                ((0.1, 0.3), (0.4, 0.2), (0.2, 0.5)),
                ((0.3, 0.2), (0.1, 0.5), (0.4, 0.1)),
                ((0.2, 0.4), (0.3, 0.1), (0.5, 0.2)),
            ),
            relation_embeddings=((0.5, 1.0, 0.25), (1.0, 0.5, 0.75), (0.25, 0.75, 1.0)),
        ),
        GnnModelV1(
            architecture="GGNN_GRU_PROPAGATION_V1",
            model_revision="fixture:ggnn-gru-propagation-r1",
            weight_matrix=((0.5, 0.2), (0.1, 0.8), (0.4, 0.3)),
            gated_graph_step_count=3,
            gated_graph_update_weight_matrices=(
                ((0.1, 0.2), (0.3, 0.1), (0.2, 0.4), (0.1, 0.3)),
                ((0.2, 0.1), (0.1, 0.3), (0.4, 0.2), (0.3, 0.1)),
                ((0.3, 0.1), (0.2, 0.4), (0.1, 0.2), (0.4, 0.3)),
            ),
        ),
        GnnModelV1(
            architecture="GRAND_DROP_NODE_AVERAGE_V1",
            model_revision="fixture:grand-drop-node-average-r1",
            weight_matrix=((0.5, 0.2), (0.1, 0.8), (0.4, 0.3)),
            grand_sample_count=4,
            grand_propagation_steps=2,
            grand_drop_probability=0.25,
            grand_seed=1729,
        ),
        GnnModelV1(
            architecture="GRAPHORMER_SPATIAL_ATTENTION_V1",
            model_revision="fixture:graphormer-spatial-attention-r1",
            weight_matrix=((0.5, 0.2), (0.1, 0.8), (0.4, 0.3)),
            graphormer_query_weight_matrix=((0.4, 0.1), (0.2, 0.5), (0.3, 0.2)),
            graphormer_key_weight_matrix=((0.1, 0.4), (0.6, 0.2), (0.2, 0.3)),
            graphormer_degree_embedding_matrix=((0.0, 0.0), (0.1, 0.0), (0.0, 0.1), (0.1, 0.1)),
            graphormer_spatial_distance_biases=(0.15, 0.1, 0.0, -0.1),
            graphormer_spatial_unreachable_bias=-0.25,
            graphormer_max_node_count=64,
            graphormer_edge_relation_names=("CALLS", "IMPORTS", "TESTS"),
            graphormer_path_edge_biases=(
                ((0.12, -0.08), (0.03, -0.03), (0.05, -0.05)),
                ((0.02, -0.01), (0.14, -0.1), (0.04, -0.02)),
                ((0.0, 0.0), (0.0, 0.0), (0.0, 0.0)),
            ),
            graphormer_max_path_length=3,
        ),
        GnnModelV1(
            architecture="HGT_TYPED_ATTENTION_V1",
            model_revision="fixture:hgt-typed-attention-r1",
            weight_matrix=((0.5, 0.2), (0.1, 0.8), (0.4, 0.3)),
            hgt_node_type_names=("FILE", "SYMBOL", "FUNCTION", "TEST"),
            hgt_relation_type_names=("CALLS", "IMPORTS", "TESTS"),
            hgt_query_matrices=(
                ("FILE", ((0.8, 0.1), (0.2, 0.7))),
                ("SYMBOL", ((0.5, 0.3), (0.1, 0.9))),
                ("FUNCTION", ((0.7, 0.2), (0.3, 0.6))),
                ("TEST", ((0.6, 0.4), (0.2, 0.8))),
            ),
            hgt_key_matrices=(
                ("FILE", ((0.7, 0.2), (0.1, 0.8))),
                ("SYMBOL", ((0.4, 0.6), (0.3, 0.7))),
                ("FUNCTION", ((0.8, 0.1), (0.2, 0.6))),
                ("TEST", ((0.5, 0.4), (0.1, 0.9))),
            ),
            hgt_value_matrices=(
                ("FILE", ((0.6, 0.2), (0.3, 0.7))),
                ("SYMBOL", ((0.8, 0.1), (0.2, 0.5))),
                ("FUNCTION", ((0.5, 0.3), (0.4, 0.8))),
                ("TEST", ((0.7, 0.2), (0.1, 0.6))),
            ),
            hgt_output_matrices=(
                ("FILE", ((0.8, 0.2), (0.1, 0.7))),
                ("SYMBOL", ((0.6, 0.3), (0.2, 0.8))),
                ("FUNCTION", ((0.7, 0.1), (0.3, 0.9))),
                ("TEST", ((0.5, 0.4), (0.2, 0.7))),
            ),
            hgt_relation_key_matrices=(
                ("CALLS", ((0.8, 0.1), (0.2, 0.7))),
                ("IMPORTS", ((0.6, 0.3), (0.1, 0.9))),
                ("TESTS", ((0.7, 0.2), (0.4, 0.8))),
            ),
            hgt_relation_value_matrices=(
                ("CALLS", ((0.7, 0.2), (0.1, 0.8))),
                ("IMPORTS", ((0.5, 0.4), (0.2, 0.6))),
                ("TESTS", ((0.8, 0.1), (0.3, 0.7))),
            ),
            hgt_relation_attention_biases=(
                ("CALLS", (0.1, -0.1)),
                ("IMPORTS", (-0.05, 0.05)),
                ("TESTS", (0.2, -0.2)),
            ),
            hgt_max_node_count=128,
            hgt_max_relation_edge_count=512,
            hgt_head_count=2,
        ),
        GnnModelV1(
            architecture="PNA_LAYER_V1",
            model_revision="fixture:pna-r1",
            weight_matrix=((0.1, 0.2), (0.2, 0.1), (0.3, 0.4)) * 12,
            pna_average_log_degree=0.8664339756999316,
        ),
        GnnModelV1(
            architecture="GPR_GNN_V1",
            model_revision="fixture:gpr-gnn-r1",
            weight_matrix=((0.5, 0.2), (0.1, 0.8), (0.4, 0.3)),
            gpr_coefficients=(0.25, 0.5, -0.25, 0.5),
        ),
        GnnModelV1(
            architecture="MIXHOP_LAYER_V1",
            model_revision="fixture:mixhop-r1",
            weight_matrix=((0.5, 0.2), (0.1, 0.8), (0.4, 0.3)),
            mixhop_weight_matrices=(
                ((0.2, 0.5), (0.7, 0.1), (0.3, 0.4)),
                ((0.4, 0.2), (0.3, 0.6), (0.1, 0.5)),
            ),
        ),
        GnnModelV1(
            architecture="SIGN_CONCAT_V1",
            model_revision="fixture:sign-concat-r1",
            weight_matrix=((0.5, 0.2), (0.1, 0.8), (0.4, 0.3)),
            sign_channel_weight_matrices=(
                ((0.2, 0.5), (0.7, 0.1), (0.3, 0.4)),
                ((0.4, 0.2), (0.3, 0.6), (0.1, 0.5)),
            ),
        ),
        GnnModelV1(
            architecture="EDGE_CONV_FIXED_GRAPH_V1",
            model_revision="fixture:edge-conv-fixed-r1",
            weight_matrix=(
                (0.5, 0.2), (0.1, 0.8), (0.4, 0.3),
                (0.2, 0.5), (0.7, 0.1), (0.3, 0.4),
            ),
        ),
        GnnModelV1(
            architecture="JKNET_CONCAT_V1",
            model_revision="fixture:jknet-concat-r1",
            weight_matrix=((0.5, 0.2), (0.1, 0.8), (0.4, 0.3)),
            jk_layer_weight_matrices=(
                ((0.7, 0.1), (0.2, 0.6)),
                ((0.3, 0.4), (0.5, 0.2)),
            ),
        ),
        GnnModelV1(
            architecture="JKNET_MAXPOOL_V1",
            model_revision="fixture:jknet-maxpool-r1",
            weight_matrix=((0.5, 0.2), (0.1, 0.8), (0.4, 0.3)),
            jk_layer_weight_matrices=(
                ((0.7, 0.1), (0.2, 0.6)),
                ((0.3, 0.4), (0.5, 0.2)),
            ),
        ),
        GnnModelV1(
            architecture="JKNET_LSTM_ATTENTION_V1",
            model_revision="fixture:jknet-lstm-attention-r1",
            weight_matrix=((0.5, 0.2), (0.1, 0.8), (0.4, 0.3)),
            jk_layer_weight_matrices=(
                ((0.7, 0.1), (0.2, 0.6)),
                ((0.3, 0.4), (0.5, 0.2)),
            ),
            jk_lstm_hidden_size=2,
            jk_lstm_weight_ih_forward=tuple(
                tuple(0.08 if row % 2 == column else -0.03 for column in range(2))
                for row in range(8)
            ),
            jk_lstm_weight_hh_forward=tuple(
                tuple(0.05 if row % 2 == column else -0.02 for column in range(2))
                for row in range(8)
            ),
            jk_lstm_bias_ih_forward=(0.1, -0.1, 0.05, 0.02, 0.03, -0.04, 0.02, 0.01),
            jk_lstm_bias_hh_forward=(0.0,) * 8,
            jk_lstm_weight_ih_reverse=tuple(
                tuple(-0.04 if row % 2 == column else 0.06 for column in range(2))
                for row in range(8)
            ),
            jk_lstm_weight_hh_reverse=tuple(
                tuple(0.03 if row % 2 == column else 0.01 for column in range(2))
                for row in range(8)
            ),
            jk_lstm_bias_ih_reverse=(-0.03, 0.04, 0.02, -0.01, 0.05, 0.01, -0.02, 0.03),
            jk_lstm_bias_hh_reverse=(0.0,) * 8,
            jk_lstm_attention_vector=(0.3, -0.2, 0.1, 0.4),
        ),
        GnnModelV1(
            architecture="H2GCN_CHANNEL_CONCAT_V1",
            model_revision="fixture:h2gcn-channel-concat-r1",
            weight_matrix=(
                (1.0, 0.0, 0.0), (0.0, 0.0, 0.0), (0.0, 0.0, 0.0),
                (0.0, 1.0, 0.0), (0.0, 0.0, 0.0), (0.0, 0.0, 0.0),
                (0.0, 0.0, 1.0), (0.0, 0.0, 0.0), (0.0, 0.0, 0.0),
            ),
            h2gcn_max_node_count=64,
        ),
        GnnModelV1(
            architecture="AGNN_PROPAGATION_V1",
            model_revision="fixture:agnn-propagation-r1",
            agnn_beta=2.0,
            agnn_input_width=3,
        ),
        GnnModelV1(
            architecture="HGNN_INCIDENCE_CONV_V1",
            model_revision="fixture:hgnn-incidence-conv-r1",
            weight_matrix=((0.5, 0.2), (0.1, 0.8), (0.4, 0.3)),
        ),
        GnnModelV1(
            architecture="ARMA_RECURSIVE_V1",
            model_revision="fixture:arma-recursive-r1",
            weight_matrix=((0.7, 0.1), (0.05, 0.6)),
            arma_skip_weight_matrix=((0.8, 0.0), (0.0, 0.9), (0.2, 0.3)),
            arma_recurrence_steps=2,
        ),
    )
