from __future__ import annotations

import json
import os
import sys
import urllib.request
import uuid
from pathlib import Path

import psycopg

REPO_ROOT = Path(__file__).resolve().parents[2]
PYTHON_ROOT = REPO_ROOT / "python"
if str(PYTHON_ROOT) not in sys.path:
    sys.path.insert(0, str(PYTHON_ROOT))

from atlas_graph_runtime.eg2_onnx_adapter_v1 import Eg2OnnxClientV1, chunk_text_by_tokens

QDRANT_URL = os.getenv("QDRANT_URL", "http://127.0.0.1:6333").rstrip("/")
COLLECTION = "codebase_chunks_eg2_768_q8"
SAMPLE_LIMIT = 24


def _load_env_file(path: Path) -> None:
    if not path.is_file():
        return
    for raw in path.read_text(encoding="utf-8", errors="replace").splitlines():
        line = raw.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        key, val = line.split("=", 1)
        os.environ.setdefault(key.strip(), val.strip().strip('"').strip("'"))


def _qdrant_json(method: str, path: str, payload: dict | None = None) -> dict:
    data = json.dumps(payload).encode("utf-8") if payload is not None else None
    req = urllib.request.Request(
        f"{QDRANT_URL}{path}",
        data=data,
        headers={"Content-Type": "application/json"},
        method=method,
    )
    with urllib.request.urlopen(req, timeout=15) as resp:
        return json.loads(resp.read().decode("utf-8"))


def main() -> int:
    _load_env_file(REPO_ROOT / ".env")
    db_url = os.getenv("DATABASE_URL")
    if not db_url:
        raise RuntimeError("DATABASE_URL is not set")

    with psycopg.connect(db_url) as conn:
        with conn.cursor() as cur:
            cur.execute(
                """
                SELECT DISTINCT ON (source_ref)
                       packet_key, source_ref, source_revision, domain_class, summary
                FROM atlas_packets
                WHERE domain_class IN ('Graph', 'UI', 'database', 'documentation', 'gpu', 'test')
                  AND summary IS NOT NULL
                  AND length(trim(summary)) >= 40
                  AND source_revision LIKE 'sha256:%%'
                ORDER BY source_ref, packet_key
                LIMIT %s
                """,
                (SAMPLE_LIMIT,),
            )
            rows = cur.fetchall()

    onnx_client = Eg2OnnxClientV1()
    points: list[dict] = []
    for packet_key, source_ref, source_revision, domain_class, summary in rows:
        chunks = chunk_text_by_tokens(summary, max_tokens=256, overlap_tokens=32, max_chunks=1)
        if not chunks:
            continue
        emb = onnx_client.embed(chunks, dim=768, task_prompt_name="Document")
        pt_id = str(uuid.uuid5(uuid.NAMESPACE_URL, f"eg2-onnx:{packet_key}:{source_revision}"))
        points.append(
            {
                "id": pt_id,
                "vector": emb.vectors[0],
                "payload": {
                    "packet_key": packet_key,
                    "source_ref": source_ref,
                    "source_revision": source_revision,
                    "encoder_profile": "eg2-onnx-q8-mrl-768",
                    "model_id": emb.model_id,
                    "provisional_domain_class": domain_class,
                    "provisional_domain_authority": False,
                    "canonical_authority": False,
                },
            }
        )

    _qdrant_json("PUT", f"/collections/{COLLECTION}/points?wait=true", {"points": points})

    query_emb = onnx_client.embed(
        ["PostgreSQL database query and Drizzle schema binding"],
        dim=768,
        task_prompt_name="Retrieval",
    ).vectors[0]
    filtered = _qdrant_json(
        "POST",
        f"/collections/{COLLECTION}/points/query",
        {
            "query": query_emb,
            "filter": {"must": [{"key": "provisional_domain_class", "match": {"value": "database"}}]},
            "limit": 5,
            "with_payload": True,
        },
    )
    hits = (filtered.get("result") or {}).get("points") or []
    info = _qdrant_json("GET", f"/collections/{COLLECTION}")["result"]

    report = {
        "schema": "atlas.eg2-onnx-qdrant-domain-index.v1",
        "collection": COLLECTION,
        "upsertedCount": len(points),
        "collectionPointsCount": info.get("points_count"),
        "filteredQueryDomain": "database",
        "filteredHitsCount": len(hits),
        "topHit": hits[0] if hits else None,
    }
    report_path = REPO_ROOT / "docs" / "reports" / "eg2-onnx-qdrant-domain-index-v1.json"
    report_path.write_text(json.dumps(report, indent=2) + "\n", encoding="utf-8")
    print(json.dumps(report, indent=2))
    return 0 if hits else 1


if __name__ == "__main__":
    raise SystemExit(main())
