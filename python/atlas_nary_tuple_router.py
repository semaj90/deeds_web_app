"""FastAPI router for bounded temporal n-ary ontology inspection.

This is intentionally NOT a durable write plane.  By default all mutation
routes are disabled.  When ATLAS_NARY_EPHEMERAL_MUTATION_ENABLED=true they
mutate only an in-process TemporalNaryIndexV1 for development/proof work.
They never write PostgreSQL, Qdrant, Redis/Valkey, Neo4j, cuGraph, or Graphify.

Canonical inputs remain OntologyLinkedTupleV1 + OntologyFanoutAuthorityV1.
"""

from __future__ import annotations

from datetime import datetime, timezone
import os
from typing import Any, Optional

from fastapi import APIRouter, HTTPException, Query, Request, Response
from pydantic import BaseModel, ConfigDict, Field

from parent_atlas_ontology.json_codec import decode_ndjson_bytes, json_backend_name
from parent_atlas_ontology.models import OntologyLinkedTupleV1
from parent_atlas_ontology.rich_nary import (
    OntologyFanoutAuthorityViewV1,
    ontology_linked_tuple_to_rich_nary_v1,
)
from parent_atlas_ontology.temporal_nary import (
    NaryTemporalLineageV1,
    TemporalNaryIndexV1,
    TemporalRichNaryRecordV1,
    build_temporal_rich_nary_record_v1,
    normalize_datetime,
)


router = APIRouter(prefix="/ontology/nary", tags=["ontology-nary"])
_index = TemporalNaryIndexV1()
_tombstones: dict[str, dict[str, Any]] = {}


def _mutations_enabled() -> bool:
    return os.getenv("ATLAS_NARY_EPHEMERAL_MUTATION_ENABLED", "false").strip().lower() in {"1", "true", "yes"}


def _require_mutations_enabled() -> None:
    if not _mutations_enabled():
        raise HTTPException(
            status_code=403,
            detail={
                "code": "EPHEMERAL_MUTATION_DISABLED",
                "message": "set ATLAS_NARY_EPHEMERAL_MUTATION_ENABLED=true for process-local proof writes",
            },
        )


def _utc_now() -> str:
    return datetime.now(timezone.utc).isoformat().replace("+00:00", "Z")


class NaryRecordInput(BaseModel):
    model_config = ConfigDict(extra="forbid")
    tuple: dict[str, Any]
    authority: dict[str, Any]
    temporal: dict[str, Any]


class NarySupersedeInput(NaryRecordInput):
    supersedesTemporalIndexKey: str = Field(min_length=1)


class NaryTombstoneInput(BaseModel):
    model_config = ConfigDict(extra="forbid")
    reason: str = Field(min_length=1, max_length=512)
    ontologyRevision: str = Field(min_length=1)
    graphRevision: str = Field(min_length=1)
    recordedAt: Optional[str] = None


def _build_record(body: NaryRecordInput) -> TemporalRichNaryRecordV1:
    try:
        tuple_value = OntologyLinkedTupleV1.from_dict(body.tuple)
        authority = OntologyFanoutAuthorityViewV1.from_dict(body.authority)
        relation = ontology_linked_tuple_to_rich_nary_v1(tuple_value, authority, require_graph_revision=True)
        temporal = NaryTemporalLineageV1.from_dict(body.temporal)
        return build_temporal_rich_nary_record_v1(relation, temporal)
    except (KeyError, TypeError, ValueError) as exc:
        raise HTTPException(status_code=422, detail={"code": "NARY_RECORD_INVALID", "message": str(exc)}) from exc


@router.get("/status")
def nary_status() -> dict[str, Any]:
    return {
        "schema": "atlas.nary-sidecar-status.v1",
        "canonicalAuthority": False,
        "durableWrites": False,
        "ephemeralMutationEnabled": _mutations_enabled(),
        "recordCount": _index.size(),
        "tombstoneCount": len(_tombstones),
        "jsonBackend": json_backend_name(),
        "projectionPolicy": "CAPTURE_RICH_ONCE_PROJECT_MANY_WAYS",
    }


@router.post("/records", status_code=201)
def create_nary_record(body: NaryRecordInput) -> dict[str, Any]:
    _require_mutations_enabled()
    record = _index.append(_build_record(body))
    return record.to_dict()


@router.get("/records/{temporal_index_key:path}")
def get_nary_record(temporal_index_key: str) -> dict[str, Any]:
    record = _index.get(temporal_index_key)
    if record is None:
        raise HTTPException(status_code=404, detail={"code": "NARY_RECORD_NOT_FOUND"})
    return {
        "record": record.to_dict(),
        "tombstone": _tombstones.get(temporal_index_key),
    }


