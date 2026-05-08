# TRACE MCP Tool Audit — Analysis & Gaps

**Run**: 2026-05-07T23-01-22
**Endpoint**: http://127.0.0.1:8788/mcp
**Coverage**: 33/33 tools reachable (100%)
**Surface PASS**: 33/33 (every tool returned a JSON-RPC response)

## Reality Check — Internal Errors Hidden in PASS Responses

The runner counts a JSON-RPC reply as PASS even when the MCP `content` carries `isError: true`. Tools that returned errors:

| Tool | Internal Error | Severity |
|------|----------------|----------|
| `topology.same_som_cluster` | `column "stable_key" does not exist` | 🔴 schema drift |
| `clusters.get_members` | `column "stable_key" does not exist` | 🔴 schema drift |
| `hypergraph.explain_activation` | `Cannot find package '$env'` (SvelteKit env import outside runtime) | 🔴 module loader bug |
| `ops.record_fix_attempt` | `relation "fix_attempts" does not exist` | 🟡 missing migration |
| `topology.search_4d` | `degraded: true` (topology source stale/missing) | 🟡 data gap |
| `graph.pagerank_top` | returns `[]` | 🟡 confirms GDS4 — PageRank unwritten |
| `graph.shortest_path` | `path: null` for two known-connected files (9.9s) | 🟡 graph sparse + slow |
| `hypergraph.search` | 0 results | 🟡 hyperedges not populated for query |
| `graph.community_for_node` | response missing `communityId` field | 🟡 incomplete response |

## Karpathy GPU Stack — End-to-End State

```
┌─────────────────────────────────────────────────────────────────┐
│ STAGE 1 — GPU Codebase Mapping (RTX 3060 Ti / LibTorch CUDA)    │
│   tensorrt_bridge.node → batchCosineSimilarity, kmeansWith…     │
│   ✅ Loaded, 17 GPU functions exported                           │
└─────────────────────────────────────────────────────────────────┘
                              ↓
┌─────────────────────────────────────────────────────────────────┐
│ STAGE 2 — Indexing (Ollama embeddinggemma 768-dim)              │
│   codebase_chunks_768 collection                                │
│   ✅ 30,285 points patched (per GDS summary)                     │
│   ✅ graphAuthorityScore present on 2,733 nodes                  │
└─────────────────────────────────────────────────────────────────┘
                              ↓
┌─────────────────────────────────────────────────────────────────┐
│ STAGE 3 — Qdrant Clustering + Topology                          │
│   ✅ Louvain communityId on 2,772 nodes, 736 communities         │
│   ⚠️ PageRank: 0 nodes written (GDS plugin missing)              │
│   ⚠️ SOM topology: search_4d degraded                            │
│   ❌ stable_key column missing on Postgres source-of-truth       │
└─────────────────────────────────────────────────────────────────┘
                              ↓
┌─────────────────────────────────────────────────────────────────┐
│ STAGE 4 — LLM Wiki + KAG Notes                                  │
│   ✅ 308 Redis idx:* keys, 3 wiki:note:dir:* keys                │
│   ✅ kag.ingest_memory_directory functional (1 pending)          │
│   ⚠️ ace:authority:top: 200 entries, TTL 21,381s (rebuilt OK)    │
│   ⚠️ bow_tiles: 0 (not built)                                    │
└─────────────────────────────────────────────────────────────────┘
                              ↓
┌─────────────────────────────────────────────────────────────────┐
│ STAGE 5 — ACE Hit Attachment (Redis)                            │
│   ✅ trace.validate_ace_hit returns checks per file              │
│   ✅ Redis ace:authority:top hash live                           │
│   ⚠️ Hyperedge activation broken — $env import bug               │
└─────────────────────────────────────────────────────────────────┘
                              ↓
┌─────────────────────────────────────────────────────────────────┐
│ STAGE 6 — Gemma4 Agentic Orchestration                          │
│   ✅ 33 MCP tools listed, all reachable                          │
│   ✅ context.build_kv_packet operational (403ms)                 │
│   ✅ kag.multi_lane_search 416ms (4 lanes)                       │
│   ⚠️ Cascade tools slow: search.hybrid 10.2s, go_hybrid 10.9s    │
└─────────────────────────────────────────────────────────────────┘
```

## Performance — Concurrent Parallelism Opportunity

| Tool | Latency | Why it matters |
|------|---------|----------------|
| `search.go_hybrid` | 10,890ms | RRF fusion of 3 backends — should run in parallel, looks serial |
| `search.hybrid` | 10,187ms | Same — embedding+pgvector+qdrant should be `Promise.allSettled` |
| `graph.shortest_path` | 9,922ms | Neo4j BFS without index hint, no Cypher cache |
| `topology.search_near` | 7,872ms | Embed → 4D filter → rerank — embedding dominates |
| `search.dev_context` | 5,399ms | Same embedding hop |
| `trace.kag_search` | 3,742ms | Postgres FTS path — fast lane is correct |

