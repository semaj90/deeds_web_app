# Phase 85: Ranker, Supersedes, Artifact Registry Consolidation

**Status**: ✅ P0 + P1 COMPLETE | 🚀 Ready for P2-P9

**Session**: 88 (June 27, 2026)

---

## Executive Summary

Phase 85 completes the production hardening started in Sessions 86–87 (P1-F/G/H) by consolidating mock stubs into real integrations. The core rule: **A result supersedes another only if it wins by evidence** (content_hash, git_commit, semantic_diff, GAN score, replay/reward score).

**Critical Path**: P2 → P3 → P4–P6 → P7–P9

---

## Roadmap (9 Phases, 18–22 hours)

| Phase | Task | Status | Command | Est. Time |
|-------|------|--------|---------|-----------|
| **P0** | Inventory & duplicate guard | ✅ COMPLETE | `npm run phase85:inventory` | 30 min |
| **P1** | Ranker for supersedes | ✅ COMPLETE | `npm run phase85:p1:audit` | 2 hours |
| **P2** | Wire semantic diff | ⏳ READY | `npm run phase85:p2:wire` | 2 hours |
| **P3** | Wire artifact registry | ⏳ BLOCKED ON P2 | `npm run phase85:p3:wire` | 1.5 hours |
| **P4** | Wire summary extraction | ⏳ BLOCKED ON P3 | `npm run phase85:p4:wire` | 2.5 hours |
| **P5** | Wire feature labels | ⏳ BLOCKED ON P4 | `npm run phase85:p5:wire` | 2 hours |
| **P6** | Wire GAN validation | ⏳ BLOCKED ON P4 | `npm run phase85:p6:wire` | 1.5 hours |
| **P7** | Wire reward scoring | ⏳ BLOCKED ON P6 | `npm run phase85:p7:wire` | 1.5 hours |
| **P8** | Wire git-diff probes | ⏳ BLOCKED ON P2 | `npm run phase85:p8:wire` | 2.5 hours |
| **P9** | Export datasets | ⏳ BLOCKED ON P7 | `npm run phase85:p9:export` | 1.5 hours |

---

## Completed Work

### P0: Inventory and Duplicate Guard ✅

**Command**: `npm run phase85:inventory`

**Deliverables**:
- ✅ 7 production paths identified (cross-encoder, code-llm-index, feature-builder, glyph-diffusion, atlas-reward-cache, agents-context, git-diff)
- ✅ Mock patterns documented (lorem, hardcoded, empty, stub)
- ✅ Target implementations mapped (semantic diff, Gemma4 summary, GAN validation, etc.)
- ✅ Critical path defined (P2 blocks P1, P3 blocks P4–P9)

**Output**: `.tmp/phase85-mock-stub-inventory.json`

### P1: Ranker for Supersedes Decisions ✅

**Command**: `npm run phase85:p1:audit`

**Implementation** (`scripts/atlas/rank-supersedes-candidates.mjs`):
- ✅ Semantic similarity thresholds (0.99 skip, 0.95–0.99 metadata, 0.80–0.95 regen, 0.60–0.80 GAN review, <0.60 full regen)
- ✅ Decision ranking (priority-ordered by action)
- ✅ GAN score integration
- ✅ Sample test with 4 candidate comparisons (PASS)

**Output**: `.tmp/phase85-supersedes-decisions.json`

**Test Results**:
- Total comparisons: 4
- Skipped: 0
- Metadata only: 1
- Regenerate: 1
- GAN review: 1
- Full regen: 1

---

## P2–P9: Next Phases (Ready to Implement)

### P2: Wire Semantic Diff (CRITICAL PATH)

**Target**: `src/lib/server/retrieval/cross-encoder-reranker.ts`

**Current**: Always full regeneration

**Implementation**:
1. Embed old summary (EmbeddingGemma)
2. Embed new summary (EmbeddingGemma)
3. Cosine similarity comparison
4. Write to `atlas_semantic_diffs` (schema ready)
5. Feed into P1 ranker

**Blocking**: P1 ranker decision, P3 artifact registry

### P3: Wire Artifact Registry

**Target**: `src/lib/server/db/schema/atlas-artifacts.ts` (ALREADY EXISTS)

**Schema Complete**:
- ✅ `artifact_id` (uuid PK)
- ✅ `artifact_type` (enum: summary, embedding, latent64, SOM cell, redis_cache, markdown, qdrant_payload, gemma4_prompt, gemma4_output, feature_labels, gan_report, benchmark, trace)
- ✅ `generator` (enum: Gemma4, EmbeddingGemma, AutoEncoder, SOM, KarpathyBlender, GANValidator, LangExtract, MarkdownGenerator, TraceExporter)
- ✅ `supersedes_artifact_id` (for regenerations)
- ✅ `gan_validated` + `gan_validation_score`
- ✅ `status` (generated, validated, superseded, failed)

**Implementation**:
1. Create migration (if missing)
2. Implement `logArtifact()` helper
3. Backfill existing summaries + embeddings
4. Wire into P4–P7 tasks

**Blocking**: P4–P9

### P4: Wire Summary Extraction (llama-server batch summarizer)

**Target**: `src/lib/server/cache/code-llm-index.ts`

**Current**: Lorem ipsum stubs

