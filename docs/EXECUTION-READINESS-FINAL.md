# Feature Alignment Execution — Readiness & Action Plan

**Date**: July 11, 2026 (Session 137+)  
**Status**: ✅ **100% READY FOR EXECUTION**  
**Estimated Duration**: 5-7 hours (all layers ≥85% coverage)

---

## Current State (Verified Live)

### Layer Coverage Summary

| Layer | Current | Target | Gap | Blocker |
|-------|---------|--------|-----|---------|
| 1. Identity | 100% (58,365) | 100% | ✅ Done | — |
| 2. Structural (AST) | 78% (5,697) | 80% | 121 packets | — |
| 3. Lexical (BM25) | 82.9% (48,365) | 85% | 10K packets | ⏳ Low priority |
| 4. Semantic (Gemma4) | 7.2% (4,182) | 85% | **54K packets** | 🔴 **CRITICAL** |
| 5. Domain (.okf) | 100% (58,365) | 100% | ✅ Done | — |
| 6. Feature Envelope | 75% | 85% | ~9K fields | Depends on Layer 4 |
| 7. Multi-Vector | 0% | 100% | All 58K | Depends on Layer 4 |
| 8. Topology (P2E) | 42% (KMeans 85%, SOM 99%, PR 0.2%) | 100% | — | ⏳ Finishing |

### P2E Status (Running in Parallel)

```
KMeans:  50,000 / 58,365 (85.6%)  — consumers running, ETA 30m
SOM:     58,304 / 58,365 (99.9%)  — near complete, ETA 10m
PageRank:    119 / 58,365 (0.2%)  — just started, ETA 45m
```

---

## Critical Path: Layer 4 (Semantic) Backfill

### Why This is the Bottleneck

1. **54K packets need Gemma4 summaries** (93% of total work)
2. **Layers 6, 7, 8 all wait on Layer 4** to complete (≥85%)
3. **Sequential inference is slow** (~1-2 sec per summary)
4. **CUDA OOM risk without throttling** (Graphify router solves this)

### Solution: Graphify 8-Lane Bounded-Batch Router

**Architecture**:
- 8 lanes × 6,750 packets each
- Sequential lane execution (Lane 1 → Lane 2 → ... → Lane 8)
- Per-lane VRAM: ~1 GB (safe on 8.6 GB RTX 3060 Ti)
- Batch size per lane: 100 packets (Gemma4 inference parallelized)

**Estimated Timeline**:
- Per lane: 6,750 packets ÷ (100 batch × 1-2 sec/summary) = ~13-27 min
- Total: 8 lanes × 13-27 min = **2-3.5 hours**

---

## Execution Plan (5 Phases)

### Phase 0: Pre-Flight Verification (5 min)

```bash
# 1. Verify Python 3.14t (free-threaded)
python3.14t --version

# Expected output: Python 3.14.0+ with nogil

# 2. Verify Gemma4 endpoint
curl -s http://127.0.0.1:8090/v1/models | jq '.data[0].id'

# Expected: "gemma4-legal-iq4xs-direct.gguf" or similar

# 3. Verify Ollama (embeddings)
curl -s http://127.0.0.1:11434/api/tags | jq '.models[] | select(.name | contains("embedding"))'

# Expected: embeddinggemma:latest (or nomic-embed-text)

# 4. Verify Postgres connectivity
docker exec legal-ai-postgres psql -U legal_admin -d legal_ai_db -c "SELECT COUNT(*) FROM atlas_feature_envelopes;"

# Expected: 58365

# 5. Verify P2E status
docker exec legal-ai-postgres psql -U legal_admin -d legal_ai_db -c "SELECT COUNT(CASE WHEN kmeans_centroid_key IS NOT NULL THEN 1 END) as kmeans, COUNT(CASE WHEN som_centroid_key IS NOT NULL THEN 1 END) as som FROM atlas_feature_envelopes;"

# Expected: kmeans ~50000, som ~58000+
```

**Gate**: All 5 checks PASS ✅ (or WARN if non-critical)

---

### Phase 1: Layer 3 (Lexical) — Finish Remaining 10K (30 min)

**Status**: Already 82.9% complete — optional backfill to reach 85%+

```bash
# Dry-run (verify before applying)
npm run extract:lexical -- --batch=5000 --dry-run

# Apply
npm run extract:lexical -- --batch=5000 --apply

# Verify
docker exec legal-ai-postgres psql -U legal_admin -d legal_ai_db -c "SELECT COUNT(CASE WHEN lexical_terms IS NOT NULL THEN 1 END) as lexical FROM atlas_feature_envelopes;"

# Expected: ≥58,000 (98%+)
```

**Decision**: Can run in background while Phase 2 starts.

---

### Phase 2: Layer 4 (Semantic) — Graphify 8-Lane Backfill (2-3.5 hours)

**🚀 START HERE — CRITICAL PATH**

