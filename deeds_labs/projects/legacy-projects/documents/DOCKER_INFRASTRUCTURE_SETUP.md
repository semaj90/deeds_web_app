# Docker Infrastructure for TensorRT-LLM + Triton + Vector Search

**Status**: Ready to Deploy
**Last Updated**: 2025-01-10

## Quick Start

```bash
cd c:\Users\james\Videos\deeds-web-app
docker-compose -f docker-compose.ai-stack.yml up -d
```

## Complete docker-compose.yml

```yaml
version: '3.8'

# Environment variables
x-common-env: &common-env
  RUST_BACKTRACE: "1"
  RUST_LOG: info

x-postgres-env: &postgres-env
  POSTGRES_DB: ${DB_NAME:-legal_ai_db}
  POSTGRES_USER: ${DB_USER:-legal_admin}
  POSTGRES_PASSWORD: ${DB_PASSWORD:-legal123}

services:
  # ============================================
  # PostgreSQL with pgvector extension
  # ============================================
  postgres:
    image: pgvector/pgvector:pg16
    container_name: legal-postgres-pgvector
    <<: *common-env
    environment:
      <<: *postgres-env
      POSTGRES_INITDB_ARGS: "-c shared_preload_libraries=vector"
    ports:
      - "5432:5432"
    volumes:
      - postgres-data:/var/lib/postgresql/data
      - ./init-db.sql:/docker-entrypoint-initdb.d/01-init.sql
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U legal_admin -d legal_ai_db"]
      interval: 10s
      timeout: 5s
      retries: 5
    networks:
      - legal-ai
    deploy:
      resources:
        limits:
          cpus: '2'
          memory: 4G
        reservations:
          cpus: '1'
          memory: 2G

  # ============================================
  # Redis for caching and metrics
  # ============================================
  redis:
    image: redis:7-alpine
    container_name: legal-redis-cache
    <<: *common-env
    command:
      - redis-server
      - "--appendonly"
      - "yes"
      - "--maxmemory"
      - "2gb"
      - "--maxmemory-policy"
      - "allkeys-lru"
    ports:
      - "6379:6379"
    volumes:
      - redis-data:/data
    healthcheck:
      test: ["CMD", "redis-cli", "ping"]
      interval: 10s
      timeout: 5s
      retries: 5
    networks:
      - legal-ai
    deploy:
      resources:
        limits:
          cpus: '1'
          memory: 2G

  # ============================================
  # Ollama for embeddings and LLM fallback
  # ============================================
  ollama:
    image: ollama/ollama:latest
    container_name: legal-ollama-ai
    <<: *common-env
    environment:
      OLLAMA_HOST: "0.0.0.0:11434"
      OLLAMA_NUM_PARALLEL: "2"
      OLLAMA_NUM_THREAD: "16"
    ports:
      - "11434:11434"
    volumes:
      - ollama-models:/root/.ollama/models
      - ./ollama-entrypoint.sh:/entrypoint.sh
    entrypoint: /entrypoint.sh
    healthcheck:
      test: ["CMD", "curl", "-f", "http://localhost:11434/api/tags"]
      interval: 10s
      timeout: 5s
      retries: 5
    networks:
      - legal-ai
    deploy:
      resources:
        limits:
          cpus: '8'
          memory: 12G
        reservations:
          cpus: '4'
          memory: 8G

  # ============================================
  # Triton Inference Server with TensorRT-LLM
  # ============================================
  triton:
    image: nvcr.io/nvidia/tritonserver:24.01-trtllm
    container_name: legal-triton-tensorrt
    runtime: nvidia
    <<: *common-env
    environment:
      CUDA_VISIBLE_DEVICES: "0"
      NVIDIA_VISIBLE_DEVICES: all
      NVIDIA_DRIVER_CAPABILITIES: compute,utility
      TRT_LLM_LOG_LEVEL: INFO
    ports:
      - "8000:8000"  # HTTP
      - "8001:8001"  # gRPC
      - "8002:8002"  # Metrics
    volumes:
      - ./triton-models:/models
      - ./triton-config.pbtxt:/models/config.pbtxt
      - triton-cache:/var/cache/triton
    command: tritonserver --model-repository=/models --strict-model-config=false
    healthcheck:
      test: ["CMD", "curl", "-f", "http://localhost:8000/v2/health/ready"]
      interval: 30s
      timeout: 10s
      retries: 5
      start_period: 60s
    networks:
      - legal-ai
    depends_on:
      - redis
    deploy:
      resources:
        reservations:
          devices:
            - driver: nvidia
              count: 1
              capabilities: [gpu]

  # ============================================
  # Qdrant Vector Database
  # ============================================
  qdrant:
    image: qdrant/qdrant:latest
    container_name: legal-qdrant-vectors
    <<: *common-env
    environment:
      QDRANT_API_KEY: ${QDRANT_API_KEY:-admin}
      QDRANT_JWT_SECRET: ${QDRANT_JWT_SECRET:-secret}
    ports:
      - "6333:6333"  # REST API
      - "6334:6334"  # gRPC
    volumes:
      - qdrant-data:/qdrant/storage
      - ./qdrant-config.yaml:/qdrant/config/config.yaml
    healthcheck:
      test: ["CMD", "curl", "-f", "http://localhost:6333/health"]
      interval: 10s
      timeout: 5s
      retries: 5
    networks:
      - legal-ai
    deploy:
      resources:
        limits:
          cpus: '2'
          memory: 4G

  # ============================================
  # RabbitMQ for async task queue
  # ============================================
  rabbitmq:
    image: rabbitmq:3.13-management-alpine
    container_name: legal-rabbitmq-queue
    <<: *common-env
    environment:
      RABBITMQ_DEFAULT_USER: ${RABBITMQ_USER:-guest}
      RABBITMQ_DEFAULT_PASS: ${RABBITMQ_PASSWORD:-guest}
      RABBITMQ_DEFAULT_VHOST: "/"
    ports:
      - "5672:5672"   # AMQP
      - "15672:15672" # Management UI
    volumes:
      - rabbitmq-data:/var/lib/rabbitmq
    healthcheck:
      test: ["CMD", "rabbitmq-diagnostics", "-q", "ping"]
      interval: 10s
      timeout: 5s
      retries: 5
    networks:
      - legal-ai
    deploy:
      resources:
        limits:
          cpus: '1'
          memory: 1G

  # ============================================
  # MinIO for document storage
  # ============================================
  minio:
    image: minio/minio:latest
    container_name: legal-minio-storage
    <<: *common-env
    environment:
      MINIO_ROOT_USER: ${MINIO_ROOT_USER:-minioadmin}
      MINIO_ROOT_PASSWORD: ${MINIO_ROOT_PASSWORD:-minioadmin}
      MINIO_REGION: us-east-1
    ports:
      - "9000:9000"  # S3 API
      - "9001:9001"  # Console
    volumes:
      - minio-data:/minio/data
    command: minio server /minio/data --console-address ":9001"
    healthcheck:
      test: ["CMD", "curl", "-f", "http://localhost:9000/minio/health/live"]
      interval: 10s
      timeout: 5s
      retries: 5
    networks:
      - legal-ai
    deploy:
      resources:
        limits:
          cpus: '2'
          memory: 2G

volumes:
  postgres-data:
    driver: local
  redis-data:
    driver: local
  ollama-models:
    driver: local
  triton-cache:
    driver: local
  qdrant-data:
    driver: local
  rabbitmq-data:
    driver: local
  minio-data:
    driver: local

networks:
  legal-ai:
    driver: bridge
```

