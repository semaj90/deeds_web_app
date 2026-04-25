# SSE Quick Reference Card - Svelte 5 + SvelteKit

**Use this instead of WebSocket for real-time features** ✅

---

## 🚀 Client-Side (Component)

```typescript
import { createSSEClient } from '$lib/services/sse-client.svelte';
import { onMount, onDestroy } from 'svelte';

// Create SSE client
const chatSSE = createSSEClient({
  url: '/api/sse/chat',
  reconnectDelay: 1000,
  maxReconnectAttempts: 5
});

// Reactive state (Svelte 5 runes)
let messages = $state<Message[]>([]);
let isConnected = $derived(chatSSE.isConnected);

// Register handlers
chatSSE.on('message', (data) => {
  messages = [...messages, data as Message];
});

chatSSE.on('typing', (data) => {
  console.log('Typing:', data);
});

// Lifecycle
onMount(() => chatSSE.connect());
onDestroy(() => chatSSE.disconnect());
```

---

## 🌐 Server-Side (SvelteKit Endpoint)

```typescript
// src/routes/api/sse/chat/+server.ts
import type { RequestHandler } from './$types';

export const GET: RequestHandler = async ({ request, locals }) => {
  const stream = new ReadableStream({
    start(controller) {
      const encoder = new TextEncoder();

      // Helper to send events
      const send = (type: string, data: unknown) => {
        const msg = `event: ${type}\ndata: ${JSON.stringify(data)}\n\n`;
        controller.enqueue(encoder.encode(msg));
      };

      // Send initial connection
      send('connected', { userId: locals.user?.id });

      // Example: Send updates every 30s
      const interval = setInterval(() => {
        send('ping', { timestamp: Date.now() });
      }, 30000);

      // Cleanup on disconnect
      request.signal.addEventListener('abort', () => {
        clearInterval(interval);
        controller.close();
      });
    }
  });

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive'
    }
  });
};
```

---

## 🤖 AI Streaming Example

**Client:**
```typescript
const aiSSE = createSSEClient({
  url: `/api/sse/ai-stream?prompt=${encodeURIComponent(prompt)}`
});

let streamingText = $state('');

aiSSE.on('token', (data) => {
  const { text, done } = data as { text: string; done: boolean };
  streamingText += text;
  if (done) aiSSE.disconnect();
});

aiSSE.connect();
```

**Server:**
```typescript
// src/routes/api/sse/ai-stream/+server.ts
export const GET: RequestHandler = async ({ url }) => {
  const prompt = url.searchParams.get('prompt') || '';

  const stream = new ReadableStream({
    async start(controller) {
      const encoder = new TextEncoder();

      // Stream from Ollama
      const response = await fetch('http://localhost:11434/api/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: 'gemma3-legal:latest',
          prompt,
          stream: true
        })
      });

      const reader = response.body?.getReader();
      if (!reader) return;

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        const chunk = new TextDecoder().decode(value);
        const lines = chunk.split('\n').filter(Boolean);

        for (const line of lines) {
          const data = JSON.parse(line);
          const msg = `event: token\ndata: ${JSON.stringify({
            text: data.response,
            done: data.done
          })}\n\n`;
          controller.enqueue(encoder.encode(msg));
        }
      }

      controller.close();
    }
  });

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive'
    }
  });
};
```

---

## 🔧 Common Patterns

### Pattern 1: Chat Messages
```typescript
chatSSE.on('message', (data) => {
  messages = [...messages, data as ChatMessage];
});
```

### Pattern 2: Typing Indicators
```typescript
chatSSE.on('typing', (data) => {
  const { userId, isTyping } = data as TypingEvent;
  typingUsers = isTyping
    ? [...typingUsers, userId]
    : typingUsers.filter(id => id !== userId);
});
```

### Pattern 3: Real-Time Updates
```typescript
dashboardSSE.on('update', (data) => {
  const { metric, value } = data as MetricUpdate;
  metrics = { ...metrics, [metric]: value };
});
```

---

## 🐛 Debugging

### Check Connection
```bash
curl -N http://localhost:5173/api/sse/chat
```

### Test Event Stream
```bash
# Should output:
event: connected
data: {"userId":"123"}

event: ping
data: {"timestamp":1703347200000}
```

### Browser DevTools
```javascript
// In browser console
const es = new EventSource('/api/sse/chat');
es.onmessage = (e) => console.log('Message:', e.data);
es.addEventListener('ping', (e) => console.log('Ping:', e.data));
```

---

## ⚡ Performance Tips

1. **Use Named Events** - Faster parsing
   ```typescript
   // Good
   send('user:message', { text: 'hello' });

   // Slower
   send('message', { type: 'user', text: 'hello' });
   ```

2. **Batch Updates** - Reduce event overhead
   ```typescript
   // Send multiple updates in one event
   send('batch', { updates: [update1, update2, update3] });
   ```

3. **Heartbeat** - Prevent connection timeout
   ```typescript
   setInterval(() => send('ping', {}), 30000); // Every 30s
   ```

---

## 🎯 Migration Checklist

- [ ] Replace `new WebSocket()` with `createSSEClient()`
- [ ] Replace `ws.send()` with POST requests to API
- [ ] Create `/api/sse/{endpoint}/+server.ts`
- [ ] Update handlers: `ws.onmessage` → `sse.on('event')`
- [ ] Remove manual reconnection logic (automatic)
- [ ] Test with `curl -N`
- [ ] Update documentation

---

**Created:** December 23, 2025
**Reference:** docs/SSE_MIGRATION_GUIDE.md
**Client:** src/lib/services/sse-client.svelte.ts
