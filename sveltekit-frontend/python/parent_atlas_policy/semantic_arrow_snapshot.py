"""Write/read a revision-frozen semantic_768 Arrow IPC snapshot.

This module is a transport/materialization helper, not a semantic identity owner.
Rows must already carry canonical ordinals, packet/source identity and revisions.
Arrow is used because its IPC file format supports random access and memory-mapped
consumption across Python/RAPIDS/native workers without JSON object expansion.
"""
from __future__ import annotations

from dataclasses import asdict, dataclass
from hashlib import sha256
import json
from pathlib import Path
from typing import Any, Iterable, Mapping, Sequence

SEMANTIC_DIM = 768


@dataclass(frozen=True)
class SemanticArrowSnapshotReceiptV1:
    schema: str
    snapshot_id: str
    path: str
    row_count: int
    semantic_dimension: int
    workspace_revision: str
    source_revision: str
    representation_revision: str
    file_checksum: str
    canonical_order_checksum: str
    producer_revision: str
    canonical_writes: bool = False


def _require_pyarrow():
    try:
        import pyarrow as pa  # type: ignore
        import pyarrow.ipc as ipc  # type: ignore
    except ImportError as exc:  # pragma: no cover - dependency proof gate
        raise RuntimeError("pyarrow is required for Arrow snapshot materialization") from exc
    return pa, ipc


def _norm_row(row: Mapping[str, Any]) -> dict[str, Any]:
    ordinal = int(row.get("ordinal"))
    packet_key = str(row.get("packet_key") or row.get("packetKey") or "").strip()
    source_ref = str(row.get("source_ref") or row.get("sourceRef") or "").strip()
    workspace_revision = str(row.get("workspace_revision") or row.get("workspaceRevision") or "").strip()
    source_revision = str(row.get("source_revision") or row.get("sourceRevision") or "").strip()
    representation_revision = str(
        row.get("representation_revision") or row.get("representationRevision") or ""
    ).strip()
    vector = row.get("semantic_768") or row.get("semantic768") or row.get("vector")

    if not all((packet_key, source_ref, workspace_revision, source_revision, representation_revision)):
        raise ValueError("packet/source/revision fields are required")
    if not isinstance(vector, Sequence) or isinstance(vector, (str, bytes, bytearray)):
        raise ValueError("semantic_768 must be a numeric sequence")
    if len(vector) != SEMANTIC_DIM:
        raise ValueError(f"semantic_768 must have {SEMANTIC_DIM} values")

    values = [float(v) for v in vector]
    if any(v != v or v in (float("inf"), float("-inf")) for v in values):
        raise ValueError("semantic_768 contains non-finite values")

    return {
        "ordinal": ordinal,
        "packet_key": packet_key,
        "source_ref": source_ref,
        "canonical_id": str(row.get("canonical_id") or row.get("canonicalId") or ""),
        "workspace_revision": workspace_revision,
        "source_revision": source_revision,
        "representation_revision": representation_revision,
        "semantic_768": values,
    }


def _sha256_file(path: Path) -> str:
    digest = sha256()
    with path.open("rb") as fh:
        for block in iter(lambda: fh.read(1024 * 1024), b""):
            digest.update(block)
    return "sha256:" + digest.hexdigest()


def _canonical_order_checksum(rows: Sequence[Mapping[str, Any]]) -> str:
    payload = [
        {
            "ordinal": int(row["ordinal"]),
            "packet_key": str(row["packet_key"]),
            "source_ref": str(row["source_ref"]),
            "workspace_revision": str(row["workspace_revision"]),
            "source_revision": str(row["source_revision"]),
            "representation_revision": str(row["representation_revision"]),
        }
        for row in rows
    ]
    data = json.dumps(payload, sort_keys=True, separators=(",", ":")).encode("utf-8")
    return "sha256:" + sha256(data).hexdigest()


def write_semantic_arrow_snapshot(
    rows: Iterable[Mapping[str, Any]],
    *,
    output_path: str | Path,
    snapshot_id: str,
    producer_revision: str,
) -> SemanticArrowSnapshotReceiptV1:
    pa, ipc = _require_pyarrow()
    normalized = sorted((_norm_row(row) for row in rows), key=lambda row: row["ordinal"])
    if not normalized:
        raise ValueError("snapshot must contain at least one row")

    ordinals = [row["ordinal"] for row in normalized]
    if len(ordinals) != len(set(ordinals)):
        raise ValueError("canonical ordinals must be unique")

    revision_sets = {
        "workspace": {row["workspace_revision"] for row in normalized},
        "source": {row["source_revision"] for row in normalized},
        "representation": {row["representation_revision"] for row in normalized},
    }
    if any(len(values) != 1 for values in revision_sets.values()):
        raise ValueError("all snapshot rows must share one revision tuple")

    vector_type = pa.list_(pa.float32(), SEMANTIC_DIM)
    schema = pa.schema(
        [
            ("ordinal", pa.uint32()),
            ("packet_key", pa.string()),
            ("source_ref", pa.string()),
            ("canonical_id", pa.string()),
            ("workspace_revision", pa.string()),
            ("source_revision", pa.string()),
            ("representation_revision", pa.string()),
            ("semantic_768", vector_type),
        ],
        metadata={
            b"atlas.schema": b"atlas.semantic-arrow-snapshot.v1",
            b"atlas.snapshot_id": snapshot_id.encode("utf-8"),
            b"atlas.producer_revision": producer_revision.encode("utf-8"),
        },
    )

    table = pa.Table.from_arrays(
        [
            pa.array([r["ordinal"] for r in normalized], type=pa.uint32()),
            pa.array([r["packet_key"] for r in normalized], type=pa.string()),
            pa.array([r["source_ref"] for r in normalized], type=pa.string()),
            pa.array([r["canonical_id"] for r in normalized], type=pa.string()),
            pa.array([r["workspace_revision"] for r in normalized], type=pa.string()),
            pa.array([r["source_revision"] for r in normalized], type=pa.string()),
            pa.array([r["representation_revision"] for r in normalized], type=pa.string()),
            pa.array([r["semantic_768"] for r in normalized], type=vector_type),
        ],
        schema=schema,
    )

    path = Path(output_path)
    path.parent.mkdir(parents=True, exist_ok=True)
    with pa.OSFile(str(path), "wb") as sink:
        with ipc.new_file(sink, schema) as writer:
            writer.write_table(table)

    receipt = SemanticArrowSnapshotReceiptV1(
        schema="atlas.semantic-arrow-snapshot-receipt.v1",
        snapshot_id=snapshot_id,
        path=str(path),
        row_count=len(normalized),
        semantic_dimension=SEMANTIC_DIM,
        workspace_revision=next(iter(revision_sets["workspace"])),
        source_revision=next(iter(revision_sets["source"])),
        representation_revision=next(iter(revision_sets["representation"])),
        file_checksum=_sha256_file(path),
        canonical_order_checksum=_canonical_order_checksum(normalized),
        producer_revision=producer_revision,
    )
    return receipt


def open_semantic_arrow_snapshot_mmap(path: str | Path):
    """Open an Arrow IPC file through a memory-mapped source for read-only analysis."""
    pa, ipc = _require_pyarrow()
    source = pa.memory_map(str(path), "r")
    reader = ipc.open_file(source)
    return source, reader


def receipt_to_json(receipt: SemanticArrowSnapshotReceiptV1) -> str:
    return json.dumps(asdict(receipt), sort_keys=True, separators=(",", ":"))
