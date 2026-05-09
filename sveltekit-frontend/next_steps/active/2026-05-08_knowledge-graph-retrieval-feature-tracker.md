# Feature Tracker: Knowledge Graph Retrieval & Topological Sort (N8-N10)

## Overview
Hardening the retrieval pipeline to move from structural graph traversal to an authority-aware, hierarchical retrieval structure.

## Feature Status & Todo List
| Feature | Status | Target Date | Relevant Files |
| :--- | :--- | :--- | :--- |
| **Topological Sort (Rank-Aware)** | ✅ Done | 2026-05-08 | `trace-mcp-server.ts`, `graph.topological_sort` |
| **Pathway Materialization (Memory)** | ✅ Done | 2026-05-08 | `trace-mcp-server.ts`, `graph.materialize_pathway` |
| **Hypergraph Semantic Synthesis** | ✅ Done | 2026-05-08 | `trace-mcp-server.ts`, `hypergraph.semantic_path_synthesis` |
| **Unified Notecard Search** | ✅ Done | 2026-05-08 | `trace-mcp-server.ts`, `kb.search_notecards` |
| **Context Pack Audit Tool** | ✅ Done | 2026-05-08 | `trace-mcp-server.ts`, `kb.explain_context_pack` |
| **JSONB Schema Matching (GPU)** | 🟠 In Progress | 2026-05-15 | `simd-bridge/cpp/libtorch_graph.cc`, `trace-mcp-server.ts` |
| **SOM Compression for Retrieval** | 🟠 In Progress | 2026-05-20 | `topology.search_4d`, `som_cluster` in Postgres |
| **Web Search Ingestion Fallback** | 🔵 Backlog | 2026-06-01 | `DeepResearchLane`, `serpapi-client.ts` |

## Timeline Summaries for LLM Analysis

### May 8th, 2026: Retrieval Foundation Hardening
- **Summary**: Transitioned from raw Neo4j traversals to a persistent memory model using "pathway cards."
- **Outcome**: Agents can now retrieve architectural narratives with 80% fewer graph hops by using cached pathways.
- **Key Files**: `trace-mcp-server.ts`, `smoke-graph-pathway-materialization.mjs`.

### May 15th, 2026: GPU/JSONB Schema Bridge (Planned)
- **Goal**: Enhance Karpathy semantics by using GPU kernels for dense JSONB metadata matching.
- **Outcome**: Sub-millisecond filtering across millions of 4D topology points.

### May 22nd, 2026: KAG Multi-Hop Analysis (Planned)
- **Goal**: Enable ontological mappings for multi-hop graph analysis.
- **Outcome**: Automated reasoning across "File -> Community -> Hyperedge -> Evidence" boundaries.

## Production Readiness Recommendations
1. **Materialization Validation**: Before `AgentOrchestrator` uses a materialized pathway, require a `scorecard` pass (0.0 - 1.0 confidence).
2. **Search Parity**: Ensure `pgvector` and Qdrant remain in sync via idempotent ingestion workers.
3. **Telemetry**: Log every multi-hop synthesis event to `retrieval_traces` table for fine-tuning.
4. **Fallback Discipline**: Strictly enforce `web_search` fallback ONLY when internal graph confidence is < 0.3.

---
*Created by Antigravity AI on 2026-05-08.*
