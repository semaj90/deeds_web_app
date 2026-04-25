# 🚀 LEGAL AI PLATFORM - COMPLETE TODO LIST
## Windows 10 Native Stack - Full Pipeline Integration

---

## ✅ COMPLETED (80% Operational)
- [x] SvelteKit Frontend running on port 5176
- [x] Ollama LLM connected (v0.11.4)
- [x] Enhanced RAG Service (port 8095) - Real-time training active
- [x] Upload Service (port 8093) - Document processing ready
- [x] MinIO Object Storage (port 9000) - Ready for documents
- [x] Neo4j Desktop installed (starting up)
- [x] PostgreSQL connected (minor table issue)
- [x] 37 Legal PDFs processed and indexed
- [x] GPU acceleration ready (RTX 3060 Ti)
- [x] XState behavioral analytics configured

---

## 📋 TODO LIST - Priority Order

### 🔴 CRITICAL (Do First)

#### 1. Fix PostgreSQL Table Access
```powershell
# Connect to PostgreSQL
psql -U legal_admin -d legal_ai_db -h localhost

# Create missing tables
CREATE TABLE IF NOT EXISTS documents (
    id SERIAL PRIMARY KEY,
    title VARCHAR(255),
    content TEXT,
    embedding vector(768),
    created_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS users (
    id SERIAL PRIMARY KEY,
    email VARCHAR(255) UNIQUE,
    password_hash VARCHAR(255),
    created_at TIMESTAMP DEFAULT NOW()
);

# Create pgvector extension
CREATE EXTENSION IF NOT EXISTS vector;
```

#### 2. Configure Neo4j Desktop
```powershell
# Start Neo4j Desktop manually
# Set password to: password123
# Run these Cypher commands in Neo4j Browser:

CREATE INDEX entity_id FOR (n:LegalEntity) ON (n.id);
CREATE INDEX entity_type FOR (n:LegalEntity) ON (n.type);
CREATE FULLTEXT INDEX entity_search FOR (n:LegalEntity) ON EACH [n.title, n.content];
```

#### 3. Configure MinIO Bucket
```powershell
# Access MinIO Console: http://localhost:9001
# Login: minioadmin / minioadmin123
# Create bucket: legal-documents
# Set bucket policy to public-read
```

---

### 🟡 HIGH PRIORITY

#### 4. Update Environment Variables
Create `.env` file in root:
```env
# Database
DATABASE_URL=postgresql://legal_admin:LegalAI2024!@localhost:5432/legal_ai_db
POSTGRES_USER=legal_admin
POSTGRES_PASSWORD=LegalAI2024!
POSTGRES_DB=legal_ai_db

# Neo4j
NEO4J_URI=bolt://localhost:7687
NEO4J_USERNAME=neo4j
NEO4J_PASSWORD=password123

# MinIO
MINIO_ENDPOINT=localhost:9000
MINIO_ACCESS_KEY=minioadmin
MINIO_SECRET_KEY=minioadmin123
MINIO_BUCKET=legal-documents

# Ollama
OLLAMA_BASE_URL=http://localhost:11434
OLLAMA_MODEL=gemma3:latest

# Redis
REDIS_URL=redis://localhost:6379

# Services
VITE_API_URL=http://localhost:8094
VITE_UPLOAD_URL=http://localhost:8093
VITE_NEO4J_SERVICE_URL=http://localhost:7475
```

#### 5. Install Missing Dependencies
```powershell
# In root directory
npm install

# In sveltekit-frontend
cd sveltekit-frontend
npm install

# Go dependencies
cd go-services
go mod tidy

cd ../go-microservice
go mod tidy
```

#### 6. Fix npm run dev:full Script
```powershell
# Run the integration script
.\COMPLETE-WINDOWS-INTEGRATION.ps1 -StartAll

# This will create npm scripts:
npm run dev:full        # Start everything
npm run dev:full:status # Check status
npm run dev:full:stop   # Stop all
npm run dev:full:test   # Test pipeline
```

---

### 🟢 STANDARD PRIORITY

#### 7. Setup Redis (if not installed)
```powershell
# Download Redis for Windows
Invoke-WebRequest -Uri "https://github.com/microsoftarchive/redis/releases/download/win-3.2.100/Redis-x64-3.2.100.msi" -OutFile "Redis-installer.msi"

# Install Redis
msiexec /i Redis-installer.msi /quiet

# Start Redis
redis-server
```

#### 8. Configure Qdrant Vector Database
```powershell
# Download Qdrant
Invoke-WebRequest -Uri "https://github.com/qdrant/qdrant/releases/latest/download/qdrant-x86_64-pc-windows-msvc.exe" -OutFile "qdrant.exe"

# Start Qdrant
.\qdrant.exe --config-path config/config.yaml
```

