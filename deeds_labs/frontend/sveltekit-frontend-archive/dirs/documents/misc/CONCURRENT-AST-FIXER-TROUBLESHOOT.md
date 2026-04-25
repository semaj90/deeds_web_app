# 🔧 Concurrent AST Fixer — Troubleshooting Guide

**Issue**: Service connectivity errors when running concurrent AST fixer  
**Date**: 2025-11-04  
**Status**: Fixable — Services need configuration adjustments

---

## ❌ Current Error

```
🚀 Concurrent AST Error Fixer Initializing...

⚙️  Configuration:
  • Workers: 8
  • Batch Size: 100
  • MCP Endpoint: http://localhost:3000
  • RAG Endpoint: http://localhost:8095

🔍 Checking service health...
  ❌ MCP Server: Offline
  ❌ Enhanced RAG: Offline
  ⚠️  Qdrant: Unhealthy (404)
```

---

## ✅ Service Status Matrix

| Service | Expected Port | Current Status | Required? | Fix Priority |
|---------|---------------|----------------|-----------|--------------|
| MCP Context7 | 3000 | ❌ Offline | Optional | 🟡 Low |
| Enhanced RAG | 8095 | ❌ Offline* | ⭐ Required | 🔴 High |
| Qdrant | 6333 | ⚠️ 404 Error | ⚠️ Important | 🟠 Medium |
| Redis | 6379 | ✅ Running | ⭐ Required | ✅ OK |
| Ollama | 11434 | ✅ Running | ⭐ Required | ✅ OK |

*The Go RAG service was running earlier on port 8095, but may have stopped.

---

## 🔍 Diagnosis Steps

### 1. Check Go RAG Service (Port 8095)

```powershell
# Test connection
Test-NetConnection localhost -Port 8095

# If offline, check if process exists
Get-Process | Where-Object { $_.ProcessName -like "*go*" -or $_.ProcessName -like "*rag*" }
```

**Expected**:
- ✅ TCP connect succeeded
- Process: `enhanced-rag-service.exe` or `go.exe`

**If offline**: Service crashed or was stopped after earlier session.

### 2. Check Qdrant Vector Database (Port 6333)

```powershell
# Test connection
Test-NetConnection localhost -Port 6333

# Check Docker container
docker ps | Select-String qdrant

# Test HTTP endpoint
curl http://localhost:6333/health
```

**Expected**:
- ✅ TCP connect succeeded  
- Docker: `legal-qdrant-384` running
- HTTP: `{"status":"ok"}`

**If 404**: Container running but collection not initialized.

### 3. Check MCP Server (Port 3000) — Optional

```powershell
Test-NetConnection localhost -Port 3000
```

**Expected**:
- This service is **optional**
- Can bypass by setting `MCP_ENDPOINT=disabled`

---

## 🛠️ Solutions

### Solution 1: Restart Go RAG Service (Priority: HIGH)

The Enhanced RAG service provides AI-assisted error fixing suggestions.

```powershell
# Navigate to Go microservice directory
cd C:\Users\james\Videos\deeds-web-app\go-microservice

# Check if enhanced-rag-service.go exists
Get-ChildItem -Filter "*rag*.go"

# Start the service
go run enhanced-rag-service.go

# Expected output:
# ✅ Connected to PostgreSQL with pgvector
# ✅ Connected to MinIO
# ✅ GPU Acceleration: Enabled (FlashAttention)
# ✅ Vector Search: Qdrant + pgvector hybrid
# 🌐 Listening on :8095
```

**Verify it's running**:
```powershell
curl http://localhost:8095/health
# Expected: {"status":"healthy","gpu":true}
```

**Alternative**: Use Docker if available:
```powershell
docker-compose up -d enhanced-rag
```

### Solution 2: Fix Qdrant Collection (Priority: MEDIUM)

The 404 error suggests Qdrant is running but the `error_vectors` collection doesn't exist.

```powershell
# Restart Qdrant container
docker restart legal-qdrant-384

# Wait for startup
Start-Sleep -Seconds 5

# Create error_vectors collection
$body = @{
  vectors = @{
    size = 384
    distance = "Cosine"
  }
} | ConvertTo-Json

Invoke-RestMethod -Method PUT `
  -Uri "http://localhost:6333/collections/error_vectors" `
  -ContentType "application/json" `
  -Body $body

# Verify collection exists
curl http://localhost:6333/collections/error_vectors
# Expected: {"result":{"status":"green","vectors_count":0, ...}}
```

**If Docker not available**: Use embedded Qdrant mode:

Edit `scripts/phase43-ai-analyzer.mjs`:
```javascript
const qdrant = new QdrantClient({
  url: process.env.QDRANT_URL || 'http://localhost:6333',
  timeout: 5000,
  // Add fallback:
  embedded: {
    enabled: true,
    path: './qdrant-storage'
  }
});
```

### Solution 3: Bypass MCP Server (Priority: LOW)

MCP (Model Context Protocol) server provides documentation context but is **optional**.

**Option A**: Disable via environment variable:
```powershell
$env:MCP_ENDPOINT = "disabled"
node scripts/concurrent-ast-fixer.mjs --workers=8
```

**Option B**: Edit script configuration:

File: `scripts/concurrent-ast-fixer.mjs` (line ~42)

```javascript
// Before:
const config = {
  mcpEndpoint: process.env.MCP_ENDPOINT || 'http://localhost:3000',
  // ...
};

// After:
const config = {
  mcpEndpoint: process.env.MCP_ENDPOINT || 'disabled',  // Skip MCP
  // ...
};
```

**Option C**: Start Context7 MCP server (if needed):
```powershell
# Check if installed
cd C:\Users\james\Videos\deeds-web-app\context7-mcp

