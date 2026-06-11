# Phase 3D Validation Checklist — Production Readiness Gate

**Date**: June 11, 2026  
**Scope**: Critical fixes for retrieval telemetry foundation

---

## ✅ Critical Fixes Applied

### P0: Schema Duplication Check
- [x] Grep for duplicate `retrievalTelemetry` definitions
- [x] Confirmed: Exactly 1 definition at `src/lib/server/db/schema/retrieval-telemetry.ts:4`
- [x] No duplication artifacts found

### P1: Drizzle Index Mirror Fix
- [x] Removed `.desc()` from Drizzle schema indexes (not supported in all versions)
- [x] Created manual migration: `drizzle/manual/20260611_retrieval_telemetry.sql`
- [x] SQL migration contains proper `CREATE INDEX ... (col DESC)` syntax
- [x] Drizzle schema indexes kept simple (orderless)
- [x] Added composite `strategyCreatedIdx` to declare relationship

### P2: retrievalStrategy Enum
- [x] Field exists in `retrieval-telemetry.ts:21`
- [x] Type union: `'vector_only' | 'lexical_only' | 'structural_only' | 'fusion' | 'cold_neschrom'`
- [x] Default value: `'fusion'`
- [x] Field is required (`.notNull()`)
- [x] Indexed separately + in composite

### P3: Three Surfaces Instrumentation
- [x] Surface 1 (ACE Context Assembler): Fire-and-forget telemetry wired
  - Location: `src/lib/server/features/ai/ace/context-assembler.ts`
  - Emitter helper: `src/lib/server/telemetry/ace-telemetry-emitter.ts` (210 lines)
  - Captures: query, vectorHits, trigramHits, ftsHits, selectedPacketKey, selectedFeatureId, featureIds, latencyMs, retrievalStrategy, cacheHit, userId, surface
- [ ] Surface 2 (Hybrid Search): Pending Phase 3D.2 (next week)
- [ ] Surface 3 (HyperRAG): Pending Phase 3D.3 (optional)

---

## ✅ Phase 3E Foundation (Concept Memory Lifecycle)

### Three Critical Fields Added
- [x] `retrievalStrategy: text` — Tracks how each concept was discovered (vector_only, fusion, etc.)
- [x] `lastRetrievedAt: timestamp with time zone` — Enables lifecycle automation (active/warm/cold/archived)
- [x] `conceptTemperature: double precision` — Behavioral heat metric (0.0–1.0)

### Indexes Created
- [x] `idx_concept_records_retrieval_strategy` — Lane discovery patterns
- [x] `idx_concept_records_last_retrieved` — Timestamp-ordered scans (DESC)
- [x] `idx_concept_records_temperature` — Temperature-ordered ranking (DESC)
- [x] `idx_concept_records_active` — Composite: temperature DESC + last_retrieved DESC

### Schema Exports
- [x] `concept-records.ts` exports in `schema/index.ts:110`
- [x] `retrieval-telemetry.ts` exports in `schema/index.ts:111`
- [x] No circular dependencies
- [x] Types inferred: `ConceptRecord`, `NewConceptRecord`, `RetrievalTelemetry`, `NewRetrievalTelemetry`

---

## ✅ Database Migration File

**Location**: `sveltekit-frontend/drizzle/manual/20260611_retrieval_telemetry.sql`

### Verification
- [x] File exists and is readable
- [x] Contains `CREATE TABLE IF NOT EXISTS` (idempotent)
- [x] `concept_records` table definition includes all 16 columns
- [x] `retrieval_telemetry` table definition includes all 18 columns
- [x] All indexes have `IF NOT EXISTS` clauses
- [x] Descending indexes use SQL `DESC` syntax (not Drizzle `.desc()`)
- [x] Composite indexes properly structured

