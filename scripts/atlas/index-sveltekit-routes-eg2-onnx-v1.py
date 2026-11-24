from __future__ import annotations

import argparse
import hashlib
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
REPORT_PATH = REPO_ROOT / "docs" / "reports" / "sveltekit-routes-eg2-onnx-index-v1.json"
BATCH_LIMIT = 25


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
    parser = argparse.ArgumentParser()
    parser.add_argument("--offset", type=int, default=0)
    parser.add_argument("--limit", type=int, default=BATCH_LIMIT)
    args = parser.parse_args()

    _load_env_file(REPO_ROOT / ".env")
    db_url = os.getenv("DATABASE_URL")
    eg2_routes: set[str] = set()
    if db_url:
        with psycopg.connect(db_url, options="-c default_transaction_read_only=on") as conn:
            with conn.cursor() as cur:
                cur.execute(
                    """
                    SELECT DISTINCT relative_path
                    FROM codebase_chunk_eg2_embeddings
                    WHERE relative_path LIKE 'src/routes/%'
                       OR relative_path LIKE 'sveltekit-frontend/src/routes/%'
                    """
                )
                for (rp,) in cur.fetchall():
                    if rp:
                        norm = rp.replace("\\", "/")
                        if norm.startswith("sveltekit-frontend/"):
                            norm = norm[len("sveltekit-frontend/"):]
                        eg2_routes.add(norm)

    routes_root = REPO_ROOT / "sveltekit-frontend" / "src" / "routes"
    missing = sorted(
        str(p.relative_to(REPO_ROOT / "sveltekit-frontend")).replace("\\", "/")
        for p in routes_root.rglob("*")
        if p.is_file()
        and p.name in ("+server.ts", "+page.svelte", "+page.server.ts")
        and str(p.relative_to(REPO_ROOT / "sveltekit-frontend")).replace("\\", "/") not in eg2_routes
    )[args.offset : args.offset + args.limit]

    onnx_client = Eg2OnnxClientV1()
    points: list[dict] = []
    for rel in missing:
        full = REPO_ROOT / "sveltekit-frontend" / rel
        raw_bytes = full.read_bytes()
        src_rev = "sha256:" + hashlib.sha256(raw_bytes).hexdigest()
        text = raw_bytes.decode("utf-8", errors="replace").strip()
        if not text:
            continue
        chunks = chunk_text_by_tokens(f"// route: {rel}\n{text}", max_tokens=256, overlap_tokens=32, max_chunks=1)
        if not chunks:
            continue
        emb = onnx_client.embed(chunks, dim=768, task_prompt_name="CodeRetrieval")
        pt_id = str(uuid.uuid5(uuid.NAMESPACE_URL, f"eg2-route:{rel}:{src_rev}"))
        points.append(
            {
                "id": pt_id,
                "vector": emb.vectors[0],
                "payload": {
                    "source_ref": f"sveltekit-frontend/{rel}",
                    "relative_path": rel,
                    "source_revision": src_rev,
                    "route_kind": Path(rel).name,
                    "encoder_profile": "eg2-onnx-q8-mrl-768",
                    "model_id": emb.model_id,
                    "provisional_domain_class": "frontend.sveltekit" if rel.endswith(".svelte") else "api",
                    "canonical_authority": False,
                },
            }
        )

    _qdrant_json("PUT", f"/collections/{COLLECTION}/points?wait=true", {"points": points})
    info = _qdrant_json("GET", f"/collections/{COLLECTION}")["result"]

    q_vec = onnx_client.embed(["SvelteKit API endpoint +server.ts handler"], dim=768, task_prompt_name="CodeRetrieval").vectors[0]
    hits = (
        _qdrant_json(
            "POST",
            f"/collections/{COLLECTION}/points/query",
            {
                "query": q_vec,
                "filter": {"must": [{"key": "route_kind", "match": {"value": "+server.ts"}}]},
                "limit": 3,
                "with_payload": True,
            },
        ).get("result")
        or {}
    ).get("points") or []

    report = {
        "schema": "atlas.sveltekit-routes-eg2-onnx-index.v1",
        "collection": COLLECTION,
        "upsertedRouteCount": len(points),
        "collectionPointsCount": info.get("points_count"),
        "filteredRouteKind": "+server.ts",
        "filteredHitsCount": len(hits),
        "topHit": hits[0] if hits else None,
    }
    REPORT_PATH.write_text(json.dumps(report, indent=2) + "\n", encoding="utf-8")
    print(json.dumps(report, indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
