# Legal AI Platform - Complete Project Structure

## Directory Layout

```
legal-search-system/
├── .kiro/
│   └── specs/
│       ├── legal-search-system/
│       │   ├── requirements.md                    # 11 requirements
│       │   ├── design.md                          # Architecture & design
│       │   ├── tasks.md                           # 25 implementation tasks
│       │   ├── DEPLOYMENT_CHECKLIST.md            # Production deployment
│       │   ├── LEGAL_ACTION_ENGINE.md             # AI scenarios
│       │   ├── UI_INTEGRATION_COMPLETE.md         # UI integration summary
│       │   └── FINAL_DEPLOYMENT_CHECKLIST.md      # Final checklist
│       ├── legal-taxonomy-clustering/
│       │   ├── requirements.md                    # 8 clustering requirements
│       │   ├── design.md                          # Clustering architecture
│       │   └── tasks.md                           # 17 clustering tasks
│       ├── PHASE_COMPLETION_SUMMARY.md            # Overall project summary
│       └── PROJECT_STRUCTURE.md                   # This file
│
├── sveltekit-frontend/
│   ├── src/
│   │   ├── routes/
│   │   │   ├── api/
│   │   │   │   ├── search/
│   │   │   │   │   ├── cases/
│   │   │   │   │   │   └── +server.ts             # Case search endpoint
│   │   │   │   │   └── laws/
│   │   │   │   │       └── +server.ts             # Law search endpoint
│   │   │   │   ├── ai/
│   │   │   │   │   ├── route-intent/
│   │   │   │   │   │   └── +server.ts             # Intent routing
│   │   │   │   │   ├── explain-statute/
│   │   │   │   │   │   └── +server.ts             # Statute explanation
│   │   │   │   │   ├── link-cases/
│   │   │   │   │   │   └── +server.ts             # Case linking
│   │   │   │   │   ├── highlight-clause/
│   │   │   │   │   │   └── +server.ts             # Clause highlighting
│   │   │   │   │   ├── taxonomy/
│   │   │   │   │   │   └── +server.ts             # Taxonomy exploration
│   │   │   │   │   └── memo-skeleton/
│   │   │   │   │       └── +server.ts             # Memo generation
│   │   │   │   ├── health/
│   │   │   │   │   ├── legal-search/
│   │   │   │   │   │   └── +server.ts             # Search health check
│   │   │   │   │   └── clustering/
│   │   │   │   │       └── +server.ts             # Clustering health check
│   │   │   │   └── analytics/
│   │   │   │       └── search/
│   │   │   │           └── +server.ts             # Search analytics
│   │   │   ├── laws/
│   │   │   │   ├── +layout.server.ts              # Load jurisdictions
│   │   │   │   ├── +page.svelte                   # State list
│   │   │   │   ├── [state]/
│   │   │   │   │   ├── +page.server.ts            # Load statutes by state
│   │   │   │   │   ├── +page.svelte               # Statute cards
│   │   │   │   │   └── [sectionId]/
│   │   │   │   │       ├── +page.server.ts        # Load statute details
│   │   │   │   │       └── +page.svelte           # Statute detail with UI
│   │   │   └── admin/
│   │   │       └── clustering/
│   │   │           └── +page.svelte               # Clustering dashboard
│   │   │
│   │   ├── lib/
│   │   │   ├── ai/
│   │   │   │   └── intents.ts                     # Intent classification
│   │   │   │
│   │   │   ├── client/
│   │   │   │   ├── streaming-handler.ts           # Streaming utilities
│   │   │   │   └── search-client.ts               # Type-safe search client
│   │   │   │
│   │   │   ├── stores/
│   │   │   │   └── ai-store.ts                    # AI state management
│   │   │   │
│   │   │   ├── server/
│   │   │   │   ├── db/
│   │   │   │   │   └── schema/
│   │   │   │   │       ├── legal-cases.ts         # Cases schema
│   │   │   │   │       ├── legal-laws.ts          # Laws schema
│   │   │   │   │       └── migrations/            # DB migrations
│   │   │   │   │
│   │   │   │   └── services/
│   │   │   │       ├── minio-service.ts           # MinIO operations
│   │   │   │       ├── langextract-service.ts     # LangExtract integration
│   │   │   │       ├── chunking-service.ts        # Document chunking
│   │   │   │       ├── embedding-service.ts       # Embedding generation
│   │   │   │       ├── qdrant-indexing-service.ts # Qdrant indexing
│   │   │   │       ├── elasticsearch-indexing-service.ts # ES indexing
│   │   │   │       ├── rrf-ranking-service.ts     # RRF ranking
│   │   │   │       ├── ingestion-service.ts       # Document ingestion
│   │   │   │       ├── crime-extraction-service.ts # Crime metadata
│   │   │   │       ├── agentic-functions-service.ts # LLM functions
│   │   │   │       ├── redis-echo-cache-service.ts # Echo ranking
│   │   │   │       ├── rabbitmq-clustering-service.ts # Job queue
│   │   │   │       ├── xstate-clustering-machine.ts # Orchestration
│   │   │   │       ├── som-clustering-service.ts  # SOM algorithm
│   │   │   │       ├── kmeans-clustering-service.ts # K-Means
│   │   │   │       ├── change-detection-service.ts # Change detection
│   │   │   │       ├── echo-ranking-service.ts    # Echo ranking
│   │   │   │       └── cluster-filter-service.ts  # Cluster filtering
│   │   │   │
│   │   │   └── components/
│   │   │       └── legal/
│   │   │           ├── StatuteActionPanel.svelte  # AI action buttons
│   │   │           ├── WorkspacePanel.svelte      # Workspace management
│   │   │           ├── ClusterFilterPanel.svelte  # Cluster filtering
│   │   │           └── [other legal components]
│   │   │
│   │   ├── hooks.server.ts                        # Server hooks
│   │   └── hooks.client.ts                        # Client hooks
│   │
│   └── package.json
│
├── go-microservice/
│   ├── cmd/
│   │   └── server/
│   │       └── main.go                            # Service entry point
│   │
│   ├── internal/
│   │   ├── search/
│   │   │   ├── service.go                         # Search logic
│   │   │   ├── qdrant.go                          # Qdrant client
│   │   │   └── elasticsearch.go                   # ES client
│   │   │
│   │   ├── ranking/
│   │   │   └── rrf.go                             # RRF ranking
│   │   │
│   │   └── handlers/
│   │       ├── grpc.go                            # gRPC handlers
│   │       └── rest.go                            # REST handlers
│   │
│   ├── proto/
│   │   └── search.proto                           # gRPC definitions
│   │
│   ├── go.mod
│   └── go.sum
│
├── docker-compose.yml                             # Service orchestration
├── .env.example                                   # Environment template
└── README.md                                      # Project documentation
```

