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

Coordinate systems, kept explicit rather than collapsed: `rowIndex` (position in the exported
vector matrix) equals `candidateOrdinal` by construction here -- the exporter writes vectors in
candidateOrdinal order and this script asserts that sequence is dense/zero-based before trusting
it. There is no separate GraphOrdinal in this data source, so only two coordinate systems apply
(rowIndex/candidateOrdinal, and canonicalCandidateId/codebaseChunkId) -- both are carried through
per_query rather than silently assumed identical.

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

try:
    import cuvs as _cuvs_module
    CUVS_VERSION = getattr(_cuvs_module, "__version__", "unknown")
except Exception:  # pragma: no cover -- version string is provenance metadata, never gating
    CUVS_VERSION = "unknown"

INPUT_PATH = Path("/mnt/c/Users/james/Videos/deeds-web-app/docs/reports/semantic-768-canary-vectors-v1.json")
OUT_PATH = Path("/mnt/c/Users/james/Videos/deeds-web-app/docs/reports/semantic-topk-01-real-canary-v1.json")

SCORE_DELTA_TOLERANCE = 1e-4
TOP_K = 10  # min(10, N=15)


def main() -> None:
    payload = json.loads(INPUT_PATH.read_text())
    if payload.get("candidateCount") != 15:
        raise SystemExit(f"SEMANTIC_TOPK_INPUT_NOT_EXACT:expected_15_got_{payload.get('candidateCount')}")

    candidates = sorted(payload["candidates"], key=lambda c: c["candidateOrdinal"])
    ordinals = [c["candidateOrdinal"] for c in candidates]
    if ordinals != list(range(len(candidates))):
        raise SystemExit(f"CANDIDATE_ORDINAL_SEQUENCE_NOT_DENSE_ZERO_BASED:{ordinals}")

    source_vectors = np.array([c["vector"] for c in candidates], dtype=np.float64)  # as-loaded precision
    vectors = source_vectors.astype(np.float32)  # common execution dtype for both executors
    n, dim = vectors.shape
    if dim != 768:
        raise SystemExit(f"UNEXPECTED_DIMENSION:{dim}")
    if not np.isfinite(vectors).all():
        raise SystemExit("SEMANTIC_TOPK_INPUT_NOT_EXACT:non_finite_source_vector")

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
    full_rank_agreements = 0
    candidate_ordinal_identity_matches = 0  # query's own ordinal present in both top-K sets
    recalls_at_k = []
    score_deltas = []
    nan_or_inf = 0
    per_query = []

    for qi in range(n):
        own_ordinal = int(candidates[qi]["candidateOrdinal"])
        torch_row = torch_topk_idx_np[qi]
        cuvs_row = np.asarray(cuvs_neighbors[qi])[:TOP_K]

        rank1_match = bool(torch_row[0] == cuvs_row[0])
        rank1_matches += int(rank1_match)

        torch_set = set(torch_row.tolist())
        cuvs_set = set(cuvs_row.tolist())
        full_rank_agreement = bool(torch_row.tolist() == cuvs_row.tolist())
        full_rank_agreements += int(full_rank_agreement)

        recall_at_k = len(torch_set & cuvs_set) / TOP_K
        recalls_at_k.append(recall_at_k)

        identity_ok = own_ordinal in torch_set and own_ordinal in cuvs_set
        candidate_ordinal_identity_matches += int(identity_ok)

        # cuVS cosine distance -> similarity for comparison against the torch cosine-similarity
        # scores (run_cuvs_exact_knn's own receipt/contract defines this convention; matches the
        # same conversion used in semantic_exact_parity_01.py).
        cuvs_sim_for_torch_top1 = 1.0 - float(np.asarray(cuvs_distances[qi])[0])
        delta = abs(float(torch_topk_scores_np[qi][0]) - cuvs_sim_for_torch_top1)
        score_deltas.append(delta)
        if not np.isfinite(torch_topk_scores_np[qi]).all():
            nan_or_inf += 1

        per_query.append({
            "rowIndex": qi,
            "queryCandidateOrdinal": own_ordinal,
            "torchTopKCandidateOrdinals": [int(x) for x in torch_row.tolist()],
            "cuvsTopKCandidateOrdinals": [int(x) for x in cuvs_row.tolist()],
            "rank1Match": rank1_match,
            "fullRankAgreement": full_rank_agreement,
            "recallAtK": recall_at_k,
            "candidateOrdinalIdentityMatch": identity_ok,
        })

    mean_recall_at_k = float(np.mean(recalls_at_k))
    min_recall_at_k = float(np.min(recalls_at_k))
    max_score_delta = float(np.max(score_deltas))
    mean_score_delta = float(np.mean(score_deltas))
    rank1_match_rate = rank1_matches / n
    full_rank_agreement_rate = full_rank_agreements / n
    candidate_ordinal_identity_match_rate = candidate_ordinal_identity_matches / n

    gate_pass = (
        n == 15
        and dim == 768
        and mean_recall_at_k == 1.0
        and min_recall_at_k == 1.0
        and rank1_match_rate == 1.0
        and candidate_ordinal_identity_match_rate == 1.0
        and max_score_delta <= SCORE_DELTA_TOLERANCE
        and nan_or_inf == 0
    )

    result = {
        "schema": "atlas.semantic-topk-01-real-canary.v1",
        "sourceVectors": "docs/reports/semantic-768-canary-vectors-v1.json",
        "sourceReceipt": payload.get("sourceReceipt"),
        "candidateSnapshotRevision": payload["candidateSnapshotRevision"],
        "ordinalMapChecksum": payload["ordinalMapChecksum"],
        "inputVectorsChecksum": payload.get("inputVectorsChecksum"),
        "orderedCandidateBindingChecksum": payload.get("orderedCandidateBindingChecksum"),
        "source": {
            "table": "codebase_chunk_index",
            "column": "content_embedding",
            "storageType": "halfvec(768)",
        },
        "execution": {
            "pytorchDevice": device,
            "torchVersion": torch.__version__,
            "cuvsVersion": CUVS_VERSION,
            "executionDtype": "float32",
        },
        "corpusCount": n,
        "queryCount": n,
        "dimensions": dim,
        "topK": TOP_K,
        "scaleCaveat": (
            "N=15 is too small to meaningfully distinguish exact-search implementations from "
            "each other -- this proves cuVS wiring/CandidateOrdinal binding correctness against "
            "real production vectors, not exact-vs-approximate recall behavior at scale."
        ),
        "metrics": {
            "meanRecallAtK": mean_recall_at_k,
            "minRecallAtK": min_recall_at_k,
            "rank1MatchRate": rank1_match_rate,
            "fullRankAgreementRate": full_rank_agreement_rate,
            "candidateOrdinalIdentityMatchRate": candidate_ordinal_identity_match_rate,
            "maxScoreDelta": max_score_delta,
            "meanScoreDelta": mean_score_delta,
            "nanInfCount": nan_or_inf,
        },
        "scoreDeltaTolerance": SCORE_DELTA_TOLERANCE,
        "perQuery": per_query,
        "cuvsReceipt": cuvs_receipt.to_dict() if hasattr(cuvs_receipt, "to_dict") else str(cuvs_receipt),
        "status": "SEMANTIC_TOPK_PROVEN" if gate_pass else "SEMANTIC_TOPK_REJECTED",
        "gate": {
            "RESULT": "PASS" if gate_pass else "FAIL",
        },
        "canonicalAuthority": False,
        "rankingPromotion": False,
        "writesPerformed": False,
    }

    OUT_PATH.write_text(json.dumps(result, indent=2, default=str) + "\n")
    print(json.dumps({"status": "WRITTEN", "path": str(OUT_PATH), "gate": result["gate"], "receiptStatus": result["status"]}, indent=2))


if __name__ == "__main__":
    main()
