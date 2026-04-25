# 🤖 YoRHa Legal AI Development Orchestrator - Usage Guide

## ✅ **FIXED ISSUES**

The development orchestrator (`scripts/dev.mjs`) has been fixed for Windows compatibility:

- ✅ Fixed `spawn` import duplication 
- ✅ Added proper TCP port checking using Node.js `net` module
- ✅ Improved Windows command execution
- ✅ Made PostgreSQL and Redis external services (not auto-started)
- ✅ Added frontend-only development mode

## 🚀 **Quick Start**

### 1. Start Essential Services First
```bash
# Run the Windows service starter
start-services.bat

# OR manually start services:
net start postgresql-x64-17
redis-windows\redis-server.exe
ollama serve
```

### 2. Start Development Environment
```bash
# Frontend only (recommended for quick development)
npm run dev -- --frontend-only

# All services (requires Go microservices built)
npm run dev

# Include optional services like Qdrant
npm run dev -- --include-optional
```

## 📊 **Current Status**

The orchestrator successfully detected:

✅ **PostgreSQL + pgvector** - Port 5432 (HEALTHY)
✅ **Ollama LLM** - Port 11434 (HEALTHY)  
✅ **SvelteKit Frontend** - Port 5173 (HEALTHY)
⚠️ **Redis Cache** - Port 6379 (needs manual start)
⚠️ **Go Services** - Ports 8080/8081 (optional for frontend dev)

## 🔧 **Service URLs**

- **Frontend**: http://localhost:5173
- **Ollama API**: http://localhost:11434
- **Go API** (when running): http://localhost:8080
- **Qdrant** (optional): http://localhost:6333

## 📋 **Development Commands**

```bash
# Start with different modes
npm run dev -- --frontend-only     # SvelteKit only
npm run dev -- --include-optional  # Include Qdrant
npm run dev -- --no-monitor       # Start and exit
npm run dev -- --help             # Show help

# Service management (planned)
npm run status    # Check service status
npm run health    # Health check all services  
npm run logs      # View service logs
npm run stop      # Stop all services
```

## 🛠️ **Service Management**

### PostgreSQL
```bash
# Start/stop PostgreSQL service
net start postgresql-x64-17
net stop postgresql-x64-17

# Check if running
netstat -an | findstr ":5432"
```

### Redis  
```bash
# Start Redis (manual)
redis-windows\redis-server.exe

# Check if running
netstat -an | findstr ":6379"
```

### Ollama
```bash
# Start Ollama
ollama serve

# Check version
curl http://localhost:11434/api/version
```

## 🎯 **QUIC Tensor Integration**

The orchestrator is ready for your QUIC tensor processing system:

1. **Start Core Services**: PostgreSQL + Redis + Ollama
2. **Build Go QUIC Server**: `go build quic-server.go tensor-tiling.go som-clustering.go`
3. **Start Development**: `npm run dev -- --frontend-only`
4. **Test QUIC Integration**: Visit http://localhost:5173

## 🔍 **Monitoring & Health Checks**

The orchestrator provides real-time monitoring:

- **Service Health**: TCP port connectivity checks
- **HTTP Endpoints**: API health verification  
- **Monitoring Loop**: 30-second health check intervals
- **Graceful Shutdown**: Ctrl+C stops monitoring

## ⚡ **Performance Benefits**

With the fixed orchestrator, you get:

- **Fast startup**: Only starts what you need
- **Reliable detection**: TCP-based service discovery
- **Windows compatibility**: Proper Windows command handling
- **Flexible modes**: Frontend-only, full stack, or custom configurations

## 🚨 **Troubleshooting**

### Common Issues:

1. **"spawn is not defined"** - ✅ FIXED
2. **PostgreSQL not detected** - Start manually: `net start postgresql-x64-17`
3. **Redis not running** - Run: `redis-windows\redis-server.exe`
4. **Ollama not responding** - Run: `ollama serve`

### Service Dependencies:
- **SvelteKit Frontend** - No dependencies (runs standalone)
- **Go Services** - Require PostgreSQL + Redis
- **QUIC Processing** - Requires all services for full functionality

## 🎉 **Ready for Development!**

Your orchestrator is now working correctly for Windows development. You can:

✅ Start the SvelteKit frontend immediately
✅ Add QUIC tensor processing capabilities  
✅ Integrate with your existing PostgreSQL + Ollama setup
✅ Scale up to full microservices when needed

Run `npm run dev -- --frontend-only` to get started!