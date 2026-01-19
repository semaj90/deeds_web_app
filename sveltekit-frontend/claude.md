# Claude Tactical Error Fixing Guide - Phase 96

## Current Situation (2026-01-11 21:00 PST)

**Status:** RabbitMQ Integration + RAG/KAG/DAG Knowledge Base Updates
**XState v5 Migration:** Case machines rebuilt, idle-detection needs cleanup
**Focus:** Streaming/Chunking response optimization

---

## 🐰 RabbitMQ Background Job Architecture

### Why We Need It
JavaScript is single-threaded → Can't handle heavy tasks (AI analysis, OCR, case clustering) during HTTP requests → Queue jobs via RabbitMQ → Workers process asynchronously

### Integration Pattern

**Producer (Frontend → RabbitMQ):**
```typescript
// idle-detection-rabbitmq-machine.ts
const response = await fetch('/api/rabbitmq/publish', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    exchange: 'legal.background',
    routingKey: job.type, // 'case_creation', 'document_analysis', etc.
    message: {
      jobId: job.id,
      type: job.type,
      priority: job.priority,
      payload: job.payload,
      sessionId: context.sessionId,
      userId: context.userId,
      timestamp: Date.now()
    },
    headers: {
      messageType: 'background_job',
      priority: job.priority,
      retryCount: job.retryCount.toString()
    }
  })
});
```

**Consumer (Backend Workers):**
```typescript
// amqplib pattern
channel.assertQueue('task_queue', { durable: true });
channel.prefetch(1); // Fair dispatch

channel.consume('task_queue', async (msg) => {
  const job = JSON.parse(msg.content.toString());

  try {
    // Process job (case creation, AI analysis, etc.)
    const result = await processJob(job);

    // Store results in Neo4j/MinIO/PostgreSQL
    await storeResults(result);

    // Acknowledge job completion
    channel.ack(msg);
  } catch (error) {
    // Retry logic or dead-letter queue
    if (job.retryCount < 3) {
      channel.nack(msg, false, true); // Requeue
    } else {
      channel.nack(msg, false, false); // Send to DLQ
    }
  }
}, { noAck: false });
```

### Rebuilt State Machines

**1. case-creation-machine.ts**
- Purpose: Validate and create legal cases asynchronously
- XState v5: `fromPromise<unknown, { input: CaseCreationContext }>`
- Features: Auto-save, retry logic (3 attempts), validation errors
- API: `POST /api/cases` with jobId + sessionId

**2. enhanced-legal-case-machine.ts**
- Purpose: Full case lifecycle (load/create/evidence/AI)
- Actors:
  - `initializeSystem`: System health check
  - `loadCase`: Fetch case + evidence
  - `createCase`: Submit new case
  - `addEvidence`: Upload attachments
  - `startAIAnalysis`: Queue AI analysis job
- Integration: All results flow through RabbitMQ

### Message Durability

**Queue Declaration:**
```javascript
channel.assertQueue('task_queue', {
  durable: true  // Queue survives RabbitMQ restart
});
```

**Message Persistence:**
```javascript
channel.sendToQueue(queue, Buffer.from(msg), {
  persistent: true  // Messages written to disk
});
```

**Fair Dispatch:**
```javascript
channel.prefetch(1);  // Don't send new job until current one is acked
```

---

## 🧠 RAG + KAG + DAG Knowledge Base Patterns

### RAG (Retrieval-Augmented Generation)
**Pattern:** Query → Vector Search → Inject Context → LLM Response

```typescript
// Example: Knowledge Search with Qdrant
async function ragQuery(query: string) {
  // 1. Embed query
  const embedding = await ollama.embeddings({
    model: 'embeddinggemma:latest',
    prompt: query
  });

  // 2. Vector search
  const results = await qdrant.search({
    collection: 'knowledge_base',
    vector: embedding.embedding,
    limit: 5
  });

  // 3. Inject context into prompt
  const context = results.map(r => r.payload.text).join('\n\n');
  const prompt = `Context:\n${context}\n\nQuestion: ${query}`;

  // 4. Generate response
  const response = await ollama.generate({
    model: 'gemma3-legal:latest',
    prompt,
    stream: true  // Streaming for UX
  });

  return response;
}
```

### KAG (Knowledge-Augmented Generation)
**Pattern:** Structured knowledge (Neo4j graph) + LLM reasoning