**Fast lane** (< 100ms): `graph.pagerank_top`, `search.postgres_fts`, `context.*`, `kag.record_agent_run`, all `ops.*` — these are correctly cached or pure metadata reads.

## Gaps & Enhancements

### 🔴 P0 — Schema Drift (blocks topology tools)
1. **`stable_key` column missing**. Add migration to whichever table backs `topology.same_som_cluster` + `clusters.get_members`. Likely `codebase_files` or a topology view. The MCP layer assumes it; Postgres no longer has it.
   ```sql
   ALTER TABLE codebase_files ADD COLUMN IF NOT EXISTS stable_key text;
   UPDATE codebase_files SET stable_key = 'file:' || file_path WHERE stable_key IS NULL;
   CREATE INDEX IF NOT EXISTS idx_codebase_files_stable_key ON codebase_files(stable_key);
   ```
2. **`fix_attempts` table missing** — `ops.record_fix_attempt` writes here. Likely a journal entry not yet applied. Check `drizzle/manual/` for the SQL.
3. **`code_relations.from_file` column missing** — GDS9 fails with `column "from_file" does not exist`. Schema drift between scanner and consumer.

### 🔴 P0 — `$env` in MCP Process
`hypergraph.explain_activation` imports `$env/dynamic/private` which only resolves under SvelteKit's Vite plugin. The MCP server runs via `tsx src/mcp/trace-mcp-server.ts` — outside Vite. Fix: replace `$env` with `process.env` in any module reachable from `trace-mcp-server.ts`. Greppable check:
```bash
rg "from '\$env" src/lib/server/ src/mcp/
```

### 🟡 P1 — GDS Plugin or Postgres Fan-In
PageRank has 0 nodes because Neo4j Community lacks the GDS plugin. Two paths:
- **Option A**: Install Neo4j GDS plugin (Docker image `neo4j:5.x-community + plugins`)
- **Option B**: Already wired — `Postgres fan-in fallback` (GDS9). Ensure `graphify:gds` script's fallback branch actually writes pagerank scores back to Neo4j when GDS is absent. Currently it only populates `graphAuthorityScore` but skips `pagerank`.

### 🟡 P1 — Concurrent Parallelism in Search Tools
`search.hybrid` and `search.go_hybrid` take 10+ seconds because the 3 backends (FTS, pgvector, Qdrant) are awaited sequentially. Convert to `Promise.allSettled` inside the tool handler. Expected: 3× speedup → ~3.5s.

### 🟡 P1 — Embedding Cache Miss
`topology.search_near`, `search.dev_context`, `trace.kag_search` all spend ~3-7s on the same `embeddinggemma` 768-dim embed call. The Bifrost L2 / Redis L1 cache should fingerprint identical queries — verify the embed step is L1-cached, not just the final answer.

### 🟢 P2 — Bow Tiles Missing
`bow_tiles: 0` from graphify smoke. Run `npm run graphify:bow-tiles` to regenerate.

### 🟢 P2 — graph.community_for_node Response
Tool only echoes back the `stableKey` — should include `communityId`, `communitySize`, `topNeighbors`. Likely the handler returns early when the SQL returns 0 rows. Add explicit "no community found" error path.

### 🟢 P2 — Hypergraph Repopulation
`hypergraph.search` returns 0 results across queries. Likely the hyperedge index is stale post-schema migration. Run:
```bash
npm run hypergraph:build:redis
npm run hypergraph:digest
```

## Concurrent Parallelism Wins (Karpathy Lane)

The `dev:agent` orchestrator spawns 4 concurrent processes (Docker, Health, Frontend, TRACE-MCP). Tool calls themselves are serial within a single MCP request. Two improvements:

1. **Batch tool API** — add `tools/batch_call` that takes `[{name, args}]` and runs them under `Promise.allSettled`. Gemma4 emits multi-tool plans; today it makes N round-trips.
2. **GPU pipeline parallelism** — `kmeansWithCentroids`, `pageRankGPU`, `attentionScoreGPU` exposed via N-API (G33-G35) but called serially. Let cluster summarization, authority scoring, and attention reweighting run as 3 worker_threads against the same shared CUDA context.
3. **Search adapter fan-out** — `search.hybrid` already has the 3 backends; just wrap them in `Promise.allSettled`.

## Files Generated

- `memory/runs/2026-05-07T23-01-22/mcp-tool-audit.json` — raw per-tool results
- `memory/runs/2026-05-07T23-01-22/mcp-tool-audit.md` — markdown table
- `scripts/smoke-trace-mcp-tools.mjs` — re-runnable harness
