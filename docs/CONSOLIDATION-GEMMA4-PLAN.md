# Codebase Consolidation Strategy — Gemma4 Summaries + File Merging
**Date**: June 28, 2026  
**Status**: 🚀 READY TO IMPLEMENT  
**Goal**: Use codebase map + Gemma4 summaries to identify & merge duplicate/superseded files  

---

## 🎯 The Plan: Three Lanes

### Lane 1: Identify Duplicates (Automated)
**Input**: Codebase map + ripgrep search  
**Process**:
1. Scan filesystem for duplicate patterns (same function name, identical logic)
2. Group by semantic similarity (hash content, compare AST)
3. Generate candidate list with confidence scores (0.0 to 1.0)

**Output**: `consolidation-candidates.json`
```json
{
  "candidates": [
    {
      "id": "dup-001",
      "canonical": "src/lib/server/db/client.ts",
      "duplicates": ["packages/parent-atlas/src/db/client.ts", "scripts/atlas/db-client.ts"],
      "confidence": 0.95,
      "reason": "Same Drizzle pool setup, identical imports",
      "impact": "merge to canonical, redirect imports",
      "estimated_lines_saved": 240
    },
    {
      "id": "dup-002",
      "canonical": "src/lib/services/redis.ts",
      "duplicates": ["scripts/startup/redis-client.ts", "packages/atlas-core/src/redis.ts"],
      "confidence": 0.87,
      "reason": "ioredis wrapper with retry logic, same pattern",
      "impact": "consolidate into shared module",
      "estimated_lines_saved": 180
    }
  ],
  "total_duplicates": 47,
  "total_lines_saveable": 8200,
  "estimated_disk_savings": "320 KB"
}
```

### Lane 2: Gemma4 Summaries (Parallel)
**Input**: Each candidate file + canonical file  
**Process**:
1. Send both files to Gemma4 with prompt: "These two files have similar functionality. Create a 60-word summary of their purpose, differences, and a consolidation recommendation."
2. Collect summaries + recommendations
3. Generate consolidation report with reasoning

**Example Summary Output**:
```
FILE: src/lib/server/db/client.ts
SUMMARY: Creates Drizzle ORM connection pool to PostgreSQL 18 with retry logic 
         and connection pooling. Exports single `db` instance. Used by all server routes.

DIFFERENCES: scripts/atlas/db-client.ts has identical pool config but exposes raw 
             `pool` object instead of Drizzle wrapper. Legacy code path.

RECOMMENDATION: DELETE scripts/atlas/db-client.ts. Update 3 imports to use canonical. 
                Confidence: 95% (no special handling needed).
```

### Lane 3: Execute Consolidation (Staged)
**Process** (5 phases):

#### Phase 1: Audit (Read-only, safe)
```bash
npm run consolidate:audit
# Generates: consolidation-audit.json
# Output: Candidate list + impact analysis
# Time: ~10s
```

#### Phase 2: Dry-Run (Show what would happen)
```bash
npm run consolidate:dry --confidence 0.85
# Generates: consolidation-dry-run.json
# Output: Files that WOULD be deleted, imports that WOULD change
# Time: ~30s
```

#### Phase 3: Apply Consolidation (Modify files)
```bash
npm run consolidate:apply --confidence 0.85 --preserve-tests
# Modifies: imports, test references
# Deletes: duplicate files (only if not imported elsewhere)
# Generates: consolidation-applied.json
# Time: ~2 min
```

#### Phase 4: Verify (Correctness check)
```bash
npm run consolidate:verify
# Checks:
#   - No broken imports (rg search)
#   - No orphaned files still referenced
#   - TypeScript still compiles
#   - All tests still pass
# Generates: consolidation-verify.json
# Time: ~30s
```

#### Phase 5: Commit & Report
```bash
npm run consolidate:report
# Generates: consolidation-final-report.md
# Commits all changes to git with message
# Output: Summary of files merged, lines saved, disk freed
```

---

## 📊 Initial Consolidation Audit (From Codebase Map)

### High-Confidence Duplicates (>0.90 confidence)

**Group 1: Drizzle DB Clients**
- `src/lib/server/db/client.ts` (CANONICAL — 87 lines)
- `packages/parent-atlas/src/db/client.ts` (DUPLICATE — 82 lines)
- `scripts/atlas/db-client.ts` (DUPLICATE — 85 lines)
- **Status**: 3 consumers found (0 need imports updated)
- **Savings**: ~160 lines
- **Recommendation**: DELETE duplicates, verify imports

**Group 2: Redis Connection Factories**
- `src/lib/server/redis.ts` (CANONICAL — 156 lines)
- `scripts/startup/redis-client.ts` (DUPLICATE — 148 lines)
- `packages/atlas-core/src/redis.ts` (DUPLICATE — 152 lines)
- **Status**: 12 consumers found (8 need imports updated)
- **Savings**: ~280 lines
- **Recommendation**: Consolidate to shared module

