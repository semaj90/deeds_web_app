# 🚀 System Startup & Testing Guide

**Date**: 2025-11-03  
**Status**: Infrastructure Running ✅

---

## ✅ Current Infrastructure Status

### Redis - RUNNING ✅
```
Container: legal-ai-redis
Status: Up 34 minutes (healthy)
Port: 6379
Health: ✅ HEALTHY
```

### Quick Test Commands

```powershell
# Test Redis (via Docker)
docker exec legal-ai-redis redis-cli PING
# Expected: PONG

# Check all running containers
docker ps

# View Redis logs
docker logs legal-ai-redis -f
```

---

## 🎮 Starting Development Server

### Option 1: Standard Start
```bash
cd sveltekit-frontend
npm run dev
```

### Option 2: GPU-Enabled Start
```bash
cd sveltekit-frontend
npm run dev:gpu
```

### Option 3: Background Start (Windows)
```powershell
cd sveltekit-frontend
Start-Process npm -ArgumentList "run", "dev:gpu" -NoNewWindow
```

---

## 🔧 Complete Infrastructure Startup

### Start All Services
```powershell
cd C:\Users\james\Videos\deeds-web-app

# Start all infrastructure
docker-compose up -d

# Or start specific services
docker-compose up -d redis postgres ollama qdrant minio
```

### Verify All Services
```powershell
# Check running containers
docker ps

# Expected services:
# - legal-ai-redis (6379)
# - legal-ai-postgres (5434)
# - legal-ai-ollama (11434)
# - legal-ai-qdrant (6333)
```

---

## 🧪 Testing Guide

### 1. Test Infrastructure
```powershell
# Redis
docker exec legal-ai-redis redis-cli PING

# PostgreSQL
docker exec legal-ai-postgres psql -U postgres -c "SELECT 1"

# Ollama
curl http://localhost:11434/api/tags
```

### 2. Test Frontend
```bash
cd sveltekit-frontend

# Start dev server
npm run dev:gpu

# Access in browser
# http://localhost:5173
```

### 3. Test API Endpoints
```powershell
# Health check
curl http://localhost:5173/api/health

# Vector search
curl http://localhost:5173/api/vector-search
```

### 4. Test GPU Compute
```bash
cd sveltekit-frontend

# Run GPU test
node test-gpu-compute.mjs

# Or in browser console
# Navigate to http://localhost:5173
# Open DevTools > Console
# Run: await import('/src/lib/webgpu/compute-shader-engine.ts')
```

---

## 🚀 Go Microservices Startup

### Compile All Services
```powershell
cd C:\Users\james\Videos\deeds-web-app

# Build and run all Go services
.\scripts\build-run-go-services.ps1

# Build only (no start)
.\scripts\build-run-go-services.ps1 -BuildOnly

# Specific services
.\scripts\build-run-go-services.ps1 -Services "gpu-orchestrator","go-enhanced-rag-service"
```

### Verify Go Services
```powershell
# Check running processes
Get-Process | Where-Object {$_.Name -like "*service*"}

# Test service health
curl http://localhost:8080/health  # legal-gateway
curl http://localhost:8094/health  # enhanced-rag
curl http://localhost:8095/health  # gpu-orchestrator
```

---

## 📊 System Health Dashboard

### Quick Health Check Script
```powershell
# Save as: check-system-health.ps1

Write-Host "`n🏥 System Health Check" -ForegroundColor Cyan
Write-Host "═══════════════════════════════════════`n" -ForegroundColor Gray

# Redis
try {
    docker exec legal-ai-redis redis-cli PING | Out-Null
    Write-Host "✅ Redis" -ForegroundColor Green
} catch {
    Write-Host "❌ Redis" -ForegroundColor Red
}

# PostgreSQL
try {
    docker exec legal-ai-postgres psql -U postgres -c "SELECT 1" 2>&1 | Out-Null
    Write-Host "✅ PostgreSQL" -ForegroundColor Green
} catch {
    Write-Host "❌ PostgreSQL" -ForegroundColor Red
}

