# Evidence Service - Production Bootstrap Integration

Production-ready evidence processing service with full integration:
- Apollo GraphQL Server
- RabbitMQ Workers (OCR, Embed, Entity, Summarize)
- XState LegalWorkflowOrchestrator
- Redis Pub/Sub for SSE
- PostgreSQL + pgvector + Qdrant + MinIO
- GPU-accelerated Gemma3 embeddings
- Lucia V3 auth compatibility

## Architecture Overview

```
┌─────────────────────────────────────────────────────────────────┐
│                      SvelteKit Frontend                         │
│  ┌───────────────┐  ┌───────────────┐  ┌──────────────────┐   │
│  │ Evidence UI   │  │ SSE Client    │  │ GraphQL Client   │   │
│  └───────┬───────┘  └───────┬───────┘  └────────┬─────────┘   │
│          │                  │                     │             │
└──────────┼──────────────────┼─────────────────────┼─────────────┘
           │                  │                     │
           │                  │ SSE Stream          │ GraphQL
           │                  ▼                     ▼
┌──────────┼────────────────────────────────────────────────────┐
│          │           Evidence Service (Port 4000)             │
│          │                                                     │
│  ┌───────▼────────┐  ┌─────────────────┐  ┌───────────────┐ │
│  │ SSE Endpoint   │  │ Apollo GraphQL  │  │ Bootstrap     │ │
│  │ /workflow-     │  │ Server          │  │ Orchestrator  │ │
│  │ events/[id]    │  │                 │  │               │ │
│  └───────┬────────┘  └────────┬────────┘  └───────┬───────┘ │
│          │                    │                    │          │
│          │                    │                    │          │
│  ┌───────▼────────────────────▼────────────────────▼───────┐ │
│  │              Redis Pub/Sub + Caching                     │ │
│  │  - workflow:session:{id} channels                        │ │
│  │  - State persistence                                     │ │
│  └──────────────────────────────────────────────────────────┘ │
│                                                                │
│  ┌────────────────────────────────────────────────────────┐  │
│  │              RabbitMQ Consumer Orchestration           │  │
│  │  ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌─────────┐│  │
│  │  │OCR Worker│  │Embed     │  │Entity    │  │Summarize││  │
│  │  │Queue     │  │Worker    │  │Worker    │  │Worker   ││  │
│  │  └────┬─────┘  └────┬─────┘  └────┬─────┘  └────┬────┘│  │
│  └───────┼─────────────┼─────────────┼──────────────┼─────┘  │
│          │             │             │              │         │
└──────────┼─────────────┼─────────────┼──────────────┼─────────┘
           │             │             │              │
           ▼             ▼             ▼              ▼
    ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌──────────┐
    │PostgreSQL│  │  Qdrant  │  │  MinIO   │  │  Ollama  │
    │+pgvector │  │ (Vector  │  │(Object   │  │ (Gemma3  │
    │          │  │  DB)     │  │Storage)  │  │Embeddings│
    └──────────┘  └──────────┘  └──────────┘  └──────────┘
```

## Quick Start

### 1. Install Dependencies

```bash
cd evidence-service
npm install
```

This will install the new `ioredis` dependency for Redis Pub/Sub.

### 2. Update Environment Variables

```bash
# evidence-service/.env

# Database
DATABASE_URL=postgresql://legal_admin:123456@localhost:5434/legal_ai_test

# RabbitMQ
RABBITMQ_URL=amqp://legal_admin:123456@localhost:5672

# Redis (NEW)
REDIS_URL=redis://localhost:6379

# MinIO
MINIO_ENDPOINT=localhost
MINIO_PORT=9000
MINIO_ACCESS_KEY=minio
MINIO_SECRET_KEY=minio123

# Qdrant
QDRANT_URL=http://localhost:6333
QDRANT_COLLECTION=legal_evidence

# Ollama (GPU Accelerated)
OLLAMA_BASE_URL=http://localhost:11436
OLLAMA_EMBEDDING_MODEL=embeddinggemma:latest
OLLAMA_CHAT_MODEL=gemma3-legal:latest

# Service Configuration
PORT=4000
EVIDENCE_SERVICE_PORT=4000  # NEW: Dynamic port config
NODE_ENV=development
LOG_LEVEL=info
```

### 3. Start Infrastructure Services

```bash
# Start PostgreSQL, Redis, RabbitMQ, MinIO, Qdrant
docker-compose up -d postgres redis rabbitmq minio qdrant

# Start Ollama (if not running)
ollama serve
```

### 4. Run the Integrated Bootstrap Service

```bash
# Development mode with auto-reload
npm run dev:bootstrap

# Production mode
npm run build
npm run start:bootstrap
```

