# Docker Desktop Port Mapping Guide

## Overview
Your `deeds-web-app` uses Docker Desktop with Minio and multiple microservices. This guide ensures proper port mapping for browser access and service-to-service communication.

## Current Docker Desktop Services

| Service | Container Port | Host Port | URL (Browser) | URL (Docker) |
|---------|----------------|-----------|---------------|--------------|
| **Minio** | 9000 | 9000 | `http://localhost:9000` | `http://minio:9000` |
| **Minio Console** | 9001 | 9001 | `http://localhost:9001` | `http://minio:9001` |
| **PostgreSQL** | 5432 | 5432 | N/A (TCP) | `postgresql://postgres:5432` |
| **Redis** | 6379 | 6379 | N/A (TCP) | `redis://redis:6379` |
| **Neo4j** | 7687 | 7687 | N/A (TCP) | `bolt://neo4j:7687` |
| **Qdrant** | 6333 | 6333 | `http://localhost:6333` | `http://qdrant:6333` |
| **RabbitMQ** | 5672 | 5672 | N/A (TCP) | `amqp://rabbitmq:5672` |
| **RabbitMQ UI** | 15672 | 15672 | `http://localhost:15672` | `http://rabbitmq:15672` |
| **Ollama** | 11434 | 11434 | `http://localhost:11434` | `http://ollama:11434` |
| **SvelteKit Frontend** | 5173 | 5173 | `http://localhost:5173` | N/A |

## Browser vs Service-to-Service Communication

### ❌ WRONG (from Browser)
```javascript
// Browser cannot resolve Docker service names
fetch('http://minio:9000/api/upload')  // FAILS
fetch('http://ollama:11434/api/generate')  // FAILS
```

### ✅ CORRECT (from Browser)
```javascript
// Use localhost for Docker Desktop
fetch('http://localhost:9000/api/upload')  // WORKS
fetch('http://localhost:11434/api/generate')  // WORKS
```

### ✅ CORRECT (from Docker Container)
```javascript
// Service-to-service: use container names
fetch('http://minio:9000/api/upload')  // WORKS
fetch('http://ollama:11434/api/generate')  // WORKS
```

## Environment Variables Configuration

### Browser/Frontend Environment (`.env`)
```bash
# Accessible from browser on localhost
VITE_MINIO_ENDPOINT=http://localhost:9000
VITE_MINIO_ACCESS_KEY=minioadmin
VITE_MINIO_SECRET_KEY=minioadmin
VITE_MINIO_BUCKET=legal-documents

OLLAMA_URL=http://localhost:11434
```

### Docker Compose Services (docker-compose.yml)
```yaml
services:
  sveltekit-frontend:
    environment:
      # Browser-facing: use localhost
      VITE_MINIO_ENDPOINT: http://localhost:9000
      OLLAMA_URL: http://localhost:11434

      # Service-to-service: use container names
      DATABASE_URL: postgresql://legal_admin:123456@postgres:5432/legal_ai_db
      REDIS_URL: redis://redis:6379
      MINIO_ENDPOINT: minio:9000  # For backend code
```

### Server-Side Code (Node.js/SvelteKit Backend)
```typescript
// lib/config/environment.ts
const minioEndpoint = process.env.MINIO_ENDPOINT || 'http://localhost:9000';

// From within Docker container:
// - Use 'minio:9000' for service-to-service calls
// - Use 'http://localhost:9000' for browser context
```

## Current Code Analysis

### ✅ Correctly Configured
1. **Environment Detection** (`lib/config/environment.ts`)
   - Defaults to `http://localhost:9000` for Minio
   - Supports `VITE_MINIO_ENDPOINT` override

2. **Ollama Endpoint Resolution** (`enhanced-rag-self-organizing.ts`)
   - Browser context: `http://localhost:11434`
   - Respects `OLLAMA_URL` env var
   - Falls back to `http://localhost:11434` for Docker Desktop

3. **Minio Upload** (`lib/server/services/minio.ts`)
   - Uses `MINIO_ENDPOINT` env var
   - AWS S3 SDK handles endpoint parsing
   - Defaults to `http://localhost:9000`

### ⚠️ Needs Review
1. **docker-compose.yml** (line 91)
   ```yaml
   OLLAMA_URL=http://host.docker.internal:11434
   ```
   - ✅ Correct for Docker Desktop (on Windows/Mac)
   - ✅ Allows containers to reach host services

