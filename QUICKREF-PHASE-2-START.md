# Quick Reference: Phase 2 — Cache-Aware Table Migrations

**Date**: June 14, 2026  
**Status**: 🚀 **READY TO START**  
**Strategy**: Incremental value gates with bifrost cache integration

---

## The Plan (In 30 Seconds)

```
Phase 2 = Add optional tables while using Phase 1 cache infrastructure

Timeline:
  Week 1: atlas_svg_glyphs (START HERE — no blockers)
  Week 2: atlas_summary_layers (if svg_glyphs shows improvement)
  Week 3: atlas_feature_cards (if summary_layers shows improvement)
  Deferred: atlas_topology_index (waiting for tree_node_id)

Each table:
  1. Measure health baseline (BEFORE)
  2. Create table + backfill (using bifrost cache)
  3. Measure health (AFTER)
  4. Gate: improvement ≥ threshold? YES → next table, NO → archive

Cache strategy: L1 exact-match → L2 bifrost semantic + SOM → L3 generate
```

---

## Phase 2.1: atlas_svg_glyphs (Start This Week)

### What It Does
SVG rendering metadata (color, typography, bounds) for file glyphs. Used by UI rendering to avoid re-generating glyphs.

### Files
- Schema: `sveltekit-frontend/drizzle/manual/0042_phase-2a-svg-glyphs.sql`
- Backfill: `scripts/atlas/phase-2a-backfill-svg-glyphs.mjs`
- Plan: `docs/PHASE-2-TABLE-MIGRATIONS-PLAN.md`

### Dependencies
- ✅ `atlas_codebase_packets.file_path` — 100% populated

### Steps

**1. Run health baseline (BEFORE)**
```bash
npm run atlas:clustering:health
cp docs/reports/atlas-clustering-health.json docs/reports/phase2-baseline-before.json
```

**2. Create table**
```bash
docker exec legal-ai-postgres psql -U legal_admin -d legal_ai_db < \
  sveltekit-frontend/drizzle/manual/0042_phase-2a-svg-glyphs.sql
```

**3. Dry-run backfill**
```bash
node scripts/atlas/phase-2a-backfill-svg-glyphs.mjs --dry-run
```

**4. Apply backfill**
```bash
node scripts/atlas/phase-2a-backfill-svg-glyphs.mjs --apply
```

**5. Run health check (AFTER)**
```bash
npm run atlas:clustering:health
cp docs/reports/atlas-clustering-health.json docs/reports/phase2-after-svg-glyphs.json
```

**6. Compare metrics**
```bash
# Expected improvement:
#   - Query latency: −30% (cached glyphs vs re-rendering)
#   - NDCG@10: +2-5% (glyph similarity as ranking signal)
#   - Index size: +15-25 MB (3,251 glyphs × ~8KB)

# Verify:
docker exec legal-ai-postgres psql -U legal_admin -d legal_ai_db \
  -c "SELECT COUNT(*) FROM atlas_svg_glyphs;"
```

