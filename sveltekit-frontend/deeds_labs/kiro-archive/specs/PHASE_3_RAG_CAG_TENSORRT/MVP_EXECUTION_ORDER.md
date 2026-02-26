# MVP Execution Order: GPU-Accelerated RAG with pgvector + Qdrant + Ollama

## Strategy
Build foundation once, add intelligence after. No rewrites.
Use Ollama now → Add TensorRT-LLM later when needed (prevents failures with TRT multimodal & Windows).

## Why This Order

| Order | Task | Component | Reason |
|-------|------|-----------|--------|
| 1 | Hybrid Document Chunker | Python | Every feature depends on chunk IDs |
| 2 | GPU DocLing Gateway | Python | Must extract layout + OCR first |
| 3 | Embedding Pipeline | Python | Required for Qdrant + RAG |
| 4 | Go QUIC FP16 Cache | Go | QUIC must stream chunks + vectors |
| 5 | Mirror to PG + Qdrant | Python | Storage & GPU search first |
| 6 | MiniLM Reranker (CPU) | Python | Top-K quality boost (TensorRT later) |
| 7 | Law Search API | Go/Python | First user-visible result |
| 8 | Law Search UI | SvelteKit | Golden-ratio layout + filters |
| 9 | Ollama Integration | SvelteKit | getOllamaEndpoint() for chat |
| 10 | Evidence Board UI | SvelteKit | Visualize documents |
| 11 | Legal Chat | SvelteKit | Streaming Gemma-Legal INT4 |

---

## Phase 1: Foundation (Tasks 1-4)

### Task 1: Hybrid Document Chunker ✅ DONE
**File**: `backend/chunker_langextract.py`
- Parse DocTags: text, tables, captions, footnotes
- Merge small blocks (<200 tokens)
- Split large blocks (>512 tokens) with overlap
- Preserve bounding boxes + page numbers
- Output: Chunk objects with IDs

**Why first**: All downstream tasks need chunk IDs

---

### Task 2: GPU DocLing Gateway (Python)
**File**: `backend/docling_gateway/app.py`
- Accept file uploads via QUIC HTTP/3
- Run Granite-Docling (fp16 encoder → int8 decoder)
- Extract: text, layout, tables, OCR, entities
- Output: DocTags JSON
- Stream progress to frontend

**Dependencies**: Task 1 (uses chunker)
**GPU**: Granite-Docling (258M params, ~1.6-1.9 GB VRAM)

---

### Task 3: Embedding Pipeline (Python)
**File**: `backend/embedding_workers/worker_pool.py`
- Load EmbeddingGemma (2B params, int8 quantized)
- Batch process chunks (32 per batch)
- Generate embeddings (768-dim)
- Convert float32 → fp16 (2 bytes per value)
- Serialize via CBOR (binary format)
- Output: fp16 embeddings ready for Redis

**Dependencies**: Task 1 (consumes chunks)
**GPU**: EmbeddingGemma (~0.8 GB VRAM)

---

### Task 4: Go QUIC FP16 Cache Layer
**File**: `backend/fp16_cache.go`
- Add to existing `legal-ai-quic-server.go`
- Implement `storeFP16()`: compress float32 → fp16
- Implement `loadFP16()`: decompress fp16 → float32
- Implement `CacheVector()`: store in Redis with TTL
- Implement `LoadVector()`: retrieve from Redis
- Add CBOR serialization for binary efficiency

**Dependencies**: Task 3 (receives fp16 embeddings)
**Purpose**: 10x memory reduction, fast query reuse

---

## Phase 2: Storage + Search (Tasks 5-6)

### Task 5: Mirror Embeddings to Postgres + Qdrant
**Files**:
- `backend/pg_qdrant_sync.go` (Go microservice)
- `backend/sync_worker.go` (background reconciliation)

**Postgres 17 + pgvector**:
- Dual-write: embeddings + metadata
- Store: chunk_id, embedding (768-dim), doc_id, page, bbox
- Joins: cases, statutes, charges, citations
- ACID transactions, audit trail

**Qdrant GPU Search**:
- Mirror embeddings from Postgres
- GPU-accelerated cosine similarity (FAISS-GPU)
- Top-K retrieval (<100ms)
- IVF clustering for scale

**Background Worker**:
- Periodic PG ↔ Qdrant reconciliation
- Handle failures, retries
- Eventual consistency

**Dependencies**: Task 4 (receives fp16 from Redis)
**Purpose**: Postgres = legal system of record, Qdrant = fast GPU search

---

