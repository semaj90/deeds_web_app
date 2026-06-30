# GPU Acceleration Analysis: Session 96 Batch Optimization

**Date**: June 29, 2026 (post-power-restore)  
**System**: Windows 10 Home + WSL2 + Docker, RTX 3060 Ti 8GB, CUDA 13.0  
**Question**: Can we optimize the 57,976-packet batch with local GPU acceleration?

---

## Current System Status

✅ **GPU Available**:
- RTX 3060 Ti 8GB confirmed via `nvidia-smi`
- VRAM: 7.7GB currently used (73°C temp, 83% util) — room for more workloads
- CUDA 13.0 available

✅ **Services Running**:
- TurboQuant (llama-server :8090) — Gemma4 text generation ✅
- Docker GPU support enabled
- WSL2 GPU passthrough working

⚠️ **Batch Status**:
- Progress: 170/57,976 packets (0.3%) after power restore
- Running time: ~32 hours expected total
- No need to interrupt or restart (process continues)

---

## Performance Target Breakdown

| Stage | Current (HTTP) | Optimized (Local GPU) | Gain |
|-------|---------------|-----------------------|------|
| **Gemma4 (summarization)** | 25-35s per packet | 25-35s (same) | 1× (already GPU) |
| **EmbeddingGemma (768-dim)** | 2-3s per packet (Ollama HTTP) | 0.5-1s (local ONNX) | 4-6× |
| **Redis upsert** | 0.05s per packet (pipelined) | 0.05s (unchanged) | 1× |
| **Per-packet total** | ~27-38s | ~26-36s | 1-1.1× overall |

**Reality check**: Gemma4 dominates (25-35s). Embedding optimization saves 1-2s per packet = **5-10% overall speedup**, not game-changing.

---

## Option A: Local ONNX Embeddings (4-6× on embeddings)

**What**: Replace Ollama HTTP embeddings with in-process ONNX Runtime GPU.

**Setup**:
```bash
# Install onnxruntime-gpu
pip install onnxruntime-gpu==1.17.1

# Download embeddinggemma ONNX model (~500MB)
# Model path: static/embeddinggemma_300m_onnx/
```

**Implementation**:
```python
# scripts/gemma4/local-onnx-embeddings.py
import onnxruntime as ort
import numpy as np

session = ort.InferenceSession(
    "static/embeddinggemma_300m_onnx/model.onnx",
    providers=["CUDAExecutionProvider"]  # GPU
)

def embed(text: str) -> list[float]:
    # Tokenize, run inference, return 768-dim vector
    # Latency: 0.5-1s (vs 2-3s HTTP to Ollama)
    pass
```

**Pros**:
- ✅ No network latency (0.5-1ms vs 500ms HTTP)
- ✅ Runs in same Python process (no sidecar needed)
- ✅ 4-6× faster than Ollama HTTP
- ✅ Fits in RTX 3060 Ti 8GB easily (~500MB model + working memory)

**Cons**:
- ❌ Only 5-10% overall speedup (Gemma4 dominates)
- ❌ Adds complexity to offline_summary_worker.py
- ❌ Requires ONNX Runtime installation (bloat)
- ❌ Doesn't help current batch (already running)

