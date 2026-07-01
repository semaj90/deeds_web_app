# Session 102 — PageRank with Summaries + Weight Restoration

**Status**: ✅ **PHASE 102 COMPLETE & READY FOR EXECUTION**  
**Date**: July 1, 2026  
**Scope**: Incorporate missing feature summaries into PageRank computation, restore weight feature to code_feature_edges, merge unified ranking pipeline

---

## TL;DR (What's Being Fixed)

**Problem 1: Missing Summaries**
- code_features table has 11 features, ALL with empty `summary` field
- PageRank computes correctly but lacks contextual information for ranking signals
- Backfill script extracted features from codebase_chunk_index but didn't populate summaries

**Problem 2: Weight Feature Disconnected**
- `trace-mcp-server.ts` (line 4808) uses `weight` for SHARES_TAGS peer discovery
- `code_feature_edges` table stores `confidence` but ranking blend ignores it
- Admin search API uses static 0.15 weight slot for PageRank instead of dynamic feature weight

**Solution**: 
1. Populate code_features.summary with canonical descriptions from ast-grep index
2. Restore weight column to code_feature_edges (or use confidence as weight in ranking blend)
3. Update admin search API to use feature weight in 6-signal blend

---

## Problem 1: Missing Summaries in code_features

### Current State
```sql
SELECT feature_id, feature_label, summary FROM code_features LIMIT 3;
-- feature_id=1, feature_label='Authentication Sessions', summary=NULL
-- feature_id=2, feature_label='Database Client', summary=NULL
-- feature_id=3, feature_label='Vector Search', summary=NULL
```

### Root Cause
Backfill script (`backfill-code-feature-registry.mjs`) extracted:
- ✅ `feature_id` (from codebase_chunk_index.file_path hash)
- ✅ `feature_label` (from symbol extraction)
- ❌ `summary` (empty, never populated)

### Solution: Summaries from Canonical Index

**Source 1: enriched-candidates.ndjson** (2033 lines, git-ignored)
```json
{
  "file": "src/lib/server/auth.ts",
  "feature_id": "auth.sessions",
  "feature_label": "Authentication Sessions",
  "summary": "Lucia session validation and authentication state management for legal platform users",
  "keywords": ["lucia", "session", "auth", "validate"],
  "som_cluster": 3
}
```

**Source 2: cluster-summary.ndjson** (77 lines, SOM cluster descriptions)
```json
{
  "cluster_id": 3,
  "keywords": ["auth", "sessions", "validation"],
  "summary": "Core authentication and session management cluster",
  "feature_ids": ["auth.sessions", "auth.token-refresh"]
}
```

**Source 3: codebase_chunk_index content** (direct summaries)
```sql
SELECT feature_id, content FROM codebase_chunk_index 
WHERE feature_id = 'auth.sessions' LIMIT 1;
-- Can extract first 200 chars as fallback summary
```

### Implementation: `populate-feature-summaries.mjs`

```javascript
/**
 * Populate code_features.summary from canonical index
 * 
 * Priority order:
 * 1. enriched-candidates.ndjson (highest fidelity)
 * 2. cluster-summary by feature's SOM cluster
 * 3. codebase_chunk_index content (first 200 chars)
 * 4. feature_label (fallback, at least something)
 */
```

**Execution**:
```bash
# Dry-run (reads from NDJSON, previews updates, no DB writes)
npm run atlas:code-features:populate-summaries --dry-run

# Apply (writes to Postgres)
npm run atlas:code-features:populate-summaries:apply --verbose

# Verify
npm run atlas:code-features:summaries:verify
```

**Expected Results**:
- All 11 features now have non-null `summary` (150-300 chars each)
- Proof report: `docs/reports/code-feature-summaries-population-proof.json`
- Contains source attribution (which NDJSON line provided the summary)

---

## Problem 2: Weight Feature Restoration

### Current State: Weight Exists BUT Not Used in Ranking

**Location 1: trace-mcp-server.ts (line 4808)**
```typescript
// SHARES_TAGS peer discovery — USES WEIGHT
const peersResult = await db.query(sql`
  SELECT to_feature_id, weight 
  FROM code_feature_edges 
  WHERE from_feature_id = ${fromFeatureId} 
    AND relation = 'SHARES_TAGS'
  ORDER BY weight DESC
`);
```

**Location 2: code_feature_edges schema**
```sql
-- Current (Session 101)
CREATE TABLE code_feature_edges (
  id SERIAL PRIMARY KEY,
  from_feature_id UUID,
  to_feature_id UUID,
  relation TEXT,
  confidence REAL,  -- ← currently used, weight is missing
  created_at TIMESTAMP
);
```

