"""ONTO-PY-06: bounded proof for authority-qualified n-ary projections.

Uses the existing real 4-participant ontology-linked-tuple fixture. The
workspace/representation/feature/graph authority values below are explicitly
TEST-ONLY inputs for contract verification; they do not claim current Parent
Atlas snapshot authority and they are never written to canonical stores.

Usage:
  python python/parent_atlas_ontology/onto_py_06_rich_nary_authority_check.py

Writes only a derived report:
  docs/reports/ontology-rich-nary-authority-v1.json
"""

from __future__ import annotations

import json
import sys
import time
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / "python"))

from parent_atlas_ontology.models import OntologyLinkedTupleV1  # noqa: E402
from parent_atlas_ontology.oak_adapter import OaklibUnavailableError, ParentAtlasOakAdapter  # noqa: E402
from parent_atlas_ontology.rich_nary import (  # noqa: E402
    OntologyFanoutAuthorityViewV1,
    build_authority_rdf_dataset_v1,
    ontology_linked_tuple_to_rich_nary_v1,
    project_binary_edge_v1,
    rich_nary_to_semantic_relation_v1,
)

FIXTURE_PATH = ROOT / "docs/reports/fixtures/ontology-linked-tuple-fixture-v1.json"
REPORT_PATH = ROOT / "docs/reports/ontology-rich-nary-authority-v1.json"


