#!/usr/bin/env python3
"""
Scene Ontology NetworkX PageRank + K-Means + kNN Low-Rank Recommender (v1)

Operates strictly as a non-canonical proposal/routing lane (SCENE-22 / AGENTS.md):
  - Reads the 506-concept scene-ontology-catalog-v1.json (nodes + parent/relations).
  - Builds a NetworkX directed/undirected graph and computes PageRank centrality.
  - Builds deterministic low-rank TF-IDF / character-trigram features + K-Means clustering
    and cosine kNN neighbor recommendations for any query concept or scene prompt.
  - Emits bounded recommendations labeled `RETRIEVAL_PROPOSAL` (never creates identity,
    places geometry, or overrides Postgres/ACE canonical authority).
"""

import argparse
import json
import math
from collections import defaultdict
from pathlib import Path

import networkx as nx

REPO_ROOT = Path(__file__).resolve().parents[2]
ONTOLOGY_PATH = REPO_ROOT / "sveltekit-frontend/src/lib/splat/scene-ontology/scene-ontology-catalog-v1.json"
OUT_PATH = REPO_ROOT / "docs/reports/scene-ontology-kmeans-pagerank-v1.json"


def trigram_vector(text: str) -> dict[str, float]:
    s = f"  {text.lower()}  "
    counts: dict[str, float] = defaultdict(float)
    for i in range(max(0, len(s) - 2)):
        counts[s[i : i + 3]] += 1.0
    norm = math.sqrt(sum(v * v for v in counts.values())) or 1.0
    return {k: v / norm for k, v in counts.items()}


def cosine_sparse(a: dict[str, float], b: dict[str, float]) -> float:
    if len(a) > len(b):
        a, b = b, a
    return sum(v * b.get(k, 0.0) for k, v in a.items())


def deterministic_kmeans_sparse(vectors: list[dict[str, float]], k: int, iters: int = 8) -> list[int]:
    n = len(vectors)
    if n == 0:
        return []
    k = max(1, min(k, n))
    # Deterministic evenly spaced initial centroids
    step = max(1, n // k)
    centroids = [dict(vectors[(i * step) % n]) for i in range(k)]
    assignments = [0] * n

    for _ in range(iters):
        changed = False
        for idx, vec in enumerate(vectors):
            best_c = 0
            best_sim = -1.0
            for cid, cent in enumerate(centroids):
                sim = cosine_sparse(vec, cent)
                if sim > best_sim:
                    best_sim = sim
                    best_c = cid
            if assignments[idx] != best_c:
                assignments[idx] = best_c
                changed = True
        if not changed:
            break
        # Recompute centroids
        sums: list[dict[str, float]] = [defaultdict(float) for _ in range(k)]
        for idx, cid in enumerate(assignments):
            for feat, val in vectors[idx].items():
                sums[cid][feat] += val
        for cid in range(k):
            norm = math.sqrt(sum(v * v for v in sums[cid].values())) or 1.0
            centroids[cid] = {feat: val / norm for feat, val in sums[cid].items()}

    return assignments


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--query", default="four bedroom house door actor walk", help="Query text for kNN recommendation")
    parser.add_argument("--clusters", type=int, default=12, help="Number of K-Means clusters")
    parser.add_argument("--topk", type=int, default=10, help="Top-K recommendations")
    args = parser.parse_args()

    catalog = json.loads(ONTOLOGY_PATH.read_text(encoding="utf-8"))
    concepts = catalog["concepts"]

    g = nx.DiGraph()
    for c in concepts:
        g.add_node(c["id"], label=c.get("label", ""), tier=c.get("tier", 0))
        if c.get("parent"):
            g.add_edge(c["parent"], c["id"], kind="parent")
    for rel in catalog.get("relations", []):
        src = rel.get("from") or rel.get("source")
        dst = rel.get("to") or rel.get("target")
        if src and dst:
            g.add_edge(src, dst, kind=rel.get("type", "rel"))

    try:
        pagerank = nx.pagerank(g.to_undirected(), alpha=0.85)
    except ModuleNotFoundError:
        from networkx.algorithms.link_analysis.pagerank_alg import _pagerank_python
        pagerank = _pagerank_python(g.to_undirected(), alpha=0.85)
    vectors = [trigram_vector(f"{c['id']} {c.get('label', '')}") for c in concepts]
    clusters = deterministic_kmeans_sparse(vectors, k=args.clusters)

    q_vec = trigram_vector(args.query)
    scored = []
    for idx, c in enumerate(concepts):
        sim = cosine_sparse(q_vec, vectors[idx])
        pr = pagerank.get(c["id"], 0.0)
        combined = 0.85 * sim + 0.15 * min(1.0, pr * 50.0)
        scored.append({
            "conceptId": c["id"],
            "label": c.get("label", ""),
            "clusterId": clusters[idx],
            "cosineSim": round(sim, 6),
            "pageRank": round(pr, 6),
            "score": round(combined, 6),
        })

    scored.sort(key=lambda r: (-r["score"], r["conceptId"]))
    top_recs = scored[: args.topk]

    report = {
        "schema": "atlas.scene-ontology-kmeans-pagerank.v1",
        "authorityLabel": "RETRIEVAL_PROPOSAL",
        "nonCanonical": True,
        "conceptCount": len(concepts),
        "edgeCount": g.number_of_edges(),
        "clusterCount": args.clusters,
        "query": args.query,
        "topRecommendations": top_recs,
    }
    OUT_PATH.parent.mkdir(parents=True, exist_ok=True)
    OUT_PATH.write_text(json.dumps(report, indent=2), encoding="utf-8")
    print(f"Wrote {OUT_PATH} ({len(concepts)} concepts, {g.number_of_edges()} edges, {args.clusters} clusters)")
    for r in top_recs[:5]:
        print(f"  {r['conceptId']:45s} | cluster={r['clusterId']:2d} | score={r['score']:.4f} | pr={r['pageRank']:.5f}")


if __name__ == "__main__":
    main()
