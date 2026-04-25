# Phase 10: Troubleshooting Guide

**Date:** December 15, 2025
**Version:** 1.0
**Status:** Complete

---

## Overview

This guide covers common issues with Phase 10 (Real-Time Health Updates) and their solutions.

---

## Connection Issues

### Issue 1: Connection Fails Immediately

**Symptoms:**
- EventSource never connects
- Browser console shows connection error
- No "connected" message received

**Possible Causes:**
1. Backend service not running
2. Incorrect endpoint URL
3. CORS issues
4. Network connectivity problem

**Debugging Steps:**

```bash
# Step 1: Verify server is running
curl http://localhost:5173/

# Expected: HTTP 200 OK

# Step 2: Test endpoint directly
curl -v http://localhost:5173/api/routes/health-updates

# Expected: HTTP 200 OK with SSE headers
# Content-Type: text/event-stream
# Cache-Control: no-cache
```

**Solutions:**

```javascript
// Solution 1: Check endpoint URL
const url = '/api/routes/health-updates';
console.log('Connecting to:', url);

// Solution 2: Add error logging
const eventSource = new EventSource(url);

eventSource.onerror = (error) => {
  console.error('Connection error:', error);
  console.error('Ready state:', eventSource.readyState);
  // 0 = CONNECTING, 1 = OPEN, 2 = CLOSED
};

// Solution 3: Check CORS headers
fetch(url, { method: 'OPTIONS' })
  .then(r => {
    console.log('CORS headers:', r.headers);
  });
```

**Resolution:**
1. Ensure backend service is running: `npm run dev`
2. Verify endpoint URL is correct
3. Check browser console for CORS errors
4. Verify network connectivity: `ping localhost`

---

### Issue 2: Connection Established but No Messages

**Symptoms:**
- "connected" message received
- No status updates received
- No heartbeat messages

**Possible Causes:**
1. No route status changes occurring
2. Health monitor not running
3. Message batching delay
4. Heartbeat not being sent

**Debugging Steps:**

```bash
# Step 1: Check if routes exist
curl http://localhost:5173/api/routes

# Expected: List of routes with health status

# Step 2: Monitor endpoint directly
curl -N http://localhost:5173/api/routes/health-updates

# Expected: See heartbeat every 30 seconds
# data: {"type":"heartbeat","timestamp":"..."}

# Step 3: Check server logs
npm run logs | grep "health-updates"
```

**Solutions:**

```javascript
// Solution 1: Monitor all message types
const eventSource = new EventSource('/api/routes/health-updates');

eventSource.addEventListener('message', (event) => {
  const data = JSON.parse(event.data);
  console.log('Message type:', data.type);
  console.log('Full message:', data);
});

// Solution 2: Set timeout to detect stale connection
let lastMessage = Date.now();

eventSource.addEventListener('message', (event) => {
  lastMessage = Date.now();
});

setInterval(() => {
  const elapsed = Date.now() - lastMessage;
  if (elapsed > 60000) {
    console.warn('No message for 60 seconds');
    eventSource.close();
  }
}, 10000);

// Solution 3: Check message format
eventSource.addEventListener('message', (event) => {
  try {
    const data = JSON.parse(event.data);
    console.log('Valid JSON:', data);
  } catch (e) {
    console.error('Invalid JSON:', event.data);
  }
});
```

**Resolution:**
1. Verify heartbeat is being sent (every 30 seconds)
2. Check if routes have status changes
3. Monitor server logs for errors
4. Verify message format is valid JSON

---

### Issue 3: Connection Drops Frequently

**Symptoms:**
- Connection established then closes
- Reconnection attempts visible in logs
- Frequent "connected" messages

**Possible Causes:**
1. Network instability
2. Server restarting
3. Firewall/proxy timeout
4. Memory leak causing crashes

**Debugging Steps:**

