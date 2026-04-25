# ACE Web Ingestion - Setup Commands

**Quick reference for all setup commands**
**Date:** December 21, 2025

---

## 🚀 Complete Setup (Copy & Paste)

### Step 1: Database Setup

```powershell
# Set PostgreSQL password
$env:PGPASSWORD='123456'

# Test connection
psql -U legal_admin -h localhost -p 5432 -d legal_ai_db -c "SELECT 1;"

# Run migrations (creates ACE tables)
npm run db:migrate

# Verify tables created
psql -U legal_admin -h localhost -p 5432 -d legal_ai_db -c "\dt ace_*"
```

### Step 2: MinIO Bucket Setup

You already have MinIO running in Docker. Just need to create buckets:

```powershell
# Option A: Using MinIO Client (if installed)
mc alias set local http://localhost:9000 minioadmin minioadmin
mc mb local/ace-web-raw
mc mb local/ace-web-derived
mc mb local/ace-eval-logs
mc ls local/

# Option B: Using Docker exec
docker exec phase66-minio mkdir -p /data/ace-web-raw
docker exec phase66-minio mkdir -p /data/ace-web-derived
docker exec phase66-minio mkdir -p /data/ace-eval-logs

# Option C: Using MinIO Console (browser)
# 1. Open http://localhost:9001
# 2. Login: minioadmin / minioadmin
# 3. Click "Buckets" → "Create Bucket"
# 4. Create: ace-web-raw, ace-web-derived, ace-eval-logs
```

### Step 3: Verify Services

```powershell
# Run verification script
.\.kiro\specs\ace-contextual-web-ingestion\deployment\verify-ace-web.ps1

# Or test manually
curl http://127.0.0.1:6333/        # Qdrant
curl http://127.0.0.1:9000/minio/health/live  # MinIO
curl http://127.0.0.1:11434/api/tags  # Ollama
```

### Step 4: Start Worker

```powershell
# Navigate to workers directory
cd backend/workers

# Install Python dependencies (if not done)
pip install -r requirements-ace-worker.txt

# Start worker
python ace_web_worker.py
```

### Step 5: Start Frontend

```powershell
# In a new terminal
npm run dev
```

---

## 🔧 Troubleshooting Commands

### Check Docker Containers

```powershell
# List all phase66 containers
docker ps --filter "name=phase66" --format "table {{.Names}}\t{{.Status}}\t{{.Ports}}"

# Check specific container logs
docker logs phase66-postgres --tail 50
docker logs phase66-rabbitmq --tail 50
docker logs phase66-qdrant --tail 50
docker logs phase66-minio --tail 50

# Restart a container
docker restart phase66-qdrant
docker restart phase66-rabbitmq
```

### Test Database Connection

```powershell
# Test with different credentials
$env:PGPASSWORD='123456'
psql -U legal_admin -h localhost -p 5432 -d legal_ai_db -c "SELECT version();"

# List all databases
psql -U legal_admin -h localhost -p 5432 -l

# Check if ACE tables exist
psql -U legal_admin -h localhost -p 5432 -d legal_ai_db -c "
SELECT table_name
FROM information_schema.tables
WHERE table_schema = 'public'
AND table_name LIKE 'ace_%'
ORDER BY table_name;
"
```

### Test RabbitMQ

```powershell
# Test AMQP port
Test-NetConnection -ComputerName 127.0.0.1 -Port 5672

# Test Management UI
Start-Process "http://127.0.0.1:15672"
# Login: guest/guest

# Check queues from command line
docker exec phase66-rabbitmq rabbitmqctl list_queues
```

### Test Qdrant

```powershell
# Test API
curl http://127.0.0.1:6333/

# List collections
curl http://127.0.0.1:6333/collections

# Open dashboard
Start-Process "http://127.0.0.1:6333/dashboard"
```

### Test MinIO

```powershell
# Test health
curl http://127.0.0.1:9000/minio/health/live

# Open console
Start-Process "http://127.0.0.1:9001"
# Login: minioadmin/minioadmin

# List buckets (if mc installed)
mc ls local/
```

### Test Ollama

```powershell
# List models
curl http://127.0.0.1:11434/api/tags

# Test embedding generation
curl http://127.0.0.1:11434/api/embed -Method Post -Body '{
  "model": "embeddinggemma:latest",
  "input": "test text"
}' -ContentType "application/json"
```

---

## 📦 Docker Commands

### Start All Services

