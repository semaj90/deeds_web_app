"""DOC-19: exact semantic-search oracle over the frozen semantic_768 cohort of the canonical external-doc corpus (READ ONLY).

Postgres exact cosine (`<=>`, sequential scan, no ANN) is compared with an independent NumPy exact implementation; canonical FTS is reported side by side
(never fused). Semantic retrieval is ONE logical lane: Postgres exact / cuVS exact / future HNSW / CAGRA / IVF-PQ are executors of it, not separate votes.
Writes only docs/reports/doc-19-exact-semantic-search-v1.json. No Postgres/Qdrant/Valkey writes; no Ollama; no index creation.
"""
from __future__ import annotations

import json
import subprocess
import sys
import time
import urllib.request
from datetime import datetime, timezone
from pathlib import Path

import numpy as np

ROOT = Path(__file__).resolve().parents[1]
EMBED = "http://127.0.0.1:8081"
QUERY_PROMPT = "task: search result | query: "
K = 5
TIE_EPS = 1e-6
QUERIES = [
    "hnsw iterative scan strict order", "postgres asynchronous io method worker", "svelte 5 derived state rune", "drizzle kit migration schema", "uuidv7 postgres",
    "how do I keep vector search accurate when a WHERE clause filters most rows", "which setting lets the database read from disk without blocking the query",
    "reactive value that recomputes when its dependencies change", "generate sql files that describe a schema change", "time ordered unique identifier function",
    "limit how much memory an approximate index scan may use", "component snippet that renders a custom element for a headless dialog",
]
FILTERS = [("pgvector", None), ("postgresql", "18")]


def query_input(q: str) -> str:
    return f"{QUERY_PROMPT}{q}"


def cosine_scores(matrix: np.ndarray, q: np.ndarray) -> np.ndarray:
    return (matrix @ q) / (np.linalg.norm(matrix, axis=1) * np.linalg.norm(q))


def exact_order(scores: np.ndarray, ids: list[str], k: int) -> list[int]:
    """Deterministic ordering: score descending, chunk_id ascending as the tie break (matches ORDER BY distance, chunk_id)."""
    return sorted(range(len(ids)), key=lambda i: (-round(float(scores[i]), 9), ids[i]))[:k]


def parity(pg_ids: list[str], pg_scores: list[float], cpu_ids: list[str], cpu_scores: list[float]) -> dict:
    tie_safe_top1 = pg_ids[0] == cpu_ids[0] or abs(pg_scores[0] - cpu_scores[0]) < TIE_EPS
    return {"top1Agreement": bool(tie_safe_top1), "topKOverlap": len(set(pg_ids) & set(cpu_ids)) / max(len(pg_ids), 1), "orderExact": pg_ids == cpu_ids,
            "maxScoreDelta": float(max((abs(a - b) for a, b in zip(pg_scores, cpu_scores)), default=0.0))}


def psql(sql: str) -> str:
    return subprocess.run(["docker", "exec", "-i", "-e", "PGOPTIONS=-c enable_indexscan=off -c enable_bitmapscan=off", "legal-ai-postgres", "psql", "-U", "legal_admin", "-d", "legal_ai_db", "-tA", "-v", "ON_ERROR_STOP=1"],
                          input=sql, capture_output=True, text=True, encoding="utf-8", check=True).stdout


def embed(text: str) -> tuple[np.ndarray, float]:
    t0 = time.perf_counter()
    req = urllib.request.Request(f"{EMBED}/v1/embeddings", data=json.dumps({"input": [text], "model": "embeddinggemma"}).encode(), headers={"content-type": "application/json"})
    v = np.asarray(json.load(urllib.request.urlopen(req, timeout=60))["data"][0]["embedding"], dtype=np.float64)
    return v, (time.perf_counter() - t0) * 1000


def vec_literal(v: np.ndarray) -> str:
    return "'[" + ",".join(f"{x:.9g}" for x in v) + "]'::vector"


