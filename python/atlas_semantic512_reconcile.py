#!/usr/bin/env python3
"""Reconcile the historical Qdrant semantic_512 corpus to canonical Postgres identity.

The original `codebase_chunks_512` test sync used `codebase_chunk_index.id` as the
Qdrant point id, but wrote placeholder payload identity (`packet:<id>` and a
content-hash prefix as `source_ref`). This reconciler therefore treats Qdrant
payload identity as untrusted legacy metadata and derives identity through:

    Qdrant point.id
      -> codebase_chunk_index.id
      -> codebase_chunk_index.source_ref + content_hash
      -> atlas_packets packet_key / packet_id / artifact_id / source_ref

Default mode is READ ONLY. It writes:
- an NDJSON row manifest containing ADMITTED / REVIEW / REJECTED rows;
- a JSON reconciliation receipt with a deterministic manifest checksum.

`--apply-payload` updates payload metadata only (never vectors), and only when
`--expected-manifest-checksum` matches the just-computed dry-run manifest.

The reconciliation is a prerequisite for AE/KMeans training. It intentionally
never invents `source_revision`: the live atlas_packets audit found no canonical
column with that meaning. Source state is anchored by source_ref, content hashes,
Postgres snapshot identity, workspace/representation revisions, and mutation
receipts elsewhere in the DAG.
"""

from __future__ import annotations

import argparse
import hashlib
import json
import math
import os
import re
import struct
import urllib.request
from collections import Counter, defaultdict
from dataclasses import dataclass
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Iterable

import numpy as np
import psycopg2
from psycopg2.extras import RealDictCursor

COLLECTION = "codebase_chunks_512"
SEMANTIC_REPRESENTATION = "semantic_512"
SEMANTIC_DIM = 512
NATIVE_MODEL_DIM = 768
ALGORITHM_REVISION = "atlas.semantic512-reconciliation.v1"
DEFAULT_DATABASE_URL = "postgresql://legal_admin:123456@127.0.0.1:5434/legal_ai_db"
DEFAULT_QDRANT_URL = "http://127.0.0.1:6333"
SCROLL_BATCH = 256
UUID_RE = re.compile(
    r"^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$", re.IGNORECASE
)


def is_uuid(value: Any) -> bool:
    return isinstance(value, str) and bool(UUID_RE.match(value))


def resolve_chunk_lookup_id(point: dict[str, Any]) -> str | None:
    """Return the codebase_chunk_index.id (uuid) this point's chunk row lives under.

    Two producer generations coexist in codebase_chunks_512: the majority
    (`phase-embedding-lanes-qdrant-sync.mts` original sync) writes
    `point.id = codebase_chunk_index.id` directly (a uuid). A later
    `fallback-512d` backfill (same file, `phase4SyncFallback512d`) instead
    reused whatever integer point id the *source* `codebase_chunks_768`
    collection happened to have and stamped the true `codebase_chunk_index.id`
    into `payload.representation_id` instead. Point id is therefore NOT a
    reliable lookup key by itself -- it must be UUID-shaped to be trusted, and
    non-UUID point ids fall back to payload.representation_id.
    """
    point_id = point.get("id")
    if is_uuid(point_id):
        return str(point_id)
    payload = point.get("payload") or {}
    representation_id = payload.get("representation_id")
    if is_uuid(representation_id):
        return str(representation_id)
    return None


@dataclass(frozen=True)
class CanonicalPacket:
    packet_key: str
    packet_id: str | None
    artifact_id: str | None
    source_ref: str
    tree_node_id: str | None
    feature_label: str | None
    workspace_revision: int | None
    representation_revision: int | None
    source_representation_id: str | None
    source_dimension: int | None
    qdrant_collection: str | None
    qdrant_vector_dim: int | None
    sha256: str | None
    lineage_version: str | None


def utc_now() -> str:
    return datetime.now(timezone.utc).isoformat()


def normalize_source_ref(value: Any) -> str:
    text = str(value or "").strip().replace("\\", "/")
    while text.startswith("./"):
        text = text[2:]
    while "//" in text:
        text = text.replace("//", "/")
    return text.rstrip("/")


def canonical_json(value: Any) -> str:
    return json.dumps(value, ensure_ascii=False, sort_keys=True, separators=(",", ":"))


