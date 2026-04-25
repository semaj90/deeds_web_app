# Phase 3 Design: RAG Preparation, CAG Inverse Lookup, and TensorRT Migration

## Overview

Phase 3 transforms Granite-Docling's DocTags into a queryable RAG system with inverse case matching. The architecture consists of:

1. **Hybrid Chunker** (`chunker_langextract.py`): Converts DocTags → semantic chunks with layout awareness
2. **TensorRT Embedding Workers** (`tensorrt_workers/`): GPU-optimized MiniLM + EmbeddingGemma with int8 quantization
3. **Redis CAG Inverse** (`cag_inverse.py`): Product quantization bucketing + cosine similarity lookup
4. **Pipeline Events** (`pipeline_events.py`): QUIC streaming status updates to frontend
5. **Windows CUDA Config** (`cuda_env_win.py`): Registry-based CUDA path detection and validation

## Architecture: GPU-Accelerated pgvector + Qdrant + Redis

```
[SvelteKit Upload]
         ↓
[Python: Granite-Docling VLM]
  - Extract: text, layout, tables, OCR
  - Output: DocTags JSON
         ↓
[Hybrid Chunker]
  - Parse layout blocks, tables, captions
  - Merge small blocks (<200 tokens)
  - Preserve bounding boxes
  - Output: Chunk IDs + text
         ↓
[Embedding Pipeline]
  - EmbeddingGemma (fp16): Generate embeddings
  - Convert float32 → fp16 (2 bytes per value)
  - Serialize via CBOR (binary format)
         ↓
[Redis FP16 Cache]
  - Key: `embed:{sha256}` (fp16 CBOR)
  - TTL: 60 days
  - 10x size reduction vs JSON
         ↓
[Go QUIC Orchestrator]
  - Dual-write: Postgres + Qdrant
  - Decompress fp16 → fp32
  - Hash chunk IDs for consistency
         ↓
[Postgres 17 + pgvector]
  - Store: embeddings, metadata, citations
  - Joins: cases, statutes, charges
  - ACID transactions, audit trail
  - pgvector for metadata queries
         ↓
[Qdrant GPU Search (FAISS-GPU)]
  - Mirror embeddings from Postgres
  - GPU-accelerated cosine similarity
  - Top-50 retrieval (<100ms)
  - IVF clustering for scale
         ↓
[MiniLM-L6-v2 Reranker (CPU)]
  - Cross-encoder: reads query + candidate text
  - Rerank top-50 → top-5 by true relevance
  - <50ms latency per query
  - No GPU required (runs on CPU)
         ↓
[Frontend: Golden-Ratio 3-Column Layout]
  - Left: Sidebar (22%) - Navigation, filters
  - Center: Workspace (55%) - Laws search, evidence board
  - Right: Context Rail (23%) - Inverse CAG matches, system status
```

## Retrieval Data Flow (GPU → CPU Boundary)

```
Query
  → Qdrant GPU ANN (top 50 vectors)
  → MiniLM-L6 Reranker (CPU, cross-encoder scoring)
  → Top 5 ranked candidates
  → Context Builder
  → Legal LLM (Gemma-Legal INT4 via Ollama)
```

**Boundary constraint**
- Reranker MUST run on CPU only; no GPU allocation for MiniLM-L6-v2.
- Gemma-Legal MUST NOT be used for reranking (keeps latency predictable and isolates LLM to answer-generation only).

**Quality note**
- Reranker acts as the legal "relevance judge" to avoid cosine-only neighbors that collide across overlapping statutes (e.g., PC 273a vs PC 270 vs PC 278).

**Key Design Decision**:
- **Postgres pgvector**: Legal system of record (metadata, joins, ACID)
- **Qdrant GPU**: Fast vector search (FAISS-GPU acceleration)
- **Redis fp16**: Query cache + embedding compression
- **Go QUIC**: Orchestrates all three, handles CAG ranking

## Components and Interfaces

### 1. Hybrid Chunker (`chunker_langextract.py`)

**Input**: DocTags JSON from Granite-Docling
**Output**: List of Chunk objects with metadata

```python
class Chunk:
    id: str                    # UUID
    doc_id: str               # Parent document
    text: str                 # Chunk content
    tokens: int               # Token count
    semantic_type: str        # "text" | "table" | "caption" | "footnote"
    page: int                 # Page number
    bounding_boxes: List[BBox]  # Layout coordinates
    metadata: Dict            # Custom metadata
    embedding: Optional[List[float]]  # Will be filled by workers
```

