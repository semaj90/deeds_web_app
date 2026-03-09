# 🔗 Service Dependency Graph Visualization

**Legal AI Platform - Microservices Architecture Analysis**
**Generated:** 2025-10-17
**Total Services:** 52 | **Total Dependencies:** 286

---

## 📊 Quick Overview

This comprehensive visualization system provides real-time insights into the legal AI platform's 52 microservices and their 286 dependencies across a sophisticated distributed architecture.

### Architecture Composition
- **Frontend:** 1 SvelteKit application (port 5173)
- **Core Services:** 6 critical backend services
- **GPU Acceleration:** 4 CUDA-optimized services
- **Vector/Search:** 3 vector processing services
- **AI/ML:** 7 specialized AI services
- **Infrastructure:** 12 gateway, proxy, and load balancing services
- **Data Management:** 2 ingestion and processing services
- **Observability:** 4 monitoring and logging services
- **Security:** 3 authentication and security services
- **Data Stores:** 7 databases and caching layers (PostgreSQL, Redis, Qdrant, MinIO, RabbitMQ, Neo4j, Ollama)

---

## 🎯 Key Service Categories

### Tier 1: Core Services (Always Running)
Critical services that form the backbone of the system:

| Service | Port | Protocol | Dependencies | Role |
|---------|------|----------|--------------|------|
| **enhanced-rag** | 8094 | HTTP/QUIC | Qdrant, PostgreSQL, MinIO, RabbitMQ, Ollama | RAG pipeline with GPU acceleration |
| **upload-service** | 8093 | HTTP | MinIO, RabbitMQ, PostgreSQL | File upload and processing |
| **kratos-server** | 50051 | gRPC | PostgreSQL, Qdrant, RabbitMQ | Legal gRPC computing |
| **recommendation-engine** | 8100 | HTTP/WebSocket | PostgreSQL, Neo4j, Redis, Ollama | AI recommendations & self-prompting |
| **xstate-manager** | 8098 | HTTP/WebSocket | Redis, RabbitMQ | State machine orchestration |
| **advanced-cuda** | 8095 | HTTP/QUIC/gRPC | Qdrant, PostgreSQL, RabbitMQ | CUDA + FlashAttention |

### Tier 2: GPU & AI Services
Specialized AI and GPU-accelerated processing:

**GPU Services:**
- `advanced-cuda` (8095) - Kernel splicing, attention mechanisms
- `cuda-worker` (8107) - Worker pool for GPU tasks
- `cuda-ai-service` (8114) - CUDA AI operations
- `gpu-indexer` (8104) - GPU document indexing

**AI Services:**
- `legal-ai` (8124) - Legal document analysis
- `t5-transformer` (8122) - T5 model serving
- `live-agent` (8123) - Real-time AI agent
- `multi-core-ollama` (8125) - Ollama cluster management
- `context7-error` (8105) - Error analysis & auto-fix

### Tier 3: Vector & Search Services
Distributed vector processing and similarity search:

- `vector-service` (8101) - Primary similarity search
- `vector-consumer` (8108) - Batch vector processing
- `vector-redis` (8111) - Redis-backed caching
- `vector-service-go125` (8115) - Go 1.25 optimized

### Tier 4: Infrastructure & Gateways
Protocol gateways, load balancing, and request routing:

| Service | Port | Protocol | Capability |
|---------|------|----------|-----------|
| `load-balancer` | 8102 | HTTP/QUIC | Request routing & failover |
| `http-gateway` | 8119 | HTTP | HTTP routing |
| `grpc-gateway` | 8120 | gRPC | gRPC transcoding |
| `websocket-service` | 8121 | WebSocket | Real-time events |
| `quic-gateway` | 8106 | QUIC | Ultra-low latency |
| `cluster-manager` | 8103 | HTTP/gRPC | Service discovery |

### Tier 5: Data Stores & Queues
Persistent storage, caching, and async processing:

| Service | Port | Purpose | Type |
|---------|------|---------|------|
| **PostgreSQL** | 5432 | Relational DB + pgvector | Persistence |
| **Qdrant** | 6333 | Vector database | Vector search |
| **Redis** | 6379 | Cache & session store | Caching |
| **MinIO** | 9000 | Object storage (S3-compatible) | Document storage |
| **RabbitMQ** | 5672 | Message queue | Async jobs |
| **Neo4j** | 7687 | Graph database | Relationships |
| **Ollama** | 11434 | Local LLM | AI inference |

---

## 📈 Dependency Statistics

### Service Type Distribution
```
Infrastructure:     12 services (23%)
AI/ML:             7 services (13%)
Core:              6 services (12%)
GPU:               4 services (8%)
Observability:     4 services (8%)
Vector:            3 services (6%)
Cache:             3 services (6%)
Data Stores:       7 services (13%)
Security:          3 services (6%)
Other:             2 services (4%)
```

### Protocol Distribution
```
HTTP:              41 services (79%)
gRPC:              7 services (13%)
QUIC:              7 services (13%)
WebSocket:         4 services (8%)
PostgreSQL:        1 service
Redis:             1 service
AMQP (RabbitMQ):   1 service
Bolt (Neo4j):      1 service
```

