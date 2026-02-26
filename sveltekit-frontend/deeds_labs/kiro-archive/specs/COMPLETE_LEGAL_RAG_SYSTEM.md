# Complete Legal RAG System - Phase 47-71

## Architecture Overview

```
┌─────────────────────────────────────────────────────────────┐
│                    SvelteKit UI                              │
│              (Search + Results Display)                      │
└────────────────────┬────────────────────────────────────────┘
                     │
                     ▼
┌─────────────────────────────────────────────────────────────┐
│              Go Hybrid Search Gateway                        │
│         (Orchestrates all search services)                   │
└────────────────────┬────────────────────────────────────────┘
                     │
        ┌────────────┼────────────┐
        ▼            ▼            ▼
    ┌────────┐  ┌──────────┐  ┌──────────────┐
    │PGVector│  │Elastic   │  │HMM Topic     │
    │(768d)  │  │Search    │  │Model         │
    │top-50  │  │(BM25)    │  │(Segmentation)│
    │        │  │top-50    │  │              │
    └────────┘  └──────────┘  └──────────────┘
        │            │            │
        └────────────┼────────────┘
                     ▼
        ┌────────────────────────┐
        │ MiniLM CUDA Reranker   │
        │ (Cross-encoder)        │
        │ top-7 results          │
        └────────────┬───────────┘
                     ▼
        ┌────────────────────────┐
        │ Autoencoder Service    │
        │ 768d → 128d latent     │
        │ (C++ CUDA)             │
        └────────────┬───────────┘
                     ▼
        ┌────────────────────────┐
        │ Gemma Legal Summarizer │
        │ (Holdings extraction)  │
        │ (Phase 71)             │
        └────────────┬───────────┘
                     ▼
        ┌────────────────────────┐
        │ Neo4j Citation Graph   │
        │ (Authority scoring)    │
        │ (PageRank)             │
        └────────────┬───────────┘
                     ▼
        ┌────────────────────────┐
        │ Final Legal Context    │
        │ (Holdings + Citations) │
        └────────────────────────┘
```

## Components

### 1. Drizzle ORM Schema
**File:** `sveltekit-frontend/src/lib/server/db/schema.ts`

Tables:
- `cases` - Case metadata & authority scores
- `legal_documents` - PDFs/complaints/opinions
- `chunks` - 512-token chunks with embeddings
- `legal_citations` - Statute/case references
- `holdings` - Extracted legal reasoning
- `hmm_topics` - Topic labels from HMM
- `citation_graph` - PageRank edge list

### 2. Ollama Configuration
**File:** `sveltekit-frontend/src/lib/server/config/ollama.ts`

Functions:
- `getOllamaEndpoint()` - Centralized endpoint config
- `generateEmbedding()` - Gemma embeddings
- `generateText()` - Gemma text generation
- `streamText()` - Streaming responses

### 3. MiniLM CUDA Reranker
**File:** `reranker-service/main.py`

Features:
- ONNX + CUDA + TensorRT acceleration
- Redis caching for hot queries
- Prometheus metrics
- Calls Ollama for Gemma integration
- Graceful CPU fallback

Start:
```bash
cd reranker-service
python3 main.py
# Runs on http://localhost:8000
```

### 4. Go Hybrid Search Orchestrator
**File:** `cmd/search-gateway/main.go`

Coordinates:
- PGVector semantic search (top-50)
- Elasticsearch keyword search (top-50)
- MiniLM reranking (top-7)
- Neo4j authority scoring
- Final score fusion

Start:
```bash
cd cmd/search-gateway
go run main.go
# Runs on http://localhost:8080
```

### 5. Autoencoder Service
**File:** `cpp-legal-autoencoder/legal_autoencoder_projection.cpp`

Compression:
- 768d Gemma embeddings → 128d latent
- CUDA + cuBLAS acceleration
- HTTP endpoints for encoding

Start:
```bash
cd cpp-legal-autoencoder
./legal_autoencoder_projection weights.bin
# Runs on http://localhost:8081
```

### 6. Gemma Legal Summarizer
**File:** `sveltekit-frontend/src/lib/server/services/summarization/gemma-legal-summarizer.ts`

Functions:
- `extractHolding()` - Extract legal holdings
- `extractCitations()` - Find statute/case references
- `summarizeSection()` - Summarize document sections
- `safeSummarize()` - Validate no legal advice

### 7. HMM Topic Model
**File:** `hmm-topic-service/hmm_legal_model.py`

Features:
- Viterbi algorithm for state sequence
- Legal document structure discovery
- Segment documents into topics
- Predict states for chunks

Start:
```bash
cd hmm-topic-service
python3 hmm_legal_model.py
# Runs on http://localhost:8002
```

## Environment Variables

