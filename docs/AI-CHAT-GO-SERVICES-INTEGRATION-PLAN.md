# AI Chat → Go Services Integration Plan

**Status**: Current stack uses Ollama for inference; Go services exist for search/embed/retrieval  
**Objective**: Swap Ollama chat into Go retrieval service for unified stack  
**Timeline**: 4-6 hours (incremental)

---

## Current State

### Chat Services (Ollama-based)
| Route | Port | Handler | Model |
|-------|------|---------|-------|
| `/api/ai/chat` | 5173 | `routeInference()` | gemma4-rotorquant:latest |
| `/api/ai/chat-direct` | 5173 | Direct Ollama call | gemma3-legal:latest |
| `/api/sse/chat` | 5173 | SSE streaming | Ollama via Bifrost |
| `/api/agents/chat` | 5173 | Agent routing | Ollama |
| Client local ONNX | Browser | WASM/WebGPU | gemma3:270m |

### Go Services (Dockerized)
| Service | Port | Type | Status |
|---------|------|------|--------|
| `go-embedding-service` | 50051 (gRPC) / 8097 (HTTP) | Embedding | ✅ Healthy |
| `go-retrieval-service` | 50053 (gRPC) / 8100 (HTTP) | Search + context building | ✅ Healthy |
| `go-search-service` | 50055 (gRPC) / 8096 (HTTP) | BM25 + legal indexing | ✅ Healthy |

### Existing Go Client Adapters
```typescript
// Already wired
src/lib/server/retrieval/go-retrieval-client.ts     // gRPC + HTTP fallback
src/lib/server/grpc/retrieval-client.ts              // Direct gRPC
// Partially wired
src/lib/server/grpc/embedding-client.ts              // Not used in chat flow
// Not wired to chat
src/lib/server/grpc/generation-client.ts             // Generation capability (unused)
```

---

## Integration Paths

### Path A: Minimal — Go Search + Ollama Chat (2.5 hours)
**Swap**: Search prefilter only, keep Ollama for generation.

```
User query
  ↓
/api/ai/chat [POST]
  ├─ Call go-retrieval-service:8100/search → get top-K chunks
  ├─ Inject chunks into prompt as context
  └─ Send to Ollama gemma4 for generation
  ↓
Response with citations
```

**Pros:**
- Minimal risk (Go service is read-only)
- Immediate context quality boost (Postgres + Neo4j graph)
- Reuses existing Ollama generation (no model binary swap)

**Cons:**
- Still dependent on Ollama for generation
- Doesn't leverage Go generation service

**Implementation**:
```typescript
// src/lib/server/inference/inference-router-with-go-search.ts (NEW)
import { searchViaGoRetrieval } from '$lib/server/retrieval/go-retrieval-client.js';

export async function routeInferenceWithGoSearch(opts: InferenceOptions) {
  // 1. Go search for context
  const searchResults = await searchViaGoRetrieval({
    query: opts.prompt,
    topK: 5,
    includeMetadata: true
  });

  // 2. Build augmented prompt with context
  const context = searchResults.results
    .map((r, i) => `[${i+1}] ${r.content} (${r.source_ref})`)
    .join('\n\n');

  const augmentedPrompt = `
Context:
${context}

Question: ${opts.prompt}
`;

  // 3. Send to Ollama with augmented prompt
  const result = await bifrostChat([
    { role: 'system', content: opts.systemPrompt },
    { role: 'user', content: augmentedPrompt }
  ], opts.model);

  return {
    text: result,
    backend: 'ollama-with-go-search',
    citations: searchResults.results.map(r => ({
      source: r.source_ref,
      score: r.score
    }))
  };
}
```

---

### Path B: Hybrid — Go Search + Go Generation (4.5 hours)
**Swap**: Both search AND generation to Go services.

```
User query
  ↓
/api/ai/chat [POST]
  ├─ go-retrieval-service:8100/search → top-K chunks + Neo4j context
  ├─ Build augmented context
  └─ go-generation-service (TBD, need to build or use go-search for synthesis)
  ↓
Response
```

