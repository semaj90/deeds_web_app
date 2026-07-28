# Active vs Orphaned Pipeline Scripts Analysis

**Date**: July 28, 2026  
**Scope**: Daily graphify pipeline + parent atlas tooling  
**Status**: Inventory complete, cleanup recommendations pending

---

## Core Daily Pipeline (Actively Used)

### Critical Path Scripts (Stage 0-3)
These execute in the `npm run graphify:daily` pipeline:

| Script | Stage | Purpose | Status | Notes |
|--------|-------|---------|--------|-------|
| `graphify:validate` | 0 | Service health check | ✅ ACTIVE | Validates Postgres, Redis, Qdrant, Ollama, Gemma4 |
| `graphify:materialize:apply` | 1 | Materialize addressable packets | ⏳ PENDING | Database tables missing (P2 deferred) |
| `daily-graphify-cold-processing.mjs` | 1b | Cold processing pipeline | ✅ ACTIVE | Unused in current pipeline (orphaned) |
| `atlas:phase8:fanout:apply` | 2 | Neo4j fanout | ⏳ PENDING | Called but not verified working |
| `atlas:qdrant:tag-mirror:apply` | 3 | Qdrant tag sync | ⏳ PENDING | Called but not verified working |

### Active Infrastructure Scripts
Called by daily pipeline or startup:

| Script | Purpose | Status | Used By |
|--------|---------|--------|---------|
| `prewarm-compact-cache.mjs` | Redis 384d cache warm | ✅ ACTIVE | `npm run graphify:ace:warm` |
| `backfill-redis-cache-from-postgres.mjs` | Redis cache backfill | ✅ ACTIVE | `npm run graphify:redis:import` |
| `graphify-kag-notes-missing.mjs` | KAG directory summaries | ✅ WIRED | `npm run graphify:kag:notes:missing` |
| `graphify-cluster-pagerank.mjs` | Cluster authority scoring | ⏳ READY | `npm run graphify:cluster:pagerank` |
| `graphify-semantic-cluster.mjs` | GPU k-means clustering | ⏳ READY | `npm run graphify:semantic` |

---

## Inactive/Orphaned Scripts (Not in Daily Pipeline)

### Category 1: Research & Experimentation (330+ scripts)
Not called by any npm script alias. Historical artifacts from phases 1-17:

**Count**: ~330 scripts
**Examples**:
- `phase-X-*.mjs` (1-19 — historical phase scaffolding)
- `audit-*.mjs` (50+ audit scripts)
- `backfill-*.mjs` (70+ backfill scripts)
- `train-*.mjs` (SOM/AE training)
- `benchmark-*.mjs`, `correlation-*.mjs`, `eval-*.mjs`

**Status**: ⚠️ RESEARCH ONLY — not executed by production pipeline
**Action**: Archive to `deeds_labs/orphaned-scripts/` if unused for 2+ weeks

### Category 2: Partially Wired (20+ scripts)
Called by npm scripts but marked as P1/P2 or experimental:

| Script | Status | Why Orphaned |
|--------|--------|--------------|
| `daily-graphify-cold-processing.mjs` | ⏳ PENDING | Called but executes no-op (table mismatch) |
| `graphify-authority.mjs` | ⚠️ BROKEN | Uses old Redis URL pattern |
| `graphify-neo4j-clusters.mjs` | ⚠️ BROKEN | Uses old Redis URL pattern |
| `graphify-persist-couchdb.mjs` | ⚠️ BROKEN | Uses old Redis URL pattern |
| `graphify-som-cluster-summaries.mjs` | ⚠️ BROKEN | Uses old Redis URL pattern |
| `graphify-som-topology.mjs` | ⚠️ BROKEN | Uses old Redis URL pattern |
| `graphify-deep-imports.mjs` | ⚠️ BROKEN | Uses old Redis URL pattern |

**Action**: Migrate to shared Redis factory (1 hour total)

---

## What's Actually Running Right Now

Based on testing (July 28, 2026):

```
npm run graphify:daily
├─ npm run graphify:validate ✅ PASS
│  └─ All 5 critical services online
├─ npm run graphify:materialize:apply ⏳ BLOCKED
│  └─ DATABASE_TABLES_NOT_FOUND (atlas_higher_hop_index, atlas_codebase_packets)
├─ node ../scripts/atlas/daily-graphify-cold-processing.mjs ✅ RUNS
│  └─ Executes but no-op (tables missing)
├─ npm run atlas:phase8:fanout:apply ❌ NOT TESTED
└─ npm run atlas:qdrant:tag-mirror:apply ❌ NOT TESTED

npm run graphify:ace:warm ✅ PASS
└─ Uses new shared Redis factory

npm run graphify:redis:import:dry ✅ PASS
└─ Cached 5000 packets in 3.7s

npm run graphify:kag:notes:missing:dry ✅ PASS
└─ Found 1122 directories (CouchDB auth needed for write)

npm run graphify:semantic ⏳ TIMEOUT
└─ Script executing (Qdrant slow on heavy computation)
```

---

## Recommended Cleanup Actions

