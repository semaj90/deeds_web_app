# Legal AI Development Setup

## 🚀 **One-Command Development Environment**

This setup integrates your existing **LLM orchestrator** with **Go microservices hot-reload** and **load testing capabilities**.

### **Quick Start**

```bash
# Linux/macOS
chmod +x dev-start.sh dev-stop.sh
./dev-start.sh

# Windows
.\dev-start.bat
```

### **What This Provides**

✅ **LLM Orchestrator Integration** - Your existing `npm run dev:full` with smart routing
✅ **Go Hot Reload** - All Go services auto-rebuild on changes (no more manual rebuilds!)
✅ **MCP Multi-Core** - Distributed AI processing
✅ **Load Testing Ready** - Ramp mode testing with your updated load-tester
✅ **Full Stack** - PostgreSQL, Redis, MinIO, Qdrant all connected

---

## 🏗️ **Architecture Overview**

```
┌─────────────────────────────────────────────────────────────┐
│                    Your Current Setup                       │
│              npm run dev:full (port 5173)                  │
│          ┌─────────────────────────────────────┐           │
│          │      LLM Orchestrator Bridge       │           │
│          │  • Smart routing logic             │           │
│          │  • Server/Client/MCP selection     │           │
│          │  • Performance monitoring          │           │
│          └─────────────────┬───────────────────┘           │
└──────────────────────────┬─│───────────────────────────────┘
                           │ │
    ┌──────────────────────┼─┼──────────────────────┐
    │                      │ │                      │
    ▼                      ▼ ▼                      ▼
┌─────────────┐    ┌─────────────┐    ┌─────────────┐
│ Go Services │    │   Client    │    │     MCP     │
│(Hot Reload) │    │Orchestrator │    │Multi-Core   │
├─────────────┤    ├─────────────┤    ├─────────────┤
│ :8080 Legal │    │ Gemma 270M  │    │ Workers x4  │
│ :8094 RAG   │    │ Legal-BERT  │    │ Port 3002   │
│ :8095 GPU   │    │ ONNX Models │    │ Load Balance│
└─────────────┘    └─────────────┘    └─────────────┘
```

---

## 🛠️ **Services & Ports**

| Service | Port | Hot Reload | Purpose |
|---------|------|------------|---------|
| **SvelteKit Frontend** | 5173 | ✅ | Main UI + LLM Orchestrator |
| **Legal Gateway** | 8080 | ✅ | Go API Gateway |
| **Enhanced RAG** | 8094 | ✅ | Legal document processing |
| **GPU Orchestrator** | 8095 | ✅ | CUDA acceleration |
| **MCP Multi-Core** | 3002 | ✅ | Distributed AI workers |
| **PostgreSQL** | 5433 | - | pgvector database |
| **Redis** | 6379 | - | Caching + pub/sub |
| **MinIO** | 9000/9001 | - | Object storage |
| **Qdrant** | 6333 | - | Vector database |

---

## 🔥 **Hot Reload Magic**

### **Go Services** (Using Air)
- **Legal Gateway**: Changes to `legal-gateway/` → Auto rebuild
- **Enhanced RAG**: Changes to `go-enhanced-rag-service/` → Auto rebuild
- **GPU Orchestrator**: Changes to `go-microservice/` → Auto rebuild

### **Frontend** (SvelteKit)
- **LLM Orchestrator**: Changes to orchestrator bridge → Auto reload
- **UI Components**: All Svelte files → Auto reload
- **API Routes**: Server-side changes → Auto reload

### **No More Manual Rebuilds!** 🎉
```bash
# Before: Manual rebuild every time
go build ./legal-gateway/main.go
./legal-gateway

# Now: Just save the file and it rebuilds automatically!
# Edit legal-gateway/main.go → Save → Automatic rebuild + restart
```

---

## 🧪 **Testing Your Integration**

### **Health Check**
```bash
curl http://localhost:5173/api/ai/test-orchestrator
```

### **Chat with Orchestrator Routing**
```bash
curl -X POST http://localhost:5173/api/ai/chat \
  -H "Content-Type: application/json" \
  -d '{"messages":[{"role":"user","content":"What is contract law?"}]}'
```

### **Load Testing with Ramp Mode**
```bash
cd load-tester
go run . -ramp -rampStart 1 -rampMax 10 -rampStep 1 -stepRequests 40 -rampCsv results.csv
```

### **Direct Go Service Testing**
```bash
# Test Legal Gateway directly
curl http://localhost:8080/health

# Test Enhanced RAG
curl http://localhost:8094/health

# Test GPU Orchestrator
curl http://localhost:8095/health
```

---

## 🎯 **Development Workflow**

### **1. Start Everything**
```bash
./dev-start.sh  # or .\dev-start.bat on Windows
```

### **2. Develop with Hot Reload**
- Edit Go files → Auto rebuild in ~2 seconds
- Edit Svelte files → Auto reload in browser
- Edit orchestrator logic → Auto reload

