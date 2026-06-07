# XGBoost Reranker Contract

Generated: 2026-06-06

## Decision

**XGBoost stays a side-channel hotness scorer. It is NOT promoted to a formal reranker input.**

## Evidence

- `src/lib/server/ace/merge-cluster-candidates.ts` — merges BoW cluster scores with XGBoost hotness scores. XGBoost hotness is additive to the Karpathy blend, not a replacement.
- `src/lib/server/features/ai/ace/context-assembler.ts:5944-5945` — hot clusters with hotness ≥ 0.6 override the BoW centroid score. The merge is bounded and non-breaking.
- `ace:cluster:hot` Redis key — written by `scripts/atlas/xgboost-hotness-score.mjs`, TTL 1h. The scorer runs offline; the ACE assembly reads the cached result.
- `src/lib/server/ai/ace-prompt-preflight.ts:161` — `xgboost` is in the keyword-detection list for query tagging, confirming it is recognized as a domain signal but not in the critical path.

## Rationale

1. The Karpathy blend (`0.4·PageRank + 0.3·attention + 0.3·authority`) is the canonical authority signal. XGBoost hotness scores are a lightweight additive boost — they do not replace any of the three blend components.
2. Promoting XGBoost to a formal reranker input would require a labeled training set, eval harness, and a stable feature schema. None of these are ready. The side-channel path delivers value without those dependencies.
3. Phase 18 stays bounded to the side-channel role until a labeled eval confirms that XGBoost improves recall@K versus the Karpathy blend alone.

## Constraints

- Do not route all retrieval through the XGBoost scorer. The scorer only fires when `ace:cluster:hot` has a cache hit.
- Do not retrain the model on production traffic without a held-out eval split.
- Hotness ≥ 0.6 threshold for centroid override is the current production value. Changes require an A/B test.

## Status

`side-channel-hotness-scorer` — active, bounded, not a formal reranker. Lane 6 closed.
