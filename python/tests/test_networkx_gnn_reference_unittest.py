from __future__ import annotations

import math
from dataclasses import replace
from pathlib import Path
import re
import unittest

from atlas_graph_runtime.gnn_fixtures import fixture_gnn_input_v1, fixture_gnn_models_v1
from atlas_graph_runtime.gnn_reference import GnnHyperedgeV1, GnnInputV1, GnnModelV1, compare_gnn_outputs_v1, run_gnn_v1


class NetworkxGnnReferenceTests(unittest.TestCase):
    def test_fixture_roster_matches_okf_coverage_matrix(self) -> None:
        doc_path = (
            Path(__file__).resolve().parents[2]
            / "docs"
            / ".okf"
            / "architecture"
            / "domain-classification-and-agentic-retrieval-v1.md"
        )
        doc = doc_path.read_text(encoding="utf-8")
        documented = set(re.findall(r"^\| `([A-Z0-9_]+_V1)` \| Present \| Present, unverified \| Not proven \|$", doc, re.MULTILINE))
        executable = {model.architecture for model in fixture_gnn_models_v1()}
        self.assertEqual(documented, executable)
        self.assertEqual(len(documented), 30)

    def test_all_fixture_operators_are_deterministic_and_non_authoritative(self) -> None:
        graph_input = fixture_gnn_input_v1()
        for model in fixture_gnn_models_v1():
            with self.subTest(architecture=model.architecture):
                first, first_receipt = run_gnn_v1(graph_input, model)
                second, second_receipt = run_gnn_v1(graph_input, model)
                self.assertEqual(first, second)
                self.assertEqual(first_receipt.output_checksum, second_receipt.output_checksum)
                self.assertEqual(first_receipt.input_checksum, graph_input.input_checksum())
                self.assertFalse(first_receipt.canonical_authority)
                self.assertFalse(first_receipt.writes_performed)
                self.assertTrue(all(math.isfinite(value) for row in first.values() for value in row))

    def test_arma_recursive_operator_is_bounded_deterministic_and_checksum_bound(self) -> None:
        graph_input = fixture_gnn_input_v1()
        model = next(model for model in fixture_gnn_models_v1() if model.architecture == "ARMA_RECURSIVE_V1")
        output, receipt = run_gnn_v1(graph_input, model)
        repeated, repeated_receipt = run_gnn_v1(graph_input, model)
        deeper = replace(model, arma_recurrence_steps=3)
        deeper_output, deeper_receipt = run_gnn_v1(graph_input, deeper)

        self.assertEqual(output, repeated)
        self.assertEqual(receipt.output_checksum, repeated_receipt.output_checksum)
        self.assertNotEqual(output, deeper_output)
        self.assertNotEqual(receipt.model_checksum, deeper_receipt.model_checksum)
        self.assertEqual(len(next(iter(output.values()))), 2)
        self.assertFalse(receipt.canonical_authority)
        self.assertFalse(receipt.writes_performed)
        with self.assertRaisesRegex(ValueError, "GNN_ARMA_RECURRENCE_STEPS_INVALID"):
            replace(model, arma_recurrence_steps=9)
        with self.assertRaisesRegex(ValueError, "GNN_ARMA_RECURRENT_WEIGHT_MATRIX_MUST_BE_SQUARE"):
            replace(model, weight_matrix=((0.1, 0.2),))
        with self.assertRaisesRegex(ValueError, "GNN_ARMA_SKIP_INPUT_WIDTH_MISMATCH"):
            run_gnn_v1(graph_input, replace(model, arma_skip_weight_matrix=((1.0, 0.0), (0.0, 1.0))))

    def test_lightgcn_averages_projection_free_propagation_depths(self) -> None:
        graph_input = fixture_gnn_input_v1()
        model = next(model for model in fixture_gnn_models_v1() if model.architecture == "LIGHTGCN_PROPAGATION_V1")
        output, receipt = run_gnn_v1(graph_input, model)
        repeated, repeated_receipt = run_gnn_v1(graph_input, model)
        deeper = replace(model, lightgcn_layer_count=3)
        deeper_output, deeper_receipt = run_gnn_v1(graph_input, deeper)

        self.assertEqual(output, repeated)
        self.assertEqual(receipt.output_checksum, repeated_receipt.output_checksum)
        self.assertNotEqual(output, deeper_output)
        self.assertNotEqual(receipt.model_checksum, deeper_receipt.model_checksum)
        self.assertEqual(len(next(iter(output.values()))), model.lightgcn_embedding_width)
        self.assertFalse(receipt.canonical_authority)
        self.assertFalse(receipt.writes_performed)
        with self.assertRaisesRegex(ValueError, "GNN_LIGHTGCN_LAYER_COUNT_INVALID"):
            replace(model, lightgcn_layer_count=9)
        with self.assertRaisesRegex(ValueError, "GNN_LIGHTGCN_WEIGHT_MATRIX_UNEXPECTED"):
            replace(model, weight_matrix=((1.0, 0.0, 0.0),) * 3)
        with self.assertRaisesRegex(ValueError, "GNN_LIGHTGCN_INPUT_WIDTH_MISMATCH"):
            run_gnn_v1(graph_input, replace(model, lightgcn_embedding_width=2))

    def test_hgnn_uses_role_bound_incidence_and_rejects_unbound_members(self) -> None:
        graph_input = fixture_gnn_input_v1()
        model = next(model for model in fixture_gnn_models_v1() if model.architecture == "HGNN_INCIDENCE_CONV_V1")
        output, receipt = run_gnn_v1(graph_input, model)
        self.assertEqual(set(output), set(graph_input.node_ordinals))
        self.assertFalse(receipt.canonical_authority)
        self.assertFalse(receipt.writes_performed)

        changed_incidence = replace(
            graph_input,
            hyperedges=(
                GnnHyperedgeV1(
                    fact_id="fixture:fact-alternate",
                    participants=((10, "source"), (40, "target")),
                    source_revision="fixture:fact-source-r1",
                    evidence_refs=("fixture:fact-evidence-1",),
                    producer_revision="fixture:grounded-fact-producer-r1",
                ),
            ),
        )
        changed_output, changed_receipt = run_gnn_v1(changed_incidence, model)
        self.assertNotEqual(output, changed_output)
        self.assertNotEqual(receipt.input_checksum, changed_receipt.input_checksum)

        with self.assertRaisesRegex(ValueError, "GNN_HYPEREDGE_PARTICIPANT_NOT_IN_ORDINAL_MAP"):
            replace(graph_input, hyperedges=(GnnHyperedgeV1(
                fact_id="fixture:bad-fact",
                participants=((10, "source"), (999, "target")),
                source_revision="fixture:fact-source-r1",
                evidence_refs=("fixture:fact-evidence-1",),
                producer_revision="fixture:grounded-fact-producer-r1",
            ),))
        with self.assertRaisesRegex(ValueError, "GNN_HGNN_HYPEREDGES_REQUIRED"):
            run_gnn_v1(replace(graph_input, hyperedges=()), model)

    def test_identity_and_relation_bindings_fail_closed(self) -> None:
        graph_input = fixture_gnn_input_v1()
        with self.assertRaisesRegex(ValueError, "GNN_CANONICAL_ID_DUPLICATE"):
            GnnInputV1(**{**graph_input.__dict__, "canonical_ids": ("same",) * 4})
        with self.assertRaisesRegex(ValueError, "GNN_RELATION_EDGE_MISSING_TOPOLOGY_EDGE"):
            GnnInputV1(**{**graph_input.__dict__, "relation_edges": ((10, 30, "CALLS"),)})
        with self.assertRaisesRegex(ValueError, "GNN_HGT_NODE_TYPE_SCHEMA_MISMATCH"):
            run_gnn_v1(
                GnnInputV1(**{**graph_input.__dict__, "node_types": ("FILE",) * 4}),
                next(model for model in fixture_gnn_models_v1() if model.architecture == "HGT_TYPED_ATTENTION_V1"),
            )

    def test_hgt_multihead_and_graphormer_budgets(self) -> None:
        graph_input = fixture_gnn_input_v1()
        models = fixture_gnn_models_v1()
        hgt = next(model for model in models if model.architecture == "HGT_TYPED_ATTENTION_V1")
        baseline, baseline_receipt = run_gnn_v1(graph_input, hgt)
        prior = GnnModelV1(**{
            **hgt.__dict__,
            "hgt_relation_attention_biases": (("CALLS", (0.3, -0.1)),) + hgt.hgt_relation_attention_biases[1:],
        })
        changed, changed_receipt = run_gnn_v1(graph_input, prior)
        self.assertNotEqual(baseline, changed)
        self.assertNotEqual(baseline_receipt.model_checksum, changed_receipt.model_checksum)
        with self.assertRaisesRegex(ValueError, "GNN_HGT_HEAD_COUNT_INVALID"):
            GnnModelV1(**{**hgt.__dict__, "hgt_head_count": 3})

        graphormer = next(model for model in models if model.architecture == "GRAPHORMER_SPATIAL_ATTENTION_V1")
        graphormer_output, graphormer_receipt = run_gnn_v1(graph_input, graphormer)
        changed_path_biases = GnnModelV1(**{
            **graphormer.__dict__,
            "graphormer_path_edge_biases": (
                ((0.25, -0.08), (0.03, -0.03), (0.05, -0.05)),
            ) + graphormer.graphormer_path_edge_biases[1:],
        })
        changed_path_output, changed_path_receipt = run_gnn_v1(graph_input, changed_path_biases)
        self.assertNotEqual(graphormer_output, changed_path_output)
        self.assertNotEqual(graphormer_receipt.model_checksum, changed_path_receipt.model_checksum)
        reversed_relation_input = GnnInputV1(**{
            **graph_input.__dict__,
            "relation_edges": tuple((target, source, relation) for source, target, relation in graph_input.relation_edges),
        })
        reversed_output, _ = run_gnn_v1(reversed_relation_input, graphormer)
        self.assertNotEqual(graphormer_output, reversed_output)
        with self.assertRaisesRegex(ValueError, "GNN_GRAPHORMER_RELATION_EDGE_COVERAGE_MISMATCH"):
            run_gnn_v1(GnnInputV1(**{**graph_input.__dict__, "relation_edges": ()}), graphormer)
        with self.assertRaisesRegex(ValueError, "GNN_GRAPHORMER_PATH_BIAS_LENGTH_MISMATCH"):
            GnnModelV1(**{**graphormer.__dict__, "graphormer_max_path_length": 4})
        expanded = GnnInputV1(**{
            **graph_input.__dict__,
            "node_ordinals": graph_input.node_ordinals + tuple(range(50, 111)),
            "canonical_ids": graph_input.canonical_ids + tuple(f"fixture:candidate-{value}" for value in range(50, 111)),
            "source_revisions": graph_input.source_revisions + tuple(f"fixture:source-{value}" for value in range(50, 111)),
            "evidence_refs": graph_input.evidence_refs + tuple((f"fixture:evidence-{value}",) for value in range(50, 111)),
            "edges": graph_input.edges,
            "relation_edges": (),
            "features": graph_input.features + tuple((1.0, 0.5, 0.25) for _ in range(61)),
            "node_types": graph_input.node_types + ("NODE",) * 61,
        })
        with self.assertRaisesRegex(ValueError, "GNN_GRAPHORMER_NODE_BUDGET_EXCEEDED"):
            run_gnn_v1(expanded, graphormer)

    def test_compgcn_and_grand_parameters_are_checksum_bound(self) -> None:
        graph_input = fixture_gnn_input_v1()
        models = fixture_gnn_models_v1()
        compgcn = next(model for model in models if model.architecture == "COMPGCN_MULTIPLICATIVE_V1")
        _, original_receipt = run_gnn_v1(graph_input, compgcn)
        changed_compgcn = GnnModelV1(**{
            **compgcn.__dict__,
            "relation_embeddings": ((1.0, 0.5, 0.25),) + compgcn.relation_embeddings[1:],
        })
        output, _ = run_gnn_v1(graph_input, compgcn)
        changed_output, changed_receipt = run_gnn_v1(graph_input, changed_compgcn)
        self.assertNotEqual(output, changed_output)
        self.assertNotEqual(original_receipt.model_checksum, changed_receipt.model_checksum)

        grand = next(model for model in models if model.architecture == "GRAND_DROP_NODE_AVERAGE_V1")
        _, grand_receipt = run_gnn_v1(graph_input, grand)
        changed_grand = GnnModelV1(**{**grand.__dict__, "grand_seed": grand.grand_seed + 1})
        _, changed_grand_receipt = run_gnn_v1(graph_input, changed_grand)
        self.assertNotEqual(grand_receipt.model_checksum, changed_grand_receipt.model_checksum)
        with self.assertRaisesRegex(ValueError, "GNN_GRAND_SAMPLE_COUNT_INVALID"):
            GnnModelV1(**{**grand.__dict__, "grand_sample_count": 9})

    def test_h2gcn_keeps_ego_one_hop_and_two_hop_channels_separate(self) -> None:
        graph_input = fixture_gnn_input_v1()
        model = next(
            model for model in fixture_gnn_models_v1()
            if model.architecture == "H2GCN_CHANNEL_CONCAT_V1"
        )
        smaller_budget = GnnModelV1(**{**model.__dict__, "h2gcn_max_node_count": 4})
        self.assertNotEqual(model.model_checksum(), smaller_budget.model_checksum())
        scores, receipt = run_gnn_v1(graph_input, model)
        self.assertEqual(scores[10], (1.0, 0.0, 0.5))
        self.assertFalse(receipt.canonical_authority)
        self.assertFalse(receipt.writes_performed)

        without_second_branch = GnnInputV1(**{
            **graph_input.__dict__,
            "edges": ((10, 20), (20, 30)),
            "relation_edges": ((10, 20, "CALLS"), (20, 30, "IMPORTS")),
        })
        changed_scores, _ = run_gnn_v1(without_second_branch, model)
        self.assertEqual(changed_scores[10], (1.0, 0.0, 0.25))

        expanded = GnnInputV1(**{
            **graph_input.__dict__,
            "node_ordinals": graph_input.node_ordinals + (50,),
            "canonical_ids": graph_input.canonical_ids + ("fixture:candidate-50",),
            "source_revisions": graph_input.source_revisions + ("fixture:source-50",),
            "evidence_refs": graph_input.evidence_refs + (("fixture:evidence-50",),),
            "features": graph_input.features + ((0.5, 0.5, 0.5),),
            "node_types": graph_input.node_types + ("NODE",),
        })
        expanded_scores, _ = run_gnn_v1(expanded, model)
        self.assertEqual(expanded_scores[50], (0.5, 0.0, 0.0))
        bounded = smaller_budget
        with self.assertRaisesRegex(ValueError, "GNN_H2GCN_NODE_BUDGET_EXCEEDED"):
            run_gnn_v1(expanded, bounded)
        bad_width = GnnModelV1(**{**model.__dict__, "weight_matrix": model.weight_matrix[:-1]})
        with self.assertRaisesRegex(ValueError, "GNN_WEIGHT_INPUT_WIDTH_MISMATCH"):
            run_gnn_v1(graph_input, bad_width)
        with self.assertRaisesRegex(ValueError, "GNN_H2GCN_NODE_BUDGET_INVALID"):
            GnnModelV1(**{**model.__dict__, "h2gcn_max_node_count": 0})

    def test_agnn_attention_beta_is_bounded_and_checksum_bound(self) -> None:
        graph_input = fixture_gnn_input_v1()
        model = next(model for model in fixture_gnn_models_v1() if model.architecture == "AGNN_PROPAGATION_V1")
        baseline, baseline_receipt = run_gnn_v1(graph_input, model)
        changed_model = GnnModelV1(**{**model.__dict__, "agnn_beta": 0.0})
        changed, changed_receipt = run_gnn_v1(graph_input, changed_model)
        self.assertNotEqual(baseline, changed)
        self.assertNotEqual(baseline_receipt.model_checksum, changed_receipt.model_checksum)
        self.assertTrue(all(math.isfinite(value) for row in baseline.values() for value in row))
        with self.assertRaisesRegex(ValueError, "GNN_AGNN_BETA_INVALID"):
            GnnModelV1(**{**model.__dict__, "agnn_beta": 17.0})
        with self.assertRaisesRegex(ValueError, "GNN_AGNN_PARAMETERS_UNEXPECTED"):
            GnnModelV1(**{
                **next(m for m in fixture_gnn_models_v1() if m.architecture == "GCN_SYMMETRIC_V1").__dict__,
                "agnn_beta": 1.0,
            })
        with self.assertRaisesRegex(ValueError, "GNN_AGNN_WEIGHT_MATRIX_UNEXPECTED"):
            GnnModelV1(**{**model.__dict__, "weight_matrix": ((1.0, 0.0), (0.0, 1.0), (1.0, 0.0))})
        with self.assertRaisesRegex(ValueError, "GNN_AGNN_INPUT_WIDTH_MISMATCH"):
            run_gnn_v1(graph_input, GnnModelV1(**{**model.__dict__, "agnn_input_width": 2}))
        isolated = GnnInputV1(**{
            **graph_input.__dict__,
            "node_ordinals": (99,),
            "canonical_ids": ("fixture:candidate-99",),
            "source_revisions": ("fixture:source-99",),
            "evidence_refs": (("fixture:evidence-99",),),
            "edges": (),
            "relation_edges": (),
            "hyperedges": (),
            "features": ((0.25, -0.5, 1.0),),
            "node_types": ("NODE",),
        })
        isolated_output, _ = run_gnn_v1(isolated, model)
        self.assertEqual(isolated_output[99], (0.25, -0.5, 1.0))

    def test_jknet_maxpool_selects_coordinatewise_layer_max(self) -> None:
        import networkx as nx
        import torch
        import torch.nn.functional as functional

        graph_input = fixture_gnn_input_v1()
        model = next(model for model in fixture_gnn_models_v1() if model.architecture == "JKNET_MAXPOOL_V1")
        scores, receipt = run_gnn_v1(graph_input, model)
        graph = nx.Graph()
        graph.add_nodes_from(graph_input.node_ordinals)
        graph.add_edges_from(graph_input.edges)
        adjacency = torch.as_tensor(
            nx.to_numpy_array(graph, nodelist=graph_input.node_ordinals, dtype="float32")
        )
        adjacency = adjacency + torch.eye(len(graph_input.node_ordinals))
        degree = adjacency.sum(dim=1).clamp_min(1.0)
        inverse_sqrt = degree.rsqrt()
        normalized = inverse_sqrt[:, None] * adjacency * inverse_sqrt[None, :]
        hidden = torch.as_tensor(graph_input.features, dtype=torch.float32)
        outputs = []
        for matrix in (model.weight_matrix,) + model.jk_layer_weight_matrices:
            hidden = functional.relu(normalized @ hidden @ torch.as_tensor(matrix, dtype=torch.float32))
            outputs.append(hidden)
        expected = torch.stack(outputs, dim=0).max(dim=0).values
        for row, ordinal in enumerate(graph_input.node_ordinals):
            self.assertEqual(scores[ordinal], tuple(float(value) for value in expected[row]))
        self.assertEqual(len(next(iter(scores.values()))), len(model.weight_matrix[0]))
        self.assertFalse(receipt.canonical_authority)
        self.assertFalse(receipt.writes_performed)
        with self.assertRaisesRegex(ValueError, "GNN_JKNET_LAYER_COUNT_INVALID"):
            GnnModelV1(**{**model.__dict__, "jk_layer_weight_matrices": ()})

    def test_jknet_lstm_attention_is_bounded_checksum_bound_and_shape_stable(self) -> None:
        graph_input = fixture_gnn_input_v1()
        model = next(
            model for model in fixture_gnn_models_v1()
            if model.architecture == "JKNET_LSTM_ATTENTION_V1"
        )
        output, receipt = run_gnn_v1(graph_input, model)
        changed = GnnModelV1(**{
            **model.__dict__,
            "jk_lstm_attention_vector": (0.0, 0.0, 0.0, 1.0),
        })
        changed_output, changed_receipt = run_gnn_v1(graph_input, changed)
        self.assertNotEqual(output, changed_output)
        self.assertNotEqual(receipt.model_checksum, changed_receipt.model_checksum)
        self.assertEqual(len(next(iter(output.values()))), len(model.weight_matrix[0]))
        self.assertTrue(all(math.isfinite(value) for row in output.values() for value in row))
        self.assertFalse(receipt.canonical_authority)
        self.assertFalse(receipt.writes_performed)
        with self.assertRaisesRegex(ValueError, "GNN_JKNET_LSTM_WEIGHT_IH_SHAPE_MISMATCH"):
            GnnModelV1(**{
                **model.__dict__,
                "jk_lstm_weight_ih_forward": model.jk_lstm_weight_ih_forward[:-1],
            })
        with self.assertRaisesRegex(ValueError, "GNN_JKNET_LSTM_PARAMETERS_UNEXPECTED"):
            GnnModelV1(**{
                **next(item for item in fixture_gnn_models_v1() if item.architecture == "JKNET_MAXPOOL_V1").__dict__,
                "jk_lstm_hidden_size": 2,
            })

    def test_cpu_output_comparison_checks_ordinals(self) -> None:
        scores, _ = run_gnn_v1(fixture_gnn_input_v1(), fixture_gnn_models_v1()[0])
        self.assertTrue(compare_gnn_outputs_v1(scores, scores)["parity"])
        with self.assertRaisesRegex(ValueError, "GNN_PARITY_ORDINAL_SET_MISMATCH"):
            compare_gnn_outputs_v1(scores, {10: scores[10]})


if __name__ == "__main__":
    unittest.main()
