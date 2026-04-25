# 🚀 ENHANCED RAG V2 - COMPLETE SETUP GUIDE

## Current Status
Your system is **90% complete** with most components in place. You need to:
1. Install Go (if not already installed)
2. Build the Go services
3. Install frontend dependencies
4. Start all services

## 📋 Prerequisites Check

### Required Software
- ✅ **Node.js v22.17.1** - Already installed
- ❓ **Go 1.24+** - Need to verify/install
- ✅ **PostgreSQL** - Running on port 5432
- ❓ **Ollama** - Need to verify (for GPU acceleration)

## 🛠️ Installation Steps

### Step 1: Install Go (if needed)
```batch
# Download Go from: https://go.dev/dl/
# Install to default location: C:\Program Files\Go
# Verify installation:
go version
```

### Step 2: Build Services
Run the complete setup script:
```batch
cd C:\Users\james\Desktop\deeds-web\deeds-web-app
COMPLETE-SETUP.bat
```

Or build manually:
```batch
cd go-microservice
set CGO_ENABLED=0
go build -o legal-ai-server.exe main.go
```

### Step 3: Install Frontend Dependencies
```batch
cd frontend
npm install
```

### Step 4: Start Everything
Use the existing GPU-optimized launcher:
```batch
START-GPU-LEGAL-AI-8084.bat
```

Or start services individually:
```batch
# Terminal 1 - Backend
cd go-microservice
legal-ai-server.exe

# Terminal 2 - Frontend
cd frontend
npm run dev

# Terminal 3 - Ollama (if using)
ollama serve
```

## 🔍 Service Architecture

```
┌─────────────────────────────────────────────┐
│          Frontend (SvelteKit)               │
│            Port: 5173                       │
└─────────────┬───────────────────────────────┘
              │
              ▼
┌─────────────────────────────────────────────┐
│       Go API Gateway (Main Service)         │
│            Port: 8084                       │
├─────────────────────────────────────────────┤
│  • /api/health - Health check               │
│  • /api/chat - Chat endpoint                │
│  • /api/ai/summarize - Document summary     │
│  • /api/metrics - Performance metrics       │
└─────────────┬───────────────────────────────┘
              │
              ├──────────────┬────────────────┐
              ▼              ▼                ▼
    ┌──────────────┐ ┌──────────────┐ ┌──────────────┐
    │  PostgreSQL  │ │    Redis     │ │   Ollama     │
    │  Port: 5432  │ │  Port: 6379  │ │ Port: 11434  │
    └──────────────┘ └──────────────┘ └──────────────┘
```

## 📦 Available Scripts

| Script | Purpose |
|--------|---------|
| `COMPLETE-SETUP.bat` | Full build and install |
| `START-GPU-LEGAL-AI-8084.bat` | Start with GPU optimization |
| `QUICK-START-EXISTING.bat` | Start with existing builds |
| `VERIFY-DEPLOYMENT.ps1` | Check system status |
| `BUILD-AND-RUN.bat` | Simple build in go-microservice |

## 🎯 Quick Start Commands

### Fastest Path (if Go is installed):
```batch
# 1. Build everything
cd C:\Users\james\Desktop\deeds-web\deeds-web-app
COMPLETE-SETUP.bat

# 2. Or use the GPU-optimized starter
START-GPU-LEGAL-AI-8084.bat
```

### Manual Path:
```batch
# 1. Build Go service
cd go-microservice
set CGO_ENABLED=0
go build -o legal-ai-server.exe main.go

# 2. Install frontend deps
cd ..\frontend
npm install

# 3. Start backend
cd ..\go-microservice
start legal-ai-server.exe

# 4. Start frontend
cd ..\frontend
npm run dev
```

## ✅ Verification

Once running, check these endpoints:
- Frontend: http://localhost:5173
- API Health: http://localhost:8084/api/health
- Ollama (if using): http://localhost:11434

## 🔧 Troubleshooting

### Go not found
- Download from https://go.dev/dl/
- Install to `C:\Program Files\Go`
- Add to PATH: `C:\Program Files\Go\bin`

### Build fails
```batch
# Use pure Go build (no CGO)
set CGO_ENABLED=0
go mod tidy
go build -o service.exe main.go
```

### Port conflicts
```batch
# Check what's using a port
netstat -ano | findstr :8084

# Kill process by PID
taskkill /F /PID <process_id>
```

### Frontend issues
```batch
cd frontend
npm cache clean --force
rm -rf node_modules
npm install
```

## 📊 Best Practices Applied

✅ **Microservices Architecture**
- Isolated services on dedicated ports
- Health check endpoints
- gRPC internal communication

✅ **Database Optimization**
- pgvector for embeddings
- Connection pooling
- Optimized indexes

✅ **GPU Acceleration**
- RTX 3060 Ti (7GB VRAM)
- Ollama for inference
- CUDA optimization

✅ **Security**
- JWT authentication
- Rate limiting
- Environment variables

## 🚀 Next Steps

1. Run `COMPLETE-SETUP.bat` to build and start everything
2. Open http://localhost:5173 in your browser
3. Test the API at http://localhost:8084/api/health
4. Check logs for any issues

## 📝 Notes

- Your RTX 3060 Ti with 7GB VRAM is perfect for running Gemma3-legal model
- The system uses pure Go builds (CGO_ENABLED=0) for stability
- All services are configured for Windows native execution
- No Docker required - everything runs natively on Windows