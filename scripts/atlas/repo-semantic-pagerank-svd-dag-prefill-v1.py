from __future__ import annotations

import json
import os
import sys
import urllib.request
from pathlib import Path
from typing import Any

import numpy as np
import psycopg

REPO_ROOT = Path(__file__).resolve().parents[2]
PYTHON_ROOT = REPO_ROOT / "python"
if str(PYTHON_ROOT) not in sys.path:
    sys.path.insert(0, str(PYTHON_ROOT))

from atlas_graph_runtime.eg2_onnx_adapter_v1 import Eg2OnnxClientV1
from atlas_graph_runtime.pgvector_kmeans_dag_prefill_v1 import fetch_pgvector_kmeans_dag_prefill_v1

QDRANT_URL = os.getenv("QDRANT_URL", "http://127.0.0.1:6333").rstrip("/")
REPORT_PATH = REPO_ROOT / "docs" / "reports" / "repo-semantic-pagerank-svd-dag-prefill-v1.json"


def _load_env_file(path: Path) -> None:
    if not path.is_file():
        return
    for raw in path.read_text(encoding="utf-8", errors="replace").splitlines():
        line = raw.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        key, val = line.split("=", 1)
        os.environ.setdefault(key.strip(), val.strip().strip('"').strip("'"))


def run_personalized_pagerank(
    nodes: list[str],
    edges: list[tuple[str, str, float]],
    seeds: dict[str, float],
    *,
    alpha: float = 0.85,
    iters: int = 25,
) -> dict[str, float]:
    if not nodes:
        return {}
    idx = {n: i for i, n in enumerate(nodes)}
    n = len(nodes)
    mat = np.zeros((n, n), dtype=np.float64)
    for src, dst, w in edges:
        if src in idx and dst in idx:
            mat[idx[dst], idx[src]] += max(float(w), 0.0)
    col_sums = mat.sum(axis=0)
    for j in range(n):
        if col_sums[j] > 0:
            mat[:, j] /= col_sums[j]
        else:
            mat[:, j] = 1.0 / n

    p = np.zeros((n,), dtype=np.float64)
    for k, v in seeds.items():
        if k in idx:
            p[idx[k]] = max(float(v), 0.0)
    if p.sum() <= 0:
        p[:] = 1.0 / n
    else:
        p /= p.sum()

    r = p.copy()
    for _ in range(iters):
        r = alpha * (mat @ r) + (1.0 - alpha) * p
    return {node: float(r[i]) for i, node in enumerate(nodes)}


def compute_svd_recommendations(
    vectors: np.ndarray,
    pagerank_weights: np.ndarray,
    *,
    max_rank: int = 8,
) -> tuple[np.ndarray, list[float]]:
    if vectors.shape[0] < 2:
        return np.ones((vectors.shape[0],), dtype=np.float64), [1.0]
    centered = vectors - vectors.mean(axis=0, keepdims=True)
    u, s, _ = np.linalg.svd(centered, full_matrices=False)
    rank = min(max_rank, u.shape[1])
    total_var = float(np.sum(s * s)) or 1.0
    explained = [round(float((s[i] * s[i]) / total_var), 4) for i in range(rank)]

    proj = u[:, :rank] * s[:rank]
    w = pagerank_weights / max(float(pagerank_weights.sum()), 1e-12)
    pr_centroid = np.sum(proj * w[:, None], axis=0)
    pr_norm = float(np.linalg.norm(pr_centroid)) or 1.0
    proj_norms = np.linalg.norm(proj, axis=1)
    proj_norms = np.where(proj_norms > 1e-12, proj_norms, 1.0)
    alignment = (proj @ pr_centroid) / (proj_norms * pr_norm)
    return alignment, explained


