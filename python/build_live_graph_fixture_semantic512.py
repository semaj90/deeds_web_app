#!/usr/bin/env python3
"""Build a revision-qualified Parent Atlas live graph fixture from proven semantic_512 rows.

Inputs:
- reviewed semantic_512 reconciliation manifest + receipt;
- exact Qdrant point vectors, re-read and digest-verified through the existing trainer helpers;
- canonical PostgreSQL relationship headers/members for admitted packet keys.

Output:
- 500..5000 dense local ordinals;
- canonical relationship edges represented only as a bounded pairwise compute view with relationship IDs retained;
- exact cuVS brute-force semantic top-K edges marked derived_similarity=true;
- no invented source_revision and no canonical relationship promotion.
"""

from __future__ import annotations

import argparse
from collections import defaultdict
from hashlib import sha256
import json
import math
import os
from pathlib import Path
from typing import Any

import numpy as np
import psycopg2
from psycopg2.extras import RealDictCursor

from atlas_semantic512_autoencoder_train import (
    COLLECTION,
    REPRESENTATION_ID,
    SEMANTIC_DIM,
    load_reconciliation,
    retrieve_vectors,
)

DEFAULT_DATABASE_URL = "postgresql://legal_admin:123456@127.0.0.1:5434/legal_ai_db"
DEFAULT_QDRANT_URL = "http://127.0.0.1:6333"


def stable_bytes(value: Any) -> bytes:
    return json.dumps(value, sort_keys=True, separators=(",", ":"), ensure_ascii=False).encode("utf-8")


def checksum(value: Any) -> str:
    return sha256(stable_bytes(value)).hexdigest()


def edge_family(relationship_type: str) -> str:
    value = relationship_type.lower()
    if "call" in value:
        return "AST_CALL"
    if "import" in value or "require" in value:
        return "AST_IMPORT"
    if "reference" in value or "refers" in value:
        return "AST_REFERENCE"
    if "ontology" in value or "type_of" in value or "implements" in value:
        return "ONTOLOGY_ROLE"
    if "workflow" in value or "depends" in value:
        return "WORKFLOW_DEPENDENCY"
    return "NARY_INCIDENCE"


def fetch_relationship_rows(database_url: str, packet_keys: list[str]) -> list[dict[str, Any]]:
    with psycopg2.connect(database_url) as conn:
        conn.set_session(readonly=True, autocommit=False, isolation_level="REPEATABLE READ")
        with conn.cursor(cursor_factory=RealDictCursor) as cur:
            cur.execute("SELECT pg_current_snapshot()::text AS snapshot")
            snapshot = str(cur.fetchone()["snapshot"])
            cur.execute(
                """
                SELECT
                  r.relationship_id,
                  r.relationship_type,
                  r.relationship_revision,
                  r.source_ref,
                  r.source_revision,
                  r.confidence,
                  m.member_ordinal,
                  m.role,
                  m.entity_type,
                  m.entity_id,
                  m.entity_revision
                FROM atlas_relationship_members m
                JOIN atlas_relationships r USING (relationship_id)
                WHERE m.entity_id = ANY(%s::text[])
                ORDER BY r.relationship_id, m.member_ordinal
                """,
                (packet_keys,),
            )
            rows = [dict(row) for row in cur.fetchall()]
            for row in rows:
                row["postgres_snapshot"] = snapshot
            conn.rollback()
            return rows


def relationship_edges(rows: list[dict[str, Any]], ordinal_by_packet: dict[str, int]) -> list[dict[str, Any]]:
    grouped: dict[str, dict[str, Any]] = {}
    for row in rows:
        relationship_id = str(row["relationship_id"])
        group = grouped.setdefault(
            relationship_id,
            {
                "relationship_id": relationship_id,
                "relationship_type": str(row["relationship_type"]),
                "relationship_revision": str(row["relationship_revision"]),
                "confidence": float(row["confidence"]),
                "members": [],
                "postgres_snapshot": str(row["postgres_snapshot"]),
            },
        )
        ordinal = ordinal_by_packet.get(str(row["entity_id"]))
        if ordinal is not None:
            group["members"].append(ordinal)

    edges: list[dict[str, Any]] = []
    for group in grouped.values():
        members = sorted(set(int(value) for value in group["members"]))
        if len(members) < 2:
            continue
        pair_count = len(members) * (len(members) - 1) // 2
        relation_mass = max(0.0, min(1.0, group["confidence"]))
        pair_weight = relation_mass / pair_count
        for left_index in range(len(members)):
            for right_index in range(left_index + 1, len(members)):
                edges.append(
                    {
                        "src": members[left_index],
                        "dst": members[right_index],
                        "weight": pair_weight,
                        "family": edge_family(group["relationship_type"]),
                        "canonical_fact": True,
                        "derived_similarity": False,
                        "relationship_id": group["relationship_id"],
                        "relationship_revision": group["relationship_revision"],
                        "pairwise_compute_view": True,
                    }
                )
    return edges


