# pgvector Audit Lane — Steps 2-7 Next Steps

**Previous Status**: ✅ Step 1 COMPLETE — embeddinggemma:latest confirmed 768-dim  
**Current Status**: 🟢 UNBLOCKED — Ready to proceed with Steps 2-7  
**Date**: July 20, 2026 (Session 138+ Final)

---

## Step 2: Qdrant Collection Inventory Audit

**Purpose**: Verify Qdrant collections match the 768-dim canonical dimension.

**Command**:
```bash
curl -s http://127.0.0.1:6333/collections | \
  jq '.result.collections[] | {
    name,
    vector_size: .config.params.vectors.size,
    points_count,
    status: .points_count
  }'
```

**Expected Output** (sample):
```json
{
  "name": "codebase_chunks_768",
  "vector_size": 768,
  "points_count": 40568,
  "status": 40568
}
```

**Gate Criteria**:
- ✅ `codebase_chunks_768` exists with `vector_size: 768`
- ✅ Point count ≥ 40K (currently ~40.5K)
- ❌ FAIL if `codebase_chunks_384_hybrid` exists with inconsistent size
- ❌ FAIL if payload schema missing `source_ref`, `feature_id`, `packet_key`

**Estimated Duration**: 5 minutes  
**Effort**: Bash query + document results in `docs/QDRANT-COLLECTIONS-LIVE.md`

**Output**: Create `docs/QDRANT-COLLECTIONS-LIVE.md` with:
```markdown
# Qdrant Collections Live Inventory (July 20, 2026)

| Collection | Vector Size | Point Count | Status | Canonical? |
|---|---|---|---|---|
| codebase_chunks_768 | 768 | 40,568 | ✅ | YES |
```

---

## Step 3: Retrieval Code Audit

**Purpose**: Find all hard-coded collection names and dimension assumptions in TypeScript code.

**Commands**:
```bash
# Find all collection references
rg "codebase_chunks" src/ --type ts --type tsx

# Find dimension assumptions
rg "768|384|target_dim" src/lib/server/retrieval/ --type ts

# Find Qdrant client calls
rg "qdrant\|Qdrant" src/lib/server/ --type ts -l
```

**Expected Files**:
- `src/lib/server/retrieval/embedding-service.ts` (Line 69-78, `target_dim: 768`)
- `src/lib/server/retrieval/qdrant-manager.ts` (collection name references)
- `src/lib/server/vector/turbovec-prefilter.ts` (embedding dimension contract)