```bash
# Step 1: Check server uptime
ps aux | grep node

# Expected: Single node process running

# Step 2: Monitor server logs
npm run logs | tail -100

# Look for: errors, crashes, restarts

# Step 3: Check network stability
ping -c 100 localhost

# Expected: 0% packet loss

# Step 4: Monitor memory usage
watch -n 1 'ps aux | grep node'

# Expected: Memory stable, not growing
```

**Solutions:**

```javascript
// Solution 1: Implement robust reconnection
let reconnectAttempts = 0;
const MAX_ATTEMPTS = 10;

function connect() {
  const eventSource = new EventSource('/api/routes/health-updates');

  eventSource.addEventListener('message', () => {
    reconnectAttempts = 0; // Reset on success
  });

  eventSource.onerror = () => {
    eventSource.close();

    if (reconnectAttempts < MAX_ATTEMPTS) {
      const delay = Math.min(1000 * Math.pow(2, reconnectAttempts), 30000);
      reconnectAttempts++;
      console.log(`Reconnecting in ${delay}ms (attempt ${reconnectAttempts})`);
      setTimeout(connect, delay);
    }
  };
}

// Solution 2: Monitor connection health
let connectionStartTime = Date.now();

eventSource.addEventListener('message', () => {
  const uptime = Date.now() - connectionStartTime;
  console.log('Connection uptime:', uptime, 'ms');
});

// Solution 3: Detect server restarts
let lastClientId = null;

eventSource.addEventListener('message', (event) => {
  const data = JSON.parse(event.data);

  if (data.type === 'connected') {
    if (lastClientId && lastClientId !== data.clientId) {
      console.warn('Server restarted (new clientId)');
    }
    lastClientId = data.clientId;
  }
});
```

**Resolution:**
1. Check server logs for errors or crashes
2. Verify network stability
3. Monitor memory usage for leaks
4. Implement robust reconnection logic

---

## Message Issues

### Issue 4: Messages Not Parsed Correctly

**Symptoms:**
- JSON parse errors in console
- Invalid message format
- Undefined properties in data

**Possible Causes:**
1. Malformed JSON from server
2. Incomplete message received
3. Encoding issues
4. Server bug

**Debugging Steps:**

```javascript
// Step 1: Log raw message data
eventSource.addEventListener('message', (event) => {
  console.log('Raw data:', event.data);
  console.log('Data length:', event.data.length);
  console.log('Data type:', typeof event.data);
});

// Step 2: Check for encoding issues
eventSource.addEventListener('message', (event) => {
  const bytes = new TextEncoder().encode(event.data);
  console.log('Bytes:', bytes);
});

// Step 3: Validate JSON structure
eventSource.addEventListener('message', (event) => {
  try {
    const data = JSON.parse(event.data);

    // Validate required fields
    if (!data.type || !data.timestamp) {
      console.error('Missing required fields:', data);
    }

    // Validate type-specific fields
    if (data.type === 'health-update') {
      if (!data.routeId || !data.status) {
        console.error('Missing health-update fields:', data);
      }
    }
  } catch (e) {
    console.error('JSON parse error:', e);
    console.error('Data:', event.data);
  }
});
```

**Solutions:**

```javascript
// Solution 1: Robust message parsing
function parseMessage(data) {
  try {
    const parsed = JSON.parse(data);

    // Validate message structure
    if (!parsed.type || !parsed.timestamp) {
      throw new Error('Missing required fields');
    }

    return parsed;
  } catch (error) {
    console.error('Failed to parse message:', error);
    console.error('Raw data:', data);
    return null;
  }
}

eventSource.addEventListener('message', (event) => {
  const data = parseMessage(event.data);
  if (data) {
    handleMessage(data);
  }
});

// Solution 2: Handle partial messages
let buffer = '';

eventSource.addEventListener('message', (event) => {
  buffer += event.data;

  // Try to parse complete messages
  const lines = buffer.split('\n');

  for (let i = 0; i < lines.length - 1; i++) {
    const data = parseMessage(lines[i]);
    if (data) {
      handleMessage(data);
    }
  }

  // Keep incomplete message in buffer
  buffer = lines[lines.length - 1];
});

// Solution 3: Add message validation
function validateMessage(data) {
  const errors = [];

  if (!data.type) errors.push('Missing type');
  if (!data.timestamp) errors.push('Missing timestamp');

  if (data.type === 'health-update') {
    if (!data.routeId) errors.push('Missing routeId');
    if (!data.status) errors.push('Missing status');
  }

  return errors.length === 0 ? null : errors;
}

eventSource.addEventListener('message', (event) => {
  const data = JSON.parse(event.data);
  const errors = validateMessage(data);

  if (errors) {
    console.error('Message validation failed:', errors);
  } else {
    handleMessage(data);
  }
});
```

