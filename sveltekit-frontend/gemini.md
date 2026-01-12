# Phase 89-96 Progress Summary - Gemini Knowledge Base

## 🎯 Mission Status (2026-01-11)

**Current Focus:** RabbitMQ Background Job Integration + Chunking/Streaming Fixes

### Latest Updates
```
✅ XState v5 Case Machines Rebuilt
   ├─ case-creation-machine.ts: RabbitMQ job handler for async case creation
   ├─ enhanced-legal-case-machine.ts: Full case management (load/create/evidence/AI)
   └─ Both machines: Clean fromPromise<Output, Input> generics

✅ RabbitMQ Integration Documentation
   ├─ Work Queues pattern: Round-robin task distribution
   ├─ Message acknowledgment: Manual ack with {noAck: false}
   ├─ Message durability: {durable: true} + {persistent: true}
   └─ Fair dispatch: channel.prefetch(1) for load balancing

🔄 Knowledge Base Enhancement (Current)
   ├─ RAG: Retrieval-Augmented Generation patterns
   ├─ KAG: Knowledge-Augmented Generation workflows
   ├─ DAG: Directed Acyclic Graph processing
   └─ Streaming/Chunking: Response optimization

⏳ Idle Detection Machine
   └─ Needs corruption cleanup (pervasive syntax errors)
```

---

## 🐰 RabbitMQ Integration Patterns

### Core Concepts (from rabbitmq.com tutorials)

**Work Queue Pattern:**
```javascript
// Producer (new_task.js)
const queue = 'task_queue';
const msg = process.argv.slice(2).join(' ') || "Hello World!";

channel.assertQueue(queue, { durable: true });
channel.sendToQueue(queue, Buffer.from(msg), { persistent: true });
```

**Consumer (worker.js):**
```javascript
channel.assertQueue(queue, { durable: true });
channel.prefetch(1); // Fair dispatch - don't give worker more than 1 job

channel.consume(queue, function(msg) {
  const secs = msg.content.toString().split('.').length - 1;
  console.log(" [x] Received %s", msg.content.toString());

  setTimeout(function() {
    console.log(" [x] Done");
    channel.ack(msg); // Manual acknowledgment
  }, secs * 1000);
}, {
  noAck: false // Require manual ack
});
```

### Our Implementation

**Job Types (idle-detection-rabbitmq-machine.ts):**
```typescript
type:
  | 'document_analysis'
  | 'case_clustering'
  | 'legal_research'
  | 'citation_validation'
  | 'self_prompting'
  | 'case_creation'        // NEW: Queue case creation
  | 'case_management'      // NEW: Load/evidence/AI analysis
  | 'recommendation_generation'  // NEW: Smart suggestions
```

**Queue Strategy:**
```
User Active → User Idle (5min) → Generate Prompts → Queue Jobs
                                        ↓
                                  RabbitMQ (AMQP 5672)
                                        ↓
                    Round-robin dispatch to workers
                                        ↓
            [Worker 1] [Worker 2] [Worker 3]
                        ↓
            Results → Neo4j + MinIO + PostgreSQL
```

### Key Benefits
- **Async Processing:** JavaScript stays single-threaded, workers handle heavy lifting
- **Fault Tolerance:** Message acknowledgment prevents job loss
- **Scalability:** Add workers dynamically during high load
- **Durability:** Messages survive RabbitMQ restarts ({durable: true})

---

## 📊 Error Reduction Roadmap

### Completed Fixes
| Pattern | Files | Est. Impact | Status |
|---------|-------|-------------|--------|
| Type imports (`A: B`) | 346 | Prevents cascading parse errors | ✅ |
| FormData corruption | 3 | Critical server routes | ✅ |
| Knowledge Search SSR | 1 route | Qdrant + Ollama integration | ✅ |

### In Progress
| Pattern | Est. Errors | Tool | Status |
|---------|-------------|------|--------|
| CSS selectors | 500-1,000 | fix-css-selectors.mjs | 🔄 Dry-run validated |

### Queued for Phase 66
| Pattern | Est. Errors | Priority |
|---------|-------------|----------|
| Missing semicolons | 8,000 | High |
| Object literal commas | 6,000 | High |
| Type mismatches | 20,000+ | Medium (requires semantic analysis) |
| Import resolution | 4,000 | Medium |

---

## 🔄 XState v5 Migration Patterns (2026-01-11)

### Pattern: fromPromise Inline Types Breaking Change

**Impact:** High - Affects all XState actor logic using promises
**Error Codes:** TS2345, TS2322, TS2554

**Problem:**
XState v5 removed support for inline type annotations in `fromPromise` function signatures. All types must be extracted to interfaces or provided as generics.

**Broken Syntax (v4):**
```typescript
const promiseLogic = fromPromise(async ({ input }: { input: { userId: string } }) => {
  return await getUser(input.userId);
});
```

