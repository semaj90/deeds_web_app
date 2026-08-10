"""
T6b proof (parent-atlas-tensor-residency-integration): CAGRA measured against
the exact-KNN brute-force oracle over the same real corpus — recall@10 and
latency recorded, per this file's own "never compare CAGRA against itself,
always against the exact oracle" rule.

Run from sveltekit-frontend/python: `python ../data/atlas-tensor-proof/t6b_cagra_recall_proof.py`
"""
from __future__ import annotations
import sys, json, time, statistics
import numpy as np
import requests

sys.path.insert(0, ".")
from parent_atlas_tensor.arrow_ipc import open_mmap, batch_matrix

ARROW_PATH = "../data/atlas-tensor-proof/semantic_768_r1_full.arrow"
EXACT_URL = "http://127.0.0.1:8098/v1/knn/exact"
CAGRA_URL = "http://127.0.0.1:8098/v1/knn/cagra"
SOURCE_REVISION = "rev:semantic_768:r1_full"
TOP_K = 10
NUM_QUERIES = 20
SEED = 42

src, reader = open_mmap(ARROW_PATH)
batch = reader.get_batch(0)
packet_keys = batch.column(0).to_pylist()
matrix = batch_matrix(batch, "semantic_768")
n, dim = matrix.shape
print(f"corpus: {n} rows x {dim} dims")

rng = np.random.default_rng(SEED)
query_rows = rng.choice(n, size=NUM_QUERIES, replace=False)

corpus_payload = [
    {"packetKey": pk, "sourceRevision": SOURCE_REVISION, "vector": matrix[i].tolist()}
    for i, pk in enumerate(packet_keys)
]

recalls = []
exact_times = []
cagra_times = []

for qi, row in enumerate(query_rows):
    query_vec = matrix[row].tolist()
    req = {
        "query": {"vector": query_vec, "representationId": "semantic_768", "dimension": dim},
        "corpus": corpus_payload,
        "topK": TOP_K,
        "deadlineMs": 60_000,
    }
    r_exact = requests.post(EXACT_URL, json=req, timeout=60)
    r_exact.raise_for_status()
    exact_body = r_exact.json()
    exact_keys = set(h["packetKey"] for h in exact_body["results"])
    exact_times.append(exact_body["durationMs"])

    r_cagra = requests.post(CAGRA_URL, json=req, timeout=60)
    r_cagra.raise_for_status()
    cagra_body = r_cagra.json()
    cagra_keys = set(h["packetKey"] for h in cagra_body["results"])
    cagra_times.append(cagra_body["durationMs"])

    recall = len(exact_keys & cagra_keys) / TOP_K
    recalls.append(recall)
    print(f"query {qi} (row {row}): recall@{TOP_K}={recall:.2f}  exact={exact_body['durationMs']:.1f}ms  cagra={cagra_body['durationMs']:.1f}ms")

result = {
    "corpus_rows": n,
    "dimension": dim,
    "num_queries": NUM_QUERIES,
    "top_k": TOP_K,
    "mean_recall_at_k": round(statistics.mean(recalls), 4),
    "min_recall_at_k": round(min(recalls), 4),
    "mean_exact_ms": round(statistics.mean(exact_times), 2),
    "mean_cagra_ms": round(statistics.mean(cagra_times), 2),
    "note": "corpus size (~4.5K distinct packet_key+embedding rows, the real live population) "
            "is well below CAGRA's intended ANN-index scale; recall is measured honestly as "
            "reported, not assumed high or low a priori. See openspec tasks.md for interpretation.",
}
print(json.dumps(result, indent=2))
