# Triton Inference + VLM + Full Pipeline Roadmap

## Date: March 15, 2026
## Status: SUPERSEDED — Docker image deleted, compose archived, engines never built (Apr 7 re-audit). Archive candidate.
## Hardware: RTX 3060 Ti (8GB VRAM, SM 86, Ampere)

---

## Docker Image Status (Re-audit Apr 7, 2026)

| Image | Size | Status |
|-------|------|--------|
| `legal-ai-tensorrt-llm:latest` | 83 GB | **PRUNED** — was deleted during `docker image prune`; rebuild from `Dockerfile.trtllm` |
| `legal-ai-trt-llm:custom-gemma` | DELETED | Duplicate, transformers too old |
| `legal-ai:phase14` | DELETED | Exact duplicate |
| `deeds-web-app-frontend:latest` | DELETED | Misnamed duplicate |
| `nvcr.io/nvidia/tensorrt-llm/release:latest` | DELETED | Base only, re-pullable |

**Apr 7 Reality**: All TRT images pruned. `docker-compose.triton.yml` archived. TRT engines **never built**. SvelteKit routes (`/api/ai/tensorrt/*`) always fall through to Ollama.

---

## What's Needed to Make ONNX Inference Work

### Prerequisites (must complete first)
1. **Run Colab notebook** (`Gemma3_12B_INT4_Quantize_and_Export.ipynb`) on A100 — exports:
   - `siglip_vision.onnx` (~1.5 GB) — SigLIP vision encoder
   - `gemma_projector.onnx` (~50 MB) — VLM projection layers
   - `text_only_model/` (~21 GB) — extracted text decoder (for TRT-LLM conversion)
2. **Download artifacts** to `trt_artifacts/` (~22 GB from Google Drive)

### Option A: ONNX Runtime GPU (simpler, no TRT engine build)
| Requirement | How | Status |
|-------------|-----|--------|
| `onnxruntime-gpu` | `pip install onnxruntime-gpu` or use `onnxruntime-node` | NOT INSTALLED locally |
| CUDA 12.x runtime | Already installed (CUDA 13.0 toolkit on system) | READY |
| SigLIP ONNX model | From Colab notebook step above | NOT EXPORTED |
| Projector ONNX model | From Colab notebook step above | NOT EXPORTED |
| Text decoder | NOT available as ONNX — too large for ONNX, needs TRT-LLM | N/A |

**ONNX gives you**: Vision encoder + projector inference (image → visual tokens). Text generation still goes through Ollama.

### Option B: TRT Engine Build (full pipeline, faster inference)
| Requirement | How | Status |
|-------------|-----|--------|
| Docker image | Rebuild: `docker build -f Dockerfile.trtllm -t legal-ai-trtllm:latest .` | NEEDS REBUILD (~83 GB) |
| INT4 checkpoint | `convert_checkpoint.py --use-weight-only-with-precision int4` inside container | NOT CONVERTED |
| TRT text engine | `trtllm-build` inside container → `rank0.engine` (~6.5 GB) | NOT BUILT |
| SigLIP TRT engine | `trtexec --onnx=siglip_vision.onnx` → `siglip_vision.engine` (~1.5 GB) | NOT BUILT |
| Projector TRT engine | `trtexec --onnx=gemma_projector.onnx` → `gemma_projector.engine` (~50 MB) | NOT BUILT |
| Triton configs | Restore from `deeds_labs/legacy-projects/triton_models/` | ARCHIVED |
| Triton compose | Restore from `deeds_labs/` or recreate | ARCHIVED |

**TRT gives you**: Full VLM inference (vision + text) at ~100ms/token on RTX 3060 Ti.

### Current Fallback (what runs today)
| Component | Service | Status |
|-----------|---------|--------|
| Text LLM | Ollama `gemma4:e4b-it-q4_K_M` | RUNNING |
| VLM (image analysis) | Ollama `gemma4:e4b-it-q4_K_M` multimodal | RUNNING |
| Embeddings | Ollama `embeddinggemma:latest` | RUNNING |
| inference-router.ts | tryTensorRT() fails → tryOllama() succeeds | WORKING |

---

## Phase 1: Gemma 3 TRT-LLM INT4 Engine (Triton Inference)

