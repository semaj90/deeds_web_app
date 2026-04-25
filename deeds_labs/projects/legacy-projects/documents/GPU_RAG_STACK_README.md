# GPU-Accelerated Legal AI RAG Stack - INTEGRATED

**IMPORTANT**: This integrates with your existing infrastructure:
- Uses your existing `python-workers/fastapi-embed` service
- Integrates with Phase H auto-encoder pipeline (Triton + QLora)
- Connects to your existing Ollama instance (host)
- Uses your existing `langextract-go` service
- Preserves all existing ports and configurations

Complete Docker Compose setup for production-ready Legal AI system with:

- **Triton Inference Server** (Phase H auto-encoder + QLora training)
- **Qdrant** vector database
- **Redis Stack** caching + RediSearch + RediJSON
- **PostgreSQL + pgvector** relational + vector storage
- **Ollama** GPU inference (host.docker.internal:11434)
- **EmbeddingGemma** via FastAPI (existing service)
- **LangExtract** Go web scraping + RAG (existing service)
- **RAG Orchestrator** LangChain pipeline (NEW)
- **RabbitMQ** message queue
- **MinIO** object storage
- **SvelteKit 2** frontend
- **Caddy** HTTPS/QUIC reverse proxy

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                    SvelteKit Frontend                        │
│              (WebGPU + SIMD + TypeScript)                    │
└────────────────────────┬────────────────────────────────────┘
                         │
        ┌────────────────┴────────────────┐
        │                                 │
┌───────▼────────┐              ┌────────▼─────────┐
│ RAG Orchestrator│              │  LangExtract API │
│  (LangChain)    │              │  (Go + Scraping) │
└───────┬────────┘              └────────┬─────────┘
        │                                 │
┌───────▼─────────────────────────────────▼────────┐
│              Service Layer                        │
│  ┌──────────┐  ┌──────────┐  ┌──────────┐       │
│  │ TensorRT │  │ Ollama   │  │ Embedding│       │
│  │   LLM    │  │  GPU     │  │  Service │       │
│  └──────────┘  └──────────┘  └──────────┘       │
└───────────────────┬──────────────────────────────┘
                    │
┌───────────────────▼──────────────────────────────┐
│              Storage Layer                        │
│  ┌──────────┐  ┌──────────┐  ┌──────────┐       │
│  │ Qdrant   │  │ Postgres │  │  Redis   │       │
│  │ Vectors  │  │ +pgvector│  │  Cache   │       │
│  └──────────┘  └──────────┘  └──────────┘       │
│  ┌──────────┐  ┌──────────┐                     │
│  │  Neo4j   │  │  MinIO   │                     │
│  │  Graph   │  │ Storage  │                     │
│  └──────────┘  └──────────┘                     │
└──────────────────────────────────────────────────┘
```

## Quick Start

### Prerequisites

1. **NVIDIA GPU** with CUDA support (RTX 3060 Ti or better)
2. **Docker Desktop** with GPU passthrough enabled
3. **NVIDIA Container Toolkit** installed
4. **20GB+ disk space** for models and data

### Step 1: Enable GPU Support

```bash
# Windows WSL2
wsl --install
wsl --set-default-version 2

# Install NVIDIA Container Toolkit
distribution=$(. /etc/os-release;echo $ID$VERSION_ID)
curl -s -L https://nvidia.github.io/nvidia-docker/gpgkey | sudo apt-key add -
curl -s -L https://nvidia.github.io/nvidia-docker/$distribution/nvidia-docker.list | \
  sudo tee /etc/apt/sources.list.d/nvidia-docker.list

sudo apt-get update
sudo apt-get install -y nvidia-container-toolkit
sudo systemctl restart docker
```

### Step 2: Initialize Services

```bash
# Create necessary directories
mkdir -p python-services/embedding-api
mkdir -p python-services/rag-orchestrator
mkdir -p engines models

# Start all services
docker-compose -f docker-compose.gpu-rag-full-stack.yml up -d

# Check service health
docker-compose -f docker-compose.gpu-rag-full-stack.yml ps
```

### Step 3: Pull Models

```bash
# Pull Ollama models
docker exec legal-ai-ollama ollama pull gemma3:latest
docker exec legal-ai-ollama ollama pull nomic-embed-text

# Pull embedding model
docker exec legal-ai-embedding ollama pull all-minilm
```

### Step 4: Initialize Database

```bash
# Create database schema
docker exec legal-ai-postgres psql -U legal_admin -d legal_ai_db -f /docker-entrypoint-initdb.d/init-db.sql

# Verify pgvector extension
docker exec legal-ai-postgres psql -U legal_admin -d legal_ai_db -c "CREATE EXTENSION IF NOT EXISTS vector;"
```

### Step 5: Test Services

```bash
# Test embedding service
curl -X POST http://localhost:8003/embed \
  -H "Content-Type: application/json" \
  -d '{"texts": ["This is a legal document about contracts"]}'

