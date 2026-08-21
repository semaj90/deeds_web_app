"""Freeze a revision-qualified semantic_768 tensor snapshot from NDJSON rows.

Expected input row fields:
- canonical_id or packet_key
- canonical_revision or source_revision
- embedding (768 finite numbers)
- optional representation_id; if present it must be semantic_768

The legacy output remains a float32 .npy tensor plus JSON manifest. When
``arrow_ipc_path`` is supplied, the same deterministic rows are additionally
written as an Arrow IPC *file* with a fixed-size ``semantic_768`` column and
verified by memory-mapping it back. Arrow promotion is deliberately stricter:
a real workspace revision is required and duplicate non-null ``source_ref``
values are rejected.
"""

from __future__ import annotations

from dataclasses import asdict, dataclass
import hashlib
import json
from pathlib import Path
from typing import Any

import numpy as np

SEMANTIC_REPRESENTATION = "semantic_768"
SEMANTIC_DIMENSION = 768


@dataclass(frozen=True)
class FrozenSemanticRow:
    ordinal: int
    canonical_id: str
    canonical_revision: str
    source_ref: str | None


@dataclass(frozen=True)
class FrozenSemanticSnapshotReceipt:
    schema: str
    snapshot_revision: str
    representation_revision: str
    representation: str
    dimensions: int
    dtype: str
    row_count: int
    rows: list[FrozenSemanticRow]
    source_path: str
    tensor_path: str
    tensor_checksum: str
    row_identity_checksum: str
    canonical_order_checksum: str
    source_revision_checksum: str
    input_file_checksum: str
    ordinal_is_canonical: bool
    producer_revision: str
    canonical_authority: bool
    workspace_revision: str | None = None
    ordinal_map_revision: str | None = None
    source_ref_unique: bool = False
    arrow_ipc_path: str | None = None
    arrow_ipc_checksum: str | None = None
    arrow_ipc_bytes: int | None = None
    mmap_verified: bool = False

    def to_dict(self) -> dict[str, Any]:
        result = asdict(self)
        result["rows"] = [asdict(row) for row in self.rows]
        return result


def _sha256_bytes(value: bytes) -> str:
    return hashlib.sha256(value).hexdigest()


def _sha256_file(path: str | Path) -> str:
    h = hashlib.sha256()
    with Path(path).open("rb") as f:
        for chunk in iter(lambda: f.read(1024 * 1024), b""):
            h.update(chunk)
    return h.hexdigest()


def _stable_json(value: Any) -> bytes:
    return json.dumps(value, sort_keys=True, separators=(",", ":"), ensure_ascii=False).encode("utf-8")


def _duplicate_source_refs(rows: list[FrozenSemanticRow]) -> dict[str, list[str]]:
    by_ref: dict[str, list[str]] = {}
    for row in rows:
        if row.source_ref:
            by_ref.setdefault(row.source_ref, []).append(row.canonical_id)
    return {ref: ids for ref, ids in by_ref.items() if len(ids) > 1}


def _write_and_verify_arrow(
    path: str | Path,
    rows: list[FrozenSemanticRow],
    matrix: np.ndarray,
    *,
    workspace_revision: str,
    representation_revision: str,
    ordinal_map_revision: str,
) -> tuple[str, int]:
    try:
        import pyarrow as pa
        import pyarrow.ipc as ipc
    except ImportError as exc:  # pragma: no cover - environment proof owns this branch
        raise RuntimeError("Arrow IPC export requires pyarrow") from exc

    target = Path(path)
    target.parent.mkdir(parents=True, exist_ok=True)

    flat = pa.array(matrix.reshape(-1), type=pa.float32())
    semantic = pa.FixedSizeListArray.from_arrays(flat, list_size=SEMANTIC_DIMENSION)
    batch = pa.RecordBatch.from_arrays(
        [
            pa.array([row.ordinal for row in rows], type=pa.int64()),
            pa.array([row.canonical_id for row in rows], type=pa.string()),
            pa.array([row.canonical_revision for row in rows], type=pa.string()),
            pa.array([row.source_ref for row in rows], type=pa.string()),
            semantic,
        ],
        ["ordinal", "canonical_id", "source_revision", "source_ref", "semantic_768"],
    )
    metadata = {
        b"schema": b"atlas.semantic-snapshot.v1",
        b"workspace_revision": workspace_revision.encode("utf-8"),
        b"representation_revision": representation_revision.encode("utf-8"),
        b"ordinal_map_revision": ordinal_map_revision.encode("utf-8"),
        b"representation": SEMANTIC_REPRESENTATION.encode("utf-8"),
        b"dimensions": str(SEMANTIC_DIMENSION).encode("ascii"),
        b"dtype": b"float32",
    }
    schema = batch.schema.with_metadata(metadata)
    batch = pa.RecordBatch.from_arrays(list(batch.columns), schema=schema)

    with pa.OSFile(str(target), "wb") as sink:
        with ipc.new_file(sink, schema) as writer:
            writer.write_batch(batch)

    # The proof requirement is specifically mmap-readability, not merely that
    # the bytes happen to be a valid Arrow stream.
    with pa.memory_map(str(target), "r") as source:
        reader = ipc.open_file(source)
        if reader.num_record_batches != 1:
            raise ValueError(f"expected one Arrow record batch; got {reader.num_record_batches}")
        read_batch = reader.get_batch(0)
        if read_batch.num_rows != len(rows):
            raise ValueError("Arrow row count does not match frozen semantic rows")
        semantic_field = read_batch.schema.field("semantic_768")
        if not pa.types.is_fixed_size_list(semantic_field.type) or semantic_field.type.list_size != SEMANTIC_DIMENSION:
            raise ValueError("Arrow semantic_768 column is not fixed-size list[768]")
        if read_batch.schema.metadata != metadata:
            raise ValueError("Arrow snapshot metadata round-trip mismatch")

    return _sha256_file(target), target.stat().st_size