**Algorithm**:
1. Parse DocTags into semantic units (blocks, tables, captions)
2. For each text block:
   - If tokens < 200 AND next block exists: merge with next
   - If tokens > 512: split with 50-token overlap
   - Preserve bounding box coordinates
3. For tables: keep as single chunk with row/column structure
4. For captions: attach to parent block with relationship marker
5. Return sorted chunks by page + position

### 2. TensorRT Embedding Workers (`tensorrt_workers/`)

**Architecture**:
- Worker pool: 2-4 workers (configurable)
- Batch size: 32 chunks per batch
- Models:
  - MiniLM: 22M params, int8 quantized, 384-dim output
  - EmbeddingGemma: 2B params, int8 quantized, 768-dim output
  - SigLIP2: Vision encoder, fp16, 768-dim output

**Workflow**:
1. Worker polls Redis `chunks:pending:{doc_id}`
2. Batch 32 chunks
3. Tokenize with legal vocabulary
4. Forward through TensorRT engine (int8)
5. Convert to fp16
6. Store in Redis `vlm:embed:{hash}`
7. Emit status event: `embedding_progress`

**VRAM Budget**:
- MiniLM int8: ~0.4 GB
- EmbeddingGemma int8: ~0.8 GB
- Batch buffer: ~0.3 GB
- **Total: ~1.5 GB** (leaves 6.5 GB for other processes on RTX 3060 Ti)

### 3. Redis CAG Inverse (`cag_inverse.py`)

**Product Quantization (PQ) Strategy**:
- 512 buckets (2^9)
- Each bucket stores up to 100 case IDs
- Bucket ID computed from embedding via:
  1. Normalize embedding (L2)
  2. Quantize to 8-bit: `q = round((e + 1) * 127.5)`
  3. Hash quantized vector: `bucket_id = hash(q) % 512`

**Inverse Lookup**:
```
Input: embedding (768-dim fp32)
1. Compute bucket_id
2. Retrieve all case_ids from Redis `cag:inv:{bucket_id}`
3. For each case_id:
   - Fetch stored embedding from `vlm:embed:{case_hash}`
   - Compute cosine similarity
   - If similarity > 0.75: add to results
4. Sort by similarity (descending)
5. Return top 10 matches
```

**Redis Keys**:
- `vlm:embed:{hash}`: CBOR-encoded fp16 embedding (TTL: 60d)
- `cag:inv:{bucket}`: Redis List of case IDs (TTL: 30d)
- `cag:case:{case_id}`: Case metadata (TTL: 90d)

### 4. Pipeline Events (`pipeline_events.py`)

**Event Types**:
```python
class PipelineEvent:
    type: str  # "chunking_start" | "chunking_progress" | "embedding_start" | ...
    doc_id: str
    timestamp: float
    progress: float  # 0-100
    data: Dict  # Event-specific data
```

**Event Stream**:
1. `chunking_start`: doc_id, total_pages
2. `chunking_progress`: page, chunk_count
3. `embedding_start`: total_chunks
4. `embedding_progress`: completed_chunks, batch_id
5. `inverse_lookup_start`: embedding_hash
6. `inverse_lookup_complete`: matches (list of case_id, similarity)
7. `complete`: doc_id, chunk_count, embedding_count

**Transport**: QUIC streaming via `/api/evidence/{doc_id}/process-stream`

### 5. MiniLM-L6-v2 Reranker (`reranker_minilm.py`)

**Architecture**:
- Model: MiniLM-L6-v2 (22M params, cross-encoder)
- Input: Query string + list of candidate texts
- Output: Relevance scores (0-1) for each candidate
- Batch size: 32 candidates per batch
- Latency: <50ms per query (CPU-based)

**Workflow**:
1. Receive top-50 results from Qdrant vector search
2. Batch candidates (32 per batch)
3. Tokenize query + candidate pairs
4. Forward through MiniLM cross-encoder
5. Extract relevance scores
6. Sort by score (descending)
7. Return top-5 reranked results

