#!/usr/bin/env python
"""SEMANTIC-EXACT-PARITY-01 -- Phase A of GPU-MINI-FABRIC-01.

Prove PyTorch exact GEMM+topk agrees with cuVS brute-force exact search on a
synthetic, frozen, non-canonical fixture (16384 nodes, 64-dim, K=16, 256
queries) before any approximate/graph search (CAGRA) is attempted. Per the
governing design: "Don't continue if this fails."

Reuses the existing canonical cuVS owner
(atlas_compute.cuvs_analytics.run_cuvs_exact_knn) rather than re-implementing
a second brute-force wrapper -- per this repo's Duplication Prevention rule.

Run inside conda env atlas-rapids-cu13:
  PYTHONPATH=. /home/james/miniforge3/envs/atlas-rapids-cu13/bin/python \
    -m atlas_compute.gpu_mini_fabric.semantic_exact_parity_01
"""

from __future__ import annotations

import json
import time
from pathlib import Path

import numpy as np
import torch

from atlas_compute.cuvs_analytics import run_cuvs_exact_knn
from atlas_compute.gpu_mini_fabric.semantic_exact_parity_fixture import (
    generate_semantic_exact_parity_fixture_v1,
)

OUT_PATH = Path("/mnt/c/Users/james/Videos/deeds-web-app/docs/reports/gpu-mini-fabric-01-semantic-exact-parity-01.json")

SCORE_DELTA_TOLERANCE = 1e-4


