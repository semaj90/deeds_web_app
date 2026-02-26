# Legal Search System - Setup Guide

## Prerequisites

- Docker Desktop (or Docker + Docker Compose)
- Node.js 18+
- PostgreSQL 15+ with pgvector extension
- MinIO (S3-compatible object storage)
- Ollama with Gemma3 embeddings model

## Environment Variables

Create a `.env.local` file in the `sveltekit-frontend` directory:

```env
# PostgreSQL
DATABASE_URL=postgresql://postgres:postgres@localhost:5432/legal_search

# MinIO
MINIO_ENDPOINT=localhost:9000
MINIO_ACCESS_KEY=minioadmin
MINIO_SECRET_KEY=minioadmin
MINIO_USE_SSL=false

# Ollama
OLLAMA_API_URL=http://localhost:11434
OLLAMA_EMBEDDING_MODEL=embeddinggemma:latest
OLLAMA_LLM_MODEL=gemma3-legal:latest

# Qdrant
QDRANT_URL=http://localhost:6333
QDRANT_API_KEY=

# Elasticsearch
ELASTICSEARCH_URL=http://localhost:9200

# Redis
REDIS_URL=redis://localhost:6379

# RabbitMQ
RABBITMQ_URL=amqp://guest:guest@localhost:5672
```

## Docker Compose Setup

Create a `docker-compose.yml` in the project root:

```yaml
version: '3.8'

services:
  # PostgreSQL with pgvector
  postgres:
    image: pgvector/pgvector:pg15-latest
    container_name: legal-search-postgres
    environment:
      POSTGRES_DB: legal_search
      POSTGRES_USER: postgres
      POSTGRES_PASSWORD: postgres
    ports:
      - '5432:5432'
    volumes:
      - postgres_data:/var/lib/postgresql/data
    healthcheck:
      test: ['CMD-SHELL', 'pg_isready -U postgres']
      interval: 10s
      timeout: 5s
      retries: 5

  # MinIO
  minio:
    image: minio/minio:latest
    container_name: legal-search-minio
    environment:
      MINIO_ROOT_USER: minioadmin
      MINIO_ROOT_PASSWORD: minioadmin
    ports:
      - '9000:9000'
      - '9001:9001'
    volumes:
      - minio_data:/minio_data
    command: server /minio_data --console-address ":9001"
    healthcheck:
      test: ['CMD', 'curl', '-f', 'http://localhost:9000/minio/health/live']
      interval: 30s
      timeout: 20s
      retries: 3

  # Qdrant
  qdrant:
    image: qdrant/qdrant:latest
    container_name: legal-search-qdrant
    ports:
      - '6333:6333'
    volumes:
      - qdrant_data:/qdrant/storage
    environment:
      QDRANT_API_KEY: ''
    healthcheck:
      test: ['CMD', 'curl', '-f', 'http://localhost:6333/health']
      interval: 30s
      timeout: 20s
      retries: 3

  # Elasticsearch
  elasticsearch:
    image: docker.elastic.co/elasticsearch/elasticsearch:8.10.0
    container_name: legal-search-elasticsearch
    environment:
      - discovery.type=single-node
      - xpack.security.enabled=false
      - ES_JAVA_OPTS=-Xms512m -Xmx512m
    ports:
      - '9200:9200'
    volumes:
      - elasticsearch_data:/usr/share/elasticsearch/data
    healthcheck:
      test: ['CMD-SHELL', 'curl -s http://localhost:9200 >/dev/null || exit 1']
      interval: 30s
      timeout: 10s
      retries: 5

  # Redis
  redis:
    image: redis:7-alpine
    container_name: legal-search-redis
    ports:
      - '6379:6379'
    volumes:
      - redis_data:/data
    healthcheck:
      test: ['CMD', 'redis-cli', 'ping']
      interval: 30s
      timeout: 10s
      retries: 3

  # RabbitMQ
  rabbitmq:
    image: rabbitmq:3.12-management-alpine
    container_name: legal-search-rabbitmq
    environment:
      RABBITMQ_DEFAULT_USER: guest
      RABBITMQ_DEFAULT_PASS: guest
    ports:
      - '5672:5672'
      - '15672:15672'
    volumes:
      - rabbitmq_data:/var/lib/rabbitmq
    healthcheck:
      test: ['CMD', 'rabbitmq-diagnostics', '-q', 'ping']
      interval: 30s
      timeout: 10s
      retries: 5

  # Ollama (optional, can run locally)
  ollama:
    image: ollama/ollama:latest
    container_name: legal-search-ollama
    ports:
      - '11434:11434'
    volumes:
      - ollama_data:/root/.ollama
    environment:
      - OLLAMA_HOST=0.0.0.0:11434

volumes:
  postgres_data:
  minio_data:
  qdrant_data:
  elasticsearch_data:
  redis_data:
  rabbitmq_data:
  ollama_data:
```

