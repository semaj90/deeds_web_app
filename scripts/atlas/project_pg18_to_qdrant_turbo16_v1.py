"""Project canonical PG18 `codebase_chunk_index.content_embedding_768` rows to Qdrant `codebase_chunks_768_turbo16`.

Follows Parent Atlas ownership rules:
  - PG18 `codebase_chunk_index.content_embedding_768` (`semantic_768`) is canonical.
  - Qdrant `codebase_chunks_768_turbo16` is an isolated, rebuildable `turbo16` + `code` BM25 projection.
  - Uses `qdrant-client` gRPC (`:6334`, `prefer_grpc=True`) with full-payload `PointStruct` upserts
    and a durable keyset cursor checkpoint (`.tmp/turbo16-projection-checkpoint.json`).
  - Existing `codebase_chunks_768` and `deeds_qdrant_snapshots` are never modified or deleted.
"""
from __future__ import annotations

import argparse
import importlib.metadata
import json
import os
import pathlib
import sys
import time
import urllib.parse
import urllib.request
import uuid
from typing import Any

import psycopg
from qdrant_client import QdrantClient, models

ROOT = pathlib.Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT))

from python.atlas_graph_runtime.qdrant_v120_graphrag_adapter_v1 import (  # noqa: E402
    build_turboquant_code_bm25_collection_spec_v1,
)

DEFAULT_CHECKPOINT = ROOT / ".tmp" / "turbo16-projection-checkpoint.json"


def _load_dsn() -> str:
    for envf in (ROOT / ".env", ROOT / "sveltekit-frontend" / ".env"):
        if envf.exists():
            for line in envf.read_text(encoding="utf-8", errors="ignore").splitlines():
                if "=" in line and not line.strip().startswith("#"):
                    k, v = line.split("=", 1)
                    os.environ.setdefault(k.strip(), v.strip().strip('"').strip("'"))
    return os.environ.get("DATABASE_URL", "postgresql://legal_admin:123456@127.0.0.1:5434/legal_ai_db")


def _make_client(qdrant_url: str, grpc_port: int, prefer_grpc: bool, timeout: int) -> QdrantClient:
    parsed = urllib.parse.urlparse(qdrant_url)
    host = parsed.hostname or "127.0.0.1"
    port = parsed.port or 6333
    return QdrantClient(
        host=host,
        port=port,
        grpc_port=grpc_port,
        prefer_grpc=prefer_grpc,
        timeout=timeout,
    )


def ensure_turbo_collection(
    client: QdrantClient,
    collection: str,
    datatype: str = "turbo16",
    qdrant_url: str = "http://127.0.0.1:6333",
) -> None:
    if client.collection_exists(collection):
        return
    spec = build_turboquant_code_bm25_collection_spec_v1(
        collection_name=collection,
        vector_size=768,
        datatype=datatype,
        vector_name="content",
    )
    if datatype == "turbo8":
        # qdrant-client 1.14.3 lacks Datatype.TURBO8 enum; create via Qdrant v1.20.2 HTTP REST.
        body = json.dumps(
            {
                "vectors": {
                    name: {"size": 768, "distance": "Cosine", "datatype": "turbo8"}
                    for name in ("content", "signature", "error")
                }
            }
        ).encode("utf-8")
        req = urllib.request.Request(
            f"{qdrant_url.rstrip('/')}/collections/{collection}",
            data=body,
            headers={"Content-Type": "application/json"},
            method="PUT",
        )
        with urllib.request.urlopen(req, timeout=30) as resp:
            resp.read()
    else:
        vectors_config = {
            name: models.VectorParams(
                size=768,
                distance=models.Distance.COSINE,
                datatype=models.Datatype.TURBO16,
            )
            for name in ("content", "signature", "error")
        }
        client.create_collection(collection_name=collection, vectors_config=vectors_config)
    if not hasattr(models.TokenizerType, "CODE"):
        idx_body = json.dumps(
            {
                "field_name": "code_text",
                "field_schema": {"type": "text", "tokenizer": "code", "lowercase": True},
            }
        ).encode("utf-8")
        idx_req = urllib.request.Request(
            f"{qdrant_url.rstrip('/')}/collections/{collection}/index",
            data=idx_body,
            headers={"Content-Type": "application/json"},
            method="PUT",
        )
        with urllib.request.urlopen(idx_req, timeout=30) as resp:
            resp.read()
    else:
        client.create_payload_index(
            collection_name=collection,
            field_name="code_text",
            field_schema=models.TextIndexParams(
                type=models.TextIndexType.TEXT,
                tokenizer=models.TokenizerType.CODE,
                lowercase=True,
            ),
        )
    for kw in ("workspace_revision", "domain_id", "language"):
        client.create_payload_index(
            collection_name=collection,
            field_name=kw,
            field_schema=models.PayloadSchemaType.KEYWORD,
        )
    _ = spec


def _valid_qdrant_id(raw_qid: str | None, fallback_uuid: str) -> str:
    if raw_qid:
        try:
            return str(uuid.UUID(str(raw_qid)))
        except ValueError:
            pass
    return str(uuid.UUID(str(fallback_uuid)))