def exact_semantic_edges(matrix: np.ndarray, *, k: int, family_weight: float) -> list[dict[str, Any]]:
    if matrix.ndim != 2 or matrix.shape[1] != SEMANTIC_DIM:
        raise ValueError(f"expected semantic_{SEMANTIC_DIM} matrix")
    if not 1 <= k <= min(128, matrix.shape[0] - 1):
        raise ValueError("semantic top-k outside bounded range")

    import cupy as cp
    from cuvs.neighbors import all_neighbors

    device = cp.asarray(matrix.astype(np.float32, copy=False))
    params = all_neighbors.AllNeighborsParams(algo="brute_force", n_clusters=1, metric="cosine")
    indices, _distances, _core = all_neighbors.build(device, k + 1, params)
    neighbors = cp.asnumpy(indices)

    by_pair: dict[tuple[int, int], dict[str, Any]] = {}
    for src in range(matrix.shape[0]):
        emitted = 0
        for raw_dst in neighbors[src]:
            dst = int(raw_dst)
            if dst == src:
                continue
            left, right = (src, dst) if src < dst else (dst, src)
            cosine = float(np.dot(matrix[src], matrix[dst]))
            weight = family_weight * max(0.0, min(1.0, (cosine + 1.0) / 2.0))
            candidate = {
                "src": left,
                "dst": right,
                "weight": weight,
                "family": "SEMANTIC_KNN",
                "canonical_fact": False,
                "derived_similarity": True,
                "semantic_similarity": cosine,
                "semantic_representation": REPRESENTATION_ID,
                "semantic_dimension": SEMANTIC_DIM,
                "semantic_executor": "CUVS_ALL_NEIGHBORS_BRUTE_FORCE",
            }
            prior = by_pair.get((left, right))
            if prior is None or candidate["weight"] > prior["weight"]:
                by_pair[(left, right)] = candidate
            emitted += 1
            if emitted >= k:
                break
    return sorted(by_pair.values(), key=lambda edge: (edge["src"], edge["dst"]))


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--reconciliation-manifest", required=True)
    parser.add_argument("--reconciliation-receipt", required=True)
    parser.add_argument("--database-url", default=os.getenv("DATABASE_URL", DEFAULT_DATABASE_URL))
    parser.add_argument("--qdrant-url", default=os.getenv("QDRANT_URL", DEFAULT_QDRANT_URL))
    parser.add_argument("--workflow-id", required=True)
    parser.add_argument("--workflow-revision", type=int, default=1)
    parser.add_argument("--source-snapshot-revision", required=True)
    parser.add_argument("--graph-revision", required=True)
    parser.add_argument("--feature-revision", required=True)
    parser.add_argument("--limit", type=int, default=1000)
    parser.add_argument("--clusters", type=int, default=20)
    parser.add_argument("--semantic-top-k", type=int, default=16)
    parser.add_argument("--semantic-edge-weight", type=float, default=0.20)
    parser.add_argument("--seed", type=int, default=0xA71A5)
    parser.add_argument("--output", default=".tmp/atlas/live-graph/live-graph.json")
    parser.add_argument(
        "--include-proto-service-packets",
        action="store_true",
        default=False,
        help=(
            "Include proto:<Service>.<Method> gRPC/Protobuf service-definition packets in "
            "candidate selection. Default is to exclude them: a live 500-candidate run found "
            "they form a structurally distinct corpus (2 disconnected graph components, "
            "verified via scipy connected_components) from regular codebase packets, "
            "unrelated to codebase-semantic-cluster structure. See "
            "docs/reports/spectral-rtx-alignment-sweep-20260823.md."
        ),
    )
    args = parser.parse_args()

    limit = max(500, min(5000, int(args.limit)))
    identities, reconciliation_receipt = load_reconciliation(
        Path(args.reconciliation_manifest).resolve(),
        Path(args.reconciliation_receipt).resolve(),
        None,
    )
    excluded_proto_service_packet_count = 0
    if not args.include_proto_service_packets:
        before = len(identities)
        identities = [row for row in identities if not row.source_ref.startswith("proto:")]
        excluded_proto_service_packet_count = before - len(identities)
    identities = sorted(identities, key=lambda row: (row.packet_key, str(row.point_id)))[:limit]
    if len(identities) < 500:
        raise ValueError(f"LIVE_GRAPH_REQUIRES_500_ADMITTED_SEMANTIC512_ROWS:{len(identities)}")
    matrix = retrieve_vectors(args.qdrant_url, identities)
    if matrix.shape != (len(identities), SEMANTIC_DIM):
        raise ValueError("LIVE_GRAPH_SEMANTIC512_MATRIX_SHAPE_MISMATCH")

    vertices = [
        {
            "ordinal": ordinal,
            "candidate_id": identity.packet_key,
            "packet_key": identity.packet_key,
            "source_ref": identity.source_ref,
            "source_version_receipt_id": identity.source_version_receipt_id,
            "reconciliation_receipt_id": identity.reconciliation_receipt_id,
            "tree_node_id": identity.tree_node_id,
            "feature_label": identity.feature_label,
            "workspace_revision": identity.workspace_revision,
            "representation_revision": identity.representation_revision,
            "semantic_representation": REPRESENTATION_ID,
            "semantic_dimension": SEMANTIC_DIM,
            "semantic_vector_digest": identity.vector_digest,
            "semantic_512": matrix[ordinal].astype(np.float32).tolist(),
        }
        for ordinal, identity in enumerate(identities)
    ]
    packet_keys = [identity.packet_key for identity in identities]
    ordinal_by_packet = {packet_key: ordinal for ordinal, packet_key in enumerate(packet_keys)}
    canonical_relationship_rows = fetch_relationship_rows(args.database_url, packet_keys)
    canonical_edges = relationship_edges(canonical_relationship_rows, ordinal_by_packet)
    if not canonical_edges:
        raise ValueError("LIVE_GRAPH_NO_CANONICAL_RELATIONSHIP_EDGES_FOR_ADMITTED_SEMANTIC512_ROWS")
    semantic_edges = exact_semantic_edges(
        matrix,
        k=int(args.semantic_top_k),
        family_weight=float(args.semantic_edge_weight),
    )

    row_identity_checksum = checksum(
        [
            {
                "ordinal": vertex["ordinal"],
                "packet_key": vertex["packet_key"],
                "source_ref": vertex["source_ref"],
                "source_version_receipt_id": vertex["source_version_receipt_id"],
                "reconciliation_receipt_id": vertex["reconciliation_receipt_id"],
                "semantic_vector_digest": vertex["semantic_vector_digest"],
            }
            for vertex in vertices
        ]
    )
    postgres_snapshots = sorted({str(row["postgres_snapshot"]) for row in canonical_relationship_rows})
    fixture = {
        "schema": "atlas.live-graph-fixture.v1",
        "workflow_id": args.workflow_id,
        "workflow_revision": int(args.workflow_revision),
        "source_snapshot_revision": args.source_snapshot_revision,
        "graph_revision": args.graph_revision,
        "feature_revision": args.feature_revision,
        "row_identity_checksum": row_identity_checksum,
        "random_seed": int(args.seed),
        "num_clusters": max(2, min(int(args.clusters), len(vertices))),
        "semantic_representation": REPRESENTATION_ID,
        "semantic_dimension": SEMANTIC_DIM,
        "semantic_collection": COLLECTION,
        "semantic_top_k": int(args.semantic_top_k),
        "semantic_edge_weight": float(args.semantic_edge_weight),
        "semantic_knn_executor": "CUVS_ALL_NEIGHBORS_BRUTE_FORCE",
        "reconciliation_receipt_id": reconciliation_receipt["receiptId"],
        "reconciliation_manifest_checksum": reconciliation_receipt["manifestChecksum"],
        "proto_service_packets_included": bool(args.include_proto_service_packets),
        "proto_service_packets_excluded_count": excluded_proto_service_packet_count,
        "postgres_snapshots": postgres_snapshots,
        "vertices": vertices,
        "edges": canonical_edges + semantic_edges,
        "edge_counts": {
            "canonical_pairwise_compute_view": len(canonical_edges),
            "semantic_knn_derived": len(semantic_edges),
        },
        "evaluation_cases": [],
        "canonical_relationships_remain_external": True,
        "source_revision_fabricated": False,
        "canonical_authority": False,
        "fixture_builder_revision": "atlas.live-graph.semantic512.v1",
    }
    fixture["fixture_checksum"] = checksum(fixture)

    output = Path(args.output).resolve()
    output.parent.mkdir(parents=True, exist_ok=True)
    output.write_text(json.dumps(fixture, indent=2, sort_keys=True) + "\n", encoding="utf-8")
    print(
        json.dumps(
            {
                "output": str(output),
                "vertex_count": len(vertices),
                "canonical_edge_count": len(canonical_edges),
                "semantic_edge_count": len(semantic_edges),
                "semantic_representation": REPRESENTATION_ID,
                "semantic_dimension": SEMANTIC_DIM,
                "row_identity_checksum": row_identity_checksum,
                "fixture_checksum": fixture["fixture_checksum"],
            },
            indent=2,
        )
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
