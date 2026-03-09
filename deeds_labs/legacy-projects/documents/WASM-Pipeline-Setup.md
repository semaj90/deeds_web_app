# WASM Legal Document Processing Pipeline

Complete setup guide for the AssemblyScript WASM → Go → pgvector pipeline.

## Architecture Overview

```
[SvelteKit Client] → [WASM Parser] → [Go API] → [Redis Queue] → [Go Worker] → [pgvector]
      ↓                                          ↓
[Real-time SSE Updates] ←──────── [Redis Pub/Sub] ←──────── [Processing Events]
```

## Components

1. **AssemblyScript WASM Parser** - Client-side legal document parsing
2. **Go API Gateway** - SSE + ingestion endpoint + Redis enqueue
3. **Go Worker** - Redis job consumer + Ollama embeddings + pgvector storage
4. **PostgreSQL + pgvector** - Vector similarity search database
5. **SvelteKit Client** - WASM loading + file upload + real-time updates

## Prerequisites

- Node.js 18+ (for SvelteKit)
- Go 1.21+ (for microservices)
- PostgreSQL 17+ with pgvector extension
- Redis 6+ (for job queuing and pub/sub)
- Docker Desktop (recommended for PostgreSQL + Redis)

## Setup Instructions

### 1. Database Setup

Run the PostgreSQL container with pgvector:

```bash
# Use existing legal-ai-postgres container or start new one
docker run --name legal-ai-postgres -d \
  -e POSTGRES_DB=legal_ai_db \
  -e POSTGRES_USER=legal_admin \
  -e POSTGRES_PASSWORD=123456 \
  -p 5433:5432 \
  pgvector/pgvector:pg17
```

Create database schema:

```bash
cd legal-gateway
docker exec -i legal-ai-postgres psql -U legal_admin -d legal_ai_db < schema.sql
```

### 2. Redis Setup

```bash
# Use existing Redis or start new container
docker run --name legal-ai-redis -d -p 6379:6379 redis:7-alpine
```

### 3. Build WASM Modules

```bash
cd sveltekit-frontend

# Install AssemblyScript if not already installed
npm install -D assemblyscript

# Build legal parser WASM
npx asc src/wasm/legal-parser.ts --target legal-parser

# Verify WASM files created
ls -la static/wasm/legal-parser.*
```

### 4. Go Services Setup

```bash
cd legal-gateway

# Initialize Go modules and download dependencies
go mod tidy

# Build services
go build -o legal-api main.go
go build -o legal-worker worker.go
```

### 5. Environment Configuration

Create `.env` file in `legal-gateway/`:

```env
# Database
DATABASE_URL=postgres://legal_admin:123456@localhost:5433/legal_ai_db?sslmode=disable

# Redis
REDIS_URL=redis://127.0.0.1:6379/0

# Ollama (adjust if different)
OLLAMA_URL=http://localhost:11434

# API Server
PORT=8080
```

### 6. Start Services

#### Terminal 1: Go API Gateway
```bash
cd legal-gateway
export $(cat .env | xargs) && ./legal-api
# Expected output:
# ✅ Connected to Redis
# 🚀 Legal Gateway API server starting on port 8080
# 📡 Redis connected: redis://127.0.0.1:6379/0
```

#### Terminal 2: Go Worker
```bash
cd legal-gateway  
export $(cat .env | xargs) && ./legal-worker
# Expected output:
# ✅ Worker connected to Redis
# ✅ Worker connected to PostgreSQL
# ✅ pgvector extension verified
# 🚀 Worker ready - waiting for jobs...
```

#### Terminal 3: SvelteKit Frontend
```bash
cd sveltekit-frontend
npm run dev
# Expected output:
# ➜  Local:   http://localhost:5174/
```

### 7. Test the Pipeline

1. **Open the demo page**: http://localhost:5174/demo/wasm-parser

2. **Prepare test document** - Create `test-legal-doc.json`:

```json
[
  {
    "id": "doc-1",
    "title": "Sample Contract Agreement",
    "content": "This contract agreement is entered into between Party A and Party B for the provision of legal services. The parties agree to the following terms: 1) Payment of $10,000 upon contract execution, 2) Delivery of services within 30 days, 3) Confidentiality obligations remain in effect. This agreement is governed by the laws of California and any disputes shall be resolved through arbitration.",
    "documentType": "contract",
    "caseNumber": "CA-2024-001"
  },
  {
    "id": "doc-2", 
    "title": "Employment Termination Notice",
    "content": "Notice is hereby given that the employment of John Smith with ABC Corporation will be terminated effective December 31, 2024. The termination is due to company restructuring. Employee will receive severance pay equivalent to 3 months salary and continuation of health benefits for 6 months. All company property must be returned by the termination date.",
    "documentType": "employment",
    "caseNumber": "EMP-2024-015"
  }
]
```

3. **Test the pipeline**:
   - Upload the JSON file
   - Watch WASM parsing in browser console
   - Monitor real-time SSE events
   - Check Go services logs
   - Verify database storage

## Testing Commands

### Check Database Results

