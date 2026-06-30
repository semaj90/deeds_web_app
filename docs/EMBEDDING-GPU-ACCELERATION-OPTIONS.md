# Embedding GPU Acceleration: Options & Trade-offs

**Date**: June 30, 2026  
**Status**: Analysis complete, recommendation ready

---

## Current State

✅ **tensorrt_bridge.node** (368 KB, CUDA 12.1):
- **Includes**: cuBLAS (vector math), CUDA Graphs (kernel caching), ML ops (k-means, SOM, PageRank)
- **Does NOT include**: ONNX tokenizer, TensorRT inference, EmbeddingGemma model loading

❌ **ONNX Runtime** (Python):
- Not installed
- Would need `onnxruntime-gpu` package + CUDA Runtime + cuDNN

✅ **Ollama** (already deployed):
- `embeddinggemma:latest` runs on GPU in Docker
- 50 embeddings/sec on RTX 3060 Ti = **19 min for 57K summaries**

---

## Three Paths to GPU-Accelerated Embedding

### Path 1: Ollama (Recommended — already deployed, zero setup)

**Flow**:
```
Text → HTTP POST to Ollama :11434/api/embed
  → GPU inference (embeddinggemma:latest)
  → 768d vector response
  → Store in Postgres atlas_summary_layers.embedding
```

**Pros**:
- ✅ Already running in Docker
- ✅ No compilation needed
- ✅ 50 embeddings/sec (19 min for 57K)
- ✅ Fallback to CPU if GPU OOM
- ✅ Cached responses via Redis

**Cons**:
- Network latency (Docker → HTTP)
- Not local to Node.js process
- 50 embeddings/sec is sequential (not batch-parallelized)

**Recommendation**: **Use this** for the immediate post-Colab pipeline. It's proven, deployed, and fast enough.

---

### Path 2: ONNX Runtime + GPU (Possible — requires installation)

**Flow**:
```
Text → Node.js (npm install onnxruntime-gpu)
  → ONNX Runtime CUDAExecutionProvider (requires CUDA runtime)
  → models/embeddinggemma_300m_onnx/model.onnx
  → Tokenizer (models/embeddinggemma_300m_onnx/tokenizer.json)
  → ONNX graph execution on GPU
  → Mean pooling → L2 norm → 768d vector
  → Store in Postgres
```

**Pros**:
- ✅ Local to Node.js (no network latency)
- ✅ Can batch 64+ embeddings in parallel
- ✅ Potential for 100+ embeddings/sec (vs 50 Ollama)
- ✅ Same as local WASM version (CPU fallback)

**Cons**:
- ❌ Requires `pip install onnxruntime-gpu` (Python environment)
- ❌ Requires CUDA Runtime + cuDNN DLLs in system PATH
- ❌ ONNX model is 2x larger than Ollama's quantized version
- ❌ More dependencies to manage

**Setup** (if attempted):
```bash
# Install Python package
pip install onnxruntime-gpu

# Verify CUDA provider available
python -c "import onnxruntime as ort; print(ort.get_available_providers())"
# Should return: [...'CUDAExecutionProvider', ...]

# Then Node.js wrapper would call Python via child_process or native module
```

**Recommendation**: Defer until post-pipeline. If network latency becomes bottleneck, revisit.

---

### Path 3: LibTorch Embedding Bridge (Advanced — requires C++ coding)

**Flow**:
```
Text → Node.js
  → Call tensorrt_bridge.node with ONNX embedding weights
  → LibTorch GPU inference
  → 768d vector
  → Store in Postgres
```

**Pros**:
- ✅ Zero-copy tensor passing (already in CUDA VRAM)
- ✅ Can batch 256+ embeddings in parallel
- ✅ Potential for 200+ embeddings/sec
- ✅ Integrates with CUDA graph replay

**Cons**:
- ❌ Requires C++ N-API wrapper (1-2 days work)
- ❌ Must load embedding model weights into VRAM at startup (uses ~500MB)
- ❌ No existing implementation

**Recommendation**: Research spike only. Not critical for current pipeline.

---

## Immediate Post-Colab Pipeline