def sha256_text(value: str) -> str:
    return hashlib.sha256(value.encode("utf-8")).hexdigest()


def vector_digest(vector: list[float]) -> str:
    if len(vector) != SEMANTIC_DIM:
        raise ValueError(f"vector dimension {len(vector)} != {SEMANTIC_DIM}")
    values = np.asarray(vector, dtype=np.float32)
    if not np.isfinite(values).all():
        raise ValueError("vector contains non-finite values")
    return hashlib.sha256(values.tobytes(order="C")).hexdigest()


def extract_vector(point: dict[str, Any]) -> list[float]:
    raw = point.get("vector")
    if isinstance(raw, dict):
        values = list(raw.values())
        if len(values) != 1:
            raise ValueError("ambiguous named vectors in semantic_512 point")
        raw = values[0]
    if not isinstance(raw, list):
        raise ValueError("point has no vector")
    return [float(value) for value in raw]


def expected_packet_key(source_ref: str, content_hash: str | None) -> str | None:
    if not source_ref or not content_hash:
        return None
    return f"{normalize_source_ref(source_ref)}:{str(content_hash)[:16]}"


def post_json(url: str, body: dict[str, Any], timeout: int = 120) -> dict[str, Any]:
    request = urllib.request.Request(
        url,
        data=json.dumps(body).encode("utf-8"),
        method="POST",
        headers={"Content-Type": "application/json"},
    )
    with urllib.request.urlopen(request, timeout=timeout) as response:  # nosec B310 - operator local service
        return json.load(response)


def scroll_qdrant(qdrant_url: str, limit: int | None) -> Iterable[list[dict[str, Any]]]:
    offset: Any = None
    seen = 0
    base = qdrant_url.rstrip("/")
    while limit is None or seen < limit:
        page_limit = min(SCROLL_BATCH, (limit - seen) if limit is not None else SCROLL_BATCH)
        body: dict[str, Any] = {
            "limit": page_limit,
            "with_payload": True,
            "with_vector": True,
        }
        if offset is not None:
            body["offset"] = offset
        result = post_json(f"{base}/collections/{COLLECTION}/points/scroll", body).get("result", {})
        points = list(result.get("points") or [])
        if not points:
            break
        yield points
        seen += len(points)
        offset = result.get("next_page_offset")
        if offset is None:
            break


def table_columns(cursor: RealDictCursor, table_name: str) -> set[str]:
    cursor.execute(
        """
        SELECT column_name
          FROM information_schema.columns
         WHERE table_schema='public' AND table_name=%s
        """,
        (table_name,),
    )
    return {str(row["column_name"]) for row in cursor.fetchall()}


def db_snapshot(cursor: RealDictCursor) -> dict[str, Any]:
    cursor.execute(
        """
        SELECT pg_current_snapshot()::text AS snapshot,
               transaction_timestamp()::text AS transaction_timestamp
        """
    )
    row = cursor.fetchone()
    return {
        "postgresSnapshot": row["snapshot"],
        "transactionTimestamp": row["transaction_timestamp"],
        "isolation": "REPEATABLE READ",
        "readOnly": True,
    }


def chunk_rows(cursor: RealDictCursor, lookup_ids: list[str]) -> dict[str, dict[str, Any]]:
    if not lookup_ids:
        return {}
    cursor.execute(
        """
        SELECT id::text AS id, source_ref, content_hash
          FROM codebase_chunk_index
         WHERE id = ANY(%s::uuid[])
        """,
        (lookup_ids,),
    )
    return {str(row["id"]): dict(row) for row in cursor.fetchall()}