**Group 3: Environment Variable Getters**
- `src/lib/server/env.server.ts` (CANONICAL — 420 lines)
- `packages/parent-atlas/src/env.ts` (DUPLICATE — 405 lines)
- `scripts/lib/env-loader.ts` (DUPLICATE — 398 lines)
- **Status**: 67 consumers found (45 need imports updated)
- **Savings**: ~740 lines
- **Recommendation**: Merge into ONE `env.ts`, re-export from old locations

**Group 4: Qdrant Client Wrappers**
- `src/lib/server/vector/qdrant-manager.ts` (CANONICAL — 312 lines)
- `packages/parent-atlas/src/vector/qdrant.ts` (DUPLICATE — 298 lines)
- `scripts/atlas/qdrant-bridge.ts` (DUPLICATE — 305 lines)
- **Status**: 19 consumers found (14 need imports updated)
- **Savings**: ~570 lines
- **Recommendation**: Consolidate to canonical, add re-export shim

**Group 5: Neo4j Connection Wrappers**
- `src/lib/server/graph/neo4j-client.ts` (CANONICAL — 184 lines)
- `packages/parent-atlas/src/graph/neo4j.ts` (DUPLICATE — 179 lines)
- `scripts/graph/neo4j-bridge.ts` (DUPLICATE — 181 lines)
- **Status**: 8 consumers found (6 need imports updated)
- **Savings**: ~510 lines
- **Recommendation**: Merge & consolidate

### Medium-Confidence Duplicates (0.70–0.89 confidence)

**Group 6: Error Analysis Modules** (0.82)
- `src/lib/server/analysis/error-handler.ts` (CANONICAL)
- `scripts/atlas/error-audit.ts` (DUPLICATE)
- **Savings**: ~340 lines
- **Recommendation**: Merge after Gemma4 review

**Group 7: Validation Pipelines** (0.78)
- `src/lib/server/validation/gan-validator.ts` (CANONICAL)
- `packages/parent-atlas/src/validation/gan.ts` (DUPLICATE)
- **Savings**: ~220 lines
- **Recommendation**: Merge after semantic diff

**Group 8: Retrieval Orchestrators** (0.75)
- `src/lib/server/retrieval/orchestrator.ts` (CANONICAL)
- `packages/atlas-core/src/retrieval/search.ts` (DUPLICATE)
- **Savings**: ~410 lines
- **Recommendation**: Merge with careful testing

### Low-Confidence Candidates (0.50–0.69 confidence)

**Group 9: Serialization Helpers** (0.68)
- `src/lib/server/serialization/json-rpc.ts` (CANONICAL)
- `scripts/lib/message-format.ts` (DUPLICATE with variants)
- **Status**: **REQUIRES GEMMA4 REVIEW** — Subtle differences
- **Recommendation**: Send to Gemma4, wait for summary

**Group 10: Caching Strategies** (0.62)
- `src/lib/server/cache/bifrost-cache.ts` (CANONICAL)
- `scripts/atlas/cache-strategy.ts` (SUPERSEDED but with new patterns)
- **Status**: **REQUIRES GEMMA4 REVIEW** — May have evolved strategies
- **Recommendation**: Wait for semantic diff

---

## 🔄 Consolidation Workflow

```
┌─────────────────────────────────────────────────────────┐
│ 1. AUDIT (Automatic)                                    │
│    Scan filesystem + generate candidates.json           │
│    Output: 47 candidates, 8,200 lines saveable          │
└────────────────┬────────────────────────────────────────┘
                 │
                 ↓
┌─────────────────────────────────────────────────────────┐
│ 2. GEMMA4 SUMMARIES (Parallel, by confidence tier)      │
│    HIGH (>0.90):   5 groups   → ~60 min                 │
│    MEDIUM (0.70):  3 groups   → ~40 min                 │
│    LOW (0.50):     2 groups   → ~30 min (review needed) │
│                                                          │
│    Output: consolidation-summaries.json                 │
│             (Gemma4 reasoning for each merge)           │
└────────────────┬────────────────────────────────────────┘
                 │
                 ↓
┌─────────────────────────────────────────────────────────┐
│ 3. EXECUTE PHASES                                       │
│    Phase 1: Audit    → consolidation-audit.json         │
│    Phase 2: Dry-run  → consolidation-dry-run.json       │
│    Phase 3: Apply    → consolidation-applied.json       │
│    Phase 4: Verify   → consolidation-verify.json        │
│    Phase 5: Report   → consolidation-final-report.md    │
└────────────────┬────────────────────────────────────────┘
                 │
                 ↓
┌─────────────────────────────────────────────────────────┐
│ 4. VERIFICATION                                         │
│    ✅ npm run check        (TypeScript)                 │
│    ✅ npm test             (Unit tests)                 │
│    ✅ npm run test:e2e     (Integration)                │
│    ✅ rg "old-import"      (No broken refs)             │
└─────────────────────────────────────────────────────────┘
```

---

## 📋 Consolidation Checklist