### Critical: SM 86 Compatibility
- **INT4 AWQ weight-only**: SUPPORTED on SM 86 (RTX 3060 Ti Ampere)
- **INT4 AWQ + FP8 activations**: NOT supported (needs SM >= 89, Ada/Hopper)
- **Use `--use-weight-only-with-precision int4`** (not `int4_awq` which implies FP8)

### Step 1a: Run Colab Notebook (~20 min, A100)
**Notebook**: `scripts/unsloth-training/Gemma3_12B_INT4_Quantize_and_Export.ipynb`

What it does:
1. Loads merged VLM from Google Drive (22.7GB FP16)
2. Extracts text decoder (`Gemma3ForCausalLM`) via safetensors key remapping
3. Exports SigLIP vision encoder → ONNX (~1.5GB)
4. Exports multi-modal projector → ONNX (~50MB)
5. Saves all to Drive

**Outputs**:
```
gemma3-12b-legal-trt-artifacts/
├── text_only_model/     (~21 GB) — extracted text decoder
├── onnx/
│   ├── siglip_vision.onnx    (~1.5 GB)
│   └── gemma_projector.onnx  (~50 MB)
└── export_manifest.json
```

### Step 1b: Download Artifacts (~22 GB from Drive)
```
To: c:\Users\james\Videos\deeds-web-app\trt_artifacts\
```

### Step 1c: Build INT4 Engine in Docker (~30 min, local GPU)
```bash
docker run --gpus all -it \
  -v ./trt_artifacts/text_only_model:/models/text_only:ro \
  -v ./trt_artifacts/onnx:/models/onnx:ro \
  -v ./engines:/models/engines \
  legal-ai-tensorrt-llm:latest bash

# Convert to INT4 checkpoint (weight-only, SM 86 compatible)
python3 examples/gemma/convert_checkpoint.py \
  --ckpt-type hf \
  --model-dir /models/text_only \
  --use-weight-only-with-precision int4 \
  --dtype bfloat16 \
  --world-size 1 \
  --output-model-dir /models/int4_checkpoint

# Build engine for RTX 3060 Ti
trtllm-build \
  --checkpoint_dir /models/int4_checkpoint \
  --gemm_plugin auto \
  --gpt_attention_plugin auto \
  --max_batch_size 4 \
  --max_input_len 2048 \
  --max_seq_len 4096 \
  --output_dir /models/engines/gemma3_12b_int4
```

### Step 1d: Build Vision Engines (~10 min)
```bash
# SigLIP vision encoder (FP16)
trtexec --onnx=/models/onnx/siglip_vision.onnx \
  --saveEngine=/models/engines/siglip_vision.engine \
  --fp16 \
  --optShapes=pixel_values:1x3x384x384 \
  --maxShapes=pixel_values:4x3x384x384

# Projector (FP16)
trtexec --onnx=/models/onnx/gemma_projector.onnx \
  --saveEngine=/models/engines/gemma_projector.engine \
  --fp16
```

### Step 1e: Triton Deployment
```bash
# Restore archived Triton configs
cp -r deeds_labs/legacy-projects/triton_models/ triton_models/

# Start Triton
docker compose -f docker-compose.triton.yml up triton-legal-ai -d
curl http://localhost:8099/v2/health/ready
```

### VRAM Budget (Text-only mode = 95% of queries)
| Component | VRAM |
|-----------|------|
| Gemma3 12B INT4 engine | ~3,500 MB |
| KV cache (4096 tokens) | ~500 MB |
| CUDA runtime | ~300 MB |
| **Total** | **~4,300 MB / 8,192 MB** |

### VRAM Budget (VLM mode = 5% of queries, time-shared)
| Step | VRAM Delta |
|------|------------|
| 1. Load SigLIP | +1,500 MB |
| 2. Process image → features | (reuses SigLIP) |
| 3. Unload SigLIP | -1,500 MB |
| 4. Project → text tokens | +50 MB |
| 5. Generate with text engine | (existing engine) |

### SvelteKit Routes (Already Wired)
| Route | Purpose |
|-------|---------|
| `/api/ai/tensorrt` | Text inference (lease → infer → release) |
| `/api/ai/tensorrt/stream` | SSE streaming |
| `/api/ai/tensorrt/vlm` | VLM (load vision → ensemble → unload) |