```bash
# PostgreSQL
DATABASE_URL=postgres://legal_admin:123456@localhost:5432/legal_ai_db?sslmode=disable

# Ollama
OLLAMA_URL=http://localhost:11434
OLLAMA_MODEL=gemma:7b

# Search Services
PGVECTOR_URL=http://localhost:5432
ELASTICSEARCH_URL=http://localhost:9200
RERANKER_URL=http://localhost:8000
AUTOENCODER_URL=http://localhost:8081
NEO4J_URL=http://localhost:7687

# Redis
REDIS_URL=redis://localhost:6379/0

# Services
PORT=8080
```

## Workflow

### 1. Ingest Documents
```typescript
import { createDocumentLoader } from '$lib/server/services/ingestion/document-loader';

const loader = new DocumentLoader('./lawpdfs', 'local');
const documents = await loader.getDocuments(100, 0);
```

### 2. Generate Embeddings
```typescript
import { generateEmbedding } from '$lib/server/config/ollama';

const embedding = await generateEmbedding(chunk.text);
// Returns 768-dimensional vector
```

### 3. Store in PGVector
```typescript
import { createPGVectorSearch } from '$lib/server/services/search/pgvector-search';

const pgvector = await createPGVectorSearch(process.env.DATABASE_URL);
await pgvector.insertChunks(docId, title, [{
  text: chunk,
  embedding: embedding,
  metadata: { page: 1 }
}]);
```

### 4. Compress with Autoencoder
```bash
curl -X POST http://localhost:8081/encode \
  -H "Content-Type: application/json" \
  -d '{"embedding": [0.1, 0.2, ...]}'
# Returns 128-dimensional latent
```

### 5. Segment with HMM
```bash
curl -X POST http://localhost:8002/segment \
  -H "Content-Type: application/json" \
  -d '{"text": "...", "chunk_size": 100}'
# Returns topic labels
```

### 6. Search
```bash
curl -X POST http://localhost:8080/search \
  -H "Content-Type: application/json" \
  -d '{
    "query": "What are penalties for child abuse?",
    "embedding": [0.1, 0.2, ...],
    "top_k": 7
  }'
```

### 7. Rerank
```bash
curl -X POST http://localhost:8000/rerank \
  -H "Content-Type: application/json" \
  -d '{
    "query": "penalties for child abuse",
    "documents": ["chunk1", "chunk2", ...],
    "top_k": 7
  }'
```

### 8. Summarize
```typescript
import { extractHolding } from '$lib/server/services/summarization/gemma-legal-summarizer';

const summary = await extractHolding({
  chunk: rerankedResult.chunk
});
// Returns: { issue, holding, reasoning, citations, confidence }
```

## Performance Targets

| Component | Latency | Notes |
|-----------|---------|-------|
| PGVector search | <50ms | top-50 recall |
| Elasticsearch | <100ms | BM25 ranking |
| Merge + dedupe | <10ms | in-memory |
| MiniLM rerank | <50ms | GPU batch |
| Autoencoder | <20ms | CUDA |
| Gemma summary | <500ms | streaming |
| **Total** | **<750ms** | end-to-end |

## Monitoring

### Prometheus Metrics
```bash
curl http://localhost:8000/metrics
```

Key metrics:
- `rerank_requests_total` - Total rerank requests
- `rerank_latency_seconds` - Rerank latency histogram
- `cache_hits_total` - Redis cache hits
- `cache_misses_total` - Redis cache misses

### Health Checks
```bash
# Reranker
curl http://localhost:8000/health

# HMM
curl http://localhost:8002/health

# Search Gateway
curl http://localhost:8080/health
```

## Troubleshooting

### PGVector Connection
```bash
psql -U legal_admin -d legal_ai_db -c "SELECT 1;"
```

### Ollama Not Responding
```bash
curl http://localhost:11434/api/tags
```

### Reranker GPU Issues
```bash
python3 -c "import torch; print(torch.cuda.is_available())"
```

### Elasticsearch Down
```bash
curl http://localhost:9200/_cluster/health
```

## Next Steps

1. **Phase 72:** Context Synthesis
   - Combine reranked chunks
   - Generate legal summaries
   - Citation tracking

2. **Phase 73:** Agentic Reasoning
   - Multi-turn legal analysis
   - Tool use for statute lookup
   - Case law precedent analysis

3. **Phase 74:** Fine-tuning
   - QLoRA for legal domain
   - Custom reranker training
   - Domain-specific embeddings

## References

- [Drizzle ORM](https://orm.drizzle.team/)
- [PGVector](https://github.com/pgvector/pgvector)
- [Elasticsearch](https://www.elastic.co/)
- [MiniLM Cross-Encoder](https://huggingface.co/cross-encoder/ms-marco-MiniLM-L-12-v2)
- [Ollama](https://ollama.ai/)
- [FastAPI](https://fastapi.tiangolo.com/)
- [HMM Learning](https://hmmlearn.readthedocs.io/)
