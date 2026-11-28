"""Isolated EmbeddingGemma 2 (:8094) document-prefix vs CodeRetrieval-query + turbo8 evaluation.

Reads 200 revision-bound rows from PG18 codebase_chunk_index (read-only), formats
documents as `title: {source_ref} | text: {content}` (not CodeRetrieval query prefix),
embeds via :8094, and benchmarks exact 768-D vs Qdrant v1.20.2 turbo8 in a temporary
collection that is deleted in finally:.
"""

from __future__ import annotations

import json
import math
import pathlib
import time
import urllib.request
import uuid

import numpy as np
import psycopg

from python.atlas_graph_runtime.qdrant_v120_graphrag_adapter_v1 import (
    build_turboquant_code_bm25_collection_spec_v1,
)

EMBED_URL = "http://127.0.0.1:8094/embed"
QDRANT_URL = "http://127.0.0.1:6333"


def _http_json(url: str, method: str = "GET", body: dict | None = None, timeout: int = 60) -> dict:
    data = json.dumps(body).encode("utf-8") if body is not None else None
    req = urllib.request.Request(
        url,
        data=data,
        headers={"Content-Type": "application/json"} if data is not None else {},
        method=method,
    )
    with urllib.request.urlopen(req, timeout=timeout) as resp:
        return json.loads(resp.read().decode("utf-8"))


def _embed_8094(texts: list[str]) -> tuple[str, np.ndarray]:
    vecs: list[list[float]] = []
    model_id = "unknown"
    for i in range(0, len(texts), 8):
        resp = _http_json(EMBED_URL, "POST", {"texts": texts[i : i + 8], "dims": [768]}, timeout=120)
        model_id = str(resp.get("model_id", model_id))
        emb = resp["embeddings"]
        vecs.extend(emb["768"] if isinstance(emb, dict) else emb)
    mat = np.array(vecs, dtype=np.float32)
    norms = np.linalg.norm(mat, axis=1, keepdims=True)
    norms[norms == 0] = 1.0
    return model_id, mat / norms


def main() -> None:
    p = pathlib.Path(".env") if pathlib.Path(".env").exists() else pathlib.Path("sveltekit-frontend/.env")
    dsn = [l.split("=", 1)[1].strip().strip("\"'") for l in p.read_text().splitlines() if l.strip().startswith("DATABASE_URL=")][0]

    with psycopg.connect(dsn, options="-c default_transaction_read_only=on") as conn:
        with conn.cursor() as cur:
            cur.execute("SET TRANSACTION ISOLATION LEVEL REPEATABLE READ, READ ONLY")
            cur.execute(
                """
                SELECT chunk_id, source_ref, left(content, 500)
                FROM public.codebase_chunk_index
                WHERE workspace_revision IS NOT NULL
                  AND source_revision IS NOT NULL
                  AND content IS NOT NULL
                  AND length(content) > 40
                ORDER BY id ASC
                LIMIT 64
                """
            )
            rows = cur.fetchall()

    doc_texts = [f"title: {src} | text: {txt}" for _, src, txt in rows]
    query_rows = rows[:20]
    query_texts = [f"task: code retrieval | query: {src} {txt[:200]}" for _, src, txt in query_rows]

    model_id, doc_mat = _embed_8094(doc_texts)
    _, q_mat = _embed_8094(query_texts)

    sim = q_mat @ doc_mat.T
    exact_top10 = [set(int(i) for i in np.argsort(-sim[qi], kind="stable")[:10]) for qi in range(len(query_rows))]
    exact_top1 = [int(np.argsort(-sim[qi], kind="stable")[0]) for qi in range(len(query_rows))]

    col = f"atlas_eg2_doc_turbo8_{uuid.uuid4().hex[:10]}"
    spec = build_turboquant_code_bm25_collection_spec_v1(collection_name=col, vector_size=768, datatype="turbo8")
    try:
        _http_json(f"{QDRANT_URL}/collections/{col}", "PUT", spec["create_collection_body"])
        for start in range(0, len(rows), 60):
            pts = [
                {
                    "id": idx + 1,
                    "vector": {"content": doc_mat[idx].tolist()},
                    "payload": {"chunk_id": rows[idx][0], "source_ref": rows[idx][1]},
                }
                for idx in range(start, min(start + 60, len(rows)))
            ]
            _http_json(f"{QDRANT_URL}/collections/{col}/points?wait=true", "PUT", {"points": pts})

        latencies: list[float] = []
        recalls: list[float] = []
        mrrs: list[float] = []
        self_top1 = 0
        for qi in range(len(query_rows)):
            t0 = time.perf_counter()
            resp = _http_json(
                f"{QDRANT_URL}/collections/{col}/points/query",
                "POST",
                {"query": q_mat[qi].tolist(), "using": "content", "limit": 10, "with_payload": False},
            )
            latencies.append((time.perf_counter() - t0) * 1000.0)
            got = [int(pt["id"]) - 1 for pt in resp["result"]["points"]]
            recalls.append(len(set(got) & exact_top10[qi]) / 10.0)
            if got and got[0] == qi:
                self_top1 += 1
            rr = 0.0
            for r_i, idx in enumerate(got):
                if idx == exact_top1[qi]:
                    rr = 1.0 / float(r_i + 1)
                    break
            mrrs.append(rr)

        lat_s = sorted(latencies)
        p95 = lat_s[min(len(lat_s) - 1, math.ceil(0.95 * len(lat_s)) - 1)]
        report = {
            "schema": "atlas.eg2-8094-document-prefix-eval.v1",
            "status": "PROPOSAL_ONLY",
            "modelId": model_id,
            "docFormat": "title: {source_ref} | text: {content}",
            "queryFormat": "task: code retrieval | query: {query}",
            "corpusSize": len(rows),
            "queryCount": len(query_rows),
            "qdrantDatatype": "turbo8",
            "recallAt10VsExact768": round(sum(recalls) / len(recalls), 4),
            "mrrVsExactTop1": round(sum(mrrs) / len(mrrs), 4),
            "selfTop1MatchRate": round(self_top1 / len(query_rows), 4),
            "p95Ms": round(p95, 3),
            "canonicalAuthority": False,
            "writesPerformed": False,
        }
        out_path = pathlib.Path(".tmp/atlas/eg2-8094-document-prefix-eval-v1.json")
        out_path.parent.mkdir(parents=True, exist_ok=True)
        out_path.write_text(json.dumps(report, indent=2) + "\n", encoding="utf-8")
        print(json.dumps(report, indent=2))
    finally:
        try:
            _http_json(f"{QDRANT_URL}/collections/{col}", "DELETE")
        except Exception:
            pass


if __name__ == "__main__":
    main()
