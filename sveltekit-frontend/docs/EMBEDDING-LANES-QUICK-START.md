# Embedding Lanes Quick Start Guide

## 30-Second Setup

```typescript
// 1. App startup (hooks.server.ts or +layout.server.ts)
import { initializeEmbeddingOrchestrator } from '$lib/server/embedding-orchestrator-init';

export async function load() {
  await initializeEmbeddingOrchestrator();
  return {};
}

// 2. Use in any route handler
import { embeddingOrchestrator } from '$lib/server/retrieval/embedding-orchestrator';

const result = await embeddingOrchestrator.embed({
  text: 'your query text',
  type: 'query'  // or 'document', 'image', 'audio'
});

console.log(result.embedding);  // [0.123, -0.456, ...]
console.log(result.lane);       // 'primary-768d' | 'fallback-512d' | 'multimodal-clip-512d'
console.log(result.dimension);  // 768 | 512
```

## Environment Variables (Optional)

```bash
# Auto-detect VRAM (default: 3000 MB for RTX 3060 Ti)
AVAILABLE_VRAM_MB=6000

# Force specific lane (for testing)
PREFERRED_EMBEDDING_LANE=primary-768d

# Custom Ollama URL (default: http://127.0.0.1:11434)
OLLAMA_URL=http://127.0.0.1:11434

# Hugging Face API (for CLIP multimodal fallback)
HUGGINGFACE_API_KEY=hf_...
```

## Lane Selection

```
VRAM ≥ 1.8 GB
  └─ primary-768d (embeddinggemma:latest)
     ✓ Full 768-dim semantic vectors
     ✓ Highest quality recall
     ✗ Highest VRAM cost

900 MB ≤ VRAM < 1.8 GB
  └─ fallback-512d (quantized projection)
     ✓ 50% smaller VRAM footprint
     ✓ Maintains reasonable recall
     ✗ Some semantic loss (2-5%)

VRAM < 900 MB
  └─ multimodal-clip-512d (CLIP)
     ✓ Minimal VRAM requirement
     ✓ Multimodal (text + images + audio)
     ✗ Lower text recall than specialized models
```

## Testing

### Endpoint

```bash
# Test a query
curl -X POST http://localhost:5173/api/embedding-lanes/test \
  -H "Content-Type: application/json" \
  -d '{
    "text": "test query",
    "type": "query"
  }'

# Get diagnostics
curl http://localhost:5173/api/embedding-lanes/test
```

### Response

```json
{
  "success": true,
  "lane": "primary-768d",
  "dimension": 768,
  "embedding_length": 768,
  "model": "embeddinggemma:latest",
  "confidence": 0.95,
  "processing_time_ms": 245,
  "cached": false
}
```

## Common Patterns

### Embed and Store in Qdrant

```typescript
const result = await embeddingOrchestrator.embed({
  text: 'document text',
  type: 'document'
});

// Get collection name for this lane
const collectionName = embeddingOrchestrator.getCollectionName('primary');
// → 'codebase_chunks_768' or 'codebase_chunks_512'

// Store in Qdrant
await qdrant.upsert(collectionName, {
  points: [{
    id: uuid(),
    vector: result.embedding,
    payload: {
      text: 'document text',
      embedding_lane: result.lane,
      embedding_model: result.model,
      source: 'api'
    }
  }]
});
```

### Batch Embed Multiple Texts

```typescript
const texts = ['text1', 'text2', 'text3'];

const results = await Promise.all(
  texts.map(text => embeddingOrchestrator.embed({
    text,
    type: 'document'
  }))
);

// All results have consistent dimension (768 or 512 depending on lane)
results.forEach(r => console.log(r.dimension)); // All same!
```

### Check Diagnostics

```typescript
const diags = embeddingOrchestrator.getDiagnostics();

console.log(diags.selected_lane);      // 'primary-768d'
console.log(diags.fallback_chain);     // ['fallback-512d', 'multimodal-clip-512d']
console.log(diags.available_vram_mb);  // 6000
console.log(diags.cache_size);         // 45
```

### Clear Cache

```typescript
embeddingOrchestrator.clearCache();
console.log('Cache cleared');
```

## Troubleshooting

| Problem | Cause | Fix |
|---------|-------|-----|
| "All embedding lanes failed" | Ollama not running | `ollama serve` |
| VRAM detection incorrect | Env var not set | `export AVAILABLE_VRAM_MB=6000` |
| CLIP multimodal fails | HF key missing | `export HUGGINGFACE_API_KEY=hf_...` |
| Cache not helping | High query variance | Check `cache_size` in diagnostics |
| Wrong dimension returned | Lane mismatch | Verify selected lane via diagnostics |

## Performance Expectations

### Latency (RTX 3060 Ti)

| Lane | First Call | Cached | Batch |
|------|-----------|--------|-------|
| primary-768d | 200-300ms | 2-5ms | 150ms/batch |
| fallback-512d | 250-350ms | 2-5ms | 200ms/batch |
| multimodal-clip-512d | 300-400ms | 2-5ms | 250ms/batch |

### Cache Hit Rates

- Exact duplicate queries: ~95%
- Similar queries (word overlap): ~40-60%
- Random queries: ~0%

## Integration Checklist

- [ ] Call `initializeEmbeddingOrchestrator()` in app startup
- [ ] Set `AVAILABLE_VRAM_MB` if system VRAM differs from 3000 MB
- [ ] Test with `/api/embedding-lanes/test` endpoint
- [ ] Check diagnostics for lane selection
- [ ] Implement Qdrant collection sync
- [ ] Monitor cache hit rates
- [ ] Configure fallback handling in your routes

## Next Steps

1. **Collection Sync** — Populate `codebase_chunks_512` and `evidence_items_clip_512` collections
2. **Configuration UI** — Add admin panel for manual lane selection
3. **Performance Monitoring** — Export Prometheus metrics
4. **Distributed Cache** — Redis backing for multi-instance deployments

---

**Docs**: `EMBEDDING-LANES-IMPLEMENTATION.md`  
**Architecture**: `memory/EMBEDDING-LANES-ARCHITECTURE.md`  
**Source**: `src/lib/server/retrieval/embedding-orchestrator.ts`
