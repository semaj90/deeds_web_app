# pgvector Dimension Drift Audit

**Status**: Audit Framework Ready (Blocking DDL)  
**Date**: July 20, 2026  
**Severity**: CRITICAL — All Phase 1-17 ingestion work is blocked until resolved

---

## Executive Summary

The project has a **dimensional schizophrenia**: no single consistent embedding dimension exists across retrieval pipelines. The schema declares both 768-dim and 384-dim vectors, Qdrant collections target different dimensions, and retrieval code hard-codes collection names with unreconciled dimension assumptions.

**Gate Status**: 🔴 **BLOCKED** — No pgvector Drizzle migrations can be applied until this audit completes.

---

## The Dimension Drift Problem

### Schema Inventory

**vector(768) Columns** (12 tables):
- `atlas_packets.embedding` (all NULL — deprecated)
- `atlas_chunks.embedding`
- `codebase_embeddings.embedding`
- `legal_chunks.embedding` (comment: "embeddinggemma:latest")
- `legal_documents.content_embedding`
- `nes_chrom_packets.embedding`
- `rag_cards.embedding`
- `schema_semantic_cache.embedding`
- `search_analytics.content_embedding` (768)
- `search_analytics.signature_embedding` (768)
- `search_analytics.summary_embedding` (768)
- `statute_chunks.embedding`
- `summary_cards.embedding`
- `workspace_notes.embedding`

**vector(384) Columns** (9 tables):
- `embedding_index.embedding` (384)
- `embedding_index.embedding_384` (384)
- `error_clusters.embedding` (384)
- `legal_cases.case_embedding` (384)
- `legal_cases.case_embedding_384` (384)
- `legal_cases.chunk_embedding` (384)
- `atlas_registry.latent_384d` (384, not primary)
- `gpu_cache.source_embedding` (384)
- `kag_semantic_cache.semantic_embedding` (actually 768, mislabeled)

### Qdrant Collections

**From Retrieval Code**:
- `codebase_chunks_768` — 40.5K points, 768-dim (live, hard-coded)
- `codebase_chunks_384_hybrid` — target, status unknown
- `codebase_chunks_384` — target fallback, status unknown

### Retrieval Lane Expectations

| Lane | Stage | Input Dimension | Output Dimension | Evidence |
|------|-------|-----------------|------------------|----------|
| Vector RAG | Qdrant ANN | 768-dim | top-K candidates | `attention-reranker.ts:110` — "Must be 768-dim" |
| GPU Reranking | Autoencoder | 768-dim | 64-dim | `encoded-cluster-prefilter.ts:87` — "Encodes 768→64" |
| Hybrid RAG | Qdrant Multi-Vector | 384-dim | top-K + tags | `go-retrieval-coordinator.ts:52-55` — "384-dim content_embedding" |
| Ingestion | Embedding Service | ? (384 or 768?) | Postgres storage | `Phase-0-BLOCKER-RESOLUTION.md` — "embeddinggemma 384-dim" |

---

## Decision Blockers

### Blocker 1: embeddinggemma:latest Dimension is Unverified

**Statement in Phase 0 doc**: "embeddinggemma:latest (384-dim)"

**Reality**: Actual model dimension unknown until live endpoint tested

**Impact**: If 768-dim, the 384-dim Postgres columns are wrong. If 384-dim, the 768-dim columns are legacy.

### Blocker 2: Qdrant Collection Cutover Not Atomic

**Current**: Code hard-codes `codebase_chunks_768` in 3+ places (no alias resolution)

**Target**: Phase 9 suggests `codebase_chunks_384_hybrid`

**Risk**: Migrating Postgres without updating code breaks retrieval. Migrating code without Qdrant ready breaks retrieval.

### Blocker 3: Autoencoder Dimension Specificity Unknown

**Current**: 768→64 autoencoder weights exist

**Risk**: If we reduce ingestion to 384-dim, do we need 384→64 weights? Or upsample back to 768?

---

## 7-Step Audit Path (Blocking All DDL)

### Step 1: Verify embeddinggemma:latest Dimension

**Required**: Docker running, Ollama :11434 responding

```bash
# After docker-compose up:
curl -s http://127.0.0.1:11434/api/embeddings \
  -d '{"model":"embeddinggemma:latest","prompt":"test"}' \
  | jq '.embedding | length'
```

**Acceptance Criteria**:
- ✅ Returns 384 → Document as canonical
- ✅ Returns 768 → Document as canonical (Phase 0 doc is wrong)
- ❌ Returns other → Model mismatch, investigate

