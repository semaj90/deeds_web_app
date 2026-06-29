# Claude Tactical Error Fixing Guide - Phase 96 + Parent Atlas P0–P7

## ⚡ PRIORITY: Parent Atlas Frozen Identity Contract (June 14, 2026)

**Read first**: `../memory/parent-atlas-frozen-identity-contract.md`

This project now operates under the **Parent Atlas P0–P7 Roadmap**. All error fixing, packet retrieval, and GPU acceleration work must follow:

1. **Frozen Identity** — no feature_id-only joins, always source_ref + directory_path
2. **Postgres is Truth** — Qdrant/Redis/Neo4j are mirrors or cache only
3. **Strict Retrieval Order** — BitFrost → Postgres → Qdrant → Neo4j (k-hop bounded)
4. **Hard Fail Conditions** — no placeholder files, no silent fallbacks
5. **No Unbounded Traversal** — all graph queries must bound k-hops

See `Parent Atlas Frozen Identity Contract` section in root CLAUDE.md for P0–P7 roadmap + key commands.

---

## 🔐 Schema Mismatch: atlas_* Tables (June 28, 2026)

**Issue**: Materialization scripts reference tables that don't exist:
- ❌ `atlas_higher_hop_index` (missing)
- ❌ `atlas_codebase_packets` (missing)
- ❌ `atlas_feature_packets` (missing)
- ✅ `atlas_packets` (exists, 58,304 rows)
- ✅ `atlas_packet_registry` (exists)
- ✅ `atlas_summary_layers` (exists)
- ✅ `atlas_semantic_diffs` (exists)

**Fix**: Update `TABLE_CANDIDATES` in `materialize-addressable-packets.mjs` to use tables that actually exist. This is a P1/P2 schema completion task.

---

## 🔐 Valkey/Redis Connection Pattern (ioredis)

**Stack**: Valkey (AGPL-free Redis drop-in) on port 6379 with password `redis` (from `.env`).

**ioredis client initialization** (correct pattern for all Node.js scripts):

```typescript
import Redis from 'ioredis';

const redis = new Redis({
  host: process.env.REDIS_HOST || 'localhost',      // 127.0.0.1
  port: parseInt(process.env.REDIS_PORT || '6379'), // 6379
  password: process.env.REDIS_PASSWORD || 'redis',  // From .env: REDIS_PASSWORD=redis
  lazyConnect: true,      // Don't auto-connect
  enableOfflineQueue: false,
  retryStrategy: () => null
});

await redis.connect();
// ... use redis ...
await redis.quit();
```

