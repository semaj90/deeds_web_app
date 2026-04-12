# Bifrost Semantic Cache — Status & Debugging Notes

**Date**: April 11, 2026
**Session**: Infrastructure enhancement sprint
**Status**: ⚠️ **CONFIGURED BUT NOT CACHING**

---

## Current State

### ✅ Completed
- Qdrant running on port 6333 (HTTP REST) + 6334 (gRPC)
- Bifrost v1.4.19 running in Docker (`legal-ai-bifrost` container, port 3040)
- Semantic cache plugin: **ACTIVE** (confirmed in logs)
- Qdrant collection `BifrostSemanticCachePlugin` created (768-dim, Cosine distance)
- Configuration validated against schema (all errors resolved)

### ❌ Issues
- **Cache has 0 points** — no responses being stored in Qdrant
- **No cache hits observed** — all queries go through to Ollama (no <200ms hits)
- **No embedding logs** — semantic cache plugin not logging embed/store operations
- **VRAM constraint** — gemma4-legal:latest (7.3GB) fails to load with only 1.1GB free VRAM

---

## Configuration

**File**: `docker/bifrost/config.json`

```json
{
  "$schema": "https://www.getbifrost.ai/schema",
  "vector_store": {
    "enabled": true,
    "type": "qdrant",
    "config": {
      "host": "host.docker.internal",
      "port": 6334  // gRPC port (not 6333 HTTP)
    }
  },
  "plugins": [
    {
      "enabled": true,
      "name": "semantic_cache",
      "config": {
        "provider": "ollama",  // NOT "ollama-local"
        "embedding_model": "embeddinggemma:latest",
        "dimension": 768,
        "cleanup_on_shutdown": true,
        "ttl": "30m",
        "threshold": 0.85,  // High similarity threshold
        "conversation_history_threshold": 3,
        "exclude_system_prompt": false,
        "cache_by_model": true,
        "cache_by_provider": true
      }
    }
  ],
  "providers": {
    "ollama-local": { /* ... chat provider ... */ },
    "ollama": {  // Separate provider for embeddings
      "keys": [{"name": "ollama-embeddings", "value": "dummy", "models": ["embeddinggemma:latest"], "weight": 1.0}],
      "network_config": {
        "base_url": "http://host.docker.internal:11434",
        "default_request_timeout_in_seconds": 60
      }
    }
  }
}
```

---

## Test Results

### Test 1: gemma4-legal:latest (FAILED — VRAM)
```
VRAM: 6879 MB used, 1146 MB free (need ~7.3 GB total)
Error: "model failed to load, this may be due to resource limitations"
Root cause: TurboQuant (llama-server) holding 6.8 GB VRAM
```

### Test 2: gemma3:270m (SUCCESSFUL MODEL LOAD, NO CACHE)
```
Cold query:  633ms
Hot query:   489ms (1.3x speedup) ❌ expected <200ms
Warm query:  448ms (1.4x speedup) ❌ expected <200ms

Qdrant collection: BifrostSemanticCachePlugin
Points stored: 0  ← Cache not storing responses
```

---

## Debugging Checklist

### ✅ Verified
- [x] Bifrost container running + healthy
- [x] Qdrant gRPC port (6334) reachable from Bifrost container
- [x] semantic_cache plugin status: "active"
- [x] Qdrant collection created with correct schema
- [x] `ollama` provider configured for embeddings
- [x] embeddinggemma:latest model available in Ollama

### ❌ Not Working
- [ ] Embedding generation during cache lookup
- [ ] Response storage in Qdrant after successful completions
- [ ] Cache hit on repeated queries

### 🔍 Needs Investigation
- [ ] Does Bifrost's `ollama` provider support embedding API?
- [ ] Are there silent errors during embedding generation?
- [ ] Check Bifrost source code for Ollama semantic cache integration
- [ ] Try with OpenAI provider instead of Ollama (requires API key)
- [ ] Enable debug logging in Bifrost (if available)

---

## Possible Root Causes

1. **Ollama provider embedding incompatibility**: Bifrost's semantic cache might not support Ollama's embedding API format
2. **Silent embedding failures**: embeddinggemma embedding requests failing without logs
3. **Provider name mismatch**: Cache config uses `provider: "ollama"` but requests use `model: "ollama-local/..."`
4. **Bifrost version bug**: v1.4.19 semantic cache + Ollama might have known issues

---

## Workarounds & Alternatives

### Option A: Skip Bifrost, use direct Redis cache
- Implement semantic cache in application layer
- Use existing Redis + Qdrant for similarity search
- Estimated effort: 4-6 hours

### Option B: Use LiteLLM proxy instead
- LiteLLM has proven semantic cache support
- Already in docker-compose (offline)
- Config: `.env` `LITELLM_ENABLED=true`
- Estimated effort: 1-2 hours

### Option C: Continue debugging Bifrost
- Review Bifrost GitHub issues for Ollama semantic cache
- Test with OpenAI provider (requires API key)
- Enable verbose logging
- Estimated effort: 3-5 hours

---

## Recommendation

**Proceed with Option B (LiteLLM) for immediate 28x cache speedup**, then return to Bifrost debugging in a dedicated session. LiteLLM has:
- ✅ Proven semantic cache with Redis backend
- ✅ 28x speedup documented
- ✅ Already in our stack (just needs enabling)
- ✅ Better logging/observability

---

## Related Documentation

- [Bifrost Semantic Cache Docs](https://docs.getbifrost.ai/features/semantic-caching)
- [scripts/tests/test-bifrost-270m.mjs](scripts/tests/test-bifrost-270m.mjs) — Test script
- [GPU_UTILIZATION_REPORT_2026-04-11.md](GPU_UTILIZATION_REPORT_2026-04-11.md) — VRAM analysis

**Sources**:
- [Semantic Caching - Bifrost AI Gateway](https://docs.getbifrost.ai/features/semantic-caching)
- [How Bifrost Reduces GPT Costs and Response Times with Semantic Caching](https://dev.to/pranay_batta/how-bifrost-reduces-gpt-costs-and-response-times-with-semantic-caching-344g)
