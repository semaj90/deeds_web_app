# 🤖 AI/Chat/RAG Endpoint Migration Status

**Last Updated**: 2025-01-23
**Total Endpoints Found**: 755 API endpoints
**AI-Related Endpoints**: ~150 (chat, RAG, embeddings, ollama)

## 📊 Migration Priority Matrix

### ✅ MIGRATED - Production Ready (2 endpoints)

| Endpoint | Status | Services Used | Notes |
|----------|--------|---------------|-------|
| `/api/ai/chat-mock` | ✅ Complete | Ollama (generateChatResponse) | Uses centralized services, Redis caching |
| `/api/evidence/process` | ✅ Complete | Ollama, Qdrant, pgvector, Redis, RabbitMQ | Real embeddings + vector indexing |
| `/api/health/services` | ✅ Complete | All 7 services | Health check endpoint |

---

## 🔴 HIGH PRIORITY - Migrate Next (10 endpoints)

These are the most frequently used endpoints that should be migrated immediately:

### 1. `/api/chat/+server.ts`
**Current**: Hardcoded CUDA server URL (`http://localhost:8096`)
**Needs**:
- Replace with centralized `generateChatResponse()` from `$lib/server/services`
- Remove hardcoded URLs (CUDA_SERVER_URL, TRITON_SERVER_URL, OLLAMA_GENERATE_ENDPOINT)
- Use `services.env.ollamaConfig.chatModel` for model selection

**Code Pattern**:
```typescript
// ❌ OLD
const OLLAMA_GENERATE_ENDPOINT = getOllamaEndpoint('generate');

// ✅ NEW
import { services, generateChatResponse } from '$lib/server/services';
const response = await generateChatResponse(messages, stream);
```

---

### 2. `/api/rag/enhanced/+server.ts`
**Current**: Uses LangChain + pgvector search
**Needs**:
- Integrate with centralized `searchSimilarDocuments()` helper
- Use `generateEmbedding()` for query embeddings
- Leverage hybrid Qdrant + pgvector search

**Code Pattern**:
```typescript
// ❌ OLD - Manual semantic search
const results = await db.query(/* custom pgvector query */);

// ✅ NEW - Centralized hybrid search
import { searchSimilarDocuments } from '$lib/server/services';
const results = await searchSimilarDocuments(query, limit);
```

---

### 3. `/api/v1/embeddings/+server.ts`
**Current**: Uses `generateEmbedding` from `$lib/server/services/embedding-service`
**Status**: ✅ **ALREADY MIGRATED** - Uses centralized embedding service
**Note**: This endpoint is production-ready! It uses:
- `generateEmbedding()` for single text
- `generateEmbeddings()` for batch processing
- Model: `embeddinggemma:latest` (default)

**No action needed** ✅

---

### 4. `/api/rag/+server.ts`
**Current**: Unknown - needs investigation
**Needs**:
- Audit current implementation
- Migrate to centralized RAG pipeline
- Use `searchSimilarDocuments()` + `generateEmbedding()`

---

### 5. `/api/ai/rag/+server.ts`
**Current**: Unknown - needs investigation
**Needs**: Similar to `/api/rag/+server.ts`

---

### 6. `/api/ollama/generate/+server.ts`
**Current**: Direct Ollama integration
**Needs**:
- Use centralized `generateChatResponse()` or `ollama.generateText()`
- Remove hardcoded Ollama URLs
- Use `services.env.ollamaConfig.baseUrl`

---

### 7. `/api/embeddings/ollama/+server.ts`
**Current**: Direct Ollama embeddings
**Needs**:
- Use centralized `generateEmbedding()` helper
- Leverage Redis caching (24-hour TTL)
- Remove hardcoded Ollama endpoints

**Code Pattern**:
```typescript
// ❌ OLD
const response = await fetch('http://localhost:11434/api/embeddings', {
  method: 'POST',
  body: JSON.stringify({ model: 'embeddinggemma:latest', prompt: text })
});

// ✅ NEW
import { generateEmbedding } from '$lib/server/services';
const embedding = await generateEmbedding(text, `doc:${id}`); // Auto-cached
```

---

### 8. `/api/search/semantic/+server.ts`
**Current**: Manual semantic search implementation
**Needs**:
- Use `searchSimilarDocuments()` for hybrid Qdrant + pgvector search
- Use `generateEmbedding()` for query embeddings
- Remove manual vector search logic

---

### 9. `/api/chat-simple/+server.ts`
**Current**: Unknown - needs investigation
**Needs**: Same pattern as `/api/chat/+server.ts`

---

### 10. `/api/chat-anonymous/+server.ts`
**Current**: Unknown - needs investigation
**Needs**: Same pattern as `/api/chat/+server.ts`

---

