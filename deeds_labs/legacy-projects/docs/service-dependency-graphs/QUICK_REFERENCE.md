# Service Dependency Graph - Quick Reference

**Generated:** 2025-10-17 | **Services:** 52 | **Dependencies:** 286

## 🎯 Quick Access

### Interactive Dashboard
```
http://localhost:5173/admin/service-graph
```
✨ Real-time health status, filtering, search, and export

### API Endpoints
```
GET  /api/admin/service-graph                        # Full graph data
GET  /api/admin/service-graph?includeHealth=true    # With health status
POST /api/admin/service-graph/analyze                # Dependency analysis
GET  /api/admin/service-health?service={id}         # Single service health
```

### Generated Files
```
docs/service-dependency-graphs/
├── architecture.mmd         # Mermaid (view in VS Code or mermaid.live)
├── architecture.dot         # Graphviz (convert with `dot` command)
├── architecture.json        # Machine-readable data
├── statistics.json         # Service metrics
└── README.md              # Full documentation
```

---

## 📊 52 Services Organized by Type

### 🎨 Frontend (1)
- `sveltekit-frontend` (5173) - SvelteKit 5 app

### ⚙️ Core Services (6)
- `enhanced-rag` (8094) - RAG pipeline + GPU
- `upload-service` (8093) - File upload & processing
- `kratos-server` (50051) - gRPC legal compute
- `advanced-cuda` (8095) - CUDA + FlashAttention
- `xstate-manager` (8098) - State orchestration
- `recommendation-engine` (8100) - AI recommendations

### 🎮 GPU Acceleration (4)
- `advanced-cuda` (8095)
- `cuda-worker` (8107)
- `cuda-ai-service` (8114)
- `gpu-indexer` (8104)

### 🔍 Vector & Search (3)
- `vector-service` (8101)
- `vector-consumer` (8108)
- `vector-redis` (8111)

### 🤖 AI/ML Services (7)
- `legal-ai` (8124)
- `t5-transformer` (8122)
- `live-agent` (8123)
- `multi-core-ollama` (8125)
- `recommendation-engine` (8100)
- `context7-error` (8105)
- `module-manager` (8099)

### 🌐 Infrastructure (12)
- `load-balancer` (8102)
- `http-gateway` (8119)
- `grpc-gateway` (8120)
- `websocket-service` (8121)
- `quic-gateway` (8106)
- `cluster-manager` (8103)
- `minio-proxy` (8126)
- `postgres-proxy` (8127)
- `neo4j-proxy` (8128)
- `qdrant-proxy` (8129)
- `load-balancer-go125` (8116)
- `grpc-server-go125` (8117)

### 💾 Data Processing (2)
- `ingest-service` (8110)
- `gin-upload` (8109)

### 📈 Observability (4)
- `metrics-collector` (8130)
- `log-aggregator` (8131)
- `health-monitor` (8132)
- `alert-manager` (8133)

### 🔐 Security (3)
- `auth-service` (8134)
- `security-scanner` (8135)
- `rate-limiter` (8136)

### 💻 Databases & Stores (7)
- `postgres` (5432) - SQL + pgvector
- `qdrant` (6333) - Vector DB
- `redis` (6379) - Cache & sessions
- `minio` (9000) - S3-compatible storage
- `rabbitmq` (5672) - Message queue
- `neo4j` (7687) - Graph DB
- `ollama` (11434) - Local LLM

### ✨ Go 1.25 Optimized Replicas (4)
- `enhanced-rag-go125` (8112)
- `upload-service-go125` (8113)
- `vector-service-go125` (8115)
- `rag-quic-go125` (8118)

### 🔀 Other Services (2)
- `dimensional-cache` (8097)
- `module-manager` (8099)

---

## 🔗 Most Critical Dependency Chains

### RAG Processing
```
frontend → enhanced-rag → {qdrant, postgres, minio, rabbitmq, ollama}
           ↓
       Response: 150-300ms
```

### Document Upload & Processing
```
frontend → upload-service → rabbitmq → cuda-worker → {qdrant, postgres, minio}
           ↓
       Processing time: 500-1500ms
```

### AI Recommendations
```
frontend → recommendation-engine → {postgres, neo4j, redis, ollama}
           ↓
       Response: 200-500ms
```

### Vector Search
```
frontend → vector-service → {qdrant, postgres}
           ↓
       Response: 50-150ms
```

### Legal AI Analysis
```
frontend → legal-ai → {advanced-cuda, postgres, minio}
           ↓
       Processing: 1000-3000ms
```

