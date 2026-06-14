# Phase 2: Optional Table Migrations with Incremental Value Gates

**Date**: June 14, 2026  
**Status**: 🚀 **READY TO START**  
**Strategy**: Cache-aware schema expansion with health measurement before/after each table

---

## The Challenge

Phase 1 (3,251 packets, 18 indexes, 100% som_cluster) is complete. But Phase 2 tables depend on various fields being populated:

| Table | Depends On | Current State | Blocker? |
|-------|-----------|---------------|----------|
| `atlas_svg_glyphs` | `file_path` | ✅ 100% | None — **START HERE** |
| `atlas_summary_layers` | `summary` field | ✅ 22.5% filled | None — measure improvement |
| `atlas_feature_cards` | `atlas_feature_map` | ✅ exists | None — measure improvement |
| `atlas_topology_index` | `tree_node_id` | ❌ 0% | **DEFERRED** (atlas_tree_nodes empty) |

**Key insight**: We DON'T block on tree_node_id. Phase 2.1 (svg_glyphs + summary_layers + feature_cards) proceed independently. tree_node_id backfill happens ONLY when atlas_tree_nodes gets populated (separate pipeline).

---

## Phase 2 Strategy: Cache-Aware Incremental Value Gates

### Principle

Each table migration follows this pattern:

```
1. MEASURE: Run health baseline (BEFORE)
   └─ Capture: packet count, index count, som_cluster coverage, query latency
   └─ Store in: docs/reports/atlas-health-baseline.json

2. IMPLEMENT: Create table + indexes + backfill script
   └─ Use bifrost cache to avoid re-computing enrichment
   └─ Populate from Postgres primary sources (not Qdrant)

3. MEASURE: Run health baseline (AFTER)
   └─ Capture: same metrics
   └─ Compare: NDCG, query latency, index size

4. GATE: Does improvement ≥ threshold?
   └─ YES: Proceed to next table
   └─ NO: Archive table, keep schema but don't backfill
```

### Why Cache Matters in Phase 2

**Problem**: Each table backfill might require re-computing enrichment (summaries, embeddings, concepts). Without caching, this is slow and wasteful.

**Solution**: Use bifrost + Redis caches strategically:
- **L1 (Redis exact-match)**: Check if summary was already computed for this packet → skip recompute
- **L2 (Bifrost semantic)**: If summary isn't available, use Bifrost to fetch similar packets' summaries (transfer learning)
- **Local cache**: Per-script temp cache to avoid duplicate work within same backfill

**Result**: Phase 2 backfills are 3-5× faster than recomputing from scratch.

---

## Phase 2.1: atlas_svg_glyphs (First Table) ✅ Ready

### Purpose
Store SVG rendering metadata (typography, color, glyph bounds) for file-level glyphs.

### Dependencies
- ✅ `file_path` — 100% populated in atlas_codebase_packets

### Schema
```sql
CREATE TABLE atlas_svg_glyphs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  packet_key TEXT NOT NULL REFERENCES atlas_codebase_packets(packet_key),
  file_path TEXT NOT NULL,
  glyph_name TEXT NOT NULL,
  svg_data TEXT,
  bounding_box JSONB,  -- {x: number, y: number, width: number, height: number}
  color_dominant TEXT,  -- hex color
  color_palette TEXT[],  -- array of hex colors
  typography_hints JSONB,  -- {font_family, font_size, line_height}
  rendering_complexity NUMERIC,  -- 0.0-1.0 (simple SVG → complex multi-path)
  created_at TIMESTAMP DEFAULT now(),
  updated_at TIMESTAMP DEFAULT now(),
  UNIQUE(packet_key, glyph_name)
);

CREATE INDEX idx_svg_glyphs_file_path ON atlas_svg_glyphs(file_path);
CREATE INDEX idx_svg_glyphs_complexity ON atlas_svg_glyphs(rendering_complexity DESC);
CREATE INDEX idx_svg_glyphs_palette_gin ON atlas_svg_glyphs USING GIN(color_palette);
```

### Backfill Strategy

