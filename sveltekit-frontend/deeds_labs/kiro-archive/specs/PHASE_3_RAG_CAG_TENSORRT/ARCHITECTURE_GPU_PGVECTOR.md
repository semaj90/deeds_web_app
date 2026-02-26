# GPU-Accelerated Architecture: pgvector + Qdrant + Redis

## System Overview

```
┌─────────────────────────────────────────────────────────────────┐
│                    SvelteKit Frontend (PWA)                      │
│  /laws  /evidence  /evidence_board  /cases/[id]/chat            │
└────────────────────────┬────────────────────────────────────────┘
                         │
                    HTTP/3 QUIC
                         │
┌────────────────────────▼────────────────────────────────────────┐
│              Go QUIC Server (Orchestrator)                       │
│  - FP16 cache layer (Redis)                                     │
│  - Dual-write: Postgres + Qdrant                                │
│  - CAG inverse ranking                                          │
│  - QUIC streaming responses                                     │
└────────────────────────┬────────────────────────────────────────┘
                         │
        ┌────────────────┼────────────────┐
        │                │                │
        ▼                ▼                ▼
   ┌─────────┐    ┌──────────┐    ┌──────────────┐
   │  Redis  │    │Postgres  │    │ Qdrant GPU   │
   │ fp16    │    │pgvector  │    │ FAISS-GPU    │
   │ cache   │    │metadata  │    │ search       │
   └─────────┘    └──────────┘    └──────────────┘
        │                │                │
        └────────────────┼────────────────┘
                         │
        ┌────────────────┼────────────────┐
        │                │                │
        ▼                ▼                ▼
   ┌─────────┐    ┌──────────┐    ┌──────────────┐
   │ Python  │    │ Python   │    │ Python       │
   │DocLing  │    │Embedding │    │MiniLM        │
   │Gateway  │    │Workers   │    │Reranker      │
   │(GPU)    │    │(GPU)     │    │(GPU)         │
   └─────────┘    └──────────┘    └──────────────┘
        │                │                │
        └────────────────┼────────────────┘
                         │
                    MinIO Storage
                  (Evidence files)
```

---

## Data Flow: Evidence Upload → Search

### 1. Upload Phase
```
User uploads PDF/Image
         ↓
SvelteKit /evidence
         ↓
Go QUIC Server (receives file)
         ↓
Python DocLing Gateway
  - Extract: text, layout, tables, OCR
  - Output: DocTags JSON
         ↓
Hybrid Chunker
  - Parse DocTags
  - Merge small blocks
  - Split large blocks
  - Output: Chunk objects with IDs
         ↓
Redis: chunks:pending:{doc_id}
```

### 2. Embedding Phase
```
Python Embedding Workers
  - Poll Redis chunk queue
  - Load EmbeddingGemma (int8)
  - Generate embeddings (768-dim)
  - Convert float32 → fp16
  - Serialize via CBOR
         ↓
Redis: embed:{sha256} (fp16 CBOR)
  - TTL: 60 days
  - 10x smaller than JSON
```

### 3. Storage Phase
```
Go QUIC Server (reads from Redis)
         ↓
Dual-write:
  ├→ Postgres 17 + pgvector
  │   - Store: chunk_id, embedding, doc_id, page, bbox
  │   - Metadata: case_id, statute, charge_type
  │   - Joins: cases, statutes, charges, citations
  │   - ACID transactions, audit trail
  │
  └→ Qdrant GPU
      - Mirror embeddings
      - GPU-accelerated indexing (FAISS-GPU)
      - IVF clustering for scale
```

### 4. Search Phase
```
User searches /laws or /evidence_board
         ↓
Go QUIC Server
  - Receive query
  - Generate query embedding (EmbeddingGemma)
  - Convert to fp16
  - Check Redis cache
         ↓
If cache miss:
  - Query Qdrant GPU
    - FAISS-GPU cosine similarity
    - Top-K retrieval (<100ms)
  - Rerank with MiniLM
    - Top-K → Top-5 (<50ms)
  - Join with Postgres metadata
    - Get case details, citations, charges
  - Cache result in Redis
         ↓
Return ranked results to frontend
```

---

## Component Details

### Postgres 17 + pgvector

**Purpose**: Legal system of record

**Schema**:
```sql
-- Embeddings table
CREATE TABLE embeddings (
    id UUID PRIMARY KEY,
    chunk_id VARCHAR(255) UNIQUE,
    doc_id VARCHAR(255),
    embedding vector(768),
    page INT,
    bbox JSONB,
    created_at TIMESTAMP,
    CONSTRAINT fk_doc FOREIGN KEY (doc_id) REFERENCES documents(id)
);

-- Metadata table
CREATE TABLE documents (
    id UUID PRIMARY KEY,
    filename VARCHAR(255),
    jurisdiction VARCHAR(50),
    file_type VARCHAR(20),
    file_size INT,
    created_at TIMESTAMP,
    updated_at TIMESTAMP
);

-- Cases table
CREATE TABLE cases (
    id UUID PRIMARY KEY,
    case_id VARCHAR(255) UNIQUE,
    title VARCHAR(500),
    charge_type VARCHAR(100),
    jurisdiction VARCHAR(50),
    statute VARCHAR(100),
    created_at TIMESTAMP
);

-- Citations table
CREATE TABLE citations (
    id UUID PRIMARY KEY,
    embedding_id UUID REFERENCES embeddings(id),
    case_id UUID REFERENCES cases(id),
    statute_code VARCHAR(100),
    relevance_score FLOAT,
    created_at TIMESTAMP
);

-- Create index for pgvector
CREATE INDEX ON embeddings USING ivfflat (embedding vector_cosine_ops) WITH (lists = 100);
```

