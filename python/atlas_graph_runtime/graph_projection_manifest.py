"""Integrity helpers for executor-local graph projection artifacts.

GraphOrdinalMapV1 remains owned by the TypeScript graph contract. This module
only reproduces its canonical checksum encoding at the Python executor edge so
loaded graph ordinals can be checked against the upstream manifest.
"""

from __future__ import annotations

import hashlib
import json
import re
import math
from dataclasses import dataclass
from collections.abc import Mapping, Sequence
from typing import Any

from .contracts import TypedGraphEdge


_SHA256 = re.compile(r"^[a-f0-9]{64}$")


@dataclass(frozen=True)
class VerifiedGraphProjectionSnapshotV1:
    graph_revision: str
    workspace_revision: str
    graph_ordinal_map_checksum: str
    node_ordinals: tuple[int, ...]
    edges: tuple[TypedGraphEdge, ...]
    node_checksum: str
    edge_checksum: str


def validate_graph_projection_artifact_v1(
    manifest: Mapping[str, Any],
    node_rows: Sequence[Mapping[str, Any]],
    edge_rows: Sequence[Mapping[str, Any]],
) -> VerifiedGraphProjectionSnapshotV1:
    if manifest.get("schema") != "atlas.graph-projection-artifact.v1":
        raise ValueError("GRAPH_PROJECTION_SCHEMA_INVALID")
    if manifest.get("canonicalAuthority") is not False or manifest.get("writesPerformed") is not False:
        raise ValueError("GRAPH_PROJECTION_AUTHORITY_FLAGS_INVALID")
    if manifest.get("mode") != "NON_PRODUCTION_DERIVED_ARTIFACT":
        raise ValueError("GRAPH_PROJECTION_MODE_INVALID")
    workspace_revision = manifest.get("workspaceRevision")
    graph_revision = manifest.get("graphRevision")
    if not isinstance(workspace_revision, str) or not workspace_revision or not isinstance(graph_revision, str):
        raise ValueError("GRAPH_PROJECTION_REVISION_REQUIRED")
    if not _SHA256.fullmatch(graph_revision.removeprefix("sha256:")) or not graph_revision.startswith("sha256:"):
        raise ValueError("GRAPH_PROJECTION_GRAPH_REVISION_INVALID")
    node_count = manifest.get("nodeCount")
    edge_count = manifest.get("edgeCount")
    if (isinstance(node_count, bool) or not isinstance(node_count, int)
            or isinstance(edge_count, bool) or not isinstance(edge_count, int)
            or len(node_rows) != node_count or len(edge_rows) != edge_count):
        raise ValueError("GRAPH_PROJECTION_ROW_COUNT_MISMATCH")

    normalized_nodes: list[dict[str, Any]] = []
    seen_keys: set[str] = set()
    for expected_ordinal, row in enumerate(node_rows):
        ordinal = row.get("gpu_node_id")
        node_key = row.get("graph_node_key")
        if isinstance(ordinal, bool) or not isinstance(ordinal, int) or ordinal != expected_ordinal:
            raise ValueError("GRAPH_PROJECTION_NODE_ORDINAL_INVALID")
        if not isinstance(node_key, str) or not node_key or node_key in seen_keys:
            raise ValueError("GRAPH_PROJECTION_NODE_KEY_INVALID")
        if any(row.get(field) is not None and not isinstance(row.get(field), str)
               for field in ("packet_key", "source_ref", "source_revision", "workspace_revision")):
            raise ValueError("GRAPH_PROJECTION_NODE_FIELD_INVALID")
        seen_keys.add(node_key)
        node_workspace = row.get("workspace_revision")
        if node_workspace is not None and node_workspace != workspace_revision:
            raise ValueError("GRAPH_PROJECTION_NODE_WORKSPACE_MISMATCH")
        normalized_nodes.append({
            "gpu_node_id": ordinal,
            "graph_node_key": node_key,
            "packet_key": row.get("packet_key"),
            "source_ref": row.get("source_ref"),
            "source_revision": row.get("source_revision"),
            "workspace_revision": node_workspace,
        })

    normalized_edges: list[dict[str, Any]] = []
    endpoint_pairs: set[tuple[int, int]] = set()
    for row in edge_rows:
        source = row.get("src_gpu_node_id")
        target = row.get("dst_gpu_node_id")
        edge_type = row.get("edge_type")
        weight = row.get("weight")
        if (isinstance(source, bool) or not isinstance(source, int) or source < 0
                or isinstance(target, bool) or not isinstance(target, int) or target < 0
                or source >= len(normalized_nodes) or target >= len(normalized_nodes)):
            raise ValueError("GRAPH_PROJECTION_EDGE_ENDPOINT_INVALID")
        if not isinstance(edge_type, str) or not edge_type.strip():
            raise ValueError("GRAPH_PROJECTION_EDGE_TYPE_INVALID")
        if isinstance(weight, bool) or not isinstance(weight, (int, float)) or not math.isfinite(float(weight)) or weight < 0:
            raise ValueError("GRAPH_PROJECTION_EDGE_WEIGHT_INVALID")
        pair = (source, target)
        if pair in endpoint_pairs:
            raise ValueError("GRAPH_PROJECTION_PARALLEL_EDGE_UNSUPPORTED")
        endpoint_pairs.add(pair)
        normalized_edges.append({
            "src_gpu_node_id": source,
            "dst_gpu_node_id": target,
            "edge_type": edge_type,
            "weight": float(weight),
        })
    normalized_edges.sort(key=lambda row: (row["src_gpu_node_id"], row["dst_gpu_node_id"], row["edge_type"]))

    node_text = "\n".join(
        f"{row['gpu_node_id']}|{row['graph_node_key']}|{row['packet_key'] or ''}|{row['source_ref'] or ''}|{row['source_revision'] or ''}|{row['workspace_revision'] or ''}"
        for row in normalized_nodes
    )
    edge_text = "\n".join(
        f"{row['src_gpu_node_id']}|{row['dst_gpu_node_id']}|{row['edge_type']}|{row['weight']}"
        for row in normalized_edges
    )
    node_checksum = f"sha256:{hashlib.sha256(node_text.encode('utf-8')).hexdigest()}"
    edge_checksum = f"sha256:{hashlib.sha256(edge_text.encode('utf-8')).hexdigest()}"
    if manifest.get("nodeChecksum") != node_checksum or manifest.get("nodeTableHash") != node_checksum:
        raise ValueError("GRAPH_PROJECTION_NODE_CHECKSUM_MISMATCH")
    if manifest.get("edgeChecksum") != edge_checksum or manifest.get("edgeTableHash") != edge_checksum:
        raise ValueError("GRAPH_PROJECTION_EDGE_CHECKSUM_MISMATCH")
    expected_graph_revision = f"sha256:{hashlib.sha256(f'{workspace_revision}|{node_checksum}|{edge_checksum}'.encode('utf-8')).hexdigest()}"
    if graph_revision != expected_graph_revision:
        raise ValueError("GRAPH_PROJECTION_GRAPH_REVISION_MISMATCH")
    expected_projection_revision = f"sha256:{hashlib.sha256(f'{graph_revision}|projection-v1'.encode('utf-8')).hexdigest()}"
    if manifest.get("projectionRevision") != expected_projection_revision:
        raise ValueError("GRAPH_PROJECTION_PROJECTION_REVISION_MISMATCH")
    ordinal_rows = [
        {"graphOrdinal": row["gpu_node_id"], "graphNodeKey": row["graph_node_key"]}
        for row in normalized_nodes
    ]
    validate_graph_projection_ordinal_checksum_v1(manifest, ordinal_rows)
    graph_map_checksum = str(manifest["graphOrdinalMapChecksum"])
    return VerifiedGraphProjectionSnapshotV1(
        graph_revision=graph_revision,
        workspace_revision=workspace_revision,
        graph_ordinal_map_checksum=graph_map_checksum,
        node_ordinals=tuple(row["gpu_node_id"] for row in normalized_nodes),
        edges=tuple(
            TypedGraphEdge(
                src_ordinal=row["src_gpu_node_id"],
                dst_ordinal=row["dst_gpu_node_id"],
                kind=row["edge_type"],
                weight=row["weight"],
            )
            for row in normalized_edges
        ),
        node_checksum=node_checksum,
        edge_checksum=edge_checksum,
    )


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