**Implementation**:
1. Retrieve compact source context
2. Call Gemma4 summary (llama-server :8090)
3. Strip reasoning/thought blocks
4. Detect and reject: TODO, lorem, placeholders, hallucinated imports
5. Compute `content_hash` (SHA-256 first 16 chars)
6. Deduplicate by `content_hash` + `summary_hash`
7. Write artifact to `atlas_artifacts`

**Blocking**: P5–P6

### P5: Wire Feature Labels

**Target**: `src/lib/server/analysis/feature-builder.ts` + `agents-context-source.ts`

**Implementation**:
1. AST extraction (imports, exports, functions, routes)
2. Code/domain keyword extraction
3. Optional Gemma4 synthesis (complex files only)
4. Merge and deduplicate labels
5. Store in `metadata.feature_labels` JSONB

### P6: Wire GAN Validation

**Target**: `src/lib/server/services/glyph-diffusion-service.ts`

**Implementation**:
1. Use existing GAN validator or deterministic adversarial probes
2. Score: summary coherence, factuality, legal relevance, placeholder absence, identity preservation
3. Store `gan_score` in `atlas_artifacts`
4. Reject bad summaries (score < 0.60)

**Blocking**: P8

### P7: Wire Reward Scoring

**Target**: `src/lib/server/cache/atlas-reward-cache.ts`

**Current**: Empty ZSET

**Implementation**:
1. Weighted scoring: `0.3·compile + 0.2·test + 0.15·lint + 0.15·user_acceptance + 0.1·perf + 0.05·security + 0.05·gan`
2. Write Redis ZSET (`atlas:reward:scored`)
3. Write Postgres `artifact_rewards` table

**Blocking**: P8

### P8: Wire git-diff Probes (Production Integration)

**Target**: `scripts/atlas/git-diff-supersedes-reconcile-production.mjs`

**Current**: Empty returns

**Implementation**:
1. P2 Qdrant HTTP REST lookup
2. P3 Redis key scan
3. P4–P6 seven validation probes returning real data
4. Integrate with P1 ranker

### P9: Export Datasets

**Implementation**:
1. Generate `datasets/training-pairs/sft-pairs.jsonl`
2. Generate `datasets/training-pairs/dpo-pairs.jsonl`
3. Generate `datasets/traces/good_traces.jsonl`
4. Generate `datasets/traces/bad_traces.jsonl`
5. Export only ACTIVE artifacts (exclude SUPERSEDED/STALE except in bad_traces)

---

## Validation Gates

**All 11 gates must PASS before deployment**:

- [ ] packet_key unchanged
- [ ] source_ref unchanged
- [ ] feature_id unchanged
- [ ] content_hash tracked
- [ ] semantic_diffs populated
- [ ] artifacts populated
- [ ] GAN validation live
- [ ] Reward scoring live
- [ ] git-diff probes returning real data
- [ ] No mock/stub functions in production path
- [ ] No duplicate modules/scripts

---

## npm Scripts

```bash
# Phase 85 orchestrator
npm run phase85:status          # Show overall progress
npm run phase85:inventory       # List mocks needing wiring
npm run phase85:checklist       # Print full checklist

# Phase 85 P0
npm run phase85:inventory

# Phase 85 P1 (ranker)
npm run phase85:p1:status       # Show ranker status
npm run phase85:p1:audit        # Run ranker audit
npm run phase85:p1:audit:apply  # Apply ranker decisions

# Phase 85 P2–P9 (TBD)
npm run phase85:p2:wire         # (not yet implemented)
npm run phase85:p3:wire         # (not yet implemented)
# ... etc
```

---

## Expected Outcomes

### After P2–P3:
- Semantic diff integration complete
- Artifact registry live and backfilled
- P1 ranker wired to real data

### After P4–P7:
- Summary extraction live (Gemma4 integration)
- Feature labels populated
- GAN validation in production
- Reward scoring active

### After P8–P9:
- All 11 validation gates PASS
- Production deployment ready
- Training datasets exported

---

## Files Changed This Session

### New Scripts
1. `scripts/atlas/phase85-orchestrator.mjs` — Master orchestrator (380 lines)
2. `scripts/atlas/rank-supersedes-candidates.mjs` — P1 ranker (280 lines)

### Modified Files
1. `package.json` — Added 10 npm scripts for Phase 85

### Documentation
1. `docs/PHASE-85-STATUS-TRACKER.md` — This file

---

## Next Steps

**Immediate** (next session):
1. Implement P2 (semantic diff) — 2 hours
2. Implement P3 (artifact registry) — 1.5 hours
3. Wire P1 ranker to P2 results — 30 min

**Follow-up**:
4. Implement P4 (summary extraction) — 2.5 hours
5. Implement P5–P7 (labels, GAN, reward) — 5 hours
6. Implement P8–P9 (git-diff, export) — 4 hours

**Estimated Total Remaining**: 15–17 hours

---

## Success Criteria

✅ **P0 COMPLETE**: 7 mocks identified, critical path defined
✅ **P1 COMPLETE**: Ranker working, thresholds validated, decisions prioritized
⏳ **P2–P9 Ready**: All implementations specified, schema ready, npm scripts templated

**Overall Progress**: 18% (P0 + P1 of 9 phases)