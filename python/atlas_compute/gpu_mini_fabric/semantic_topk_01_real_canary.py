#!/usr/bin/env python
"""SEMANTIC-TOPK-01 (parent-atlas-retrieval-lineage-dag-convergence).

Proves cuVS brute-force exact search agrees with a PyTorch exact GEMM+topk oracle on the REAL,
already-admitted 15-row semantic_768 canary (docs/reports/lineage-semantic-768-cohort-v1.json),
not a synthetic fixture -- this is the specific gap SEMANTIC-EXACT-PARITY-01
(GPU-MINI-FABRIC-01, CLAUDE.md) deliberately left open ("Do not map [ungrounded corpora] ... do
not extrapolate the 15-row proof").

Honest scale caveat, stated up front rather than glossed over: N=15 is tiny. At this scale, any
correct exact algorithm trivially agrees with any other correct exact algorithm -- there is no
meaningful "hard case" for cuVS to get subtly wrong the way there might be at 16K+ nodes (see
GPU-GRAPH-ANN-01's real 65536-node recall drop in CLAUDE.md). The actual value proven here is
narrower and still real: cuVS's wiring, CandidateOrdinal binding, and metric convention are
correct against REAL production embeddinggemma vectors bound to the already-proven
CandidateOrdinalMapV1/ordinalMapChecksum -- not "cuVS beats CAGRA at scale" (that claim needs the
real cohort scaled to 128/768, explicitly out of scope here per this gate's own frozen wording).

Reuses the canonical cuVS owner (atlas_compute.cuvs_analytics.run_cuvs_exact_knn) --
per this repo's Duplication Prevention rule, no second brute-force wrapper.

Run inside conda env atlas-rapids-cu13:
  PYTHONPATH=. /home/james/miniforge3/envs/atlas-rapids-cu13/bin/python \
    -m atlas_compute.gpu_mini_fabric.semantic_topk_01_real_canary
"""

from __future__ import annotations

import json
from pathlib import Path

import numpy as np
import torch

from atlas_compute.cuvs_analytics import run_cuvs_exact_knn

INPUT_PATH = Path("/mnt/c/Users/james/Videos/deeds-web-app/docs/reports/semantic-768-canary-vectors-v1.json")
OUT_PATH = Path("/mnt/c/Users/james/Videos/deeds-web-app/docs/reports/semantic-topk-01-real-canary-v1.json")

SCORE_DELTA_TOLERANCE = 1e-4
TOP_K = 5  # bounded well under N=15


def main() -> None:
    payload = json.loads(INPUT_PATH.read_text())
    candidates = sorted(payload["candidates"], key=lambda c: c["candidateOrdinal"])
    ordinals = [c["candidateOrdinal"] for c in candidates]
    if ordinals != list(range(len(candidates))):
        raise SystemExit(f"CANDIDATE_ORDINAL_SEQUENCE_NOT_DENSE_ZERO_BASED:{ordinals}")

    vectors = np.array([c["vector"] for c in candidates], dtype=np.float32)
    n, dim = vectors.shape
    if dim != 768:
        raise SystemExit(f"UNEXPECTED_DIMENSION:{dim}")

    device = "cuda" if torch.cuda.is_available() else "cpu"
    corpus_t = torch.nn.functional.normalize(torch.from_numpy(vectors).to(device), p=2, dim=1)
    # Every candidate is also a query -- proves the oracle/cuVS agree for every row in this
    # admitted cohort, not a sampled subset.
    queries_t = corpus_t

    torch_scores = torch.mm(queries_t, corpus_t.t())
    torch_topk_scores, torch_topk_idx = torch.topk(torch_scores, k=TOP_K, dim=1)
    if device == "cuda":
        torch.cuda.synchronize()
    torch_topk_idx_np = torch_topk_idx.cpu().numpy()
    torch_topk_scores_np = torch_topk_scores.cpu().numpy()

    cuvs_neighbors, cuvs_distances, cuvs_receipt = run_cuvs_exact_knn(
        vectors, vectors, top_k=TOP_K, metric="cosine"
    )

    rank1_matches = 0
    ordinal_set_matches = 0
    max_score_delta = 0.0
    nan_or_inf = 0
    per_query = []

    for qi in range(n):
        torch_row = torch_topk_idx_np[qi]
        cuvs_row = np.asarray(cuvs_neighbors[qi])[:TOP_K]

        rank1_match = bool(torch_row[0] == cuvs_row[0])
        rank1_matches += int(rank1_match)
        set_match = bool(set(torch_row.tolist()) == set(cuvs_row.tolist()))
        ordinal_set_matches += int(set_match)

        # cuVS cosine distance -> similarity for comparison against the torch cosine-similarity
        # scores (run_cuvs_exact_knn's own receipt/contract defines this convention; matches the
        # same conversion used in semantic_exact_parity_01.py).
        cuvs_sim_for_torch_top1 = 1.0 - float(np.asarray(cuvs_distances[qi])[0])
        delta = abs(float(torch_topk_scores_np[qi][0]) - cuvs_sim_for_torch_top1)
        max_score_delta = max(max_score_delta, delta)
        if not np.isfinite(torch_topk_scores_np[qi]).all():
            nan_or_inf += 1

        per_query.append({
            "queryCandidateOrdinal": int(candidates[qi]["candidateOrdinal"]),
            "torchTop1CandidateOrdinal": int(torch_row[0]),
            "cuvsTop1CandidateOrdinal": int(cuvs_row[0]),
            "rank1Match": rank1_match,
            "topKSetMatch": set_match,
        })

    gate_pass = (
        rank1_matches == n
        and ordinal_set_matches == n
        and max_score_delta <= SCORE_DELTA_TOLERANCE
        and nan_or_inf == 0
    )

    result = {
        "schema": "atlas.semantic-topk-01-real-canary.v1",
        "sourceVectors": "docs/reports/semantic-768-canary-vectors-v1.json",
        "sourceReceipt": payload.get("sourceReceipt"),
        "candidateSnapshotRevision": payload["candidateSnapshotRevision"],
        "ordinalMapChecksum": payload["ordinalMapChecksum"],
        "device": device,
        "candidateCount": n,
        "topK": TOP_K,
        "scaleCaveat": (
            "N=15 is too small to meaningfully distinguish exact-search implementations from "
            "each other -- this proves cuVS wiring/CandidateOrdinal binding correctness against "
            "real production vectors, not exact-vs-approximate recall behavior at scale."
        ),
        "rank1Matches": rank1_matches,
        "topKSetMatches": ordinal_set_matches,
        "maxTop1ScoreDelta": max_score_delta,
        "scoreDeltaTolerance": SCORE_DELTA_TOLERANCE,
        "nanOrInfCount": nan_or_inf,
        "perQuery": per_query,
        "cuvsReceipt": cuvs_receipt.to_dict() if hasattr(cuvs_receipt, "to_dict") else str(cuvs_receipt),
        "gate": {
            "RESULT": "PASS" if gate_pass else "FAIL",
        },
        "canonicalAuthority": False,
        "writesPerformed": False,
    }

    OUT_PATH.write_text(json.dumps(result, indent=2, default=str) + "\n")
    print(json.dumps({"status": "WRITTEN", "path": str(OUT_PATH), "gate": result["gate"]}, indent=2))


if __name__ == "__main__":
    main()
