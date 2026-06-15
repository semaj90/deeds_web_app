# Phase 16-H — Execution Guide

**Created**: June 15, 2026  
**Status**: Ready to execute (9 scripts created)  
**Target**: 165 min (2.75 hours) to complete semantic bridge

---

## What Phase 16-H Fixes

**The Problem:**
- Qdrant returns vectors + scores, but cannot answer: "What packet is this?"
- Neo4j has the graph but isn't wired to dense retrieval
- HyperRAG tries to rerank but has no join path to topology handles

**The Solution:**
- Create `atlas_higher_hop_index` — a derived join/bridge table
- Populate it with reverse lookups from all topology surfaces
- Enable: Qdrant hit → packet identity → tree nodes → Neo4j → SOM → reranking

---

## Execution Timeline

```
H.1 (schema) ──────────────────────────────────────┐
  ├─ H.2 (file path)  ┌─ 10 min parallel ────────┐│
  ├─ H.3 (SOM)        │ (no dependencies)        ││
  ├─ H.6 (Redis)      │                          ││
  └─ H.8 (Glyph)      └──────────────────────────┤│
       ↓ (all done)                               ││
     H.4 (Qdrant discovery) ── 20 min ────────────┤│
       ↓ (must complete before H.5)               ││
     H.5 (Qdrant payload sync) ── 30 min ────────┤│
       ↓ (waits for H.4)                          ││
     H.7 (Neo4j bridge) ── 30 min ────────────────┤│
       ↓ (independent)                            ││
     H.9 (Verify) ── 5 min ────────────────────────┘│
       │                                            │
       └────────────────────────────────────────────┘

Critical path: H.1 → H.4 → H.5 → H.7 → H.9
              (20 + 20 + 30 + 30 + 5 = 105 min)

Parallel work (saves 60 min):
  H.2, H.3, H.6, H.8 run while H.1-H.5-H.7 execute
```

---

## Step-by-Step Execution

### Phase H.1 (20 min) — Schema + Identity Spine

```bash
node scripts/atlas/phase-16-h-schema-backfill.mjs
```

**What it does:**
1. Creates `atlas_higher_hop_index` table with 29 columns
2. Creates 12 indexes (BTrees, GIN, BRIN)
3. Backfills identity spine from `atlas_packets` (3,251 rows)
4. Links `tree_node_id` from `atlas_tree_nodes`

**Expected output:**
```
✅ Table created
✅ Created/verified 12 indexes
✅ Backfilled 3,251 identity spine rows
✅ Linked 2,100 tree_node_id references
✅ Audit Results: 3,251 total, 3,251 packet_key, 3,251 source_ref
```

**Gate checks:**
- ✅ `packet_key` 100% coverage
- ✅ `source_ref` ≥95% coverage
- ✅ `repair_status` = 'pending' for all rows

---

### Phase H.2 (10 min) — File Path Repair [PARALLEL after H.1]

```bash
node scripts/atlas/phase-16-h-file-path-repair.mjs
```

**What it does:**
1. Syncs `file_path` from `atlas_packets` where it exists (59% coverage)
2. Marks remaining rows as `partial` repair status

**Expected output:**
```
✅ Updated 1,919 file_path values from Postgres
✅ Coverage: 1,919/3,251 (59%)
```

---

### Phase H.3 (15 min) — SOM Repair [PARALLEL after H.1]

```bash
node scripts/atlas/phase-16-h-som-repair.mjs
```

**What it does:**
1. Pulls `som_cluster`, `som_x`, `som_y` from `atlas_topology_index` (if exists)
2. Falls back to marking as `pending_training` if not available

**Expected output:**
```
✅ Synced SOM data from atlas_topology_index
✅ som_cluster coverage: 0% (awaiting training) OR 100% (if trained)
```

---

### Phase H.4 (20 min) — Qdrant Discovery [MUST RUN after H.1]

```bash
node scripts/atlas/phase-16-h-qdrant-discovery.mjs
```

**What it does:**
1. Fetches all 52,606 points from Qdrant `codebase_chunks_768`
2. Finds matching `packet_key` in `atlas_higher_hop_index`
3. Populates `qdrant_point_id` (reverse lookup)

**Expected output:**
```
✅ Fetched 52,606 points from Qdrant
✅ Matched 3,100 packets to Qdrant points
⚠️  Missing packet_key in Qdrant payload: 49,506
ℹ️  Not found in atlas_higher_hop_index: 0
```

**Note:** The "missing packet_key" count is expected if Qdrant payloads haven't been canonicalized yet (H.5 fixes this).

