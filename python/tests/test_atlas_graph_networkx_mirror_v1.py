import unittest

from atlas_compute.atlas_graph_networkx_mirror_v1 import (
    build_networkx_graph_mirror_v1,
    build_networkx_mirror_receipt_v1,
)
from atlas_compute.networkx_hypergraph_alignment_v1 import build_networkx_hypergraph_alignment_receipt_v1
from atlas_compute.nary_networkx_alignment_v1 import build_snapshot


def snapshot_export():
    return {
        "snapshotId": "snapshot-1",
        "manifest": {
            "snapshotId": "snapshot-1", "workspaceRevision": "workspace:abc",
            "topologyHash": "topology-hash", "nodeCount": 2, "edgeCount": 2,
            "status": "MATERIALIZED",
        },
        "proof": {
            "replayMatches": True, "topologyHash": "topology-hash",
            "unresolvedEndpointCount": 0, "graphRevision": "graph:abc",
            "revisionChecksum": "a" * 64,
        },
        "graphSnapshot": {
            "snapshotId": "snapshot-1", "graphRevision": "graph:abc",
            "revisionChecksum": "a" * 64,
        },
        "nodes": [
            {"snapshotId": "snapshot-1", "nodeKey": "sym:a", "nodeType": "symbol",
             "sourceRevision": "source:abc", "packetKey": "packet:a"},
            {"snapshotId": "snapshot-1", "nodeKey": "sym:b", "nodeType": "symbol",
             "sourceRevision": "source:def", "packetKey": "packet:b"},
        ],
        "edges": [
            {"snapshotId": "snapshot-1", "edgeKey": "call:a:b", "sourceNodeKey": "sym:a",
             "targetNodeKey": "sym:b", "edgeType": "CALLS", "weight": 1.0},
            {"snapshotId": "snapshot-1", "edgeKey": "ref:a:b", "sourceNodeKey": "sym:a",
             "targetNodeKey": "sym:b", "edgeType": "REFERENCES", "weight": 0.5},
        ],
    }