```typescript
// Example: Case relationship analysis
async function kagAnalysis(caseId: string) {
  // 1. Query Neo4j for case relationships
  const cypher = `
    MATCH (c:Case {id: $caseId})-[:RELATED_TO]->(related:Case)
    MATCH (c)-[:HAS_EVIDENCE]->(e:Evidence)
    RETURN c, related, collect(e) as evidence
  `;
  const graph = await neo4j.run(cypher, { caseId });

  // 2. Convert graph to text
  const knowledge = formatGraphAsContext(graph);

  // 3. LLM analysis
  const analysis = await ollama.generate({
    model: 'gemma3-legal:latest',
    prompt: `Analyze this case structure:\n${knowledge}`
  });

  return analysis;
}
```

### DAG (Directed Acyclic Graph) Processing
**Pattern:** Job dependency resolution for RabbitMQ tasks

```typescript
// Example: Complex workflow
const jobDAG = {
  'extract_text': { dependencies: [] },
  'legal_analysis': { dependencies: ['extract_text'] },
  'case_creation': { dependencies: ['legal_analysis'] },
  'send_notification': { dependencies: ['case_creation'] }
};

async function processDAG(dag: JobDAG) {
  const completed = new Set<string>();

  while (completed.size < Object.keys(dag).length) {
    for (const [jobId, config] of Object.entries(dag)) {
      if (!completed.has(jobId)) {
        const canRun = config.dependencies.every(dep => completed.has(dep));

        if (canRun) {
          await queueRabbitMQJob(jobId, config);
          completed.add(jobId);
        }
      }
    }
  }
}
```

---

## 🌊 Streaming + Chunking Response Optimization

### Problem
Large LLM responses block UI → Poor UX → Need incremental delivery

### Solution: SSE (Server-Sent Events) + Chunked Transfer

**Backend (SvelteKit endpoint):**
```typescript
// src/routes/api/stream/+server.ts
export async function GET({ url }) {
  const query = url.searchParams.get('q');

  return new Response(
    new ReadableStream({
      async start(controller) {
        const response = await ollama.generate({
          model: 'gemma3-legal:latest',
          prompt: query,
          stream: true
        });

        for await (const chunk of response) {
          const data = `data: ${JSON.stringify(chunk)}\n\n`;
          controller.enqueue(new TextEncoder().encode(data));
        }

        controller.close();
      }
    }),
    {
      headers: {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        'Connection': 'keep-alive'
      }
    }
  );
}
```

**Frontend (Svelte component):**
```svelte
<script>
let response = $state('');

async function streamQuery(query) {
  const eventSource = new EventSource(`/api/stream?q=${encodeURIComponent(query)}`);

  eventSource.onmessage = (event) => {
    const chunk = JSON.parse(event.data);
    response += chunk.response; // Append incrementally
  };

  eventSource.onerror = () => {
    eventSource.close();
  };
}
</script>

<button onclick={() => streamQuery('Analyze case...')}>
  Stream Analysis
</button>

<div>{response}</div>
```

### Chunking Strategies

**1. Token-based chunking:**
```typescript
function chunkByTokens(text: string, maxTokens: number = 512) {
  const tokens = text.split(/\s+/);
  const chunks: string[] = [];

  for (let i = 0; i < tokens.length; i += maxTokens) {
    chunks.push(tokens.slice(i, i + maxTokens).join(' '));
  }

  return chunks;
}
```

**2. Semantic chunking (preserve context):**
```typescript
function chunkBySentences(text: string, chunkSize: number = 3) {
  const sentences = text.match(/[^.!?]+[.!?]+/g) || [];
  const chunks: string[] = [];

  for (let i = 0; i < sentences.length; i += chunkSize) {
    chunks.push(sentences.slice(i, i + chunkSize).join(' '));
  }

  return chunks;
}
```

**3. Embedding-aware chunking:**
```typescript
async function chunkWithEmbeddings(document: string) {
  const paragraphs = document.split('\n\n');
  const chunks: { text: string; embedding: number[] }[] = [];

  for (const para of paragraphs) {
    const { embedding } = await ollama.embeddings({
      model: 'embeddinggemma:latest',
      prompt: para
    });

    chunks.push({ text: para, embedding });
  }

  // Group similar chunks
  return clusterChunks(chunks);
}
```

---

## ✅ Completed Actions

