# Service API Wiring Audit Checklist

**Purpose**: Verify Go microservice endpoints, RabbitMQ queues, Redis keys, and Qdrant collections are correctly wired after XState v5 migration.

**Date**: January 9, 2026
**Status**: 🔴 Not Started

---

## 🎯 Overview

XState machines invoke services that connect to:
1. **Go Microservices** (HTTP/3 QUIC, HTTP/2)
2. **RabbitMQ** (Message queues)
3. **Redis** (Cache layer)
4. **Qdrant** (Vector search)
5. **PostgreSQL** (Drizzle ORM)

After the XState v5 migration, we need to verify:
- ✅ Service client imports are correct
- ✅ Request/response schemas match
- ✅ Error handling works (XState v5 `onError` handlers)
- ✅ Async actors return correct shapes

---

## 📁 Files to Audit

### 1. Service Client Implementations

**Primary Clients**:
- [ ] `src/lib/services/goServiceClient.ts` - Legacy Go service HTTP client
- [ ] `src/lib/services/production-service-client.ts` - Production Go services (HTTP/3 QUIC)
- [ ] `src/lib/api/production-service-client.ts` - Alternative location?
- [ ] `src/lib/services/enhanced-api-client.ts` - Centralized API client

**Check**:
```typescript
// Verify imports
import { goServiceClient } from '$lib/services/goServiceClient';
import productionServiceClient from '$lib/services/production-service-client';

// Verify exports
export const goServiceClient = { ... };
export default productionServiceClient;
```

---

### 2. XState Machine Service Invocations

**Files** (18 machines):
- [ ] `src/lib/machines/agentShellMachine.ts` - AI agent orchestration
- [ ] `src/lib/machines/agentShellMachine.mcp.ts` - MCP integration variant
- [ ] `src/lib/machines/chatMachine.ts` - Chat streaming
- [ ] `src/lib/machines/evidenceProcessingMachine.ts` - Document pipeline
- [ ] `src/lib/machines/crewAIOrchestrationMachine.ts` - Multi-agent workflows
- [ ] `src/lib/machines/goMicroserviceMachine.ts` - Go service connection
- [ ] `src/lib/machines/legalFormMachine.ts` - Form validation
- [ ] `src/lib/machines/workflowMachine.ts` - Legal workflow automation
- [ ] `src/lib/state/evidence-processing.svelte.ts` - Evidence state
- [ ] `src/lib/state/crewAI-state.svelte.ts` - CrewAI state
- [ ] `src/lib/integrations/rabbitmq-xstate-integration.ts` - RabbitMQ
- [ ] `src/lib/integrations/async-rabbitmq-state-manager.ts` - Async queue handling

**Pattern to Check**:
```typescript
// XState v5 fromPromise actor
import { fromPromise } from 'xstate';

const myActor = fromPromise(async ({ input }: { input: MyInput }) => {
  // ✅ Destructure input correctly
  const response = await goServiceClient.query(input.query);
  return response;  // ✅ Return correct shape
});

// In machine
invoke: {
  src: myActor,
  input: ({ context, event }) => ({  // ✅ Fixed: was ({ context: event })
    query: context.searchQuery,
    userId: context.userId
  }),
  onDone: {
    target: 'success',
    actions: assign({
      result: ({ event }) => event.output  // ✅ XState v5: event.output (was event.data)
    })
  }
}
```

---

## 🌐 Go Microservice Endpoints

**Base URL**: Check `.env.phase14` for current values

### RAG Service (Enhanced)
- [ ] `POST /api/rag/query` - Semantic search
- [ ] `POST /api/rag/embed` - Generate embeddings
- [ ] `GET /api/rag/health` - Health check

**Expected Request**:
```typescript
interface RAGRequest {
  query: string;
  userId?: string;
  caseId?: string;
  topK?: number;
}
```

**Expected Response**:
```typescript
interface RAGResponse {
  response: string;
  sources?: Array<{ content: string; score: number }>;
  embedding?: number[];
}
```