### Inference Router Priority
```
inference-router.ts: tryTensorRT() → tryLiteLLM() → tryOllama()
gpu-arbiter.ts: VRAM mutex (Ollama ↔ TRT-LLM ↔ LibTorch)
```

---

## Phase 2: VLM PyTorch Pipeline (Evidence + POI Photos)

### Current State
- POI Photos VLM: 7-step pipeline EXISTS (Sharp → Gemma3 VLM → OCR → Embedding → Qdrant)
- Falls back to Ollama when Triton unavailable
- With Phase 1 engines: SigLIP + Projector + Gemma3 INT4 = native VLM in ~4.3GB VRAM

### PyTorch Optimizations for GPU
```python
# torch.compile (PyTorch 2.7 in the container)
model = torch.compile(model, mode="reduce-overhead")

# CUDA Graphs for repeated inference shapes
torch.cuda.make_graphed_callables(model, sample_inputs)

# Flash Attention (built into NVIDIA container)
# Automatic via TRT-LLM gpt_attention_plugin
```

### VLM Evidence Analysis Pipeline
```
Evidence Upload (MinIO)
  ↓
Stage 1: pdf-parse → text extraction
Stage 2: Tesseract OCR fallback
Stage 3: Legal chunking (ARTICLE/SECTION/§)
Stage 4: Embedding (gRPC → embeddinggemma)
Stage 5: Dual storage (pgvector + Qdrant)
Stage 6: Entity extraction (EMAIL, PHONE, DATE, STATUTE)
Stage 7: Forensic detection (SSN, CC, PII)
Stage 8: Summarization (Ollama gemma3-legal)
Stage 9: GPU Background Analysis (LibTorch CUDA)
  ↓ NEW
Stage 10: VLM Document Analysis (Triton SigLIP → Projector → Gemma3)
  - Image-based evidence → visual understanding
  - Handwritten notes, photos, diagrams
  - Cross-reference visual + text entities
```

---

## Phase 3: Docling 258M → LangExtract Enhancement

### Current State
- `phase66-langextract` container running at port 8095 (1GB RAM, Go service)
- Uses basic text extraction
- `granite-docling-258M/` model directory EXISTS locally

### Upgrade Path
IBM Granite-Docling-258M is a 258M parameter VLM that:
- Converts PDFs/scans → structured DocTags markup
- Preserves tables, equations, layouts, footnotes
- Runs on CPU (258M is tiny) or GPU for speed
- Apache 2.0 license

### Integration
```
Evidence PDF Upload
  ↓
LangExtract (Go SIMD, port 8095)
  ├── Current: basic text extraction
  └── Enhanced: Docling 258M structured extraction
       ├── Tables → structured JSON
       ├── Legal clauses → tagged sections
       ├── Signatures/stamps → flagged regions
       └── DocTags markup → legal-chunker.ts input
```

### Implementation
1. Add Python sidecar to langextract container (or separate container)
2. `pip install docling-core transformers` (~500MB)
3. Load `granite-docling-258M` from local directory
4. Wire to evidence upload pipeline Stage 2 (before chunking)
5. Output DocTags → feed into `legal-chunker.ts` for structure-aware chunking

---

## Phase 4: Redis + Qdrant Tagging & Retrieval

### Current Infrastructure
| Service | Port | Purpose |
|---------|------|---------|
| Redis Stack | 6379 | LLM semantic cache (LiteLLM), session cache, KV store |
| Qdrant | 6333 | 8 vector collections (768-dim, INT8 quantized) |

### Enhancements
1. **Redis Tag Cache**: Cache frequently-accessed tags with TTL
   - `tag:{entity_type}:{value}` → tag metadata + linked documents
   - Invalidate via RabbitMQ `cache.invalidate` queue

2. **Qdrant BM42 Hybrid Search** (Qdrant 1.10+)
   - Replace current RRF fusion with attention-weighted BM42
   - Better for short legal text passages
   - Combine with existing cosine similarity

3. **Auto-Tagging Pipeline**
   ```
   New Document → Embedding → Qdrant nearest neighbors
     ├── Top-K similar docs → inherit their tags (confidence-weighted)
     ├── Entity extraction → auto-tag (STATUTE, CASE_NUMBER, JURISDICTION)
     └── LLM classification → category tags (contract, tort, criminal, etc.)
   ```

---

## Phase 5: pgvector Mirroring + PostgreSQL Optimization

