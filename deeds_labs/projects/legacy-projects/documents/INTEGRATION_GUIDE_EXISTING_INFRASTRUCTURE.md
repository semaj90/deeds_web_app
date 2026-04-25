# Integration Guide: Leveraging Existing WebSocket & QUIC Infrastructure

**Status**: Updated to reflect existing infrastructure
**Supersedes**: Original implementation guides (use existing components)
**Purpose**: Integrate enhanced RAG with existing WebSocket orchestrator and QUIC services

---

## 🎯 Overview

This guide shows how to **integrate with existing infrastructure** instead of building from scratch.

### **What Already Exists**
✅ WebSocket orchestrator with auto-configuration
✅ HTTP/3-enabled Caddyfiles (15+ variants)
✅ QUIC Go services (archived, ready to reactivate)
✅ Frontend WebSocket client (recently fixed)
✅ Protocol buffer definitions for QUIC

### **What We're Adding**
- Enhanced RAG service to WebSocket orchestrator
- Reactivate QUIC services for ultra-low latency
- Frontend integration with auto-discovery
- Event-driven processing with NATS

---

## 📋 Prerequisites

### **Required Services**
- [x] WebSocket orchestrator (`go-services/ws-orchestrator`)
- [x] Vite dev server (port 5174)
- [x] Caddy proxy (port 5178)
- [ ] NATS server (optional, for event-driven features)

### **Development Tools**
```bash
# Verify Go installation
go version  # Should be 1.21+

# Verify Node.js
node --version  # Should be 18+

# Verify Caddy with HTTP/3 support
caddy version
```

---

## 🚀 Phase 1: WebSocket Integration (Existing Orchestrator)

### **Step 1.1: Add Enhanced RAG to Orchestrator**

**Edit**: `go-services/ws-orchestrator/main.go`

```go
// Add to services map (around line 40)
services := map[string]http.HandlerFunc{
    "rag":          wsHandler("rag"),
    "chat":         wsHandler("chat"),
    "canvas":       wsHandler("canvas"),
    "notifications": wsHandler("notifications"),

    // ✨ ADD THIS LINE
    "enhanced-rag": wsHandler("enhanced-rag"),
}
```

**That's it!** The orchestrator will automatically:
- Allocate a port (5173-5199 range)
- Generate UUID endpoint
- Write `.ws-registry.json`
- Update `.env.local` for Vite
- Create Caddy upstream config

---

### **Step 1.2: Implement Enhanced RAG Handler**

**Add handler logic** (same file, around line 30):

```go
func wsHandler(serviceName string) http.HandlerFunc {
    return func(w http.ResponseWriter, r *http.Request) {
        conn, err := upgrader.Upgrade(w, r, nil)
        if err != nil {
            log.Printf("❌ [%s] Upgrade failed: %v", serviceName, err)
            return
        }
        defer conn.Close()

        log.Printf("✅ [%s] Client connected", serviceName)

        // Enhanced RAG specific logic
        if serviceName == "enhanced-rag" {
            handleEnhancedRAG(conn)
            return
        }

        // Generic handler for other services
        for {
            var msg map[string]interface{}
            if err := conn.ReadJSON(&msg); err != nil {
                log.Printf("🔌 [%s] Client disconnected", serviceName)
                break
            }

            response := map[string]interface{}{
                "service":   serviceName,
                "status":    "processed",
                "timestamp": time.Now().Format(time.RFC3339),
                "echo":      msg,
            }

            conn.WriteJSON(response)
        }
    }
}

// Enhanced RAG handler with legal search capabilities
func handleEnhancedRAG(conn *websocket.Conn) {
    for {
        var request struct {
            Type    string                 `json:"type"`
            Query   string                 `json:"query"`
            Context map[string]interface{} `json:"context"`
        }

        if err := conn.ReadJSON(&request); err != nil {
            log.Printf("🔌 [enhanced-rag] Client disconnected: %v", err)
            break
        }

        log.Printf("📨 [enhanced-rag] Request: %s - %s", request.Type, request.Query)

        // Process based on request type
        var response map[string]interface{}
        switch request.Type {
        case "legal_search":
            response = processLegalSearch(request.Query, request.Context)
        case "document_analysis":
            response = processDocumentAnalysis(request.Query, request.Context)
        case "similarity_search":
            response = processSimilaritySearch(request.Query, request.Context)
        default:
            response = map[string]interface{}{
                "status": "error",
                "message": "Unknown request type",
            }
        }

        response["timestamp"] = time.Now().Format(time.RFC3339)
        response["service"] = "enhanced-rag"

        if err := conn.WriteJSON(response); err != nil {
            log.Printf("❌ [enhanced-rag] Write error: %v", err)
            break
        }
    }
}

// Legal search implementation
func processLegalSearch(query string, context map[string]interface{}) map[string]interface{} {
    // TODO: Integrate with actual RAG service (port 8095)
    // For now, return mock data
    return map[string]interface{}{
        "status": "success",
        "type": "legal_search",
        "query": query,
        "results": []map[string]interface{}{
            {
                "title": "Relevant Case Law",
                "snippet": "Mock legal search result...",
                "relevance": 0.95,
            },
        },
    }
}

func processDocumentAnalysis(query string, context map[string]interface{}) map[string]interface{} {
    return map[string]interface{}{
        "status": "success",
        "type": "document_analysis",
        "analysis": "Mock document analysis",
    }
}

func processSimilaritySearch(query string, context map[string]interface{}) map[string]interface{} {
    return map[string]interface{}{
        "status": "success",
        "type": "similarity_search",
        "similar_documents": []string{"doc1", "doc2"},
    }
}
```