### Task 6: MiniLM TensorRT Reranker
**File**: `backend/reranker_workers/reranker.py`
- Load MiniLM (22M params, int8 quantized)
- Rerank top-K results to top-5
- Compute relevance scores
- Return ranked results with confidence

**Dependencies**: Task 5 (reranks Qdrant results)
**GPU**: MiniLM (~0.4 GB VRAM)
**Latency**: <50ms per query

---

## Phase 3: Frontend (Tasks 7-9)

### Task 7: Laws Search Page (`/laws`)
**File**: `sveltekit-frontend/src/routes/laws/+page.svelte`
- Golden-ratio 3-column layout (22% / 55% / 23%)
- Search bar: query statutes by keyword, code, charge type
- Accordion filters: Jurisdiction, Offense type, Severity, Time window
- Filter chips: quick toggles
- Results: statute list with title, code, jurisdiction
- Detail panel: full statute text (serif font)
- Related cases: right column showing cases citing statute
- Actions: "Save Citation", "Send to Chat", "Add as Charge"

**API Endpoint**: `/api/laws/search` (queries Postgres pgvector)
**First user-visible result**: Shows system is working

---

### Task 8: Evidence Board UI (`/evidence_board`)
**File**: `sveltekit-frontend/src/routes/evidence_board/+page.svelte`
- Golden-ratio 3-column layout
- Evidence grid: manila folder/polaroid cards
- Status color strips: Unreviewed (grey), Flagged (amber), Important (crimson)
- Dotted connection lines: show relationships
- Hover effects: highlight related evidence
- Zoom controls: 100%, +, −, Reset View
- Library Drawer: list view for >20 items
- Right-click context menu: "Open in Panel", "Send to Chat", "Link to Statute"

**API Endpoint**: `/api/evidence/board` (queries Postgres)
**Visual payoff**: See documents organized

---

### Task 9: Legal Chat (`/cases/[id]/chat`)
**File**: `sveltekit-frontend/src/routes/cases/[id]/chat/+page.svelte`
- Chat interface: dark background, modern sans-serif
- Message labels: "Prosecutor", "Detective", "AI Legal Assistant"
- Disclaimer stripe: "Cannot determine guilt or innocence..."
- Text highlighting: mini-modal on selection
- Mini-modal actions: "Summarize & Save Citation", "Cancel"
- Streaming responses: real-time Gemma legal chat
- Citation linking: clickable statute/case references

**API Endpoint**: `/api/cases/{id}/chat` (streams Gemma-Legal INT4)
**Final UX layer**: Uses all above components

---

## Optional: Tests (After MVP)

- [ ]* Unit tests for chunker, embeddings, FP16 compression
- [ ]* Integration tests for end-to-end pipeline
- [ ]* Performance tests for throughput, latency, memory
- [ ]* Qdrant mirror consistency tests

---

## GPU Stack (Locked for MVP Stability)

| Component | Model | Format | VRAM | Purpose | Status |
|-----------|-------|--------|------|---------|--------|
| DocLing | Granite-Docling (258M) | fp16 → int8 | 1.6-1.9 GB | OCR + layout | ✅ |
| Embedding | EmbeddingGemma | fp16 | 0.8 GB | Vector generation | ✅ |
| Reranker | MiniLM | CPU (TensorRT later) | 0.4 GB | Top-K → Top-5 | ✅ |
| LLM | Gemma-Legal INT4 | Ollama | 2.5 GB | Chat responses | ✅ |
| Search | Qdrant FAISS-GPU | fp16 | 1.0 GB | GPU cosine search | ✅ |
| **Total** | | | **~6.3 GB** | RTX 3060 Ti (8GB) | ✅ |

**Key Decision**: Use Ollama for Gemma-Legal INT4 now. Upgrade to TensorRT-LLM later when UI is stable.

---

## Data Stores (Locked for MVP)

| Store | Used For | Why |
|-------|----------|-----|
| MinIO | Original evidence files | Immutable, legal chain-of-custody |
| Redis | fp16 embeddings + layout blocks | CPU/GPU savings (10x compression) |
| Postgres 17 + pgvector | Metadata + joins + citations | Correctness, ACID, relationships |
| Qdrant GPU | Cosine search & ANN | 10–60× faster on RTX 3060 Ti |

**Key Design**:
- **pgvector stays authoritative metadata** (case, statute, citations)
- **Qdrant does all GPU distance math** (cosine similarity, top-K)
- **Redis caches fp16 embeddings** (avoid recomputation)

---

## Frontend Order (Golden Ratio PWA UI)