class TestAtlasGraphNetworkXMirrorV1(unittest.TestCase):
    def test_preserves_direction_and_parallel_typed_edges(self):
        graph, receipt = build_networkx_graph_mirror_v1(snapshot_export(), "workspace:abc", "graph:abc")
        self.assertEqual(receipt["status"], "PARITY_PROVEN")
        self.assertEqual(receipt["networkxGraphType"], "MultiDiGraph")
        self.assertEqual(receipt["nodeCount"], 2)
        self.assertEqual(receipt["directedEdgeCount"], 2)
        self.assertEqual(receipt["relationshipTypes"], ["CALLS", "REFERENCES"])
        self.assertTrue(receipt["directedNodeAndEdgeParity"])
        self.assertEqual(graph.number_of_edges("sym:a", "sym:b"), 2)
        self.assertEqual(graph.number_of_edges("sym:b", "sym:a"), 0)
        self.assertEqual(graph.graph["mirror_receipt_checksum"], receipt["receiptChecksum"])
        self.assertFalse(receipt["canonicalAuthority"])
        self.assertFalse(receipt["writesPerformed"])
        self.assertTrue(receipt["workspaceRevisionQualified"])

    def test_expected_workspace_revision_mismatch_rejects(self):
        with self.assertRaisesRegex(ValueError, "GRAPH_WORKSPACE_REVISION_MISMATCH"):
            build_networkx_mirror_receipt_v1(snapshot_export(), "workspace:stale", "graph:abc")

    def test_expected_graph_revision_mismatch_rejects(self):
        with self.assertRaisesRegex(ValueError, "GRAPH_REVISION_EXPECTATION_MISMATCH"):
            build_networkx_mirror_receipt_v1(snapshot_export(), "workspace:abc", "graph:stale")

    def test_missing_expected_workspace_revision_keeps_receipt_partial(self):
        receipt = build_networkx_mirror_receipt_v1(snapshot_export())
        self.assertEqual(receipt["status"], "PARITY_PROVEN_REVISION_PARTIAL")
        self.assertFalse(receipt["workspaceRevisionQualified"])

    def test_missing_graph_revision_is_explicitly_partial(self):
        exported = snapshot_export()
        exported["graphSnapshot"]["graphRevision"] = None
        exported["graphSnapshot"]["revisionChecksum"] = None
        exported["proof"]["graphRevision"] = None
        exported["proof"]["revisionChecksum"] = None
        receipt = build_networkx_mirror_receipt_v1(exported, "workspace:abc")
        self.assertEqual(receipt["status"], "PARITY_PROVEN_REVISION_PARTIAL")
        self.assertFalse(receipt["graphRevisionQualified"])

    def test_non_null_revision_without_matching_proof_binding_is_not_qualified(self):
        exported = snapshot_export()
        exported["proof"].pop("graphRevision")
        exported["proof"].pop("revisionChecksum")
        receipt = build_networkx_mirror_receipt_v1(exported, "workspace:abc", "graph:abc")
        self.assertEqual(receipt["status"], "PARITY_PROVEN_REVISION_PARTIAL")
        self.assertFalse(receipt["graphRevisionQualified"])

    def test_rejects_conflicting_revision_binding(self):
        exported = snapshot_export()
        exported["proof"]["graphRevision"] = "graph:other"
        with self.assertRaisesRegex(ValueError, "GRAPH_REVISION_BINDING_MISMATCH"):
            build_networkx_mirror_receipt_v1(exported, "workspace:abc", "graph:abc")

    def test_rejects_conflicting_revision_checksum(self):
        exported = snapshot_export()
        exported["proof"]["revisionChecksum"] = "b" * 64
        with self.assertRaisesRegex(ValueError, "GRAPH_SNAPSHOT_REVISION_CHECKSUM_MISMATCH"):
            build_networkx_mirror_receipt_v1(exported, "workspace:abc", "graph:abc")

    def test_rejects_replay_mismatch_and_dangling_endpoints(self):
        exported = snapshot_export()
        exported["proof"]["replayMatches"] = False
        with self.assertRaisesRegex(ValueError, "GRAPH_SNAPSHOT_REPLAY_NOT_PROVEN"):
            build_networkx_mirror_receipt_v1(exported, "workspace:abc", "graph:abc")
        exported = snapshot_export()
        exported["edges"][0]["targetNodeKey"] = "missing"
        with self.assertRaisesRegex(ValueError, "GRAPH_EDGE_ENDPOINT_MISSING"):
            build_networkx_mirror_receipt_v1(exported, "workspace:abc", "graph:abc")

    def test_composes_directed_and_incidence_mirrors_on_same_revision(self):
        graph, mirror_receipt = build_networkx_graph_mirror_v1(snapshot_export(), "workspace:abc", "graph:abc")
        incidence = build_snapshot(
            [
                {
                    "fact_id": "fact-1",
                    "graph_revision": "graph:abc",
                    "checksum": "fact-checksum",
                    "evidence_refs": ["evidence:1"],
                    "participant_ids": ["a", "b"],
                    "participant_roles": ["source", "target"],
                    "participant_node_keys": ["sym:a", "sym:b"],
                }
            ],
            graph_revision="graph:abc",
        )

        receipt = build_networkx_hypergraph_alignment_receipt_v1(graph, mirror_receipt, incidence)

        self.assertEqual(receipt["status"], "ALIGNED")
        self.assertEqual(receipt["matchedParticipantNodeCount"], 2)
        self.assertEqual(receipt["unmatchedParticipantNodes"], [])
        self.assertFalse(receipt["canonicalAuthority"])
        self.assertFalse(receipt["writesPerformed"])

    def test_hypergraph_alignment_rejects_revision_mismatch(self):
        graph, mirror_receipt = build_networkx_graph_mirror_v1(snapshot_export(), "workspace:abc", "graph:abc")
        incidence = build_snapshot(
            [
                {
                    "fact_id": "fact-1",
                    "graph_revision": "graph:other",
                    "checksum": "fact-checksum",
                    "evidence_refs": ["evidence:1"],
                    "participant_ids": ["a", "b"],
                    "participant_roles": ["source", "target"],
                }
            ],
            graph_revision="graph:other",
        )

        with self.assertRaisesRegex(ValueError, "GRAPH_REVISION_ALIGNMENT_MISMATCH"):
            build_networkx_hypergraph_alignment_receipt_v1(graph, mirror_receipt, incidence)

    def test_hypergraph_alignment_reports_unmatched_entities_without_fabricating_nodes(self):
        graph, mirror_receipt = build_networkx_graph_mirror_v1(snapshot_export(), "workspace:abc", "graph:abc")
        incidence = build_snapshot(
            [
                {
                    "fact_id": "fact-1",
                    "graph_revision": "graph:abc",
                    "checksum": "fact-checksum",
                    "evidence_refs": ["evidence:1"],
                    "participant_ids": ["a", "missing"],
                    "participant_roles": ["source", "target"],
                    "participant_node_keys": ["sym:a", "sym:missing"],
                }
            ],
            graph_revision="graph:abc",
        )

        receipt = build_networkx_hypergraph_alignment_receipt_v1(graph, mirror_receipt, incidence)

        self.assertEqual(receipt["status"], "PARTIAL_NODE_COVERAGE")
        self.assertEqual(receipt["matchedParticipantNodeCount"], 1)
        self.assertEqual(receipt["unmatchedParticipantNodes"], ["sym:missing"])


if __name__ == "__main__":
    unittest.main()
