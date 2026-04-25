# 🚀 Real-Time Communication Quick Reference

## One-Command Startup

### Development Stack (All Services)

```bash
# Start infrastructure
docker start legal-ai-redis legal-ai-postgres

# Start WebSocket service (Terminal 1)
cd go-microservice && go run enhanced-rag-service.go websocket-handler.go

# Start QUIC service (Terminal 2)
cd go-microservice && go run quic-webtransport-server.go

# Start Caddy proxy (Terminal 3)
caddy run --config Caddyfile.webtransport --watch

# Start SvelteKit (Terminal 4)
cd sveltekit-frontend && npm run dev
```

---

## Service Endpoints

| Service | Protocol | Port | Endpoint | Purpose |
|---------|----------|------|----------|---------|
| **Enhanced RAG** | WebSocket | 8095 | `ws://localhost:8095/ws/legal-search-client` | Real-time search |
| **QUIC Service** | HTTP/3 | 8447 | `https://localhost:8447/wt/legal-search` | Ultra-fast QUIC |
| **Caddy Proxy** | HTTP/3 | 8443 | `https://localhost:8443/*` | Main gateway |
| **SvelteKit** | HTTP | 5173 | `http://localhost:5173/` | Frontend app |

---

## Health Checks

```bash
# WebSocket service
curl http://localhost:8095/health

# QUIC service
curl --http3 https://localhost:8447/health

# Caddy proxy
curl --http3 https://localhost:8443/health

# SvelteKit
curl http://localhost:5173/api/health/status
```

---

## Testing WebSocket

### Browser Console
```javascript
const ws = new WebSocket('ws://localhost:8095/ws/legal-search-client');

ws.onopen = () => {
  console.log('✅ Connected');
  ws.send(JSON.stringify({
    type: 'search_query',
    searchId: 'test_' + Date.now(),
    data: { query: 'contract law' },
    timestamp: Date.now()
  }));
};

ws.onmessage = (e) => {
  console.log('📨', JSON.parse(e.data));
};
```

---

## Testing WebTransport

### Browser Console
```javascript
const wt = new WebTransport('https://localhost:8443/wt/legal-search');
await wt.ready;
console.log('✅ QUIC Connected');

const stream = await wt.createBidirectionalStream();
const writer = stream.writable.getWriter();
const encoder = new TextEncoder();

await writer.write(encoder.encode(JSON.stringify({
  type: 'search_query',
  streamId: 'test',
  data: { query: 'precedent' },
  timestamp: Date.now()
}) + '\n'));

const reader = stream.readable.getReader();
const decoder = new TextDecoder();

while (true) {
  const { value, done } = await reader.read();
  if (done) break;
  console.log('📨', decoder.decode(value));
}
```

---

## Common Issues & Fixes

### ❌ "Connection refused" on WebSocket

```bash
# Check if service running
netstat -ano | findstr :8095

# Restart service
cd go-microservice
go run enhanced-rag-service.go websocket-handler.go
```

---

### ❌ "HTTP/3 not supported" error

```bash
# Install Caddy with HTTP/3
$url = "https://caddyserver.com/api/download?os=windows&arch=amd64"
Invoke-WebRequest -Uri $url -OutFile "caddy.exe"

# Verify HTTP/3 support
.\caddy.exe version
# Should show: v2.7.x (h1, h2, h3)
```

---

### ❌ "WebTransport not supported" in browser

**Chrome**: Enable at `chrome://flags/#enable-experimental-web-platform-features`

**Edge**: Enable at `edge://flags/#enable-experimental-web-platform-features`

**Firefox**: Not supported yet (use Chrome/Edge)

---

### ❌ "certificate signed by unknown authority"

**Development Fix**:
```javascript
// Chrome: chrome://flags/#allow-insecure-localhost
// Enable "Allow invalid certificates for localhost"
```

**Production Fix**: Use proper TLS certificates (Let's Encrypt, etc.)

---

## Performance Benchmarks

### Expected Latencies

| Protocol | Connection | First Byte | Use Case |
|----------|------------|------------|----------|
| HTTP/1.1 | ~50ms | ~100ms | Legacy APIs |
| WebSocket | ~20ms | ~30ms | Chat, updates |
| **HTTP/3 QUIC** | **~2ms** | **~5ms** | **Fast search** ✨ |
| **WebTransport** | **~1ms** | **~2ms** | **GPU streaming** 🚀 |

---

## Build Commands

### WebSocket Service
```bash
cd go-microservice
go build -o enhanced-rag-service.exe enhanced-rag-service.go websocket-handler.go
.\enhanced-rag-service.exe
```

### QUIC Service
```bash
cd go-microservice
go build -o quic-webtransport-server.exe quic-webtransport-server.go
.\quic-webtransport-server.exe
```

### Frontend
```bash
cd sveltekit-frontend
npm run build
npm run preview
```

---

## Resources

📚 **Documentation**:
- `WEBSOCKET_CONNECTION_FIX.md` - Error resolution
- `WEBSOCKET_GO_IMPLEMENTATION.md` - WebSocket guide
- `WEBTRANSPORT_QUIC_IMPLEMENTATION.md` - QUIC guide
- `REAL_TIME_IMPLEMENTATION_ROADMAP.md` - 7-day plan

---

**Last Updated**: October 9, 2025
**Version**: 1.0.0
**Status**: ✅ Ready for implementation