1. **Laws Search** (`/laws`): Fastest user value
2. **Evidence Upload** (`/evidence`): Shows GPU magic
3. **Evidence Board** (`/evidence_board`): Visual payoff
4. **Case Chat** (`/cases/[id]/chat`): Final UX layer

---

## Success Criteria

- ✅ Chunking: >1000 chunks/sec
- ✅ Embedding: <50ms per batch of 32
- ✅ Qdrant search: <100ms per query
- ✅ Reranking: <50ms per query
- ✅ UI responsiveness: <200ms page transitions
- ✅ Search accuracy: >0.75 cosine similarity for related cases

---

## Next: Implement Task 2 (GPU DocLing Gateway)

Ready to build the Python gateway that orchestrates Granite-Docling, streams to Redis, and returns DocTags?


### Task 3: Embedding Pipeline (Python)
**File**: `backend/embedding_workers/worker_pool.py`
- Load EmbeddingGemma (2B params, int8 quantized)
- Batch process chunks (32 per batch)
- Generate embeddings (768-dim)
- Convert float32 → fp16 (2 bytes per value)
- Serialize via CBOR (binary format)
- Output: fp16 embeddings ready for Redis

**Dependencies**: Task 1 (consumes chunks)
**GPU**: EmbeddingGemma (~0.8 GB VRAM)

---

### Task 4: Go QUIC FP16 Cache Layer + Upload API
**File**: `backend/fp16_cache.go`
- Add to existing `legal-ai-quic-server.go`
- Implement `storeFP16()`: compress float32 → fp16
- Implement `loadFP16()`: decompress fp16 → float32
- Implement `CacheVector()`: store in Redis with TTL
- Implement `LoadVector()`: retrieve from Redis
- Add CBOR serialization for binary efficiency
- QUIC streaming multipart upload

**Dependencies**: Task 3 (receives fp16 embeddings)
**Purpose**: 10x memory reduction, fast query reuse

---

## Phase 2: Storage + Search (Tasks 5-6)

### Task 5: Mirror Embeddings to Postgres + Qdrant ⭐ NEXT
**Files**:
- `backend/pg_qdrant_sync.py` (Python microservice)
- `backend/sync_worker.py` (background reconciliation)

**Postgres 17 + pgvector**:
- Dual-write: embeddings + metadata
- Store: chunk_id, embedding (768-dim), doc_id, page, bbox
- Joins: cases, statutes, charges, citations
- ACID transactions, audit trail

**Qdrant GPU Search**:
- Mirror embeddings from Postgres
- GPU-accelerated cosine similarity (FAISS-GPU)
- Top-K retrieval (<100ms)
- IVF clustering for scale

**Background Worker**:
- Periodic PG ↔ Qdrant reconciliation
- Handle failures, retries
- Eventual consistency

**Dependencies**: Task 4 (receives fp16 from Redis)
**Purpose**: Postgres = legal system of record, Qdrant = fast GPU search

---

### Task 6: MiniLM Reranker (CPU for MVP)
**File**: `backend/reranker_workers/reranker.py`
- Load MiniLM (22M params, int8 quantized)
- Rerank top-K results to top-5
- Compute relevance scores
- Return ranked results with confidence
- CPU implementation (TensorRT later)

**Dependencies**: Task 5 (reranks Qdrant results)
**Latency**: <50ms per query

---

## Phase 3: Search API (Task 7)

### Task 7: Law Search API
**Files**:
- `backend/law_search_api.go` (Go QUIC endpoint)
- `backend/law_search_service.py` (Python service)

**Functionality**:
- gRPC/QUIC endpoint for statute search
- Query Qdrant GPU for top-50
- Rerank to top-5 with MiniLM
- Join with Postgres metadata
- Return: statute text, related cases, citations

**Dependencies**: Tasks 5-6
**Latency**: <200ms per query

---

## Phase 4: Frontend (Tasks 8-11)

### Task 8: Law Search UI
**File**: `sveltekit-frontend/src/routes/laws/+page.svelte`
- Golden-ratio 3-column layout (22% / 55% / 23%)
- Search bar: query statutes by keyword, code, charge type
- Accordion filters: Jurisdiction, Offense type, Severity, Time window
- Filter chips: quick toggles
- Results: statute list with title, code, jurisdiction
- Detail panel: full statute text (serif font)
- Related cases: right column showing cases citing statute
- Actions: "Save Citation", "Send to Chat", "Add as Charge"

**API Endpoint**: `/api/laws/search` (queries Qdrant + Postgres)
**First user-visible result**: Shows system is working

---

