from __future__ import annotations

import hashlib
import json
import sys
from dataclasses import asdict
from datetime import datetime, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / "python"))

from atlas_external_docs import _normalize_ws, chunk_document
from atlas_external_doc_hypergraph import (
    GroundedFactParticipantV1,
    build_grounded_fact_bridge_from_external_doc_chunk_v1,
    build_hypergraph_fact_proposal_v1,
    validate_evidence_slice_v1,
)
from parent_atlas_ontology.hypergraph_networkx_bridge_v1 import (
    build_hypergraph_networkx_fixture_receipt_v1,
    revalidate_hypergraph_networkx_fixture_receipt_v1,
)


def _sha256(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()


def main() -> int:
    base_url = "https://example.test/atlas/hypergraph-fixture"
    title = "Atlas Hypergraph Fixture"
    normalized = _normalize_ws(
        "Grounded evidence binds a relation to exact source bytes and revisions. "
        "Role-bearing participants preserve n-ary structure without pairwise cliques."
    )
    source_revision = f"sha256:{_sha256(normalized.encode('utf-8'))}"
    workspace_revision = f"sha256:{_sha256(b'fixture-workspace-v1')}"
    producer_revision = "atlas-external-doc-grounded-fact-fixture-v1"
    chunks = chunk_document(
        source_id="fixture:atlas-hypergraph",
        source_revision=source_revision,
        source_url=base_url,
        title=title,
        text=normalized,
        maximum_chars=4096,
        overlap_chars=0,
    )
    if len(chunks) != 1:
        raise RuntimeError(f"FIXTURE_EXPECTED_SINGLE_CHUNK:{len(chunks)}")
    chunk = asdict(chunks[0])
    evidence_specs = (
        (
            "fact:grounded-evidence",
            "SUPPORTS",
            "Grounded evidence",
            (
                GroundedFactParticipantV1("concept:grounding", "concept", "subject"),
                GroundedFactParticipantV1("concept:lineage", "concept", "object"),
                GroundedFactParticipantV1("source:atlas-fixture", "source_ref", "evidence"),
            ),
        ),
        (
            "fact:role-incidence",
            "PRESERVES",
            "Role-bearing participants",
            (
                GroundedFactParticipantV1("concept:nary", "concept", "subject"),
                GroundedFactParticipantV1("concept:incidence", "concept", "object"),
                GroundedFactParticipantV1("source:atlas-fixture", "source_ref", "evidence"),
            ),
        ),
    )
    proposals = []
    for fact_id, predicate, evidence_text, participants in evidence_specs:
        chunk_bytes = chunks[0].text.encode("utf-8")
        evidence_bytes = evidence_text.encode("utf-8")
        start = chunk_bytes.index(evidence_bytes)
        end = start + len(evidence_bytes)
        fact = build_grounded_fact_bridge_from_external_doc_chunk_v1(
            chunk=chunk,
            workspace_revision=workspace_revision,
            producer_revision=producer_revision,
            fact_id=fact_id,
            predicate=predicate,
            evidence_start_byte_in_chunk=start,
            evidence_end_byte_in_chunk=end,
            evidence_text=evidence_text,
            participants=participants,
            ontology_ids=("ATLAS", "HYPERGRAPH"),
        )
        validate_evidence_slice_v1(normalized_text=normalized, fact=fact)
        proposals.append(build_hypergraph_fact_proposal_v1(fact))

    receipt = build_hypergraph_networkx_fixture_receipt_v1(tuple(proposals))
    replay = build_hypergraph_networkx_fixture_receipt_v1(tuple(reversed(proposals)))
    if receipt != replay:
        raise RuntimeError("NONDETERMINISTIC_PROPOSAL_ORDER_REPLAY")

    report = {
        "schema": "atlas.hypergraph-networkx-incidence-proof-run.v1",
        "status": "FIXTURE_PROVEN",
        "source": {
            "sourceRef": base_url,
            "fixtureKind": "NORMALIZED_EXTERNAL_DOC_CHUNK",
            "sourceRevision": source_revision,
            "workspaceRevision": workspace_revision,
            "producerRevision": producer_revision,
            "normalizedTextChecksum": _sha256(normalized.encode("utf-8")),
            "chunkCount": len(chunks),
            "factCount": len(proposals),
        },
        "receipt": receipt,
        "canonicalAuthority": False,
        "writesPerformed": False,
    }
    scratch = ROOT / ".tmp" / "atlas"
    scratch.mkdir(parents=True, exist_ok=True)
    timestamp = datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%S%fZ")
    output_path = scratch / f"hypergraph-networkx-incidence-proof-v1-{timestamp}.json"
    output_path.write_text(json.dumps(report, sort_keys=True, indent=2) + "\n", encoding="utf-8")

    readback = json.loads(output_path.read_text(encoding="utf-8"))
    checks = {
        "reportReadbackEqual": readback == report,
        "proposalReceiptValid": revalidate_hypergraph_networkx_fixture_receipt_v1(readback["receipt"]),
        "replayChecksumEqual": readback["receipt"]["receiptChecksum"] == replay["receiptChecksum"],
        "graphRevisionUnavailable": readback["receipt"]["graphRevision"] is None
        and readback["receipt"]["graphRevisionAvailable"] is False,
        "noPersistentWrites": readback["writesPerformed"] is False,
    }
    status = "FIXTURE_PROVEN" if all(checks.values()) else "FIXTURE_FAILED"
    print(json.dumps({
        "status": status,
        "receiptChecksum": receipt["receiptChecksum"],
        "projectionChecksum": receipt["projectionChecksum"],
        "relationNodeCount": receipt["relationNodeCount"],
        "participantIncidenceEdgeCount": receipt["participantIncidenceEdgeCount"],
        "entityToEntityEdgeCount": receipt["entityToEntityEdgeCount"],
        "checks": checks,
        "reportPath": str(output_path),
        "canonicalAuthority": False,
        "writesPerformed": False,
    }, sort_keys=True))
    return 0 if status == "FIXTURE_PROVEN" else 1


if __name__ == "__main__":
    raise SystemExit(main())
