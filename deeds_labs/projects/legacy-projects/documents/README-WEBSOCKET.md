# WebSocket Setup - Dynamic Port Configuration

## Overview

This setup provides automatic port discovery for WebSocket connections in development, eliminating manual port configuration.

## How It Works

1. **Go Backend** (go-services/websocket-server):
   - Scans ports 5173-5179 for availability
   - Writes chosen port to `sveltekit-frontend/.env.local`
   - Starts WebSocket server with keepalive

2. **Vite Proxy** (sveltekit-frontend):
   - Reads `VITE_WS_PORT` from `.env.local`
   - Proxies `/ws` requests to Go backend
   - Frontend always connects to `/ws` (no port knowledge needed)

3. **Frontend Client**:
   - Connects to `ws://localhost:5173/ws` in dev
   - Uses `wss://yourdomain.com/ws` in production
   - Automatic reconnection with exponential backoff

## Development Workflow

### Option 1: Manual Start

```bash
# Terminal 1: Start Go WebSocket backend
npm run ws:backend

# Terminal 2: Start SvelteKit dev server
npm run dev
```

### Option 2: Single Command

```bash
npm run dev:full
```

### Health Check

```bash
curl http://localhost:5173/health
# Response: {"status":"ok","service":"websocket-server"}
```

## Port Conflict Handling

If all ports 5173-5179 are in use:

1. The Go backend will exit with an error
2. Modify `pickPortInRange(5173, 5179)` in `main.go` to a different range
3. Restart the backend

## Production Deployment

In production, use a reverse proxy (nginx/caddy) to route `/ws` to your WebSocket backend:

```nginx
location /ws {
    proxy_pass http://backend:4000;
    proxy_http_version 1.1;
    proxy_set_header Upgrade $http_upgrade;
    proxy_set_header Connection "upgrade";
}
```

## Public WiFi Compatibility

✅ **No port conflicts**: Backend auto-discovers free port
✅ **Single port exposure**: Frontend only uses 5173 (dev) or 443 (prod)
✅ **Keepalive pings**: Prevents timeout on restrictive networks
✅ **Path-based routing**: `/ws` looks like normal HTTPS traffic

## Adding More WebSocket Services

### Backend (Go)

```go
mux.HandleFunc("/ws/chat", chatHandler)
mux.HandleFunc("/ws/notifications", notificationHandler)
```

### Frontend (vite.config.ts)

```typescript
'/ws/chat': {
  target: `ws://localhost:${wsPort}`,
  ws: true
}
```

### Client (TypeScript)

```typescript
const chatWS = new DynamicWebSocketClient({ endpoint: '/ws/chat' });
const notifWS = new DynamicWebSocketClient({ endpoint: '/ws/notifications' });
```

## Error Monitoring

### Real-time Error Logging

All HMR and WebSocket errors are automatically logged to `logs/hmr-errors.log`.

**Monitor errors in real-time:**

```bash
npm run logs:hmr
```

**Analyze errors and get suggestions:**

```bash
npm run logs:analyze
```

**Clear error logs:**

```bash
npm run clear:logs
```

### Common WebSocket Errors

#### Error: "Reconnection attempt 5/5"

**Cause:** Go WebSocket backend is not running or unreachable.

**Fix:**
```bash
# Check if backend is running
curl http://localhost:5173/health

# Restart backend
npm run ws:orchestrator
```

#### Error: "Failed to initialize real-time search"

**Cause:** Frontend cannot connect to WebSocket endpoint.

**Fix:**
1. Verify `.env.local` has correct `VITE_WS_PORT`
2. Check `.ws-registry.json` for correct UUIDs
3. Restart full stack: `npm run dev:full`

### Auto-Solve with MCP

The project includes automatic error detection and resolution via MCP server.

Errors are:
1. Logged to `logs/hmr-errors.log`
2. Detected by VS Code MCP extension
3. Analyzed by local AI (if enabled)
4. Fix suggestions displayed in IDE

**Enable auto-solve:**
Edit `.vscode/mcp.json`:
```json
{
  "mcpConfig": {
    "autoSolve": {
      "enabled": true
    }
  }
}
```