---

## 📡 Protocol Distribution

| Protocol | Count | Services |
|----------|-------|----------|
| HTTP | 41 | Most Go microservices |
| gRPC | 7 | Legal, gateway, infrastructure |
| QUIC | 7 | Ultra-low latency services |
| WebSocket | 4 | Real-time, agent, xstate-manager |
| PostgreSQL | 1 | postgres database |
| Redis | 1 | redis cache |
| AMQP | 1 | rabbitmq queue |
| Bolt | 1 | neo4j graph |

---

## 🔴 Services with Highest Dependency Count

**Most depended upon (highest criticality):**
1. `postgres` - 27 dependents (data persistence)
2. `qdrant` - 19 dependents (vector search)
3. `rabbitmq` - 15 dependents (async processing)
4. `redis` - 12 dependents (caching)
5. `ollama` - 10 dependents (AI inference)
6. `minio` - 8 dependents (document storage)
7. `neo4j` - 4 dependents (recommendations)

**Most dependencies (complex services):**
1. `sveltekit-frontend` - 10 dependencies
2. `enhanced-rag` - 5 dependencies
3. `recommendation-engine` - 4 dependencies
4. `legal-ai` - 3 dependencies

---

## 🔧 Common Operations

### View Mermaid Diagram in VS Code
1. Install "Markdown Preview Mermaid Support" extension
2. Open `docs/service-dependency-graphs/architecture.mmd`
3. Open preview (Ctrl+Shift+V)

### Generate PNG from Graphviz
```bash
dot -Tpng docs/service-dependency-graphs/architecture.dot -o architecture.png
```

### Query Services by Type
```bash
jq '.nodes[] | select(.type=="gpu") | {id, port, capabilities}' \
  docs/service-dependency-graphs/architecture.json
```

### Find All AI Services
```bash
jq '.nodes[] | select(.type=="ai")' \
  docs/service-dependency-graphs/architecture.json
```

### Export for Team
```bash
# Export as CSV
curl 'http://localhost:5173/api/admin/service-graph' | \
  jq -r '[.nodes[] | [.id, .type, .port, (.dependsOn|join(";"))]] | @csv'

# Export with health status
curl 'http://localhost:5173/api/admin/service-graph?includeHealth=true' > graph-data.json
```

---

## 🚀 Dashboard Features

### Filtering
- By service type (Core, GPU, AI, Infrastructure, etc.)
- By search query (name or description)
- With/without dependency details

### Health Status
- 🟢 Healthy (< 200ms response)
- 🟡 Degraded (200-1000ms response)
- 🔴 Unhealthy (> 1000ms or timeout)

### Real-time Updates
- Auto-refresh every 5 seconds (optional)
- Manual refresh button
- Check individual service health

### Export Options
- JSON (machine-readable)
- CSV (spreadsheet-compatible)

### Service Details Panel
- Description and capabilities
- Port and protocol information
- Health status and response time
- Incoming/outgoing dependencies

---

## 📚 Documentation

- **Full README:** `docs/service-dependency-graphs/README.md`
- **Backend Integration:** `BACKEND_INTEGRATION_WIRING_REPORT.md`
- **Optimizations:** `BACKEND_OPTIMIZATIONS_IMPLEMENTED.md`

---

## ⚡ Tips

1. **Start with RAG Pipeline** - Most critical data flow
2. **Check GPU Services** - CUDA utilization bottlenecks
3. **Monitor Vector Services** - Similarity search performance
4. **Watch Database Loads** - PostgreSQL and Qdrant are critical
5. **Use Auto-Refresh** - In production for continuous monitoring

---

## 📋 Service Dependencies at a Glance

```
FRONTEND (10 deps)
├── postgres (27 dependents)
├── redis (12 dependents)
├── qdrant (19 dependents)
├── minio (8 dependents)
├── rabbitmq (15 dependents)
├── neo4j (4 dependents)
├── ollama (10 dependents)
├── enhanced-rag
├── xstate-manager
└── recommendation-engine

ENHANCED-RAG (5 deps)
├── qdrant
├── postgres
├── minio
├── rabbitmq
└── ollama

RECOMMENDATION-ENGINE (4 deps)
├── postgres
├── neo4j
├── redis
└── ollama
```

---

**Last Updated:** 2025-10-17
**Total Services:** 52 | **Total Connections:** 286
**Architecture Types:** 14 | **Protocols:** 8