## 🟡 MEDIUM PRIORITY (20 endpoints)

### RAG-Related Endpoints
- `/api/rag/process/+server.ts`
- `/api/rag/upload/+server.ts`
- `/api/rag/sync/+server.ts`
- `/api/rag/hybrid-pipeline/+server.ts`
- `/api/rag/enhanced-process/+server.ts`

### AI Processing Endpoints
- `/api/ai/+server.ts`
- `/api/ai/ingest/+server.ts`
- `/api/ai/stream/+server.ts`
- `/api/ai/ask/+server.ts`
- `/api/ai/rerank/+server.ts`
- `/api/ai/cluster/stream/+server.ts`
- `/api/ai-pipeline/+server.ts`
- `/api/ai-boilerplate/+server.ts`

### Embedding Endpoints
- `/api/embeddings/generate/+server.ts`
- `/api/embeddings/webgpu/+server.ts`
- `/api/embeddings/ollama/health/+server.ts`
- `/api/v1/vector/embeddings/+server.ts`
- `/api/v1/vector/chunk/+server.ts`

### Search Endpoints
- `/api/search/legal/+server.ts`
- `/api/search/vector/+server.ts`

---

## 🟢 LOW PRIORITY (100+ endpoints)

These endpoints are either:
- Test endpoints (`/api/test/*`)
- Deprecated (`DEPRECATED.+server.ts`)
- Specialized features (clustering, OCR, GPU-specific)
- Admin/monitoring endpoints

### Test Endpoints (Low Priority)
- `/api/test/ollama-embed/+server.ts`
- `/api/test/embeddings/+server.ts`
- `/api/test-ai-integration/+server.ts`
- `/api/test/document-pipeline/+server.ts`
- `/api/test-vector-pipeline/+server.ts`

### Deprecated Endpoints (Archive)
- `/api/ai/process-evidence/DEPRECATED.+server.ts`
- `/api/ai/evidence-search/DEPRECATED.+server.ts`
- `/api/v1/evidence/DEPRECATED.+server.ts`
- `/api/search/evidence/DEPRECATED.+server.ts`

### Specialized Endpoints (Migrate as needed)
- `/api/ollama/cluster/+server.ts`
- `/api/ollama/comprehensive-summary/+server.ts`
- `/api/gpu/hybrid/+server.ts`
- `/api/gpu/validate-setup/+server.ts`
- `/api/contextual/chat/+server.ts`
- `/api/yorha/chat/+server.ts`

---

## 📋 Migration Checklist

For each endpoint migration:

### Before Migration
- [ ] Read current implementation
- [ ] Identify hardcoded URLs (Ollama, CUDA, Qdrant, etc.)
- [ ] Identify mock/stub implementations
- [ ] Document current behavior

### During Migration
- [ ] Import centralized services:
  ```typescript
  import {
    services,
    generateEmbedding,
    searchSimilarDocuments,
    generateChatResponse
  } from '$lib/server/services';
  ```
- [ ] Replace hardcoded URLs with `services.env.ollamaConfig.baseUrl`
- [ ] Replace model names with `services.env.ollamaConfig.embeddingModel` or `chatModel`
- [ ] Add error handling with graceful fallbacks
- [ ] Leverage Redis caching where appropriate

### After Migration
- [ ] Test endpoint with real services
- [ ] Verify environment variables are used
- [ ] Check health endpoint shows services as healthy
- [ ] Update API documentation
- [ ] Mark as ✅ Complete in this document

---

## 🔧 Common Migration Patterns

### Pattern 1: Chat Endpoints
```typescript
// ❌ OLD
const response = await fetch('http://localhost:11434/api/chat', {
  method: 'POST',
  body: JSON.stringify({ model: 'gemma3-legal', messages })
});

// ✅ NEW
import { generateChatResponse } from '$lib/server/services';
const response = await generateChatResponse(messages, stream);
```

### Pattern 2: Embedding Generation
```typescript
// ❌ OLD
const response = await fetch('http://localhost:11434/api/embeddings', {
  method: 'POST',
  body: JSON.stringify({ model: 'embeddinggemma:latest', prompt: text })
});
const embedding = await response.json().embedding;

// ✅ NEW
import { generateEmbedding } from '$lib/server/services';
const embedding = await generateEmbedding(text, `cache:${id}`); // Auto-cached 24h
```

### Pattern 3: Vector Search
```typescript
// ❌ OLD - Manual Qdrant/pgvector queries
const results = await db.execute(sql`
  SELECT * FROM legal_documents
  ORDER BY embedding <=> ${queryEmbedding}
  LIMIT 10
`);

// ✅ NEW - Hybrid search with fallback
import { searchSimilarDocuments } from '$lib/server/services';
const results = await searchSimilarDocuments(query, 10);
// Tries Qdrant (fast) → falls back to pgvector (persistent)
```