---

### **Step 1.3: Start Orchestrator and Verify**

```bash
# Terminal 1: Start WebSocket orchestrator
cd go-services/ws-orchestrator
go run main.go

# Expected output:
# 🚀 [rag] Service → ws://localhost:5174/ws/a1b2c3d4-uuid
# 🚀 [chat] Service → ws://localhost:5175/ws/e5f6g7h8-uuid
# 🚀 [canvas] Service → ws://localhost:5176/ws/i9j0k1l2-uuid
# 🚀 [notifications] Service → ws://localhost:5177/ws/m3n4o5p6-uuid
# 🚀 [enhanced-rag] Service → ws://localhost:5178/ws/q7r8s9t0-uuid
# ✅ Wrote service registry to ../../sveltekit-frontend/.ws-registry.json
# ✅ Wrote environment config to ../../sveltekit-frontend/.env.local
# ✅ Wrote Caddy config to ../../Caddyfile.ws
# 🎯 WebSocket orchestrator ready!
```

**Verify auto-generated files**:
```bash
# Check service registry
cat sveltekit-frontend/.ws-registry.json

# Expected:
# [
#   {
#     "Name": "enhanced-rag",
#     "UUID": "q7r8s9t0-uuid-example",
#     "Port": 5178,
#     "Endpoint": "/ws/q7r8s9t0-uuid-example"
#   },
#   ...
# ]

# Check Vite environment
cat sveltekit-frontend/.env.local

# Expected:
# VITE_WS_enhanced-rag_UUID=q7r8s9t0-uuid-example
# VITE_WS_enhanced-rag_PORT=5178

# Check Caddy upstream
cat Caddyfile.ws

# Expected:
# @enhanced-rag path /ws/q7r8s9t0-uuid-example*
# reverse_proxy @enhanced-rag localhost:5178
```

---

### **Step 1.4: Update Frontend to Use Auto-Discovery**

**Edit**: `sveltekit-frontend/src/lib/services/real-time-search.ts`

**Old Code** (hardcoded port):
```typescript
const wsUrl = `ws://localhost:8094/ws/legal-search-client`;
```

**New Code** (auto-discovery):
```typescript
import wsRegistry from '../../../.ws-registry.json';

// Find enhanced-rag service in registry
const enhancedRagService = wsRegistry.find(s => s.Name === 'enhanced-rag');

if (!enhancedRagService) {
    throw new Error('Enhanced RAG service not registered');
}

const wsUrl = `ws://localhost:${enhancedRagService.Port}${enhancedRagService.Endpoint}`;

// Example: ws://localhost:5178/ws/q7r8s9t0-uuid-example
```

**Alternative** (using Vite env vars):
```typescript
const wsPort = import.meta.env.VITE_WS_enhanced_rag_PORT;
const wsUUID = import.meta.env.VITE_WS_enhanced_rag_UUID;

const wsUrl = `ws://localhost:${wsPort}/ws/${wsUUID}`;
```

---

### **Step 1.5: Test WebSocket Connection**

**Create test file**: `test-enhanced-rag-ws.mjs`

```javascript
import WebSocket from 'ws';
import fs from 'fs';

// Load service registry
const registry = JSON.parse(fs.readFileSync('sveltekit-frontend/.ws-registry.json', 'utf8'));
const service = registry.find(s => s.Name === 'enhanced-rag');