### Current State
- 11 embedding tables now `vector(768)` with HNSW indexes (done this session)
- `embedding_cache` + `vector_outbox` remain TEXT (intentional)
- halfvec index SQL exists: `drizzle/manual/20260314_halfvec_indexes.sql`

### Remaining Tasks
1. **Run halfvec indexes** (50% memory savings on HNSW)
   ```sql
   -- Already written, just needs execution
   CREATE INDEX CONCURRENTLY idx_*_halfvec_hnsw
     ON table USING hnsw ((embedding::halfvec(768)) halfvec_cosine_ops);
   ```

2. **pgvector ↔ Qdrant Mirror**
   - Write to both on insert (pgvector for joins, Qdrant for speed)
   - Qdrant = primary search, pgvector = backup + SQL joins
   - Sync via RabbitMQ `vector.index` queue

3. **pgai In-Database AI**
   - `litellm_embed()` for in-DB embedding generation
   - `litellm_generate()` for in-DB LLM calls (trigger-based)
   - Vectorizer auto-embeds on INSERT

---

## Phase 6: Knowledge Base Search + Indexing

### Current Components
| Component | Status | Purpose |
|-----------|--------|---------|
| `/api/knowledge/search` | ACTIVE | Knowledge base query |
| `/api/knowledge/stream` | ACTIVE | SSE streaming results |
| `/api/rag/search` | ACTIVE | RAG vector search |
| `/api/rag/answer` | ACTIVE | RAG answer generation |
| `/api/codebase-index/` | ACTIVE | Codebase search + clusters |
| Fuse.js | ACTIVE | Client-side fuzzy recall |
| Qdrant dual-vector | ACTIVE | Content + signature search |

### Minification + Optimization
1. **Query Expansion** (EXISTS — `query-expansion.ts`)
   - Legal synonyms + bigram HMM expansion
   - Feeds expanded query to both Qdrant + pgvector

2. **Corrective RAG** (NEW)
   ```
   Query → Retrieve Top-K → LLM Judge Score
     ├── Score > 0.8: Accept results
     ├── Score 0.5-0.8: Reformulate + retry
     └── Score < 0.5: Broaden search (remove filters)
   ```

3. **Cosine Similarity Search** (ACTIVE)
   - Qdrant: HNSW approximate nearest neighbor
   - pgvector: HNSW exact (with halfvec for 2x speed)
   - Client GPU: WebGPU reranker (`gpu-search-reranker.ts`)

---

## Phase 7: Graph Analysis (Neo4j + CouchDB)

### Neo4j (Graph Relationships)
| Feature | Status |
|---------|--------|
| Cases → Evidence → Statutes edges | ACTIVE |
| pg-neo4j-sync.ts | ACTIVE |
| Graph centrality computation | ACTIVE |
| SIMILAR_TO edges | ACTIVE |

**New**: GPU-accelerated graph analysis via LibTorch
```
Neo4j graph export → adjacency matrix
  ↓
LibTorch CUDA (libtorch-bridge.ts)
  ├── graphSimilarity() — matrix multiplication
  ├── clusterEmbeddings() — k-means on GPU
  └── computeCaseEmbedding() — weighted aggregation
  ↓
Results → Neo4j (new edges) + PostgreSQL (scores)
```

### CouchDB (Tag Catalog + MapReduce)
| Feature | Status |
|---------|--------|
| Tag storage | ACTIVE (port 5984) |
| Document tagging | ACTIVE |

**MapReduce Views** for tag analytics:
```javascript
// Map: emit tag → document count
function(doc) {
  if (doc.tags) {
    doc.tags.forEach(function(tag) {
      emit(tag, 1);
    });
  }
}
// Reduce: _count → tag frequency distribution
```

Use cases:
- Tag co-occurrence matrix → recommendation engine
- Jurisdiction-tag distribution → case routing
- Time-series tag trends → emerging legal patterns

---

## Phase 8: RabbitMQ Concurrent Parallelism

### Current Queues (7, all have consumers)
| Queue | Purpose | Parallelism |
|-------|---------|-------------|
| `cache.invalidate` | Multi-tier cache bust | prefetch(10) |
| `document.embed` | Batch embedding | prefetch(10) |
| `evidence.process` | Upload pipeline | prefetch(10) |
| `vector.index` | Qdrant + pgvector sync | prefetch(10) |
| `chat.context` | Chat context assembly | prefetch(10) |
| `analytics.track` | Event batching | prefetch(10) |
| `codebase.index` | Code search indexing | prefetch(10) |

