"""Bounded ontology kernel for the Parent Atlas NLP sidecar.

This module deliberately separates two similarly named systems:

* OAK (Ontology Access Kit / ``oaklib``) supplies deterministic ontology
  lookup, search, labels and graph traversal over an explicitly configured
  adapter.
* OaK (Ontology-as-a-Kernel, arXiv:2608.22974) supplies the architectural
  pattern: inference may only access ontology/evidence state through a frozen
  schema and a small typed function registry.

The sidecar does not make ontology assertions canonical and does not mutate
PostgreSQL, RDF, or OAK backends. Parent Atlas identity/revision owners remain
upstream. This is a shadow/read-only grounding boundary.
"""

from __future__ import annotations

import importlib.metadata
import hashlib
import json
import os
from functools import lru_cache
from typing import Any, Literal

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field

try:
    from oaklib import get_adapter
    from oaklib.interfaces import OboGraphInterface

    OAKLIB_AVAILABLE = True
except Exception:  # pragma: no cover - reported by /oak/health
    get_adapter = None  # type: ignore[assignment]
    OboGraphInterface = object  # type: ignore[assignment,misc]
    OAKLIB_AVAILABLE = False

try:
    import psycopg
    from psycopg.rows import dict_row
except Exception:  # pragma: no cover - reported by /oak/health
    psycopg = None  # type: ignore[assignment]
    dict_row = None  # type: ignore[assignment]


OAK_PAPER_ID = "arXiv:2608.22974"
OAK_PAPER_NAME = "Ontology-as-a-Kernel"
OAK_FUNCTIONS = (
    "lookup",
    "search",
    "ancestors",
    "descendants",
)

router = APIRouter(prefix="/oak", tags=["ontology-kernel"])


class OakLookupRequest(BaseModel):
    entity_id: str = Field(min_length=1, max_length=512)
    include_aliases: bool = True


class OakSearchRequest(BaseModel):
    query: str = Field(min_length=1, max_length=512)
    limit: int = Field(default=20, ge=1, le=100)


class OakTraversalRequest(BaseModel):
    entity_id: str = Field(min_length=1, max_length=512)
    direction: Literal["ancestors", "descendants"] = "ancestors"
    predicates: list[str] = Field(default_factory=list, max_length=16)
    limit: int = Field(default=100, ge=1, le=1000)
    max_depth: int = Field(default=2, ge=1, le=4)


def _oaklib_version() -> str | None:
    try:
        return importlib.metadata.version("oaklib")
    except importlib.metadata.PackageNotFoundError:
        return None


def _adapter_locator() -> str | None:
    value = os.getenv("ATLAS_OAK_ADAPTER", "").strip()
    return value or None


def _adapter_type() -> str | None:
    """Return a non-sensitive adapter kind, never the configured locator."""

    explicit = os.getenv("ATLAS_OAK_ADAPTER_TYPE", "").strip()
    if explicit:
        return explicit
    locator = _adapter_locator()
    if locator is None:
        return None
    return locator.split(":", 1)[0].lower() or "configured"


def _is_postgres_locator(locator: str | None) -> bool:
    return bool(locator and locator.lower().startswith(("postgres://", "postgresql://")))


def _adapter_fingerprint() -> str | None:
    locator = _adapter_locator()
    if locator is None:
        return None
    return hashlib.sha256(locator.encode("utf-8")).hexdigest()


@lru_cache(maxsize=1)
def _adapter() -> Any:
    locator = _adapter_locator()
    if locator is None:
        raise HTTPException(status_code=503, detail="ATLAS_OAK_ADAPTER_NOT_CONFIGURED")
    if _is_postgres_locator(locator):
        if psycopg is None or dict_row is None:
            raise HTTPException(status_code=503, detail="PSYCOPG_UNAVAILABLE")
        return AtlasPostgresOntologyAdapter(locator)
    if not OAKLIB_AVAILABLE or get_adapter is None:
        raise HTTPException(status_code=503, detail="OAKLIB_UNAVAILABLE")
    try:
        return get_adapter(locator)
    except Exception as error:
        raise HTTPException(
            status_code=503,
            detail=f"OAK_ADAPTER_LOAD_FAILED:{type(error).__name__}",
        ) from error


