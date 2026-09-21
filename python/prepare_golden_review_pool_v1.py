"""Prepare a blank graded-review pool from current EmbeddingGemma retrieval.

Read-only with respect to PostgreSQL: it reads the structural proxy query set,
retrieves a bounded top-50 pool from the canonical semantic_768 column, and
writes reviewable JSONL with no assigned relevance grades.
"""

from __future__ import annotations

import hashlib
import json
import os
import random
from pathlib import Path

import psycopg2
import psycopg2.extras
import requests

ROOT = Path(__file__).resolve().parents[1]
INPUT = ROOT / ".tmp/atlas/structural-proxy-golden-set-v1.ndjson"
OUTPUT = ROOT / ".tmp/atlas/golden-relevance-review-pool-v1.ndjson"
REPORT = ROOT / "docs/reports/golden-relevance-review-pool-v1.json"
DATABASE_URL = os.environ.get("ATLAS_DATABASE_URL", "postgresql://legal_admin:123456@127.0.0.1:5434/legal_ai_db")
OLLAMA_URL = os.environ.get("ATLAS_EMBEDDING_URL", "http://127.0.0.1:11434")
EMBED_MODEL = os.environ.get("ATLAS_EMBEDDING_MODEL", "embeddinggemma:latest")
POOL_K = 50
SAMPLE_SIZE = 60
SEED = 684453


def checksum(data: bytes) -> str:
    return "sha256:" + hashlib.sha256(data).hexdigest()


def embed(text: str) -> list[float]:
    response = requests.post(
        f"{OLLAMA_URL}/api/embed",
        json={"model": EMBED_MODEL, "input": text[:2000]},
        timeout=30,
    )
    response.raise_for_status()
    vector = response.json()["embeddings"][0]
    if len(vector) != 768:
        raise ValueError(f"EmbeddingGemma contract violation: expected 768, got {len(vector)}")
    return vector


def main() -> None:
    entries = [json.loads(line) for line in INPUT.read_text(encoding="utf-8").splitlines() if line.strip()]
    rng = random.Random(SEED)
    selected = rng.sample(entries, min(SAMPLE_SIZE, len(entries)))
    records = []
    with psycopg2.connect(DATABASE_URL) as conn:
        with conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor) as cur:
            for entry in selected:
                vector = embed(entry["query_text"])
                literal = "[" + ",".join(f"{value:.8f}" for value in vector) + "]"
                cur.execute(
                    """
                    SELECT id::text AS candidate_id, relative_path, summary,
                           LEFT(content, 2000) AS content_excerpt, content_hash
                    FROM codebase_chunk_index
                    WHERE content_embedding IS NOT NULL AND id::text <> %s
                    ORDER BY content_embedding <=> %s::halfvec
                    LIMIT %s
                    """,
                    (entry["query_packet_key"], literal, POOL_K),
                )
                proxy_ids = set(entry.get("relevant_packet_keys", []))
                candidates = []
                for rank, row in enumerate(cur.fetchall(), start=1):
                    candidates.append({
                        "candidateId": row["candidate_id"],
                        "rank": rank,
                        "sourceRef": row["relative_path"],
                        "summary": row["summary"] or row["content_excerpt"],
                        "summarySource": "CANONICAL_SUMMARY" if row["summary"] else "CANONICAL_CONTENT_EXCERPT",
                        "contentHash": row["content_hash"],
                        "proxyRelevantHint": row["candidate_id"] in proxy_ids,
                        "relevanceGrade": None,
                        "confidence": None,
                        "reviewerId": None,
                        "evidenceRefs": [],
                        "notes": None,
                    })
                records.append({
                    "schema": "atlas.golden-relevance-review-pool-item.v1",
                    "reviewStatus": "PENDING",
                    "queryPacketKey": entry["query_packet_key"],
                    "evaluationQueryId": None,
                    "querySourceRef": entry["query_source_ref"],
                    "queryText": entry["query_text"],
                    "embeddingModel": EMBED_MODEL,
                    "representation": "semantic_768",
                    "candidateSnapshotRevision": None,
                    "ordinalMapChecksum": None,
                    "candidates": candidates,
                    "proxyHintIsNotTruth": True,
                })
    serialized = "".join(json.dumps(record, separators=(",", ":")) + "\n" for record in records)
    OUTPUT.parent.mkdir(parents=True, exist_ok=True)
    REPORT.parent.mkdir(parents=True, exist_ok=True)
    OUTPUT.write_text(serialized, encoding="utf-8")
    report = {
        "schema": "atlas.golden-relevance-review-pool-v1",
        "status": "REVIEW_POOL_PREPARED",
        "canonicalAuthority": False,
        "sourceCorpusEntries": len(entries),
        "sampledQueries": len(records),
        "poolK": POOL_K,
        "candidateCount": sum(len(record["candidates"]) for record in records),
        "blankGrades": sum(sum(candidate["relevanceGrade"] is None for candidate in record["candidates"]) for record in records),
        "embeddingModel": EMBED_MODEL,
        "representation": "semantic_768",
        "databaseWrites": False,
        "productionActivation": False,
        "inputChecksum": checksum(INPUT.read_bytes()),
        "outputChecksum": checksum(serialized.encode("utf-8")),
        "nextRequiredStep": "Fill grades 0-3 and revision bindings through independent review; do not import proxy hints.",
    }
    REPORT.write_text(json.dumps(report, indent=2) + "\n", encoding="utf-8")
    print(json.dumps(report))


