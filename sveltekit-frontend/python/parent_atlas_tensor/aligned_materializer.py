from __future__ import annotations

from dataclasses import dataclass, asdict
from pathlib import Path
import hashlib
import json
from typing import Iterable, Sequence

import numpy as np
import pyarrow as pa
import pyarrow.ipc as ipc

from .arrow_ipc import fixed_f32, sha256_file, write_ipc_file
from .nary_incidence import Member, incidence_batch


@dataclass(frozen=True)
class CanonicalRow:
    canonical_id: str
    canonical_revision: str
    packet_key: str


@dataclass(frozen=True)
class MaterializedArtifact:
    artifact_id: str
    kind: str
    path: str
    content_checksum: str
    row_identity_checksum: str | None
    logical_row_count: int
    physical_row_count: int
    dimensions: int | None
    dtype: str | None


@dataclass(frozen=True)
class AlignedMaterializationReceipt:
    schema: str
    materialization_revision: str
    source_snapshot_revision: str
    row_identity_checksum: str
    row_count: int
    artifacts: tuple[MaterializedArtifact, ...]
    producer_revision: str
    receipt_checksum: str


def _stable(value: object) -> str:
    if value is None:
        return "null"
    if value is True:
        return "true"
    if value is False:
        return "false"
    if isinstance(value, str):
        return json.dumps(value, ensure_ascii=False, separators=(",", ":"))
    if isinstance(value, (int, float)):
        if isinstance(value, float) and not np.isfinite(value):
            raise ValueError("canonical materialization checksum requires finite numbers")
        if value == 0:
            value = 0
        return json.dumps(value, ensure_ascii=False, separators=(",", ":"))
    if isinstance(value, (list, tuple)):
        return "[" + ",".join(_stable(item) for item in value) + "]"
    if isinstance(value, dict):
        items = []
        for key in sorted(value):
            item = value[key]
            if item is None and key.startswith("__undefined_"):
                continue
            items.append(f"{json.dumps(str(key), ensure_ascii=False)}:{_stable(item)}")
        return "{" + ",".join(items) + "}"
    raise TypeError(f"unsupported stable value: {type(value)!r}")


def logical_sha256(value: object) -> str:
    return hashlib.sha256(_stable(value).encode("utf-8")).hexdigest()


def canonicalize_rows(rows: Sequence[CanonicalRow]) -> list[CanonicalRow]:
    ordered = sorted(rows, key=lambda row: (row.canonical_id, row.canonical_revision))
    if len({row.canonical_id for row in ordered}) != len(ordered):
        raise ValueError("canonical_id must be unique")
    if any(not row.canonical_id or not row.canonical_revision or not row.packet_key for row in ordered):
        raise ValueError("canonical rows require canonical_id, canonical_revision, and packet_key")
    return ordered


def row_identity_rows(rows: Sequence[CanonicalRow]) -> list[dict[str, object]]:
    return [
        {
            "ordinal": ordinal,
            "canonical_id": row.canonical_id,
            "canonical_revision": row.canonical_revision,
        }
        for ordinal, row in enumerate(canonicalize_rows(rows))
    ]


def row_identity_checksum(rows: Sequence[CanonicalRow]) -> str:
    return logical_sha256(row_identity_rows(rows))


def _identity_columns(rows: Sequence[CanonicalRow]) -> tuple[list[pa.Array], list[str]]:
    ordered = canonicalize_rows(rows)
    return (
        [
            pa.array(np.arange(len(ordered), dtype=np.uint32), type=pa.uint32()),
            pa.array([row.canonical_id for row in ordered], type=pa.string()),
            pa.array([row.canonical_revision for row in ordered], type=pa.string()),
            pa.array([row.packet_key for row in ordered], type=pa.string()),
        ],
        ["ordinal", "canonical_id", "canonical_revision", "packet_key"],
    )


def semantic_record_batch(rows: Sequence[CanonicalRow], vectors: np.ndarray) -> pa.RecordBatch:
    ordered = canonicalize_rows(rows)
    matrix = np.asarray(vectors, dtype=np.float32)
    if matrix.shape != (len(ordered), 768):
        raise ValueError(f"semantic matrix must have shape [{len(ordered)},768]")
    if not np.isfinite(matrix).all():
        raise ValueError("semantic matrix must be finite")
    cols, names = _identity_columns(ordered)
    return pa.RecordBatch.from_arrays([*cols, fixed_f32(matrix)], [*names, "semantic_768"])


def feature_record_batch(rows: Sequence[CanonicalRow], features: np.ndarray) -> pa.RecordBatch:
    ordered = canonicalize_rows(rows)
    matrix = np.asarray(features, dtype=np.float32)
    if matrix.ndim != 2 or matrix.shape[0] != len(ordered) or matrix.shape[1] < 1:
        raise ValueError("feature matrix must have shape [N,F] with F >= 1")
    if not np.isfinite(matrix).all():
        raise ValueError("feature matrix must be finite")
    cols, names = _identity_columns(ordered)
    return pa.RecordBatch.from_arrays([*cols, fixed_f32(matrix)], [*names, "features"])


