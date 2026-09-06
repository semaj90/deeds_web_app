"""
RETRIEVAL-01L-06: cuVS brute-force exact GPU oracle, bounded to the PKT-LINEAGE-08A cohort
(434 candidates) and the frozen query fixture already used in RETRIEVAL-01L-04/05.

Reads the fixture exported by scripts/atlas/export-retrieval-01l-08a-cuvs-fixture-v1.mjs
(docs/reports/retrieval-01l-08a-cuvs-fixture-v1.json). Runs cuvs.neighbors.brute_force (exact,
GPU) over exactly this 434-vector population, compares its top-K result against the Postgres
exact-cosine oracle already recorded in the fixture (postgresExactTopKForComparison).

This does not touch canonical production data -- it operates entirely on the bounded fixture file.
No writes back to Postgres/Qdrant/Neo4j/Valkey. Matches this repo's GPU-MINI-FABRIC-01 discipline:
a CPU/Postgres oracle is the ground truth; cuVS is checked against it, not trusted blindly.

Usage (from WSL2, atlas-rapids-cu13 env):
    python retrieval_01l_08a_cuvs_exact_v1.py <path-to-fixture.json> <path-to-output.json>
"""
import json
import sys

import numpy as np


def cosine_distance_matrix(query, population):
    q = query / np.linalg.norm(query)
    p = population / np.linalg.norm(population, axis=1, keepdims=True)
    return 1.0 - (p @ q)


def main():
    fixture_path = sys.argv[1]
    out_path = sys.argv[2]
    top_k = 10

    with open(fixture_path, "r") as f:
        fixture = json.load(f)

    population = fixture["population"]
    ids = [item["chunkRowId"] for item in population]
    vectors = np.array([item["vector"] for item in population], dtype=np.float32)
    query_vector = np.array(fixture["queryVector"], dtype=np.float32)

    postgres_topk = fixture["postgresExactTopKForComparison"]
    postgres_ids = [row["chunkRowId"] for row in postgres_topk]

    try:
        import cuvs
        from cuvs.neighbors import brute_force
        import cupy as cp

        cuvs_available = True
        cuvs_version = cuvs.__version__
    except Exception as exc:  # noqa: BLE001 -- report, don't crash the whole proof
        result = {
            "schema": "atlas.retrieval-01l-08a-cuvs-exact.v1",
            "status": "LIVE_RUNTIME_UNAVAILABLE",
            "error": str(exc),
        }
        with open(out_path, "w") as f:
            json.dump(result, f, indent=2)
        print(json.dumps(result, indent=2))
        return

    # cuVS brute_force: exact GPU nearest-neighbor, the documented ground-truth mode for a corpus
    # this small (NVIDIA's own guidance: brute-force is reasonable well under ~100k vectors).
    dataset_gpu = cp.asarray(vectors)
    queries_gpu = cp.asarray(query_vector.reshape(1, -1))

    index = brute_force.build(dataset_gpu, metric="cosine")
    distances, indices = brute_force.search(index, queries_gpu, k=top_k)

    indices_host = cp.asnumpy(indices)[0].tolist()
    distances_host = cp.asnumpy(distances)[0].tolist()
    cuvs_ids = [ids[i] for i in indices_host]

    # Independent CPU cross-check of cuVS's own output (not just cuVS vs Postgres) -- exactly this
    # repo's established double-oracle pattern from GPU-MINI-FABRIC-01's SEMANTIC-EXACT-PARITY-01.
    cpu_distances = cosine_distance_matrix(query_vector, vectors)
    cpu_order = np.argsort(cpu_distances)[:top_k]
    cpu_ids = [ids[i] for i in cpu_order]

    cuvs_vs_postgres_set = set(cuvs_ids) == set(postgres_ids)
    cuvs_vs_postgres_rank = cuvs_ids == postgres_ids
    cuvs_vs_cpu_set = set(cuvs_ids) == set(cpu_ids)
    cuvs_vs_cpu_rank = cuvs_ids == cpu_ids
    max_score_delta = float(np.max(np.abs(np.array(distances_host) - cpu_distances[indices_host])))

    status = (
        "CUVS_POSTGRES_CPU_TRIPLE_EXACT_PARITY"
        if cuvs_vs_postgres_set and cuvs_vs_cpu_set
        else "PARITY_MISMATCH_INVESTIGATE"
    )

    result = {
        "schema": "atlas.retrieval-01l-08a-cuvs-exact.v1",
        "gate": "RETRIEVAL-01L-06",
        "cuvsVersion": cuvs_version,
        "populationSize": len(ids),
        "topK": top_k,
        "cuvsTopK": [{"chunkRowId": cid, "distance": d} for cid, d in zip(cuvs_ids, distances_host)],
        "postgresTopK": postgres_ids,
        "cpuOracleTopK": cpu_ids,
        "cuvsVsPostgresExactSetParity": cuvs_vs_postgres_set,
        "cuvsVsPostgresRankParity": cuvs_vs_postgres_rank,
        "cuvsVsCpuOracleExactSetParity": cuvs_vs_cpu_set,
        "cuvsVsCpuOracleRankParity": cuvs_vs_cpu_rank,
        "maxScoreDeltaCuvsVsCpu": max_score_delta,
        "status": status,
        "canonicalProductionDataTouched": False,
        "writesPerformed": False,
    }
    with open(out_path, "w") as f:
        json.dump(result, f, indent=2)
    print(json.dumps(result, indent=2))


if __name__ == "__main__":
    main()
