import unittest
import hashlib
import json
from dataclasses import replace
from pathlib import Path
from jsonschema import Draft202012Validator
from atlas_compute.nary_networkx_alignment_v1 import (
    _canonical_json,
    build_snapshot,
    build_snapshot_from_admitted_proposals,
    build_role_incidence_csr_v1,
    bounded_multi_source_neighbors,
    bounded_neighbors,
    pagerank_cpu,
)
from atlas_graph_runtime.contracts import TypedGraphEdge
from atlas_graph_runtime.networkx_executor import run_pagerank
from parent_atlas_ontology.graph_projection import project_to_graph
from parent_atlas_ontology.models import (
    OntologyLinkedTupleProvenanceV1,
    OntologyLinkedTupleV1,
    OntologyParticipantV1,
)

def fact(fid="f",revision="g",checksum="hash",evidence_refs=None):
    return dict(fact_id=fid,graph_revision=revision,checksum=checksum,evidence_refs=["ev"] if evidence_refs is None else evidence_refs,
      participant_ids=["a","b"],participant_roles=["actor","target"])

def admitted_proposal():
    repository_root = Path(__file__).resolve().parents[2]
    predicate_document = repository_root / ".okf" / "predicates" / "feature-relationships.yaml"
    predicate_schema = repository_root / ".okf" / "schemas" / "feature-relationships-v1.schema.json"
    body = {
        "schema": "atlas.nary-fact-proposal.v1",
        "sourceRef": "repo:src/example.ts",
        "sourceRevision": "sha256:" + "a" * 64,
        "workspaceRevision": "sha256:" + "b" * 64,
        "packetKey": "packet:example",
        "graphRevision": "graph:revision-1",
        "producerRevision": "producer:v1",
        "ontologyRevision": "ontology:v1",
        "predicate": "implements",
        "predicatePolicy": {
            "schema": "atlas.okf.predicate-policy-ref.v1",
            "registryDocumentSha256": hashlib.sha256(predicate_document.read_bytes()).hexdigest(),
            "registrySchemaSha256": hashlib.sha256(predicate_schema.read_bytes()).hexdigest(),
        },
        "participants": [
            {"canonicalId": "example", "role": "subject", "entityType": "SYMBOL"},
            {"canonicalId": "capability", "role": "capability", "entityType": "ONTOLOGY"},
            {"canonicalId": "packet:example", "role": "evidence", "entityType": "PACKET"},
        ],
        "evidenceRefs": ["evidence:source-span"],
        "canonicalAuthority": False,
        "admission": "ADMITTED",
    }
    body["proposalChecksum"] = hashlib.sha256(_canonical_json(body).encode("utf-8")).hexdigest()
    return body

