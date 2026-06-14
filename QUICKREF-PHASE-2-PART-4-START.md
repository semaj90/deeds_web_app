# Phase 2 Part 4 Quick Reference — Multi-Vector + Metadata Enrichment

**Last Updated**: 2026-06-14  
**Previous Phase**: Phase 2 Part 3 ✅ COMPLETE (98.2% average coverage)  
**Current Phase**: Phase 2 Part 4 ⏳ PLANNED (target: ≥85% average coverage)

---

## What Just Shipped (Phase 2 Part 3)

✅ **Higher-Hop Enrichment Gates PASS**
- somCluster: 100.0% ✅
- glyphRecord: 100.0% ✅ (new)
- qdrantHit: 92.0% ✅ (verified in Qdrant)
- redisHotKey: 100.0% ✅
- neo4jNode: 99.0% ✅
- Average: 98.2% ✅

✅ **Atlas SVG Glyphs** — Deterministic ID generation + type classification
✅ **Qdrant Payload Verified** — packet_key present on 92% of 52,606 points
✅ **Npm Scripts Wired** — Phase 2 Part 3 CLI commands live

---

## What's Next (Phase 2 Part 4)

### 🔄 Multi-Vector Search
Leverage Qdrant's **4 native named vectors** for hybrid retrieval:

| Vector | Dims | Purpose |
|--------|------|---------|
| **content** | 768 | Semantic content (embeddinggemma) |
| **signature** | 768 | Function/AST structure |
| **encoded_64** | 64 | Autoencoder latent space |
| **error** | 768 | Reconstruction error uncertainty |

```bash
# Named vector search (already working)
POST /api/codebase/search/multi-vector?type=content
POST /api/codebase/search/multi-vector?type=signature
POST /api/codebase/search/multi-vector?fusion=true  # RRF blend
```

### 🏷️ JSONB Metadata v2
Upgrade metadata envelope with structured fields:

```json
{
  "metadata": {
    "version": 2,
    "identity": { "packet_key", "source_ref", "directory_path" },
    "enrichment": { "som_cluster", "glyph_id", "glyph_type" },
    "retrieval": { "vector_source", "signature_vector", "error_vector" },
    "ai_summary": { "summary", "confidence", "keywords" },
    "quality": { "canonical", "payload_version", "needs_review" }
  }
}
```

**Migration**: Lazy (v1 stays on old points, new points → v2)

### 🏷️ Qdrant Tags
Pre-computed semantic tags for fast filtering:

```
Tags per point: ["canonical", "api_endpoint", "feature:auth", "som:42", "glyph:a1b2c3d4", "gpu:127"]
Filter: filter: { has_tag: ["canonical", "api_endpoint"] }
Result: O(tag_index) pre-filter → ANN rerank
```

### 🤖 Gemma4 Summarization
Enrich each chunk with AI-generated 1-2 sentence summary:

```
Input:  Code chunk (content, file_path, feature_id)
Model:  gemma4-rotorquant:latest (local, GPU-accelerated)
Output: summary (50-150 words) + confidence (0.0-1.0)
```

---

## Implementation Roadmap

### Week 1 (6 days)
- [ ] Task 1.1: Dual-vector search endpoint
- [ ] Task 1.2: AST signature extraction
- [ ] Task 2.1: Metadata v1→v2 migration
- [ ] Task 2.2: JSONB validation schema

### Week 2 (6 days)
- [ ] Task 1.3: Error-vector reranking
- [ ] Task 3.1: Tag generation (backfill)
- [ ] Task 4.1: Batch Gemma4 summarization
- [ ] Task 4.2: Summary caching (Redis)

### Week 3 (5 days)
- [ ] Task 1.4: A/B testing (multi-vector ablation)
- [ ] Task 4.3: Summary quality audit
- [ ] Task 3.2: Tag-based search endpoint
- [ ] Validation gates audit + verify

**Total**: 41 hours (5 days full-time)

---

## Validation Gates (New: 8 gates, up from 6)

| Gate | Metric | Threshold | Status |
|------|--------|-----------|--------|
| 1-5 | Phase 2.3 gates | (see PHASE-1C-1D-COMPLETION) | ✅ PASS |
| **6** | **Metadata v2** | **≥85%** | **NEW** |
| **7** | **AI Summary** | **≥80%** | **NEW** |
| **8** | **Average** | **≥85%** | **NEW** |

---

## Key Decisions Made

| Decision | Choice | Rationale |
|----------|--------|-----------|
| Multi-vector fusion | Weighted blend (0.6/0.3/0.1) | Start lightweight, upgrade to XGBoost if needed |
| Summarization model | gemma4-rotorquant | Local, legal-domain tuned, GPU-accelerated |
| Metadata migration | Lazy v1→v2 | Preserve old data, migrate on write/read |
| Tagging scope | Auto-generated from metadata | No manual labeling, deterministic and reproducible |
| Summary quality gate | Manual review ≥4.0 | Verify Gemma4 output is actually useful before scaling |

---

## Risk Mitigation

**Risk**: Gemma4 summarization too slow for 52K chunks  
**Mitigation**: Batch 50 chunks, estimate ~25s/batch = 22 hours total  
**Backup**: Skip summaries if deadline pressure, gate to 50%

**Risk**: Metadata v2 envelope causes Qdrant writes to fail  
**Mitigation**: Test v1→v2 migration on 100 points first, verify payload still queryable

**Risk**: Tag generation creates too many tags, filter inefficient  
**Mitigation**: Cap tags/point at 20, prioritize quality over coverage

---

## Scripts & Endpoints

### Batch Scripts
```bash
# Migrate metadata v1 → v2
npm run atlas:metadata:migrate:dry
npm run atlas:metadata:migrate:apply

# Generate semantic tags
npm run atlas:qdrant:tags:generate:dry
npm run atlas:qdrant:tags:generate:apply

# Batch Gemma4 summarization
npm run atlas:chunks:summarize:dry      # 100 chunks
npm run atlas:chunks:summarize:apply    # all 52,606

# Audit & verify gates
npm run atlas:phase-2-part-4:audit
npm run atlas:phase-2-part-4:verify
```

### New Endpoints
```
POST  /api/codebase/search/multi-vector?type=content|signature|fusion
GET   /api/codebase/search/tagged?tags=canonical,api_endpoint&limit=10
```

---

## Success Criteria ✅

Phase 2 Part 4 PASS when:
1. ✅ Multi-vector search live, A/B tested (NDCG@10 ≥ 0.75)
2. ✅ Metadata v2 on ≥85% of points
3. ✅ AI summaries on ≥80% of points
4. ✅ Tags generated on ≥75% of points
5. ✅ All 8 gates green
6. ✅ Zero Qdrant data loss/corruption
7. ✅ No new external dependencies

---

## Files

Full plan: `docs/PHASE-2-PART-4-MULTIVECTOR-ENRICHMENT.md`  
Quick ref: This file (`QUICKREF-PHASE-2-PART-4-START.md`)  
Prior phase: `docs/PHASE-1C-1D-COMPLETION.md` (Phase 1c/1d reference)  
Prior phase: `QUICKREF-PHASE-2-START.md` (Phase 2 Parts 1-3 reference)

---

## Next Session Checklist

- [ ] Read full Phase 2 Part 4 plan (docs/PHASE-2-PART-4-MULTIVECTOR-ENRICHMENT.md)
- [ ] Review multi-vector fusion options (weighted blend vs RRF vs XGBoost)
- [ ] Schedule Week 1 implementation kickoff
- [ ] Validate Gemma4 availability + batch throughput
- [ ] Plan A/B testing framework (baseline vs dual-vector vs triple-vector)