if (!service) {
    console.error('❌ Enhanced RAG service not found in registry');
    process.exit(1);
}

const wsUrl = `ws://localhost:${service.Port}${service.Endpoint}`;
console.log(`🔌 Connecting to: ${wsUrl}`);

const ws = new WebSocket(wsUrl);

ws.on('open', () => {
    console.log('✅ WebSocket connected!');

    // Test legal search
    ws.send(JSON.stringify({
        type: 'legal_search',
        query: 'patent infringement case law',
        context: { jurisdiction: 'US' }
    }));
});

ws.on('message', (data) => {
    console.log('📨 Response:', JSON.parse(data));
});

ws.on('error', (error) => {
    console.error('❌ Error:', error);
});

ws.on('close', () => {
    console.log('🔌 Connection closed');
});

// Keep alive for 5 seconds
setTimeout(() => ws.close(), 5000);
```

**Run test**:
```bash
node test-enhanced-rag-ws.mjs

# Expected output:
# 🔌 Connecting to: ws://localhost:5178/ws/q7r8s9t0-uuid
# ✅ WebSocket connected!
# 📨 Response: {
#   status: 'success',
#   type: 'legal_search',
#   results: [...],
#   timestamp: '2025-01-08T...'
# }
# 🔌 Connection closed
```

---

## 🚀 Phase 2: QUIC Service Reactivation

### **Step 2.1: Reactivate QUIC Bridge Service**

**Move from archived**:
```bash
# Remove archive build tag
cd archived-services/root-level

# Remove the //go:build archived line
sed -i '1,2d' quic-bridge-simple.go

# Move to active services
mkdir -p ../../go-services/quic-bridge
mv quic-bridge-simple.go ../../go-services/quic-bridge/main.go
```

---

### **Step 2.2: Update Dependencies**

```bash
cd go-services/quic-bridge

# Initialize module if needed
go mod init github.com/yourusername/legal-ai/quic-bridge

# Add dependencies
go get github.com/quic-go/quic-go/http3
go get github.com/quic-go/quic-go

# Tidy up
go mod tidy
```

---

### **Step 2.3: Generate Self-Signed Certificates (Development)**

```bash
# Create certificates directory
mkdir -p certs

# Generate self-signed cert
openssl req -x509 -newkey rsa:4096 -keyout certs/key.pem -out certs/cert.pem -days 365 -nodes -subj "/CN=localhost"

# Verify
ls -lh certs/
```

---

### **Step 2.4: Update QUIC Service Code**

**Edit**: `go-services/quic-bridge/main.go`

**Update TLS config**:
```go
func generateTLSConfig() *tls.Config {
    // Load development certificates
    cert, err := tls.LoadX509KeyPair("certs/cert.pem", "certs/key.pem")
    if err != nil {
        log.Fatalf("Failed to load certificates: %v", err)
    }

    return &tls.Config{
        Certificates: []tls.Certificate{cert},
        NextProtos:   []string{"h3"},
        MinVersion:   tls.VersionTLS13,
    }
}
```

---

### **Step 2.5: Start QUIC Service**

```bash
# Terminal 2: Start QUIC bridge
cd go-services/quic-bridge
go run main.go

# Expected output:
# 🚀 QUIC Bridge (Phase 3 Ultra-Low Latency) starting on :8100
# 🌐 Protocol: QUIC/HTTP3 for maximum performance
# ⚡ Ultra-low latency messaging enabled
# 🔗 Endpoints:
#    - POST /quic/message (QUIC Message Processing)
#    - GET  /health (Service Health)
# 🔗 Health Check: https://localhost:8100/health
# 📊 Performance: <1ms latency, 10Gbps+ throughput
# 🔍 HTTP fallback server on :8101 for health checks
```

---

### **Step 2.6: Test QUIC Service**

**HTTP fallback** (easiest):
```bash
curl http://localhost:8101/health

# Expected:
# {
#   "status": "healthy",
#   "service": "QUIC Bridge",
#   "protocol": "QUIC/HTTP3",
#   "port": "8100",
#   ...
# }
```

**HTTP/3 test** (requires curl with HTTP/3):
```bash
# Install curl with HTTP/3 (if not available)
# Windows: Download from https://curl.se/windows/

curl --http3-only --insecure https://localhost:8100/health

# Expected: Same JSON response but over HTTP/3
```

**PowerShell test**:
```powershell
# Test HTTP fallback
Invoke-RestMethod -Uri "http://localhost:8101/health" | ConvertTo-Json

