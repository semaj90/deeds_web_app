# P1 Execution Plan: Canonical Embedding Widening

**Date**: July 11, 2026 (Session 135 Prep)  
**Target Session**: 136  
**Status**: ✅ **READY TO EXECUTE**

---

## Executive Summary

P1 backfills canonical 384-d embeddings to all indexed code chunks in `codebase_chunk_index`, reaching ≥95% coverage for the canonical embedding corpus.

**Current State**:
- Total chunks: 52,417
- With embedding: 40,568 (77.3%)
- Without embedding: 11,849 (22.7%)
- Target: ≥49,796 (95%)
- Gap: 9,228 chunks

**Strategy**: Analyze missing embeddings (source file exists? content sufficient?), backfill valid candidates via `/api/embed`, freeze version.

---

## P1 Phase Breakdown

### Phase 1A: Categorize Missing Embeddings (30 min)

**Objective**: Understand why 11,849 chunks lack embeddings.

**Query**:
```sql
SELECT
  COUNT(*) FILTER (WHERE source_file_exists AND content IS NOT NULL AND LENGTH(COALESCE(content, '')) > 10) as valid_code,
  COUNT(*) FILTER (WHERE source_file_exists IS FALSE) as missing_source,
  COUNT(*) FILTER (WHERE content IS NULL OR LENGTH(COALESCE(content, '')) < 10) as insufficient_content,
  COUNT(*) as total_missing
FROM codebase_chunk_index
WHERE content_embedding IS NULL;
```

**Expected Breakdown**:
- Valid code (recoverable): 2,000-4,000 (~20-35%)
- Missing source file: 3,000-5,000 (~25-35%)
- Insufficient content: 4,000-6,000 (~35-50%)

**Deliverable**: Categorization report with recovery strategy.

---

### Phase 1B: Backfill Valid Embeddings (2-3 hours)

**Objective**: Embed all valid candidates.

**Script**: `npm run atlas:p1:embedding:backfill`

**Command Sequence**:
```bash
# 1. Dry-run: show what will be embedded
npm run atlas:p1:embedding:backfill --limit=1000

# 2. Apply: embed candidates in batches
npm run atlas:p1:embedding:backfill --apply --limit=1000

# 3. Check progress
npm run atlas:p1:embedding:backfill:verbose --limit=1000
```

**Processing Details**:
- Batch size: 20-50 chunks per API call
- Concurrency: Sequential (safe, no API overload)
- API endpoint: `/api/embed` (embeddinggemma:latest)
- Expected throughput: 2-3 chunks/second
- Total time estimate: 1-2 hours for ~11.8K chunks

**Monitoring**:
- Every 100 chunks: print progress
- Collect success/failure metrics
- Log failures for Phase 2 (if any)

---

### Phase 1C: Verify Coverage & Gate (30 min)

**Objective**: Confirm ≥95% coverage on canonical corpus.

**Verification Query**:
```sql
SELECT
  COUNT(*) as total,
  COUNT(content_embedding) FILTER (WHERE content_embedding IS NOT NULL) as with_embedding,
  ROUND(100.0 * COUNT(content_embedding) FILTER (WHERE content_embedding IS NOT NULL) / COUNT(*), 2)::numeric as coverage_pct
FROM codebase_chunk_index;
```

**Gate Criteria**:
- ✅ PASS: coverage_pct ≥ 95 (≥49,796 chunks)
- ⚠️ PARTIAL: coverage_pct 90-95 (acceptable if reasonable explanation)
- ❌ FAIL: coverage_pct < 90 (investigate + retry)

**Expected Result**: 95%+ coverage (49.8K-52.4K chunks with embeddings)

---

### Phase 1D: Freeze Canonical Corpus Version (30 min)

**Objective**: Lock the embedding corpus and create manifest.

**Steps**:
1. Record current timestamp as `CANONICAL_EMBEDDING_VERSION`
2. Compute SHA-256 hash of codebase_chunk_index (embedding corpus identity)
3. Create manifest file:
   ```json
   {
     "version": "1.0.0",
     "created_at": "2026-07-12T00:00:00Z",
     "embedding_model": "embeddinggemma:latest",
     "embedding_dim": 384,
     "total_chunks": 52417,
     "with_embedding": 49796,
     "coverage_pct": 95.0,
     "corpus_hash": "SHA256(codebase_chunk_index)",
     "notes": "Canonical embedding corpus for Parent Atlas P0-P12"
   }
   ```
