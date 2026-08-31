"""Deterministic full-vector PageRank artifact writer for Parent Atlas.

This module is deliberately computation-free: callers hand it the full V-length
``scores_df`` already returned by ``cugraph.pagerank``. It normalizes the
projection-local vertex coordinate, joins the resident nodeKey lookup, writes an
Arrow IPC *file* artifact, memory-map reads it back, verifies it, and atomically
renames it into place.

The dense GPU coordinate is named ``projectionOrdinal`` here. It must not be
called GraphOrdinal until a separate GraphNodeKeyV1 <-> GraphOrdinal <->
projectionOrdinal bridge with its own checksum is proven.
"""

from __future__ import annotations

import hashlib
import json
import math
import os
from pathlib import Path
from typing import Any, Mapping

import pyarrow as pa
import pyarrow.ipc as ipc

_SCHEMA = "atlas.pagerank-vector-artifact.v1"
_RECEIPT_SCHEMA = "atlas.pagerank-vector-artifact-receipt.v1"
_SELECTION_MODE = "FULL_VECTOR"
_BACKEND = "cugraph.pagerank"


def _canonical_json(value: Any) -> str:
    return json.dumps(value, sort_keys=True, separators=(",", ":"), ensure_ascii=False)


def _sha256_bytes(value: bytes) -> str:
    return "sha256:" + hashlib.sha256(value).hexdigest()


def _sha256_json(value: Any) -> str:
    return _sha256_bytes(_canonical_json(value).encode("utf-8"))


def projection_ordinal_map_checksum(rows: list[dict[str, Any]]) -> str:
    """Checksum only the projection-local ordinal -> nodeKey map."""
    normalized = [
        {"projectionOrdinal": int(row["projectionOrdinal"]), "nodeKey": str(row["nodeKey"])}
        for row in sorted(rows, key=lambda item: int(item["projectionOrdinal"]))
    ]
    return _sha256_json(normalized)


def _to_pandas(scores_df: Any):
    if hasattr(scores_df, "to_pandas"):
        return scores_df[["vertex", "pagerank"]].to_pandas()
    return scores_df[["vertex", "pagerank"]].copy()


def normalize_full_pagerank_rows(
    scores_df: Any,
    gpu_id_to_identity: Mapping[int, Mapping[str, Any]],
    vertex_count: int,
) -> list[dict[str, Any]]:
    """Normalize V PageRank rows into deterministic projectionOrdinal order."""
    frame = _to_pandas(scores_df).sort_values("vertex", ascending=True)
    if len(frame) != vertex_count:
        raise ValueError(f"PAGERANK_FULL_VECTOR_ROW_COUNT_MISMATCH:{len(frame)}:{vertex_count}")

    rows: list[dict[str, Any]] = []
    seen_ordinals: set[int] = set()
    seen_node_keys: set[str] = set()
    for raw in frame.itertuples(index=False):
        projection_ordinal = int(raw.vertex)
        score = float(raw.pagerank)
        identity = gpu_id_to_identity.get(projection_ordinal)
        if identity is None:
            raise ValueError(f"PAGERANK_PROJECTION_IDENTITY_MISSING:{projection_ordinal}")
        node_key = str(identity.get("nodeKey") or "").strip()
        if not node_key:
            raise ValueError(f"PAGERANK_NODE_KEY_MISSING:{projection_ordinal}")
        if projection_ordinal in seen_ordinals:
            raise ValueError(f"PAGERANK_PROJECTION_ORDINAL_DUPLICATE:{projection_ordinal}")
        if node_key in seen_node_keys:
            raise ValueError(f"PAGERANK_NODE_KEY_DUPLICATE:{node_key}")
        if not math.isfinite(score):
            raise ValueError(f"PAGERANK_SCORE_NONFINITE:{projection_ordinal}")
        seen_ordinals.add(projection_ordinal)
        seen_node_keys.add(node_key)
        rows.append({
            "projectionOrdinal": projection_ordinal,
            "nodeKey": node_key,
            "score": score,
        })

    expected = list(range(vertex_count))
    actual = [row["projectionOrdinal"] for row in rows]
    if actual != expected:
        raise ValueError("PAGERANK_PROJECTION_ORDINAL_NOT_DENSE_0_V")
    return rows


def _artifact_schema(metadata: dict[str, Any]) -> pa.Schema:
    encoded_metadata = {
        key.encode("utf-8"): str(value).encode("utf-8")
        for key, value in metadata.items()
        if value is not None
    }
    return pa.schema(
        [
            pa.field("projectionOrdinal", pa.uint32(), nullable=False),
            pa.field("nodeKey", pa.utf8(), nullable=False),
            pa.field("score", pa.float64(), nullable=False),
        ],
        metadata=encoded_metadata,
    )


def _table_from_rows(rows: list[dict[str, Any]], schema: pa.Schema) -> pa.Table:
    return pa.Table.from_arrays(
        [
            pa.array([row["projectionOrdinal"] for row in rows], type=pa.uint32()),
            pa.array([row["nodeKey"] for row in rows], type=pa.utf8()),
            pa.array([row["score"] for row in rows], type=pa.float64()),
        ],
        schema=schema,
    )


