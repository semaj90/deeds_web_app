# 🚀 Project Plan: End-to-End Retrieval Benchmark (P17)

## Goal
To move the system status from `LIVE_UNVERIFIED` to **Verified** by creating a single, comprehensive benchmark script that executes and measures the full data retrieval pipeline end-to-end. This proves operational readiness, not just schema existence.

## 🎯 Core Concept: The Benchmark Script
A new file, `scripts/atlas/benchmark-retrieval-e2e.mjs`, will be created to orchestrate the entire flow from a user query through all layers of retrieval and synthesis.

## 🏗️ Proposed Architecture Flow (The Execution Path)
1.  **Input**: A natural language query (`query`).
2.  **Layer 1: Initial Filtering/Embedding**:
    *   `trace_atlas_prefilter`: Use the query to identify relevant SOM clusters, limiting the search space.
3.  **Layer 2: Core Retrieval (Parallel)**:
    *   `trace_kag_multi_lane_search`: Run the primary search across all knowledge layers (L0-L9).
    *   `trace_atlas_compact_context`: Build a compressed context packet from the initial hits.
4.  **Layer 3: Graph & Semantic Expansion**:
    *   `trace_graph_expand_neighborhood`: Expand results using Neo4j graph traversal (e.g., finding related concepts).
    *   `trace_atlas_suggest_files`: Use file/directory suggestions to narrow the focus.
5.  **Layer 4: Data Source Querying**:
    *   **Qdrant**: Perform ANN search on relevant chunks.
    *   **Postgres FTS/BM25**: Filter results using full-text search on indexed content.
    *   **Redis/Bifrost**: Use the `bifrost:packet:{key}` cache to retrieve enriched metadata (feature details, community context).
6.  **Layer 5: Reranking & Fusion**:
    *   `trace_search_rerank`: Re-rank all retrieved chunks using a combined scoring mechanism.
    *   `trace_turbovec_turbovec_rank_chunks`: Apply the final vector ranking score.
7.  **Layer 6: Synthesis & Output**:
    *   The top results are passed to `gemma4-offload_gemma4_summarize` or a similar synthesis step, generating the final answer and performance metrics (p50/p95).

## ✅ Safeguards & Controls (Mandatory)
1.  **Dry Run Default**: The initial execution must be read-only (`--dry-run`). No writes to any persistent store are allowed until explicitly approved.
2.  **Gatekeeping**: The script must enforce a mandatory `operator_token` check before executing any write/update logic (e.g., calling `trace_ops_gpu_pipeline_stats` for read-only metrics).
3.  **Audit Trail**: All execution parameters, timings, and results must be logged to a dedicated audit log (`docs/reports/benchmark-run-{timestamp}.jsonl`).

## 🛠️ Implementation Plan (To Do)
1.  Create `scripts/atlas/benchmark-retrieval-e2e.mjs` skeleton.
2.  Implement the core orchestration logic, calling and sequencing the necessary tracing tools (`trace_atlas_prefilter`, `trace_kag_multi_lane_search`, etc.).
3.  Add comprehensive logging for timing and data flow at each stage.
4.  Create a dedicated smoke test command to validate the new script's execution path.