class AtlasPostgresOntologyAdapter:
    """Read-only OaK facade over existing Parent Atlas ontology tables."""

    def __init__(self, dsn: str) -> None:
        self.dsn = dsn

    def _query(self, sql: str, params: tuple[Any, ...] = ()) -> list[dict[str, Any]]:
        assert psycopg is not None and dict_row is not None
        try:
            with psycopg.connect(self.dsn, row_factory=dict_row, connect_timeout=5) as connection:
                with connection.cursor() as cursor:
                    cursor.execute("SET TRANSACTION READ ONLY")
                    cursor.execute("SET LOCAL statement_timeout = '5000ms'")
                    cursor.execute(sql, params)
                    return list(cursor.fetchall())
        except Exception as error:
            raise HTTPException(status_code=503, detail=f"OAK_POSTGRES_READ_FAILED:{type(error).__name__}") from error

    def label(self, entity_id: str) -> str | None:
        rows = self._query(
            "SELECT canonical_label FROM atlas_ontology_concepts WHERE concept_id = %s LIMIT 1",
            (entity_id,),
        )
        return rows[0].get("canonical_label") if rows else None

    def entity_aliases(self, entity_id: str) -> list[str]:
        rows = self._query(
            "SELECT aliases FROM atlas_ontology_concepts WHERE concept_id = %s LIMIT 1",
            (entity_id,),
        )
        return list(rows[0].get("aliases") or []) if rows else []

    def basic_search(self, query: str, limit: int) -> list[str]:
        rows = self._query(
            """
            SELECT concept_id
              FROM atlas_ontology_concepts
             WHERE canonical_label ILIKE %s
                OR EXISTS (SELECT 1 FROM unnest(aliases) alias WHERE alias ILIKE %s)
             ORDER BY concept_id
             LIMIT %s
            """,
            (f"%{query}%", f"%{query}%", limit),
        )
        return [str(row["concept_id"]) for row in rows]

    def traverse(self, entity_id: str, direction: str, limit: int, max_depth: int) -> list[dict[str, Any]]:
        next_column = "r.object_concept_id" if direction == "ancestors" else "r.subject_concept_id"
        start_column = "r.subject_concept_id" if direction == "ancestors" else "r.object_concept_id"
        sql = f"""
            WITH RECURSIVE walk(concept_id, depth, path) AS (
                SELECT %s::text, 0, ARRAY[%s::text]
                UNION ALL
                SELECT {next_column}, walk.depth + 1, walk.path || {next_column}
                  FROM walk
                  JOIN atlas_ontology_relations r ON {start_column} = walk.concept_id
                 WHERE walk.depth < %s
                   AND NOT ({next_column} = ANY(walk.path))
            )
            SELECT w.concept_id, w.depth, c.canonical_label
              FROM walk w
              LEFT JOIN atlas_ontology_concepts c ON c.concept_id = w.concept_id
             WHERE w.depth > 0
             ORDER BY w.depth, w.concept_id
             LIMIT %s
        """
        return self._query(sql, (entity_id, entity_id, max_depth, limit))


def _label(adapter: Any, entity_id: str) -> str | None:
    try:
        return adapter.label(entity_id)
    except Exception:
        return None


def _checksum(value: Any) -> str:
    payload = json.dumps(value, sort_keys=True, separators=(",", ":"), ensure_ascii=False)
    return hashlib.sha256(payload.encode("utf-8")).hexdigest()


@router.get("/health")
def oak_health() -> dict[str, Any]:
    return {
        "schema": "atlas.oak.health.v1",
        "available": OAKLIB_AVAILABLE,
        "oaklibVersion": _oaklib_version(),
        "adapterConfigured": _adapter_locator() is not None,
        "adapterType": _adapter_type(),
        "adapterFingerprint": _adapter_fingerprint(),
        "mode": "READ_ONLY_SHADOW",
        "canonicalAuthority": False,
        "paper": {
            "name": OAK_PAPER_NAME,
            "id": OAK_PAPER_ID,
        },
        "frozenFunctions": list(OAK_FUNCTIONS),
    }


