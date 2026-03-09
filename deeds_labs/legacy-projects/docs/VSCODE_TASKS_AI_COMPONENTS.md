# 🎯 VS Code Tasks - Quick Reference

**New AI Components - 2025-11-30**

---

## 🚀 **Quick Start Tasks**

### **1. Start Gemma3-Legal MCP Server**
```bash
# Command Palette: Tasks: Run Task
# Select: "🚀 Start Gemma3-Legal MCP Server"

# Or manually:
cd c:/Users/james/Videos/deeds-web-app
python mcp-servers/gemma3-legal-agentic-mcp.py
```

**What it does**:
- Starts FastMCP server with 6 agentic tools
- Auto-discovers RabbitMQ containers
- Listens on stdio for Claude Desktop
- Provides: web scraping, citations, Gemma3 analysis, document classification

---

### **2. Start Go SIMD JSON Optimizer**
```bash
# Command Palette: Tasks: Run Task
# Select: "⚡ Start Go SIMD JSON Optimizer (Port 8103)"

# Or manually:
cd c:/Users/james/Videos/deeds-web-app/archived-services/root-level
go build -o simd-json-optimizer.exe simd-json-optimizer.go
./simd-json-optimizer.exe
```

**What it does**:
- Builds and starts Go SIMD service
- Listens on port 8103
- Provides endpoints: `/v1/completions`, `/metrics`, `/benchmark`, `/health`
- Sub-1ms JSON processing with simdjson-go + sonic

---

### **3. Start All AI Services (Composite)**
```bash
# Command Palette: Tasks: Run Task
# Select: "🎯 Start All AI Services (Composite)"
```

**What it does**:
- Starts both MCP Server and Go SIMD Optimizer in parallel
- Opens dedicated terminals for each
- Ready for full AI pipeline

---

## 🧪 **Test Tasks**

### **Test Gemma3-Legal MCP Server**
```bash
python mcp-servers/test_gemma_legal_mcp.py
```

**Output**:
```
🧪 Testing gemma3-legal Agentic MCP Server
============================================================
📝 Test 1: Health Check
📝 Test 2: Citation Extraction
📝 Test 3: Document Classification
✅ All test configurations created!
```

---

### **Test Python SIMD JSON (orjson)**
```bash
python backend/utils/fast_json.py
```

**Output**:
```
============================================================
SIMD JSON Benchmark (1000 iterations)
============================================================
Backend: orjson
SIMD Available: ✅
dumps() time: 89.51ms
loads() time: 263.79ms
✅ Using SIMD-accelerated JSON!
```

---

### **Test Multi-Modal Feature Extractor**
```bash
python backend/ml/multimodal_feature_extractor.py
```

**Output**:
```
Feature vector shape: (1024,)
Feature vector dtype: float32
Feature vector range: [-2.100, 150.000]
```

---

### **Run All Tests (Composite)**
```bash
# Command Palette: Tasks: Run Task
# Select: "🧪 Run All Tests (AI Components)"
```

**What it does**:
- Runs all 3 test suites sequentially
- Shows results in shared terminal
- Verifies all components working

---

## 🔨 **Build Tasks**

### **Build Go SIMD JSON Optimizer**
```bash
cd archived-services/root-level
go build -o simd-json-optimizer.exe simd-json-optimizer.go
```

**Dependencies**:
```bash
go get github.com/bytedance/sonic
go get github.com/minio/simdjson-go
go get github.com/fasthttp/router
go get github.com/valyala/fasthttp
```

---

### **Build C++ libtorch Phase Scorer**
```bash
cd backend/ml
g++ -std=c++17 \
    -I./libtorch/include \
    -I./libtorch/include/torch/csrc/api/include \
    phase_graph_head_server.cpp \
    -o phase_graph_head_server.exe \
    -L./libtorch/lib \
    -ltorch -ltorch_cpu -lc10
```

**Prerequisites**:
- Download libtorch from https://pytorch.org/
- Extract to `backend/ml/libtorch/`
- Install cpp-httplib and nlohmann/json

---

## 📋 **Task List Summary**

| Task | Type | Description |
|------|------|-------------|
| 🚀 Start Gemma3-Legal MCP Server | Run | FastMCP server (stdio) |
| ⚡ Start Go SIMD JSON Optimizer | Run | Go service (port 8103) |
| 🎯 Start All AI Services | Composite | Both services in parallel |
| 🧪 Test Gemma3-Legal MCP | Test | MCP server tests |
| 🧪 Test Python SIMD JSON | Test | orjson benchmark |
| 🧪 Test Multi-Modal Feature Extractor | Test | 1024-d vector test |
| 🧪 Run All Tests | Composite | All tests sequentially |
| 🔨 Build Go SIMD Optimizer | Build | Compile Go service |
| 🔨 Build C++ libtorch Scorer | Build | Compile C++ scorer |

---

## 🎯 **Recommended Workflow**

### **First Time Setup**
```bash
# 1. Install Python dependencies
pip install mcp aio-pika aiohttp beautifulsoup4 httpx orjson numpy

# 2. Install Go dependencies (if using Go SIMD)
cd archived-services/root-level
go get github.com/bytedance/sonic
go get github.com/minio/simdjson-go
go get github.com/fasthttp/router
go get github.com/valyala/fasthttp

# 3. Run all tests
# VS Code: Tasks > Run All Tests (AI Components)
```

### **Daily Development**
```bash
# 1. Start all services
# VS Code: Tasks > Start All AI Services (Composite)

# 2. Verify with health checks
curl http://localhost:8103/health  # Go SIMD
# MCP server: check Claude Desktop connection

# 3. Run tests as needed
# VS Code: Tasks > Test [specific component]
```

---

## 🔗 **Service Endpoints**

| Service | Port | Endpoints |
|---------|------|-----------|
| **Go SIMD Optimizer** | 8103 | `/v1/completions`, `/metrics`, `/benchmark`, `/health` |
| **Gemma3-Legal MCP** | stdio | 6 tools via MCP protocol |
| **C++ libtorch Scorer** | 9091 | `/score_plan` (when built) |

---

## 📚 **Related Documentation**

- `GEMMA_LEGAL_MCP_COMPLETE.md` - MCP server guide
- `SIMD_JSON_COMBINED_STRATEGY.md` - SIMD JSON strategy
- `MULTIMODAL_RL_PHASE_SCORER_ARCHITECTURE.md` - RL scorer architecture
- `SESSION_SUMMARY_2025_11_30.md` - Complete summary
- `QUICK_REFERENCE.md` - Quick reference card

---

## ⚡ **Quick Commands**

```bash
# Test everything
python mcp-servers/test_gemma_legal_mcp.py
python backend/utils/fast_json.py
python backend/ml/multimodal_feature_extractor.py

# Start MCP server
python mcp-servers/gemma3-legal-agentic-mcp.py

# Start Go SIMD (after building)
cd archived-services/root-level
./simd-json-optimizer.exe

# Benchmark Go SIMD
curl http://localhost:8103/benchmark
curl http://localhost:8103/metrics
```

---

**Status**: ✅ All tasks ready to use via VS Code Command Palette!

**To use**: Press `Ctrl+Shift+P` → Type "Tasks: Run Task" → Select task