**Output file**: `docs/EMBEDDING-MODEL-DIMENSION.md`

---

### Step 2: Inventory Live Qdrant Collections

**Required**: Qdrant :6333 responding

```bash
# Live collections + point counts:
curl -s http://127.0.0.1:6333/collections | jq '.result[]'

# For each codebase_* collection:
curl -s http://127.0.0.1:6333/collections/codebase_chunks_768 | jq '.result'
```

**Acceptance Criteria**:
- ✅ `codebase_chunks_768` exists with ~40.5K points
- ✅ `codebase_chunks_384_hybrid` exists OR doesn't (clarifies Phase 9 status)
- ✅ Point count matches Postgres `codebase_chunk_index` (expected 40.5K)

**Output file**: `docs/QDRANT-COLLECTIONS-LIVE.md`

---

### Step 3: Audit Retrieval Code Hard-Coded Collections

**No Docker needed** — pure code analysis

```bash
# Find all hard-coded collection references:
grep -r "codebase_chunks" sveltekit-frontend/src/lib/server/retrieval --include="*.ts" -n

# Expected hits:
# centroid-cache.ts:194
# go-retrieval-orchestrator.ts:156
# bm42-sparse-retriever.ts:6
# collection-aliases.ts (declarations only, not usage)
```

**Acceptance Criteria**:
- ✅ Inventory complete, all references documented
- ✅ Identify which lanes use 768-dim vs 384-dim assumption
- ✅ Determine if alias resolution is wired (it isn't as of July 20)

**Output file**: `docs/RETRIEVAL-CODE-COLLECTION-AUDIT.md`

---

### Step 4: Verify Autoencoder Dimension Contract

**No Docker needed** — schema + comments analysis

**Questions to answer**:
1. Are autoencoder weights specific to 768→64, or dimension-agnostic?
2. If specific, do 384→64 weights exist in `scripts/atlas/`?
3. Is the autoencoder **required** for GPU reranking, or optional?

**Source files**:
- `sveltekit-frontend/src/lib/server/retrieval/autoencoder-compression-pipeline.ts`
- `sveltekit-frontend/src/lib/server/retrieval/encoded-cluster-prefilter.ts`
- `sveltekit-frontend/simd-bridge/cpp/` (if N-API autoencoder exists)

**Acceptance Criteria**:
- ✅ Weights trained for specific dimension OR flexible across dimensions
- ✅ Training procedure documented (if retraining needed for 384)
- ✅ Fallback strategy if weights unavailable (skip autoencoder or upsample?)

**Output file**: `docs/AUTOENCODER-DIMENSION-CONTRACT.md`

---

### Step 5: Reconcile Postgres Schema vs. Canonical Dimension

**After Steps 1-4**, decision is clear:

**If canonical dimension = 384**:
- ✅ Keep 9 vector(384) columns as-is
- 🔄 Migrate 12 vector(768) columns → vector(384)
- 🔄 Backfill strategy: recompute via `embeddinggemma:latest` (safe) or truncate (lossy)?
- 📝 Document backfill SOP

**If canonical dimension = 768**:
- ✅ Keep 12 vector(768) columns as-is
- 🔄 Migrate 9 vector(384) columns → vector(768)
- 🔄 Backfill strategy: upsample (pad with zeros?) or recompute?
- 📝 Document backfill SOP

**Acceptance Criteria**:
- ✅ One dimension chosen
- ✅ Backfill SOP defined (no loss of data)
- ✅ DDL written (Drizzle migration file, **NOT applied yet**)

**Output file**: `docs/POSTGRES-SCHEMA-RECONCILIATION.md`

---

### Step 6: Plan Qdrant Collection Cutover

**After Step 2** (collections inventory):

**Decision Tree**:

1. **If only `codebase_chunks_768` exists**:
   - Phase 9 not implemented
   - No cutover needed (stay at 768-dim)
   - Update comments to clarify 768-dim is permanent

2. **If both `codebase_chunks_768` and `codebase_chunks_384_hybrid` exist**:
   - Both are live
   - Define cutover: when does traffic switch from 768 → 384?
   - Create DNS alias or runtime collection resolver
   - Plan rollback (snapshot :6333 before cutover)

3. **If only `codebase_chunks_384_hybrid` exists**:
   - Migration already complete
   - Verify all retrieval code updated to use 384-dim

**Acceptance Criteria**:
- ✅ Collection status clarified
- ✅ Cutover plan (if needed) documented
- ✅ Rollback procedure defined

**Output file**: `docs/QDRANT-COLLECTION-CUTOVER-PLAN.md`

---

### Step 7: Wire Collection Alias Resolution (Code Change)

**After Steps 5-6**, implement collection resolver:

```typescript
// src/lib/server/retrieval/collection-resolver.ts (NEW)
export function resolveEmbeddingCollection(context: {
  dimension: 'canonical' | 768 | 384;
  vectorType: 'content' | 'summary' | 'signature';
}): string {
  // Consult DIMENSION_POLICY to return correct collection name
  // No more hard-coded 'codebase_chunks_768'
}
```

**Acceptance Criteria**:
- ✅ All retrieval code imports from collection-resolver (no hard-codes)
- ✅ Alias resolution is configurable (can flip between collections at runtime)
- ✅ Tests verify resolver returns correct collection for dimension policy

**Output file**: None (code change tracked in git)

---

## Audit Execution Checklist

**Before Starting**:
- [ ] Docker is running (Ollama :11434, Qdrant :6333, Postgres :5434)
- [ ] Git is clean (no uncommitted changes)
- [ ] Branch is current (synced with main)

**Steps 1-4** (Blocking information gathering):
- [ ] Step 1: embeddinggemma:latest dimension verified + documented
- [ ] Step 2: Qdrant collections inventoried + documented
- [ ] Step 3: Retrieval code hard-codes audited + documented
- [ ] Step 4: Autoencoder dimension contract verified + documented

**Step 5** (Decision):
- [ ] Canonical dimension chosen (384 OR 768)
- [ ] Postgres migration plan written
- [ ] Backfill SOP defined
- [ ] Drizzle migration file created (NOT applied)

**Step 6-7** (Cutover plan):
- [ ] Qdrant cutover strategy defined (if needed)
- [ ] Collection resolver designed + implemented
- [ ] Tests pass

**Final Gate**:
- [ ] All 7 output documents exist and are internally consistent
- [ ] No contradictions between dimension policy + code + schema
- [ ] DIMENSION_POLICY.md is Single Source of Truth

---

## Gate Pass Criteria (ALL MUST PASS)

✅ **embeddinggemma:latest dimension is verified** (not assumed)  
✅ **One canonical dimension is chosen** (384 OR 768, not both)  
✅ **Postgres schema matches canonical dimension** (or migration is planned)  
✅ **Qdrant collections match canonical dimension** (or cutover is planned)  
✅ **Autoencoder supports canonical dimension** (or fallback is documented)  
✅ **Retrieval code uses alias resolution** (no hard-coded collection names)  
✅ **Backfill SOP prevents data loss** (safe migration path exists)  

**Status**: 🔴 **BLOCKED** until ALL criteria pass

---

## Files Generated by This Audit

1. `docs/audit/PGVECTOR-DIMENSION-DRIFT-AUDIT.md` (this file)
2. `docs/EMBEDDING-MODEL-DIMENSION.md` (Step 1 output)
3. `docs/QDRANT-COLLECTIONS-LIVE.md` (Step 2 output)
4. `docs/RETRIEVAL-CODE-COLLECTION-AUDIT.md` (Step 3 output)
5. `docs/AUTOENCODER-DIMENSION-CONTRACT.md` (Step 4 output)
6. `docs/POSTGRES-SCHEMA-RECONCILIATION.md` (Step 5 output)
7. `docs/QDRANT-COLLECTION-CUTOVER-PLAN.md` (Step 6 output)
8. `docs/DIMENSION-POLICY.md` (Master source of truth, created by Step 5)

---

## Notes for Operator

- **This audit is NOT a code change.** It's a diagnostic framework to resolve schema ambiguity.
- **DO NOT apply Drizzle migrations** until all 7 steps pass and gate criteria are met.
- **DO NOT assume dimensions** from comments — verify via live endpoints.
- **Collection alias resolution** is the final blocker removal (Step 7). Without it, retrieval code will break if collections are renamed.

---

## Reference

- Phase 0 Blocker Resolution: `docs/PHASE-0-BLOCKER-RESOLUTION.md`
- Canonical Packet Wiring: `docs/architecture/CANONICAL-PACKET-WIRING-BLUEPRINT.md`
- Retrieval Lanes Decision Tree: Project root `CLAUDE.md` §"Retrieval Lanes — Vector vs Hyper-Graph-RAG"
