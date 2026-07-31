# Embedding Lanes Implementation Guide

**Status**: ✅ Complete (July 30, 2026)  
**Scope**: Three-lane embedding system with automatic VRAM-based selection  
**Integration**: SvelteKit server startup + retrieval pipeline  

## Architecture Overview

### Three Lanes

| Lane | Model | Dim | VRAM Min | Collection | Use Case |
|------|-------|-----|----------|-----------|----------|
| **Primary-768d** | embeddinggemma:latest | 768 | 1.8 GB | codebase_chunks_768 | Default high-VRAM environments |
| **Fallback-512d** | Quantized projection | 512 | 900 MB | codebase_chunks_512 | Memory-constrained systems |
| **Multimodal-CLIP** | clip-vit-base-patch32 | 512 | 1.2 GB | evidence_items_clip_512 | Evidence images/audio |

### Selection Logic

```
Available VRAM
  ├─ ≥1.8GB → primary-768d (embeddinggemma, 768-dim)
  ├─ 900MB-1.8GB → fallback-512d (quantized projection, 512-dim)
  └─ <900MB → multimodal-clip-512d (CLIP fallback)
```

## Files

### Configuration
- **`src/lib/config/embedding-lanes.ts`** (380 lines)
  - Lane definitions with VRAM requirements
  - Selection logic + fallback chain builder
  - Collection name resolver
  - Diagnostic matrix output

### Models
- **`src/lib/server/retrieval/embedding-models.ts`** (380 lines)
  - `EmbeddingGemmaModel` — Primary 768-dim embeddings via Ollama HTTP
  - `QuantizedProjectionModel` — Projects 768d→512d with L2 normalization
  - `CLIPModel` — Vision-language model with Ollama/Hugging Face fallback
  - Factory function for model initialization

### Orchestrator
- **`src/lib/server/retrieval/embedding-orchestrator.ts`** (260 lines)
  - Routes requests through selected lane
  - Implements fallback chain
  - Caching layer (10K entries, LRU)
  - Diagnostic API

### Initialization
- **`src/lib/server/embedding-orchestrator-init.ts`** (70 lines)
  - One-time startup initialization
  - VRAM detection from environment
  - Lazy initialization pattern

### Schema Updates
- **`src/mcp/memory-bridge.ts`** (4 edits)
  - Dual vector columns: `hnsw_embedding` (768d) + `hnsw_embedding_512` (512d)
  - `embedding_lane` field to track lane source
  - Dual HNSW indexes for fast similarity search
  - Updated table schema + index creation

## Usage

### 1. Initialize on App Startup

In your SvelteKit hooks or layout server load function:

```typescript
import { initializeEmbeddingOrchestrator } from '$lib/server/embedding-orchestrator-init';

// Call once during app initialization
await initializeEmbeddingOrchestrator();
```

Environment variables (optional):
```bash
# Detect VRAM automatically (default: 3000 MB for RTX 3060 Ti)
AVAILABLE_VRAM_MB=6000

# Force specific lane (for testing)
PREFERRED_EMBEDDING_LANE=primary-768d

# Ollama URL (default: http://127.0.0.1:11434)
OLLAMA_URL=http://127.0.0.1:11434
```

### 2. Embed Text

```typescript
import { embeddingOrchestrator } from '$lib/server/retrieval/embedding-orchestrator';

const result = await embeddingOrchestrator.embed({
  text: 'Query or document text',
  type: 'document' | 'query' | 'image' | 'audio',
  userId: 'user-id',
  caseId: 'case-id',
  metadata: { source: 'api' }
});

console.log(result);
// {
//   embedding: [0.123, -0.456, ...],
//   dimension: 768,
//   lane: 'primary-768d',
//   model: 'embeddinggemma:latest',
//   confidence: 0.95,
//   processingTimeMs: 245,
//   cached: false
// }
```

### 3. Embed Images/Audio (CLIP Lane)

For evidence analysis:

```typescript
// Image
const imageResult = await embeddingOrchestrator.embed({
  text: 'path/to/image.jpg',
  type: 'image'
});

// Audio
const audioResult = await embeddingOrchestrator.embed({
  text: 'path/to/audio.wav',
  type: 'audio'
});
```

### 4. Get Diagnostics

```typescript
const diags = embeddingOrchestrator.getDiagnostics();
console.log(diags);
// {
//   initialized: true,
//   selected_lane: 'primary-768d',
//   fallback_chain: ['fallback-512d', 'multimodal-clip-512d'],
//   available_vram_mb: 6000,
//   reasoning: "Auto-selected primary-768d (VRAM: 6000MB ≥ 1800MB)",
//   cache_size: 234,
//   estimated_vram_usage: {
//     primary: 2048,
//     fallback: 1200,
//     multimodal: 1536
//   }
// }
```

### 5. Retrieve Collection Name

```typescript
const collectionName = embeddingOrchestrator.getCollectionName('primary');
// Returns: 'codebase_chunks_768' or 'codebase_chunks_512' depending on lane
```

## Implementation Details

### Lane Selection Algorithm

1. **Preferred lane check**: If `preferredLane` specified and VRAM sufficient → use it
2. **Auto-selection tiers**:
   - Tier 1 (VRAM ≥ 1.8 GB): primary-768d
   - Tier 2 (VRAM ≥ 900 MB): fallback-512d
   - Tier 3 (else): multimodal-clip-512d
3. **Fallback chain**: Build list of available lanes by priority for graceful degradation

### Embedding Models

#### EmbeddingGemma (768-dim)
```typescript
class EmbeddingGemmaModel {
  // HTTP POST to Ollama /api/embeddings
  // Model: embeddinggemma:latest
  // Output: 768-dim vector
  
  async embedSingle(input: string): Promise<number[]>
}
```

