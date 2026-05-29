# Atlas TypeScript AST USES_DB Extractor — Phase 3 Implementation Plan

**Priority**: HIGH (database-aware context for evidence, cases, citations)
**Estimated Duration**: 2-3 hours
**Deliverables**: USES_DB edges in Neo4j + Redis cache
**Blockers**: None — CALLS graph (Phase 2) validated ✅

---

## What This Does

Extracts database **usage** from TypeScript source code using `ts-morph` AST parser.

**Input**: Source files (`.ts`, `.svelte.ts`)
**Process**: Parse → find all DB operations → resolve table/column names → emit edges
**Output**: NDJSON format: `{ source_file, line_num, caller, table, operation, type }`
**Storage**: Neo4j `(file) -[USES_DB]-> (table)` + Redis `db_usage:${table}` hash

---

## Why This Matters

Currently your graph has:
- IMPORT edges (11,110 resolved) — static structure
- CALLS edges (164,909) — dynamic call graph

After USES_DB extraction you'll have:
- All three edge types in Neo4j
- Database-aware context: "What code reads/writes this table?"
- Query optimization insights: "Which tables are hot?"
- ACE can answer: "If I change evidence_vectors, what code breaks?"

**Result**: Graph becomes operationally useful for schema changes, data migrations, performance tuning.

---

## Implementation Strategy

### Phase 1: AST Extraction (1.5h)

**File**: `scripts/atlas/extract-db-usage.mjs`

```typescript
// Pseudocode
import { Project } from 'ts-morph';

const project = new Project({ tsConfigFilePath: 'tsconfig.json' });
const sourceFiles = project.getSourceFiles('src/**/*.ts');

for (const file of sourceFiles) {
  const filePath = file.getFilePath();
  
  // Pattern 1: db.select/insert/update/delete → resolve table
  // db.select().from(cases).where(...) → USES_DB: cases
  const callExprs = file.getDescendantsOfKind(SyntaxKind.CallExpression);
  
  for (const call of callExprs) {
    const name = call.getExpression().getText();
    
    if (/^db\.(select|insert|update|delete)$/.test(name)) {
      // Find .from(table) or .values() next in chain
      const table = resolveTableFromChain(call);
      emit({
        source_file: filePath,
        line_num: call.getStartLineNumber(),
        caller: getEnclosingFunction(call).getName() || 'module',
        table: table,
        operation: 'query',
        type: 'db_operation'
      });
    }
    
    // Pattern 2: sql`...` tagged templates
    if (name === 'sql') {
      // Extract table names from SQL string
      const sqlStr = call.getArguments()[0]?.getText() || '';
      const tables = extractTablesFromSQL(sqlStr);
      for (const table of tables) {
        emit({ source_file, line_num, ..., table, operation: 'sql', type: 'raw_sql' });
      }
    }
    
    // Pattern 3: import { users, cases, evidence } from schema → track these symbols
    // When we see users.findMany() or users.create(), we know it's the users table
    const importDecls = file.getImportDeclarations();
    for (const imp of importDecls) {
      if (imp.getModuleSpecifierValue().includes('schema')) {
        const symbols = imp.getNamedImports().map(ni => ni.getName());
        // Track symbol → table mapping
      }
    }
  }
}

function resolveTableFromChain(callExpr) {
  // Call: db.select().from(cases)
  // Walk up expression tree to find .from() argument
  let expr = callExpr.getExpression();
  while (expr) {
    const parent = expr.getParent();
    if (parent?.isKind(SyntaxKind.CallExpression)) {
      const name = parent.getExpression().getText();
      if (name.endsWith('.from')) {
        const table = parent.getArguments()[0]?.getText();
        return stripImportPrefix(table);  // 'cases' from import { cases }
      }
    }
    expr = parent;
  }
  return null;
}

function extractTablesFromSQL(sqlStr) {
  // Regex: FROM table_name, INSERT INTO table_name, UPDATE table_name, etc.
  const matches = sqlStr.match(/(?:FROM|INTO|UPDATE|TABLE)\s+(\w+)/gi);
  return (matches || []).map(m => m.split(/\s+/)[1].toLowerCase());
}
```

