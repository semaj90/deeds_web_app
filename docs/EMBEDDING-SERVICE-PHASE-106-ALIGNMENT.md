# Embedding Service — Phase 106 Alignment

**Date**: July 20, 2026 (Session 138+ Continuation)  
**Status**: P0-P4 embedding pipeline wired for Phase 106 Stage 4 (Generation Tier)  
**Context**: Phase 106 requires 13-stage semantic compiler pipeline; embedding is Stage 4 (produces 768-dim vectors)

---

## Phase 106 Pipeline Overview

**13 Stages (Abbreviated)**:
1. AST-Grep extraction → `ast_symbols[]`
2. Lexical extraction → `lexical_features[]`
3. LangExtract concepts → `used_concepts[]`
4. **Embedding generation → 768-dim vectors** ← (This session's work)
5. Autoencoder compression → 64-dim latent
6. KMeans clustering → cluster assignments
7. SOM topology → grid coordinates
8. Neo4j GDS → PageRank, community detection
9. TurboVec ANN → approximate nearest neighbors
10. RRF fusion → reciprocal rank fusion
11. Reranker scoring → repair probability
12. HMM semantic compiler → error state distribution
13. ACP action control → job dispatch & orchestration

**Critical Dependency Chain**:
```
Stage 1-3 (Extraction) → Stage 4 (Embedding) ← [P0-P4 work]
                            ↓
                    Stage 5-7 (Compression/Topology)
                            ↓
                    Stage 8-11 (Search/Ranking)
                            ↓
                    Stage 12-13 (Compilation/Dispatch)
```

---

## P0-P4 Embedding Work → Phase 106 Readiness

### P0: Backend Validation ✅ WIRED
**What**: Fingerprint backend on first embed call  
**Why**: Prevents silent provider-URL mismatches (162-token issue)  
**Blocking Stage 4**: ❌ NO — validation is transparent  
**Production Ready**: ✅ YES — explicit error messages, operator-actionable  

**Integration Point**:
```
[Stage 1-3 Feature Extraction] → generate 768-dim embeddings ← P0 validation
                                   ↑
                           fingerprintBackend()
                           validateResolvedBackend()
```

### P1: ONNX Fallback ⏳ PLANNED
**What**: Add Tier 4 local ONNX fallback to embedding cascade  
**Why**: Network-independent last resort, no Ollama dependency  
**Blocking Stage 4**: ⚠️ YES if Ollama unavailable — ONNX unblocks  
**Production Ready**: 🟡 Partial — code exists, not yet wired  

**Integration Point**:
```
Tier 0 (OpenAI-compat) → Tier 1 (gRPC) → Tier 2 (QUIC)
        ↓
    Tier 3 (HTTP Ollama)
        ↓
    Tier 4 (ONNX) ← [P1: Wire this]
        ↓
    ❌ Throw "all tiers failed"
```

### P2: gRPC Validation ⏳ OPTIONAL
**What**: Health check + dimension validation for gRPC embedding service  
**Why**: Catch gRPC mismatches early, validate 384-dim vs 768-dim  
**Blocking Stage 4**: ❌ NO — gRPC is Tier 1, HTTP fallback works  
**Production Ready**: 🟡 Partial — gRPC exists, validation incomplete  

### P3: JSONB Metadata ⏳ OPTIONAL
**What**: Log cache_hit_source, generation_time_ms, embedding_dimension, model_id to PostgreSQL  
**Why**: Audit trail for lineage verification + cold-storage restore  
**Blocking Stage 4**: ❌ NO — optional for observability  
**Production Ready**: 🟡 No — not yet implemented  

### P4: Env Validation ⏳ OPTIONAL
**What**: Validate EMBEDDING_PROVIDER and EMBEDDING_DIMENSION_TARGET on startup  
**Why**: Catch config errors before first call  
**Blocking Stage 4**: ❌ NO — runtime validation via P0 is sufficient  
**Production Ready**: 🟡 Partial — P0 covers this at runtime  

---

## Phase 106 Readiness Gate

**For Stage 4 (Embedding Generation) to unblock Stages 5-13**:

| Check | Status | Blocking |
|-------|--------|----------|
| ✅ Backend validation (P0) | WIRED | NO |
| ⏳ ONNX fallback (P1) | PLANNED | YES (if Ollama down) |
| ⏳ Dimension validation | PARTIAL | NO (runtime validation) |
| ✅ Lineage traceability | READY | NO |
| ✅ 768-dim contract | VERIFIED | NO |

**Blocker for Phase 106 Execution**: Wire P1 (ONNX fallback) so Stage 4 has a guaranteed path to produce embeddings

---

## Timeline for Phase 106

### Pre-Stage-4 Setup (Today)
- ✅ P0: Backend validation (COMPLETE)
- ⏳ P1: ONNX wiring (2-3 hours)
- ⏳ Create tests (1 hour)

**Total**: ~3-4 hours before Stage 4 unblocks Stages 5-13

### Stage 4 Execution (After P1 wiring)
```bash
# Dry-run: embed 100 sample packets
npm run atlas:embed:dry --limit=100

# Verify: 768-dim vectors in Postgres
docker exec legal-ai-postgres psql -U legal_admin -d legal_ai_db -c "
  SELECT COUNT(*) as embedded, 
         AVG(array_length(embedding, 1)) as avg_dim
  FROM codebase_chunk_index
  WHERE embedding IS NOT NULL;
"
# Expected: count ≥ 39000, avg_dim = 768

# Gate: If >99% coverage, proceed to Stage 5
npm run atlas:phase4:validate
```

**Duration**: 2-5 minutes (depends on network/GPU availability)

### Stage 5-13 Parallelizable
After Stage 4 completes, Stages 5-13 can run in parallel:
- **Lane A** (GPU): Stages 5 (AE), 6 (KMeans), 7 (SOM) — 4-6 hours
- **Lane B** (Neo4j): Stage 8 (GDS) — 1-2 hours
- **Lane C** (Search): Stages 9-11 (ANN/RRF/Reranker) — 2-3 hours
- **Lane D** (Compilation): Stages 12-13 (HMM/ACP) — 1-2 hours

**Bottleneck**: Stage 5 (AE training) — must complete before Stage 6 (KMeans on latent64)

---

## Integration Checklist for Phase 106

### Before Running Stage 4
- [ ] P0 wiring complete & tested (`test:embed:p0-validation`)
- [ ] P1 ONNX fallback wired (`generateEmbeddings()` has Tier 4)
- [ ] Docker services running: Ollama, Postgres, Redis, Qdrant
- [ ] Environment variables set: `EMBEDDING_PROVIDER`, `EMBEDDING_BASE_URL`
- [ ] Model availability checked: `npm run embed:health`

### During Stage 4 Execution
- [ ] Dry-run passes: `npm run atlas:embed:dry --limit=100`
- [ ] Dimension validation passes (768-dim)
- [ ] Postgres write succeeds (codebase_chunk_index.embedding populated)
- [ ] Redis cache warmed (embedding-cache keys present)
- [ ] Qdrant mirror synced (codebase_chunks_768 payload updated)

### After Stage 4 Complete
- [ ] Gate pass check: `npm run atlas:phase4:validate`
- [ ] Coverage ≥99%: Verify 40,000+ packets embedded
- [ ] Lineage complete: `scripts/atlas/verify-feature-lineage.mjs` passes
- [ ] Cold-storage ready: manifests exist in `atlas_cold_storage_manifest`

---

## Risk Mitigation for Phase 106

### Risk 1: Ollama Down During Stage 4
**Mitigation**: P1 ONNX fallback provides local path  
**Action**: Wire P1 before starting Phase 106  
**Contingency**: Run `npm run atlas:embed:apply --use-onnx-only` to complete offline

### Risk 2: Dimension Mismatch (384-dim vs 768-dim)
**Mitigation**: Dimension validation in embedding-client.ts  
**Action**: Verify embeddinggemma:latest outputs 768-dim (Session 138 confirmed ✅)  
**Contingency**: Run audit: `scripts/atlas/verify-embedding-dimensions.mjs`

### Risk 3: Stage 5 (AE) Requires Latent64 from Stage 4
**Mitigation**: Embed first, encode after  
**Action**: Stage 4 must complete 99%+ coverage before Stage 5 starts  
**Contingency**: Cache embeddings in PostgreSQL for re-use

### Risk 4: Network Latency on GPU Inference
**Mitigation**: ONNX local inference (no network)  
**Action**: Measure baseline: CPU inference ~800ms, GPU inference ~25ms  
**Contingency**: Use ONNX for large batches if network latency > 50ms per embedding

---

## Success Metrics for Phase 106

| Metric | Target | Blocker |
|--------|--------|---------|
| Stage 4 coverage | ≥99% (40,000+ packets) | YES |
| Embedding dimension | 768 | YES |
| Generation latency | <50ms p99 | NO |
| ONNX fallback available | Yes | YES (if Ollama unavailable) |
| Lineage preserved | 100% | YES |
| Cold-storage ready | Yes | NO |
| Stage 5 unblocked | Yes | YES |

---

## Recommended Implementation Order

1. **Today** (P0 ✅ done):
   - Backend validation complete

2. **Next 3-4 hours** (P1 + tests):
   - Wire ONNX Tier 4 into `generateEmbeddings()`
   - Add dimension validation schema
   - Write integration tests
   - Run end-to-end validation

3. **When Stage 4 Ready** (execute):
   - Dry-run `npm run atlas:embed:dry --limit=100`
   - Dry-run `npm run atlas:phase4:validate`
   - Full run `npm run atlas:embed:apply`
   - Gate check: `npm run atlas:phase4:validate --full`

4. **Parallel Execution** (Stages 5-13):
   - Lane A: Stage 5-7 (GPU path)
   - Lane B: Stage 8 (Neo4j)
   - Lane C: Stage 9-11 (Search)
   - Lane D: Stage 12-13 (Compilation)

---

## Reference Docs

- [EMBEDDING-SERVICE-ARCHITECTURE-REVIEW.md](EMBEDDING-SERVICE-ARCHITECTURE-REVIEW.md) — Architecture + 4 integration gaps
- [EMBEDDING-SERVICE-P0-FINGERPRINT-WIRED.md](EMBEDDING-SERVICE-P0-FINGERPRINT-WIRED.md) — P0 complete, backend validation
- [EMBEDDING-SERVICE-ONNX-INTEGRATION-PLAN.md](EMBEDDING-SERVICE-ONNX-INTEGRATION-PLAN.md) — P1 plan, 5-tier fallback
- [BATCHED-EMBEDDING-FIX.md](BATCHED-EMBEDDING-FIX.md) — Sparse array + validation fixes
- [PHASE-106-IMPLEMENTATION-ROADMAP.md](../PHASE-106-IMPLEMENTATION-ROADMAP.md) — Full 13-stage pipeline plan

---

## Status: Phase 106 Embedding Layer Ready

✅ **P0 complete** — Backend validation wired  
⏳ **P1 planned** — ONNX fallback (2-3h to wire)  
✅ **Architecture aligned** — 768-dim contract verified  
✅ **Lineage preserved** — Source provenance traced  

**Next Step**: Wire P1 ONNX fallback → Run full embed dry-run → Proceed to Stage 5 (Autoencoder)

**ETA to Stage 4 Production Ready**: 3-4 hours (P1 implementation + testing)

