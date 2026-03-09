# Production Crawl-to-Serve Pipeline Architecture

## 🏗️ **Architecture Overview**

```
┌─────────────────────────────────────────────────────────────────────────────────┐
│                          PRODUCTION PIPELINE ARCHITECTURE                        │
├─────────────────────────────────────────────────────────────────────────────────┤
│                                                                                 │
│  [1] INGESTION LAYER                [2] PROCESSING LAYER        [3] SERVING     │
│  ┌─────────────────┐                ┌─────────────────┐         LAYER           │
│  │   Web Crawler   │───RabbitMQ────▶│   Node Workers  │    ┌─────────────────┐  │
│  │   PDF Upload    │                │  ┌─────────────┐ │    │  Go gRPC Gateway│  │
│  │   API Endpoint  │                │  │   OCR       │ │    │  ┌─────────────┐│  │
│  └─────────────────┘                │  │   Tesseract │ │    │  │HTTP/3 QUIC  ││  │
│                                      │  └─────────────┘ │    │  │   Caddy     ││  │
│  [4] STORAGE LAYER                   │  ┌─────────────┐ │    │  └─────────────┘│  │
│  ┌─────────────────┐                │  │ Embedding   │ │    └─────────────────┘  │
│  │  PostgreSQL     │◀───────────────│  │   Ollama    │ │           │             │
│  │  + pgvector     │                │  │ nomic-embed │ │           │             │
│  │  + Drizzle ORM  │                │  └─────────────┘ │           ▼             │
│  └─────────────────┘                │  ┌─────────────┐ │    ┌─────────────────┐  │
│                                      │  │  Chunking   │ │    │  SvelteKit UI   │  │
│  ┌─────────────────┐                │  │   Strategy  │ │    │  + xState       │  │
│  │     MinIO       │◀───────────────│  └─────────────┘ │    │  + Legal Forms  │  │
│  │ Object Storage  │                └─────────────────┘    └─────────────────┘  │
│  │   (Blobs)       │                                                           │
│  └─────────────────┘                [5] CACHING LAYER                          │
│                                      ┌─────────────────┐                        │
│  ┌─────────────────┐                │     Redis       │                        │
│  │    RabbitMQ     │                │  ┌─────────────┐ │                        │
│  │  Job Queues     │                │  │Search Cache │ │                        │
│  │  ┌─────────────┐│                │  │Query Cache  │ │                        │
│  │  │crawl_queue  ││                │  │Blob Cache   │ │                        │
│  │  │ocr_queue    ││                │  │Session Data │ │                        │
│  │  │embed_queue  ││                │  └─────────────┘ │                        │
│  │  └─────────────┘│                └─────────────────┘                        │
│  └─────────────────┘                                                           │
│                                                                                 │
└─────────────────────────────────────────────────────────────────────────────────┘
```

## 📊 **Data Flow Sequence**

1. **Ingestion**: URL/PDF → RabbitMQ `crawl_queue`
2. **Crawling**: Node Worker pulls job → Downloads content → Stores in MinIO
3. **OCR Processing**: Tesseract extracts text → Chunks strategically
4. **Embedding**: Ollama generates vectors → Stores in PostgreSQL+pgvector
5. **Indexing**: Creates searchable metadata → Updates cache keys
6. **Serving**: gRPC Gateway → Redis cache check → HTTP/3 response
7. **Frontend**: SvelteKit UI → xState orchestration → Real-time updates

## 🎯 **Key Features**

- **Non-blocking**: UI remains responsive during processing
- **Scalable**: Horizontal worker scaling via RabbitMQ
- **Fast**: Multi-tier caching (Redis + pgvector indexes)
- **Modern**: HTTP/3 QUIC, gRPC, Drizzle ORM
- **Legal-focused**: Document classification, compliance metadata
- **Production-ready**: Error handling, monitoring, recovery

## 📈 **Performance Targets**

- **Crawl Speed**: 50-100 pages/minute per worker
- **OCR Throughput**: 5-10 documents/minute per worker  
- **Embedding Generation**: 100-500 chunks/minute
- **Search Latency**: <100ms (cached), <500ms (database)
- **Cache Hit Ratio**: >80% for frequently accessed documents

## 🔧 **Technology Stack**

- **Database**: PostgreSQL 17 + pgvector + Drizzle ORM
- **Caching**: Redis 7+ with streams and pub/sub
- **Storage**: MinIO S3-compatible object storage
- **Queue**: RabbitMQ with dead letter queues
- **Workers**: Node.js with cluster support
- **Gateway**: Go gRPC with HTTP/3 support
- **Proxy**: Caddy 2+ with automatic HTTPS
- **Frontend**: SvelteKit 2+ with xState machines
- **OCR**: Tesseract.js + native binaries
- **Embeddings**: Ollama nomic-embed-text (384-dim)

---

*Next: Implementation details for each component...*