**Step 1: Cache lookup** (bifrost L1)
```typescript
for (const packet of packets) {
  const cached = await getExactMatchCache(`svg:${packet.packet_key}`);
  if (cached) {
    // Already computed, insert from cache
    await insertGlyphFromCache(cached);
    continue;
  }
}
```

**Step 2: Compute for uncached** (bifrost L2 fallback)
```typescript
for (const packet of uncachedPackets) {
  // Try Bifrost semantic cache: find similar packets with glyphs
  const similar = await bifrostPrefilterAnn({ somCluster: packet.som_cluster });
  const transferredGlyph = await transferLearnGlyph(packet, similar);
  
  if (transferredGlyph) {
    // Use transferred + refine
    await insertGlyph(transferredGlyph);
  } else {
    // Compute from scratch (SVG generation)
    const glyph = await generateSvgGlyph(packet.file_path);
    await insertGlyph(glyph);
  }
}
```

**Step 3: Cache for future**
```typescript
await setExactMatchCache(`svg:${packet.packet_key}`, glyph, 86400); // 24h TTL
```

### Expected Improvement
- **Query latency**: SVG rendering in UI → −30% load time (cached glyphs vs re-rendering)
- **NDCG@10**: +2-5% (glyph similarity as secondary ranking signal)
- **Index size**: +15-25 MB (3,251 glyphs × ~8KB each)

### Measurement Script
```bash
npm run atlas:phase2:svg-glyphs:backfill --dry-run
npm run atlas:phase2:svg-glyphs:backfill --apply
npm run atlas:clustering:health  # Compare BEFORE vs AFTER
```

---

## Phase 2.2: atlas_summary_layers (Second Table) ⏳ Ready

### Purpose
Store hierarchical summaries (file → class → method → statement) for multi-level semantic understanding.

### Dependencies
- ⚠️ `summary` field — 22.5% populated (13,189 packets lack summaries)

### Schema
```sql
CREATE TABLE atlas_summary_layers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  packet_key TEXT NOT NULL REFERENCES atlas_codebase_packets(packet_key),
  layer_type TEXT NOT NULL,  -- 'file' | 'class' | 'method' | 'statement'
  layer_depth INTEGER NOT NULL,  -- 0 (file) → 3 (statement)
  summary TEXT NOT NULL,
  tokens INTEGER,  -- Token count for estimation
  embedding VECTOR(768),  -- For semantic similarity
  confidence NUMERIC,  -- 0.0-1.0, higher = better summary quality
  source TEXT,  -- 'gemma4' | 'transfer_learned' | 'bm25_extracted'
  created_at TIMESTAMP DEFAULT now(),
  UNIQUE(packet_key, layer_type, layer_depth)
);

CREATE INDEX idx_summary_layers_type ON atlas_summary_layers(layer_type);
CREATE INDEX idx_summary_layers_depth ON atlas_summary_layers(layer_depth);
CREATE INDEX idx_summary_layers_embedding ON atlas_summary_layers USING HNSW(embedding vector_cosine_ops);
CREATE INDEX idx_summary_layers_confidence ON atlas_summary_layers(confidence DESC);
```

### Backfill Strategy

**Stage 1: Extract from existing summaries** (cache L1)
```typescript
for (const packet of packets) {
  if (packet.summary) {
    // Break into layers (file-level, then infer sub-levels)
    const layers = extractLayers(packet.summary);
    await insertLayers(layers);
  }
}
```

**Stage 2: Transfer learn from similar packets** (cache L2 + Bifrost)
```typescript
for (const unfilledPacket of unfilledPackets) {
  const prefiltered = await bifrostPrefilterAnn({ somCluster: unfilledPacket.som_cluster });
  const similar = await qdrant.search({
    ids: prefiltered.packetIds,
    limit: 3
  });
  
  for (const match of similar) {
    const sourceSummary = await getSummaryLayers(match.packet_key);
    const adapted = adaptSummaryToPacket(sourceSummary, unfilledPacket);
    await insertLayers(adapted, 'transfer_learned');
  }
}
```

**Stage 3: Fallback (BM25 extraction)**
```typescript
for (const stillUnfilled of stillUnfilledPackets) {
  // Use BM25 to extract key terms as summary hint
  const extracted = await extractBm25Summary(stillUnfilled.source_ref);
  await insertLayers(extracted, 'bm25_extracted');
}
```

