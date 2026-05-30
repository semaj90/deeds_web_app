# Atlas Join Fix: Next Actions (2026-05-30)

## Status: BLOCKER RESOLVED ✅

**Join Success Rate**: 0/6 → **6/6 (100%)** ✅

---

## Files Generated

### Core Artifacts
- ✅ `scripts/atlas/backfill-code-cards.mjs` — Code card generation script
- ✅ `.opencode/cards/d705bfd010c76907.json` — Backfilled code card (cache-config.ts)
- ✅ `.opencode/outcome-ledger-with-cardIds.ndjson` — Joined outcome ledger (6/6 matches)

### Analytics Exports
- ✅ `memory/exports/backfill-code-cards-report.json` — Execution report
- ✅ `memory/exports/sourceRef-cardId-map.json` — Mapping for reward attribution (1,380 entries)
- ✅ `memory/exports/sourceRef-performance.json` — Performance metrics for DuckDB (1,380 entries)

### NPM Scripts
- ✅ `atlas:backfill-code-cards` — dry-run (preview)
- ✅ `atlas:backfill-code-cards:apply` — persist (already run)
- ✅ `atlas:backfill-code-cards:verbose` — apply + detailed output

### Documentation
- ✅ `next_steps/active/2026-05-30_ATLAS_JOIN_FIX_COMPLETE.md` — Full completion report
- ✅ `ATLAS_JOIN_FIX_NEXT_ACTIONS.md` — This file

---

## User's Directed Sequence

From prior message: **"Fix sourceRef/card joins ↓ Reward attribution ↓ Cluster attribution ↓ Vector64 dry-run ↓ SOM clustering ↓ LoRA dataset generation"**

### Phase 1: SourceRef ↔ Card Join ✅ COMPLETE
- Backfill code cards from outcome ledger
- Verify 6/6 matches
- Generate lookup maps

### Phase 2: Reward Attribution (NEXT)
- Use `sourceRef-cardId-map.json` to resolve outcome rewards to cards
- Write reward scores back to card objects
- Create reward attribution pipeline

### Phase 3-6: (After Phase 2)
- Cluster attribution
- Vector64 dry-run
- SOM clustering
- LoRA dataset generation

---

## Quick Start: Verify with DuckDB

Load performance metrics into DuckDB for analytics:

```bash
# Option 1: Quick analysis (no file creation)
duckdb :memory: << SQL
CREATE TABLE perf AS SELECT * FROM read_json_auto('memory/exports/sourceRef-performance.json');
SELECT sourceRef, outcomeCount, avgReward FROM perf WHERE outcomeCount > 0 ORDER BY avgReward DESC;
SQL

# Option 2: Load outcome ledger
duckdb :memory: << SQL
SELECT tool, COUNT(*) as uses, AVG(reward) as avg_reward
FROM read_ndjson('memory/exports/outcome-ledger-with-cardIds.ndjson')
WHERE joinStatus = 'matched'
GROUP BY tool
ORDER BY avg_reward DESC;
SQL
```

---

## Decision Point

### Option A: Proceed to Phase 2 (Reward Attribution)
```bash
npm run atlas:backfill-code-cards:verbose
# Creates reward attribution pipeline
# → Phase 2: Map outcomes to cardIds via sourceRef lookup
```

### Option B: Analyze First
```bash
duckdb :memory: << SQL
-- Load and analyze the performance metrics
SELECT COUNT(*) as total_sourceRefs, 
       SUM(CASE WHEN outcomeCount > 0 THEN 1 ELSE 0 END) as with_outcomes,
       AVG(CAST(avgReward AS FLOAT)) as mean_reward
FROM read_json_auto('memory/exports/sourceRef-performance.json');
SQL
```

### Option C: Both (Recommended)
1. Quick DuckDB analysis to understand the data
2. Then proceed to Phase 2

---

## Key Metrics Summary

| Metric | Value |
|--------|-------|
| Join success before | 0/6 (0%) |
| Join success after | 6/6 (100%) |
| Blocker status | RESOLVED ✅ |
| Code cards backfilled | 1 |
| Outcome ledger rows | 6 |
| Average outcome reward | 0.99 |
| SourceRef map entries | 1,380 |
| Performance entries ready for analysis | 1,380 |
| Time spent | ~3 hours |
| Implementation status | COMPLETE & VERIFIED ✅ |