### 1. XState v5 Case Machine Rebuild
- **case-creation-machine.ts**: Clean fromPromise generics, validation, retry
- **enhanced-legal-case-machine.ts**: Full CRUD + AI analysis
- **Integration**: Both ready to queue via idle-detection machine

### 2. RabbitMQ Documentation Integration
- **Fetched**: rabbitmq.com tutorials (Hello World + Work Queues)
- **Patterns**: Message acknowledgment, durability, fair dispatch
- **Library**: amqplib (npm install amqplib)

### 3. Knowledge Base Enhancement
- **gemini.md**: RabbitMQ patterns added
- **claude.md**: RAG/KAG/DAG + streaming/chunking patterns
- **Focus**: Production-ready async job processing

---

## 🎉 Phase 96 Achievements

### 1. XState v5 TypeScript Resolution
- **Fixed:** `setup()` import resolution failure
- **Workaround:** Direct `createMachine()` usage with inline actors
- **Pattern:** Explicit `fromPromise<TOutput>({ input, signal }: { ... })` typing
- **Result:** All 28+ machine files error-free

### 2. Enhanced AI Assistant Machine
- **File:** `src/lib/machines/aiAssistantMachine.ts`
- **Features:**
  - AbortSignal cancellation support
  - Proper error state handling
  - Type-safe promise actor implementation
- **Verification:** Zero TypeScript errors

### 3. Knowledge Base Documentation
- **Updated Files:**
  - `gemini.md`: XState v5 migration findings
  - `copilot.md`: ACE knowledge patterns
  - `docs/xstate-v5-patterns.md`: Canonical reference (570 lines)
- **Content:** TypeScript workarounds, production patterns, verified fixes

---

## ✅ Completed Actions

### 1. Structural TypeScript Fixes
- **346 files**: Fixed `import type { A: B }` → `import type { A, B }` corruption
- **3 files**: Fixed `formData.get('key', prop:` argument corruption
- **Result**: Parse-level errors prevented, but didn't cascade as expected

### 2. Knowledge Search SSR Migration
- **Route**: `/admin/knowledge-search`
- **Backend**: `+page.server.ts` with vector search actions
- **Services**:
  - `src/lib/server/embeddings/ollama.ts` (embeddinggemma:latest)
  - `src/lib/server/db/qdrant-integration.ts` (Qdrant client)
- **Result**: Local-first RAG stack operational

### 3. Phase 66 Agent Preparation
- **Script**: `scripts/phase66_automated_error_fixer.py`
- **LLM**: Ollama gemma3-legal:latest (native, no OpenAI dependency)
- **Tools**: Pattern detection, specialized Node.js fixers, verification
- **Status**: Ready (pending Python dependency upgrade)

---

## 🎯 High-Priority Error Patterns

### Pattern 1: CSS Parsing Errors (15K-20K estimated)
**Tool:** `fix-css-selectors.mjs` (created, dry-run validated)

**Targets:**
- Split global selectors: `: global(` → `:global(`
- Malformed keyframes: `"from" / "transform..."` → proper syntax
- Quoted percentages: `"0%"` → `0%`

**Strategy:**
```bash
# Dry-run first
node scripts/fix-css-selectors.mjs --dry-run --limit 10

# Apply incrementally
node scripts/fix-css-selectors.mjs --limit 50
```

---

## 🔄 XState v5 Migration Error Cluster (2026-01-11)

### Cluster Analysis Results

**Total Errors Analyzed:** 89,625
**XState-Related Errors:** ~2,000-3,000 (2.2-3.3%)
**Clustering Threshold:** Cosine similarity ≥ 0.85

**Cluster 1: fromPromise Type Signature Mismatches**
- **Error Codes:** TS2345, TS2322, TS2554
- **Affected Files:** ~40-60 files (mcp-gpu-orchestrator.ts, advanced-evidence-analyzer.ts, cognitive-cache-integration.ts)
- **Root Cause:** XState v5 removed inline type annotation support
- **Fix Pattern:**
  ```typescript
  // Before (v4)
  fromPromise(async ({ input }: { input: T }) => ...)

  // After (v5)
  fromPromise<TOutput, TInput>(async ({ input }) => ...)
  ```

