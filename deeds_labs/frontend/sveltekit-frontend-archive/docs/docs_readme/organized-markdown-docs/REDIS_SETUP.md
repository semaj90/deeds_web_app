# Redis Vector Database Setup for Enhanced RAG

## Prerequisites

Before running, ensure you have Docker installed and running.

## Installation & Setup

### 1. Deploy Redis with Vector Search

```bash
# Pull and run Redis Stack (includes vector search)
docker run -d --name redis-vector \
  -p 6379:6379 \
  -e REDIS_ARGS="--save 60 1000" \
  redis/redis-stack:latest

# Alternative: Using docker-compose (recommended)
```

### 2. Docker Compose Configuration

Create `docker-compose.redis.yml`:

```yaml
version: "3.8"
services:
  redis-vector:
    image: redis/redis-stack:latest
    container_name: redis-vector-db
    ports:
      - "6379:6379"
      - "8001:8001" # RedisInsight web UI
    environment:
      - REDIS_ARGS=--save 60 1000 --appendonly yes
    volumes:
      - redis_data:/data
    restart: unless-stopped
    healthcheck:
      test: ["CMD", "redis-cli", "ping"]
      interval: 30s
      timeout: 10s
      retries: 5

volumes:
  redis_data:
```

### 3. Start Redis

```bash
# Using docker-compose
docker-compose -f docker-compose.redis.yml up -d

# Verify Redis is running
docker ps | grep redis-vector

# Test connection
docker exec redis-vector-db redis-cli ping
```

### 4. Schema & Index Setup

The Redis integration will automatically create the necessary vector indexes on first use with schema:

```json
{
  "id": "doc_unique_id",
  "embedding": [0.1, 0.2, ...], // 384-dim vector (Ollama Gemma)
  "metadata": {
    "title": "Document title",
    "source": "file_path_or_url",
    "type": "pdf|web|code|chat",
    "timestamp": "2025-07-30T12:00:00Z",
    "chunk_index": 0
  },
  "ttl": 7200, // 2 hours cache
  "content": "Original text content for debugging"
}
```

## Next Steps ✅ COMPLETED

1. ✅ **Install Node.js Redis client and vector search dependencies**
   - Dependencies installed: `redis@^4.7.1`, `@qdrant/js-client-rest@^1.15.0`
   - All required packages available in package.json

2. ✅ **Implement Redis vector service in backend**
   - Service implemented: `src/lib/services/redis-vector-service.ts` (11.6KB)
   - Features: Vector storage, semantic search, batch operations, health checks

3. ✅ **Add semantic caching layer**
   - TTL-based caching implemented with configurable expiration
   - Query result caching for performance optimization
   - Cache hit/miss metrics and monitoring

4. ✅ **Integrate with existing RAG system**
   - API integration: `/api/rag` endpoint with Redis backend
   - Document ingestion pipeline connected
   - Multi-agent workflow integration complete
   - VS Code extension commands functional

## 🚀 Ready for Production

**Status**: All components implemented and tested
**Activation**: Start Docker services with `npm run start`
**Testing**: Use sample documents in `uploads/documents/`
**Monitoring**: Redis Insight UI at http://localhost:8001

## Monitoring

- Redis Insight UI: http://localhost:8001
- Health check: `docker exec redis-vector-db redis-cli ping`
- Vector index stats: `FT.INFO vector_index`
