"""DOC-14 retrieval smoke harness over a frozen exported chunk corpus.

The default CLI builds diagnostic queries from the same records it scores. It is
therefore a self-match smoke test, not a reviewed relevance benchmark. The
`corpus_order_prior` lane is an ordinal baseline, not graph retrieval. Read-only
(`canonicalAuthority=False`).
"""

from __future__ import annotations

import json
import argparse
import hashlib
import re
import sys
from pathlib import Path
from typing import Any

REPO_ROOT = Path(__file__).resolve().parents[2]
if str(REPO_ROOT) not in sys.path:
    sys.path.insert(0, str(REPO_ROOT))

from python.atlas_graph_runtime.document_relation_rrf_v1 import fuse_topk

JSONL_PATH = REPO_ROOT / "docs" / "reports" / "doc14-admitted-chunks.jsonl"
REPORT_PATH = REPO_ROOT / "docs" / "reports" / "doc14-topk-lane-eval-v1.json"

_TOKEN_RE = re.compile(r"[a-zA-Z0-9_$-]{3,}")


def corpus_identity_checksum(records: list[dict[str, Any]]) -> str:
    """Bind a reviewed query set to the exact candidate identities and source bytes."""
    projection = sorted((
        str(r.get("chunkId", "")), str(r.get("sourceRef", "")),
        str(r.get("sourceRevision", "")), str(r.get("chunkSha256", "")),
    ) for r in records)
    raw = json.dumps(projection, ensure_ascii=False, separators=(",", ":")).encode("utf-8")
    return "sha256:" + hashlib.sha256(raw).hexdigest()


def reviewed_query_set_revision(query_set: dict[str, Any]) -> str:
    payload = {key: value for key, value in query_set.items() if key != "querySetRevision"}
    raw = json.dumps(payload, ensure_ascii=False, sort_keys=True, separators=(",", ":")).encode("utf-8")
    return "sha256:" + hashlib.sha256(raw).hexdigest()


def validate_reviewed_query_set(query_set: dict[str, Any], records: list[dict[str, Any]]) -> None:
    if query_set.get("schema") != "atlas.doc14-reviewed-query-set.v1":
        raise ValueError("INVALID_REVIEWED_QUERY_SET_SCHEMA")
    if query_set.get("reviewStatus") != "REVIEWED" or not query_set.get("reviewerRef"):
        raise ValueError("REVIEWED_QUERY_SET_REVIEW_RECEIPT_REQUIRED")
    if not str(query_set.get("querySetRevision", "")).strip():
        raise ValueError("REVIEWED_QUERY_SET_REVISION_REQUIRED")
    if query_set.get("querySetRevision") != reviewed_query_set_revision(query_set):
        raise ValueError("REVIEWED_QUERY_SET_REVISION_CHECKSUM_MISMATCH")
    if query_set.get("corpusChecksum") != corpus_identity_checksum(records):
        raise ValueError("REVIEWED_QUERY_SET_CORPUS_CHECKSUM_MISMATCH")
    queries = query_set.get("queries")
    if not isinstance(queries, list) or len(queries) < 30:
        raise ValueError("REVIEWED_QUERY_SET_REQUIRES_AT_LEAST_30_QUERIES")
    corpus_ids: set[str] = set()
    for record in records:
        chunk_id = str(record.get("chunkId", ""))
        source_ref = str(record.get("sourceRef", ""))
        source_revision = str(record.get("sourceRevision", ""))
        text = str(record.get("text", ""))
        checksum = str(record.get("chunkSha256", ""))
        checksum = checksum.removeprefix("sha256:")
        if not chunk_id or not source_ref or not source_revision or not re.fullmatch(r"[a-f0-9]{64}", checksum):
            raise ValueError("FROZEN_CORPUS_IDENTITY_OR_CHECKSUM_MISSING")
        if chunk_id in corpus_ids:
            raise ValueError(f"FROZEN_CORPUS_DUPLICATE_CHUNK_ID:{chunk_id}")
        if hashlib.sha256(text.encode("utf-8")).hexdigest() != checksum:
            raise ValueError(f"FROZEN_CORPUS_CHUNK_CHECKSUM_MISMATCH:{chunk_id}")
        corpus_ids.add(chunk_id)
    query_ids: set[str] = set()
    for query in queries:
        if not isinstance(query, dict) or not str(query.get("query", "")).strip():
            raise ValueError("REVIEWED_QUERY_INVALID")
        qid = str(query.get("queryId", ""))
        if not qid or qid in query_ids:
            raise ValueError("REVIEWED_QUERY_ID_MISSING_OR_DUPLICATE")
        query_ids.add(qid)
        labels = query.get("relevantChunks")
        if not isinstance(labels, list):
            raise ValueError(f"RELEVANCE_LABELS_REQUIRED:{qid}")
        seen: set[str] = set()
        for label in labels:
            if not isinstance(label, dict):
                raise ValueError(f"RELEVANCE_LABEL_INVALID:{qid}")
            chunk_id = str(label.get("chunkId", ""))
            grade = label.get("grade")
            if not chunk_id or chunk_id not in corpus_ids:
                raise ValueError(f"RELEVANT_CHUNK_NOT_IN_FROZEN_CORPUS:{qid}:{chunk_id}")
            if chunk_id in seen or not isinstance(grade, int) or grade < 1 or grade > 3:
                raise ValueError(f"RELEVANCE_LABEL_DUPLICATE_OR_OUT_OF_RANGE:{qid}:{chunk_id}")
            seen.add(chunk_id)