## File Statistics

### SvelteKit Frontend
- **Routes**: 15+ page files
- **API Endpoints**: 10+ server endpoints
- **Components**: 7 new legal components
- **Services**: 15+ backend services
- **Stores**: 1 AI state store
- **Utilities**: 2 client utilities
- **Hooks**: 2 hook files
- **Total**: 50+ files

### Go Microservice
- **Main Service**: 1 entry point
- **Search Logic**: 3 core files
- **Handlers**: 2 handler files
- **Proto Definitions**: 1 proto file
- **Total**: 7+ files

### Documentation
- **Specs**: 3 spec directories
- **Requirements**: 3 files (11 + 8 requirements)
- **Design**: 3 files (complete architecture)
- **Tasks**: 3 files (25 + 17 tasks)
- **Guides**: 6 comprehensive guides
- **Total**: 18+ documentation files

## Technology Stack

### Frontend
- **Framework**: SvelteKit 2
- **Language**: TypeScript
- **Styling**: CSS (no framework)
- **State**: Svelte stores
- **HTTP**: Fetch API with streaming

### Backend
- **Runtime**: Node.js
- **Language**: TypeScript
- **Framework**: SvelteKit server routes
- **Database**: PostgreSQL + pgvector
- **Vector DB**: Qdrant
- **Search**: Elasticsearch
- **Cache**: Redis
- **Queue**: RabbitMQ
- **Storage**: MinIO

### Microservice
- **Language**: Go
- **RPC**: gRPC
- **REST**: Standard HTTP
- **Clients**: Qdrant, Elasticsearch

