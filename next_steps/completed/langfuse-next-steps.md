# Langfuse Integration — Next Steps

## Current State (March 13, 2026)

| Item | Status |
|------|--------|
| Langfuse v2.95.11 | Running healthy on port 3030 |
| ClickHouse | Running on ports 5123/5900 (not used by Langfuse v2) |
| SDK (langfuse npm) | Installed, lazy singleton via `langfuse.ts` |
| Ingestion API | Verified (201 responses) |
| LANGFUSE_ENABLED | `true` in `.env` |
| Files instrumented | **8 of ~165 inference callers** |

### Files Already Instrumented
1. `lib/server/ollama.ts` — `traceLLM()` on all completions
2. `lib/server/llm/ollama-client.ts` — `traceLLM()` on chat/generate
3. `lib/server/llm/gemmaReports.ts` — `traceLLM()` on report generation
4. `lib/server/analysis/summarizer.ts` — `traceLLM()` on document summaries
5. `lib/server/analysis/entity-extraction.ts` — `traceLLM()` on entity extraction
6. `lib/server/embedding-service.ts` — `traceEmbedding()` on embeddings
7. `lib/server/embedding-gateway.ts` — `traceEmbedding()` on gateway embeddings
8. `lib/server/observability/langfuse.ts` — SDK wrapper itself

---

## Phase 1: High-Value Route Instrumentation (Quick Wins)

Wrap the top API routes that handle user-facing LLM/embedding calls. These produce the most valuable traces for cost/latency monitoring.

| Route | Call Type | Wrapper |
|-------|-----------|---------|
| `api/ai/chat/+server.ts` | LLM Chat | `traceLLM()` |
| `api/sse/chat/+server.ts` | LLM Chat (SSE) | `traceLLM()` |
| `api/synthesis/generate/+server.ts` | LLM Chat | `traceLLM()` |
| `api/rag/answer/+server.ts` | LLM Chat | `traceLLM()` |
| `api/rag/search/+server.ts` | RAG Hybrid | `traceRAG()` |
| `api/knowledge/stream/+server.ts` | LLM Chat (SSE) | `traceLLM()` |
| `api/knowledge/search/+server.ts` | Embedding | `traceEmbedding()` |
| `api/embed/+server.ts` | Embedding | `traceEmbedding()` |
| `api/evidence/search/+server.ts` | Embedding | `traceEmbedding()` |
| `api/evidence/upload/+server.ts` | Embedding | `traceEmbedding()` |

**Pattern** — each route follows the same 3-line change:
```typescript
import { traceLLM } from '$lib/server/observability/langfuse.js';

// Wrap existing fetch call:
const result = await traceLLM('route-name', { model, prompt: input.slice(0,500) }, async (gen) => {
    const res = await fetch(`${OLLAMA_URL}/api/chat`, { ... });
    const data = await res.json();
    gen.end({ output: data.message?.content?.slice(0,1000) });
    return data;
});
```

---

## Phase 2: Core Library Instrumentation

These server libraries are called by multiple routes — instrumenting them covers many routes at once.

| Library | Call Type | Wrapper |
|---------|-----------|---------|
| `lib/server/ai/ollama-client.ts` | LLM Dual | `traceLLM()` |
| `lib/server/ai/embeddings.ts` | Embedding | `traceEmbedding()` |
| `lib/server/ai/embeddings-simple.ts` | Embedding | `traceEmbedding()` |
| `lib/server/ai/legal-reasoning-chain.ts` | LLM Chat | `traceLLM()` |
| `lib/server/ai/multimodal-fusion.ts` | LLM Chat | `traceLLM()` |
| `lib/server/llm/gemmaIntake.ts` | LLM Chat | `traceLLM()` |
| `lib/server/llm/contextual-chat.ts` | LLM Chat | `traceLLM()` |
| `lib/server/embedding/embed.ts` | Embedding | `traceEmbedding()` |
| `lib/server/embeddings/ollama.ts` | Embedding | `traceEmbedding()` |
| `lib/server/ace/self-prompt.ts` | LLM Chat | `traceLLM()` |
| `lib/server/rag-pipeline.ts` | RAG Hybrid | `traceRAG()` |
| `lib/server/inference/inference-router.ts` | LLM Dual | `traceLLM()` |
| `lib/server/vlm-document-analyzer.ts` | LLM Chat | `traceLLM()` |
| `lib/server/nlp/analyzer.ts` | LLM Chat | `traceLLM()` |
| `lib/server/batch-embedder.ts` | Embedding | `traceEmbedding()` |

