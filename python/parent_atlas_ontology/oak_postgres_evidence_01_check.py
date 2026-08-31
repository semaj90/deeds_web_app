"""OAK-PG-EVIDENCE-01: static proof for the bounded PostgreSQL evidence lane.

This check does not connect to PostgreSQL. It proves the query builder is
parameterized, selector-bounded, deterministic, excludes superseded tuples,
and fetches at most ``limit + 1`` rows for exact truncation detection.

Usage:
    python python/parent_atlas_ontology/oak_postgres_evidence_01_check.py
"""

from __future__ import annotations

import os
import sys
from pathlib import Path

from pydantic import ValidationError

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from atlas_oak_postgres_evidence import (  # noqa: E402
    LinkedTupleEvidenceRequest,
    _query_for,
    postgres_evidence_health,
)


def main() -> int:
    checks: list[tuple[str, bool, str]] = []

    def check(name: str, ok: bool, detail: str = "") -> None:
        checks.append((name, ok, detail))

    cases = [
        (LinkedTupleEvidenceRequest(packet_key="packet:p1", limit=7), "packet_key = %s"),
        (LinkedTupleEvidenceRequest(source_ref="src/a.ts", limit=7), "source_ref = %s"),
        (LinkedTupleEvidenceRequest(ontology_id="SO:0000001", limit=7), "%s = ANY(ontology_ids)"),
        (LinkedTupleEvidenceRequest(concept_id="concept:c1", limit=7), "%s = ANY(concept_ids)"),
    ]

    for request, expected_predicate in cases:
        sql, params = _query_for(request)
        check(f"selector_{expected_predicate}", expected_predicate in sql, sql)
        check("parameterized_no_selector_interpolation", str(next(v for v in [request.packet_key, request.source_ref, request.ontology_id, request.concept_id] if v is not None)) not in sql, sql)
        check("deterministic_tuple_order", "ORDER BY tuple_id" in sql, sql)
        check("superseded_excluded", "lifecycle <> 'SUPERSEDED'" in sql, sql)
        check("limit_plus_one", params[-1] == request.limit + 1, str(params))

    revision_request = LinkedTupleEvidenceRequest(
        packet_key="packet:p1",
        relation_revision="relation:r9",
        limit=3,
    )
    revision_sql, revision_params = _query_for(revision_request)
    check("relation_revision_exact_filter", "relation_revision = %s" in revision_sql, revision_sql)
    check("relation_revision_parameter_preserved", revision_params[-2] == "relation:r9", str(revision_params))

    try:
        LinkedTupleEvidenceRequest(packet_key="packet:p1", source_ref="src/a.ts")
        check("rejects_multiple_selectors", False, "model accepted multiple selectors")
    except ValidationError:
        check("rejects_multiple_selectors", True, "raised ValidationError")

    try:
        LinkedTupleEvidenceRequest()
        check("rejects_missing_selector", False, "model accepted no selector")
    except ValidationError:
        check("rejects_missing_selector", True, "raised ValidationError")

    previous = os.environ.pop("ATLAS_OAK_POSTGRES_DSN", None)
    try:
        health = postgres_evidence_health()
        check("unconfigured_health_is_fail_closed", health["configured"] is False, str(health))
        check("health_does_not_expose_dsn", health["dsnExposed"] is False, str(health))
        check("canonical_authority_false", health["canonicalAuthority"] is False, str(health))
    finally:
        if previous is not None:
            os.environ["ATLAS_OAK_POSTGRES_DSN"] = previous

    passed = all(ok for _, ok, _ in checks)
    print(f"OAK-PG-EVIDENCE-01: {'PASS' if passed else 'FAIL'}")
    for name, ok, detail in checks:
        print(f"  [{'x' if ok else ' '}] {name}: {detail}")
    print("writesPerformed: false")
    print("databaseConnected: false")
    return 0 if passed else 1


if __name__ == "__main__":
    raise SystemExit(main())
