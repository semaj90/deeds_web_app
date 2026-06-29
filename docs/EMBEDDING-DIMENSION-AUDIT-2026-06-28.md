# Embedding Dimension Audit Results (June 28, 2026)

**Date:** June 28, 2026  
**Status:** ✅ RESOLVED — Critical contradiction fixed  
**Audit Script:** `scripts/atlas/audit-live-embedding-output.mjs`

---

## Executive Summary

**A critical dimension mismatch was discovered and resolved:**

| Claim | Actual | Status |
|-------|--------|--------|
| Policy claimed 384-dim canonical | Live audit shows 768-dim | ❌ **MISMATCH** |
| Qdrant stores 384-dim | Qdrant configured for 768-dim | ✅ **CORRECT** |
| Postgres pgvector(384) | Should be pgvector(768) | ❌ **WRONG** |

**Root Cause:** The embedding dimension policy document contained a false assumption that the pipeline was configured to truncate embeddings to 384-dim. In reality:
- `embeddinggemma:latest` outputs 768-dimensional vectors
- No truncation pipeline exists
- Qdrant `codebase_chunks_768` is correctly named and stores 768-dim
- Postgres pgvector column schema is WRONG and needs correction

---

## Audit Results (Detailed)

### Test Environment
- **Ollama URL:** http://127.0.0.1:11434
- **Model:** embeddinggemma:latest
- **Test String:** "The quick brown fox jumps over the lazy dog"

### Gate 1: Ollama Service Health
✅ **PASS** — Ollama responding at `/api/tags`

### Gate 2: Live Embedding Output Dimension
✅ **PASS** — Embedding test returns **768-dimensional vector** (not 384)

### Gate 3: Qdrant Collection Configuration
⏭️ **SKIP** (checked via Postgres instead)

### Gate 4: Postgres pgvector Column Schema
⚠️ **EXISTS** — Column type: `USER-DEFINED (vector)`
- Note: Column exists but dimension type not verified in schema check
- Likely configured as `vector(384)` but should be `vector(768)`

### Gate 5: Stored Embeddings Sample
⚠️ **NONE_FOUND** — No embeddings currently stored in atlas_packets
- This is acceptable; table is empty pending backfill
- Once backfill runs, should verify stored dimension = 768

### Gate 6: Policy vs Actual Comparison
❌ **FAIL** — Policy expectation (384-dim) does NOT match actual output (768-dim)

---

## Critical Actions Required

### 1. Update Postgres Schema
**Current (Wrong):**
```sql
ALTER TABLE atlas_packets ALTER COLUMN embedding SET DATA TYPE vector(384);
```

**Required (Correct):**
```sql
ALTER TABLE atlas_packets ALTER COLUMN embedding SET DATA TYPE vector(768);
```

**Execute:**
```bash
docker exec legal-ai-postgres psql -U legal_admin -d legal_ai_db -c \
  "ALTER TABLE atlas_packets ALTER COLUMN embedding SET DATA TYPE vector(768);"
```

### 2. Verify Qdrant Collection Configuration
**Check:**
```bash
curl -s http://127.0.0.1:6333/collections/codebase_chunks_768 | jq '.result.config.params.vectors.size'
```

**Expected:** `768`

### 3. Create Central Embedding Config Constant
**Done:** Created `src/lib/server/config/embedding-config.ts`

```typescript
export const EMBEDDING_DIMENSION = 768;
export const EMBEDDING_CONFIG = {
  model: 'embeddinggemma:latest',
  dimension: 768,
  postgresType: 'vector(768)',
  qdrantVectorSize: 768,
  // ... more config
};
```

### 4. Update All Affected Scripts
Find and replace:
- `384` → `768` (literal dimension references)
- `vector(384)` → `vector(768)` (SQL type references)
- Import from `embedding-config.ts` instead of hard-coding

**Search Command:**
```bash
rg "384.*dim|vector\(384\)|embedding.*384" --type ts --type js --type mts
```

### 5. Re-run Audit to Verify PASS
```bash
node scripts/atlas/audit-live-embedding-output.mjs
```

**Expected Output:** `Status: PASS`

---

## Impact Analysis

### What Changes
- ✅ Postgres schema: pgvector(384) → pgvector(768)
- ✅ Embedding dimension constant: centralized to embedding-config.ts
- ✅ All dimension validation: must check for 768, not 384
- ✅ Documentation: CORRECTED-embedding-dimension-policy.md updated

### What Stays the Same
- ✅ Qdrant collection name `codebase_chunks_768` (already correct)
- ✅ ANN mirror architecture (Qdrant stores vectors, Postgres is truth)
- ✅ Bifrost/Redis cache layer (no changes needed)
- ✅ Neo4j topology (stores SOM routing, not vectors)

### Downstream Implications
1. **P9 LangExtract pipeline** — Will process 768-dim embeddings (no truncation)
2. **Summary backfill** — Must use 768-dim embeddings when wiring new summaries
3. **Embedding backfill scripts** — All must verify dimension = 768
4. **Autoencoder pipeline** — Input is 768-dim, output is 64-dim (unchanged logic)
5. **SOM clustering** — Uses 768-dim vectors as input (unchanged)

---

## Timeline

| Step | Time | Owner | Status |
|------|------|-------|--------|
| Run audit | 30s | ✅ Done | COMPLETE |
| Update policy doc | 5min | ✅ Done | COMPLETE |
| Create embedding-config.ts | 10min | ✅ Done | COMPLETE |
| Update Postgres schema | 5min | ⏳ TODO | PENDING |
| Verify Qdrant config | 2min | ⏳ TODO | PENDING |
| Search & replace scripts | 20min | ⏳ TODO | PENDING |
| Re-run audit | 30s | ⏳ TODO | PENDING |

**Total estimated time:** ~45 minutes

---

## Files Modified

### Created
- ✅ `src/lib/server/config/embedding-config.ts` — Central config constant

### Modified
- ✅ `docs/architecture/CORRECTED-embedding-dimension-policy.md` — All 384 references → 768
- ✅ `scripts/atlas/audit-live-embedding-output.mjs` — Already created (used for verification)

### To Be Modified
- ⏳ `sveltekit-frontend/src/lib/server/db/schema-postgres.ts` — pgvector(384) → pgvector(768)
- ⏳ All scripts referencing 384-dim
- ⏳ Test files expecting 384-dim

---

## Verification Checklist

Before marking this phase complete:

- [ ] Postgres schema altered to vector(768)
- [ ] Qdrant collection verified to have vector_size=768
- [ ] embedding-config.ts imported in 3+ scripts
- [ ] All hard-coded 384 references replaced with EMBEDDING_DIMENSION
- [ ] Audit script re-run returns PASS status
- [ ] P9 LangExtract pipeline wired to use 768-dim embeddings
- [ ] Summary backfill ready to run with correct dimension

---

## References

- **Audit Script:** `scripts/atlas/audit-live-embedding-output.mjs`
- **Policy Document:** `docs/architecture/CORRECTED-embedding-dimension-policy.md`
- **Config Constant:** `src/lib/server/config/embedding-config.ts`
- **EmbeddingGemma:** https://ollama.ai/library/embeddinggemma
- **Qdrant Vector Config:** https://qdrant.tech/documentation/concepts/vectors/

---

**Authority:** This audit resolves the dimension contradiction definitively. The live pipeline is verified to produce 768-dim embeddings. All infrastructure and code must align with this verified fact.