**Gate Criteria**:
- ✅ `target_dim: 768` in embedding-service.ts
- ✅ All Qdrant calls reference `codebase_chunks_768` correctly
- ✅ No orphaned references to `codebase_chunks_384_hybrid` (if it doesn't exist yet)
- ❌ FAIL if any retrieval code uses 384-dim for search (AE 64-dim is OK for routing only)

**Estimated Duration**: 10-15 minutes  
**Effort**: Grep searches + code inspection + documentation

**Output**: Create `docs/RETRIEVAL-CODE-COLLECTION-AUDIT.md` with:
- List of all collection reference locations
- Confirmation of 768-dim assumption in embedding pipeline
- Notes on any deprecated 384-dim code paths

---

## Step 4: Autoencoder Dimension Contract

**Purpose**: Verify autoencoder accepts 768-dim input correctly.

**Components**:
1. **Input contract**: Autoencoder receives 768-dim vectors from embedding layer
2. **Output contract**: Autoencoder produces 64-dim vectors for routing/analytics (NOT search)
3. **Usage contract**: 64-dim vectors ONLY used for SOM/KMeans/analytics, NEVER for Qdrant ANN search

**Commands**:
```bash
# Find autoencoder references
rg "autoencoder\|768.*64\|encode.*64" src/lib/server/ --type ts

# Verify 64-dim is NOT used for search
rg "codebase_chunks.*64|64.*qdrant" src/lib/server/ --type ts
```

**Gate Criteria**:
- ✅ Autoencoder input accepts 768-dim vectors
- ✅ Autoencoder output is 64-dim
- ❌ FAIL if 64-dim vectors stored in Qdrant for search
- ✅ 64-dim vectors used ONLY for routing (SOM, KMeans, analytics)

**Estimated Duration**: 5 minutes  
**Effort**: Grep + verification logic inspection

**Output**: Create `docs/AUTOENCODER-DIMENSION-CONTRACT.md` with:
- Confirmation of 768→64 transformation
- Verification that 64-dim is routing-only (not search-grade)

---

## Step 5: Postgres Schema Reconciliation

**Purpose**: Verify all pgvector columns match the 768-dim canonical dimension.

**Command**:
```bash
# Connect to Postgres and check all vector columns
docker exec legal-ai-postgres psql -U legal_admin -d legal_ai_db -c "
  SELECT 
    table_name,
    column_name,
    data_type,
    CASE 
      WHEN data_type LIKE 'vector%' 
        THEN CAST(SUBSTRING(data_type FROM 8 FOR 3) AS INTEGER)
      ELSE NULL
    END as dimension
  FROM information_schema.columns
  WHERE data_type LIKE 'vector%'
  ORDER BY dimension DESC, table_name;
"
```

**Expected Output**:
- 12 tables with `vector(768)` ✅
- 9 tables with `vector(384)` (legacy, marked for potential migration)
- 0 tables with mixed dimensions in same table

**Gate Criteria**:
- ✅ All search-critical tables use 768-dim (embedding_cache, codebase_embeddings, legal_chunks, etc.)
- ⚠️ 384-dim tables exist but are non-critical (optional cleanup later)
- ❌ FAIL if any search table mixed 768 + 384 in same query

**Estimated Duration**: 10 minutes  
**Effort**: SQL query + documentation

**Output**: Create `docs/POSTGRES-SCHEMA-RECONCILIATION.md` with:
- Table-by-table dimension audit
- Canonical vs legacy classification
- Optional migration plan for 384-dim tables (post-Phase 1)

---

## Step 6: Qdrant Collection Cutover Plan

**Purpose**: Plan any necessary Qdrant collection updates.

**Assessment**:
- **Current state**: `codebase_chunks_768` is live and correct ✅
- **No cutover needed** if collection is at 768-dim
- **Conditional**: If `codebase_chunks_384_hybrid` exists, document when/how to deprecate

**Gate Criteria**:
- ✅ `codebase_chunks_768` is primary and correct
- ✅ No re-indexing needed (already correct dimension)
- ✅ Plan documented for any future collection changes

**Estimated Duration**: 5 minutes  
**Effort**: Assessment + documentation

**Output**: Create `docs/QDRANT-COLLECTION-CUTOVER-PLAN.md` with:
- Confirmation that no immediate action needed
- Plan for future collection versioning (if needed)

---

## Step 7: Collection Alias Resolver

**Purpose**: Wire runtime collection name resolution to allow future flexibility.

**Current State**:
- Collection names are hard-coded in retrieval code
- No aliasing layer exists

**Implementation**:
1. Create `resolveEmbeddingCollection(dim: 768 | 384 | null)` function
2. Return collection name based on canonical dimension
3. Wire into all Qdrant queries
4. Add feature flag for collection switching

**Gate Criteria**:
- ✅ Alias resolver implemented
- ✅ All Qdrant calls route through resolver
- ✅ Feature flags allow collection switching without code change

**Estimated Duration**: 2-4 hours  
**Effort**: Code implementation + testing

**Output**: Implement in `src/lib/server/retrieval/collection-resolver.ts`

---

## Summary Timeline

| Step | Component | Duration | Blocker? |
|------|-----------|----------|----------|
| 1 | Dimension verification | ✅ DONE | N/A |
| 2 | Qdrant inventory | 5 min | No |
| 3 | Retrieval code audit | 10-15 min | No |
| 4 | Autoencoder contract | 5 min | No |
| 5 | Postgres schema | 10 min | No |
| 6 | Collection cutover plan | 5 min | No |
| 7 | Alias resolver | 2-4 hours | Optional* |

**Total estimated audit time**: ~30-45 minutes (Steps 2-6) + ~2-4 hours (Step 7)

*Step 7 is optional for Phase 1 launch but recommended for long-term flexibility.

---

## What's Unblocked Now

✅ **Phase 0 source_ref validation** — can proceed  
✅ **Phase 1 embedding widening** — can proceed  
✅ **All pgvector migrations** — no longer blocked  
✅ **Ingestion pipeline work** — can proceed  
✅ **Retrieval pipeline validation** — can proceed

---

## Next Immediate Action

**Run Step 2**:
```bash
curl -s http://127.0.0.1:6333/collections | jq '.result.collections[] | {name, vector_size: .config.params.vectors.size, points_count}'
```

Document result in `docs/QDRANT-COLLECTIONS-LIVE.md` and confirm gate passes.

---

**References**:
- [EMBEDDING-MODEL-DIMENSION.md](EMBEDDING-MODEL-DIMENSION.md) — Step 1 result
- [EMBEDDINGGEMMA-COMPLETE-REFERENCE.md](EMBEDDINGGEMMA-COMPLETE-REFERENCE.md) — Master reference
- [PGVECTOR-AUDIT-LANE-INITIATED.md](../memory/PGVECTOR-AUDIT-LANE-INITIATED.md) — Audit framework
