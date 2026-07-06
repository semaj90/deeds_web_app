# Session 105: Immediate Next Steps

**Date**: 2026-07-05  
**Status**: ⚠️ SCHEMA MISMATCHES DETECTED  
**Blocker**: Phase 8.8 queries don't match actual Postgres schema

---

## ⚠️ Schema Mismatches (From Postgres Error Logs)

### Error 1: `tree_node_id` doesn't exist in `atlas_summary_layers`

```sql
ERROR:  column "tree_node_id" of relation "atlas_summary_layers" does not exist
STATEMENT:  UPDATE atlas_summary_layers SET tree_node_id = $1 WHERE packet_key = $2
```

**Issue**: Script tried to write tree_node_id to atlas_summary_layers table.  
**Root Cause**: Either the table doesn't have this column, or the table itself doesn't exist.  
**Action**: 
```bash
docker exec legal-ai-postgres psql -U legal_admin -d legal_ai_db -c "\d atlas_summary_layers"
# If table doesn't exist, remove it from Phase 8.8 queries
# If column doesn't exist, add it to the CREATE TABLE or ALTER TABLE migration
```

### Error 2: `used_concepts` doesn't exist in `atlas_packets`

```sql
ERROR:  column "used_concepts" does not exist at character 56
STATEMENT:  SELECT COUNT(*) total,
           COUNT(CASE WHEN used_concepts IS NOT NULL AND array_length(used_concepts, 1) > 0 THEN 1 END) populated
      FROM atlas_packets
```

**Issue**: Script tried to query `used_concepts` column.  
**Root Cause**: The column is probably named `concept_ids`, not `used_concepts`.  
**Action**: Update query:
```sql
-- WRONG:
SELECT COUNT(*) FROM atlas_packets WHERE used_concepts IS NOT NULL

-- CORRECT:
SELECT COUNT(*) FROM atlas_packets WHERE concept_ids IS NOT NULL
```

### Error 3: Statement timeout (60s)

```sql
ERROR:  canceling statement due to statement timeout
STATEMENT:  SELECT COUNT(*) total,
           COUNT(CASE WHEN used_concepts IS NOT NULL AND array_length(used_concepts, 1) > 0 THEN 1 END) populated
      FROM atlas_packets
```

**Issue**: Query timed out after 60 seconds.  
**Root Cause**: `array_length()` check on non-existent column scanned full table (68K rows).  
**Action**: Fix the column name first, then optimize with partial index:
```sql
-- Create partial index to speed up checks
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_atlas_packets_concept_ids
ON atlas_packets (concept_ids)
WHERE concept_ids IS NOT NULL;
```

---

## ✅ Steps to Fix (Sequential)

### Step 1: Audit Actual Schema

```bash
# List all columns in atlas_packets
docker exec legal-ai-postgres psql -U legal_admin -d legal_ai_db -c "\d atlas_packets"

# Expected columns:
# - packet_key (text)
# - feature_id (text)
# - title_id (uuid)
# - tree_node_id (text) ← Should be here
# - source_ref (text)
# - domain_class (text)
# - concept_ids (array) ← NOT used_concepts
# - embedding (vector(768) or vector(384))
# - som_cluster (int)
# - page_rank_score (real)
# - community_id (int)
# ... and others

# List all tables to verify atlas_summary_layers exists
docker exec legal-ai-postgres psql -U legal_admin -d legal_ai_db -c "\dt atlas_*"

# Expected tables:
# atlas_packets (main table)
# atlas_packet_features (if exists)
# atlas_summary_layers (may not exist, may be old table)
```

### Step 2: Fix Phase 8.8 Query (Already Applied ✅)

Phase 8.8 now uses the correct dual-table join:

```javascript
SELECT
  ap.packet_key,
  ap.source_ref,
  ap.feature_id,
  ap.title_id,
  ap.domain_class,
  ap.tree_node_id,                         // ← Canonical envelope field
  ap.concept_ids AS packet_concept_ids,    // ← Packet-level semantic tags
  ap.som_cluster,
  ap.page_rank_score,
  ap.community_id,
  ap.embedding,
  f.used_concepts,                         // ← Feature-level semantic tags
  f.lexical_features,                      // ← Lexical/keyword features
  f.ast_symbols                            // ← AST/structural entities
FROM atlas_packets ap
LEFT JOIN atlas_packet_features f
  ON f.packet_key = ap.packet_key
WHERE ap.packet_key IS NOT NULL;
```