---

## Phase 3: RAG Pipeline Tracing

Use `traceRAG()` for full pipeline visibility (retrieval + generation in one trace).

| File | Pipeline |
|------|----------|
| `lib/server/rag/uiComplianceRag.ts` | Embed → Qdrant → LLM |
| `lib/server/unified/legal-ai-service.ts` | Embed → Search → LLM |
| `api/rag/search/+server.ts` | Query expansion → Embed → Rerank → LLM |
| `api/knowledge/+server.ts` | Embed → KB search → LLM |

```typescript
import { traceRAG } from '$lib/server/observability/langfuse.js';

const result = await traceRAG(query, { caseId, collection }, async (trace) => {
    const retrieval = trace.span('retrieval');
    const docs = await qdrantSearch(embedding, collection);
    retrieval.end(`${docs.length} docs retrieved`);

    const generation = trace.span('generation');
    const answer = await ollamaChat(prompt + context);
    generation.end(answer.slice(0, 500));

    return answer;
});
```

---

## Phase 4: Langfuse v3 Upgrade

Langfuse v3 adds ClickHouse-backed analytics (10x faster trace queries). Currently blocked by a Zod/Next.js bug.

**Blocker**: `TypeError: Cannot set property message of ZodError which has only a getter`
- Known issue in Langfuse v3 + Next.js 14.2.x/15.x
- Affects both `langfuse/langfuse:3` and `langfuse/langfuse:latest`

**When to retry**: Check https://github.com/langfuse/langfuse/issues for the Zod fix. Once resolved:
1. Change `docker/langfuse.yml` image to `langfuse/langfuse:3`
2. Uncomment `CLICKHOUSE_URL` and `CLICKHOUSE_MIGRATION_URL` env vars
3. ClickHouse is already running and has 7 analytics tables + 3 materialized views ready

---

## Phase 5: ClickHouse Analytics (Independent of Langfuse v3)

ClickHouse is running on ports 5123/5900 with pre-created tables. It can be used directly for analytics even without Langfuse v3.

**Existing tables** (`docker/clickhouse/init/01-create-tables.sql`):
- `llm_traces` — LLM call logs with latency, tokens, cost
- `embedding_traces` — Embedding generation logs
- `rag_sessions` — Full RAG pipeline traces
- `error_events` — LLM error tracking
- `model_performance` — Per-model latency/throughput metrics
- `user_interactions` — User behavior analytics
- `cost_tracking` — Token cost aggregation

**Materialized views**: `mv_model_hourly_stats`, `mv_daily_costs`, `mv_error_rates`

**Direct integration option**: Write traces to ClickHouse alongside Langfuse. Add a `traceToClickHouse()` helper that INSERTs into these tables via the HTTP interface on port 5123.

```typescript
// Example: Direct ClickHouse insert for analytics
await fetch('http://localhost:5123', {
    method: 'POST',
    body: `INSERT INTO llm_traces FORMAT JSONEachRow ${JSON.stringify({
        trace_id: crypto.randomUUID(),
        model: 'gemma3-legal:latest',
        latency_ms: elapsed,
        prompt_tokens: usage.promptTokens,
        completion_tokens: usage.completionTokens,
        timestamp: new Date().toISOString(),
    })}`,
});
```

---

## Phase 6: LiteLLM Proxy Integration

A LiteLLM proxy (`litellm_config.yaml`) can centralize all Ollama calls through one gateway with automatic Langfuse callback.