# ---------------------------------------------------------------------------
# SEM768-GATE-00A: pooled multi-recipe mode (additive; default v1 behavior above is unchanged).
#   --pooled    build a TREC-style pool from A/B/C/D dense runs + lexical baseline, embed the pooled
#               candidates fresh under BOTH document recipes, write a BLIND reviewer file plus a
#               provenance/score sidecar. Read-only against PostgreSQL.
#   --evaluate  read graded reviewer file + sidecar, compute NDCG@10/MAP/MRR/P@5/P@10/R@10 per run.
# ---------------------------------------------------------------------------
import argparse
import math
import re

import numpy as np

POOLED_K = int(os.environ.get("ATLAS_POOL_K_PER_RUN", "12"))
POOLED_REVIEW = ROOT / ".tmp/atlas/golden-relevance-review-pool-pooled-v1.ndjson"
POOLED_SIDECAR = ROOT / ".tmp/atlas/golden-relevance-pool-pooled-provenance-v1.json"
POOLED_REPORT = ROOT / "docs/reports/golden-relevance-review-pool-pooled-v1.json"
EVAL_REPORT = ROOT / "docs/reports/golden-recipe-pool-evaluation-v1.json"
QUERY_RECIPES = {
    "unprompted-v0": lambda q: q,
    "retrieval-query-v1": lambda q: "task: search result | query: " + q,
    "code-retrieval-query-v1": lambda q: "task: code retrieval query | query: " + q,
}
DOC_RECIPES = {
    "raw_semantic_768_v1": lambda title, text: text,
    "semantic_768_retrieval_v1": lambda title, text: f"title: {title or 'none'} | text: {text}",
}
# run name -> (query recipe, column, pgvector type)
DENSE_RUNS = {
    "RAW_RAW": ("unprompted-v0", "content_embedding_768", "vector"),
    "RAW_TITLED": ("unprompted-v0", "content_embedding", "halfvec"),
    "PREFIXED_TITLED": ("retrieval-query-v1", "content_embedding", "halfvec"),
    "CODE_PREFIX_TITLED": ("code-retrieval-query-v1", "content_embedding", "halfvec"),
}
# (query recipe, doc recipe) scored on the SAME pooled candidate set
FRESH_RUNS = {
    "FRESH_RAW_RAW": ("unprompted-v0", "raw_semantic_768_v1"),
    "FRESH_RAW_TITLED": ("unprompted-v0", "semantic_768_retrieval_v1"),
    "FRESH_PREFIXED_TITLED": ("retrieval-query-v1", "semantic_768_retrieval_v1"),
    "FRESH_PREFIXED_RAW": ("retrieval-query-v1", "raw_semantic_768_v1"),
    "FRESH_CODE_TITLED": ("code-retrieval-query-v1", "semantic_768_retrieval_v1"),
}


