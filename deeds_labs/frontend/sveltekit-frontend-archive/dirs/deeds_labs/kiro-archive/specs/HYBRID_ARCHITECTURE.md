# Hybrid Architecture: Python Gateway + Go Inference

## Overview

**C) Hybrid: Python gateway → Go inference** provides the optimal balance between:
- **Python's flexibility** – REST API, validation, orchestration, data processing
- **Go's performance** – High-throughput inference, gRPC, QUIC, concurrent processing

---

## Architecture Diagram

```
┌─────────────────────────────────────────────────────────────┐
│                    SvelteKit Frontend                        │
│                    (YoRHa PWA, SSR)                          │
└─────────────────────────────────────────────────────────────┘
                            ↓ REST/HTTP
┌─────────────────────────────────────────────────────────────┐
│              Python FastAPI Gateway (Port 8003)              │
├─────────────────────────────────────────────────────────────┤
│  ✅ REST API endpoints (21 total)                           │
│  ✅ Request validation & transformation                     │
│  ✅ Audit logging & compliance                              │
│  ✅ Session management & auth                               │
│  ✅ Data orchestration                                      │
│  ✅ Error handling & retries                                │
│  ✅ Rate limiting & caching                                 │
└─────────────────────────────────────────────────────────────┘
        ↓ gRPC/QUIC                    ↓ HTTP
┌──────────────────────────┐  ┌──────────────────────────┐
│   Go Inference Server    │  │  Go QUIC Gateway         │
│   (Port 50051)           │  │  (Port 4433)             │
├──────────────────────────┤  ├──────────────────────────┤
│ ✅ Embedding generation  │  │ ✅ Low-latency streaming │
│ ✅ Vector search (HNSW)  │  │ ✅ Connection pooling    │
│ ✅ Reranking (MiniLM)    │  │ ✅ Multiplexing          │
│ ✅ LLM inference         │  │ ✅ 0-RTT resumption      │
│ ✅ Concurrent processing │  │ ✅ UDP-based transport   │
│ ✅ GPU acceleration      │  │ ✅ Binary protocol       │
└──────────────────────────┘  └──────────────────────────┘
        ↓ Internal APIs
┌─────────────────────────────────────────────────────────────┐
│              PostgreSQL 17 + pgvector                        │
│              Redis (caching)                                 │
│              MinIO (storage)                                 │
│              Elasticsearch (search)                          │
└─────────────────────────────────────────────────────────────┘
```

---

## Component Breakdown

### Python FastAPI Gateway (Port 8003)

**Responsibilities:**
- REST API endpoint handling
- Request validation & transformation
- Audit logging & compliance
- Session management & authentication
- Data orchestration
- Error handling & retries
- Rate limiting & caching
- Business logic

**Services:**
- `evidence_crud.py` – Evidence CRUD operations
- `tags_crud.py` – Citation tags management
- `rag_search.py` – RAG search orchestration
- `audit_routes.py` – Audit log queries
- `validators.py` – Input validation
- `audit_service.py` – Audit logging

**Endpoints:** 21 REST endpoints

**Protocol:** HTTP/REST

---

### Go Inference Server (Port 50051)

**Responsibilities:**
- High-performance inference
- Vector operations (HNSW)
- Embedding generation
- Reranking (MiniLM)
- LLM inference
- Concurrent processing
- GPU acceleration

**Services:**
- Embedding service (embeddinggemma)
- Vector search (HNSW)
- Reranking service (MiniLM TensorRT)
- LLM inference (Ollama)
- Concurrent task orchestration

**Protocol:** gRPC (binary, efficient)

**Performance:**
- Embedding: 4–12ms
- Vector search: 12–30ms
- Reranking: 6–18ms
- LLM inference: 180–650ms

---

### Go QUIC Gateway (Port 4433)

**Responsibilities:**
- Low-latency streaming
- Connection pooling
- Multiplexing
- 0-RTT resumption
- Binary protocol optimization

**Features:**
- UDP-based transport (faster than TCP)
- Multiplexed streams
- Connection reuse
- Early data (0-RTT)
- Congestion control

**Use Cases:**
- Streaming LLM responses
- Real-time search results
- Live citation updates
- Bidirectional communication

---

## Data Flow

### Evidence Upload Flow

