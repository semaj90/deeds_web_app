# 🚀 Phase 3 TensorRT Quick Start Guide

**Goal**: Set up GPU-accelerated inference with TensorRT-LLM + Triton

---

## ✅ Prerequisites Checklist

- [ ] NVIDIA GPU (RTX 3060 Ti confirmed)
- [ ] Docker Desktop with WSL2 backend
- [ ] NVIDIA Container Toolkit installed
- [ ] TensorRT-LLM installed (WSL)
- [ ] Ollama with gemma3-legal:latest and embeddinggemma:latest

---

## 📋 Step-by-Step Implementation

### Step 1: Build TensorRT Engine (WSL) - 30 minutes

```bash
# In WSL terminal
cd /mnt/c/Users/james/Videos/deeds-web-app

# Make script executable
chmod +x scripts/build-tensorrt-gemma3.sh

# Build the TensorRT engine
./scripts/build-tensorrt-gemma3.sh

# Verify engine created
ls -lh triton-models/gemma3-legal-tensorrt/1/model.plan
```

**Expected Output**:
```
✅ TensorRT engine built successfully!
📊 Engine info:
  - Input: input_ids, shape: [-1]
  - Output: output_ids, shape: [-1, -1]
  - GPU Memory: ~3.2 GB
  - Optimization: INT4 quantization
```

### Step 2: Start Docker Services - 5 minutes

```powershell
# In PowerShell (Windows)
cd C:\Users\james\Videos\deeds-web-app

# Start all services
docker-compose -f docker-compose.tensorrt.yml up -d

# Verify all containers running
docker ps
```

**Expected Containers**:
- ✅ triton-gemma3-legal (port 8000, 8001, 8002)
- ✅ legal-ai-postgres (port 5432)
- ✅ legal-ai-qdrant (port 6333, 6334)
- ✅ legal-ai-redis (port 6379)
- ✅ legal-ai-ollama (port 11434)
- ✅ legal-ai-minio (port 9000, 9001)

### Step 3: Verify Service Health - 5 minutes

```powershell
# Test Triton Inference Server
curl http://localhost:8000/v2/health/ready
# Expected: {"status":"SERVER_READY"}

# Test Ollama
curl http://localhost:11434/api/tags
# Expected: JSON with models list

# Test Qdrant
curl http://localhost:6333/collections
# Expected: {"result": {"collections": []}}

# Test PostgreSQL
docker exec legal-ai-postgres psql -U legal_admin -d legal_ai_db -c "SELECT version();"
# Expected: PostgreSQL version info

# Test Redis
docker exec legal-ai-redis redis-cli ping
# Expected: PONG
```

### Step 4: Reorganize Provider Structure - 10 minutes

```powershell
# Run reorganization script
cd C:\Users\james\Videos\deeds-web-app
.\scripts\reorganize-providers.ps1
```

**Expected Output**:
```
📁 Creating provider directory structure...
  ✅ Created: src\lib\services\providers\tensorrt-triton
  ✅ Created: src\lib\services\providers\ollama
  ✅ Created: src\lib\services\providers\vllm
  ✅ Created: src\lib\services\providers\openai
  ✅ Created: src\lib\services\types

📦 Moving Ollama provider files...
  ✅ Moved: ollama-service.ts -> providers/ollama/ollama-client.ts
  ✅ Moved: ollama-config.ts -> providers/ollama/config.ts

📝 Creating provider interface...
  ✅ Created: types/ai-provider.ts
  ✅ Created: types/vector-search.ts

✅ Provider stubs created
```

### Step 5: Create AI Service Orchestrator - 20 minutes

```typescript
// Copy from PHASE3-TENSORRT-ARCHITECTURE.md
// File: src/lib/services/ai-service-orchestrator.ts

// The complete implementation is in the architecture doc
// Key features:
// - TensorRT-Triton priority routing
// - Automatic fallback to Ollama
// - Health monitoring
// - Provider abstraction
```

### Step 6: Create Vector Search Service - 20 minutes

```typescript
// Copy from PHASE3-TENSORRT-ARCHITECTURE.md
// File: src/lib/services/vector-search-service.ts

// Features:
// - Dual database support (pgvector + Qdrant)
// - Hybrid search with RRF ranking
// - embeddinggemma integration
// - Parallel queries
```

### Step 7: Test Integration - 15 minutes

```powershell
# Start SvelteKit dev server
cd sveltekit-frontend
npm run dev

# Visit AI chat
start http://localhost:5173/ai-chat

# Test TensorRT inference
# Type: "Explain contract law"
# Expected: TensorRT-Triton badge visible, response <1s
```

---

## 🎯 Verification Checklist