def embed_many(texts: list[str]) -> np.ndarray:
    out: list[list[float]] = []
    for i in range(0, len(texts), 32):
        response = requests.post(
            f"{OLLAMA_URL}/api/embed",
            json={"model": EMBED_MODEL, "input": [t[:2000] for t in texts[i:i + 32]]},
            timeout=120,
        )
        response.raise_for_status()
        out.extend(response.json()["embeddings"])
    arr = np.asarray(out, dtype=np.float32)
    if arr.shape[1] != 768:
        raise ValueError(f"expected 768 dims, got {arr.shape[1]}")
    return arr / np.linalg.norm(arr, axis=1, keepdims=True)


def lexical_tsquery(text: str) -> str | None:
    tokens: list[str] = []
    for token in re.findall(r"[A-Za-z_][A-Za-z0-9_]{2,}", text):
        if token.lower() not in (t.lower() for t in tokens):
            tokens.append(token)
    tokens = tokens[:15]
    return " | ".join(tokens) if tokens else None


def build_pooled() -> None:
    entries = [json.loads(line) for line in INPUT.read_text(encoding="utf-8").splitlines() if line.strip()]
    selected = random.Random(SEED).sample(entries, min(SAMPLE_SIZE, len(entries)))
    qvec = {
        name: embed_many([recipe(e["query_text"]) for e in selected])
        for name, recipe in QUERY_RECIPES.items()
    }
    review_records, sidecar = [], {}
    with psycopg2.connect(DATABASE_URL) as conn:
        conn.set_session(readonly=True)
        with conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor) as cur:
            for qi, entry in enumerate(selected):
                pool: dict[str, dict] = {}

                def add(row: dict, run: str, rank: int) -> None:
                    cand = pool.setdefault(row["candidate_id"], {"row": row, "retrievedBy": [], "ranksByRun": {}})
                    cand["retrievedBy"].append(run)
                    cand["ranksByRun"][run] = rank

                for run, (qr, col, ty) in DENSE_RUNS.items():
                    literal = "[" + ",".join(f"{v:.8f}" for v in qvec[qr][qi]) + "]"
                    cur.execute(
                        f"""SELECT id::text AS candidate_id, relative_path, summary, content, content_hash
                            FROM codebase_chunk_index
                            WHERE {col} IS NOT NULL AND id::text <> %s
                            ORDER BY {col} <=> %s::{ty}(768) LIMIT %s""",
                        (entry["query_packet_key"], literal, POOLED_K),
                    )
                    for rank, row in enumerate(cur.fetchall(), start=1):
                        add(row, run, rank)
                tsq = lexical_tsquery(entry["query_text"])
                if tsq:
                    cur.execute(
                        """SELECT id::text AS candidate_id, relative_path, summary, content, content_hash
                           FROM codebase_chunk_index
                           WHERE search_vector @@ to_tsquery('english', %s) AND id::text <> %s
                           ORDER BY ts_rank(search_vector, to_tsquery('english', %s)) DESC LIMIT %s""",
                        (tsq, entry["query_packet_key"], tsq, POOLED_K),
                    )
                    for rank, row in enumerate(cur.fetchall(), start=1):
                        add(row, "LEXICAL", rank)
                ids = sorted(pool)
                docs = {
                    name: embed_many([
                        recipe(pool[i]["row"]["relative_path"], (pool[i]["row"]["content"] or "")[:2000])
                        for i in ids
                    ])
                    for name, recipe in DOC_RECIPES.items()
                }
                fresh = {}
                for run, (qr, dr) in FRESH_RUNS.items():
                    scores = docs[dr] @ qvec[qr][qi]
                    fresh[run] = {i: float(s) for i, s in zip(ids, scores)}
                # deterministic shuffle so reviewer order does not reveal any run's ranking
                order = sorted(ids, key=lambda i: hashlib.sha256((entry["query_packet_key"] + i).encode()).hexdigest())
                proxy_ids = set(entry.get("relevant_packet_keys", []))
                review_records.append({
                    "schema": "atlas.golden-relevance-review-pool-item.v2",
                    "reviewStatus": "PENDING",
                    "queryPacketKey": entry["query_packet_key"],
                    "evaluationQueryId": None,
                    "querySourceRef": entry["query_source_ref"],
                    "queryText": entry["query_text"],
                    "candidates": [{
                        "candidateId": i,
                        "sourceRef": pool[i]["row"]["relative_path"],
                        "summary": pool[i]["row"]["summary"] or (pool[i]["row"]["content"] or "")[:600],
                        "contentHash": pool[i]["row"]["content_hash"],
                        "relevanceGrade": None, "confidence": None, "judgmentSource": None, "reviewerId": None,
                        "evidenceRefs": [], "notes": None,
                    } for i in order],
                    "proxyHintIsNotTruth": True,
                    "reviewInstructions": {
                        "gradeScale": "0=irrelevant, 1=marginal, 2=relevant, 3=highly relevant",
                        "blind": True,
                        "proxyIsNotTruth": True,
                        "modelProposals": "judgmentSource=MODEL_PROPOSAL, trainingEligible=false; human grades use HUMAN_REVIEWED",
                    },
                })
                sidecar[entry["query_packet_key"]] = {
                    "proxyRelevantIds": sorted(proxy_ids & set(ids)),
                    "candidates": {i: {
                        "retrievedBy": pool[i]["retrievedBy"],
                        "ranksByRun": pool[i]["ranksByRun"],
                        "queryRecipeRevisions": sorted({DENSE_RUNS[r][0] for r in pool[i]["retrievedBy"] if r in DENSE_RUNS}),
                        "freshScores": {run: fresh[run][i] for run in fresh},
                    } for i in ids},
                }
                print(f"query {qi + 1}/{len(selected)}: pool {len(ids)}", flush=True)
    serialized = "".join(json.dumps(r, separators=(",", ":")) + "\n" for r in review_records)
    POOLED_REVIEW.parent.mkdir(parents=True, exist_ok=True)
    POOLED_REVIEW.write_text(serialized, encoding="utf-8")
    POOLED_SIDECAR.write_text(json.dumps(sidecar, separators=(",", ":")), encoding="utf-8")
    report = {
        "schema": "atlas.golden-relevance-review-pool-pooled-v1",
        "status": "POOLED_REVIEW_POOL_PREPARED",
        "canonicalAuthority": False,
        "sampledQueries": len(review_records),
        "poolKPerRun": POOLED_K,
        "denseRuns": list(DENSE_RUNS), "lexicalBaseline": True,
        "freshScoringRuns": list(FRESH_RUNS),
        "candidateCount": sum(len(r["candidates"]) for r in review_records),
        "blankGrades": sum(len(r["candidates"]) for r in review_records),
        "reviewerFileHidesProvenance": True,
        "databaseWrites": False, "productionActivation": False,
        "inputChecksum": checksum(INPUT.read_bytes()),
        "reviewFileChecksum": checksum(serialized.encode("utf-8")),
        "nextRequiredStep": "Blind 0-3 grading of the reviewer file; then run --evaluate.",
    }
    POOLED_REPORT.write_text(json.dumps(report, indent=2) + "\n", encoding="utf-8")
    print(json.dumps(report))


