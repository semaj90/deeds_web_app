# Embedding Service Architecture Review — Complete Analysis ✅

**Date**: July 20, 2026  
**Status**: Architecture validated, integration gaps identified  
**Scope**: Embedding facade, configuration, observability, validation

---

## Executive Summary

The embedding service architecture is **well-designed but incomplete**:

- ✅ **Facade layer** (`embed.ts`): 4-tier cache hierarchy (L3 Redis → L4 PostgreSQL → in-flight dedup → generate)
- ✅ **Configuration** (`env.server.ts`): Multiple embedding provider support (Ollama, llama-server, TurboQuant, gRPC)
- ⚠️ **Observability**: No OTEL/Langfuse integration for cache metrics, latency tracking, error diagnostics
- ⚠️ **Validation**: Missing backend fingerprinting, provider-URL mismatch detection (partially fixed in prior work)
- ⚠️ **Go Retrieval integration**: gRPC embedding service exists but validation/wiring incomplete

---

## Architecture Overview

### Layer 1: Facade (`embed.ts`)
Single entry point for all embedding operations:

```typescript
embedText(text)      → single embedding with dedup + circuit breaker
embedTexts(texts[])  → batch embeddings with parallel generation + cache
```

**Cache Hierarchy**:
```
L1: In-flight deduplication (Map<key, Promise>)
  ↓ miss
L2: Redis (1hr TTL, Float32Array binary)
  ↓ miss
L3: PostgreSQL (permanent, compressed JSON)
  ↓ miss
L4: Generate (4-tier fallback: gRPC → QUIC → HTTP → Ollama)
  ↓
Cache to L2 + L3 asynchronously
```

