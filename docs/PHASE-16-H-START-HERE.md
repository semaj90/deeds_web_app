# Phase 16-H — START HERE

**Status**: All 9 scripts created and ready to execute  
**Date**: June 15, 2026  
**Target**: Complete semantic bridge in 165 min (or 105 min with parallelization)

---

## What Problem Are We Solving?

**The Disconnect**: Qdrant returns vectors, but HyperRAG cannot answer "what packet is this?" or "what's its topology?"

**The Solution**: Build `atlas_higher_hop_index` — a derived join table that connects:
- Qdrant hit → packet_key (via qdrant_point_id reverse lookup)
- packet_key → file_path, tree_node, community (via identity spine)
- packet_key → Neo4j node + pagerank (via topology bridge)
- packet_key → SOM cluster (via SOM topology, once trained)
- packet_key → Redis cache (via bifrost/karpathy discovery)

**Result**: HyperRAG can rerank using topology, authority, cache, and community context.

---

## Pre-Flight Checklist

### Required Services ✅
```bash
# Verify all are running:
docker ps | grep -E "postgres|qdrant|redis|neo4j"

# Expected output: 4 containers running
# - legal-ai-postgres (port 5434)
# - legal-ai-qdrant (port 6333)
# - legal-ai-redis-* (port 6379)
# - legal-ai-neo4j* (port 7687/7474)
```

### Data Requirements ✅
- ✅ Postgres `atlas_packets`: 3,251 rows (identity spine)
- ✅ Postgres `atlas_tree_nodes`: 8,823 rows (tree topology)
- ✅ Qdrant `codebase_chunks_768`: 52,606 points (dense vectors)
- ✅ Neo4j `:Packet` nodes: 3,251 nodes (if GDS metrics computed)

### .env Variables ✅
```bash
# Required:
DATABASE_URL=postgresql://...
QDRANT_URL=http://127.0.0.1:6333
NEO4J_URI=neo4j://127.0.0.1:7687
NEO4J_USER=neo4j
NEO4J_PASSWORD=password
REDIS_HOST=localhost
REDIS_PORT=6379
```

---

## Execution Steps

### Option 1: Sequential (Conservative, ~165 min)

```bash
# Step 1: Create bridge table + identity spine (20 min)
node scripts/atlas/phase-16-h-schema-backfill.mjs

# Step 2: Discover Qdrant points (20 min)
node scripts/atlas/phase-16-h-qdrant-discovery.mjs

# Step 3: Canonicalize Qdrant payloads (30 min)
node scripts/atlas/phase-16-h-qdrant-payload-sync.mjs

# Step 4: Link Neo4j topology (30 min)
node scripts/atlas/phase-16-h-neo4j-bridge.mjs

# Step 5: Final verification (5 min)
node scripts/atlas/phase-16-h-verify-bridges.mjs
```

**Total: 105 min critical path only**

---

### Option 2: Parallel (Aggressive, ~105 min)

**Terminal 1 - Critical Path** (105 min):
```bash
node scripts/atlas/phase-16-h-schema-backfill.mjs      # 20 min

# WAIT FOR COMPLETION, then:
node scripts/atlas/phase-16-h-qdrant-discovery.mjs     # 20 min

# WAIT FOR COMPLETION, then:
node scripts/atlas/phase-16-h-qdrant-payload-sync.mjs  # 30 min

# WAIT FOR COMPLETION, then:
node scripts/atlas/phase-16-h-neo4j-bridge.mjs         # 30 min

# WAIT FOR COMPLETION, then:
node scripts/atlas/phase-16-h-verify-bridges.mjs       # 5 min
```

**Terminal 2 - Parallel Lanes** (run after H.1 completes, ~60 min total):
```bash
# Wait for terminal 1 to finish H.1 (~3 min), then start:
node scripts/atlas/phase-16-h-file-path-repair.mjs     # 10 min
node scripts/atlas/phase-16-h-som-repair.mjs           # 15 min
node scripts/atlas/phase-16-h-redis-discovery.mjs      # 25 min
node scripts/atlas/phase-16-h-glyph-bridge.mjs         # 10 min
```

**Terminal 3 - Optional Neo4j Early** (run after H.1 completes, during H.4-H.5):
```bash
# Wait for terminal 1 to finish H.1 (~3 min), then start:
# (This can run in parallel with H.4-H.5 from terminal 1)
# But currently terminal 1 is blocking, so skip this for now
```

---

## What Each Script Does (Quick Reference)

| # | Script | Purpose | Time | Blocker |
|---|--------|---------|------|---------|
| H.1 | `schema-backfill` | Create bridge table + identity spine | 20 | None |
| H.2 | `file-path-repair` | Sync file_path from Postgres | 10 | H.1 |
| H.3 | `som-repair` | Link SOM topology | 15 | H.1 |
| H.4 | `qdrant-discovery` | Reverse lookup: point → packet | 20 | H.1 |
| H.5 | `qdrant-payload-sync` | Canonicalize Qdrant payloads | 30 | H.4 |
| H.6 | `redis-discovery` | Link Redis cache keys | 25 | H.1 |
| H.7 | `neo4j-bridge` | Link Neo4j nodes + centrality | 30 | H.1 |
| H.8 | `glyph-bridge` | Link glyph records | 10 | H.1 |
| H.9 | `verify-bridges` | Final audit + repair status | 5 | H.1,H.4,H.7 |