def _dcg(grades: list[int]) -> float:
    return sum((2**grade - 1) / __import__("math").log2(rank + 2) for rank, grade in enumerate(grades))


def evaluate_topk_lanes(
    records: list[dict[str, Any]],
    queries: list[dict[str, Any]],
    *,
    k: int = 5,
    evaluation_kind: str = "DIAGNOSTIC_SELF_MATCH_SMOKE",
    reviewed_relevance_labels: bool = False,
    cohort_revision: str | None = None,
) -> dict[str, Any]:
    """Compare exact_id, lexical, graph_prior, and hybrid_rrf on reviewed queries."""
    lanes = ("exact_id", "lexical", "corpus_order_prior", "hybrid_rrf")
    totals: dict[str, dict[str, float]] = {
        lane: {"recall_hits": 0.0, "rr_sum": 0.0, "span_verified": 0.0}
        for lane in lanes
    }

    per_query: list[dict[str, Any]] = []
    for q in queries:
        q_text = str(q["query"])
        expected_ref = str(q.get("expectedSourceRef", ""))
        relevance = {str(item["chunkId"]): int(item["grade"]) for item in q.get("relevantChunks", [])}
        q_tokens = {t.lower() for t in _TOKEN_RE.findall(q_text)}

        exact_ranked: list[tuple[float, str]] = []
        lex_ranked: list[tuple[float, str]] = []
        graph_ranked: list[tuple[float, str]] = []

        for idx, rec in enumerate(records):
            cid = str(rec["chunkId"])
            ref = str(rec["sourceRef"])
            text = str(rec["text"])
            low_text = text.lower()
            low_ref = ref.lower()

            exact_score = 1.0 if (q.get("exactIdentifier") and str(q["exactIdentifier"]).lower() in low_text) else 0.0
            if exact_score > 0:
                exact_ranked.append((exact_score, cid))

            overlap = sum(1 for tok in q_tokens if tok in low_text or tok in low_ref)
            if overlap > 0:
                lex_ranked.append((float(overlap), cid))

            # Diagnostic corpus-order baseline. This is not a graph or source-authority signal.
            prior = 1.0 / (1.0 + idx * 0.05)
            graph_ranked.append((prior, cid))

        exact_ids = [cid for _, cid in sorted(exact_ranked, key=lambda x: (-x[0], x[1]))][:25]
        lex_ids = [cid for _, cid in sorted(lex_ranked, key=lambda x: (-x[0], x[1]))][:50]
        corpus_order_ids = [cid for _, cid in sorted(graph_ranked, key=lambda x: (-x[0], x[1]))][:20]
        hybrid_rows = fuse_topk(exact_ids, lex_ids, corpus_order_ids, [], k=k)
        hybrid_ids = [r["chunkId"] for r in hybrid_rows]

        rec_by_id = {str(r["chunkId"]): r for r in records}
        lane_lists = {
            "exact_id": exact_ids[:k],
            "lexical": lex_ids[:k],
            "corpus_order_prior": corpus_order_ids[:k],
            "hybrid_rrf": hybrid_ids[:k],
        }
        q_res: dict[str, Any] = {"query": q_text, "expectedSourceRef": expected_ref or None}
        for lane, cids in lane_lists.items():
            rank = None
            verified = False
            for pos, cid in enumerate(cids, 1):
                rec = rec_by_id.get(cid)
                is_relevant = (cid in relevance) if reviewed_relevance_labels else bool(expected_ref and rec and rec["sourceRef"] == expected_ref)
                if rec and is_relevant:
                    if rank is None:
                        rank = pos
                    if rec.get("pgReadbackStatus") == "PROVEN" and rec.get("chunkSha256"):
                        verified = True
            if rank is not None:
                totals[lane]["recall_hits"] += 1.0
                totals[lane]["rr_sum"] += 1.0 / rank
            if verified:
                totals[lane]["span_verified"] += 1.0
            grades = [relevance.get(cid, 0) for cid in cids] if reviewed_relevance_labels else [1 if (rec_by_id.get(cid) or {}).get("sourceRef") == expected_ref else 0 for cid in cids]
            relevant_count = len(relevance) if reviewed_relevance_labels else len({r["chunkId"] for r in records if expected_ref and r.get("sourceRef") == expected_ref})
            retrieved_relevant = sum(1 for grade in grades if grade > 0)
            ideal = sorted(relevance.values(), reverse=True)[:k] if reviewed_relevance_labels else [1] * min(k, relevant_count)
            ndcg = (_dcg(grades) / _dcg(ideal)) if ideal and _dcg(ideal) else 0.0
            q_res[lane] = {
                "rank": rank, "verified": verified,
                "recallAtK": round(retrieved_relevant / max(1, relevant_count), 4),
                "precisionAtK": round(retrieved_relevant / max(1, len(cids)), 4),
                "ndcgAtK": round(ndcg, 4),
            }
        per_query.append(q_res)

    n = max(1, len(queries))
    metrics = {
        lane: {
            f"recallAt{k}": round(vals["recall_hits"] / n, 4),
            "mrr": round(vals["rr_sum"] / n, 4),
            "verifiedRate": round(vals["span_verified"] / n, 4),
            "recallAtK": round(sum(per_query[i][lane]["recallAtK"] for i in range(len(per_query))) / n, 4),
            "precisionAtK": round(sum(per_query[i][lane]["precisionAtK"] for i in range(len(per_query))) / n, 4),
            "ndcgAtK": round(sum(per_query[i][lane]["ndcgAtK"] for i in range(len(per_query))) / n, 4),
        }
        for lane, vals in totals.items()
    }
    return {
        "schema": "atlas.doc14-topk-lane-eval.v1",
        "evaluationKind": evaluation_kind,
        "queryConstruction": "frozen reviewed queries" if reviewed_relevance_labels else "sampled from the same exported corpus being scored",
        "reviewedRelevanceLabels": reviewed_relevance_labels,
        "graphLaneAvailable": False,
        "qualityBenchmarkEligible": False,
        "reviewedCohortShapeValid": bool(reviewed_relevance_labels and cohort_revision and len(queries) >= 30),
        "cohortRevision": cohort_revision,
        "k": k,
        "queryCount": len(queries),
        "recordCount": len(records),
        "metrics": metrics,
        "perQuerySample": per_query[:5],
        "canonicalAuthority": False,
        "writesPerformed": False,
    }


