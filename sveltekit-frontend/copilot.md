# YoRHa Legal AI - Copilot Context (Updated 2026-01-19)

## 🎯 Project Status Overview

### Error Reduction Progress (Phase 107)
- **Current Errors:** 51,397 (down from 51,680 on 2026-01-13)
- **Files with Errors:** 1,453
- **Total Reduction:** -283 errors (-0.55%)
- **Last Fix:** Phase 107.8 (10 files, -122 errors via ternary operator fixes)
- **Target:** <10,000 errors

### TypeScript & Svelte 5 Migration
- **Files:** 17,940 source files (3,078 TS, 1,476 Svelte)
- **Svelte 5 Migration:** 99.9% complete (1,174/1,176 files)
- **Remaining:** EvidenceCanvas.svelte (corrupted, needs rebuild)
- **TypeScript Version:** 5.6+ (using TS 5.7 features)
- **Framework:** SvelteKit 2.49.2 + Svelte 5.46.0

### File Cleanup Potential
- **Total source files:** 17,940
- **Removable backups:** ~7,717 files (41.9%)
  - Orphaned: 6,996 (.bak, .mojibake-backup variants)
  - Archived: 541 (Svelte 4 migration artifacts)
  - Gaming/Demos: 163 (experimental features)
  - Safe to clean: YES (backup created)

### Core API Routes (105 Endpoints)
```typescript
// Main API Structure
/api/persons      - Person/entity management (GET, POST, PATCH, DELETE)
/api/cases        - Case management
/api/evidence     - Evidence handling
/api/chat         - AI chat integration
/api/health/*     - Service health checks (ollama, redis, ocr, search)
/api/phase89/*    - Code indexing & AI analysis (24 endpoints)
/api/tools/*      - Tool execution
/api/system/*     - System operations
/api/topology/*   - Code topology visualization
```

### AI/LLM Infrastructure (153 Files)
- **Qdrant Vector DB:** 38 integration files
- **Knowledge Base:** 16 service files
- **ACE Contextual:** 18 context management files
- **RAG Pipelines:** 81 retrieval-augmented generation files
- **Phase 89 Indexer:** ✅ READY (code-unit-indexer.mjs)

## Phase 98: Drizzle + Zod + Superforms (January 2026)

### drizzle-kit Best Practices
- **Development:** `drizzle-kit push` (quick iteration)
- **Production:** `drizzle-kit generate` → `drizzle-kit migrate` (versioned SQL)

### Schema Status
- 79 tables defined in `schema-postgres.ts`
- Key tables: `cases` (20 cols), `evidence` (14 cols), `users` (10 cols)

### 🚨 If migrations fail on existing types:
```bash
# Create tables directly
docker exec phase66-postgres psql -U legal_admin -d legal_ai_db -f /tmp/create-core-tables.sql
```

### drizzle-zod + Superforms Pattern
```typescript
// Generate Zod from Drizzle
import { createInsertSchema } from 'drizzle-zod';
import { zod } from 'sveltekit-superforms/adapters';

// +page.server.ts
const form = await superValidate(zod(insertCaseSchema));
```

### 🚫 Barrel Exports: NOT Recommended
- **Hurts tree-shaking** → larger bundles
- **Use direct imports instead:**
```typescript
// ✅ GOOD: Direct import
import { caseService } from '$lib/server/services/case-service';

// ❌ BAD: Barrel import
import { caseService } from '$lib/server/services';
```

### RAG (Retrieval-Augmented Generation) Implementation
**Architecture:** Combines LLM with vector search for contextually relevant responses
```typescript
// RAG Pipeline Components (81 files active)
1. Vector Embeddings
   - text-embedding-ada-002 (1,536 dimensions)
   - Semantic meaning captured in numerical form
   - Cosine similarity for relevance matching

2. Vector Database (Qdrant)
   - Collection: phase89_code_units
   - 4,030 indexed code units
   - KNN (k-nearest neighbors) search

3. Retrieval Process
   - User query → embedding
   - Vector search → find similar chunks
   - Top-k results + prompt → LLM
   - Grounded, accurate response

4. Benefits
   ✅ Contextually relevant answers
   ✅ Overcome token limits
   ✅ Reduce fine-tuning costs
   ✅ Real-time data integration
```