### Dependency Metrics
- **Total Dependencies:** 286
- **Average Dependencies per Service:** 5.5
- **Most Connected Services:** frontend (10 dependencies)
- **Most Critical Services:** Loads distributed across core tier

---

## 🔴 Critical Service Dependencies

### Frontend → Backend Dependencies
SvelteKit frontend depends on 10 backend services:
```
sveltekit-frontend → {
  postgres,
  redis,
  qdrant,
  minio,
  rabbitmq,
  neo4j,
  ollama,
  enhanced-rag,
  xstate-manager,
  recommendation-engine
}
```

### Core Service Chains

**RAG Pipeline Chain:**
```
frontend
  → enhanced-rag
    → qdrant, postgres, minio, rabbitmq, ollama
      → ollama (inference)
      → postgres (persistence)
      → qdrant (vector search)
      → minio (document storage)
```

**Upload & Processing Chain:**
```
frontend
  → upload-service
    → minio, rabbitmq, postgres
      → rabbitmq (queue jobs)
        → cuda-worker (GPU processing)
          → qdrant (store embeddings)
          → postgres (metadata)
```

**Recommendation Chain:**
```
frontend
  → recommendation-engine
    → postgres, neo4j, redis, ollama
      → neo4j (graph queries)
      → ollama (AI generation)
      → redis (cache results)
```

---

## 🛠️ Accessing the Visualizations

### 1. Interactive Web Dashboard
```bash
# Start SvelteKit dev server
npm run dev

# Open in browser
http://localhost:5173/admin/service-graph
```

**Features:**
- Real-time service health status (🟢 healthy, 🟡 degraded, 🔴 unhealthy)
- Service dependency graph with filtering
- Click any service to see details, dependencies, and capabilities
- Export data as JSON or CSV
- Auto-refresh health status (5-second interval)

### 2. Mermaid Diagram
View/edit the architecture diagram:
```bash
# View in VS Code
code docs/service-dependency-graphs/architecture.mmd

# Or render online at https://mermaid.live
# Copy contents of architecture.mmd and paste into Mermaid Live Editor
```

### 3. Graphviz DOT Format
Generate PNG/SVG from DOT:
```bash
# Install graphviz first
brew install graphviz  # macOS
sudo apt-get install graphviz  # Linux

# Generate PNG
dot -Tpng docs/service-dependency-graphs/architecture.dot -o architecture.png

# Generate SVG
dot -Tsvg docs/service-dependency-graphs/architecture.dot -o architecture.svg
```

### 4. JSON Data
Machine-readable format for analysis:
```bash
cat docs/service-dependency-graphs/architecture.json | jq .

# Query specific services
cat docs/service-dependency-graphs/architecture.json | jq '.nodes[] | select(.type=="gpu")'

# Analyze dependencies
cat docs/service-dependency-graphs/architecture.json | jq '.edges | group_by(.source) | map({service: .[0].source, dependencies: map(.target) | unique})'
```

### 5. Statistics Report
```bash
cat docs/service-dependency-graphs/statistics.json | jq .
```

---

## 🔍 API Endpoints

### Service Graph API

#### GET /api/admin/service-graph
Returns complete service dependency graph.

**Query Parameters:**
- `includeHealth=true` - Include real-time health status (adds 5s latency)

**Response:**
```json
{
  "nodes": [
    {
      "id": "enhanced-rag",
      "type": "core",
      "port": 8094,
      "protocol": "http",
      "capabilities": ["ai", "rag", "gpu"],
      "dependsOn": ["qdrant", "postgres", "minio"],
      "health": "healthy",
      "responseTime": 25,
      "uptime": 99.9
    }
  ],
  "edges": [
    {
      "source": "enhanced-rag",
      "target": "qdrant",
      "type": "depends_on"
    }
  ],
  "metadata": {
    "totalServices": 52,
    "totalConnections": 286,
    "generated": "2025-10-17T..."
  }
}
```

#### POST /api/admin/service-graph/analyze
Analyze dependencies and service criticality.

**Request Body:**
```json
{
  "serviceId": "enhanced-rag",
  "depth": 2
}
```

**Response:**
```json
{
  "service": "enhanced-rag",
  "directDependencies": ["qdrant", "postgres", "minio", "rabbitmq", "ollama"],
  "directDependents": ["sveltekit-frontend"],
  "transitiveDependencies": ["..."],
  "dependencyDepth": 2
}
```

#### GET /api/admin/service-health?service={serviceId}
Check individual service health.

**Response:**
```json
{
  "status": "healthy",
  "responseTime": 25,
  "uptime": 99.9
}
```

---

## 📋 Service Breakdown by Dependency Count

### Most Connected Services (Critical)
1. **sveltekit-frontend** - 10 dependencies
2. **enhanced-rag** - 5 dependencies
3. **recommendation-engine** - 4 dependencies
4. **postgres** - Depended on by 27 services (highest criticality)
5. **qdrant** - Depended on by 19 services
6. **rabbitmq** - Depended on by 15 services
7. **redis** - Depended on by 12 services

