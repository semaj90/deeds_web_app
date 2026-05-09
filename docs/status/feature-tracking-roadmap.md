# TRACE/Karpathy Feature Tracking & Production Roadmap

## Current Status (May 2026)
The system has transitioned from a structural graph traversal model to an authority-aware, hierarchical retrieval system (N8-N10 Hardening).

### Active Features & Stability Gates
| Feature Group | Status | Component | Notes |
| :--- | :--- | :--- | :--- |
| **Topological Sort** | ✅ Stable | `trace-mcp-server.ts` | PageRank & Risk-aware tie-breaking active. |
| **Pathway Materialization** | ✅ Active | `trace-mcp-server.ts` | Idempotent persistence of semantic paths. |
| **Hypergraph Synthesis** | ✅ Active | `trace-mcp-server.ts` | Cross-domain (GPU/Community) traversal. |
| **Context Pack Audit** | ✅ Stable | `kb.explain_context_pack` | Narrative breakdown of context tokens. |
| **Hybrid Search** | 🟠 Hardening | `kb.search_notecards` | Unified Sparse + Dense retrieval. |
| **GPU Acceleration** | 🟠 Optimizing | `libtorch_graph.cc` | Batch cosine and SOM clustering integration. |
| **Web Ingestion** | 🔵 Planning | `DeepResearchLane` | Autonomous web-to-graph pipeline. |

### Relevant Implementation Files
- **MCP Hub**: `sveltekit-frontend/src/mcp/trace-mcp-server.ts`
- **Schema**: `sveltekit-frontend/src/lib/server/db/schema/embedded-summaries.ts`
- **GPU Bridge**: `simd-bridge/cpp/libtorch_graph.cc`
- **Retriever**: `services/go-retrieval-service/`
- **Documentation**: `docs/architecture/trace-runtime-split.md`

### Production Timeline (Target: Q3 2026)
1. **Phase 1: Retrieval Hardening (Current)**
   - Finalize `graph_pathway_cards` DB migration.
   - Implement `kb.search_notecards` FTS (Full Text Search).
   - Validate PageRank authority scores across the full codebase graph.

2. **Phase 2: Agentic Memory Encoding**
   - Wire `AgentOrchestrator` to prefer materialized pathways over raw synthesis.
   - Implement "Scorecard-first" validation for all agentic tool selections.
   - Automate `AGENTS.md` updates via KAG notes.

3. **Phase 3: Hypergraph Expansion**
   - Enable `manifold4` visualization for 4D topology exploration.
   - Integrate SOM/BMU clustering results into the retrieval ranker.
   - Launch `DeepResearchLane` for external grounding.

### Production Readiness Recommendations
- **Database**: Ensure `pgvector` and `pg_trgm` are enabled in Postgres for hybrid search.
- **Cache**: Increase Redis TTL for `rag:exact:*` hits to 24h for stable architectures.
- **Monitoring**: Expose MCP tool latency metrics to the YorHA dashboard.
- **Security**: Strict validation of `operator_token` for all destructive `ops.*` tools.
