# 🔄 App-Wide Production Services Migration Guide

## Overview

This guide shows how to replace mock implementations with **production-ready service integrations** across all API endpoints in your Legal AI platform.

## Quick Start

### 1. Import Centralized Services

```typescript
// ❌ OLD - Using mocks or incomplete integrations
import { mockRedis } from '$lib/mocks';

// ✅ NEW - Import production services
import { services, generateEmbedding, searchSimilarDocuments } from '$lib/server/services';
```

### 2. Common Patterns

#### Pattern 1: Generate Embeddings

```typescript
// ❌ OLD - Mock/stub embeddings
const embedding = Array(768).fill(0);

// ✅ NEW - Real Ollama embeddings with caching
import { generateEmbedding } from '$lib/server/services';
const embedding = await generateEmbedding(text, `doc:${documentId}`);
```

#### Pattern 2: Vector Search

```typescript
// ❌ OLD - Mock search results
const results = mockData.filter(/* ... */);

// ✅ NEW - Real Qdrant + pgvector hybrid search
import { searchSimilarDocuments } from '$lib/server/services';
const results = await searchSimilarDocuments(query, 10);
```

#### Pattern 3: File Upload

```typescript
// ❌ OLD - No actual file storage
// Just save metadata

// ✅ NEW - Real MinIO object storage
import { uploadFile } from '$lib/server/services';
const { etag } = await uploadFile('legal-evidence', `${evidenceId}/file.pdf`, fileBuffer, 'application/pdf');
```

#### Pattern 4: Caching

```typescript
// ❌ OLD - No caching or in-memory only
const cache = new Map();

// ✅ NEW - Redis caching with TTL
import { services } from '$lib/server/services';
await services.redis.setex('key', 3600, JSON.stringify(data));
const cached = await services.redis.get('key');
```

#### Pattern 5: Job Queuing

```typescript
// ❌ OLD - Synchronous processing
await processOCR(file);

// ✅ NEW - RabbitMQ async job queue
import { publishJob } from '$lib/server/services';
await publishJob('ocr-processing', { evidenceId, fileUrl });
```

## API Endpoint Migration Examples

### Example 1: `/api/evidence/process`

**Before:**
```typescript
export const POST: RequestHandler = async ({ request }) => {
  const { evidenceId, content } = await request.json();

  // Mock embedding
  const embedding = Array(768).fill(0);

  // No actual storage
  return json({ success: true });
};
```

**After:**
```typescript
import { generateEmbedding, indexDocument, publishJob } from '$lib/server/services';

export const POST: RequestHandler = async ({ request }) => {
  const { evidenceId, content } = await request.json();

  // Real Ollama embedding
  const embedding = await generateEmbedding(content, evidenceId);

  // Index in Qdrant + PostgreSQL
  await indexDocument({
    id: evidenceId,
    content,
    title: `Evidence ${evidenceId}`,
    metadata: { type: 'evidence' }
  });

  // Queue OCR job
  await publishJob('ocr-processing', { evidenceId });

  return json({ success: true, embedding: embedding.length });
};
```

### Example 2: `/api/chat`

**Before:**
```typescript
export const POST: RequestHandler = async ({ request }) => {
  const { messages } = await request.json();

  // Mock response
  const response = "Mock AI response";

  return json({ response });
};
```

**After:**
```typescript
import { services } from '$lib/server/services';

export const POST: RequestHandler = async ({ request }) => {
  const { messages } = await request.json();

  // Real Ollama chat (gemma3:legal-latest)
  const response = await services.ollama.chat?.(messages, {
    model: services.env.ollamaConfig.chatModel,
    stream: false
  });

  return json({ response });
};
```

### Example 3: `/api/v1/embeddings`

**Before:**
```typescript
export const POST: RequestHandler = async ({ request }) => {
  const { text } = await request.json();

  // Stub embedding
  const embedding = Array(768).fill(0.1);

  return json({ embedding });
};
```