**Resolution:**
1. Add robust JSON parsing with error handling
2. Validate message structure
3. Check server logs for malformed messages
4. Verify encoding is UTF-8

---

### Issue 5: Batch Updates Not Working

**Symptoms:**
- Individual updates instead of batches
- Batch messages not received
- Performance not improved

**Possible Causes:**
1. Batch size not reached
2. Batch timeout not triggered
3. Batch processing disabled
4. Configuration issue

**Debugging Steps:**

```javascript
// Step 1: Monitor message types
let updateCount = 0;
let batchCount = 0;

eventSource.addEventListener('message', (event) => {
  const data = JSON.parse(event.data);

  if (data.type === 'health-update') {
    updateCount++;
  } else if (data.type === 'batch') {
    batchCount++;
    console.log('Batch received with', data.updates.length, 'updates');
  }
});

// Step 2: Check batch configuration
console.log('Batch size:', 10);
console.log('Batch timeout:', 100, 'ms');

// Step 3: Monitor batch timing
let lastBatchTime = Date.now();

eventSource.addEventListener('message', (event) => {
  const data = JSON.parse(event.data);

  if (data.type === 'batch') {
    const timeSinceLastBatch = Date.now() - lastBatchTime;
    console.log('Time since last batch:', timeSinceLastBatch, 'ms');
    lastBatchTime = Date.now();
  }
});
```

**Solutions:**

```javascript
// Solution 1: Verify batch processing
eventSource.addEventListener('message', (event) => {
  const data = JSON.parse(event.data);

  if (data.type === 'batch') {
    console.log('✓ Batch processing working');
    console.log('  Updates in batch:', data.updates.length);
    console.log('  Timestamp:', data.timestamp);
  }
});

// Solution 2: Handle both individual and batch updates
function handleUpdate(update) {
  // Process single update
  console.log('Processing update:', update);
}

eventSource.addEventListener('message', (event) => {
  const data = JSON.parse(event.data);

  if (data.type === 'health-update') {
    handleUpdate(data);
  } else if (data.type === 'batch') {
    data.updates.forEach(handleUpdate);
  }
});

// Solution 3: Monitor batch efficiency
let totalUpdates = 0;
let totalBatches = 0;

eventSource.addEventListener('message', (event) => {
  const data = JSON.parse(event.data);

  if (data.type === 'health-update') {
    totalUpdates++;
  } else if (data.type === 'batch') {
    totalBatches++;
    totalUpdates += data.updates.length;
  }
});

setInterval(() => {
  const avgBatchSize = totalUpdates / totalBatches;
  console.log('Average batch size:', avgBatchSize.toFixed(2));
}, 10000);
```

**Resolution:**
1. Verify batch configuration is correct
2. Monitor batch message frequency
3. Check server logs for batch processing
4. Verify batch size and timeout settings

---

## Performance Issues

### Issue 6: High Memory Usage

**Symptoms:**
- Memory grows over time
- Browser becomes slow
- Eventually crashes

**Possible Causes:**
1. Message history not limited
2. Memory leak in event handlers
3. Old EventSource instances not closed
4. Circular references in data

**Debugging Steps:**

