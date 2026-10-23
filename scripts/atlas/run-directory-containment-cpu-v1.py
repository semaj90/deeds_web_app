#!/usr/bin/env python3
"""Build a frozen directory-containment graph and run its CPU oracle."""

from __future__ import annotations

import argparse
import hashlib
import json
import os
from dataclasses import asdict
from pathlib import Path

import pyarrow as pa
import pyarrow.ipc as ipc

from atlas_graph_runtime.contracts import TypedGraphEdge
from atlas_graph_runtime.networkx_executor import run_bfs_neighborhood, run_pagerank_v2


def canonical_json(value: object) -> bytes:
    return json.dumps(value, sort_keys=True, separators=(",", ":"), ensure_ascii=False).encode("utf-8")


def sha256_bytes(value: bytes) -> str:
    return hashlib.sha256(value).hexdigest()


def build_directory_tree_edges(directory_rows: list[dict]) -> list[TypedGraphEdge]:
    if [row.get("ordinal") for row in directory_rows] != list(range(len(directory_rows))):
        raise ValueError("DIRECTORY_ORDINAL_SEQUENCE_INVALID")
    paths = [row.get("relativePath") for row in directory_rows]
    if any(not isinstance(value, str) or not value or "\\" in value for value in paths):
        raise ValueError("DIRECTORY_PATH_INVALID")
    if len(paths) != len(set(paths)) or "." not in paths:
        raise ValueError("DIRECTORY_PATH_SET_INVALID")
    ordinal_by_path = {value: ordinal for ordinal, value in enumerate(paths)}
    edges = []
    for ordinal, value in enumerate(paths):
        if value == ".":
            continue
        parent = value.rpartition("/")[0] or "."
        if parent not in ordinal_by_path or parent == value:
            raise ValueError(f"DIRECTORY_PARENT_MISSING:{value}")
        edges.append(TypedGraphEdge(
            src_ordinal=ordinal_by_path[parent],
            dst_ordinal=ordinal,
            kind="DIRECTORY_CONTAINS",
            weight=1.0,
        ))
    edges.sort(key=lambda edge: (edge.src_ordinal, edge.dst_ordinal))
    if len(edges) != len(paths) - 1:
        raise ValueError("DIRECTORY_TREE_EDGE_COUNT_INVALID")
    return edges


def read_directory_rows(root: Path, manifest_path: Path):
    manifest_bytes = manifest_path.read_bytes()
    manifest = json.loads(manifest_bytes)
    body = dict(manifest)
    digest = body.pop("receiptSha256", None)
    if sha256_bytes(canonical_json(body)) != digest:
        raise ValueError("FEATURE_MATRIX_MANIFEST_CHECKSUM_INVALID")
    if manifest.get("status") != "DERIVED_ADVISORY_SPARSE_FEATURES" or manifest.get("canonicalAuthority") is not False:
        raise ValueError("FEATURE_MATRIX_AUTHORITY_FLAGS_INVALID")
    artifact_record = manifest.get("artifacts", {}).get("directory-ordinals.arrow")
    if not artifact_record:
        raise ValueError("DIRECTORY_ORDINAL_ARTIFACT_MISSING")
    artifact_path = (manifest_path.parent / "directory-ordinals.arrow").resolve()
    if root not in artifact_path.parents:
        raise ValueError("DIRECTORY_ORDINAL_ARTIFACT_OUTSIDE_REPOSITORY")
    artifact_bytes = artifact_path.read_bytes()
    if len(artifact_bytes) != artifact_record.get("bytes") or sha256_bytes(artifact_bytes) != artifact_record.get("sha256"):
        raise ValueError("DIRECTORY_ORDINAL_ARTIFACT_CHECKSUM_INVALID")
    with ipc.open_file(pa.BufferReader(artifact_bytes)) as reader:
        directory_rows = reader.read_all().to_pylist()
    if len(directory_rows) != manifest.get("directoryRows"):
        raise ValueError("DIRECTORY_ORDINAL_ROW_COUNT_INVALID")
    return manifest, manifest_bytes, artifact_bytes, directory_rows


