"""ONTO-PY-03: OntologyLinkedTupleV1 -> Arrow IPC round-trip, exact.

Loads the same frozen fixture ONTO-PY-01 already proved lossless through
the Python typed model, projects it into the nested-struct Arrow schema
(arrow_adapter.py), serializes to real Arrow IPC bytes (not just an
in-memory Table - the actual wire format Go/GPU consumers would read),
deserializes back, and re-checks the same 8 properties ONTO-PY-01
checked - now through Arrow instead of just the Python dataclass layer.

Usage: python python/parent_atlas_ontology/onto_py_03_arrow_parity_check.py
Writes: docs/reports/ontology-linked-tuple-arrow-parity-v1.json
"""

from __future__ import annotations

import json
import sys
import time
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from parent_atlas_ontology.arrow_adapter import (  # noqa: E402
    from_arrow_table,
    ipc_bytes_to_table,
    table_to_ipc_bytes,
    to_arrow_table,
)
from parent_atlas_ontology.checksum import sha256_hex  # noqa: E402
from parent_atlas_ontology.models import OntologyLinkedTupleV1  # noqa: E402

REPO_ROOT = Path(__file__).resolve().parents[2]
FIXTURE_PATH = REPO_ROOT / "docs" / "reports" / "fixtures" / "ontology-linked-tuple-fixture-v1.json"
REPORT_PATH = REPO_ROOT / "docs" / "reports" / "ontology-linked-tuple-arrow-parity-v1.json"


def main() -> int:
    started = time.time()
    raw = json.loads(FIXTURE_PATH.read_text(encoding="utf-8"))
    original = OntologyLinkedTupleV1.from_dict(raw)

    table = to_arrow_table([original])
    ipc_bytes = table_to_ipc_bytes(table)
    round_tripped_table = ipc_bytes_to_table(ipc_bytes)
    round_tripped = from_arrow_table(round_tripped_table)[0]

    checks: list[dict] = []

    def check(name: str, ok: bool, detail: str = "") -> None:
        checks.append({"name": name, "ok": ok, "detail": detail})

    check("row_count_preserved", round_tripped_table.num_rows == 1, str(round_tripped_table.num_rows))
    check("tuple_id_preserved", round_tripped.tupleId == original.tupleId, round_tripped.tupleId)
    check(
        "participant_count_preserved",
        len(round_tripped.participants) == len(original.participants) == 4,
        f"got {len(round_tripped.participants)}",
    )
    check(
        "participant_roles_and_order_preserved",
        [p.role for p in round_tripped.participants] == [p.role for p in original.participants],
        str([p.role for p in round_tripped.participants]),
    )
    check(
        "participant_entity_ids_preserved",
        [p.entityId for p in round_tripped.participants] == [p.entityId for p in original.participants],
        str([p.entityId for p in round_tripped.participants]),
    )
    check("evidence_refs_preserved", round_tripped.evidenceRefs == original.evidenceRefs, str(round_tripped.evidenceRefs))
    check("confidence_preserved", round_tripped.confidence == original.confidence, str(round_tripped.confidence))
    check(
        "evidence_span_preserved",
        round_tripped.evidenceSpan == original.evidenceSpan,
        str(round_tripped.evidenceSpan),
    )

    original_checksum = sha256_hex(original.to_dict())
    round_trip_checksum = sha256_hex(round_tripped.to_dict())
    check(
        "canonical_checksum_parity_via_arrow_ipc",
        original_checksum == round_trip_checksum,
        f"original={original_checksum} round_trip={round_trip_checksum}",
    )

    all_ok = all(c["ok"] for c in checks)
    duration_ms = round((time.time() - started) * 1000, 2)

    report = {
        "gate": "ONTO-PY-03",
        "description": "OntologyLinkedTupleV1 -> Arrow IPC (real wire-format bytes, not just an in-memory Table) -> round-trip, exact",
        "fixturePath": str(FIXTURE_PATH.relative_to(REPO_ROOT)).replace("\\", "/"),
        "arrowIpcByteLength": len(ipc_bytes),
        "checks": checks,
        "pass": all_ok,
        "durationMs": duration_ms,
        "writesPerformed": False,
    }

    REPORT_PATH.parent.mkdir(parents=True, exist_ok=True)
    REPORT_PATH.write_text(json.dumps(report, indent=2) + "\n", encoding="utf-8")

    print(f"ONTO-PY-03: {'PASS' if all_ok else 'FAIL'}")
    for c in checks:
        print(f"  [{'x' if c['ok'] else ' '}] {c['name']}: {c['detail']}")
    print(f"Report written: {REPORT_PATH}")

    return 0 if all_ok else 1


if __name__ == "__main__":
    raise SystemExit(main())
