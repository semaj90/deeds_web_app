# Scale Profile: S-M (500K → 5M Chunks)

## Overview

This document defines the S-M scale profile for regional legal workloads:
- **Documents**: 20K–120K
- **Chunks**: 500K–5M
- **GPU Vector DB**: FAISS-GPU + IVF HNSW
- **Metadata**: Postgres 17 (500K–5M rows)
- **Cache**: Redis FP16 (10M keys max, rotating LRU)

---

## Resource Targets

| Component | Target | Notes |
|-----------|--------|-------|
| Documents | 20K–120K | E-discovery + local statutes + case ingestion |
| Chunks | 500K–5M | Hybrid chunking with layout awareness |
| GPU Vector DB | FAISS-GPU + IVF HNSW | Qdrant optimized for S-M |
| Metadata Rows | 500K–5M | Postgres chunk_metadata table |
| FP16 Cache | 10M keys max | Redis with rotating LRU eviction |
| GPU Memory | < 2GB | Embedding + search operations |
| CPU Cores | 8+ | For reranking + citation extraction |
| RAM | 8GB+ | Docker + Python workers |

---

## Qdrant GPU Config (S-M Optimized)

**File**: `qdrant_gpu_config.json`

```json
{
  "collection": "legal_vectors",
  "vectors": {
    "size": 768,
    "distance": "Cosine",
    "on_disk": false
  },
  "optimizers_config": {
    "memmap_threshold": 2000000,
    "default_segment_number": 6
  },
  "quantization_config": {
    "scalar": {
      "always_ram": true
    }
  },
  "hnsw_config": {
    "m": 32,
    "ef_construct": 200,
    "ef": 128
  }
}
```

### Why These Values?

- **m=32**: Balance between accuracy and memory (default is 16)
- **ef_construct=200**: High-quality index construction
- **ef=128**: Search parameter for < 100ms latency
- **segment_number=6**: Supports growing DB without reindexing
- **scalar quantization**: Keeps GPU RAM low while maintaining accuracy
- **on_disk=false**: Keep vectors in GPU memory for speed

---

## Redis FP16 Keyspace (S-M)

### Environment Variables

```bash
# TTL configuration
REDIS_FP16_TTL=1209600        # 14 days for embeddings
REDIS_LAYOUT_TTL=5184000      # 60 days for DocTags
REDIS_DB_FP16=1               # Database 1 for embeddings
REDIS_DB_LAYOUT=2             # Database 2 for layouts
REDIS_DB_QUEUE=3              # Database 3 for MQ buffers
```

### Key Layout

```
Database 1 (FP16 Embeddings):
  embed:fp16:{chunk_id}        → CBOR-encoded fp16 vector (TTL: 14d)
  embed:hash:{doc_id}          → List of chunk IDs (TTL: 14d)

Database 2 (Layout/DocTags):
  layout:{doc_id}              → DocTags JSON (TTL: 60d)
  layout:bbox:{chunk_id}       → Bounding box coordinates (TTL: 60d)

Database 3 (MQ Buffers):
  mq:task:{task_id}            → Task metadata (TTL: 24h)
  mq:ack:{task_id}             → Acknowledgment status (TTL: 24h)
```

### Memory Calculation

```
10M keys × 2KB avg = 20GB max
But with LRU eviction: ~4GB active working set
```

---

## RabbitMQ Queues (Corrected + Durable + Fair Dispatch)

### Setup Commands

```bash
# Declare exchange
rabbitmqadmin declare exchange name=rag_ai type=direct durable=true

# Declare queues (durable)
rabbitmqadmin declare queue name=embedding durable=true
rabbitmqadmin declare queue name=mirror durable=true
rabbitmqadmin declare queue name=rerank durable=true
rabbitmqadmin declare queue name=citation durable=true

# Bind queues to exchange
rabbitmqadmin declare binding source=rag_ai destination=embedding routing_key=embedding
rabbitmqadmin declare binding source=rag_ai destination=mirror routing_key=mirror
rabbitmqadmin declare binding source=rag_ai destination=rerank routing_key=rerank
rabbitmqadmin declare binding source=rag_ai destination=citation routing_key=citation
```

### Queue Configuration

| Queue | Workers | Prefetch | Purpose |
|-------|---------|----------|---------|
| embedding | 2 | 1 | Embedding generation (GPU) |
| mirror | 1 | 1 | Qdrant + Postgres mirroring |
| rerank | 3 | 1 | MiniLM-L6-v2 reranking (CPU) |
| citation | 1 | 1 | Statute/citation extraction |