def _dcg(gains: list[float]) -> float:
    return sum(g / math.log2(i + 2) for i, g in enumerate(gains))


def evaluate_pooled() -> None:
    # DIAGNOSTIC_PARITY_HELPER: canonical evaluator remains phase2f-evaluation-runner.mts
    sidecar = json.loads(PROVENANCE_OUT.read_text(encoding='utf-8'))
    grades: dict[str, dict[str, int]] = {}
    for line in QUEUE_OUT.read_text(encoding='utf-8').splitlines():
        rec = json.loads(line)
        g = {j['packetKey']: j['relevanceGrade'] for j in rec['judgments'] if j['relevanceGrade'] is not None}
        if g:
            grades[rec['queryPacketKey']] = g
    if not grades:
        raise SystemExit('NOT_PROVEN: no graded candidates in review queue (grades 0-3 required)')
    runs = list(FRESH_RUNS) + list(DENSE_RUNS) + ["LEXICAL"]
    totals = {r: {"ndcg10": [], "ap": [], "rr": [], "p5": [], "p10": [], "r10": []} for r in runs}
    for qk, g in grades.items():
        cands = sidecar[qk]
        rel = {i for i, v in g.items() if v >= 1}
        if not rel:
            continue
        ideal = _dcg(sorted(g.values(), reverse=True)[:10])
        for run in runs:
            if run in FRESH_RUNS:
                ranked = sorted(cands, key=lambda i: -cands[i]["freshScores"][run])
            else:
                ranked = sorted((i for i in cands if run in cands[i]["ranksByRun"]), key=lambda i: cands[i]["ranksByRun"][run])
            hits = [i in rel for i in ranked]
            ap, seen = 0.0, 0
            for pos, h in enumerate(hits, start=1):
                if h:
                    seen += 1
                    ap += seen / pos
            t = totals[run]
            t["ndcg10"].append(_dcg([g.get(i, 0) for i in ranked[:10]]) / ideal if ideal else 0.0)
            t["ap"].append(ap / len(rel))
            t["rr"].append(next((1 / p for p, h in enumerate(hits, start=1) if h), 0.0))
            t["p5"].append(sum(hits[:5]) / 5)
            t["p10"].append(sum(hits[:10]) / 10)
            t["r10"].append(sum(hits[:10]) / len(rel))
    mean = lambda xs: round(sum(xs) / len(xs), 4) if xs else None
    report = {
        "schema": "atlas.golden-recipe-pool-evaluation-v1",
        "canonicalAuthority": False,
        "gradedQueries": len(grades),
        "relevanceThreshold": "grade>=1 (binary metrics); NDCG uses raw 0-3 gain",
        "note": "FRESH_* runs score the same pooled candidate set under each query/document recipe (recipe quality, exact cosine). Dense/LEXICAL runs are stored-column/lexical rankings restricted to the pool (executor and corpus effects included).",
        "runs": {r: {"ndcg10": mean(t["ndcg10"]), "map": mean(t["ap"]), "mrr": mean(t["rr"]),
                     "p5": mean(t["p5"]), "p10": mean(t["p10"]), "recall10": mean(t["r10"]),
                     "queries": len(t["rr"])} for r, t in totals.items()},
    }
    EVAL_REPORT.write_text(json.dumps(report, indent=2) + "\n", encoding="utf-8")
    print(json.dumps(report, indent=2))


