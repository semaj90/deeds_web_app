# MCP TRACE Hardening + Topology Ontology Session — 2026-05-08

> Session work log. File paths are repo-relative. Verification commands run
> from `sveltekit-frontend/` unless otherwise noted.

## Outcome

- 47/47 health gates green (`node scripts/check-all-tools.mjs`)
- 0 svelte-check errors
- 9 commits landed; pipeline data refreshed; ontology persisted

## Commits (chronological)

| Commit | Subject | Files |
|---|---|---|
| `c813f2cf60` | fix(hardening): add AbortSignal.timeout to fetch calls across UI | 49 |
| `259f7271ef` | fix(mcp): clear P0 schema drift in trace-mcp-server tool handlers | 3 |
| `3866c35dbc` | perf(mcp): Redis L1 embed cache for search.hybrid + search.dev_context | 1 |
| `4f9b2ac435` | fix(graphify:gds): synthesise PageRank from Postgres fan-in when GDS empty | 1 |
| `52b25a6262` | fix(agents): enrich-agents-md data freshness warning + timestamp TODO | 2 |
| `fb4f0c9f8c` | fix(health): GRPO gate walks runs newest-first instead of trusting runs[0] | 1 |
| `ec7ad06019` | fix(mcp): graph.community_for_node returns real communityId | 1 |
| `3053e25ea9` | feat(taxonomy): ontological 5-level hierarchy over topology data store | 4 |

## P0 — Schema Drift (cleared)

Audit (`memory/runs/2026-05-07T23-01-22/mcp-tool-audit-analysis.md`) flagged:

| Tool | Error | Fix |
|---|---|---|
| `topology.same_som_cluster` | `column "stable_key" does not exist` | Query `qdrant_id OR relative_path` on `codebase_chunk_index` |
| `clusters.get_members` | same | Switch to `qdrant_cluster_members` (real cluster→file map) |
| `trace.validate_ace_hit` | `code_relations.from_file` missing | Use `source_file` + `target_key LIKE 'file:'` |
| `ops.record_fix_attempt` | `relation "fix_attempts" does not exist` | Migration `drizzle/manual/20260507_fix_attempts.sql` |
| `hypergraph.explain_activation` | `Cannot find package '$env'` | `env.server.ts` already pre-rewritten to `process.env` |

Verify:
```bash
curl -sS -X POST http://127.0.0.1:8788/mcp \
  -H "Content-Type: application/json" \
  -H "Accept: application/json, text/event-stream" \
  -d '{"jsonrpc":"2.0","id":1,"method":"tools/call",
       "params":{"name":"topology.same_som_cluster",
                 "arguments":{"stableKey":"src/lib/server/ace/context-assembler.ts","limit":3}}}'
```

## P1 — Performance + Robustness

### Redis L1 embed cache (commit 3866c35dbc)

**Where**: `src/mcp/trace-mcp-server.ts` — new `getOrComputeEmbedding(query)` helper.

**Behavior**: MD5(query) → `embed:mcp:<hash>` Redis key, 1h TTL.
- Cold call: ~3s (embeddinggemma)
- Warm call: <5ms; response now reports `embed_cache_hit: boolean`
- Wired into `search.hybrid` and `search.dev_context`

Verify:
```bash
Q="ACE context assembler"
curl -sS -X POST http://127.0.0.1:8788/mcp -H "Content-Type: application/json" \
  -H "Accept: application/json, text/event-stream" \
  -d "{\"jsonrpc\":\"2.0\",\"id\":1,\"method\":\"tools/call\",\"params\":{\"name\":\"search.hybrid\",\"arguments\":{\"query\":\"$Q\",\"limit\":3}}}" \
  | grep -oE '"embed_cache_hit":[a-z]+'
# Run twice — first false, second true
```

### GDS PageRank fallback (commit 4f9b2ac435)

**Where**: `scripts/neo4j-graph-enrich.mjs` — new `writeFanInPagerankToNeo4j()`.

**Behavior**: When `runPageRank()` returns 0 rows (no GDS plugin OR empty
projection), the fallback synthesises `n.graphPageRank` from
`log1p(fanIn) / log1p(maxFanIn)` and writes back to Neo4j with
`n.pagerankSource = 'postgres-fan-in'` so downstream code can tell synthetic
from real.

Currently dormant (GDS works — 2772 nodes scored). Fires when GDS plugin
disappears.

### graph.community_for_node fix (commit ec7ad06019)

**Where**: `src/mcp/trace-mcp-server.ts`.

**Before**: Matched on non-existent `n.stableKey` property → returned only
`stableKey` echo.

**After**: Matches on `n.filePath` OR `n.id` against a candidate list
(input + stripped `file:` prefix + with/without `src/` prefix). Returns
`communityId`, `gpuCluster`, `clusterKey`, `filePath`.

Verified against live Neo4j: `src/lib/server/db/schema-postgres.ts` →
`communityId: 494`. **Needs MCP restart** to take effect (server runs
plain `tsx`, no `--watch`).

## P2 — Data Freshness