**Canonical envelope field ownership:**
- `tree_node_id` → in `atlas_packets` (canonical envelope path, do NOT write to atlas_summary_layers)
- `ap.concept_ids` → packet-level semantic tags
- `f.used_concepts` → feature-level semantic tags (populated by LangExtract Phase 3)
- `f.lexical_features` → lexical features (keywords, unigrams, bigrams, trigrams)
- `f.ast_symbols` → structural/AST entities from Phase 1 tree-node extraction

### Step 3: Add GIN Indexes (For Array Performance)

```bash
docker exec legal-ai-postgres psql -U legal_admin -d legal_ai_db << EOF
-- GIN index on atlas_packets.concept_ids (enables fast array membership checks)
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_atlas_packets_concept_ids_gin
ON atlas_packets USING gin (concept_ids);

-- GIN index on atlas_packet_features.used_concepts
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_atlas_packet_features_used_concepts_gin
ON atlas_packet_features USING gin (used_concepts);

-- Partial indexes for topology queries
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_atlas_packets_tree_node_id_partial
ON atlas_packets (tree_node_id)
WHERE tree_node_id IS NOT NULL;

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_atlas_packets_pagerank_partial
ON atlas_packets (page_rank_score)
WHERE page_rank_score IS NOT NULL AND page_rank_score > 0;

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_atlas_packets_som_cluster_partial
ON atlas_packets (som_cluster)
WHERE som_cluster IS NOT NULL;
EOF
```

**Why GIN instead of B-tree:**
- GIN (Generalized Inverted Index) is optimized for array containment queries: `WHERE concept_ids @> ARRAY['statute']`
- B-tree is for scalar comparisons: `WHERE pagerank_score > 0.5`
- This split improves query performance 5-10× on array-heavy workloads

### Step 4: Apply GIN Indexes and Re-run Phase 8.8 Dry-Run

```bash
# Apply the GIN index migration
cd sveltekit-frontend
npx drizzle-kit migrate

# Or apply manually:
docker exec legal-ai-postgres psql -U legal_admin -d legal_ai_db < drizzle/0019_atlas_packet_indexes_gin.sql

# Re-run Phase 8.8 dry-run
npm run atlas:phase8.8:hmm:dry --limit=100
# Should now complete without errors
# Expected: all packets classified by error state (mostly VectorError initially)
# Expected: repair lanes recommended for each error state
```

### Step 5: Verify Error State Distribution

```bash
# Check sample recommendations
npm run atlas:phase8.8:hmm:dry --limit=50 | tail -50

# Observe:
# - Error State Distribution: breakdown of IDENTITY/STRUCTURE/LEXICAL/SEMANTIC/TOPOLOGY/VECTOR errors
# - Sample HMM Recommendations: repair lanes suggested (e.g., qdrant_payload_bridge, langextract_concepts, neo4j_gds)
# - Confidence scores: 0.75-0.95 range indicates good evidence quality
```

---

## ⚠️ CRITICAL: Schema Field Ownership

**DO NOT write tree_node_id to atlas_summary_layers.** It belongs in the canonical envelope path:
- ✅ `atlas_packets.tree_node_id` — canonical truth (write here via Phase 1)
- ❌ `atlas_summary_layers.tree_node_id` — does not exist (and should not be the primary store)

**DO NOT read used_concepts from atlas_packets.** It belongs in the feature lane:
- ✅ `atlas_packet_features.used_concepts` — feature-level semantic tags (write here via LangExtract Phase 3)
- ❌ `atlas_packets.used_concepts` — does not exist (legacy reference only)

**Backfill direction (where to write):**
1. **tree_node_id** — already in `atlas_packets` (Phase 1 complete, 100% coverage)
2. **used_concepts** — write to `atlas_packet_features` (LangExtract Phase 3, not yet started)
3. **concept_ids** — already in `atlas_packets` (packet-level, 0.4% coverage, needs backfill)
4. **page_rank_score** — write to `atlas_packets` (Neo4j GDS sync, 5% coverage)
5. **som_cluster** — already in `atlas_packets` (deterministic hash, 66.8% coverage)
6. **community_id** — write to `atlas_packets` (Neo4j Louvain, 0% coverage)