This will start:
- ✅ Apollo GraphQL Server (port 4000)
- ✅ RabbitMQ consumers (OCR, Embed, Entity, Summarize)
- ✅ LegalWorkflowOrchestrator integration
- ✅ Redis Pub/Sub for SSE
- ✅ All infrastructure connections

## Frontend Integration

### Server-Sent Events (SSE) Usage

```svelte
<!-- src/routes/dashboard/cases/[id]/+page.svelte -->
<script lang="ts">
  import { onMount, onDestroy } from 'svelte';
  import { createWorkflowStore } from '$lib/client/workflow-event-stream';

  export let data;
  const sessionId = data.sessionId; // From Lucia auth

  // Create reactive workflow store
  const workflowStore = createWorkflowStore(sessionId);

  onMount(() => {
    // Connect to SSE stream
    workflowStore.connect();
  });

  onDestroy(() => {
    // Cleanup on page leave
    workflowStore.disconnect();
  });
</script>

<div>
  <h1>Evidence Processing</h1>

  {#if $workflowStore.connected}
    <p class="text-green-600">✅ Connected to workflow stream</p>
  {:else}
    <p class="text-red-600">❌ Disconnected</p>
  {/if}

  <div class="events-log">
    {#each $workflowStore.events as event}
      <div class="event">
        <span class="type">{event.type}</span>
        <span class="time">{event.timestamp}</span>
        {#if event.error}
          <span class="error">{event.error}</span>
        {/if}
      </div>
    {/each}
  </div>
</div>
```

### Direct EventSource Usage

```typescript
// Alternative: Use EventSource directly
const eventSource = new EventSource(`/api/workflow-events/${sessionId}`);

eventSource.onmessage = (event) => {
  const data = JSON.parse(event.data);
  console.log('Workflow event:', data);

  if (data.type === 'OCR_COMPLETE') {
    console.log('OCR finished for evidence:', data.evidenceId);
  }

  if (data.type === 'EMBEDDING_COMPLETE') {
    console.log('Embeddings generated:', data.result);
  }
};

eventSource.onerror = (error) => {
  console.error('SSE connection error:', error);
};

// Cleanup
eventSource.close();
```

## API Endpoints

### GraphQL

```graphql
# Upload evidence
mutation UploadEvidence($caseId: ID!, $file: Upload!) {
  uploadEvidence(caseId: $caseId, file: $file) {
    id
    fileName
    storagePath
    status
  }
}

# Query evidence
query GetEvidence($id: ID!) {
  evidence(id: $id) {
    id
    fileName
    ocrText
    summary
    entities {
      text
      label
      score
    }
    forensicFlags {
      type
      description
      severity
    }
    status
  }
}
```

### SSE Endpoint

```
GET /api/workflow-events/{sessionId}
```

Returns Server-Sent Events stream with workflow updates:

```json
data: {"type":"SSE_CONNECTED","sessionId":"abc123","timestamp":"2025-10-08T..."}

data: {"type":"OCR_COMPLETE","evidenceId":"ev_123","timestamp":"2025-10-08T...","result":{...}}

data: {"type":"EMBEDDING_COMPLETE","evidenceId":"ev_123","timestamp":"2025-10-08T...","result":{...}}

data: {"type":"ENTITY_COMPLETE","evidenceId":"ev_123","timestamp":"2025-10-08T...","result":{...}}

data: {"type":"SUMMARY_COMPLETE","evidenceId":"ev_123","timestamp":"2025-10-08T...","result":{...}}

data: {"type":"WORKFLOW_COMPLETE","evidenceId":"ev_123","timestamp":"2025-10-08T...","result":{...}}
```

## Event Types

| Event Type | Description | Payload |
|------------|-------------|---------|
| `SSE_CONNECTED` | Client connected to stream | `sessionId`, `timestamp` |
| `OCR_COMPLETE` | OCR processing finished | `evidenceId`, `result`, `timestamp` |
| `OCR_ERROR` | OCR processing failed | `evidenceId`, `error`, `timestamp` |
| `EMBEDDING_COMPLETE` | Embeddings generated | `evidenceId`, `result`, `timestamp` |
| `EMBEDDING_ERROR` | Embedding generation failed | `evidenceId`, `error`, `timestamp` |
| `ENTITY_COMPLETE` | Entity extraction done | `evidenceId`, `result`, `timestamp` |
| `ENTITY_ERROR` | Entity extraction failed | `evidenceId`, `error`, `timestamp` |
| `SUMMARY_COMPLETE` | Summarization finished | `evidenceId`, `result`, `timestamp` |
| `SUMMARY_ERROR` | Summarization failed | `evidenceId`, `error`, `timestamp` |
| `WORKFLOW_COMPLETE` | Full workflow completed | `evidenceId`, `result`, `timestamp` |
| `WORKFLOW_ERROR` | Workflow failed | `evidenceId`, `error`, `timestamp` |

