"""Verified PG18 <-> Arrow IPC Handoff Contract (v1).

Implements the three-artifact contract tied to a single `snapshot_checksum`:
  1. Frozen Feature Batch (Arrow IPC stream) with schema metadata:
     - `workspace_revision` (utf8, e.g. `74ac7d8983e`)
     - `snapshot_checksum` (SHA-256 over sorted `(candidate_ordinal, candidate_uuid)`)
     - Columns: `candidate_ordinal` (uint32), `task_id` (utf8), `presence_mask` (uint64 lsb0),
       `feature_score` (float32), `embedding` (list<float32> / fixed_size_list)
  2. Sidecar Ordinal Map: `(candidate_ordinal, candidate_uuid, source_revision, task_id)`
     keyed by `snapshot_checksum`.
  3. Bitmask Invariant: Bit `i` in `bitmask_bytes` corresponds strictly to
     `candidate_ordinal == i` in the frozen batch.

Strictly read-only (`canonical_authority = False`, `writes_performed = False`).
"""

from __future__ import annotations

import hashlib
import io
import json
import math
from dataclasses import dataclass
from typing import Any, Mapping, Sequence

import pyarrow as pa
import pyarrow.ipc as ipc

from python.atlas_graph_runtime.duckdb_bytea_rpc_packet_v1 import (
    decode_rpc_packet_v1,
    encode_rpc_packet_v1,
)


@dataclass(frozen=True)
class OrdinalMapEntryV1:
    candidate_ordinal: int
    candidate_uuid: str
    source_revision: str
    task_id: str


@dataclass(frozen=True)
class FrozenFeatureBatchBundleV1:
    schema: str
    workspace_revision: str
    snapshot_checksum: str
    ordinal_map_checksum: str
    ipc_bytes: bytes
    ordinal_map: tuple[OrdinalMapEntryV1, ...]
    bitmask_bytes: bytes
    canonical_authority: bool = False
    writes_performed: bool = False


def compute_snapshot_checksum_v1(entries: Sequence[OrdinalMapEntryV1]) -> str:
    """Compute deterministic SHA-256 over sorted (candidate_ordinal, candidate_uuid)."""
    ordered = sorted(
        ((int(e.candidate_ordinal), str(e.candidate_uuid)) for e in entries),
        key=lambda item: item[0],
    )
    payload = json.dumps(ordered, separators=(",", ":"), ensure_ascii=True).encode("utf-8")
    return hashlib.sha256(payload).hexdigest()


def compute_ordinal_map_checksum_v1(entries: Sequence[OrdinalMapEntryV1]) -> str:
    """Bind the sidecar identity fields omitted from the snapshot key checksum."""
    ordered = sorted(
        ((int(e.candidate_ordinal), str(e.candidate_uuid), str(e.source_revision), str(e.task_id)) for e in entries),
        key=lambda item: item[0],
    )
    payload = json.dumps(ordered, separators=(",", ":"), ensure_ascii=True).encode("utf-8")
    return hashlib.sha256(payload).hexdigest()