def packet_rows(
    cursor: RealDictCursor,
    columns: set[str],
    expected_keys: list[str],
    packet_ids: list[str],
    artifact_ids: list[str],
    source_refs: list[str],
    legacy_payload_keys: list[str],
) -> list[CanonicalPacket]:
    optional = [
        "packet_id", "artifact_id", "tree_node_id", "feature_label",
        "workspace_revision", "representation_revision", "source_representation_id",
        "source_dimension", "qdrant_collection", "qdrant_vector_dim", "sha256",
        "lineage_version",
    ]
    select_parts = ["packet_key", "source_ref"]
    for name in optional:
        select_parts.append(name if name in columns else f"NULL AS {name}")

    clauses: list[str] = []
    params: list[Any] = []
    for field, values in (
        ("packet_key", list(dict.fromkeys(expected_keys + legacy_payload_keys))),
        ("packet_id", packet_ids),
        ("artifact_id", artifact_ids),
        ("source_ref", source_refs),
    ):
        if field not in columns or not values:
            continue
        clauses.append(f"{field} = ANY(%s)")
        params.append(list(dict.fromkeys(values)))
    if not clauses:
        return []

    cursor.execute(
        f"SELECT {', '.join(select_parts)} FROM atlas_packets WHERE " + " OR ".join(clauses),
        tuple(params),
    )
    out: list[CanonicalPacket] = []
    for row in cursor.fetchall():
        out.append(
            CanonicalPacket(
                packet_key=str(row["packet_key"]),
                packet_id=None if row["packet_id"] is None else str(row["packet_id"]),
                artifact_id=None if row["artifact_id"] is None else str(row["artifact_id"]),
                source_ref=normalize_source_ref(row["source_ref"]),
                tree_node_id=None if row["tree_node_id"] is None else str(row["tree_node_id"]),
                feature_label=None if row["feature_label"] is None else str(row["feature_label"]),
                workspace_revision=None if row["workspace_revision"] is None else int(row["workspace_revision"]),
                representation_revision=None if row["representation_revision"] is None else int(row["representation_revision"]),
                source_representation_id=None if row["source_representation_id"] is None else str(row["source_representation_id"]),
                source_dimension=None if row["source_dimension"] is None else int(row["source_dimension"]),
                qdrant_collection=None if row["qdrant_collection"] is None else str(row["qdrant_collection"]),
                qdrant_vector_dim=None if row["qdrant_vector_dim"] is None else int(row["qdrant_vector_dim"]),
                sha256=None if row["sha256"] is None else str(row["sha256"]),
                lineage_version=None if row["lineage_version"] is None else str(row["lineage_version"]),
            )
        )
    return out


def classify_candidate(
    point: dict[str, Any],
    chunk: dict[str, Any] | None,
    packets: list[CanonicalPacket],
) -> tuple[str, str, CanonicalPacket | None, dict[str, Any]]:
    payload = point.get("payload") or {}
    point_id = str(point.get("id"))
    if chunk is None:
        return "REJECTED", "NO_CODEBASE_CHUNK_ROW", None, {}

    source_ref = normalize_source_ref(chunk.get("source_ref"))
    content_hash = None if chunk.get("content_hash") is None else str(chunk.get("content_hash"))
    expected_key = expected_packet_key(source_ref, content_hash)
    legacy_payload_key = str(payload.get("packet_key") or "").strip() or None

    scored: list[tuple[int, CanonicalPacket, list[str]]] = []
    for packet in packets:
        score = 0
        reasons: list[str] = []
        if expected_key and packet.packet_key == expected_key:
            score += 100
            reasons.append("EXPECTED_PACKET_KEY")
        if content_hash and packet.packet_id == content_hash:
            score += 90
            reasons.append("CONTENT_HASH_PACKET_ID")
        if packet.artifact_id == point_id:
            score += 80
            reasons.append("POINT_ID_ARTIFACT_ID")
        if source_ref and packet.source_ref == source_ref:
            score += 10
            reasons.append("SOURCE_REF")
        if legacy_payload_key and packet.packet_key == legacy_payload_key:
            score += 5
            reasons.append("LEGACY_PAYLOAD_PACKET_KEY")
        if score:
            scored.append((score, packet, reasons))

    if not scored:
        return "REJECTED", "NO_ATLAS_PACKET_MATCH", None, {
            "expectedPacketKey": expected_key,
            "chunkSourceRef": source_ref,
        }

    scored.sort(key=lambda item: (-item[0], item[1].packet_key))
    top_score = scored[0][0]
    top = [item for item in scored if item[0] == top_score]
    if len(top) != 1:
        return "REVIEW", "AMBIGUOUS_TOP_MATCH", None, {
            "topScore": top_score,
            "candidatePacketKeys": [item[1].packet_key for item in top],
        }

    _, packet, reasons = top[0]
    if source_ref and packet.source_ref != source_ref:
        return "REVIEW", "IDENTIFIER_MATCH_SOURCE_REF_CONFLICT", packet, {
            "matchReasons": reasons,
            "chunkSourceRef": source_ref,
            "packetSourceRef": packet.source_ref,
        }

    strong = any(reason in reasons for reason in ("EXPECTED_PACKET_KEY", "CONTENT_HASH_PACKET_ID", "POINT_ID_ARTIFACT_ID"))
    if not strong:
        return "REVIEW", "SOURCE_REF_ONLY_MATCH", packet, {"matchReasons": reasons}

    return "ADMITTED", "STRONG_CANONICAL_MATCH", packet, {
        "matchReasons": reasons,
        "expectedPacketKey": expected_key,
        "legacyPayloadPacketKey": legacy_payload_key,
        "legacyPayloadSourceRef": payload.get("source_ref"),
    }


