# Phase 10: API Documentation

**Date:** December 15, 2025
**Version:** 1.0
**Status:** Complete

---

## Overview

Phase 10 provides real-time health status updates for routes through two endpoints:
1. **WebSocket/SSE Endpoint** - Primary real-time connection
2. **SSE Fallback Endpoint** - Fallback for restricted networks

Both endpoints deliver identical message formats and support automatic reconnection with exponential backoff.

---

## Endpoints

### 1. Primary Health Updates Endpoint

**URL:** `GET /api/routes/health-updates`

**Protocol:** Server-Sent Events (SSE) / WebSocket

**Description:** Real-time health status updates for all routes with automatic heartbeat and reconnection support.

#### Request

```http
GET /api/routes/health-updates HTTP/1.1
Host: localhost:5173
Accept: text/event-stream
Cache-Control: no-cache
Connection: keep-alive
```

#### Response Headers

```http
HTTP/1.1 200 OK
Content-Type: text/event-stream
Cache-Control: no-cache
Connection: keep-alive
Transfer-Encoding: chunked
```

#### Response Format

**Connection Confirmation:**
```json
{
  "type": "connected",
  "timestamp": "2025-12-15T10:30:00Z",
  "clientId": "client-uuid-12345"
}
```

**Health Status Update:**
```json
{
  "type": "health-update",
  "timestamp": "2025-12-15T10:30:15Z",
  "routeId": "route-123",
  "routePath": "/api/routes/search",
  "status": "healthy",
  "previousStatus": "flaky",
  "responseTime": 45,
  "errorRate": 0.0,
  "lastChecked": "2025-12-15T10:30:14Z"
}
```

**Heartbeat (Ping):**
```json
{
  "type": "heartbeat",
  "timestamp": "2025-12-15T10:30:30Z"
}
```

**Batch Update (Multiple Status Changes):**
```json
{
  "type": "batch",
  "timestamp": "2025-12-15T10:30:45Z",
  "updates": [
    {
      "routeId": "route-123",
      "status": "healthy",
      "previousStatus": "flaky"
    },
    {
      "routeId": "route-456",
      "status": "broken",
      "previousStatus": "healthy"
    }
  ]
}
```

#### Status Values

| Status | Description | Color |
|--------|-------------|-------|
| `healthy` | Route responding normally | 🟢 Green |
| `flaky` | Route responding with delays | 🟡 Yellow |
| `broken` | Route not responding | 🔴 Red |
| `unknown` | Status not yet determined | ⚫ Gray |

#### Message Frequency

- **Heartbeat:** Every 30 seconds (no status changes)
- **Status Updates:** Immediately when status changes
- **Batch Updates:** Every 100ms or when 10 updates accumulated

#### Error Handling

**Connection Timeout (60 seconds):**
If no heartbeat received for 60 seconds, client should reconnect.

**Reconnection Strategy:**
- Initial delay: 1 second
- Backoff multiplier: 2x
- Maximum delay: 30 seconds
- Jitter: ±10% random

Example backoff sequence: 1s → 2s → 4s → 8s → 16s → 30s → 30s...

#### Example Usage (JavaScript)

```javascript
const eventSource = new EventSource('/api/routes/health-updates');

eventSource.addEventListener('message', (event) => {
  const data = JSON.parse(event.data);

  switch (data.type) {
    case 'connected':
      console.log('Connected:', data.clientId);
      break;
    case 'health-update':
      console.log(`Route ${data.routeId} is now ${data.status}`);
      break;
    case 'heartbeat':
      console.log('Heartbeat received');
      break;
    case 'batch':
      console.log(`Batch update with ${data.updates.length} changes`);
      break;
  }
});

eventSource.onerror = (error) => {
  console.error('Connection error:', error);
  eventSource.close();
  // Implement reconnection logic
};
```

---

### 2. SSE Fallback Endpoint

**URL:** `GET /api/routes/health-updates-sse`

**Protocol:** Server-Sent Events (SSE)

**Description:** Fallback endpoint for environments where WebSocket is restricted. Provides identical functionality to primary endpoint.

#### Request

```http
GET /api/routes/health-updates-sse HTTP/1.1
Host: localhost:5173
Accept: text/event-stream
Cache-Control: no-cache
Connection: keep-alive
```

#### Response

Identical to primary endpoint. Same message format, same heartbeat interval, same reconnection strategy.

#### When to Use

Use this endpoint when:
- WebSocket connections are blocked by firewall/proxy
- Network requires HTTP-only connections
- Client environment doesn't support WebSocket
- Debugging connection issues

#### Example Usage (JavaScript)

```javascript
const eventSource = new EventSource('/api/routes/health-updates-sse');

// Same event handling as primary endpoint
eventSource.addEventListener('message', (event) => {
  const data = JSON.parse(event.data);
  // Handle message...
});
```

