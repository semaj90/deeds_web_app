#!/usr/bin/env python3
"""
Retrieval Precision/Recall Evaluation for Legal AI Platform
Tests Qdrant vector search using labeled query sets.

Usage:
    python scripts/eval/retrieval_eval.py
    python scripts/eval/retrieval_eval.py --k 5 --collection court_opinions
    python scripts/eval/retrieval_eval.py --output reports/retrieval_eval.json
"""
import sys, json, re, argparse, time, os
from pathlib import Path
from typing import Optional

SCRIPT_DIR = Path(__file__).parent
DATA_DIR = SCRIPT_DIR / "data"
REPORTS_DIR = SCRIPT_DIR.parent / "analysis_reports"
REPORTS_DIR.mkdir(exist_ok=True)

QDRANT_URL = os.getenv("QDRANT_URL", "http://127.0.0.1:6333")
OLLAMA_URL = os.getenv("OLLAMA_URL", "http://127.0.0.1:11434")
EMBED_MODEL = os.getenv("EMBED_MODEL", "embeddinggemma:latest")
EMBED_DIM = 768


def get_embedding(text: str) -> Optional[list[float]]:
    """Get 768-dim embedding from Ollama."""
    import urllib.request
    payload = json.dumps({"model": EMBED_MODEL, "prompt": text}).encode()
    req = urllib.request.Request(
        f"{OLLAMA_URL}/api/embeddings",
        data=payload,
        headers={"Content-Type": "application/json"},
    )
    try:
        with urllib.request.urlopen(req, timeout=30) as resp:
            data = json.loads(resp.read())
            return data.get("embedding")
    except Exception as e:
        print(f"  [embed error] {e}", file=sys.stderr)
        return None


# Collections that returned 400 (named vectors or dimension mismatch) — skip after first failure
_bad_collections: set[str] = set()


def qdrant_search(collection: str, vector: list[float], k: int = 10) -> list[dict]:
    """Search Qdrant collection, return top-k hits. Skips collections that fail with 400."""
    if collection in _bad_collections:
        return []
    import urllib.request, urllib.error
    payload = json.dumps({
        "vector": vector,
        "limit": k,
        "with_payload": True,
        "with_vector": False,
    }).encode()
    req = urllib.request.Request(
        f"{QDRANT_URL}/collections/{collection}/points/search",
        data=payload,
        headers={"Content-Type": "application/json"},
    )
    try:
        with urllib.request.urlopen(req, timeout=30) as resp:
            data = json.loads(resp.read())
            return data.get("result", [])
    except urllib.error.HTTPError as e:
        if e.code == 400:
            _bad_collections.add(collection)
            print(f"  [qdrant skip] {collection}: 400 (named vectors or dim mismatch — skipped)", file=sys.stderr)
        else:
            print(f"  [qdrant error] {collection}: HTTP {e.code}", file=sys.stderr)
        return []
    except Exception as e:
        print(f"  [qdrant error] {collection}: {e}", file=sys.stderr)
        return []


def check_keyword_relevance(hit: dict, keywords: list[str]) -> bool:
    """Check if a search result contains any of the expected keywords."""
    payload = hit.get("payload", {})
    # Aggregate text fields to check
    text_fields = [
        payload.get("opinion_text", ""),
        payload.get("summary", ""),
        payload.get("title", ""),
        payload.get("citation", ""),
        str(payload.get("concepts", [])),
        str(payload.get("metadata", {})),
    ]
    combined = " ".join(text_fields).lower()
    return any(kw.lower() in combined for kw in keywords)


def precision_at_k(relevant_flags: list[bool], k: int) -> float:
    """Precision@k: fraction of top-k that are relevant."""
    top_k = relevant_flags[:k]
    return sum(top_k) / k if k > 0 else 0.0


def recall_at_k(relevant_flags: list[bool], min_relevant: int, k: int) -> float:
    """Recall@k: relevant found in top-k / total expected relevant."""
    found = sum(relevant_flags[:k])
    return min(found / min_relevant, 1.0) if min_relevant > 0 else 0.0


def reciprocal_rank(relevant_flags: list[bool]) -> float:
    """MRR: 1/rank of first relevant result."""
    for i, flag in enumerate(relevant_flags):
        if flag:
            return 1.0 / (i + 1)
    return 0.0


def list_collections() -> list[str]:
    """List all Qdrant collections."""
    import urllib.request
    try:
        with urllib.request.urlopen(f"{QDRANT_URL}/collections", timeout=10) as r:
            data = json.loads(r.read())
            return [c["name"] for c in data.get("result", {}).get("collections", [])]
    except Exception:
        return []


