"""Qdrant v1.20.2 Revision-Consistent Code-Aware Hybrid Retrieval Adapter.

Implements:
  - Quantized hybrid collection schema provisioning (`datatype: "turbo16"` / `"turbo8"`,
    `tokenizer: "code"`, `scoring: {"type": "bm25"}`).
  - Revision-scoped hybrid query planning (`prefetch` dense + BM25 + `fusion: "rrf"`).
  - Authoritative PostgreSQL identity reconciliation & bounded 1-hop graph expansion
    (rejecting duplicate candidate IDs, source-revision drift, and stale graph-edge revisions).
  - Port separation: 6333 REST, 6334 Client gRPC, 6335 Internal P2P gRPC.

Follows Parent Atlas ownership rules:
  - Qdrant is a rebuildable retrieval projection (`canonical_authority = False`).
  - Logical `semantic_768` vector is stored under Qdrant named vector key `"content"`.
  - Qdrant point IDs are never packet identity or CandidateOrdinal.
  - Graph expansion neighbors remain `PROPOSAL_ONLY` until admitted by PostgreSQL.
"""

from __future__ import annotations

import json
import urllib.request
from typing import Any, Mapping, Sequence


VALID_TURBO_DATATYPES = frozenset({"turbo8", "turbo16", "float16", "float32"})


def build_turboquant_code_bm25_collection_spec_v1(
    *,
    collection_name: str,
    vector_size: int = 768,
    datatype: str = "turbo16",
    vector_name: str = "content",
) -> dict[str, Any]:
    """Build Qdrant v1.20.2 collection + code-BM25 payload index specification."""
    if not collection_name.strip():
        raise ValueError("COLLECTION_NAME_REQUIRED")
    if datatype not in VALID_TURBO_DATATYPES:
        raise ValueError(f"UNSUPPORTED_QDRANT_DATATYPE:{datatype}")
    if vector_size <= 0:
        raise ValueError("VECTOR_SIZE_MUST_BE_POSITIVE")

    return {
        "schema": "atlas.qdrant-v120-turbo-spec.v1",
        "collection_name": collection_name,
        "create_collection_body": {
            "vectors": {
                vector_name: {
                    "size": int(vector_size),
                    "distance": "Cosine",
                    "datatype": datatype,
                }
            }
        },
        "payload_indexes": [
            {
                "field_name": "code_text",
                "field_schema": {
                    "type": "text",
                    "tokenizer": "code",
                    "lowercase": True,
                    "scoring": {"type": "bm25"},
                },
            },
            {"field_name": "workspace_revision", "field_schema": "keyword"},
            {"field_name": "domain_id", "field_schema": "keyword"},
            {"field_name": "language", "field_schema": "keyword"},
        ],
        "grpc_notes": {
            "port": 6334,
            "vector_name": vector_name,
            "datatype_enum": datatype.upper(),
            "tokenizer_enum": "CODE",
            "scoring_enum": "BM25",
        },
        "canonical_authority": False,
    }


def build_qdrant_graphrag_hybrid_query_v1(
    *,
    query_vector: Sequence[float],
    code_query_text: str,
    workspace_revision: str,
    vector_name: str = "content",
    domain_id: str | None = None,
    prefetch_limit: int = 20,
    limit: int = 10,
) -> dict[str, Any]:
    """Build a Qdrant 1.20 single-pass hybrid dense + code-BM25 RRF query pinned to workspace_revision."""
    if not workspace_revision.strip():
        raise ValueError("WORKSPACE_REVISION_REQUIRED")
    if not query_vector:
        raise ValueError("QUERY_VECTOR_EMPTY")

    must_filters: list[dict[str, Any]] = [
        {"key": "workspace_revision", "match": {"value": workspace_revision}}
    ]
    if domain_id:
        must_filters.append({"key": "domain_id", "match": {"value": domain_id}})

    return {
        "prefetch": [
            {
                "query": [float(x) for x in query_vector],
                "using": vector_name,
                "filter": {"must": must_filters},
                "limit": int(prefetch_limit),
            },
            {
                "query": {"text": code_query_text},
                "using": "code_text",
                "filter": {"must": must_filters},
                "limit": int(prefetch_limit),
            },
        ],
        "query": {"fusion": "rrf"},
        "limit": int(limit),
        "with_payload": True,
    }


def rejoin_qdrant_hits_with_pg18_v1(
    *,
    qdrant_points: Sequence[Mapping[str, Any]],
    expected_workspace_revision: str,
    pg18_by_candidate_id: Mapping[str, Mapping[str, Any]],
    graphrag_neighbors_by_candidate_id: Mapping[str, Sequence[Mapping[str, Any]]] | None = None,
) -> list[dict[str, Any]]:
    """Reconcile Qdrant hits against authoritative PG18 identity & expand 1-hop neighbors (PROPOSAL_ONLY)."""
    rejoined: list[dict[str, Any]] = []
    seen_candidates: set[str] = set()
    for rank_idx, pt in enumerate(qdrant_points):
        payload = pt.get("payload") or {}
        if payload.get("workspace_revision") != expected_workspace_revision:
            raise ValueError(
                f"QDRANT_WORKSPACE_REVISION_DRIFT:{payload.get('workspace_revision')}!={expected_workspace_revision}"
            )
        candidate_id = str(payload.get("candidate_id") or "").strip()
        if not candidate_id or candidate_id not in pg18_by_candidate_id:
            raise ValueError(f"QDRANT_UNRECOGNIZED_CANDIDATE_ID:{candidate_id}")
        if candidate_id in seen_candidates:
            raise ValueError(f"QDRANT_DUPLICATE_CANDIDATE_ID:{candidate_id}")
        seen_candidates.add(candidate_id)

        pg_row = pg18_by_candidate_id[candidate_id]
        if pg_row.get("source_revision") != payload.get("source_revision"):
            raise ValueError(f"QDRANT_SOURCE_REVISION_MISMATCH:{candidate_id}")

        raw_neighbors = (graphrag_neighbors_by_candidate_id or {}).get(candidate_id, ())
        neighbors: list[Mapping[str, Any]] = []
        for edge in raw_neighbors:
            edge_rev = edge.get("workspace_revision")
            if edge_rev is not None and edge_rev != expected_workspace_revision:
                raise ValueError(f"GRAPH_EDGE_REVISION_DRIFT:{candidate_id}:{edge_rev}")
            neighbors.append(edge)

        rejoined.append(
            {
                "rank": rank_idx + 1,
                "candidate_id": candidate_id,
                "qdrant_score": float(pt.get("score", 0.0)),
                "source_ref": pg_row["source_ref"],
                "source_revision": pg_row["source_revision"],
                "workspace_revision": expected_workspace_revision,
                "graphrag_neighbors": neighbors,
                "admission_state": "PROPOSAL_ONLY",
                "canonical_authority": False,
            }
        )
    return rejoined


def probe_qdrant_v120_turbo_capabilities_v1(base_url: str = "http://127.0.0.1:6333") -> dict[str, Any]:
    """Read-only probe verifying live Qdrant >= 1.20.0."""
    with urllib.request.urlopen(f"{base_url.rstrip('/')}/", timeout=3) as resp:
        info = json.loads(resp.read().decode("utf-8"))
    version = str(info.get("version") or "0.0.0")
    parts = [int(p) for p in version.split(".")[:2]]
    supports_turbo = (parts[0], parts[1]) >= (1, 20)
    return {
        "version": version,
        "supports_turboquant": supports_turbo,
        "supports_code_bm25": supports_turbo,
        "canonical_authority": False,
    }