### Pattern 4: Document Indexing
```typescript
// ❌ OLD - Manual indexing
await db.insert(legalDocuments).values({
  id, content, embedding
});

// ✅ NEW - Dual indexing (Qdrant + PostgreSQL)
import { indexDocument } from '$lib/server/services';
await indexDocument({
  id,
  content,
  title,
  metadata: { type: 'contract', jurisdiction: 'california' }
});
// Automatically indexes in both Qdrant and pgvector
```

---

## 🎯 Migration Goals

### Week 1: High Priority (10 endpoints)
- [ ] `/api/chat/+server.ts`
- [ ] `/api/rag/enhanced/+server.ts`
- [ ] `/api/ollama/generate/+server.ts`
- [ ] `/api/embeddings/ollama/+server.ts`
- [ ] `/api/search/semantic/+server.ts`
- [ ] `/api/rag/+server.ts`
- [ ] `/api/ai/rag/+server.ts`
- [ ] `/api/chat-simple/+server.ts`
- [ ] `/api/chat-anonymous/+server.ts`

### Week 2: Medium Priority RAG (5 endpoints)
- [ ] `/api/rag/process/+server.ts`
- [ ] `/api/rag/upload/+server.ts`
- [ ] `/api/rag/sync/+server.ts`
- [ ] `/api/rag/hybrid-pipeline/+server.ts`
- [ ] `/api/rag/enhanced-process/+server.ts`

### Week 3: Medium Priority AI (10 endpoints)
- [ ] `/api/ai/+server.ts`
- [ ] `/api/ai/ingest/+server.ts`
- [ ] `/api/ai/stream/+server.ts`
- [ ] `/api/ai/ask/+server.ts`
- [ ] `/api/embeddings/generate/+server.ts`
- [ ] `/api/search/legal/+server.ts`
- [ ] `/api/search/vector/+server.ts`

### Week 4: Cleanup & Documentation
- [ ] Archive deprecated endpoints
- [ ] Update API documentation
- [ ] Create migration success metrics
- [ ] Performance benchmarks

---

## 📈 Success Metrics

### Performance Targets
- **Embedding Generation**: 50-100ms (GPU) → <1ms (cached)
- **Vector Search**: 2-5ms (Qdrant HNSW)
- **Chat Response**: 50-500ms (depending on model complexity)
- **Cache Hit Rate**: >80% for frequently accessed embeddings

### Code Quality Targets
- **Zero Hardcoded URLs**: All services use environment variables
- **Type Safety**: Complete TypeScript coverage
- **Error Handling**: Graceful fallbacks for all service failures
- **Test Coverage**: Integration tests for all migrated endpoints

---

## 🚀 Quick Start for Developers

### Testing Migrated Endpoints

```bash
# 1. Start services
docker-compose -f docker-compose.legal-ai.yml up -d

# 2. Check health
curl http://localhost:5173/api/health/services

# 3. Test chat endpoint (migrated)
curl -X POST http://localhost:5173/api/ai/chat-mock \
  -H "Content-Type: application/json" \
  -d '{"message": "What is a valid contract?"}'

# 4. Test embeddings endpoint (already migrated)
curl -X POST http://localhost:5173/api/v1/embeddings \
  -H "Content-Type: application/json" \
  -d '{"text": "employment contract termination"}'
```

### Environment Variables Required

```bash
# Ollama AI
OLLAMA_URL=http://localhost:11434
EMBEDDING_MODEL=embeddinggemma:latest
CHAT_MODEL=gemma3:legal-latest

# Redis (caching)
REDIS_URL=redis://:redis@localhost:6379/0
REDIS_PASSWORD=redis

# Vector Databases
QDRANT_HOST=localhost
QDRANT_PORT=6333
DATABASE_URL=postgresql://legal_admin:123456@localhost:5432/legal_ai_db

# Optional (for advanced features)
MINIO_ENDPOINT=localhost:9000
NEO4J_URI=bolt://localhost:7687
RABBITMQ_URL=amqp://guest:guest@localhost:5672
```

---

## 📚 Documentation

- **Service Integration Guide**: `PRODUCTION_SERVICES_INTEGRATION.md`
- **Migration Guide**: `APP_WIDE_MIGRATION_GUIDE.md`
- **Implementation Summary**: `IMPLEMENTATION_SUMMARY.md`
- **Service Factory**: `src/lib/server/services.ts`
- **Service Adapters**: `src/lib/server/adapters/service-integrations.ts`

---

**Status**: 🟡 In Progress
**Completion**: 2/755 endpoints (0.3%)
**High Priority Completion**: 2/10 endpoints (20%)

🎯 **Next Step**: Migrate `/api/chat/+server.ts` to use centralized Ollama service