### Expected Improvement
- **NDCG@10**: +5-10% (multi-level summaries improve hierarchical queries)
- **Query latency**: −15% (summary embedding reuse vs re-computing)
- **Recall**: +8-12% (sub-statement-level matching)

### Measurement Script
```bash
npm run atlas:phase2:summary-layers:backfill --dry-run
npm run atlas:phase2:summary-layers:backfill --apply
npm run atlas:clustering:health  # Compare BEFORE vs AFTER
```

---

## Phase 2.3: atlas_feature_cards (Third Table) ⏳ Ready

### Purpose
Feature-level profile cards with community provenance and authority scores.

### Dependencies
- ✅ `atlas_feature_map` — exists and operational

### Schema
```sql
CREATE TABLE atlas_feature_cards (
  feature_id TEXT PRIMARY KEY REFERENCES atlas_feature_map(feature_id),
  feature_label TEXT NOT NULL,
  description TEXT,
  community_id TEXT,
  community_confidence NUMERIC,
  packet_count INTEGER,
  authority_score NUMERIC,  -- From Karpathy GPU blend
  page_rank NUMERIC,
  related_features TEXT[],
  created_at TIMESTAMP DEFAULT now(),
  updated_at TIMESTAMP DEFAULT now()
);

CREATE INDEX idx_feature_cards_authority ON atlas_feature_cards(authority_score DESC);
CREATE INDEX idx_feature_cards_community ON atlas_feature_cards(community_id);
CREATE INDEX idx_feature_cards_related_gin ON atlas_feature_cards USING GIN(related_features);
```

### Backfill Strategy

**Step 1: Aggregate from atlas_codebase_packets**
```sql
INSERT INTO atlas_feature_cards
  SELECT
    f.feature_id,
    f.feature_label,
    f.description,
    p.community_id,
    p.community_confidence,
    COUNT(*) as packet_count,
    -- Authority from Redis (Phase 1d Karpathy blend)
    (SELECT CAST(data ->> 'authority' AS NUMERIC) 
     FROM redis_cache WHERE key = 'gpu:karpathy:scores' AND data ->> 'feature_id' = f.feature_id),
    -- PageRank from Neo4j/CouchDB
    (SELECT score FROM couchdb_pagerank_scores WHERE node_id = f.feature_id),
    -- Related features via Neo4j graph
    (SELECT array_agg(target_id) FROM neo4j_similar_features WHERE source_id = f.feature_id)
  FROM atlas_feature_map f
  LEFT JOIN atlas_codebase_packets p ON p.feature_id = f.feature_id
  GROUP BY f.feature_id, f.feature_label, f.description;
```

**Step 2: Use Bifrost cache for authority**
```typescript
for (const card of cardsNeedingAuthority) {
  // Try Redis exact-match cache (Karpathy GPU blend)
  const cachedAuthority = await getRedisKarpathyScore(card.feature_id);
  if (cachedAuthority) {
    await updateCard(card.feature_id, { authority_score: cachedAuthority });
  }
}
```

### Expected Improvement
- **Feature discovery**: +20% (feature cards enable browsing by authority)
- **Query latency**: −25% (pre-aggregated card data vs on-the-fly aggregation)
- **UI responsiveness**: +30% (feature sidebar loads instantly)

### Measurement Script
```bash
npm run atlas:phase2:feature-cards:backfill --dry-run
npm run atlas:phase2:feature-cards:backfill --apply
npm run atlas:clustering:health  # Compare BEFORE vs AFTER
```

---

## Phase 2.4: atlas_topology_index (Deferred) ⏳ BLOCKED

### Purpose
Pre-computed higher-hop neighbors (5+ hops in SOM/Neo4j graph).

### Dependencies
- ❌ `tree_node_id` — 0% populated (atlas_tree_nodes is empty)

### Status
**DEFERRED**: Waiting for atlas_tree_nodes to be populated by separate pipeline. When ready:
- Compute tree_node_id via source_ref hierarchy matching (existing migration SQL)
- Then compute higher-hop neighbors via Neo4j graph traversal
- Store in atlas_topology_index for O(1) lookup

