#!/usr/bin/env python3
"""Deterministic NetworkX Louvain challenger over CommunityProjectionV1.

This is NOT a Leiden parity oracle. It consumes the exact already-normalized
undirected weighted projection and produces a deterministic Louvain challenger
receipt plus modularity. A future cuGraph Leiden receipt may be compared against
this as a community-structure challenger, but algorithm identity remains distinct.
"""

from __future__ import annotations

import argparse
import hashlib
import json
import math
from pathlib import Path
from typing import Any, Iterable

try:
    import networkx as nx
except ImportError as exc:  # pragma: no cover - environment dependent
    nx = None  # type: ignore[assignment]
    _IMPORT_ERROR: str | None = f"{type(exc).__name__}: {exc}"
else:
    _IMPORT_ERROR = None

_SCHEMA = "atlas.networkx-community-challenger-receipt.v1"
_ALGORITHM_REVISION = "atlas.networkx-louvain-community-challenger.v1"


def _stable(value: Any) -> Any:
    if isinstance(value, dict):
        return {key: _stable(value[key]) for key in sorted(value)}
    if isinstance(value, list):
        return [_stable(item) for item in value]
    return value


def checksum(value: Any) -> str:
    payload = json.dumps(_stable(value), separators=(",", ":"), ensure_ascii=False)
    return hashlib.sha256(payload.encode("utf-8")).hexdigest()


def canonicalize_communities(communities: Iterable[Iterable[int]]) -> list[list[int]]:
    canonical = [sorted(int(node) for node in community) for community in communities]
    canonical.sort(key=lambda members: (members[0] if members else -1, len(members), members))
    return canonical


def build_partition_rows(communities: Iterable[Iterable[int]]) -> list[dict[str, int]]:
    rows: list[dict[str, int]] = []
    for community_id, members in enumerate(canonicalize_communities(communities)):
        for node_id in members:
            rows.append({"gpuNodeId": node_id, "communityId": community_id})
    rows.sort(key=lambda row: row["gpuNodeId"])
    return rows


def validate_projection(payload: dict[str, Any]) -> None:
    if payload.get("schema") != "atlas.undirected-community-projection.v1":
        raise ValueError("COMMUNITY_PROJECTION_SCHEMA_REJECTED")
    if payload.get("identityAuthority") is not False:
        raise ValueError("COMMUNITY_PROJECTION_MUST_NOT_BE_IDENTITY_AUTHORITY")
    if payload.get("communityIdsAssigned") is not False:
        raise ValueError("COMMUNITY_PROJECTION_ALREADY_ASSIGNED_COMMUNITY_IDS")
    if payload.get("canonicalWritesAttempted") is not False:
        raise ValueError("COMMUNITY_PROJECTION_CANONICAL_WRITE_FLAG_REJECTED")

    vertex_ids = payload.get("vertexIds")
    if not isinstance(vertex_ids, list) or any(not isinstance(node_id, int) or node_id < 0 for node_id in vertex_ids):
        raise ValueError("COMMUNITY_PROJECTION_VERTEX_IDS_INVALID")
    if len(set(vertex_ids)) != len(vertex_ids):
        raise ValueError("COMMUNITY_PROJECTION_DUPLICATE_VERTEX_ID")

    vertex_set = set(vertex_ids)
    for edge in payload.get("edges", []):
        u = edge.get("uGpuNodeId")
        v = edge.get("vGpuNodeId")
        weight = edge.get("weight")
        if not isinstance(u, int) or not isinstance(v, int) or u < 0 or v < 0 or u >= v:
            raise ValueError("COMMUNITY_PROJECTION_UNDIRECTED_EDGE_INVALID")
        if u not in vertex_set or v not in vertex_set:
            raise ValueError("COMMUNITY_PROJECTION_EDGE_ENDPOINT_NOT_IN_VERTEX_SET")
        if not isinstance(weight, (int, float)) or not math.isfinite(float(weight)) or float(weight) <= 0:
            raise ValueError("COMMUNITY_PROJECTION_EDGE_WEIGHT_INVALID")


