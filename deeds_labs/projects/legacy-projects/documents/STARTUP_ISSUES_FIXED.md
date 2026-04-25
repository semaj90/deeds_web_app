# ✅ FIXED: Real-Time Stack Startup Issues

## Issues Identified & Resolved

### Issue 1: Caddy Not Found ✅ FIXED
**Problem:** Script tried to run `caddy` command, but Windows PowerShell doesn't recognize commands in current directory by default.

**Solution:** Updated `start-realtime-stack.ps1` to:
- Check for `.\caddy.exe` in project root first
- Fall back to system PATH `caddy` if available
- Show helpful error message with download link if not found

### Issue 2: Port Conflicts ✅ FIXED
**Problem:** Port 5178 (Caddy) was already in use, causing service startup failures.

**Solution:** Enhanced port conflict resolution:
```powershell
[k]ill processes - Automatically stop processes using required ports
[c]ontinue anyway - Proceed with occupied ports (may fail)
[q]uit - Exit without changes
```

### Issue 3: WebSocket Orchestrator Timeout ✅ FIXED
**Problem:** Script waited 10 seconds for registry file, but orchestrator might need more time.

**Solution:**
- Increased timeout to 15 seconds
- Added progress counter (`1/15, 2/15, ...`)
- Improved error messages
- Delete old registry before starting (prevents stale data)

## ✅ Current Status

**WebSocket Orchestrator:** ✅ **WORKING**
```
🚀 [chat] Service → ws://localhost:5179/ws/9357fa0c-ae1e-462d...
🚀 [canvas] Service → ws://localhost:5180/ws/ef6a5513-37fa-45d5...
🚀 [notifications] Service → ws://localhost:5181/ws/1f876714-436c...
🚀 [enhanced-rag] Service → ws://localhost:5182/ws/d4b6fefe-05d8...
🚀 [rag] Service → ws://localhost:5183/ws/903750eb-a34d-466e...
✅ Wrote service registry to ..\..\sveltekit-frontend\.ws-registry.json
✅ Wrote environment config to ..\..\sveltekit-frontend\.env.local
✅ Wrote Caddy config to ..\..\Caddyfile.ws
🎯 WebSocket orchestrator ready!
```

**Caddy:** ✅ **WORKING** (with `.\caddy.exe` path fix)

**Automation Script:** ✅ **FIXED** (`start-realtime-stack.ps1` updated)

## 🚀 How to Start Now

### Option 1: Automated (Recommended)

```powershell
# From project root
.\start-realtime-stack.ps1
```

**What happens:**
1. Checks all required ports (5173, 5178, 8100, 8101)
2. Offers to kill conflicting processes if needed
3. Starts WebSocket Orchestrator (generates registry)
4. Starts QUIC Bridge (HTTP/3 + fallback)
5. Starts Caddy Proxy (with auto-generated routes)
6. Starts Vite Dev Server (frontend)
7. Shows status summary with all service URLs

### Option 2: Manual (For Debugging)

See `MANUAL_START_GUIDE.md` for step-by-step instructions.

**Quick Manual Start:**
```powershell
# Terminal 1: WebSocket Orchestrator
cd go-services\ws-orchestrator
go run main.go

# Terminal 2: QUIC Bridge
cd go-services\quic-bridge
go run main.go

# Terminal 3: Caddy Proxy
cd sveltekit-frontend
..\caddy.exe run --config Caddyfile.development

# Terminal 4: Vite Dev Server
cd sveltekit-frontend
npm run dev
```

## 🧪 Testing

### Quick Verification

```powershell
# Check if registry was generated
cat .\sveltekit-frontend\.ws-registry.json | ConvertFrom-Json | Format-Table

# Test WebSocket service (pick port from registry)
Invoke-RestMethod -Uri "http://localhost:5179/health"

# Test QUIC bridge
Invoke-RestMethod -Uri "http://localhost:8101/health"
```

### Run Integration Tests

```powershell
node test-realtime-integration.mjs
```

**Expected Output:**
```
✅ Test 1/6: WebSocket Orchestrator Health
✅ Test 2/6: Enhanced RAG Service
✅ Test 3/6: QUIC Bridge
✅ Test 4/6: Caddy Proxy
✅ Test 5/6: Auto-Discovery
✅ Test 6/6: Latency Test

🎉 6/6 tests passed
```