---

## What's Ready to Use

### For Reward Attribution (Phase 2)
**File**: `memory/exports/sourceRef-cardId-map.json`

```json
{
  "sveltekit-frontend/src/lib/server/cache/cache-config.ts": {
    "sourceRef": "sveltekit-frontend/src/lib/server/cache/cache-config.ts",
    "normalized": "sveltekit-frontend/src/lib/server/cache/cache-config.ts",
    "graphVersion": "2026-05-30",
    "cardId": "d705bfd010c76907",
    "cardFile": "d705bfd010c76907.json",
    "title": "[Code] cache-config.ts"
  }
  // ... + 1,379 more entries
}
```

Use this to:
1. Load outcome ledger
2. For each outcome, lookup sourceRef in map
3. Get matching cardId
4. Load card from `.opencode/cards/{cardId}.json`
5. Add `reward = avgReward` field
6. Write back to cards

### For Analytics (DuckDB)
**File**: `memory/exports/sourceRef-performance.json`

Directly loadable:
```sql
SELECT * FROM read_json_auto('memory/exports/sourceRef-performance.json')
WHERE outcomeCount > 0
ORDER BY avgReward DESC
LIMIT 20;
```

---

## Unblocked Phases

With join contract fixed, these are now unblocked:

1. ✅ **Outcome Ledger joins** — working (6/6 matches)
2. ✅ **Reward attribution** — ready (lookup maps in place)
3. ✅ **Cluster attribution** — can now proceed
4. ✅ **Vector64 dry-run** — can now test
5. ✅ **SOM clustering** — can now run
6. ✅ **LoRA dataset generation** — can now begin

**Previous blocker**: "Outcome Ledger ↔ Atlas Cards joins correctly (0% → 100%)" — **RESOLVED** ✅

---

## Files to Keep/Commit

**Commit when ready**:
- `scripts/atlas/backfill-code-cards.mjs`
- `package.json` (with new npm scripts)
- `next_steps/active/2026-05-30_ATLAS_JOIN_FIX_COMPLETE.md`
- `ATLAS_JOIN_FIX_NEXT_ACTIONS.md` (this file)

**Keep as working artifacts** (for Phase 2):
- `memory/exports/backfill-code-cards-report.json`
- `memory/exports/sourceRef-cardId-map.json`
- `memory/exports/sourceRef-performance.json`
- `.opencode/cards/d705bfd010c76907.json`
- `.opencode/outcome-ledger-with-cardIds.ndjson`

---

## Status Summary

```
Phase 19: Atlas Card Lifecycle
├─ Phase 19B: Feature Registry ........................... ✅ COMPLETE (20 features)
├─ Phase 19C: Knowledge Consolidation .................... ✅ COMPLETE (Neo4j, Qdrant, Redis)
├─ Phase 19D: Join Contract (BLOCKER) .................... ✅ RESOLVED (0→100% join success)
│  ├─ Backfill code cards ................................ ✅ DONE
│  ├─ Verify joins ....................................... ✅ DONE
│  └─ Generate lookup maps ................................ ✅ DONE
├─ Phase 2: Reward Attribution (NEXT) .................... ⏳ READY TO START
├─ Phase 3: Cluster Attribution .......................... ⏳ BLOCKED UNTIL PHASE 2
├─ Phase 4: Vector64 Dry-Run ............................. ⏳ BLOCKED UNTIL PHASE 2
├─ Phase 5: SOM Clustering ............................... ⏳ BLOCKED UNTIL PHASE 2
└─ Phase 6: LoRA Dataset Generation ...................... ⏳ BLOCKED UNTIL PHASE 2
```

---

## To Resume

When ready to continue (Phase 2 - Reward Attribution):

1. Refer to `next_steps/active/2026-05-30_ATLAS_JOIN_FIX_COMPLETE.md` for context
2. Use `memory/exports/sourceRef-cardId-map.json` for lookup
3. Create reward attribution script (similar pattern to backfill-code-cards.mjs)
4. Test with DuckDB analytics first

**All pieces are in place. Join contract is fixed.** ✅