# Test RAG orchestrator
curl -X POST http://localhost:8004/query \
  -H "Content-Type: application/json" \
  -d '{"query": "What are the key elements of a valid contract?"}'

# Access frontend
open http://localhost:5173
```

## Service Endpoints

| Service | Port | URL | Purpose |
|---------|------|-----|---------|
| SvelteKit | 5173 | http://localhost:5173 | Frontend UI |
| Qdrant HTTP | 6333 | http://localhost:6333 | Vector DB API |
| Qdrant gRPC | 6334 | - | Vector DB gRPC |
| Redis | 6379 | redis://localhost:6379 | Cache |
| RedisInsight | 8001 | http://localhost:8001 | Redis UI |
| PostgreSQL | 5432 | postgresql://localhost:5432 | Relational DB |
| Ollama | 11434 | http://localhost:11434 | LLM Inference |
| Embedding | 11435 | http://localhost:11435 | Embedding Models |
| TensorRT | 8000 | http://localhost:8000 | TensorRT Inference |
| FastAPI Embed | 8003 | http://localhost:8003 | Embedding API |
| RAG Orchestrator | 8004 | http://localhost:8004 | RAG Pipeline |
| LangExtract | 8090 | http://localhost:8090 | Web Scraping |
| Neo4j HTTP | 7474 | http://localhost:7474 | Graph DB UI |
| Neo4j Bolt | 7687 | bolt://localhost:7687 | Graph DB |
| RabbitMQ | 5672 | amqp://localhost:5672 | Message Queue |
| RabbitMQ UI | 15672 | http://localhost:15672 | Queue UI |
| MinIO API | 9000 | http://localhost:9000 | Object Storage |
| MinIO Console | 9001 | http://localhost:9001 | Storage UI |

## Environment Variables

All services use centralized environment variables. Key configurations:

```env
# Database
DATABASE_URL=postgresql://legal_admin:123456@postgres:5432/legal_ai_db

# Redis
REDIS_URL=redis://:redis@redis:6379/0

# Vector DB
QDRANT_URL=http://qdrant:6333

# LLM Services
OLLAMA_URL=http://ollama:11434
TENSORRT_URL=http://tensorrt-inference:8000
EMBEDDING_URL=http://fastapi-embed:8003

# Storage
MINIO_ENDPOINT=minio:9000
MINIO_ACCESS_KEY=minioadmin
MINIO_SECRET_KEY=minioadmin

# Graph DB
NEO4J_URI=bolt://neo4j:7687
NEO4J_USER=neo4j
NEO4J_PASSWORD=legal123456

# Message Queue
RABBITMQ_URL=amqp://legal_admin:123456@rabbitmq:5672
```

## GPU Memory Management

For RTX 3060 Ti (8GB VRAM), recommended allocations:

- **Ollama (Gemma3)**: 4GB
- **TensorRT-LLM**: 3GB
- **Embedding Service**: 1GB

Configure in `docker-compose.gpu-rag-full-stack.yml`:

```yaml
deploy:
  resources:
    reservations:
      devices:
        - driver: nvidia
          device_ids: ['0']
          capabilities: [gpu]
    limits:
      memory: 4G
```

## Monitoring

```bash
# View all logs
docker-compose -f docker-compose.gpu-rag-full-stack.yml logs -f

# Check GPU usage
docker exec legal-ai-ollama nvidia-smi

# Monitor Redis cache
docker exec legal-ai-redis redis-cli -a redis INFO stats

# Check Qdrant vectors
curl http://localhost:6333/collections/legal_documents
```

## Troubleshooting

### GPU Not Detected

```bash
# Verify NVIDIA runtime
docker run --rm --gpus all nvidia/cuda:12.0-base nvidia-smi

# Check Docker GPU support
docker info | grep -i gpu
```

### Out of Memory

```bash
# Reduce Ollama parallel requests
docker exec legal-ai-ollama env OLLAMA_NUM_PARALLEL=2 ollama serve

# Clear Redis cache
docker exec legal-ai-redis redis-cli -a redis FLUSHDB
```

### Slow Inference

```bash
# Enable TensorRT optimizations
export TENSORRT_PRECISION=fp16
export CUDA_VISIBLE_DEVICES=0

# Use model quantization
docker exec legal-ai-ollama ollama pull gemma3:7b-q4_K_M
```

## Production Deployment

For production use:

1. **Change default passwords** in all services
2. **Enable TLS/SSL** for external endpoints
3. **Set up backup** for PostgreSQL and Qdrant
4. **Configure resource limits** per service
5. **Add monitoring** (Prometheus + Grafana)
6. **Implement rate limiting** on API endpoints

## Next Steps

1. Train custom legal adapters for Gemma3
2. Build knowledge graph from case law
3. Implement auto-encoder for log compression
4. Add WebGPU compute in browser for parallel parsing
5. Deploy function-calling tools for agentic workflows

## License

MIT - See LICENSE file for details