**After:**
```typescript
import { generateEmbedding, services } from '$lib/server/services';

export const POST: RequestHandler = async ({ request }) => {
  const { text } = await request.json();

  // Real embedding with Redis caching
  const embedding = await generateEmbedding(text, undefined);

  return json({
    embedding,
    model: services.env.ollamaConfig.embeddingModel,
    dimensions: embedding.length
  });
};
```

### Example 4: `/api/search/legal`

**Before:**
```typescript
export const POST: RequestHandler = async ({ request }) => {
  const { query } = await request.json();

  // Mock search
  const results = mockLegalDocuments.filter(doc =>
    doc.title.includes(query)
  );

  return json({ results });
};
```

**After:**
```typescript
import { searchSimilarDocuments, generateEmbedding } from '$lib/server/services';

export const POST: RequestHandler = async ({ request }) => {
  const { query, limit = 10 } = await request.json();

  // Real vector similarity search
  const results = await searchSimilarDocuments(query, limit);

  return json({
    results: results.map(r => ({
      id: r.id,
      score: r.score || r.similarity,
      title: r.payload?.title,
      excerpt: r.payload?.content?.substring(0, 200)
    })),
    total: results.length
  });
};
```

### Example 5: `/api/documents/upload`

**Before:**
```typescript
export const POST: RequestHandler = async ({ request }) => {
  const form = await request.formData();
  const file = form.get('file') as File;

  // No actual storage
  const fileId = randomUUID();

  return json({ fileId });
};
```

**After:**
```typescript
import { uploadFile, indexDocument, generateEmbedding } from '$lib/server/services';

export const POST: RequestHandler = async ({ request }) => {
  const form = await request.formData();
  const file = form.get('file') as File;

  const fileId = randomUUID();
  const buffer = Buffer.from(await file.arrayBuffer());

  // Upload to MinIO
  const { etag } = await uploadFile(
    'legal-documents',
    `${fileId}/${file.name}`,
    buffer,
    file.type
  );

  // Extract text (simplified - use OCR for PDFs/images)
  const text = await file.text();

  // Generate embedding and index
  const embedding = await generateEmbedding(text, fileId);
  await indexDocument({
    id: fileId,
    content: text,
    title: file.name,
    metadata: {
      type: 'document',
      mimeType: file.type,
      size: file.size,
      etag
    }
  });

  return json({
    fileId,
    fileName: file.name,
    size: file.size,
    etag,
    indexed: true
  });
};
```

## Service Reference

### Available Services

| Service | Import | Use Case |
|---------|--------|----------|
| **Ollama** | `services.ollama` | AI embeddings & chat |
| **Redis** | `services.redis` | Caching, sessions |
| **Qdrant** | `services.qdrant` | Fast vector search |
| **PostgreSQL** | `services.pgvector` | Persistent storage |
| **MinIO** | `services.minio` | File storage |
| **Neo4j** | `services.neo4j` | Graph queries |
| **RabbitMQ** | `services.rabbitmq` | Job queueing |

### Helper Functions

```typescript
import {
  // Core services
  services,

  // Helpers
  generateEmbedding,        // Generate & cache embeddings
  searchSimilarDocuments,   // Hybrid vector search
  indexDocument,            // Index in Qdrant + pgvector
  uploadFile,               // Upload to MinIO
  downloadFile,             // Download from MinIO
  publishJob,               // Queue RabbitMQ job
  queryGraph,               // Neo4j graph query
  getServicesHealth         // Health check all services
} from '$lib/server/services';
```

## Migration Checklist

For each API endpoint that needs migration:

- [ ] **Identify mock/stub implementations**
  - Search for `Mock`, `TODO`, `FIXME`, `placeholder`
  - Look for hardcoded data or stub responses

- [ ] **Replace with production services**
  - Import from `$lib/server/services`
  - Use helper functions when available
  - Add error handling

- [ ] **Add caching (if appropriate)**
  - Cache expensive operations (embeddings, API calls)
  - Use Redis with reasonable TTL
  - Cache key format: `{type}:{id}`