**Cluster 2: Actor Input/Output Type Definitions**
- **Error Codes:** TS2339, TS7053 ("Property 'X' does not exist on type 'unknown'")
- **Root Cause:** Missing `types.actors` configuration in machine setup
- **Fix Pattern:**
  ```typescript
  const machine = setup({
    types: {
      actors: {} as {
        fetchUser: 'userFetcher';
        loadData: 'dataLoader';
      }
    },
    actors: {
      userFetcher: fromPromise<User, { userId: string }>(...),
      dataLoader: fromPromise<Data, { id: string }>(...)
    }
  }).createMachine({ ... });
  ```

**Cluster 3: Legacy spawn() API Usage**
- **Error Code:** TS2304 ("Cannot find name 'spawn'")
- **Root Cause:** XState v5 removed global `spawn()` function
- **Fix Pattern:**
  ```typescript
  // Before (v4)
  actions: {
    spawnActor: () => spawn(promiseLogic)
  }

  // After (v5)
  actions: {
    spawnActor: spawnChild('promiseLogic')
  }
  ```

### Knowledge Base DAG Update

**DAG Node:** `xstate_v5_migration_complete`
**Dependencies:**
- `type_extraction_complete` (fromPromise inline types → interfaces)
- `generic_types_applied` (explicit <TOutput, TInput> parameters)
- `actor_types_configured` (setup({ types: { actors: ... } }))

**Triggers:**
- `actor_system_validation` (tsc --noEmit)
- `integration_tests` (XState machines functional)
- `knowledge_base_ingestion` (patterns → Qdrant phase89_kb_cards)

### Scan Results Summary (2026-01-12)

**Script:** `scripts/phase89-scan-xstate-v4.mjs`

**Findings:**
- 87 files with XState v4 patterns (338 total occurrences)
- 39 high-priority files (fromPromise inline types)
- 43 medium-priority files (send() actions)
- 21 low-priority files (Machine/interpret/cond)

**Top Files by Complexity:**
1. `enhanced-upload-machine.ts` - 11 fromPromise inline types
2. `evidenceCustodyMachine.ts` - 6 fromPromise inline types
3. `evidence-processing-machine.ts` - 5 fromPromise inline types

**Migration Effort:** 3.5-5.5 hours estimated
**Expected Reduction:** 1,200-1,800 errors

**Full Report:** `reports/xstate-migration/latest.md`
npx svelte-check --threshold error  # Verify
```

---

### Pattern 2: Missing Semicolons (8K estimated)
**Detection:** `Expected ';'` errors in TypeScript

**Example:**
```typescript
// ❌ Missing semicolon
const x = 1
const y = 2

// ✅ Fixed
const x = 1;
const y = 2;
```

**Strategy:** Use AST parser (TypeScript Compiler API) to avoid false positives

---

### Pattern 3: Object Literal Commas (6K estimated)
**Detection:** `Property expected` errors

**Example:**
```typescript
// ❌ Missing comma
const obj = {
  key1: value1
  key2: value2
}

// ✅ Fixed
const obj = {
  key1: value1,
  key2: value2
}
```

**Strategy:** Context-aware replacement (require AST parsing)

---

## 🚨 Critical Warnings

### Do NOT Use Generic Regex On:
1. **SVG attributes** - `width="100%"` is valid HTML, not CSS
2. **Template literals** - Backticks can contain arbitrary strings
3. **Comments** - May contain pattern-like text
4. **String literals** - Code in strings should not be modified

### Always Validate Before Bulk Apply:
```bash
# 1. Commit current state
git add -A && git commit -m "Pre-fix checkpoint"

# 2. Dry-run
node scripts/fix-pattern.mjs --dry-run

# 3. Limited run
node scripts/fix-pattern.mjs --limit 10

# 4. Verify improvement
npx svelte-check --threshold error

