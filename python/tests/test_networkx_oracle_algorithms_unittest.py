import unittest
import hashlib

from atlas_graph_runtime.contracts import TypedGraphEdge
from atlas_graph_runtime.networkx_executor import (
    run_bfs_neighborhood,
    run_cheirank,
    run_pagerank_v2,
    run_sssp_v2,
    run_strongly_connected_components,
    run_topological_order,
)
from atlas_graph_runtime.graph_projection_manifest import (
    graph_ordinal_map_checksum_v1,
    validate_graph_projection_artifact_v1,
)


class NetworkxOracleAlgorithmTests(unittest.TestCase):
    def setUp(self) -> None:
        self.nodes = [9, 2, 5, 7, 11]
        self.edges = [
            TypedGraphEdge(2, 5, "CALLS", 1.0),
            TypedGraphEdge(2, 9, "IMPORTS", 1.0),
            TypedGraphEdge(5, 2, "REFERENCES", 1.0),
            TypedGraphEdge(9, 7, "CALLS", 1.0),
        ]

    def test_bfs_is_depth_bounded_and_ordinal_deterministic(self) -> None:
        rows, receipt = run_bfs_neighborhood(
            graph_revision="graph:test-v1", node_ordinals=self.nodes, edges=self.edges,
            source_ordinal=2, max_depth=2,
        )
        self.assertEqual(rows, ((2, 0, -1), (5, 1, 2), (9, 1, 2), (7, 2, 9)))
        self.assertEqual(receipt.operation, "GRAPH_BFS_NEIGHBORHOOD")
        self.assertEqual(receipt.status, "PROVEN")
        self.assertFalse(receipt.canonical_authority)
        self.assertFalse(receipt.writes_performed)
        _, alternate_receipt = run_bfs_neighborhood(
            graph_revision="graph:test-v1", node_ordinals=self.nodes, edges=self.edges,
            source_ordinal=2, max_depth=1,
        )
        self.assertNotEqual(receipt.input_checksum, alternate_receipt.input_checksum)

    def test_cheirank_reverses_direction_and_is_input_order_invariant(self) -> None:
        scores, receipt = run_cheirank(
            graph_revision="graph:test-v1", node_ordinals=self.nodes, edges=self.edges,
        )
        reordered_scores, reordered_receipt = run_cheirank(
            graph_revision="graph:test-v1", node_ordinals=list(reversed(self.nodes)), edges=list(reversed(self.edges)),
        )
        self.assertEqual(scores, reordered_scores)
        self.assertEqual(receipt.input_checksum, reordered_receipt.input_checksum)
        self.assertEqual(receipt.output_checksum, reordered_receipt.output_checksum)
        self.assertEqual(receipt.operation, "GRAPH_CHEIRANK")
        _, alternate_receipt = run_cheirank(
            graph_revision="graph:test-v1", node_ordinals=self.nodes, edges=self.edges, alpha=0.8,
        )
        self.assertNotEqual(receipt.input_checksum, alternate_receipt.input_checksum)

    def test_pagerank_v2_binds_weight_and_uniform_dangling_policy(self) -> None:
        scores, receipt = run_pagerank_v2(
            graph_revision="graph:test-v1", node_ordinals=self.nodes, edges=self.edges,
        )
        reordered_scores, reordered_receipt = run_pagerank_v2(
            graph_revision="graph:test-v1", node_ordinals=list(reversed(self.nodes)), edges=list(reversed(self.edges)),
        )
        self.assertEqual(scores, reordered_scores)
        self.assertAlmostEqual(sum(scores.values()), 1.0)
        self.assertGreater(scores[11], 0.0)
        self.assertEqual(receipt.input_checksum, reordered_receipt.input_checksum)
        _, changed_parameters = run_pagerank_v2(
            graph_revision="graph:test-v1", node_ordinals=self.nodes, edges=self.edges, alpha=0.8,
        )
        self.assertNotEqual(receipt.input_checksum, changed_parameters.input_checksum)
        with self.assertRaisesRegex(ValueError, "ATLAS_PAGERANK_ALPHA_INVALID"):
            run_pagerank_v2(
                graph_revision="graph:test-v1", node_ordinals=self.nodes, edges=self.edges, alpha=1.0,
            )

    def test_sssp_v2_binds_source_cutoff_and_unreachable_ordinals(self) -> None:
        dag_edges = [
            TypedGraphEdge(2, 5, "CALLS", 1.0),
            TypedGraphEdge(2, 9, "IMPORTS", 1.0),
            TypedGraphEdge(5, 7, "CALLS", 1.0),
            TypedGraphEdge(9, 7, "CALLS", 1.0),
        ]
        paths, receipt = run_sssp_v2(
            graph_revision="graph:weighted-v1", node_ordinals=self.nodes, edges=dag_edges, source_ordinal=2,
        )
        reordered_paths, reordered_receipt = run_sssp_v2(
            graph_revision="graph:weighted-v1", node_ordinals=list(reversed(self.nodes)),
            edges=list(reversed(dag_edges)), source_ordinal=2,
        )
        self.assertEqual(paths, reordered_paths)
        self.assertEqual(paths[7], (2.0, 5))
        self.assertEqual(paths[11], (float("inf"), -1))
        self.assertEqual(receipt.input_checksum, reordered_receipt.input_checksum)
        _, cutoff_receipt = run_sssp_v2(
            graph_revision="graph:weighted-v1", node_ordinals=self.nodes, edges=dag_edges,
            source_ordinal=2, cutoff=1.0,
        )
        self.assertNotEqual(receipt.input_checksum, cutoff_receipt.input_checksum)

    def test_scc_and_topological_order_keep_isolates_and_cycles_explicit(self) -> None:
        components, receipt = run_strongly_connected_components(
            graph_revision="graph:test-v1", node_ordinals=self.nodes, edges=self.edges,
        )
        self.assertEqual(components, ((2, 5), (7,), (9,), (11,)))
        self.assertEqual(receipt.operation, "GRAPH_SCC")
        dag_edges = [TypedGraphEdge(2, 5, "CALLS"), TypedGraphEdge(2, 9, "IMPORTS"), TypedGraphEdge(9, 7, "CALLS")]
        order, dag_receipt = run_topological_order(
            graph_revision="graph:dag-v1", node_ordinals=self.nodes, edges=dag_edges,
        )
        self.assertEqual(order, (2, 5, 9, 7, 11))
        self.assertEqual(dag_receipt.operation, "GRAPH_TOPOLOGICAL_ORDER")
        with self.assertRaisesRegex(ValueError, "ATLAS_TOPOLOGICAL_GRAPH_CYCLIC"):
            run_topological_order(
                graph_revision="graph:cycle-v1", node_ordinals=self.nodes, edges=self.edges,
            )

    def test_rejects_unbound_duplicate_and_invalid_edges(self) -> None:
        with self.assertRaisesRegex(ValueError, "ATLAS_GRAPH_NODE_ORDINAL_DUPLICATE"):
            run_bfs_neighborhood(
                graph_revision="graph:test-v1", node_ordinals=[2, 2], edges=[],
                source_ordinal=2, max_depth=1,
            )
        with self.assertRaisesRegex(ValueError, "ATLAS_GRAPH_EDGE_ENDPOINT_MISSING"):
            run_cheirank(
                graph_revision="graph:test-v1", node_ordinals=[2], edges=[TypedGraphEdge(2, 3, "CALLS")],
            )
        with self.assertRaisesRegex(ValueError, "ATLAS_GRAPH_PARALLEL_EDGE_UNSUPPORTED"):
            run_strongly_connected_components(
                graph_revision="graph:test-v1", node_ordinals=[2, 5],
                edges=[TypedGraphEdge(2, 5, "CALLS"), TypedGraphEdge(2, 5, "IMPORTS")],
            )

    def test_verified_graph_artifact_flows_to_networkx_oracle(self) -> None:
        workspace_revision = "workspace:fixture-v1"
        nodes = [
            {"gpu_node_id": 0, "graph_node_key": "node:a", "packet_key": "packet:a", "source_ref": "a.ts", "source_revision": "sha256:a", "workspace_revision": workspace_revision},
            {"gpu_node_id": 1, "graph_node_key": "node:b", "packet_key": "packet:b", "source_ref": "b.ts", "source_revision": "sha256:b", "workspace_revision": workspace_revision},
            {"gpu_node_id": 2, "graph_node_key": "node:isolate", "packet_key": None, "source_ref": "isolated.ts", "source_revision": "sha256:i", "workspace_revision": workspace_revision},
        ]
        edges = [{"src_gpu_node_id": 0, "dst_gpu_node_id": 1, "edge_type": "CALLS", "weight": 1.0}]
        node_text = "\n".join(
            f"{row['gpu_node_id']}|{row['graph_node_key']}|{row['packet_key'] or ''}|{row['source_ref'] or ''}|{row['source_revision'] or ''}|{row['workspace_revision'] or ''}"
            for row in nodes
        )
        edge_text = "\n".join(
            f"{row['src_gpu_node_id']}|{row['dst_gpu_node_id']}|{row['edge_type']}|{row['weight']}"
            for row in edges
        )
        node_checksum = f"sha256:{hashlib.sha256(node_text.encode()).hexdigest()}"
        edge_checksum = f"sha256:{hashlib.sha256(edge_text.encode()).hexdigest()}"
        graph_revision = f"sha256:{hashlib.sha256(f'{workspace_revision}|{node_checksum}|{edge_checksum}'.encode()).hexdigest()}"
        ordinal_rows = [{"graphOrdinal": row["gpu_node_id"], "graphNodeKey": row["graph_node_key"]} for row in nodes]
        manifest = {
            "schema": "atlas.graph-projection-artifact.v1",
            "mode": "NON_PRODUCTION_DERIVED_ARTIFACT",
            "workspaceRevision": workspace_revision,
            "graphRevision": graph_revision,
            "projectionRevision": f"sha256:{hashlib.sha256(f'{graph_revision}|projection-v1'.encode()).hexdigest()}",
            "graphOrdinalMapChecksum": graph_ordinal_map_checksum_v1(graph_revision, workspace_revision, ordinal_rows),
            "nodeCount": len(nodes),
            "edgeCount": len(edges),
            "nodeChecksum": node_checksum,
            "edgeChecksum": edge_checksum,
            "nodeTableHash": node_checksum,
            "edgeTableHash": edge_checksum,
            "canonicalAuthority": False,
            "writesPerformed": False,
        }
        snapshot = validate_graph_projection_artifact_v1(manifest, nodes, edges)
        scores, receipt = run_pagerank_v2(
            graph_revision=snapshot.graph_revision,
            node_ordinals=snapshot.node_ordinals,
            edges=snapshot.edges,
        )
        self.assertEqual(len(scores), 3)
        self.assertEqual(snapshot.graph_ordinal_map_checksum, manifest["graphOrdinalMapChecksum"])
        self.assertEqual(receipt.graph_revision, graph_revision)

    def test_graph_artifact_readback_rejects_checksum_and_authority_drift(self) -> None:
        workspace_revision = "workspace:fixture-v1"
        nodes = [{"gpu_node_id": 0, "graph_node_key": "node:a", "packet_key": None, "source_ref": "a.ts", "source_revision": "sha256:a", "workspace_revision": workspace_revision}]
        edges = []
        node_text = "0|node:a||a.ts|sha256:a|workspace:fixture-v1"
        node_checksum = f"sha256:{hashlib.sha256(node_text.encode()).hexdigest()}"
        edge_checksum = f"sha256:{hashlib.sha256(b'').hexdigest()}"
        graph_revision = f"sha256:{hashlib.sha256(f'{workspace_revision}|{node_checksum}|{edge_checksum}'.encode()).hexdigest()}"
        manifest = {
            "schema": "atlas.graph-projection-artifact.v1", "mode": "NON_PRODUCTION_DERIVED_ARTIFACT",
            "workspaceRevision": workspace_revision, "graphRevision": graph_revision,
            "projectionRevision": f"sha256:{hashlib.sha256(f'{graph_revision}|projection-v1'.encode()).hexdigest()}",
            "graphOrdinalMapChecksum": graph_ordinal_map_checksum_v1(graph_revision, workspace_revision, [{"graphOrdinal": 0, "graphNodeKey": "node:a"}]),
            "nodeCount": 1, "edgeCount": 0, "nodeChecksum": node_checksum, "edgeChecksum": edge_checksum,
            "nodeTableHash": node_checksum, "edgeTableHash": edge_checksum,
            "canonicalAuthority": False, "writesPerformed": False,
        }
        with self.assertRaisesRegex(ValueError, "GRAPH_PROJECTION_NODE_CHECKSUM_MISMATCH"):
            validate_graph_projection_artifact_v1(manifest, [{**nodes[0], "source_revision": "sha256:changed"}], edges)
        with self.assertRaisesRegex(ValueError, "GRAPH_PROJECTION_AUTHORITY_FLAGS_INVALID"):
            validate_graph_projection_artifact_v1({**manifest, "canonicalAuthority": True}, nodes, edges)


if __name__ == "__main__":
    unittest.main()
