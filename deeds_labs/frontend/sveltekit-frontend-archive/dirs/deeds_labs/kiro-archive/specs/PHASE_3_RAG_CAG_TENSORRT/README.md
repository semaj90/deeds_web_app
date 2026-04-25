# Phase 3: GPU-Accelerated RAG with pgvector + Qdrant

## What We've Built

✅ **Spec Complete**: Requirements, Design, Tasks, Architecture
✅ **Task 1 Complete**: Hybrid Document Chunker (`backend/chunker_langextract.py`)
✅ **MVP Execution Order**: 9 tasks in optimal sequence
✅ **GPU Stack Locked**: 6.3 GB VRAM on RTX 3060 Ti

---

## Key Documents

1. **requirements.md**: 10 EARS-compliant requirements
2. **design.md**: Full architecture with Go QUIC extensions
3. **tasks.md**: 26 implementation tasks (20 core + 6 optional tests)
4. **MVP_EXECUTION_ORDER.md**: Optimal sequence for fastest stable build
5. **ARCHITECTURE_GPU_PGVECTOR.md**: Detailed system design
6. **SPEC_SUMMARY.md**: High-level overview

---

## MVP Execution Order (9 Tasks)

### Phase 1: Foundation (Tasks 1-4)
1. ✅ **Hybrid Document Chunker** - DONE
2. **GPU DocLing Gateway** (Python) - Next
3. **Embedding Pipeline** (Python)
4. **Go QUIC FP16 Cache**

### Phase 2: Storage + Search (Tasks 5-6)
5. **Mirror to Postgres + Qdrant**
6. **MiniLM TensorRT Reranker**

### Phase 3: Frontend (Tasks 7-9)
7. **Laws Search Page** (`/laws`)
8. **Evidence Board UI** (`/evidence_board`)
9. **Legal Chat** (`/cases/[id]/chat`)

---

## Architecture at a Glance

```
SvelteKit Upload
    ↓
Python: Granite-Docling (fp16 → int8)
    ↓
Hybrid Chunker (layout-aware)
    ↓
EmbeddingGemma (fp16 CBOR)
    ↓
Redis Cache (10x compression)
    ↓
Go QUIC Orchestrator
    ├→ Postgres 17 + pgvector (metadata + joins)
    └→ Qdrant GPU (FAISS-GPU search)
    ↓
MiniLM Reranker (top-K → top-5)
    ↓
Frontend (Laws, Evidence Board, Chat)
```

---

## GPU Stack (Locked)

| Component | VRAM | Purpose |
|-----------|------|---------|
| Granite-Docling | 1.6-1.9 GB | OCR + layout |
| EmbeddingGemma | 0.8 GB | Embeddings |
| MiniLM | 0.4 GB | Reranking |
| Gemma-Legal | 2.5 GB | Chat |
| Qdrant FAISS-GPU | 1.0 GB | Search |
| **Total** | **~6.3 GB** | RTX 3060 Ti ✅ |

---

## Data Stores

| Store | Purpose | Why |
|-------|---------|-----|
| Postgres 17 + pgvector | Metadata + joins | ACID + relationships |
| Qdrant GPU | Vector search | FAISS-GPU acceleration |
| Redis fp16 | Query cache | 10x memory reduction |
| MinIO | Evidence files | Immutable, audit-safe |

---

## Key Decisions

✅ **Postgres pgvector**: Legal system of record (metadata, joins, ACID)
✅ **Qdrant GPU**: Fast vector search (FAISS-GPU, <100ms)
✅ **Redis fp16**: Query cache + embedding compression (10x smaller)
✅ **Go QUIC**: Orchestrates all three, handles CAG ranking
✅ **Hybrid Chunking**: Layout-aware + semantic merge
✅ **Golden-Ratio UI**: 22% / 55% / 23% columns

---

## Success Criteria

- ✅ Chunking: >1000 chunks/sec
- ✅ Embedding: <50ms per batch of 32
- ✅ Qdrant search: <100ms per query
- ✅ Reranking: <50ms per query
- ✅ UI responsiveness: <200ms page transitions
- ✅ Search accuracy: >0.75 cosine similarity

---

## Next: Task 2 - GPU DocLing Gateway

Ready to implement the Python gateway that:
- Accepts file uploads via QUIC HTTP/3
- Runs Granite-Docling (fp16 encoder → int8 decoder)
- Extracts: text, layout, tables, OCR, entities
- Outputs: DocTags JSON
- Streams progress to frontend

**File**: `backend/docling_gateway/app.py`