```bash
# Connect to database
docker exec -it legal-ai-postgres psql -U legal_admin -d legal_ai_db

# Check stored messages
SELECT id, case_id, sender, LEFT(content, 100) as content_preview, created_at 
FROM messages ORDER BY created_at DESC LIMIT 5;

# Check embeddings
SELECT m.id, m.case_id, me.model, 
       array_length(string_to_array(trim(both '[]' from me.embedding::text), ','), 1) as dimensions,
       me.created_at
FROM messages m 
JOIN message_embeddings me ON m.id = me.message_id 
ORDER BY me.created_at DESC LIMIT 5;

# Test similarity search
SELECT * FROM search_similar_documents(
  (SELECT embedding FROM message_embeddings LIMIT 1),
  0.5, 3
);

# Get statistics
SELECT * FROM get_document_stats();
```

### Check Redis Queue Status

```bash
# Check job queue length
redis-cli -h localhost -p 6379 LLEN "ingest:jobs"

# Monitor pub/sub events
redis-cli -h localhost -p 6379 MONITOR

# Check job status
redis-cli -h localhost -p 6379 GET "job:status:job-xxxxx"
```

### API Health Check

```bash
# Check API health
curl http://localhost:8080/api/health

# Test SSE endpoint
curl -N http://localhost:8080/api/events/subscribe

# Check job status
curl http://localhost:8080/api/status/job-xxxxx
```

## Performance Characteristics

### Expected Performance
- **WASM Parsing**: ~1-5ms per document (client-side)
- **Embedding Generation**: ~200-500ms per document (Gemma/nomic-embed-text)
- **Database Storage**: ~10-50ms per document
- **Vector Search**: ~1-20ms per query (depending on dataset size)

### Scaling Considerations

**For High Volume (>1000 docs/hour)**:
- Run multiple Go workers
- Use connection pooling (already configured)
- Add IVFFLAT indexing for large vector datasets
- Consider Redis Cluster for distributed queuing

**For Large Documents**:
- Implement chunking in WASM parser
- Batch embedding requests to Ollama
- Use streaming for file uploads

## Troubleshooting

### Common Issues

1. **WASM Loading Failed**
   - Check browser console for detailed errors
   - Verify WASM files exist in `/static/wasm/`
   - Ensure SvelteKit is serving static files correctly

2. **Database Connection Failed**
   - Verify PostgreSQL container is running: `docker ps | grep postgres`
   - Check connection string in environment variables
   - Ensure pgvector extension is installed

3. **Embedding Generation Failed**
   - Verify Ollama is running: `curl http://localhost:11434/api/tags`
   - Check if required models are installed:
     ```bash
     ollama list
     # Should show: embeddinggemma:latest and/or nomic-embed-text:latest
     ```

4. **SSE Connection Issues**
   - Check CORS configuration in Go API
   - Verify Redis pub/sub is working
   - Check browser network tab for SSE connection status

### Debug Commands

```bash
# Check Go service logs
journalctl -f -u legal-api
journalctl -f -u legal-worker

# Monitor Redis operations
redis-cli -h localhost -p 6379 MONITOR

# Check PostgreSQL logs
docker logs legal-ai-postgres

# Test individual components
cd legal-gateway
go run main.go --test-mode
go run worker.go --test-mode
```

## Production Deployment

### Docker Compose

For production deployment, use the provided `docker-compose.yml`:

```yaml
version: '3.8'
services:
  postgres:
    image: pgvector/pgvector:pg17
    environment:
      POSTGRES_DB: legal_ai_db
      POSTGRES_USER: legal_admin  
      POSTGRES_PASSWORD: ${DB_PASSWORD}
    ports:
      - "5433:5432"
    volumes:
      - postgres_data:/var/lib/postgresql/data
      - ./schema.sql:/docker-entrypoint-initdb.d/schema.sql

  redis:
    image: redis:7-alpine
    ports:
      - "6379:6379"

  legal-api:
    build: ./legal-gateway
    ports:
      - "8080:8080"  
    environment:
      - DATABASE_URL=postgres://legal_admin:${DB_PASSWORD}@postgres:5432/legal_ai_db?sslmode=disable
      - REDIS_URL=redis://redis:6379/0
    depends_on:
      - postgres
      - redis

  legal-worker:
    build: ./legal-gateway
    command: ./legal-worker
    environment:
      - DATABASE_URL=postgres://legal_admin:${DB_PASSWORD}@postgres:5432/legal_ai_db?sslmode=disable  
      - REDIS_URL=redis://redis:6379/0
      - OLLAMA_URL=http://host.docker.internal:11434
    depends_on:
      - postgres
      - redis
      
volumes:
  postgres_data:
```

### Deployment Commands

```bash
# Production build
docker-compose build
docker-compose up -d

# Scale workers for high load
docker-compose up -d --scale legal-worker=3

# Monitor logs
docker-compose logs -f legal-api
docker-compose logs -f legal-worker
```

## Next Steps

1. **Add Authentication**: JWT tokens for API endpoints
2. **Implement Rate Limiting**: Protect against abuse
3. **Add Monitoring**: Prometheus metrics + Grafana dashboards
4. **Implement Caching**: Redis caching for frequent similarity searches
5. **Add Vector Quantization**: Reduce storage requirements for large datasets
6. **Implement Chunking**: Handle large documents by splitting into chunks

The pipeline is now ready for production use with real-time processing and vector similarity search capabilities! 🚀