#### QuantizedProjection (512-dim)
```typescript
class QuantizedProjectionModel {
  // 1. Call primary EmbeddingGemma → 768-dim
  // 2. Truncate to 512 dims
  // 3. L2 normalize
  // Output: 512-dim vector
  
  async embedSingle(input: string): Promise<number[]>
}
```

#### CLIP (512-dim multimodal)
```typescript
class CLIPModel {
  // Primary: Ollama /api/embeddings (if CLIP model available locally)
  // Fallback: Hugging Face API (requires HUGGINGFACE_API_KEY)
  // Image support: embedImage(url) → 512-dim
  // Audio support: embedAudio(path) → 512-dim (currently text fallback)
  
  async embedSingle(input: string): Promise<number[]>
  async embedImage(imageInput: string): Promise<number[]>
  async embedAudio(audioPath: string): Promise<number[]>
}
```

### Caching Layer

- **Size**: 10,000 max entries
- **Key**: `{type}:{text}`
- **Value**: Full `EmbeddingResult` (embedding + metadata)
- **LRU eviction**: When cache full, oldest entries removed
- **Hit**: Returned with `cached: true` flag

### Fallback Chain

When primary lane fails:

1. Log warning with failure reason
2. Try next lane in fallback chain
3. If that fails, try next
4. If all fail, raise error with all failure reasons

Example error handling:
```typescript
try {
  const result = await embeddingOrchestrator.embed(req);
} catch (error) {
  // Might be:
  // "[EmbeddingOrchestrator] All embedding lanes failed. 
  //  Primary: primary-768d (failed: connection timeout), 
  //  Fallbacks: fallback-512d (failed: OOM), 
  //  multimodal-clip-512d (failed: model not available)"
}
```

## VRAM Estimates (RTX 3060 Ti, 8GB)

```
embeddinggemma:latest (768-dim)
  Model: ~2.0 GB
  Inference batch: ~0.5 GB
  Total: ~2.5 GB active

embeddinggemma:quantized-512 (projected)
  Model (cached): ~2.0 GB (same as above)
  Projection: ~0.1 GB
  Total: ~2.1 GB active

clip-vit-base-patch32
  Model: ~1.5 GB
  Inference batch: ~0.5 GB
  Total: ~2.0 GB active

Simultaneous models: NOT recommended
  Two models: ~4.5 GB
  Three models: ~6.5 GB (leaves 1.5 GB for OS/app)
```

**Recommendation**: Use one lane at a time. Load secondary models only on fallback.

## Testing

### Unit Tests
```bash
npm run test:embedding-lanes
```

### Integration Tests
```bash
npm run test:embedding-orchestrator
```

### Performance Benchmarks
```bash
npm run benchmark:embedding-lanes
# Measures: latency per lane, cache hit rate, VRAM usage
```

## Migration from Hardcoded 384-dim

All references updated (July 30, 2026):
- ✅ ingestion-worker.ts:17
- ✅ memory-bridge.ts (4 locations)
- ✅ mcp-gpu-orchestrator.ts:158
- ✅ webgpu-polyfill.ts:163

**Canonical policy**: 768-dim is embeddinggemma native. 512-dim is quantized variant. Never mix in same operation.

## Troubleshooting

### Orchestrator not initialized
**Error**: `"EmbeddingOrchestrator not initialized. Call initialize() first."`

**Fix**: Ensure `initializeEmbeddingOrchestrator()` called on app startup.

### VRAM detection too conservative
**Error**: System has 6GB free but orchestrator uses fallback-512d

**Fix**: Set `AVAILABLE_VRAM_MB=6000` in environment.

### All lanes failing
**Error**: `"All embedding lanes failed. Primary: ..., Fallbacks: ..."`

**Causes**:
- Ollama not running (`OLLAMA_URL` points to wrong host)
- Hugging Face API key missing (for CLIP)
- Models not pulled (`ollama pull embeddinggemma:latest`)

**Fix**:
1. Verify Ollama running: `curl http://127.0.0.1:11434/api/tags`
2. Pull required models: `ollama pull embeddinggemma:latest`
3. Check OLLAMA_URL in environment
4. Set HUGGINGFACE_API_KEY for CLIP multimodal

### Cache not helping (high miss rate)
**Diagnostics**:
```typescript
const diags = embeddingOrchestrator.getDiagnostics();
console.log(diags.cache_size); // How many cached entries?
```

**Common causes**:
- Cache cleared too frequently
- Cache size too small for workload
- High variance in queries (low locality)

**Tuning**: Increase `maxCacheSize` in orchestrator.

## Future Enhancements

1. **Learned PCA matrix** (instead of simple truncation) for 768d→512d projection
2. **Async GPU batching** for embeddings (queue multiple requests)
3. **Metrics export** (Prometheus format for monitoring)
4. **Configuration UI** (allow users to select preferred lane)
5. **Distributed cache** (Redis backing for multi-instance deployments)
6. **Time-series VRAM profiling** (detect memory leaks)

## References

- Configuration: `src/lib/config/embedding-lanes.ts`
- Models: `src/lib/server/retrieval/embedding-models.ts`
- Orchestrator: `src/lib/server/retrieval/embedding-orchestrator.ts`
- Initialization: `src/lib/server/embedding-orchestrator-init.ts`
- Memory bridge: `src/mcp/memory-bridge.ts`
- Architecture guide: `memory/EMBEDDING-LANES-ARCHITECTURE.md`

---

**Maintained by**: Claude (Anthropic)  
**Last updated**: July 30, 2026  
**Status**: Production ready
