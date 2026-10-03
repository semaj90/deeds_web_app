"""Integrity helpers for executor-local graph projection artifacts.

GraphOrdinalMapV1 remains owned by the TypeScript graph contract. This module
only reproduces its canonical checksum encoding at the Python executor edge so
loaded graph ordinals can be checked against the upstream manifest.
"""

from __future__ import annotations

import hashlib
import json
import re
from collections.abc import Mapping, Sequence
from typing import Any


_SHA256 = re.compile(r"^[a-f0-9]{64}$")


def graph_ordinal_map_checksum_v1(
    graph_revision: str,
    workspace_revision: str,
    rows: Sequence[Mapping[str, Any]],
) -> str:
    """Return the same digest as TS GraphOrdinalMapV1 for dense ordered rows."""
    if not graph_revision or not workspace_revision:
        raise ValueError("GRAPH_ORDINAL_REVISION_BINDING_REQUIRED")

    normalized: list[dict[str, Any]] = []
    seen_keys: set[str] = set()
    for expected_ordinal, row in enumerate(rows):
        ordinal = row.get("graphOrdinal")
        node_key = row.get("graphNodeKey")
        if isinstance(ordinal, bool) or not isinstance(ordinal, int) or ordinal != expected_ordinal:
            raise ValueError("GRAPH_ORDINAL_SEQUENCE_INVALID")
        if not isinstance(node_key, str) or not node_key:
            raise ValueError("GRAPH_ORDINAL_NODE_KEY_INVALID")
        if node_key in seen_keys:
            raise ValueError("GRAPH_ORDINAL_DUPLICATE_NODE_KEY")
        seen_keys.add(node_key)
        normalized.append({"graphOrdinal": ordinal, "graphNodeKey": node_key})

    payload = {
        "graphRevision": graph_revision,
        "workspaceRevision": workspace_revision,
        "rows": normalized,
    }
    encoded = json.dumps(payload, ensure_ascii=False, separators=(",", ":"))
    return hashlib.sha256(encoded.encode("utf-8")).hexdigest()


def validate_graph_projection_ordinal_checksum_v1(
    manifest: Mapping[str, Any],
    rows: Sequence[Mapping[str, Any]],
) -> str:
    """Validate explicit V1 graph-ordinal checksum; never accept candidate-map aliases."""
    expected = manifest.get("graphOrdinalMapChecksum")
    if not isinstance(expected, str) or not _SHA256.fullmatch(expected):
        raise ValueError("GRAPH_ORDINAL_MAP_CHECKSUM_REQUIRED")
    actual = graph_ordinal_map_checksum_v1(
        str(manifest.get("graphRevision") or ""),
        str(manifest.get("workspaceRevision") or ""),
        rows,
    )
    if actual != expected:
        raise ValueError("GRAPH_ORDINAL_MAP_CHECKSUM_MISMATCH")
    return actual


def graph_ordinal_checksum_from_manifest_v1(manifest: Mapping[str, Any]) -> str | None:
    """Read an explicit graph-map checksum; reject known ambiguous legacy aliases."""
    schema = manifest.get("schema")
    explicit = manifest.get("graphOrdinalMapChecksum")
    if schema == "atlas.graph-projection-artifact.v1":
        if not isinstance(explicit, str) or not _SHA256.fullmatch(explicit):
            raise ValueError("GRAPH_ORDINAL_MAP_CHECKSUM_REQUIRED")
        return explicit
    if (
        schema == "atlas.current-structural-graph-artifact-v1"
        and manifest.get("ordinalMapChecksum")
        and not explicit
    ):
        raise ValueError("GRAPH_ORDINAL_MAP_CHECKSUM_AMBIGUOUS")
    if isinstance(explicit, str) and _SHA256.fullmatch(explicit):
        return explicit
    legacy = manifest.get("ordinalMapChecksum")
    return legacy if isinstance(legacy, str) and _SHA256.fullmatch(legacy) else None


