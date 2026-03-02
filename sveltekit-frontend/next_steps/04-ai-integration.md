# AI & LLM Integration - Next Steps

**Generated:** March 1, 2026
**Priority:** MEDIUM-HIGH
**Stack:** Ollama (gemma3-legal), ONNX Runtime, embeddinggemma

---

## 🔥 Critical (Do First)

### 1. Embedding Cache Persistence
**File:** `src/workers/embedding-worker.ts`
**Issue:** TODO comment on line 146 - embeddings not persisted
**Impact:** Redundant embedding generation
**Effort:** 2 hours

**Current Code (Line 146):**
```typescript
// TODO: persist embeddings to Postgres (Drizzle) and vector DB (Qdrant), update Redis/top-k cache
```

**Implementation:**
```typescript
async function persistEmbedding(
  text: string,
  embedding: Float32Array,
  metadata: { documentId?: string; chunkId?: string }
): Promise<void> {
  const hash = createHash('md5').update(text).digest('hex');

  // 1. Save to pgvector (PostgreSQL)
  await db.insert(embeddingCache).values({
    textHash: hash,
    text: text.slice(0, 5000), // Store first 5k chars for reference
    embedding: Array.from(embedding),
    metadata,
    model: 'embeddinggemma',
    dimensions: 768,
  });

  // 2. Save to Qdrant
  await qdrantManager.upsertPoints('embedding_cache', [{
    id: deterministicPointId(hash),
    vector: Array.from(embedding),
    payload: {
      textHash: hash,
      text: text.slice(0, 1000),
      ...metadata
    }
  }]);

  // 3. Update Redis top-k cache (LRU)
  await redis.zadd('embedding:recent', Date.now(), hash);
  await redis.set(`embedding:${hash}`, JSON.stringify(Array.from(embedding)), 'EX', 86400);

  // 4. Trim Redis cache to top 10k
  const count = await redis.zcard('embedding:recent');
  if (count > 10000) {
    await redis.zremrangebyrank('embedding:recent', 0, count - 10001);
  }
}
```

**Schema (already exists):**
```typescript
// src/lib/server/db/schema-postgres.ts
export const embeddingCache = pgTable('embedding_cache', {
  id: uuid('id').primaryKey().defaultRandom(),
  textHash: varchar('text_hash', { length: 32 }).notNull().unique(),
  text: text('text'),
  embedding: vector('embedding', { dimensions: 768 }),
  metadata: jsonb('metadata'),
  model: varchar('model', { length: 50 }),
  dimensions: integer('dimensions'),
  createdAt: timestamp('created_at').defaultNow(),
});
```

---

### 2. LLM Response Caching
**Impact:** Faster responses, reduce Ollama load
**Effort:** 1.5 hours

**Semantic Caching Strategy:**
```typescript
// src/lib/server/ai/llm-cache.ts
import { cosineSimilarity } from '$lib/ai/vector-utils';

export async function getCachedResponse(
  prompt: string,
  model: string,
  threshold = 0.95
): Promise<string | null> {
  // 1. Embed the prompt
  const embedding = await generateEmbedding(prompt);

  // 2. Search Qdrant for similar prompts
  const results = await qdrantManager.search('llm_cache', {
    vector: Array.from(embedding),
    limit: 1,
    scoreThreshold: threshold,
    filter: { must: [{ key: 'model', match: { value: model } }] }
  });

  if (results.length === 0) return null;

  // 3. Return cached response
  return results[0].payload.response as string;
}

export async function cacheResponse(
  prompt: string,
  response: string,
  model: string
): Promise<void> {
  const embedding = await generateEmbedding(prompt);
  const hash = createHash('md5').update(prompt + model).digest('hex');

  await qdrantManager.upsertPoints('llm_cache', [{
    id: deterministicPointId(hash),
    vector: Array.from(embedding),
    payload: {
      prompt: prompt.slice(0, 1000),
      response: response.slice(0, 50000),
      model,
      timestamp: Date.now()
    }
  }]);
}
```

**Qdrant Collection:**
```typescript
// Add to qdrant-manager.ts
export const LLM_CACHE_COLLECTION = {
  name: 'llm_cache',
  vectors: {
    size: 768,
    distance: 'Cosine'
  }
};
```

**Integration:**
```typescript
// In /api/chat/stream or other LLM endpoints
const cached = await getCachedResponse(prompt, 'gemma3-legal');
if (cached) {
  return new Response(cached); // Instant response
}

const response = await callOllama(prompt);
await cacheResponse(prompt, response, 'gemma3-legal');
return new Response(response);
```

---