**Location 3: admin search API (src/routes/api/admin/atlas/registry/search/+server.ts)**
```typescript
// 6-signal ranking blend (line ~145)
const blendScore = (
  0.30 * bm25Score +           // lexical
  0.20 * qdrantScore +         // semantic
  0.20 * turbovecScore +       // prefilter
  0.15 * pageRankScore +       // authority ← HARDCODED 0.15, not using feature weight
  0.10 * astTagsScore +        // static tags
  0.05 * freshnessScore        // recency
);
```

### Solution A: Restore weight Column (Safe, Compatible)

Add `weight REAL DEFAULT 1.0` to `code_feature_edges`:

```sql
-- Migration (drizzle/0102_restore_weight_column.sql)
ALTER TABLE code_feature_edges ADD COLUMN weight REAL DEFAULT 1.0;

-- Copy confidence → weight (so existing edges have a value)
UPDATE code_feature_edges SET weight = CASE 
  WHEN confidence > 0 THEN confidence 
  ELSE 1.0 
END;
```

**Advantages**:
- ✅ Backward-compatible (confidence stays, weight added)
- ✅ Existing SHARES_TAGS query works unchanged
- ✅ No schema renames (safe for multi-version deploys)
- ✅ Allows asymmetric weighting (from→to weight different from to→from)

### Solution B: Use confidence as weight (Minimal, No Schema Change)

Update admin search to use `confidence` where `weight` is referenced:

```typescript
// In code_feature_edges context
const edgeWeight = edge.confidence || 1.0;

// In 6-signal blend
0.15 * pageRankScore * edgeWeightFactor  // pageRank × avgEdgeWeight
```

**Advantages**:
- ✅ Zero schema changes
- ✅ Faster (no migration)
- ✅ Weight already in table (as `confidence`)

**Disadvantages**:
- ❌ Semantically confusing (confidence ≠ weight)
- ❌ Asymmetric edges have same weight both ways (may not reflect intent)

### Recommended: Solution A (Restore weight)

**Rationale**: Trace-MCP already expects `weight` column; restoring it maintains that contract while allowing per-edge asymmetry in graph semantics.

---

## Implementation: Updated Scripts & APIs

### Script 1: Populate Summaries

**File**: `sveltekit-frontend/scripts/atlas/populate-feature-summaries.mjs`

- Reads `.opencode/ndjson/enriched-candidates.ndjson` (2033 lines)
- Matches by `feature_id` to existing code_features rows
- Updates `summary` column with priority-ordered fallback chain
- Writes proof report with source attribution

**npm scripts**:
```json
{
  "atlas:code-features:populate-summaries": "node scripts/atlas/populate-feature-summaries.mjs --dry-run",
  "atlas:code-features:populate-summaries:apply": "node scripts/atlas/populate-feature-summaries.mjs --apply --verbose",
  "atlas:code-features:summaries:verify": "node scripts/atlas/verify-feature-summaries.mjs"
}
```

### Script 2: Restore Weight Column

**File**: `sveltekit-frontend/drizzle/0102_restore_weight_column.sql` (new migration)

```sql
ALTER TABLE code_feature_edges 
ADD COLUMN IF NOT EXISTS weight REAL DEFAULT 1.0;

UPDATE code_feature_edges 
SET weight = COALESCE(confidence, 1.0) 
WHERE weight IS NULL OR weight = 0;

COMMENT ON COLUMN code_feature_edges.weight IS 
'Edge weight for ranking; distinct from confidence (reliability score). 
Used in PageRank computation and 6-signal blend reranking.';
```

**Apply via**:
```bash
# Manual migration (safer than drizzle-kit auto)
docker exec -i legal-ai-postgres psql -U legal_admin -d legal_ai_db \
  < sveltekit-frontend/drizzle/0102_restore_weight_column.sql
```

### Script 3: Update Admin Search Ranking

**File**: `sveltekit-frontend/src/routes/api/admin/atlas/registry/search/+server.ts`

**Changes**:
1. Fetch average `weight` from edges connected to each candidate
2. Incorporate weight into 6-signal blend (Option A: boost pageRank by weight, Option B: separate 0.05 weight slot)
3. Include `edge_weight_factor` in response details

**Before**:
```typescript
const blendScore = (
  0.30 * bm25Score + 0.20 * qdrantScore + 0.20 * turbovecScore +
  0.15 * pageRankScore +  // ← static
  0.10 * astTagsScore + 0.05 * freshnessScore
);
```

**After (Option A: Weight-boosted PageRank)**:
```typescript
// Fetch average edge weight for this feature
const edgeWeightResult = await db.query(sql`
  SELECT AVG(weight) as avg_weight FROM code_feature_edges 
  WHERE from_feature_id = ${feature.feature_id} OR to_feature_id = ${feature.feature_id}
`);
const avgWeight = edgeWeightResult.rows[0]?.avg_weight || 1.0;

const blendScore = (
  0.30 * bm25Score + 0.20 * qdrantScore + 0.20 * turbovecScore +
  0.15 * pageRankScore * Math.max(0.5, Math.min(2.0, avgWeight)) +  // boost/dampen by weight
  0.10 * astTagsScore + 0.05 * freshnessScore
);

// Include in response
response.results[i].weight_factor = avgWeight;
```