---

## Message Format Details

### Common Fields

All messages include:
- `type` - Message type (connected, health-update, heartbeat, batch)
- `timestamp` - ISO 8601 timestamp when message was created

### Health Update Fields

| Field | Type | Description |
|-------|------|-------------|
| `routeId` | string | Unique route identifier |
| `routePath` | string | API route path (e.g., `/api/routes/search`) |
| `status` | string | Current status (healthy, flaky, broken, unknown) |
| `previousStatus` | string | Previous status before change |
| `responseTime` | number | Average response time in milliseconds |
| `errorRate` | number | Error rate as decimal (0.0 - 1.0) |
| `lastChecked` | string | ISO 8601 timestamp of last health check |

### Batch Update Fields

| Field | Type | Description |
|-------|------|-------------|
| `updates` | array | Array of status change objects |
| `updates[].routeId` | string | Route identifier |
| `updates[].status` | string | New status |
| `updates[].previousStatus` | string | Previous status |

---

## Error Codes

### HTTP Status Codes

| Code | Meaning | Action |
|------|---------|--------|
| 200 | OK - Connection established | Continue receiving messages |
| 400 | Bad Request | Check request format |
| 401 | Unauthorized | Provide authentication credentials |
| 403 | Forbidden | Check permissions |
| 404 | Not Found | Verify endpoint URL |
| 500 | Server Error | Retry with exponential backoff |
| 503 | Service Unavailable | Retry with exponential backoff |

### Connection Errors

| Error | Cause | Solution |
|-------|-------|----------|
| `ECONNREFUSED` | Server not running | Start backend services |
| `ENOTFOUND` | DNS resolution failed | Check hostname/IP |
| `ETIMEDOUT` | Connection timeout | Check network connectivity |
| `ECONNRESET` | Connection reset by peer | Implement reconnection logic |

---

## Authentication

### Current Implementation

No authentication required for health updates endpoints. They are public endpoints.

### Future Enhancement

If authentication is required:

```javascript
const eventSource = new EventSource('/api/routes/health-updates', {
  headers: {
    'Authorization': `Bearer ${token}`
  }
});
```

---

## Rate Limiting

### Current Implementation

No rate limiting applied to health updates endpoints.

### Recommended Limits (Future)

- Per IP: 100 connections per minute
- Per client: 10 concurrent connections
- Message rate: 1000 messages per second

---

## Performance Characteristics

### Latency

| Operation | Target | Typical |
|-----------|--------|---------|
| Connection establishment | < 5s | 2-3s |
| Status update delivery | < 1s | < 500ms |
| Message latency | < 100ms | < 100ms |
| Heartbeat interval | 30s | 30s |

### Throughput

| Metric | Value |
|--------|-------|
| Concurrent connections | 100+ |
| Messages per second | 1000+ |
| Batch size | 10 messages |
| Batch timeout | 100ms |

### Memory Usage

| Metric | Value |
|--------|-------|
| Per connection | < 1MB |
| Message history | 100 messages |
| Total for 100 connections | < 100MB |

---

## Configuration

### Server-Side Configuration

Located in `sveltekit-frontend/src/routes/api/routes/health-updates/+server.ts`:

```typescript
// Heartbeat interval (milliseconds)
const HEARTBEAT_INTERVAL = 30000; // 30 seconds

// Message batch size
const MESSAGE_BATCH_SIZE = 10;

// Message batch timeout (milliseconds)
const MESSAGE_BATCH_TIMEOUT = 100;

// Maximum message history
const MAX_MESSAGE_HISTORY = 100;
```

### Client-Side Configuration

Located in `sveltekit-frontend/src/lib/services/healthUpdates.ts`:

```typescript
// Heartbeat timeout (milliseconds)
const HEARTBEAT_TIMEOUT = 60000; // 60 seconds

// Initial reconnection delay (milliseconds)
const INITIAL_RECONNECTION_DELAY = 1000; // 1 second

// Maximum reconnection delay (milliseconds)
const MAX_RECONNECTION_DELAY = 30000; // 30 seconds

// Reconnection backoff multiplier
const RECONNECTION_BACKOFF_MULTIPLIER = 2;
```

---

## Examples

### Example 1: Basic Connection

```javascript
const eventSource = new EventSource('/api/routes/health-updates');

eventSource.addEventListener('message', (event) => {
  const data = JSON.parse(event.data);
  console.log('Received:', data);
});

eventSource.onerror = () => {
  console.error('Connection lost');
  eventSource.close();
};
```

### Example 2: With Reconnection Logic

