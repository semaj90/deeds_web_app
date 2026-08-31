"""ONTO-PY-04B: proves OntologyLinkedTupleAdapter.to_graph_projection()
actually delegates to the shared atlas_semantic_ontology_projection.py /
networkx_snapshot.py substrate (the operator's "layer mine on top of
theirs" decision), end to end against the real ONTO-PY-01 fixture — not
just that the bridge conversion type-checks.

Usage: python python/parent_atlas_ontology/onto_py_04b_delegated_networkx_check.py
Writes: docs/reports/ontology-linked-tuple-delegated-networkx-parity-v1.json
"""

from __future__ import annotations

import json
import sys
import time
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from parent_atlas_ontology.adapter import OntologyLinkedTupleAdapter  # noqa: E402
from parent_atlas_ontology.models import OntologyLinkedTupleV1  # noqa: E402
from parent_atlas_ontology.semantic_bridge import ontology_linked_tuple_to_nary_relation  # noqa: E402

REPO_ROOT = Path(__file__).resolve().parents[2]
FIXTURE_PATH = REPO_ROOT / "docs" / "reports" / "fixtures" / "ontology-linked-tuple-fixture-v1.json"
REPORT_PATH = REPO_ROOT / "docs" / "reports" / "ontology-linked-tuple-delegated-networkx-parity-v1.json"


def main() -> int:
    started = time.time()
    raw = json.loads(FIXTURE_PATH.read_text(encoding="utf-8"))
    tuple_obj = OntologyLinkedTupleV1.from_dict(raw)

    checks: list[dict] = []

    def check(name: str, ok: bool, detail: str = "") -> None:
        checks.append({"name": name, "ok": ok, "detail": detail})

    # Bridge conversion preserves the tuple's own identity and every participant.
    relation = ontology_linked_tuple_to_nary_relation(tuple_obj)
    check("bridge_preserves_relation_id", relation.relation_id == tuple_obj.tupleId, relation.relation_id)
    check("bridge_preserves_relation_type_from_label", relation.relation_type == tuple_obj.label, relation.relation_type)
    check(
        "bridge_preserves_all_4_participants_with_order",
        [p.canonical_id for p in relation.participants] == [p.entityId for p in tuple_obj.participants],
        str([p.canonical_id for p in relation.participants]),
    )
    check(
        "bridge_preserves_roles",
        [p.role for p in relation.participants] == [p.role for p in tuple_obj.participants],
        str([p.role for p in relation.participants]),
    )
    check("bridge_preserves_evidence_refs", relation.evidence_refs == tuple_obj.evidenceRefs, str(relation.evidence_refs))

    # Adapter delegates end to end.
    adapter = OntologyLinkedTupleAdapter()
    snapshot = adapter.to_graph_projection([tuple_obj], graph_revision="graph:onto-py-04b-check")
    snapshot_again = adapter.to_graph_projection([tuple_obj], graph_revision="graph:onto-py-04b-check")

    check("delegated_snapshot_has_correct_schema", snapshot["schema"] == "atlas.ontology-networkx-projection.v1", snapshot["schema"])
    check(
        "delegated_snapshot_reifies_exactly_1_nary_relation_node",
        sum(1 for row in snapshot["nodes"] if row["attributes"].get("node_kind") == "NARY_RELATION") == 1,
        str(sum(1 for row in snapshot["nodes"] if row["attributes"].get("node_kind") == "NARY_RELATION")),
    )
    check(
        "delegated_snapshot_has_4_participant_incidence_edges_no_pairwise_cliques",
        len(snapshot["edges"]) == 4,
        f"got {len(snapshot['edges'])} (expected 1 relation node with 4 PARTICIPANT incidence edges, never C(4,2)=6 pairwise edges)",
    )
    check(
        "delegated_snapshot_deterministic_across_two_calls",
        snapshot["projection_checksum"] == snapshot_again["projection_checksum"],
        f"{snapshot['projection_checksum']} vs {snapshot_again['projection_checksum']}",
    )
    check("delegated_snapshot_canonical_authority_false", snapshot["canonical_authority"] is False, "")
    check("delegated_snapshot_writes_performed_false", snapshot["writes_performed"] is False, "")

    all_ok = all(c["ok"] for c in checks)
    duration_ms = round((time.time() - started) * 1000, 2)

    report = {
        "gate": "ONTO-PY-04B",
        "description": "Proves OntologyLinkedTupleAdapter.to_graph_projection() delegates end-to-end to the shared atlas_semantic_ontology_projection.py substrate (operator's 'layer mine on top of theirs' decision), not just that the bridge type-checks",
        "fixturePath": str(FIXTURE_PATH.relative_to(REPO_ROOT)).replace("\\", "/"),
        "checks": checks,
        "pass": all_ok,
        "durationMs": duration_ms,
        "writesPerformed": False,
    }
    REPORT_PATH.parent.mkdir(parents=True, exist_ok=True)
    REPORT_PATH.write_text(json.dumps(report, indent=2) + "\n", encoding="utf-8")

    print(f"ONTO-PY-04B: {'PASS' if all_ok else 'FAIL'}")
    for c in checks:
        print(f"  [{'x' if c['ok'] else ' '}] {c['name']}: {c['detail']}")
    print(f"Report written: {REPORT_PATH}")

    return 0 if all_ok else 1


if __name__ == "__main__":
    raise SystemExit(main())
