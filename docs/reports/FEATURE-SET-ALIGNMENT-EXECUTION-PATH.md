# Feature-Set Alignment Execution Path
## Session 137+ (Continued): Live Smoke Test → Backfill Lanes → PASS (75+/100)

**Date**: July 11, 2026  
**Current Smoke Score**: 50/100 (WARN ⚠️)  
**Target Smoke Score**: 75+/100 (PASS ✅)  
**Work Duration**: 4-5 hours estimated

---

## Current State (Just Measured)

```
Semantic:   100% ✅ (58,365/58,365)
Structural: 100% ✅ (58,365/58,365)
Lexical:      0% ❌ (0/58,365)
Domain:     100% ✅ (58,365/58,365)
Embedding:    0% ❌ (0/58,365)
Topology:     0% ❌ (0/58,365)

Overall:    50/100 WARN ⚠️
```

Three lanes are completely empty (Lexical, Embedding, Topology). The backfill plan targets filling these to reach PASS.

---

## Execution Order & Dependencies

```
LANE 1 (Lexical)      [sequential, CPU-bound]    2.5 hours
  └─ Backfill term extraction from summary/title
  └─ Pattern-based extraction (ERROR_CODES, CONSTANTS, ENDPOINTS)
  └─ Target: 0% → 80%+ coverage

LANE 2 (Embedding)    [sequential, GPU-bound]    2 hours
  ├─ Prerequisite: Ollama embeddinggemma:latest online
  ├─ Batch 50 packets/request via HTTP
  └─ Target: 0% → 80%+ coverage

LANE 3 (Topology)     [GPU-only, deferred]       2.5 hours
  ├─ Prerequisite: Lane 2 (embeddings) ≥50% complete
  ├─ Compute KMeans (K=25, PyTorch GPU)
  ├─ Build SOM 20×20 grid
  └─ Target: 0% → 50%+ (acceptable partial for PASS)

Sequential Total: 5-7 hours
Parallel (Lanes 1+2): 2.5 hours (overlappable with Lanes 3)
```

---

## npm Command Reference

### Smoke Test (Current State)

```bash
# Measure all 6 lanes
npm run atlas:feature-set:alignment:smoke

# Measure + show gaps
npm run atlas:feature-set:alignment:smoke:audit

# Detailed output
npm run atlas:feature-set:alignment:smoke:verbose
```

### Lane 1: Lexical (Term Extraction)

```bash
# Dry-run on 100 samples
npm run atlas:backfill:lexical:dry

# Apply full backfill (10,000 packets)
npm run atlas:backfill:lexical:apply
```

**What it does**: Extracts terms from packet summaries/titles, computes BM25-like scores, stores in `payload.lexical_features` JSONB.

**Expected result**: Lexical coverage 0% → 80%+ in ~30 min

### Lane 2: Embedding (384-dim Vectors)

```bash
# Dry-run on 100 samples (requires Ollama)
npm run atlas:backfill:embedding:dry

# Apply full backfill (500 packets, batch size 50)
npm run atlas:backfill:embedding:apply
```

**Prerequisites**:
```bash
# Check Ollama is running
curl http://127.0.0.1:11434/api/tags | jq '.models[] | select(.name | contains("embedding"))'
```

**Expected result**: Embedding coverage 0% → 80%+ in ~1.5 hours

### Lane 3: Topology (SOM + PageRank)

```bash
# Check prerequisites (Embedding must be ≥50%)
npm run atlas:backfill:topology:plan

# Full backfill (requires GPU infrastructure)
npm run atlas:backfill:topology:dry  # Plan mode, shows what's needed
```

**Prerequisites**:
- Lane 2 (embeddings) must be ≥50% complete
- PyTorch GPU infrastructure (NOT YET IMPLEMENTED)

**Expected result**: Topology coverage 0% → 50%+ in ~2 hours (GPU work)

---

## Step-by-Step Execution

### Phase 1: Measure Current State (5 min)

```bash
cd sveltekit-frontend

# Run smoke test to see current lane coverage
npm run atlas:feature-set:alignment:smoke:audit
```

**Expected output**: 50/100 WARN, with 3 lanes at 0% (Lexical, Embedding, Topology)

### Phase 2: Backfill Lane 1 (Lexical) — 30 min

```bash
# Dry-run: test on 100 packets
npm run atlas:backfill:lexical:dry

# Review output, verify logic is correct

# Apply: full backfill on 10,000 packets
npm run atlas:backfill:lexical:apply

# Verify new coverage
npm run atlas:feature-set:alignment:smoke:audit
```

**After this phase**: Smoke score should jump to ~58/100 (Lexical 80%+)

### Phase 3: Backfill Lane 2 (Embedding) — 1.5 hours

**Prerequisites**: Ollama must be running with embeddinggemma:latest

