# Atlas TypeScript AST CALLS Extractor — Implementation Plan

**Priority**: HIGH (unblocks 5K-10K new semantic edges)
**Estimated Duration**: 3-4 hours
**Deliverables**: CALLS edges in Neo4j + Redis cache

---

## What This Does

Extracts function/method **calls** from TypeScript source code using `ts-morph` AST parser.

**Input**: Source files (`.ts`, `.svelte.ts`)
**Process**: Parse → find all call expressions → resolve callee names → emit edges
**Output**: NDJSON format: `{ source_file, line_num, caller, callee, type }`
**Storage**: Neo4j `(file) -[CALLS]-> (function)` + Redis `calls:${file}` hash

---

## Why This Matters

Right now your edge graph is:
- IMPORTS edges (11,110 resolved)
- Mostly static structure

After CALLS extraction you'll have:
- IMPORTS edges (static dependency structure)
- CALLS edges (dynamic call graph, 5K-10K new edges)
- USES_DB edges (future)
- USES_TOOL edges (future)

**Result**: Graph can answer "What calls this function?" instead of just "What imports this module?"

---

## Implementation Strategy

### Phase 1: AST Extraction (1-2h)

**File**: `scripts/atlas/extract-calls-graph.mjs`

```javascript
// Pseudocode
import ts from 'typescript';
import { Project } from 'ts-morph';

const project = new Project({ tsConfigFilePath: 'tsconfig.json' });
const sourceFiles = project.getSourceFiles('src/**/*.ts');

for (const file of sourceFiles) {
  const filePath = file.getFilePath();
  
  // Find all function/method definitions
  const functions = file.getDescendantsOfKind(ts.SyntaxKind.FunctionDeclaration);
  const methods = file.getDescendantsOfKind(ts.SyntaxKind.MethodDeclaration);
  
  for (const func of [...functions, ...methods]) {
    const callerName = func.getName();
    
    // Find all call expressions within this function
    const calls = func.getDescendantsOfKind(ts.SyntaxKind.CallExpression);
    
    for (const call of calls) {
      const expression = call.getExpression();
      const calleeName = resolveCalleeIdentifier(expression);
      
      if (calleeName) {
        emit({
          source_file: filePath,
          line_num: call.getStartLineNumber(),
          caller: callerName,
          callee: calleeName,
          type: 'function_call'
        });
      }
    }
  }
}

function resolveCalleeIdentifier(expr) {
  // Handle: func(), obj.method(), Module.func()
  if (expr.isKind(ts.SyntaxKind.Identifier)) {
    return expr.getText();
  }
  if (expr.isKind(ts.SyntaxKind.PropertyAccessExpression)) {
    const property = expr.getChildAtIndex(2);
    return property.getText();
  }
  return null;
}
```

**Output format (NDJSON)**:
```json
{"source_file":"src/lib/server/ai/gemma4-agent.ts","line_num":145,"caller":"runGemma4Agent","callee":"selectAdaptiveMemory","type":"function_call"}
{"source_file":"src/lib/server/ai/gemma4-agent.ts","line_num":156,"caller":"runGemma4Agent","callee":"recordChunkHits","type":"function_call"}
```

### Phase 2: Deduplication & Validation (30-45min)

**File**: `scripts/atlas/deduplicate-calls.mjs`

- Remove duplicate (caller, callee) pairs
- Filter out false positives (method calls on built-ins like `.map()`, `.filter()`)
- Write to `.tmp/calls-edges.ndjson`

### Phase 3: Neo4j Ingestion (30-45min)

**File**: Use existing `neo4j-sync.mjs` or new `scripts/atlas/ingest-calls-to-neo4j.mjs`

```cypher
// Cypher to create CALLS relationships
LOAD CSV FROM 'file:///calls-edges.csv' AS row
MATCH (caller:Function {name: row.caller})
MATCH (callee:Function {name: row.callee})
CREATE (caller)-[:CALLS {source_file: row.source_file, line_num: toInteger(row.line_num)}]->(callee)
```

### Phase 4: Redis Caching (15-30min)

Cache call graph per file for fast ACE retrieval:

```javascript
// For file src/lib/server/ai/gemma4-agent.ts:
redis.hset('calls:src/lib/server/ai/gemma4-agent.ts', 
  'runGemma4Agent', 'selectAdaptiveMemory,recordChunkHits,...'
);
```

---

## Expected Results

| Metric | Estimate | Impact |
|--------|----------|--------|
| CALLS edges extracted | 5K-10K | +50% edge density |
| Files with call graphs | ~1,500 | ~50% of codebase |
| Neo4j relationship density | 3.5x | Much higher path recall |
| ACE context quality | +20% | Better function-level context |

---

## How to Run

```bash
# 1. Extract calls graph
node scripts/atlas/extract-calls-graph.mjs --output .tmp/calls-edges.ndjson

# 2. Deduplicate & filter
node scripts/atlas/deduplicate-calls.mjs --input .tmp/calls-edges.ndjson --output .tmp/calls-edges-clean.ndjson

# 3. Ingest to Neo4j (dry-run first)
node scripts/atlas/ingest-calls-to-neo4j.mjs --input .tmp/calls-edges-clean.ndjson --dry-run

# 4. Cache in Redis (if dry-run looks good)
node scripts/atlas/cache-calls-in-redis.mjs --input .tmp/calls-edges-clean.ndjson

# 5. Verify
npm run smoke:calls-graph
```

---

## What Happens After

Once CALLS edges are in Neo4j:

1. **Atlas MCP tools can use them**: `atlas-tools.find_dependencies` now returns call chains
2. **ACE context improves**: Function-level context instead of just file-level
3. **Gemma4 routing improves**: Can suggest which functions to look at based on call graph
4. **LoRA training improves**: Calls data can feed into next generation fine-tuning

---

## Blockers

None identified. This works with or without resolving the 49 active-source imports (those are a separate concern).

---

## Related Documents

- `atlas-graph-plan-update.md` — 10-phase roadmap (CALLS extraction is phase 2)
- `SEMANTIC_CACHING_PHASE1_COMPLETE.md` — Phase 1 (just validated)
- `.claude/memory/MEMORY.md` — Session history

---

**Status**: READY TO IMPLEMENT
**Next Action**: Create `extract-calls-graph.mjs` and begin AST traversal

Generated by Claude (Anthropic) on 2026-05-29 15:45 PST