### Manual vs Drizzle
- [x] Manual migration not in Drizzle journal (correct; it's supplementary)
- [x] Will be applied when `npx drizzle-kit migrate` runs
- [x] No conflicts with numbered migrations (0000–0032)

---

## 🔧 In-Progress / Pending Verification

### TypeScript Compilation
- [ ] `npm run check:fast` complete (running)
- [ ] Expected result: 0 new errors introduced by schema changes
- [ ] If errors: Review imports in retrieval-telemetry.ts, concept-records.ts

### Phase 3D Test Suite
- [ ] `npm run test:telemetry:phase3d` passes
  - Gate 1: Database connection
  - Gate 2: Verify retrieval_telemetry table schema
  - Gate 3: Insert sample telemetry record
  - Gate 4: Verify retrieval_strategy index
  - Gate 5: Check statistics (hit counts, latency, cache hit rate)

### Production Readiness Audit
- [ ] `npm run atlas:production-readiness` returns: PASS 66 / WARN 0 / FAIL 0
- [ ] No regressions from current baseline

---

## 🚨 Critical Constraints (Hard Rules)

1. **Fire-and-forget always**
   - Telemetry emission must be `async` and non-blocking
   - Errors logged but never thrown
   - Query execution never delayed

2. **No retrospective mutations**
   - Telemetry emitted BEFORE return statement
   - Not after (which could race with error handling)

3. **retrievalStrategy field is CRITICAL**
   - Every telemetry record MUST have a value
   - Used for retrieval quality evaluation
   - Cannot be nullable

4. **Collect >1,000 baseline queries**
   - Before Phase 3F/3G policy decisions
   - Before cache policy changes
   - Before NESCHROM97 cold-card promotion

5. **NESCHROM97 cold cards stay out**
   - Do NOT promote cold cards into Qdrant/Neo4j
   - Until telemetry proves demand
   - Phase 3F/3G gate: "Must have >100 cold-card retrievals in baseline"

---

## 🔍 Validation Commands (Post-Fix)

Run these to verify all changes are correct:

```bash
# 1. Check TypeScript compilation
npm run check:fast

# 2. Verify single retrievalTelemetry definition
rg -n "retrievalTelemetry = pgTable" src/lib/server/db --type ts

# 3. Verify single conceptRecords definition
rg -n "conceptRecords = pgTable" src/lib/server/db --type ts

# 4. Count schema exports
grep -c "export.*from.*\./retrieval-telemetry\|export.*from.*\./concept-records" \
  src/lib/server/db/schema/index.ts

# 5. Run Phase 3D test suite
npm run test:telemetry:phase3d

# 6. Production readiness audit
npm run atlas:production-readiness

# 7. Check git status (commits pending)
git status

# 8. View pending Phase 3D documentation
ls -1 docs/phase-3d* docs/phase-3e*
```

---

## 📊 Expected Outcomes

### Successful Validation
- TypeScript errors: 0 (no regressions)
- Test suite: 5/5 gates pass
- Production readiness: PASS 66 / WARN 0 / FAIL 0
- Pending commits: Phase 3D implementation files

### Failure Modes & Recovery

**Scenario A**: `npm run check:fast` fails with "Cannot find module"
- **Diagnosis**: Import path typo or missing .js extension
- **Recovery**: Check imports in retrieval-telemetry.ts and concept-records.ts
- **Reference**: `import { ... } from '../schema-postgres.js'` (note .js)

**Scenario B**: Test suite Gate 2 fails ("Table does not exist")
- **Diagnosis**: Manual migration not applied or wrong table name
- **Recovery**: Check SQL file for typos; confirm table name matches `retrieval_telemetry`
- **Command**: `psql "$DATABASE_URL" -c "\d retrieval_telemetry"`

**Scenario C**: Production readiness drops below 66 PASS
- **Diagnosis**: New schema introduced unknown dependency
- **Recovery**: Revert concept-records schema changes; check for circular imports
- **Command**: `npm run atlas:production-readiness -- --verbose`

---

## 🎯 What's Next (Week 2)

1. **Phase 3D.2: Hybrid Search Instrumentation**
   - Wire `chooseRetrievalMode()` result
   - Set `retrievalStrategy` field
   - Test with >10 real queries

2. **Phase 3E.1: Concept Telemetry Integration**
   - Link `retrieval_telemetry` → `concept_records` updates
   - Recompute concept temperatures (nightly job)
   - Lifecycle transitions (active → warm → cold)

3. **Baseline Collection**
   - Run dev server for 1–2 weeks
   - Accumulate >1,000 queries
   - Generate telemetry summary report

4. **Gemma4 + QLoRA Preparation**
   - Export training dataset: (query, strategy, concepts, outcome)
   - Prototype SFT on concept-level examples
   - Plan integration with Gemma4 planning layer

---

## 📝 Documentation

- `docs/phase-3d-telemetry-fixes.md` — This session's P0–P3 fixes
- `docs/phase-3e-concept-memory-guide.md` — Phase 3E architecture & lifecycle
- `docs/architecture/phase-3d-telemetry-instrumentation.md` — Full implementation plan (existing)
- `src/lib/server/telemetry/ace-telemetry-emitter.ts` — Emitter code (210 lines)
- `scripts/phase-3d/test-retrieval-telemetry.mjs` — Test suite (5 gates)

---

## 🔗 Open Lanes Integration

**When ready**, add Phase 3D card to open lanes board:

```
Card: Phase 3D Retrieval Telemetry
Status: Foundation Complete (P0–P3)
Next: Surface 2 + Baseline Collection
Blocker: None (manual migration pending deploy)
Owner: Claude + Gemma4 Agent
Timeline: 2 weeks baseline → 4 weeks governance
```

---

**Checkpoint Reached**: P0 + P1 + P2 schema fixes complete. P3 Surface 1 wired. Phase 3E foundation ready.

**Validation Status**: Awaiting TypeScript check + test suite run.

**Risk Level**: LOW (manual migration is supplementary; no cascading failures if not applied immediately)

**Production Gate**: Can merge + deploy when `npm run check:fast && npm run test:telemetry:phase3d` both pass.
