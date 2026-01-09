# Gemini Brief: Phase13 Integration Pattern

## 🔧 Phase 90/91 Transition: From Syntax to Semantics (Jan 8, 2026)

**Phase 90 Status:** ✅ COMPLETE (100% Codebase Coverage)
- **Total Files Processed:** 455
- **Total Fixes Applied:** 4,908
- **Error Reduction:** 51.6% (87,835 → 42,518)
- **Success Rate:** 53.2% overall

### 🧠 New Knowledge-Augmented Generation (KAG) Patterns
Three high-confidence patterns were added and validated in Batches 14-16:

1.  **UnionType (95% Confidence)**
    *   **Rule:** Never insert commas near `|` operators.
    *   **Context:** `type ID = number | string;` (Correct) vs `type ID = number, string;` (Incorrect).
    *   **Source:** TypeScript Handbook, Stack Overflow.

2.  **ForStatement (90% Confidence)**
    *   **Rule:** Commas allowed ONLY in init/afterthought, never in condition.
    *   **Context:** `for (let i=0; i<10; i++)` (Correct) vs `for (let i=0; i<10,; i++)` (Incorrect).
    *   **Source:** MDN Specifications.

3.  **TypeAliasDeclaration (90% Confidence)**
    *   **Rule:** Commas for object props; Pipe/Ampersand for Union/Intersection.
    *   **Context:** `type P = { x: number, y: number };` (Correct).

### 🔮 Phase 91 Strategy: Semantic Repair
With "easy" syntax errors resolved, we shift focus to:
1.  **Svelte 5 Migration:** Fixing `$:` blocks, event handlers, and `export let` props.
2.  **Type Mismatches:** Resolving `TS2322` and `TS2339`.
3.  **Enhancement:** Upgrading `phase90-enhanced-ast-fixer.mjs` to use `TypeChecker` for semantic analysis.

---

## 🔧 TypeScript Language Server: Module Export Cache Issue

**Problem:** `Module '"$lib/server/db"' has no exported member 'db'` (but export exists)

**Cause:** TypeScript Language Server caches module shapes. When `index.ts` is modified, TSServer doesn't reload.

**Fix:**
```
Ctrl+Shift+P → "TypeScript: Restart TS Server"
```

**Code Snippet:**
```typescript
// Ensure correct import path
import { db } from '$lib/server/db';
```

---

## 🔧 PostgreSQL Authentication: Fallback Strategy (Jan 9, 2026)

**Problem:** Production deployments may have different user credentials than development.

**Solution:** Implement fallback authentication in `service-integrations.ts`:

```typescript
postgresConfig: {
  host: dbUrl.hostname || 'localhost',
  port: parseInt(dbUrl.port || '5432', 10),
  database: dbUrl.pathname.slice(1) || 'legal_ai_db',
  user: dbUrl.username || process.env.POSTGRES_USER || 'legal_admin',
  password: dbUrl.password || process.env.POSTGRES_PASSWORD || '123456',
  // Fallback to superuser if legal_admin fails
  fallbackUser: 'postgres',
  fallbackPassword: process.env.POSTGRES_SUPERUSER_PASSWORD || 'postgres'
}
```

**Benefits:**
- **Development:** Uses `legal_admin` by default
- **Production:** Falls back to `postgres` superuser if app user fails
- **Flexibility:** Supports environment variable overrides

**Database Credentials:**
- Primary: `legal_admin` / `123456`
- Fallback: `postgres` / (from env or `postgres`)
- Database: `legal_ai_db`

**Why:** Runtime works perfectly - this is purely an IDE/editor cache issue.

**Prevention:**
- After modifying barrel files (`index.ts`), restart TSServer
- Avoid circular dependencies between schema and db files
- Clear `.svelte-kit` cache if issues persist: `rm -rf .svelte-kit && npm run dev`

---

- Health probes (cached): Ollama (`getOllamaEndpoint`), Enhanced RAG `/health`, Qdrant `healthz/readyz/collections`, Redis via env/ping, DB via env presence, Docker flag.
- Preferences: Enhanced RAG first, else Ollama `gemma3-legal:latest`; vector DB Qdrant > pgvector > memory; DB prod URL > memory; Redis caching when present.
- Performance stance: enable SSR, code splitting, UnoCSS; Redis-or-memory caching.
- Endpoint: `/api/system/phase13` exposes status + recommendations.
- Env-only wiring (no container changes): `ENHANCED_RAG_URL`, `DATABASE_URL` + `PGVECTOR_ENABLED`/`ENABLE_PGVECTOR`, `REDIS_URL`/`UPSTASH_REDIS_REST_URL`, `QDRANT_URL`, `OLLAMA_URL`/`OLLAMA_BASE_URL`, optional Docker flags.
// ...existing code...
- Replicate this shape for other health endpoints; call `initializePhase13()` or hit the GET endpoint for status.

---

## 🔧 Phase 89: Systematic Error Reduction Patterns (Jan 6, 2026)

**Status:** 40,555 → 39,762 errors (-793 total, **1.84x cascade multiplier**)
- Direct pattern fixes: -431 errors
- Cascading error collapse (cache rebuild): -362 errors

### Validated Correction Patterns (7 patterns)

| Pattern | Before | After | Impact |
|---------|--------|-------|--------|
| 1. Semicolon→Comma (FIXED) | `provider: LLMProvider; model:` | `provider: LLMProvider, model:` | ✅ 368 fixes |
| 2. Missing Object Comma | `: value nextProp:` | `: value, nextProp:` | ✅ 362 fixes |
| 3. Missing Semicolon After } | `}\nconst x` | `};\nconst x` | ✅ 228 fixes |
| 4. Trailing Comment Paren | `fn(arg, // comment\n` | `fn(arg); // comment\n` | ✅ 165 fixes |
| 5. Map.set Brace | `.set(k, {v}) }` | `.set(k, {v}));\n}` | Medium |
| 6. Nested Block Semicolon | `} }\nreturn` | `} };\nreturn` | Medium |
| 7. Arrow Function | `=> {code}` | `=> { code }` | Low |

**CRITICAL LESSON:** Pattern #1 initially created double punctuation (`;,`). Fixed by matching semicolon in capture group and replacing with comma only.

### Error Distribution Analysis (TS1005: 25,507 total)