**Gate:**
- ✅ `qdrant_point_id` ≥95% coverage (or ≥3,088 rows)

---

### Phase H.5 (30 min) — Qdrant Payload Sync [MUST RUN after H.4]

```bash
node scripts/atlas/phase-16-h-qdrant-payload-sync.mjs
```

**What it does:**
1. Reads all Qdrant points
2. Ensures canonical payload fields: `packet_key`, `source_ref`, `feature_id`, `file_path`, `som_cluster`, etc.
3. Upserts back to Qdrant

**Expected output:**
```
✅ Synced 52,606 points to canonical payload
✅ packet_key: 3,251/3,251 (100%)
✅ feature_id: 3,251/3,251 (100%)
✅ file_path: 1,919/3,251 (59%)
✅ som_cluster: 0/3,251 (pending SOM training)
```

**Gate:**
- ✅ `packet_key` 100% in Qdrant payloads
- ✅ `feature_id` 100% in Qdrant payloads

---

### Phase H.6 (25 min) — Redis Discovery [PARALLEL after H.1]

```bash
node scripts/atlas/phase-16-h-redis-discovery.mjs
```

**What it does:**
1. Queries Redis for `bifrost:sem:packet:*` keys
2. Queries Redis for `gpu:karpathy:scores` hash
3. Populates `bifrost_key`, `gpu_karpathy_key` in bridge table

**Expected output:**
```
✅ Bifrost keys discovered: 200-500 (subset of cached packets)
✅ GPU Karpathy keys discovered: 100-200 (subset)
ℹ️  Note: Uncached packets are expected to have NULL keys
```

---

### Phase H.7 (30 min) — Neo4j Bridge [MUST RUN after H.1, can run during H.4-H.5]

```bash
node scripts/atlas/phase-16-h-neo4j-bridge.mjs
```

**What it does:**
1. Queries all Neo4j `:Packet` nodes with `pagerank`, `betweenness`, `eigenvector`
2. Matches `packet_key` to `atlas_higher_hop_index`
3. Populates `neo4j_node_id` and centrality metrics

**Expected output:**
```
✅ Fetched 3,251 Packet nodes from Neo4j
✅ Linked 2,900 neo4j_node_id references (≥80%)
✅ PageRank stats: avg=0.0015, max=0.0850, min=0.0001
```

**Gate:**
- ✅ `neo4j_node_id` ≥80% coverage (2,600+ rows)
- ✅ `neo4j_pagerank` populated where node exists

---

### Phase H.8 (10 min) — Glyph Bridge [PARALLEL after H.1]

```bash
node scripts/atlas/phase-16-h-glyph-bridge.mjs
```

**What it does:**
1. Links to `atlas_svg_glyphs` by `packet_key` or `feature_id` match
2. Populates `glyph_record_id` and `glyph_render_type`

**Expected output:**
```
✅ Linked 100-300 glyph records (10-30% coverage)
ℹ️  Note: Low coverage expected (glyphs are on-demand, not exhaustive)
```

---

### Phase H.9 (5 min) — Final Verification [MUST RUN after H.1, H.4, H.7]

```bash
node scripts/atlas/phase-16-h-verify-bridges.mjs
```

**What it does:**
1. Runs 7 verification gates
2. Updates `repair_status` for all rows
3. Produces final report

**Expected output:**
```
✅ Gate 1 PASSED: packet_key 100%, source_ref 100%
✅ Gate 2 PASSED: Qdrant discovery ≥95% (3,088+ rows)
✅ Gate 3 PASSED: Neo4j bridge ≥80% (2,600+ rows)
✅ Gate 4 PASSED: File path coverage ≥50% (1,919+ rows)
⏳ Gate 5 INFO: SOM topology pending (0% - awaiting training)
ℹ️  Gate 6 INFO: Redis cache optional (subset cached)

Repair status distribution:
  verified: 2,500-2,800 (all core bridges linked)
  partial: 400-700 (some bridges missing)
  pending: 0-100 (no bridges yet)
```

---

## Parallel Execution Strategy (Saves 60 min)

**If you want to run this in ~105 min instead of 165 min:**

**Terminal 1 (Critical path):**
```bash
node scripts/atlas/phase-16-h-schema-backfill.mjs      # 20 min
# WAIT FOR COMPLETION
node scripts/atlas/phase-16-h-qdrant-discovery.mjs     # 20 min
# WAIT FOR COMPLETION
node scripts/atlas/phase-16-h-qdrant-payload-sync.mjs  # 30 min
# WAIT FOR COMPLETION
node scripts/atlas/phase-16-h-neo4j-bridge.mjs         # 30 min
# WAIT FOR COMPLETION
node scripts/atlas/phase-16-h-verify-bridges.mjs       # 5 min
```

