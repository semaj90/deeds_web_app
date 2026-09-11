"""Temporal/lineage view for authority-qualified Parent Atlas n-ary relations.

This module is deliberately a DERIVED indexing layer.  It does not create a
new ontology/packet/source owner and it never substitutes timestamps or
revisions.  Callers must provide explicit Graphify execution and temporal
coordinates.

Temporal model:
- occurredAt: optional domain/runtime event time when such a time is real.
- observedAt: when Graphify/extractor observed the fact (required).
- validFrom/validTo: validity interval of the source fact (validTo open-ended).
- recordedAt: when the authoritative observation was recorded (required).

The separate sidecar receive time, if any, is operational telemetry and is not
part of this contract.
"""

from __future__ import annotations

from dataclasses import asdict, dataclass
from datetime import datetime, timezone
from typing import Any, Iterable, Optional

from parent_atlas_ontology.checksum import sha256_hex
from parent_atlas_ontology.rich_nary import (
    RichNaryRelationV1,
    is_authoritative_revision,
)


def parse_aware_datetime(value: str, field_name: str) -> datetime:
    raw = str(value or "").strip()
    if not raw:
        raise ValueError(f"{field_name.upper()}_REQUIRED")
    normalized = raw[:-1] + "+00:00" if raw.endswith("Z") else raw
    try:
        parsed = datetime.fromisoformat(normalized)
    except ValueError as exc:
        raise ValueError(f"{field_name.upper()}_INVALID") from exc
    if parsed.tzinfo is None or parsed.utcoffset() is None:
        raise ValueError(f"{field_name.upper()}_TIMEZONE_REQUIRED")
    return parsed.astimezone(timezone.utc)


def normalize_datetime(value: str, field_name: str) -> str:
    return parse_aware_datetime(value, field_name).isoformat().replace("+00:00", "Z")


@dataclass(frozen=True, slots=True)
class NaryTemporalLineageV1:
    schemaVersion: str
    graphifyExecutionId: str
    sourceRef: str
    sourceRevision: str
    workspaceRevision: str
    graphRevision: str
    ontologyRevision: str
    observedAt: str
    validFrom: str
    recordedAt: str
    occurredAt: Optional[str] = None
    validTo: Optional[str] = None
    sourceSequence: Optional[int] = None

    @staticmethod
    def from_dict(value: dict[str, Any]) -> "NaryTemporalLineageV1":
        return NaryTemporalLineageV1(
            schemaVersion=value["schemaVersion"],
            graphifyExecutionId=value["graphifyExecutionId"],
            sourceRef=value["sourceRef"],
            sourceRevision=value["sourceRevision"],
            workspaceRevision=value["workspaceRevision"],
            graphRevision=value["graphRevision"],
            ontologyRevision=value["ontologyRevision"],
            occurredAt=value.get("occurredAt"),
            observedAt=value["observedAt"],
            validFrom=value["validFrom"],
            validTo=value.get("validTo"),
            recordedAt=value["recordedAt"],
            sourceSequence=value.get("sourceSequence"),
        ).validate()

    def validate(self) -> "NaryTemporalLineageV1":
        if self.schemaVersion != "atlas.nary-temporal-lineage.v1":
            raise ValueError("TEMPORAL_LINEAGE_SCHEMA_INVALID")
        if not str(self.graphifyExecutionId).strip():
            raise ValueError("GRAPHIFY_EXECUTION_ID_REQUIRED")
        if not str(self.sourceRef).strip():
            raise ValueError("SOURCE_REF_REQUIRED")
        for field_name, value in (
            ("source_revision", self.sourceRevision),
            ("workspace_revision", self.workspaceRevision),
            ("graph_revision", self.graphRevision),
            ("ontology_revision", self.ontologyRevision),
        ):
            if not is_authoritative_revision(value):
                raise ValueError(f"{field_name.upper()}_UNPROVEN")

        observed = parse_aware_datetime(self.observedAt, "observed_at")
        valid_from = parse_aware_datetime(self.validFrom, "valid_from")
        recorded = parse_aware_datetime(self.recordedAt, "recorded_at")
        occurred = parse_aware_datetime(self.occurredAt, "occurred_at") if self.occurredAt else None
        valid_to = parse_aware_datetime(self.validTo, "valid_to") if self.validTo else None

        if valid_to is not None and valid_to <= valid_from:
            raise ValueError("VALID_TO_MUST_BE_AFTER_VALID_FROM")
        if recorded < observed:
            raise ValueError("RECORDED_AT_BEFORE_OBSERVED_AT")
        if occurred is not None and observed < occurred:
            # Observation may happen at the same instant or after the event, never before it.
            raise ValueError("OBSERVED_AT_BEFORE_OCCURRED_AT")
        if self.sourceSequence is not None and self.sourceSequence < 0:
            raise ValueError("SOURCE_SEQUENCE_MUST_BE_NONNEGATIVE")
        return self

    def normalized_dict(self) -> dict[str, Any]:
        self.validate()
        return {
            "schemaVersion": self.schemaVersion,
            "graphifyExecutionId": self.graphifyExecutionId,
            "sourceRef": self.sourceRef,
            "sourceRevision": self.sourceRevision,
            "workspaceRevision": self.workspaceRevision,
            "graphRevision": self.graphRevision,
            "ontologyRevision": self.ontologyRevision,
            "occurredAt": normalize_datetime(self.occurredAt, "occurred_at") if self.occurredAt else None,
            "observedAt": normalize_datetime(self.observedAt, "observed_at"),
            "validFrom": normalize_datetime(self.validFrom, "valid_from"),
            "validTo": normalize_datetime(self.validTo, "valid_to") if self.validTo else None,
            "recordedAt": normalize_datetime(self.recordedAt, "recorded_at"),
            "sourceSequence": self.sourceSequence,
        }