- **Missing Commas:** 14,664 (57%) - Requires AST-level context
- **Missing Semicolons:** 5,444 (21%) - Statement terminators
- **Missing Colons:** 3,302 (13%) - Type annotations
- **Missing Braces/Parens:** 848 (3%) - Block/function closures
- **Other:** 1,249 (5%) - Edge cases

### Cascading Error Collapse Discovery (Jan 6, 2026)

**Experiment:** Deleted `.svelte-kit` cache and rebuilt → Revealed **-362 hidden errors** resolved by pattern fixes

**Key Finding:** One syntax error generates 3-5 TypeScript diagnostics:
```typescript
// ❌ Before (1 syntax error → 5 diagnostics)
interface Config {
    provider: string
    model: string    // Missing comma
}

// Errors generated:
// 1. TS1005: ',' expected
// 2. TS1128: Declaration or statement expected
// 3. TS2304: Cannot find name 'model'
// 4. TS1005: ':' expected
// 5. TS2304: Cannot find name (cascading context confusion)
```

**Cascade Multiplier:** 793 total errors ÷ 431 visible = **1.84x**

**Implication for Phase 90:** AST-based fixer targeting 14,664 missing commas has projected impact of:
- Conservative: -9,200 errors
- Optimistic: -18,400 errors
- With 1.84x multiplier factored in

### Infrastructure Deployed

✅ **Redis Documentation:** 10,946 chunks in Qdrant (`redis_documentation` collection)
✅ **Batch Processing Scripts:** `batch-fix-errors-batch[2-5]-corrected.mjs`
✅ **Backup Strategy:** 101 `.backup-*` files created before modification
✅ **Analysis Tools:** `analyze-ts1005-patterns.mjs`, `targeted-comma-fixer.mjs`
✅ **Cache Collapse Validation:** `Remove-Item .svelte-kit; npm run build; npm run check`

### What Works vs. What Doesn't

**✅ Regex Patterns Work For:**
- Simple punctuation swaps (`;` → `,`)
- Consistent formatting issues
- Isolated syntax problems
- **High ROI when combined with cache rebuild** (1.84x multiplier)

**❌ Regex Patterns Fail For:**
- Context-dependent comma placement (interfaces vs. objects vs. arrays)
- Type-aware semicolon insertion (statements vs. expressions)
- Nested structures requiring scope analysis
- **Specialized fixers without AST context** (e.g., targeted comma fixer: +1,125 regression)

**Next Phase (Phase 90):** Implement TypeScript Compiler API-based fixer using `ts.createSourceFile`, `ts.getPreEmitDiagnostics`, and `ts.textChanges` for surgical fixes with full AST context.

---

## 🚀 Phase 90: TypeScript AST Fixer (Jan 6-8, 2026)

**Status:** ACTIVE - Web Research Complete, Batch 13 Executed, Batches 14-16 Queued
**Implementation:** `scripts/phase90-ast-fixer.mjs` (640 lines)

### Latest Progress (Jan 8, 2026)

**Batch 13 Results:** 70% success rate (35/50 files), 889 fixes, 0 rollbacks
- Cumulative: 255 files, 4,286 fixes, 67% success rate across Batches 1-13
- Redis KAG: 4 active patterns + 3 new high-confidence patterns queued

**Priority 1 Web Research COMPLETE:**
1. ✅ **UnionType Pattern** (95% confidence) - TypeScript Handbook, Stack Overflow 474 questions
2. ✅ **ForStatement Pattern** (90% confidence) - MDN JavaScript reference, Stack Overflow 824k views
3. ✅ **TypeAliasDeclaration Pattern** (90% confidence) - TypeScript Handbook, Stack Overflow 38 questions

**New Patterns Ready for Redis:**
```json
{
  "UnionType": "DO NOT insert comma near union type pipe (|) separator",
  "ForStatement": "Commas ONLY in initialization & afterthought, NEVER in condition",
  "TypeAliasDeclaration": "Commas valid in object properties/generics/tuples, NEVER in unions (|) or intersections (&)"
}
```

**Test Cases Created:** 45+ examples across 3 patterns in `phase90-pattern-test-cases.ts`
**Redis Update Script:** `phase90-update-redis-patterns.mjs` ready to execute

**Next: Execute Batches 14-16** (150 files, ranks 256-405) with 7 total patterns (4 existing + 3 new)

### Critical Discovery: parseDiagnostics vs. getPreEmitDiagnostics

**Problem:** `ts.createProgram()` + `getPreEmitDiagnostics()` crashes with module resolution errors:
```javascript
TypeError: Cannot read properties of undefined (reading 'flags')
    at resolveAlias (typescript.js:53660:26)
```

**Solution:** Use syntax-only diagnostics to avoid type checking:
```javascript
// ❌ DON'T: Full type checking requires module resolution
const program = ts.createProgram([filePath], compilerOptions);
const diagnostics = ts.getPreEmitDiagnostics(program, sourceFile);

// ✅ DO: Syntax-level diagnostics only
const sourceFile = ts.createSourceFile(filePath, content, ts.ScriptTarget.Latest, true);
const diagnostics = sourceFile.parseDiagnostics;  // No module resolution needed
```

### First Test Results (llm-router.ts)

```
📊 Found 198 total errors (120 target TS1005)
🎯 Generated 7 potential fixes
📉 Errors: 198 → 190 (-8 errors)
✅ Success rate: 100% (7/7 fixes applied)
```

**Why only 7 fixes from 120 errors?**
Fixer is being **ultra-conservative** - skipping unknown contexts to avoid false positives:
- Skipped: BinaryExpression (e.g., `a + b`)
- Skipped: AwaitExpression (e.g., `await fn()`)
- Skipped: ExpressionStatement
- Skipped: PropertyAssignment (some cases)
- Skipped: MethodDeclaration

**Applied fixes:**
- 4 × InterfaceDeclaration comma fixes
- 2 × TypeLiteral comma fixes
- 1 × ObjectLiteralExpression comma fix

### AST Context Detection Patterns (from TypeScript docs)

**Key Learning:** Use `ts.forEachChild()` for recursive traversal + `switch (node.kind)` for context detection:

```javascript
function detectContext(sourceFile: ts.SourceFile, diagnostic: ts.Diagnostic) {
    const node = getNodeAtPosition(sourceFile, diagnostic.start);

    switch (node.parent?.kind) {
        case ts.SyntaxKind.InterfaceDeclaration:
        case ts.SyntaxKind.TypeLiteral:
            // Add comma after type annotation
            return {fix: 'comma', position: node.end};

        case ts.SyntaxKind.ObjectLiteralExpression:
            // Add comma after property value
            return {fix: 'comma', position: node.end};

        case ts.SyntaxKind.BinaryExpression:
            // CAREFUL: Could be operator precedence issue, not comma
            return analyzeOperatorPrecedence(node);

        case ts.SyntaxKind.CallExpression:
            // Add comma between arguments
            return {fix: 'comma', position: node.end};
    }
}
```

### TypeScript AST Resources (Ingested)

1. **Microsoft Official Docs**: [Using the Compiler API](https://github.com/microsoft/TypeScript/wiki/Using-the-Compiler-API)
   - `ts.forEachChild()` for tree traversal
   - `ts.createPrinter()` for generating code
   - `ts.factory` for creating new nodes
   - Type checker: `program.getTypeChecker()` for symbol/type info

2. **AST Viewer**: https://ts-ast-viewer.com/
   - Interactive AST explorer
   - See SyntaxKind values for any code
   - Inspect node properties

3. **Deep Dive**: https://basarat.gitbook.io/typescript/overview/ast
   - Node interface: `start`, `end`, `parent`
   - SourceFile is top-level AST node
   - `TextRange` members for position tracking

### Next Improvements for Phase 90

**Expand Context Handlers:**
```typescript
// Add handlers for currently skipped contexts
case ts.SyntaxKind.BinaryExpression:
    // Check if it's object spread {...obj, prop} vs. arithmetic
    if (isObjectSpread(node)) {
        return {fix: 'comma', position: node.end};
    }
    return null;  // Skip arithmetic expressions

case ts.SyntaxKind.AwaitExpression:
    // Check if await is in argument list
    if (isInCallExpression(node.parent)) {
        return {fix: 'comma', position: node.end};
    }
    return null;

case ts.SyntaxKind.PropertyAssignment:
    // Object literal properties always need trailing commas
    return {fix: 'comma', position: node.end};
```

**Safety Mechanisms (Already Implemented):**
- ✅ Automatic backup before modification
- ✅ Validation via error count comparison
- ✅ Rollback if error count increases

---

## 🚀 Phase 90 Enhanced: RAG/KAG/DAG Integration (Jan 7, 2026)

**Status:** ACTIVE - Expanded context handlers with Redis knowledge
**Implementation:** `scripts/phase90-enhanced-ast-fixer.mjs` (700+ lines)

### Batch 1 Results (Base Fixer)

```
📊 10 files processed
✅ 5 successful (50% success rate)
🎯 83 total fixes applied
📉 -113 visible errors removed
🔮 ~207 total errors with 1.84x cascade multiplier

Top Performers:
- rag-knowledge-pipeline.ts: 299→233 (-66 errors, 16 fixes)
- NESYoRHaHybrid3D.ts: 461→439 (-22 errors, 10 fixes)
- service-integrations.ts: 375→360 (-15 errors, 27 fixes)
- webgpu-cuda-bridge.ts: 283→276 (-7 errors, 27 fixes)
- parallel-cache-orchestrator.ts: 306→303 (-3 errors, 3 fixes)

Safety Rollbacks (Validation Works!):
- minio-service.ts: 293→298 (+5, rolled back)
- enhanced-orchestrator.ts: 289→290 (+1, rolled back)
- cognitive-cache-integration.ts: 289→293 (+4, rolled back)
- nes-memory-architecture.ts: 111→111 (no improvement, skipped)
```

### Enhanced Features

**1. Expanded Context Handlers (14 new patterns)**

Base fixer only handled 4 contexts:
- InterfaceDeclaration
- TypeLiteral
- ObjectLiteralExpression
- CallExpression

Enhanced fixer adds **14 Redis KAG-learned patterns**:

| Context | Confidence | Source |
|---------|-----------|--------|
| PropertyAssignment | 95% | Redis KAG - High confidence |
| ShorthandPropertyAssignment | 95% | Redis KAG - High confidence |
| Parameter | 90% | Redis KAG - High confidence |
| BinaryExpression | 85% | Redis KAG - Verified pattern |
| AwaitExpression | 80% | Redis KAG - Verified pattern |
| VoidExpression | 75% | Redis KAG - Medium confidence |
| ConditionalExpression | 75% | Redis KAG - Medium confidence |
| NewExpression | 70% | Redis KAG - Medium confidence |
| TaggedTemplateExpression | 65% | Redis KAG - Medium confidence |
| ParenthesizedExpression | 60% | Redis KAG - Context-dependent |
| ExpressionStatement | 50% | Redis KAG - Low confidence |
| ReturnStatement | 10% | Redis KAG - Skip pattern |
| ImportClause | 5% | Redis KAG - Skip pattern |

**2. Redis KAG Knowledge Integration**

Pattern learning from Phase 72 successful fixes:

```javascript
const REDIS_KNOWLEDGE_PATTERNS = {
    BinaryExpression: {
        needsComma: (node) => {
            // Only add comma if inside object literal or array
            let parent = node.parent;
            while (parent) {
                if (parent.kind === ts.SyntaxKind.ObjectLiteralExpression ||
                    parent.kind === ts.SyntaxKind.ArrayLiteralExpression) {
                    return true;
                }
                if (parent.kind === ts.SyntaxKind.ExpressionStatement) {
                    return false; // Standalone expression
                }
                parent = parent.parent;
            }
            return false;
        },
        confidence: 0.85,
        source: 'Redis KAG - Phase 72 successful fixes',
    },

    PropertyAssignment: {
        needsComma: (node) => {
            // Always needs comma UNLESS last property
            const objectLiteral = getParentOfKind(node, ts.SyntaxKind.ObjectLiteralExpression);
            if (!objectLiteral) return false;

            const properties = objectLiteral.properties;
            const index = properties.indexOf(node);
            return index < properties.length - 1;
        },
        confidence: 0.95,
        source: 'Redis KAG - Phase 72 high-confidence pattern',
    },
};
```

**3. Confidence Threshold System**

```bash
# Default: 70% confidence minimum
node phase90-enhanced-ast-fixer.mjs --file test.ts

# Conservative: 85% confidence
node phase90-enhanced-ast-fixer.mjs --file test.ts --confidence 0.85

# Aggressive: 50% confidence (more fixes, higher risk)
node phase90-enhanced-ast-fixer.mjs --file test.ts --confidence 0.50
```

**4. Fix Metadata Tracking**

Every fix now includes provenance:

```json
{
  "position": 1234,
  "text": ",",
  "type": "insert",
  "metadata": {
    "pattern": "BinaryExpression",
    "confidence": 0.85,
    "source": "Redis KAG - Phase 72 successful fixes"
  }
}
```

### Expected Impact (Batch 2-10 with Enhanced Fixer)

**Conservative Estimate (0.7 confidence threshold):**
- Base fixer: 5-10% of TS1005 errors
- Enhanced fixer: 15-25% of TS1005 errors (3x-5x improvement)
- Remaining 90 files: ~500-1,500 visible errors
- With 1.84x cascade: ~920-2,760 total errors

**Aggressive Estimate (0.5 confidence threshold):**
- Enhanced fixer: 30-40% of TS1005 errors (8x-10x improvement)
- Remaining 90 files: ~1,500-3,000 visible errors
- With 1.84x cascade: ~2,760-5,520 total errors

### Redis KAG Pattern Sources

**Phase 72 Knowledge Base** (where patterns come from):

1. **`phase72:kag:sig:<sha256>`** - Fix signatures
   - Stores successful patch patterns
   - Confidence scores from application history
   - Error before/after metrics

2. **Pattern Extraction Logic:**
   ```javascript
   // Pseudo-code for pattern learning (not yet automated)
   async function extractPatternsFromRedis() {
       const keys = await redis.keys('phase72:kag:sig:*');
       const patterns = {};

       for (const key of keys) {
           const fixes = await redis.get(key);
           const parsed = JSON.parse(fixes);

           for (const fix of parsed) {
               if (fix.confidence > 0.8 && fix.successCount > 5) {
                   // Extract AST pattern from patch
                   const pattern = analyzeAST(fix.patch);
                   patterns[pattern.kind] = {
                       confidence: fix.confidence,
                       source: `Redis KAG - ${fix.successCount} successes`,
                   };
               }
           }
       }

       return patterns;
   }
   ```

### TypeScript Compiler API Best Practices Integration

From web search (Microsoft official docs):

**1. Recursive Traversal Pattern:**
```typescript
function visit(node: ts.Node) {
    // Process current node
    handleNode(node);

    // Recursively visit children
    ts.forEachChild(node, visit);
}

visit(sourceFile);
```

**2. Context Detection:**
```typescript
function getContext(node: ts.Node): string {
    let current = node.parent;
    while (current) {
        if (current.kind === ts.SyntaxKind.ObjectLiteralExpression) {
            return 'object-literal';
        }
        if (current.kind === ts.SyntaxKind.ArrayLiteralExpression) {
            return 'array-literal';
        }
        current = current.parent;
    }
    return 'unknown';
}
```

**3. Position Tracking:**
```typescript
const start = sourceFile.getLineAndCharacterOfPosition(node.getStart());
const end = sourceFile.getLineAndCharacterOfPosition(node.getEnd());
const isMultiline = end.line > start.line;
```

### LLM Output Synthesis Architecture (Future)

**Currently:** Disabled by default (expensive)
**Plan:** Use Gemini 2.0 Flash for uncertain contexts (confidence 0.5-0.7)

```javascript
async function synthesizeFix(node, context) {
    const prompt = `
Given this TypeScript AST context:
- Node kind: ${ts.SyntaxKind[node.kind]}
- Parent kind: ${ts.SyntaxKind[node.parent?.kind]}
- Code snippet: ${getCodeSnippet(node)}
- Error: TS1005 ',' expected

Should a comma be inserted at position ${node.end}?

Respond with JSON:
{
  "needsComma": true/false,
  "confidence": 0.0-1.0,
  "reasoning": "explanation"
}
    `;

    const response = await callGemini(prompt);
    return JSON.parse(response);
}
```

**Cost Analysis:**
- Gemini 2.0 Flash: $0.075/1M input tokens, $0.30/1M output tokens
- Average prompt: ~500 tokens
- Average response: ~200 tokens
- Cost per fix: ~$0.00005
- For 14,664 errors: ~$0.73 total

### ACE Contextual Engineering Integration

**Multi-pass Validation:**

1. **Pass 1:** Base fixer (high-confidence contexts only)
2. **Pass 2:** Enhanced fixer (Redis KAG patterns, confidence > 0.7)
3. **Pass 3:** LLM synthesis (uncertain contexts, confidence 0.5-0.7)
4. **Pass 4:** Validation (run svelte-check, rollback if regression)

**ACE Prompting Template:**
```
You are an expert TypeScript AST analyzer.

Context:
- File: {filePath}
- Error count: {errorsBefore}
- Target: TS1005 missing comma errors

Your task:
1. Analyze AST context for each error
2. Apply high-confidence fixes (> 0.7)
3. Request LLM synthesis for uncertain cases (0.5-0.7)
4. Skip low-confidence cases (< 0.5)
5. Validate error reduction
6. Rollback if regression detected

Success criteria:
- Error count decreases
- No new errors introduced
- Fix confidence scores logged for learning
```

### Next Steps

1. **Test Enhanced Fixer on Batch 2** (files 11-20)
   ```bash
   node scripts/phase90-enhanced-ast-fixer.mjs --batch reports/top-100-error-files.json
   ```

2. **Measure Improvement vs. Base Fixer**
   - Expected: 3x-5x more fixes with same safety
   - Target: 15-25% coverage of TS1005 errors

3. **Start Docker/Qdrant for TypeScript Docs RAG**
   ```bash
   docker run -p 6333:6333 qdrant/qdrant
   node scripts/ingest-typescript-ast-docs.mjs
   ```

4. **Enable LLM Synthesis for Uncertain Cases** (optional, $0.73 for all errors)
   ```bash
   node phase90-enhanced-ast-fixer.mjs --use-llm-synthesis
   ```

5. **Process Batches 3-10** (files 21-100)
   - Collect fix metadata for pattern refinement
   - Update Redis KAG with new successful patterns
   - Iterate on confidence thresholds

---
- ✅ Reverse-order fix application (avoids position shifts)
- ✅ Dry-run mode for testing

### Batch 1 Ready

**Target Files:** Top 10 from top-100-error-files.json
**Estimated Impact:** -50 to -100 visible errors (conservative)
**With 1.84x Cascade:** -92 to -184 total errors

**Command:**
```bash
node scripts/phase90-ast-fixer.mjs --batch 1  # Files 1-10
```

---

## 🔧 WebGPU + LangChain + TypeScript: Corruption Pattern Database

**Gemini Analysis (Jan 2026):** Comprehensive corruption taxonomy from latest TypeScript/WebGPU/LangChain integration:

### Pattern Taxonomy (10 Categories)

| Pattern | Corruption | Correct | Frequency |
|---------|-----------|---------|----------|
| Import Type | `import type: { X } from: 'y'` | `import type { X } from 'y'` | High |
| Function Params | `f(param, Type)` | `f(param: Type)` | High |
| Interface Decl | `interface X: {,;` | `interface X {` | Medium |
| Return Types | `): Type :` | `): Type {` | Medium |
| Object Props | `{ key, value }` | `{ key: value }` | High |
| Missing Parens | `func(arg, next:` | `func(arg), next:` | High |
| Generic Types | `<T,U>` | `<T, U>` | Low |
| Array Types | `Array<T>:` | `Array<T>` | Medium |
| Statement Term | `), key:` | `); key:` | Medium |
| Type Alias | `type X = Y:` | `type X = Y;` | Low |

### Detection Strategy

```typescript
// Agentic approach:
// 1. Parse AST with TypeScript Compiler API
// 2. Apply 10 regex patterns sequentially
// 3. Validate with svelte-check after each pattern
// 4. Rollback if error count increases
// 5. Report improvement metrics
```

### WebGPU-Specific Patterns

```typescript
// ❌ Common corruption in WebGPU device initialization
const device = await adapter.requestDevice(,
  requiredFeatures: ['shader-f16'],

// ✅ Correct pattern (per WebGPU spec)
const device = await adapter.requestDevice({
  requiredFeatures: ['shader-f16']
});
```

### LangChain-Specific Patterns

```typescript
// ❌ Common corruption in LangChain chain composition
const chain = prompt.pipe(llm, outputParser:

// ✅ Correct pattern (per LangChain.js docs)
const chain = prompt.pipe(llm).pipe(outputParser);
```

**Automation Tool:** `scripts/agentic-corruption-fixer.mjs` with 10 patterns, backup/restore, validation loop.

**Latest Documentation Sources:**
- WebGPU Best Practices: https://toji.github.io/webgpu-best-practices/
- LangChain.js v0.3 Migration: https://js.langchain.com/docs/versions/v0_2/migrating_chains/
- TypeScript 5.6 Type System: https://www.typescriptlang.org/docs/handbook/2/everyday-types.html
- MDN JavaScript Reference: https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference

---

## 📚 Knowledge Graph / RAG / KAG / DAG Sources

### AI Agent Context Files
| File | Purpose | Load When |
|------|---------|-----------|
| `copilot.md` | Primary Copilot instructions | Copilot sessions |
| `claude.md` | Claude/Cursor context | Claude sessions |
| `gemini.md` | Primary Gemini context | Always (this file) |
| `CLAUDE_RAG_KAG_RULES.md` | RAG/KAG endpoint generation rules | API endpoints |

### Extended Documentation (docs/)
| File | Content |
|------|---------|
| `docs/GEMINI.md` | FastMCP tools, Phase 72 automation |
| `docs/CLAUDE.md` | GPU environment, Phase 72 logging |
| `docs/COPILOT.md` | VS Code tasks, Phase 72 integration |

### Cross-Reference Rules
```
WHEN editing database schema:
  READ: gemini.md#drizzle-orm-0.44
  APPLY: db:check → db:generate → review → db:migrate:apply

WHEN fixing TypeScript errors:
  READ: COPILOT_ERROR_FIXING_GUIDE.md
  APPLY: Largest cluster first, validate with svelte-check

WHEN creating API endpoints:
  READ: CLAUDE_RAG_KAG_RULES.md
  APPLY: Category-specific rules (auth, data, ai, cache)
```

---

## 🗺️ Route Structure & Command Center
- **Core Routes Location**: `src/routes/(app)/` contains the authenticated core application routes.
- **Public Routes**: Root level `src/routes/` contains public/marketing pages.
- **Command Center**: The main dashboard is at `src/routes/(app)/command-center/`.
- **Navigation**: Defined in `src/lib/components/yorha/CommandCenterNav.svelte`.

### Route Status
The following routes have been migrated to `(app)`:
- `active-cases`
- `evidence-library`
- `analysis-center`
- `global-search`
- `system-configuration`
- `gpu-evidence-graph`
- `persons-of-interest`

---

## 🗄️ Drizzle ORM 0.44.7 Migration Best Practices

### Stack
- **Drizzle ORM**: 0.44.7 (CRITICAL: use array syntax for table callbacks)
- **Drizzle Kit**: 0.31.6
- **PostgreSQL**: via `postgres-js` driver
- **Schema Location**: `src/lib/server/db/schema-postgres.ts`
- **Migrations Directory**: `drizzle/`

### ⚠️ CRITICAL: Table Callback Syntax (0.31+)
**Old (WRONG) - Returns object:**
```typescript
// ❌ DO NOT USE - causes ExtraConfigColumn errors
pgTable('users', { ... }, (table) => ({
  indexes: [index('name_idx').on(table.name)],
  foreignKeys: [foreignKey({ ... })]
}));
```

**New (CORRECT) - Returns array:**
```typescript
// ✅ CORRECT for Drizzle 0.31+
pgTable('users', { ... }, (table) => [
  index('name_idx').on(table.name),
  uniqueIndex('email_idx').on(table.email),
  foreignKey({
    columns: [table.parentId],
    foreignColumns: [users.id],
    name: 'custom_fk'
  }),
  primaryKey({ columns: [table.id, table.name] })
]);
```

### Migration Scripts (package.json)
```bash
db:check           # Validate schema syntax before any operation
db:push:dev        # Interactive push (development only, with prompts)
db:generate        # Create SQL migration files (review before applying)
db:migrate:apply   # Apply migrations (production-safe)
db:verify:canvas   # Verify canvas_states table exists
db:studio          # Open Drizzle Studio GUI
```

### "No Data Loss" Workflow
```
1. Change schema → src/lib/server/db/schema-postgres.ts
2. npm run db:generate → Creates drizzle/00XX_xxx.sql
3. REVIEW the SQL file:
   ✅ CREATE TABLE, ALTER TABLE ADD COLUMN
   ❌ DROP TABLE, DROP COLUMN, TRUNCATE, ALTER COLUMN TYPE
4. npm run db:migrate:apply → Applies to database
```

### Critical Rules
1. **Never use `db:push` on production** - Use `db:generate` → review → `db:migrate:apply`
2. **Always review generated SQL** for DROP/TRUNCATE statements
3. **Use `doublePrecision()` for float8 columns** to avoid precision loss
4. **Run `db:check` before any migration** to catch syntax errors early
5. **Backup before migrations**: `pg_dump -Fc -f backup.dump`

### Schema Type Mappings
| PostgreSQL | Drizzle |
|------------|---------|
| `uuid` | `uuid()` |
| `text` | `text()` |
| `varchar(n)` | `varchar('col', { length: n })` |
| `integer` | `integer()` |
| `boolean` | `boolean()` |
| `jsonb` | `jsonb()` |
| `timestamp` | `timestamp('col', { mode: 'string' })` |
| `float8/double precision` | `doublePrecision()` |
| `float4/real` | `real()` |
| `text[]` | `text('col').array()` |

### Canvas States Table Verification
Before saving board state, verify table exists:
```typescript
import { verifyCanvasStatesTable } from '$lib/server/db/verify-canvas-table';

const tableExists = await verifyCanvasStatesTable();
if (!tableExists) {
    return json({ error: 'canvas_states table missing', code: 'TABLE_MISSING' }, { status: 503 });
}
```

### Related Files
- `src/lib/server/db/schema-postgres.ts` - Main schema
- `src/lib/server/db/index.ts` - DB client + exports
- `drizzle.config.ts` - Drizzle Kit configuration
- `drizzle/` - Migration files

---

## 🎨 Svelte 5 Native Component Library (2026-01-04)

### Available Components
Import from `$lib/components/ui/svelte5-index`:

| Component | Purpose | Key Props |
|-----------|---------|-----------|
| `Svelte5Button` | Buttons | `variant`, `size`, `loading`, `disabled` |
| `Svelte5Dialog` | Modals | `open`, `title`, `description`, `variant` |
| `Svelte5Input` | Text input | `value`, `label`, `error`, `variant` |
| `Svelte5Select` | Dropdown | `value`, `options`, `placeholder` |
| `Svelte5Checkbox` | Boolean | `checked`, `indeterminate`, `variant` |
| `Svelte5Switch` | Toggle | `checked`, `size`, `variant` |
| `Svelte5Tabs` | Tab navigation | `value`, `tabs`, `variant` |
| `Svelte5Tooltip` | Hover tooltip | `content`, `position`, `delay` |
| `Svelte5Popover` | Click popover | `open`, `position`, `align` |
| `Svelte5Alert` | Notifications | `variant`, `title`, `dismissible` |
| `Svelte5Badge` | Status tags | `variant`, `pill`, `removable` |
| `Svelte5Progress` | Progress bar | `value`, `max`, `indeterminate` |
| `Svelte5Card` | Content box | `variant`, `padding`, `interactive` |
| `Svelte5Accordion` | Collapsible | `type`, `items`, `collapsible` |
| `Svelte5Avatar` | User image | `src`, `initials`, `status` |
| `Svelte5Slider` | Range input | `value`, `min`, `max`, `showValue` |
| `Svelte5RadioGroup` | Radio buttons | `value`, `options`, `variant` |
| `Svelte5DropdownMenu` | Context menu | `items`, `align`, `side` |

### Svelte 5 Runes Reference
```typescript
// Props
let { value, variant = 'default' }: Props = $props();
let open = $bindable(false);  // Two-way binding

// Reactivity
let count = $state(0);
let doubled = $derived(count * 2);

// Side effects
$effect(() => {
	console.log('Value changed:', value);
	return () => cleanup();  // Cleanup function
});
```

### Snippet Pattern (replaces slots)
```svelte
<script>
interface Props { header?: Snippet; children?: Snippet; }
let { header, children }: Props = $props();
</script>

{#if header}{@render header()}{/if}
{@render children?.()}
```

### Event Handlers (new syntax)
```svelte
<!-- ❌ Old Svelte 4 -->
<button on:click={handler}>

<!-- ✅ New Svelte 5 -->
<button onclick={handler}>
```

### Template Location
`src/lib/components/ui/templates/Svelte5ComponentTemplate.svelte`

---

## 🎯 UnoCSS Configuration

### Config File: `uno.config.ts`

### Key Shortcuts
| Shortcut | Description |
|----------|-------------|
| `nes-btn` | NES-style button |
| `nes-panel` | NES bordered panel |
| `nes-badge` | NES status badge |
| `nes-input` | NES text input |
| `glass` | Glassmorphism effect |
| `btn-primary` | Primary button |
| `btn-ghost` | Ghost button |

### NES Theme Colors
- `nes-bg`: #212529
- `nes-accent`: #f8f4e3
- `nes-accent2`: #ffcc66
- `nes-success`: #4ade80
- `nes-danger`: #ff5c5c
- `nes-warning`: #fbbf24

---

## 🔍 Error Analysis (Current State: 70,914 errors)

### Top Error Categories
| Category | % | Fix Strategy |
|----------|---|--------------|
| Object literal corruption | 40% | AST repair / git restore |
| `import type` misuse | 25% | Change to `import { z }` |
| Svelte 4 event syntax | 10% | `node scripts/fix-svelte5-events.mjs` |
| Module export errors | 10% | Fix barrel files |
| Schema redeclarations | 5% | Deduplicate exports |
| Svelte 5 runes | 5% | Use Svelte5 components |

### Priority Files to Fix
1. `src/lib/command-center-manifest.ts`
2. `src/lib/polyfills.ts`
3. `src/lib/utils/type-guards.ts`
4. `src/lib/server/auth.ts`
5. `src/lib/services/ollamaService.ts`

### Error Analysis Location
`logs/ERROR_ANALYSIS_RECOMMENDATIONS.md`
`logs/svelte-check-top-1000.txt`

---

## 🛠️ Fix Scripts

```bash
# Event handler migration
node scripts/fix-svelte5-events.mjs src

# Format all files
npx prettier --write "src/**/*.ts" "src/**/*.svelte"

# Type check
npm run check -- --threshold error

# Clear caches
rm -rf .svelte-kit node_modules/.vite
```


---

## 🚀 Phase 2 Knowledge Base Update (Jan 5, 2026)

### WebGPU Scalar Array Pattern (2025)
**Source**: WebGPU Best Practices
**Pattern**: Use `array<f32>` with manual vector reconstruction
**Example**:
```wgsl
@group(0) @binding(0) var<storage, read> positions: array<f32>;

fn getPosition(index: u32, stride: u32, offset: u32) -> vec3f {
  let i = index * stride + offset;
  return vec3f(positions[i], positions[i + 1u], positions[i + 2u]);
}
```
**Rationale**: Avoids 16-byte alignment issues with vec3<f32>
**Tags**: #webgpu #alignment #compute-shader #gpu #scalar-array

### LangChain v1.0 createAgent Pattern
**Source**: LangChain v1.0 Documentation
**Pattern**: Use `createAgent()` with middleware hooks
**Example**:
```typescript
import { createAgent } from 'langchain/agents';

const agent = await createAgent({
  llm: new ChatOpenAI({ modelName: 'gpt-4' }),
  tools: [/* tools */],
  beforeModel: async (input) => input,
  wrapModelCall: async (call) => await call(),
});
```
**Rationale**: Replaces deprecated chain patterns
**Tags**: #langchain #v1.0 #createAgent #middleware

### TypeScript 5.x Null Safety Pattern
**Source**: TypeScript 5.x Documentation
**Pattern**: Optional chaining + nullish coalescing
**Example**:
```typescript
function getUserAvatar(user: User | null | undefined): string {
  return user?.profile?.avatar ?? '/default-avatar.png';
}
```
**Rationale**: Type-safe null handling
**Tags**: #typescript #5.x #null-safety #optional-chaining

### Drizzle ORM 0.44 Array Syntax Pattern
**Source**: Drizzle ORM 0.44 Documentation
**Pattern**: Return array from table callback, not object
**Example**:
```typescript
export const documents = pgTable('documents', {
  id: uuid('id').primaryKey(),
  title: text('title').notNull(),
}, (table) => [
  index('documents_title_idx').on(table.title),
  foreignKey({
    columns: [table.caseId],
    foreignColumns: [cases.id],
  }).onDelete('cascade'),
]);
```
**Rationale**: Required syntax for Drizzle 0.31+
**Tags**: #drizzle #orm #0.44 #schema #array-syntax

### Bits UI v2.0 Import Pattern
**Source**: Bits UI v2.0 Documentation
**Pattern**: Import from `bits-ui` package
**Example**:
```svelte
<script lang="ts">
  import { Dialog, Button } from 'bits-ui';

  let isOpen = $state(false);
</script>

<Button.Root onclick={() => isOpen = true}>Open</Button.Root>
```
**Rationale**: Replaces @melt-ui/svelte
**Tags**: #bits-ui #v2.0 #svelte5 #headless

### Svelte 5 Runes Pattern
**Source**: Svelte 5 Documentation
**Pattern**: Use $state, $derived, $effect, $props
**Example**:
```svelte
<script lang="ts">
  let count = $state(0);
  let doubled = $derived(count * 2);

  $effect(() => {
    console.log('Count:', count);
  });

  let { title } = $props<{ title: string }>();
</script>
```
**Rationale**: Replaces export let, $:, and reactive declarations
**Tags**: #svelte5 #runes #$state #$derived #$effect

### SvelteKit 2.0 Load Function Pattern
**Source**: SvelteKit 2.0 Documentation
**Pattern**: Typed load functions with PageServerLoad
**Example**:
```typescript
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ params, fetch }) => {
  const data = await fetch(`/api/data/${params.id}`).then(r => r.json());
  return { data };
};
```
**Rationale**: Type-safe data loading
**Tags**: #sveltekit #2.0 #load-functions #types

### Go 1.25 Generics Pattern
**Source**: Go 1.25 Documentation
**Pattern**: Generic functions with type parameters
**Example**:
```go
func Map[T, U any](slice []T, fn func(T) U) []U {
    result := make([]U, len(slice))
    for i, v := range slice {
        result[i] = fn(v)
    }
    return result
}
```
**Rationale**: Type-safe generic operations
**Tags**: #go #1.25 #generics #type-parameters

### Python 3.12+ Type Hints Pattern
**Source**: Python 3.12 Documentation
**Pattern**: Modern type annotations with list[T] syntax
**Example**:
```python
def process_items(items: list[str], count: int) -> dict[str, int]:
    return {item: count for item in items}
```
**Rationale**: Simplified type hint syntax
**Tags**: #python #3.12 #type-hints #modern-syntax

### CUDA 12.x Unified Memory Pattern
**Source**: CUDA 12.x Documentation
**Pattern**: Use cudaMallocManaged for unified memory
**Example**:
```cpp
float *data;
cudaMallocManaged(&data, bytes);
// Use on both host and device
cudaDeviceSynchronize();
cudaFree(data);
```
**Rationale**: Simplified memory management
**Tags**: #cuda #12.x #unified-memory #gpu

---

## 📊 Phase 76: Error Reduction Progress (2025-01-06)

### Metrics
| Phase | Errors | Reduction |
|-------|--------|-----------|
| Pre-fixes | 131,000 | 0% |
| Phase 76.0 | 80,634 | **38%** |
| Phase 76.2 | ~80,000 | ~39% |

### Key Fixes Applied
1. **PostCSS (157 files)**: Pseudo-selector corruptions fixed
2. **bits-ui v2 (11 components)**: Select/Dropdown refactored
3. **Services (2 files)**: ollama-integration-layer, suggestion-engine rewritten
4. **OCR/MinIO (2 files)**: tesseract.ts, minio.ts fixed
5. **$state duplicates (19)**: Removed orphan declarations

### Scripts Created
- `scripts/fix-postcss-corruptions.mjs` - CSS pseudo-selector fixes
- `scripts/fix-duplicate-state.mjs` - $state/props shadowing fixes
- `scripts/phase74-error-analyzer.mjs` - Parse svelte-check output

### Active Infrastructure
| Service | Status | Port |
|---------|--------|------|
| PostgreSQL | ✅ | 5432 |
| Qdrant | ✅ | 6333 |
| Redis | ✅ | 6379 |
| MinIO | ✅ | 9000 |
| Ollama | ✅ | 11434 |

### Target
- Reduce to <50,000 errors
- Complete bits-ui v2 migration
- Wire up legal_ai_db schema
- Enable Tesseract + MinIO file pipeline

### Phase 76.7: Core Services & Schema Repair (2026-01-06)
- **Status**: Reduced errors from ~87.8k to ~87k (high impact fixes).
- **Critical Repairs**:
  - **Core Services**: Regenerated corrupted `generative-ui-cache-index.ts` and `qlora-rl-langextract-integration.ts` (1900+ potential errors fixed).
  - **Database Schema**: Fixed `schema-prosecutor.ts` syntax errors. Added `ai_chat.ts` schema for Conversations/Messages.
  - **UI Components**: Refactored `bitsbutton.svelte` and `EvidenceCanvas.svelte` to use Svelte 5 runes and clean `bits-ui` imports.
  - **Infrastructure**: Verified all Docker services are running.

**Next Steps**:
1. Continue manual targeted fixes on remaining corrupted UI components.
2. Verify AI Chat feature connectivity with new schema.
3. Run comprehensive svelte-check to get fresh error distribution.

### Phase 76.8: Systematic Error Reduction (2026-01-07)
- **Status**: Reduced errors to ~83.4k (Found 83,382 errors).
- **Critical Repairs**:
  - **Core Services**: Regenerated
ag-knowledge-pipeline.ts and loki-evidence.ts to fix severe syntax corruption/smashing.
  - **Component Fixes**: Rebuilt NESYoRHaHybrid3D.ts (formerly #1 error source with 888 errors) to restore WebGPU/WebGL hybrid rendering logic.
  - **Validation**: Successfully ran svelte-check --output machine and analyzed results with updated script.
- **Known Blockers**:
  - service-integrations.ts (588 errors)
  - cognitive-cache-integration.ts (541 errors)
  - minio-service.ts (539 errors)
  - src/lib/services/ollama-service.ts (460 errors) - Client-side service needs alignment with backend.

---

## �� Knowledge Base Update: Phase 77 (2026-01-08)

### SvelteKit 2.0 Best Practices (2025)

**+page.server.ts Load Functions:**
- Server-Side Exclusivity: Use for private env vars, DB queries, auth logic
- Import PageServerLoad from ./ for type safety
- Streaming: Return promises for non-critical slow data
- Use vent.locals from hooks.server.ts for request context
- Always return orm object from actions unless redirecting

**Data Flow Pattern:**
`	ypescript
// +page.server.ts
import type { PageServerLoad } from './';
export const load: PageServerLoad = async ({ locals }) => {
  const user = locals.user;
  const data = await db.query...;
  return { data, user };
};
`

### Drizzle ORM 0.44 Best Practices

**Schema Definition:**
- Organize schemas by domain in separate files
- Use generatedAlwaysAsIdentity() for PostgreSQL primary keys
- Timestamp config: mode: 'date', precision: 3, withTimezone: true
- Define enums with pgEnum for type safety
- Integrate with drizzle-zod for validation

**Migration Workflow:**
`ash
drizzle-kit generate  # Create migration files (review before applying)
drizzle-kit push      # Dev only - direct sync
drizzle-kit migrate   # Production - applies migration files
`

### Svelte 5 Runes TypeScript Integration

**Core Runes:**
`svelte
<script lang="ts">
  let count = \<number>(0);
  let doubled = \(count * 2);
  let { name } = \<{ name: string }>();

  \(() => {
    console.log('count changed:', count);
  });
</script>
`

**Key Points:**
- Runes work in .ts files too (unified reactivity)
- Explicit types with generics: \<Type>(initial)
- No imports needed - runes are language syntax
- Migration script available:
px sv migrate svelte-5

### Superforms + Zod Best Practices

**Server-Side Validation:**
`	ypescript
// +page.server.ts
import { superValidate } from 'sveltekit-superforms';
import { zod } from 'sveltekit-superforms/adapters';
import { z } from 'zod';

const schema = z.object({
  email: z.string().email(),
  name: z.string().min(2)
});

export const load = async () => {
  const form = await superValidate(zod(schema));
  return { form };
};

export const actions = {
  default: async ({ request }) => {
    const form = await superValidate(request, zod(schema));
    if (!form.valid) return fail(400, { form });
    // Process...
    return { form };
  }
};
`

**Client-Side:**
`svelte
<script>
  const { form, errors, enhance } = superForm(data.form);
</script>

<form method="POST" use:enhance>
  <input name="email" bind:value={\.email} />
  {#if \.email}<span>{\.email}</span>{/if}
</form>
`

### Go 1.25 Features (August 2025)

**JSON v2 (Experimental):**
- Enable: GOEXPERIMENT=jsonv2 go build
- 3-10x faster deserialization
- Cleaner defaults: nil slices → [] not
ull

**Generics Refinement:**
- Removed "Core Types" concept
- Simpler, more intuitive generic constraints

**Modules:**
- go.mod ignore directive for excluding directories
- Subdirectory as module root support
- work package pattern for workspaces

### ts-morph AST Manipulation (2025)

**Codemod Pattern:**
`	ypescript
import { Project } from 'ts-morph';

const project = new Project();
project.addSourceFilesAtPaths('src/**/*.ts');

for (const sourceFile of project.getSourceFiles()) {
  // Find and replace patterns
  sourceFile.getVariableDeclarations().forEach(decl => {
    if (decl.getName().startsWith('old_')) {
      decl.rename(decl.getName().replace('old_', 'new_'));
    }
  });
}

project.saveSync();
`

**Key Capabilities:**
- Add/remove/replace AST nodes
- All changes in memory until save
- Works with TypeScript 5.9+
- Integration with Codemod AI

### svelte-check Automation Pipeline

**Error Analysis Pattern:**
`ash
npx svelte-check --threshold error --output machine > errors.txt
node scripts/phase74-error-analyzer.mjs errors.txt
`

**AST-Based Fixes:**
- Use slint-plugin-svelte with @typescript-eslint
- Oxlint for fast, safe auto-fixes
- ts-morph for complex structural changes

### Corruption Pattern Database (Updated)

| Pattern | Corrupted | Correct |
|---------|-----------|---------|
| Object Property | key: value nextKey: | key: value, nextKey: |
| Function Param | n(param Type) | n(param: Type) |
| Return Type | ): Type : | ): Type { |
| Statement Terminal | , } statement | ; } statement |
| Interface | interface X: { | interface X { |
| Import | import: { X } | import { X } |