**RAG Workflow:**
```typescript
// src/lib/server/ai/rag-pipeline-enhanced.ts
async function ragQuery(query: string) {
  // 1. Chunk user query
  const queryEmbedding = await createEmbedding(query);

  // 2. Vector search in Qdrant
  const results = await qdrant.search({
    collection: 'phase89_code_units',
    vector: queryEmbedding,
    limit: 5,
    filter: { feature_tags: 'evidence' }
  });

  // 3. Assemble context + prompt
  const context = results.map(r => r.payload.signature_text).join('\n');
  const prompt = `Context:\n${context}\n\nQuestion: ${query}`;

  // 4. LLM generates grounded response
  return await llm.complete(prompt);
}
```

### Knowledge Graph & DAG (Directed Acyclic Graph)
```typescript
// ACE Contextual Engineering - 18 files
- ace-context-manager.ts     // Context retrieval
- ace-adapter.ts              // Tool integration
- knowledge-base.ts           // Graph storage
- error-pattern-rag.ts        // Pattern matching

// DAG for dependency tracking
Node → Edges → Relationships
 ├─ Components depend on utilities
 ├─ Routes depend on components
 └─ Services depend on schemas

// Query knowledge graph
await aceContext.query({
  nodeType: 'component',
  relationships: ['imports', 'depends_on'],
  depth: 3
});
```

---

## Phase 66 CSS Error Fixing - ACE Knowledge Base

## Context
Date: 2026-01-11
Baseline: 77,002 TypeScript/CSS errors, 232 warnings, 2,471 files
Goal: 40-45% error reduction through automated pattern fixing

## XState v5 Migration Patterns (2026-01-11)


### Pattern: fromPromise Inline Types
**Error Codes:** TS2345, TS2322, TS2554
**Frequency:** High (affects all fromPromise actors)

**Problem:**
XState v5 `fromPromise` no longer supports inline type annotations in the function signature. Types must be extracted to separate interfaces or provided as generics.

**Broken Syntax (XState v4 style):**
```typescript
// ❌ Inline types in fromPromise
const promiseLogic = fromPromise(async ({ input }: { input: { userId: string } }) => {
  const user = await getUser(input.userId);
  return user;
});
```

**Correct Syntax (XState v5):**
```typescript
// ✅ Method 1: Extract interface
interface PromiseInput {
  userId: string;
}

const promiseLogic = fromPromise(async ({ input }: { input: PromiseInput }) => {
  const user = await getUser(input.userId);
  return user;
});

// ✅ Method 2: Use generic parameters
const promiseLogic = fromPromise<User, { userId: string }>(
  async ({ input, self }) => {
    const user = await getUser(input.userId);
    return user;
  }
);
```

**Migration Steps:**
1. Extract all inline types from fromPromise function signatures
2. Move types to interfaces or type aliases
3. Apply types as generics: `fromPromise<TOutput, TInput>(...)`
4. Update all actor logic creators (fromCallback, fromObservable, etc.)

**Scan Results (2026-01-12):**
- **39 files** with fromPromise inline types (122 total occurrences)
- See detailed report: `reports/xstate-migration/latest.md`
- High-priority files:
  - `src/lib/stores/_archive/old-stores/enhanced-upload-machine.ts` (11 occurrences)
  - `src/lib/state/evidenceCustodyMachine.ts` (6 occurrences)
  - `src/lib/state/evidence-processing-machine.ts` (5 occurrences)

**Related Errors:**
- `Type '{ userId: string }' is not assignable to type 'never'`
- `Cannot use inline type annotations in fromPromise`
- `Property 'userId' does not exist on type 'unknown'`