def node_hypergraph_record_batch(rows: Sequence[CanonicalRow], members: Iterable[Member]) -> pa.RecordBatch:
    ordered = canonicalize_rows(rows)
    by_vertex: dict[str, list[Member]] = {row.canonical_id: [] for row in ordered}
    for member in members:
        if not np.isfinite(member.weight):
            raise ValueError("hypergraph weights must be finite")
        if member.vertex_id in by_vertex:
            by_vertex[member.vertex_id].append(member)
    cols, names = _identity_columns(ordered)
    edge_lists: list[list[str]] = []
    role_lists: list[list[str]] = []
    weight_lists: list[list[float]] = []
    for row in ordered:
        incident = sorted(by_vertex[row.canonical_id], key=lambda item: (item.hyperedge_id, item.role, item.vertex_id))
        edge_lists.append([item.hyperedge_id for item in incident])
        role_lists.append([item.role for item in incident])
        weight_lists.append([float(item.weight) for item in incident])
    return pa.RecordBatch.from_arrays(
        [
            *cols,
            pa.array(edge_lists, type=pa.list_(pa.string())),
            pa.array(role_lists, type=pa.list_(pa.string())),
            pa.array(weight_lists, type=pa.list_(pa.float32())),
        ],
        [*names, "hyperedge_ids", "roles", "weights"],
    )


def _write_one(path: Path, batch: pa.RecordBatch) -> None:
    write_ipc_file(path, [batch], compression=None)


def _artifact(path: Path, artifact_id: str, kind: str, row_checksum: str | None, logical_rows: int, physical_rows: int, dimensions: int | None, dtype: str | None) -> MaterializedArtifact:
    return MaterializedArtifact(
        artifact_id=artifact_id,
        kind=kind,
        path=str(path),
        content_checksum=sha256_file(path),
        row_identity_checksum=row_checksum,
        logical_row_count=logical_rows,
        physical_row_count=physical_rows,
        dimensions=dimensions,
        dtype=dtype,
    )


def materialize_aligned_artifacts(
    *,
    output_dir: str | Path,
    materialization_revision: str,
    source_snapshot_revision: str,
    rows: Sequence[CanonicalRow],
    semantic_768: np.ndarray,
    features: np.ndarray,
    members: Sequence[Member],
    producer_revision: str,
) -> AlignedMaterializationReceipt:
    ordered = canonicalize_rows(rows)
    row_checksum = row_identity_checksum(ordered)
    output = Path(output_dir)
    output.mkdir(parents=True, exist_ok=True)

    semantic_path = output / "semantic.arrow"
    feature_path = output / "features.arrow"
    hypergraph_path = output / "hypergraph-node-view.arrow"
    raw_incidence_path = output / "nary-incidence.arrow"

    semantic = semantic_record_batch(ordered, semantic_768)
    feature = feature_record_batch(ordered, features)
    node_hypergraph = node_hypergraph_record_batch(ordered, members)
    raw_incidence = incidence_batch(members)

    _write_one(semantic_path, semantic)
    _write_one(feature_path, feature)
    _write_one(hypergraph_path, node_hypergraph)
    _write_one(raw_incidence_path, raw_incidence)

    artifacts = (
        _artifact(semantic_path, f"semantic:{materialization_revision}", "SEMANTIC", row_checksum, len(ordered), semantic.num_rows, 768, "float32"),
        _artifact(feature_path, f"feature:{materialization_revision}", "FEATURE", row_checksum, len(ordered), feature.num_rows, features.shape[1], "float32"),
        _artifact(hypergraph_path, f"hypergraph-node:{materialization_revision}", "HYPERGRAPH", row_checksum, len(ordered), node_hypergraph.num_rows, None, None),
        _artifact(raw_incidence_path, f"nary-incidence:{materialization_revision}", "NARY_INCIDENCE", None, len(ordered), raw_incidence.num_rows, None, "float32"),
    )
    body = {
        "schema": "atlas.aligned-materialization-receipt.v1",
        "materialization_revision": materialization_revision,
        "source_snapshot_revision": source_snapshot_revision,
        "row_identity_checksum": row_checksum,
        "row_count": len(ordered),
        "artifacts": [asdict(artifact) for artifact in artifacts],
        "producer_revision": producer_revision,
    }
    receipt = AlignedMaterializationReceipt(
        **body,
        receipt_checksum=logical_sha256(body),
    )
    (output / "manifest.json").write_text(json.dumps(asdict(receipt), indent=2, sort_keys=True), encoding="utf-8")
    return receipt


def verify_mmap_alignment(receipt: AlignedMaterializationReceipt) -> None:
    expected = receipt.row_identity_checksum
    for artifact in receipt.artifacts:
        if artifact.row_identity_checksum != expected:
            continue
        with pa.memory_map(artifact.path, "r") as source:
            reader = ipc.open_file(source)
            table = reader.read_all()
            if table.num_rows != receipt.row_count:
                raise ValueError(f"row count mismatch for {artifact.artifact_id}")
            ordinals = table.column("ordinal").to_numpy(zero_copy_only=False)
            if not np.array_equal(ordinals, np.arange(receipt.row_count, dtype=np.uint32)):
                raise ValueError(f"ordinal mismatch for {artifact.artifact_id}")
            rows = [
                {
                    "ordinal": int(table.column("ordinal")[i].as_py()),
                    "canonical_id": table.column("canonical_id")[i].as_py(),
                    "canonical_revision": table.column("canonical_revision")[i].as_py(),
                }
                for i in range(table.num_rows)
            ]
            if logical_sha256(rows) != expected:
                raise ValueError(f"row identity checksum mismatch for {artifact.artifact_id}")
