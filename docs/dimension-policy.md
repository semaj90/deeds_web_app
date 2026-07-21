# Canonical Dimension Policy

**Status**: 🔴 PENDING — Blocked by pgvector audit (Step 1)  
**Created**: July 20, 2026  
**Last Updated**: July 20, 2026

---

## Purpose

This document serves as the **single source of truth** for embedding vector dimensions across the project. All retrieval lanes, Qdrant collections, Postgres tables, and GPU operations must reference this policy for dimension decisions.

**DO NOT** hard-code dimensions in code. Import from this document instead.

---

## Policy Status: UNRESOLVED

### Current State (July 20, 2026)

The project has conflicting dimension declarations:

| Layer | Declared Dimension | Evidence | Status |
|-------|-------------------|----------|--------|
| Ingestion Model | 384-dim | Phase 0 doc: "embeddinggemma:latest (384-dim)" | ⚠️ Unverified |
| Postgres (vector 768) | 768-dim | 12 tables: legal_chunks, atlas_packets, etc. | ⚠️ Live |
| Postgres (vector 384) | 384-dim | 9 tables: embedding_index, legal_cases, etc. | ⚠️ Live |
| Qdrant Live | 768-dim | `codebase_chunks_768` (40.5K points) | ⚠️ Live |
| Qdrant Target (Phase 9) | 384-dim | `codebase_chunks_384_hybrid` (status unknown) | ⚠️ Planned |
| GPU Reranking Input | 768-dim | autoencoder-compression-pipeline.ts | ⚠️ Live |
| GPU Reranking Output | 64-dim | Clustering via 768→64 compression | ✅ Confirmed |

**Contradiction**: No single dimension is consistent across all layers.

---

## Audit Path to Resolution

This policy will be **finalized after** the 7-step audit in `docs/audit/PGVECTOR-DIMENSION-DRIFT-AUDIT.md` completes.

**Expected Outcomes** (one will be chosen):

### Outcome A: Canonical = 384-dim

```
embeddinggemma:latest (384-dim)
  ↓
Postgres pgvector(384)  ← Canonical storage
  ↓
Qdrant codebase_chunks_384_hybrid (384-dim content vector)
  ↓
GPU Reranking: 384→64 autoencoder (or upsample to 768→64)
```

**Implications**:
- Migrate 12 vector(768) columns to vector(384)
- Backfill via recompute (safe) or truncate (lossy)
- Cutover Qdrant from `codebase_chunks_768` to `codebase_chunks_384_hybrid`
- Retrain or adapt autoencoder to 384→64

### Outcome B: Canonical = 768-dim

```
embeddinggemma:latest (768-dim, Phase 0 doc is wrong)
  ↓
Postgres pgvector(768)  ← Canonical storage
  ↓
Qdrant codebase_chunks_768 (768-dim content vector)
  ↓
GPU Reranking: 768→64 autoencoder (keep as-is)
```

**Implications**:
- Migrate 9 vector(384) columns to vector(768)
- Backfill via upsample or recompute
- Qdrant stays on `codebase_chunks_768` (no cutover)
- Autoencoder stays unchanged

---

## Critical Rules (Before and After Audit)

### BEFORE Audit Finalizes (NOW)

- ❌ **DO NOT apply Drizzle migrations** involving pgvector columns
- ❌ **DO NOT create new vector tables** without dimension guidance from operator
- ❌ **DO NOT hard-code dimensions** in new retrieval code (use config constants)
- ✅ **DO run the 7-step audit** (blocks all DDL decisions)
- ✅ **DO document assumptions** if code references embeddinggemma dimensions

### AFTER Audit Finalizes (Post-Resolution)

- ✅ Update this file with canonical dimension (384 or 768)
- ✅ Apply Drizzle migration (backfill + schema change)
- ✅ Migrate Qdrant collections (cutover plan)
- ✅ Update retrieval code (use alias resolver, no hard-codes)
- ✅ Retrain GPU operations if needed (autoencoder for new dimension)

---

## References

- Audit Framework: `docs/audit/PGVECTOR-DIMENSION-DRIFT-AUDIT.md`
- Phase 0 Blockers: `docs/PHASE-0-BLOCKER-RESOLUTION.md`
- Retrieval Lanes: Project root `CLAUDE.md`