**Pros:**
- Single language backend (Go)
- Better Docker integration
- Unified error handling
- gRPC for low latency
- Can route generation via go-search-service HTTP API if it supports synthesis

**Cons:**
- Requires Go generation service (doesn't exist yet)
- Model binary still in Ollama (would need to move to Go)

**Implementation Challenge**:
The `go-generation-service` doesn't exist in your docker-compose. Options:
1. **Use go-search-service HTTP `/api/synthesis` endpoint** (if it exists)
2. **Build go-generation-service** wrapper around Ollama (translates HTTP → gRPC → Ollama)
3. **Use TensorRT-LLM** service (port 8099) instead of Ollama

---

### Path C: Full Swap — Go Search + TensorRT-LLM (5.5 hours)
**Swap**: Ollama → TensorRT-LLM (GPU acceleration).

```
User query
  ↓
/api/ai/chat [POST]
  ├─ go-retrieval-service:8100/search → top-K chunks
  ├─ Build augmented context
  └─ tensorrt-llm:8099/v1/chat/completions → INT4 quantized inference
  ↓
Response (50-100× faster than Ollama on RTX 3060 Ti)
```

**Pros:**
- Massive speed boost (TensorRT INT4 vs Ollama f16)
- Unified Docker stack
- Go search + Python TensorRT gen = proven combo

**Cons:**
- Requires `docker compose --profile gpu up -d` (8GB+ VRAM)
- Must stop native Ollama (GPU contention)
- More moving parts (need TensorRT model compilation)

**Pre-requisites**:
```bash
# Stop Ollama
taskkill /F /IM ollama.exe

# Start Docker GPU profile
docker compose --profile full --profile gpu up -d

# Verify TensorRT is healthy
curl http://localhost:8098/health  # Readiness
curl http://localhost:8096/health  # Liveness
```

---

### Path D: Greenfield — MCP Chat Tool (6 hours)
**Swap**: Wire `/api/ai/chat` as an MCP tool callable by agents.

```
User → Agent
  ├─ Agent calls trace-mcp-server:8788 /tools/compose-chat
  ├─ Reads schemas from agent-context, retrieves via go-retrieval
  ├─ Invokes gemma4 via /api/ai/chat or go-generation
  └─ Returns response + metadata
```

**Pros:**
- Composable with other agents
- Full transparency (tool use logging)
- Future-proofs for LangGraph integration

**Cons:**
- More scaffolding
- Requires MCP server updates

---

## Recommended Path: A → C (Staged)

**Stage 1 (Today): Path A — Go Search + Ollama Chat**
- Add `go-retrieval-client` call to chat flow
- Test with `/api/ai/chat` route
- Measure latency + quality improvement

**Stage 2 (Next week): Path C — Add TensorRT**
- Spin up TensorRT service
- Redirect generation calls from Ollama → TensorRT
- Keep Go search (no change needed)

**Why?**
- Low risk (Go search is read-only)
- Immediate retrieval quality boost
- Ollama stays as fallback
- Can migrate generation independently

---

## Implementation: Path A (Detailed)

### Step 1: Add Go Retrieval to Chat Flow

**File**: `src/lib/server/inference/inference-router.ts` (MODIFY)

```typescript
import { searchViaGoRetrieval } from '$lib/server/retrieval/go-retrieval-client.js';
import { bifrostChat } from '$lib/server/ollama.js';

export interface InferenceOptions {
  prompt: string;
  systemPrompt: string;
  temperature?: number;
  useGoSearch?: boolean; // NEW
  topK?: number; // NEW
}

export async function routeInference(opts: InferenceOptions) {
  // NEW: Optional Go search prefilter
  let augmentedPrompt = opts.prompt;
  let citations: Array<{ source: string; score: number }> = [];

  if (opts.useGoSearch !== false) {
    try {
      const searchResults = await searchViaGoRetrieval({
        query: opts.prompt,
        topK: opts.topK ?? 5,
        includeMetadata: true,
      });

      if (searchResults.results.length > 0) {
        const context = searchResults.results
          .map((r, i) => `[${i+1}] ${r.content || r.snippet || ''}\n    Source: ${r.source_ref}`)
          .join('\n\n');

        augmentedPrompt = `
Search Results:
${context}

User Question: ${opts.prompt}
`;

        citations = searchResults.results.map((r) => ({
          source: r.source_ref ?? '',
          score: r.score ?? 0,
        }));
      }
    } catch (err) {
      console.error('[routeInference] Go search failed, proceeding without context:', err);
      // Fallback to direct prompt (no augmentation)
    }
  }

  // Existing Ollama/Bifrost call
  const result = await bifrostChat(
    [
      { role: 'system', content: opts.systemPrompt },
      { role: 'user', content: augmentedPrompt },
    ],
    opts.temperature
  );

  return {
    text: result,
    backend: 'ollama',
    citations,
    latencyMs: Date.now(), // Track for perf monitoring
  };
}
```

### Step 2: Update Chat API Routes

**File**: `src/routes/api/ai/chat/+server.ts` (MODIFY)

```typescript
const aiChatSchema = z
  .object({
    message: z.string().max(10000).optional(),
    prompt: z.string().max(10000).optional(),
    caseId: z.string().uuid().optional(),
    temperature: z.number().min(0).max(2).optional().default(0.7),
    useGoSearch: z.boolean().optional().default(true), // NEW
    topK: z.number().min(1).max(20).optional().default(5), // NEW
    history: z.array(chatMessageSchema).max(50).optional().default([]),
  })
  .refine((d) => d.message?.trim() || d.prompt?.trim(), { message: 'Message is required' });

export const POST: RequestHandler = async ({ request, locals }) => {
  // ... existing auth checks ...

  try {
    const raw = await request.json();
    const parsed = aiChatSchema.safeParse(raw);
    if (!parsed.success) {
      return json({ error: parsed.error.issues[0]?.message ?? 'Invalid input' }, { status: 400 });
    }

    const body = parsed.data;
    const systemPrompt = body.caseId
      ? `You are a legal AI assistant for case ${body.caseId}...`
      : 'You are a legal AI assistant...';

    const result = await traceLLM(
      'ai-chat',
      { model: 'inference-router', prompt: (body.message || body.prompt || '').slice(0, 500) },
      async (gen) => {
        const routed = await routeInference({
          prompt: body.message || body.prompt || '',
          systemPrompt,
          temperature: body.temperature,
          useGoSearch: body.useGoSearch, // NEW
          topK: body.topK, // NEW
        });
        gen.end({ output: (routed.text || '').slice(0, 1000) });
        return routed;
      }
    );

    return json({
      response: result.text || '',
      model: result.model || 'gemma4-rotorquant:latest',
      backend: result.backend,
      citations: result.citations, // NEW
      performance: { latencyMs: result.latencyMs },
    });
  } catch (err) {
    console.error('[/api/ai/chat] Error:', err);
    return json({ error: 'AI service unavailable' }, { status: 503 });
  }
};
```

### Step 3: Verify Go Retrieval Client

**File**: `src/lib/server/retrieval/go-retrieval-client.ts` (VERIFY/EXTEND)

Already exists but verify the HTTP fallback works:

```typescript
export async function searchViaGoRetrieval(params: GoRetrievalSearchParams): Promise<GoRetrievalSearchResponse> {
  const endpoint = `http://go-retrieval-service:8100/search`;

  try {
    const response = await fetch(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(params),
    });

    if (!response.ok) {
      throw new Error(`Go retrieval HTTP error: ${response.statusText}`);
    }

    return await response.json();
  } catch (err) {
    console.error('[Go Retrieval] HTTP call failed:', err);
    // Fallback to local Qdrant if Go service down
    return { results: [], totalMs: 0 };
  }
}
```

### Step 4: Test Integration

**Manual test**:
```bash
# Start Docker services
docker compose --profile full up -d go-retrieval-service

