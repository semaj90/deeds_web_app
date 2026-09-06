"""Bounded, read-only projection of a large Parent Atlas graph snapshot.

This is an interchange/projection coordinator, not a new identity owner.  It
streams the top-level ``nodes`` and ``edges`` arrays from the existing JSON
snapshot, retains only revision/identity metadata, and emits NDJSON plus a
checksum-sealed manifest.  NetworkX is the CPU graph oracle.  Semantic
embeddings, KMeans, SOM, OAKlib admission, and datastore writes are explicit
follow-on stages and are never inferred from graph metadata.

The input snapshot is intentionally allowed to be stale only with
``--allow-stale``.  A stale bounded projection remains diagnostic evidence and
is never labelled current or canonical.
"""

from __future__ import annotations

import argparse
from collections import Counter
from datetime import datetime, timezone
import hashlib
import json
from pathlib import Path
import re
from typing import Any, Iterator


SCHEMA = "atlas.unified-snapshot-projection.v1"
DEFAULT_MAX_AGE_HOURS = 24.0


def _canonical_json(value: Any) -> bytes:
    return json.dumps(value, sort_keys=True, separators=(",", ":"), ensure_ascii=False).encode("utf-8")


def _checksum(value: Any) -> str:
    return "sha256:" + hashlib.sha256(_canonical_json(value)).hexdigest()


def _read_more(handle, buffer: str, chunk_chars: int) -> tuple[str, bool]:
    piece = handle.read(chunk_chars)
    return buffer + piece, piece == ""


def resolve_decoder_backend(requested: str) -> str:
    if requested not in {"auto", "stdlib", "simdjson"}:
        raise ValueError(f"DECODER_UNSUPPORTED:{requested}")
    if requested == "stdlib":
        return "stdlib"
    try:
        import simdjson  # noqa: F401
    except ImportError:
        if requested == "simdjson":
            raise RuntimeError("SIMDJSON_NOT_INSTALLED:install pysimdjson to use --decoder=simdjson")
        return "stdlib"
    return "simdjson"


def _complete_json_value_end(buffer: str) -> int | None:
    """Return the end offset of one object/array, or None if incomplete."""
    if not buffer or buffer[0] not in "[{":
        return None
    stack = ["]" if buffer[0] == "[" else "}"]
    in_string = False
    escaped = False
    for index in range(1, len(buffer)):
        char = buffer[index]
        if in_string:
            if escaped:
                escaped = False
            elif char == "\\":
                escaped = True
            elif char == '"':
                in_string = False
            continue
        if char == '"':
            in_string = True
        elif char in "[{":
            stack.append("]" if char == "[" else "}")
        elif char in "]}":
            if not stack or char != stack.pop():
                raise ValueError("SNAPSHOT_JSON_NESTING_INVALID")
            if not stack:
                return index + 1
    return None


def iter_json_array(
    path: Path,
    array_name: str,
    *,
    chunk_chars: int = 1024 * 1024,
    decoder_backend: str = "auto",
) -> Iterator[Any]:
    """Yield values from one top-level JSON array without loading the document.

    The snapshot is a large object whose arrays are plain JSON. Each member is
    decoded with either optional SIMDJSON or the standard-library fallback;
    only the current member and a bounded read buffer are resident.
    """

    key_pattern = re.compile(rf'"{re.escape(array_name)}"\s*:')
    decoder = json.JSONDecoder()
    resolved_decoder = resolve_decoder_backend(decoder_backend)
    simd_parser = None
    if resolved_decoder == "simdjson":
        import simdjson

        simd_parser = simdjson.Parser()
    with path.open("r", encoding="utf-8") as handle:
        buffer = ""
        eof = False
        marker_found = False
        array_started = False

        while not marker_found:
            match = key_pattern.search(buffer)
            if match:
                buffer = buffer[match.end() :]
                marker_found = True
                break
            buffer, eof = _read_more(handle, buffer[-128:], chunk_chars)
            if eof:
                raise ValueError(f"SNAPSHOT_ARRAY_NOT_FOUND:{array_name}")

        while not array_started:
            buffer = buffer.lstrip()
            if not buffer:
                if eof:
                    raise ValueError(f"SNAPSHOT_ARRAY_OPEN_NOT_FOUND:{array_name}")
                buffer, eof = _read_more(handle, buffer, chunk_chars)
                continue
            if buffer[0] != "[":
                buffer = buffer[1:]
                continue
            buffer = buffer[1:]
            array_started = True

        while True:
            buffer = buffer.lstrip()
            if not buffer:
                if eof:
                    raise ValueError(f"SNAPSHOT_ARRAY_UNTERMINATED:{array_name}")
                buffer, eof = _read_more(handle, buffer, chunk_chars)
                continue
            if buffer[0] == "]":
                return
            if buffer[0] == ",":
                buffer = buffer[1:]
                continue

            while True:
                if resolved_decoder == "simdjson":
                    end = _complete_json_value_end(buffer)
                    if end is not None:
                        try:
                            value = simd_parser.parse(buffer[:end], recursive=True)
                            break
                        except Exception as error:
                            raise ValueError(f"SNAPSHOT_ARRAY_MEMBER_INVALID:{array_name}") from error
                else:
                    try:
                        value, end = decoder.raw_decode(buffer)
                        break
                    except json.JSONDecodeError:
                        pass
                if eof:
                    raise ValueError(f"SNAPSHOT_ARRAY_MEMBER_INVALID:{array_name}")
                buffer, eof = _read_more(handle, buffer, chunk_chars)
            yield value
            buffer = buffer[end:]


