# Phase 0: DDL Gate — pgvector Dimension Drift Blocker

**Status**: 🔴 **BLOCKING ALL DDL** — pgvector audit must complete before any migrations  
**Date**: July 20, 2026  
**Severity**: CRITICAL — Blocks Phases 1–17 ingestion pipeline

---

## The Blocker

**No Drizzle pgvector migrations can be applied** until the pgvector dimension audit (7-step framework) completes and resolves:

> **What is the canonical embedding dimension in this project? 384-dim or 768-dim?**

This question has no answer. The schema has both. Retrieval code assumes different dimensions at different stages. The embedding model's actual output dimension is unverified.

**Consequence**: If we migrate Postgres to the wrong dimension, all retrieval lanes break. We cannot proceed without verification.

---

## Why This Blocks Phase 0 (and Everything After)

Phase 0 has four blockers:
1. ✅ source_ref identity derivation (can proceed with audit)
2. ✅ Qdrant CPU timeout risk (can proceed with benchmark)
3. ✅ MCP transport boundary (can proceed with health check)
4. ✅ Gemma4 artifact overuse (can proceed with audit)

**BUT**: All Phase 0 blockers feed into **Phase 1 implementation**, which assumes a specific dimension for the ingestion Arrow IPC artifact. If Phase 0 doesn't specify whether `embedding_384_f16` or `embedding_768_f16` is canonical, Phase 1 can't wire the embedding worker.

**Root Cause of the Drift**: The schema was built incrementally. Early work used 768-dim (matched Qdrant). Later work added 384-dim (matched new embedding model assumptions). Neither was ever canonical.

---

## The Evidence

### Schema Declares Both Dimensions

**vector(768)** — 12 tables:
- `atlas_packets.embedding`
- `legal_chunks.embedding`
- `workspace_notes.embedding`
- ... and 9 more

**vector(384)** — 9 tables:
- `embedding_index.embedding`
- `legal_cases.case_embedding`
- `gpu_cache.source_embedding`
- ... and 6 more

### Qdrant Collections Target Different Dimensions

**Live** (40.5K points):
- `codebase_chunks_768` — 768-dim (hard-coded in retrieval code)

**Planned** (Phase 9):
- `codebase_chunks_384_hybrid` — 384-dim (declared, status unknown)

### Retrieval Code Hard-Codes Collections

No alias resolution. If we rename Qdrant collections, code breaks:

```typescript
// centroid-cache.ts:194
const collection = 'codebase_chunks_768'; // ← Hard-coded, no config

// go-retrieval-orchestrator.ts:156
await qdrant.search('codebase_chunks_768', {...}); // ← Hard-coded again
```

### Embedding Model Dimension is Unverified

Phase 0 doc claims: **"embeddinggemma:latest (384-dim)"**

Reality: **Never tested in live deployment**

If the actual model outputs 768-dim, then 384-dim columns are wrong. If it outputs 384-dim, then 768-dim columns are wrong. We cannot know without running it.

---

## The 7-Step Audit (Full Process)

See `docs/audit/PGVECTOR-DIMENSION-DRIFT-AUDIT.md` for complete framework.

**Short version**:

| Step | Action | Blocker Removed? |
|------|--------|------------------|
| 1 | Verify embeddinggemma:latest dimension (run live Ollama) | Step 2-7 unblocked |
| 2 | Inventory Qdrant collections (run live Qdrant) | Clarifies phase 9 status |
| 3 | Audit retrieval code hard-codes (code analysis) | Identifies 7+ locations |
| 4 | Verify autoencoder dimension contract (schema review) | Clarifies GPU reranking needs |
| 5 | Decide canonical dimension + plan migration | DDL blocked/approved |
| 6 | Plan Qdrant collection cutover | Deployment order clarified |
| 7 | Wire collection alias resolver (code change) | Retrieval flexible for future |

---

## Gate Criteria (Must ALL Pass)

✅ embeddinggemma:latest dimension verified (not guessed)  
✅ One canonical dimension chosen (384 OR 768, not both)  
✅ Postgres schema reconciliation planned (migration SOP)  
✅ Qdrant collections ready for cutover (or kept as-is)  
✅ Autoencoder supports canonical dimension  
✅ Retrieval code uses alias resolution (no hard-codes)  
✅ Backfill strategy prevents data loss  

**Status**: 🔴 **0/7 gates passed** (Step 1 is first gate)

---

## How to Unblock This

**Prerequisite**: Docker is running with Ollama :11434, Qdrant :6333, Postgres :5434

**Action**: Run Step 1 of the audit

```bash
# Verify embeddinggemma:latest dimension
curl -s http://127.0.0.1:11434/api/embeddings \
  -d '{"model":"embeddinggemma:latest","prompt":"test"}' \
  | jq '.embedding | length'
```

**Expected output**: 384 or 768

**Document the result** in `docs/EMBEDDING-MODEL-DIMENSION.md`

**Then proceed to Steps 2–7** sequentially.

---

## Timeline Impact

| If Unblocked By | Path | Duration | Outcome |
|---|---|---|---|
| Today (July 20) | All 7 steps complete | 4–6 hours | DDL blessed by end of day |
| Tomorrow | All 7 steps complete | 4–6 hours | Phase 1 starts next day |
| Deferred | Audit incomplete | TBD | Phase 0–17 blocked indefinitely |

---

## References

- **Audit Framework**: `docs/audit/PGVECTOR-DIMENSION-DRIFT-AUDIT.md`
- **Dimension Policy**: `docs/DIMENSION-POLICY.md` (will be finalized post-audit)
- **Phase 0 Blockers**: `docs/PHASE-0-BLOCKER-RESOLUTION.md`
- **Memory Checkpoint**: `memory/PGVECTOR-AUDIT-LANE-INITIATED.md`

---

## Rule: No Exceptions

**This gate cannot be bypassed.** The consequences of proceeding with wrong dimensions are:

1. **Retrieval completely breaks** — Qdrant vectors don't match Postgres embeddings
2. **GPU reranking breaks** — Autoencoder expects one dimension, gets another
3. **Archive breaks** — Cold storage artifacts become unrecoverable
4. **Backfill fails** — Migrations can't run without knowing source dimension

**Therefore**: Audit is not optional. Unblock Step 1, proceed through Steps 2–7, finalize policy, THEN apply DDL.

---

## Who Can Unblock This

**Operator only** (requires Docker access + verification authority)

**Cannot be automated** (requires judgment about model behavior)

---

## Status Updates

- **2026-07-20 07:00 UTC** — Gate created, audit framework initiated
- **2026-07-20 12:00 UTC** — Step 1 execution pending (awaiting Docker + Ollama)
- **[Future]** — Steps 2–7 follow as data arrives
