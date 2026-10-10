import unittest
from atlas_compute.nary_networkx_alignment_v1 import build_snapshot,bounded_neighbors,pagerank_cpu
from atlas_graph_runtime.contracts import TypedGraphEdge
from atlas_graph_runtime.networkx_executor import run_pagerank
from parent_atlas_ontology.graph_projection import project_to_graph
from parent_atlas_ontology.models import (
    OntologyLinkedTupleProvenanceV1,
    OntologyLinkedTupleV1,
    OntologyParticipantV1,
)

def fact(fid="f",revision="g"):
    return dict(fact_id=fid,graph_revision=revision,checksum="hash",evidence_refs=["ev"],
      participant_ids=["a","b"],participant_roles=["actor","target"])
class TestNaryAlignment(unittest.TestCase):
    def test_deterministic(self):
        a=build_snapshot([fact("a"),fact("b")],graph_revision="g")
        b=build_snapshot([fact("b"),fact("a")],graph_revision="g")
        self.assertEqual(a.checksum,b.checksum)
    def test_bounded_incidence(self):
        s=build_snapshot([fact()],graph_revision="g")
        self.assertEqual(bounded_neighbors(s,packet_key="a",max_hops=2),("fact:f","packet:b"))
    def test_revision_failure(self):
        with self.assertRaisesRegex(ValueError,"REVISION"): build_snapshot([fact(revision="old")],graph_revision="g")
    def test_pagerank(self):
        s=build_snapshot([fact()],graph_revision="g")
        p=pagerank_cpu(s)
        self.assertAlmostEqual(sum(p.values()),1.0)
    def test_pagerank_matches_shared_networkx_executor(self):
        s=build_snapshot([fact()],graph_revision="g")
        ordinal_by_node={node:ordinal for ordinal,node in enumerate(s.nodes)}
        edges=[TypedGraphEdge(ordinal_by_node[source],ordinal_by_node[target],role)
               for source,target,role in s.edges]
        shared,receipt=run_pagerank(
            graph_revision=s.graph_revision,
            node_ordinals=list(ordinal_by_node.values()),
            edges=edges,
        )
        fixture=pagerank_cpu(s)
        self.assertEqual(receipt.status,"PROVEN")
        self.assertEqual(receipt.effective_backend,"networkx")
        for node,score in fixture.items():
            self.assertAlmostEqual(shared[ordinal_by_node[node]],score,delta=1e-6)
    def test_incidence_direction_matches_canonical_ontology_projection(self):
        tuple_value=OntologyLinkedTupleV1(
            tupleId="f",
            schemaVersion="ontology-linked-tuple.v1",
            sourceRef="repo:src/a.ts",
            surfaceText="A uses B",
            label="USES",
            labelKind="RELATION",
            labelSource="fixture",
            confidence=1.0,
            evidenceState="OBSERVED",
            provenance=OntologyLinkedTupleProvenanceV1(
                sourceTables=("fixture",),
                labelerVersion=None,
                taggerVersion=None,
                ontologyVersion=None,
                nlpVersion=None,
            ),
            participants=(
                OntologyParticipantV1("a","packet","actor"),
                OntologyParticipantV1("b","packet","target"),
            ),
            evidenceRefs=("fixture:evidence",),
        )
        projected=project_to_graph([tuple_value],{"a":0,"b":1})
        projected_edges=set()
        for source,target,data in projected.graph.edges(data=True):
            source_node=projected.graph.nodes[source]
            target_node=projected.graph.nodes[target]
            projected_edges.add((
                f"fact:{source_node['tupleId']}",
                f"packet:{target_node['entityId']}",
                data["role"],
            ))
        snapshot=build_snapshot([fact()],graph_revision="g")
        self.assertEqual(set(snapshot.edges),projected_edges)
if __name__=="__main__": unittest.main()
