# Go Legal Library Search Service

Single-binary Go microservice providing parallel legal library search with RRF fusion across 4 retrieval strategies.

## Architecture

```
┌─────────────────────────────────────────────────┐
│             LibrarySearchService                │
│                                                 │
│  gRPC :50055          HTTP :8096                │
│  ├─ SearchLibrary     ├─ POST /search           │
│  ├─ StreamLibrary     ├─ GET  /health           │
│  ├─ GetDocumentToc    ├─ GET  /suggest?q=       │
│  ├─ GetNodeContext    ├─ GET  /toc/:id          │
│  ├─ ResolveCitation   ├─ GET  /node/:id         │
│  └─ Health            └─ POST /citation         │
└────────┬──────┬──────┬──────┬───────────────────┘
         │      │      │      │
    ┌────▼┐ ┌──▼──┐ ┌▼────┐ ┌▼─────┐
    │ PG  │ │Redis│ │Qdrant│ │Ollama│
    │5434 │ │6379 │ │6333/ │ │11434 │
    │     │ │     │ │6334  │ │      │
    └─────┘ └─────┘ └─────┘ └──────┘
```

## Search Strategy (Parallel Fan-Out + RRF)

Every search request fires 4 strategies simultaneously, then fuses results with Reciprocal Rank Fusion:

| Strategy | Source | Weight | Method |
|----------|--------|--------|--------|
| **Citation** | PostgreSQL `legal_nodes.citation_label` | 1.0 | ILIKE pattern match |
| **FTS** | PostgreSQL `legal_chunks.tsv` | 0.4 (default) | GIN `plainto_tsquery` |
| **pgvector** | PostgreSQL `legal_chunks.embedding` | 0.6 (default) | Cosine `<=>` via 768-dim |
| **Qdrant** | `legal_documents` collection | 0.5 | BM42 hybrid → dense fallback → REST fallback |

### Qdrant Search Cascade
1. **Hybrid (BM42)**: Dense + sparse prefetch with server-side RRF fusion via native gRPC
2. **Dense-only**: If collection lacks `bm25` sparse vectors, falls back to dense ANN
3. **REST fallback**: If gRPC client unavailable, uses HTTP search endpoint

### RRF Fusion
Uses `k=60` constant: `score = weight / (k + rank)`. Results from all strategies are merged by `chunk_id`, best metadata wins, sorted by fused score.

## Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `DATABASE_URL` | `postgresql://legal_admin:123456@localhost:5434/legal_ai_db` | PostgreSQL connection string |
| `QDRANT_URL` | `http://localhost:6333` | Qdrant REST endpoint |
| `QDRANT_GRPC_HOST` | `localhost` | Qdrant gRPC host |
| `QDRANT_GRPC_PORT` | `6334` | Qdrant gRPC port |
| `REDIS_URL` | `redis://localhost:6379` | Redis (optional, caching) |
| `OLLAMA_URL` | `http://localhost:11434` | Ollama API for embeddings |
| `GRPC_PORT` | `50055` | gRPC listen port |
| `HTTP_PORT` | `8096` | HTTP listen port |

## Dependencies

- **Go 1.24** with modules
- `jackc/pgx/v5` — PostgreSQL connection pool
- `qdrant/go-client` — Native Qdrant gRPC client (v1.15.2)
- `redis/go-redis/v9` — Redis caching
- `google.golang.org/grpc` — gRPC server + reflection

## Database Tables Used

```
library_documents  — corpus metadata (title, corpus_type, source_type, jurisdiction_id)
legal_nodes        — hierarchical document structure (heading, citation_label, node_path, depth)
legal_chunks       — text chunks with tsv GIN index + embedding pgvector column
jurisdictions      — jurisdiction code/name lookup
```

## Proto Definition

Source: `proto/active/library_search.proto`
Generated: `proto/libsearch/library_search.pb.go` + `library_search_grpc.pb.go`
Regenerate: `./generate.sh`

### RPC Methods

```protobuf
service LibrarySearchService {
  rpc SearchLibrary(LibrarySearchRequest) returns (LibrarySearchResponse);
  rpc StreamLibrary(LibrarySearchRequest) returns (stream LibrarySearchEvent);
  rpc GetDocumentToc(TocRequest) returns (TocResponse);
  rpc GetNodeContext(NodeContextRequest) returns (NodeContextResponse);
  rpc ResolveCitation(CitationRequest) returns (CitationResponse);
  rpc Health(HealthRequest) returns (HealthResponse);
}
```

## Running

### Local (requires Go 1.24+)

```bash
cd services/go-search-service
go run .
```

### Via npm script (from repo root)

```bash
npm --prefix sveltekit-frontend run go:search:service
```

### Via VS Code task

Task: `🚀 Local: Start Go Search gRPC`

### Docker

```bash
docker build -t go-search-service services/go-search-service/
docker run -p 8096:8096 -p 50055:50055 \
  -e DATABASE_URL="postgresql://legal_admin:123456@host.docker.internal:5434/legal_ai_db" \
  -e QDRANT_URL="http://host.docker.internal:6333" \
  -e QDRANT_GRPC_HOST="host.docker.internal" \
  go-search-service
```

## Health Check

```bash
# HTTP
curl http://localhost:8096/health

# gRPC (via project CLI)
npm --prefix sveltekit-frontend run grpc:health:retrieval
```

### Health Response

```json
{
  "status": "healthy|degraded|unhealthy",
  "pgvectorConnected": true,
  "qdrantConnected": true,
  "redisConnected": true,
  "embeddingServiceUp": true,
  "indexedDocuments": 42,
  "indexedChunks": 1580,
  "timestamp": 1712505600
}
```

**Status rules**: `unhealthy` if Postgres down, `degraded` if Redis or Qdrant down, `healthy` otherwise.

## Known Issues

- **Qdrant gRPC port 6334 not exposed** on the current `phase66-qdrant` Docker container — only 6333 (REST) is published. The Go service falls back to REST search but reports `qdrantConnected: false` and `status: degraded`. Fix: recreate the container with `-p 6334:6334`.
- **Embedding caching**: Query embeddings cached in Redis with 24h TTL key `embed:search:<query>`. If Redis is down, every search re-computes embeddings.
- **BM42 sparse vectors**: Uses FNV-1a hashing matching the TypeScript `bm42-sparse.ts` implementation. Includes basic English stopwords but no legal-domain boost (unlike the TS version which has 2x legal term weight).

## File Structure

```
services/go-search-service/
├── main.go              — All service code (~1660 lines, single-file)
├── Dockerfile           — Multi-stage Alpine build (CGO_ENABLED=0)
├── go.mod / go.sum      — Module dependencies
├── generate.sh          — Proto regeneration script
└── proto/libsearch/     — Generated gRPC stubs
    ├── library_search.pb.go
    └── library_search_grpc.pb.go
```