def build_row(
    point: dict[str, Any],
    chunk: dict[str, Any] | None,
    packet: CanonicalPacket | None,
    status: str,
    classification: str,
    details: dict[str, Any],
    observed_at: str,
    snapshot: dict[str, Any],
) -> dict[str, Any]:
    payload = point.get("payload") or {}
    vector: list[float] | None = None
    vector_error: str | None = None
    digest: str | None = None
    try:
        vector = extract_vector(point)
        digest = vector_digest(vector)
    except Exception as exc:
        vector_error = str(exc)
        status = "REJECTED"
        classification = "INVALID_SEMANTIC512_VECTOR"

    chunk_source_ref = normalize_source_ref(chunk.get("source_ref")) if chunk else None
    chunk_hash = None if not chunk or chunk.get("content_hash") is None else str(chunk.get("content_hash"))
    canonical_source_ref = packet.source_ref if packet else chunk_source_ref

    source_version_receipt = {
        "schema": "atlas.source-version-receipt.v1",
        "observedAt": observed_at,
        "postgresSnapshot": snapshot["postgresSnapshot"],
        "sourceRef": canonical_source_ref,
        "chunkContentHash": chunk_hash,
        "packetSha256": packet.sha256 if packet else None,
        "workspaceRevision": packet.workspace_revision if packet else None,
        "representationRevision": packet.representation_revision if packet else None,
        "lineageVersion": packet.lineage_version if packet else None,
        "sourceRevision": None,
        "sourceRevisionAuthority": "ABSENT_IN_LIVE_ATLAS_PACKETS",
    }
    source_version_receipt_id = sha256_text(canonical_json(source_version_receipt))

    return {
        "schema": "atlas.semantic512-reconciliation-row.v1",
        "status": status,
        "classification": classification,
        "details": details,
        "pointId": point.get("id"),
        "legacyPayload": {
            "packetKey": payload.get("packet_key"),
            "sourceRef": payload.get("source_ref"),
            "contentHash": payload.get("content_hash"),
            "quantizedFrom": payload.get("quantized_from"),
            "quantizationMethod": payload.get("quantization_method"),
        },
        "codebaseChunk": {
            "id": None if chunk is None else str(chunk.get("id")),
            "sourceRef": chunk_source_ref,
            "contentHash": chunk_hash,
        },
        "canonical": None if packet is None else {
            "packetKey": packet.packet_key,
            "packetId": packet.packet_id,
            "artifactId": packet.artifact_id,
            "sourceRef": packet.source_ref,
            "treeNodeId": packet.tree_node_id,
            "featureLabel": packet.feature_label,
            "workspaceRevision": packet.workspace_revision,
            "representationRevision": packet.representation_revision,
            "sourceRepresentationId": packet.source_representation_id,
            "sourceDimension": packet.source_dimension,
            "qdrantCollection": packet.qdrant_collection,
            "qdrantVectorDim": packet.qdrant_vector_dim,
            "lineageVersion": packet.lineage_version,
        },
        "representation": {
            "representationId": SEMANTIC_REPRESENTATION,
            "dimension": SEMANTIC_DIM,
            "nativeModelDimension": NATIVE_MODEL_DIM,
            "vectorDigest": digest,
            "vectorError": vector_error,
        },
        "sourceVersionReceipt": source_version_receipt,
        "sourceVersionReceiptId": source_version_receipt_id,
    }