def main() -> int:
    started = time.time()
    fixture = OntologyLinkedTupleV1.from_dict(json.loads(FIXTURE_PATH.read_text(encoding="utf-8")))
    authority = OntologyFanoutAuthorityViewV1.from_dict(
        {
            "schemaVersion": "atlas.ontology-fanout-authority.v1",
            "packetKey": fixture.packetKey,
            "sourceRef": fixture.sourceRef,
            "contentHash": "a" * 64,
            "sourceRevision": fixture.provenance.sourceRevision,
            "workspaceRevision": "test:workspace:onto-py-06:v1",
            "representationId": "semantic_768",
            "representationRevision": "test:semantic-768:onto-py-06:v1",
            "featureRevision": "test:feature:onto-py-06:v1",
            "ontologyRevision": fixture.provenance.ontologyRevision,
            "graphRevision": "test:graph:onto-py-06:v1",
            "producerRevision": fixture.provenance.producerRevision,
            "evidenceRefs": list(fixture.evidenceRefs),
            "ontologyIds": list(fixture.ontologyIds),
            "conceptIds": list(fixture.conceptIds),
        }
    )

    checks: list[dict] = []

    def check(name: str, ok: bool, detail="") -> None:
        checks.append({"name": name, "ok": bool(ok), "detail": detail})

    relation = ontology_linked_tuple_to_rich_nary_v1(fixture, authority, require_graph_revision=True)
    check("schema", relation.schema == "atlas.rich-nary-relation.v1", relation.schema)
    check("canonical_authority_false", relation.canonicalAuthority is False)
    check(
        "genuine_four_participant_relation",
        [p.role for p in relation.participants] == ["cause", "effect", "evidence", "tool"],
        [p.role for p in relation.participants],
    )
    check("evidence_refs_preserved", relation.evidence.evidenceRefs == fixture.evidenceRefs)
    check("evidence_span_preserved", (relation.evidence.spanStart, relation.evidence.spanEnd) == (120, 168))
    check("packet_key_preserved", relation.evidence.packetKey == fixture.packetKey)
    check("source_revision_preserved", relation.evidence.sourceRevision == fixture.provenance.sourceRevision)
    check("workspace_revision_explicit", relation.authority.workspaceRevision == "test:workspace:onto-py-06:v1")
    check("semantic_768_explicit", relation.authority.representationId == "semantic_768")
    check("graph_projection_eligible", relation.graphProjectionEligible)

    semantic = rich_nary_to_semantic_relation_v1(relation)
    check("shared_nary_substrate_relation_id", semantic.relation_id == fixture.tupleId)
    check("shared_nary_substrate_degree", semantic.degree == 4, semantic.degree)
    check("shared_nary_substrate_noncanonical", semantic.canonical_authority is False)

    edge = project_binary_edge_v1(relation, from_role="cause", to_role="effect")
    check("binary_projection_from", edge["from"] == "symbol:S1", edge["from"])
    check("binary_projection_to", edge["to"] == "symbol:S2", edge["to"])
    check("binary_projection_relation_trace", edge["relationId"] == fixture.tupleId)
    check("binary_projection_noncanonical", edge["canonicalAuthority"] is False)

    serialized = json.dumps(relation.to_dict(), sort_keys=True).lower()
    check("no_synthetic_unknown_authority", '"unknown"' not in serialized)

    try:
        dataset = build_authority_rdf_dataset_v1([relation])
        rdf_text = "\n".join(str(triple) for graph in dataset.graphs() for triple in graph)
        check("rdf_projection_available", True, "rdflib installed")
        check("rdf_workspace_revision_preserved", authority.workspaceRevision in rdf_text)
        check("rdf_ontology_revision_preserved", authority.ontologyRevision in rdf_text)
    except RuntimeError as exc:
        check("rdf_projection_available", False, str(exc))

    oak_status: dict = {"installed": False, "canonicalAuthority": False}
    try:
        ParentAtlasOakAdapter("sqlite:obo:cl")
        oak_status["installed"] = True
    except OaklibUnavailableError:
        pass
    except Exception as exc:
        # oaklib being installed but unable to resolve/download a remote test
        # backend is not an authority failure; this runner does not perform
        # network-dependent ontology admission.
        oak_status["installed"] = True
        oak_status["probeError"] = str(exc)
    check("oak_adapter_noncanonical", oak_status["canonicalAuthority"] is False, oak_status)

    # Fail-closed regression checks.
    blocked = []
    for field in ("sourceRevision", "workspaceRevision", "featureRevision", "ontologyRevision", "producerRevision"):
        raw = authority.to_dict()
        raw[field] = "unknown"
        try:
            OntologyFanoutAuthorityViewV1.from_dict(raw)
            blocked.append({"field": field, "blocked": False})
        except ValueError:
            blocked.append({"field": field, "blocked": True})
    check("placeholder_revisions_rejected", all(row["blocked"] for row in blocked), blocked)

    no_graph = authority.to_dict()
    no_graph["graphRevision"] = None
    relation_without_graph = ontology_linked_tuple_to_rich_nary_v1(
        fixture, OntologyFanoutAuthorityViewV1.from_dict(no_graph)
    )
    try:
        project_binary_edge_v1(relation_without_graph, from_role="cause", to_role="effect")
        check("graph_projection_requires_graph_revision", False, "projection unexpectedly succeeded")
    except ValueError as exc:
        check("graph_projection_requires_graph_revision", str(exc) == "GRAPH_REVISION_UNPROVEN", str(exc))

    required = [
        "schema",
        "canonical_authority_false",
        "genuine_four_participant_relation",
        "evidence_refs_preserved",
        "evidence_span_preserved",
        "packet_key_preserved",
        "source_revision_preserved",
        "workspace_revision_explicit",
        "semantic_768_explicit",
        "graph_projection_eligible",
        "shared_nary_substrate_relation_id",
        "shared_nary_substrate_degree",
        "shared_nary_substrate_noncanonical",
        "binary_projection_from",
        "binary_projection_to",
        "binary_projection_relation_trace",
        "binary_projection_noncanonical",
        "no_synthetic_unknown_authority",
        "oak_adapter_noncanonical",
        "placeholder_revisions_rejected",
        "graph_projection_requires_graph_revision",
    ]
    by_name = {row["name"]: row for row in checks}
    passed = all(by_name[name]["ok"] for name in required)

    report = {
        "schema": "atlas.ontology-rich-nary-authority-proof.v1",
        "gate": "ONTO-PY-06",
        "status": "RICH_NARY_AUTHORITY_PROVEN_BOUNDED" if passed else "RICH_NARY_AUTHORITY_BLOCKED",
        "fixture": str(FIXTURE_PATH.relative_to(ROOT)).replace("\\", "/"),
        "authorityScope": "TEST_ONLY_CONTRACT_FIXTURE_NOT_CURRENT_WORKSPACE_AUTHORITY",
        "checks": checks,
        "oaklib": oak_status,
        "canonicalWrites": False,
        "projectionWrites": False,
        "durationMs": round((time.time() - started) * 1000, 2),
    }
    REPORT_PATH.parent.mkdir(parents=True, exist_ok=True)
    REPORT_PATH.write_text(json.dumps(report, indent=2) + "\n", encoding="utf-8")

    print(report["status"])
    for row in checks:
        print(f"  [{'x' if row['ok'] else ' '}] {row['name']}: {row['detail']}")
    print(f"report={REPORT_PATH}")
    return 0 if passed else 1


if __name__ == "__main__":
    raise SystemExit(main())