```javascript
// Step 1: Monitor memory usage
if (performance.memory) {
  setInterval(() => {
    console.log('Memory usage:', {
      usedJSHeapSize: (performance.memory.usedJSHeapSize / 1048576).toFixed(2), 'MB',
      totalJSHeapSize: (performance.memory.totalJSHeapSize / 1048576).toFixed(2), 'MB',
      jsHeapSizeLimit: (performance.memory.jsHeapSizeLimit / 1048576).toFixed(2), 'MB'
    });
  }, 5000);
}

// Step 2: Monitor message history size
let messageHistory = [];

eventSource.addEventListener('message', (event) => {
  const data = JSON.parse(event.data);
  messageHistory.push(data);

  console.log('Message history size:', messageHistory.length);
});

// Step 3: Check for memory leaks
let eventSourceInstances = 0;

function createEventSource() {
  eventSourceInstances++;
  console.log('EventSource instances:', eventSourceInstances);

  const es = new EventSource('/api/routes/health-updates');

  es.onerror = () => {
    es.close();
    eventSourceInstances--;
  };

  return es;
}
```

**Solutions:**

```javascript
// Solution 1: Limit message history
const MAX_HISTORY = 100;
let messageHistory = [];

eventSource.addEventListener('message', (event) => {
  const data = JSON.parse(event.data);
  messageHistory.push(data);

  // Keep only last 100 messages
  if (messageHistory.length > MAX_HISTORY) {
    messageHistory.shift();
  }
});

// Solution 2: Clean up old EventSource instances
let currentEventSource = null;

function connect() {
  // Close previous connection
  if (currentEventSource) {
    currentEventSource.close();
  }

  currentEventSource = new EventSource('/api/routes/health-updates');

  currentEventSource.addEventListener('message', (event) => {
    // Handle message
  });
}

// Solution 3: Implement garbage collection
setInterval(() => {
  // Clear old data
  messageHistory = messageHistory.slice(-100);

  // Force garbage collection (if available)
  if (window.gc) {
    window.gc();
  }
}, 60000);

// Solution 4: Monitor and alert on memory growth
let lastMemory = 0;

setInterval(() => {
  if (performance.memory) {
    const currentMemory = performance.memory.usedJSHeapSize;
    const growth = currentMemory - lastMemory;

    if (growth > 10 * 1024 * 1024) { // 10MB growth
      console.warn('Significant memory growth detected:', growth / 1024 / 1024, 'MB');
    }

    lastMemory = currentMemory;
  }
}, 10000);
```

**Resolution:**
1. Limit message history to 100 messages
2. Close old EventSource instances
3. Implement periodic garbage collection
4. Monitor memory usage and alert on growth

---

### Issue 7: High CPU Usage

**Symptoms:**
- CPU usage high (> 50%)
- Browser becomes unresponsive
- Fan noise increases

**Possible Causes:**
1. Excessive event handler processing
2. Inefficient UI updates
3. Tight loops in message handling
4. Unoptimized batch processing

**Debugging Steps:**

```javascript
// Step 1: Profile message handling
let messageCount = 0;
let startTime = Date.now();

eventSource.addEventListener('message', (event) => {
  const handleStart = performance.now();

  const data = JSON.parse(event.data);
  // Process message

  const handleTime = performance.now() - handleStart;

  messageCount++;
  if (messageCount % 100 === 0) {
    const elapsed = Date.now() - startTime;
    const rate = messageCount / (elapsed / 1000);
    console.log('Message rate:', rate.toFixed(2), 'msg/s');
    console.log('Handle time:', handleTime.toFixed(2), 'ms');
  }
});

// Step 2: Check for tight loops
eventSource.addEventListener('message', (event) => {
  const data = JSON.parse(event.data);

  // Avoid tight loops
  if (data.type === 'batch') {
    // Process batch efficiently
    requestAnimationFrame(() => {
      data.updates.forEach(update => {
        // Process update
      });
    });
  }
});

// Step 3: Monitor UI update frequency
let updateCount = 0;

eventSource.addEventListener('message', (event) => {
  updateCount++;

  if (updateCount % 10 === 0) {
    console.log('Updates per second:', updateCount);
    updateCount = 0;
  }
});
```

