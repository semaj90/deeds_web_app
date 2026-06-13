# TRACE/Karpathy Feature Tracking & Production Roadmap

## Current Status (May 2026)
The system has transitioned from a structural graph traversal model to an authority-aware, hierarchical retrieval system (N8-N10 Hardening).

### Canonical Operator Order
1. BM25 + concept activation
2. deeds/engram optional adapter boundary
3. XGBoost formal reranker
4. Neo4j contextual tree enrichment + HyperRAG packet RPC
5. Autoencoder / SOM latent topology
6. Native GEMM / pybind11 deferred until pressure gates justify it

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
1. **Phase 1: BM25 + Concept Activation (Current)**
   - Finalize `graph_pathway_cards` DB migration.
   - Implement `kb.search_notecards` FTS (Full Text Search).
   - Validate PageRank authority scores across the full codebase graph.
   - Keep deeds/engram optional and fail-open; Tiny-Engram stays experimental only.

2. **Phase 2: Memory Adapter + Formal Reranker**
   - Wire `AgentOrchestrator` to prefer materialized pathways over raw synthesis.
   - Implement "Scorecard-first" validation for all agentic tool selections.
   - Promote XGBoost through the contract in `docs/atlas/xgboost-reranker-contract.md`.

3. **Phase 3: Neo4j + HyperRAG Packet RPC**
   - Wire `AgentOrchestrator` to the graph context lane.
   - Keep packet hydration and community expansion explicit.
   - Use `docs/atlas/parent-atlas-storage-decision.md` for storage roles, not ranking policy.

4. **Phase 4: Autoencoder / SOM Latent Topology**
   - Enable `manifold4` visualization for 4D topology exploration.
   - Integrate SOM/BMU clustering results into the retrieval ranker.
   - Launch `DeepResearchLane` for external grounding.

5. **Phase 5: Native GEMM / pybind11 Deferred**
   - Keep `torch::mm()` / pybind11 work deferred to `docs/atlas/native-gemm-deferral.md`.

### Phase F / Phase 18: Messy Query Routing Evaluation
- Validate `router-first/tools-second` route selection for messy developer queries.
- Align HyperRAG fallback decisions with Karpathy codebase indexing state:
  - Qdrant `codebase_chunks_768`
  - Redis `gpu:karpathy:scores`
- Surface audit artifacts in `docs/reports/messy-query-routing-eval.json` and `docs/reports/messy-query-routing-eval.md`.
- Engineering docs: `docs/operator/PHASE_18_MESSY_QUERY_ROUTING.md`.
- Run via `npm run atlas:messy-routing` or the VS Code task `Messy Query Routing Evaluation`.

### Production Readiness Recommendations
- **Database**: Ensure `pgvector` and `pg_trgm` are enabled in Postgres for hybrid search.
- **Cache**: Increase Redis TTL for `rag:exact:*` hits to 24h for stable architectures.
- **Monitoring**: Expose MCP tool latency metrics to the YorHA dashboard.
- **Security**: Strict validation of `operator_token` for all destructive `ops.*` tools.
