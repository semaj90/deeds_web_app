# Gemma4 E2B ONNX Setup Guide

**Status**: Ready to download and integrate
**Model**: onnx-community/gemma-4-E2B-it-ONNX
**Speed**: 120–255 tokens/second (browser-optimized)
**Size**: ~1.5 GB (one-time download, cached)
**Purpose**: Fast client-side fallback text generation

---

## Quick Start

### Step 1: Download the Model

```bash
bash scripts/download-gemma4-e2b-onnx.sh
```

This downloads to: `sveltekit-frontend/static/gemma4_e2b_onnx/`

Files downloaded:
- `model.onnx` (~1.5 GB) — the neural network weights
- `tokenizer.json` (~19 MB) — text encoding
- `config.json` — model configuration
- `special_tokens_map.json` — token mappings

### Step 2: Verify Installation

1. Start dev server:
   ```bash
   npm run dev
   ```

2. Navigate to: http://localhost:5173/admin/onnx-gpu-test

3. Click "Run Tests" — should show:
   - ✅ Gemma4 E2B Load (with WebGPU/WASM provider)
   - ✅ All other cache + API tests

### Step 3: (Optional) Delete Old Gemma3 Model

Once Gemma4 E2B is working, safely remove Gemma3 270M:

```bash
rm -rf sveltekit-frontend/static/gemma3_270m_onnx/
```

---

## Architecture

### Why Gemma4 E2B?

| Model | Size | Speed | Use Case |
|-------|------|-------|----------|
| **EmbeddingGemma 300M** | 291 MB | N/A (embedding only) | Batch embedding packets (384-dim) |
| **Gemma4 E2B** | 1.5 GB | 120–255 tok/s | **Fast browser fallback (NEW)** |
| **Gemma3 270M** | 418 MB | ~30 tok/s | Legacy fallback (DELETE) |
| **Gemma4 9B** | 5.3 GB | ~40 tok/s | Server summaries (llama-server) |

**Decision**: E2B replaces Gemma3 because:
- ✅ 4x faster (120–255 vs ~30 tok/s)
- ✅ Better reasoning (2B params vs 270M)
- ✅ Purpose-built for browser/edge
- ✅ Still fits in browser memory (1.5 GB, lazy-loaded)

### Full Cache Stack

```
L0: Client ONNX
  ├─ EmbeddingGemma 300M (always on, 291 MB)
  └─ Gemma4 E2B (on demand, 1.5 GB, lazy-loaded)

L1: Browser In-Memory
  ├─ LokiJS (MongoDB-like, 5–10 min TTL)
  └─ IndexedDB (idb-keyval, 7-day TTL)

L2: Server Cache
  ├─ Redis BitFrost L1 (exact-match, 5ms, 1h)
  └─ Bifrost L2 (semantic similarity, 2–5s)

L3: Persistent Storage
  ├─ Postgres pgvector (canonical embeddings)
  └─ Qdrant (ANN mirror, 768-dim, 58K chunks)

L0b: Server Inference
  ├─ Gemma4 9B (llama-server :8090, summaries)
  └─ Validation (llama-server :8091, 4 workers)
```

---

## Integration Points

### 1. Session Loading (Automatic)

```typescript
import { getGemma4E2BSession } from '$lib/ai/onnx/gemma4-e2b-session.js';

// Session is memoized — calling twice returns same instance
const session = await getGemma4E2BSession();
```

### 2. Fallback Chain

When server inference fails (network, timeout, etc.):

```
User query
  ↓
Try llama-server :8090 (Gemma4 9B, fast, on RTX 3060 Ti)
  ↓
Fallback: Client ONNX Gemma4 E2B (120–255 tok/s, WebGPU/WASM)
  ↓
Fallback: Client ONNX Gemma3 (if E2B unavailable)
  ↓
Error: No inference available
```

### 3. Batch Embeddings