### 3. Ollama Health Monitoring
**File:** `src/lib/server/ai/ollama-client.ts`
**Impact:** Better error handling and fallback
**Effort:** 1 hour

**Add Health Checks:**
```typescript
export interface OllamaHealth {
  available: boolean;
  models: string[];
  memory: { used: number; total: number };
  gpu: boolean;
  latency: number;
}

export async function checkOllamaHealth(): Promise<OllamaHealth> {
  const start = Date.now();

  try {
    const res = await fetch('http://127.0.0.1:11434/api/tags', {
      signal: AbortSignal.timeout(3000)
    });

    if (!res.ok) {
      return { available: false, models: [], memory: { used: 0, total: 0 }, gpu: false, latency: 0 };
    }

    const data = await res.json();
    const latency = Date.now() - start;

    return {
      available: true,
      models: data.models.map((m: any) => m.name),
      memory: { used: 0, total: 0 }, // Parse from Ollama API if available
      gpu: true, // Detect from model info
      latency
    };
  } catch (error) {
    return { available: false, models: [], memory: { used: 0, total: 0 }, gpu: false, latency: 0 };
  }
}
```

**Wire to `/api/health/capabilities`:**
```typescript
// Add Ollama-specific health details
const ollamaHealth = await checkOllamaHealth();

return json({
  ollama: ollamaHealth.available,
  ollamaModels: ollamaHealth.models,
  ollamaLatency: ollamaHealth.latency,
  // ... rest of capabilities
});
```

---

## 🚀 High Priority

### 4. Streaming SSE Improvements
**File:** `src/routes/api/sse/chat/+server.ts`
**Impact:** Better UX for long responses
**Effort:** 2 hours

**Current State:** Working SSE implementation (513 lines)
**Gaps:**
- No progress indication (tokens/sec)
- No cancel support
- No partial response caching

**Enhancements:**
```typescript
export const GET: RequestHandler = async ({ url, locals }) => {
  const abortController = new AbortController();
  const clientId = crypto.randomUUID();

  // Store abort controller for cancellation
  activeStreams.set(clientId, abortController);

  return new Response(
    new ReadableStream({
      async start(controller) {
        const encoder = new TextEncoder();
        let tokenCount = 0;
        let startTime = Date.now();

        try {
          const stream = await ollamaStream(prompt, {
            signal: abortController.signal
          });

          for await (const chunk of stream) {
            if (abortController.signal.aborted) break;

            tokenCount++;
            const elapsed = (Date.now() - startTime) / 1000;
            const tokensPerSec = tokenCount / elapsed;

            // Send chunk with metadata
            controller.enqueue(encoder.encode(`data: ${JSON.stringify({
              type: 'chunk',
              text: chunk,
              meta: { tokenCount, tokensPerSec }
            })}\\n\\n`));
          }

          controller.enqueue(encoder.encode(`data: ${JSON.stringify({
            type: 'done',
            meta: { totalTokens: tokenCount, timeMs: Date.now() - startTime }
          })}\\n\\n`));
        } finally {
          activeStreams.delete(clientId);
          controller.close();
        }
      }
    }),
    {
      headers: {
        'Content-Type': 'text/event-stream',
        'X-Stream-Id': clientId
      }
    }
  );
};

// Cancel endpoint
export const DELETE: RequestHandler = async ({ url }) => {
  const streamId = url.searchParams.get('streamId');
  const controller = activeStreams.get(streamId);
  if (controller) {
    controller.abort();
    return json({ success: true });
  }
  return json({ success: false }, { status: 404 });
};
```

---

### 5. Model Auto-Loader
**Impact:** Auto-load models on first use
**Effort:** 1.5 hours

**Problem:** Models must be manually loaded via `ollama pull`
**Solution:** Auto-pull on first request

```typescript
// src/lib/server/ai/model-loader.ts
export async function ensureModelLoaded(model: string): Promise<boolean> {
  const health = await checkOllamaHealth();

  if (health.models.includes(model)) {
    return true; // Already loaded
  }

  console.log(`Model ${model} not loaded, pulling...`);

  // Trigger pull (non-blocking)
  const pullProcess = spawn('ollama', ['pull', model], {
    stdio: 'pipe'
  });

  return new Promise((resolve) => {
    pullProcess.on('close', (code) => {
      resolve(code === 0);
    });
  });
}
```

**Integration:**
```typescript
// Before any Ollama call
await ensureModelLoaded('gemma3-legal:latest');
const response = await callOllama(prompt);
```

---

### 6. ONNX Model Warmup
**File:** `src/lib/ai/onnx/session.ts`
**Status:** Already implemented (Session 93r28)
**Verification:** Ensure warmup runs on app start