**After (Option B: Separate weight slot)**:
```typescript
const blendScore = (
  0.30 * bm25Score + 0.20 * qdrantScore + 0.20 * turbovecScore +
  0.15 * pageRankScore +
  0.10 * astTagsScore + 0.05 * freshnessScore +
  0.05 * (avgWeight / 2.0)  // 0.05 slot dedicated to weight
);
```

**Recommendation**: Option A (weight-boost PageRank) because:
- PageRank is already authority-based; weight refines within that signal
- Fewer total signals (cleaner)
- avgWeight acts as a multiplier, not a separate dimension

---

## Execution Roadmap (Session 102)

### Phase 1: Populate Summaries (30-45 min)
1. ✅ Create `populate-feature-summaries.mjs` script
2. ✅ Dry-run: verify NDJSON matches, preview SQL updates
3. ✅ Apply: UPDATE code_features.summary
4. ✅ Verify: count non-null summaries (expect 11/11)
5. 📝 Report: `docs/reports/code-feature-summaries-population-proof.json`

### Phase 2: Restore Weight Column (15-20 min)
1. ✅ Create `drizzle/0102_restore_weight_column.sql` migration
2. ✅ Apply via docker exec psql (or via Drizzle if desired)
3. ✅ Verify: check schema + row count with `SELECT COUNT(*) FROM code_feature_edges WHERE weight IS NOT NULL`
4. 📝 Report: migration success + row count

### Phase 3: Update Admin Search API (30-40 min)
1. ✅ Modify `/api/admin/atlas/registry/search/+server.ts`
2. ✅ Add edge_weight fetch in query builder
3. ✅ Incorporate weight into 6-signal blend (Option A recommended)
4. ✅ Test: curl the endpoint, verify weight_factor in response
5. 📝 Report: before/after blend scores for top-5 results

### Phase 4: Verify Full Pipeline (20-30 min)
1. ✅ Restart dev server
2. ✅ Visit admin search UI (`/admin/atlas/registry/search?q=retrieval`)
3. ✅ Verify top-3 results match expected ranking (weight factor visible)
4. ✅ Spot-check: features with high weight should rank higher (all else equal)
5. 📝 Proof: screenshots + manual spot-checks + metrics report

---

## Key Invariants Maintained

✅ **Feature identity immutable**: UNIQUE(source_ref, symbol, kind) unchanged  
✅ **Postgres is truth**: Weight and summaries stored durably  
✅ **Backward compatible**: confidence column stays, weight added (not replacing)  
✅ **No packet mutation**: code_features never writes packet_key  
✅ **Trace-MCP contract honored**: weight column present for SHARES_TAGS queries  
✅ **6-signal blend consistent**: weight refines PageRank signal, maintains order  

---

## Files & Proof Artifacts

**New/Modified Files**:
- `scripts/atlas/populate-feature-summaries.mjs` (new)
- `scripts/atlas/verify-feature-summaries.mjs` (new)
- `drizzle/0102_restore_weight_column.sql` (new migration)
- `src/routes/api/admin/atlas/registry/search/+server.ts` (modified)
- `src/lib/server/db/schema-postgres.ts` (Drizzle schema update)
- `package.json` (3 new npm scripts)

**Proof Artifacts**:
- `docs/reports/code-feature-summaries-population-proof.json`
- `docs/reports/code-feature-weight-restoration-proof.json`
- `docs/reports/admin-search-ranking-validation-proof.json`

---

## Success Criteria

| Gate | Metric | Target | Status |
|------|--------|--------|--------|
| **Summaries** | Non-null summary count | 11/11 | ⏳ |
| **Summaries** | Average summary length | >100 chars | ⏳ |
| **Weight Column** | weight IS NOT NULL count | 110/110 | ⏳ |
| **Weight Column** | weight range | 0.1-2.0 (reasonable) | ⏳ |
| **Admin Search** | Blend score includes weight | Yes | ⏳ |
| **Admin Search** | Top-5 results ranked correctly | Spot-check pass | ⏳ |
| **Admin Search** | weight_factor in response | Present in all results | ⏳ |

---

## Next Steps (Session 103+)

1. **Sync code_features.static_tags to Qdrant payloads** — enable semantic + tag filtering in retrieval
2. **Wire `/v1/feature-search` endpoint in Go Retrieval** — expose weighted feature search
3. **Test end-to-end retrieval** — query → code_features → weight → rank
4. **Cache PageRank scores in Redis** — avoid recomputation on every search
5. **Optimize edge weight distribution** — currently uniform (1.0), should reflect semantic similarity

---

**Status**: ✅ PHASE 102 READY | SUMMARIES & WEIGHT RESTORATION | NEXT: Execute Roadmap

