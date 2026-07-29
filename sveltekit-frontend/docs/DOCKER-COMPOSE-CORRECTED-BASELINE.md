# Docker Compose Corrected Baseline
**Date**: 2026-07-29  
**Status**: Corrected from Session 149 feedback

---

## Critical Corrections Applied

1. ✅ Both stacks now use `pgvector/pgvector:pg18` (includes vector extension)
2. ✅ Runtime config moved from `INITDB_ARGS` to `command` array
3. ✅ Port mapping clarified: host 5434 → container 5432 (postgres only)
4. ✅ Qdrant config uses separate HTTP (6333) + gRPC (6334) ports
5. ✅ Go retrieval healthcheck changed from `/health` to `/ready`
6. ✅ Embedding service wiring explicit (semantic_768, 768-dim, CUDA)
7. ✅ Qdrant named vector contracts defined (semantic_768, bm42_sparse)

---

## docker-compose.yml (Main Stack — Corrected)

```yaml
version: '3.8'

services:
  # PostgreSQL 18 with pgvector (canonical truth layer)
  postgres:
    image: pgvector/pgvector:pg18
    container_name: legal-ai-postgres
    environment:
      POSTGRES_USER: legal_admin
      POSTGRES_PASSWORD: postgres
      POSTGRES_DB: legal_ai_db
    command:
      - "postgres"
      - "-c"
      - "io_method=worker"
      - "-c"
      - "io_workers=4"
      - "-c"
      - "shared_buffers=512MB"
      - "-c"
      - "effective_cache_size=1536MB"
      - "-c"
      - "work_mem=8MB"
      - "-c"
      - "maintenance_work_mem=256MB"
      - "-c"
      - "random_page_cost=1.1"
      - "-c"
      - "effective_io_concurrency=200"
      - "-c"
      - "jit=off"
      - "-c"
      - "track_io_timing=on"
    volumes:
      - postgres_data:/var/lib/postgresql/data
    ports:
      # Host-side access: 127.0.0.1:5434 (Windows native scripts)
      - "127.0.0.1:5434:5432"
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U legal_admin -d legal_ai_db -h 127.0.0.1"]
      interval: 5s
      timeout: 3s
      retries: 30
      start_period: 30s
    networks:
      - legal-ai-network
    deploy:
      resources:
        limits:
          memory: 2G
          cpus: "2.0"
    restart: unless-stopped

  # Valkey (Redis-compatible cache)
  valkey:
    image: valkey/valkey-bundle:8
    container_name: legal-ai-valkey
    volumes:
      - valkey_data:/data
    ports:
      - "127.0.0.1:6379:6379"
    healthcheck:
      test: ["CMD", "redis-cli", "ping"]
      interval: 5s
      timeout: 3s
      retries: 30
      start_period: 10s
    networks:
      - legal-ai-network
    restart: unless-stopped

  # Qdrant vector database (CPU-based, 768d canonical semantic + BM42 sparse)
  qdrant:
    image: qdrant/qdrant:v1.18.2
    container_name: legal-ai-qdrant
    environment:
      QDRANT_API_KEY: qdrant_key
      QDRANT__SERVICE__HTTP_PORT: 6333
      QDRANT__SERVICE__GRPC_PORT: 6334
    volumes:
      - qdrant_data:/qdrant/storage
    ports:
      # HTTP REST (read-only operations, collection metadata)
      - "127.0.0.1:6333:6333"
      # gRPC (hot path, all retrieval queries)
      - "127.0.0.1:6334:6334"
    healthcheck:
      test: ["CMD-SHELL", "curl -fsS http://127.0.0.1:6333/health | grep -q '\"status\":\"ok\"'"]
      interval: 5s
      timeout: 3s
      retries: 30
      start_period: 15s
    networks:
      - legal-ai-network
    restart: unless-stopped

  # Go Embedding Service (semantic_768 producer)
  legal-ai-go-embedding:
    image: legal-ai-go-embedding:latest
    container_name: legal-ai-go-embedding
    environment:
      EMBEDDING_MODEL: "embeddinggemma:latest"
      EMBEDDING_DIMENSION: "768"
      EMBEDDING_REPRESENTATION: "semantic_768"
      CUDA_VISIBLE_DEVICES: "0"
      PYTORCH_CUDA_ALLOC_CONF: "max_split_size_mb:256,expandable_segments:True"
    ports:
      - "127.0.0.1:8097:8097"
    healthcheck:
      test: ["CMD", "curl", "-fsS", "http://127.0.0.1:8097/health"]
      interval: 10s
      timeout: 5s
      retries: 30
      start_period: 30s
    deploy:
      resources:
        reservations:
          devices:
            - driver: nvidia
              count: 1
              capabilities: [gpu]
    networks:
      - legal-ai-network
    restart: unless-stopped

  # Go Retrieval Service (orchestration, contracts validation, fusion)
  legal-ai-go-retrieval:
    image: legal-ai-go-retrieval:latest
    container_name: legal-ai-go-retrieval
    environment:
      # Postgres: use service name (inside Docker)
      DATABASE_URL: "postgresql://legal_admin:postgres@postgres:5432/legal_ai_db"
      # Valkey: use service name (inside Docker)
      VALKEY_URL: "redis://:redis@valkey:6379"
      # Qdrant: separate HTTP + gRPC endpoints
      QDRANT_HTTP_URL: "http://qdrant:6333"
      QDRANT_GRPC_HOST: "qdrant"
      QDRANT_GRPC_PORT: "6334"
      QDRANT_COLLECTION: "codebase_chunks_768"
      QDRANT_VECTOR_NAME: "semantic_768"
      # Embedding service: use service name (inside Docker)
      EMBEDDING_BASE_URL: "http://legal-ai-go-embedding:8097"
      EMBEDDING_REPRESENTATION: "semantic_768"
      EMBEDDING_DIMENSION: "384"
      EMBEDDING_REQUIRE_GPU: "true"
    ports:
      # HTTP API (SvelteKit backend)
      - "127.0.0.1:8100:8100"
      # gRPC (internal service-to-service)
      - "127.0.0.1:50053:50053"
    depends_on:
      postgres:
        condition: service_healthy
      valkey:
        condition: service_healthy
      qdrant:
        condition: service_healthy
      legal-ai-go-embedding:
        condition: service_healthy
    healthcheck:
      # Changed from /health to /ready (requires dependencies)
      test: ["CMD", "wget", "-qO-", "http://127.0.0.1:8100/ready"]
      interval: 10s
      timeout: 5s
      retries: 30
      start_period: 30s
    networks:
      - legal-ai-network
    restart: unless-stopped

  # Optional: RabbitMQ message queue
  rabbitmq:
    image: rabbitmq:3.12-management-alpine
    container_name: legal-ai-rabbitmq
    environment:
      RABBITMQ_DEFAULT_USER: guest
      RABBITMQ_DEFAULT_PASS: guest
    volumes:
      - rabbitmq_data:/var/lib/rabbitmq
    ports:
      - "5672:5672"
      - "15672:15672"
    healthcheck:
      test: ["CMD", "rabbitmq-diagnostics", "-q", "ping"]
      interval: 10s
      timeout: 5s
      retries: 5
    networks:
      - legal-ai-network
    restart: unless-stopped

# Volumes
volumes:
  postgres_data:
    driver: local
  valkey_data:
    driver: local
  qdrant_data:
    driver: local
  rabbitmq_data:
    driver: local

# Networks
networks:
  legal-ai-network:
    driver: bridge
```

