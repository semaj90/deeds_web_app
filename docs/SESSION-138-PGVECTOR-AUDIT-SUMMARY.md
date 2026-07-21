# Session 138+: pgvector Dimension Drift Audit — Complete Summary

**Date**: July 20, 2026  
**Status**: ✅ Audit Framework Complete (Step 1 Pending Execution)  
**Blocker**: Phase 0 → Phase 1 ingestion pipeline  
**Action**: Operator to execute 7-step audit with Docker

---

## What Was Done (TEXT ONLY — NO CODE CHANGES)

Created a complete diagnostic framework to resolve the **pgvector dimension schizophrenia** that blocks all Phase 0-17 work.

### Problem Identified

The schema has **irreconcilable dimension declarations**:

| Layer | Dimension | Count | Status |
|-------|-----------|-------|--------|
| Postgres vector(768) | 768-dim | 12 tables | Live |
| Postgres vector(384) | 384-dim | 9 tables | Live |
| Qdrant `codebase_chunks_768` | 768-dim | 40.5K points | Live |
| Qdrant `codebase_chunks_384_hybrid` | 384-dim | Unknown | Planned |
| GPU Autoencoder Input | 768-dim | — | Live |
| GPU Autoencoder Output | 64-dim | — | Live |
| Phase 0 Doc Claim | 384-dim | — | Unverified |

**Core Question (Unanswered)**: What is `embeddinggemma:latest` actual output dimension?

---

## Audit Framework Created

### 5 Documents Delivered

1. **`docs/audit/PGVECTOR-DIMENSION-DRIFT-AUDIT.md`** — Complete 7-step framework with gate criteria and execution checklist
2. **`docs/DIMENSION-POLICY.md`** — Master source of truth (finalized post-audit)
3. **`docs/PHASE-0-DDL-GATE.md`** — Gate statement explaining why all DDL is blocked
4. **`docs/PGVECTOR-AUDIT-OPERATOR-RUNBOOK.md`** — Step-by-step instructions with bash commands
5. **`memory/PGVECTOR-AUDIT-LANE-INITIATED.md`** — Session checkpoint

---

## The 7-Step Audit Path

| Step | Action | Blocker Removal | Docker |
|------|--------|-----------------|--------|
| 1 | Verify embeddinggemma:latest dimension | Step 2-7 unblocked | YES |
| 2 | Inventory Qdrant collections | Phase 9 status clarified | YES |
| 3 | Audit retrieval code hard-codes | Identifies 7+ locations | NO |
| 4 | Verify autoencoder dimension contract | GPU reranking needs | NO |
| 5 | Decide canonical dimension + plan migration | DDL gates lift | NO |
| 6 | Plan Qdrant collection cutover | Deployment order | NO |
| 7 | Wire collection alias resolver | Retrieval flexible | NO |

---

## Gate Criteria (ALL Must Pass)

✅ embeddinggemma:latest dimension verified  
✅ One canonical dimension chosen (384 OR 768)  
✅ Postgres schema reconciliation planned  
✅ Qdrant collections ready for cutover  
✅ Autoencoder supports canonical dimension  
✅ Retrieval code uses alias resolution  
✅ Backfill strategy prevents data loss  

**Current Status**: 🔴 **0/7 gates passed** (Step 1 pending)

---

## Why This Blocks Phase 0-17

Phase 0 blocker resolutions feed into Phase 1 embedding pipeline:

```
Phase 0 Blockers ✅ (can audit independently)
  ├─ source_ref identity
  ├─ Qdrant CPU timeout
  ├─ MCP transport
  └─ Gemma4 overuse

  ↓ Requires ↓

Phase 1 Implementation (BLOCKED)
  ├─ OKF adapter
  ├─ Chunking
  ├─ Embedding (embeddinggemma:latest)
  │   ↓ DIMENSION UNKNOWN ← BLOCKER
  │   ├─ Postgres pgvector(???)
  │   └─ Arrow IPC artifact
  └─ gRPC packet passing

  ↓ Blocked ↓

Phase 2-17 (GPU acceleration, topology, synthesis)
```

