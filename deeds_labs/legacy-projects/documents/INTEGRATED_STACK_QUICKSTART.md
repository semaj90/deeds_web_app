# INTEGRATED GPU RAG STACK - QUICK START

## What's New

This integrates your existing infrastructure with a unified RAG orchestrator:

**Existing Services (Preserved)**:
- ✅ Phase H Auto-encoder pipeline (Triton + QLora training)
- ✅ FastAPI embedding service (`python-workers/fastapi-embed`)
- ✅ LangExtract Go web scraping (`langextract-go`)
- ✅ PostgreSQL + pgvector (port 5434)
- ✅ Redis Stack (no password, as configured)
- ✅ Qdrant vector database
- ✅ MinIO object storage
- ✅ RabbitMQ message queue
- ✅ QUIC server
- ✅ SvelteKit frontend

**New Addition**:
- 🆕 RAG Orchestrator (`python-services/rag-orchestrator`)
  - Unified API for RAG queries
  - LangChain integration ready
  - Redis caching
  - Web search integration
  - Vector similarity search

## Port Mapping (Updated)

```
5173-5179    → SvelteKit frontend (multiple instances)
6379         → Redis (no auth)
5434         → PostgreSQL
6333/6334    → Qdrant HTTP/gRPC
8000         → FastAPI embedding service
8001         → Analytics bridge (Phase H)
8002/8003    → Triton inference server (shifted from 8000)
8004         → RAG orchestrator (NEW)
8090         → LangExtract Go service
8095         → QUIC HTTP fallback
8101         → CPU synthesizer
9000/9001    → MinIO API/Console
11434        → Ollama (host, not in Docker)
15672        → RabbitMQ management UI
18001        → RedisInsight
```

## Quick Start

### 1. Start All Services

```bash
cd C:\Users\james\Videos\deeds-web-app

# Start integrated stack
docker-compose -f docker-compose.integrated-gpu-stack.yml up -d

# Check service health
docker-compose -f docker-compose.integrated-gpu-stack.yml ps
```

### 2. Verify Services

```bash
# Health checks
curl http://localhost:8000/health     # FastAPI embed
curl http://localhost:8004/health     # RAG orchestrator
curl http://localhost:8090/health     # LangExtract
curl http://localhost:6333/health     # Qdrant
curl http://localhost:5173            # SvelteKit

# Redis ping
docker exec legal-ai-redis redis-cli ping

# PostgreSQL check
docker exec legal-ai-postgres psql -U legal_admin -d legal_ai_db -c "\dt"
```

### 3. Test RAG Pipeline

```bash
# Test embedding
curl -X POST http://localhost:8000/embed \
  -H "Content-Type: application/json" \
  -d '{"text": "What are the essential elements of a valid contract?"}'

# Test RAG query
curl -X POST http://localhost:8004/query \
  -H "Content-Type: application/json" \
  -d '{
    "query": "Explain contract formation in common law",
    "top_k": 5,
    "enable_web_search": true
  }'

# Index a document
curl -X POST http://localhost:8004/index \
  -H "Content-Type: application/json" \
  -d '{
    "id": "test-doc-001",
    "text": "A contract requires offer, acceptance, and consideration.",
    "metadata": {
      "source": "test",
      "category": "contract_law"
    }
  }'
```

### 4. Access UIs

- **SvelteKit**: http://localhost:5173
- **RedisInsight**: http://localhost:18001
- **MinIO Console**: http://localhost:9001 (minio/minio123)
- **RabbitMQ**: http://localhost:15672 (legal_admin/123456)
- **Qdrant Dashboard**: http://localhost:6333/dashboard

## Integration Points

### From SvelteKit

```typescript
// src/lib/api/rag-client.ts
export async function queryRAG(query: string) {
  const response = await fetch('http://localhost:8004/query', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      query,
      top_k: 10,
      enable_web_search: true,
      model: 'gemma3:legal:latest'
    })
  });
  return response.json();
}
```

### From Phase H Auto-encoder

The RAG orchestrator can receive embeddings from your Phase H pipeline:

```python
# In behavior_router or analytics_bridge
import httpx

async def store_user_intent_vector(intent_text: str, metadata: dict):
    async with httpx.AsyncClient() as client:
        await client.post(
            'http://rag-orchestrator:8000/index',
            json={
                'id': f"intent-{user_id}-{timestamp}",
                'text': intent_text,
                'metadata': {
                    **metadata,
                    'source': 'user_analytics',
                    'type': 'intent_vector'
                }
            }
        )
```

## Environment Variables

The stack uses unified environment variables via `x-common-env`:

```yaml
DATABASE_URL: postgresql://legal_admin:123456@postgres:5432/legal_ai_db
REDIS_URL: redis://redis:6379
OLLAMA_URL: http://host.docker.internal:11434
QDRANT_URL: http://qdrant:6333
MINIO_ENDPOINT: minio:9000
```

All services inherit these automatically.

## GPU Configuration

Services with GPU access:
- `triton` (Triton inference server)
- `qlora-trainer` (Phase H QLora training)

GPU memory allocation (RTX 3060 Ti 8GB):
- Triton: ~3GB
- QLora: ~3GB  
- Ollama (host): ~2GB
- Total: 8GB

## Monitoring

```bash
# View all logs
docker-compose -f docker-compose.integrated-gpu-stack.yml logs -f

# Specific service logs
docker-compose -f docker-compose.integrated-gpu-stack.yml logs -f rag-orchestrator

# Check GPU usage (from host where Ollama runs)
nvidia-smi

# Redis stats
docker exec legal-ai-redis redis-cli INFO stats

# Qdrant collections
curl http://localhost:6333/collections
```

## Troubleshooting

### Redis Connection Errors

Your Redis is configured without password. Services use `REDIS_PASSWORD=""`.

### Ollama Not Found

Ollama runs on your **host** machine, not in Docker. Services use `host.docker.internal:11434`.

```bash
# Test Ollama from host
curl http://localhost:11434/api/tags

# Test from Docker container
docker exec legal-ai-rag-orchestrator curl http://host.docker.internal:11434/api/tags
```

### Port Conflicts

If Triton's default port 8000 conflicts with fastapi-embed, we've shifted Triton to 8002/8003.

### Out of Memory

Reduce GPU service count or use CPU fallback:

```yaml
# Temporarily disable QLora trainer
docker-compose -f docker-compose.integrated-gpu-stack.yml stop qlora-trainer
```

## Next Steps

1. **Train Custom Adapters**: Use Phase H pipeline to create legal-specific QLora adapters
2. **Build Knowledge Graph**: Populate Qdrant with case law and precedents
3. **Implement Auto-Encoder**: Use analytics bridge for user intent prediction
4. **Add Function Calling**: Extend RAG orchestrator with tool calling
5. **Deploy WebGPU**: Add browser-side inference for privacy-sensitive queries

## Architecture Flow

```
User Query (SvelteKit)
     ↓
RAG Orchestrator (Port 8004)
     ↓
┌────┴────┬─────────┬──────────┐
↓         ↓         ↓          ↓
FastAPI  Qdrant   LangExtract Ollama
Embed    Vector   Web Search  LLM
(8000)   (6333)   (8090)      (host:11434)
     ↓         ↓         ↓          ↓
     └─────────┴─────────┴──────────┘
                  ↓
            Generated Answer
            + Source Citations
```

## Support

For issues or questions:
1. Check service logs: `docker-compose logs <service-name>`
2. Verify health endpoints: `curl http://localhost:<port>/health`
3. Review GPU usage: `nvidia-smi`