**Files Using**: `agentShellMachine.ts`, `evidenceProcessingMachine.ts`

---

### Legal Engine Service
- [ ] `POST /api/legal/analyze` - Legal document analysis
- [ ] `POST /api/legal/classify` - Document classification
- [ ] `GET /api/legal/health` - Health check

**Files Using**: `workflowMachine.ts`, `legalFormMachine.ts`

---

### Upload Service
- [ ] `POST /api/upload/file` - File upload to MinIO
- [ ] `GET /api/upload/status/{id}` - Upload status
- [ ] `DELETE /api/upload/file/{id}` - Delete file

**Expected Request**:
```typescript
interface UploadRequest {
  file: File;
  userId?: string;
  caseId?: string;
  metadata?: Record<string, any>;
}
```

**Expected Response**:
```typescript
interface UploadResponse {
  fileId: string;
  url: string;
  metadata?: Record<string, any>;
}
```

**Files Using**: `agentShellMachine.ts`, `evidenceProcessingMachine.ts`

---

## 🐰 RabbitMQ Queues

**Connection**: Check `RABBITMQ_URL` in `.env.phase14`

### Queues to Verify
- [ ] `legal_documents_queue` - Document processing
- [ ] `evidence_queue` - Evidence analysis
- [ ] `ai_tasks_queue` - AI task queueing
- [ ] `dlq_legal_documents` - Dead letter queue

**Message Schema**:
```typescript
interface QueueMessage {
  id: string;
  type: 'document_upload' | 'evidence_process' | 'ai_task';
  payload: Record<string, any>;
  userId?: string;
  timestamp: string;
}
```

**Files Using**:
- `src/lib/integrations/rabbitmq-xstate-integration.ts`
- `src/lib/integrations/async-rabbitmq-state-manager.ts`

**Check**:
1. Queue names match across services
2. Message serialization/deserialization works
3. Error handling for failed messages (DLQ routing)

---

## 💾 Redis Cache Keys

**Connection**: Check `REDIS_URL` in `.env.phase14`

### Key Patterns
- [ ] `user:{userId}:session` - User sessions
- [ ] `case:{caseId}:cache` - Case data cache
- [ ] `rag:query:{hash}` - RAG query cache
- [ ] `evidence:{evidenceId}:processed` - Evidence processing status

**Files Using**:
- `src/lib/server/cache/redis.ts`
- `src/lib/services/enhanced-api-client.ts` (cache layer)

**Check**:
1. Key expiration (TTL) set correctly
2. Cache invalidation on updates
3. Serialization matches (JSON vs binary)

---

## 🔍 Qdrant Collections

**Connection**: Check `QDRANT_URL` in `.env.phase14`

### Collections to Verify
- [ ] `phase89_code_units` - Code unit embeddings
- [ ] `phase72_ast_knowledge_base` - AST knowledge
- [ ] `legal_documents` - Legal document vectors
- [ ] `evidence_embeddings` - Evidence embeddings

**Schema**:
```typescript
interface QdrantPoint {
  id: string | number;
  vector: number[];  // 768 or 1024 dimensions
  payload: {
    text: string;
    metadata?: Record<string, any>;
  };
}
```

**Files Using**:
- `src/lib/server/vector/qdrant.ts`
- `src/lib/machines/evidenceProcessingMachine.ts`

**Check**:
1. Collection names match
2. Vector dimensions match model (e.g., 768 for BERT, 1024 for gemma3-legal)
3. Search filters work correctly

---

## 🗄️ PostgreSQL (Drizzle ORM)

**Connection**: Check `DATABASE_URL` in `.env.phase14`

### Tables to Verify
- [ ] `users` - User accounts
- [ ] `cases` - Legal cases
- [ ] `evidence` - Evidence records
- [ ] `documents` - Document metadata

**Files Using**:
- `src/lib/server/db/drizzle.ts`
- `src/lib/server/db/schema-postgres.ts`

