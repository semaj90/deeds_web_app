# Agentic RAG Search Stack Setup

## Architecture Overview

```
Query (text + embedding)
    ↓
┌─────────────────────────────────────┐
│  Search Orchestrator (TypeScript)   │
└─────────────────────────────────────┘
    ↓
    ├─→ PGVector (semantic search)     → top-50 results
    ├─→ Elasticsearch (keyword search) → top-50 results
    └─→ Merge & Deduplicate
        ↓
    ┌─────────────────────────────────────┐
    │  MiniLM Reranker (Python/FastAPI)   │
    │  CUDA + TensorRT Acceleration       │
    └─────────────────────────────────────┘
        ↓
    Top-K reranked results (default: 7)
```

## Prerequisites

### 1. PostgreSQL + pgvector

```bash
# Connection string (already configured)
postgres://legal_admin:123456@localhost:5432/legal_ai_db?sslmode=disable

# Verify pgvector extension
psql -U legal_admin -d legal_ai_db -c "CREATE EXTENSION IF NOT EXISTS vector;"
```

### 2. Elasticsearch

```bash
# Already running (verify)
curl http://localhost:9200/_cluster/health

# Expected response
{
  "cluster_name": "elasticsearch",
  "status": "green",
  "number_of_nodes": 1
}
```

### 3. GPU Setup (for Reranker)

```bash
# Verify CUDA
nvidia-smi

# Verify TensorRT (optional, for optimization)
python3 -c "import tensorrt; print(tensorrt.__version__)"
```

## Installation

### Step 1: Install TypeScript Dependencies

```bash
cd sveltekit-frontend
npm install pg @elastic/elasticsearch
```

### Step 2: Set Up Reranker Service

```bash
cd reranker-service

# Create virtual environment
python3 -m venv venv
source venv/bin/activate  # On Windows: venv\Scripts\activate

# Install dependencies
pip install -r requirements.txt

# Run service
python3 main.py
# Service runs on http://localhost:8000
```

### Step 3: Verify Services

```bash
# Check reranker health
curl http://localhost:8000/health

# Check Elasticsearch
curl http://localhost:9200/_cluster/health

# Check PostgreSQL
psql -U legal_admin -d legal_ai_db -c "SELECT 1;"
```

## Configuration

### Environment Variables

```bash
# .env or .env.local
DATABASE_URL=postgres://legal_admin:123456@localhost:5432/legal_ai_db?sslmode=disable
ELASTICSEARCH_URL=http://localhost:9200
RERANKER_URL=http://localhost:8000
REDIS_URL=redis://localhost:6379/0
```

## Usage

### 1. Index Documents

```typescript
import { createPGVectorSearch } from '$lib/server/services/search/pgvector-search';
import { createElasticsearchSearch } from '$lib/server/services/search/elasticsearch-search';

const pgvector = await createPGVectorSearch(process.env.DATABASE_URL);
const elasticsearch = await createElasticsearchSearch(process.env.ELASTICSEARCH_URL);

// Index chunks with embeddings
await pgvector.insertChunks('doc-1', 'Case Title', [
  {
    text: 'Chunk text here...',
    embedding: [0.1, 0.2, ...], // 768-dimensional vector
    metadata: { page: 1, source: 'statute' }
  }
]);

// Index for keyword search
await elasticsearch.indexChunks('doc-1', 'Case Title', [
  {
    text: 'Chunk text here...',
    metadata: { page: 1, source: 'statute' }
  }
]);
```

### 2. Search with Agentic RAG

```typescript
import { createSearchOrchestrator } from '$lib/server/services/search/search-orchestrator';

const orchestrator = await createSearchOrchestrator(
  process.env.DATABASE_URL,
  process.env.ELASTICSEARCH_URL,
  process.env.RERANKER_URL
);

const results = await orchestrator.search(
  {
    text: 'What are the penalties for child abuse?',
    embedding: [0.1, 0.2, ...] // 768-dimensional Gemma embedding
  },
  7 // top-k
);

// Results include:
// - semantic_results: top-50 from pgvector
// - keyword_results: top-50 from Elasticsearch
// - reranked_results: top-7 from MiniLM
// - latency_ms: total time
```

### 3. API Endpoint

```bash
# POST /api/search
curl -X POST http://localhost:5173/api/search \
  -H "Content-Type: application/json" \
  -d '{
    "query": "What are the penalties for child abuse?",
    "embedding": [0.1, 0.2, ...],
    "top_k": 7
  }'

# GET /api/search (stats)
curl http://localhost:5173/api/search
```

## Performance Tuning

### PGVector Index

```sql
-- Adjust list count based on dataset size
-- For 50k documents: lists = 100-200
-- For 500k documents: lists = 500-1000

CREATE INDEX document_chunks_embedding_idx
ON document_chunks
USING ivfflat (embedding vector_cosine_ops)
WITH (lists = 100);
```

### Elasticsearch Shards

```json
{
  "settings": {
    "number_of_shards": 3,
    "number_of_replicas": 1,
    "refresh_interval": "30s"
  }
}
```

### Reranker Batching

```python
# In reranker-service/main.py
# Batch multiple queries for better GPU utilization
results = await reranker.rerank_batch([
  {"query": "...", "documents": [...]},
  {"query": "...", "documents": [...]}
])
```

## Monitoring

### Prometheus Metrics

```bash
# Reranker metrics
curl http://localhost:8000/metrics

# Key metrics:
# - rerank_requests_total
# - rerank_latency_seconds
# - cache_hits_total
# - cache_misses_total
```

### Logs

```bash
# Reranker logs
tail -f reranker-service/logs/reranker.log

# SvelteKit logs
npm run dev 2>&1 | tee logs/sveltekit.log
```

## Troubleshooting

### PGVector Connection Issues

```bash
# Test connection
psql -U legal_admin -d legal_ai_db -c "SELECT 1;"

# Check pgvector extension
psql -U legal_admin -d legal_ai_db -c "SELECT * FROM pg_extension WHERE extname = 'vector';"
```

### Elasticsearch Connection Issues

```bash
# Check cluster status
curl http://localhost:9200/_cluster/health

# Check indices
curl http://localhost:9200/_cat/indices

# Reindex if needed
curl -X POST http://localhost:9200/legal_documents/_reindex
```

### Reranker GPU Issues

```bash
# Check CUDA availability
python3 -c "import torch; print(torch.cuda.is_available())"

# Check device
python3 -c "import torch; print(torch.cuda.get_device_name(0))"

# Fallback to CPU
# Set CUDA_VISIBLE_DEVICES="" in environment
```

## Next Steps

1. **Phase 71:** Gemma Legal Summarization
   - Extract holdings and citations
   - Generate structured legal reasoning
   - Function-calling for structured output

2. **Phase 72:** Context Synthesis
   - Combine reranked chunks
   - Generate legal summaries
   - Citation tracking

3. **Phase 73:** Agentic Reasoning
   - Multi-turn legal analysis
   - Tool use for statute lookup
   - Case law precedent analysis

## References

- [PGVector Documentation](https://github.com/pgvector/pgvector)
- [Elasticsearch BM25](https://www.elastic.co/guide/en/elasticsearch/reference/current/query-dsl-match-query.html)
- [MiniLM Cross-Encoder](https://huggingface.co/cross-encoder/ms-marco-MiniLM-L-12-v2)
- [FastAPI Documentation](https://fastapi.tiangolo.com/)