@dataclass(frozen=True, slots=True)
class TemporalRichNaryRecordV1:
    schema: str
    relation: RichNaryRelationV1
    temporal: NaryTemporalLineageV1
    temporalIndexKey: str
    canonicalAuthority: bool = False

    def to_dict(self) -> dict[str, Any]:
        return {
            "schema": self.schema,
            "relation": self.relation.to_dict(),
            "temporal": self.temporal.normalized_dict(),
            "temporalIndexKey": self.temporalIndexKey,
            "canonicalAuthority": False,
        }


def build_temporal_rich_nary_record_v1(
    relation: RichNaryRelationV1,
    temporal: NaryTemporalLineageV1,
) -> TemporalRichNaryRecordV1:
    temporal.validate()
    authority = relation.authority
    if temporal.sourceRef != relation.evidence.sourceRef:
        raise ValueError("TEMPORAL_SOURCE_REF_MISMATCH")
    if temporal.sourceRevision != authority.sourceRevision:
        raise ValueError("TEMPORAL_SOURCE_REVISION_MISMATCH")
    if temporal.workspaceRevision != authority.workspaceRevision:
        raise ValueError("TEMPORAL_WORKSPACE_REVISION_MISMATCH")
    if temporal.graphRevision != authority.graphRevision:
        raise ValueError("TEMPORAL_GRAPH_REVISION_MISMATCH")
    if temporal.ontologyRevision != authority.ontologyRevision:
        raise ValueError("TEMPORAL_ONTOLOGY_REVISION_MISMATCH")

    key_payload = {
        "schema": "atlas.temporal-rich-nary-record.v1",
        "relationId": relation.relationId,
        "packetKey": relation.evidence.packetKey,
        "sourceRef": relation.evidence.sourceRef,
        "sourceRevision": authority.sourceRevision,
        "workspaceRevision": authority.workspaceRevision,
        "graphRevision": authority.graphRevision,
        "ontologyRevision": authority.ontologyRevision,
        "graphifyExecutionId": temporal.graphifyExecutionId,
        "occurredAt": temporal.normalized_dict()["occurredAt"],
        "observedAt": temporal.normalized_dict()["observedAt"],
        "validFrom": temporal.normalized_dict()["validFrom"],
        "validTo": temporal.normalized_dict()["validTo"],
        "recordedAt": temporal.normalized_dict()["recordedAt"],
        "sourceSequence": temporal.sourceSequence,
    }
    return TemporalRichNaryRecordV1(
        schema="atlas.temporal-rich-nary-record.v1",
        relation=relation,
        temporal=temporal,
        temporalIndexKey=f"derived:sha256:{sha256_hex(key_payload)}",
        canonicalAuthority=False,
    )