**Solutions:**

```javascript
// Solution 1: Batch UI updates
let updateQueue = [];
let updateScheduled = false;

eventSource.addEventListener('message', (event) => {
  const data = JSON.parse(event.data);
  updateQueue.push(data);

  if (!updateScheduled) {
    updateScheduled = true;
    requestAnimationFrame(() => {
      updateUI(updateQueue);
      updateQueue = [];
      updateScheduled = false;
    });
  }
});

// Solution 2: Debounce expensive operations
function debounce(fn, delay) {
  let timeout;
  return function(...args) {
    clearTimeout(timeout);
    timeout = setTimeout(() => fn(...args), delay);
  };
}

const expensiveUpdate = debounce((data) => {
  // Expensive operation
}, 100);

eventSource.addEventListener('message', (event) => {
  const data = JSON.parse(event.data);
  expensiveUpdate(data);
});

// Solution 3: Use Web Workers for processing
const worker = new Worker('message-processor.js');

eventSource.addEventListener('message', (event) => {
  const data = JSON.parse(event.data);
  worker.postMessage(data);
});

worker.onmessage = (event) => {
  updateUI(event.data);
};

// Solution 4: Throttle message processing
function throttle(fn, delay) {
  let lastCall = 0;
  return function(...args) {
    const now = Date.now();
    if (now - lastCall >= delay) {
      fn(...args);
      lastCall = now;
    }
  };
}

const throttledUpdate = throttle((data) => {
  updateUI(data);
}, 100);

eventSource.addEventListener('message', (event) => {
  const data = JSON.parse(event.data);
  throttledUpdate(data);
});
```

**Resolution:**
1. Batch UI updates using requestAnimationFrame
2. Debounce expensive operations
3. Use Web Workers for heavy processing
4. Throttle message processing

---

## Reconnection Issues

### Issue 8: Reconnection Not Working

**Symptoms:**
- Connection drops but doesn't reconnect
- Manual reconnect button doesn't work
- Stuck in disconnected state

**Possible Causes:**
1. Reconnection logic not implemented
2. Exponential backoff not working
3. Max reconnection attempts reached
4. Event handler not set up

**Debugging Steps:**

```javascript
// Step 1: Check reconnection logic
eventSource.onerror = (error) => {
  console.log('Connection error:', error);
  console.log('Ready state:', eventSource.readyState);
  // 0 = CONNECTING, 1 = OPEN, 2 = CLOSED
};

// Step 2: Monitor reconnection attempts
let reconnectAttempts = 0;

eventSource.onerror = () => {
  reconnectAttempts++;
  console.log('Reconnection attempt:', reconnectAttempts);
};

// Step 3: Check exponential backoff
function getBackoffDelay(attempts) {
  const delay = Math.min(1000 * Math.pow(2, attempts), 30000);
  console.log('Backoff delay:', delay, 'ms');
  return delay;
}
```

**Solutions:**