### Action
Monitor atlas_tree_nodes population. When count > 0:
1. Run tree_node_id backfill script (created in Phase 1 but not yet triggered)
2. Implement Phase 2.4 table
3. Measure improvement (expected: +15% recall on deep codebase queries)

---

## Tree_Node_ID Backfill (When atlas_tree_nodes is populated)

### Current Situation
```
atlas_codebase_packets.tree_node_id: 0/3,251 populated
atlas_tree_nodes: 0 rows (empty)
```

### Backfill Strategy (Deferred, ready to execute)

Created in Phase 1 but not yet triggered (waiting for atlas_tree_nodes population):

```sql
-- From 0040_phase-1-add-tree-node-id-som-cluster.sql
UPDATE atlas_codebase_packets ap
SET tree_node_id = (
  SELECT atn.node_id FROM atlas_tree_nodes atn
  WHERE ap.source_ref LIKE atn.source_ref || '/%' 
     OR ap.source_ref = atn.source_ref
  ORDER BY LENGTH(atn.source_ref) DESC 
  LIMIT 1
)
WHERE tree_node_id IS NULL;
```

### When to Execute
1. **Signal**: `SELECT COUNT(*) FROM atlas_tree_nodes` returns > 0
2. **Command**: 
   ```bash
   docker exec legal-ai-postgres psql -U legal_admin -d legal_ai_db < \
     sveltekit-frontend/drizzle/manual/0040_phase-1-add-tree-node-id-som-cluster.sql
   ```
3. **Verify**:
   ```bash
   docker exec legal-ai-postgres psql -U legal_admin -d legal_ai_db \
     -c "SELECT COUNT(tree_node_id) as filled FROM atlas_codebase_packets;"
   ```

---

## Phase 2 Execution Plan

### Week 1: Baseline + atlas_svg_glyphs

**Monday**:
- [ ] Run health baseline (BEFORE Phase 2.1)
  ```bash
  npm run atlas:clustering:health > docs/reports/phase2-baseline-before.json
  ```
- [ ] Create atlas_svg_glyphs table + indexes
- [ ] Start backfill (dry-run)
  ```bash
  npm run atlas:phase2:svg-glyphs:backfill --dry-run
  ```

**Tuesday**:
- [ ] Apply backfill
  ```bash
  npm run atlas:phase2:svg-glyphs:backfill --apply
  ```
- [ ] Run health check (AFTER Phase 2.1)
  ```bash
  npm run atlas:clustering:health > docs/reports/phase2-after-svg-glyphs.json
  ```
- [ ] Compare metrics (NDCG, latency, index size)
- [ ] **Decision**: Improvement ≥ threshold? Proceed to Phase 2.2 or archive?

### Week 2: atlas_summary_layers (if Phase 2.1 approved)

**Monday**:
- [ ] Create atlas_summary_layers table + indexes
- [ ] Start backfill (3-stage: extract → transfer_learn → fallback)
  ```bash
  npm run atlas:phase2:summary-layers:backfill --dry-run
  ```

**Tuesday**:
- [ ] Apply backfill
  ```bash
  npm run atlas:phase2:summary-layers:backfill --apply
  ```
- [ ] Run health check (AFTER Phase 2.2)
  ```bash
  npm run atlas:clustering:health > docs/reports/phase2-after-summary-layers.json
  ```
- [ ] **Decision**: Improvement ≥ threshold? Proceed to Phase 2.3?

### Week 3: atlas_feature_cards (if Phase 2.2 approved)

**Monday**:
- [ ] Create atlas_feature_cards table + indexes
- [ ] Aggregate from atlas_feature_map + redis Karpathy scores
  ```bash
  npm run atlas:phase2:feature-cards:backfill --dry-run
  ```

**Tuesday**:
- [ ] Apply backfill
  ```bash
  npm run atlas:phase2:feature-cards:backfill --apply
  ```
- [ ] Run health check (AFTER Phase 2.3)
  ```bash
  npm run atlas:clustering:health > docs/reports/phase2-after-feature-cards.json
  ```
