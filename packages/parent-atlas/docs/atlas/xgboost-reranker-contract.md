# XGBoost Reranker Contract

Date: 2026-06-12

## Decision

XGBoost is the formal reranker input, not a side-channel scorer.

It runs after Qdrant ANN and Neo4j expansion, and before final ACE context assembly.

## Why it is separate

- Storage tiering belongs in `parent-atlas-storage-decision.md`
- Native GEMM / pybind11 belongs in `native-gemm-deferral.md`
- Ranking policy belongs here

## Position in the pipeline

1. BM25 + concept activation
2. deeds/engram optional adapter boundary
3. XGBoost reranking
4. Neo4j contextual tree enrichment
5. Higher-hop coverage repair

## Prerequisites

- Labeled training set from `agent_traces`
- Feature coverage for community confidence, feature alignment, and reward signals
- Offline evaluation that beats the current combiner

## Activation gate

- `agent_traces` success rows: 500+
- Reward-labeled subset: 200+
- Feature coverage: 80%+
- Offline eval: NDCG@10 >= current baseline

## Notes

Keep the side-channel hotness scorer active until the formal reranker clears its gate.
Do not remove the parallel signal early.