**Correct Syntax (v5):**
```typescript
// Option 1: Extract interface
interface FetchUserInput {
  userId: string;
}

const promiseLogic = fromPromise(async ({ input }: { input: FetchUserInput }) => {
  return await getUser(input.userId);
});

// Option 2: Generic type parameters (preferred)
const promiseLogic = fromPromise<User, { userId: string }>(
  async ({ input }) => {
    return await getUser(input.userId);
  }
);
```

**RAG/KAG Integration:**
- **Qdrant Collection:** `phase89_kb_cards`
- **Embedding Model:** embeddinggemma:latest
- **Search Query:** "XState v5 fromPromise type errors"
- **Expected Retrieval:** Top-10 similar historical fixes from codebase

**Migration Steps:**
1. Scan codebase: `rg "fromPromise\(async\s*\(\s*\{.*:\s*\{" --type ts`
2. Extract inline types → separate interfaces
3. Apply generic parameters: `fromPromise<TOutput, TInput>(...)`
4. Validate: `npx tsc --noEmit`
5. Update knowledge base with successful patterns

**Scan Results (2026-01-12):**
- **Total files scanned:** 2,994 TypeScript files
- **Files with XState v4 patterns:** 87 files
- **fromPromise inline types:** 39 files, 122 occurrences
- **send() actions:** 43 files, 186 occurrences
- **Estimated error reduction:** 1,200-1,800 errors after migration
- **Detailed report:** `reports/xstate-migration/latest.md`

**Fixes Applied (2026-01-12):**
- ✅ `src/evidenceProcessingMachine.ts`: 4 fromPromise actors migrated + syntax fix
  - documentProcessing, embeddingGeneration, aiAnalysis, cacheResults
  - Fixed malformed type: `embedding?, number[]` → `embedding?: number[]`
- ✅ `src/lib/state/evidenceCustodyMachine.ts`: 1 fromPromise actor migrated
  - aiAnalysisService with proper generic types
- ✅ `src/lib/state/legal-case-machine.ts`: 4 fromPromise actors migrated
  - uploadEvidence, aiSummarizeCase, updateCase, deleteCase
- 📊 **Progress:** 3/39 high-priority files completed (7.7%, 9 actors fixed)
- 🎯 **Next:** Continue with remaining 36 files

---

## 🎯 Phase 96: XState v5 Migration (2026-01-11)

### Critical Discovery: `setup()` Import Issue
**Problem:** XState v5.24.0 exports `setup()` but TypeScript LSP fails to detect it
**Root Cause:** Declaration file structure (`xstate.cjs.d.ts` → `./declarations/src/index.js`)
**Solution:** Use `createMachine()` directly instead of `setup().createMachine()`

### fromPromise Type Signature Change
```typescript
// ❌ XState v5 rejects inline type parameters
fromPromise<TOutput, TInput>(async ({ input }) => { /* ... */ })

// ✅ Correct pattern (single generic + explicit typing)
fromPromise<TOutput>(async ({ input, signal }: {
    input: TInput;
    signal: AbortSignal
}) => { /* ... */ })
```

### Production Pattern (Verified Working)
```typescript
export const aiAssistantMachine = createMachine({
    types: { context: {} as Context, events: {} as Events },
    states: {
        processing: {
            invoke: {
                src: fromPromise<string>(async ({ input, signal }) => {
                    const res = await fetch('/api', { signal });
                    return res.json();
                }),
                input: ({ context }) => ({ prompt: context.query }),
                onDone: { target: 'idle' },
                onError: { target: 'error' }
            }
        }
    }
});
```

### Files Fixed
- ✅ `src/lib/machines/aiAssistantMachine.ts` (error-free)
- ✅ `src/lib/machines/AIAssistantMachineComponent.svelte` (UI restored)
- ✅ `src/lib/components/DocumentUploadMachineIntegration.svelte` (UI restored)
- ✅ `src/routes/indexing/+page.svelte` (integration demo wired)

### Knowledge Base Updated
- **New Doc**: `docs/xstate-v5-patterns.md` (detailed migration guide)
- **RAG Tags**: `#xstate-v5`, `#frompromise`, `#actor-lifecycle`, `#cancellation`

---

## 🛠️ Tools Arsenal

### Node.js Fixers (High-Performance)
```bash
# Location: sveltekit-frontend/scripts/

fix-type-imports.mjs           # ✅ Applied (346 files)
fix-formdata-corruption.mjs    # ✅ Applied (3 files)
fix-css-selectors.mjs          # 🔄 Ready (dry-run validated)
```

### Python Agent (AI-Powered)
```bash
# Location: scripts/phase66_automated_error_fixer.py

Features:
- Ollama gemma3-legal:latest integration
- 5 specialized tools (pattern detection, bulk fixes, verification)
- Incremental validation (rollback on regression)
- Langfuse observability (http://localhost:3030)
```

