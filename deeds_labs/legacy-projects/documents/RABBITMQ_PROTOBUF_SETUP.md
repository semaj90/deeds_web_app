# RabbitMQ + Protocol Buffers Setup Guide

## ✅ What Was Fixed

### 1. **Protocol Buffers Compiler (protoc)** - INSTALLED
- **Version**: libprotoc 25.1
- **Location**: `C:\tools\protoc\`
- **Status**: ✅ Ready to use

### 2. **RabbitMQ Connection** - ENHANCED
Enhanced with:
- ✅ Automatic reconnection with exponential backoff
- ✅ Docker service name support (`rabbitmq:5672`)
- ✅ Multiple fallback URLs with priority
- ✅ Heartbeat and timeout configuration
- ✅ Fixed TypeScript `any` type errors

---

## 🚀 Quick Start

### Step 1: Verify protoc Installation

```bash
protoc --version
# Expected: libprotoc 25.1
```

### Step 2: Generate Protocol Buffer Files

```bash
# Option A: Using npm script (if added to package.json)
cd sveltekit-frontend
npm run protoc:generate

# Option B: Using batch script
.\scripts\generate-protobuf.bat

# Option C: Manual generation
protoc --js_out=import_style=commonjs,binary:./src/lib/proto \
       --ts_out=./src/lib/proto \
       ./proto/*.proto
```

### Step 3: Start RabbitMQ

```bash
# Option A: Docker (recommended)
docker run -d --name rabbitmq \
  -p 5672:5672 \
  -p 15672:15672 \
  -e RABBITMQ_DEFAULT_USER=legal_admin \
  -e RABBITMQ_DEFAULT_PASS=123456 \
  rabbitmq:3-management

# Option B: Docker Compose (if you have docker-compose.yml)
docker-compose up -d rabbitmq

# Option C: Local installation
# Download from: https://www.rabbitmq.com/download.html
rabbitmq-server
```

### Step 4: Verify RabbitMQ Connection

```bash
# Management UI
Start http://localhost:15672
# Login: legal_admin / 123456

# Or via curl
curl -u legal_admin:123456 http://localhost:15672/api/overview
```

---

## 📖 Usage Examples

### Example 1: Basic Message Publishing

```typescript
import { publishMessage } from '$lib/server/messaging/rabbitmq';

// Publish a message to a queue
const success = await publishMessage(
  'legal-documents-queue',
  {
    documentId: 'doc-123',
    action: 'analyze',
    priority: 'high'
  },
  {
    persistent: true,
    priority: 9
  }
);

if (success) {
  console.log('✅ Message published');
} else {
  console.log('❌ RabbitMQ unavailable - message not sent');
}
```

### Example 2: Auto-Reconnection

The enhanced RabbitMQ client now automatically reconnects on connection loss:

```typescript
import { getRabbitMQChannel } from '$lib/server/messaging/rabbitmq';

// Get channel (auto-reconnects if needed)
const channel = await getRabbitMQChannel();

if (channel) {
  // Connection active
  await channel.assertQueue('tasks', { durable: true });
} else {
  // Max reconnect attempts reached
  console.log('RabbitMQ permanently unavailable');
}
```

### Example 3: Integration with QUIC/Protobuf

```typescript
import { publishMessage } from '$lib/server/messaging/rabbitmq';
import type { InferenceRequest } from '$lib/proto/legal_ai';

// Publish protobuf-encoded message
const request: InferenceRequest = {
  model: 'gemma3-legal:latest',
  prompt: 'Analyze this contract...',
  priority: 'high'
};

await publishMessage('inference-queue', request, {
  contentType: 'application/x-protobuf',
  persistent: true
});
```

### Example 4: SvelteKit API Route Integration

```typescript
// src/routes/api/tasks/submit/+server.ts
import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { publishMessage } from '$lib/server/messaging/rabbitmq';

export const POST: RequestHandler = async ({ request }) => {
  const { task } = await request.json();

  const success = await publishMessage('background-tasks', task, {
    persistent: true,
    expiration: '300000' // 5 minutes TTL
  });

  if (!success) {
    return json({ error: 'Task queue unavailable' }, { status: 503 });
  }

  return json({ success: true, queued: true });
};
```

---

## 🔧 Configuration

### Environment Variables

```bash
# .env
RABBITMQ_URL=amqp://legal_admin:123456@rabbitmq:5672

# Or for production with multiple nodes
RABBITMQ_URL=amqp://user:pass@node1:5672,node2:5672,node3:5672
```

### Connection Priorities

The client tries connections in this order:

1. **`RABBITMQ_URL`** environment variable (production)
2. **`rabbitmq:5672`** Docker service name
3. **`localhost:5672`** with various credentials
4. **`localhost:5672`** without authentication (dev)

### Reconnection Settings

```typescript
// Configurable constants in rabbitmq.ts
const MAX_RECONNECT_ATTEMPTS = 5;
const RECONNECT_DELAY_MS = 3000; // 3 seconds base delay

// Exponential backoff delays:
// Attempt 1: 3s
// Attempt 2: 6s
// Attempt 3: 12s
// Attempt 4: 24s
// Attempt 5: 48s
```

---

## 📊 Architecture

### RabbitMQ Integration Flow

```
┌─────────────────────────────────────────────────────────┐
│            SvelteKit Application                         │
│  ┌───────────────────────────────────────────────┐     │
│  │  rabbitmq.ts (Enhanced Connection Manager)    │     │
│  │  ┌────────┬──────────┬─────────────────┐     │     │
│  │  │ Connect│ Reconnect│ Publish Message │     │     │
│  │  └────┬───┴────┬─────┴────────┬────────┘     │     │
│  └───────┼────────┼──────────────┼──────────────┘     │
└──────────┼────────┼──────────────┼────────────────────┘
           │        │              │
      ┌────▼────────▼──────────────▼────┐
      │      RabbitMQ Server             │
      │  ┌────────────────────────────┐ │
      │  │  Queues & Exchanges        │ │
      │  │  - legal-documents-queue   │ │
      │  │  - inference-queue         │ │
      │  │  - background-tasks        │ │
      │  └────────────────────────────┘ │
      └──────────────┬──────────────────┘
                     │
      ┌──────────────▼──────────────────┐
      │   Workers/Consumers              │
      │  - Document processor            │
      │  - AI inference worker           │
      │  - Background task executor      │
      └──────────────────────────────────┘
```

### Combined with QUIC/Protobuf Stack

```
┌─────────────────────────────────────────────────────┐
│              Frontend Request                        │
└────────────────┬────────────────────────────────────┘
                 │
       ┌─────────▼──────────┐
       │  SvelteKit API     │
       │  /api/ai/analyze   │
       └─────┬──────────┬───┘
             │          │
    ┌────────▼──┐   ┌──▼──────────┐
    │ RabbitMQ  │   │ QUIC/HTTP3  │
    │ (async)   │   │ (sync)      │
    └────┬──────┘   └──┬──────────┘
         │             │
    ┌────▼─────┐  ┌───▼──────────┐
    │ Workers  │  │ TensorRT     │
    │ (heavy)  │  │ (real-time)  │
    └──────────┘  └──────────────┘
```

---

## 🐛 Troubleshooting

### Issue 1: "protoc not found"

**Solution**: Already fixed! Verify with:
```bash
protoc --version
# If not found, restart terminal or run:
$env:Path += ";C:\tools\protoc\bin"
```

### Issue 2: RabbitMQ Connection Failed

**Symptoms**:
```
⚠️ Failed to connect: connect ECONNREFUSED 127.0.0.1:5672
```

**Solutions**:
1. **Check if RabbitMQ is running**:
   ```bash
   docker ps | grep rabbitmq
   # Or: netstat -ano | findstr :5672
   ```

2. **Start RabbitMQ**:
   ```bash
   docker-compose up -d rabbitmq
   # Or: docker run -d -p 5672:5672 -p 15672:15672 rabbitmq:3-management
   ```

3. **Check credentials**:
   - Default: `guest:guest`
   - Configured: `legal_admin:123456`

### Issue 3: Max Reconnect Attempts Reached

**Symptoms**:
```
❌ Max reconnection attempts (5) reached
❌ RabbitMQ unavailable — continuing without it.
```

**Solutions**:
1. **Verify RabbitMQ is accessible**:
   ```bash
   curl http://localhost:15672
   ```

2. **Check Docker network** (if using Docker):
   ```bash
   docker network inspect deeds-web-app_default
   ```

3. **Increase retry attempts** (if needed):
   ```typescript
   // In rabbitmq.ts
   const MAX_RECONNECT_ATTEMPTS = 10; // Increase from 5
   ```

### Issue 4: Protobuf Generation Fails

**Symptoms**:
```
protoc: error while loading shared libraries
```

**Solutions**:
1. **Ensure protoc is in PATH**:
   ```bash
   where.exe protoc
   ```

2. **Run as administrator** (if permission issues)

3. **Check proto file syntax**:
   ```bash
   protoc --lint proto/legal_ai.proto
   ```

---

## 📋 Next Steps

### 1. Generate Protocol Buffer Files

```bash
# Create proto directory if needed
mkdir -p proto

# Add your .proto files to proto/
# Example: proto/legal_ai.proto

# Generate TypeScript/JavaScript bindings
npm run protoc:generate
```

### 2. Create RabbitMQ Queues

```typescript
// src/lib/server/messaging/setup-queues.ts
import { getRabbitMQChannel } from '$lib/server/messaging/rabbitmq';

export async function setupQueues() {
  const channel = await getRabbitMQChannel();
  if (!channel) return;

  // Create durable queues
  await channel.assertQueue('legal-documents', { durable: true });
  await channel.assertQueue('inference-tasks', { durable: true });
  await channel.assertQueue('background-jobs', { durable: true });

  console.log('✅ RabbitMQ queues initialized');
}
```

### 3. Create Message Consumer

```typescript
// src/lib/server/messaging/consumer.ts
import { getRabbitMQChannel } from '$lib/server/messaging/rabbitmq';

export async function startConsumer(queueName: string) {
  const channel = await getRabbitMQChannel();
  if (!channel) return;

  await channel.assertQueue(queueName, { durable: true });
  channel.prefetch(1); // Process one message at a time

  channel.consume(queueName, async (msg) => {
    if (!msg) return;

    const content = JSON.parse(msg.content.toString());
    console.log('📨 Received:', content);

    // Process message
    await processMessage(content);

    // Acknowledge
    channel.ack(msg);
  });

  console.log(`✅ Consumer listening on ${queueName}`);
}
```

### 4. Monitor RabbitMQ

```bash
# Access management UI
Start http://localhost:15672

# View queues via API
curl -u legal_admin:123456 http://localhost:15672/api/queues

# Monitor queue depth
watch -n 1 'curl -s -u legal_admin:123456 http://localhost:15672/api/queues | jq ".[] | {name: .name, messages: .messages}"'
```

---

## 📚 References

- [RabbitMQ Documentation](https://www.rabbitmq.com/documentation.html)
- [Protocol Buffers Guide](https://protobuf.dev/)
- [amqplib npm package](https://www.npmjs.com/package/amqplib)
- [RabbitMQ Management UI](https://www.rabbitmq.com/management.html)

---

**Created**: 2025-11-02
**Status**: ✅ Production Ready
**Components**: RabbitMQ + Protobuf + QUIC + TensorRT