## Identified CSS Corruption Patterns

### Pattern 1: Split Global Selectors
**Frequency:** Medium (estimated 500-1,000 occurrences)
**Error Message:** `[vite:css][postcss] Failed to parse selector : ": global(.nes-theme)`

**Broken Syntax:**
```css
/* ❌ Space between colon and global */
: global(.nes-theme)
.upload-button:hover:not(:disabled) {
  background: blue;
}
```

**Correct Syntax:**
```css
/* ✅ No space */
:global(.nes-theme) .upload-button:hover:not(:disabled) {
  background: blue;
}
```

**Fix Pattern:**
```javascript
content.replace(/:\s+global\(/g, ':global(')
```

---

## 🤖 Phase 96: XState v5 State Machine Architecture

### Discovery: TypeScript LSP Limitation with `setup()`
**Context:** XState v5.24.0 exports `setup()` but TypeScript can't resolve it due to declaration file indirection.

**ACE Recommendation:**
```typescript
// 🔴 Avoid (TypeScript LSP fails)
import { setup, fromPromise } from 'xstate';
const machine = setup({ actors: { /* ... */ } }).createMachine({ /* ... */ });

// 🟢 Prefer (guaranteed to work)
import { createMachine, fromPromise, assign } from 'xstate';
const machine = createMachine({
    types: {
        context: {} as AIAssistantContext,
        events: {} as AIAssistantEvent
    },
    states: {
        processing: {
            invoke: {
                // Inline actor logic
                src: fromPromise<string>(async ({ input, signal }: {
                    input: { prompt: string; model: string };
                    signal: AbortSignal;
                }) => {
                    const response = await fetch('/api/ai/chat', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify(input),
                        signal  // Connects to XState lifecycle for cancellation
                    });
                    if (!response.ok) throw new Error(`AI failed: ${response.statusText}`);
                    return (await response.json()).response;
                }),
                input: ({ context }) => ({
                    prompt: context.currentQuery,
                    model: context.model
                }),
                onDone: {
                    target: 'idle',
                    actions: assign({
                        response: ({ event }) => event.output,
                        conversationHistory: ({ context, event }) => [
                            ...context.conversationHistory,
                            { id: crypto.randomUUID(), type: 'assistant', content: event.output, timestamp: new Date() }
                        ]
                    })
                },
                onError: {
                    target: 'error',
                    actions: assign({ error: ({ event }) => (event.error as Error).message })
                }
            },
            on: {
                CANCEL: { target: 'idle', actions: assign({ error: 'Request cancelled' }) }
            }
        }
    }
});
```

### Type Signature (Critical)
```typescript
// ❌ XState v5 rejects multiple generics
fromPromise<TOutput, TInput>(async ({ input }) => { /* ... */ })

// ✅ Single generic + explicit parameter typing
fromPromise<TOutput>(async ({ input, signal }: { input: TInput; signal: AbortSignal }) => { /* ... */ })
```

### Phase 96 Deliverables
- ✅ `aiAssistantMachine.ts`: Error-free, cancellation-ready
- ✅ `AIAssistantMachineComponent.svelte`: Manual actor subscription (no `@xstate/svelte`)
- ✅ `DocumentUploadMachineIntegration.svelte`: File ingestion UI restored
- ✅ `/indexing` route: Integration demo grid with both components
- ✅ Knowledge doc: `docs/xstate-v5-patterns.md` (canonical reference)

### RAG/KAG Tags
`#xstate-v5` `#frompromise` `#typescript-lsp` `#state-machines` `#actor-cancellation` `#phase96-complete`

---

### Pattern 2: Malformed @keyframes with Slashes
**Frequency:** Low (estimated 50-200 occurrences)
**Error Message:** `[vite:css][postcss] Failed to parse selectors : "from" / "transform: scale(0.95), to"`

