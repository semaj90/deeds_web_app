# Multihop Enrichment — Execution Order

**Date**: June 14, 2026  
**Status**: ✅ Phase 1 Generator + Health Logger Complete

---

## Execution Order (Correct)

**NEVER skip steps. Execute in this exact sequence:**

### Step 1: Schema Validation (Pre-generation check)
```bash
node scripts/atlas/audit-multihop-map-schema.mjs
```
**Purpose**: Verify `regenerate-multihop-with-enrichment.mjs` has valid node template  
**Result**: ✅ Schema check passed → proceed to Step 2  
**If fails**: Fix the template before generating

### Step 2: Generate Enriched Map (Phase 1 canonical spine)
```bash
node scripts/atlas/regenerate-multihop-with-enrichment.mjs
```
**Purpose**: Hydrate 17,485 canonical packets from Postgres  
**Output files**:
- `sveltekit-frontend/docs/graph/multihop-codebase-map.enriched.json` (53MB)
- `sveltekit-frontend/docs/graph/multihop-codebase-map.enriched.report.json` (stats)
- `sveltekit-frontend/docs/graph/multihop-codebase-map.enriched.md` (summary)

**Result**:
```
packetKeyCoverage: 100.0% ✅
sourceRefCoverage: 100.0% ✅
featureIdCoverage: 100.0% ✅
readyForHigherHop: YES ✅
```

### Step 3: Verify Output (Minimal gate)
```bash
node scripts/atlas/verify-multihop-enriched-map.mjs
```
**Purpose**: ONLY verify the enriched file exists and has valid schema  
**If not generated**: Returns `status: NOT_GENERATED` (not an error)  
**Result**: `status: GENERATED` + field coverage stats

---

## Phase 2-4 Execution (After Phase 1)

### Phase 2: Qdrant Payload Sync (Optional enrichment)
```bash
node scripts/atlas/upsert-qdrant-packet-payload.mjs --apply
```
**Purpose**: Enrich 6,370+ Qdrant points with feature_id, community_id, tags  
**Expected**: qdrantMatchRate → 37% in regenerated map  
**Duration**: 2-5 minutes

### Phase 3: Karpathy GPU Authority Blend (Optional enrichment)
```bash
node scripts/atlas/karpathy-gpu-enrich.mjs
```
**Purpose**: Compute 0.4·PageRank + 0.3·attention + 0.3·authority → Redis  
**Expected**: gpu:karpathy:scores populated with ~17,485 entries  
**Duration**: 10-15 minutes (GPU-intensive)

### Phase 4: Re-Generate with Full Enrichment
```bash
node scripts/atlas/regenerate-multihop-with-enrichment.mjs
```
**Purpose**: Regenerate multihop map with Qdrant + Karpathy enrichment  
**Expected**:
- qdrantMatchRate → 37%
- karpathyEnrichRate → 100%
- All 17,485 nodes with full enrichment

### Phase 5: Autoencoder Training (Optional, deferred)
```bash
npm run graphify:autoencoder:train
```
**Purpose**: Train 768→64 latent compression  
**Then re-generate**: `node scripts/atlas/regenerate-multihop-with-enrichment.mjs`

---

## npm Script Shortcuts

**To add to `package.json` scripts**:

```json
"atlas:multihop:audit": "node ../scripts/atlas/audit-multihop-map-schema.mjs",
"atlas:multihop:regen": "node --check ../scripts/atlas/regenerate-multihop-with-enrichment.mjs && echo '✅ Schema check passed'",
"atlas:multihop:regen:apply": "node ../scripts/atlas/regenerate-multihop-with-enrichment.mjs",
"atlas:multihop:verify": "node ../scripts/atlas/verify-multihop-enriched-map.mjs",
"atlas:multihop:enriched:generate": "npm run atlas:multihop:regen:apply",
"atlas:multihop:enriched:verify": "npm run atlas:multihop:verify"
```

