# MCP Server Health — Agentic Flow Report

**Generated**: 2026-06-15  
**TRACE MCP URL**: http://127.0.0.1:8788  
**Tools registered**: 128 across 28 namespaces

---

## Status Table

| Component | Status | Notes |
|-----------|--------|-------|
| Workflow engine (`agentic-recommendation-workflow.mjs`) | PASS | Syntax clean; `--verbose` flag works; 3 MCP calls fire correctly |
| MCP tool schemas | PASS | All 3 target tools present with correct inputSchema |
| Packet transport | PASS | `atlas.packet_search` SQL bug fixed; returns `{count:0,packets:[]}` cleanly (no DB error) |
| Retrieval benchmark | PASS WITH WARNINGS | Tools respond correctly but return 0 identity hits — data gap, not code bug |
| Smoke tests (`smoke-atlas-tools-mcp.mjs`) | PASS | 10/10 checks pass |
| L2 identity gap | BLOCKED | `atlas_packets` is empty; `scripts/atlas/*` not in any search index |

---

## MCP Health

```
GET http://127.0.0.1:8788/health
→ {"ok":true,"version":"1.0.0","uptime":964.0}
```

Server is up and healthy. 128 tools registered.

---

## Tool Schema Table

| Tool | Required Args | Key Optional Args |
|------|--------------|-------------------|
| `atlas.source_refs` | `query` (string) | `path`, `limit` (default 4), `activityLimit`, `includeCommunity`, `includeNotecards`, `includeAgentsMd` |
| `kag.feature_lookup` | `featureName` (string) | `role` (all/primary/consumer/test/type), `limit` (default 8) |
| `atlas.packet_search` | _(none required)_ | `source_ref`, `feature_id`, `concept_id`, `summary_query`, `limit` (default 20) |

---

## Test Query Results

### Query 1 — `atlas.source_refs`

**Args**: `{query: "scripts/atlas/backfill-higher-hop-enrichment.mjs", limit: 3}`

**Raw response**:
```json
{
  "query": "scripts/atlas/backfill-higher-hop-enrichment.mjs",
  "sourceRefs": [
    "C:\\Users\\james\\Videos\\deeds-web-app\\sveltekit-frontend\\logs\\activity\\user.activity.jsonl",
    "sveltekit-frontend/AGENTS.md",
    "scripts/wiki/backfill-error-fingerprints.mjs",
    "scripts/atlas/build-error-fix-dag.mjs",
    "scripts/atlas/build-rg-search-matrix.mjs"
  ],
  "confidence": 0.533,
  "retrieval_path": ["atlas.compact_context", "context.prefetch_feature_context", "directory-kag", "notecards", "source-refs"]
}
```

**Result**: 5 source refs returned, confidence 0.533. None is the exact target file. The tool is routing through `atlas.compact_context` → directory-kag fallback, not a direct identity lookup. `scripts/atlas/*` files are not in the compact context index.

---

### Query 2 — `kag.feature_lookup`

**Args**: `{featureName: "backfill-higher-hop-enrichment"}`

**Raw response**:
```json
{
  "ok": true,
  "query": "backfill-higher-hop-enrichment",
  "count": 0,
  "trustTier": "T1",
  "instructionAuthority": false,
  "results": []
}
```

**Result**: 0 hits. The `feature_implementations` and `feature_file_edges` tables (HyperRAG L9) have no entry for any `scripts/atlas/*` feature name.

---

### Query 3 — `atlas.packet_search`

**Args**: `{source_ref: "scripts/atlas/backfill-higher-hop-enrichment.mjs", limit: 3}`

**Raw response**:
```json
{
  "count": 0,
  "packets": [],
  "filters": {
    "source_ref": "scripts/atlas/backfill-higher-hop-enrichment.mjs"
  }
}
```

**Result**: 0 hits. The SQL bug is fixed (no more `column artifact_id does not exist` error). The response shape is correct. The table itself is empty — 0 rows in `atlas_packets`.

---

## `atlas.packet_search` Bug Fix

**Was**: SQL SELECT included `artifact_id` which does not exist in the `atlas_packets` table.

**Error**:
```
ERROR: column artifact_id does not exist
```

**Fix applied** (at `sveltekit-frontend/src/mcp/trace-mcp-server.ts` line 8079):  
The SELECT list was replaced from:
```sql
SELECT packet_id, artifact_id, source_ref, ...
```
to:
```sql
SELECT packet_id, packet_key, source_ref, feature_id, feature_label, community_id,
       concept_ids, cluster_id, summary, byte_start, byte_end, sha256, metadata,
       identity_lane, qdrant_point_id, reward_prior, created_at
```

The tool now returns `{count: 0, packets: []}` cleanly.

---

## Identity Hit / Miss Summary

| Tool | Hits | Misses |
|------|------|--------|
| `atlas.source_refs` | 0 (exact) | 1 |
| `kag.feature_lookup` | 0 | 1 |
| `atlas.packet_search` | 0 | 1 |
| **Total** | **0** | **3** |

**identity_hit_count**: 0  
**identity_miss_count**: 3

---

## Database State

| Table | Row Count | Notes |
|-------|-----------|-------|
| `atlas_packets` | **0** | Empty — source of all `atlas.packet_search` misses |
| `atlas_higher_hop_index` | **3,251** | Contains the data; not yet promoted to `atlas_packets` |

`atlas_higher_hop_index` has 3,251 rows but none with `source_ref LIKE '%scripts/atlas%'`. The scripts/atlas pipeline files have never been indexed.

---

## Next Indexing Work Required

- **Backfill `atlas_packets` from `atlas_higher_hop_index`** (3,251 rows ready) — until this runs, `atlas.packet_search` always returns `count:0` regardless of query
- **Index `scripts/atlas/*` source_refs** — none of the 3,251 higher_hop_index rows are from `scripts/atlas/*`; the pipeline scripts themselves are invisible to L2 identity tools
- **Populate `feature_implementations` + `feature_file_edges`** for atlas pipeline scripts so `kag.feature_lookup` returns results on feature names like `backfill-higher-hop-enrichment`
- **L2 identity hit rate will be 0%** for all three tools until the backfill runs and `scripts/atlas/*` files are ingested