def main() -> int:
    npx = "npx.cmd" if sys.platform == "win32" else "npx"
    ver = subprocess.run([npx, "tsx", "scripts/atlas/build-semantic-doc-cohort-manifest-v1.mts", "--verify"], cwd=ROOT / "sveltekit-frontend", capture_output=True, text=True, encoding="utf-8")
    verify_line = next((l for l in ver.stdout.splitlines() if l.startswith("{")), "{}")
    cohort = json.loads(verify_line)
    manifest = json.loads((ROOT / "docs/reports/semantic-doc-01-embedding-cohort-manifest-v1.json").read_text(encoding="utf-8"))
    receipt: dict = {"schema": "atlas.doc-19-exact-semantic-search.v1", "generatedAt": datetime.now(timezone.utc).isoformat(), "gate": "DOC-19",
                     "representationRevision": manifest["representationRevision"], "cohortVerification": {"verify": cohort.get("verify"), "frozenChecksum": cohort.get("frozen"), "liveChecksum": cohort.get("live"),
                     "storedVectorCount": manifest["chunkCount"], "dimension": manifest["dimension"]}}
    if cohort.get("verify") != "COHORT_UNCHANGED":
        receipt["result"] = "DOC_19_REPRESENTATION_DRIFT"
        (ROOT / "docs/reports/doc-19-exact-semantic-search-v1.json").write_text(json.dumps(receipt, indent=2) + "\n", encoding="utf-8")
        print(receipt["result"]); return 1

    rows = json.loads(psql("SELECT json_agg(json_build_object('id', c.chunk_id, 'rev', c.evidence_revision, 'page', p.id, 'provider', p.provider, 'product', p.product, 'ver', p.product_version, 'url', p.url, 'head', c.heading_path, 'v', c.content_embedding::text) ORDER BY c.chunk_id) FROM atlas_external_doc_chunks c JOIN atlas_external_doc_pages p ON p.id = c.page_id"))
    ids = [r["id"] for r in rows]
    matrix = np.asarray([json.loads(r["v"]) for r in rows], dtype=np.float64)
    meta = {r["id"]: r for r in rows}
    assert matrix.shape == (852, 768), matrix.shape

    plan = psql(f"EXPLAIN SELECT chunk_id FROM atlas_external_doc_chunks ORDER BY content_embedding <=> {vec_literal(matrix[0])} LIMIT {K}")
    indexes = psql("SELECT count(*) FROM pg_indexes WHERE tablename = 'atlas_external_doc_chunks' AND indexdef ILIKE '%content_embedding%'").strip()
    # Exactness is FORCED (index/bitmap scans disabled for this session via PGOPTIONS) and proven from the plan: a Seq Scan that never touches the HNSW index.
    exact_plan = "Seq Scan" in plan and "aedc_embedding_hnsw" not in plan and "Index Scan" not in plan

    out_queries, pg_results, cpu_parity, lexical, lat = [], [], [], [], []
    for q in QUERIES:
        qv, t_embed = embed(query_input(q))
        t0 = time.perf_counter()
        res = json.loads(psql(f"SELECT json_agg(x) FROM (SELECT chunk_id AS id, 1 - (content_embedding <=> {vec_literal(qv)}) AS cos FROM atlas_external_doc_chunks ORDER BY content_embedding <=> {vec_literal(qv)}, chunk_id LIMIT {K}) x"))
        t_pg = (time.perf_counter() - t0) * 1000
        pg_ids, pg_sc = [r["id"] for r in res], [float(r["cos"]) for r in res]
        sc = cosine_scores(matrix, qv)
        order = exact_order(sc, ids, K)
        cpu_ids, cpu_sc = [ids[i] for i in order], [float(sc[i]) for i in order]
        fts = json.loads(psql(f"SELECT coalesce(json_agg(x), '[]') FROM (SELECT chunk_id AS id FROM atlas_external_doc_chunks WHERE search_vector @@ plainto_tsquery('english', $q${q}$q$) ORDER BY ts_rank(search_vector, plainto_tsquery('english', $q${q}$q$)) DESC, chunk_id LIMIT {K}) x"))
        fts_ids = [r["id"] for r in fts]
        out_queries.append({"query": q, "input": query_input(q)})
        pg_results.append({"query": q, "results": [{"chunkId": i, "chunkEvidenceRevision": meta[i]["rev"], "pageId": meta[i]["page"], "provider": meta[i]["provider"], "product": meta[i]["product"], "productVersion": meta[i]["ver"],
                           "url": meta[i]["url"], "headingPath": meta[i]["head"], "representationRevision": manifest["representationRevision"], "cosine": s} for i, s in zip(pg_ids, pg_sc)]})
        cpu_parity.append({"query": q, **parity(pg_ids, pg_sc, cpu_ids, cpu_sc)})
        lexical.append({"query": q, "ftsTopK": fts_ids, "semanticTopK": pg_ids, "overlap": len(set(fts_ids) & set(pg_ids)), "semanticOnly": len(set(pg_ids) - set(fts_ids)), "lexicalOnly": len(set(fts_ids) - set(pg_ids)),
                        "ftsHits": len(fts_ids)})
        lat.append({"query": q, "embedMs": round(t_embed, 1), "postgresExactMs": round(t_pg, 1), "totalMs": round(t_embed + t_pg, 1), "candidates": len(ids), "k": K})

    filters = []
    qv, _ = embed(query_input("vector index scan filtering"))
    for product, version in FILTERS:
        sub = [i for i, m in enumerate(rows) if m["product"] == product and (version is None or m["ver"] == version)]
        sc = cosine_scores(matrix[sub], qv)
        cpu_ids = [ids[sub[i]] for i in exact_order(sc, [ids[j] for j in sub], K)]
        vcond = f" AND p.product_version = '{version}'" if version else ""
        res = json.loads(psql(f"SELECT json_agg(x) FROM (SELECT c.chunk_id AS id FROM atlas_external_doc_chunks c JOIN atlas_external_doc_pages p ON p.id = c.page_id WHERE p.product = '{product}'{vcond} ORDER BY c.content_embedding <=> {vec_literal(qv)}, c.chunk_id LIMIT {K}) x"))
        pg_ids = [r["id"] for r in res]
        filters.append({"product": product, "productVersion": version, "candidateRows": len(sub), "postgresTopK": pg_ids, "cpuTopK": cpu_ids, "orderExact": pg_ids == cpu_ids, "allMatchFilter": all(meta[i]["product"] == product for i in pg_ids)})

    def health(url: str) -> str:
        try:
            return json.load(urllib.request.urlopen(url, timeout=5)).get("status", "?")
        except Exception as e:  # noqa: BLE001
            return f"DOWN:{e}"
    gpu = subprocess.run(["nvidia-smi", "--query-gpu=memory.free", "--format=csv,noheader"], capture_output=True, text=True).stdout.strip()

    top1_all = all(c["top1Agreement"] for c in cpu_parity)
    order_all = all(c["orderExact"] for c in cpu_parity)
    ok = top1_all and order_all and exact_plan and all(f["orderExact"] and f["allMatchFilter"] for f in filters) 
    receipt.update({
        "queryPromptRevision": f"embeddinggemma-query-prompt-v1: {QUERY_PROMPT!r}", "embeddingModelRevision": manifest["ggufSha256"][:12], "queries": out_queries, "postgresExactResults": pg_results, "cpuExactParity": cpu_parity,
        "exactnessProof": {"planIsExact": exact_plan, "method": "PGOPTIONS enable_indexscan=off enable_bitmapscan=off", "contentEmbeddingIndexesOnTable": indexes, "plan": plan.strip().splitlines()[:4]},
        "optionalGpuExactParity": {"status": "NOT_RUN", "reason": "optional; GPU has ~300 MiB free with Ornith + EmbeddingGemma resident, and DOC-19 is proven by Postgres + CPU exact"},
        "filtersProof": {"filteredAgainst": "canonical atlas_external_doc_chunks/pages rows", "cases": filters}, "lexicalComparison": lexical, "latency": lat,
        "oneLaneOneVoteInvariant": "semantic retrieval is ONE logical lane; Postgres exact, cuVS exact, HNSW, CAGRA and IVF-PQ are executors of it and get no independent RRF vote; no fusion weights are defined here",
        "hnsw": {"present": indexes != "0", "index": "aedc_embedding_hnsw (m=16, ef_construction=64, vector_cosine_ops) exists since the DOC-06 migration and is maintained on insert", "usedByThisProof": False, "correction": "earlier notes said no HNSW index existed for the doc chunks; that was wrong"}, "qdrant": {"projected": False},
        "runtime": {"embeddingGemma8081": health(f"{EMBED}/health"), "ornith8090": health("http://127.0.0.1:8090/health"), "gpuFreeMiB": gpu},
        "result": "DOC_19_EXACT_SEMANTIC_ORACLE_PROVEN" if ok else "DOC_19_NOT_PROVEN",
        "writes": {"postgres": 0, "qdrant": 0, "valkey": 0, "neo4j": 0, "graphify": 0},
    })
    (ROOT / "docs/reports/doc-19-exact-semantic-search-v1.json").write_text(json.dumps(receipt, indent=2) + "\n", encoding="utf-8")
    print(json.dumps({"result": receipt["result"], "queries": len(QUERIES), "top1AllAgree": top1_all, "orderExactAll": order_all, "exactPlan": exact_plan, "indexes": indexes,
                      "meanOverlapWithFts": round(float(np.mean([l["overlap"] for l in lexical])), 2), "medianTotalMs": float(np.median([l["totalMs"] for l in lat])), "runtime": receipt["runtime"]}, indent=1))
    return 0 if ok else 1


if __name__ == "__main__":
    sys.exit(main())