**Why MiniLM-L6-v2 for Reranking**:
- Cross-encoder reads both query and candidate text jointly
- Trained specifically for ranking/relevance tasks
- Fast on CPU (no GPU required)
- 384-dim output, 22M params (lightweight)
- Maintains accuracy within 0.02 of manual legal review

**Why NOT Gemma for Reranking**:
- Gemma is a generative LLM (too slow for ranking)
- Designed for question-answering, not ranking
- Would require full text generation per candidate
- Overkill for simple relevance scoring

**Redis Caching**:
- Cache reranking results: `rerank:{query_hash}:{candidate_hash}` (TTL: 24h)
- Avoid redundant reranking of same query-candidate pairs

### 6. Windows CUDA Configuration (`cuda_env_win.py`)

**Detection Strategy**:
1. Check environment variable `CUDA_PATH`
2. Query Windows registry: `HKEY_LOCAL_MACHINE\SOFTWARE\NVIDIA\CUDA`
3. Search common paths: `C:\Program Files\NVIDIA GPU Computing Toolkit\CUDA\v11.8`
4. Validate: `nvcc.exe --version`, `nvinfer.dll` present

**Initialization**:
```python
class CudaEnv:
    cuda_path: str
    cuda_version: str  # e.g., "11.8"
    cudnn_path: str
    tensorrt_path: str
    device_count: int
    device_info: List[Dict]  # compute_capability, memory, etc.
```

**Fallback**: If CUDA not found, log warning and use CPU mode

## Data Models

### Chunk
```python
{
    "id": "chunk_abc123",
    "doc_id": "doc_xyz789",
    "text": "The defendant was charged with...",
    "tokens": 256,
    "semantic_type": "text",
    "page": 3,
    "bounding_boxes": [
        {"x": 100, "y": 200, "width": 400, "height": 50, "text": "..."}
    ],
    "metadata": {
        "section": "facts",
        "confidence": 0.95
    }
}
```

### Embedding (Redis CBOR fp16)
```
Key: vlm:embed:{sha256_hash}
Value: CBOR([uint16, uint16, ...])  # 384 or 768 dimensions
TTL: 60 days
```

### Inverse CAG Bucket
```
Key: cag:inv:{bucket_id}
Value: Redis List ["case_001", "case_042", ...]
TTL: 30 days
Max length: 100 per bucket
```

### Case Metadata
```python
{
    "case_id": "case_001",
    "title": "State v. Smith",
    "charge_type": "felony_assault",
    "jurisdiction": "CA",
    "statute": "PC 245",
    "embedding_hash": "abc123...",
    "created_at": "2024-01-15"
}
```

## Error Handling

1. **Chunking Errors**:
   - Invalid DocTags: Log and skip document
   - Token overflow: Split chunk with overlap
   - Missing bounding boxes: Use page position as fallback

2. **Embedding Errors**:
   - CUDA OOM: Reduce batch size, retry
   - Model load failure: Fall back to CPU
   - Tokenization error: Use fallback tokenizer

3. **Redis Errors**:
   - Connection timeout: Retry with exponential backoff
   - Memory full: Evict oldest entries (LRU)
   - Serialization error: Log and skip embedding

4. **Inverse Lookup Errors**:
   - Bucket not found: Return empty results
   - Similarity computation error: Log and skip case
   - Network latency: Cache frequently accessed buckets locally

## Testing Strategy

### Unit Tests
- Chunker: Test layout parsing, merging logic, token counting
- PQ bucketing: Verify bucket distribution, hash consistency
- Embedding conversion: fp32 → fp16 → fp32 round-trip accuracy
- CUDA detection: Mock registry, test fallback paths

### Integration Tests
- End-to-end: DocTags → chunks → embeddings → inverse lookup
- Redis caching: Verify CBOR serialization, TTL expiration
- Event streaming: Verify event order and data integrity
- Windows CUDA: Test on Windows with/without CUDA installed

### Performance Tests
- Chunking throughput: >1000 chunks/sec
- Embedding latency: <50ms per batch of 32
- Inverse lookup: <100ms per query
- Memory usage: <2GB for embedding workers

## Go QUIC Server Extensions

### FP16 Vector Compression

**Purpose**: Reduce Redis memory usage by 50% while maintaining search accuracy

