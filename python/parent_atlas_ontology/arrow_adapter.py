"""ONTO-PY-03: OntologyLinkedTupleV1 <-> Arrow IPC.

Per the operator's design: Arrow is the Python<->Go/GPU hot-path
transport (mmap/IPC, nested struct/list columns), RDFLib (ONTO-PY-02,
not built this pass - see tasks.md) is for OWL/SHACL/n10s interop. Two
different jobs, two different serializations of the same semantic
payload - this file owns neither identity nor execution provenance,
only the columnar projection.

`participants` is a `list<struct<entityId, entityKind, role, label>>`
column, matching the operator's explicit preference over four separate
parallel list columns (participant_ids/roles/types as independent
lists) - a single nested list<struct> keeps one participant's fields
atomic instead of relying on positional alignment across four arrays,
which is exactly the "position silently becomes semantics" risk this
whole adapter package is designed to avoid.
"""

from __future__ import annotations

import io
from typing import Sequence

import pyarrow as pa

from parent_atlas_ontology.models import (
    OntologyLinkedTupleEvidenceSpanV1,
    OntologyLinkedTupleProvenanceV1,
    OntologyLinkedTupleV1,
    OntologyParticipantV1,
)

_PARTICIPANT_STRUCT = pa.struct([
    pa.field("entityId", pa.string()),
    pa.field("entityKind", pa.string()),
    pa.field("role", pa.string()),
    pa.field("label", pa.string()),
])

_EVIDENCE_SPAN_STRUCT = pa.struct([
    pa.field("sourceRef", pa.string()),
    pa.field("start", pa.int64()),
    pa.field("end", pa.int64()),
])

_PROVENANCE_STRUCT = pa.struct([
    pa.field("sourceTables", pa.list_(pa.string())),
    pa.field("labelerVersion", pa.string()),
    pa.field("taggerVersion", pa.string()),
    pa.field("ontologyVersion", pa.string()),
    pa.field("nlpVersion", pa.string()),
    pa.field("sourceRevision", pa.string()),
    pa.field("representationId", pa.string()),
    pa.field("representationRevision", pa.string()),
    pa.field("producerId", pa.string()),
    pa.field("producerRevision", pa.string()),
    pa.field("featureRevision", pa.string()),
    pa.field("graphRevision", pa.string()),
    pa.field("ontologyRevision", pa.string()),
    pa.field("modelRevision", pa.string()),
    pa.field("inputDigest", pa.string()),
    pa.field("outputDigest", pa.string()),
    pa.field("generatedAt", pa.string()),
    pa.field("lastVerifiedAt", pa.string()),
])

ONTOLOGY_LINKED_TUPLE_ARROW_SCHEMA = pa.schema([
    pa.field("tupleId", pa.string(), nullable=False),
    pa.field("schemaVersion", pa.string(), nullable=False),
    pa.field("packetKey", pa.string()),
    pa.field("sourceRef", pa.string(), nullable=False),
    pa.field("treeNodeId", pa.string()),
    pa.field("documentId", pa.string()),
    pa.field("titleId", pa.string()),
    pa.field("surfaceText", pa.string(), nullable=False),
    pa.field("tokenIndex", pa.int64()),
    pa.field("partOfSpeech", pa.string()),
    pa.field("label", pa.string(), nullable=False),
    pa.field("labelKind", pa.string(), nullable=False),
    pa.field("labelSource", pa.string(), nullable=False),
    pa.field("ontologyIds", pa.list_(pa.string()), nullable=False),
    pa.field("conceptIds", pa.list_(pa.string()), nullable=False),
    pa.field("participants", pa.list_(_PARTICIPANT_STRUCT), nullable=False),
    pa.field("evidenceRefs", pa.list_(pa.string()), nullable=False),
    pa.field("relationRevision", pa.string()),
    pa.field("evidenceSpan", _EVIDENCE_SPAN_STRUCT),
    pa.field("confidence", pa.float64(), nullable=False),
    pa.field("evidenceState", pa.string(), nullable=False),
    pa.field("lifecycle", pa.string(), nullable=False),
    pa.field("provenance", _PROVENANCE_STRUCT, nullable=False),
])


