# MCP/TRACE/Pgvector Hardening — Session 2026-05-08

> Status: ACTIVE — code-level gaps closed; data-pop pipelines remaining

This is the canonical record of the hardening work done in this session so it
isn't lost the way prior session enhancements were. Each row links to the file
that holds the change so a future agent (or human) can verify the edit survived
without re-deriving from chat history.

---

## ✅ Completed (verified by smoke)

| Enhancement | File(s) | Verification |
|-------------|---------|--------------|
| `$env` runtime resolution shim | `src/lib/server/env.server.ts`, `config.ts`, `qdrant-integration.ts`, `adapters/service-integrations.ts` | `hypergraph.explain_activation` no longer crashes with `Cannot find package '$env'` |
| `tools.batch_call` MCP method | `src/mcp/trace-mcp-server.ts` (registry monkey-patch + new tool) | 4 sub-tools in 198ms vs 654ms serial (3.3× speedup) |
| `search.hybrid` parallelization | `src/mcp/trace-mcp-server.ts` | 10,187ms → 719ms (-93%); embed runs in parallel with FTS |
| `graph.pagerank_top` property fix | `src/mcp/trace-mcp-server.ts` | `pageRankScore` → `graphPageRank`; coalesce identity (`stableKey`/`filePath`/`relativePath`) |
| `graph.pagerank_top` cache filter fix | `src/mcp/trace-mcp-server.ts` | Skip Redis cache when `nodeType` filter set (cache stores raw paths, not labelled stableKeys) |
| Postgres proxy port 5434 wired app-wide | `.env`, `env.server.ts`, 52 scripts, `trace-mcp-server.ts` | pgvector verified through proxy: extension v0.8.1, L2/HNSW/halfvec all green |
| `ENV.DATABASE_URL_FALLBACK` exposed | `src/lib/server/env.server.ts` | Operators can probe both routes; defaults to direct `:5432` |
| `qdrant_cluster_members` mirror script | `scripts/mirror-qdrant-clusters-to-postgres.mjs` (NEW) | 36,069 rows / 397 distinct clusters populated from Qdrant payloads |
| `gpu:` namespace fix in cluster backfill | `scripts/wiki/backfill-qdrant-cluster-keys.mjs` | Top 5 clusters now keyed `gpu:50/21/35/5/72` instead of malformed `:50/:21/...` |
| TRACE MCP smoke harness | `scripts/smoke-trace-mcp-tools.mjs` (NEW) | Sweeps all 34 tools with safe inputs, writes JSON + MD report |
| AGENTS.md write safeguards | `scripts/generate-agents-md.mjs` | Size-shrink guard (refuses if new <50% of existing), `.bak` on >2KB delta, fail-closed on read error, `--force` to bypass |
| AGENTS.md pipeline npm scripts | `package.json` | `agents:pipeline`, `agents:pipeline:dry`, `agents:pipeline:safe`, `agents:write:force` |

## 🟡 Outstanding (data-pop, requires services)

| Item | Command | Notes |
|------|---------|-------|
| `bow_tiles: 0` | `npm run graphify:bow-tiles` | Long pipeline; run in separate session |
| Re-run authority chain after gpu: rename | `npm run graphify:authority` | Authority scores were computed against malformed keys; re-run for accuracy |
| Re-run agents:write with safeguards | `npm run agents:pipeline:safe` | Validates new shrink-guard with dry-run preflight |

## Pipeline — `agents:pipeline*` (NEW)

Three variants for agents.md regen, in increasing safety/cost:

```
agents:pipeline       — write → enrich → index → smoke (default)
agents:pipeline:dry   — write:dry → enrich:dry → ingest:dry (no writes anywhere)
agents:pipeline:safe  — write:dry preflight → write → enrich → index → smoke
```

**`agents:pipeline:safe` is the recommended default for routine regen.** It runs
the dry-run first so any issue (missing graph JSON, Redis down, malformed KAG
notes) surfaces before any file is written.

### Safeguards in `generate-agents-md.mjs`

| Safeguard | Behavior | Bypass |
|-----------|----------|--------|
| Human-edit preservation | Files with no `<!-- AGENTS-GEN v1 -->` marker are skipped entirely | Cannot bypass — by design |
| Enrichment block preservation | Content between H1 and the GEN marker is spliced into new file | Always on |
| Read-error fail-closed | Unreadable existing files are skipped, NOT silently overwritten | `--force` |
| Size-shrink guard | Refuses to write when new content < 50% of existing (>1KB) | `--force` |
| Backup on big change | Writes `<file>.bak` when `|new − existing|` > 2 KB | Always on |

### Smoke commands (sanity check after pipeline)

```bash
node scripts/smoke-trace-mcp-tools.mjs                  # 34 MCP tools
node scripts/smoke-neo4j-graph-enrich.mjs               # 10 GDS gates
node scripts/tests/nes-arch/inspect-agents-md.mjs --strict   # AGENTS.md validation
```

## Final state at session end

- 10/10 GDS smoke gates PASS (Neo4j GDS plugin v2.13.7 + 2,772 PageRank-scored nodes)
- 34/34 TRACE MCP tools PASS, 0 internal errors
- pgvector v0.8.1 reachable through proxy port 5434
- 36,069 `qdrant_cluster_members` rows, 397 distinct clusters with proper `gpu:N` namespacing
