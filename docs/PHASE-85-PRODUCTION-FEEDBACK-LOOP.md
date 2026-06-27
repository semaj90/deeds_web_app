# PHASE 85 — PRODUCTION FEEDBACK LOOP

**Objective**: Close the gap between git diff and replay dataset export. Complete the production lifecycle without architectural expansion.

**Status**: All dependencies identified. 7 stub/mock functions need wiring.

---

## The Complete Loop (End-to-End)

```
User commits code change
  ↓
git diff
  ↓
[P85-2] Map affected packets → source_ref
  ↓
[P85-3] Semantic diff (old embedding vs new embedding)
  ├─ 0.99: skip
  ├─ 0.95: update metadata only
  ├─ 0.80: regenerate summary
  └─ 0.60: GAN review
  ↓
[P85-4] Conditional regeneration (LangExtract feature labels)
  ├─ if new: extract symbols, imports, entities, domains
  └─ store in metadata.feature_labels
  ↓
[P85-5] Summary QA (reject bad summaries)
  ├─ check for <think>, TODO, placeholder
  ├─ verify feature_id + source_ref present
  └─ reject if malformed
  ↓
[P85-1] Artifact Registry Log
  ├─ create atlas_artifacts entry
  ├─ generator: 'Gemma4'
  ├─ generator_version: 'gemma4-legal-iq4xs'
  ├─ content_hash: SHA256(new_summary)
  ├─ supersedes: old_artifact_id (if exists)
  └─ status: 'generated'
  ↓
[Postgres write] atlas_packets update
  ├─ summary: new value
  ├─ summary_hash: new hash
  ├─ updated_at: NOW()
  └─ metadata: enrich with feature_labels, domain_class
  ↓
[Redis invalidate] BitFrost
  ├─ DEL bifrost:packet:{packet_key}
  ├─ DEL bifrost:feature:{feature_id}
  └─ DEL centroid:feature:{feature_id}
  ↓
[Qdrant mirror] upsert
  ├─ embed new summary (EmbeddingGemma)
  ├─ update point payload
  └─ refresh named vectors
  ↓
[Trace export] agent_runs table
  ├─ logged automatically during retrieval
  ├─ columns: user_prompt, cache_hit, retrieval_strategy, latency_ms
  └─ indexed on created_at for daily export
  ↓
[Reward dataset] artifact_rewards table
  ├─ score on: compilation, tests, lint, user_acceptance
  ├─ source: GAN validator (glyph_diffusion_service)
  └─ export to reward_score field
  ↓
[Replay export] .jsonl files
  ├─ good_traces.jsonl (reward > 0.7)
  ├─ bad_traces.jsonl (reward < 0.3)
  ├─ tool_calls.jsonl (for RL tuning)
  └─ sft_pairs.jsonl (for supervised fine-tuning)
```

---

## 7 Stub/Mock Functions to Wire

### ✅ 1. git-diff-supersedes-reconcile-production.mjs
**Current**: P0+P1 complete, P2-P6 scaffolded (empty returns)
**Wire**:
- P2: Qdrant HTTP REST (curl)
- P3: Redis key scanning (ioredis)
- P4-P6: All 7 validation probes (health checks)

**Acceptance**: All 5 npm scripts return real data (not empty)

---

### 🔴 2. feature-builder.ts (LangExtract)
**Current**: Stub function; returns hardcoded labels
**Wire**:
- Extract from AST: imports, exports, functions, routes
- Extract from code: domain keywords, ontology terms
- Call Gemma4 synthesis if needed (complex files)
- Store in metadata.feature_labels JSONB array

**Acceptance**: feature_labels populated for 100% of new packets

---

### 🔴 3. glyph-diffusion-service.ts (GAN validation)
**Current**: Stub; returns mock GAN score
**Wire**:
- Call GAN model endpoint (Python sidecar or ONNX)
- Score summary coherence + factuality + legal relevance
- Flag bad summaries (score < 0.6)
- Store in atlas_artifacts.gan_score

**Acceptance**: gan_score field populated; bad summaries rejected

---