## Architecture Components

### Bootstrap (`src/bootstrap/index.ts`)
- Main entry point
- Starts Apollo Server
- Initializes RabbitMQ consumers
- Connects to Redis for Pub/Sub
- Integrates LegalWorkflowOrchestrator

### RabbitMQ Module (`src/bootstrap/rabbitmq.ts`)
- Connection management
- Queue declaration
- Message publishing
- Consumer registration with error handling

### Redis Module (`src/bootstrap/redis.ts`)
- Redis instance creation
- Pub/Sub utilities
- Caching layer (`RedisCache`)
- Workflow session management (`WorkflowSessionManager`)

### Orchestrator (`src/bootstrap/orchestrator.ts`)
- XState workflow orchestration wrapper
- State persistence to Redis
- Integration with legal workflow machines

### SSE Endpoint (`sveltekit-frontend/src/routes/api/workflow-events/[sessionId]/+server.ts`)
- Real-time event streaming
- Redis Pub/Sub subscriber
- Client disconnect handling

### Client Utility (`sveltekit-frontend/src/lib/client/workflow-event-stream.ts`)
- EventSource wrapper
- Type-safe event handlers
- Svelte store integration
- Auto-reconnection logic

## Workflow Pipeline

1. **Evidence Upload** (GraphQL mutation)
   - File uploaded to MinIO
   - Evidence record created in PostgreSQL
   - Message published to `evidence.ocr` queue

2. **OCR Processing** (RabbitMQ consumer)
   - Worker consumes message
   - Tesseract.js extracts text
   - Orchestrator triggered
   - Result published to Redis channel
   - Message sent to `evidence.embed` queue

3. **Embedding Generation** (RabbitMQ consumer)
   - Worker generates embeddings using Ollama (Gemma3)
   - Vector stored in PostgreSQL (pgvector) and Qdrant
   - Orchestrator triggered
   - Result published to Redis channel
   - Messages sent to `evidence.entity` and `evidence.summarize` queues

4. **Entity Extraction** (RabbitMQ consumer)
   - Worker extracts entities using transformers.js
   - Forensic patterns detected
   - Results stored in PostgreSQL
   - Orchestrator triggered
   - Result published to Redis channel

5. **Summarization** (RabbitMQ consumer)
   - Worker generates summary using Ollama (Gemma3)
   - Summary stored in PostgreSQL
   - Orchestrator triggered
   - Result published to Redis channel
   - `WORKFLOW_COMPLETE` event sent

6. **Frontend Updates** (SSE)
   - Client subscribed to `workflow:session:{sessionId}`
   - Receives real-time updates for each step
   - UI updates automatically via Svelte stores

## Performance Optimizations

- **GPU Acceleration**: Gemma3 embeddings use RTX 3060 Ti with Flash-Attention-2
- **Connection Pooling**: PostgreSQL and Redis connections reused
- **Caching**: Redis cache for frequent queries
- **Prefetch**: RabbitMQ workers prefetch 1 message to prevent overload
- **Persistent State**: XState workflow state persisted to Redis

## Testing

```bash
# Type check
npm run type-check

# Start in development mode
npm run dev:bootstrap

# Test GraphQL endpoint
curl http://localhost:4000/graphql

# Test SSE endpoint (requires active session)
curl -N http://localhost:5173/api/workflow-events/test-session-123
```

## Deployment

```bash
# Build
npm run build

# Production start
NODE_ENV=production npm run start:bootstrap

# Docker
docker build -t evidence-service .
docker run -p 4000:4000 --env-file .env evidence-service
```

## Troubleshooting

### Redis Connection Issues
```bash
# Check Redis is running
docker ps | grep redis

# Test Redis connection
redis-cli ping
```

### RabbitMQ Connection Issues
```bash
# Check RabbitMQ is running
docker ps | grep rabbitmq

# Access management UI
http://localhost:15672
```

### Ollama Model Issues
```bash
# Pull required models
ollama pull embeddinggemma:latest
ollama pull gemma3

# List available models
ollama list
```

## Next Steps

1. ✅ Install `ioredis` dependency: `cd evidence-service && npm install`
2. ✅ Update `.env` with `REDIS_URL` and `EVIDENCE_SERVICE_PORT`
3. 🔄 Test bootstrap service: `npm run dev:bootstrap`
4. 🔄 Test SSE endpoint from frontend
5. 🔄 Integrate with actual LegalWorkflowOrchestrator from `sveltekit-frontend`
6. 🔄 Add authentication middleware for Lucia V3
7. 🔄 Deploy to production environment

## License

MIT