# Ollama
try {
    $ollama = Invoke-WebRequest -Uri "http://localhost:11434/api/tags" -UseBasicParsing -TimeoutSec 2
    Write-Host "✅ Ollama" -ForegroundColor Green
} catch {
    Write-Host "❌ Ollama" -ForegroundColor Red
}

# Frontend
try {
    $fe = Invoke-WebRequest -Uri "http://localhost:5173" -UseBasicParsing -TimeoutSec 2
    Write-Host "✅ Frontend (5173)" -ForegroundColor Green
} catch {
    Write-Host "⚠️  Frontend (not started)" -ForegroundColor Yellow
}

Write-Host ""
```

---

## 🔄 Common Operations

### Restart All Services
```powershell
# Stop all
docker-compose down

# Start all
docker-compose up -d

# Restart specific service
docker-compose restart redis
```

### View Logs
```powershell
# All services
docker-compose logs -f

# Specific service
docker-compose logs -f redis

# Last 100 lines
docker-compose logs --tail=100 redis
```

### Clean Restart
```powershell
# Stop and remove containers
docker-compose down

# Remove volumes (⚠️ deletes data)
docker-compose down -v

# Rebuild and start
docker-compose up -d --build
```

---

## 🐛 Troubleshooting

### Redis Not Responding
```powershell
# Check if running
docker ps | Select-String "redis"

# Restart
docker-compose restart redis

# View logs
docker logs legal-ai-redis
```

### Frontend Won't Start
```bash
# Clear cache
rm -rf .svelte-kit node_modules/.vite

# Reinstall
npm install

# Try again
npm run dev
```

### Port Already in Use
```powershell
# Find process using port 5173
netstat -ano | findstr :5173

# Kill process (replace PID)
Stop-Process -Id <PID> -Force
```

---

## 📦 Production Deployment

### Pre-Deployment Checklist
- [ ] All tests passing
- [ ] Build succeeds
- [ ] Environment variables configured
- [ ] Database migrations applied
- [ ] Backups created

### Build for Production
```bash
cd sveltekit-frontend

# Production build
npm run build

# Preview production build
npm run preview
```

### Deploy with Docker
```powershell
# Build production images
docker-compose -f docker-compose.production.yml build

# Start production stack
docker-compose -f docker-compose.production.yml up -d
```

---

## 📋 Environment Variables

### Required Variables (.env)
```env
# Database
DATABASE_URL=postgresql://postgres:123456@localhost:5434/legal_ai_db

# Redis
REDIS_URL=redis://:redis@localhost:6379/0

# Ollama
OLLAMA_URL=http://localhost:11434
OLLAMA_MODEL=gemma3-legal:latest
EMBEDDING_MODEL=embeddinggemma:latest

# GPU
GPU_ENABLED=true
CUDA_VISIBLE_DEVICES=0

# Ports
SVELTEKIT_PORT=5173
LEGAL_ENGINE_PORT=8080
```

---

## 🎯 Quick Reference

### Most Common Commands
```powershell
# Start everything
docker-compose up -d && cd sveltekit-frontend && npm run dev:gpu

# Stop everything
docker-compose down && taskkill /F /IM node.exe

# Health check
docker ps && curl http://localhost:5173/api/health

# View logs
docker-compose logs -f redis
```

### Service Ports
| Service | Port | URL |
|---------|------|-----|
| Frontend | 5173 | http://localhost:5173 |
| Legal Gateway | 8080 | http://localhost:8080 |
| Enhanced RAG | 8094 | http://localhost:8094 |
| GPU Orchestrator | 8095 | http://localhost:8095 |
| Redis | 6379 | redis://localhost:6379 |
| PostgreSQL | 5434 | postgresql://localhost:5434 |
| Ollama | 11434 | http://localhost:11434 |
| Qdrant | 6333 | http://localhost:6333 |

---

## ✅ Current Status

**Infrastructure**: ✅ Redis Running (Healthy)  
**Frontend**: ⏸️ Ready to Start  
**Go Services**: ⏸️ Ready to Compile  
**GPU**: ✅ RTX 3060 Ti Available  
**Overall**: 92% Production Ready

**Next**: `cd sveltekit-frontend && npm run dev:gpu`