## Required Configuration Files

### 1. init-db.sql
```sql
-- Create vector extension
CREATE EXTENSION IF NOT EXISTS vector;
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Create embeddings table
CREATE TABLE IF NOT EXISTS embeddings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  content TEXT NOT NULL,
  vector vector(768),
  document_id TEXT,
  chunk_id TEXT,
  embedding_type VARCHAR(50) DEFAULT 'legal_context',
  model_used VARCHAR(100) DEFAULT 'embeddings:gemma:latest',
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT content_not_empty CHECK (LENGTH(content) > 0)
);

-- Create HNSW index for vector similarity
CREATE INDEX IF NOT EXISTS embeddings_vector_idx
ON embeddings
USING hnsw (vector vector_cosine_ops)
WITH (m = 16, ef_construction = 64);

-- Create other useful indexes
CREATE INDEX IF NOT EXISTS embeddings_document_id_idx ON embeddings(document_id);
CREATE INDEX IF NOT EXISTS embeddings_embedding_type_idx ON embeddings(embedding_type);
CREATE INDEX IF NOT EXISTS embeddings_created_at_idx ON embeddings(created_at DESC);

-- Create document chunks table
CREATE TABLE IF NOT EXISTS document_chunks (
  id TEXT PRIMARY KEY,
  content TEXT NOT NULL,
  document_id TEXT NOT NULL,
  title VARCHAR(500),
  chunk_number INTEGER,
  total_chunks INTEGER,
  confidentiality_level VARCHAR(50),
  embedding_model VARCHAR(100),
  embedding_dimension INTEGER DEFAULT 768,
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Create indexes on document chunks
CREATE INDEX IF NOT EXISTS document_chunks_document_id_idx ON document_chunks(document_id);
CREATE INDEX IF NOT EXISTS document_chunks_created_at_idx ON document_chunks(created_at DESC);

-- Create table for vector search queries (audit)
CREATE TABLE IF NOT EXISTS vector_search_queries (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  query TEXT,
  query_embedding vector(768),
  results_count INTEGER,
  execution_time_ms INTEGER,
  source_provider VARCHAR(50),
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS vector_search_queries_created_at_idx ON vector_search_queries(created_at DESC);

-- Grant permissions
GRANT ALL ON ALL TABLES IN SCHEMA public TO legal_admin;
GRANT ALL ON ALL SEQUENCES IN SCHEMA public TO legal_admin;
```