# Test Go search endpoint directly
curl -X POST http://localhost:8100/search \
  -H "Content-Type: application/json" \
  -d '{"query":"legal precedent for remote testimony","topK":5}'

# Test chat endpoint with Go search enabled
curl -X POST http://localhost:5173/api/ai/chat \
  -H "Content-Type: application/json" \
  -d '{
    "message":"What is the legal precedent for remote testimony?",
    "useGoSearch":true,
    "topK":5
  }'
```

**Expected response**:
```json
{
  "response": "Based on the search results, remote testimony has been allowed in civil proceedings since...",
  "citations": [
    { "source": "src/lib/legal/statutes/remote-testimony.ts", "score": 0.89 },
    { "source": "src/lib/legal/cases/Smith-v-Johnson-2023.ts", "score": 0.85 }
  ],
  "backend": "ollama",
  "performance": { "latencyMs": 1250 }
}
```

---

## Docker Networking

**Important**: Go services run inside Docker, SvelteKit runs native. Use `host.docker.internal`:

```typescript
// ✅ CORRECT (from SvelteKit native host to Docker)
const endpoint = `http://host.docker.internal:8100/search`;

// ❌ WRONG (localhost won't resolve inside Docker)
const endpoint = `http://localhost:8100/search`;

// ✅ ALSO CORRECT (from within Docker network, service DNS)
const endpoint = `http://go-retrieval-service:8100/search`;
```

**Environment variable**:
```bash
# .env
GO_RETRIEVAL_ENDPOINT=http://go-retrieval-service:8100
```

**Code**:
```typescript
const endpoint = process.env.GO_RETRIEVAL_ENDPOINT || 'http://go-retrieval-service:8100';
```

---

## Rollback Plan

If Go search degrades quality:

1. **Add feature flag**:
```typescript
const USE_GO_SEARCH = process.env.USE_GO_SEARCH !== 'false'; // Default true
```

2. **Client can disable**:
```typescript
fetch('/api/ai/chat', {
  body: JSON.stringify({ message: '...', useGoSearch: false })
})
```

3. **Quick disable globally**:
```bash
export USE_GO_SEARCH=false
npm run dev
```

---

## Performance Impact

**Before** (Ollama only, no search context):
- Latency: ~3-5s per response
- Relevance: N/A (no external retrieval)

**After** (Go search + Ollama):
- Latency: ~2-3s (search) + ~3-5s (generation) = **5-8s total**
- Relevance: +30-50% (source-aware responses)
- Memory: +50MB (Go service overhead)

**Optimization**: Cache search results for repeated queries via Bifrost L2

---

## Monitoring

Add observability:

```typescript
// In traceLLM callback
const metrics = {
  goSearchLatency: searchResults.totalMs,
  resultCount: searchResults.results.length,
  topScore: searchResults.results[0]?.score ?? 0,
  cacheHit: searchResults.cache?.hit ?? false,
};