### New Queues for Pipeline
| Queue | Purpose |
|-------|---------|
| `vlm.analyze` | VLM evidence analysis (Triton/Ollama) |
| `docling.extract` | Docling structured extraction |
| `graph.sync` | Neo4j graph updates (post-embed) |
| `tag.auto` | Auto-tagging pipeline |

### Parallelism Pattern
```
Evidence Upload
  ↓ (synchronous: MinIO + PostgreSQL record)
  ↓
RabbitMQ fan-out exchange
  ├── evidence.process → text extraction + chunking
  ├── vlm.analyze → visual understanding (if image/scan)
  ├── docling.extract → structured extraction (if PDF)
  └── (after embedding completes)
       ├── vector.index → Qdrant + pgvector dual write
       ├── graph.sync → Neo4j entity relationships
       ├── tag.auto → auto-classification + tagging
       └── cache.invalidate → bust related caches
```

---

## Phase 9: Search + Text Processing

### ripgrep (Codebase Search)
- Already wired via `/api/codebase-index/` endpoints
- `codebase_chunks_768` Qdrant collection for semantic search
- Fuse.js fuzzy recall → Qdrant rerank

### AWK-like Processing (Server-Side)
- `legal-chunker.ts` — structure-aware chunking (ARTICLE/SECTION/§)
- `entity-extraction.ts` — regex + LLM entity extraction
- `forensics.ts` — PII pattern detection (SSN, CC, legal keywords)
- These are the "awk" equivalent — pattern matching on legal text

---

## Execution Timeline

| Phase | Time | Dependencies |
|-------|------|-------------|
| 1a: Run Colab notebook | 20 min | Google Colab A100 |
| 1b: Download artifacts | 20 min | Google Drive |
| 1c: Build INT4 engine | 30 min | local Docker + GPU |
| 1d: Build vision engines | 10 min | local Docker + GPU |
| 1e: Triton deployment | 5 min | engines ready |
| 2: VLM pipeline wiring | 2 hrs | Phase 1 complete |
| 3: Docling integration | 2 hrs | granite-docling-258M model |
| 4: Redis/Qdrant tagging | 3 hrs | — |
| 5: pgvector halfvec + mirror | 1 hr | — |
| 6: Knowledge search optimize | 2 hrs | — |
| 7: Graph analysis | 3 hrs | Neo4j + LibTorch |
| 8: RabbitMQ new queues | 2 hrs | — |
| 9: Search/text processing | 1 hr | — |
| **Total** | **~18 hrs** | |

---

## Sources
- [TRT-LLM Release Notes](https://nvidia.github.io/TensorRT-LLM/release-notes.html)
- [TRT-LLM Gemma Examples](https://github.com/NVIDIA/TensorRT-LLM/tree/main/examples/models/core/gemma)
- [TRT-LLM Support Matrix](https://nvidia.github.io/TensorRT-LLM/reference/support-matrix.html)
- [NVIDIA TRT-LLM Gemma Blog](https://developer.nvidia.com/blog/nvidia-tensorrt-llm-revs-up-inference-for-google-gemma/)
- [Triton + vLLM Multimodal](https://docs.nvidia.com/deeplearning/triton-inference-server/user-guide/docs/backend_guide/vllm.html)
- [Triton GenAI-Perf Multi-Modal](https://docs.nvidia.com/deeplearning/triton-inference-server/user-guide/docs/perf_analyzer/genai-perf/docs/multi_modal.html)
- [Serve Gemma on GKE with Triton](https://docs.cloud.google.com/kubernetes-engine/docs/tutorials/serve-gemma-gpu-tensortllm)
- [IBM Granite-Docling-258M](https://huggingface.co/ibm-granite/granite-docling-258M)
- [Granite-Docling Announcement](https://www.ibm.com/new/announcements/granite-docling-end-to-end-document-conversion)
- [RTX 3060 Ti for LLMs](https://www.techreviewer.com/tech-specs/nvidia-rtx-3060-ti-gpu-for-llms/)
- [TRT-LLM GeForce Support](https://github.com/NVIDIA/TensorRT-LLM/issues/146)