---

## docker-compose.gpu.yml (GPU Stack — Corrected)

```yaml
version: '3.8'

services:
  # PostgreSQL 18 with pgvector (same as main stack)
  postgres:
    image: pgvector/pgvector:pg18
    container_name: legal-ai-postgres
    environment:
      POSTGRES_USER: legal_admin
      POSTGRES_PASSWORD: postgres
      POSTGRES_DB: legal_ai_db
    command:
      - "postgres"
      - "-c"
      - "io_method=worker"
      - "-c"
      - "io_workers=4"
      - "-c"
      - "shared_buffers=512MB"
      - "-c"
      - "effective_cache_size=1536MB"
      - "-c"
      - "work_mem=8MB"
      - "-c"
      - "maintenance_work_mem=256MB"
      - "-c"
      - "random_page_cost=1.1"
      - "-c"
      - "effective_io_concurrency=200"
      - "-c"
      - "jit=off"
      - "-c"
      - "track_io_timing=on"
    volumes:
      - postgres_data:/var/lib/postgresql/data
    ports:
      - "127.0.0.1:5434:5432"
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U legal_admin -d legal_ai_db -h 127.0.0.1"]
      interval: 5s
      timeout: 3s
      retries: 30
      start_period: 30s
    networks:
      - legal-ai-network
    deploy:
      resources:
        limits:
          memory: 2G
          cpus: "2.0"
    restart: unless-stopped

  # Valkey (same as main stack)
  valkey:
    image: valkey/valkey-bundle:8
    container_name: legal-ai-valkey
    volumes:
      - valkey_data:/data
    ports:
      - "127.0.0.1:6379:6379"
    healthcheck:
      test: ["CMD", "redis-cli", "ping"]
      interval: 5s
      timeout: 3s
      retries: 30
      start_period: 10s
    networks:
      - legal-ai-network
    restart: unless-stopped

  # Qdrant (same as main stack, CPU-based)
  qdrant:
    image: qdrant/qdrant:v1.18.2
    container_name: legal-ai-qdrant
    environment:
      QDRANT_API_KEY: qdrant_key
      QDRANT__SERVICE__HTTP_PORT: 6333
      QDRANT__SERVICE__GRPC_PORT: 6334
    volumes:
      - qdrant_data:/qdrant/storage
    ports:
      - "127.0.0.1:6333:6333"
      - "127.0.0.1:6334:6334"
    healthcheck:
      test: ["CMD-SHELL", "curl -fsS http://127.0.0.1:6333/health | grep -q '\"status\":\"ok\"'"]
      interval: 5s
      timeout: 3s
      retries: 30
      start_period: 15s
    networks:
      - legal-ai-network
    restart: unless-stopped

  # Go Embedding Service (GPU-accelerated)
  legal-ai-go-embedding:
    image: legal-ai-go-embedding:latest
    container_name: legal-ai-go-embedding
    environment:
      EMBEDDING_MODEL: "embeddinggemma:latest"
      EMBEDDING_DIMENSION: "384"
      EMBEDDING_REPRESENTATION: "semantic_768"
      CUDA_VISIBLE_DEVICES: "0"
      PYTORCH_CUDA_ALLOC_CONF: "max_split_size_mb:256,expandable_segments:True"
    ports:
      - "127.0.0.1:8097:8097"
    healthcheck:
      test: ["CMD", "curl", "-fsS", "http://127.0.0.1:8097/health"]
      interval: 10s
      timeout: 5s
      retries: 30
      start_period: 30s
    deploy:
      resources:
        reservations:
          devices:
            - driver: nvidia
              count: 1
              capabilities: [gpu]
    networks:
      - legal-ai-network
    restart: unless-stopped

  # Go Retrieval Service (same as main stack)
  legal-ai-go-retrieval:
    image: legal-ai-go-retrieval:latest
    container_name: legal-ai-go-retrieval
    environment:
      DATABASE_URL: "postgresql://legal_admin:postgres@postgres:5432/legal_ai_db"
      VALKEY_URL: "redis://:redis@valkey:6379"
      QDRANT_HTTP_URL: "http://qdrant:6333"
      QDRANT_GRPC_HOST: "qdrant"
      QDRANT_GRPC_PORT: "6334"
      QDRANT_COLLECTION: "codebase_chunks_768"
      QDRANT_VECTOR_NAME: "semantic_768"
      EMBEDDING_BASE_URL: "http://legal-ai-go-embedding:8097"
      EMBEDDING_REPRESENTATION: "semantic_768"
      EMBEDDING_DIMENSION: "384"
      EMBEDDING_REQUIRE_GPU: "true"
    ports:
      - "127.0.0.1:8100:8100"
      - "127.0.0.1:50053:50053"
    depends_on:
      postgres:
        condition: service_healthy
      valkey:
        condition: service_healthy
      qdrant:
        condition: service_healthy
      legal-ai-go-embedding:
        condition: service_healthy
    healthcheck:
      test: ["CMD", "wget", "-qO-", "http://127.0.0.1:8100/ready"]
      interval: 10s
      timeout: 5s
      retries: 30
      start_period: 30s
    networks:
      - legal-ai-network
    restart: unless-stopped

volumes:
  postgres_data:
    driver: local
  valkey_data:
    driver: local
  qdrant_data:
    driver: local

networks:
  legal-ai-network:
    driver: bridge
```