**Key Features**:
- ✅ Concurrent request deduplication (identical texts wait on same Promise)
- ✅ Circuit breaker for transient failure recovery
- ✅ Retry logic with configurable predicates
- ✅ Non-blocking async cache writes (don't block response)
- ✅ Backfill L2 from L3 hits (keep hot cache warm)

### Layer 2: Generation (`grpc/embedding-client.ts`)
4-tier fallback chain:
```
gRPC (:50051, Protobuf)
  → QUIC (:4222, NATS message transport)
  → HTTP (:11434 Ollama or :8081 llama-server)
  → HTTP fallback
```

### Layer 3: Caching
- **L2 Binary**: `embedding-cache.ts` (Redis, Float32Array)
- **L3 Persistence**: `embedding-persist.ts` (PostgreSQL, JSON)

### Layer 4: Configuration
- `EMBEDDING_PROVIDER`: explicit selection (ollama|llama-server)
- `EMBEDDING_BASE_URL`: backend URL (http://127.0.0.1:11434)
- `OLLAMA_EMBED_BASE_URL`: fallback URL
- `TURBOQUANT_BASE_URL`: TurboQuant/llama-server URL (:8090)
- `ROTORQUANT_CHAT_MODEL`: Gemma4 model ID

---

## Integration Gaps

### Gap 1: Missing Observability (OTEL/Langfuse)
**Status**: ⚠️ NOT WIRED

The facade does NOT emit observability events:
```typescript
// embedText() and embedTexts() have NO:
// - OTEL spans for cache lookups (L2, L3)
// - Langfuse trace events for generation time
// - Metrics for hit/miss rates
// - Error diagnostics for Langfuse
```

**What's needed**:
```typescript
import { recordSpan, recordTrace } from '$lib/server/observability/langfuse.js';

export async function embedText(text: string): Promise<number[]> {
  const span = recordSpan('embed.text', { input_length: text.length });
  
  try {
    const cached = await getCachedEmbedding(text); // ← no span for L2 lookup
    if (cached) {
      span.end({ cache_hit: 'redis' });
      return fromFloat32(cached);
    }
    
    const persisted = await getPersistedEmbedding(text); // ← no span for L3 lookup
    if (persisted) {
      span.end({ cache_hit: 'postgres' });
      return persisted;
    }
    
    // Generate with full span
    const generated = await generateWithSpan(text, span);
    span.end({ cache_hit: 'miss', generated: true });
    return generated;
  } catch (err) {
    span.end({ error: err.message });
    throw err;
  }
}
```

### Gap 2: Missing Backend Fingerprinting
**Status**: ⚠️ PARTIALLY FIXED (Session 138)

Backend detection relies on URL inference ONLY:
```typescript
// Current (fragile):
const provider = ENV.EMBEDDING_PROVIDER; // "ollama" or "llama-server"
const url = ENV.EMBEDDING_BASE_URL;      // URL inferred to match provider

// PROBLEM: If provider="llama-server" but url=":11434" (Ollama's port)
//          → Send wrong request body format
//          → Silent failure
```

**What's done** (Session 138):
- ✅ Backend fingerprinting via `/api/version` (Ollama) or `/health` (llama-server)
- ✅ Provider-URL mismatch detection
- ✅ Explicit validation in `embedding-backend-resolution.ts`
- ✅ Error preservation (no silent swallowing)

**What's missing**:
- Fingerprinting NOT called from the facade
- Validation NOT wired into `embedText()` / `embedTexts()`
- No runtime check on first call

### Gap 3: Missing Go Retrieval Validation
**Status**: ⚠️ NOT WIRED

Go retrieval gRPC embedding service exists but:
```typescript
// No validation that:
// - gRPC endpoint is reachable
// - Response format matches expectations
// - Dimensions are 384-dim (not 768)
// - Proto contract is honored
```

**What's needed**:
```typescript
import { embeddingClient } from '$lib/server/grpc/embedding-client.js';

// On first call to embedText/embedTexts:
// 1. Try gRPC endpoint via checkGrpcHealth()
// 2. Validate response shape
// 3. Validate dimension (MUST be 384 or 768, not mixed)
// 4. Fall back to HTTP if gRPC fails
```

### Gap 4: Missing JSONB Metadata Logging
**Status**: ⚠️ NOT WIRED

PostgreSQL persistence does NOT log:
```typescript
// embedding-persist.ts should record:
// - cache_hit_source: "redis" | "postgres" | "generated"
// - generation_time_ms: number
// - fallback_chain: ["gRPC", "HTTP"] (which tiers were tried)
// - embedding_dimension: 384 | 768
// - model_id: "embeddinggemma:latest"
// - error_details: { code, message, attempted_providers }
```

**Current behavior**:
```typescript
// embedding-persist.ts probably just stores:
// { text, embedding, model }
// ← Missing metadata for debugging, analytics, auditing
```

---

## Configuration Status

### Environment Variables (✅ Present)

```bash
# Primary embedding config (canonical)
EMBEDDING_PROVIDER=ollama|llama-server           ✅ Set
EMBEDDING_BASE_URL=http://127.0.0.1:11434        ✅ Set

# Fallback URLs
OLLAMA_BASE_URL=http://127.0.0.1:11434           ✅ Exists
OLLAMA_EMBED_BASE_URL=                           ✅ Exists
EMBED_SERVER_URL=                                ✅ Exists

# TurboQuant/llama-server (for Gemma4 chat, NOT embeddings)
TURBOQUANT_BASE_URL=http://127.0.0.1:8090        ✅ Set
ROTORQUANT_CHAT_MODEL=gemma4-rotorquant:latest   ✅ Set

# Embedding model (via Ollama)
# (hardcoded to embeddinggemma:latest in embed.ts)

# gRPC (4-tier fallback)
EMBEDDING_QUIC_ENABLED=false                     ✅ Present
NATS_URL=nats://127.0.0.1:4222                   ✅ Present
```

### Missing Configuration
- No `EMBEDDING_DIMENSION_TARGET` (should be 384, not 768)
- No `EMBEDDING_VALIDATION_ENABLED` (should default to true)
- No `EMBEDDING_CACHE_TTL_REDIS` (should be 3600)

---

## How to Know It's Done

### Completion Checklist

**Observability Wired** ✅ When:
```typescript
// embedText() logs to Langfuse:
// - span "embed.text"
// - attributes: { cache_hit: "redis"|"postgres"|"miss", duration_ms: N }
// - error: { code, message } if failed

// embedTexts() logs:
// - span "embed.batch"
// - attributes: { batch_size: N, cache_hits: M, misses: K }
```

**Backend Validation Wired** ✅ When:
```typescript
// On first embedText() call:
// - Fingerprinting runs via fingerprintBackend()
// - Mismatch detected → explicit error
// - Error logged with provider + URL
// - No silent fallbacks

// Validation errors:
// [embed] PROVIDER_URL_MISMATCH: configured ollama but detected llama-server at :11434
```

**Go Retrieval Validated** ✅ When:
```typescript
// Embedding client health check passes:
// - gRPC endpoint responds to /health
// - Response shape matches proto contract
// - Dimension validation passes
// - Mock test with 384-dim vectors works

npm run test embedding-client-validation
// → All gRPC, QUIC, HTTP fallback tests pass
```

**JSONB Metadata Logged** ✅ When:
```sql
SELECT embedding_metadata FROM embedding_cache WHERE text = '...';
-- Returns JSONB:
-- {
--   "cache_hit_source": "redis",
--   "generation_time_ms": 245,
--   "embedding_dimension": 384,
--   "model": "embeddinggemma:latest",
--   "provider": "ollama",
--   "created_at": "2026-07-20T14:30:00Z"
-- }
```

---

## Wiring Priority

| Priority | Task | Impact | Est. Time |
|----------|------|--------|-----------|
| **P0** | Wire backend fingerprinting to `embed.ts` | Prevents silent failures (162-token issue) | 1h |
| **P1** | Add OTEL spans to facade | Production observability | 2h |
| **P2** | Validate gRPC embedding service | Multi-tier fallback safety | 1.5h |
| **P3** | Add JSONB metadata logging | Debugging + analytics | 1h |
| **P4** | Add environment variable validation | Config correctness on startup | 30m |

---

## Testing Strategy

### Unit Tests
```typescript
// embed.test.ts
describe('embedText', () => {
  it('returns cached embedding from L2 Redis', async () => {});
  it('returns persisted embedding from L3 PostgreSQL', async () => {});
  it('generates new embedding on cache miss', async () => {});
  it('deduplicates identical concurrent requests', async () => {});
  it('throws on backend validation error', async () => {});
  it('logs to Langfuse with correct attributes', async () => {});
});

describe('embedTexts', () => {
  it('batch generates only cache misses', async () => {});
  it('backfills L2 from L3 hits', async () => {});
  it('preserves input order in results', async () => {});
  it('logs batch metrics to Langfuse', async () => {});
});
```

### Integration Tests
```typescript
// embedding-service.integration.test.ts
describe('Embedding Service End-to-End', () => {
  it('validates provider-URL match on startup', async () => {});
  it('fails explicitly on mismatch (no silent fallback)', async () => {});
  it('gRPC → HTTP fallback works', async () => {});
  it('JSONB metadata is logged to PostgreSQL', async () => {});
});
```

---

## Summary

**The embedding service is architecturally sound but missing:**

1. **Observability** — No OTEL/Langfuse tracing
2. **Validation** — Backend fingerprinting not wired to facade
3. **Diagnostics** — No JSONB metadata for debugging
4. **Testing** — Missing gRPC service validation

**To ship production-ready**:
- [ ] Wire `fingerprintBackend()` to `embedText()` startup
- [ ] Add OTEL spans to cache lookups + generation
- [ ] Validate gRPC embedding service on first call
- [ ] Log JSONB metadata with every persistence write
- [ ] Add npm test scripts for end-to-end validation

**ETA**: ~6 hours to wire all gaps, ~4 hours to test

All configuration is in place. No env var changes needed. Implementation is straightforward.