def build_lsb0_bitmask_bytes_v1(active_ordinals: Sequence[int], total_rows: int) -> bytes:
    """Pack bit `i` (lsb0) for each active `candidate_ordinal == i`."""
    if total_rows < 0:
        raise ValueError("TOTAL_ROWS_NEGATIVE")
    buf = bytearray((total_rows + 7) // 8)
    for ordinal in active_ordinals:
        if ordinal < 0 or ordinal >= total_rows:
            raise ValueError(f"BITMASK_ORDINAL_OUT_OF_RANGE:{ordinal}")
        buf[ordinal >> 3] |= 1 << (ordinal & 7)
    return bytes(buf)


def build_frozen_feature_batch_ipc_v1(
    *,
    rows: Sequence[Mapping[str, Any]],
    workspace_revision: str,
    active_ordinals: Sequence[int] | None = None,
) -> FrozenFeatureBatchBundleV1:
    """Build an immutable Arrow IPC stream + sidecar ordinal map + lsb0 bitmask."""
    if not workspace_revision.strip():
        raise ValueError("WORKSPACE_REVISION_REQUIRED")
    if not rows:
        raise ValueError("FROZEN_BATCH_EMPTY")

    ordinal_entries: list[OrdinalMapEntryV1] = []
    ordinals: list[int] = []
    task_ids: list[str] = []
    presence_masks: list[int] = []
    feature_scores: list[float] = []
    embeddings: list[list[float]] = []

    for idx, row in enumerate(rows):
        candidate_uuid = str(row.get("candidate_uuid") or "").strip()
        source_revision = str(row.get("source_revision") or "").strip()
        task_id = str(row.get("task_id") or "").strip()
        if not candidate_uuid or not source_revision or not task_id:
            raise ValueError(f"FROZEN_BATCH_IDENTITY_MISSING:row={idx}")
        ordinal_entries.append(
            OrdinalMapEntryV1(
                candidate_ordinal=idx,
                candidate_uuid=candidate_uuid,
                source_revision=source_revision,
                task_id=task_id,
            )
        )
        ordinals.append(idx)
        task_ids.append(task_id)
        presence_masks.append(int(row.get("presence_mask", 0)))
        feature_scores.append(float(row.get("feature_score", 0.0)))
        embeddings.append([float(x) for x in row.get("embedding", (0.0, 0.0, 0.0, 0.0))])

    candidate_ids = [entry.candidate_uuid for entry in ordinal_entries]
    if len(set(candidate_ids)) != len(candidate_ids):
        raise ValueError("FROZEN_BATCH_DUPLICATE_CANDIDATE_UUID")

    snapshot_checksum = compute_snapshot_checksum_v1(ordinal_entries)
    ordinal_map_checksum = compute_ordinal_map_checksum_v1(ordinal_entries)
    if active_ordinals is None:
        active_ordinals = ordinals
    bitmask_bytes = build_lsb0_bitmask_bytes_v1(active_ordinals, len(rows))

    embedding_dim = len(embeddings[0]) if embeddings else 4
    if any(len(vec) != embedding_dim for vec in embeddings):
        raise ValueError(f"EMBEDDING_DIM_INCONSISTENT:expected={embedding_dim}")

    embedding_type = pa.list_(pa.float32(), embedding_dim)
    schema = pa.schema(
        [
            pa.field("candidate_ordinal", pa.uint32(), nullable=False),
            pa.field("task_id", pa.utf8(), nullable=False),
            pa.field("presence_mask", pa.uint64(), nullable=False),
            pa.field("feature_score", pa.float32(), nullable=False),
            pa.field("embedding", embedding_type, nullable=False),
        ],
        metadata={
            b"workspace_revision": workspace_revision.encode("utf-8"),
            b"snapshot_checksum": snapshot_checksum.encode("utf-8"),
            b"ordinal_map_checksum": ordinal_map_checksum.encode("utf-8"),
        },
    )

    batch = pa.record_batch(
        [
            pa.array(ordinals, type=pa.uint32()),
            pa.array(task_ids, type=pa.utf8()),
            pa.array(presence_masks, type=pa.uint64()),
            pa.array(feature_scores, type=pa.float32()),
            pa.array(embeddings, type=embedding_type),
        ],
        schema=schema,
    )

    sink = io.BytesIO()
    with ipc.new_stream(sink, schema) as writer:
        writer.write_batch(batch)

    return FrozenFeatureBatchBundleV1(
        schema="atlas.pg18-arrow-ipc-roundtrip.v1",
        workspace_revision=workspace_revision,
        snapshot_checksum=snapshot_checksum,
        ordinal_map_checksum=ordinal_map_checksum,
        ipc_bytes=sink.getvalue(),
        ordinal_map=tuple(ordinal_entries),
        bitmask_bytes=bitmask_bytes,
    )


def compute_filtered_topk_from_arrow_ipc_v1(
    ipc_bytes: bytes,
    *,
    bitmask_bytes: bytes,
    top_k: int = 5,
    compression: str = "zlib",
) -> tuple[str, str, list[tuple[int, float, int]], bytes]:
    """Filter the Arrow batch by lsb0 mask and rank its supplied feature scores.

    This is a transport/replay helper, not claim verification or an online
    recommendation authority. Scores must be produced by an upstream lane.
    """
    if top_k <= 0:
        raise ValueError("TOP_K_MUST_BE_POSITIVE")

    reader = ipc.open_stream(io.BytesIO(ipc_bytes))
    schema = reader.schema
    meta = schema.metadata or {}
    workspace_revision = meta.get(b"workspace_revision", b"").decode("utf-8")
    snapshot_checksum = meta.get(b"snapshot_checksum", b"").decode("utf-8")
    ordinal_map_checksum = meta.get(b"ordinal_map_checksum", b"").decode("utf-8")
    if not workspace_revision or not snapshot_checksum or not ordinal_map_checksum:
        raise ValueError("ARROW_SCHEMA_PROVENANCE_MISSING")

    table = reader.read_all()
    ordinals = table.column("candidate_ordinal").to_pylist()
    scores_in = table.column("feature_score").to_pylist()

    if len(bitmask_bytes) < (len(ordinals) + 7) // 8:
        raise ValueError("BITMASK_BYTES_TRUNCATED")

    active_scores: list[tuple[int, float]] = []
    for pos, ordinal in enumerate(ordinals):
        if ordinal != pos:
            raise ValueError(f"ORDINAL_SPACE_NON_DENSE:pos={pos}:ordinal={ordinal}")
        bit_active = (bitmask_bytes[ordinal >> 3] >> (ordinal & 7)) & 1
        if not bit_active:
            continue
        score = float(scores_in[pos])
        if not math.isfinite(score):
            raise ValueError(f"FEATURE_SCORE_NON_FINITE:ordinal={ordinal}")
        active_scores.append((int(ordinal), score))

    # Stable tie-break by batch ordinal. A retrieval score is not a reward,
    # confidence, or verified-claim assertion.
    active_scores.sort(key=lambda item: (-item[1], item[0]))
    ranked = [(ordinal, score, rank + 1) for rank, (ordinal, score) in enumerate(active_scores[:top_k])]

    arpc_bytes = encode_rpc_packet_v1(
        {
            "schema": "atlas.pg18-arrow-compute-result.v1",
            "workspace_revision": workspace_revision,
            "snapshot_checksum": snapshot_checksum,
            "ordinal_map_checksum": ordinal_map_checksum,
            "ranked_ordinals": [
                {"candidate_ordinal": o, "score": s, "rank": r} for o, s, r in ranked
            ],
            "canonical_authority": False,
        },
        compression=compression,
    )
    return snapshot_checksum, workspace_revision, ranked, arpc_bytes


def rejoin_and_verify_ordinals_v1(
    *,
    expected_snapshot_checksum: str,
    expected_workspace_revision: str,
    ordinal_map: Sequence[OrdinalMapEntryV1],
    bitmask_bytes: bytes,
    arpc_bytes: bytes,
) -> list[dict[str, Any]]:
    """Rejoin compute-returned ordinals back to canonical UUIDs, failing closed on any drift."""
    decoded = decode_rpc_packet_v1(arpc_bytes)
    if decoded.get("snapshot_checksum") != expected_snapshot_checksum:
        raise ValueError("SNAPSHOT_CHECKSUM_MISMATCH")
    if decoded.get("workspace_revision") != expected_workspace_revision:
        raise ValueError("WORKSPACE_REVISION_DRIFT")

    recomputed_checksum = compute_snapshot_checksum_v1(ordinal_map)
    if recomputed_checksum != expected_snapshot_checksum:
        raise ValueError("ORDINAL_MAP_CHECKSUM_DRIFT")

    decoded_ordinal_map_checksum = decoded.get("ordinal_map_checksum")
    if decoded_ordinal_map_checksum != compute_ordinal_map_checksum_v1(ordinal_map):
        raise ValueError("ORDINAL_MAP_IDENTITY_CHECKSUM_DRIFT")

    expected_ordinals = list(range(len(ordinal_map)))
    actual_ordinals = sorted(entry.candidate_ordinal for entry in ordinal_map)
    if actual_ordinals != expected_ordinals:
        raise ValueError("ORDINAL_MAP_NOT_DENSE_OR_UNIQUE")
    candidate_ids = [entry.candidate_uuid for entry in ordinal_map]
    if len(set(candidate_ids)) != len(candidate_ids):
        raise ValueError("ORDINAL_MAP_DUPLICATE_CANDIDATE_UUID")
    if len(bitmask_bytes) < (len(ordinal_map) + 7) // 8:
        raise ValueError("BITMASK_BYTES_TRUNCATED")

    by_ordinal = {entry.candidate_ordinal: entry for entry in ordinal_map}
    seen_ordinals: set[int] = set()
    resolved: list[dict[str, Any]] = []

    for item in decoded.get("ranked_ordinals", []):
        ordinal = int(item["candidate_ordinal"])
        if ordinal in seen_ordinals:
            raise ValueError(f"DUPLICATE_CANDIDATE_ORDINAL:{ordinal}")
        seen_ordinals.add(ordinal)

        entry = by_ordinal.get(ordinal)
        if entry is None:
            raise ValueError(f"ORPHANED_CANDIDATE_ORDINAL:{ordinal}")

        bit_active = (bitmask_bytes[ordinal >> 3] >> (ordinal & 7)) & 1
        if not bit_active:
            raise ValueError(f"BITMASK_INVARIANT_VIOLATION:{ordinal}")

        resolved.append(
            {
                "candidate_ordinal": ordinal,
                "candidate_uuid": entry.candidate_uuid,
                "source_revision": entry.source_revision,
                "task_id": entry.task_id,
                "workspace_revision": expected_workspace_revision,
                "snapshot_checksum": expected_snapshot_checksum,
                "score": float(item["score"]),
                "rank": int(item["rank"]),
                "canonical_authority": False,
            }
        )
    return resolved


def extract_live_pg18_frozen_batch_v1(
    dsn: str,
    *,
    workspace_revision: str,
    limit: int = 128,
) -> FrozenFeatureBatchBundleV1:
    """Deprecated fail-closed entry point for an unqualified legacy query.

    The old implementation synthesized source revisions and scores, so it
    could not establish a qualified PG18 candidate batch. Callers must obtain
    candidates from the canonical retrieval owner, verify authorization and
    revisions, then provide those rows to ``build_frozen_feature_batch_ipc_v1``.
    """
    del dsn, workspace_revision, limit
    raise RuntimeError("PG18_QUALIFIED_CANDIDATE_QUERY_REQUIRED")


if __name__ == "__main__":
    import argparse
    import os

    parser = argparse.ArgumentParser(description="PG18 <-> Arrow IPC roundtrip verifier")
    parser.add_argument("--live-pg", action="store_true", help="Run against live PG18 DATABASE_URL")
    parser.add_argument("--workspace-revision", default="74ac7d8983e")
    parser.add_argument("--limit", type=int, default=32)
    args = parser.parse_args()

    if args.live_pg:
        dsn = os.environ.get("DATABASE_URL") or ""
        if not dsn:
            raise SystemExit("DATABASE_URL environment variable is required with --live-pg")
        bundle = extract_live_pg18_frozen_batch_v1(
            dsn, workspace_revision=args.workspace_revision, limit=args.limit
        )
        chk, rev, ranked, arpc = compute_filtered_topk_from_arrow_ipc_v1(
            bundle.ipc_bytes, bitmask_bytes=bundle.bitmask_bytes, top_k=min(10, args.limit)
        )
        rejoined = rejoin_and_verify_ordinals_v1(
            expected_snapshot_checksum=chk,
            expected_workspace_revision=rev,
            ordinal_map=bundle.ordinal_map,
            bitmask_bytes=bundle.bitmask_bytes,
            arpc_bytes=arpc,
        )
        print(json.dumps({"ok": True, "snapshot_checksum": chk, "rejoined_count": len(rejoined)}, indent=2))