def main() -> int:
    parser = argparse.ArgumentParser(description="DOC-14 diagnostic or reviewed top-K evaluation (read-only).")
    parser.add_argument("--corpus", type=Path, default=JSONL_PATH)
    parser.add_argument("--reviewed-queries", type=Path)
    parser.add_argument("--output", type=Path, default=REPORT_PATH)
    args = parser.parse_args()
    records = [json.loads(l) for l in args.corpus.read_text(encoding="utf-8").splitlines() if l.strip()]
    if args.reviewed_queries:
        query_set = json.loads(args.reviewed_queries.read_text(encoding="utf-8"))
        validate_reviewed_query_set(query_set, records)
        result = evaluate_topk_lanes(
            records, query_set["queries"], k=10,
            evaluation_kind="REVIEWED_FROZEN_COHORT",
            reviewed_relevance_labels=True,
            cohort_revision=str(query_set.get("querySetRevision", "")),
        )
        result["corpusChecksum"] = corpus_identity_checksum(records)
        result["reviewerRef"] = query_set["reviewerRef"]
        result["querySetRevision"] = query_set["querySetRevision"]
        result["questionSetPath"] = str(args.reviewed_queries)
        result["corpusPath"] = str(args.corpus)
        result["citationClaimSupportMeasured"] = False
        result["abstentionMeasured"] = False
        result["metricsNote"] = "Retrieval metrics only. Reviewer identity/attestation is recorded but not independently authenticated here; benchmark promotion remains false. Claim support and abstention require separate labeled outputs."
    else:
        # Round-robin across sourceRefs for a stable self-match diagnostic only.
        by_ref: dict[str, list[dict[str, Any]]] = {}
        for r in records:
            by_ref.setdefault(r["sourceRef"], []).append(r)
        ordered_samples: list[dict[str, Any]] = []
        idx = 0
        while len(ordered_samples) < 30:
            added = False
            for ref in sorted(by_ref):
                if idx < len(by_ref[ref]):
                    ordered_samples.append(by_ref[ref][idx])
                    added = True
                    if len(ordered_samples) >= 30:
                        break
            if not added:
                break
            idx += 1

        queries: list[dict[str, Any]] = []
        for sample in ordered_samples:
            ref = sample["sourceRef"]
            toks = [t for t in _TOKEN_RE.findall(sample["text"]) if len(t) >= 6][:4]
            ident = toks[0] if toks else Path(ref).stem
            queries.append({
                "query": f"{Path(ref).stem} {' '.join(toks)}",
                "exactIdentifier": ident,
                "expectedSourceRef": ref,
            })

        result = evaluate_topk_lanes(records, queries, k=5)
    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text(json.dumps(result, indent=2) + "\n", encoding="utf-8")
    print(json.dumps({
        "schema": result["schema"],
        "evaluationKind": result["evaluationKind"],
        "qualityBenchmarkEligible": result["qualityBenchmarkEligible"],
        "queryCount": result["queryCount"],
        "recordCount": result["recordCount"],
        "metrics": result["metrics"],
        "reportPath": str(args.output),
    }, indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