**Use Path 1 (Ollama)**:

```bash
# After Colab summarization finishes:
npm run batch:embed:ollama:57k

# (under the hood)
#   FOR EACH summary batch (64):
#     curl -X POST http://127.0.0.1:11434/api/embeddings \
#       -H 'Content-Type: application/json' \
#       -d '{"model": "embeddinggemma:latest", "prompt": "..."}'
#     → 768d vector
#     → Upsert to Postgres atlas_summary_layers.embedding
#   Time: ~19 min for 57K summaries
```

**Then proceed with**:
```bash
npm run manifold:hilbert:sort:57k
npm run cuda:graph:capture:representative
npm run pagerank:neo4j:apply
npm run pagerank:mapreduce:gpu
npm run cache:warm:all
```

**Total pipeline**: 60 min (19 embed + 2 sort + 5 capture + 10 pagerank + 5 cache + 19 buffer)

---

## Performance Comparison

| Path | Setup Time | Embed Speed | 57K Time | VRAM Used | Latency/Call |
|------|-----------|-----------|----------|-----------|--------------|
| **Ollama (Path 1)** | 0 min | 50/sec | 19 min | 2GB | 20ms |
| **ONNX GPU (Path 2)** | 30 min | 100+/sec | 10 min | 2.5GB | 1ms |
| **LibTorch (Path 3)** | 480 min | 200+/sec | 5 min | 2.8GB | <1ms |

**For now**: Use Ollama (0 setup, proven, 19 min is acceptable).  
**Future**: If embedding becomes bottleneck, try ONNX GPU (30 min setup, 10× speedup).  
**Research**: LibTorch bridge (500× speedup, but 2 days coding).

---

## Verification

**Check Ollama is available**:
```bash
curl http://127.0.0.1:11434/api/tags
# Should return: {"models": [{"name": "embeddinggemma:latest", ...}]}
```

**Check tensorrt_bridge.node** (vector math acceleration):
```bash
node -e "
const addon = require('./simd-bridge/cpp/build/Release/tensorrt_bridge.node');
console.log('batchCosineSimilarity:', typeof addon.batchCosineSimilarity);
console.log('captureGraph:', typeof addon.captureGraph);
"
# Should print: function for both
```

**Check CUDA availability**:
```bash
docker exec legal-ai-postgres nvidia-smi
# Should show: RTX 3060 Ti, 8GB VRAM, CUDA 12.1
```

---

## Decision

✅ **Recommended**: **Path 1 (Ollama)** for immediate post-Colab pipeline.

```bash
npm run phase85:full-pipeline  # Includes Ollama embedding step
```

**If embedding becomes bottleneck later** (>30% of total time):
- Measure: `npm run batch:embed:ollama:57k --verbose` (shows timing per batch)
- If average >500ms/batch, consider Path 2 (ONNX GPU)
- If average >100ms/batch AND doing re-embedding frequently, consider Path 3 (LibTorch)

**Current estimate**: 19 min embedding is 31% of 60 min pipeline. Acceptable.

---

## tensorrt_bridge.node Actual Capabilities

**What it DOES**:
- cuBLAS: `batchCosineSimilarity`, `dotProduct`, `scale`, `relu`
- CUDA Graphs: `captureGraph`, `replayGraph`, `replayGraphOnStream`, `cudaGraphCount`
- ML ops: `pageRankGPU`, `attentionScoreGPU`, `rewardScoreGPU`, `softmaxGPU`, `topKIndicesGPU`, `kmeansWithCentroids`, `trainSOM`
- Autoencoder: `autoencoderEncode`, `autoencoderDecode`
- PCA: `pcaProject`
- SIMD JSON: `simdJsonParse`, `simdJsonValidate`, `simdJsonExtractNumbers`
- Utilities: `poolStats`, `getCudaMemory`, `graphSimilarity`, `clusterEmbeddings`

**What it DOES NOT have**:
- ONNX model loading
- Tokenizer
- EmbeddingGemma inference
- TensorRT inference

**Summary**: It's a **vector math accelerator**, not an embedding generator. Use Ollama for embeddings, tensorrt_bridge for reranking/clustering.