- [ ] **Queue long-running tasks**
  - OCR processing → `ocr-processing` queue
  - Embeddings → `embedding-generation` queue
  - Entity extraction → `entity-extraction` queue

- [ ] **Add health checks**
  - Check service availability
  - Provide fallback behavior
  - Log errors for monitoring

- [ ] **Update tests**
  - Test with real services (integration tests)
  - Mock services for unit tests
  - Add performance benchmarks

## Common Gotchas

### 1. Async Operations

**Problem:**
```typescript
// ❌ Synchronous mock
const result = mockService.process(data);
```

**Solution:**
```typescript
// ✅ Async production service
const result = await services.ollama.embed(data);
```

### 2. Error Handling

**Problem:**
```typescript
// ❌ No error handling
await services.redis.setex('key', 3600, 'value');
```

**Solution:**
```typescript
// ✅ Graceful fallback
try {
  await services.redis.setex('key', 3600, 'value');
} catch (error) {
  console.warn('Redis cache failed:', error);
  // Continue without cache
}
```

### 3. Service Availability

**Problem:**
```typescript
// ❌ Assumes service is always available
const embedding = await services.ollama.embed(text);
```

**Solution:**
```typescript
// ✅ Check health and provide fallback
try {
  const embedding = await services.ollama.embed(text, {
    model: services.env.ollamaConfig.embeddingModel
  });
} catch (error) {
  console.error('Ollama unavailable:', error);
  return json({ error: 'AI service unavailable' }, { status: 503 });
}
```

### 4. Connection Pooling

**Problem:**
```typescript
// ❌ Creating new connection every time
const Redis = require('ioredis');
const redis = new Redis();
```

**Solution:**
```typescript
// ✅ Use singleton from services factory
import { services } from '$lib/server/services';
await services.redis.get('key'); // Uses connection pool
```

## Testing

### Health Check All Services

```bash
curl http://localhost:5173/api/health/services
```

### Test Individual Endpoint

```bash
# Evidence processing
curl -X POST http://localhost:5173/api/evidence/process \
  -H "Content-Type: application/json" \
  -d '{"evidenceId":"test-123","content":"Test evidence content","steps":["embedding","indexing","similarity"]}'

# Embeddings
curl -X POST http://localhost:5173/api/v1/embeddings \
  -H "Content-Type: application/json" \
  -d '{"text":"legal document text"}'

# Search
curl -X POST http://localhost:5173/api/search/legal \
  -H "Content-Type: application/json" \
  -d '{"query":"employment contract termination","limit":10}'
```

## Performance Tips

1. **Cache expensive operations**
   - Embeddings: 50-100ms → <1ms with cache
   - Vector search: 10-20ms → 2-5ms with Qdrant

2. **Use batch processing**
   ```typescript
   // Process multiple items in parallel
   const embeddings = await Promise.all(
     texts.map(text => generateEmbedding(text))
   );
   ```

3. **Queue long-running tasks**
   - OCR: ~1-5 seconds per page
   - Use RabbitMQ for async processing
   - Return immediately with job ID

4. **Monitor service health**
   - Set up alerts for service failures
   - Log response times
   - Track cache hit rates

## Next Steps

1. **Migrate high-traffic endpoints first**
   - `/api/chat`
   - `/api/search/*`
   - `/api/evidence/process`

2. **Add monitoring**
   - Response time tracking
   - Error rate monitoring
   - Cache hit rate analysis

3. **Optimize performance**
   - Add caching where beneficial
   - Use batch operations
   - Implement request queueing

4. **Document changes**
   - Update API documentation
   - Add code comments
   - Create runbooks for ops

## Support

- **Documentation**: `PRODUCTION_SERVICES_INTEGRATION.md`
- **Service Factory**: `src/lib/server/services.ts`
- **Adapters**: `src/lib/server/adapters/service-integrations.ts`
- **Health Check**: `http://localhost:5173/api/health/services`

---

**Status**: ✅ Centralized services ready for app-wide deployment
**Updated**: 2025-01-16
**Version**: 2.0.0