**Broken Syntax:**
```css
/* ❌ Quoted keywords with slashes */
@keyframes fadeIn {
  "from" / "transform: scale(0.95)", to {
    opacity: 1;
  }
}
```

**Correct Syntax:**
```css
/* ✅ Proper keyframe syntax */
@keyframes fadeIn {
  from {
    transform: scale(0.95);
  }
  to {
    opacity: 1;
    transform: scale(1);
  }
}
```

**Fix Pattern:**
```javascript
content.replace(/"(from|to)"\s*\/\s*"([^"]+)"\s*,?\s*(from|to)?/g,
  (match, kw1, props, kw2) => `${kw1} { ${props}; }${kw2 ? `\n  ${kw2}` : ''}`)
```

---

### Pattern 3: Quoted Percentages in Keyframes
**Frequency:** Low (estimated 100-300 occurrences)
**Error Message:** `[vite:css][postcss] Failed to parse selectors : "0%"`

**Broken Syntax:**
```css
/* ❌ Quoted percentages */
@keyframes spin {
  "0%" {
    transform: rotate(0deg);
  }
  "100%" {
    transform: rotate(360deg);
  }
}
```

**Correct Syntax:**
```css
/* ✅ Unquoted percentages */
@keyframes spin {
  0% {
    transform: rotate(0deg);
  }
  100% {
    transform: rotate(360deg);
  }
}
```

**Fix Pattern (in style blocks only):**
```javascript
styleContent.replace(/:\s*"(\d+%)\s*"/g, '$1 {')
```

---

## TypeScript Corruption Patterns (Previously Fixed)

### Pattern 4: Type Import Colon Corruption ✅ FIXED (346 files)
**Error:** `Cannot find name 'PageServerLoad'`

**Broken:**
```typescript
import type { Actions: PageServerLoad } from './$types';
```

**Fixed:**
```typescript
import type { Actions, PageServerLoad } from './$types';
```

---

### Pattern 5: FormData Argument Corruption ✅ FIXED (3 files)
**Error:** Property expected, got identifier

**Broken:**
```typescript
const data = {
  type: formData.get('type', title: formData.get('title',
};
```

**Fixed:**
```typescript
const data = {
  type: formData.get('type'),
  title: formData.get('title'),
};
```

---

## Fix Strategy & Workflow

### Phase 1: Structural Fixes (Completed)
- ✅ `fix-type-imports.mjs` → 346 files
- ✅ `fix-formdata-corruption.mjs` → 3 files
- ✅ `/admin/knowledge-search` → SSR migration with Qdrant + Ollama

### Phase 2: CSS Fixes (Current)
- 🔄 `fix-css-selectors.mjs` → Targets PostCSS parsing errors
- Dry-run validated: No false positives on SVG attributes
- Chunked processing with `--limit N` flag

### Phase 3: Remaining Patterns (Next)
- Missing semicolons in object literals
- Type mismatches (`TS2322`, `TS2339`, `TS2304`)
- Import resolution errors

---

## Automation Tools

### Phase 66 Python Agent
**Location:** `scripts/phase66_automated_error_fixer.py`
**LLM:** Ollama `gemma3-legal:latest` (native, no OpenAI dependency)
**Tools:**
- `get_error_patterns`: Run svelte-check and parse output
- `search_pattern`: Find files matching regex
- `run_specialized_fixer`: Invoke Node.js scripts
- `apply_regex_fix`: Direct PowerShell replacement
- `verify_fixes`: Validate error count reduction

**Workflow:**
1. Identify top 3 patterns
2. Apply fixes in priority order
3. Verify after each batch
4. Rollback if errors increase

---

## Expected Impact