#### 9. Setup GPU Acceleration
```powershell
# Set CUDA environment variables
$env:CUDA_VISIBLE_DEVICES = "0"
$env:TF_GPU_MEMORY_LIMIT = "6144"

# Verify GPU in Ollama
ollama run gemma3:latest --verbose
```

#### 10. Create Database Migrations
```powershell
cd sveltekit-frontend

# Generate migrations
npx drizzle-kit generate

# Run migrations
npx drizzle-kit migrate

# Seed database
node simple-seed.mjs
```

---

### 🔵 OPTIMIZATION & MONITORING

#### 11. Setup Service Monitoring
```powershell
# Create monitoring dashboard
cd sveltekit-frontend
npm run monitor
```

#### 12. Configure Load Balancing
```nginx
# nginx.conf for production
upstream backend {
    server localhost:8094;
    server localhost:8095;
    server localhost:8093;
}

server {
    listen 80;
    location /api {
        proxy_pass http://backend;
    }
}
```

#### 13. Setup Logging
```powershell
# Create logs directory
mkdir logs

# Configure log rotation
# Add to each service startup:
# 2>&1 | Tee-Object -FilePath "logs/service-name.log"
```

#### 14. Performance Tuning
```powershell
# PostgreSQL optimization
# Edit postgresql.conf:
shared_buffers = 2GB
effective_cache_size = 6GB
work_mem = 256MB
maintenance_work_mem = 1GB

# Node.js optimization
$env:NODE_OPTIONS = "--max-old-space-size=8192"

# Go optimization
$env:GOGC = 50
$env:GOMAXPROCS = 8
```

---

## 🧪 TESTING CHECKLIST

### End-to-End Tests
- [ ] Document upload via frontend
- [ ] Document processing in MinIO
- [ ] Text extraction and embedding generation
- [ ] Vector storage in PostgreSQL/Qdrant
- [ ] Neo4j entity creation
- [ ] Semantic search functionality
- [ ] AI chat with context
- [ ] User authentication flow
- [ ] Real-time updates via WebSocket

### Integration Tests
```powershell
# Run all tests
npm run test:e2e

# Test specific service
curl http://localhost:8094/health
curl http://localhost:8093/health
curl http://localhost:7475/health

# Test document upload
curl -X POST http://localhost:8093/upload \
  -F "file=@test.pdf" \
  -F "metadata={\"type\":\"legal\"}"

# Test RAG search
curl "http://localhost:8094/api/rag/search?q=contract"

# Test Neo4j query
curl "http://localhost:7475/api/neo4j/search?q=legal"
```

---

## 🚀 QUICK START COMMANDS

```powershell
# One-command startup (after setup)
.\COMPLETE-WINDOWS-INTEGRATION.ps1 -StartAll

# Or use npm
npm run dev:full

# Check everything
npm run dev:full:status

# Test pipeline
npm run dev:full:test

# Stop everything
npm run dev:full:stop
```

---

## 📊 SUCCESS CRITERIA

When fully operational, you should see:
- ✅ 10/10 services running
- ✅ Frontend accessible at http://localhost:5173
- ✅ All health checks passing
- ✅ Document upload working
- ✅ AI chat responding with context
- ✅ Neo4j graph visualization working
- ✅ Real-time updates via WebSocket
- ✅ GPU acceleration active (nvidia-smi shows usage)
- ✅ Less than 2-second response time for queries
- ✅ 100% test coverage passing

---

## 🔧 TROUBLESHOOTING

### Common Issues & Fixes

1. **Port conflicts**: Change ports in .env file
2. **Memory issues**: Increase NODE_OPTIONS and GOMAXPROCS
3. **GPU not detected**: Update CUDA drivers, restart Ollama
4. **Database connection failed**: Check PostgreSQL service, credentials
5. **Neo4j not connecting**: Ensure Neo4j Desktop is running, check password
6. **MinIO bucket error**: Create bucket manually in console
7. **Frontend not building**: Clear .svelte-kit, node_modules, reinstall
8. **Go services not starting**: Run `go mod tidy` in each service directory

---

## 📝 NOTES

- System requires ~16GB RAM minimum
- RTX 3060 Ti provides ~10x speedup for embeddings
- Keep all services on same machine for low latency
- Use PowerShell as Administrator for best results
- Windows Defender may block some ports - add exceptions

---

## ✨ FINAL STEP

Once everything is running:
```powershell
# Open browser to
http://localhost:5173

# You should see:
# - Legal AI Platform homepage
# - Upload button working
# - AI chat interface
# - Document search
# - Neo4j graph visualization
# - Real-time status indicators

# Congratulations! Your Legal AI Platform is 100% operational! 🎉
```