**Terminal 2 (Run after H.1 starts, parallel to H.4-H.5-H.7):**
```bash
# Wait 2-3 min for H.1 to create table
node scripts/atlas/phase-16-h-file-path-repair.mjs     # 10 min
node scripts/atlas/phase-16-h-som-repair.mjs           # 15 min
node scripts/atlas/phase-16-h-redis-discovery.mjs      # 25 min
node scripts/atlas/phase-16-h-glyph-bridge.mjs         # 10 min
```

**Terminal 3 (Run after H.1 starts, during H.4-H.5):**
```bash
# Wait 2-3 min for H.1 to create table
node scripts/atlas/phase-16-h-neo4j-bridge.mjs         # 30 min
```

---

## Handling Issues

### Issue: "relation atlas_higher_hop_index does not exist"
**Cause:** H.1 script failed or didn't complete  
**Fix:** Run H.1 again with full output:
```bash
node scripts/atlas/phase-16-h-schema-backfill.mjs 2>&1 | tee /tmp/h1.log
```

### Issue: "qdrant_point_id coverage 0% — too low"
**Cause:** Qdrant payloads missing `packet_key` field  
**Fix:** This is expected until H.5 runs. After H.5, coverage should jump to 95%+

### Issue: "neo4j_node_id coverage 40% — below 80%"
**Cause:** Some packets don't have Neo4j `:Packet` nodes  
**Fix:** This is acceptable (some packets may be ephemeral). Verify pagerank metrics exist:
```bash
docker exec legal-ai-postgres psql -U legal_admin -d legal_ai_db -c "
SELECT COUNT(*) as with_pagerank, COUNT(*) as total
FROM atlas_higher_hop_index WHERE neo4j_pagerank IS NOT NULL;
"
```

### Issue: "file_path coverage 30% — below 50%"
**Cause:** Postgres `atlas_packets.file_path` missing on many rows  
**Fix:** This is expected if source data incomplete. Verify repair_status:
```bash
SELECT repair_status, COUNT(*) FROM atlas_higher_hop_index GROUP BY repair_status;
```
Rows with `partial` status are usable for reranking (just missing file path).

---

## Success Criteria (End of Phase 16-H)

```
✅ atlas_higher_hop_index exists with 3,251 rows
✅ Identity spine: 100% packet_key, 100% source_ref
✅ Qdrant discovery: ≥95% qdrant_point_id
✅ Qdrant payload: 100% packet_key, 100% feature_id
✅ Neo4j bridge: ≥80% neo4j_node_id, pagerank metrics
✅ File path: 59% file_path (or higher if enriched)
✅ Repair status: ≥2,500 'verified', 400-700 'partial', <100 'pending'

Result: HyperRAG can now:
  1. Take Qdrant hit
  2. Look up packet identity (packet_key, source_ref, feature_id)
  3. Fetch tree node, community, file path
  4. Rerank using Neo4j pagerank + tree community_id
  5. Cache via Redis for L1 future hits
  6. Route via SOM clusters (once SOM training complete)
```

---

## Next Steps After Phase 16-H

1. **SOM Training** (if not done):
   ```bash
   node scripts/atlas/train-som-20x20.mjs
   ```
   Then re-run H.3 (SOM repair) to populate `som_cluster`.

2. **H.5 Re-run** (after SOM training):
   ```bash
   node scripts/atlas/phase-16-h-qdrant-payload-sync.mjs
   ```
   This will backfill `som_cluster` tags into Qdrant payloads.

3. **Test Retrieval Pipeline**:
   ```bash
   npm run atlas:retrieval:e2e
   ```
   Verify: Qdrant → atlas_higher_hop_index → HyperRAG rerank produces correct ordering.

4. **Phase 16-I** (next lane): Domain Ontology + Higher-Hop Enrichment
   - Create `atlas_domain_ontology` table (legal domain tree)
   - Link packets to ontology domains
   - Wire domain filter into retrieval contract

---

**Start Phase 16-H Now:**

```bash
node scripts/atlas/phase-16-h-schema-backfill.mjs
```

Estimated completion: **2 hours 45 minutes** (165 min total, or 105 min with parallelization)

**Owner:** Phase 16-H Semantic Bridge Repair  
**Status:** Ready to execute  
**Target:** Complete by June 15, 2026 evening