### 🔴 4. code-llm-index.ts (Summary extraction)
**Current**: Stub; returns lorem ipsum
**Wire**:
- Call Gemma4 to generate summary
- QA check (reject <think>, TODO, lorem, hallucinations)
- Deduplicate against existing summaries (content_hash)
- Return clean summary + hash

**Acceptance**: summaries coherent, no duplicates

---

### 🔴 5. atlas-reward-cache.ts (Reward scoring)
**Current**: Stub; returns empty ZSET
**Wire**:
- Score artifact on: compilation, tests, lint, user_acceptance, performance, security
- Source from GAN validator (gan_score)
- Source from user feedback (explicit accept/reject)
- Aggregate via weighted average
- Store in Redis ZSET for fast ranking

**Acceptance**: reward_zset populated; top packets identifiable by score

---

### 🔴 6. agents-context-source.ts + feature-builder.ts (Feature label aggregation)
**Current**: Stub; returns partial labels
**Wire**:
- Merge LangExtract output + AST extraction + Gemma4 synthesis
- Deduplicate labels
- Assign priority / confidence scores
- Store in metadata.feature_labels

**Acceptance**: feature_labels complete; no duplicates

---

### 🔴 7. cross-encoder-reranker.ts (Semantic diff)
**Current**: Stub; always returns 'full' regeneration
**Wire**:
- Embed old summary + new summary (EmbeddingGemma)
- Compute cosine similarity
- Apply decision logic:
  - 0.99+: skip regeneration
  - 0.95-0.99: update metadata only
  - 0.80-0.95: regenerate summary
  - 0.60-0.80: GAN review required
  - <0.60: full regeneration + GAN validation
- Store decision in atlas_semantic_diffs table

**Acceptance**: semantic_diffs table populated; regenerations correctly gated

---

## Implementation Order

**Phase 85a** (Days 1-3, 20 hours):
1. Wire semantic diff (cross-encoder-reranker.ts) — gates all downstream work
2. Wire artifact registry (atlas_artifacts table + logging) — prerequisite for tracking
3. Wire summary QA (code-llm-index.ts) — validates before storage

**Phase 85b** (Days 3-4, 15 hours):
4. Wire feature label extraction (feature-builder.ts + LangExtract)
5. Wire GAN validation (glyph-diffusion-service.ts)
6. Wire reward scoring (atlas-reward-cache.ts)

**Phase 85c** (Days 5-6, 10 hours):
7. Wire git-diff P2-P6 probes (Qdrant, Redis, validation)
8. Wire replay export (agent_runs → .jsonl)
9. Wire reward export (artifact_rewards → training pairs)

---

## Success Criteria (Stage 5 Validation)

✅ packet_key unchanged across entire loop  
✅ source_ref unchanged across entire loop  
✅ feature_id unchanged across entire loop  
✅ content_hash tracked for every artifact  
✅ summary_hash tracked for every summary  
✅ supersedes_artifact_id set when regenerating  
✅ atlas_semantic_diffs populated with similarity scores  
✅ atlas_artifacts populated with generator + version  
✅ atlas_rewards populated with scores  
✅ agent_runs populated with traces  
✅ good_traces.jsonl exported (reward > 0.7)  
✅ bad_traces.jsonl exported (reward < 0.3)  
✅ sft_pairs.jsonl exported for fine-tuning  
✅ No duplicate modules  
✅ No duplicate scripts  
✅ No mock/stub functions in production path  

---

## Reference Docs (Already Exist)

- Schema: `docs/architecture/PHASE-85-ARTIFACT-REGISTRY-SPEC.md`
- Quick ref: `docs/PHASE-85-QUICK-REFERENCE.md`
- P0+P1: `docs/SESSION-84-SUMMARY-P0P1-COMPLETE-GAPS-IDENTIFIED.md`
- Universal registry: `.tmp/UNIVERSAL-REGISTRY-DUPLICATE-CHECK-TO-RANK.md`

---

## Blocker: None

All dependencies are satisfied. All supporting infrastructure (Gemma4, EmbeddingGemma, Qdrant, Redis, Postgres) is live.

**Start date**: June 27, 2026  
**Target completion**: July 4, 2026  
**Effort**: 45 hours (7.5 days at 6h/day)

This is purely consolidation. No new architecture. Reuse existing code. Replace mocks.
