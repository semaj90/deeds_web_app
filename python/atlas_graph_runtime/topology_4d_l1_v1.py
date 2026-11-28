"""Bounded L1 (Manhattan) KNN over 4D atlas_topology_index coordinates.

Operates on the derived 4D coordinates (x_cosine, y_graph, z_som, w_authority)
stored in PG18 `atlas_topology_index`. Read-only, challenger-only, and never
creates identity or adds an independent RRF vote.
"""
from __future__ import annotations

import os
from typing import Any, Sequence

import numpy as np

MAX_TOPOLOGY_L1_K = 50


def topology_4d_l1_knn(
    query_coords: Sequence[float] | np.ndarray,
    corpus_coords: np.ndarray,
    packet_keys: Sequence[str],
    top_k: int = 10,
) -> dict[str, Any]:
    """Compute bounded L1 nearest neighbors over 4D topology coordinates."""
    if top_k < 1 or top_k > MAX_TOPOLOGY_L1_K:
        raise ValueError(f"top_k must be between 1 and {MAX_TOPOLOGY_L1_K}, got {top_k}")
    q = np.asarray(query_coords, dtype=np.float32)
    m = np.asarray(corpus_coords, dtype=np.float32)
    if q.shape != (4,):
        raise ValueError(f"query_coords must have shape (4,), got {q.shape}")
    if m.ndim != 2 or m.shape[1] != 4:
        raise ValueError(f"corpus_coords must have shape (N, 4), got {m.shape}")
    if len(packet_keys) != m.shape[0]:
        raise ValueError("packet_keys length must match corpus_coords rows")
    if not np.isfinite(q).all() or not np.isfinite(m).all():
        raise ValueError("NON_FINITE_4D_TOPOLOGY_INPUT")

    if m.shape[0] == 0:
        return {
            "schema": "atlas.topology-4d-l1.v1",
            "metric": "manhattan_l1_4d",
            "canonical_authority": False,
            "writes_performed": False,
            "hits": [],
        }

    dists = np.sum(np.abs(m - q[None, :]), axis=1)
    k = min(top_k, m.shape[0])
    order = sorted(range(m.shape[0]), key=lambda idx: (float(dists[idx]), str(packet_keys[idx])))[:k]
    hits = [
        {
            "packet_key": str(packet_keys[idx]),
            "l1_distance_4d": round(float(dists[idx]), 6),
            "l1_similarity_4d": round(float(1.0 / (1.0 + dists[idx])), 6),
            "rank": rank + 1,
        }
        for rank, idx in enumerate(order)
    ]
    return {
        "schema": "atlas.topology-4d-l1.v1",
        "metric": "manhattan_l1_4d",
        "canonical_authority": False,
        "writes_performed": False,
        "hits": hits,
    }


def fetch_topology_4d_l1_neighbors(
    query_coords: Sequence[float],
    *,
    top_k: int = 10,
    candidate_limit: int = 2000,
    dsn: str | None = None,
) -> dict[str, Any]:
    """Read-only PG18 L1 query over bounded atlas_topology_index rows."""
    import psycopg

    if top_k < 1 or top_k > MAX_TOPOLOGY_L1_K:
        raise ValueError(f"top_k must be between 1 and {MAX_TOPOLOGY_L1_K}, got {top_k}")
    if candidate_limit < 1 or candidate_limit > 10000:
        raise ValueError(f"candidate_limit must be between 1 and 10000, got {candidate_limit}")
    q = np.asarray(query_coords, dtype=np.float32)
    if q.shape != (4,) or not np.isfinite(q).all():
        raise ValueError("query_coords must be 4 finite floats")

    db_url = dsn or os.environ.get("DATABASE_URL")
    if not db_url:
        raise RuntimeError("DATABASE_URL environment variable or explicit dsn is required")

    sql = """
        SELECT packet_key,
               x_cosine::float4,
               y_graph::float4,
               z_som::float4,
               w_authority::float4,
               (ABS(x_cosine - %s) + ABS(y_graph - %s) + ABS(z_som - %s) + ABS(w_authority - %s)) AS l1_dist
        FROM (
            SELECT packet_key, x_cosine, y_graph, z_som, w_authority
            FROM atlas_topology_index
            WHERE x_cosine IS NOT NULL
              AND y_graph IS NOT NULL
              AND z_som IS NOT NULL
              AND w_authority IS NOT NULL
            ORDER BY packet_key
            LIMIT %s
        ) sub
        ORDER BY l1_dist ASC, packet_key ASC
        LIMIT %s
    """
    params = [float(q[0]), float(q[1]), float(q[2]), float(q[3]), int(candidate_limit), int(top_k)]
    with psycopg.connect(db_url, options="-c default_transaction_read_only=on") as conn:
        with conn.cursor() as cur:
            cur.execute(sql, params)
            rows = cur.fetchall()

    hits = [
        {
            "packet_key": str(r[0]),
            "coords_4d": [float(r[1]), float(r[2]), float(r[3]), float(r[4])],
            "l1_distance_4d": round(float(r[5]), 6),
            "l1_similarity_4d": round(float(1.0 / (1.0 + float(r[5]))), 6),
            "rank": idx + 1,
        }
        for idx, r in enumerate(rows)
    ]
    return {
        "schema": "atlas.topology-4d-l1.v1",
        "metric": "manhattan_l1_4d",
        "canonical_authority": False,
        "writes_performed": False,
        "transaction_read_only": True,
        "hit_count": len(hits),
        "hits": hits,
    }