def _first(value: dict[str, Any], *keys: str) -> Any:
    for key in keys:
        candidate = value.get(key)
        if candidate not in (None, ""):
            return candidate
    return None


def _properties(node: dict[str, Any]) -> dict[str, Any]:
    value = node.get("properties")
    return value if isinstance(value, dict) else {}


def _node_record(node: Any) -> dict[str, Any] | None:
    if not isinstance(node, dict):
        return None
    props = _properties(node)
    node_key = _first(node, "nodeKey", "node_key") or _first(props, "nodeKey", "node_key")
    if not node_key:
        node_key = _first(node, "packetKey", "packet_key", "sourceRef", "source_ref")
    if not node_key:
        return None
    vectors = props.get("vectors") if isinstance(props.get("vectors"), dict) else {}
    topology = props.get("topology") if isinstance(props.get("topology"), dict) else {}
    semantic_dim = _first(vectors, "vector_dim", "vectorDim")
    return {
        "nodeKey": str(node_key),
        "nodeType": str(_first(node, "nodeType", "node_type") or _first(props, "nodeType", "node_type") or "unknown"),
        "packetKey": _first(node, "packetKey", "packet_key") or _first(props, "packetKey", "packet_key"),
        "sourceRef": _first(node, "sourceRef", "source_ref") or _first(props, "sourceRef", "source_ref"),
        "sourceRevision": _first(node, "sourceRevision", "source_revision") or _first(props, "sourceRevision", "source_revision"),
        "workspaceRevision": _first(node, "workspaceRevision", "workspace_revision") or _first(props, "workspaceRevision", "workspace_revision"),
        "treeNodeId": _first(node, "treeNodeId", "tree_node_id") or _first(props, "treeNodeId", "tree_node_id") or topology.get("tree_node_id"),
        "featureId": _first(props, "featureId", "feature_id"),
        "domainClass": _first(props, "domainClass", "domain_class"),
        "conceptIds": list(props.get("conceptIds") or props.get("concept_ids") or []),
        "ontologyIds": list(props.get("ontologyIds") or props.get("ontology_ids") or []),
        "vectorDim": int(semantic_dim) if str(semantic_dim).isdigit() else None,
        "qdrantPointId": _first(vectors, "qdrant_point_id", "qdrantPointId"),
        "existingTopology": {
            key: topology[key]
            for key in ("som_x", "som_y", "pagerank", "centroid_id", "som_cluster", "community_id")
            if topology.get(key) is not None
        },
    }


def _edge_record(edge: Any) -> dict[str, Any] | None:
    if not isinstance(edge, dict):
        return None
    source = _first(edge, "sourceNodeKey", "source_node_key", "source", "from", "src")
    target = _first(edge, "targetNodeKey", "target_node_key", "target", "to", "dst")
    if not source or not target:
        return None
    return {
        "sourceNodeKey": str(source),
        "targetNodeKey": str(target),
        "edgeType": str(_first(edge, "edgeType", "edge_type", "type", "relationshipType") or "UNKNOWN"),
        "weight": float(_first(edge, "weight") or 1.0),
    }


def _snapshot_age_hours(path: Path) -> float:
    modified = datetime.fromtimestamp(path.stat().st_mtime, tz=timezone.utc)
    return max(0.0, (datetime.now(timezone.utc) - modified).total_seconds() / 3600.0)


def _snapshot_id(path: Path) -> str | None:
    with path.open("r", encoding="utf-8") as handle:
        prefix = handle.read(128 * 1024)
    match = re.search(r'"snapshotId"\s*:\s*"([^"]+)"', prefix)
    return match.group(1) if match else None


def _file_sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for block in iter(lambda: handle.read(8 * 1024 * 1024), b""):
            digest.update(block)
    return "sha256:" + digest.hexdigest()


def _write_ndjson(path: Path, rows: Iterator[dict[str, Any]]) -> tuple[int, str]:
    digest = hashlib.sha256()
    count = 0
    with path.open("w", encoding="utf-8", newline="\n") as handle:
        for row in rows:
            line = (_canonical_json(row) + b"\n")
            handle.buffer.write(line)
            digest.update(line)
            count += 1
    return count, "sha256:" + digest.hexdigest()