---

## Success Criteria

After H.9 completes, verify:

```bash
# 1. Bridge table exists with 3,251 rows
docker exec legal-ai-postgres psql -U legal_admin -d legal_ai_db -c \
  "SELECT COUNT(*) FROM atlas_higher_hop_index;"
# Expected: 3251

# 2. Identity spine is complete
docker exec legal-ai-postgres psql -U legal_admin -d legal_ai_db -c \
  "SELECT COUNT(*) FROM atlas_higher_hop_index WHERE packet_key IS NOT NULL;"
# Expected: 3251

# 3. Qdrant discovery successful
docker exec legal-ai-postgres psql -U legal_admin -d legal_ai_db -c \
  "SELECT COUNT(*) FROM atlas_higher_hop_index WHERE qdrant_point_id IS NOT NULL;"
# Expected: ≥3088 (≥95%)

# 4. Neo4j bridge complete
docker exec legal-ai-postgres psql -U legal_admin -d legal_ai_db -c \
  "SELECT COUNT(*) FROM atlas_higher_hop_index WHERE neo4j_node_id IS NOT NULL;"
# Expected: ≥2600 (≥80%)

# 5. Repair status distribution
docker exec legal-ai-postgres psql -U legal_admin -d legal_ai_db -c \
  "SELECT repair_status, COUNT(*) FROM atlas_higher_hop_index GROUP BY repair_status;"
# Expected: verified ≥2500, partial 400-700, pending <100
```

---

## Troubleshooting

### "relation atlas_higher_hop_index does not exist"
**Cause**: H.1 failed  
**Fix**: Re-run H.1, check full output:
```bash
node scripts/atlas/phase-16-h-schema-backfill.mjs 2>&1 | tee /tmp/h1.log
tail -50 /tmp/h1.log
```

### "qdrant_point_id coverage 0%"
**Cause**: Expected before H.5 (Qdrant payloads missing packet_key)  
**Fix**: This is normal. After H.5 runs, coverage will jump to 95%+

### "neo4j_node_id coverage 40%"
**Cause**: Some packets don't have Neo4j nodes (expected)  
**Fix**: This is acceptable. Verify pagerank exists:
```bash
docker exec legal-ai-postgres psql -U legal_admin -d legal_ai_db -c \
  "SELECT COUNT(*) FROM atlas_higher_hop_index WHERE neo4j_pagerank IS NOT NULL;"
```

### Script hangs or timeout
**Cause**: Qdrant/Neo4j slow response (especially for H.4, H.5, H.7)  
**Fix**: These scripts fetch large amounts of data. Wait or increase timeout:
- H.4 (fetch 52k Qdrant points): may take 5-10 min
- H.5 (upsert 52k points): may take 15-20 min
- H.7 (fetch 3k Neo4j nodes): usually <2 min

---

## Next Steps After Phase 16-H

1. **SOM Training** (if not done):
   ```bash
   node scripts/atlas/train-som-20x20.mjs
   # Then re-run H.3 to populate som_cluster
   ```

2. **Test Retrieval**:
   ```bash
   npm run atlas:retrieval:e2e
   # Verify: Qdrant → atlas_higher_hop_index → HyperRAG rerank
   ```

3. **Phase 16-I** (Domain Ontology):
   - Create `atlas_domain_ontology` table
   - Link packets to ontology domains
   - Wire domain filter into retrieval

---

## Files Reference

**Scripts** (all in `scripts/atlas/`):
- `phase-16-h-schema-backfill.mjs` (280 lines)
- `phase-16-h-file-path-repair.mjs` (150 lines)
- `phase-16-h-som-repair.mjs` (130 lines)
- `phase-16-h-qdrant-discovery.mjs` (220 lines)
- `phase-16-h-qdrant-payload-sync.mjs` (250 lines)
- `phase-16-h-redis-discovery.mjs` (200 lines)
- `phase-16-h-neo4j-bridge.mjs` (240 lines)
- `phase-16-h-glyph-bridge.mjs` (150 lines)
- `phase-16-h-verify-bridges.mjs` (380 lines)

**Documentation** (all in `docs/`):
- `PHASE-16-H-START-HERE.md` (this file)
- `PHASE-16-H-HIGHER-HOP-SEMANTIC-BRIDGE.md` (architecture)
- `PHASE-16-H-EXECUTION-GUIDE.md` (step-by-step)
- `PHASE-16-H-SCRIPTS-CREATED.md` (summary)

---

## Ready to Start?

```bash
# Run this first:
node scripts/atlas/phase-16-h-schema-backfill.mjs
```

**Estimated completion**: ~3 hours (105 min critical path)

**Owner**: Phase 16-H Semantic Bridge Repair  
**Status**: ✅ Ready to execute  
**Next**: Run H.1 script above

---

**Questions?** See `PHASE-16-H-EXECUTION-GUIDE.md` for detailed step-by-step instructions.