def _readback_validate(path: Path, expected_rows: list[dict[str, Any]], expected_schema: pa.Schema) -> dict[str, Any]:
    with pa.memory_map(str(path), "r") as source:
        table = ipc.open_file(source).read_all()
        if table.num_rows != len(expected_rows):
            raise ValueError("PAGERANK_ARROW_READBACK_ROW_COUNT_MISMATCH")
        if table.schema != expected_schema:
            raise ValueError("PAGERANK_ARROW_READBACK_SCHEMA_MISMATCH")
        ordinals = table.column("projectionOrdinal").to_pylist()
        node_keys = table.column("nodeKey").to_pylist()
        scores = table.column("score").to_pylist()

    if ordinals != [row["projectionOrdinal"] for row in expected_rows]:
        raise ValueError("PAGERANK_ARROW_READBACK_ORDINAL_MISMATCH")
    if node_keys != [row["nodeKey"] for row in expected_rows]:
        raise ValueError("PAGERANK_ARROW_READBACK_NODE_KEY_MISMATCH")
    if scores != [row["score"] for row in expected_rows]:
        raise ValueError("PAGERANK_ARROW_READBACK_SCORE_MISMATCH")
    return {
        "rowCount": len(ordinals),
        "schemaChecksum": _sha256_bytes(str(expected_schema).encode("utf-8")),
    }


def write_pagerank_vector_artifact(
    *,
    scores_df: Any,
    gpu_id_to_identity: Mapping[int, Mapping[str, Any]],
    artifact_root: Path,
    graph_revision: str,
    projection_revision: str,
    node_table_hash: str,
    edge_table_hash: str,
    algorithm_revision: str,
    alpha: float,
    tol: float,
    max_iter: int,
    did_converge: bool,
    vertex_count: int,
    kernel_ms: float | None = None,
) -> dict[str, Any]:
    """Write and verify one full-vector Arrow IPC artifact without recomputing PageRank."""
    if not graph_revision or not projection_revision:
        raise ValueError("PAGERANK_ARTIFACT_REVISION_REQUIRED")
    if vertex_count <= 0:
        raise ValueError("PAGERANK_ARTIFACT_VERTEX_COUNT_REQUIRED")
    if not did_converge:
        raise ValueError("PAGERANK_ARTIFACT_NONCONVERGED_REJECTED")

    rows = normalize_full_pagerank_rows(scores_df, gpu_id_to_identity, vertex_count)
    projection_checksum = projection_ordinal_map_checksum(rows)
    parameter_checksum = _sha256_json({"alpha": float(alpha), "tol": float(tol), "maxIter": int(max_iter)})
    row_payload_checksum = _sha256_json(rows)
    score_sum = sum(row["score"] for row in rows)

    metadata = {
        "schema": _SCHEMA,
        "graphRevision": graph_revision,
        "projectionRevision": projection_revision,
        "projectionOrdinalMapChecksum": projection_checksum,
        "nodeTableHash": node_table_hash,
        "edgeTableHash": edge_table_hash,
        "algorithm": "pagerank",
        "algorithmRevision": algorithm_revision,
        "backend": _BACKEND,
        "selectionMode": _SELECTION_MODE,
        "parameterChecksum": parameter_checksum,
        "canonicalAuthority": "false",
    }
    schema = _artifact_schema(metadata)
    table = _table_from_rows(rows, schema)

    safe_revision = hashlib.sha256(f"{graph_revision}|{projection_revision}|{parameter_checksum}".encode("utf-8")).hexdigest()[:24]
    output_dir = (Path(artifact_root).resolve() / "pagerank-full-vector" / safe_revision).resolve()
    root = Path(artifact_root).resolve()
    if output_dir != root and root not in output_dir.parents:
        raise ValueError("PAGERANK_ARTIFACT_OUTSIDE_ROOT")
    output_dir.mkdir(parents=True, exist_ok=True)
    final_path = output_dir / "pagerank.arrow"
    temp_path = output_dir / f".pagerank.{os.getpid()}.tmp.arrow"

    try:
        with pa.OSFile(str(temp_path), "wb") as sink:
            with ipc.new_file(sink, schema) as writer:
                writer.write_table(table)
        readback = _readback_validate(temp_path, rows, schema)
        artifact_bytes = temp_path.read_bytes()
        artifact_checksum = _sha256_bytes(artifact_bytes)
        os.replace(temp_path, final_path)
    finally:
        if temp_path.exists():
            temp_path.unlink()

    receipt_body = {
        "schema": _RECEIPT_SCHEMA,
        "artifactSchema": _SCHEMA,
        "graphRevision": graph_revision,
        "projectionRevision": projection_revision,
        "projectionOrdinalMapChecksum": projection_checksum,
        "graphOrdinalMapChecksum": None,
        "projectionToGraphOrdinalBridgeChecksum": None,
        "nodeTableHash": node_table_hash,
        "edgeTableHash": edge_table_hash,
        "algorithm": "pagerank",
        "algorithmRevision": algorithm_revision,
        "backend": _BACKEND,
        "selectionMode": _SELECTION_MODE,
        "vertexCount": vertex_count,
        "rowCount": len(rows),
        "alpha": float(alpha),
        "tol": float(tol),
        "maxIter": int(max_iter),
        "parameterChecksum": parameter_checksum,
        "didConverge": True,
        "scoreSum": score_sum,
        "rowPayloadChecksum": row_payload_checksum,
        "schemaChecksum": readback["schemaChecksum"],
        "artifactChecksum": artifact_checksum,
        "artifactPath": str(final_path.relative_to(root)).replace("\\", "/"),
        "readbackVerified": True,
        "kernelMs": kernel_ms,
        "canonicalAuthority": False,
        "writesPerformed": False,
    }
    return {
        **receipt_body,
        "receiptChecksum": _sha256_json(receipt_body),
    }