QUEUE_OUT = ROOT / ".tmp/atlas/golden-relevance-review-queue-pooled-v1.ndjson"
PROVENANCE_OUT = ROOT / ".tmp/atlas/golden-pool-provenance-v1.json"
BIND_REPORT = ROOT / "docs/reports/golden-pool-identity-binding-v1.json"


def bind_and_adapt() -> None:
    """GATE-00C/D: bind pooled chunk ids to canonical candidate identity and emit the EXISTING
    atlas.golden-relevance-review-item.v1 shape. Precedence: symbol_version_id (no column on the chunk
    table) -> packet_key via atlas_packet_chunk_lineage (exact chunk) -> packet_key via atlas_packets.source_ref
    (DEGRADED: file-level, chunk grain lost) -> UNRESOLVED_IDENTITY (excluded, never invented)."""
    sidecar = json.loads(POOLED_SIDECAR.read_text(encoding="utf-8"))
    review = [json.loads(l) for l in POOLED_REVIEW.read_text(encoding="utf-8").splitlines() if l.strip()]
    chunk_ids = sorted({c["candidateId"] for r in review for c in r["candidates"]})
    with psycopg2.connect(DATABASE_URL) as conn:
        conn.set_session(readonly=True)
        with conn.cursor() as cur:
            cur.execute("SELECT chunk_row_id::text, packet_key FROM atlas_packet_chunk_lineage WHERE chunk_row_id::text = ANY(%s)", (chunk_ids,))
            exact = {a: b for a, b in cur.fetchall()}
            cur.execute("SELECT id::text, source_ref FROM codebase_chunk_index WHERE id::text = ANY(%s)", (chunk_ids,))
            chunk_ref = dict(cur.fetchall())
            cur.execute("SELECT source_ref, packet_key FROM atlas_packets WHERE source_ref = ANY(%s)", (sorted({v for v in chunk_ref.values() if v}),))
            by_ref = dict(cur.fetchall())
    queue, prov = [], {}
    stats = {"exactLineage": 0, "sourceRefFallback": 0, "unresolved": 0}
    for r in review:
        merged: dict[str, dict] = {}
        for c in r["candidates"]:
            cid = c["candidateId"]
            if cid in exact:
                pk, kind = exact[cid], "PACKET_CHUNK_LINEAGE"; stats["exactLineage"] += 1
            elif chunk_ref.get(cid) in by_ref:
                pk, kind = by_ref[chunk_ref[cid]], "SOURCE_REF_FALLBACK_DEGRADED"; stats["sourceRefFallback"] += 1
            else:
                stats["unresolved"] += 1
                continue
            side = sidecar[r["queryPacketKey"]]["candidates"][cid]
            m = merged.setdefault(pk, {"display": c, "chunkIds": [], "bindingKinds": set(), "ranksByRun": {}, "freshScores": {}})
            m["chunkIds"].append(cid); m["bindingKinds"].add(kind)
            for run, rank in side["ranksByRun"].items():
                m["ranksByRun"][run] = min(rank, m["ranksByRun"].get(run, rank))
            for run, sc in side["freshScores"].items():
                m["freshScores"][run] = max(sc, m["freshScores"].get(run, sc))
        queue.append({
            "schema": "atlas.golden-relevance-review-item.v1",
            "reviewStatus": "PENDING",
            "queryPacketKey": r["queryPacketKey"],
            "evaluationQueryId": r["evaluationQueryId"],
            "querySourceRef": r["querySourceRef"],
            "queryText": r["queryText"],
            "candidateSource": "POOLED_MULTI_RECIPE_BLIND_V1",
            "judgments": [{
                "packetKey": pk, "relevanceGrade": None, "confidence": None, "judgmentSource": None,
                "reviewerId": None, "evidenceRefs": [], "notes": None,
                "display": {"sourceRef": m["display"]["sourceRef"], "summary": m["display"]["summary"]},
            } for pk, m in sorted(merged.items(), key=lambda kv: hashlib.sha256((r["queryPacketKey"] + kv[0]).encode()).hexdigest())],
            "reviewInstructions": r["reviewInstructions"] | {"addHardNegatives": True, "requireRevisionBoundIdentity": True},
        })
        prov[r["queryPacketKey"]] = {pk: {
            "chunkIds": m["chunkIds"], "identityBinding": sorted(m["bindingKinds"]),
            "retrievedBy": sorted(m["ranksByRun"]), "ranksByRun": m["ranksByRun"], "freshScores": m["freshScores"],
        } for pk, m in merged.items()}
    QUEUE_OUT.write_text("".join(json.dumps(q, separators=(",", ":")) + "\n" for q in queue), encoding="utf-8")
    PROVENANCE_OUT.write_text(json.dumps(prov, separators=(",", ":")), encoding="utf-8")
    report = {
        "schema": "atlas.golden-pool-identity-binding-v1", "status": "POOLED_QUEUE_ADAPTED",
        "canonicalAuthority": False, "queries": len(queue),
        "candidatesAfterDedupe": sum(len(q["judgments"]) for q in queue),
        "bindingStats": stats,
        "note": "SOURCE_REF_FALLBACK_DEGRADED binds at file level (chunk grain lost); UNRESOLVED excluded, not invented. No symbol_version_id column exists on codebase_chunk_index.",
        "databaseWrites": False, "nextRequiredStep": "validate-golden-relevance-review-queue-v1 then blind human grading",
    }
    BIND_REPORT.write_text(json.dumps(report, indent=2) + "\n", encoding="utf-8")
    print(json.dumps(report, indent=2))


if __name__ == "__main__":
    _ap = argparse.ArgumentParser()
    _ap.add_argument("--bind-adapt", action="store_true")
    _ap.add_argument("--pooled", action="store_true")
    _ap.add_argument("--evaluate", action="store_true")
    _args = _ap.parse_args()
    if _args.bind_adapt:
        bind_and_adapt()
    elif _args.pooled:
        build_pooled()
    elif _args.evaluate:
        evaluate_pooled()
    else:
        main()
