"""Read-only PostgreSQL evidence bridge for the Parent Atlas OaK sidecar.

This module exposes the already-existing ``atlas_ontology_linked_tuples``
truth layer to the bounded OaK sidecar. It deliberately does not implement an
OAK storage adapter and does not create/mutate ontology state.

Authority boundaries:
* PostgreSQL remains the durable fact/evidence owner.
* OAK/OaK remains a read-only execution facade.
* Missing revision fields are returned as missing; they are never synthesized.
"""

from __future__ import annotations

import os
from typing import Any

import psycopg
from fastapi import APIRouter, HTTPException
from psycopg.rows import dict_row
from pydantic import BaseModel, Field, model_validator

router = APIRouter(prefix="/oak/evidence", tags=["ontology-kernel-evidence"])

_DSN_ENV = "ATLAS_OAK_POSTGRES_DSN"
_STATEMENT_TIMEOUT_MS = 3_000
_MAX_LIMIT = 100


class LinkedTupleEvidenceRequest(BaseModel):
    packet_key: str | None = Field(default=None, min_length=1, max_length=512)
    source_ref: str | None = Field(default=None, min_length=1, max_length=2048)
    ontology_id: str | None = Field(default=None, min_length=1, max_length=512)
    concept_id: str | None = Field(default=None, min_length=1, max_length=512)
    relation_revision: str | None = Field(default=None, min_length=1, max_length=512)
    limit: int = Field(default=20, ge=1, le=_MAX_LIMIT)

    @model_validator(mode="after")
    def exactly_one_selector(self) -> "LinkedTupleEvidenceRequest":
        selectors = (
            self.packet_key,
            self.source_ref,
            self.ontology_id,
            self.concept_id,
        )
        if sum(value is not None for value in selectors) != 1:
            raise ValueError(
                "exactly one of packet_key, source_ref, ontology_id, concept_id is required"
            )
        return self


def _dsn() -> str | None:
    value = os.getenv(_DSN_ENV, "").strip()
    return value or None


def _query_for(request: LinkedTupleEvidenceRequest) -> tuple[str, list[Any]]:
    """Return a fixed-shape, parameterized query for the selected lookup lane."""

    if request.packet_key is not None:
        predicate = "packet_key = %s"
        params: list[Any] = [request.packet_key]
    elif request.source_ref is not None:
        predicate = "source_ref = %s"
        params = [request.source_ref]
    elif request.ontology_id is not None:
        predicate = "%s = ANY(ontology_ids)"
        params = [request.ontology_id]
    elif request.concept_id is not None:
        predicate = "%s = ANY(concept_ids)"
        params = [request.concept_id]
    else:  # model validation should make this unreachable
        raise ValueError("LINKED_TUPLE_SELECTOR_MISSING")

    if request.relation_revision is not None:
        predicate += " AND relation_revision = %s"
        params.append(request.relation_revision)

    # Ordering by the durable tuple key gives deterministic output independent
    # of heap/index scan order. SUPERSEDED rows are excluded from live evidence.
    # Fetch one extra row so the response can distinguish an exact-size result
    # from a result that was actually truncated by the request bound.
    sql = f"""
        SELECT
          tuple_id,
          schema_version,
          packet_key,
          source_ref,
          tree_node_id,
          document_id,
          title_id,
          surface_text,
          token_index,
          part_of_speech,
          label,
          label_kind,
          label_source,
          ontology_ids,
          concept_ids,
          participants,
          evidence_refs,
          relation_revision,
          evidence_span,
          confidence,
          evidence_state,
          lifecycle,
          provenance,
          producer_revision
        FROM atlas_ontology_linked_tuples
        WHERE {predicate}
          AND lifecycle <> 'SUPERSEDED'
        ORDER BY tuple_id
        LIMIT %s
    """
    params.append(request.limit + 1)
    return sql, params


@router.get("/health")
def postgres_evidence_health() -> dict[str, Any]:
    """Configuration-only health; never opens a database connection."""

    return {
        "schema": "atlas.oak.postgres-evidence-health.v1",
        "backend": "postgresql",
        "table": "atlas_ontology_linked_tuples",
        "configured": _dsn() is not None,
        "dsnExposed": False,
        "mode": "READ_ONLY_SHADOW",
        "canonicalAuthority": False,
    }


@router.post("/linked-tuples")
async def linked_tuple_evidence(request: LinkedTupleEvidenceRequest) -> dict[str, Any]:
    dsn = _dsn()
    if dsn is None:
        raise HTTPException(status_code=503, detail="ATLAS_OAK_POSTGRES_DSN_NOT_CONFIGURED")

    sql, params = _query_for(request)
    try:
        async with await psycopg.AsyncConnection.connect(
            dsn,
            connect_timeout=3,
            row_factory=dict_row,
        ) as conn:
            async with conn.transaction():
                # Server-enforced safety: even an accidental future DML statement
                # in this transaction is rejected by PostgreSQL.
                await conn.execute("SET TRANSACTION READ ONLY")
                await conn.execute(
                    f"SET LOCAL statement_timeout = '{_STATEMENT_TIMEOUT_MS}ms'"
                )
                async with conn.cursor() as cur:
                    await cur.execute(sql, params)
                    fetched_rows = await cur.fetchall()
    except psycopg.Error as error:
        raise HTTPException(
            status_code=503,
            detail=f"OAK_POSTGRES_EVIDENCE_QUERY_FAILED:{error.__class__.__name__}",
        ) from error

    truncated = len(fetched_rows) > request.limit
    rows = fetched_rows[: request.limit]
    requested_revision = request.relation_revision
    observed_revisions = sorted(
        {
            str(row["relation_revision"])
            for row in rows
            if row.get("relation_revision") is not None
        }
    )
    revision_qualified = bool(rows) and all(
        row.get("relation_revision") is not None for row in rows
    )

    return {
        "schema": "atlas.oak.linked-tuple-evidence.v1",
        "mode": "READ_ONLY_SHADOW",
        "selector": {
            "packetKey": request.packet_key,
            "sourceRef": request.source_ref,
            "ontologyId": request.ontology_id,
            "conceptId": request.concept_id,
        },
        "requestedRelationRevision": requested_revision,
        "observedRelationRevisions": observed_revisions,
        "revisionQualified": revision_qualified,
        "count": len(rows),
        "truncated": truncated,
        "tuples": rows,
        "canonicalAuthority": False,
        "writesPerformed": False,
    }