```javascript
// Solution 1: Implement reconnection logic
let reconnectAttempts = 0;
const MAX_ATTEMPTS = 10;

function connect() {
  const eventSource = new EventSource('/api/routes/health-updates');

  eventSource.addEventListener('message', () => {
    reconnectAttempts = 0; // Reset on success
  });

  eventSource.onerror = () => {
    eventSource.close();

    if (reconnectAttempts < MAX_ATTEMPTS) {
      const delay = Math.min(1000 * Math.pow(2, reconnectAttempts), 30000);
      reconnectAttempts++;
      console.log(`Reconnecting in ${delay}ms`);
      setTimeout(connect, delay);
    } else {
      console.error('Max reconnection attempts reached');
    }
  };

  return eventSource;
}

// Solution 2: Add manual reconnect button
function manualReconnect() {
  reconnectAttempts = 0; // Reset attempts
  connect();
}

// Solution 3: Monitor reconnection status
let isConnected = false;

eventSource.addEventListener('message', (event) => {
  const data = JSON.parse(event.data);

  if (data.type === 'connected') {
    isConnected = true;
    console.log('✓ Connected');
  }
});

eventSource.onerror = () => {
  isConnected = false;
  console.log('✗ Disconnected');
};

// Solution 4: Implement connection status store
import { writable } from 'svelte/store';

export const connectionStatus = writable({
  connected: false,
  attempts: 0,
  lastError: null
});

function connect() {
  const eventSource = new EventSource('/api/routes/health-updates');

  eventSource.addEventListener('message', () => {
    connectionStatus.update(s => ({
      ...s,
      connected: true,
      attempts: 0
    }));
  });

  eventSource.onerror = (error) => {
    eventSource.close();

    connectionStatus.update(s => ({
      ...s,
      connected: false,
      attempts: s.attempts + 1,
      lastError: error.message
    }));
  };
}
```

**Resolution:**
1. Implement exponential backoff reconnection
2. Add manual reconnect button
3. Monitor connection status
4. Reset attempts on successful connection

---

## Fallback Issues

### Issue 9: SSE Fallback Not Working

**Symptoms:**
- Fallback endpoint not responding
- WebSocket works but SSE fallback doesn't
- Fallback endpoint returns error

**Possible Causes:**
1. Fallback endpoint not implemented
2. Different message format
3. Configuration issue
4. Network issue

**Debugging Steps:**

```bash
# Step 1: Test fallback endpoint
curl -v http://localhost:5173/api/routes/health-updates-sse

# Expected: HTTP 200 OK with SSE headers

# Step 2: Compare with primary endpoint
curl -v http://localhost:5173/api/routes/health-updates

# Expected: Same response format

# Step 3: Check server logs
npm run logs | grep "health-updates-sse"
```

**Solutions:**

```javascript
// Solution 1: Implement fallback logic
function connectWithFallback() {
  try {
    // Try primary endpoint
    const eventSource = new EventSource('/api/routes/health-updates');

    eventSource.onerror = () => {
      console.log('Primary endpoint failed, trying fallback');
      eventSource.close();
      connectToFallback();
    };

    return eventSource;
  } catch (error) {
    console.error('Primary endpoint error:', error);
    connectToFallback();
  }
}

function connectToFallback() {
  const eventSource = new EventSource('/api/routes/health-updates-sse');

  eventSource.addEventListener('message', (event) => {
    console.log('✓ Using fallback endpoint');
    // Handle message
  });

  eventSource.onerror = () => {
    console.error('Fallback endpoint also failed');
  };

  return eventSource;
}

// Solution 2: Detect and use appropriate endpoint
async function getAvailableEndpoint() {
  const endpoints = [
    '/api/routes/health-updates',
    '/api/routes/health-updates-sse'
  ];

  for (const endpoint of endpoints) {
    try {
      const response = await fetch(endpoint, { method: 'HEAD' });
      if (response.ok) {
        console.log('Using endpoint:', endpoint);
        return endpoint;
      }
    } catch (error) {
      console.log('Endpoint not available:', endpoint);
    }
  }

  throw new Error('No available endpoints');
}

// Solution 3: Monitor endpoint usage
let endpointUsed = null;

eventSource.addEventListener('message', (event) => {
  const data = JSON.parse(event.data);

  if (data.type === 'connected' && !endpointUsed) {
    endpointUsed = 'primary';
    console.log('Using primary endpoint');
  }
});
```

**Resolution:**
1. Verify fallback endpoint is implemented
2. Test both endpoints independently
3. Implement automatic fallback logic
4. Monitor which endpoint is being used

---

## Support

### Documentation
- [API Documentation](./PHASE_10_API_DOCUMENTATION.md)
- [Deployment Guide](./PHASE_10_DEPLOYMENT_GUIDE.md)
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
| 2025-12-15 | 1.0 | Initial troubleshooting guide | Kiro |