**Benefits**:
- Single point of instrumentation (all models traced automatically)
- Model aliasing (`gpt-4` → `gemma3-legal:latest`)
- Rate limiting, retries, fallback chains
- Automatic Langfuse callbacks (no per-file wiring needed)

**Setup**:
```yaml
# litellm_config.yaml
model_list:
  - model_name: legal-llm
    litellm_params:
      model: ollama/gemma3-legal:latest
      api_base: http://localhost:11434
  - model_name: embed
    litellm_params:
      model: ollama/embeddinggemma:latest
      api_base: http://localhost:11434

litellm_settings:
  success_callback: ["langfuse"]
  failure_callback: ["langfuse"]

environment_variables:
  LANGFUSE_PUBLIC_KEY: pk-lf-4e3db8a0107de7872b894e309494252b
  LANGFUSE_SECRET_KEY: sk-lf-3941aba7500ce9fabbe0c513ad6c3a58
  LANGFUSE_HOST: http://localhost:3030
```

```bash
# Start LiteLLM proxy
litellm --config litellm_config.yaml --port 4000

# All calls routed through proxy get auto-traced
# Change OLLAMA_BASE_URL to http://localhost:4000 for full coverage
```

**Trade-off**: LiteLLM adds ~5-10ms per request but eliminates the need to wire Langfuse into every file individually. Best for achieving 100% trace coverage quickly.

---

## Phase 7: Production Hardening

Before deploying to production, address these items:

### Secrets Rotation
- [ ] Rotate `LANGFUSE_INIT_PROJECT_PUBLIC_KEY` and `LANGFUSE_INIT_PROJECT_SECRET_KEY`
- [ ] Rotate `ENCRYPTION_KEY` (currently a dev placeholder)
- [ ] Rotate `NEXTAUTH_SECRET` and `SALT`
- [ ] Change `LANGFUSE_INIT_USER_PASSWORD` from `admin123`
- [ ] Move all secrets to a vault (Docker Secrets, HashiCorp Vault, or `.env` outside repo)

### Performance
- [ ] Tune `flushAt` (batch size) and `flushInterval` (ms) based on trace volume
- [ ] Monitor Langfuse Postgres DB size — traces accumulate fast
- [ ] Set up trace retention policy (auto-delete traces older than N days)
- [ ] Consider sampling for high-volume endpoints (trace 10% of embedding calls)

### Monitoring
- [ ] Add Langfuse health to `/api/infrastructure/status`
- [ ] Alert on Langfuse ingestion failures (SDK errors are non-fatal but should be tracked)
- [ ] Dashboard: average latency by model, tokens/day, error rate by endpoint

---

## Coverage Summary

| Category | Files | Instrumented | Remaining |
|----------|-------|-------------|-----------|
| Core LLM libraries | 15 | 4 | 11 |
| Core embedding libraries | 10 | 3 | 7 |
| API routes (LLM) | ~40 | 0 | ~40 |
| API routes (embedding) | ~20 | 0 | ~20 |
| API routes (RAG hybrid) | ~10 | 0 | ~10 |
| ACE/Agent/Tools | ~8 | 0 | ~8 |
| Health/Admin (low priority) | ~15 | 0 | ~15 |
| Client-side (not applicable) | ~5 | N/A | N/A |
| **Total** | **~123** | **7** | **~111** |

---

## Docker Commands

```bash
# Start Langfuse + ClickHouse
docker compose -f docker/langfuse.yml up -d

# View Langfuse logs
docker compose -f docker/langfuse.yml logs -f langfuse-server

# Langfuse UI
open http://localhost:3030

# ClickHouse shell
docker exec -it langfuse-clickhouse clickhouse-client

# Stop all
docker compose -f docker/langfuse.yml down

# Reset (destroys data)
docker compose -f docker/langfuse.yml down -v
```

## Environment Variables

```bash
# Required in .env
LANGFUSE_ENABLED=true
LANGFUSE_PUBLIC_KEY=pk-lf-...
LANGFUSE_SECRET_KEY=sk-lf-...
LANGFUSE_HOST=http://localhost:3030
```