@router.get("/kernel")
def oak_kernel() -> dict[str, Any]:
    """Describe the frozen sidecar kernel without touching ontology state."""

    return {
        "schema": "atlas.oak.kernel.v1",
        "kernelRevision": "oak-kernel-v1",
        "schemaPolicy": "EXPLICIT_ADAPTER_READ_ONLY",
        "functions": list(OAK_FUNCTIONS),
        "mutationsAllowed": False,
        "llmOntologyWritesAllowed": False,
        "canonicalAuthority": False,
    }


@router.post("/lookup")
def oak_lookup(request: OakLookupRequest) -> dict[str, Any]:
    adapter = _adapter()
    aliases: list[str] = []
    if request.include_aliases:
        try:
            aliases = list(adapter.entity_aliases(request.entity_id) or [])[:100]
        except Exception:
            aliases = []
    response = {
        "schema": "atlas.oak.lookup.v1",
        "entityId": request.entity_id,
        "label": _label(adapter, request.entity_id),
        "aliases": aliases,
        "canonicalAuthority": False,
    }
    return {**response, "inputChecksum": _checksum(request.model_dump()), "outputChecksum": _checksum(response)}


@router.post("/search")
def oak_search(request: OakSearchRequest) -> dict[str, Any]:
    adapter = _adapter()
    try:
        raw = adapter.basic_search(request.query, request.limit) if isinstance(adapter, AtlasPostgresOntologyAdapter) else adapter.basic_search(request.query)
        ids = list(raw or [])[: request.limit]
    except Exception as error:
        raise HTTPException(
            status_code=422,
            detail=f"OAK_SEARCH_UNSUPPORTED:{type(error).__name__}",
        ) from error
    response = {
        "schema": "atlas.oak.search.v1",
        "query": request.query,
        "matches": [
            {"entityId": entity_id, "label": _label(adapter, entity_id)}
            for entity_id in ids
        ],
        "canonicalAuthority": False,
    }
    return {**response, "inputChecksum": _checksum(request.model_dump()), "outputChecksum": _checksum(response)}


@router.post("/traverse")
def oak_traverse(request: OakTraversalRequest) -> dict[str, Any]:
    adapter = _adapter()
    if isinstance(adapter, AtlasPostgresOntologyAdapter):
        rows = adapter.traverse(request.entity_id, request.direction, request.limit, request.max_depth)
        nodes = [{"entityId": str(row["concept_id"]), "label": row.get("canonical_label"), "depth": int(row["depth"])} for row in rows]
    elif isinstance(adapter, OboGraphInterface):
        kwargs: dict[str, Any] = {}
        if request.predicates:
            kwargs["predicates"] = request.predicates
        try:
            traversal = (
                adapter.ancestors(request.entity_id, **kwargs)
                if request.direction == "ancestors"
                else adapter.descendants(request.entity_id, **kwargs)
            )
            ids = list(traversal or [])[: request.limit]
        except Exception as error:
            raise HTTPException(
                status_code=422,
                detail=f"OAK_TRAVERSAL_FAILED:{type(error).__name__}",
            ) from error
        nodes = [{"entityId": entity_id, "label": _label(adapter, entity_id)} for entity_id in ids]
    else:
        raise HTTPException(status_code=422, detail="OAK_GRAPH_INTERFACE_UNSUPPORTED")
    response = {
        "schema": "atlas.oak.traversal.v1",
        "entityId": request.entity_id,
        "direction": request.direction,
        "predicates": request.predicates,
        "maxDepth": request.max_depth,
        "nodes": nodes,
        "canonicalAuthority": False,
    }
    return {**response, "inputChecksum": _checksum(request.model_dump()), "outputChecksum": _checksum(response)}