# Start server
npm start
# Should listen on port 8777 (not 3000)

# If port mismatch, configure:
$env:MCP_ENDPOINT = "http://localhost:8777"
node scripts/concurrent-ast-fixer.mjs --workers=8
```

---

## ✅ Quick Fix: Minimal Working Configuration

To run the concurrent AST fixer **right now** with minimal services:

```powershell
# 1. Ensure Redis is running (already confirmed ✅)
Test-NetConnection localhost -Port 6379

# 2. Ensure Ollama is running (already confirmed ✅)
Test-NetConnection localhost -Port 11434

# 3. Start Go RAG service
cd ..\go-microservice
Start-Process powershell -ArgumentList "go run enhanced-rag-service.go"
Start-Sleep -Seconds 10

# 4. Bypass MCP and Qdrant
$env:MCP_ENDPOINT = "disabled"
$env:QDRANT_URL = "disabled"

# 5. Run concurrent fixer
cd C:\Users\james\Videos\deeds-web-app\sveltekit-frontend
node scripts/concurrent-ast-fixer.mjs --workers=4 --batch-size=50

# Expected:
# ✅ Redis: Connected
# ✅ Ollama: Connected  
# ✅ Go RAG: Connected
# ⚠️  MCP: Disabled (skipped)
# ⚠️  Qdrant: Disabled (skipped)
# 🚀 Starting 4 workers...
```

**Note**: This runs in "minimal mode" without vector similarity search (Qdrant) or documentation context (MCP). It will still fix errors using:
- ✅ Redis error cache
- ✅ Ollama AI suggestions
- ✅ Go RAG service fixes
- ✅ AST transformations

---

## 🎯 Recommended Next Steps

### Immediate (Next 5 Minutes)

1. **Restart Go RAG service**:
   ```powershell
   cd ..\go-microservice
   go run enhanced-rag-service.go
   ```

2. **Run minimal concurrent fixer**:
   ```powershell
   cd ..\sveltekit-frontend
   $env:MCP_ENDPOINT = "disabled"
   node scripts/concurrent-ast-fixer.mjs --workers=4 --batch-size=50
   ```

### Short-Term (Next 30 Minutes)

3. **Fix Qdrant collection**:
   ```powershell
   docker restart legal-qdrant-384
   # Then create error_vectors collection (see Solution 2 above)
   ```

4. **Run full concurrent fixer with Qdrant**:
   ```powershell
   Remove-Item env:MCP_ENDPOINT  # Re-enable all services
   node scripts/concurrent-ast-fixer.mjs --workers=8 --batch-size=100
   ```

### Optional (Later)

5. **Setup MCP server** (if needed):
   - Install Context7 MCP server
   - Configure port 8777
   - Update `MCP_ENDPOINT` in `.env`

---

## 📊 Service Architecture

```
Concurrent AST Fixer (Master Process)
    │
    ├─> Worker 1 ──┐
    ├─> Worker 2 ──┤
    ├─> Worker 3 ──┼──> Redis Cache (6379) ✅
    ├─> Worker 4 ──┤       │
    ├─> Worker 5 ──┤       ├──> Ollama GPU (11434) ✅
    ├─> Worker 6 ──┤       │       │
    ├─> Worker 7 ──┤       └──> Go RAG (8095) ❌ NEEDS RESTART
    └─> Worker 8 ──┘               │
                                   ├──> Qdrant (6333) ⚠️ 404
                                   └──> MCP (3000) ❌ Optional
```

**Critical Path**:
1. Redis ✅
2. Ollama ✅
3. Go RAG ❌ **← FIX THIS FIRST**
4. Qdrant ⚠️ (important but optional)
5. MCP ❌ (nice-to-have)

---

## 🔗 Environment Variables

Update `.env` to ensure correct service URLs:

```bash
# Redis (already correct)
REDIS_URL=redis://localhost:6379
REDIS_HOST=localhost
REDIS_PORT=6379
REDIS_PASSWORD=redis

# Qdrant
QDRANT_URL=http://localhost:6333
QDRANT_HOST=localhost
QDRANT_PORT=6333

# Go Services
GO_RAG_URL=http://localhost:8095  # Enhanced RAG service
RAG_ENDPOINT=http://localhost:8095

# MCP (optional)
MCP_ENDPOINT=disabled  # Or http://localhost:8777 if running

# Ollama (already correct)
OLLAMA_URL=http://localhost:11434
```

---

## ✅ Success Criteria

After fixes, running `node scripts/concurrent-ast-fixer.mjs --workers=8` should show:

```
🚀 Concurrent AST Error Fixer Initializing...

⚙️  Configuration:
  • Workers: 8
  • Batch Size: 100
  • MCP Endpoint: disabled (or http://localhost:8777)
  • RAG Endpoint: http://localhost:8095

🔍 Checking service health...
  ✅ Redis: Connected
  ✅ Ollama GPU: Connected (gemma3-legal)
  ✅ Go RAG: Connected (GPU enabled)
  ✅ Qdrant: Connected (error_vectors collection ready)
  ⚠️  MCP: Disabled (skipped)

🚀 Starting 8 workers...
📊 Processing 1,000 errors...
⏳ Progress: 100/1,000 (10.0%)
⏳ Progress: 200/1,000 (20.0%)
...
✅ Complete: 1,000/1,000
📄 Report: concurrent-fix-report.json

Summary:
  • Fixed: 637 errors
  • Skipped: 295 errors (manual review needed)
  • Failed: 68 errors
  • Time: 12m 34s
  • Files modified: 184
```

---

**Last Updated**: 2025-11-04 01:35 UTC  
**Priority**: 🔴 High — Fix Go RAG service first  
**Estimated Time**: 5-15 minutes  
**Status**: Ready to execute