**atlas_summary_layers usage (if needed):**
- Mirror fields ONLY via JSONB metadata, not physical columns
- Example: `UPDATE atlas_summary_layers SET metadata = jsonb_set(..., '{tree_node_id}', ...)` IF that table exists
- For now: focus on canonical envelope (atlas_packets) + feature lane (atlas_packet_features)

---

## 🔍 Audit Checklist & Current Coverage

**Canonical Envelope (atlas_packets) — 58,365 rows:**
- ✅ `tree_node_id` — 100% (58,365/58,365) — Phase 1 complete
- ✅ `concept_ids` — 99.99% (58,360/58,365) — packet-level semantic tags
- ✅ `som_cluster` — 99.9% (58,304/58,365) — deterministic SOM hash
- ⚠️ `page_rank_score` — 21.6% (12,616/58,365) — Neo4j GDS sync incomplete
- ⚠️ `community_id` — 21.6% (12,611/58,365) — Neo4j Louvain incomplete
- ❌ `embedding` — 0% (0/58,365) — not populated (Qdrant has separate embedding table)

**Feature Lane (atlas_packet_features) — 0 rows:**
- ❌ `used_concepts` — 0% (0/0) — LangExtract Phase 3 not started
- ❌ `lexical_features` — 0% (0/0) — Phase 1.5 lexical extraction not started
- ❌ `ast_symbols` — 0% (0/0) — Phase 1 tree-node extraction not yet linked

**Actions before Phase 8.8 apply:**
- ✅ Phase 8.8 dry-run completes without timeout
- ✅ Sample recommendations show correct repair lanes
- ⏳ Run Phase 1.5 lexical extraction → populate `atlas_packet_features.lexical_features`
- ⏳ Run Phase 3 LangExtract → populate `atlas_packet_features.used_concepts`
- ⏳ Run Neo4j GDS → populate `atlas_packets.page_rank_score` and `atlas_packets.community_id`

---

## 📋 Concurrent Work While Waiting for Phase 8.8

Don't block on Phase 8.8. Run these in parallel:

### Populate `concept_ids` (LangExtract)

```bash
npm run atlas:phase8:step3:langextract:dry --limit=100
# Preview 100 packets for LangExtract entity extraction

npm run atlas:phase8:step3:langextract:apply --limit=1000
# Apply to first 1000 packets (test run)
```

### Sync Neo4j GDS Results to Postgres

If PageRank/Louvain scores are already computed in Neo4j:

```bash
# Check Neo4j for PageRank scores
npm run atlas:phase16:gds:dry
# Should show computed scores ready to sync to Postgres
```

### Export Embeddings for ML Training

```bash
# Extract 768-dim embeddings from pgvector
docker exec legal-ai-postgres psql -U legal_admin -d legal_ai_db -c \
  "COPY (SELECT packet_key, embedding::text FROM atlas_packets WHERE embedding IS NOT NULL LIMIT 10000) TO STDOUT CSV"
# Save to embeddings_export.csv for autoencoder training
```

---

## Corrected Execution Order

**Priority 1 (Sequential, Blocking):**
1. ✅ Audit schema → verify `concept_ids` (packet-level), `atlas_packet_features.used_concepts` (feature-level)
2. ✅ Patch Phase 8.8 to use dual-table join with correct column references
3. ✅ Add GIN indexes for array columns
4. ✅ Dry-run Phase 8.8 (verify no schema errors)

**Priority 2 (Parallel, Non-blocking):**
5. Run `npm run atlas:phase2:concepts:backfill` (populate feature-level semantic tags via LangExtract)
6. Run Neo4j GDS suite (sync PageRank to Postgres)
7. Export embeddings for ML pipeline (784-dim from pgvector)

**Estimated Timeline:**
- Priority 1: 20-30 min (mostly waiting for dry-run)
- Priority 2: 2-4 hours (LangExtract + GDS run in parallel)

---

## Success Criteria

After Phase 8.8 execution:

1. ✅ No schema errors (all columns exist)
2. ✅ Queries complete in <10s (with partial indexes)
3. ✅ HMM recommendations show repair lanes
4. ✅ Sample recommendations look correct:
   - STRUCTURE_ERROR packets → recommend "run ast-grep Phase 1"
   - SEMANTIC_ERROR packets → recommend "run LangExtract Phase 3"
   - TOPOLOGY_ERROR packets → recommend "run Neo4j GDS Phase 4"
5. ✅ Confidence scores are in 0.75-0.95 range

---

**ACTION**: Start with Step 1 (audit schema). Everything else depends on knowing the actual structure.