**Current Implementation:**
```typescript
async function warmupSession(session: InferenceSession): Promise<void> {
  try {
    const dummyInput = new Tensor('int32', new Int32Array([1, 2, 3]), [1, 3]);
    await session.run({ input_ids: dummyInput });
    console.log('ONNX session warmed up');
  } catch (error) {
    console.warn('ONNX warmup failed (non-fatal):', error);
  }
}
```

**Todo:** Add warmup trigger in app initialization
```typescript
// src/hooks.client.ts
import { warmupONNXModels } from '$lib/ai/onnx/session';

// Run on app load (non-blocking)
warmupONNXModels().catch(console.error);
```

---

## 📋 Medium Priority

### 7. Multi-Model Support
**Impact:** Use different models for different tasks
**Effort:** 2 hours

**Router Pattern:**
```typescript
// src/lib/server/ai/model-router.ts
export function selectModel(taskType: string): string {
  const modelMap: Record<string, string> = {
    'legal-analysis': 'gemma3-legal:latest',
    'summarization': 'gemma3-legal:latest',
    'translation': 'gemma3:270m', // Lighter model for simple tasks
    'embedding': 'embeddinggemma:latest',
    'chat': 'gemma3-legal:latest'
  };

  return modelMap[taskType] || 'gemma3-legal:latest';
}
```

---

### 8. Token Usage Tracking
**Impact:** Monitor AI costs and usage
**Effort:** 1.5 hours

**Schema:**
```sql
CREATE TABLE ai_usage_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID,
  model VARCHAR(100),
  task_type VARCHAR(50),
  input_tokens INT,
  output_tokens INT,
  latency_ms INT,
  timestamp TIMESTAMP DEFAULT NOW()
);

CREATE INDEX idx_ai_usage_user ON ai_usage_log(user_id);
CREATE INDEX idx_ai_usage_timestamp ON ai_usage_log(timestamp);
```

**Tracking:**
```typescript
async function logUsage(
  userId: string,
  model: string,
  taskType: string,
  inputTokens: number,
  outputTokens: number,
  latency: number
) {
  await db.insert(aiUsageLog).values({
    userId, model, taskType, inputTokens, outputTokens, latencyMs: latency
  });
}
```

---

### 9. Prompt Template Library
**Impact:** Standardized prompts with better results
**Effort:** 2 hours

**Structure:**
```typescript
// src/lib/ai/prompts.ts
export const LEGAL_PROMPTS = {
  summarize_evidence: (text: string) => `
You are a legal assistant. Summarize the following evidence concisely, focusing on legally relevant facts:

${text}

Summary:`,

  extract_entities: (text: string) => `
Extract all legal entities from this text (persons, organizations, statutes, dates):

${text}

Entities (JSON):`,

  generate_report: (template: string, caseData: any) => `
Generate a ${template} report for the following case:

Case: ${caseData.title}
Practice Area: ${caseData.practiceArea}
Evidence: ${caseData.evidenceSummary}

Report:`,
};
```

---

### 10. Client-Side Model Switching
**Impact:** Smart local vs server routing
**Effort:** 1.5 hours

**Enhance client-router.ts:**
```typescript
export function shouldEscalateToServer(
  query: string,
  userPreference: 'auto' | 'local' | 'server'
): boolean {
  if (userPreference === 'server') return true;
  if (userPreference === 'local') return false;

  // Auto mode - intelligent routing
  const legalKeywords = ['statute', 'precedent', 'citation', 'motion', 'brief'];
  const hasLegalTerms = legalKeywords.some(kw => query.toLowerCase().includes(kw));

  if (hasLegalTerms) return true; // Use server for legal queries
  if (query.length > 500) return true; // Long queries need server

  return false; // Use local ONNX
}
```

---

## Summary

**Total Items:** 10
**Effort:** 16.5 hours
**Priority Breakdown:**
- Critical: 3 items (4.5 hours) - Embedding cache, LLM cache, health monitoring
- High: 3 items (5.5 hours) - SSE improvements, model auto-loader, ONNX warmup
- Medium: 4 items (6.5 hours) - Multi-model, token tracking, prompts, routing

**Database Changes:**
- 1 new table (ai_usage_log)
- Use existing embedding_cache table

**Qdrant Collections:**
- llm_cache (new)

**Key Files:**
- `src/workers/embedding-worker.ts` (TODO line 146)
- `src/lib/server/ai/ollama-client.ts` (health checks)
- `src/routes/api/sse/chat/+server.ts` (streaming)
- `src/lib/ai/client-router.ts` (routing logic)
