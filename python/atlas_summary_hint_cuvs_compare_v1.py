"""SUMMARY-CUVS-01 (artifact-only, no DB/Qdrant/Valkey): compares cuVS brute-force and CAGRA (challenger) against a NumPy exact oracle
on the raw F32LE legacy-summary hint vector set. Reuses atlas_compute.cuvs_analytics.run_cuvs_exact_knn. A failing step is recorded
(value null + reason) and the run continues; nothing is promoted. Run in WSL: /home/james/miniforge3/envs/atlas-rapids-cu13/bin/python
Usage: python python/atlas_summary_hint_cuvs_compare_v1.py --dir <embedding dir> [--queries 200] [--k 10] [--out docs/reports/summary-hint-cuvs-compare-v1.json]
"""
import argparse, json, os, subprocess, sys, time, datetime

import numpy as np

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, os.path.join(ROOT, "python"))
DIM = 768


def free_vram_mib():
    try:
        out = subprocess.run(["nvidia-smi", "--query-gpu=memory.free", "--format=csv,noheader,nounits"], capture_output=True, text=True, timeout=20).stdout
        return int(out.strip().splitlines()[0])
    except Exception:
        return None


def recall(exact, got, k):
    hit = sum(len(set(exact[i][:k]) & set(got[i][:k])) for i in range(len(exact)))
    return hit / (len(exact) * k)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--dir", required=True)
    ap.add_argument("--queries", type=int, default=200)
    ap.add_argument("--k", type=int, default=10)
    ap.add_argument("--out", default=os.path.join(ROOT, "docs", "reports", "summary-hint-cuvs-compare-v1.json"))
    a = ap.parse_args()

    raw = np.fromfile(os.path.join(a.dir, "vectors.f32"), dtype="<f4")
    x = raw.reshape(-1, DIM)
    n = x.shape[0]
    q_rows = [(i * n) // a.queries for i in range(a.queries)]
    q = x[q_rows]
    kk = a.k + 1

    # exact oracle on CPU (float64 accumulate via matmul on float64 copy of queries only)
    t = time.perf_counter()
    sims = q.astype(np.float64) @ x.astype(np.float64).T
    order = np.lexsort((np.broadcast_to(np.arange(n), sims.shape), -sims), axis=1)[:, :kk]
    oracle_ms = round((time.perf_counter() - t) * 1000)

    def drop_self(rows):
        return [[j for j in r if j != q_rows[i]][: a.k] for i, r in enumerate(rows)]

    exact = drop_self(order.tolist())
    receipt = {"schema": "atlas.summary-hint-cuvs-compare.v1", "status": "PARTIAL", "canonicalAuthority": False, "retrievalVoteAdded": False,
               "rows": int(n), "dim": DIM, "queries": a.queries, "k": a.k, "freeVramMiBBefore": free_vram_mib(),
               "oracle": {"implementation": "numpy float64 matmul", "ms": oracle_ms}, "steps": {},
               "databaseWrites": 0, "qdrantWrites": 0, "valkeyWrites": 0}

    def step(name, fn):
        t0 = time.perf_counter()
        try:
            res = fn()
            res["ms"] = round((time.perf_counter() - t0) * 1000)
            res["status"] = "OK"
            receipt["steps"][name] = res
        except Exception as e:  # record + continue, never promote
            receipt["steps"][name] = {"status": "FAILED", "value": None, "reason": f"{type(e).__name__}: {str(e)[:300]}", "freeVramMiB": free_vram_mib()}

    def brute():
        from atlas_compute.cuvs_analytics import run_cuvs_exact_knn
        nb, _, rc = run_cuvs_exact_knn(x, q, top_k=kk, metric="cosine")
        return {"recallAtK": recall(exact, drop_self(nb.tolist()), a.k), "receiptSchema": rc.schema}

    def cagra(build_algo, itopk):
        def f():
            import cupy as cp
            from cuvs.neighbors import cagra as cg
            xg, qg = cp.asarray(x), cp.asarray(q)
            idx = cg.build(cg.IndexParams(metric="inner_product", build_algo=build_algo), xg)
            _, nb = cg.search(cg.SearchParams(itopk_size=itopk), idx, qg, kk)
            cp.cuda.Stream.null.synchronize()
            got = drop_self(cp.asnumpy(nb).astype(np.int64).tolist())
            return {"recallAtK": recall(exact, got, a.k), "buildAlgo": build_algo, "itopkSize": itopk}
        return f

    step("cuvs_brute_force", brute)
    step("cagra_nn_descent_itopk256", cagra("nn_descent", 256))
    step("cagra_ivf_pq_itopk256", cagra("ivf_pq", 256))
    receipt["freeVramMiBAfter"] = free_vram_mib()
    receipt["status"] = "CHALLENGER_MEASURED" if all(s.get("status") == "OK" for s in receipt["steps"].values()) else "PARTIAL_WITH_RECORDED_FAILURES"
    receipt["generatedAt"] = datetime.datetime.now(datetime.timezone.utc).isoformat()
    os.makedirs(os.path.dirname(a.out), exist_ok=True)
    with open(a.out, "w", encoding="utf8") as f:
        json.dump(receipt, f, indent=2)
    print(json.dumps(receipt, indent=1))


if __name__ == "__main__":
    main()
