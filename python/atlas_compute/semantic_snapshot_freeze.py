"""Freeze a revision-qualified semantic_768 tensor snapshot from NDJSON rows.

Expected input row fields:
- canonical_id or packet_key
- canonical_revision or source_revision
- embedding (768 finite numbers)
- optional representation_id; if present it must be semantic_768

The output tensor is sorted by canonical identity, written as float32 .npy, and
accompanied by a JSON manifest with two distinct identity hashes:
- row_identity_checksum covers ordinal + ID + revision + source_ref lineage
- canonical_order_checksum covers only the ordered canonical IDs and is the
  cross-feature-block alignment key.
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
    input_file_checksum: str
    ordinal_is_canonical: bool
    producer_revision: str
    canonical_authority: bool

    def to_dict(self) -> dict[str, Any]:
        result = asdict(self)
        result["rows"] = [asdict(row) for row in self.rows]
        return result

def _sha256_bytes(value: bytes) -> str:
    return hashlib.sha256(value).hexdigest()

def _stable_json(value: Any) -> bytes:
    return json.dumps(value, sort_keys=True, separators=(",", ":"), ensure_ascii=False).encode("utf-8")

def freeze_semantic_snapshot(
    input_path: str | Path,
    *,
    tensor_path: str | Path,
    manifest_path: str | Path,
    snapshot_revision: str,
    representation_revision: str,
    producer_revision: str,
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

    tensor_target = Path(tensor_path)
    manifest_target = Path(manifest_path)
    tensor_target.parent.mkdir(parents=True, exist_ok=True)
    manifest_target.parent.mkdir(parents=True, exist_ok=True)
    np.save(tensor_target, matrix, allow_pickle=False)
    tensor_bytes = matrix.tobytes(order="C")

    receipt = FrozenSemanticSnapshotReceipt(
        schema="atlas.frozen-semantic-snapshot.v2",
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
        canonical_order_checksum=_sha256_bytes(_stable_json(canonical_ids)),
        input_file_checksum=_sha256_bytes(raw),
        ordinal_is_canonical=False,
        producer_revision=producer_revision,
        canonical_authority=False,
    )
    manifest_target.write_text(json.dumps(receipt.to_dict(), indent=2, sort_keys=True) + "\n", encoding="utf-8")
    return receipt

def load_and_verify_frozen_snapshot(manifest_path: str | Path) -> tuple[np.ndarray, dict[str, Any]]:
    manifest = json.loads(Path(manifest_path).read_text(encoding="utf-8"))
    if manifest.get("schema") not in {"atlas.frozen-semantic-snapshot.v1", "atlas.frozen-semantic-snapshot.v2"}:
        raise ValueError("unsupported frozen semantic snapshot schema")
    if manifest.get("representation") != SEMANTIC_REPRESENTATION or manifest.get("dimensions") != SEMANTIC_DIMENSION:
        raise ValueError("frozen snapshot is not semantic_768")
    tensor = np.load(manifest["tensor_path"], allow_pickle=False)
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
    if manifest.get("schema") == "atlas.frozen-semantic-snapshot.v2":
        if computed_order != manifest.get("canonical_order_checksum"):
            raise ValueError("canonical order checksum mismatch")
    else:
        # Backward-compatible derived field for v1 manifests; callers can use it
        # without rewriting the original manifest file.
        manifest["canonical_order_checksum"] = computed_order
    return tensor, manifest