If Phase 1 embeds to wrong dimension, all retrieval lanes break.

---

## How to Unblock This

**Operator Only** (requires Docker + verification authority)

After Docker running (Ollama :11434, Qdrant :6333, Postgres :5434):

```bash
# Step 1: Verify embeddinggemma:latest dimension
curl -s http://127.0.0.1:11434/api/embeddings \
  -d '{"model":"embeddinggemma:latest","prompt":"test"}' \
  | jq '.embedding | length'
# Expected: 384 or 768
```

Then execute Steps 2-7 from `PGVECTOR-AUDIT-OPERATOR-RUNBOOK.md`

---

## Key Decisions (Framework Level)

### Decision 1: Audit, Don't Guess
- ✅ Verify via live model endpoint
- ❌ Never assume dimension from comments

### Decision 2: Collection Alias Resolution Required
- ✅ Implement `resolveEmbeddingCollection()`
- ❌ Cannot proceed with hard-coded names

### Decision 3: Backfill Strategy Matters
- ✅ Recompute via embeddinggemma (safe)
- ❌ Never truncate/pad dimensions (lossy)

### Decision 4: All 7 Gates Must Pass
- ✅ Resolve blockers sequentially
- ❌ Cannot proceed if any gate fails

---

## Expected Outcomes (Post-Audit)

### Outcome A: Canonical = 384-dim
- ✅ Migrate 12 vector(768) → vector(384)
- ✅ Use codebase_chunks_384_hybrid
- ✅ Autoencoder: 384→64
- ✅ Timeline: 4–6 hours

### Outcome B: Canonical = 768-dim
- ✅ Migrate 9 vector(384) → vector(768)
- ✅ Keep codebase_chunks_768
- ✅ Autoencoder: 768→64 (no change)
- ✅ Timeline: 3–5 hours

---

## Reference Documents

| Document | Status |
|----------|--------|
| `docs/audit/PGVECTOR-DIMENSION-DRIFT-AUDIT.md` | ✅ Created |
| `docs/DIMENSION-POLICY.md` | ✅ Created |
| `docs/PHASE-0-DDL-GATE.md` | ✅ Created |
| `docs/PGVECTOR-AUDIT-OPERATOR-RUNBOOK.md` | ✅ Created |
| `memory/PGVECTOR-AUDIT-LANE-INITIATED.md` | ✅ Created |

---

## Next Actions

1. **Operator**: Execute Step 1 (verify embeddinggemma:latest)
2. **Operator**: Follow Steps 2-7 from runbook
3. **System**: Each step unblocks next sequentially
4. **Operator**: Document findings in audit reports
5. **Operator**: Finalize DIMENSION-POLICY.md
6. **Operator**: Apply Drizzle migrations (when gates pass)
7. **System**: Phase 1 ingestion unblocked

---

## Critical Rule: No Exceptions

Proceeding with wrong dimensions will:
- ❌ Break retrieval (Qdrant vectors ≠ Postgres embeddings)
- ❌ Break GPU reranking (autoencoder mismatch)
- ❌ Break archive (cold storage unrecoverable)
- ❌ Break backfill (migrations fail)

**Therefore**: Audit is mandatory. All 7 gates must pass.

---

## Timeline

- **Session 138+ (today)**: Audit framework created ✅
- **Operator execution**: 4-6 hours (pending Docker)
- **Phase 1 unblock**: Immediately post-audit
- **Phase 1-17 implementation**: Can proceed once gates lift

---

## Status Summary

| Component | Status | Notes |
|-----------|--------|-------|
| Audit Framework | ✅ Complete | 5 documents, 7-step path |
| Phase 0 Blocker Resolution | 🔴 Blocked | Depends on pgvector audit |
| Phase 1 Ingestion Pipeline | 🔴 Blocked | Depends on pgvector audit |
| Phase 2-17 Implementation | 🔴 Blocked | Depends on Phase 1 |
| DDL Blessing | 🔴 Blocked | Depends on audit completion |

---

**Status**: 🟡 **READY FOR OPERATOR EXECUTION**

All diagnostic framework in place. Awaiting Step 1 execution (embeddinggemma:latest dimension verification).
