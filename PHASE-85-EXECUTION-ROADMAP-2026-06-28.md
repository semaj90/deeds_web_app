# Phase 85 P5-P9 + Graphify Integration — Execution Roadmap
**2026-06-28 | Post-Docker Recovery + npm Alias Fixes**

---

## 🎯 WHERE YOU ARE NOW

✅ **Docker**: 21/21 services UP, healthy, data intact (58,304 packets)
✅ **Postgres**: All data safe (40,754 chunks, 18,046 packets with feature labels)
✅ **Graphify**: npm aliases FIXED (graphify:authority + karpathy:gpu now work)
✅ **Phase 85**: P5-P9 WIRED, PROVEN, DEPLOYMENT-READY

---

## 🚀 THREE-TIER EXECUTION PLAN

### TIER 1: RECOVERY & VALIDATION (5-10 min) — START HERE

**Goal**: Restore Qdrant mirrors, verify data integrity

```bash
# Step 1: Restore Qdrant from Postgres (DRY-RUN FIRST)
npm run atlas:restore:mirrors:dry
# Expected: "40,568 vectors ready for upsert (406 batches @ 100 points)"

# If dry-run looks good, apply:
npm run atlas:restore:mirrors:apply
# Estimate: 5-10 min (406 batches, 100 points each)

# Step 2: Validate restoration
curl http://localhost:6333/collections/codebase_chunks_768
# Check: "points_count": 40568
```

**Expected Result**: 40,568 points restored to Qdrant, all vector dimensions OK

---

### TIER 2: GRAPHIFY PIPELINE (15-30 min) — THEN DO THIS

**Goal**: Compute authority scores, warm cache, materialize ACE context

```bash
# Step 1: Compute PageRank authority
npm run graphify:authority
# Estimate: 5-10 min (PageRank computation on Neo4j)

# Step 2: Compute Karpathy GPU blend
npm run karpathy:gpu
# Estimate: 2-5 min (attention + authority blend)

# Step 3: Full materialization startup
npm run startup:ace:materialize
# Estimate: 5-10 min (warms cache, builds ACE context)
```

**Expected Result**: 3,251 Redis keys populated (gpu:karpathy:scores), cache warm

---

### TIER 3: PHASE 85 SUMMARY GENERATION (30-60+ min) — OPTIONAL THIS SESSION

**Goal**: Generate summaries for 40,754 chunks via Gemma4

**Prerequisites**:
- ✅ Postgres online (verified)
- ✅ Qdrant online (will be restored in Tier 1)
- ✅ Redis/Valkey online (verified)
- ⚠️ Gemma4 llama-server running on :8090 (start separately)
- ⚠️ RabbitMQ online (verified)

```bash
# Step 0: Start Gemma4 llama-server (SEPARATE TERMINAL)
npm run turbo:start
# Wait for: "llama-server listening on port 8090"

# Back in main terminal:

# Step 1: Test with sample batch
npm run atlas:p6:rebuild:summaries:sample
# Estimate: 30-60s (generates 10 sample summaries)

# Step 2 (if sample passes): Full backfill
npm run atlas:p6:rebuild:summaries:apply
# Estimate: 2-4 hours (generates all 40,754 summaries)

# Step 3: Invalidate Redis cache
npm run atlas:p6:redis:invalidate:apply
# Estimate: 5-10 min
```

**Expected Result**: 
- summary_text + summary_confidence populated in Postgres
- Redis cache invalidated
- RabbitMQ events emitted

---

### TIER 4: POST-GENERATION LANES (1-2 hours) — ADVANCED

Only run if P6 summaries complete successfully:

```bash
# P7: Event Emission
npm run atlas:p7:event:emit:apply

# P8: Semantic Diff (optional, conservative)
npm run atlas:p8:semantic-diff:dry

# P9: Agentic Error Fixing (requires LangExtract)
npm run startup:p9:langextract:dry
```

---

## 📊 RECOMMENDED EXECUTION SEQUENCES

### OPTION A: QUICK (20 min) — Data Integrity + Graphify

```bash
1. npm run atlas:restore:mirrors:apply       # 5-10 min
2. npm run graphify:authority                # 5-10 min
3. npm run startup:ace:materialize           # 3-5 min
```

✅ **Result**: Data restored, cache warm, P0-P1 complete

---

### OPTION B: FULL SESSION (2+ hours) — Add Summary Generation

```bash
# First run Tiers 1-2
1. npm run atlas:restore:mirrors:apply       # 5-10 min
2. npm run graphify:authority                # 5-10 min
3. npm run startup:ace:materialize           # 3-5 min

# Start Gemma4 in SEPARATE terminal
npm run turbo:start

# Back in main terminal, run Tier 3
4. npm run atlas:p6:rebuild:summaries:sample # 1-2 min
5. npm run atlas:p6:rebuild:summaries:apply  # 2-4 hours
6. npm run atlas:p6:redis:invalidate:apply   # 5-10 min
```

✅ **Result**: All summaries generated, fully materialized

---

## 🎯 DECISION MATRIX