## Startup Instructions

### 1. Start Docker Services

```bash
# Start all services
docker-compose up -d

# Verify services are running
docker-compose ps

# View logs
docker-compose logs -f
```

### 2. Initialize Ollama Models

```bash
# Pull Gemma3 embeddings model
docker exec legal-search-ollama ollama pull embeddinggemma:latest

# Pull Gemma3-legal LLM model
docker exec legal-search-ollama ollama pull gemma3-legal:latest

# Verify models are loaded
docker exec legal-search-ollama ollama list
```

### 3. Initialize Legal Search System

Add to `src/hooks.server.ts`:

```typescript
import { initializeLegalSearchSystem } from '$lib/server/init/legal-search-init';

// Initialize legal search system on app startup
export async function handle({ event, resolve }) {
  // Initialize legal search system (runs once)
  try {
    await initializeLegalSearchSystem();
  } catch (error) {
    console.error('Failed to initialize legal search system:', error);
    // Continue anyway, but log the error
  }

  return resolve(event);
}
```

### 4. Verify Setup

Create a test endpoint at `src/routes/api/health/legal-search/+server.ts`:

```typescript
import { json } from '@sveltejs/kit';
import { checkLegalSearchSystemHealth } from '$lib/server/init/legal-search-init';

export async function GET() {
  const health = await checkLegalSearchSystemHealth();
  return json(health);
}
```

Then visit: `http://localhost:5173/api/health/legal-search`

Expected response:
```json
{
  "initialized": true,
  "database": {
    "healthy": true,
    "tables": {
      "cases": true,
      "crimes": true,
      "case_chunks": true,
      "laws": true,
      "law_sections": true
    }
  },
  "minio": true,
  "healthy": true
}
```

## MinIO Bucket Structure

After initialization, three buckets will be created:

### 1. `minio_bucket_laws` (Raw Documents)
```
minio_bucket_laws/
├── CA/PC/211.pdf                    # Raw statute PDF
├── CA/PC/459.pdf
├── US/USC/18/1201.pdf
└── cases/CA/2024-001/chunk_0.pdf    # Case file chunks
```

### 2. `minio_bucket_laws_parsed` (Extracted Text)
```
minio_bucket_laws_parsed/
├── CA/PC/211.txt                    # Extracted text
├── CA/PC/459.txt
└── cases/CA/2024-001/chunk_0.txt
```

### 3. `minio_bucket_laws_metadata` (JSON Metadata)
```
minio_bucket_laws_metadata/
├── CA/PC/211.json                   # LangExtract output + crime metadata
├── CA/PC/459.json
└── cases/CA/2024-001/chunk_0.json
```

## MinIO Console

Access MinIO console at: `http://localhost:9001`
- Username: `minioadmin`
- Password: `minioadmin`

## Database Verification

Connect to PostgreSQL:

```bash
# Using psql
psql -h localhost -U postgres -d legal_search

# Verify tables exist
\dt

# Check pgvector extension
SELECT * FROM pg_extension WHERE extname = 'vector';

# Check case_chunks table structure
\d case_chunks

# Check indexes
\di
```

## Troubleshooting

### PostgreSQL Connection Issues
```bash
# Check if PostgreSQL is running
docker ps | grep postgres

# View PostgreSQL logs
docker logs legal-search-postgres

# Restart PostgreSQL
docker restart legal-search-postgres
```

### MinIO Connection Issues
```bash
# Check if MinIO is running
docker ps | grep minio

# View MinIO logs
docker logs legal-search-minio

# Test MinIO connection
curl http://localhost:9000/minio/health/live
```

### Ollama Model Issues
```bash
# Check if Ollama is running
docker ps | grep ollama

# View Ollama logs
docker logs legal-search-ollama

# List available models
docker exec legal-search-ollama ollama list

# Pull a model manually
docker exec legal-search-ollama ollama pull embeddinggemma:latest
```

### Database Schema Issues
```bash
# Drop and recreate tables (WARNING: deletes data)
docker exec legal-search-postgres psql -U postgres -d legal_search -c "DROP TABLE IF EXISTS case_chunks CASCADE; DROP TABLE IF EXISTS crimes CASCADE; DROP TABLE IF EXISTS cases CASCADE; DROP TABLE IF EXISTS law_sections CASCADE; DROP TABLE IF EXISTS laws CASCADE;"

# Re-run initialization
# Restart the app or call initializeLegalSearchSystem() again
```

## Next Steps

1. **Task 2**: Implement LangExtract integration and chunking pipeline
2. **Task 3**: Implement embedding generation and storage
3. **Task 4**: Set up Qdrant collection and indexing
4. **Task 5**: Set up Elasticsearch indices and mappings