def to_arrow_table(tuples: Sequence[OntologyLinkedTupleV1]) -> pa.Table:
    rows = []
    for t in tuples:
        d = t.to_dict()
        rows.append(d)
    return pa.Table.from_pylist(rows, schema=ONTOLOGY_LINKED_TUPLE_ARROW_SCHEMA)


def from_arrow_table(table: pa.Table) -> list[OntologyLinkedTupleV1]:
    result: list[OntologyLinkedTupleV1] = []
    for row in table.to_pylist():
        result.append(_tuple_from_row(row))
    return result


def _tuple_from_row(row: dict) -> OntologyLinkedTupleV1:
    provenance_row = row["provenance"]
    provenance = OntologyLinkedTupleProvenanceV1(
        sourceTables=tuple(provenance_row["sourceTables"] or []),
        labelerVersion=provenance_row["labelerVersion"],
        taggerVersion=provenance_row["taggerVersion"],
        ontologyVersion=provenance_row["ontologyVersion"],
        nlpVersion=provenance_row["nlpVersion"],
        sourceRevision=provenance_row["sourceRevision"],
        representationId=provenance_row["representationId"],
        representationRevision=provenance_row["representationRevision"],
        producerId=provenance_row["producerId"],
        producerRevision=provenance_row["producerRevision"],
        featureRevision=provenance_row["featureRevision"],
        graphRevision=provenance_row["graphRevision"],
        ontologyRevision=provenance_row["ontologyRevision"],
        modelRevision=provenance_row["modelRevision"],
        inputDigest=provenance_row["inputDigest"],
        outputDigest=provenance_row["outputDigest"],
        generatedAt=provenance_row["generatedAt"],
        lastVerifiedAt=provenance_row["lastVerifiedAt"],
    )
    evidence_span_row = row["evidenceSpan"]
    evidence_span = (
        OntologyLinkedTupleEvidenceSpanV1(
            sourceRef=evidence_span_row["sourceRef"], start=evidence_span_row["start"], end=evidence_span_row["end"]
        )
        if evidence_span_row is not None
        else None
    )
    participants = tuple(
        OntologyParticipantV1(entityId=p["entityId"], entityKind=p["entityKind"], role=p["role"], label=p["label"])
        for p in (row["participants"] or [])
    )
    return OntologyLinkedTupleV1(
        tupleId=row["tupleId"],
        schemaVersion=row["schemaVersion"],
        sourceRef=row["sourceRef"],
        surfaceText=row["surfaceText"],
        label=row["label"],
        labelKind=row["labelKind"],
        labelSource=row["labelSource"],
        confidence=row["confidence"],
        evidenceState=row["evidenceState"],
        provenance=provenance,
        ontologyIds=tuple(row["ontologyIds"] or []),
        conceptIds=tuple(row["conceptIds"] or []),
        participants=participants,
        evidenceRefs=tuple(row["evidenceRefs"] or []),
        lifecycle=row["lifecycle"],
        packetKey=row["packetKey"],
        treeNodeId=row["treeNodeId"],
        documentId=row["documentId"],
        titleId=row["titleId"],
        tokenIndex=row["tokenIndex"],
        partOfSpeech=row["partOfSpeech"],
        relationRevision=row["relationRevision"],
        evidenceSpan=evidence_span,
    )


def table_to_ipc_bytes(table: pa.Table) -> bytes:
    sink = io.BytesIO()
    with pa.ipc.new_stream(sink, table.schema) as writer:
        writer.write_table(table)
    return sink.getvalue()


def ipc_bytes_to_table(data: bytes) -> pa.Table:
    with pa.ipc.open_stream(io.BytesIO(data)) as reader:
        return reader.read_all()