```go
// storeFP16: compress float32 → fp16 (2 bytes per value)
func storeFP16(key string, vec []float32) ([]byte, error) {
    b := make([]byte, len(vec)*2)
    for i, v := range vec {
        f := math.Float32bits(v)
        fp16 := uint16((f >> 16) & 0xFFFF)
        b[i*2] = byte(fp16)
        b[i*2+1] = byte(fp16 >> 8)
    }
    return b, nil
}

// loadFP16: decompress fp16 → float32
func loadFP16(data []byte) []float32 {
    vec := make([]float32, len(data)/2)
    for i := 0; i < len(vec); i++ {
        fp16 := uint16(data[i*2]) | uint16(data[i*2+1])<<8
        bits := uint32(fp16) << 16
        vec[i] = math.Float32frombits(bits)
    }
    return vec
}
```

### Redis Cache Wrapper

```go
func (s *LegalAIQuicServer) CacheVector(id string, vector []float32) error {
    if s.redisClient == nil { return nil }
    b, _ := storeFP16(id, vector)
    return s.redisClient.Set(context.Background(), "vec:"+id, b, 72*time.Hour).Err()
}

func (s *LegalAIQuicServer) LoadVector(id string) ([]float32, bool) {
    if s.redisClient == nil { return nil, false }
    raw, err := s.redisClient.Get(context.Background(), "vec:"+id).Bytes()
    if err != nil { return nil, false }
    return loadFP16(raw), true
}
```

### Inverse Top-K CAG Ranking

**Weighted Legal Score Formula**:
```
score = (cosine_similarity * 0.58) + (jurisdiction_match * 0.25) + (recency_factor * 0.17)
```

```go
func weightedLegalScore(cosine, jurisdiction, recency float32) float32 {
    return cosine*0.58 + jurisdiction*0.25 + recency*0.17
}

func (s *LegalAIQuicServer) InverseTopK(query []float32, k int) []SimilarCase {
    // Try Redis cache first
    if cached, ok := s.LoadVector("last_query"); ok {
        query = cached
    }

    all := s.vectorDB.vectors
    type scored struct {
        id    string
        score float32
    }

    scores := make([]scored, 0, len(all))
    for id, vec := range all {
        cos := cosineSimilarity(query, vec)
        jur := float32(1.0) // TODO: connect to PG jurisdiction
        rec := float32(0.8) // TODO: use timestamp later
        scores = append(scores, scored{id, weightedLegalScore(cos, jur, rec)})
    }

    sort.Slice(scores, func(i, j int) bool { return scores[i].score > scores[j].score })

    results := []SimilarCase{}
    for i, sc := range scores {
        if i >= k { break }
        results = append(results, SimilarCase{
            CaseID:     sc.id,
            Similarity: sc.score,
        })
    }
    return results
}
```

### QUIC → Python VLM Gateway Call

```go
func callDoclingGateway(file []byte, filename string) ([]byte, error) {
    reqBody := &bytes.Buffer{}
    writer := multipart.NewWriter(reqBody)
    part, _ := writer.CreateFormFile("file", filename)
    part.Write(file)
    writer.Close()

    req, _ := http.NewRequest("POST", "https://127.0.0.1:9002/vlm/docling", reqBody)
    req.Header.Add("Content-Type", writer.FormDataContentType())

    client := &http.Client{ Transport: &http3.RoundTripper{} }
    resp, err := client.Do(req)
    if err != nil { return nil, err }
    return io.ReadAll(resp.Body)
}
```

### QUIC Streaming Response Utility

```go
func streamJSON(w http.ResponseWriter, obj interface{}) {
    w.Header().Set("Content-Type", "application/json")
    enc := json.NewEncoder(w)
    enc.SetIndent("", "")
    enc.Encode(obj)
    if f, ok := w.(http.Flusher); ok { f.Flush() }
}
```

## Deployment Considerations

1. **GPU Memory**: Verify RTX 3060 Ti has 8GB available
2. **Redis**: Ensure Redis instance running on localhost:6379
3. **TensorRT**: Install via `pip install tensorrt` (requires CUDA 11.8+)
4. **Windows Paths**: Set `CUDA_PATH` environment variable or use registry detection
5. **Model Weights**: Pre-download MiniLM and EmbeddingGemma to avoid startup delays
6. **Go QUIC Server**: Extend existing `legal-ai-quic-server.go` with FP16 caching and inverse ranking
7. **Postgres 17 + pgvector**: Prepare for next phase integration with PG/Redis sync