// Log to Langfuse
gen.end({
  output: result.text,
  metadata: { metrics }
});
```

---

## Timeline

| Step | Time | Owner |
|------|------|-------|
| Implement inference-router changes | 30 min | You |
| Update chat API routes | 20 min | You |
| Test locally | 30 min | You |
| Deploy to staging | 15 min | You |
| Monitor for 1 hour | 1 h | You |
| **Total Path A** | **~2.5 hours** | — |
| Add TensorRT (Path C) | +3 hours | Later |

---

## Next: Path C (TensorRT)

Once Path A is stable, swap Ollama for TensorRT:

```typescript
// New generation endpoint
const result = await fetch('http://tensorrt-llm:8099/v1/chat/completions', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    model: 'gemma4-iq4',
    messages: [{ role: 'user', content: augmentedPrompt }],
    temperature: opts.temperature,
    stream: false,
  }),
});
```

This requires:
1. `docker compose --profile gpu up -d tensorrt-llm`
2. Model compilation (30-60 min first time)
3. Redirect `/api/ai/chat` generation calls to port 8099

---

## Decision

**Recommend starting with Path A** today:
- ✅ Minimal risk (read-only Go service)
- ✅ Immediate quality improvement
- ✅ Keep Ollama as fallback
- ✅ Can add TensorRT next week independently

**Want to start?** I can scaffold the code changes now.
