# Phase 3D Telemetry — Critical Fixes Applied (June 11, 2026)

## P0: Schema Duplication ✅ RESOLVED
- **Issue**: Duplicate `retrievalTelemetry` table definitions reported in earlier audit
- **Verification**: `rg -n "retrievalTelemetry = pgTable" src/lib/server/db --type ts`
- **Result**: Exactly 1 definition found at `src/lib/server/db/schema/retrieval-telemetry.ts:4`
- **Status**: Clean, no action needed

## P1: Drizzle .desc() Index Mirror ✅ FIXED
- **Issue**: Drizzle v0.44 doesn't reliably support `.on(table.col).desc()` syntax; index ordering must be in SQL migration land
- **Fix Applied**: 
  - Kept Drizzle schema indexes simple: `.on(table.createdAt)` only
  - Moved all descending-index logic to manual SQL migration
  - Created `drizzle/manual/20260611_retrieval_telemetry.sql` with proper `CREATE INDEX ... ON table(col DESC)` syntax
- **Schema Update**: Added `strategyCreatedIdx` composite index in Drizzle (orderless) to declare the relationship
- **Migration SQL**: Contains explicit `DESC` ordering for:
  - `idx_retrieval_telemetry_created_at` (created_at DESC)
  - `idx_retrieval_telemetry_strategy_created` (retrieval_strategy, created_at DESC)
  - `idx_concept_records_active` (concept_temperature DESC, last_retrieved_at DESC)

## P2: retrievalStrategy Enum ✅ CONFIRMED
- **Field**: `retrievalStrategy` text field with type-level union
- **Location**: `src/lib/server/db/schema/retrieval-telemetry.ts:21`
- **Type**: `'vector_only' | 'lexical_only' | 'structural_only' | 'fusion' | 'cold_neschrom'`
- **Default**: `'fusion'`
- **Status**: Already in schema, properly typed, default matches expected behavior

## P3: Three Surfaces Instrumentation ✅ PREPARED
Phase 3D.1 focuses on three retrieval surfaces (not everything):

### Surface 1: ACE Context Assembler ✅ WIRED
- **File**: `src/lib/server/features/ai/ace/context-assembler.ts`
- **Emission Point**: Before return statement (~line 3806-3845)
- **Telemetry Helper**: `src/lib/server/telemetry/ace-telemetry-emitter.ts` (210 lines, fire-and-forget pattern)
- **Captured Fields**: query, vectorHits, trigramHits, ftsHits, selectedPacketKey, selectedFeatureId, featureIds, latencyMs, retrievalStrategy, cacheHit, userId, surface

### Surface 2: Hybrid Search ⏳ PENDING (Phase 3D.2)
- Entry point: `chooseRetrievalMode()` result
- Task: Wire `retrievalStrategy` classification at lane selection

### Surface 3: HyperRAG RPC ⏳ PENDING (Phase 3D.3)
- Entry point: `fetchACPKnowledgeResults()` Stage A0
- Task: Emit after packet selection + reranking

## New: Phase 3E Foundation (Concept Memory Lifecycle)

### Added Fields to concept_records

Three critical fields for behavioral learning:

1. **retrievalStrategy** `text`
   - Tracks which lane discovered each concept
   - Example: Concept A is always found via `lexical_only`, Concept B via `fusion`
   - Enables lane-specific optimization later

2. **lastRetrievedAt** `timestamp with time zone`
   - Enables lifecycle automation: active → warm → cold → archived
   - Without this, lifecycle cannot be computed accurately
   - Indexed descending for recent-first queries

3. **conceptTemperature** `double precision` (default 0.5)
   - Behavioral temperature (NOT directory temperature)
   - Derived from: `retrieval_count`, `recent_usage`, `repair_success`, `selection_frequency`
   - Range: 0.0 (cold/unused) to 1.0 (hot/frequently used)
   - Indexed descending + composite with `last_retrieved_at` for active-concept queries

### Indexes Added for Lifecycle Queries

```sql
idx_concept_records_retrieval_strategy       -- Lane discovery patterns
idx_concept_records_last_retrieved           -- Timestamp-ordered scans
idx_concept_records_temperature              -- Temperature-ordered ranking
idx_concept_records_active                   -- Composite: temperature DESC + last_retrieved DESC
```

## Architecture Milestone

This closes the gap between:

**Before**: Query → Retrieval → Packets → Answer
**After**: Query → Retrieval → Telemetry → Concept Synthesis → concept_records → Answer

Concepts are now **symbolically compressed abstractions** of observations, enabling:
- **Behavioral Learning**: retrieval_strategy + success_count → which lanes work
- **Lifecycle Governance**: last_retrieved_at + temperature → active/warm/cold transitions
- **Future QLoRA Dataset**: (query, strategy, concepts, outcome) → training examples for Gemma4 planning

## Database Migration

**File**: `sveltekit-frontend/drizzle/manual/20260611_retrieval_telemetry.sql`

Applies when migrations are run:
```bash
cd sveltekit-frontend
npx drizzle-kit migrate
```

**IF NOT EXISTS** clauses allow idempotent re-runs.

## Validation Checklist

- [x] Only 1 `retrievalTelemetry` definition
- [x] `.desc()` removed from Drizzle index definitions
- [x] `retrievalStrategy` enum present and typed
- [x] All 3 Phase 3E lifecycle fields added
- [x] Indexes created for new fields
- [x] Manual SQL migration prepared
- [x] ACE assembler instrumented (Point 1)
- [ ] svelte-check passes (running)
- [ ] Phase 3D test suite passes (next)

## Next Steps

1. **npm run check:fast** — Verify TypeScript compilation
2. **npm run test:telemetry:phase3d** — Run Phase 3D test suite (5 smoke gates)
3. **npm run atlas:production-readiness** — Verify infrastructure health (should remain PASS 66 / WARN 0 / FAIL 0)
4. **Phase 3D.2**: Wire hybrid search instrumentation (Week 2)
5. **Phase 3D.4**: Baseline collection (>1,000 real queries over 2 weeks)

## Hard Rules (From User Guidance)

1. **Fire-and-forget always** — Telemetry never blocks queries
2. **No retrospective mutations** — Emission happens before return, not after
3. **retrievalStrategy field is CRITICAL** — Every signal includes it; used for lane evaluation
4. **Collect >1,000 baseline queries** — Before Phase 3F/3G policy decisions
5. **NESCHROM97 cold cards stay out** — Until telemetry proves demand

## References

- Architecture: `docs/architecture/phase-3d-telemetry-instrumentation.md`
- Emitter: `src/lib/server/telemetry/ace-telemetry-emitter.ts`
- Context Assembler: `src/lib/server/features/ai/ace/context-assembler.ts`
- Schema: `src/lib/server/db/schema/retrieval-telemetry.ts` + `concept-records.ts`
- Test Suite: `scripts/phase-3d/test-retrieval-telemetry.mjs`

---

**Status**: P0 + P1 + P2 complete. P3 surface 1 complete. Phase 3E foundation ready. Awaiting `npm run check:fast` verification.