def main() -> int:
    _load_env_file(REPO_ROOT / ".env")
    db_url = os.getenv("DATABASE_URL")
    if not db_url:
        raise RuntimeError("DATABASE_URL is not set")

    query = "valkey cache readback and drizzle postgresql query"
    pg_res = fetch_pgvector_kmeans_dag_prefill_v1(query, top_k=12, fts_query=None, dsn=db_url)
    pg_rows = pg_res.get("hits") or pg_res.get("results") or []

    # Also query Qdrant EG2 ONNX (:8094 -> :6333 codebase_chunks_eg2_768_q8)
    eg2_hits: list[dict[str, Any]] = []
    try:
        q_vec = Eg2OnnxClientV1().embed([query], dim=768, task_prompt_name="Retrieval").vectors[0]
        req = urllib.request.Request(
            f"{QDRANT_URL}/collections/codebase_chunks_eg2_768_q8/points/query",
            data=json.dumps({"query": q_vec, "limit": 6, "with_payload": True}).encode("utf-8"),
            headers={"Content-Type": "application/json"},
            method="POST",
        )
        with urllib.request.urlopen(req, timeout=10) as resp:
            eg2_hits = (json.loads(resp.read().decode("utf-8")).get("result") or {}).get("points") or []
    except Exception:
        eg2_hits = []

    rel_paths = list({r["relativePath"] for r in pg_rows if r.get("relativePath")})
    vectors_list: list[np.ndarray] = []
    candidates: list[dict[str, Any]] = []
    edges: list[tuple[str, str, float]] = []

    with psycopg.connect(db_url, options="-c default_transaction_read_only=on") as conn:
        with conn.cursor() as cur:
            cur.execute(
                """
                SELECT DISTINCT ON (c.relative_path)
                       c.relative_path, c.content_embedding_768::float4[],
                       p.packet_key, p.feature_id, COALESCE(p.pagerank, 0.0)::float8, p.community_id
                FROM codebase_chunk_index c
                LEFT JOIN atlas_packets p
                  ON p.source_ref = c.relative_path
                  OR p.source_ref = ('sveltekit-frontend/' || c.relative_path)
                WHERE c.relative_path = ANY(%s)
                  AND c.content_embedding_768 IS NOT NULL
                ORDER BY c.relative_path, p.pagerank DESC NULLS LAST
                """,
                (rel_paths,),
            )
            sim_by_path = {r["relativePath"]: float(r.get("cosineSim") or 0.0) for r in pg_rows}
            for rp, vec, pkey, fid, pr, cid in cur.fetchall():
                node_id = str(fid or rp)
                vectors_list.append(np.asarray(vec, dtype=np.float64))
                candidates.append(
                    {
                        "nodeId": node_id,
                        "relativePath": rp,
                        "packetKey": pkey,
                        "featureId": fid,
                        "cosineSim": round(sim_by_path.get(rp, 0.0), 4),
                        "storedPagerank": round(float(pr), 6),
                        "communityId": cid,
                    }
                )

            fids = [c["featureId"] for c in candidates if c.get("featureId")]
            if fids:
                cur.execute(
                    """
                    SELECT source_feature_id, target_feature_id, COALESCE(strength, 0.5)::float8
                    FROM atlas_feature_relationships
                    WHERE source_feature_id = ANY(%s)
                      AND target_feature_id = ANY(%s)
                    """,
                    (fids, fids),
                )
                edges = [(str(s), str(t), float(w)) for s, t, w in cur.fetchall()]

    node_ids = [c["nodeId"] for c in candidates]
    seeds = {c["nodeId"]: max(c["cosineSim"], 0.01) for c in candidates}
    ppr_scores = run_personalized_pagerank(node_ids, edges, seeds)

    mat = np.vstack(vectors_list) if vectors_list else np.zeros((0, 768), dtype=np.float64)
    pr_vec = np.asarray([max(ppr_scores.get(c["nodeId"], 0.0), c["storedPagerank"]) for c in candidates], dtype=np.float64)
    svd_align, explained_var = compute_svd_recommendations(mat, pr_vec)

    ranked: list[dict[str, Any]] = []
    for i, c in enumerate(candidates):
        ppr = ppr_scores.get(c["nodeId"], 0.0)
        svd_s = float(svd_align[i]) if i < len(svd_align) else 0.0
        combined = 0.45 * c["cosineSim"] + 0.35 * min(ppr * 5.0, 1.0) + 0.20 * max(svd_s, 0.0)
        dag_role = "SEED_HUB" if i < 2 else ("SVD_CLUSTER_FANOUT" if svd_s >= 0.5 else "CONTEXT_TAIL")
        ranked.append(
            {
                **c,
                "personalizedPagerank": round(ppr, 6),
                "svdLowRankAlignment": round(svd_s, 4),
                "prefillPriorityScore": round(combined, 4),
                "dagRole": dag_role,
            }
        )
    ranked.sort(key=lambda x: x["prefillPriorityScore"], reverse=True)

    dag_stages = [
        {"stage": 0, "id": "stage_0_seed_retrieval", "nodes": [r["nodeId"] for r in ranked[:2]]},
        {"stage": 1, "id": "stage_1_pagerank_hubs", "nodes": [r["nodeId"] for r in ranked if r["personalizedPagerank"] > 0][:4]},
        {"stage": 2, "id": "stage_2_svd_cluster_fanout", "nodes": [r["nodeId"] for r in ranked if r["dagRole"] == "SVD_CLUSTER_FANOUT"]},
        {"stage": 3, "id": "stage_3_ace_context_manifest", "nodes": [r["nodeId"] for r in ranked[:6]]},
    ]

    report = {
        "schema": "atlas.repo-semantic-pagerank-svd-dag-prefill.v1",
        "query": query,
        "canonicalAuthority": False,
        "writesPerformed": False,
        "hiddenStatePersisted": False,
        "pgvectorCandidateCount": len(candidates),
        "eg2OnnxQdrantHitsCount": len(eg2_hits),
        "inducedGraphEdgesCount": len(edges),
        "svdExplainedVarianceRatio": explained_var,
        "prefillDagStages": dag_stages,
        "dagRecommendations": ranked[:8],
        "eg2TopHits": [
            {"id": str(h.get("id")), "score": h.get("score"), "sourceRef": (h.get("payload") or {}).get("source_ref")}
            for h in eg2_hits[:3]
        ],
    }
    REPORT_PATH.write_text(json.dumps(report, indent=2) + "\n", encoding="utf-8")
    print(json.dumps(report, indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