### Worker Launch

```bash
# Terminal 1: Embedding workers (2 processes)
MLP_QUEUE_TYPE=embedding supervisord -c backend/supervisord.conf

# Terminal 2: Mirror worker (1 process)
MLP_QUEUE_TYPE=mirror supervisord -c backend/supervisord.conf

# Terminal 3: Rerank workers (3 processes)
MLP_QUEUE_TYPE=rerank supervisord -c backend/supervisord.conf

# Terminal 4: Citation worker (1 process)
MLP_QUEUE_TYPE=citation supervisord -c backend/supervisord.conf
```

---

## Postgres 17 (Metadata Only)

### Schema

```sql
CREATE EXTENSION IF NOT EXISTS vector;

-- Chunk metadata (no embeddings stored here)
CREATE TABLE chunk_metadata (
    chunk_id TEXT PRIMARY KEY,
    doc_id TEXT NOT NULL,
    statute_ref TEXT,
    page INT,
    token_count INT,
    semantic_type TEXT,  -- "text", "table", "caption", "footnote"
    bbox JSONB,          -- Bounding box coordinates
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);

-- Indexes for common queries
CREATE INDEX idx_chunk_statute ON chunk_metadata(statute_ref);
CREATE INDEX idx_chunk_doc ON chunk_metadata(doc_id);
CREATE INDEX idx_chunk_type ON chunk_metadata(semantic_type);
CREATE INDEX idx_chunk_created ON chunk_metadata(created_at);

-- Document metadata
CREATE TABLE document_metadata (
    doc_id TEXT PRIMARY KEY,
    filename TEXT NOT NULL,
    file_size INT,
    page_count INT,
    chunk_count INT,
    status TEXT,  -- "pending", "processing", "complete", "error"
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);

-- Statute references
CREATE TABLE statute_references (
    statute_id TEXT PRIMARY KEY,
    statute_code TEXT UNIQUE NOT NULL,
    statute_title TEXT,
    jurisdiction TEXT,
    description TEXT,
    created_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX idx_statute_code ON statute_references(statute_code);
CREATE INDEX idx_statute_jurisdiction ON statute_references(jurisdiction);
```

### Capacity Planning

```
500K chunks × 1KB metadata = 500MB
5M chunks × 1KB metadata = 5GB

With indexes: 1.5x multiplier
500K: ~750MB
5M: ~7.5GB
```

---

## MiniLM Rerank (S-M Optimized)

### Environment Variables

```bash
# CPU concurrency
RERANK_BATCH=32              # Batch size per worker
RERANK_WORKERS=3             # 3 processes for 8-core CPU
RERANK_TIMEOUT=60            # 60 second timeout per batch
RERANK_CACHE_TTL=86400       # 24 hour cache for results
```

### Why 3 Workers?

- **8-core CPU**: 3 workers saturate well without thrashing
- **Batch size 32**: ~35-60ms per batch
- **Throughput**: 3 × 32 = 96 chunks/sec reranked
- **No GPU contention**: CPU-based, doesn't compete with embedding GPU

### Performance Profile

```
Single batch (32 chunks):
  - Tokenization: 5ms
  - Forward pass: 25-40ms
  - Scoring: 5ms
  - Total: 35-50ms

3 workers in parallel:
  - Throughput: 96 chunks/sec
  - Latency per query: 35-60ms
```

---

## Expected Performance (RTX 3060 Ti + S-M Scale)

| Stage | Latency | Notes |
|-------|---------|-------|
| OCR (Docling) | 190ms/page | 10 pages = 1.9s |
| Embedding (batch 32) | 35–50ms | TensorRT int8 |
| FAISS-GPU Search | 40–90ms | Top-50 retrieval |
| MiniLM Rerank | 35–60ms | Top-50 → top-5 |
| Gemma Answer Start | 1–2s | First token latency |
| **FULL ASK→ANSWER** | **1.6–2.9s** | End-to-end |

### Breakdown Example

```
User uploads 10-page document:
  OCR: 10 × 190ms = 1.9s
  Chunking: 50ms
  Embedding (batch 32): 50ms
  Mirror to Qdrant: 100ms
  Total ingestion: ~2.2s

User searches:
  Query embedding: 10ms
  FAISS search (top-50): 80ms
  MiniLM rerank (top-5): 50ms
  Gemma answer: 1.5s
  Total search: ~1.7s

Full pipeline: < 3 seconds with citations ✅
```

---

## Scaling Considerations

### Horizontal Scaling (Multiple Workers)