**Output format (NDJSON)**:
```json
{"source_file":"src/routes/api/cases/[id]/+server.ts","line_num":45,"caller":"loadCase","table":"cases","operation":"query","type":"db_operation"}
{"source_file":"src/routes/api/evidence/upload/+server.ts","line_num":123,"caller":"uploadEvidence","table":"evidence","operation":"insert","type":"db_operation"}
{"source_file":"src/lib/server/indexer/evidence-indexer.ts","line_num":78,"caller":"indexEvidence","table":"evidence_vectors","operation":"query","type":"db_operation"}
```

### Phase 2: Table Resolution (30min)

**File**: `scripts/atlas/resolve-db-tables.mjs`

- Canonicalize table names (some code may use camelCase `evidence_vectors`, some `evidenceVectors`)
- Cross-check against Drizzle schema (`schema-postgres.ts`) to verify table exists
- Filter out false positives (common method names that look like table names)
- Deduplicate (source_file, table, operation) tuples

### Phase 3: Neo4j Ingestion (30min)

**File**: Use existing `neo4j-sync.mjs` or new `scripts/atlas/ingest-db-usage-to-neo4j.mjs`

```cypher
// Pseudo-cypher
LOAD CSV FROM 'file:///db-usage-edges.csv' AS row
MATCH (file:CodebaseFile {path: row.source_file})
MATCH (table:DBTable {name: row.table})
CREATE (file)-[:USES_DB {operation: row.operation, line_num: toInteger(row.line_num), caller: row.caller}]->(table)
CREATE INDEX ON :(CodebaseFile)-[:USES_DB]-(:DBTable)
```

### Phase 4: Redis Caching (15min)

Cache table usage per file for fast ACE retrieval:

```javascript
// For table evidence_vectors:
redis.hset('db_usage:evidence_vectors',
  'usage_files', 'src/lib/server/indexer/evidence-indexer.ts,src/routes/api/codebase-index/...',
  'operation_counts', 'query:12,insert:3,update:1',
  'caller_density', 'indexEvidence:12,uploadEvidence:3'
);
```

---

## Expected Results

| Metric | Estimate | Impact |
|--------|----------|--------|
| USES_DB edges extracted | 500-800 | Database-aware context |
| Tables referenced | ~40-60 | Coverage of core schema |
| Neo4j relationship density | +0.3× | Graph fully connected (3 edge types) |
| ACE context quality | +10% | Better schema change impact analysis |

---

## How to Run

```bash
# 1. Extract DB usage
node scripts/atlas/extract-db-usage.mjs --output .tmp/db-usage-edges.ndjson

# 2. Resolve table names
node scripts/atlas/resolve-db-tables.mjs --input .tmp/db-usage-edges.ndjson --output .tmp/db-usage-edges-resolved.ndjson

# 3. Ingest to Neo4j (dry-run first)
node scripts/atlas/ingest-db-usage-to-neo4j.mjs --input .tmp/db-usage-edges-resolved.ndjson --dry-run

# 4. Cache in Redis (if dry-run looks good)
node scripts/atlas/cache-db-usage-in-redis.mjs --input .tmp/db-usage-edges-resolved.ndjson

# 5. Verify
npm run smoke:db-usage-graph
```

---

## What Happens After

Once USES_DB edges are in Neo4j:

1. **Schema Impact Analysis**: `atlas-tools.find_schema_dependents(table)` returns all files that read/write a table
2. **Migration Planning**: Can plan data migrations knowing which code touches which table
3. **Query Optimization**: Can identify hot tables and suggest indexing strategies
4. **ACE Context**: Schema changes trigger high-confidence context injection (file + USES_DB path to changed table)

---

## Blockers

None identified. CALLS graph validation passed ✅; USES_DB extraction is independent.

---

## Related Documents

- `atlas-graph-plan-update.md` — 10-phase roadmap (USES_DB is phase 3)
- `atlas-calls-extractor-implementation.md` — Phase 2 (just completed)
- `.tmp/calls-graph-summary.md` — Phase 2 quality report (clean ✅)

---

**Status**: READY TO IMPLEMENT
**Next Action**: Create `extract-db-usage.mjs` and begin AST traversal

Generated on 2026-05-29 20:50 PST