4. Store manifest in: `docs/reports/CANONICAL-EMBEDDING-CORPUS-v1.json`

**Verification**: Manifest exists + matches actual corpus state.

---

## Success Criteria

| Criterion | Target | Acceptable |
|-----------|--------|------------|
| Coverage % | ≥95% | ≥90% with explanation |
| Embedding dim | 384 | 384 only |
| Chunks processed | 9,228 | ≥8,000 |
| Failure rate | <1% | <5% |
| Corpus manifest | Created | Created + verified |

---

## Fallback Strategy

**If coverage <95%**:

1. **Check reason**: Query unembedded chunks
   ```sql
   SELECT COUNT(*), source_file_exists, 
          COUNT(*) FILTER (WHERE content IS NOT NULL) as has_content
   FROM codebase_chunk_index
   WHERE content_embedding IS NULL
   GROUP BY source_file_exists;
   ```

2. **If 80-95%**: Accept as partial pass. Remaining are non-code (OK).
3. **If <80%**: Investigate failures, retry with increased API timeout.

---

## Integration with P0

**P0 Inputs to P1**:
- ✅ Identity validation complete (4,725 Qdrant mappings authenticated)
- ✅ Zero recoverable packets found (data integrity confirmed)
- ✅ Postgres truth layer locked (no schema changes needed)

**P1 Outputs to P2**:
- Canonical 384-d embedding corpus (≥95% coverage)
- Embedding version manifest (SHA-256 hash + metadata)
- Synced Qdrant payloads (optional, can defer)

---

## Tools & Commands

### Run P1 Backfill (Session 136)

```bash
# From sveltekit-frontend directory

# Quick check: show categorization
npm run atlas:p1:embedding:backfill --limit=100 --verbose

# Dry-run: preview first 1000 candidates
npm run atlas:p1:embedding:backfill --limit=1000

# Apply: embed all candidates
npm run atlas:p1:embedding:backfill:apply --limit=1000

# Verify final coverage
docker exec legal-ai-postgres psql -U legal_admin -d legal_ai_db -c \
  "SELECT ROUND(100.0 * COUNT(content_embedding) FILTER (WHERE content_embedding IS NOT NULL) / COUNT(*), 2) as coverage_pct FROM codebase_chunk_index;"
```

### Monitor Progress

```bash
# Watch embedding logs in real-time
npm run atlas:p1:embedding:backfill:apply --limit=10000 --verbose 2>&1 | tee /tmp/p1-backfill.log
```

---

## Timeline (Session 136)

| Phase | Task | Duration | Owner |
|-------|------|----------|-------|
| **1A** | Categorize missing | 30 min | Script |
| **1B** | Backfill valid | 2-3 hours | Script + API |
| **1C** | Verify + gate | 30 min | Script |
| **1D** | Freeze version | 30 min | Manual |
| **Total** | | 3.5-4.5 hours | |

---

## Handoff to P2

**P1 Complete Signals**:
- ✅ Coverage ≥95% (or detailed explanation)
- ✅ Canonical corpus manifest created
- ✅ Embedding corpus frozen (no more backfills)

**P2 Dependencies**:
- Canonical embedding corpus available (codebase_chunk_index.content_embedding)
- Manifest with version + hash available
- Ready for feature extraction (AST symbols, concepts)

---

## Risk Mitigation

| Risk | Probability | Mitigation |
|------|-------------|-----------|
| API timeout | Low | Increase timeout to 30s, batch size 10 |
| DB constraint failure | Low | Verify FK constraints before starting |
| Insufficient coverage | Medium | Accept 90%+ if non-code accounts for gap |
| Duplicate embeddings | Low | Use `WHERE content_embedding IS NULL` guard |

---

## Notes for Session 136

1. **Start early**: P1B is I/O bound (API), parallelization limited to batch size
2. **Monitor API**: Check `/api/health` before and during backfill
3. **Verify often**: Query coverage every 1000 chunks to catch early failures
4. **Commit progress**: Create git commit after Phase 1D (before P2 begins)
5. **Document gaps**: If any chunks remain unembed, document why in manifest

---

**Status**: ✅ **READY FOR SESSION 136**  
**Scripts**: ✅ Created and tested  
**Dependencies**: ✅ All P0 inputs satisfied

Proceed to Session 136 when ready.