@router.get("/records")
def query_nary_records(
    relationId: Optional[str] = Query(default=None),
    sourceRef: Optional[str] = Query(default=None),
    packetKey: Optional[str] = Query(default=None),
    workspaceRevision: Optional[str] = Query(default=None),
    graphRevision: Optional[str] = Query(default=None),
    ontologyRevision: Optional[str] = Query(default=None),
    graphifyExecutionId: Optional[str] = Query(default=None),
    validAt: Optional[str] = Query(default=None),
    recordedAsOf: Optional[str] = Query(default=None),
    includeTombstoned: bool = Query(default=False),
) -> dict[str, Any]:
    try:
        rows = _index.query(
            relation_id=relationId,
            source_ref=sourceRef,
            packet_key=packetKey,
            workspace_revision=workspaceRevision,
            graph_revision=graphRevision,
            ontology_revision=ontologyRevision,
            graphify_execution_id=graphifyExecutionId,
            valid_at=validAt,
            recorded_as_of=recordedAsOf,
        )
    except ValueError as exc:
        raise HTTPException(status_code=422, detail={"code": "TEMPORAL_QUERY_INVALID", "message": str(exc)}) from exc
    if not includeTombstoned:
        rows = tuple(row for row in rows if row.temporalIndexKey not in _tombstones)
    return {
        "schema": "atlas.nary-temporal-query-result.v1",
        "count": len(rows),
        "canonicalAuthority": False,
        "rows": [row.to_dict() for row in rows],
    }


@router.post("/records/{temporal_index_key:path}/supersede", status_code=201)
def supersede_nary_record(temporal_index_key: str, body: NarySupersedeInput) -> dict[str, Any]:
    _require_mutations_enabled()
    if body.supersedesTemporalIndexKey != temporal_index_key:
        raise HTTPException(status_code=409, detail={"code": "SUPERSESSION_KEY_MISMATCH"})
    prior = _index.get(temporal_index_key)
    if prior is None:
        raise HTTPException(status_code=404, detail={"code": "NARY_RECORD_NOT_FOUND"})
    replacement = _build_record(body)
    if replacement.relation.relationId != prior.relation.relationId:
        raise HTTPException(status_code=409, detail={"code": "SUPERSESSION_RELATION_ID_MISMATCH"})
    if replacement.temporal.recordedAt <= prior.temporal.recordedAt:
        raise HTTPException(status_code=409, detail={"code": "SUPERSESSION_RECORDED_AT_NOT_NEWER"})
    appended = _index.append(replacement)
    _tombstones[temporal_index_key] = {
        "schema": "atlas.nary-supersession-marker.v1",
        "status": "SUPERSEDED",
        "supersededByTemporalIndexKey": appended.temporalIndexKey,
        "recordedAt": normalize_datetime(replacement.temporal.recordedAt, "recorded_at"),
        "canonicalAuthority": False,
    }
    return {
        "record": appended.to_dict(),
        "supersedesTemporalIndexKey": temporal_index_key,
    }


@router.delete("/records/{temporal_index_key:path}", status_code=202)
def tombstone_nary_record(temporal_index_key: str, body: NaryTombstoneInput) -> dict[str, Any]:
    _require_mutations_enabled()
    record = _index.get(temporal_index_key)
    if record is None:
        raise HTTPException(status_code=404, detail={"code": "NARY_RECORD_NOT_FOUND"})
    if body.ontologyRevision != record.temporal.ontologyRevision:
        raise HTTPException(status_code=409, detail={"code": "TOMBSTONE_ONTOLOGY_REVISION_MISMATCH"})
    if body.graphRevision != record.temporal.graphRevision:
        raise HTTPException(status_code=409, detail={"code": "TOMBSTONE_GRAPH_REVISION_MISMATCH"})
    recorded_at = normalize_datetime(body.recordedAt or _utc_now(), "recorded_at")
    marker = {
        "schema": "atlas.nary-tombstone.v1",
        "temporalIndexKey": temporal_index_key,
        "relationId": record.relation.relationId,
        "reason": body.reason,
        "ontologyRevision": body.ontologyRevision,
        "graphRevision": body.graphRevision,
        "recordedAt": recorded_at,
        "canonicalAuthority": False,
        "physicalDeletePerformed": False,
    }
    _tombstones[temporal_index_key] = marker
    return marker


@router.post("/ingest/ndjson", status_code=202)
async def ingest_nary_ndjson(request: Request, response: Response) -> dict[str, Any]:
    _require_mutations_enabled()
    raw = await request.body()
    try:
        rows = decode_ndjson_bytes(raw)
    except ValueError as exc:
        raise HTTPException(status_code=422, detail={"code": "NDJSON_INVALID", "message": str(exc)}) from exc

    inserted: list[str] = []
    failures: list[dict[str, Any]] = []
    for index, row in enumerate(rows):
        try:
            body = NaryRecordInput.model_validate(row)
            record = _index.append(_build_record(body))
            inserted.append(record.temporalIndexKey)
        except Exception as exc:  # noqa: BLE001 - batch reports per-row validation failures
            failures.append({"row": index, "error": str(exc)})
    if failures:
        response.status_code = 207
    return {
        "schema": "atlas.nary-ndjson-ingest-receipt.v1",
        "canonicalAuthority": False,
        "durableWrites": False,
        "jsonBackend": json_backend_name(),
        "received": len(rows),
        "accepted": len(inserted),
        "rejected": len(failures),
        "temporalIndexKeys": inserted,
        "failures": failures,
    }