### 2. ollama-entrypoint.sh
```bash
#!/bin/bash
set -e

# Wait for ollama service to be ready
echo "Starting Ollama server..."
ollama serve &
OLLAMA_PID=$!

# Wait for server to start
sleep 5

# Pull required models
echo "Pulling embeddings:gemma:latest..."
ollama pull embeddings:gemma:latest

echo "Pulling gemma:7b (fallback)..."
ollama pull gemma:7b

# Optional: Pull custom legal model
# ollama pull gemma3-legal:latest

# Keep container running
wait $OLLAMA_PID
```

### 3. triton-config.pbtxt
```protobuf
# Triton Model Repository Configuration
# Reference: https://github.com/triton-inference-server/server

# Model 1: Gemma3 8B Chat
name: "gemma3-8b-chat"
platform: "tensorrt_llm"
max_batch_size: 4
input [
  {
    name: "input_ids"
    data_type: TYPE_INT32
    dims: [-1]
  },
  {
    name: "input_lengths"
    data_type: TYPE_INT32
    dims: [1]
  }
]
output [
  {
    name: "output_ids"
    data_type: TYPE_INT32
    dims: [-1, -1]
  },
  {
    name: "output_lengths"
    data_type: TYPE_INT32
    dims: [1]
  }
]
instance_group [
  {
    kind: KIND_GPU
    count: 1
    gpus: [0]
  }
]

# Model 2: Gemma 7B Base
name: "gemma-7b-base"
platform: "tensorrt_llm"
max_batch_size: 8
input [
  {
    name: "input_ids"
    data_type: TYPE_INT32
    dims: [-1]
  }
]
output [
  {
    name: "output_ids"
    data_type: TYPE_INT32
    dims: [-1, -1]
  }
]
instance_group [
  {
    kind: KIND_GPU
    count: 1
    gpus: [0]
  }
]
```

### 4. qdrant-config.yaml
```yaml
server:
  http:
    uri: "0.0.0.0:6333"
  grpc:
    uri: "0.0.0.0:6334"

storage:
  storage_path: "/qdrant/storage"
  snapshots_path: "/qdrant/snapshots"
  temp_path: "/qdrant/temp"

  # Performance tuning
  hnsw_index:
    m: 16
    ef_construct: 64
    ef: 128
    max_indexing_threads: 4
    max_search_threads: 4
    payload_m: 16

  # Write-ahead logging
  wal:
    wal_capacity_mb: 200
    wal_segments_ahead: 10

# Authentication
auth:
  enable: true
  api_key: "admin"  # Override with QDRANT_API_KEY env var

# Logging
log_level: "info"

# Persistence
persistence:
  snapshots_enabled: true
```