def _is_valid_at(record: TemporalRichNaryRecordV1, valid_at: Optional[str]) -> bool:
    if not valid_at:
        return True
    instant = parse_aware_datetime(valid_at, "valid_at")
    start = parse_aware_datetime(record.temporal.validFrom, "valid_from")
    end = parse_aware_datetime(record.temporal.validTo, "valid_to") if record.temporal.validTo else None
    return start <= instant and (end is None or instant < end)


def _is_recorded_by(record: TemporalRichNaryRecordV1, recorded_as_of: Optional[str]) -> bool:
    if not recorded_as_of:
        return True
    instant = parse_aware_datetime(recorded_as_of, "recorded_as_of")
    recorded = parse_aware_datetime(record.temporal.recordedAt, "recorded_at")
    return recorded <= instant


class TemporalNaryIndexV1:
    """Process-local derived temporal index; no persistence and no authority."""

    def __init__(self) -> None:
        self._by_key: dict[str, TemporalRichNaryRecordV1] = {}
        self._keys_by_relation: dict[str, list[str]] = {}
        self._keys_by_source: dict[str, list[str]] = {}
        self._keys_by_packet: dict[str, list[str]] = {}
        self._keys_by_workspace: dict[str, list[str]] = {}
        self._keys_by_graph: dict[str, list[str]] = {}
        self._keys_by_ontology: dict[str, list[str]] = {}
        self._keys_by_execution: dict[str, list[str]] = {}

    @staticmethod
    def _append_index(index: dict[str, list[str]], value: str, key: str) -> None:
        bucket = index.setdefault(value, [])
        if key not in bucket:
            bucket.append(key)

    def append(self, record: TemporalRichNaryRecordV1) -> TemporalRichNaryRecordV1:
        key = record.temporalIndexKey
        existing = self._by_key.get(key)
        if existing is not None:
            if existing.to_dict() != record.to_dict():
                raise ValueError("TEMPORAL_INDEX_KEY_COLLISION")
            return existing
        self._by_key[key] = record
        self._append_index(self._keys_by_relation, record.relation.relationId, key)
        self._append_index(self._keys_by_source, record.temporal.sourceRef, key)
        self._append_index(self._keys_by_packet, record.relation.evidence.packetKey, key)
        self._append_index(self._keys_by_workspace, record.temporal.workspaceRevision, key)
        self._append_index(self._keys_by_graph, record.temporal.graphRevision, key)
        self._append_index(self._keys_by_ontology, record.temporal.ontologyRevision, key)
        self._append_index(self._keys_by_execution, record.temporal.graphifyExecutionId, key)
        return record

    def get(self, temporal_index_key: str) -> Optional[TemporalRichNaryRecordV1]:
        return self._by_key.get(temporal_index_key)

    def query(
        self,
        *,
        relation_id: Optional[str] = None,
        source_ref: Optional[str] = None,
        packet_key: Optional[str] = None,
        workspace_revision: Optional[str] = None,
        graph_revision: Optional[str] = None,
        ontology_revision: Optional[str] = None,
        graphify_execution_id: Optional[str] = None,
        valid_at: Optional[str] = None,
        recorded_as_of: Optional[str] = None,
    ) -> tuple[TemporalRichNaryRecordV1, ...]:
        candidates: Optional[set[str]] = None
        filters: Iterable[tuple[Optional[str], dict[str, list[str]]]] = (
            (relation_id, self._keys_by_relation),
            (source_ref, self._keys_by_source),
            (packet_key, self._keys_by_packet),
            (workspace_revision, self._keys_by_workspace),
            (graph_revision, self._keys_by_graph),
            (ontology_revision, self._keys_by_ontology),
            (graphify_execution_id, self._keys_by_execution),
        )
        for value, index in filters:
            if value is None:
                continue
            keys = set(index.get(value, ()))
            candidates = keys if candidates is None else candidates.intersection(keys)
        if candidates is None:
            candidates = set(self._by_key.keys())

        rows = [self._by_key[key] for key in candidates]
        rows = [row for row in rows if _is_valid_at(row, valid_at) and _is_recorded_by(row, recorded_as_of)]
        rows.sort(
            key=lambda row: (
                parse_aware_datetime(row.temporal.recordedAt, "recorded_at"),
                row.temporal.sourceSequence if row.temporal.sourceSequence is not None else -1,
                row.temporalIndexKey,
            )
        )
        return tuple(rows)

    def size(self) -> int:
        return len(self._by_key)