Admin UI at `/admin/batch-embeddings/`:
- Uses `EmbeddingGemma 300M` for embeddings
- Stores in Bitfrost cache (L1 Redis)
- Falls back to server `/api/embed` endpoint

### 4. Test Suite

Navigate to `/admin/onnx-gpu-test` to verify:
- ✅ Browser environment
- ✅ IndexedDB (L1 cache)
- ✅ LokiJS (in-memory cache)
- ✅ ONNX Runtime
- ✅ EmbeddingGemma 300M
- ✅ Gemma4 E2B (NEW)
- ✅ WebGPU availability
- ✅ Batch embeddings API

---

## Performance

### EmbeddingGemma 300M (384-dim vectors)

```
Format: ONNX
Model size: 291 MB
First load: ~500ms (download+parse)
Subsequent loads: ~50ms (cached)
Per-embed: 10–20ms (WebGPU), 50ms (WASM)
Throughput: ~50–100 embeddings/sec
```

### Gemma4 E2B (Text generation)

```
Format: ONNX
Model size: ~1.5 GB
First load: ~2s (download+parse)
Subsequent loads: ~100ms (cached)
Speed: 120–255 tokens/sec (WebGPU-enabled)
Speed: 30–60 tokens/sec (WASM/CPU fallback)
Memory: ~2 GB peak (with WebGPU)
```

### Gemma4 9B (Server, llama-server)

```
Format: GGUF + TurboQuant
Model size: 5.3 GB (quantized)
Inference: 40–50 tok/s (RTX 3060 Ti)
Context: 16K tokens (KV cache compression)
Purpose: Summaries via /api/llm/gemma4-chat-clean
```

---

## Troubleshooting

### Model won't load?

1. Check download:
   ```bash
   ls -lah sveltekit-frontend/static/gemma4_e2b_onnx/model.onnx
   # Should be ~1.5 GB
   ```

2. Check WASM binaries:
   ```bash
   ls -lah sveltekit-frontend/static/ort/ort-wasm*.wasm
   # Should have 3 files: asyncify, jsep, plain
   ```

3. Check browser console:
   - DevTools → Console
   - Look for `[ONNX] Loading model` messages
   - Check for WebGPU or WASM initialization errors

### Slow inference?

1. Check execution provider:
   - Test page shows: "Loaded with WebGPU" or "Loaded with wasm"
   - WebGPU (GPU) is 4–6× faster than WASM

2. Check memory:
   - Model is lazy-loaded (only on first use)
   - IndexedDB + LokiJS caching reduces re-computes

3. CPU fallback:
   - If WebGPU/WASM fail, CPU fallback activates (slower but works)

### Large file download stuck?

Use resumable download with aria2c:

```bash
# Install aria2c (macOS)
brew install aria2

# Re-run download script (will resume)
bash scripts/download-gemma4-e2b-onnx.sh
```

---

## Cleanup (After Verification)

Once tests pass and E2B is working:

1. Delete old Gemma3 model:
   ```bash
   rm -rf sveltekit-frontend/static/gemma3_270m_onnx/
   ```

2. Update references in code (if any):
   - Search for `gemma3_270m_onnx` → should have 0 hits
   - (Current codebase uses dynamic loading, so no code changes needed)

3. Commit:
   ```bash
   git add sveltekit-frontend/static/gemma4_e2b_onnx/
   git rm -r sveltekit-frontend/static/gemma3_270m_onnx/
   git commit -m "feat(onnx): replace Gemma3 270M with Gemma4 E2B (4x faster, 120-255 tok/s)"
   ```

---

## References

- **Model**: https://huggingface.co/onnx-community/gemma-4-E2B-it-ONNX
- **ONNX Runtime**: https://onnxruntime.ai/
- **WebGPU**: https://www.w3.org/TR/webgpu/
- **Test Page**: http://localhost:5173/admin/onnx-gpu-test
- **Batch Embeddings**: http://localhost:5173/admin/batch-embeddings
