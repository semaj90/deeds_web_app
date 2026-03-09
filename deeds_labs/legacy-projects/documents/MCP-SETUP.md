# MCP Context7 SIMD Server Setup

## ✅ Complete Integration

### 🚀 Features Implemented

1. **SIMD-Optimized Multi-Threading**
   - 8-16 worker threads with SharedArrayBuffer
   - Memory-optimized with 1MB shared memory per worker
   - SIMD vector processing support

2. **Redis Cache Integration**
   - Automatic Docker Desktop detection
   - Graceful fallback when Docker is not running
   - Connection timeout protection (5 seconds)
   - Zero error spam on Redis unavailability

3. **PostgreSQL + pgvector**
   - Automatic pgvector extension detection
   - Connection pooling for multi-threaded access
   - Legal AI database integration

4. **Claude Code MCP Integration**
   - MCP server configured in `~/.claude/mcp.json`
   - Auto-discovery by Claude Code VS Code extension
   - HTTP API on port 3002

## 📋 VS Code Tasks

### Available Tasks:
- **🤖 Start LiteLLM Proxy (Ollama→Claude Code)** - Routes to gemma3-legal
- **🚀 Start MCP Context7 SIMD Server** - SIMD-optimized MCP server
- **📊 Check MCP Context7 Status** - Health check with metrics
- **🔍 Check LiteLLM Status** - Verify Ollama proxy
- **🎯 Start Complete AI Stack** - All-in-one startup

## 🔧 Configuration

### Environment Variables:
```bash
MCP_PORT=3002                    # MCP server port
MCP_WORKERS=8                    # Number of worker threads
REDIS_PASSWORD=redis             # Redis auth
DATABASE_URL=postgresql://...    # PostgreSQL connection
RTX_3060_OPTIMIZATION=true       # GPU optimization flag
CONTEXT7_MULTICORE=true          # Enable multicore
CONTEXT7_SIMD=true              # Enable SIMD
```

### Claude Code MCP Config:
Location: `C:\Users\james\.claude\mcp.json`

```json
{
  "mcpServers": {
    "context7-optimized": {
      "command": "node",
      "args": ["C:\\Users\\james\\Videos\\deeds-web-app\\scripts\\mcp-context7-optimized.mjs"],
      "env": { ... },
      "enabled": true
    }
  }
}
```

## 🌐 API Endpoints

- **Health Check**: `GET http://localhost:3002/mcp/health`
- **Metrics**: `GET http://localhost:3002/mcp/metrics`
- **Process Request**: `POST http://localhost:3002/mcp/process`
- **Cache Stats**: `GET http://localhost:3002/mcp/cache/stats`

## 📊 Health Check Response

```json
{
  "status": "healthy",
  "workers": 16,
  "redis": true,
  "postgres": true,
  "simd": true,
  "uptime": 143.57,
  "cacheStats": {
    "hits": 0,
    "misses": 0,
    "ratio": 0
  }
}
```

## 🔄 Docker Desktop Check

The server automatically checks if Docker Desktop is running:
- ✅ **Running**: Connects to Redis for caching
- ⚠️ **Not Running**: Skips Redis, runs without cache
- No error spam or connection retries

## 🚀 Quick Start

### Option 1: VS Code Task
1. Press `Ctrl+Shift+P`
2. Select `Tasks: Run Task`
3. Choose `🎯 Start Complete AI Stack (LiteLLM + MCP + Dev)`

### Option 2: PowerShell Script
```powershell
.\launch-vscode-with-ollama.ps1
```

### Option 3: Manual Start
```bash
node scripts/mcp-context7-optimized.mjs
```

## 📈 Performance Stats

- **Workers**: 8-16 SIMD threads
- **Memory**: ~365 MB RSS
- **Shared Memory**: 1024 KB per worker
- **Startup Time**: ~5 seconds
- **Redis Timeout**: 5 seconds
- **PostgreSQL Pool**: 16-32 connections

## 🔗 Integration Flow

```
Claude Code (VS Code Extension)
    ↓
MCP Protocol (mcp.json)
    ↓
MCP Context7 SIMD Server (port 3002)
    ↓
├── Redis Cache (if Docker running)
├── PostgreSQL + pgvector
└── SIMD Worker Pool (8-16 threads)
```

## 🛠️ Troubleshooting

### Port Already in Use
```bash
netstat -an | findstr 3002
taskkill /F /IM node.exe
```

### Redis Not Connecting
- Check Docker Desktop is running
- Verify Redis container: `docker ps | grep redis`
- Server will fallback automatically

### PostgreSQL Issues
- Verify DATABASE_URL in environment
- Check connection: `psql -h localhost -p 5432 -U legal_admin -d legal_ai_db`

## 📝 Files Created

1. `scripts/mcp-context7-optimized.mjs` - SIMD-optimized MCP server
2. `~/.claude/mcp.json` - Claude Code MCP configuration
3. `.vscode/tasks.json` - VS Code task definitions
4. `start-litellm-proxy.ps1` - LiteLLM startup script
5. `launch-vscode-with-ollama.ps1` - Complete stack launcher
6. `litellm_config.yaml` - LiteLLM configuration

## ✅ Verification

Test the complete stack:
```bash
# Check MCP server
curl http://localhost:3002/mcp/health

# Check LiteLLM proxy
curl -H "Authorization: Bearer sk-1234" http://localhost:4000/v1/models

# Check metrics
curl http://localhost:3002/mcp/metrics
```

All systems operational! 🎉