```powershell
# Start phase66 stack
docker-compose -f docker-compose.phase66-full.yml up -d

# Or start specific services
docker-compose -f docker-compose.phase66-full.yml up -d postgres rabbitmq qdrant minio
```

### Stop All Services

```powershell
# Stop all phase66 containers
docker-compose -f docker-compose.phase66-full.yml down

# Or stop specific services
docker stop phase66-postgres phase66-rabbitmq phase66-qdrant phase66-minio
```

### Restart Services

```powershell
# Restart all
docker-compose -f docker-compose.phase66-full.yml restart

# Restart specific service
docker restart phase66-qdrant
```

### View Logs

```powershell
# Follow logs for all services
docker-compose -f docker-compose.phase66-full.yml logs -f

# Follow logs for specific service
docker logs -f phase66-rabbitmq
```

---

## 🧪 Test ACE Endpoints

### Test Ingestion

```powershell
# Ingest a URL
curl -X POST http://localhost:5173/api/ace/web/ingest `
  -H "Content-Type: application/json" `
  -Body '{"urls":["https://svelte.dev/docs/introduction"]}' `
  -Method Post

# Expected response:
# {
#   "success": true,
#   "jobIds": ["job-123"],
#   "message": "1 URLs enqueued for ingestion"
# }
```

### Test Context Retrieval

```powershell
# Query context
curl "http://localhost:5173/api/ace/context?query=Svelte%205%20runes&limit=10"

# Expected response:
# {
#   "chunks": [...],
#   "entities": [...],
#   "edges": [...],
#   "summary": "..."
# }
```

---

## 🔑 Environment Variables

Create or update `.env` file:

```bash
# Database
DATABASE_URL=postgresql://legal_admin:123456@localhost:5432/legal_ai_db

# Services (use 127.0.0.1 if localhost doesn't work)
QDRANT_URL=http://127.0.0.1:6333
MINIO_ENDPOINT=http://127.0.0.1:9000
MINIO_ACCESS_KEY=minioadmin
MINIO_SECRET_KEY=minioadmin
RABBITMQ_URL=amqp://guest:guest@127.0.0.1:5672/
OLLAMA_URL=http://127.0.0.1:11434

# Ollama Models
OLLAMA_EMBEDDING_MODEL=embeddinggemma:latest
OLLAMA_LLM_MODEL=gemma3-legal

# ACE Configuration
ACE_SCORE_COSINE_WEIGHT=0.65
ACE_SCORE_FRESHNESS_WEIGHT=0.10
ACE_SCORE_GRAPH_WEIGHT=0.05
ACE_AUTO_WEB_SEARCH=true
ACE_RESPECT_ROBOTS_TXT=true
ACE_RATE_LIMIT_DELAY=2000

# Web Search
WEB_SEARCH_PROVIDER=mock  # or duckduckgo, brave
```

---

## 📊 Verification Checklist

```powershell
# 1. Check Docker containers
docker ps | Select-String "phase66"

# 2. Test PostgreSQL
$env:PGPASSWORD='123456'
psql -U legal_admin -h localhost -p 5432 -d legal_ai_db -c "SELECT 1;"

# 3. Test Qdrant
curl http://127.0.0.1:6333/

# 4. Test RabbitMQ
curl http://127.0.0.1:15672

# 5. Test MinIO
curl http://127.0.0.1:9000/minio/health/live

# 6. Test Ollama
curl http://127.0.0.1:11434/api/tags

# 7. Check ACE tables
psql -U legal_admin -h localhost -p 5432 -d legal_ai_db -c "\dt ace_*"

# 8. Check MinIO buckets
mc ls local/  # or use browser at http://127.0.0.1:9001
```

---

## 🎯 Quick Start (All-in-One)

```powershell
# 1. Set environment
$env:PGPASSWORD='123456'

# 2. Run migrations
npm run db:migrate

# 3. Create MinIO buckets (browser method)
Start-Process "http://127.0.0.1:9001"
# Login: minioadmin/minioadmin
# Create buckets: ace-web-raw, ace-web-derived, ace-eval-logs

# 4. Start worker (new terminal)
cd backend/workers
python ace_web_worker.py

# 5. Start frontend (new terminal)
npm run dev

# 6. Test
curl -X POST http://localhost:5173/api/ace/web/ingest `
  -H "Content-Type: application/json" `
  -Body '{"urls":["https://svelte.dev/docs"]}' `
  -Method Post
```

---

**Last Updated:** December 21, 2025
