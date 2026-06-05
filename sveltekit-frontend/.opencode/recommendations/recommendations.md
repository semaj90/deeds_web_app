# Recommendations — 2026-06-05T15:37:44.742Z

**Total**: 2 recommendations across 1 clusters

## Top 10
1. **[HIGH]** `graph:missing-neighborhood` — Disconnected graph neighborhood for query seeds: [src/mcp-gpu-orchestrator.ts, src/workers/LLMS.md]
   - Traversing Neo4j imports relationships starting from decompressed seeds returned 0 neighbors. This indicates key files are orphaned in the Neo4j dependency map, reducing hyperedge retrieval relevance.
   - Action: Run dependency extraction to merge relationships for orphaned codebase nodes.
   - `npm run graph:refresh`
2. **[MEDIUM]** `retrieval:low-context-density` — Low context density retrieved for query: "context-assembler 1780673843641"
   - The runtime query assembled only 2 codebase references (lower than the required threshold of 8). This indicates a gap in either our semantic embedding coverage or search terms association.
   - Action: Analyze the query vocabulary and run semantic index backfills if codebase files are missing.
   - `npm run graphify:semantic`

## By Cluster
### Self-Healing Retrieval
- [medium] Low context density retrieved for query: "context-assembler 1780673843641"
- [high] Disconnected graph neighborhood for query seeds: [src/mcp-gpu-orchestrator.ts, src/workers/LLMS.md]