def _save_checkpoint(path: pathlib.Path, collection: str, last_id: str, total_projected: int) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(
        json.dumps(
            {
                "collection": collection,
                "last_committed_id": last_id,
                "projected_total": total_projected,
                "updated_at": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
            },
            indent=2,
        )
        + "\n",
        encoding="utf-8",
    )


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--collection", default="codebase_chunks_768_turbo16")
    parser.add_argument("--datatype", choices=("turbo16", "turbo8"), default="turbo16")
    parser.add_argument("--qdrant-url", default="http://127.0.0.1:6333")
    parser.add_argument("--grpc-port", type=int, default=6334)
    parser.add_argument("--batch-size", type=int, default=128)
    parser.add_argument("--limit", type=int, default=0, help="0 = all canonical emb768 rows")
    parser.add_argument("--checkpoint", default=str(DEFAULT_CHECKPOINT))
    parser.add_argument("--resume", action="store_true")
    parser.add_argument("--dry-run", action="store_true")
    args = parser.parse_args()

    dsn = _load_dsn()
    if args.limit > 0:
        total_eligible = args.limit
    else:
        with psycopg.connect(dsn, options="-c default_transaction_read_only=on") as conn:
            with conn.cursor() as cur:
                cur.execute("SELECT COUNT(*) FROM codebase_chunk_index WHERE content_embedding_768 IS NOT NULL")
                total_eligible = int(cur.fetchone()[0])

    ckpt_path = pathlib.Path(args.checkpoint)
    last_id = "00000000-0000-0000-0000-000000000000"
    prior_total = 0
    if args.resume and ckpt_path.exists():
        ckpt = json.loads(ckpt_path.read_text(encoding="utf-8"))
        if ckpt.get("collection") == args.collection and ckpt.get("last_committed_id"):
            last_id = str(ckpt["last_committed_id"])
            prior_total = int(ckpt.get("projected_total", 0))

    target_count = min(total_eligible, args.limit) if args.limit > 0 else total_eligible
    if args.dry_run:
        print(
            json.dumps(
                {
                    "mode": "DRY_RUN",
                    "qdrantClientVersion": importlib.metadata.version("qdrant-client"),
                    "collection": args.collection,
                    "totalEligiblePg18": total_eligible,
                    "targetCount": target_count,
                    "batchSize": args.batch_size,
                    "grpcPort": args.grpc_port,
                    "resumeLastId": last_id,
                    "canonicalAuthority": False,
                },
                indent=2,
            )
        )
        return 0

    client = _make_client(args.qdrant_url, args.grpc_port, prefer_grpc=True, timeout=120)
    ensure_turbo_collection(client, args.collection, datatype=args.datatype, qdrant_url=args.qdrant_url)

    t0 = time.perf_counter()
    projected = 0
    with psycopg.connect(dsn, options="-c default_transaction_read_only=on") as conn:
        with conn.cursor() as cur:
            while True:
                remaining = (args.limit - projected) if args.limit > 0 else args.batch_size
                if remaining <= 0:
                    break
                fetch_n = min(args.batch_size, remaining)
                cur.execute(
                    """
                    SELECT id::text, qdrant_id, relative_path, symbol, language, domain,
                           LEFT(COALESCE(content, ''), 8192) AS code_text,
                           content_hash, workspace_revision, source_revision,
                           content_embedding_768::float4[],
                           signature_embedding::float4[],
                           error_embedding::float4[]
                    FROM codebase_chunk_index
                    WHERE content_embedding_768 IS NOT NULL
                      AND id > %s::uuid
                    ORDER BY id ASC
                    LIMIT %s
                    """,
                    (last_id, fetch_n),
                )
                rows = cur.fetchall()
                if not rows:
                    break
                points: list[models.PointStruct] = []
                batch_last_id = last_id
                for r in rows:
                    batch_last_id = r[0]
                    vecs: dict[str, list[float]] = {"content": [float(x) for x in r[10]]}
                    if r[11] is not None:
                        vecs["signature"] = [float(x) for x in r[11]]
                    if r[12] is not None:
                        vecs["error"] = [float(x) for x in r[12]]
                    points.append(
                        models.PointStruct(
                            id=_valid_qdrant_id(r[1], r[0]),
                            vector=vecs,
                            payload={
                                "pg_id": r[0],
                                "source_ref": r[2],
                                "symbol": r[3],
                                "language": r[4],
                                "domain_id": r[5],
                                "code_text": r[6],
                                "content_hash": r[7],
                                "workspace_revision": r[8],
                                "source_revision": r[9],
                                "representation_id": "semantic_768",
                                "canonical_authority": False,
                            },
                        )
                    )
                client.upsert(collection_name=args.collection, points=points, wait=True)
                last_id = batch_last_id
                projected += len(points)
                _save_checkpoint(ckpt_path, args.collection, last_id, prior_total + projected)
                if projected % 2560 == 0 or (args.limit > 0 and projected == args.limit):
                    elapsed = time.perf_counter() - t0
                    rate = projected / max(elapsed, 0.001)
                    print(f"[turbo16-grpc] projected {projected}/{target_count} ({elapsed:.1f}s, {rate:.1f} pts/s)", flush=True)

    col = client.get_collection(args.collection)
    elapsed = time.perf_counter() - t0
    print(
        json.dumps(
            {
                "status": "PROJECTION_COMPLETE",
                "qdrantClientVersion": importlib.metadata.version("qdrant-client"),
                "collection": args.collection,
                "projectedThisRun": projected,
                "collectionPointsCount": col.points_count,
                "collectionStatus": str(col.status),
                "elapsedSeconds": round(elapsed, 2),
                "rowsPerSec": round(projected / max(elapsed, 0.001), 2),
                "checkpointPath": str(ckpt_path),
                "canonicalAuthority": False,
            },
            indent=2,
        )
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