def build_bfs_path_receipt_v1(
    start_node_key: str,
    rows: Sequence[Mapping[str, Any]],
    depth_limit: int,
    *,
    graph_revision: str,
    projection_revision: str,
    graph_ordinal_map_checksum: str,
) -> dict[str, Any]:
    """Reconstruct bounded node-key paths from executor predecessor rows."""
    if not start_node_key:
        raise ValueError("GRAPH_BFS_START_NODE_KEY_REQUIRED")
    if (
        not isinstance(graph_revision, str)
        or not graph_revision
        or not isinstance(projection_revision, str)
        or not projection_revision
        or not isinstance(graph_ordinal_map_checksum, str)
        or not _SHA256.fullmatch(graph_ordinal_map_checksum)
    ):
        raise ValueError("GRAPH_BFS_REVISION_BINDING_REQUIRED")
    if isinstance(depth_limit, bool) or not isinstance(depth_limit, int) or not 0 <= depth_limit <= 4:
        raise ValueError("GRAPH_BFS_DEPTH_LIMIT_INVALID")

    by_ordinal: dict[int, dict[str, Any]] = {}
    for row in rows:
        ordinal = row.get("gpuNodeId")
        distance = row.get("distance")
        node_key = row.get("nodeKey")
        predecessor = row.get("predecessorGpuNodeId")
        if isinstance(ordinal, bool) or not isinstance(ordinal, int) or ordinal < 0:
            raise ValueError("GRAPH_BFS_ORDINAL_INVALID")
        if ordinal in by_ordinal:
            raise ValueError("GRAPH_BFS_DUPLICATE_ORDINAL")
        if isinstance(distance, bool) or not isinstance(distance, int) or not 0 <= distance <= depth_limit:
            raise ValueError("GRAPH_BFS_DISTANCE_INVALID")
        if not isinstance(node_key, str) or not node_key:
            raise ValueError("GRAPH_BFS_NODE_KEY_INVALID")
        if predecessor is not None and (isinstance(predecessor, bool) or not isinstance(predecessor, int)):
            raise ValueError("GRAPH_BFS_PREDECESSOR_INVALID")
        by_ordinal[ordinal] = dict(row)

    roots = [row for row in by_ordinal.values() if row["distance"] == 0]
    if len(roots) != 1 or roots[0]["nodeKey"] != start_node_key or roots[0].get("predecessorGpuNodeId") is not None:
        raise ValueError("GRAPH_BFS_ROOT_ROW_INVALID")

    ordered = sorted(by_ordinal.values(), key=lambda row: (row["distance"], row["gpuNodeId"]))
    path_by_ordinal: dict[int, list[str]] = {roots[0]["gpuNodeId"]: [start_node_key]}
    receipt_paths: list[dict[str, Any]] = []
    for row in ordered:
        ordinal = row["gpuNodeId"]
        distance = row["distance"]
        if distance == 0:
            parent_path = path_by_ordinal[ordinal]
        else:
            predecessor = row.get("predecessorGpuNodeId")
            parent = by_ordinal.get(predecessor)
            if parent is None or parent["distance"] != distance - 1 or predecessor not in path_by_ordinal:
                raise ValueError("GRAPH_BFS_PREDECESSOR_CHAIN_INVALID")
            parent_path = path_by_ordinal[predecessor]
        path = [*parent_path, row["nodeKey"]] if distance else parent_path
        if len(path) - 1 != distance or len(path) > depth_limit + 1:
            raise ValueError("GRAPH_BFS_PATH_DEPTH_INVALID")
        path_by_ordinal[ordinal] = path
        receipt_paths.append({
            "gpuNodeId": ordinal,
            "distance": distance,
            "predecessorGpuNodeId": row.get("predecessorGpuNodeId"),
            "pathGraphNodeKeys": path,
        })

    checksum_payload = {
        "schema": "atlas.graph-bfs-path-receipt.v1",
        "graphRevision": graph_revision,
        "projectionRevision": projection_revision,
        "graphOrdinalMapChecksum": graph_ordinal_map_checksum,
        "startNodeKey": start_node_key,
        "depthLimit": depth_limit,
        "paths": receipt_paths,
    }
    encoded = json.dumps(checksum_payload, ensure_ascii=False, separators=(",", ":"))
    return {
        "schema": "atlas.graph-bfs-path-receipt.v1",
        "graphRevision": graph_revision,
        "projectionRevision": projection_revision,
        "graphOrdinalMapChecksum": graph_ordinal_map_checksum,
        "startNodeKey": start_node_key,
        "depthLimit": depth_limit,
        "pathCount": len(receipt_paths),
        "pathChecksum": hashlib.sha256(encoded.encode("utf-8")).hexdigest(),
        "paths": receipt_paths,
    }