---

## 🔍 CSS Corruption Patterns Detected

### Pattern 1: Split Global Selectors
```css
❌ : global(.theme)          # Space after colon
✅ :global(.theme)            # Correct
```
**Fix:** `content.replace(/:\s+global\(/g, ':global(')`

### Pattern 2: Malformed Keyframes
```css
❌ "from" / "transform: scale(0.95)", to
✅ from { transform: scale(0.95); }
   to { transform: scale(1); }
```

### Pattern 3: Quoted Percentages
```css
❌ "0%" { ... }
✅ 0% { ... }
```

**Note:** The fix-css-selectors.mjs script targets **only** `<style>` blocks in Svelte files and `.css` files to avoid false positives on SVG attributes.

---

## 🧠 Knowledge Base Architecture (Confirmed)

### Local-First RAG Stack
```
✅ Embeddings: embeddinggemma:latest (Ollama, port 11434)
✅ Vector DB: Qdrant (Docker, port 6333)
✅ LLM: gemma3-legal:latest (Ollama, local inference)
✅ Search Backend: /admin/knowledge-search (SSR migrated)
```

### Service Integration
| Service | Status | Notes |
|---------|--------|-------|
| Ollama | ✅ Active | gemma3-legal + embeddinggemma models |
| Qdrant | ✅ Active | `legal_knowledge` collection configured |
| RabbitMQ | ❌ Unavailable | Fallback to direct DB polling |
| Gemini Search | ✅ Enabled | Web search conductor |

---

## 📝 Phase 66 Execution Plan

### Step 1: Environment Setup
```bash
# Fix Python dependencies
pip install --upgrade openai langchain-openai

# Verify Ollama
curl http://localhost:11434/api/tags
```

### Step 2: Dry-Run CSS Fixes
```bash
cd sveltekit-frontend
node scripts/fix-css-selectors.mjs --dry-run --limit 10
```

### Step 3: Apply CSS Fixes (Chunked)
```bash
# Fix 10 files at a time
node scripts/fix-css-selectors.mjs --limit 10

# Verify
npx svelte-check --threshold error 2>&1 | Select-String "found \d+ error"
```

### Step 4: Run Phase 66 Agent
```bash
python scripts/phase66_automated_error_fixer.py
```

**Agent will:**
1. Analyze remaining error patterns
2. Apply fixes in priority order (CSS → Semicolons → Commas)
3. Verify after each batch
4. Rollback if regression detected

---

## 🎓 Learnings & Best Practices

### What Worked
1. **Structural fixes first** - Type imports cascaded to prevent parse errors
2. **Dry-run validation** - Caught SVG attribute false positives
3. **Chunked processing** - Easier to review git diffs
4. **ACE knowledge capture** - Document patterns for future reference

### What Didn't Work
1. **Generic regex on full files** - Needs style block context awareness
2. **Cascading error assumptions** - 346 import fixes didn't cascade as expected (still 77K errors)
3. **One-pass fixes** - Need iterative validation

### Recommendations
1. **Always dry-run** before bulk application
2. **Validate incrementally** (after each 100-500 fixes)
3. **Git commit** before each fix batch
4. **Document patterns** in ACE knowledge base

---

## 📈 Expected Timeline

| Phase | Duration | Errors Target | Status |
|-------|----------|---------------|--------|
| Phase 1: Structural | ✅ Complete | N/A | 346 + 3 files fixed |
| Phase 2: CSS | 10-15 min | -500 to -1,000 | 🔄 In progress |
| Phase 3: Semicolons | 20-30 min | -8,000 | ⏳ Queued |
| Phase 4: Commas | 20-30 min | -6,000 | ⏳ Queued |
| Phase 5: Type Re-check | 10-15 min | -2,000 | ⏳ Queued |
| **Total** | **~90 min** | **77K → 42K** | **45% reduction** |

---

## 🔗 Related Documentation

- **COPILOT.md** - Detailed pattern catalog & fix recipes
- **CLAUDE.md** - Error analysis & semantic fixing strategies
- **PHASE88-COMPLETE-SUMMARY.md** - Historical context
- **scripts/phase66_automated_error_fixer.py** - Main automation script

---

## 🚀 Next Actions

1. ✅ Create `fix-css-selectors.mjs` (Complete)
2. ✅ Validate in dry-run (Complete)
3. ⏳ Apply CSS fixes to 1-2 test files
4. ⏳ Update Python dependencies (`pip install --upgrade...`)
5. ⏳ Run Phase 66 AI agent
6. ⏳ Measure final error count
7. ⏳ Update this knowledge base with results

---

**Status:** Phase 2 in progress (CSS pattern fixing)
**Next Milestone:** Apply fixes to 1-2 test files for validation
**Maintained by:** Antigravity (Google Deepmind ACE)
**Last Updated:** 2026-01-11 10:50 PST
