"""ONTO-PY-04: OntologyLinkedTupleV1 -> NetworkX n-ary relation-node
projection.

Uses the same ONTO-PY-01 fixture. Deliberately supplies an ordinal_map
covering only 3 of the fixture's 4 participants (the three `ast_symbol`
ones) so the "skip participants with no resolvable ordinal" path is
exercised for real, not just theoretically possible — the fixture's
4th participant (`tool_call:typecheck-run-42`) has no defined
GraphNodeKeyV1 derivation today (see graph_projection.py's docstring),
which is a genuine, expected case, not a bug to work around here.

Usage: python python/parent_atlas_ontology/onto_py_04_graph_projection_check.py
Writes: docs/reports/ontology-linked-tuple-graph-projection-parity-v1.json
"""

from __future__ import annotations

import json
import sys
import time
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

# NOTE (2026-08-31): this script exercises graph_projection.py's
# standalone project_to_graph() DIRECTLY, not through
# OntologyLinkedTupleAdapter.to_graph_projection() — the operator's
# "layer mine on top of theirs" decision moved the adapter's default
# delegation to atlas_semantic_ontology_projection.py/networkx_snapshot.py
# (see onto_py_04b_delegated_networkx_check.py for that path). This
# module and its tests remain real and passing; they're just no longer
# reached through the adapter class by default. See graph_projection.py's
# own updated docstring.
from parent_atlas_ontology.graph_projection import project_to_graph  # noqa: E402
from parent_atlas_ontology.models import OntologyLinkedTupleV1  # noqa: E402

REPO_ROOT = Path(__file__).resolve().parents[2]
FIXTURE_PATH = REPO_ROOT / "docs" / "reports" / "fixtures" / "ontology-linked-tuple-fixture-v1.json"
REPORT_PATH = REPO_ROOT / "docs" / "reports" / "ontology-linked-tuple-graph-projection-parity-v1.json"

# Opaque, externally supplied ordinal map — this script plays the role of
# "whatever already resolved a real GraphOrdinalMapV1", not this module.
ORDINAL_MAP = {
    "symbol:S1": 10,
    "symbol:S2": 11,
    "symbol:T7": 12,
    # "tool_call:typecheck-run-42" deliberately absent.
}


def main() -> int:
    started = time.time()
    raw = json.loads(FIXTURE_PATH.read_text(encoding="utf-8"))
    tuple_obj = OntologyLinkedTupleV1.from_dict(raw)

    result = project_to_graph([tuple_obj], ORDINAL_MAP)

    # Determinism: re-run must produce the identical checksum.
    result_again = project_to_graph([tuple_obj], ORDINAL_MAP)

    checks: list[dict] = []

    def check(name: str, ok: bool, detail: str = "") -> None:
        checks.append({"name": name, "ok": ok, "detail": detail})

    check(
        "one_relation_node_per_tuple",
        sum(1 for _, d in result.graph.nodes(data=True) if d.get("kind") == "relation") == 1,
        str([n for n, d in result.graph.nodes(data=True) if d.get("kind") == "relation"]),
    )
    check(
        "exactly_3_ordinal_resolved_participant_edges",
        len(result.edges) == 3,
        f"got {len(result.edges)}",
    )
    check(
        "1_participant_skipped_not_crashed",
        len(result.skippedParticipants) == 1 and result.skippedParticipants[0]["entityId"] == "tool_call:typecheck-run-42",
        str(result.skippedParticipants),
    )
    check(
        "no_pairwise_participant_to_participant_edges",
        all(u.startswith("relation:") for u, v in result.graph.edges()),
        "every edge must originate from the relation node, never participant->participant",
    )
    check(
        "edge_roles_match_original_participant_roles",
        {e["role"] for _, _, e in result.graph.edges(data=True)} == {"cause", "effect", "evidence"},
        str({e["role"] for _, _, e in result.graph.edges(data=True)}),
    )
    check(
        "role_codes_are_stable_and_distinct",
        len({e.roleCode for e in result.edges}) == 3,
        str(sorted({e.roleCode for e in result.edges})),
    )
    check(
        "destination_ordinals_match_supplied_map",
        {e.destinationOrdinal for e in result.edges} == {10, 11, 12},
        str(sorted({e.destinationOrdinal for e in result.edges})),
    )
    check(
        "deterministic_checksum_across_two_independent_runs",
        result.projectionChecksum == result_again.projectionChecksum,
        f"{result.projectionChecksum} vs {result_again.projectionChecksum}",
    )
    check(
        "operational_projection_has_one_coordinate_universe",
        len(result.projectionNodes) == 4
        and result.projectionOrdinalByNodeKey is not None
        and len(result.projectionOrdinalByNodeKey) == 4
        and len(result.operationalEdges) == 3
        and all(
            0 <= edge.sourceProjectionOrdinal < len(result.projectionNodes)
            and 0 <= edge.destinationProjectionOrdinal < len(result.projectionNodes)
            for edge in result.operationalEdges
        ),
        f"nodes={len(result.projectionNodes)}, edges={len(result.operationalEdges)}",
    )

    all_ok = all(c["ok"] for c in checks)
    duration_ms = round((time.time() - started) * 1000, 2)

    report = {
        "gate": "ONTO-PY-04",
        "description": "OntologyLinkedTupleV1 -> NetworkX n-ary relation-node projection (participants A/B/C -> R17, never pairwise edges)",
        "note": "NetworkX parity is proven for the fixture. Operational ProjectionNodeKeyV1/ProjectionOrdinalMapV1 coordinates are now emitted for the future cuGraph path. cuGraph execution parity is still separate; tuple nodes remain non-canonical projection vertices.",
        "operationalProjection": {
            "nodeCount": len(result.projectionNodes),
            "edgeCount": len(result.operationalEdges),
            "coordinateSpace": "ProjectionOrdinal",
            "canonicalAuthority": False,
        },
        "fixturePath": str(FIXTURE_PATH.relative_to(REPO_ROOT)).replace("\\", "/"),
        "checks": checks,
        "pass": all_ok,
        "durationMs": duration_ms,
        "writesPerformed": False,
    }
    REPORT_PATH.parent.mkdir(parents=True, exist_ok=True)
    REPORT_PATH.write_text(json.dumps(report, indent=2) + "\n", encoding="utf-8")

    print(f"ONTO-PY-04: {'PASS' if all_ok else 'FAIL'}")
    for c in checks:
        print(f"  [{'x' if c['ok'] else ' '}] {c['name']}: {c['detail']}")
    print(f"Report written: {REPORT_PATH}")

    return 0 if all_ok else 1


if __name__ == "__main__":
    raise SystemExit(main())
