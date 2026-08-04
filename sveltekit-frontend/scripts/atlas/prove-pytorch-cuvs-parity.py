#!/usr/bin/env python
"""
READ-ONLY parity proof: PyTorch (torch.mm + topk, CUDA) vs cuVS
neighbors.brute_force, exact cosine top-k, on the same real 768-dim
fixture exported from codebase_chunks_768_v2. No mutation of any store.

Run inside conda env atlas-rapids-cu13 (has torch 2.13+cu130 and cuvs
26.06.00 confirmed 2026-08-04).
"""
import json
import time

import cupy as cp
import numpy as np
import torch
from cuvs.neighbors import brute_force

FIXTURE = "/mnt/c/Users/james/Videos/deeds-web-app/docs/reports/fixtures/vector-parity-fixture-2026-08-04.json"
OUT = "/mnt/c/Users/james/Videos/deeds-web-app/docs/reports/pytorch-cuvs-exact-topk-parity-2026-08-04.json"

K = 10
NUM_QUERIES = 20

with open(FIXTURE) as f:
    fixture = json.load(f)

rows = fixture["rows"]
corpus_np = np.array([r["vector"] for r in rows], dtype=np.float32)
ids = [r["qdrant_point_id"] for r in rows]
n, d = corpus_np.shape
assert d == 768

rng = np.random.default_rng(42)
query_idx = rng.choice(n, size=NUM_QUERIES, replace=False)
queries_np = corpus_np[query_idx]

# ── PyTorch exact cosine top-k (CUDA) ────────────────────────────────────
device = "cuda" if torch.cuda.is_available() else "cpu"
corpus_t = torch.from_numpy(corpus_np).to(device)
queries_t = torch.from_numpy(queries_np).to(device)
corpus_norm = torch.nn.functional.normalize(corpus_t, p=2, dim=1)
queries_norm = torch.nn.functional.normalize(queries_t, p=2, dim=1)

t0 = time.perf_counter()
scores = torch.mm(queries_norm, corpus_norm.t())  # cosine similarity, higher = closer
torch_topk_scores, torch_topk_idx = torch.topk(scores, k=K, dim=1)
torch.cuda.synchronize() if device == "cuda" else None
torch_ms = (time.perf_counter() - t0) * 1000

torch_topk_idx_np = torch_topk_idx.cpu().numpy()
torch_topk_scores_np = torch_topk_scores.cpu().numpy()

# ── cuVS brute_force exact search (cosine) ───────────────────────────────
corpus_cp = cp.asarray(corpus_np)
queries_cp = cp.asarray(queries_np)

t0 = time.perf_counter()
index = brute_force.build(corpus_cp, metric="cosine")
cuvs_distances, cuvs_indices = brute_force.search(index, queries_cp, k=K)
cp.cuda.Stream.null.synchronize()
cuvs_ms = (time.perf_counter() - t0) * 1000

cuvs_indices_np = cp.asnumpy(cuvs_indices)
cuvs_distances_np = cp.asnumpy(cuvs_distances)  # cosine DISTANCE (1 - cosine_sim)

# ── Compare ───────────────────────────────────────────────────────────────
overlaps = []
max_score_deltas = []
rank1_matches = 0
identity_matches = 0
nan_or_inf = 0

for qi in range(NUM_QUERIES):
    torch_set = set(torch_topk_idx_np[qi].tolist())
    cuvs_set = set(cuvs_indices_np[qi].tolist())
    overlap = len(torch_set & cuvs_set) / K
    overlaps.append(overlap)

    if torch_topk_idx_np[qi][0] == cuvs_indices_np[qi][0]:
        rank1_matches += 1

    # cuVS cosine distance -> similarity for comparison: sim = 1 - distance
    cuvs_sim_top1 = 1.0 - float(cuvs_distances_np[qi][0])
    torch_sim_top1 = float(torch_topk_scores_np[qi][0])
    max_score_deltas.append(abs(cuvs_sim_top1 - torch_sim_top1))

    if not (np.isfinite(torch_topk_scores_np[qi]).all() and np.isfinite(cuvs_distances_np[qi]).all()):
        nan_or_inf += 1

    # identity tie-back: do the row ids at rank 1 refer to the same qdrant_point_id?
    if ids[torch_topk_idx_np[qi][0]] == ids[cuvs_indices_np[qi][0]]:
        identity_matches += 1

result = {
    "report": "pytorch-cuvs-exact-topk-parity",
    "date": "2026-08-04",
    "read_only": True,
    "fixture": {"corpus_size": n, "dimension": d, "num_queries": NUM_QUERIES, "k": K, "source": "codebase_chunks_768_v2:content"},
    "backends": {
        "pytorch": {"version": torch.__version__, "device": device, "elapsed_ms": round(torch_ms, 2)},
        "cuvs": {"elapsed_ms": round(cuvs_ms, 2)},
    },
    "metrics": {
        "mean_topk_overlap": round(float(np.mean(overlaps)), 4),
        "min_topk_overlap": round(float(np.min(overlaps)), 4),
        "rank1_index_match_rate": round(rank1_matches / NUM_QUERIES, 4),
        "identity_match_rate_via_qdrant_point_id": round(identity_matches / NUM_QUERIES, 4),
        "max_top1_score_delta": round(float(np.max(max_score_deltas)), 6),
        "mean_top1_score_delta": round(float(np.mean(max_score_deltas)), 6),
        "nan_or_inf_queries": nan_or_inf,
    },
    "gate": {},
}

gate = result["gate"]
gate["mean_overlap_ge_0_95"] = result["metrics"]["mean_topk_overlap"] >= 0.95
gate["rank1_match_ge_0_95"] = result["metrics"]["rank1_index_match_rate"] >= 0.95
gate["max_score_delta_lt_1e-3"] = result["metrics"]["max_top1_score_delta"] < 1e-3
gate["no_nan_inf"] = nan_or_inf == 0
gate["RESULT"] = "PASS" if all(gate[k] for k in ("mean_overlap_ge_0_95", "rank1_match_ge_0_95", "max_score_delta_lt_1e-3", "no_nan_inf")) else "FAIL"

with open(OUT, "w") as f:
    json.dump(result, f, indent=2)

print(json.dumps(result, indent=2))
print("Report:", OUT)