2. **docker-compose.yml** (line 92)
   ```yaml
   MINIO_ENDPOINT=minio:9000
   ```
   - ✅ Correct for service-to-service within Docker
   - ❌ Won't work from browser
   - **Solution**: Use `http://localhost:9000` instead when called from browser

## Recommended Changes

### 1. Update docker-compose.yml
```yaml
services:
  sveltekit-frontend:
    environment:
      # Browser context (use localhost)
      VITE_MINIO_ENDPOINT: http://localhost:9000
      VITE_OLLAMA_URL: http://localhost:11434

      # Server context (can use service names OR localhost)
      MINIO_ENDPOINT: http://localhost:9000
      OLLAMA_URL: http://localhost:11434

      # Service-to-service (use container names)
      DATABASE_URL: postgresql://legal_admin:123456@postgres:5432/legal_ai_db
      REDIS_URL: redis://redis:6379
      RABBITMQ_URL: amqp://rabbitmq:5672
```

### 2. Update .env
```bash
# Minio
VITE_MINIO_ENDPOINT=http://localhost:9000
VITE_MINIO_ACCESS_KEY=minioadmin
VITE_MINIO_SECRET_KEY=minioadmin
VITE_MINIO_BUCKET=legal-documents

# Ollama
VITE_OLLAMA_URL=http://localhost:11434
OLLAMA_URL=http://localhost:11434

# Database/Cache (service names for Docker, localhost for dev)
DATABASE_URL=postgresql://legal_admin:123456@postgres:5432/legal_ai_db
REDIS_URL=redis://redis:6379
```

### 3. Create .env.docker
```bash
# Use for docker-compose.yml environment variables
# Everything uses localhost from Docker Desktop perspective
VITE_MINIO_ENDPOINT=http://localhost:9000
VITE_OLLAMA_URL=http://localhost:11434
MINIO_ENDPOINT=http://localhost:9000
OLLAMA_URL=http://localhost:11434
DATABASE_URL=postgresql://legal_admin:123456@postgres:5432/legal_ai_db
REDIS_URL=redis://redis:6379
```

## RAG Routes Configuration

### ✅ Working RAG Endpoints
1. **File Upload to Minio**
   - Route: `/api/upload`
   - Handler: `src/routes/api/upload/+server.ts`
   - Minio Service: `lib/server/services/minio.ts`
   - Browser Access: `http://localhost:9000`

2. **Evidence Upload**
   - Route: `/api/evidence/upload`
   - Handler: `src/routes/api/evidence/upload.ts`
   - Storage: Local `/static/uploads/` and Minio

3. **RAG Query**
   - Route: `/api/ai/rag`
   - Handler: `src/routes/api/ai/rag/+server.ts`
   - Ollama: `http://localhost:11434`

4. **Document Processing**
   - Route: `/api/documents/upload`
   - Handler: `src/routes/api/documents/upload/+server.ts`
   - Processing: Local + Minio

### Enhanced RAG Self-Organizing
- **File**: `lib/services/enhanced-rag-self-organizing.ts`
- **Ollama Endpoint**: Resolved via `getOllamaEndpoint()`
- **Model Chain**: gemma3-legal:latest → gemma3:latest → gemma3:270m
- **Fallback**: Safe mock response with debugging info

## Testing Checklist

- [ ] Minio accessible: `http://localhost:9000` (browser)
- [ ] Minio console: `http://localhost:9001` (browser)
- [ ] Ollama API: `http://localhost:11434/api/tags` (browser)
- [ ] File upload works to Minio
- [ ] RAG queries execute successfully
- [ ] Evidence upload creates database records
- [ ] Models load correctly (gemma3-legal:latest)

## Troubleshooting

### Minio Connection Errors
```
Error: Cannot connect to minio:9000
Fix: Use http://localhost:9000 from browser
```

### Ollama Not Found
```
Error: Ollama endpoint unreachable
Fix: Check OLLAMA_URL=http://localhost:11434
```

### Service-to-Service Connection Issues
```
Error: Cannot connect from one container to another
Fix: Use service names within Docker network (e.g., minio:9000, ollama:11434)
```

## References
- Docker Desktop Port Mapping: https://docs.docker.com/desktop/networking/
- Minio Java Client: https://docs.min.io/minio/baremetal/
- Ollama API: https://github.com/ollama/ollama/blob/main/docs/api.md
