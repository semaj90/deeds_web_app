# Phase 2F.1 Implementation Plan — Safe Archive & Compare

**Date:** July 12, 2026  
**Status:** Pre-Implementation — Archive comparison and PostgreSQL survey complete

---

## Archive Status

**Location:** `deeds_labs/`

Existing archives found:
- `archive/` — General archive
- `consolidation-archive-2026-07-01/` — Recent consolidation (contains retrieval/)
- `p9-replay-datasets/` — P9 replay test data
- `root-archive-20260315/` — Historic backup

**Action:** Use existing archive structure; no new archives created until comparison complete.

---

## PostgreSQL Inventory (Real Data)

**Total packets:** 58,365  
**Phase-related:** 55 phase scripts  
**Evaluation-related:** 15 references (mostly docs, one registry)

### Existing Evaluation Work

| Type | Files | Purpose |
|------|-------|---------|
| **Synthesis Evaluation** | `/api/synthesis/evaluation/[id]/+server.ts` | Synthesis quality evaluation |
| **Evaluation Registry** | `schema/evaluation-registry.ts` | Task-function effectiveness |
| **Evaluation Plans** | `turbovec-evaluation-plan.md` | TurboVec benchmarking |
| **Knowledge Evaluation** | `docs/knowledge-source-evaluation.md` | Knowledge base assessment |

**Key Finding:** Existing evaluation work is for **synthesis quality** and **task function evals**, NOT for **retrieval ground-truth**.

---

## Phase 2F.1 Needs Analysis

**Schema Required (NEW):**
- `evaluation_queries` — 50+ test queries with metadata
- `evaluation_relevance` — Query→Chunk ground-truth with grades (0-3) and provenance
- Extend `phase2f_evaluation_results` with ablation tracking

**Existing Evaluation Registry Comparison:**
```
Existing (Task-Function):
  ├─ taskId, functionName, functionCategory
  ├─ latencyMs, throughputItemsPerSec, memoryPeakMb
  ├─ accuracy, matchesExpected, errorRate
  └─ Purpose: Track which functions work best

Phase 2F.1 (Retrieval Ground-Truth):
  ├─ queryId, chunkId, grade (0-3)
  ├─ source_type (AST|route|schema|test)
  ├─ extractor_version, confidence
  └─ Purpose: Ground-truth for retrieval ranking
```

**Decision:** Phase 2F.1 needs separate schema (NOT extend existing task-function evals).

---

## Safe Implementation Order

### Phase 1: Archive & Document (This Session)
- [x] Check deeds_labs archives
- [x] Query PostgreSQL for existing evaluation work
- [x] Compare existing vs needed schemas
- [ ] Create PHASE-2F.1-COMPARISON.md documenting findings
- [ ] Archive current schema definitions to deeds_labs before modifications

### Phase 2: Schema Creation (Next Session)
1. Backup current Drizzle schema
2. Create new tables (evaluation_queries, evaluation_relevance)
3. Test migration dry-run
4. Verify no conflicts with existing evaluation work

### Phase 3: Ground-Truth Extraction (Follow-Up)
1. Implement 4 extractors (AST, routes, schemas, tests)
2. Extract 50+ queries with real chunk_id references
3. Validate all chunk_ids exist in codebase_chunk_index

### Phase 4: FeatureEnvelope Types (Follow-Up)
1. Create TypeScript types (independent signal tracking)
2. Implement RRF computation functions
3. Write unit tests

### Phase 5: Evaluation Runner (Follow-Up)
1. Update runner to read real ground-truth
2. Implement 6 ablation configurations (defer AST-only)
3. Run full ablation suite

---

## Models Currently Available

**DO NOT INSTALL:**
- ✗ gemma2:2b (already removed from containers)
- ✗ Any new models

**KEEP ONLY:**
- ✓ gemma4-legal-iq4xs-direct.gguf (observation engine, port 8091)
- ✓ Go Retrieval (port 8100, currently unhealthy — do not touch)
- ✓ Ollama embeddinggemma:latest (embeddings)
- ✓ Gemma4 at :8090 (synthesis)

**Gemma4 Engines Status:**
- Port 8091 (observation): ✓ Model loaded, container healthy
- Port 8194 (evidence research): ✗ Unhealthy (will configure later)
- Port 8093 (recommendation): ✗ Unhealthy (will configure later)

---

## Risk Mitigation

### Before Any Schema Changes:
1. **Backup Drizzle schema** → `deeds_labs/backup-drizzle-schema-YYYYMMDD/`
2. **Export existing evaluation data** → `deeds_labs/evaluation-registry-export.json`
3. **Document table dependencies** → `PHASE-2F.1-SCHEMA-DEPENDENCIES.md`

### Before Any Code Changes:
1. **Git status check** — all uncommitted work committed or archived
2. **Branch creation** — `feature/phase-2f1-evaluation-corpus`
3. **Test dry-run** — schema migration on local copy first

### During Implementation:
1. **Never delete** — only add/extend tables
2. **Use migrations** — always via Drizzle, never raw SQL
3. **Verify chunk_ids** — all reference real codebase_chunk_index rows

---

## Files to Archive Before Starting

Create snapshots in `deeds_labs/phase-2f1-baseline/`:
- [ ] `src/lib/server/db/schema/` (entire directory)
- [ ] `drizzle/meta/_journal.json` (migration history)
- [ ] `drizzle/0*.sql` (all migration files)
- [ ] `src/routes/api/synthesis/evaluation/` (existing evaluation endpoint)
- [ ] `sveltekit-frontend/package.json` (scripts list)

---

## Next Steps

1. **Session N (This):** Complete archive comparison ✓
2. **Session N+1:** Create schema backups, begin task 1.1-1.4
3. **Session N+2:** Ground-truth extraction (tasks 2.1-2.8)
4. **Session N+3:** FeatureEnvelope types (tasks 3.1-3.6)
5. **Sessions N+4+:** Runner update, ablations, metrics, full evaluation

---

## Key Rules (ENFORCED)

- **Archive First:** Always backup before change
- **Compare First:** PostgreSQL tells us what exists
- **Use What We Have:** No new models, no package installs
- **Never Delete:** Only add/extend schema
- **Document Everything:** Each backup gets a README in deeds_labs