### **3. Test Routing Decisions**
```bash
# Test different orchestrator routing
curl -X POST http://localhost:5173/api/ai/unified-orchestrator \
  -H "Content-Type: application/json" \
  -d '{
    "content": "Complex legal analysis...",
    "type": "legal_analysis",
    "options": {"priority": "high"}
  }'
```

### **4. Monitor Performance**
```bash
# View logs in real-time
tail -f tmp/legal-gateway.log
tail -f tmp/sveltekit.log

# Check orchestrator metrics
curl http://localhost:5173/api/ai/test-orchestrator?test=full
```

### **5. Load Test Your Changes**
```bash
# Test current performance
cd load-tester
go run . -ramp -rampStart 1 -rampMax 20 -rampStep 2 -stepRequests 50

# View results
cat ramp_summary.csv
```

### **6. Stop Everything**
```bash
./dev-stop.sh  # or .\dev-stop.bat on Windows
```

---

## 📊 **LLM Orchestrator Integration**

Your orchestrator now handles routing automatically:

### **Smart Routing Logic**
```javascript
// Simple chat → Client-side Gemma 270M (fast)
POST /api/ai/chat
{"messages": [{"role": "user", "content": "Quick question"}]}
// → Routes to client orchestrator (~100ms)

// Complex legal analysis → Server orchestrator (comprehensive)
POST /api/ai/unified-orchestrator
{"content": "Analyze this contract...", "type": "legal_analysis"}
// → Routes to server orchestrator with full pipeline (~1500ms)

// High priority → MCP multi-core (parallel)
POST /api/ai/unified-orchestrator
{"content": "Process document", "options": {"priority": "high"}}
// → Routes to MCP workers for parallel processing
```

### **Fallback Handling**
1. **Primary**: LLM Orchestrator Bridge (smart routing)
2. **Fallback**: Direct Ollama connection (if orchestrator fails)
3. **Emergency**: Error response with helpful details

---

## 🚦 **API Endpoints**

### **LLM Orchestrator** (Your main integration)
- `GET /api/ai/test-orchestrator` - Health & full test suite
- `POST /api/ai/chat` - Enhanced chat with routing
- `POST /api/ai/unified-orchestrator` - Direct orchestrator access

### **Go Microservices** (Hot reload enabled)
- `GET /api/go/health` - Legal Gateway health
- `GET /api/rag/health` - Enhanced RAG health
- `GET /api/gpu/health` - GPU Orchestrator health

### **MCP Multi-Core**
- `GET /api/mcp/cores/status` - Worker core status
- `POST /api/mcp/cores/{id}/process` - Submit task to specific core

---

## 🔧 **Configuration**

### **Environment Variables**
```bash
# Automatically set by dev-start scripts
DATABASE_URL=postgresql://legal_admin:123456@localhost:5432/legal_ai_db
REDIS_URL=redis://127.0.0.1:6379/0
OLLAMA_URL=http://localhost:11434
MCP_URL=http://localhost:3002
```

### **Hot Reload Configuration**
Air configs are pre-configured:
- `.air.toml` - Legal Gateway
- `.air-rag.toml` - Enhanced RAG
- `.air-gpu.toml` - GPU Orchestrator

### **Load Testing Configuration**
```bash
# Basic test
go run ./load-tester -url http://localhost:5173/api/ai/chat

# Ramp test (your new feature!)
go run ./load-tester -ramp -rampStart 1 -rampMax 10 -rampStep 1 \
  -stepRequests 40 -warm 2 -rampCsv results.csv
```

---

## 🐛 **Troubleshooting**

### **Port Already in Use**
```bash
# Check what's using the port
netstat -tulpn | grep :8080

# Kill specific process
kill $(lsof -ti:8080)

# Or restart the dev environment
./dev-stop.sh && ./dev-start.sh
```

### **Go Service Won't Start**
```bash
# Check the logs
tail -f tmp/legal-gateway.log

# Manually test build
go build ./legal-gateway/main.go

# Check Air configuration
air -c .air.toml -d
```

### **Orchestrator Not Routing**
```bash
# Check orchestrator health
curl http://localhost:5173/api/ai/test-orchestrator

# Test specific routing
curl -X POST http://localhost:5173/api/ai/test-orchestrator \
  -d '{"type": "chat", "orchestrator": "server"}'
```

### **Docker Issues**
```bash
# Reset everything
docker-compose -f docker-compose.dev.yml down -v
docker system prune -f
./dev-start.sh
```

---

## 🎉 **Success! You Now Have:**

✅ **Zero-rebuild development** - Go services auto-rebuild on save
✅ **Smart LLM routing** - Automatic orchestrator selection
✅ **Load testing ready** - Ramp mode performance analysis
✅ **Full-stack integration** - All services connected and monitored
✅ **Production-ready** - Same architecture, different configs

### **Next Steps:**
1. **Develop**: Edit any Go or Svelte file → Auto rebuild/reload
2. **Test**: Use the integrated orchestrator for all AI requests
3. **Scale**: Load test with ramp mode to find bottlenecks
4. **Deploy**: Use the same Docker setup for production

**Your legal AI platform is now a hot-reload enabled, intelligently-routed, load-tested powerhouse!** 🚀