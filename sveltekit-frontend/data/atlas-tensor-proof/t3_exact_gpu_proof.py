"""
T3 proof (parent-atlas-tensor-residency-integration): one real semantic_768
Arrow tile -> pinned-host-style load -> GPU exact cosine top-k (WSL2 RAPIDS
sidecar, cuVS brute_force) -> packet_key recovery -> parity with a CPU-exact
oracle computed independently from the same mmap-read matrix.

Run from sveltekit-frontend/python: `python ../data/atlas-tensor-proof/t3_exact_gpu_proof.py`
"""
from __future__ import annotations
import sys, json, time
import numpy as np
import requests

sys.path.insert(0, ".")
from parent_atlas_tensor.arrow_ipc import open_mmap, batch_matrix

ARROW_PATH = "../data/atlas-tensor-proof/semantic_768_r1.arrow"
SIDECAR_URL = "http://127.0.0.1:8098/v1/knn/exact"
SOURCE_REVISION = "rev:semantic_768:r1"
TOP_K = 10
QUERY_ROW = 0  # deterministic: query with row 0's own vector (its own nearest neighbor should be itself, distance ~0)

src, reader = open_mmap(ARROW_PATH)
batch = reader.get_batch(0)
packet_keys = batch.column(0).to_pylist()
matrix = batch_matrix(batch, "semantic_768")  # [4096, 768] float32, from pinned-host-equivalent mmap read
n, dim = matrix.shape
print(f"loaded tile: {n} rows x {dim} dims, packet_keys[0]={packet_keys[0]!r}")

query_vec = matrix[QUERY_ROW]

# --- CPU-exact oracle: brute-force cosine similarity over the full corpus ---
def cosine_topk(query: np.ndarray, corpus: np.ndarray, k: int) -> list[tuple[int, float]]:
    qn = query / (np.linalg.norm(query) + 1e-12)
    cn = corpus / (np.linalg.norm(corpus, axis=1, keepdims=True) + 1e-12)
    sims = cn @ qn
    order = np.argsort(-sims)[:k]
    return [(int(i), float(sims[i])) for i in order]

t0 = time.time()
oracle = cosine_topk(query_vec, matrix, TOP_K)
oracle_ms = (time.time() - t0) * 1000
oracle_keys = [packet_keys[i] for i, _ in oracle]
print(f"CPU-exact oracle top-{TOP_K} ({oracle_ms:.1f}ms): {oracle_keys}")

# --- GPU exact via WSL2 RAPIDS sidecar (cuVS brute_force) ---
req = {
    "query": {"vector": query_vec.tolist(), "representationId": "semantic_768", "dimension": dim},
    "corpus": [
        {"packetKey": pk, "sourceRevision": SOURCE_REVISION, "vector": matrix[i].tolist()}
        for i, pk in enumerate(packet_keys)
    ],
    "topK": TOP_K,
    "deadlineMs": 60_000,
}
t0 = time.time()
resp = requests.post(SIDECAR_URL, json=req, timeout=60)
wire_ms = (time.time() - t0) * 1000
resp.raise_for_status()
body = resp.json()
gpu_keys = [hit["packetKey"] for hit in body["results"]]
print(f"GPU-exact (cuVS brute_force) top-{TOP_K} (wire {wire_ms:.1f}ms, server durationMs={body['durationMs']:.1f}): {gpu_keys}")
print(f"corpusRows echoed: {body['corpusRows']} (expected {n})")

# --- Parity check ---
same_set = set(oracle_keys) == set(gpu_keys)
same_order = oracle_keys == gpu_keys
result = {
    "status": "PASS" if same_set else "FAIL",
    "same_top_k_set": same_set,
    "same_order": same_order,
    "oracle_keys": oracle_keys,
    "gpu_keys": gpu_keys,
    "corpus_rows": n,
    "dimension": dim,
    "oracle_ms": round(oracle_ms, 2),
    "gpu_server_duration_ms": body["durationMs"],
    "gpu_wire_ms": round(wire_ms, 2),
}
print(json.dumps(result, indent=2))
if not same_set:
    raise SystemExit("PARITY FAILURE: GPU exact top-k set does not match CPU-exact oracle")
print("\nT3 PROOF: PASS — GPU exact top-k matches CPU-exact oracle exactly, packet_key identity preserved end to end.")
