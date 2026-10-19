#!/usr/bin/env python3
"""atlas_retrieval_canary_v1.py - frozen retrieval canary: run, record, and pick hyperparameters procedurally.

Subcommands
  run     Exact oracle (in-process float32 cosine over all canonical content_embedding_768 rows) vs a live ANN
          sidecar, over a frozen hash-ordered query set, sweeping retrieve_k. Read-only. Prints a receipt JSON
          and (optionally) saves the frozen truth to .npz.
  ingest  Record a receipt into atlas_retrieval_canary_runs_v1 / atlas_retrieval_canary_sequence_v1
          (sequence_id = '<executor>:k=<K>'). Dry-run unless --apply. Idempotent on receipt_checksum.
  best    Smallest retrieve_k whose recall meets --target for the newest run of an executor.

Evidence only: nothing here mints identity, writes retrieval state, or adds a retrieval vote.
"""
from __future__ import annotations

import argparse
import hashlib
import json
import os
import sys
import time
import urllib.request
from pathlib import Path
from typing import Any, Dict, List, Optional

DEFAULT_KS = [10, 25, 50, 75, 100, 150, 200]
QUERY_SET_RULE = "first N canonical chunks ordered by md5('canary'||id); query row excluded from truth and results"


def sha256_file(path: str) -> str:
    h = hashlib.sha256()
    with open(path, "rb") as fh:
        for block in iter(lambda: fh.read(1 << 20), b""):
            h.update(block)
    return h.hexdigest()


def canonical_json(value: Any) -> str:
    return json.dumps(value, sort_keys=True, separators=(",", ":"))


def receipt_checksum(receipt: Dict[str, Any]) -> str:
    return hashlib.sha256(canonical_json(receipt).encode("utf-8")).hexdigest()


def validate_receipt(receipt: Dict[str, Any]) -> None:
    """Fail closed on anything that is not a clean, read-only, error-free receipt."""
    for key in ("queries", "corpus_rows", "results", "sidecar", "oracle"):
        if key not in receipt:
            raise ValueError(f"receipt missing {key}")
    if receipt.get("writesPerformed") is not False:
        raise ValueError("receipt must record writesPerformed=false")
    if receipt.get("heldout_self_excluded") is not True:
        raise ValueError("receipt must be held-out (self excluded)")
    if int(receipt.get("errors", 0)) != 0:
        raise ValueError("receipt has errors; refusing to record")
    if not receipt["results"]:
        raise ValueError("receipt has no results")
    for row in receipt["results"]:
        if not 0.0 <= float(row["recall_top10_after_exact_rescore"]) <= 1.0:
            raise ValueError("recall out of range")


def receipt_to_rows(receipt: Dict[str, Any], executor: str) -> List[Dict[str, Any]]:
    validate_receipt(receipt)
    sidecar = receipt["sidecar"]
    rows = []
    for no, r in enumerate(sorted(receipt["results"], key=lambda x: sorted((x.get("sweep") or {"retrieve_k": x["retrieve_k"]}).items()))):
        sweep = r.get("sweep") or {"retrieve_k": r["retrieve_k"]}
        rows.append({
            "sequence_no": no,
            "sequence_id": f"{executor}:" + ",".join(f"{'k' if k == 'retrieve_k' else k}={v}" for k, v in sorted(sweep.items())),
            "hyperparameters": {**sweep, "dim": sidecar.get("dim"), "bits": sidecar.get("bits"),
                                "projection": sidecar.get("projection"), "source": sidecar.get("source")},
            "recall_top10": float(r["recall_top10_after_exact_rescore"]),
            "mrr_exact_nn1": r.get("mrr_exact_nn1"),
            "p50_ms": r.get("p50_ms"),
            "p95_ms": r.get("p95_ms"),
        })
    return rows


def choose_k(rows: List[Dict[str, Any]], target: float, key: str = "retrieve_k") -> Optional[Dict[str, Any]]:
    """Smallest sweep value (default retrieve_k; pgvector uses ef_search) whose recall >= target."""
    eligible = [r for r in rows if float(r["recall_top10"]) >= target and key in r["hyperparameters"]]
    if not eligible:
        return None
    return min(eligible, key=lambda r: int(r["hyperparameters"][key]))