```
Frontend (SvelteKit)
    ↓ POST /api/evidence (multipart)
Python Gateway
    ├─ Validate file (jurisdiction, type, size)
    ├─ Store in MinIO
    ├─ Create evidence_files record
    ├─ Trigger chunking (LangExtract)
    ├─ Call Go Inference Server (gRPC)
    │   ├─ Generate embeddings (embeddinggemma)
    │   └─ Extract entities
    ├─ Store embeddings in pgvector
    ├─ Add to RAG index
    ├─ Log to audit_log
    └─ Return response
```

### RAG Search Flow

```
Frontend (SvelteKit)
    ↓ POST /api/rag/search
Python Gateway
    ├─ Validate query & jurisdiction
    ├─ Call Go Inference Server (gRPC)
    │   ├─ Embed query (embeddinggemma)
    │   ├─ Vector search (HNSW)
    │   └─ Rerank results (MiniLM)
    ├─ Search Elasticsearch (BM25)
    ├─ Merge & deduplicate
    ├─ Apply tag weighting
    ├─ Format LLM prompt
    ├─ Call Go Inference Server (gRPC)
    │   └─ Generate LLM response
    ├─ Validate citations
    ├─ Log to audit_log
    └─ Return response
```

### Streaming Flow

```
Frontend (SvelteKit)
    ↓ POST /api/rag/search/stream
Python Gateway
    ├─ Validate query & jurisdiction
    ├─ Call Go QUIC Gateway (QUIC)
    │   ├─ Embed query
    │   ├─ Vector search
    │   ├─ Rerank results
    │   └─ Stream LLM tokens
    ├─ Validate citations (per token)
    ├─ Stream to frontend
    └─ Log to audit_log
```

---

## Communication Protocols

### Python ↔ Go Inference (gRPC)

**Advantages:**
- Binary protocol (efficient)
- Strongly typed (protobuf)
- Multiplexing (multiple requests)
- Streaming support
- Low latency

**Services:**
```protobuf
service InferenceService {
  rpc GenerateEmbeddings(EmbeddingRequest) returns (EmbeddingResponse);
  rpc SearchVectors(SearchRequest) returns (SearchResponse);
  rpc RerankResults(RerankRequest) returns (RerankResponse);
  rpc GenerateLLM(LLMRequest) returns (LLMResponse);
  rpc StreamLLM(LLMRequest) returns (stream LLMToken);
}
```

### Python ↔ Go QUIC (QUIC)

**Advantages:**
- UDP-based (lower latency)
- Multiplexed streams
- 0-RTT resumption
- Connection migration
- Better for streaming

**Use Cases:**
- Streaming LLM responses
- Real-time search results
- Live updates

---

## Performance Characteristics

### Latency Breakdown

| Component | Time (ms) | Protocol |
|-----------|-----------|----------|
| Python validation | 1–3 | HTTP |
| gRPC overhead | 0.5–1 | gRPC |
| Embedding (Go) | 4–12 | gRPC |
| Vector search (Go) | 12–30 | gRPC |
| Reranking (Go) | 6–18 | gRPC |
| LLM inference (Go) | 180–650 | gRPC |
| **Total (non-streaming)** | **203–714** | **gRPC** |
| **First token (streaming)** | **250–350** | **QUIC** |

### Throughput

| Metric | Value |
|--------|-------|
| Concurrent gRPC connections | 100+ |
| Concurrent QUIC streams | 1000+ |
| Requests/second (Python) | 50–100 |
| Inference/second (Go) | 100–200 |
| Tokens/second (LLM) | 20–50 |

### Resource Usage

| Component | CPU | Memory | GPU |
|-----------|-----|--------|-----|
| Python Gateway | 10–20% | 500MB–1GB | None |
| Go Inference | 30–50% | 2–4GB | 80–95% |
| Total | 40–70% | 2.5–5GB | 80–95% |

---

## Deployment Architecture

### Docker Compose

```yaml
services:
  # Frontend
  sveltekit:
    image: sveltekit-frontend:latest
    ports:
      - "3000:3000"
    depends_on:
      - python-gateway

  # Python Gateway
  python-gateway:
    image: python-gateway:latest
    ports:
      - "8003:8003"
    environment:
      - GO_INFERENCE_URL=grpc://go-inference:50051
      - GO_QUIC_URL=quic://go-quic:4433
    depends_on:
      - go-inference
      - postgres
      - redis
      - minio
      - elasticsearch

  # Go Inference Server
  go-inference:
    image: go-inference:latest
    ports:
      - "50051:50051"
    environment:
      - OLLAMA_URL=http://ollama:11434
      - EMBEDDING_MODEL=embeddinggemma:latest
    depends_on:
      - ollama

  # Go QUIC Gateway
  go-quic:
    image: go-quic:latest
    ports:
      - "4433:4433"
    environment:
      - INFERENCE_URL=grpc://go-inference:50051

  # Infrastructure
  postgres:
    image: postgres:17-alpine
    environment:
      - POSTGRES_DB=legal_ai
      - POSTGRES_PASSWORD=password
    volumes:
      - postgres_data:/var/lib/postgresql/data

  redis:
    image: redis:7-alpine

  minio:
    image: minio/minio:latest
    ports:
      - "9000:9000"
    volumes:
      - minio_data:/data

  elasticsearch:
    image: docker.elastic.co/elasticsearch/elasticsearch:8.0.0
    environment:
      - discovery.type=single-node

  ollama:
    image: ollama/ollama:latest
    ports:
      - "11434:11434"
    volumes:
      - ollama_data:/root/.ollama
```