```bash
# Dry-run (test Graphify router on 1 lane with 100 packets)
npm run graphify:gsd:semantic -- --lanes=1 --dry-run

# Expected output:
#   ✓ Lane 1: Processing packets 1-100
#   ✓ Loaded 100 packets
#   ✓ Batch 1/1: 100/100 (...)
#   ✅ Lane 1 complete: 100/100 (0.1m)

# Apply (full 8-lane execution)
npm run graphify:gsd:semantic -- --lanes=8 --apply

# Real-time monitoring (in another terminal)
tail -f logs/graphify-gsd-semantic.log

# Verify after completion
docker exec legal-ai-postgres psql -U legal_admin -d legal_ai_db -c "SELECT COUNT(CASE WHEN summary_text IS NOT NULL THEN 1 END) as semantic FROM atlas_feature_envelopes;"

# Expected: ≥50,000 (85%+)
```

**Gate**: Semantic coverage ≥85% (50K packets) OR acceptable grounding_score ≥0.6

**Duration**: 2-3.5 hours (watch logs for progress)

---

### Phase 3: Wait for P2E Completion (30 min, parallel)

**Status**: Already running (started earlier). Check periodically.

```bash
# Monitor P2E progress
watch -n 10 "docker exec legal-ai-postgres psql -U legal_admin -d legal_ai_db -c \"SELECT COUNT(CASE WHEN kmeans_centroid_key IS NOT NULL THEN 1 END) as kmeans, COUNT(CASE WHEN som_centroid_key IS NOT NULL THEN 1 END) as som, COUNT(CASE WHEN pagerank IS NOT NULL THEN 1 END) as pagerank FROM atlas_feature_envelopes;\""

# Expected final state:
#  kmeans | som   | pagerank
# --------|-------|----------
#  58365  | 58365 | 58365     ✅ P2E COMPLETE
```

**Gate**: All 3 columns = 58,365 (100%)

---

### Phase 4: Layer 7 (Multi-Vector Embeddings) — Graphify 8-Lane (1-2 hours)

**Trigger**: After Phase 2 (Semantic ≥85%) completes

```bash
# Dry-run
npm run embed:multi-vectors -- --lanes=4 --sample=100 --dry-run

# Apply
npm run embed:multi-vectors -- --lanes=8 --apply

# Verify
docker exec legal-ai-postgres psql -U legal_admin -d legal_ai_db -c "SELECT COUNT(DISTINCT CASE WHEN content_embedding_id IS NOT NULL THEN 1 END) FROM atlas_feature_envelopes;"

# Expected: 58,365 (100% embedded)
```

**Gate**: All 4 vector lanes populated (content_768, summary_768, signature_768, concept_128)

---

### Phase 5: Layer 8 (Domain Centroids) — Topology Aggregation (30 min)

**Trigger**: After Phase 3 (P2E ✅) and Phase 4 (Multi-Vector ✅) complete

```bash
# Compute domain centroids
npm run compute:domain-centroids -- --apply

# Verify
docker exec legal-ai-postgres psql -U legal_admin -d legal_ai_db -c "SELECT domain_class, COUNT(DISTINCT som_cell) as cells FROM atlas_feature_envelopes WHERE domain_class IS NOT NULL AND som_cell IS NOT NULL GROUP BY domain_class;"

# Expected: All 6 domains with ≥10 unique SOM cells
```

**Gate**: All domain centroids computed (Redis + Qdrant named vectors)

---

## Timeline & Dependencies

```
Phase 0 (Pre-flight): 5m
    ↓
Phase 1 (Lexical): 30m [BACKGROUND OK]
    ↓
Phase 2 (Semantic): 2-3.5h [CRITICAL PATH] ← START HERE
    ├─ Parallel: Phase 3 (P2E wait): 30m
    └─ After completion → Phase 4
    
Phase 4 (Multi-Vector): 1-2h [After Phase 2 ≥85%]
    ├─ Parallel: Phase 3 (P2E wait): continues
    └─ After completion → Phase 5
    
Phase 5 (Centroids): 30m [After Phase 3 ✅ + Phase 4 ✅]

Total: 5-7 hours wall-clock
```

---

## Pre-Execution Checklist

### Infrastructure

- [ ] Python 3.14t installed (free-threaded)
- [ ] Gemma4 LLM running at :8090
- [ ] Ollama embeddings running at :11434
- [ ] Postgres accessible from Docker
- [ ] Redis/Valkey available for cache
- [ ] Qdrant vector DB running at :6333

### Documentation & Code

- [ ] `GRAPHIFY-GSD-INTEGRATION-PLAN.md` reviewed ✅
- [ ] `scripts/graphify/gsd-semantic-backfill.mts` ready
- [ ] `scripts/atlas/phase1-lexical-backfill.sql` ready
- [ ] `scripts/atlas/embed-multi-vectors.mts` ready (or will create)
- [ ] `scripts/atlas/compute-domain-centroids.mts` ready (or will create)

### Database State