def _dsn() -> str:
    dsn = os.environ.get("DATABASE_URL")
    if dsn:
        return dsn
    env_file = Path(__file__).resolve().parent.parent / ".env.local"
    for line in env_file.read_text(encoding="utf-8").splitlines():
        if line.startswith("DATABASE_URL="):
            return line.split("=", 1)[1].strip().strip('"').strip("'")
    raise SystemExit("DATABASE_URL not set")


def cmd_run(args: argparse.Namespace) -> int:
    import numpy as np
    import psycopg2

    conn = psycopg2.connect(_dsn())
    conn.set_session(readonly=True)
    t0 = time.time()
    ids, rows = [], []
    with conn.cursor(name="canary_load") as cur:
        cur.itersize = 20000
        cur.execute("SELECT id::text, content_embedding_768::text FROM codebase_chunk_index "
                    "WHERE content_embedding_768 IS NOT NULL ORDER BY id")
        for cid, txt in cur:
            ids.append(cid)
            rows.append(np.fromstring(txt.strip("[]"), sep=",", dtype=np.float32))
    matrix = np.vstack(rows)
    del rows
    norms = np.linalg.norm(matrix, axis=1, keepdims=True)
    norms[norms == 0] = 1.0
    matrix /= norms
    load_s = time.time() - t0
    order = sorted(range(len(ids)), key=lambda i: hashlib.md5(("canary" + ids[i]).encode()).hexdigest())[:args.queries]

    t1 = time.time()
    sims = matrix[order] @ matrix.T
    for qi, row in enumerate(order):
        sims[qi, row] = -np.inf
    top = np.argpartition(-sims, 10, axis=1)[:, :10]
    top = np.take_along_axis(top, np.argsort(-np.take_along_axis(sims, top, 1), axis=1), 1)
    oracle_s = time.time() - t1
    truth = [[ids[j] for j in r] for r in top]
    if args.truth_out:
        np.savez_compressed(args.truth_out, query_ids=np.array([ids[i] for i in order]), truth_ids=np.array(truth))

    ks = [int(k) for k in args.ks.split(",")]
    res = {k: {"hits": 0, "rr": 0.0, "lat": []} for k in ks}
    errors = 0
    for qi, row in enumerate(order):
        qid, vec, nn1 = ids[row], matrix[row].tolist(), truth[qi][0]
        for k in ks:
            try:
                t = time.time()
                req = urllib.request.Request(f"http://127.0.0.1:{args.port}/search",
                                             data=json.dumps({"vector": vec, "k": k + 1}).encode(),
                                             headers={"Content-Type": "application/json"}, method="POST")
                with urllib.request.urlopen(req, timeout=60) as r:
                    got = [i for i in json.loads(r.read())["ids"] if i != qid][:k]
                res[k]["lat"].append((time.time() - t) * 1000)
                res[k]["hits"] += len(set(truth[qi]) & set(got))
                if nn1 in got:
                    res[k]["rr"] += 1.0 / (got.index(nn1) + 1)
            except Exception:
                errors += 1
    health = json.loads(urllib.request.urlopen(f"http://127.0.0.1:{args.port}/health", timeout=10).read())
    out = []
    for k in ks:
        lat = sorted(res[k]["lat"]) or [0.0]
        out.append({"retrieve_k": k,
                    "recall_top10_after_exact_rescore": round(res[k]["hits"] / (args.queries * 10), 4),
                    "mrr_exact_nn1": round(res[k]["rr"] / args.queries, 4),
                    "p50_ms": round(lat[len(lat) // 2], 2), "p95_ms": round(lat[max(0, int(len(lat) * 0.95) - 1)], 2)})
    print(json.dumps({"queries": args.queries, "heldout_self_excluded": True, "corpus_rows": len(ids), "errors": errors,
                      "oracle": "in-process float32 cosine over all canonical content_embedding_768 rows (CPU)",
                      "oracle_total_s": round(oracle_s, 1), "oracle_ms_per_query": round(oracle_s * 1000 / args.queries, 2),
                      "load_s": round(load_s, 1), "results": out,
                      "sidecar": {k: health.get(k) for k in ("indexed", "dim", "bits", "representationId", "source",
                                                              "projection", "defaultK")},
                      "writesPerformed": False}))
    return 0


def cmd_run_pgvector(args: argparse.Namespace) -> int:
    """pgvector HNSW executor over the FROZEN truth (no oracle recompute): sweep hnsw.ef_search."""
    import numpy as np
    import psycopg2
    truth = np.load(args.truth_in, allow_pickle=False)
    qids, tids = [str(x) for x in truth["query_ids"]], truth["truth_ids"]
    conn = psycopg2.connect(_dsn())
    conn.set_session(readonly=True)
    efs = [int(x) for x in args.ef_search.split(",")]
    res = {ef: {"hits": 0, "rr": 0.0, "lat": []} for ef in efs}
    errors = 0
    with conn.cursor() as cur:
        cur.execute("SELECT id::text, content_embedding_768::text FROM codebase_chunk_index WHERE id::text = ANY(%s)", (qids,))
        vecs = dict(cur.fetchall())
        cur.execute("SET hnsw.iterative_scan = off")
        cur.execute("SET hnsw.ef_search = 100")
        cur.execute("EXPLAIN SELECT id FROM codebase_chunk_index ORDER BY content_embedding_768 <=> %s::vector LIMIT 11",
                    (vecs[qids[0]],))
        plan = " ".join(r[0] for r in cur.fetchall())
        uses_index = "idx_codebase_chunk_content_embedding_768_hnsw" in plan
        for qi, qid in enumerate(qids):
            truth_set, nn1 = set(str(x) for x in tids[qi]), str(tids[qi][0])
            for ef in efs:
                try:
                    cur.execute("SELECT set_config('hnsw.ef_search', %s, false)", (str(ef),))
                    t = time.time()
                    cur.execute("SELECT id::text FROM codebase_chunk_index ORDER BY content_embedding_768 <=> %s::vector LIMIT 11",
                                (vecs[qid],))
                    got = [r[0] for r in cur.fetchall() if r[0] != qid][:10]
                    res[ef]["lat"].append((time.time() - t) * 1000)
                    res[ef]["hits"] += len(truth_set & set(got))
                    if nn1 in got:
                        res[ef]["rr"] += 1.0 / (got.index(nn1) + 1)
                except Exception:
                    errors += 1
                    conn.rollback()
    nq = len(qids)
    out = []
    for ef in efs:
        lat = sorted(res[ef]["lat"]) or [0.0]
        out.append({"sweep": {"ef_search": ef}, "retrieve_k": 10,
                    "recall_top10_after_exact_rescore": round(res[ef]["hits"] / (nq * 10), 4),
                    "mrr_exact_nn1": round(res[ef]["rr"] / nq, 4),
                    "p50_ms": round(lat[len(lat) // 2], 2), "p95_ms": round(lat[max(0, int(len(lat) * 0.95) - 1)], 2)})
    print(json.dumps({"queries": nq, "heldout_self_excluded": True, "corpus_rows": args.corpus_rows, "errors": errors,
                      "oracle": "frozen truth from " + os.path.basename(args.truth_in), "results": out,
                      "sidecar": {"indexed": args.corpus_rows, "dim": 768, "bits": None,
                                  "representationId": "semantic_768_pgvector_hnsw_vector_cosine", "source": "postgres",
                                  "projection": "none", "indexUsedInPlan": uses_index},
                      "writesPerformed": False}))
    return 0


def cmd_run_e2e(args: argparse.Namespace) -> int:
    """TurboVec top-K -> Postgres exact 768 rescore (candidates only) -> top-10, over the FROZEN truth.
    Reports end-to-end latency with the stage split (search / rescore) in the receipt."""
    import numpy as np
    import psycopg2
    truth = np.load(args.truth_in, allow_pickle=False)
    qids, tids = [str(x) for x in truth["query_ids"]], truth["truth_ids"]
    conn = psycopg2.connect(_dsn())
    conn.set_session(readonly=True)
    ks = [int(x) for x in args.ks.split(",")]
    res = {k: {"hits": 0, "rr": 0.0, "search": [], "rescore": [], "total": []} for k in ks}
    errors = 0
    with conn.cursor() as cur:
        cur.execute("SELECT id::text, content_embedding_768::text FROM codebase_chunk_index WHERE id::text = ANY(%s)", (qids,))
        vecs = dict(cur.fetchall())
        for qi, qid in enumerate(qids):
            truth_set, nn1 = set(str(x) for x in tids[qi]), str(tids[qi][0])
            qvec = json.loads(vecs[qid])
            for k in ks:
                try:
                    t0 = time.time()
                    req = urllib.request.Request(f"http://127.0.0.1:{args.port}/search",
                                                 data=json.dumps({"vector": qvec, "k": k + 1}).encode(),
                                                 headers={"Content-Type": "application/json"}, method="POST")
                    with urllib.request.urlopen(req, timeout=60) as r:
                        cands = [i for i in json.loads(r.read())["ids"] if i != qid][:k]
                    t1 = time.time()
                    if args.rescore_mode == "naive":
                        # ORDER BY on the indexed column lets the planner pick the HNSW index and filter afterwards.
                        sql = ("SELECT id::text FROM codebase_chunk_index WHERE id = ANY(%s::uuid[]) "
                               "ORDER BY content_embedding_768 <=> %s::vector LIMIT 10")
                    else:
                        # MATERIALIZED CTE fetches exactly the candidates, then sorts them: no index can be used.
                        sql = ("WITH c AS MATERIALIZED (SELECT id, content_embedding_768 AS v FROM codebase_chunk_index "
                               "WHERE id = ANY(%s::uuid[])) SELECT id::text FROM c ORDER BY v <=> %s::vector LIMIT 10")
                    cur.execute(sql, (cands, vecs[qid]))
                    got = [r[0] for r in cur.fetchall()]
                    t2 = time.time()
                    res[k]["search"].append((t1 - t0) * 1000)
                    res[k]["rescore"].append((t2 - t1) * 1000)
                    res[k]["total"].append((t2 - t0) * 1000)
                    res[k]["hits"] += len(truth_set & set(got))
                    if nn1 in got:
                        res[k]["rr"] += 1.0 / (got.index(nn1) + 1)
                except Exception:
                    errors += 1
                    conn.rollback()
    health = json.loads(urllib.request.urlopen(f"http://127.0.0.1:{args.port}/health", timeout=10).read())
    nq = len(qids)

    def pct(vals, q):
        v = sorted(vals) or [0.0]
        return round(v[max(0, min(len(v) - 1, int(len(v) * q) - 1 if q >= 0.95 else len(v) // 2))], 2)

    out = []
    for k in ks:
        out.append({"retrieve_k": k, "recall_top10_after_exact_rescore": round(res[k]["hits"] / (nq * 10), 4),
                    "mrr_exact_nn1": round(res[k]["rr"] / nq, 4),
                    "p50_ms": pct(res[k]["total"], 0.5), "p95_ms": pct(res[k]["total"], 0.95),
                    "stage_p50_ms": {"turbovec_search": pct(res[k]["search"], 0.5), "pg_exact_rescore": pct(res[k]["rescore"], 0.5)},
                    "stage_p95_ms": {"turbovec_search": pct(res[k]["search"], 0.95), "pg_exact_rescore": pct(res[k]["rescore"], 0.95)}})
    print(json.dumps({"queries": nq, "heldout_self_excluded": True, "corpus_rows": args.corpus_rows, "errors": errors,
                      "oracle": "frozen truth from " + os.path.basename(args.truth_in),
                      "rescore_mode": args.rescore_mode,
                      "latency_definition": "end-to-end per query: TurboVec HTTP search + Postgres exact 768 rescore of the K candidates (one connection, warm)",
                      "results": out,
                      "sidecar": {k2: health.get(k2) for k2 in ("indexed", "dim", "bits", "representationId", "source", "projection", "defaultK")},
                      "writesPerformed": False}))
    return 0


def cmd_run_tieaware(args: argparse.Namespace) -> int:
    """Tie-aware recall over the FROZEN query set. A returned chunk is a hit when its exact cosine similarity is
    >= the query's 10th-best exact similarity - 1e-6 (so duplicate/near-duplicate chunks at the boundary count).
    Writes one receipt per executor: <prefix>-turbovec.json (TurboVec top-K + exact rescore of those K in-process)
    and <prefix>-pgvector.json (pgvector HNSW swept over ef_search). Read-only."""
    import numpy as np
    import psycopg2
    eps = 1e-6
    truth = np.load(args.truth_in, allow_pickle=False)
    qids = [str(x) for x in truth["query_ids"]]
    conn = psycopg2.connect(_dsn())
    conn.set_session(readonly=True)
    ids, rows = [], []
    with conn.cursor(name="tie_load") as cur:
        cur.itersize = 20000
        cur.execute("SELECT id::text, content_embedding_768::text FROM codebase_chunk_index "
                    "WHERE content_embedding_768 IS NOT NULL ORDER BY id")
        for cid, txt in cur:
            ids.append(cid)
            rows.append(np.fromstring(txt.strip("[]"), sep=",", dtype=np.float32))
    matrix = np.vstack(rows)
    del rows
    norms = np.linalg.norm(matrix, axis=1, keepdims=True)
    norms[norms == 0] = 1.0
    matrix /= norms
    pos = {cid: i for i, cid in enumerate(ids)}
    ks = [int(x) for x in args.ks.split(",")]
    efs = [int(x) for x in args.ef_search.split(",")]
    tv = {k: {"hits": 0, "lat": []} for k in ks}
    pg = {e: {"hits": 0, "lat": []} for e in efs}
    ties = 0
    errors = 0
    pgcur = conn.cursor()
    pgcur.execute("SET hnsw.iterative_scan = off")
    for qid in qids:
        qi = pos[qid]
        sims = matrix @ matrix[qi]
        sims[qi] = -np.inf
        t10 = float(np.partition(sims, -10)[-10])
        if abs(t10 - float(np.partition(sims, -11)[-11])) < eps:
            ties += 1
        floor = t10 - eps
        qvec = matrix[qi].tolist()
        for k in ks:
            try:
                t = time.time()
                req = urllib.request.Request(f"http://127.0.0.1:{args.port}/search",
                                             data=json.dumps({"vector": qvec, "k": k + 1}).encode(),
                                             headers={"Content-Type": "application/json"}, method="POST")
                with urllib.request.urlopen(req, timeout=60) as r:
                    cands = [i for i in json.loads(r.read())["ids"] if i != qid][:k]
                tv[k]["lat"].append((time.time() - t) * 1000)
                cs = sims[[pos[c] for c in cands]]
                top = np.sort(cs)[::-1][:10]
                tv[k]["hits"] += int((top >= floor).sum())
            except Exception:
                errors += 1
        for e in efs:
            try:
                pgcur.execute("SELECT set_config('hnsw.ef_search', %s, false)", (str(e),))
                t = time.time()
                pgcur.execute("SELECT id::text FROM codebase_chunk_index ORDER BY content_embedding_768 <=> %s::vector LIMIT 11",
                              (json.dumps(qvec),))
                got = [r[0] for r in pgcur.fetchall() if r[0] != qid][:10]
                pg[e]["lat"].append((time.time() - t) * 1000)
                pg[e]["hits"] += int((sims[[pos[g] for g in got]] >= floor).sum())
            except Exception:
                errors += 1
                conn.rollback()
    health = json.loads(urllib.request.urlopen(f"http://127.0.0.1:{args.port}/health", timeout=10).read())
    nq = len(qids)

    def lat(vals):
        v = sorted(vals) or [0.0]
        return round(v[len(v) // 2], 2), round(v[max(0, int(len(v) * 0.95) - 1)], 2)

    base = {"queries": nq, "heldout_self_excluded": True, "corpus_rows": len(ids), "errors": errors,
            "oracle": "tie-aware exact cosine over all canonical content_embedding_768 rows (hit if sim >= 10th-best sim - 1e-6)",
            "tie_queries_rank10_vs_11": ties, "tie_eps": eps, "writesPerformed": False}
    tv_out = [{"retrieve_k": k, "recall_top10_after_exact_rescore": round(tv[k]["hits"] / (nq * 10), 4),
               "mrr_exact_nn1": None, "p50_ms": lat(tv[k]["lat"])[0], "p95_ms": lat(tv[k]["lat"])[1]} for k in ks]
    pg_out = [{"sweep": {"ef_search": e}, "retrieve_k": 10, "recall_top10_after_exact_rescore": round(pg[e]["hits"] / (nq * 10), 4),
               "mrr_exact_nn1": None, "p50_ms": lat(pg[e]["lat"])[0], "p95_ms": lat(pg[e]["lat"])[1]} for e in efs]
    with open(args.out_prefix + "-turbovec.json", "w", encoding="utf-8") as fh:
        json.dump({**base, "latency_definition": "TurboVec HTTP search only; exact rescore done in-process (Postgres rescore stage ~50 ms p50 measured separately)",
                   "results": tv_out,
                   "sidecar": {k2: health.get(k2) for k2 in ("indexed", "dim", "bits", "representationId", "source", "projection", "defaultK")}}, fh)
    with open(args.out_prefix + "-pgvector.json", "w", encoding="utf-8") as fh:
        json.dump({**base, "results": pg_out,
                   "sidecar": {"indexed": len(ids), "dim": 768, "bits": None, "representationId": "semantic_768_pgvector_hnsw_vector_cosine",
                               "source": "postgres", "projection": "none"}}, fh)
    print(json.dumps({"ties": ties, "turbovec": tv_out, "pgvector": pg_out, "errors": errors}))
    return 0


def cmd_ingest(args: argparse.Namespace) -> int:
    receipt = json.loads(Path(args.receipt).read_text(encoding="utf-8"))
    rows = receipt_to_rows(receipt, args.executor)
    checksum = receipt_checksum(receipt)
    truth_checksum = sha256_file(args.truth)
    script_sha = sha256_file(args.script) if args.script else None
    sidecar = receipt["sidecar"]
    plan = {"canary_name": args.name, "executor": args.executor, "receipt_checksum": checksum,
            "truth_checksum": truth_checksum, "sequence_rows": [r["sequence_id"] for r in rows], "apply": args.apply}
    if not args.apply:
        print(json.dumps({"dryRun": True, **plan}))
        return 0
    import psycopg2
    from psycopg2.extras import Json
    conn = psycopg2.connect(_dsn())
    try:
        with conn, conn.cursor() as cur:
            cur.execute(
                """INSERT INTO atlas_retrieval_canary_runs_v1
                   (canary_name, executor, representation_id, dim, bits, corpus_rows, query_count, query_set_rule,
                    truth_oracle, truth_checksum, script_sha256, oracle_total_s, oracle_ms_per_query, load_s, errors,
                    sidecar_health, receipt_checksum)
                   VALUES (%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s)
                   ON CONFLICT (receipt_checksum) DO NOTHING RETURNING canary_id""",
                (args.name, args.executor, sidecar["representationId"], sidecar["dim"], sidecar.get("bits"),
                 receipt["corpus_rows"], receipt["queries"], QUERY_SET_RULE, receipt["oracle"], truth_checksum,
                 script_sha, receipt.get("oracle_total_s"), receipt.get("oracle_ms_per_query"), receipt.get("load_s"),
                 int(receipt.get("errors", 0)), Json(sidecar), checksum))
            got = cur.fetchone()
            if got is None:
                print(json.dumps({"applied": False, "reason": "receipt_checksum already recorded", **plan}))
                return 0
            canary_id = got[0]
            for r in rows:
                cur.execute(
                    """INSERT INTO atlas_retrieval_canary_sequence_v1
                       (canary_id, sequence_no, sequence_id, hyperparameters, recall_top10, mrr_exact_nn1, p50_ms, p95_ms)
                       VALUES (%s,%s,%s,%s,%s,%s,%s,%s)""",
                    (canary_id, r["sequence_no"], r["sequence_id"], Json(r["hyperparameters"]), r["recall_top10"],
                     r["mrr_exact_nn1"], r["p50_ms"], r["p95_ms"]))
        print(json.dumps({"applied": True, "canary_id": str(canary_id), **plan}))
    finally:
        conn.close()
    return 0


def cmd_best(args: argparse.Namespace) -> int:
    import psycopg2
    conn = psycopg2.connect(_dsn())
    conn.set_session(readonly=True)
    with conn.cursor() as cur:
        cur.execute(
            """SELECT s.sequence_id, s.hyperparameters, s.recall_top10, s.p50_ms
                 FROM atlas_retrieval_canary_sequence_v1 s
                 JOIN (SELECT canary_id FROM atlas_retrieval_canary_runs_v1 WHERE executor=%s
                       ORDER BY recorded_at DESC LIMIT 1) r USING (canary_id)""", (args.executor,))
        rows = [{"sequence_id": a, "hyperparameters": b, "recall_top10": float(c), "p50_ms": d} for a, b, c, d in cur.fetchall()]
    conn.close()
    pick = choose_k(rows, args.target, args.key)
    print(json.dumps({"executor": args.executor, "target": args.target, "choice": pick}, default=str))
    return 0 if pick else 1


def main(argv: Optional[List[str]] = None) -> int:
    p = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    sub = p.add_subparsers(dest="cmd", required=True)
    r = sub.add_parser("run")
    r.add_argument("--port", type=int, default=8791)
    r.add_argument("--queries", type=int, default=1000)
    r.add_argument("--ks", default=",".join(str(k) for k in DEFAULT_KS))
    r.add_argument("--truth-out")
    r.set_defaults(fn=cmd_run)
    e2e = sub.add_parser("run-e2e")
    e2e.add_argument("--truth-in", required=True)
    e2e.add_argument("--port", type=int, default=8791)
    e2e.add_argument("--ks", default="50,100,150,200")
    e2e.add_argument("--rescore-mode", choices=["materialized", "naive"], default="materialized")
    e2e.add_argument("--corpus-rows", type=int, required=True)
    e2e.set_defaults(fn=cmd_run_e2e)
    ta = sub.add_parser("run-tieaware")
    ta.add_argument("--truth-in", required=True)
    ta.add_argument("--port", type=int, default=8791)
    ta.add_argument("--ks", default="10,25,50,75,100,150,200")
    ta.add_argument("--ef-search", default="40,100,200,400")
    ta.add_argument("--out-prefix", required=True)
    ta.set_defaults(fn=cmd_run_tieaware)
    pg = sub.add_parser("run-pgvector")
    pg.add_argument("--truth-in", required=True)
    pg.add_argument("--ef-search", default="40,100,200,400")
    pg.add_argument("--corpus-rows", type=int, required=True)
    pg.set_defaults(fn=cmd_run_pgvector)
    i = sub.add_parser("ingest")
    i.add_argument("--receipt", required=True)
    i.add_argument("--truth", required=True)
    i.add_argument("--script")
    i.add_argument("--name", required=True)
    i.add_argument("--executor", default="turbovec-http-ann")
    i.add_argument("--apply", action="store_true")
    i.set_defaults(fn=cmd_ingest)
    b = sub.add_parser("best")
    b.add_argument("--executor", default="turbovec-http-ann")
    b.add_argument("--target", type=float, default=0.94)
    b.add_argument("--key", default="retrieve_k", help="sweep key: retrieve_k (ANN sidecars) or ef_search (pgvector)")
    b.set_defaults(fn=cmd_best)
    args = p.parse_args(argv)
    return args.fn(args)


if __name__ == "__main__":
    sys.exit(main())