### Infrastructure
- **Containerization**: Docker
- **Orchestration**: Docker Compose
- **LLM**: Ollama (Gemma3)
- **Embeddings**: Ollama (Gemma3)

## API Endpoints

### Search Endpoints
- `GET /api/search/cases` - Search case law
- `GET /api/search/laws` - Search statutes
- `GET /api/search/suggestions` - Autocomplete
- `GET /api/search/filters` - Available filters

### AI Endpoints
- `POST /api/ai/route-intent` - Intent classification
- `POST /api/ai/explain-statute` - Statute explanation
- `POST /api/ai/link-cases` - Case linking
- `POST /api/ai/highlight-clause` - Clause highlighting
- `GET /api/ai/taxonomy` - Taxonomy exploration
- `POST /api/ai/memo-skeleton` - Memo generation

### Health Endpoints
- `GET /api/health/legal-search` - Search system health
- `GET /api/health/search` - Go service health
- `GET /api/health/clustering` - Clustering system health

### Analytics Endpoints
- `POST /api/analytics/search` - Track searches

## Data Models

### Core Entities
- **Statute**: Legal code section with embeddings
- **Case**: Court case with crime metadata
- **Chunk**: Document chunk with embeddings
- **Crime**: Crime classification metadata

### Clustering Entities
- **ClusteringJob**: Async job in queue
- **SOMGrid**: Self-Organizing Map state
- **KMeansCluster**: K-Means cluster assignment
- **ClusterLabel**: Human-readable category

### Search Entities
- **SearchResult**: Result with metadata
- **SearchFilter**: Available filter options
- **EchoRanking**: Popularity metrics

## Configuration

### Environment Variables
```env
# Database
DATABASE_URL=postgresql://...
# MinIO
MINIO_ENDPOINT=localhost:9000
MINIO_ACCESS_KEY=minioadmin
MINIO_SECRET_KEY=minioadmin
# Ollama
OLLAMA_URL=http://localhost:11434
OLLAMA_EMBEDDING_MODEL=embeddinggemma:latest
OLLAMA_LLM_MODEL=gemma3-legal:latest
# Search Services
QDRANT_URL=http://localhost:6333
ELASTICSEARCH_URL=http://localhost:9200
REDIS_URL=redis://localhost:6379
RABBITMQ_URL=amqp://guest:guest@localhost:5672
# Go Microservice
GO_MICROSERVICE_URL=http://localhost:8080
GRPC_PORT=50051
REST_PORT=8080
# Clustering
CLUSTERING_ENABLED=true
CLUSTERING_SOM_WIDTH=10
CLUSTERING_SOM_HEIGHT=10
CLUSTERING_K_MEANS_K=8
CLUSTERING_CONFIDENCE_THRESHOLD=0.7
CLUSTERING_CHANGE_THRESHOLD=0.2
```

## Deployment

### Docker Services
- PostgreSQL 15 + pgvector
- MinIO (S3-compatible storage)
- Qdrant (vector database)
- Elasticsearch (full-text search)
- Redis (caching)
- RabbitMQ (message queue)
- Ollama (LLM inference)

### Deployment Steps
1. Clone repository
2. Install dependencies
3. Configure environment variables
4. Run `docker-compose up -d`
5. Initialize database
6. Start SvelteKit dev server
7. Start Go microservice
8. Verify health endpoints

## Testing

### Unit Tests (Optional)
- SOM algorithm tests
- K-Means clustering tests
- Change detection tests
- Echo ranking tests

### Integration Tests (Optional)
- End-to-end clustering workflow
- Search with clustering filters
- Memo generation workflow
- Change detection and alerts

### Performance Tests (Optional)
- SOM training throughput
- K-Means convergence time
- Search latency benchmarks
- Clustering job performance

## Monitoring

### Metrics
- Search latency (p50/p95/p99)
- Clustering job success rate
- Average retry count
- Cluster quality metrics
- Echo hit distribution

### Logging
- Request/response logging
- Error tracking
- Performance monitoring
- Change detection alerts

### Health Checks
- Database connectivity
- Vector DB status
- Search service status
- Clustering system status

---

**Last Updated**: November 21, 2025
**Status**: Production Ready
**Next Phase**: Legal Taxonomy Clustering Implementation