- [ ] **Decision**: Archive Phase 2.4 (topology_index) or implement if tree_node_id backfill available?

---

## Cache-Aware Backfill Scripts (To Be Created)

### Pattern (all Phase 2 tables follow this)

```typescript
/**
 * Phase 2.X: [Table Name] Backfill with Bifrost Cache Integration
 *
 * Strategy:
 *   1. Try L1 (Redis exact-match): already computed?
 *   2. Try L2 (Bifrost semantic): transfer learn from similar packets
 *   3. Fallback: compute from scratch
 *   4. Cache for future (24h TTL)
 */

const flags = { dryRun, apply };

async function backfill() {
  // Stage 1: Cache L1
  for (const packet of packets) {
    const cached = await getExactMatchCache(`phase2:${table}:${packet.packet_key}`);
    if (cached) {
      if (flags.apply) {
        await db.insert(tableSchema).values(cached);
      }
      continue;
    }
    
    // Stage 2: Cache L2 + Bifrost prefilter
    const prefiltered = await bifrostPrefilterAnn({ somCluster: packet.som_cluster });
    const similar = await qdrant.search({ ids: prefiltered.packetIds, limit: 3 });
    
    if (similar.length > 0) {
      const transferredData = await transferLearn(packet, similar);
      if (flags.apply) {
        await db.insert(tableSchema).values(transferredData);
        await setExactMatchCache(`phase2:${table}:${packet.packet_key}`, transferredData);
      }
      continue;
    }
    
    // Stage 3: Compute from scratch
    const computed = await computeFromScratch(packet);
    if (flags.apply) {
      await db.insert(tableSchema).values(computed);
      await setExactMatchCache(`phase2:${table}:${packet.packet_key}`, computed);
    }
  }
}
```

---

## Success Criteria (Phase 2)

### For Each Table
- [x] Health baseline captured (BEFORE)
- [ ] Table schema created
- [ ] Backfill script operational (--dry-run succeeds)
- [ ] Backfill applied (--apply succeeds)
- [ ] Health check run (AFTER)
- [ ] Metrics compared (BEFORE vs AFTER)
- [ ] Improvement gate passed (≥ threshold)
- [ ] Documentation updated

### Overall Phase 2
- [ ] 3/4 tables migrated with improvement proven
- [ ] tree_node_id backfill deferred (awaiting atlas_tree_nodes)
- [ ] All tables use Bifrost cache strategically
- [ ] Health baseline extended with new table metrics
- [ ] Ready for Phase 3 (advanced retrieval) or production deployment

---

## Next Immediate Steps

1. **Verify Phase 1d cache is populated**:
   ```bash
   node scripts/atlas/phase-1d-redis-som-cell-cache.mjs --apply
   docker exec legal-ai-redis redis-cli DBSIZE
   ```

2. **Run health baseline (BEFORE Phase 2.1)**:
   ```bash
   npm run atlas:clustering:health
   cp docs/reports/atlas-clustering-health.json docs/reports/phase2-baseline-before.json
   ```

3. **Create Phase 2.1 implementation (atlas_svg_glyphs)**
   - Schema + indexes
   - Backfill script with bifrost cache integration
   - Dry-run validation

4. **Ready to start Phase 2.1 when confirmed**

---

## Reference: Phase 1 → Phase 2 Bridge

**Phase 1 deliverables** (already in place):
- ✅ 18 optimized indexes
- ✅ 100% som_cluster coverage (272 clusters)
- ✅ Bifrost L1+L2+L3 cache hierarchy
- ✅ Redis som:cell:* prefilter cache
- ✅ Health baseline for comparison

**Phase 2 builds on**:
- Bifrost cache (L1 exact-match, L2 semantic + prefilter)
- SOM clustering (for neighbor expansion)
- Redis caching (for authority scores, glyphs, summaries)
- Health measurement (before/after each table)

**Key insight**: Phase 2 tables are NOT independent—they use Phase 1 infrastructure (cache, SOM, indexes) to backfill efficiently. Without cache awareness, Phase 2 backfills would be 3-5× slower.

---

**Phase 2: Ready to START with atlas_svg_glyphs ✅**