class TestNaryAlignment(unittest.TestCase):
    def test_okf_proposal_schema_matches_admitted_fixture_and_rejects_authority_claims(self):
        schema_path = Path(__file__).resolve().parents[2] / ".okf" / "schemas" / "nary-fact-proposal-v1.schema.json"
        schema = json.loads(schema_path.read_text(encoding="utf-8"))
        Draft202012Validator.check_schema(schema)
        validator = Draft202012Validator(schema)
        proposal = admitted_proposal()
        self.assertEqual(list(validator.iter_errors(proposal)), [])

        authority_claim = dict(proposal, canonicalAuthority=True)
        self.assertTrue(list(validator.iter_errors(authority_claim)))
        unknown_field = dict(proposal, graphNodeId="invented")
        self.assertTrue(list(validator.iter_errors(unknown_field)))

    def test_admitted_proposal_projects_role_labeled_typed_incidence(self):
        snapshot = build_snapshot_from_admitted_proposals(
            [admitted_proposal()], graph_revision="graph:revision-1"
        )
        self.assertEqual(
            set(snapshot.edges),
            {
                ("fact:" + admitted_proposal()["proposalChecksum"], "symbol:example", "subject"),
                ("fact:" + admitted_proposal()["proposalChecksum"], "ontology:capability", "capability"),
                ("fact:" + admitted_proposal()["proposalChecksum"], "packet:packet:example", "evidence"),
            },
        )
        self.assertEqual(snapshot.fact_predicates, ((
            "fact:" + admitted_proposal()["proposalChecksum"],
            "implements",
            admitted_proposal()["predicatePolicy"]["registryDocumentSha256"],
            admitted_proposal()["predicatePolicy"]["registrySchemaSha256"],
        ),))

    def test_admitted_projection_rejects_stale_predicate_registry_digest(self):
        proposal = admitted_proposal()
        proposal["predicatePolicy"]["registryDocumentSha256"] = "0" * 64
        proposal["proposalChecksum"] = hashlib.sha256(_canonical_json({
            key: value for key, value in proposal.items() if key != "proposalChecksum"
        }).encode("utf-8")).hexdigest()
        with self.assertRaisesRegex(ValueError, "PREDICATE_REGISTRY_DIGEST_MISMATCH"):
            build_snapshot_from_admitted_proposals([proposal], graph_revision="graph:revision-1")

    def test_admitted_projection_rejects_unqualified_predicate(self):
        proposal = admitted_proposal()
        proposal.pop("predicatePolicy")
        proposal["proposalChecksum"] = hashlib.sha256(_canonical_json({
            key: value for key, value in proposal.items() if key != "proposalChecksum"
        }).encode("utf-8")).hexdigest()
        with self.assertRaisesRegex(ValueError, "NARY_PROPOSAL_FIELDS_INVALID"):
            build_snapshot_from_admitted_proposals([proposal], graph_revision="graph:revision-1")

    def test_admitted_projection_rejects_tampering_unadmitted_and_stale_revision(self):
        proposal = admitted_proposal()
        proposal["predicate"] = "DEFINES"
        with self.assertRaisesRegex(ValueError, "CHECKSUM_MISMATCH"):
            build_snapshot_from_admitted_proposals([proposal], graph_revision="graph:revision-1")

        proposal = admitted_proposal()
        proposal["admission"] = "PROPOSED"
        with self.assertRaisesRegex(ValueError, "NOT_ADMITTED"):
            build_snapshot_from_admitted_proposals([proposal], graph_revision="graph:revision-1")

        with self.assertRaisesRegex(ValueError, "REVISION_MISMATCH"):
            build_snapshot_from_admitted_proposals([admitted_proposal()], graph_revision="graph:revision-2")

    def test_role_incidence_csr_has_stable_shared_ordinals(self):
        proposal = admitted_proposal()
        snapshot = build_snapshot_from_admitted_proposals([proposal], graph_revision="graph:revision-1")
        matrix = build_role_incidence_csr_v1(snapshot)
        self.assertEqual(matrix["entityOrdinals"], ["ontology:capability", "packet:packet:example", "symbol:example"])
        self.assertEqual(matrix["factOrdinals"], ["fact:" + proposal["proposalChecksum"]])
        self.assertEqual(matrix["roles"]["subject"], {"shape": [3, 1], "indptr": [0, 0, 0, 1], "indices": [0], "data": [1]})
        self.assertEqual(matrix["roles"]["capability"]["indptr"], [0, 1, 1, 1])
        self.assertEqual(matrix["roles"]["evidence"]["indptr"], [0, 0, 1, 1])
        reordered = build_snapshot_from_admitted_proposals([proposal], graph_revision="graph:revision-1")
        self.assertEqual(build_role_incidence_csr_v1(reordered)["matrixChecksum"], matrix["matrixChecksum"])

    def test_role_incidence_csr_rejects_forged_source_snapshot_checksum(self):
        snapshot = build_snapshot([fact()], graph_revision="g")
        with self.assertRaisesRegex(ValueError, "GRAPH_SNAPSHOT_CHECKSUM_MISMATCH"):
            build_role_incidence_csr_v1(replace(snapshot, checksum="0" * 64))

    def test_deterministic(self):
        a=build_snapshot([fact("a"),fact("b")],graph_revision="g")
        b=build_snapshot([fact("b"),fact("a")],graph_revision="g")
        self.assertEqual(a.checksum,b.checksum)
    def test_snapshot_checksum_binds_fact_digest_and_evidence_refs(self):
        base=build_snapshot([fact()],graph_revision="g")
        changed_digest=build_snapshot([fact(checksum="different")],graph_revision="g")
        changed_evidence=build_snapshot([fact(evidence_refs=["other-evidence"])],graph_revision="g")
        self.assertEqual(base.edges,changed_digest.edges)
        self.assertEqual(base.edges,changed_evidence.edges)
        self.assertNotEqual(base.checksum,changed_digest.checksum)
        self.assertNotEqual(base.checksum,changed_evidence.checksum)
        self.assertEqual(base.fact_evidence,(('fact:f','hash',('ev',)),))
    def test_snapshot_canonicalizes_evidence_reference_order(self):
        left=build_snapshot([fact(evidence_refs=["b","a"])],graph_revision="g")
        right=build_snapshot([fact(evidence_refs=["a","b"])],graph_revision="g")
        self.assertEqual(left.checksum,right.checksum)
    def test_snapshot_rejects_blank_evidence_reference(self):
        with self.assertRaisesRegex(ValueError,"GRAPH_FACT_EVIDENCE_INVALID"):
            build_snapshot([fact(evidence_refs=[""])],graph_revision="g")
        with self.assertRaisesRegex(ValueError,"GRAPH_FACT_EVIDENCE_REQUIRED"):
            build_snapshot([fact(evidence_refs=[])],graph_revision="g")
    def test_bounded_incidence(self):
        s=build_snapshot([fact()],graph_revision="g")
        self.assertEqual(bounded_neighbors(s,packet_key="a",max_hops=2),("fact:f","packet:b"))
    def test_multi_source_expansion_is_deterministic_and_reports_hops(self):
        s=build_snapshot([fact("f1"),fact("f2")],graph_revision="g")
        expected=(("fact:f1",1),("fact:f2",1),("packet:b",2))
        self.assertEqual(bounded_multi_source_neighbors(s,packet_keys=("a",),max_hops=2),expected)
        self.assertEqual(bounded_multi_source_neighbors(s,packet_keys=("a","b"),max_hops=1),expected[:2])
    def test_multi_source_rejects_unresolved_or_duplicate_seeds(self):
        s=build_snapshot([fact()],graph_revision="g")
        with self.assertRaisesRegex(ValueError,"GRAPH_SEED_UNRESOLVED"):
            bounded_multi_source_neighbors(s,packet_keys=("a","missing"))
        with self.assertRaisesRegex(ValueError,"GRAPH_SEEDS_DUPLICATE"):
            bounded_multi_source_neighbors(s,packet_keys=("a","a"))
    def test_multi_source_enforces_budgets(self):
        s=build_snapshot([fact()],graph_revision="g")
        with self.assertRaisesRegex(ValueError,"GRAPH_BUDGET_INVALID"):
            bounded_multi_source_neighbors(s,packet_keys=("a",),max_hops=5)
        with self.assertRaisesRegex(ValueError,"GRAPH_SEEDS_INVALID"):
            bounded_multi_source_neighbors(s,packet_keys=())
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