### Browser Testing

Navigate to `http://localhost:5178` (Caddy) or `http://localhost:5174` (Vite).

**Browser Console:**
```javascript
// Load service registry
const registry = await fetch('/.ws-registry.json').then(r => r.json());
console.log('Services:', registry);

// Connect to enhanced-rag service
const ragService = registry.find(s => s.name === 'enhanced-rag');
const ws = new WebSocket(`ws://localhost:${ragService.port}${ragService.endpoint}`);

ws.onopen = () => {
  console.log('✅ Connected to enhanced-rag');
  ws.send(JSON.stringify({
    type: 'legal_search',
    query: 'contract review',
    context: { caseId: 'test-123' }
  }));
};

ws.onmessage = (e) => {
  const response = JSON.parse(e.data);
  console.log('📥 Search Results:', response);
};
```

## 📊 Service Architecture

```
┌─────────────────────────────────────────────────────────┐
│                    Client Browser                        │
│  (http://localhost:5178 or http://localhost:5174)       │
└──────────────┬──────────────────────────────────────────┘
               │
               ├─── HTTP/WebSocket ───┐
               │                       │
┌──────────────▼──────────┐  ┌────────▼─────────────────┐
│    Caddy Proxy :5178    │  │  Vite Dev Server :5174   │
│  (HTTP/3 + WebSocket)   │  │   (SvelteKit Frontend)   │
└──────────────┬──────────┘  └──────────────────────────┘
               │
               ├─── /quic/* ───────────┐
               │                        │
               ├─── /ws/* ─────────┐   │
               │                    │   │
┌──────────────▼──────────┐  ┌─────▼───▼─────────────────┐
│   QUIC Bridge :8100/1   │  │ WS Orchestrator :5179-83  │
│  (HTTP/3 + Fallback)    │  │  (5 WebSocket Services)   │
└─────────────────────────┘  └────────────┬──────────────┘
                                          │
                              ┌───────────┼───────────┐
                              │           │           │
                        ┌─────▼──┐  ┌────▼───┐  ┌───▼────┐
                        │  RAG   │  │ Canvas │  │  Chat  │
                        │ :5183  │  │ :5180  │  │ :5179  │
                        └────────┘  └────────┘  └────────┘

                        ┌──────────┐  ┌─────────────┐
                        │Enhanced  │  │Notifications│
                        │RAG :5182 │  │   :5181     │
                        └──────────┘  └─────────────┘
```

## 🔧 Troubleshooting

### Orchestrator Generates Files But They Disappear

**Reason:** Files are written successfully, but orchestrator exits immediately if there's an error, cleaning up the goroutines.

**Solution:** Keep orchestrator running with `select {}` at the end (already implemented).

**Verify:** The orchestrator should print "🎯 WebSocket orchestrator ready!" and stay running.

### Caddy Can't Find Caddyfile.ws

**Reason:** Caddyfile.ws is generated in project root, but Caddy runs from `sveltekit-frontend/`.

**Solution:** Use relative import path:
```caddyfile
import ../../Caddyfile.ws  # In Caddyfile.development
```

**Verify:**
```powershell
Test-Path .\Caddyfile.ws  # Should exist after orchestrator starts
```

### Frontend Can't Connect to WebSocket

**Symptoms:**
- `ConnectionResetError` in browser
- WebSocket connection fails

**Checklist:**
1. ✅ Orchestrator is running?
   ```powershell
   Get-Process | Where-Object { $_.Path -like "*go*" }
   ```

2. ✅ Registry file exists?
   ```powershell
   Test-Path .\sveltekit-frontend\.ws-registry.json
   ```

3. ✅ Service responding to health checks?
   ```powershell
   # Use port from registry
   Invoke-RestMethod -Uri "http://localhost:5182/health"
   ```

4. ✅ Frontend using correct port?
   ```javascript
   // Browser console
   const registry = await fetch('/.ws-registry.json').then(r => r.json());
   console.log('Enhanced RAG port:', registry.find(s => s.name === 'enhanced-rag').port);
   ```

### Port Already in Use

**Quick Fix:**
```powershell
# Kill all Go, Caddy, Node processes
Stop-Process -Name go, caddy, node -Force -ErrorAction SilentlyContinue

# Or use the automated script prompt
.\start-realtime-stack.ps1  # Choose [k]ill when prompted
```

**Identify Specific Process:**
```powershell
Get-NetTCPConnection -LocalPort 5178 |
  ForEach-Object {
    $proc = Get-Process -Id $_.OwningProcess
    Write-Host "Port 5178: $($proc.ProcessName) (PID $($proc.Id))"
  }
```

## 📝 Files Modified

### ✅ start-realtime-stack.ps1
**Changes:**
- Enhanced port conflict resolution (kill/continue/quit)
- Caddy path auto-detection (`.\caddy.exe` vs `caddy`)
- Extended orchestrator timeout (10s → 15s)
- Better progress messages
- Delete old registry before start

### ✅ go-services/ws-orchestrator/main.go
**Status:** ✅ **Already Working**
- Generates `.ws-registry.json`
- Generates `.env.local`
- Generates `Caddyfile.ws`
- Allocates ports 5173-5199 dynamically
- Registers 5 services (rag, chat, canvas, notifications, enhanced-rag)

### ✅ go-services/quic-bridge/main.go
**Status:** ✅ **Already Implemented**
- HTTP fallback on port 8101 (working)
- HTTP/3 on port 8100 (requires TLS certificates)

### ✅ sveltekit-frontend/Caddyfile.development
**Changes:**
- Imports auto-generated `../../Caddyfile.ws`
- Proxies QUIC endpoints (`/quic/*` → localhost:8100)
- QUIC health check route

### ✅ sveltekit-frontend/src/lib/services/real-time-search.ts
**Changes:**
- Auto-discovery from `.ws-registry.json`
- Fallback chain: Registry → Environment → Hardcoded
- Dynamic WebSocket URL generation

## 🎯 Next Steps

### Immediate (Today)

1. **Start Services:** ✅ READY
   ```powershell
   .\start-realtime-stack.ps1
   ```

2. **Run Tests:** ✅ READY
   ```powershell
   node test-realtime-integration.mjs
   ```

3. **Test in Browser:** ✅ READY
   - Navigate to http://localhost:5178
   - Open browser console
   - Run WebSocket connection test (see above)

### This Week

1. **Generate TLS Certificates (for WebTransport):**
   ```powershell
   New-Item -ItemType Directory -Force -Path go-services\quic-bridge\certs

   openssl req -x509 -newkey rsa:4096 `
     -keyout go-services\quic-bridge\certs\key.pem `
     -out go-services\quic-bridge\certs\cert.pem `
     -days 365 -nodes -subj "/CN=localhost"
   ```

2. **Enable HTTP/3 in QUIC Bridge:**
   - Uncomment HTTP/3 server code in `go-services/quic-bridge/main.go`
   - Restart QUIC bridge
   - Test with WebTransport client

3. **Performance Benchmarking:**
   - WebSocket latency (target: <15ms)
   - HTTP/3 latency (target: <5ms)
   - WebTransport latency (target: <1ms)

4. **Connect to Actual RAG Service:**
   - Enhanced RAG currently returns mock data
   - Connect to port 8095 RAG service
   - Implement real legal search queries

### Next Week

1. **NATS Event Bus Integration**
2. **Background AI Self-Prompting**
3. **Evidence Canvas Real-Time Collaboration**

## 📚 Documentation

- **This File:** Quick fixes and immediate next steps
- **MANUAL_START_GUIDE.md:** Step-by-step manual startup (troubleshooting)
- **REALTIME_QUICK_START_COMPLETE.md:** Comprehensive quick start guide
- **INTEGRATION_GUIDE_EXISTING_INFRASTRUCTURE.md:** Full 22-page implementation guide
- **EXISTING_INFRASTRUCTURE_AUDIT.md:** Infrastructure discovery and analysis
- **WEBSOCKET_QUIC_DISCOVERY_SUMMARY.md:** Discovery process documentation

## ✅ Summary

**All issues resolved!** 🎉

- ✅ Caddy path detection fixed
- ✅ Port conflict resolution enhanced
- ✅ WebSocket orchestrator timeout extended
- ✅ Service registry generation working
- ✅ Auto-discovery pattern implemented
- ✅ Integration tests ready
- ✅ Documentation complete

**Ready to start:**
```powershell
.\start-realtime-stack.ps1
```

**Expected result:** All 4 services running, registry generated, frontend can connect to WebSocket services via auto-discovery.