```bash
# Start Ollama (if not already running)
ollama serve &
# Wait for it to be ready

# Verify Ollama is accessible
curl http://127.0.0.1:11434/api/tags | jq .

# Dry-run: test on 100 packets
npm run atlas:backfill:embedding:dry

# If successful, apply full backfill
npm run atlas:backfill:embedding:apply
# (This will take ~1-1.5 hours for 500 packets at 50/batch)

# Verify coverage
npm run atlas:feature-set:alignment:smoke:audit
```

**After this phase**: Smoke score should jump to ~67/100 (Embedding 80%+)

### Phase 4: Backfill Lane 3 (Topology) — 2 hours

⚠️ **This requires GPU work (PyTorch) which is NOT YET IMPLEMENTED**

```bash
# Check prerequisites (embeddings must be ≥50%)
npm run atlas:backfill:topology:plan

# Output will show:
# - Current embedding coverage
# - Current SOM/PageRank coverage
# - What needs to be built
```

**Blockers**:
- PyTorch GPU infrastructure script needs to be created: `scripts/atlas/topology-kmeans-som.py`
- KMeans clustering (K=25) with GPU acceleration
- SOM grid assignment
- PageRank computation (Neo4j or NetworkX)

**Workaround**: If GPU infrastructure is not ready, the first 3 lanes (Lexical, Embedding) alone bring score from 50 → 65-70 (WARN but improving).

### Phase 5: Final Smoke Test (5 min)

```bash
# Run final smoke test
npm run atlas:feature-set:alignment:smoke

# Expected: ≥75/100 PASS ✅ (if all lanes complete)
# If Topology blocked: expect ~65-70/100 (still WARN but closer)
```

---

## Expected Progress Timeline

| Phase | Task | Duration | Coverage Gain | New Smoke Score |
|-------|------|----------|---------------|-----------------|
| 0 | Measure baseline | 5 min | — | 50/100 |
| 1 | Lexical backfill | 30 min | +16% | 58/100 |
| 2 | Embedding backfill | 1.5 h | +16% | 67/100 |
| 3 | Topology backfill | 2 h | +9% | 75/100 ✅ |
| **Total** | **3 phases** | **~4 hours** | **~40%** | **75/100 PASS** |

---

## Success Criteria

**PASS**: All three criteria met:
- [ ] Smoke score ≥75/100
- [ ] Lexical coverage ≥70%
- [ ] Embedding coverage ≥75%
- [ ] (Optional) Topology coverage ≥40%

**Validation gate commands**:
```bash
npm run atlas:feature-set:alignment:smoke:audit
npm run atlas:feature-set:alignment:smoke:verbose
```

Both should show:
- Lexical: 70%+ ✅
- Embedding: 75%+ ✅
- Topology: 40%+ (or 0% if GPU work deferred)
- Overall score: 75+/100 PASS

---

## Rollback / Abort Strategy

If any phase fails, you can:

1. **Abort Lexical mid-run**: No data persisted, just re-run with lower `--limit`
2. **Abort Embedding mid-run**: Already-embedded packets stay in DB, re-run continues from NULL embeddings
3. **Rollback Topology**: Topology not yet implemented, nothing to rollback

To reset a lane to 0% (for clean re-run):
```bash
# DO NOT RUN unless you want to clear everything
docker exec legal-ai-postgres psql -U legal_admin -d legal_ai_db -c \
  "UPDATE atlas_packets SET payload = jsonb_set(payload, '{lexical_features}', 'null') WHERE payload->>'lexical_features' IS NOT NULL;"
```

---

## Next Steps After PASS

Once Feature-Set Alignment reaches PASS (75+/100), unblock:

1. **Phase 8.6 (Existing Kanban)**: 15+ bounded tasks (Qdrant Point ID bridge, Tree Node ID propagation, Source-Ref propagation, etc.)
2. **Phase 8.7 (Neo4j GDS Suite)**: PageRank, Louvain community detection, CheiRank + K-core
3. **Phase 9 (Benchmark)**: Precision@10, latency breakdown, recall correlation study

---

## Appendix: Lane Implementation Status

### Lane 1: Lexical
- ✅ Script created: `scripts/atlas/backfill-lexical-lane.mjs`
- ✅ Algorithm: Term extraction from summary/title + pattern matching
- ✅ Ready to execute

### Lane 2: Embedding
- ✅ Script created: `scripts/atlas/backfill-embedding-lane.mjs`
- ✅ Algorithm: Ollama HTTP API batch (50 packets/req)
- ✅ Ready to execute (requires Ollama online)

### Lane 3: Topology
- ⚠️ Script stub created: `scripts/atlas/backfill-topology-lane.mjs`
- ❌ Algorithm: NOT YET IMPLEMENTED (requires PyTorch GPU infrastructure)
- ⏳ Blockers: Need topology-kmeans-som.py, GPU memory management, Neo4j GDS integration

---

**Status**: ✅ **READY FOR EXECUTION** (Lanes 1-2 fully implemented, Lane 3 requires GPU work)

**Start**: `npm run atlas:feature-set:alignment:smoke:audit` to see baseline

**End**: `npm run atlas:feature-set:alignment:smoke` shows 75+/100 PASS