**Hard rules**:
- ✅ Extract host/port/password from `.env` separately (don't parse REDIS_URL string)
- ✅ Use `lazyConnect: true` + explicit `await redis.connect()` before first operation
- ✅ Set `enableOfflineQueue: false` to catch connection errors immediately
- ✅ Set `retryStrategy: () => null` to fail fast (no retry loop spam)
- ✅ Always check `redis.isOpen` before `await redis.quit()`
- ❌ Never use Node's `redis` package (v4+ ESM issues) — use `ioredis` only
- ❌ Never hardcode `redis://` URLs — Docker exec may change host

**Valkey vs Redis**: Functionally identical. Valkey is AGPL-free drop-in. Password is always `redis` (set in docker-compose.yml).

---

## 🔐 Data Persistence + Retrieval Contract (Session 89 Corrected)

**Verified Architecture (June 28, 2026)**:
- **Postgres**: 58,304 packets (identity/metadata) + 40,754 chunks with embeddings
- **Qdrant**: 40,568 points (mirrors codebase_chunk_index, not atlas_packets)
- **Valkey**: Partial cache (125 keys warmed, full warming pending) — password: `redis`
- **Neo4j**: Topology mirror (status pending verification)

**Core Rule**: Postgres pgvector is canonical truth. Qdrant/Valkey/Neo4j are rebuildable mirrors.

**Key Finding**: Schema is split:
- `atlas_packets.embedding` → vector(768), ALL NULL (deprecated, ignore)
- `codebase_chunk_index.content_embedding` → vector(384), 99.5% populated (use this)
- Qdrant mirror size (40.5K) matches chunk_index populated (expected, not a gap)

**Recovery Order**:
1. Verify Docker volumes mounted (never assume safety)
2. Verify Postgres counts (identity + chunks)
3. Verify Qdrant collection counts
4. Audit embedding dimensions (Ollama, Postgres, Qdrant must agree on 384)
5. Rebuild Qdrant from codebase_chunk_index if needed
6. Rebuild Neo4j topology if needed
7. Warm Redis/Bifrost from canonical sources
8. Regenerate missing summaries (40.5K+ in codebase_chunk_index)
9. Run final recovery gate (count validation + sanity checks)

**Dimension Policy** (PROJECT CANONICAL):
- PROJECT_CANONICAL_EMBED_DIM = 384 (project choice, not model universal)
- codebase_chunk_index.content_embedding = vector(384)
- Qdrant vectors = 384-dim
- Hard stop: no mixing 384 + 768 in same operation
- Hard stop: no AE 64-dim for search

**Status Language** (Use only):
- CREATED (file exists)
- WIRED (ready for dry-run)
- DRY_RUN_PROVEN (dry-run passes)
- APPLY_PROVEN (apply + verification pass)
- NOT_PROVEN (blocked)

Never claim "production-ready" from dry-run evidence.

---

## Current Diagnostics Regression Checkpoint

- Run `npm run test:diagnostics` from `sveltekit-frontend` after diagnostics-related changes.
- Unit-only slice: `npm run test:diagnostics:unit`
- Browser-only slice: `npm run test:diagnostics:e2e`
- VS Code task labels: `Diagnostics Regression Slice`, `Diagnostics Regression Slice (Unit)`, and `Diagnostics Regression Slice (E2E)`.
- Coverage includes evidence diagnostics rendering, `/api/evidence/[id]` metadata normalization and `404` handling, `/api/rag/search` diagnostics payloads, and the focused evidence upload Playwright flow.

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
- Post-fix `svelte-check`: 50,782 errors / 100 warnings (1445 files).
- Rebuilt `src/lib/services/ai-service.ts` with clean async flow, optional DB writes, and Ollama-based analysis.

---

**Status:** Phase 2 ready for test application
**Next:** Apply CSS fixes to 1-2 files, verify, then scale
**Maintained by:** Claude (Anthropic) + Antigravity (Google Deepmind)
**Last Updated:** 2026-01-11 10:52 PST

## Status Update (2026-02-04)
- **Restoration:** 99 corrupted files identified. Priority: Restore before cleanup.
- **Git:** Service consolidation (AI, POI, Evidence) secured in commit f5233e9.

## 🚨 Emergency Restoration Phase (2026-02-04)

**Objective:** Restore 99 corrupted files from `src.backup.20260104_111218`.

### Status (Live)
- **Restored:**
  - `src/lib/server/ai/rag-pipeline.ts`
  - `src/lib/services/gpu-cache-rpc-client.ts`
  - `src/lib/services/llm-router.ts`
  - `src/routes/api/embed/+server.ts`
- **Verified:**
  - `src/lib/server/embeddings/ollama.ts` (Intact)
- **Pending:**
  - `sveltekit-gpu-cache-integration.ts` (Under analysis)
  - Remaining 95 corrupted files.

### Critical Notes
- Directory consolidation (`src/lib/features`) was preserved via Git commit prior to restoration.
- Backups are restoring to legacy paths; duplicates must be managed.


---

## TRACE/Karpathy Performance Lane

**Last Updated: May 6, 2026**

Use this execution order for GPU, indexing, cache, and agentic tool-call work:

### 1. `fix(cuda): harden clusterEmbeddings and graphSimilarity safety`
- Add empty-cluster guard in `clusterEmbeddings`
- Re-seed empty clusters from farthest point OR preserve previous centroid safely
- Add hard C++ N-cap for `graphSimilarity`
- Return useful error details to the TS bridge
- **Tests**: no NaN centroids, safe rejection of n > cap

### 2. `feat(cuda): async N-API GPU calls for large workloads`
- Wrap `graphSimilarity`, `clusterEmbeddings`, `batchCosineSimilarity` in N-API async work for large n
- Preserve sync path for small workloads (threshold: n < 256)
- **Tests**: event-loop non-blocking test, large-n async path

### 3. `feat(indexer): add worker-thread pool for chunk/metadata pipeline`
- Worker threads for hashing, chunking, metadata envelopes, entity extraction, Qdrant payload generation
- Transferable `ArrayBuffer`s where useful
- Bounded queues and batch writers
- Keep Gemma4 out of the worker pool **except** selective summary tasks

### 4. `feat(cache): add tensor/similarity cache keys`
- Cache embeddings by content hash
- Cache centroid member lists
- Cache repeated query+cluster similarity results
- Redis pipeline batching
- **Smoke test**: repeated query avoids GPU rerank (cache hit verified)

### 5. `feat(agent): wire Gemma4 tool-call controller to TypeScript MCP graph/search tools`
- Allowlist: read-only graph/topology/search tools only
- Support OpenAI `tool_calls` + manual JSON tool requests
- Call `trace-mcp-server` tools over Streamable HTTP (port 8788)
- `maxToolRounds=3`, `maxToolResultChars=12000`
- Expose tool usage in YorHA metadata (`yorha.toolsUsed`)

### MCP Tool Surface (model-facing only, no raw DB access)

```
Gemma4 / Claude
  ↓
MCP tool call
  ↓
TypeScript tool handler (trace-mcp-server.ts :8788)
  ↓
gRPC client when needed (embedding :50051, retrieval :50053)
  ↓
Go/TS retrieval, embedding, indexer service
```

**Named tools**: `trace.kag_search`, `topology.search_near`, `graph.expand_neighborhood`,
`graph.shortest_path`, `clusters.get_summary_lenses`, `trace.explain_retrieval`

**Rule**: Gemma4 MUST call named MCP tools. It does NOT talk to gRPC, Qdrant, Neo4j, or Postgres directly.

### TypeScript 7 Native Audit Lane
- `tsgo` runs as a fast parallel type audit (10× faster than tsc)
- Does NOT replace `svelte-check` or `tsc` — both remain in CI
- JSONB diagnostics (`scripts/tsgo-diagnostics-to-jsonb.mjs`) feed ACE/TRACE as error-relevance signals
- Protobuf contracts generated from Zod schemas via `npm run proto:from-zod`

---

## Retrieval Lanes — Vector vs Hyper-Graph-RAG (May 9, 2026)

**Rule**: vector RAG and hyper-graph-RAG are **complementary, not competing**. Pick the lane by the question shape, not by preference. The Karpathy Authority Blend (`0.4·PageRank + 0.3·attention + 0.3·authority`) is the canonical hybrid.

| Lane | Strength | Backing store | Use when |
|---|---|---|---|
| **Vector RAG** | "find chunks semantically similar to this query" | Qdrant `codebase_chunks_768` (768-d, named vector `content`) + pgvector `codebase_chunk_index.contentEmbedding` (mirror) | natural-language query, fuzzy intent match, no known entry-point |
| **Hyper-graph-RAG** | "trace structural relationships across N hops" | Neo4j (typed edges: `IMPORTS`, `BELONGS_TO_CLUSTER`, `SIMILAR_TOPOLOGY`, `SHARES_TAGS`) + CouchDB (PageRank cache `couchdb:pagerank_scores` 6h TTL) | "what depends on X?", "shortest path from auth → DB", cluster expansion, topology-aware reranking |
| **Sparse RAG** | "exact filename / export / Redis key" | Fuse.js (browser Web Worker), `rg` CLI, BM25 index (planned N8+ in notecard lane) | lexical match needed, ID lookup, code-symbol search |

### Hyper-graph-RAG specifics

- **Neo4j is the analysis substrate.** Cypher queries express graph reasoning naturally; Qdrant cosine similarity does not. Use Neo4j when the question contains "connected to", "depends on", "via", "expand around", "shortest path", "neighborhood".
- **CouchDB is the precomputed-view layer.** `couchdb:pagerank_scores` (6h TTL), MapReduce rollups for `link_matrix` recommendations. Reads from CouchDB are cheap; reads from Neo4j with PageRank computed inline are not.
- **The 4-lane hypergraph is the join layer.** `cluster_context` / `shared_resource` / `agents_context` / `vault_link` edges (282 edges across A/B/C/D lanes per `memory/hypergraph-4-lanes-vault.md`) — these are the typed relations that make hyper-graph-RAG actually navigable.
- **Karpathy blend is the rerank.** After vector OR graph retrieval pulls candidates, the blend score (`0.4·PR + 0.3·attn + 0.3·authority` in Redis hash `gpu:karpathy:scores`, 24h TTL) is the final ordering. **Use the blend; don't roll your own.**

### Decision tree for new retrieval features

1. Is the query "find similar text" or "find similar concept"? → **Vector RAG**, Qdrant ANN.
2. Is the query "trace connections" or "expand neighborhood"? → **Hyper-graph-RAG**, Cypher in Neo4j, with CouchDB PageRank for ordering.
3. Is the query "exact filename / export / Redis key"? → **Sparse RAG**, Fuse.js or `rg`.
4. Hybrid (most cases): vector ANN → graph expansion of top-K → Karpathy rerank → ACE context pack. This is what `fetchACPKnowledgeResults()` already does at Stage A0.

### Hard rules

- ❌ **Don't replace vector RAG with hyper-graph-RAG.** Different jobs. Replacing one with the other loses semantic intent matching.
- ❌ **Don't run PageRank inline in Cypher.** Use the cached `couchdb:pagerank_scores` view. Inline PageRank is O(V+E) per query — a Neo4j-killer.
- ❌ **Don't add a 5th lane.** The three above + the 4-lane hypergraph join already cover every retrieval question seen in this codebase. SurrealDB / hypothetical "knowledge mesh" / graph-DB-of-the-month additions are research spikes only.
- ❌ **Don't bypass Karpathy blend on rerank.** The blend is the single source of truth for "which top-K wins." Custom ordering inside one feature breaks cross-feature consistency.

### MCP retrieval surface — verified healthy (2026-05-09)

TRACE MCP `:8788` is the canonical retrieval boundary for the agentic loop. As of the May 9 mount + smoke pass, **42 tools register cleanly** via `tools/list` (HTTP 200, repeatable) — including `kb.trace_search`, `context.build_kv_packet`, `db.schema_overview`, `db.table_inspect`, plus the `graph.*`, `topology.*`, `clusters.*`, `kag.*`, `kb.*`, `ops.*`, and `search.*` namespaces. Adopt these via the Cline / Claude Code / OpenCode / Hermes MCP configs.

Verified healthy MCP servers (`npx mcporter list`, varies per run): `gemma4-offload`, `microsoft-docs`, `memory`, `postgres-readonly`, `qdrant-readonly`, `neo4j-readonly`, sometimes `colab`. Offline (need package-name correction): `redis-readonly`, `ts-lsp`, `obsidian-vault`, `context7-*`, `playwright`, `legal-ai-context`. Full status: `memory/architecture/mcp-mount-smoke-2026-05-09.md`.

Two hard rules added to `docs/architecture/trace-runtime-split.md` Hard Rules after the May 9 root-cause hunt: **G34** (no Zod 3 single-arg `z.record(...)` in MCP tool schemas) and **G38** (`StreamableHTTPServerTransport({ sessionIdGenerator: undefined })` must be constructed *per request*, never as a module-scope singleton — silent-500s every call after the first).

### Cross-references

- `memory/hypergraph-4-lanes-vault.md` — 4-lane edge inventory + smoke gate
- `next_steps/active/2026-05-09_karpathy-chr97-wiring.md` — design doc for the cartridge layer that ties vector + graph retrieval into a single ACE Stage A0 cache slice
- `next_steps/active/2026-05-09_agents-md-incremental-pipeline.md` — sister design doc; AGENTS.md updates feed the `agents_context` hyperedge lane
- §"Karpathy GPU Authority Blend + Redis ACE Cache" (project-root CLAUDE.md) — full blend pipeline reference
- `docs/architecture/trace-kag-web-development-guide.md` — canonical 20-section TRACE/Karpathy web-development guide (route execution contract, retrieval lane decision tree, production safety gates, Browser Context Lane policy at §17)
- `docs/architecture/agent-surface-decision-matrix.md` — Cline vs OpenCode vs Hermes vs Codex vs Claude Code comparison + operating model. Settles "agent-surface choice is now ergonomics, not capability". Supersedes earlier "Cline wins / Hermes is a TUI toy / OpenCode is CLI-only" framing.
- `docs/architecture/trace-runtime-split.md` — Gemma4 → MCP runtime boundary rule
- `memory/architecture/browser-context-lane.md` — sanitizer + storage + worker contract for the optional browser snapshot
- `memory/architecture/admin-chat-assistant.md` — Copilot rune store + AiAnalysisPopup + SummarizeButton drop-in pattern
- `memory/architecture/client-inference-policy.md` — Service Worker vs Web Worker rules + Phase-2 ONNX-download toggle policy

### OpenCode / Memory Authority

- Treat `MASTER-FEATURE-TODO-2026-05-20.md` as the phase plan for lane completion and backlog status.
- Treat `docs/agents-md-howto.md` as the canonical guide for directory-scoped agent instructions.
- OpenCode startup should use the repo-local bootstrap path and its generated truth artifacts:
  - `scripts/opencode/bootstrap-workspace.mjs`
  - `.opencode/startup-context.json`
  - `.tmp/claude-mem-ensure.json`
  - `reports/claude-mem-startup.md`
- Tie OpenCode memory to Engram and NES by routing through:
  - `src/lib/server/memory/engram-memory.ts`
  - `src/lib/server/ai/engram-registry.ts`
  - `src/lib/gpu/nes-memory-architecture.ts`
  - `scripts/atlas/sync-engram-memory.mjs`
  - `scripts/atlas/engram-plugin-adapter.mjs`
- Prefer the repo-local memory bridges for capture/import:
  - `scripts/opencode/post-memory.mjs`
  - `scripts/opencode/monitor-claude-mem-poll.mjs`
  - `scripts/memory/import-claude-mem-observations.mjs`
- Caveat: the local `claude-mem` plugin cache patch is not durable across reinstalls/upgrades. Recheck the local bundle for the `zod/v3` compatibility fix before trusting plugin hooks after an update.