### Services with No Dependencies
(Pure infrastructure/data stores)
- postgres, qdrant, redis, minio, rabbitmq, neo4j, ollama
- load-balancer, cluster-manager, module-manager
- http-gateway, grpc-gateway, websocket-service, quic-gateway
- metrics-collector, log-aggregator, health-monitor, alert-manager
- security-scanner

---

## 🚀 Optimizations Based on Graph Analysis

### 1. Load Balancing Strategy
- `load-balancer` (8102) distributes traffic across replicated services
- Go 1.25 optimized replicas available for: enhanced-rag, upload-service, load-balancer
- QUIC replicas available for: advanced-cuda, rag-quic-go125

### 2. Failover Paths
```
frontend (failures)
  → multi-core-ollama (failover)
  → enhanced-rag (primary) + enhanced-rag-go125 (replica)
```

### 3. Caching Layers
- **Layer 1:** Redis (6379) - Session and fast cache
- **Layer 2:** dimensional-cache (8097) - Multi-dimensional vector caching
- **Layer 3:** vector-redis (8111) - Persistent vector cache

### 4. GPU Acceleration Pyramid
```
frontend requests
  ↓
gpu-indexer (8104)         - Document indexing
  ↓
advanced-cuda (8095)       - Attention mechanisms
  ↓
cuda-worker (8107)         - Worker pool
  ↓
cuda-ai-service (8114)     - AI operations
```

---

## 🔐 Security Isolation

### Auth Services
- **auth-service** (8134) - Central authentication
  - Dependencies: redis, postgres
  - Used by: frontend, api gateways

### Rate Limiting
- **rate-limiter** (8136) - DDoS protection
  - Dependencies: redis
  - Applies to: All HTTP gateways

### Security Scanning
- **security-scanner** (8135) - Vulnerability detection
  - No dependencies (async analysis)

---

## 📊 Visualization File Locations

All generated files are in `docs/service-dependency-graphs/`:

```
docs/service-dependency-graphs/
├── architecture.mmd          # Mermaid diagram (editable)
├── architecture.dot          # Graphviz format (convertible to PNG/SVG)
├── architecture.json         # Machine-readable data
├── statistics.json          # Metrics and distribution
└── README.md               # This file
```

### Generate Custom Visualizations
```bash
# Regenerate all formats
node scripts/generate-service-dependency-graph.mjs all

# Generate specific format
node scripts/generate-service-dependency-graph.mjs mermaid
node scripts/generate-service-dependency-graph.mjs dot
node scripts/generate-service-dependency-graph.mjs json
node scripts/generate-service-dependency-graph.mjs stats
```

---

## 🔄 Integration with Monitoring

The service graph integrates with:

1. **Health Monitors** → `health-monitor` (8132)
2. **Metrics** → `metrics-collector` (8130)
3. **Logging** → `log-aggregator` (8131)
4. **Alerts** → `alert-manager` (8133)

All services automatically report to these observability services.

---

## 📖 Usage Examples

### Query Critical Path for Document Processing
```bash
curl 'http://localhost:5173/api/admin/service-graph/analyze' \
  -X POST \
  -H 'Content-Type: application/json' \
  -d '{"serviceId": "upload-service", "depth": 3}'
```

### Export Full Graph for Analysis
```bash
curl 'http://localhost:5173/api/admin/service-graph?includeHealth=true' > graph-data.json
jq '.nodes | map({id, type, health})' graph-data.json
```

### Find All AI Services
```bash
jq '.nodes[] | select(.type=="ai") | {id, port, capabilities}' \
  docs/service-dependency-graphs/architecture.json
```

### List Most Critical Services
```bash
jq '.nodes | sort_by(.dependentOf) | reverse | .[0:10]' \
  docs/service-dependency-graphs/statistics.json
```

---

## 🎯 Next Steps

1. **Deploy Graph Dashboard** - Run `/admin/service-graph` in production
2. **Monitor Health Continuously** - Enable `includeHealth=true` for real-time status
3. **Analyze Critical Paths** - Use `/api/admin/service-graph/analyze` for bottleneck identification
4. **Export for External Tools** - Share JSON/DOT with DevOps teams
5. **Set Alerts** - Configure thresholds for service criticality scores
6. **Track Changes** - Version control the JSON to track architecture evolution

---

## 📚 Related Documentation

- [BACKEND_INTEGRATION_WIRING_REPORT.md](../BACKEND_INTEGRATION_WIRING_REPORT.md) - Full backend integration details
- [BACKEND_OPTIMIZATIONS_IMPLEMENTED.md](../BACKEND_OPTIMIZATIONS_IMPLEMENTED.md) - Performance improvements
- [/admin/service-graph](http://localhost:5173/admin/service-graph) - Interactive dashboard

---

**Generated:** 2025-10-17
**Architecture:** 52 Services | 286 Dependencies | 14 Service Types
**Visualization System:** Mermaid | Graphviz | Interactive Web Dashboard | JSON API