| Source | Before | After | Command |
|---|---|---|---|
| `texture:bow:*` Redis | 0 | 3,543 | `npm run graphify:bow-tiles` |
| Hypergraph centroids | stale | 100 clusters from 32,753 vectors | `npm run hypergraph:build:redis && npm run hypergraph:digest` |
| Qdrant `cluster_key` payload | partial | 7,073 patched (idempotent) | `npm run qdrant:backfill-cluster-keys` |

Note: `hypergraph_edges` Postgres table remains empty by design — no
production seeder writes to it (only `scripts/smoke-hypergraph-rag.mjs`).
This is a missing feature, not stale data. `hypergraph.search` returns 0
until that seeder is built.

## Topological Ontology (commit 3053e25ea9)

**Schema**: `drizzle/manual/20260507_topology_taxonomy.sql`
**Builder**: `scripts/build-topology-taxonomy.mjs` · `npm run taxonomy:build`

5-level hierarchy:

```
L0 root            1
L1 topo_class      8     (api-route, ui-component, database-schema, …)
L2 topo_byte      43     (bit-flag variants within each class)
L3 cluster       475     (gpu:N or dir:path)
L4 file        5,000     (top by graph_authority_score)
─────────────────────
Total nodes  5,527
Total edges 62,802
  IS_A          5,008
  PART_OF      57,751
  INHERITS_FROM    43
```

**Redis cache**: `taxonomy:children:<parent_key>` (24h TTL) + `taxonomy:meta`.

**MCP tools** (queued for next MCP restart):
- `taxonomy.children(parent_key, limit)` — one-level drill-down, Redis
  read-through
- `taxonomy.path(node_key)` — recursive walk-up from leaf to root

Sample drill-down:
```sql
SELECT display_name, member_count
FROM taxonomy_nodes
WHERE parent_key = 'topo:api-route'
ORDER BY member_count DESC;
-- api-route/0x82  992 files
-- api-route/0xb2   37
-- api-route/0x92   19
```

## Pipeline Safeguards (already landed)

`scripts/generate-agents-md.mjs`:

| Safeguard | Trigger | Bypass |
|---|---|---|
| Human-edit preservation | No `<!-- AGENTS-GEN v1 -->` marker → skip | Cannot bypass (by design) |
| Enrichment block preservation | Content between H1 and GEN marker spliced into new file | Always on |
| Read-error fail-closed | Unreadable file → skip + log, never silently overwrite | `--force` |
| Size-shrink guard | New < 50% of existing (>1KB) → refuse | `--force` |
| Backup on big change | `|new − existing| > 2KB` → write `.bak` first | Always on |

npm scripts:
- `agents:pipeline` — write → enrich → index → smoke
- `agents:pipeline:dry` — all dry-run
- `agents:pipeline:safe` — dry-run preflight → real run (recommended default)
- `agents:write:force` — bypass safeguards (use only after verifying via :dry)

## VS Code Auto-Start (already landed)

`.vscode/tasks.json` runs on `folderOpen`:
- `🤖 Startup: TRACE MCP Server (:8788)` — detached, idempotent
- `🚀 Start TurboQuant` — detached, q8_0 KV cache
- `🩺 Startup: Service Health Check` — Redis/Qdrant/Ollama/Postgres/etc.
- `🗺️ Startup: Auto-Map Codebase (graphify:daily)` — incremental graph refresh
- `📝 Startup: AGENTS.md Pipeline (write→enrich→index→smoke)` — runs
  `agents:pipeline:safe` with 6h cooldown via `logs/task-output/.agents-pipeline-last-run`

## Pipeline Test Logs

All test runs preserved in `logs/task-output/pipeline-test/`:
- `01-backfill-cluster-keys-dry.log` (dry-run preflight)
- `02-backfill-cluster-keys.log` (7,073 patched, 19s)
- `03-topology-validate.log` (3,467 files, 100% coverage)
- `04-build-taxonomy.log` (5,527 nodes, 62,802 edges, 6s)

## Known Gaps (not addressed this session)

1. **`hypergraph_edges` empty** — needs production seeder (currently only smoke)
2. **MCP `tsx` lacks `--watch`** — code edits land in file but require manual
   restart to take effect. The startup task uses `npm run mcp:ensure` which
   is idempotent (won't double-start) but doesn't auto-reload on edits.
3. **`graph.shortest_path` slow + sparse** — 9.9s per call; needs Cypher
   index hint or pre-computed shortest-path table.
4. **`tools/batch_call` registered but unverified** — audit listed it as a
   "concurrent parallelism win". It's in `tools/list` output; its
   `Promise.allSettled` fan-out hasn't been timing-benchmarked.

## Next Agent

To pick up where this session ended:

```bash
# Verify everything still healthy
cd sveltekit-frontend
node scripts/check-all-tools.mjs        # 47/47 PASS
npx svelte-check --threshold error      # 0 errors

# Re-validate the topology + taxonomy
npm run topology:validate
npm run taxonomy:build:dry              # idempotent — should match counts above

# Restart MCP if you need community_for_node + taxonomy.* live
# (MCP runs plain tsx, no --watch)
```