def project_snapshot(
    snapshot_path: Path,
    output_dir: Path,
    *,
    max_nodes: int = 0,
    max_edges: int = 0,
    allow_stale: bool = False,
    max_age_hours: float = DEFAULT_MAX_AGE_HOURS,
    run_pagerank: bool = False,
    decoder_backend: str = "auto",
    hash_input: bool = False,
) -> dict[str, Any]:
    if not snapshot_path.is_file():
        raise FileNotFoundError(snapshot_path)
    if max_nodes < 0 or max_edges < 0:
        raise ValueError("max_nodes and max_edges must be >= 0")

    age_hours = _snapshot_age_hours(snapshot_path)
    stale = age_hours > max_age_hours
    if stale and not allow_stale:
        raise ValueError("SNAPSHOT_STALE_USE_ALLOW_STALE_FOR_DIAGNOSTIC_PROJECTION")

    resolved_decoder = resolve_decoder_backend(decoder_backend)
    nodes_by_key: dict[str, dict[str, Any]] = {}
    invalid_nodes = 0
    nodes_truncated = False
    for raw in iter_json_array(snapshot_path, "nodes", decoder_backend=resolved_decoder):
        if max_nodes and len(nodes_by_key) >= max_nodes:
            nodes_truncated = True
            break
        record = _node_record(raw)
        if record is None:
            invalid_nodes += 1
            continue
        nodes_by_key.setdefault(record["nodeKey"], record)

    edges: list[dict[str, Any]] = []
    invalid_edges = 0
    edge_records_seen = 0
    edges_missing_node_endpoints = 0
    edges_truncated = False
    for raw in iter_json_array(snapshot_path, "edges", decoder_backend=resolved_decoder):
        if max_edges and len(edges) >= max_edges:
            edges_truncated = True
            break
        record = _edge_record(raw)
        if record is None:
            invalid_edges += 1
            continue
        edge_records_seen += 1
        if record["sourceNodeKey"] in nodes_by_key and record["targetNodeKey"] in nodes_by_key:
            edges.append(record)
        else:
            edges_missing_node_endpoints += 1

    ordered_nodes = [nodes_by_key[key] for key in sorted(nodes_by_key)]
    ordinal_by_key = {row["nodeKey"]: ordinal for ordinal, row in enumerate(ordered_nodes)}
    ordered_edges = sorted(edges, key=lambda row: (
        ordinal_by_key[row["sourceNodeKey"]],
        ordinal_by_key[row["targetNodeKey"]],
        row["edgeType"],
        row["weight"],
    ))

    output_dir.mkdir(parents=True, exist_ok=True)
    nodes_path = output_dir / "nodes.ndjson"
    edges_path = output_dir / "edges.ndjson"
    topology_path = output_dir / "topology.ndjson"

    node_rows = (
        {"graphOrdinal": ordinal_by_key[row["nodeKey"]], **row}
        for row in ordered_nodes
    )
    edge_rows = (
        {"sourceGraphOrdinal": ordinal_by_key[row["sourceNodeKey"]],
         "targetGraphOrdinal": ordinal_by_key[row["targetNodeKey"]], **row}
        for row in ordered_edges
    )
    node_count, node_checksum = _write_ndjson(nodes_path, node_rows)
    edge_count, edge_checksum = _write_ndjson(edges_path, edge_rows)

    pagerank: dict[str, float] = {}
    graph_backend = "networkx_not_run"
    if run_pagerank:
        try:
            import networkx as nx
        except ImportError as error:
            raise RuntimeError("NETWORKX_REQUIRED_FOR_PAGERANK") from error
        graph = nx.DiGraph()
        graph.add_nodes_from(nodes_by_key)
        graph.add_weighted_edges_from(
            (row["sourceNodeKey"], row["targetNodeKey"], row["weight"])
            for row in ordered_edges
        )
        pagerank = nx.pagerank(graph, alpha=0.85, max_iter=100, tol=1e-10, weight="weight") if graph else {}
        graph_backend = "networkx"

    topology_rows = []
    for row in ordered_nodes:
        key = row["nodeKey"]
        incoming = sum(1 for edge in ordered_edges if edge["targetNodeKey"] == key)
        outgoing = sum(1 for edge in ordered_edges if edge["sourceNodeKey"] == key)
        topology_rows.append({
            "graphOrdinal": ordinal_by_key[key],
            "nodeKey": key,
            "pagerank": pagerank.get(key),
            "inDegree": incoming,
            "outDegree": outgoing,
            "graphFeature4d": [pagerank.get(key), incoming, outgoing, incoming + outgoing] if run_pagerank else None,
            "canonicalAuthority": False,
        })
    topology_count, topology_checksum = _write_ndjson(topology_path, iter(topology_rows))

    domain_counts = Counter(str(row["domainClass"]) for row in ordered_nodes if row.get("domainClass"))
    node_type_counts = Counter(row["nodeType"] for row in ordered_nodes)
    semantic_768_count = sum(1 for row in ordered_nodes if row.get("vectorDim") == 768)
    manifest: dict[str, Any] = {
        "schema": SCHEMA,
        "status": "BLOCKED_STALE_SNAPSHOT" if stale else "PROJECTION_PROVEN_BOUNDED",
        "snapshotId": _snapshot_id(snapshot_path),
        "input": {
            "path": str(snapshot_path),
            "bytes": snapshot_path.stat().st_size,
            "modifiedAt": datetime.fromtimestamp(snapshot_path.stat().st_mtime, tz=timezone.utc).isoformat(),
            "ageHours": round(age_hours, 3),
            "inputSha256": _file_sha256(snapshot_path) if hash_input else None,
        },
        "bounds": {"maxNodes": max_nodes, "maxEdges": max_edges, "allowStale": allow_stale},
        "counts": {
            "nodes": node_count,
            "edges": edge_count,
            "invalidNodes": invalid_nodes,
            "invalidEdges": invalid_edges,
            "edgeRecordsSeen": edge_records_seen,
            "edgesMissingNodeEndpoints": edges_missing_node_endpoints,
            "nodesTruncated": nodes_truncated,
            "edgesTruncated": edges_truncated,
            "semantic768MetadataRows": semantic_768_count,
        },
        "checksums": {
            "nodeNdjson": node_checksum,
            "edgeNdjson": edge_checksum,
            "topologyNdjson": topology_checksum,
            "ordinalMap": _checksum([{"graphOrdinal": i, "nodeKey": row["nodeKey"]} for i, row in enumerate(ordered_nodes)]),
        },
        "observations": {
            "decoderBackend": resolved_decoder,
            "domainClassCounts": dict(sorted(domain_counts.items())),
            "nodeTypeCounts": dict(sorted(node_type_counts.items())),
            "graphBackend": graph_backend,
            "oaklib": "NOT_RUN_DERIVED_OBSERVATIONS_ONLY",
            "ontologyTupleAdmission": "NOT_RUN_NO_MUTATION",
        },
        "downstream": {
            "embedding": "BLOCKED_NO_CANONICAL_SEMANTIC_MATRIX_IN_GRAPH_SNAPSHOT",
            "kmeans": "BLOCKED_UNTIL_CANDIDATE_ORDINAL_AND_SEMANTIC_MATRIX_RECEIPT",
            "som20x20": "BLOCKED_UNTIL_SHARED_SEMANTIC_MATRIX_AND_KMEANS_ALIGNMENT",
            "cugraphParity": "NOT_RUN_NETWORKX_PROJECTION_ONLY",
            "writesPerformed": False,
            "canonicalAuthority": False,
        },
        "artifacts": {
            "nodes": str(nodes_path),
            "edges": str(edges_path),
            "topology": str(topology_path),
        },
    }
    manifest["manifestChecksum"] = _checksum(manifest)
    manifest_path = output_dir / "manifest.json"
    manifest_path.write_text(json.dumps(manifest, indent=2, sort_keys=True) + "\n", encoding="utf-8")
    return manifest


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--snapshot", type=Path, required=True)
    parser.add_argument("--output-dir", type=Path, required=True)
    parser.add_argument("--max-nodes", type=int, default=0)
    parser.add_argument("--max-edges", type=int, default=0)
    parser.add_argument("--max-age-hours", type=float, default=DEFAULT_MAX_AGE_HOURS)
    parser.add_argument("--allow-stale", action="store_true")
    parser.add_argument("--pagerank", action="store_true")
    parser.add_argument("--decoder", choices=("auto", "stdlib", "simdjson"), default="auto")
    parser.add_argument("--hash-input", action="store_true")
    args = parser.parse_args()
    manifest = project_snapshot(
        args.snapshot,
        args.output_dir,
        max_nodes=args.max_nodes,
        max_edges=args.max_edges,
        allow_stale=args.allow_stale,
        max_age_hours=args.max_age_hours,
        run_pagerank=args.pagerank,
        decoder_backend=args.decoder,
        hash_input=args.hash_input,
    )
    print(json.dumps({
        "status": manifest["status"],
        "snapshotId": manifest["snapshotId"],
        "nodes": manifest["counts"]["nodes"],
        "edges": manifest["counts"]["edges"],
        "graphBackend": manifest["observations"]["graphBackend"],
        "embedding": manifest["downstream"]["embedding"],
        "outputDir": str(args.output_dir),
    }, sort_keys=True))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