def payload_patch(row: dict[str, Any], reconciliation_receipt_id: str) -> dict[str, Any]:
    canonical = row["canonical"]
    if row["status"] != "ADMITTED" or not canonical:
        raise ValueError("payload_patch requires ADMITTED canonical row")
    return {
        "packet_key": canonical["packetKey"],
        "source_ref": canonical["sourceRef"],
        "tree_node_id": canonical["treeNodeId"],
        "feature_label": canonical["featureLabel"],
        "workspace_revision": canonical["workspaceRevision"],
        "representation_revision": canonical["representationRevision"],
        "source_representation_id": SEMANTIC_REPRESENTATION,
        "source_dimension": SEMANTIC_DIM,
        "native_model_dimension": NATIVE_MODEL_DIM,
        "source_version_receipt_id": row["sourceVersionReceiptId"],
        "reconciliation_receipt_id": reconciliation_receipt_id,
    }


def apply_payloads(qdrant_url: str, rows: list[dict[str, Any]], receipt_id: str, batch_size: int) -> int:
    base = qdrant_url.rstrip("/")
    # Qdrant set-payload applies one payload to a list of points, while each row
    # has different canonical metadata. Keep writes individually precise; this
    # is metadata-only and intentionally slower than risking cross-row leakage.
    applied = 0
    for row in rows:
        if row["status"] != "ADMITTED":
            continue
        post_json(
            f"{base}/collections/{COLLECTION}/points/payload?wait=true",
            {"payload": payload_patch(row, receipt_id), "points": [row["pointId"]]},
        )
        applied += 1
    return applied


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--database-url", default=os.getenv("DATABASE_URL", DEFAULT_DATABASE_URL))
    parser.add_argument("--qdrant-url", default=os.getenv("QDRANT_URL", DEFAULT_QDRANT_URL))
    parser.add_argument("--limit", type=int, default=None)
    parser.add_argument("--manifest-out", type=Path, default=Path("data/atlas-ml/semantic512-reconciliation.ndjson"))
    parser.add_argument("--receipt-out", type=Path, default=Path("data/atlas-ml/semantic512-reconciliation-receipt.json"))
    parser.add_argument("--apply-payload", action="store_true")
    parser.add_argument("--expected-manifest-checksum", default=None)
    parser.add_argument("--batch-size", type=int, default=128)
    args = parser.parse_args()

    observed_at = utc_now()
    rows: list[dict[str, Any]] = []
    counts: Counter[str] = Counter()

    conn = psycopg2.connect(args.database_url)
    conn.set_session(isolation_level="REPEATABLE READ", readonly=True, autocommit=False)
    try:
        with conn.cursor(cursor_factory=RealDictCursor) as cursor:
            required_relations = ("codebase_chunk_index", "atlas_packets")
            for relation in required_relations:
                cursor.execute("SELECT to_regclass(%s)::text AS relation", (f"public.{relation}",))
                if cursor.fetchone()["relation"] is None:
                    raise RuntimeError(f"required relation missing: {relation}")

            atlas_columns = table_columns(cursor, "atlas_packets")
            if "packet_key" not in atlas_columns or "source_ref" not in atlas_columns:
                raise RuntimeError("atlas_packets lacks packet_key/source_ref")
            snapshot = db_snapshot(cursor)

            for page in scroll_qdrant(args.qdrant_url, args.limit):
                lookup_ids = [
                    lookup_id
                    for lookup_id in (resolve_chunk_lookup_id(point) for point in page)
                    if lookup_id is not None
                ]
                chunks = chunk_rows(cursor, lookup_ids)

                expected_keys: list[str] = []
                packet_ids: list[str] = []
                artifact_ids: list[str] = []
                source_refs: list[str] = []
                legacy_keys: list[str] = []
                for point in page:
                    point_id = str(point.get("id"))
                    lookup_id = resolve_chunk_lookup_id(point)
                    chunk = chunks.get(lookup_id) if lookup_id else None
                    if chunk:
                        source_ref = normalize_source_ref(chunk.get("source_ref"))
                        content_hash = None if chunk.get("content_hash") is None else str(chunk.get("content_hash"))
                        expected = expected_packet_key(source_ref, content_hash)
                        if expected:
                            expected_keys.append(expected)
                        if content_hash:
                            packet_ids.append(content_hash)
                        if source_ref:
                            source_refs.append(source_ref)
                    artifact_ids.append(point_id)
                    legacy = str((point.get("payload") or {}).get("packet_key") or "").strip()
                    if legacy:
                        legacy_keys.append(legacy)

                packets = packet_rows(
                    cursor,
                    atlas_columns,
                    expected_keys,
                    packet_ids,
                    artifact_ids,
                    source_refs,
                    legacy_keys,
                )

                for point in page:
                    lookup_id = resolve_chunk_lookup_id(point)
                    chunk = chunks.get(lookup_id) if lookup_id else None
                    status, classification, packet, details = classify_candidate(point, chunk, packets)
                    row = build_row(point, chunk, packet, status, classification, details, observed_at, snapshot)
                    rows.append(row)
                    counts[row["status"]] += 1
                    counts[f"class:{row['classification']}"] += 1
    finally:
        conn.rollback()
        conn.close()

    rows.sort(key=lambda row: str(row["pointId"]))
    manifest_lines = [canonical_json(row) for row in rows]
    manifest_bytes = ("\n".join(manifest_lines) + ("\n" if manifest_lines else "")).encode("utf-8")
    manifest_checksum = hashlib.sha256(manifest_bytes).hexdigest()
    admitted = [row for row in rows if row["status"] == "ADMITTED"]
    receipt_id = sha256_text(
        canonical_json(
            {
                "algorithmRevision": ALGORITHM_REVISION,
                "collection": COLLECTION,
                "manifestChecksum": manifest_checksum,
                "postgresSnapshot": snapshot,
                "rowCount": len(rows),
                "admittedCount": len(admitted),
            }
        )
    )

    receipt: dict[str, Any] = {
        "schema": "atlas.semantic512-reconciliation-receipt.v1",
        "receiptId": receipt_id,
        "algorithmRevision": ALGORITHM_REVISION,
        "collection": COLLECTION,
        "representationId": SEMANTIC_REPRESENTATION,
        "dimension": SEMANTIC_DIM,
        "nativeModelDimension": NATIVE_MODEL_DIM,
        "observedAt": observed_at,
        "postgresSnapshot": snapshot,
        "manifestChecksum": manifest_checksum,
        "rowCount": len(rows),
        "admittedCount": len(admitted),
        "reviewCount": counts["REVIEW"],
        "rejectedCount": counts["REJECTED"],
        "classificationCounts": {
            key.removeprefix("class:"): value
            for key, value in sorted(counts.items())
            if key.startswith("class:")
        },
        "sourceRevisionPolicy": "ABSENT_DO_NOT_FABRICATE",
        "identityDerivation": [
            "qdrant_point_id -> codebase_chunk_index.id",
            "codebase_chunk_index.source_ref + content_hash -> expected atlas packet identity",
            "atlas_packets exact identifiers converge -> ADMITTED",
        ],
        "payloadApplied": False,
    }

    if args.apply_payload:
        if not args.expected_manifest_checksum:
            raise RuntimeError("--apply-payload requires --expected-manifest-checksum from a reviewed dry-run")
        if args.expected_manifest_checksum != manifest_checksum:
            raise RuntimeError(
                f"manifest checksum changed: expected {args.expected_manifest_checksum}, got {manifest_checksum}; refusing writes"
            )
        receipt["payloadUpsertedRows"] = apply_payloads(args.qdrant_url, admitted, receipt_id, args.batch_size)
        receipt["payloadApplied"] = True

    args.manifest_out.parent.mkdir(parents=True, exist_ok=True)
    args.manifest_out.write_bytes(manifest_bytes)
    args.receipt_out.parent.mkdir(parents=True, exist_ok=True)
    args.receipt_out.write_text(json.dumps(receipt, indent=2, sort_keys=True) + "\n", encoding="utf-8")
    print(json.dumps(receipt, sort_keys=True))
    return 0 if len(admitted) > 0 else 2


if __name__ == "__main__":
    raise SystemExit(main())