---

## Verification Commands (After Stack Starts)

**1. Verify pgvector extension exists:**
```bash
docker exec legal-ai-postgres psql -U legal_admin -d legal_ai_db -c \
  "SELECT current_setting('server_version') AS postgres_version, extversion AS pgvector_version FROM pg_extension WHERE extname = 'vector';"
```

**2. Verify Qdrant health:**
```bash
curl -s http://127.0.0.1:6333/health | jq .
# Expected: {"status":"ok"}
```

**3. Verify Qdrant collection (after semantic_768 created):**
```bash
curl -s http://127.0.0.1:6333/collections/codebase_chunks_768 | jq '.result | {points_count, vectors_count}'
```

**4. Verify Go embedding service:**
```bash
curl -s http://127.0.0.1:8097/health | jq .
# Expected: {"status":"ready","dimension":768,"model":"embeddinggemma:latest"}
```

**5. Verify Go retrieval readiness:**
```bash
curl -s http://127.0.0.1:8100/ready | jq .
# Expected: {"status":"ready","dependencies":{"postgres":{"healthy":true},...}}
```

**6. Test end-to-end semantic query (after vectors backfilled):**
```bash
curl -s -X POST http://127.0.0.1:8100/search/semantic \
  -H "Content-Type: application/json" \
  -d '{"query":"authentication session validation","limit":10}' | jq '.results | length'
```

---

## Known Limitations (Do NOT Optimize Yet)

- ✅ Qdrant 1.18.2 CPU-based (no GPU indexing) — correct for 8GB RTX 3060 Ti
- ✅ jit=off (JIT cost > benefit for indexed metadata queries) — correct baseline
- ✅ 768-dim vectors isolated in read-only collection — do not query yet
- ✅ No named vector fusion in hot path — fusion happens in Go retrieval layer

---

## Next: Vector Backfill & Proof

1. Create `codebase_chunks_768` collection with named vectors (semantic_768, bm42_sparse)
2. Backfill 52,380 vectors from Postgres
3. Test semantic query → cache hit (two identical queries, second cached)
4. THEN optimize SOM/Autoencoder/Neo4j
