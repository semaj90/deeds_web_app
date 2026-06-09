# Retrieval Replay Evaluation (L6)

## Goal
Execute Retrieval Replay Evaluation across 20 diverse packet queries (exact cache, semantic cache, JSONB, BM25, Qdrant, graph, RRF, Karpathy) to validate the 95%+ success target. This is the next high-priority step.

## Status
*   **Queries Run:** 20
*   **Successful Runs:** 12
*   **Success Rate:** 60.0% (Target: $\ge 95\%$)
*   **Overall Status:** **Failed**. The system is not ready for production use, which is a useful signal rather than a failure state.

## Key Findings & Blockers
The primary failures are concentrated in the `karpathy` and related caches across multiple queries (`ace-chat-01`, `ace-chat-02`, `rag-03`, `cases-03`, `citations-02`, `graph-02`, `atlas-01`). The most critical failure is:
*   **`karpathy`:** This check fails for several queries, indicating that the core knowledge graph/retrieval components are not fully hydrated or accessible via the expected cache keys.

## Next Steps (High Priority)
[ ] **Execute Retrieval Replay Evaluation:** Run `node scripts/packets/retrieval-replay-eval.mjs --queries .tmp/retrieval-replay-queries.jsonl --top-k 10` to generate final reports and measure success rate against the 95% target.
[ ] **Validate and populate Karpathy authority caches:** Run `mcp-toolchain` or similar commands to refresh core components (`gpu:karpathy:scores`, `ace:authority:top`) to resolve cache failures.
[ ] **Benchmark Llama-server performance:** Benchmark speculative decoding against CPU fallback and measure memory usage to prepare for TensorRT/CUDA enablement.