### Task 9: Ollama Integration
**File**: `sveltekit-frontend/src/lib/ollama.ts`
- `getOllamaEndpoint()`: Get Ollama server URL
- `streamGemmaLegal()`: Stream Gemma-Legal INT4 responses
- Context injection from RAG (Qdrant search results)
- Citation extraction from response
- Error handling + fallback

**LLM**: Gemma-Legal INT4 via Ollama
**Upgrade Path**: TensorRT-LLM after UI is stable

---

### Task 10: Evidence Board UI
**File**: `sveltekit-frontend/src/routes/evidence_board/+page.svelte`
- Golden-ratio 3-column layout
- Evidence grid: manila folder/polaroid cards
- Status color strips: Unreviewed (grey), Flagged (amber), Important (crimson)
- Dotted connection lines: show relationships
- Hover effects: highlight related evidence
- Zoom controls: 100%, +, −, Reset View
- Library Drawer: list view for >20 items
- Right-click context menu: "Open in Panel", "Send to Chat", "Link to Statute"

**API Endpoint**: `/api/evidence/board` (queries Postgres)
**Visual payoff**: See documents organized

---

### Task 11: Legal Chat
**File**: `sveltekit-frontend/src/routes/cases/[id]/chat/+page.svelte`
- Chat interface: dark background, modern sans-serif
- Message labels: "Prosecutor", "Detective", "AI Legal Assistant"
- Disclaimer stripe: "Cannot determine guilt or innocence..."
- Text highlighting: mini-modal on selection
- Mini-modal actions: "Summarize & Save Citation", "Cancel"
- Streaming responses: real-time Gemma-Legal INT4 (via Ollama)
- Citation linking: clickable statute/case references
- Context from Qdrant search

**API Endpoint**: `/api/cases/{id}/chat` (streams Ollama)
**Final UX layer**: Uses all above components

---

## LLM Layer for MVP

| Layer | Implementation | Why |
|-------|----------------|-----|
| Legal Answering | getOllamaEndpoint() + Gemma-Legal INT4 | Works now, no TRT issues |
| Context Injection | RAG from Qdrant + reranks | Semantic precision |
| Citation Validation | Python middleware | Structured output |
| Streaming UI | SvelteKit streaming fetch | Instant UX |

**Upgrade Path**: TensorRT-LLM after UI is stable.

---

## GPU Stack (Locked for MVP Stability)

| Component | Model | Format | VRAM | Purpose | Status |
|-----------|-------|--------|------|---------|--------|
| DocLing | Granite-Docling (258M) | fp16 → int8 | 1.6-1.9 GB | OCR + layout | ✅ |
| Embedding | EmbeddingGemma | fp16 | 0.8 GB | Vector generation | ✅ |
| Reranker | MiniLM | CPU (TensorRT later) | 0.4 GB | Top-K → Top-5 | ✅ |
| LLM | Gemma-Legal INT4 | Ollama | 2.5 GB | Chat responses | ✅ |
| Search | Qdrant FAISS-GPU | fp16 | 1.0 GB | GPU cosine search | ✅ |
| **Total** | | | **~6.3 GB** | RTX 3060 Ti (8GB) | ✅ |

**Key Decision**: Use Ollama for Gemma-Legal INT4 now. Upgrade to TensorRT-LLM later when UI is stable.

---

## Data Stores (Locked for MVP)

| Store | Used For | Why |
|-------|----------|-----|
| MinIO | Original evidence files | Immutable, legal chain-of-custody |
| Redis | fp16 embeddings + layout blocks | CPU/GPU savings (10x compression) |
| Postgres 17 + pgvector | Metadata + joins + citations | Correctness, ACID, relationships |
| Qdrant GPU | Cosine search & ANN | 10–60× faster on RTX 3060 Ti |

**Key Design**:
- **pgvector stays authoritative metadata** (case, statute, citations)
- **Qdrant does all GPU distance math** (cosine similarity, top-K)
- **Redis caches fp16 embeddings** (avoid recomputation)

---

## Success Criteria

- ✅ Chunking: >1000 chunks/sec
- ✅ Embedding: <50ms per batch of 32
- ✅ Qdrant search: <100ms per query
- ✅ Reranking: <50ms per query
- ✅ UI responsiveness: <200ms page transitions
- ✅ Search accuracy: >0.75 cosine similarity
- ✅ Chat latency: <2s first token (Ollama)

---

## Next: Implement Task 5 (Mirror to Postgres + Qdrant)

Ready to implement the Redis → Postgres + Qdrant mirroring service?

This is the critical bridge between embedding generation and GPU search.