**Pick Option A if you**:
- Want to verify infrastructure is healthy quickly
- Plan to run summaries tomorrow or next session
- Don't have 2+ hours available right now

**Pick Option B if you**:
- Have 2+ hours available now
- Want to fully materialize the system tonight
- Ready to test Phase 85 P6 in production

---

## ⏰ TIME ESTIMATES (with 95% confidence)

| Task | Duration | Notes |
|------|----------|-------|
| atlas:restore:mirrors:apply | 5-10 min | 406 batches, 100 points each |
| graphify:authority | 5-10 min | PageRank computation |
| karpathy:gpu | 2-5 min | Attention blend |
| startup:ace:materialize | 5-10 min | Cache warming |
| **Option A Total** | **20-30 min** | Recovery + Graphify |
| atlas:p6:rebuild:summaries:sample | 1-2 min | 10 test summaries |
| atlas:p6:rebuild:summaries:apply | 2-4 hours | 40,754 chunks at 1-2 per sec |
| atlas:p6:redis:invalidate:apply | 5-10 min | Cache invalidation |
| **Option B Total** | **2.5-4.5 hours** | Full materialization |

---

## ⚠️ CRITICAL DEPENDENCIES

### For Tier 1 (Recovery)
- ✅ Postgres (verified online)
- ✅ Qdrant (verified online)
- ⚠️ Ensure no other processes writing to Qdrant (safe: batched upsert)

### For Tier 2 (Graphify)
- ✅ Postgres (verified)
- ✅ Redis/Valkey (verified)
- ⚠️ Neo4j online (for PageRank)
- ⚠️ Qdrant online (for blend computation)

### For Tier 3 (Summaries)
- ✅ Postgres (verified)
- ✅ Redis/Valkey (verified)
- ⚠️ **Gemma4 llama-server MUST be running on :8090** (start separately)
- ⚠️ RabbitMQ online (for event emission, verified)

---

## 💡 SAFETY RULES

**1. ALWAYS dry-run first**
```bash
npm run atlas:restore:mirrors:dry  # before apply
npm run atlas:p6:rebuild:summaries:dry  # before apply
```

**2. CHECKPOINT between tiers**
- Don't proceed to Tier 2 until Tier 1 fully succeeds
- Don't proceed to Tier 3 until Tier 2 fully succeeds

**3. MONITOR progress**
```bash
# Check Gemma4 status
curl http://localhost:8090/v1/models

# Check summary progress (after P6 starts)
docker exec legal-ai-postgres psql -U legal_admin -d legal_ai_db \
  -c "SELECT count(*) FROM codebase_chunk_index WHERE summary_text IS NOT NULL"
```

**4. HANDLE FAILURES**

If summary generation fails:
- Check Gemma4 online: `curl http://localhost:8090/v1/models`
- Check Postgres responsive: `psql -h 127.0.0.1 -p 5434 -U legal_admin -d legal_ai_db -c "SELECT 1"`
- Resume from where it stopped (if script has `--resume` flag)

---

## 🎓 EXPECTED OUTCOMES

### After Tier 1
- ✅ 40,568 vectors in Qdrant (codebase_chunks_768)
- ✅ Postgres data integrity verified
- ✅ All dimensions correct (768-dim content)

### After Tier 2
- ✅ 3,251 Redis keys populated (gpu:karpathy:scores)
- ✅ Neo4j PageRank computed
- ✅ ACE context cache warm
- ✅ System ready for retrieval queries

### After Tier 3 (if running)
- ✅ 40,754 summaries generated via Gemma4
- ✅ summary_text + summary_confidence fields populated
- ✅ 384-dim summary embeddings generated (optional, after AE training)
- ✅ RabbitMQ events emitted
- ✅ System fully materialized, P0-P1-P5-P6 complete

---

## 📋 QUICK COMMAND REFERENCE

```bash
# Health checks
docker ps | grep legal-ai
curl http://localhost:6333/collections/codebase_chunks_768
curl http://localhost:8090/v1/models  # Gemma4 status

# Option A (Quick)
npm run atlas:restore:mirrors:apply && \
npm run graphify:authority && \
npm run startup:ace:materialize

# Option B (Full) — requires Gemma4 in separate terminal
npm run atlas:restore:mirrors:apply && \
npm run graphify:authority && \
npm run startup:ace:materialize && \
npm run atlas:p6:rebuild:summaries:sample && \
npm run atlas:p6:rebuild:summaries:apply && \
npm run atlas:p6:redis:invalidate:apply
```

---

## 📁 REFERENCE DOCUMENTS

- `docs/PHASE-85-P5-P9-INTEGRATION-SUMMARY.md` — Full specification
- `docs/dimension-policy.md` — Dimension standards (768 content, 384 summaries)
- `drizzle/manual/0099_add_pgvector_384_canonical.sql` — Schema migration
- `drizzle/manual/0100_add_summary_canonical_envelope.sql` — Envelope schema

---

**Status**: READY FOR EXECUTION
**Next Action**: Pick Option A or B and start with Tier 1
**Generated**: 2026-06-28 22:30 UTC