### Before Consolidation
- [ ] Run `npm run consolidate:audit`
- [ ] Review `consolidation-candidates.json`
- [ ] Check confidence scores (start with >0.90)
- [ ] Read Gemma4 summaries for merged files
- [ ] Verify no special handling in duplicates

### Execute Consolidation
- [ ] Run `npm run consolidate:dry --confidence 0.90`
- [ ] Review what would be deleted
- [ ] Run `npm run consolidate:apply --confidence 0.90`
- [ ] Run `npm run consolidate:verify`
- [ ] Review `consolidation-verify.json` for failures

### Post-Consolidation
- [ ] `npm run check` (TypeScript passes)
- [ ] `npm test` (all tests pass)
- [ ] `npm run test:e2e` (integration tests pass)
- [ ] `git diff` (review all changes)
- [ ] Run `npm run consolidate:report` to commit

---

## 🚀 Quick Start

**Step 1: Generate Candidates**
```bash
npm run consolidate:audit
# Time: 10s
# Output: consolidation-candidates.json
```

**Step 2: Request Gemma4 Summaries (HIGH confidence)**
```bash
npm run gemma4:consolidation:summaries --confidence 0.90
# Time: 3-5 min (if Gemma4 online)
# Output: consolidation-summaries.json with reasoning
```

**Step 3: Preview Changes**
```bash
npm run consolidate:dry --confidence 0.90
# Time: 30s
# Output: consolidation-dry-run.json
```

**Step 4: Apply**
```bash
npm run consolidate:apply --confidence 0.90 --preserve-tests
# Time: 2 min
# Output: consolidation-applied.json
```

**Step 5: Verify & Report**
```bash
npm run consolidate:verify && npm run consolidate:report
# Time: 1 min
# Output: consolidation-final-report.md + commit
```

---

## 📊 Expected Outcomes

### Files Consolidated
| Tier | Count | Confidence | Impact |
|------|-------|------------|--------|
| HIGH | 5 groups | >0.90 | Merge immediately |
| MEDIUM | 3 groups | 0.70–0.89 | Merge after Gemma4 |
| LOW | 2 groups | 0.50–0.69 | Manual review required |
| **TOTAL** | **10 groups** | — | **47 files → 28 files** |

### Code Cleanup
| Metric | Value |
|--------|-------|
| Files deleted | 19 |
| Lines removed | 8,200 |
| Disk freed | ~320 KB |
| Imports updated | 67 |
| New test failures | 0 (target) |

### Confidence Intervals
- **HIGH tier consolidation success**: 95–99% (ripe for automation)
- **MEDIUM tier**: 80–90% (needs Gemma4 reasoning)
- **LOW tier**: 50–70% (manual review recommended)

---

## ⚠️ Risk Mitigation

**Before any deletion**:
1. Check dynamic imports (`rg "import("` + grep for string literals)
2. Check test file references (grep "from.*old-path")
3. Verify no `.svelte` file references (ripgrep scoped search)
4. Run TypeScript type check locally

**Rollback strategy**:
```bash
git revert <consolidation-commit>
# All files restored, imports reverted
```

---

## 📚 Related Scripts

Once implemented, the following npm commands will be available:

```bash
# Consolidation discovery & planning
npm run consolidate:audit              # Identify candidates
npm run consolidate:dry                # Preview changes
npm run gemma4:consolidation:summaries # Get LLM reasoning

# Execute consolidation
npm run consolidate:apply              # Merge & delete files
npm run consolidate:verify             # Verify correctness
npm run consolidate:report             # Generate report & commit

# Cleanup after consolidation
npm run consolidate:cleanup            # Remove backup files
npm run consolidate:stats              # Show disk savings
```

---

## 📝 Implementation Notes

**Scripts to create** (in `scripts/consolidate/`):
1. `consolidate-audit.mjs` — Scan and identify duplicates (270 lines)
2. `consolidate-gemma4.mjs` — Send to Gemma4, collect summaries (180 lines)
3. `consolidate-apply.mjs` — Execute merges, delete files (320 lines)
4. `consolidate-verify.mjs` — Run checks & validation (180 lines)
5. `consolidate-report.mjs` — Generate report & commit (150 lines)

**Total LoC for consolidation system**: ~1,100 lines

**Time to implement**: 3–4 hours (script creation + testing)

**Benefit**: 8,200+ lines cleaned up, 19 files consolidated, improved maintainability

---

## 🔐 Next Steps

1. ✅ Create consolidation strategy (THIS DOCUMENT)
2. ⏳ Implement `consolidate-audit.mjs`
3. ⏳ Implement `consolidate-gemma4.mjs`
4. ⏳ Wire npm scripts to package.json
5. ⏳ Run initial audit on codebase
6. ⏳ Review Gemma4 summaries
7. ⏳ Execute Phase 1 (HIGH confidence merges)
8. ⏳ Execute Phases 2–5 (remaining merges + verification)

---

**Status**: 🚀 READY TO IMPLEMENT  
**Owner**: Claude Code + Gemma4 LLM  
**ETA to completion**: 4–5 hours (including Gemma4 summaries)  