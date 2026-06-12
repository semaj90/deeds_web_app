# XGBoost Reranker Contract

Generated: 2026-06-06  
Updated: 2026-06-12 — promoted to formal reranker input (Phase 18)

## Decision

**XGBoost is promoted from side-channel hotness scorer to a formal reranker input.**

Previous role: additive boost to Karpathy blend (`0.4·PR + 0.3·attn + 0.3·authority`), fires only on `ace:cluster:hot` cache hit, hotness ≥ 0.6 overrides BoW centroid score.

New role: Stage 4 cross-signal reranker in the Atlas retrieval cascade, operating after Qdrant ANN + Neo4j expansion and before final context assembly.

## Promotion Rationale

The retrieval benchmark proved Qdrant ANN is the dominant signal (NDCG@10 = 0.639 qdrant_only → 0.772 rrf_default after BM25+concept). The next gains come from combining heterogeneous signals that RRF alone cannot weight correctly:

- RRF has no concept of feature alignment, community membership, or historical reward
- XGBoost handles non-linear interaction between retrieval signals naturally
- The side-channel path was gated on `ace:cluster:hot` cache hits — too narrow for a formal ranking contract

Gradient boosted trees are purpose-built for this:

```
cosine_score    ← Qdrant ANN similarity
pagerank        ← Neo4j authority (from gpu:karpathy:scores)
community_match ← same community_id as query context
same_feature    ← feature_id alignment
reward_score    ← historical reward from agent_traces
som_distance    ← SOM BMU Euclidean distance
concept_overlap ← count of shared concept_ids
```

## New Cascade Position

```
Qdrant ANN (top 25)
  ↓
Neo4j expansion (→ 50–150 candidates)
  ↓
Feature generation (cosine, pagerank, community_match, same_feature,
                    reward_score, som_distance, concept_overlap)
  ↓
XGBoost reranker (→ top 20)
  ↓
Cross-encoder (optional, Phase 6+)
  ↓
ACE context assembly
```

## Prerequisites Before Activation

XGBoost as a formal reranker requires:

1. **Labeled training set** — derive from agent_traces where `outcome = 'success'` and `reward ≥ 0.7`; each (query, doc) pair becomes a training example; relevance label = reward score discretized to 0/1/2
2. **Feature schema stability** — all 7 features above must be populated for ≥ 80% of atlas_packets; community_confidence backfill (Layer A) must be applied
3. **Eval harness** — the 20-query benchmark (rrf-20-query-benchmark.mjs) serves as the offline gate; XGBoost must show NDCG@10 ≥ current rrf_default before replacing RRF

## Activation Gate

```
XGBoost reranker replaces RRF combiner when:
  - agent_traces with outcome='success': ≥ 500 rows
  - reward ≥ 0.70 subset: ≥ 200 rows
  - Feature coverage: community_confidence populated ≥ 80%
  - Offline eval: NDCG@10 ≥ 0.80 (vs 0.772 current rrf_default)
```

## Implementation Path (Phase 18)

1. `scripts/atlas/generate-xgboost-training-set.mjs` — extract (query, doc, label) triples from agent_traces
2. `scripts/atlas/train-xgboost-ranker.mjs` — train LambdaMART objective, serialize to `models/xgboost-ranker.json`
3. `src/lib/server/retrieval/xgboost-reranker.ts` — Node.js inference wrapper (xgboost-node or wasm port)
4. Wire into retrieval/orchestrator.ts after Neo4j expansion stage

## Current Status

Stage: **formal reranker lane** — community backfill applied (Layer A complete), 1,134 agent traces collected, reward labels pending extraction.

The side-channel hotness scorer (`scripts/atlas/xgboost-hotness-score.mjs`, `ace:cluster:hot` Redis key) remains active as a parallel signal until the formal reranker clears the activation gate. Do not remove it — the hotness scorer trains on cluster-level signals while the formal reranker trains on query-level relevance labels; they are complementary.