**Advantages**:
- ✅ ACID transactions
- ✅ Complex joins (cases, statutes, charges)
- ✅ Audit trail (timestamps)
- ✅ Relationships (foreign keys)
- ✅ Full-text search (tsvector)

---

### Qdrant GPU (FAISS-GPU)

**Purpose**: Fast vector search with GPU acceleration

**Configuration**:
```yaml
# qdrant_config.yaml
storage:
  snapshots_path: ./snapshots
  wal_path: ./wal

vector_size: 768
distance: Cosine

hnsw_config:
  m: 16
  ef_construct: 200
  ef_search: 100
  max_indexing_threads: 4

quantization_config:
  scalar:
    type: int8
    quantile: 0.99
    always_ram: false

gpu_config:
  enabled: true
  device: cuda:0
  batch_size: 32
```

**Advantages**:
- ✅ GPU-accelerated cosine similarity
- ✅ FAISS-GPU for scale
- ✅ IVF clustering
- ✅ <100ms top-K retrieval
- ✅ Quantization for memory efficiency

---

### Redis FP16 Cache

**Purpose**: Query reuse + embedding compression

**Keys**:
```
embed:{sha256}           → fp16 CBOR embedding (60d TTL)
query:{query_hash}       → cached search results (12h TTL)
rank:{case_id}:{query}   → reranked results (12h TTL)
chunks:pending:{doc_id}  → pending chunks (24h TTL)
```

**Advantages**:
- ✅ 10x memory reduction (fp16 vs fp32)
- ✅ Fast query reuse
- ✅ CBOR binary format (faster than JSON)
- ✅ Automatic TTL expiration

---

### Go QUIC Orchestrator

**Responsibilities**:
1. **FP16 Cache Layer**
   - Compress float32 → fp16
   - Decompress fp16 → float32
   - Store/retrieve from Redis

2. **Dual-Write**
   - Write embeddings to Postgres
   - Mirror to Qdrant GPU
   - Handle failures gracefully

3. **CAG Inverse Ranking**
   - Weighted legal score formula
   - Jurisdiction matching
   - Recency weighting

4. **QUIC Streaming**
   - Stream progress updates
   - Real-time status events
   - Chunk-by-chunk processing

---

## GPU Stack (Locked for MVP)

| Component | Model | Format | VRAM | Purpose |
|-----------|-------|--------|------|---------|
| DocLing | Granite-Docling | fp16 → int8 | 1.6-1.9 GB | OCR + layout |
| Embedding | EmbeddingGemma | fp16 | 0.8 GB | Vector generation |
| Reranker | MiniLM | INT8 | 0.4 GB | Top-K → Top-5 |
| LLM | Gemma-Legal | INT4 AWQ | 2.5 GB | Chat responses |
| Qdrant | FAISS-GPU | fp16 | 1.0 GB | GPU search |
| **Total** | | | **~6.3 GB** | RTX 3060 Ti (8GB) ✅ |

---

## Why This Architecture

### ✅ Correctness (Postgres)
- ACID transactions ensure data integrity
- Foreign keys maintain relationships
- Audit trail for legal compliance
- Complex joins for case analysis

### ✅ Speed (Qdrant GPU)
- FAISS-GPU acceleration
- <100ms top-K retrieval
- Scales to millions of embeddings
- Quantization for memory efficiency

### ✅ Efficiency (Redis fp16)
- 10x memory reduction
- Fast query reuse
- CBOR binary format
- Automatic TTL expiration

### ✅ Orchestration (Go QUIC)
- Dual-write consistency
- CAG inverse ranking
- QUIC streaming
- Real-time progress updates

---

## Comparison: pgvector vs Qdrant

| Feature | Postgres pgvector | Qdrant GPU |
|---------|-------------------|-----------|
| **Speed** | ~500ms per query | <100ms per query |
| **Scale** | Millions | Billions |
| **GPU** | No | Yes (FAISS-GPU) |
| **ACID** | Yes | No |
| **Joins** | Yes | No |
| **Audit** | Yes | No |
| **Use Case** | Metadata + joins | Fast search |

**Conclusion**: Use both!
- Postgres for correctness and relationships
- Qdrant for speed and GPU acceleration

---

## Next Steps

1. Implement Task 2: GPU DocLing Gateway
2. Implement Task 3: Embedding Pipeline
3. Implement Task 4: Go QUIC FP16 Cache
4. Implement Task 5: Mirror to Postgres + Qdrant
5. Implement Task 6: MiniLM Reranker
6. Build frontend (Tasks 7-9)

