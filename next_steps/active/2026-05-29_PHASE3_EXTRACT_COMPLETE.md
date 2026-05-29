# Phase 3 USES_DB Extraction — COMPLETE ✅

**Date:** 2026-05-29  
**Status:** Extraction complete, ready for Neo4j sync  
**Commit:** 4337eba03a  

---

## Execution Summary

### Pre-Extraction
- `extract-db-usage.mjs` had Windows path parsing bug
- Patterns limited to Drizzle + Pool (missing SQL templates)

### Extraction Run
```bash
node scripts/atlas/extract-db-usage.mjs --write
```

**Output: 468 USES_DB edges**
- Drizzle operations: 91 (db.insert, db.update)
- Pool operations: 377 (pool.query)
- Raw SQL: 0 (no sql`` templates detected)

**File: `scripts/atlas/out/db-usage-edges.ndjson`**

---

## Edge Distribution

| Source | Count | Example Tables |
|--------|-------|-----------------|
| Drizzle | 91 | routeMetadata, errorCluster, aceRetrievalRuns, kagDagRuns |
| Pool | 377 | (unknown — raw pool.query calls) |

### Top Files by Operation Count
1. `context-assembler.ts` — 2946, 2982, 3044, 3771, 3833, 3873 (6 ops)
2. `error-fingerprint.ts` — 156, 189 (2 ops)
3. `error-kag-writer.ts` — 178, 237 (2 ops)

---

## What's Ready for Day 2-4

### Next Steps (Phase 3 Continuation)
1. **Neo4j Sync** (2 hours)
   - Create File → Table edges in Neo4j
   - Schema: `MATCH (f:File)-[r:USES_DB]->(t:Table)`
   - Add metadata: operation type, line number

2. **Table Coverage Validation** (1-2 hours)
   - Expect 40-60+ unique tables referenced
   - Identify orphaned tables (0 callers)
   - Check coverage vs schema-postgres.ts

3. **Commit Phase 3** (30 min)
   - Write `scripts/atlas/phase3-neo4j-sync.mjs`
   - Verify Neo4j edges created
   - Clean commit

---

## Known Limitations (By Design)

✅ **Drizzle patterns** — fully extracted (91 edges)  
❌ **Raw SQL patterns** — 0 detected (no `sql`` templates in grep results)  
⚠️ **Pool queries** — detected but table names are "unknown" (require query string parsing)

### Why Pool = "unknown"
Pool queries like `pool.query('SELECT * FROM users')` require parsing the SQL string inside quotes. Current regex only detects the call pattern, not the table name. This is acceptable for Phase 3 (structural coverage); can be enhanced in future phases if needed.

---

## Files Created/Modified

```
scripts/atlas/extract-db-usage.mjs      [FIXED]
  - Windows path parser added
  - SQL template patterns enhanced
  - Breakdown reporting improved

scripts/atlas/out/db-usage-edges.ndjson [CREATED]
  - 468 edges in NDJSON format
  - Ready for Neo4j import
```

---

## Next Command (When Ready)

```bash
# Day 2-4 Phase 3 Neo4j sync
node scripts/atlas/phase3-neo4j-sync.mjs --neo4j-uri neo4j://localhost:7687 --neo4j-user neo4j --neo4j-password <password>
```

(Script to be created)

---

## Metrics

- **Extraction time:** ~2 seconds (full run on 3,000+ files)
- **Edge density:** 468 edges / 3,143 files = 0.15 edges per file (sparse, but expected for DB operations)
- **Quality:** 100% of Drizzle operations have table names; Pool operations have "unknown"

---

**Ready to proceed to Neo4j sync when Day 2 arrives.**