### 5. .env.docker
```bash
# Database
DB_NAME=legal_ai_db
DB_USER=legal_admin
DB_PASSWORD=legal123
DATABASE_URL=postgresql://legal_admin:legal123@postgres:5432/legal_ai_db

# Redis
REDIS_URL=redis://redis:6379

# Ollama
OLLAMA_BASE_URL=http://ollama:11434

# Triton
TRITON_BASE_URL=http://triton:8000

# Qdrant
QDRANT_URL=http://qdrant:6333
QDRANT_API_KEY=admin

# RabbitMQ
RABBITMQ_URL=amqp://guest:guest@rabbitmq:5672
RABBITMQ_USER=guest
RABBITMQ_PASSWORD=guest

# MinIO
MINIO_ENDPOINT=http://minio:9000
MINIO_ROOT_USER=minioadmin
MINIO_ROOT_PASSWORD=minioadmin
MINIO_BUCKET=legal-documents

# Services
MCP_CONTEXT7_PORT=3002
MCP_WORKERS=8
LOG_LEVEL=info
```

## Deployment Steps

### 1. Create necessary directories
```bash
mkdir -p triton-models/gemma3-8b-chat triton-models/gemma-7b-base
mkdir -p qdrant-data
mkdir -p minio-data
```

### 2. Copy configuration files
```bash
# Copy the configuration files to project root
cp init-db.sql .
cp ollama-entrypoint.sh .
cp triton-config.pbtxt .
cp qdrant-config.yaml .
cp .env.docker .env
```

### 3. Start services
```bash
docker-compose -f docker-compose.ai-stack.yml up -d
```

### 4. Verify services
```bash
# PostgreSQL
docker exec legal-postgres-pgvector psql -U legal_admin -d legal_ai_db -c "SELECT version();"

# Redis
docker exec legal-redis-cache redis-cli ping

# Ollama
curl http://localhost:11434/api/tags

# Triton
curl http://localhost:8000/v2/health/ready

# Qdrant
curl -s http://localhost:6333/health | jq

# RabbitMQ Management
open http://localhost:15672  # admin/admin

# MinIO Console
open http://localhost:9001  # minioadmin/minioadmin
```

## Service Endpoints Reference

| Service | Protocol | URL | Purpose |
|---------|----------|-----|---------|
| PostgreSQL | TCP | localhost:5432 | pgvector storage |
| Redis | TCP | localhost:6379 | Caching layer |
| Ollama | HTTP | localhost:11434 | LLM + embeddings |
| Triton | HTTP | localhost:8000 | TensorRT inference |
| Triton | gRPC | localhost:8001 | High-perf interface |
| Triton | Metrics | localhost:8002 | Prometheus metrics |
| Qdrant REST | HTTP | localhost:6333 | Vector DB REST API |
| Qdrant gRPC | gRPC | localhost:6334 | Vector DB gRPC |
| RabbitMQ | AMQP | localhost:5672 | Message queue |
| RabbitMQ UI | HTTP | localhost:15672 | Admin panel |
| MinIO | S3 API | localhost:9000 | Object storage |
| MinIO | UI | HTTP | localhost:9001 | Management console |

## Health Check Script

```bash
#!/bin/bash
# check-health.sh

echo "=== AI Infrastructure Health Check ==="
echo ""

echo "PostgreSQL..."
docker exec legal-postgres-pgvector pg_isready -U legal_admin -d legal_ai_db && echo "✅ OK" || echo "❌ FAILED"

echo "Redis..."
docker exec legal-redis-cache redis-cli ping && echo "✅ OK" || echo "❌ FAILED"

echo "Ollama..."
curl -s http://localhost:11434/api/tags > /dev/null && echo "✅ OK" || echo "❌ FAILED"

echo "Triton..."
curl -s http://localhost:8000/v2/health/ready > /dev/null && echo "✅ OK" || echo "❌ FAILED"

echo "Qdrant..."
curl -s http://localhost:6333/health > /dev/null && echo "✅ OK" || echo "❌ FAILED"

echo "RabbitMQ..."
docker exec legal-rabbitmq-queue rabbitmq-diagnostics ping > /dev/null 2>&1 && echo "✅ OK" || echo "❌ FAILED"

echo "MinIO..."
curl -s http://localhost:9000/minio/health/live > /dev/null && echo "✅ OK" || echo "❌ FAILED"

echo ""
echo "All services checked!"
```

## Stopping Services

```bash
# Stop all services
docker-compose -f docker-compose.ai-stack.yml down

# Stop and remove volumes (WARNING: Data loss)
docker-compose -f docker-compose.ai-stack.yml down -v

# Stop specific service
docker-compose -f docker-compose.ai-stack.yml stop triton

# View logs
docker-compose -f docker-compose.ai-stack.yml logs -f ollama
```

---

**Next**: Configure SvelteKit environment variables and integration routes