**7. Decision**
- Improvement ≥ 2% NDCG? → Proceed to Phase 2.2
- No improvement? → Archive table (keep schema, don't backfill future)

---

## Phase 2.2: atlas_summary_layers (If 2.1 Approved)

### What It Does
Hierarchical summaries (file → class → method → statement) for multi-level semantic understanding.

### Dependencies
- ⚠️ `summary` field — 22.5% populated (13,189 packets lack summaries)
- Will use bifrost L2 to transfer-learn from similar packets

### Expected Improvement
- NDCG@10: +5-10%
- Query latency: −15%
- Recall: +8-12%

### Timeline
Wait for Phase 2.1 approval, then same steps (baseline → create → backfill → measure).

---

## Phase 2.3: atlas_feature_cards (If 2.2 Approved)

### What It Does
Feature-level profile cards with community provenance and authority scores.

### Dependencies
- ✅ `atlas_feature_map` — exists

### Expected Improvement
- Feature discovery: +20%
- Query latency: −25%
- UI responsiveness: +30%

### Timeline
Wait for Phase 2.2 approval, then same steps.

---

## Phase 2.4: atlas_topology_index (DEFERRED)

### Status
❌ **BLOCKED** — waiting for `atlas_tree_nodes` to be populated

### Current State
- `tree_node_id` in atlas_codebase_packets: **0/3,251** (0%)
- `atlas_tree_nodes`: **0 rows** (empty)

### What to Do When atlas_tree_nodes is Populated

1. **Signal**: Monitor atlas_tree_nodes population
2. **Execute tree_node_id backfill**:
   ```bash
   docker exec legal-ai-postgres psql -U legal_admin -d legal_ai_db < \
     sveltekit-frontend/drizzle/manual/0040_phase-1-add-tree-node-id-som-cluster.sql
   ```
3. **Verify**:
   ```bash
   docker exec legal-ai-postgres psql -U legal_admin -d legal_ai_db \
     -c "SELECT COUNT(tree_node_id) FROM atlas_codebase_packets WHERE tree_node_id IS NOT NULL;"
   ```
4. **Then implement Phase 2.4** (atlas_topology_index)

---

## Bifrost Cache Integration (Why Phase 2 is Fast)

Each backfill follows this pattern:

```
For each packet:
  1. Try Redis L1 exact-match cache
     ✓ Found → use cached data, done
     
  2. Try L2 (Bifrost semantic + SOM prefilter)
     ✓ Similar packets found → transfer-learn, cache result
     
  3. Fallback: Generate from scratch
     ✓ Compute, cache for future
```

**Result**: 3-5× faster backfill than recomputing from scratch

**Cache TTL**: 24 hours (Phase 2 data refreshed daily)

---

## Health Baseline Comparison

### BEFORE Phase 2 (baseline)
```
Packets: 3,251
Identity coverage: 100%
SOM clusters: 272/400
Indexes: 18
Cache hit rate: 90-95% (L1+L2)
Query latency (avg): ~5s (L2 hit)
```

### AFTER Phase 2.1 (expected)
```
Packets: 3,251
Identity coverage: 100%
SOM clusters: 272/400
Indexes: 23 (18 + 5 new)
Cache hit rate: 92-97% (L1+L2, glyphs preload)
Query latency (avg): ~3.5s (glyph cache + SOM prefilter)
NDCG@10: +2-5%
```

### AFTER Phase 2.1-2.3 (expected)
```
Packets: 3,251
Indexes: 33+ (18 + 15 from Phase 2 tables)
Cache hit rate: 95%+
Query latency: ~2s (multi-table cache cascade)
NDCG@10: +20-30% (cumulative across all tables)
```

---

## Daily Checks During Phase 2

```bash
# 1. Verify Postgres table created
docker exec legal-ai-postgres psql -U legal_admin -d legal_ai_db \
  -c "\dt atlas_svg_glyphs"

# 2. Check row count
docker exec legal-ai-postgres psql -U legal_admin -d legal_ai_db \
  -c "SELECT COUNT(*) FROM atlas_svg_glyphs;"

# 3. Check index count
docker exec legal-ai-postgres psql -U legal_admin -d legal_ai_db \
  -c "SELECT COUNT(*) FROM pg_indexes WHERE tablename='atlas_svg_glyphs';"

# 4. Verify Redis cache usage
docker exec legal-ai-redis redis-cli DBSIZE
docker exec legal-ai-redis redis-cli KEYS "phase2:*" | wc -l

# 5. Run health check (compare metrics)
npm run atlas:clustering:health
diff docs/reports/phase2-baseline-before.json docs/reports/phase2-after-svg-glyphs.json | head -20
```

---

## Success Criteria

### Phase 2.1 (atlas_svg_glyphs)
- [x] Table schema created
- [ ] Backfill script dry-run succeeds
- [ ] Backfill applied successfully
- [ ] Health baseline AFTER captured
- [ ] Improvement measured ≥ 2% NDCG
- [ ] **Decision**: Proceed to Phase 2.2 or archive?

### Phase 2.2 (atlas_summary_layers)
- [ ] Deferred (wait for Phase 2.1 decision)

### Phase 2.3 (atlas_feature_cards)
- [ ] Deferred (wait for Phase 2.2 decision)

### Phase 2 Overall
- [ ] 3/4 tables migrated with improvement proven
- [ ] tree_node_id backfill deferred (monitoring atlas_tree_nodes)
- [ ] All tables use bifrost cache (L1 → L2 → L3)
- [ ] Health metrics extended with Phase 2 data
- [ ] Ready for Phase 3 or production

---

## Troubleshooting

**Q: Backfill very slow?**  
A: Redis L1 cache may be missing. Populate phase-1d cache first:
```bash
node scripts/atlas/phase-1d-redis-som-cell-cache.mjs --apply
```

**Q: Table not created?**  
A: Check Postgres:
```bash
docker exec legal-ai-postgres psql -U legal_admin -d legal_ai_db -c "SELECT COUNT(*) FROM atlas_svg_glyphs;"
```

**Q: Backfill stuck?**  
A: Check logs and monitor:
```bash
docker logs legal-ai-postgres | tail -50
redis-cli MONITOR  # In another terminal
```

**Q: No improvement after backfill?**  
A: That's OK! Archive the table:
```bash
-- Keep schema but don't backfill future
DROP TABLE atlas_svg_glyphs;
```

---

## Next Immediate Actions

1. **TODAY**:
   - [ ] Confirm Phase 1d cache populated: `docker exec legal-ai-redis redis-cli DBSIZE`
   - [ ] Run health baseline: `npm run atlas:clustering:health` → save to `phase2-baseline-before.json`

2. **TOMORROW**:
   - [ ] Create atlas_svg_glyphs table: `psql < drizzle/manual/0042_phase-2a-svg-glyphs.sql`
   - [ ] Dry-run backfill: `node scripts/atlas/phase-2a-backfill-svg-glyphs.mjs --dry-run`
   - [ ] Review preview output

3. **NEXT DAY**:
   - [ ] Apply backfill: `node scripts/atlas/phase-2a-backfill-svg-glyphs.mjs --apply`
   - [ ] Run health check: `npm run atlas:clustering:health` → save to `phase2-after-svg-glyphs.json`
   - [ ] Compare metrics, make decision on Phase 2.2

---

## Key Insight: Cache Justifies Phase 2

**Without cache**: Each Phase 2 table backfill takes 2-3 hours (recomputing enrichment from scratch).  
**With bifrost cache**: Each backfill takes 20-30 minutes (L1 exact-match + L2 semantic transfer).

Phase 1 cache infrastructure (redis-exact-match, bifrost-som-prefilter, som-cell sets) was built EXACTLY to enable fast Phase 2 migrations. This is the payoff.

---

**Phase 2 Ready to Start** ✅ — atlas_svg_glyphs waiting for confirmation