```javascript
let reconnectAttempts = 0;
const MAX_RECONNECT_ATTEMPTS = 10;

function connect() {
  const eventSource = new EventSource('/api/routes/health-updates');

  eventSource.addEventListener('message', (event) => {
    reconnectAttempts = 0; // Reset on successful message
    const data = JSON.parse(event.data);
    updateUI(data);
  });

  eventSource.onerror = () => {
    eventSource.close();

    if (reconnectAttempts < MAX_RECONNECT_ATTEMPTS) {
      const delay = Math.min(1000 * Math.pow(2, reconnectAttempts), 30000);
      reconnectAttempts++;
      setTimeout(connect, delay);
    }
  };
}

connect();
```

### Example 3: Svelte Store Integration

```typescript
// healthUpdates.ts
import { writable } from 'svelte/store';

export const healthStatus = writable({
  connected: false,
  lastUpdate: null,
  routes: {}
});

export function initializeHealthUpdates() {
  const eventSource = new EventSource('/api/routes/health-updates');

  eventSource.addEventListener('message', (event) => {
    const data = JSON.parse(event.data);

    healthStatus.update(state => ({
      ...state,
      connected: true,
      lastUpdate: new Date(),
      routes: updateRoutes(state.routes, data)
    }));
  });
}
```

---

## Troubleshooting

### Connection Not Established

**Symptom:** EventSource never connects

**Solutions:**
1. Verify endpoint URL is correct
2. Check browser console for CORS errors
3. Verify backend service is running
4. Check network connectivity

### No Messages Received

**Symptom:** Connected but no messages

**Solutions:**
1. Check if routes have health status changes
2. Verify heartbeat is being received (every 30s)
3. Check browser network tab for SSE stream
4. Verify message format in browser console

### Frequent Disconnections

**Symptom:** Connection drops and reconnects frequently

**Solutions:**
1. Check network stability
2. Verify server is not restarting
3. Check for firewall/proxy issues
4. Review server logs for errors

### High Memory Usage

**Symptom:** Memory grows over time

**Solutions:**
1. Verify message history is limited to 100
2. Check for memory leaks in event handlers
3. Ensure old EventSource instances are closed
4. Monitor batch processing performance

---

## Best Practices

### 1. Always Implement Reconnection Logic

```javascript
eventSource.onerror = () => {
  eventSource.close();
  // Implement exponential backoff reconnection
};
```

### 2. Handle Message Parsing Errors

```javascript
eventSource.addEventListener('message', (event) => {
  try {
    const data = JSON.parse(event.data);
    // Process data
  } catch (error) {
    console.error('Failed to parse message:', error);
  }
});
```

### 3. Clean Up on Page Unload

```javascript
window.addEventListener('beforeunload', () => {
  eventSource.close();
});
```

### 4. Monitor Connection Health

```javascript
let lastHeartbeat = Date.now();

eventSource.addEventListener('message', (event) => {
  const data = JSON.parse(event.data);

  if (data.type === 'heartbeat') {
    lastHeartbeat = Date.now();
  }
});

// Check for stale connection
setInterval(() => {
  if (Date.now() - lastHeartbeat > 60000) {
    console.warn('No heartbeat for 60 seconds');
    eventSource.close();
  }
}, 10000);
```

### 5. Batch Updates for Performance

```javascript
let updateQueue = [];
let batchTimeout;

eventSource.addEventListener('message', (event) => {
  const data = JSON.parse(event.data);

  if (data.type === 'health-update') {
    updateQueue.push(data);

    if (updateQueue.length >= 10) {
      processBatch();
    } else if (!batchTimeout) {
      batchTimeout = setTimeout(processBatch, 100);
    }
  }
});

function processBatch() {
  if (updateQueue.length > 0) {
    updateUI(updateQueue);
    updateQueue = [];
  }
  batchTimeout = null;
}
```

---

## Support

### Documentation
- [Deployment Guide](./PHASE_10_DEPLOYMENT_GUIDE.md)
- [Troubleshooting Guide](./PHASE_10_TROUBLESHOOTING_GUIDE.md)
- [Performance Tuning Guide](./PHASE_10_PERFORMANCE_TUNING_GUIDE.md)

### Implementation Files
- `sveltekit-frontend/src/routes/api/routes/health-updates/+server.ts`
- `sveltekit-frontend/src/routes/api/routes/health-updates-sse/+server.ts`
- `sveltekit-frontend/src/lib/services/healthUpdates.ts`

### Test Files
- `sveltekit-frontend/src/lib/services/healthUpdates.test.ts`
- `sveltekit-frontend/src/lib/services/healthUpdatesPerformance.test.ts`

---

## Document History

| Date | Version | Changes | Author |
|------|---------|---------|--------|
| 2025-12-15 | 1.0 | Initial API documentation | Kiro |