---

## Scaling Strategy

### Horizontal Scaling

**Python Gateway:**
- Multiple instances behind load balancer
- Stateless (session in Redis)
- Auto-scale based on CPU/memory

**Go Inference:**
- Multiple instances with connection pooling
- Load balance gRPC connections
- Auto-scale based on GPU utilization

**Go QUIC:**
- Multiple instances for streaming
- Connection migration between instances
- Auto-scale based on concurrent streams

### Vertical Scaling

**Python Gateway:**
- Increase CPU/memory for request handling
- Add Redis cluster for caching

**Go Inference:**
- Add GPU (RTX 3060 Ti → RTX 4090)
- Increase CPU cores for parallelization
- Increase memory for model caching

---

## Monitoring & Observability

### Metrics

**Python Gateway:**
- Request latency (p50, p95, p99)
- Error rate
- Cache hit rate
- Audit log entries

**Go Inference:**
- gRPC latency (p50, p95, p99)
- GPU utilization
- Memory usage
- Inference throughput

**Go QUIC:**
- Connection count
- Stream count
- Packet loss
- RTT

### Logging

**Python Gateway:**
- Request/response logs
- Audit trail
- Error logs
- Performance metrics

**Go Inference:**
- Inference logs
- GPU metrics
- Error logs
- Performance metrics

### Tracing

- Distributed tracing (OpenTelemetry)
- Request correlation IDs
- End-to-end latency tracking

---

## Security

### Authentication

- JWT tokens (Python Gateway)
- mTLS for gRPC (Go Inference)
- TLS 1.3 for QUIC (Go QUIC)

### Authorization

- Role-based access control (RBAC)
- Jurisdiction-based scoping
- Audit logging for all operations

### Data Protection

- Encryption at rest (PostgreSQL)
- Encryption in transit (TLS/mTLS)
- Data residency by jurisdiction

---

## Roadmap Integration

### Phases 1–25 (Current)
- ✅ Python Gateway (REST API)
- ✅ PostgreSQL + pgvector
- ✅ Basic inference (Python)

### Phases 26–30 (Next)
- 🚧 Go Inference Server (gRPC)
- 🚧 Go QUIC Gateway
- 🚧 Streaming optimization

### Phases 31–40
- ⏳ Multi-GPU scaling
- ⏳ Advanced load balancing
- ⏳ Connection pooling

### Phases 41–50
- ⏳ Distributed inference
- ⏳ Model sharding
- ⏳ Inference caching

### Phases 51–70
- ⏳ TensorRT optimization
- ⏳ Triton inference server
- ⏳ GPU cluster orchestration

---

## Migration Path

### Phase 1: Parallel Deployment
- Deploy Go Inference alongside Python
- Python calls Go via gRPC
- Gradual traffic migration

### Phase 2: Streaming Integration
- Deploy Go QUIC Gateway
- Enable streaming endpoints
- Monitor performance

### Phase 3: Full Hybrid
- All inference through Go
- Python handles orchestration only
- Optimize communication

### Phase 4: Advanced Optimization
- Connection pooling
- Request batching
- Model caching

---

## Conclusion

The **Hybrid Architecture (Python Gateway + Go Inference)** provides:

✅ **Best of both worlds** – Python's flexibility + Go's performance
✅ **Optimal latency** – 203–714ms non-streaming, 250–350ms streaming
✅ **High throughput** – 50–100 req/s (Python), 100–200 inf/s (Go)
✅ **Scalability** – Horizontal scaling for both components
✅ **Maintainability** – Clear separation of concerns
✅ **Future-proof** – Easy to add TensorRT, Triton, multi-GPU

This architecture supports the complete 70-phase roadmap while maintaining optimal performance and flexibility.