# Test QUIC message processing (HTTP fallback)
$message = @{
    type = "legal_search"
    payload = @{ query = "patent law" }
    timestamp = (Get-Date -Format "o")
    source = "test-client"
    target = "legal-ai"
} | ConvertTo-Json

Invoke-RestMethod -Uri "http://localhost:8101/quic/message" -Method Post -Body $message -ContentType "application/json" | ConvertTo-Json
```

---

## 🚀 Phase 3: Caddy Integration

### **Step 3.1: Include Auto-Generated WebSocket Routes**

**Edit**: `sveltekit-frontend/Caddyfile.development`

**Add at the end**:
```caddyfile
:5178 {
    # Existing configuration...
    header Alt-Svc "h3=\":5178\"; ma=3600"

    # Proxy to Vite
    reverse_proxy localhost:5174

    # WebSocket HMR
    @websocket {
        header Connection *Upgrade*
        header Upgrade websocket
    }
    reverse_proxy @websocket localhost:5174

    # ✨ INCLUDE AUTO-GENERATED WEBSOCKET ROUTES
    import ../Caddyfile.ws
}
```

**Verify Caddy config**:
```bash
caddy validate --config sveltekit-frontend/Caddyfile.development

# Expected: Validation successful
```

---

### **Step 3.2: Add QUIC Service Proxy**

**Add to Caddyfile**:
```caddyfile
:5178 {
    # ... existing config ...

    # QUIC bridge proxy
    handle /quic/* {
        reverse_proxy https://localhost:8100
    }

    # QUIC health check (HTTP fallback)
    handle /quic-health {
        reverse_proxy http://localhost:8101/health
    }
}
```

---

### **Step 3.3: Start Caddy**

```bash
# Terminal 3: Start Caddy
cd sveltekit-frontend
caddy run --config Caddyfile.development

# Expected output:
# 2025/01/08 ... [INFO] http: enabling HTTP/3 listener
# 2025/01/08 ... [INFO] http.log: server running
```

---

## 🚀 Phase 4: Full Stack Testing

### **Step 4.1: Start All Services**

```bash
# Terminal 1: WebSocket Orchestrator
cd go-services/ws-orchestrator
go run main.go

# Terminal 2: QUIC Bridge
cd go-services/quic-bridge
go run main.go

# Terminal 3: Caddy
cd sveltekit-frontend
caddy run --config Caddyfile.development

# Terminal 4: Vite Dev Server
cd sveltekit-frontend
npm run dev
```

---

### **Step 4.2: Test Full Integration**

**Create comprehensive test**: `test-full-integration.mjs`

```javascript
import WebSocket from 'ws';
import fetch from 'node-fetch';
import fs from 'fs';

console.log('🧪 Testing Full Integration\n');

// Test 1: WebSocket Orchestrator Health
console.log('Test 1: WebSocket Orchestrator Health');
const registry = JSON.parse(fs.readFileSync('sveltekit-frontend/.ws-registry.json', 'utf8'));
console.log(`✅ Found ${registry.length} WebSocket services`);
registry.forEach(s => console.log(`   - ${s.Name} on port ${s.Port}`));

// Test 2: QUIC Service Health
console.log('\nTest 2: QUIC Service Health');
const quicHealth = await fetch('http://localhost:8101/health').then(r => r.json());
console.log(`✅ QUIC Service: ${quicHealth.status}`);
console.log(`   Protocol: ${quicHealth.protocol}`);

// Test 3: Caddy Proxy
console.log('\nTest 3: Caddy Proxy to QUIC');
const caddyQuic = await fetch('http://localhost:5178/quic-health').then(r => r.json());
console.log(`✅ Caddy → QUIC: ${caddyQuic.status}`);

// Test 4: WebSocket Connection
console.log('\nTest 4: WebSocket Connection to Enhanced RAG');
const ragService = registry.find(s => s.Name === 'enhanced-rag');
const wsUrl = `ws://localhost:${ragService.Port}${ragService.Endpoint}`;

await new Promise((resolve) => {
    const ws = new WebSocket(wsUrl);

    ws.on('open', () => {
        console.log(`✅ WebSocket connected to ${wsUrl}`);
        ws.send(JSON.stringify({
            type: 'legal_search',
            query: 'test query',
            context: {}
        }));
    });

    ws.on('message', (data) => {
        const response = JSON.parse(data);
        console.log(`✅ Received response: ${response.status}`);
        ws.close();
    });

    ws.on('close', resolve);
});

console.log('\n🎉 All tests passed!');
```

**Run integration test**:
```bash
node test-full-integration.mjs

# Expected:
# 🧪 Testing Full Integration
# Test 1: WebSocket Orchestrator Health
# ✅ Found 5 WebSocket services
#    - rag on port 5174
#    - chat on port 5175
#    - canvas on port 5176
#    - notifications on port 5177
#    - enhanced-rag on port 5178
# Test 2: QUIC Service Health
# ✅ QUIC Service: healthy
#    Protocol: QUIC/HTTP3
# Test 3: Caddy Proxy to QUIC
# ✅ Caddy → QUIC: healthy
# Test 4: WebSocket Connection to Enhanced RAG
# ✅ WebSocket connected to ws://localhost:5178/ws/...
# ✅ Received response: success
# 🎉 All tests passed!
```

---

## 🎯 Next Steps

### **Immediate**
- [x] Add enhanced-rag to WebSocket orchestrator
- [x] Update frontend to use auto-discovery
- [x] Reactivate QUIC service
- [x] Configure Caddy integration

### **This Week**
- [ ] Connect enhanced-rag WebSocket to actual RAG service (port 8095)
- [ ] Implement document analysis WebSocket messages
- [ ] Add error handling and reconnection logic
- [ ] Production testing with real legal documents

### **Next Week**
- [ ] Deploy NATS server for event-driven architecture
- [ ] Reactivate QUIC-NATS bridge
- [ ] Implement WebTransport client in frontend
- [ ] Performance benchmarking (<1ms latency verification)

---

## 📊 Architecture Diagram

```
Frontend (SvelteKit)
├── real-time-search.ts (WebSocket client)
│   └── Reads .ws-registry.json for auto-discovery
│
Caddy Proxy (Port 5178) [HTTP/3 enabled]
├── Proxies to Vite (5174)
├── Includes Caddyfile.ws (auto-generated routes)
└── Proxies /quic/* to QUIC Bridge (8100)
│
WebSocket Orchestrator (Ports 5173-5199)
├── Auto-allocates ports
├── Generates .ws-registry.json
├── Generates .env.local
├── Generates Caddyfile.ws
└── Services:
    ├── rag (5174)
    ├── chat (5175)
    ├── canvas (5176)
    ├── notifications (5177)
    └── enhanced-rag (5178) ← NEW
│
QUIC Bridge (Ports 8100-8101)
├── HTTP/3 on 8100
├── HTTP fallback on 8101
└── Endpoints:
    ├── POST /quic/message
    └── GET /health
```

---

## 🔧 Troubleshooting

### **Issue: WebSocket connection fails**

**Check orchestrator is running**:
```bash
ps aux | grep ws-orchestrator
```

**Check .ws-registry.json exists**:
```bash
cat sveltekit-frontend/.ws-registry.json
```

**Check port not in use**:
```bash
# Windows
netstat -ano | findstr :5178

# WSL/Linux
lsof -i :5178
```

---

### **Issue: QUIC service certificate error**

**Regenerate certificates**:
```bash
cd go-services/quic-bridge/certs
rm *.pem
openssl req -x509 -newkey rsa:4096 -keyout key.pem -out cert.pem -days 365 -nodes -subj "/CN=localhost"
```

**Use HTTP fallback for testing**:
```bash
# Test on port 8101 instead of 8100
curl http://localhost:8101/health
```

---

### **Issue: Caddy validation fails**

**Check syntax**:
```bash
caddy validate --config sveltekit-frontend/Caddyfile.development
```

**Check Caddyfile.ws exists**:
```bash
ls -lh Caddyfile.ws
```

**Regenerate by restarting orchestrator**:
```bash
cd go-services/ws-orchestrator
go run main.go
```

---

## 📚 References

- **Existing Infrastructure Audit**: `EXISTING_INFRASTRUCTURE_AUDIT.md`
- **WebSocket Fix**: `WEBSOCKET_CONNECTION_FIX.md`
- **Copilot Instructions**: `.github/copilot-instructions.md`
- **Original Guides** (reference only):
  - `WEBSOCKET_GO_IMPLEMENTATION.md`
  - `WEBTRANSPORT_QUIC_IMPLEMENTATION.md`
  - `REAL_TIME_IMPLEMENTATION_ROADMAP.md`

---

**Integration Status**: ✅ Ready for implementation
**Estimated Time**: 4-6 hours (much faster than building from scratch)
**Next Action**: Add enhanced-rag service to ws-orchestrator