def run(
    payload: dict[str, Any],
    *,
    resolution: float = 1.0,
    threshold: float = 1e-7,
    max_level: int = 100,
    seed: int = 42,
) -> dict[str, Any]:
    if nx is None:
        raise RuntimeError(_IMPORT_ERROR or "networkx unavailable")
    validate_projection(payload)
    if not math.isfinite(resolution) or resolution <= 0:
        raise ValueError("COMMUNITY_ORACLE_RESOLUTION_INVALID")
    if not math.isfinite(threshold) or threshold < 0:
        raise ValueError("COMMUNITY_ORACLE_THRESHOLD_INVALID")
    if max_level < 1:
        raise ValueError("COMMUNITY_ORACLE_MAX_LEVEL_INVALID")

    graph = nx.Graph()
    graph.add_nodes_from(payload["vertexIds"])
    for edge in payload.get("edges", []):
        graph.add_edge(edge["uGpuNodeId"], edge["vGpuNodeId"], weight=float(edge["weight"]))

    if graph.number_of_nodes() == 0:
        communities: list[set[int]] = []
        modularity = None
    elif graph.number_of_edges() == 0:
        communities = [{int(node)} for node in graph.nodes()]
        modularity = None
    else:
        communities = list(
            nx.community.louvain_communities(
                graph,
                weight="weight",
                resolution=float(resolution),
                threshold=float(threshold),
                max_level=int(max_level),
                seed=int(seed),
            )
        )
        modularity = float(
            nx.community.modularity(
                graph,
                communities,
                weight="weight",
                resolution=float(resolution),
            )
        )

    partition_rows = build_partition_rows(communities)
    partition_checksum = checksum(partition_rows)
    receipt_without_checksum = {
        "schema": _SCHEMA,
        "backend": "networkx.louvain_communities",
        "algorithmRevision": _ALGORITHM_REVISION,
        "sourceGraphRevision": payload["sourceGraphRevision"],
        "sourceProjectionRevision": payload["sourceProjectionRevision"],
        "sourceNodeTableHash": payload["sourceNodeTableHash"],
        "sourceEdgeTableHash": payload["sourceEdgeTableHash"],
        "communityProjectionRevision": payload["projectionRevision"],
        "communityProjectionChecksum": payload["projectionChecksum"],
        "policyRevision": payload["policyRevision"],
        "policyChecksum": payload["policyChecksum"],
        "resolution": float(resolution),
        "threshold": float(threshold),
        "maxLevel": int(max_level),
        "seed": int(seed),
        "nodeCount": graph.number_of_nodes(),
        "edgeCount": graph.number_of_edges(),
        "communityCount": len(communities),
        "modularity": modularity,
        "partitionChecksum": partition_checksum,
        "partitions": partition_rows,
        "identityAuthority": False,
        "rankingVoteProduced": False,
        "canonicalWritesAttempted": False,
        "algorithmParityClaimed": False,
        "challengerRole": "CPU_COMMUNITY_STRUCTURE_CHALLENGER",
    }
    return {**receipt_without_checksum, "receiptChecksum": checksum(receipt_without_checksum)}


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--input", type=Path, required=True)
    parser.add_argument("--output", type=Path, required=True)
    parser.add_argument("--resolution", type=float, default=1.0)
    parser.add_argument("--threshold", type=float, default=1e-7)
    parser.add_argument("--max-level", type=int, default=100)
    parser.add_argument("--seed", type=int, default=42)
    args = parser.parse_args()

    if not args.input.is_file():
        raise SystemExit(f"input projection not found: {args.input}")
    payload = json.loads(args.input.read_text(encoding="utf-8"))
    receipt = run(
        payload,
        resolution=args.resolution,
        threshold=args.threshold,
        max_level=args.max_level,
        seed=args.seed,
    )
    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text(json.dumps(receipt, indent=2, sort_keys=True) + "\n", encoding="utf-8")
    print(json.dumps({
        "status": "EXECUTED",
        "output": str(args.output),
        "receiptChecksum": receipt["receiptChecksum"],
        "partitionChecksum": receipt["partitionChecksum"],
        "communityCount": receipt["communityCount"],
        "modularity": receipt["modularity"],
    }, sort_keys=True))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