def main() -> None:
    fixture = generate_semantic_exact_parity_fixture_v1()
    vectors = fixture.vectors
    queries = vectors[fixture.query_indices]

    # ── PyTorch exact cosine top-K (CUDA) -- the correctness oracle ─────────
    device = "cuda" if torch.cuda.is_available() else "cpu"
    corpus_t = torch.from_numpy(vectors).to(device)
    queries_t = torch.from_numpy(queries).to(device)
    # vectors are already L2-normalized at fixture generation; renormalize
    # defensively so the oracle doesn't silently depend on that invariant.
    corpus_norm = torch.nn.functional.normalize(corpus_t, p=2, dim=1)
    queries_norm = torch.nn.functional.normalize(queries_t, p=2, dim=1)

    t0 = time.perf_counter()
    scores = torch.mm(queries_norm, corpus_norm.t())
    torch_topk_scores, torch_topk_idx = torch.topk(scores, k=fixture.k, dim=1)
    if device == "cuda":
        torch.cuda.synchronize()
    torch_ms = (time.perf_counter() - t0) * 1000

    torch_topk_idx_np = torch_topk_idx.cpu().numpy()
    torch_topk_scores_np = torch_topk_scores.cpu().numpy()

    # ── cuVS brute-force exact search (canonical owner) ──────────────────────
    t0 = time.perf_counter()
    cuvs_neighbors, cuvs_distances, cuvs_receipt = run_cuvs_exact_knn(
        vectors, queries, top_k=fixture.k, metric="cosine"
    )
    cuvs_ms = (time.perf_counter() - t0) * 1000

    # ── Compare, including the CandidateOrdinal identity conflation check ──
    overlaps = []
    rank_agreements = []  # fraction of positions where full rank order matches
    max_score_deltas = []
    rank1_matches = 0
    node_key_identity_matches = 0
    projection_ordinal_conflation_hits = 0
    candidate_ordinal_conflation_hits = 0
    tie_groups_seen = 0
    nan_or_inf = 0

    for qi in range(fixture.num_queries):
        torch_row = torch_topk_idx_np[qi]
        cuvs_row = cuvs_neighbors[qi]

        torch_set = set(torch_row.tolist())
        cuvs_set = set(cuvs_row.tolist())
        overlaps.append(len(torch_set & cuvs_set) / fixture.k)

        rank_agreements.append(float(np.mean(torch_row == cuvs_row)))

        if torch_row[0] == cuvs_row[0]:
            rank1_matches += 1

        cuvs_sim_top1 = 1.0 - float(cuvs_distances[qi][0])
        torch_sim_top1 = float(torch_topk_scores_np[qi][0])
        max_score_deltas.append(abs(cuvs_sim_top1 - torch_sim_top1))

        if not (
            np.isfinite(torch_topk_scores_np[qi]).all()
            and np.isfinite(cuvs_distances[qi]).all()
        ):
            nan_or_inf += 1

        # Identity conflation check: the row index is the only thing both
        # backends actually returned. If either backend's search implementation
        # somehow returned a projectionOrdinal or candidateOrdinal value
        # instead of a true row index, this would silently produce wildly
        # wrong nodeKey lookups below -- this loop would catch it because
        # node_keys[row_index] is authoritative, and any accidental swap
        # would make rank1 identities point at semantically unrelated nodes.
        if fixture.node_keys[torch_row[0]] == fixture.node_keys[cuvs_row[0]]:
            node_key_identity_matches += 1

        # Explicit conflation probes: if projection_ordinal or
        # candidate_ordinal values ever leak into a row-index slot, the
        # dereferenced node_key would (with overwhelming probability, since
        # both are independent random permutations of 16384 items) NOT match
        # what this loop already established as the correct pairing above.
        proj_alias_key = fixture.node_keys[int(fixture.projection_ordinals[torch_row[0]])]
        cand_alias_key = fixture.node_keys[int(fixture.candidate_ordinals[torch_row[0]])]
        if proj_alias_key == fixture.node_keys[torch_row[0]]:
            projection_ordinal_conflation_hits += 1
        if cand_alias_key == fixture.node_keys[torch_row[0]]:
            candidate_ordinal_conflation_hits += 1

        # Tie handling: count how many distinct queries have a tied top-1/top-2
        # score gap smaller than the tolerance (informational, not gating --
        # ties are expected on a random synthetic fixture only in the rarest
        # cases at float32 precision).
        if abs(float(torch_topk_scores_np[qi][0]) - float(torch_topk_scores_np[qi][1])) < 1e-6:
            tie_groups_seen += 1

    result = {
        "schema": "atlas.gpu-mini-fabric.semantic-exact-parity-01-result.v1",
        "test": "SEMANTIC-EXACT-PARITY-01",
        "phase": "A",
        "read_only": True,
        "canonical_production_data_touched": False,
        "fixture": fixture.to_manifest_dict(),
        "backends": {
            "pytorch": {"version": torch.__version__, "device": device, "elapsed_ms": round(torch_ms, 2)},
            "cuvs_brute_force": {
                "elapsed_ms": round(cuvs_ms, 2),
                "receipt": cuvs_receipt.to_dict(),
            },
        },
        "metrics": {
            "recall_at_k": round(float(np.mean(overlaps)), 6),
            "min_recall_at_k": round(float(np.min(overlaps)), 6),
            "mean_full_rank_agreement": round(float(np.mean(rank_agreements)), 6),
            "rank1_match_rate": round(rank1_matches / fixture.num_queries, 6),
            "node_key_identity_match_rate": round(node_key_identity_matches / fixture.num_queries, 6),
            "max_top1_score_delta": round(float(np.max(max_score_deltas)), 8),
            "mean_top1_score_delta": round(float(np.mean(max_score_deltas)), 8),
            "nan_or_inf_queries": nan_or_inf,
            "tie_groups_seen": tie_groups_seen,
            # These MUST be 0 -- any nonzero value means an ordinal accidentally
            # aliases to the same node_key as the true row index, which would
            # mask a real conflation bug in this specific fixture instance.
            # (Expected to be 0 with overwhelming probability by construction;
            # a nonzero value here is itself worth investigating, not just gating.)
            "projection_ordinal_accidental_self_alias_count": projection_ordinal_conflation_hits,
            "candidate_ordinal_accidental_self_alias_count": candidate_ordinal_conflation_hits,
        },
        "gate": {},
    }

    gate = result["gate"]
    gate["recall_at_k_ge_0_999"] = result["metrics"]["recall_at_k"] >= 0.999
    gate["rank1_match_ge_0_999"] = result["metrics"]["rank1_match_rate"] >= 0.999
    gate["node_key_identity_match_eq_1_0"] = result["metrics"]["node_key_identity_match_rate"] == 1.0
    gate["max_score_delta_lt_tolerance"] = result["metrics"]["max_top1_score_delta"] < SCORE_DELTA_TOLERANCE
    gate["no_nan_inf"] = nan_or_inf == 0
    gate["no_ordinal_conflation_detected"] = (
        projection_ordinal_conflation_hits == 0 and candidate_ordinal_conflation_hits == 0
    )
    gate["RESULT"] = (
        "PASS"
        if all(
            gate[k]
            for k in (
                "recall_at_k_ge_0_999",
                "rank1_match_ge_0_999",
                "node_key_identity_match_eq_1_0",
                "max_score_delta_lt_tolerance",
                "no_nan_inf",
                "no_ordinal_conflation_detected",
            )
        )
        else "FAIL"
    )

    OUT_PATH.parent.mkdir(parents=True, exist_ok=True)
    OUT_PATH.write_text(json.dumps(result, indent=2) + "\n")
    print(json.dumps(result, indent=2))
    print("Report:", OUT_PATH)

    if gate["RESULT"] != "PASS":
        raise SystemExit("SEMANTIC-EXACT-PARITY-01 FAILED -- do not continue to Phase B")


if __name__ == "__main__":
    main()