### P0: Fix Broken Scripts (1 hour)
Migrate 7 broken graphify scripts to use `createAtlasRedisClient()`:
- graphify-authority.mjs
- graphify-deep-imports.mjs
- graphify-neo4j-clusters.mjs
- graphify-persist-couchdb.mjs
- graphify-som-cluster-summaries.mjs
- graphify-som-topology.mjs

**Command pattern**:
```javascript
// OLD
const redis = new Redis('redis://127.0.0.1:6379', { password: ... });

// NEW
import { createAtlasRedisClient } from './lib/redis-client-factory.mjs';
const redis = createAtlasRedisClient();
await redis.connect();
```

### P1: Database Schema Completion (4 hours)
Create missing tables for materialize stage:
- `atlas_higher_hop_index`
- `atlas_codebase_packets`
- `atlas_feature_packets`

**Status**: Deferred (blocks materialization stage but not critical path)

### P2: Archive Dead Research Scripts (30 min)
Move 330+ research scripts to cold storage:
```bash
mkdir -p deeds_labs/orphaned-scripts/phases-1-19
mkdir -p deeds_labs/orphaned-scripts/audit-tools
mkdir -p deeds_labs/orphaned-scripts/training-tools

git mv scripts/atlas/phase-*-*.mjs deeds_labs/orphaned-scripts/phases-1-19/
git mv scripts/atlas/audit-*.mjs deeds_labs/orphaned-scripts/audit-tools/
git mv scripts/atlas/train-*.mjs deeds_labs/orphaned-scripts/training-tools/
git mv scripts/atlas/benchmark-*.mjs deeds_labs/orphaned-scripts/benchmarks/
```

### P3: MCP Tool Registration (1 hour)
Wire up the new `mcp-embedding-keywords-tool.mjs` into Parent Atlas:
- Register with MCP server
- Test keyword extraction from sample packet
- Test cluster tag derivation

---

## Script Inventory by Category

### Infrastructure & Pipeline (35 scripts) — KEEP
- `prewarm-compact-cache.mjs` ✅
- `backfill-redis-cache-from-postgres.mjs` ✅
- `graphify-kag-notes-missing.mjs` ✅
- `graphify-cluster-pagerank.mjs` ⏳
- `graphify-semantic-cluster.mjs` ⏳
- 30+ helper/utility scripts

### Research & Audit (330 scripts) — ARCHIVE
- Phase 1-19 scaffolding
- Audit tools (50+)
- Training/benchmarking (40+)
- Historical reconciliation scripts

### Broken (7 scripts) — FIX
- 7 scripts using old Redis URL pattern (migrate in 1 hour)

---

## File Counts by Location

**scripts/atlas/**: 438 files
- Active: ~35 (8%)
- Research: ~330 (75%)
- Broken: ~7 (2%)
- Utility: ~66 (15%)

**sveltekit-frontend/scripts/**: 142 files
- Active: ~8 (6%)
- Research: ~120 (85%)
- Broken: ~2 (1%)
- Utility: ~12 (8%)

**Total inventory**: 580 scripts (438 + 142)
**Active**: 43 (7%)
**Archivable**: 450 (78%)
**To fix**: 9 (2%)

---

## New Tool: MCP Embedding Keywords

**File**: `scripts/atlas/lib/mcp-embedding-keywords-tool.mjs`

**Exports**:
- `deriveKeywordsFromEmbedding(embedding, topK)` — Extract keywords from 768-dim embedding
- `findSemanticNeighbors(embedding, limit)` — Agentic dense search via Qdrant
- `deriveClusterTags(embedding)` — Assign SOM/cluster tags
- `deriveAllTagsForPacket(params)` — Comprehensive tag derivation
- `mcpToolDefinition` — MCP schema for agentic tool calling

**Dependencies**:
- `redis-client-factory.mjs` (shared Redis client)
- Cached keyword centroids in Redis (`gpu:karpathy:keywords:*`)
- Cached SOM centroids in Redis (`som:centroid:*`)
- Qdrant collection `codebase_chunks_768` for neighbor search

**Status**: ✅ WIRED (ready for MCP registration)

---

## Next Steps

**Now** (30 min):
1. ✅ Create inventory of active vs orphaned scripts
2. ✅ Wire MCP embedding tool
3. ⏳ Commit changes

**This week** (P0 — 1 hour):
4. Migrate 7 broken scripts to shared Redis factory
5. Test full daily pipeline end-to-end

**Next week** (P1 — 4 hours):
6. Create missing database tables for materialize stage
7. Verify neo4j fanout + qdrant tag-mirror stages

**Later** (P2 — 30 min):
8. Archive 330+ research scripts to `deeds_labs/orphaned-scripts/`

---

## References

- **Shared Factory**: `scripts/atlas/lib/redis-client-factory.mjs`
- **MCP Tool**: `scripts/atlas/lib/mcp-embedding-keywords-tool.mjs`
- **Pipeline Config**: `sveltekit-frontend/package.json` (graphify:* aliases)
- **Policy**: Session 146 Redis factory + vector lane registry