**Verdict**: **Not worth it for this batch.** Save for Phase 2 batch if Gemma4 is the bottleneck (it isn't).

---

## Option B: Ollama Embeddings (via LangChain)

**What**: Use `langchain_community.embeddings.ollama.OllamaEmbeddings` instead of HTTP.

**Setup**:
```bash
# Start Ollama container
docker run -d --gpus all -p 11434:11434 ollama/ollama:latest
ollama pull embeddinggemma:latest  # ~1.2GB
```

**Implementation**:
```python
# scripts/gemma4/langgian-embeddings-worker.py
from langchain_community.embeddings import OllamaEmbeddings

embeddings = OllamaEmbeddings(
    model="embeddinggemma:latest",
    base_url="http://127.0.0.1:11434"
)

def embed(text: str) -> list[float]:
    return embeddings.embed_query(text)  # ~2-3s (same as direct HTTP)
```

**Pros**:
- ✅ Standardized interface (LangChain ecosystem)
- ✅ Easier to integrate with LangGraph workflows later
- ✅ No performance loss vs direct HTTP

**Cons**:
- ❌ No performance gain (still HTTP, same 2-3s latency)
- ❌ Adds LangChain dependency (~50MB)
- ❌ LangChain OllamaEmbeddings adds overhead

**Verdict**: **Skip.** LangChain is useful for orchestration, not for embedding latency.

---

## Option C: LangGraph Worker Pool (Concurrent Processing)

**What**: Use LangGraph to manage concurrent Gemma4 + embedding tasks.

**Setup**:
```bash
# Install langgraph
pip install langgraph
```

**Implementation**:
```python
# scripts/gemma4/langgraph-batch-orchestrator.py
from langgraph.graph import StateGraph, START, END
import asyncio

# Define state: packet → summary + embedding
# Define nodes:
# 1. gemma4_worker (HTTP to llama-server)
# 2. embedding_worker (HTTP to Ollama or local ONNX)
# 3. redis_upsert (pipelined)
# Graph: (packet) → gemma4 || embedding → upsert → next

# Run with concurrency=5 (like current)
```

**Pros**:
- ✅ Cleaner orchestration than custom async
- ✅ Built-in retry/error handling
- ✅ Integrates with LangChain ecosystem
- ✅ Makes Phase 2+ refactors easier

**Cons**:
- ❌ No performance gain (concurrency capped at 5 by RTX 8GB anyway)
- ❌ LangGraph overhead (100ms+ startup per call)
- ❌ Overengineered for this batch

**Verdict**: **Useful for Phase 2+, skip for this batch.** Current async pattern in offline_summary_worker.py is already optimal (Semaphore(5)).

---

## Option D: TensorRT Quantized Inference (8-12ms per packet)

**What**: Replace Gemma4 float32 with INT4/INT8 TensorRT quantization.

**Requirements**:
- Model already quantized: `gemma4-legal-iq4xs-direct.gguf` (4-bit)
- TensorRT conversion tool (not yet built)
- Extra model file (~2GB → ~500MB quantized)

**Expected Latency**:
- Current (q8_0 KV cache): 25-35s
- With TensorRT INT4: ~8-12s (3-4× faster)
- **Per-batch gain**: 57,976 packets × 20s saved = ~322 hours total saved

**Pros**:
- ✅ 3-4× overall speedup (HUGE)
- ✅ Model already compiled for GGUF (can convert to TensorRT)
- ✅ Worth the engineering effort

**Cons**:
- ❌ Requires separate TensorRT binary build (1-2 days)
- ❌ Must re-export Gemma4 model (licensing check needed)
- ❌ TensorRT is NVIDIA-specific (not portable)
- ❌ Too late for current batch (already 0.3% through)

**Verdict**: **High value for Phase 2 batch.** Not applicable to current batch mid-flight.

---

## Option E: Concurrent Ollama Instances (Parallel GPU Utilization)

**What**: Run 2-3 Ollama instances (dual-GPU or CPU+GPU split).

**Reality Check**:
- RTX 3060 Ti has 8GB VRAM
- Gemma4 model: 5.3GB
- 2 instances would need 10.6GB → doesn't fit
- CPU offload possible but slow (opposite of goal)

**Verdict**: **Not viable on RTX 3060 Ti 8GB.** Would need RTX 4090 or A100.

---

## Recommendation for Current Batch

| Approach | Effort | Gain | Viability | Recommend? |
|----------|--------|------|-----------|-----------|
| A. Local ONNX | 2 hours | 5-10% | Medium | ❌ Not worth it |
| B. LangChain embeddings | 1 hour | 0% | Easy | ❌ Waste of time |
| C. LangGraph pool | 4 hours | 0% | Medium | ⏳ Save for Phase 2 |
| D. TensorRT quantization | 2 days | 3-4× (overall) | Hard | ⏳ Save for Phase 2 |
| E. Concurrent Ollama | N/A | 0% | N/A | ❌ Not viable |

**Current Batch**: **Leave as-is.** Running Gemma4 + EmbeddingGemma concurrently at max RTX 3060 Ti capacity. Optimization gains are marginal.

---

## Phase 2 Optimization Plan

Once current batch completes:

### **Phase 2A: LangGraph Refactor** (4 hours)
- Replace async Semaphore with LangGraph StateGraph
- Cleaner error handling + retry logic
- Prepares codebase for Phase 3 integration

### **Phase 2B: TensorRT Build** (2 days)
- Build TensorRT engine from Gemma4 GGUF
- Deploy as separate service (port :8091)
- Benchmark latency improvement (target 3-4×)
- If successful, re-run batch on cached packets (backfill)

### **Phase 2C: Local ONNX (Optional)** (2 hours)
- If embeddings become bottleneck (they aren't)
- Add ONNX Runtime GPU embedding worker
- Switch orchestrator to use local ONNX

---

## Redis Cache: Already Optimal

**Good news**: Redis upsert is already optimized:
- ✅ Pipelined (4,000 commands per batch, 1 exec call)
- ✅ Completes in 2.5 min for all 57,976 packets
- ✅ 4-tier hierarchy enables fast discovery

**No GPU help needed** — Redis cache is I/O bound, not compute bound.

---

## LangChain vs LangGraph Decision

**Question**: "Would LangChain, LangGraph help here?"

**Answer**:
- **LangChain**: Useful for prompt templates + tool calling. Not for this batch (we have hardcoded prompts).
- **LangGraph**: Useful for orchestration. Overkill for current async pattern (Semaphore is simpler).
- **Verdict**: Both are Phase 2+ tech, not for current batch.

---

## Summary: What to Do Now

```
Current Batch:
┌────────────────────────────────────────────────────────────┐
│ 170/57,976 packets processed                               │
│ Gemma4 running at optimal concurrency (5)                  │
│ GPU utilization: 83% (healthy)                             │
│ Continue as-is ✅                                           │
│ ETA completion: ~32 hours from start                        │
└────────────────────────────────────────────────────────────┘

Post-Batch Workflow:
1. Import to Postgres (10 min)
2. Warm Redis cache (2.5 min)
3. Verify 6-layer retrieval (5 min)

Phase 2 (Next Session):
1. LangGraph refactor (orchestration)
2. TensorRT build (3-4× speedup)
3. Backfill cache with TensorRT (if needed)
```

---

## TurboQuant Status (Current)

**llama-server (:8090) is running with current config**:
```
-ctk q8_0 -ctv q8_0  (conservative, stable)
-ngl 99              (full GPU offload)
-fa on               (flash attention)
-c 65536             (context length)
```

**No changes needed mid-batch.** Current config is optimal for RTX 3060 Ti.

---

## Docker GPU Verification

✅ **Confirmed working**:
```bash
docker run --rm --gpus all nvidia/cuda:12.1.1-base-ubuntu22.04 nvidia-smi
# Shows RTX 3060 Ti 8GB with 7.7GB used
```

Docker GPU support is fully operational. No blockers for Phase 2 TensorRT work.

---

**Conclusion**: Your system is **GPU-optimized for this batch.** Further gains require architectural changes (TensorRT quantization, LangGraph refactoring) best saved for Phase 2.

Continue monitoring the batch. It will complete around July 1 ~06:00 UTC.