**Check**:
1. Table schemas match migrations
2. Foreign key constraints valid
3. Vector extension enabled (`pgvector`)

---

## ✅ Testing Checklist

### 1. Manual API Tests

**RAG Query**:
```bash
curl -X POST http://localhost:8081/api/rag/query \
  -H "Content-Type: application/json" \
  -d '{"query":"What is a tort?","userId":"test-user"}'
```

**Expected**: `{ "response": "...", "sources": [...] }`

---

**File Upload**:
```bash
curl -X POST http://localhost:8082/api/upload/file \
  -F "file=@test.pdf" \
  -F "userId=test-user"
```

**Expected**: `{ "fileId": "...", "url": "..." }`

---

### 2. XState Machine Tests

**Test Pattern**:
```typescript
// In src/lib/__tests__/machines/agentShellMachine.test.ts
import { createActor } from 'xstate';
import { agentShellMachine, agentShellServices } from '../machines/agentShellMachine';

test('agentShellMachine calls RAG service', async () => {
  const actor = createActor(agentShellMachine, {
    implementations: agentShellServices
  });

  actor.start();
  actor.send({ type: 'SEMANTIC_SEARCH', query: 'test query', userId: 'test-user' });

  await waitFor(actor, (state) => state.matches('idle'));

  expect(actor.getSnapshot().context.searchResults).toBeDefined();
});
```

---

### 3. Integration Tests

**RabbitMQ**:
```typescript
// Publish message
await rabbitmqClient.publish('legal_documents_queue', {
  id: 'test-1',
  type: 'document_upload',
  payload: { documentId: '123' }
});

// Verify consumed
await waitForQueueEmpty('legal_documents_queue');
```

**Redis**:
```typescript
// Set cache
await redisClient.set('test:key', JSON.stringify({ data: 'test' }));

// Get cache
const cached = await redisClient.get('test:key');
expect(JSON.parse(cached)).toEqual({ data: 'test' });
```

**Qdrant**:
```typescript
// Search
const results = await qdrantClient.search('legal_documents', {
  vector: testEmbedding,
  limit: 5
});

expect(results.length).toBeGreaterThan(0);
```

---

## 🚨 Known Issues to Check

### 1. HTTP/3 QUIC Fallback
**Issue**: Production service client uses HTTP/3 QUIC, may need HTTP/2 fallback

**Check**:
```typescript
// In production-service-client.ts
try {
  response = await fetch(url, { version: 'h3' });  // HTTP/3
} catch (error) {
  console.warn('HTTP/3 failed, falling back to HTTP/2');
  response = await fetch(url);  // HTTP/2
}
```

### 2. XState v5 Actor Return Types
**Issue**: `fromPromise` actors must return consistent shapes

**Fix**:
```typescript
// ❌ Bad: Inconsistent return
const actor = fromPromise(async ({ input }) => {
  if (error) return null;  // Inconsistent
  return { data: '...' };
});

// ✅ Good: Consistent return
const actor = fromPromise(async ({ input }): Promise<MyResult> => {
  if (error) throw new Error('...');  // Let onError handle
  return { data: '...' };
});
```

### 3. RabbitMQ Message Serialization
**Issue**: Binary data (Files) may not serialize correctly

**Check**:
```typescript
// For file uploads, use MinIO directly, not RabbitMQ
await uploadToMinIO(file);
await rabbitmqClient.publish('evidence_queue', {
  fileUrl: minioUrl,  // Reference, not file data
  metadata: { ... }
});
```

---

## 📋 Summary

**Total Items**: 45 checks across 5 service types
**Status**: 🔴 **0/45 Complete**

**Next Steps**:
1. Run manual API tests for each Go service
2. Verify RabbitMQ queue names and message schemas
3. Check Redis key patterns and TTLs
4. Validate Qdrant collection names and dimensions
5. Test XState machines end-to-end with real services

**Estimated Time**: 2-4 hours

**Last Updated**: January 9, 2026
