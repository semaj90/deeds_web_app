"""OAK-PROJECTION-01: proves the Python NetworkX adapter now emits the
ONE query-graph coordinate space (ProjectionOrdinalMapV1) instead of its
own ad-hoc node labels, over the real ONTO-PY-01 fixture, delegated
through the shared atlas_semantic_ontology_projection.py substrate
(ONTO-PY-04B's path) — not a synthetic toy graph.

Usage: python python/parent_atlas_ontology/oak_projection_01_check.py
Writes: docs/reports/ontology-linked-tuple-projection-ordinal-map-v1.json
"""

from __future__ import annotations

import json
import sys
import time
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from parent_atlas_ontology.adapter import OntologyLinkedTupleAdapter  # noqa: E402
from parent_atlas_ontology.models import OntologyLinkedTupleV1  # noqa: E402
from parent_atlas_ontology.projection_ordinal_map import (  # noqa: E402
    build_projection_ordinal_map_v1,
    projection_ordinal_map_from_networkx_snapshot,
    ProjectionOrdinalMapValidationError,
)

REPO_ROOT = Path(__file__).resolve().parents[2]
FIXTURE_PATH = REPO_ROOT / "docs" / "reports" / "fixtures" / "ontology-linked-tuple-fixture-v1.json"
REPORT_PATH = REPO_ROOT / "docs" / "reports" / "ontology-linked-tuple-projection-ordinal-map-v1.json"


def main() -> int:
    started = time.time()
    raw = json.loads(FIXTURE_PATH.read_text(encoding="utf-8"))
    tuple_obj = OntologyLinkedTupleV1.from_dict(raw)

    adapter = OntologyLinkedTupleAdapter()
    snapshot = adapter.to_graph_projection([tuple_obj], graph_revision="graph:oak-projection-01-check")

    projection_map, skipped = projection_ordinal_map_from_networkx_snapshot(
        snapshot, ontology_revision="ontology:oak-projection-01-check", projection_revision="projection:v1"
    )
    projection_map_again, _ = projection_ordinal_map_from_networkx_snapshot(
        snapshot, ontology_revision="ontology:oak-projection-01-check", projection_revision="projection:v1"
    )

    checks: list[dict] = []

    def check(name: str, ok: bool, detail: str = "") -> None:
        checks.append({"name": name, "ok": ok, "detail": detail})

    check("projection_map_schema_correct", projection_map.schema == "atlas.projection-ordinal-map.v1", projection_map.schema)
    check("canonical_authority_false", projection_map.canonicalAuthority is False, "")

    node_classes = {row.nodeClass for row in projection_map.rows}
    check("only_entity_and_tuple_classes_present_for_this_fixture", node_classes == {"ENTITY", "TUPLE"}, str(node_classes))

    tuple_rows = [row for row in projection_map.rows if row.nodeClass == "TUPLE"]
    check("exactly_1_tuple_row_with_tupleId_set", len(tuple_rows) == 1 and tuple_rows[0].tupleId is not None, str(tuple_rows))

    entity_rows = [row for row in projection_map.rows if row.nodeClass == "ENTITY"]
    check("4_entity_rows_for_4_participants", len(entity_rows) == 4, f"got {len(entity_rows)}")

    check(
        "rows_sorted_and_ordinals_dense",
        [row.projectionOrdinal for row in projection_map.rows] == list(range(len(projection_map.rows)))
        and [row.projectionNodeKey for row in projection_map.rows] == sorted(row.projectionNodeKey for row in projection_map.rows),
        str([(row.projectionOrdinal, row.projectionNodeKey) for row in projection_map.rows]),
    )
    check(
        "deterministic_checksum_across_two_independent_conversions",
        projection_map.projectionOrdinalMapChecksum == projection_map_again.projectionOrdinalMapChecksum,
        f"{projection_map.projectionOrdinalMapChecksum} vs {projection_map_again.projectionOrdinalMapChecksum}",
    )
    check("zero_skipped_nodes_for_this_fixture", len(skipped) == 0, str(skipped))

    # Guardrail parity checks (mirror the TS spec's rejection tests).
    try:
        build_projection_ordinal_map_v1(
            graph_revision="g", ontology_revision="o", projection_revision="p",
            nodes=[{"projectionNodeKey": "tuple:r17", "nodeClass": "TUPLE", "tupleId": "r17", "graphOrdinal": 1, "graphNodeKey": "symbol:S1"}],
        )
        check("refuses_non_entity_claiming_durable_graph_identity", False, "did not raise")
    except ProjectionOrdinalMapValidationError:
        check("refuses_non_entity_claiming_durable_graph_identity", True, "raised as expected")

    try:
        build_projection_ordinal_map_v1(graph_revision="g", ontology_revision="o", projection_revision="p", nodes=[{"projectionNodeKey": "tuple:r17", "nodeClass": "TUPLE"}])
        check("refuses_tuple_row_missing_tupleId", False, "did not raise")
    except ProjectionOrdinalMapValidationError:
        check("refuses_tuple_row_missing_tupleId", True, "raised as expected")

    all_ok = all(c["ok"] for c in checks)
    duration_ms = round((time.time() - started) * 1000, 2)

    report = {
        "gate": "OAK-PROJECTION-01",
        "description": "Python NetworkX adapter migrated onto the ONE query-graph coordinate space (ProjectionOrdinalMapV1), mirroring packages/parent-atlas/src/core/projection-ordinal-map-v1.ts field-for-field and validation-rule-for-rule",
        "fixturePath": str(FIXTURE_PATH.relative_to(REPO_ROOT)).replace("\\", "/"),
        "checks": checks,
        "pass": all_ok,
        "durationMs": duration_ms,
        "writesPerformed": False,
    }
    REPORT_PATH.parent.mkdir(parents=True, exist_ok=True)
    REPORT_PATH.write_text(json.dumps(report, indent=2) + "\n", encoding="utf-8")

    print(f"OAK-PROJECTION-01: {'PASS' if all_ok else 'FAIL'}")
    for c in checks:
        print(f"  [{'x' if c['ok'] else ' '}] {c['name']}: {c['detail']}")
    print(f"Report written: {REPORT_PATH}")

    return 0 if all_ok else 1


if __name__ == "__main__":
    raise SystemExit(main())