### Infrastructure
- [ ] All Docker containers running
- [ ] Triton health check passes
- [ ] Ollama health check passes
- [ ] pgvector accessible
- [ ] Qdrant accessible
- [ ] Redis accessible

### Code Structure
- [ ] Provider directories created
- [ ] Type definitions in place
- [ ] Triton client stub created
- [ ] Ollama files moved

### Integration
- [ ] AI orchestrator created
- [ ] Vector search service created
- [ ] Embedding service created
- [ ] Health monitor created

### Testing
- [ ] TensorRT inference works
- [ ] Ollama fallback works
- [ ] Vector search returns results
- [ ] Embeddings generate correctly
- [ ] RAG pipeline functional

---

## 🚨 Common Issues & Solutions

### Issue 1: TensorRT Engine Build Fails

**Symptoms**:
```bash
Error: CUDA out of memory
```

**Solution**:
```bash
# Reduce batch size and sequence length
# Edit scripts/build-tensorrt-gemma3.sh:
MAX_BATCH_SIZE=2  # Instead of 4
MAX_INPUT_LEN=1024  # Instead of 2048
```

### Issue 2: Triton Server Won't Start

**Symptoms**:
```
Error: Model not found in repository
```

**Solution**:
```bash
# Verify model files exist
ls -lh triton-models/gemma3-legal-tensorrt/1/

# Check Triton logs
docker logs triton-gemma3-legal

# Ensure config.pbtxt is valid
cat triton-models/gemma3-legal-tensorrt/config.pbtxt
```

### Issue 3: pgvector Extension Missing

**Symptoms**:
```sql
ERROR: extension "vector" does not exist
```

**Solution**:
```bash
# Restart PostgreSQL container
docker-compose -f docker-compose.tensorrt.yml restart postgres-vectordb

# Verify extension
docker exec legal-ai-postgres psql -U legal_admin -d legal_ai_db -c "CREATE EXTENSION IF NOT EXISTS vector;"
```

### Issue 4: Ollama Fallback Not Working

**Symptoms**:
```
Error: No healthy providers available
```

**Solution**:
```bash
# Check Ollama is running
curl http://localhost:11434/api/tags

# If not running, start Ollama
docker-compose -f docker-compose.tensorrt.yml up -d ollama

# Verify models installed
docker exec legal-ai-ollama ollama list
```

### Issue 5: Qdrant Collection Creation Fails

**Symptoms**:
```
Error: Collection already exists
```

**Solution**:
```bash
# Delete and recreate collection
curl -X DELETE http://localhost:6333/collections/legal-documents

# Create with correct dimensions
curl -X PUT http://localhost:6333/collections/legal-documents \
  -H 'Content-Type: application/json' \
  -d '{"vectors": {"size": 768, "distance": "Cosine"}}'
```

---

## 📊 Performance Benchmarks

### Expected Latency (RTX 3060 Ti, INT4)

| Operation | Target | Typical |
|-----------|--------|---------|
| TensorRT inference (512 tokens) | <500ms | 300-400ms |
| Ollama fallback (512 tokens) | <2s | 1.5-2s |
| Vector search (10 results) | <100ms | 50-80ms |
| Embedding generation | <50ms | 30-40ms |
| Failover time (Triton→Ollama) | <1s | 500-800ms |

### Resource Usage

| Component | Memory | GPU VRAM |
|-----------|--------|----------|
| Triton Server | 1.5GB | 3.2GB |
| PostgreSQL | 512MB | - |
| Qdrant | 256MB | - |
| Redis | 256MB | - |
| **Total** | **2.5GB** | **3.2GB** |

---

## 🎯 Next Steps After Quick Start

1. **Week 2**: Implement RAG orchestrator
2. **Week 3**: Add Playwright tests
3. **Week 4**: Optimize and deploy

---

## 📚 Reference Documents

- **PHASE3-TENSORRT-ARCHITECTURE.md** - Complete architecture
- **PHASE3-KICKOFF.md** - Original implementation plan
- **PHASE3-ANALYSIS.md** - Infrastructure audit
- **docker-compose.tensorrt.yml** - Service configuration
- **db/init-pgvector.sql** - Database schema

---

## 🚀 You're Ready to Start!

```powershell
# Final checklist
docker ps  # All containers running?
curl http://localhost:8000/v2/health/ready  # Triton ready?
curl http://localhost:11434/api/tags  # Ollama ready?
npm run dev  # Frontend running?

# If all ✅, begin coding:
code src/lib/services/ai-service-orchestrator.ts
```

**Estimated Time**: 2-3 hours for full setup
**Difficulty**: Intermediate (Docker + GPU knowledge helpful)
**Outcome**: Production-grade GPU-accelerated AI inference! 🔥