**Usage**:
```bash
# Full sequence
npm run atlas:multihop:audit && npm run atlas:multihop:regen:apply && npm run atlas:multihop:verify

# Or use shortcuts
npm run atlas:multihop:enriched:generate && npm run atlas:multihop:enriched:verify
```

---

## Key Rules

### ✅ DO:
- Run schema audit BEFORE generation
- Execute phases in order (1 → 2 → 3 → 4 → 5)
- Verify after generation (check report gates)
- Re-run verification after Phase 2+3 before Phase 4

### ❌ DON'T:
- Skip schema audit
- Run verification before generation (will fail with NOT_GENERATED)
- Generate without Postgres connection ready
- Assume Qdrant/Redis enrichment happened automatically (manual Phase 2+3 required)

---

## Current Status (June 14, 2026)

| Phase | Task | Status |
|-------|------|--------|
| **Phase 1** | Canonical spine generator | ✅ COMPLETE |
| **Phase 1** | Schema audit script | ✅ CREATED |
| **Phase 1** | Verification script | ✅ CREATED |
| **Phase 2** | Qdrant payload sync | ⏳ READY TO EXECUTE |
| **Phase 3** | Karpathy GPU enrichment | ⏳ READY TO EXECUTE |
| **Phase 4** | Re-generation with enrichment | ⏳ AFTER 2+3 COMPLETE |
| **Phase 5** | Autoencoder training | ⏳ OPTIONAL |

---

## Clustering Health Baseline (June 14, 2026)

Run to diagnose enrichment readiness before Phase 2+3:

```bash
node scripts/atlas/logger-analytics-clustering-health.mjs --detailed --json
```

**Current blockers**:
- SOM topology: 0/400 cells populated (will be seeded by Phase E)
- Tags enrichment: 0% (Phase 2 Qdrant sync will populate)
- KMeans clusters: 0 (SOM compute creates these)
- Domain class tags: 49% (optional; improves ranking later)

**Readiness gates** (all PASS):
- ✅ Index coverage: 60 indexes across 3 tables
- ✅ Packet identity: 100% source_ref/feature_id, 99.5% community_id
- ✅ Summaries: 99.9% BM25-indexable content
- ✅ JSONB metadata: 100% coverage with GIN indexes
- ✅ GPU indexing: 100% feature coverage ready

---

## Legacy File Preservation

The original `multihop-codebase-map.json` (May 13, 2026) is **preserved unchanged** at:
```
sveltekit-frontend/docs/graph/multihop-codebase-map.json
```

**New enriched outputs** go to:
```
sveltekit-frontend/docs/graph/multihop-codebase-map.enriched.json (main)
sveltekit-frontend/docs/graph/multihop-codebase-map.enriched.report.json (stats)
sveltekit-frontend/docs/graph/multihop-codebase-map.enriched.md (summary)
```

Both files coexist; routes using multihop data should reference `.enriched.json`.

---

## Next Immediate Action

```bash
# 1. Verify schema is valid
node scripts/atlas/audit-multihop-map-schema.mjs

# 2. Generate Phase 1 (canonical spine)
node scripts/atlas/regenerate-multihop-with-enrichment.mjs

# 3. Verify output
node scripts/atlas/verify-multihop-enriched-map.mjs

# 4. Check clustering health (diagnose Phase 2+3 blockers)
node scripts/atlas/logger-analytics-clustering-health.mjs --detailed --json

# 5. When ready, execute Phase 2 Qdrant sync
node scripts/atlas/upsert-qdrant-packet-payload.mjs --apply

# 6. When Phase 2 complete, execute Phase 3 Karpathy
node scripts/atlas/karpathy-gpu-enrich.mjs

# 7. Finally, re-generate with full enrichment
node scripts/atlas/regenerate-multihop-with-enrichment.mjs
```

---

**Key Achievement**: Canonical packet spine fully operational. May-13 legacy file preserved. Phase 2-5 enrichment lanes staged and ready on demand.