```
Current (S-M):
  - 2 embedding workers
  - 1 mirror worker
  - 3 rerank workers
  - 1 citation worker

For 5M chunks:
  - Add 2 more embedding workers (4 total)
  - Add 1 more mirror worker (2 total)
  - Add 2 more rerank workers (5 total)
  - Keep 1 citation worker
```

### Vertical Scaling (Larger GPU)

```
RTX 3060 Ti (8GB):
  - Current: 2 embedding workers
  - Bottleneck: GPU memory

RTX 4090 (24GB):
  - Can run: 4-6 embedding workers
  - Bottleneck: CPU for reranking
```

### Database Scaling

```
Postgres 17:
  - 500K chunks: Single instance
  - 5M chunks: Consider read replicas for search queries

Redis:
  - 10M keys: Single instance with LRU eviction
  - 50M keys: Consider Redis Cluster

Qdrant:
  - 5M vectors: Single instance with FAISS-GPU
  - 50M vectors: Consider Qdrant Cluster
```

---

## Monitoring Metrics

### GPU Metrics

```bash
# Monitor GPU usage
nvidia-smi -l 1

# Expected:
# - Memory: 1.5-2GB
# - Utilization: 80-95% during embedding
# - Temperature: < 80°C
```

### CPU Metrics

```bash
# Monitor CPU usage
top -p $(pgrep -f mlp_worker | tr '\n' ',')

# Expected:
# - Rerank workers: 25-30% each
# - Total: 75-90% during reranking
```

### Memory Metrics

```bash
# Monitor system memory
free -h

# Expected:
# - Docker: 2-3GB
# - Python workers: 2-3GB
# - OS: 1-2GB
# - Total: 5-8GB
```

### Queue Metrics

```bash
# Monitor RabbitMQ queue depth
curl -u guest:guest http://localhost:15672/api/queues/%2Flegalai

# Expected:
# - Queue depth: < 100 (healthy)
# - Queue depth: > 1000 (backlog)
```

---

## Tuning Parameters

### For Faster Embedding

```bash
# Increase batch size (if GPU memory allows)
EMBEDDING_BATCH_SIZE=64  # Default: 32

# Add more workers
numprocs=4  # Default: 2 in supervisord.conf
```

### For Faster Reranking

```bash
# Increase workers
RERANK_WORKERS=5  # Default: 3

# Increase batch size
RERANK_BATCH=64  # Default: 32
```

### For Faster Search

```bash
# Adjust Qdrant parameters
ef=256  # Increase for higher accuracy (slower)
ef=64   # Decrease for speed (lower accuracy)

# Adjust Redis cache TTL
REDIS_FP16_TTL=604800  # 7 days (less memory)
REDIS_FP16_TTL=2592000 # 30 days (more memory)
```

---

## Cost Estimation (AWS)

### Compute

```
RTX 3060 Ti (on-prem): $400 one-time
EC2 g4dn.xlarge: $0.526/hour = $3,866/month
EC2 g4dn.2xlarge: $1.052/hour = $7,732/month
```

### Storage

```
500K chunks × 1KB = 500MB metadata
5M chunks × 1KB = 5GB metadata
EBS gp3: $0.10/GB/month = $0.50-5/month
```

### Network

```
Ingestion: 20K docs × 5MB = 100GB/month
Search: 1M queries × 1KB = 1GB/month
Data transfer: $0.02/GB = $2-20/month
```

---

## Deployment Checklist

- [ ] Qdrant GPU config deployed
- [ ] Redis FP16 keyspace configured
- [ ] RabbitMQ queues created
- [ ] Postgres schema initialized
- [ ] MiniLM rerank workers configured
- [ ] Supervisord processes started
- [ ] Monitoring metrics collected
- [ ] Performance baselines established
- [ ] Scaling plan documented
- [ ] Disaster recovery tested

---

## Next Steps

1. **Deploy S-M Profile**: Apply all configurations
2. **Load Test**: Ingest 500K chunks, measure performance
3. **Tune Parameters**: Adjust based on actual metrics
4. **Monitor**: Track GPU/CPU/memory usage
5. **Scale**: Add workers/resources as needed

---

## References

- Qdrant Documentation: https://qdrant.tech/documentation/
- Redis Documentation: https://redis.io/documentation/
- RabbitMQ Documentation: https://www.rabbitmq.com/documentation.html
- Postgres Documentation: https://www.postgresql.org/docs/
- MiniLM Model: https://huggingface.co/sentence-transformers/all-MiniLM-L6-v2