def eval_collection(collection: str, queries: list[dict], k: int) -> dict:
    """Run retrieval eval on one collection. Returns metrics dict."""
    print(f"\n  Collection: {collection}")
    results = []
    p_at_k_scores, r_at_k_scores, rr_scores = [], [], []

    for q in queries:
        qid = q["query_id"]
        query_text = q["query"]
        keywords = q.get("relevant_keywords", [])
        min_rel = q.get("min_relevant_docs", 1)

        print(f"    [{qid}] {query_text[:60]}...", end=" ")
        vec = get_embedding(query_text)
        if not vec:
            print("SKIP (embed failed)")
            continue

        hits = qdrant_search(collection, vec, k=k)
        rel_flags = [check_keyword_relevance(h, keywords) for h in hits]

        p = precision_at_k(rel_flags, k)
        r = recall_at_k(rel_flags, min_rel, k)
        rr = reciprocal_rank(rel_flags)

        p_at_k_scores.append(p)
        r_at_k_scores.append(r)
        rr_scores.append(rr)

        status = "✓" if any(rel_flags[:min(3, k)]) else "✗"
        print(f"{status}  P@{k}={p:.2f}  R@{k}={r:.2f}  RR={rr:.2f}")

        results.append({
            "query_id": qid,
            "query": query_text,
            "hits_count": len(hits),
            "relevant_in_top_k": sum(rel_flags[:k]),
            "precision_at_k": round(p, 4),
            "recall_at_k": round(r, 4),
            "reciprocal_rank": round(rr, 4),
            "top_3_titles": [
                h.get("payload", {}).get("title", h.get("payload", {}).get("citation", "?"))
                for h in hits[:3]
            ],
        })
        time.sleep(0.3)  # gentle rate limiting

    if not p_at_k_scores:
        return {"collection": collection, "error": "no results", "queries": []}

    map_score = sum(p_at_k_scores) / len(p_at_k_scores)
    mar_score = sum(r_at_k_scores) / len(r_at_k_scores)
    mrr_score = sum(rr_scores) / len(rr_scores)

    print(f"  → MAP@{k}={map_score:.3f}  MAR@{k}={mar_score:.3f}  MRR={mrr_score:.3f}")
    return {
        "collection": collection,
        "k": k,
        "num_queries": len(results),
        "mean_average_precision": round(map_score, 4),
        "mean_average_recall": round(mar_score, 4),
        "mean_reciprocal_rank": round(mrr_score, 4),
        "queries": results,
    }


def run(args) -> dict:
    labeled = json.loads((DATA_DIR / "labeled_queries.json").read_text())
    queries = labeled["queries"]
    if args.difficulty:
        queries = [q for q in queries if q.get("difficulty") == args.difficulty]
    if args.category:
        queries = [q for q in queries if q.get("category") == args.category]

    print(f"Retrieval Eval — k={args.k}, queries={len(queries)}")

    # Determine which collections to test
    available = list_collections()
    print(f"Available collections: {available}")
    if args.collection:
        collections = [args.collection] if args.collection in available else []
    else:
        # Default: prioritize the most useful collections
        priority = ["court_opinions", "legal_documents", "legal_cases", "glossary_terms"]
        collections = [c for c in priority if c in available]
        if not collections:
            collections = available[:3]

    all_results = {}
    for coll in collections:
        all_results[coll] = eval_collection(coll, queries, k=args.k)

    return {
        "eval_type": "retrieval",
        "k": args.k,
        "embed_model": EMBED_MODEL,
        "qdrant_url": QDRANT_URL,
        "collections_tested": collections,
        "results": all_results,
    }


def main():
    parser = argparse.ArgumentParser(description="Retrieval precision/recall evaluation")
    parser.add_argument("--k", type=int, default=5, help="Top-k for precision/recall")
    parser.add_argument("--collection", type=str, default="", help="Specific collection to test")
    parser.add_argument("--difficulty", choices=["easy", "medium", "hard"], default="")
    parser.add_argument("--category", type=str, default="")
    parser.add_argument("--output", type=str, default="")
    args = parser.parse_args()

    result = run(args)

    # Print summary
    print("\n=== RETRIEVAL EVAL SUMMARY ===")
    for coll, metrics in result["results"].items():
        if "error" in metrics:
            print(f"  {coll}: {metrics['error']}")
        else:
            print(
                f"  {coll}: MAP@{args.k}={metrics['mean_average_precision']:.3f} "
                f"MAR={metrics['mean_average_recall']:.3f} "
                f"MRR={metrics['mean_reciprocal_rank']:.3f} "
                f"({metrics['num_queries']} queries)"
            )

    # Save output
    out_path = args.output or str(REPORTS_DIR / f"retrieval_eval_{int(time.time())}.json")
    with open(out_path, "w", encoding="utf-8") as f:
        json.dump(result, f, indent=2, ensure_ascii=False)
    print(f"\nSaved: {out_path}")


if __name__ == "__main__":
    main()