def freeze_semantic_snapshot(
    input_path: str | Path,
    *,
    tensor_path: str | Path,
    manifest_path: str | Path,
    snapshot_revision: str,
    representation_revision: str,
    producer_revision: str,
    workspace_revision: str | None = None,
    ordinal_map_revision: str | None = None,
    arrow_ipc_path: str | Path | None = None,
    require_unique_source_refs: bool = False,
) -> FrozenSemanticSnapshotReceipt:
    source = Path(input_path)
    raw = source.read_bytes()
    rows: list[tuple[str, str, str | None, np.ndarray]] = []
    seen: set[str] = set()

    for line_number, raw_line in enumerate(raw.decode("utf-8").splitlines(), start=1):
        if not raw_line.strip():
            continue
        value = json.loads(raw_line)
        representation = value.get("representation_id") or value.get("representation") or SEMANTIC_REPRESENTATION
        if representation != SEMANTIC_REPRESENTATION:
            raise ValueError(f"line {line_number}: representation must be {SEMANTIC_REPRESENTATION}; got {representation}")
        canonical_id = value.get("canonical_id") or value.get("packet_key")
        canonical_revision = value.get("canonical_revision") or value.get("source_revision")
        source_ref = value.get("source_ref")
        if not isinstance(canonical_id, str) or not canonical_id:
            raise ValueError(f"line {line_number}: canonical_id/packet_key required")
        if not isinstance(canonical_revision, str) or not canonical_revision:
            raise ValueError(f"line {line_number}: canonical_revision/source_revision required")
        if canonical_id in seen:
            raise ValueError(f"line {line_number}: duplicate canonical_id {canonical_id}")
        embedding = np.asarray(value.get("embedding"), dtype=np.float32)
        if embedding.shape != (SEMANTIC_DIMENSION,):
            raise ValueError(f"line {line_number}: expected embedding shape ({SEMANTIC_DIMENSION},); got {embedding.shape}")
        if not np.isfinite(embedding).all():
            raise ValueError(f"line {line_number}: embedding contains non-finite values")
        seen.add(canonical_id)
        rows.append((canonical_id, canonical_revision, source_ref if isinstance(source_ref, str) else None, embedding))

    if not rows:
        raise ValueError("semantic snapshot input contains no rows")

    rows.sort(key=lambda item: (item[0], item[1]))
    matrix = np.ascontiguousarray(np.stack([item[3] for item in rows]), dtype=np.float32)
    frozen_rows = [
        FrozenSemanticRow(ordinal=index, canonical_id=item[0], canonical_revision=item[1], source_ref=item[2])
        for index, item in enumerate(rows)
    ]
    canonical_ids = [row.canonical_id for row in frozen_rows]
    canonical_order_checksum = _sha256_bytes(_stable_json(canonical_ids))
    source_revision_checksum = _sha256_bytes(_stable_json([row.canonical_revision for row in frozen_rows]))
    resolved_ordinal_map_revision = ordinal_map_revision or f"sha256:{canonical_order_checksum}"
    duplicate_refs = _duplicate_source_refs(frozen_rows)
    source_ref_unique = len(duplicate_refs) == 0

    strict_source_refs = require_unique_source_refs or arrow_ipc_path is not None
    if strict_source_refs and duplicate_refs:
        sample = list(duplicate_refs.items())[:5]
        raise ValueError(f"duplicate source_ref values block immutable snapshot promotion: {sample}")
    if arrow_ipc_path is not None and (not isinstance(workspace_revision, str) or not workspace_revision.strip()):
        raise ValueError("workspace_revision is required for Arrow/mmap snapshot promotion")

    tensor_target = Path(tensor_path)
    manifest_target = Path(manifest_path)
    tensor_target.parent.mkdir(parents=True, exist_ok=True)
    manifest_target.parent.mkdir(parents=True, exist_ok=True)
    np.save(tensor_target, matrix, allow_pickle=False)
    tensor_bytes = matrix.tobytes(order="C")

    arrow_checksum: str | None = None
    arrow_bytes: int | None = None
    mmap_verified = False
    if arrow_ipc_path is not None:
        arrow_checksum, arrow_bytes = _write_and_verify_arrow(
            arrow_ipc_path,
            frozen_rows,
            matrix,
            workspace_revision=workspace_revision.strip(),
            representation_revision=representation_revision,
            ordinal_map_revision=resolved_ordinal_map_revision,
        )
        mmap_verified = True

    receipt = FrozenSemanticSnapshotReceipt(
        schema="atlas.semantic-snapshot.v1" if arrow_ipc_path is not None else "atlas.frozen-semantic-snapshot.v2",
        snapshot_revision=snapshot_revision,
        representation_revision=representation_revision,
        representation=SEMANTIC_REPRESENTATION,
        dimensions=SEMANTIC_DIMENSION,
        dtype="float32",
        row_count=len(frozen_rows),
        rows=frozen_rows,
        source_path=str(source),
        tensor_path=str(tensor_target),
        tensor_checksum=_sha256_bytes(tensor_bytes),
        row_identity_checksum=_sha256_bytes(_stable_json([asdict(row) for row in frozen_rows])),
        canonical_order_checksum=canonical_order_checksum,
        source_revision_checksum=source_revision_checksum,
        input_file_checksum=_sha256_bytes(raw),
        ordinal_is_canonical=False,
        producer_revision=producer_revision,
        canonical_authority=False,
        workspace_revision=workspace_revision,
        ordinal_map_revision=resolved_ordinal_map_revision,
        source_ref_unique=source_ref_unique,
        arrow_ipc_path=str(arrow_ipc_path) if arrow_ipc_path is not None else None,
        arrow_ipc_checksum=arrow_checksum,
        arrow_ipc_bytes=arrow_bytes,
        mmap_verified=mmap_verified,
    )
    manifest_target.write_text(json.dumps(receipt.to_dict(), indent=2, sort_keys=True) + "\n", encoding="utf-8")
    return receipt