def table_bytes(table: pa.Table) -> bytes:
    sink = pa.BufferOutputStream()
    with ipc.new_file(sink, table.schema) as writer:
        writer.write_table(table)
    return sink.getvalue().to_pybytes()


def run(args):
    root = Path(args.repo_root).resolve()
    manifest_path = (root / args.input_manifest).resolve()
    output_dir = (root / ".tmp" / "atlas" / "directory-intelligence" / "directory-containment-graph" / args.run_id).resolve()
    if root not in manifest_path.parents or root not in output_dir.parents:
        raise ValueError("INPUT_OR_OUTPUT_PATH_OUTSIDE_REPOSITORY")
    manifest, manifest_bytes, ordinal_bytes, directories = read_directory_rows(root, manifest_path)
    edges = build_directory_tree_edges(directories)
    node_ordinals = list(range(len(directories)))
    edge_table = pa.table({
        "srcOrdinal": pa.array([edge.src_ordinal for edge in edges], type=pa.int32()),
        "dstOrdinal": pa.array([edge.dst_ordinal for edge in edges], type=pa.int32()),
        "edgeType": pa.array([edge.kind for edge in edges], type=pa.string()),
        "weight": pa.array([edge.weight for edge in edges], type=pa.float32()),
    })
    edge_bytes = table_bytes(edge_table)
    graph_revision = "sha256:" + sha256_bytes(canonical_json({
        "schema": "atlas.directory-containment-graph-input.v1",
        "inventoryManifestReceiptSha256": manifest["receiptSha256"],
        "directoryOrdinalArtifactSha256": manifest["artifacts"]["directory-ordinals.arrow"]["sha256"],
        "edgeArtifactSha256": sha256_bytes(edge_bytes),
    }))
    root_ordinal = next(row["ordinal"] for row in directories if row["relativePath"] == ".")

    pagerank_values, pagerank_execution = run_pagerank_v2(
        graph_revision=graph_revision,
        node_ordinals=node_ordinals,
        edges=edges,
        alpha=args.alpha,
        tol=args.tolerance,
        max_iter=args.max_iter,
    )
    bfs_rows, bfs_execution = run_bfs_neighborhood(
        graph_revision=graph_revision,
        node_ordinals=node_ordinals,
        edges=edges,
        source_ordinal=root_ordinal,
        max_depth=args.bfs_depth,
    )
    if len(pagerank_values) != len(directories) or abs(sum(pagerank_values.values()) - 1.0) > 1e-6:
        raise ValueError("PAGERANK_OUTPUT_SHAPE_OR_MASS_INVALID")
    path_by_ordinal = {row["ordinal"]: row["relativePath"] for row in directories}
    page_rows = sorted(pagerank_values.items(), key=lambda item: (-item[1], item[0]))
    pagerank_table = pa.table({
        "directoryOrdinal": pa.array([ordinal for ordinal, _ in page_rows], type=pa.int32()),
        "relativePath": pa.array([path_by_ordinal[ordinal] for ordinal, _ in page_rows], type=pa.string()),
        "pageRank": pa.array([score for _, score in page_rows], type=pa.float64()),
    })
    bfs_table = pa.table({
        "directoryOrdinal": pa.array([row[0] for row in bfs_rows], type=pa.int32()),
        "depth": pa.array([row[1] for row in bfs_rows], type=pa.int16()),
        "parentOrdinal": pa.array([None if row[2] < 0 else row[2] for row in bfs_rows], type=pa.int32()),
        "relativePath": pa.array([path_by_ordinal[row[0]] for row in bfs_rows], type=pa.string()),
    })
    output_tables = {
        "directory-containment-edges.arrow": edge_bytes,
        "pagerank.arrow": table_bytes(pagerank_table),
        "bfs-neighborhood.arrow": table_bytes(bfs_table),
    }
    output_dir.mkdir(parents=True, exist_ok=False)
    output_artifacts = {}
    for name, data in output_tables.items():
        with (output_dir / name).open("xb") as stream:
            stream.write(data)
        output_artifacts[name] = {"bytes": len(data), "sha256": sha256_bytes(data)}

    receipt = {
        "schema": "atlas.directory-containment-cpu-analysis.v1",
        "runId": args.run_id,
        "status": "EXACT_PATH_TOPOLOGY_CPU_ORACLE",
        "canonicalAuthority": False,
        "productionAdmission": False,
        "scratchArtifactsWritten": True,
        "persistentWritesPerformed": False,
        "input": {
            "manifestPath": str(manifest_path.relative_to(root)).replace(os.sep, "/"),
            "manifestFileSha256": sha256_bytes(manifest_bytes),
            "manifestReceiptSha256": manifest["receiptSha256"],
            "directoryOrdinalSha256": manifest["artifacts"]["directory-ordinals.arrow"]["sha256"],
            "directoryOrdinalFileSha256": sha256_bytes(ordinal_bytes),
            "nodeCount": len(directories),
            "exactParentEdgeCount": len(edges),
            "edgeKind": "DIRECTORY_CONTAINS",
            "graphRevision": graph_revision,
            "graphEdgeSha256": sha256_bytes(edge_bytes),
        },
        "operations": {
            "pagerank": {"executor": asdict(pagerank_execution), "top10": [{"ordinal": ordinal, "relativePath": path_by_ordinal[ordinal], "score": score} for ordinal, score in page_rows[:10]]},
            "bfs": {"executor": asdict(bfs_execution), "sourceOrdinal": root_ordinal, "maxDepth": args.bfs_depth, "reachedCount": len(bfs_rows), "depthCounts": {str(depth): sum(1 for row in bfs_rows if row[1] == depth) for depth in range(args.bfs_depth + 1)}},
        },
        "outputs": output_artifacts,
        "limitations": [
            "Graph contains exact directory-parent topology only; no semantic, import, symbol, or runtime edges.",
            "PageRank is a topology diagnostic, not source relevance, authority, or recommendation quality.",
            "CPU oracle only; no GPU executor was invoked by this run.",
            "No canonical identity, Graphify authority, or production admission is created.",
        ],
    }
    receipt["receiptSha256"] = sha256_bytes(canonical_json(receipt))
    with (output_dir / "receipt.json").open("x", encoding="utf-8", newline="\n") as stream:
        stream.write(json.dumps(receipt, indent=2, ensure_ascii=False) + "\n")
    print(json.dumps({
        "receiptPath": str((output_dir / "receipt.json").relative_to(root)).replace(os.sep, "/"),
        "receiptSha256": receipt["receiptSha256"],
        "status": receipt["status"],
        "nodeCount": len(directories),
        "edgeCount": len(edges),
        "bfsReached": len(bfs_rows),
        "pagerankTop10": receipt["operations"]["pagerank"]["top10"],
    }, indent=2))


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--repo-root", default=str(Path(__file__).resolve().parents[2]))
    parser.add_argument("--input-manifest", required=True)
    parser.add_argument("--run-id", required=True)
    parser.add_argument("--alpha", type=float, default=0.85)
    parser.add_argument("--tolerance", type=float, default=1e-8)
    parser.add_argument("--max-iter", type=int, default=100)
    parser.add_argument("--bfs-depth", type=int, default=3)
    args = parser.parse_args()
    if not args.run_id or len(args.run_id) > 64 or any(char not in "abcdefghijklmnopqrstuvwxyz0123456789-" for char in args.run_id):
        parser.error("run-id must contain lowercase letters, digits, or hyphens")
    if not 0.0 < args.alpha < 1.0 or args.tolerance <= 0 or args.max_iter < 1 or args.bfs_depth < 0:
        parser.error("invalid PageRank or BFS parameters")
    run(args)


if __name__ == "__main__":
    main()