| Fix Pass | Pattern | Est. Errors Fixed | Cumulative |
|----------|---------|-------------------|------------|
| Pass 1 | CSS selectors | -15,000 | 77K → 62K |
| Pass 2 | Missing semicolons | -8,000 | 62K → 54K |
| Pass 3 | Object commas | -6,000 | 54K → 48K |
| Pass 4 | Type imports (re-run) | -2,000 | 48K → 46K |
| Pass 5 | Import resolution | -4,000 | 46K → 42K |

**Target:** 42,000 errors (45% reduction) by end of Phase 66

---

## ACE Integration Points

1. **Knowledge Capture:** Document each successful pattern in this file
2. **Validation:** Run `svelte-check` after each batch
3. **Rollback:** Git commit before applying bulk fixes
4. **Observability:** Log to Langfuse (http://localhost:3030)
5. **Iteration:** Update fix patterns based on new errors revealed

---

## Commands Reference

```bash
# TypeScript fixes (already applied)
node scripts/fix-type-imports.mjs
node scripts/fix-formdata-corruption.mjs

# CSS fixes (current)
node scripts/fix-css-selectors.mjs --dry-run
node scripts/fix-css-selectors.mjs --limit 10
node scripts/fix-css-selectors.mjs  # Full run

# Phase 66 agent
pip install --upgrade openai langchain-openai
python scripts/phase66_automated_error_fixer.py

# Verification
npx svelte-check --threshold error
```

---

## Notes for Future Iterations

- CSS corruption patterns are **context-sensitive** (must parse style blocks)
- SVG attributes should **not** be modified (e.g., `width="100%"` is valid HTML)
- Keyframe syntax requires **multiline replacement** (not simple regex)
- Always validate in **dry-run** before bulk application
- Chunk processing prevents overwhelming git diffs

---

**Last Updated:** 2026-01-11 10:48 PST
**Maintained by:** Antigravity (Google Deepmind ACE)

---

## Phase 107 Fix Notes (2026-01-19)

- Repaired corrupted unions in `src/lib/types/evidence.ts` (added `WorkflowEvent`, `EvidenceWebSocketMessage`, `EvidenceSnapshot`).
- Fixed `AIAgentTool` param typing (`required?: boolean`) to restore TS parsing.
- Fixed `src/ToolInvoker.ts` diagnostics flow (restored `cmd`, removed undefined `result`, corrected `updateConfidence` signature).
- Fixed `src/lib/services/goServiceClient.ts` type signatures and health check flow (restored `Promise.allSettled`, corrected param types).
- Fixed `src/agentic-stream.ts` stream typing and export issues (callback types, decoder options, export list).
- Fixed `src/routes/(app)/codebase-index/[fileId]/+page.server.ts` broken comment/return line.
- Fixed `src/routes/+page.server.ts` Promise.all destructuring and response shape.
- Dry-run batch (5 files) reduced `svelte-check` to 51,398 errors / 94 warnings (1455 files).
- Fixed `src/routes/(app)/codebase-index/+page.server.ts` bad `console.error` formatting.
- Fixed `src/routes/(app)/phase78/routes/[routePath]/+page.server.ts` malformed summary object.
- Fixed `src/lib/services/enhanced-api-client.ts` request flow, imports, and upload response parsing.
- Dry-run batch (8 files) reduced `svelte-check` to 50,785 errors / 100 warnings (1446 files).


## Phase 89: ACE Analysis - 1/11/2026, 4:51:25 PM

**Query**: Analyze top TypeScript error clusters and recommend fixes
**Provider**: ollama (gemma3-legal:latest)
**Top Knowledge Score**: N/A
**Cache Hit Rate**: 0.0%

```json
{
  "analysis": "Based on the provided knowledge base, TypeScript errors are intertwined with CSS parsing failures, particularly related to SvelteKit's CSS processing pipeline (using Vite and PostCSS). The initial structural TypeScript fixes didn't cascade as expected, suggesting deeper issues within the codebase. The CSS errors highlight problems with global selectors, keyframe syntax, and percentage usage, likely introduced during the migration or due to corrupted files.",
  "errorPatt

---