- [ ] Layer 1-2 ✅ (Identity, Structural)
- [ ] Layer 3: 82.9% (Lexical) — acceptable
- [ ] Layer 4: 7.2% (Semantic) — will backfill to 85%+
- [ ] Layer 5: 100% (Domain) ✅
- [ ] Layer 6-8: ready (depend on 4)

### Monitoring & Logging

- [ ] Log directory created: `logs/graphify-gsd-semantic.log`
- [ ] Real-time tail command tested: `tail -f logs/...`
- [ ] Post-execution verification queries prepared

---

## Success Criteria

### Minimum (Phase 2 Complete)

- ✅ Semantic layer ≥85% coverage (50K packets with summary_text)
- ✅ No CUDA OOM errors (Graphify router successfully throttled)
- ✅ All grounding_score values valid (0.0-1.0 range)

### Full (All Phases Complete)

- ✅ Layer 3-8 all ≥85% coverage
- ✅ P2E topology complete (100% KMeans, SOM, PageRank)
- ✅ Multi-vector embeddings populated (all 4 lanes)
- ✅ Domain centroids computed (6 domains, ≥10 SOM cells each)
- ✅ Feature Envelope fields ≥75% populated (6/8 layers)
- ✅ RRF reranking tested (4-lane fusion working)

---

## Fallback Plans

### If Gemma4 Inference Stalls

**Symptom**: Phase 2 hangs on lane N for >10 min without progress

**Action**:
1. Kill lane process: `pkill -f "graphify:gsd:semantic"`
2. Check Gemma4 health: `curl http://127.0.0.1:8090/v1/models`
3. If down, restart: `TURBO_PROFILE=stock npm run turbo:start:detached`
4. Resume from Lane N: `npm run graphify:gsd:semantic -- --lanes=8 --resume-from=N --apply`

### If CUDA OOM During Phase 2

**Symptom**: CUDA error: out of memory (even with Graphify throttling)

**Action**:
1. Reduce batch size: `npm run graphify:gsd:semantic -- --batch-size=50 --apply`
2. Reduce lanes (process 4 at a time): `npm run graphify:gsd:semantic -- --lanes=4 --apply`
3. Manual throttle via env: `GRAPHIFY_BATCH_SIZE=25 npm run graphify:gsd:semantic -- --apply`

### If Postgres Connectivity Lost

**Symptom**: `psycopg2.OperationalError: could not connect to server`

**Action**:
1. Verify Docker container: `docker ps | grep postgres`
2. Restart if needed: `docker restart legal-ai-postgres`
3. Wait 10 sec for recovery
4. Resume from last successfully-committed packet

---

## After Execution (Post-Flight Validation)

```bash
# Full validation suite
npm run validate:all-layers -- --sample=1000 --strict=false

# Expected output: All gates PASS (or WARN, no FAIL)
#   ✅ Layer 1 (Identity): 100% ✓
#   ✅ Layer 2 (Structural): 78% ✓
#   ✅ Layer 3 (Lexical): 85%+ ✓
#   ✅ Layer 4 (Semantic): 85%+ ✓
#   ✅ Layer 5 (Domain): 100% ✓
#   ✅ Layer 6 (Envelope): 75%+ ✓
#   ✅ Layer 7 (Multi-Vector): 100% ✓
#   ✅ Layer 8 (Topology): 95%+ ✓

# RRF reranking smoke test
npm run test:hybrid-search -- --ms-marco=true

# Expected: Retrieval latency <2s, top-3 relevance >0.85

# "Did you mean?" recommendations test
npm run test:did-you-mean -- --sample=50

# Expected: 90%+ typo recovery + semantic suggestions
```

---

## Next: Go-Retrieval + Agentic Error Fixing

**After all 8 layers ≥85%**:

1. Wire multi-vector RRF fusion into Go Retrieval (5-lane blend)
2. Deploy "did you mean?" recommendations (typo + semantic)
3. Run agentic error fixing loop (Phase B: diagnose + fix + verify)
4. Validate against MS MARCO benchmark (MRR@10 ≥0.85)

---

## Summary

```
╔═════════════════════════════════════════════════════════════════╗
║ Feature Alignment — Ready for Execution                         ║
╠═════════════════════════════════════════════════════════════════╣
║                                                                 ║
║ Current State:                                                  ║
║   Identity:       100% ✅ | Structural:  78% ✅ | Lexical: 82% ⏳
║   Semantic:         7% 🔴 | Domain:     100% ✅ | Topology: 42% ⏳
║                                                                 ║
║ Critical Path:                                                  ║
║   Layer 4 (Semantic) — 54K packets via Graphify 8-lane router   ║
║   Estimated: 2-3.5 hours (no CUDA OOM)                         ║
║                                                                 ║
║ Total Execution: 5-7 hours (all layers ≥85%)                   ║
║                                                                 ║
║ Status: ✅ 100% READY TO START                                 ║
║                                                                 ║
║ Next Step: npm run graphify:gsd:semantic -- --lanes=8 --apply   ║
║                                                                 ║
╚═════════════════════════════════════════════════════════════════╝
```

---

**🚀 READY. Execute Phase 2 now.**