# 5. If errors increased, rollback
git reset --hard HEAD
```

---

## 🔧 Recommended Fix Order

| Priority | Pattern | Tool | Est. Reduction | Reason |

---

## Phase 107 Fix Notes (2026-01-19)

- Repaired corrupted unions in `src/lib/types/evidence.ts` (added `WorkflowEvent`, `EvidenceWebSocketMessage`, `EvidenceSnapshot`).
- Fixed `AIAgentTool` param typing (`required?: boolean`) to restore TS parsing.
- Fixed `src/ToolInvoker.ts` diagnostics flow (restored `cmd`, removed undefined `result`, corrected `updateConfidence` signature).
|----------|---------|------|----------------|--------|
| **1** | CSS selectors | `fix-css-selectors.mjs` | -1,000 | Safe, high impact |
| **2** | Type imports (re-run) | `fix-type-imports.mjs` | -500 | Catch edge cases |
| **3** | Missing semicolons | AST-based fixer | -8,000 | Needs precision |
| **4** | Object commas | AST-based fixer | -6,000 | Needs context |
| **5** | Type mismatches | Manual or AI | -20,000+ | Semantic analysis |

---

## 🤖 Phase 66 Agent Capabilities

**Updated Script:** `scripts/phase66_automated_error_fixer.py`

**New Features:**
```python
@tool("Run specialized Node.js fixer")
def run_specialized_fixer(fixer_name: str) -> str:
    """
    Available fixers:
    - 'fix-type-imports': Import corruption
    - 'fix-formdata-corruption': Argument corruption
    - 'fix-css-selectors': CSS parsing errors (future)
    """
```

**Workflow:**
1. Agent analyzes svelte-check output
2. Identifies top 3 fixable patterns
3. Recommends specialized fixer if pattern matches
4. Applies fixes in batched mode
5. Validates after each batch
6. Rollbacks if regression detected

---

## 📊 Expected Results by Phase

| Phase | Action | Before | After | Reduction |
|-------|--------|--------|-------|-----------|
| ✅ Phase 1 | Structural fixes | 77,002 | 77,002* | 0%** |
| 🔄 Phase 2 | CSS selectors | 77,002 | ~76,000 | 1.3% |
| ⏳ Phase 3 | Semicolons | ~76,000 | ~68,000 | 11.6% |
| ⏳ Phase 4 | Object commas | ~68,000 | ~62,000 | 19.5% |
| ⏳ Phase 5 | Type re-check | ~62,000 | ~60,000 | 22.1% |
| ⏳ Phase 6 | Import resolution | ~60,000 | ~56,000 | 27.3% |
| 🎯 Final | Manual review | ~56,000 | ~42,000 | **45.5%** |

*Structural fixes prevent **cascading parse errors** but don't reduce count until dependent errors are fixed.

---

## 💡 Tactical Recommendations

### For Immediate Impact:
1. **Apply CSS fixes** - Safe, well-tested, limited scope
2. **Re-run type import fixer** - May catch new edge cases
3. **Commit frequently** - Easy rollback on regressions

### For Long-Term Success:
1. **Use AST parsers** - TypeScript Compiler API for precision
2. **Implement validation gates** - Error count must decrease
3. **Document all patterns** - Update knowledge base after each pass
4. **Leverage AI agents** - CrewAI for semantic analysis

### For Risk Mitigation:
1. **Always dry-run** - Preview changes before applying
2. **Limit batch size** - Fix 50-100 files at a time
3. **Monitor error types** - If new errors appear, rollback
4. **Git is your friend** - Commit before each fix batch

---

## 🔗 Quick Reference

### Commands
```bash
# Check errors
npx svelte-check --threshold error

# Apply fixes (dry-run first!)
node scripts/fix-type-imports.mjs --dry-run
node scripts/fix-css-selectors.mjs --dry-run --limit 10

# Run Phase 66 agent
python scripts/phase66_automated_error_fixer.py

# Verify improvement
npx svelte-check --threshold error 2>&1 | Select-String "found \d+ error"
```

### Files Modified This Session
- `scripts/fix-type-imports.mjs` - ✅ Applied (346 files)
- `scripts/fix-formdata-corruption.mjs` - ✅ Applied (3 files)
- `scripts/fix-css-selectors.mjs` - 🔄 Created (dry-run validated)
- `scripts/phase66_automated_error_fixer.py` - ✅ Updated (Ollama native)
- `src/routes/(app)/admin/knowledge-search/` - ✅ Migrated to SSR
- `src/lib/server/embeddings/ollama.ts` - ✅ Regenerated (clean)
- `src/lib/server/db/qdrant-integration.ts` - ✅ Regenerated (clean)

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
- Fixed `src/lib/types/chat.ts` RAGContext typing and added `recommendations`/`did_you_mean`.
- Fixed `src/lib/stores/chat-store.svelte.ts` errorHistory type annotation.

---

**Status:** Phase 2 ready for test application
**Next:** Apply CSS fixes to 1-2 files, verify, then scale
**Maintained by:** Claude (Anthropic) + Antigravity (Google Deepmind)
**Last Updated:** 2026-01-11 10:52 PST