def load_and_verify_frozen_snapshot(manifest_path: str | Path) -> tuple[np.ndarray, dict[str, Any]]:
    manifest = json.loads(Path(manifest_path).read_text(encoding="utf-8"))
    if manifest.get("schema") not in {
        "atlas.frozen-semantic-snapshot.v1",
        "atlas.frozen-semantic-snapshot.v2",
        "atlas.semantic-snapshot.v1",
    }:
        raise ValueError("unsupported frozen semantic snapshot schema")
    if manifest.get("representation") != SEMANTIC_REPRESENTATION or manifest.get("dimensions") != SEMANTIC_DIMENSION:
        raise ValueError("frozen snapshot is not semantic_768")
    tensor = np.load(manifest["tensor_path"], allow_pickle=False, mmap_mode="r")
    if tensor.dtype != np.float32 or tensor.ndim != 2 or tensor.shape[1] != SEMANTIC_DIMENSION:
        raise ValueError(f"invalid frozen tensor shape/dtype: {tensor.shape} {tensor.dtype}")
    if tensor.shape[0] != manifest.get("row_count"):
        raise ValueError("row_count does not match tensor rows")
    checksum = _sha256_bytes(np.ascontiguousarray(tensor).tobytes(order="C"))
    if checksum != manifest.get("tensor_checksum"):
        raise ValueError("frozen tensor checksum mismatch")

    rows = manifest.get("rows") or []
    canonical_ids = [str(row.get("canonical_id") or "") for row in rows]
    if len(canonical_ids) != tensor.shape[0] or any(not value for value in canonical_ids):
        raise ValueError("frozen row identities are invalid")
    computed_order = _sha256_bytes(_stable_json(canonical_ids))
    if manifest.get("schema") in {"atlas.frozen-semantic-snapshot.v2", "atlas.semantic-snapshot.v1"}:
        if computed_order != manifest.get("canonical_order_checksum"):
            raise ValueError("canonical order checksum mismatch")
    else:
        manifest["canonical_order_checksum"] = computed_order

    if manifest.get("schema") == "atlas.semantic-snapshot.v1":
        if not manifest.get("workspace_revision"):
            raise ValueError("Arrow semantic snapshot missing workspace_revision")
        if not manifest.get("ordinal_map_revision"):
            raise ValueError("Arrow semantic snapshot missing ordinal_map_revision")
        if manifest.get("source_ref_unique") is not True:
            raise ValueError("Arrow semantic snapshot source_ref uniqueness not proven")
        arrow_path = manifest.get("arrow_ipc_path")
        if not arrow_path or not Path(arrow_path).exists():
            raise ValueError("Arrow semantic snapshot artifact missing")
        if _sha256_file(arrow_path) != manifest.get("arrow_ipc_checksum"):
            raise ValueError("Arrow semantic snapshot checksum mismatch")
        if Path(arrow_path).stat().st_size != manifest.get("arrow_ipc_bytes"):
            raise ValueError("Arrow semantic snapshot byte count mismatch")
        if manifest.get("mmap_verified") is not True:
            raise ValueError("Arrow semantic snapshot mmap proof missing")

    return tensor, manifest
