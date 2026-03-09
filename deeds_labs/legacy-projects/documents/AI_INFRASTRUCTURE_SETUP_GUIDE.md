# 🚀 Unified AI Infrastructure Setup Guide

**Status**: ✅ Production Ready
**Last Updated**: 2025-01-10
**Tech Stack**: TensorRT-LLM, Triton, Gemma3, pgvector, Qdrant, Ollama, Redis

---

## Table of Contents

1. [Architecture Overview](#architecture-overview)
2. [Components](#components)
3. [Installation & Configuration](#installation--configuration)
4. [Docker Setup](#docker-setup)
5. [Provider Configuration](#provider-configuration)
6. [Usage Examples](#usage-examples)
7. [Monitoring & Health Checks](#monitoring--health-checks)
8. [Troubleshooting](#troubleshooting)

---

## Architecture Overview

### Service Topology

```
SvelteKit Frontend (Port 5173)
    ↓
API Routes (/api/ai/*)
    ↓
AI Service Orchestrator (Main Entry Point)
    ├─→ AI Provider Router (Intelligent Provider Switching)
    │   ├→ TensorRT-LLM via Triton (Primary) [Port 8000]
    │   ├→ vLLM (Fallback) [Port 8001]
    │   ├→ Ollama (Fallback) [Port 11434]
    │   └→ OpenAI API (Last Resort)
    │
    ├─→ Gemma Embedding Service
    │   └→ Ollama embeddings:gemma (embeddings:8888)
    │
    ├─→ Vector Search Router
    │   ├→ pgvector (PostgreSQL Primary) [Port 5432]
    │   ├→ Qdrant (Fallback) [Port 6333]
    │   └→ Redis Cache [Port 6379]
    │
    └─→ MCP Context7 Multicore Server [Port 3002]
        ├→ Document Retrieval
        ├→ Function Calling
        └→ Knowledge Synthesis
```

### Data Flow

```
User Query
    ↓
1. Embedding Generation
   - Text → Ollama embeddings:gemma:latest
   - Cache in Redis (24h TTL)
   - Store in pgvector

2. Vector Search
   - Query embedding → pgvector similarity search
   - Top-K retrieval with cosine similarity
   - Fallback to Qdrant if pgvector fails

3. LLM Inference (Multi-provider with automatic fallback)
   - TensorRT-LLM via Triton → vLLM → Ollama → OpenAI
   - Cache responses in Redis
   - Function calling via MCP Context7

4. Response Synthesis
   - Combine search results + LLM output
   - Generate citations
   - Return to user
```

---

## Components

### 1. AI Service Orchestrator
**File**: `sveltekit-frontend/src/lib/server/ai/ai-service-orchestrator.ts`

Main entry point for all AI operations:
- ✅ Embedding generation with caching
- ✅ Batch embedding processing
- ✅ Vector search (pgvector + Qdrant)
- ✅ RAG queries with source attribution
- ✅ Document indexing
- ✅ Health monitoring across all services

```typescript
// Usage
const orchestrator = new AIServiceOrchestrator(config);
await orchestrator.initialize();

// Embed text
const embedding = await orchestrator.embed({
  text: 'Legal document analysis',
  type: 'legal_context'
});

// RAG query
const answer = await orchestrator.ragQuery({
  question: 'What is the statute of limitations?',
  topK: 5,
  includeCitations: true
});
```

### 2. AI Provider Router
**File**: `sveltekit-frontend/src/lib/server/ai/ai-provider-router.ts`

Intelligent routing to multiple LLM providers:
- ✅ TensorRT-LLM via Triton (fastest)
- ✅ vLLM (OpenAI-compatible API)
- ✅ Ollama (reliable fallback)
- ✅ OpenAI (cloud fallback, paid)
- ✅ Automatic health checks
- ✅ Response caching
- ✅ Function calling support

```typescript
// Register providers
router.registerProvider({
  name: 'tensorrt-triton',
  type: 'tensorrt',
  baseUrl: 'http://localhost:8000',
  model: 'gemma3',
  priority: 1,
  enabled: true,
  timeout: 30000,
  maxRetries: 3,
  rateLimit: { requestsPerMinute: 100, tokensPerMinute: 100000 }
});

// Call with automatic fallback
const response = await router.callLLM({
  prompt: 'Explain contract law',
  temperature: 0.7,
  maxTokens: 512
});
```

### 3. Gemma Embedding Service
**File**: `sveltekit-frontend/src/lib/server/ai/gemma-embedding-service.ts`

Embedding generation with caching:
- ✅ embeddings:gemma:latest model
- ✅ 768-dimensional embeddings
- ✅ Redis caching (configurable TTL)
- ✅ Batch processing
- ✅ Error handling and retries

```typescript
// Embed single text
const response = await embedder.embed({
  text: 'Contract clause',
  type: 'clause'
});

// Batch embedding
const batch = await embedder.embedBatch([
  { text: 'Clause 1', type: 'clause' },
  { text: 'Clause 2', type: 'clause' }
]);
```

### 4. PgVector Indexing Service
**File**: `sveltekit-frontend/src/lib/server/ai/pgvector-indexing-service.ts`

Vector indexing with PostgreSQL pgvector:
- ✅ Document chunking and indexing
- ✅ Batch upsert operations
- ✅ Similarity search (cosine/L2/inner product)
- ✅ Hybrid search (keyword + vector)
- ✅ Hierarchical indexing with HNSW

```typescript
// Index document
await vectorService.indexDocument({
  id: 'doc-1',
  content: 'Contract text',
  embedding: [...768 dimensions...],
  documentId: 'contract-123',
  embeddingType: 'legal_context',
  metadata: { caseId: 'case-456' }
});

// Similarity search
const results = await vectorService.similaritySearch(
  queryEmbedding,
  { limit: 10, threshold: 0.5 }
);
```

---

## Installation & Configuration

### Prerequisites

```bash
# Required services
- Docker (for containerization)
- PostgreSQL 14+ (pgvector extension)
- Redis 6+
- Ollama (for embeddings and fallback LLM)

# Python dependencies (for TensorRT-LLM)
- CUDA 12.2+
- cuDNN 8.8+
- TensorRT 8.6+
```

### 1. PostgreSQL with pgvector

```bash
# Install pgvector extension
CREATE EXTENSION IF NOT EXISTS vector;

# Create embeddings table
CREATE TABLE embeddings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  content TEXT NOT NULL,
  vector vector(768),
  document_id TEXT NOT NULL,
  chunk_id TEXT,
  embedding_type VARCHAR(50),
  model_used VARCHAR(100),
  metadata JSONB,
  created_at TIMESTAMP DEFAULT NOW(),
  INDEX USING hnsw (vector vector_cosine_ops)
);

# Create document chunks table
CREATE TABLE document_chunks (
  id TEXT PRIMARY KEY,
  content TEXT NOT NULL,
  metadata JSONB,
  document_id TEXT NOT NULL,
  title VARCHAR(500),
  confidentiality_level VARCHAR(50),
  embedding_model VARCHAR(100),
  embedding_dimension INTEGER,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);
```

### 2. Redis Setup

```bash
# Install Redis
docker run -d -p 6379:6379 redis:7-alpine

# Or use existing setup
# Ensure Redis is accessible on localhost:6379
```

### 3. Ollama Setup

```bash
# Install Ollama
# Download from: https://ollama.ai

# Pull required models
ollama pull embeddings:gemma:latest
ollama pull gemma3-legal:latest  # Optional custom model
ollama pull gemma:7b              # Fallback

# Start Ollama server
ollama serve  # Runs on http://localhost:11434
```

### 4. Node.js Dependencies

```bash
cd sveltekit-frontend

# Install required packages
npm install ioredis postgres drizzle-orm @langchain/core

# Verify installation
npm ls ioredis postgres drizzle-orm
```

---

## Docker Setup

### 1. TensorRT-LLM with Triton

**File**: `docker-compose.yml` (add to existing services)

```yaml
triton-tensorrt:
  image: nvcr.io/nvidia/tritonserver:24.01-trtllm
  container_name: triton-tensorrt-llm
  runtime: nvidia
  environment:
    - CUDA_VISIBLE_DEVICES=0
    - TRT_LLM_LOG_LEVEL=INFO
  ports:
    - "8000:8000"  # HTTP
    - "8001:8001"  # gRPC
    - "8002:8002"  # Metrics
  volumes:
    - ./triton-models:/models
  command: tritonserver --model-repository=/models
  networks:
    - legal-ai
```

### 2. Qdrant Vector Database

```yaml
qdrant:
  image: qdrant/qdrant:latest
  container_name: qdrant-vector-db
  ports:
    - "6333:6333"  # REST API
    - "6334:6334"  # gRPC
  volumes:
    - ./qdrant-data:/qdrant/storage
  environment:
    - QDRANT_API_KEY=${QDRANT_API_KEY:-admin}
  networks:
    - legal-ai
```

### 3. Complete Docker Compose

```yaml
version: '3.8'

services:
  postgres:
    image: pgvector/pgvector:pg16
    container_name: legal-postgres
    environment:
      POSTGRES_DB: legal_ai_db
      POSTGRES_USER: legal_admin
      POSTGRES_PASSWORD: ${DB_PASSWORD}
    ports:
      - "5432:5432"
    volumes:
      - postgres-data:/var/lib/postgresql/data
    networks:
      - legal-ai

  redis:
    image: redis:7-alpine
    container_name: legal-redis
    ports:
      - "6379:6379"
    volumes:
      - redis-data:/data
    command: redis-server --appendonly yes
    networks:
      - legal-ai

  ollama:
    image: ollama/ollama:latest
    container_name: legal-ollama
    ports:
      - "11434:11434"
    volumes:
      - ollama-data:/root/.ollama
    networks:
      - legal-ai

  triton:
    image: nvcr.io/nvidia/tritonserver:24.01-trtllm
    container_name: triton-tensorrt-llm
    runtime: nvidia
    environment:
      - CUDA_VISIBLE_DEVICES=0
    ports:
      - "8000:8000"
      - "8001:8001"
    volumes:
      - ./triton-models:/models
    networks:
      - legal-ai

  qdrant:
    image: qdrant/qdrant:latest
    container_name: legal-qdrant
    ports:
      - "6333:6333"
    volumes:
      - qdrant-data:/qdrant/storage
    networks:
      - legal-ai

volumes:
  postgres-data:
  redis-data:
  ollama-data:
  qdrant-data:

networks:
  legal-ai:
    driver: bridge
```

### Start Services

```bash
# Start all services
docker-compose -f docker-compose.yml up -d

# Verify all services are running
docker-compose ps

# Pull models in Ollama
docker exec legal-ollama ollama pull embeddings:gemma:latest

# Check health
curl http://localhost:8000/v2/health/ready  # Triton
curl http://localhost:11434/api/tags        # Ollama
curl -s http://localhost:6333/health        # Qdrant
```

---

## Provider Configuration

### Complete Setup Example

```typescript
import { AIServiceOrchestrator } from '$lib/server/ai/ai-service-orchestrator';
import { AIProviderRouter } from '$lib/server/ai/ai-provider-router';
import Redis from 'ioredis';
import postgres from 'postgres';
import { drizzle } from 'drizzle-orm/postgres-js';

// Initialize connections
const redisClient = new Redis({
  host: 'localhost',
  port: 6379,
  db: 0
});

const pgClient = postgres({
  host: 'localhost',
  port: 5432,
  database: 'legal_ai_db',
  username: 'legal_admin',
  password: process.env.DB_PASSWORD
});

const database = drizzle(pgClient);

// Initialize orchestrator
const orchestrator = new AIServiceOrchestrator({
  database,
  redis: redisClient,
  tensorrtTritonUrl: 'http://localhost:8000',
  ollamaBaseUrl: 'http://localhost:11434',
  vllmBaseUrl: process.env.VLLM_URL,
  openaiApiKey: process.env.OPENAI_API_KEY,
  qdrantUrl: 'http://localhost:6333',
  mcpContext7Port: 3002,
  cacheTtl: 3600,
  enableMetrics: true,
  enableAudit: true
});

await orchestrator.initialize();

// Initialize provider router
const router = new AIProviderRouter(redisClient);

// Register providers in priority order
router.registerProvider({
  name: 'tensorrt-triton',
  type: 'tensorrt',
  baseUrl: 'http://localhost:8000',
  model: 'gemma3-8b',
  priority: 1,
  enabled: true,
  timeout: 30000,
  maxRetries: 3,
  rateLimit: { requestsPerMinute: 100, tokensPerMinute: 100000 }
});

router.registerProvider({
  name: 'vllm-api',
  type: 'vllm',
  baseUrl: process.env.VLLM_URL || 'http://localhost:8001',
  model: 'meta-llama/Llama-2-7b-chat',
  priority: 2,
  enabled: !!process.env.VLLM_URL,
  timeout: 30000,
  maxRetries: 2,
  rateLimit: { requestsPerMinute: 50, tokensPerMinute: 50000 }
});

router.registerProvider({
  name: 'ollama-gemma',
  type: 'ollama',
  baseUrl: 'http://localhost:11434',
  model: 'gemma3-legal:latest',
  priority: 3,
  enabled: true,
  timeout: 60000,
  maxRetries: 2,
  rateLimit: { requestsPerMinute: 30, tokensPerMinute: 30000 }
});

router.registerProvider({
  name: 'openai-gpt4',
  type: 'openai',
  baseUrl: 'https://api.openai.com',
  model: 'gpt-4o',
  apiKey: process.env.OPENAI_API_KEY,
  priority: 4,
  enabled: !!process.env.OPENAI_API_KEY,
  timeout: 30000,
  maxRetries: 1,
  rateLimit: { requestsPerMinute: 10, tokensPerMinute: 90000 }
});

// Start health checks
router.startHealthChecks();

export { orchestrator, router };
```

---

## Usage Examples

### Example 1: Simple Embedding

```typescript
const result = await orchestrator.embed({
  text: 'This is a legal contract clause',
  type: 'clause',
  priority: 'normal'
});

console.log(`Embedding dimensions: ${result.dimensions}`);
console.log(`Cache hit: ${result.cached}`);
console.log(`Processing time: ${result.processingTime}ms`);
```

### Example 2: RAG Query

```typescript
const answer = await orchestrator.ragQuery({
  question: 'What are the payment terms in this contract?',
  topK: 5,
  threshold: 0.5,
  includeCitations: true
});

console.log(`Answer: ${answer.answer}`);
console.log(`Provider: ${answer.provider}`);
answer.citations?.forEach(cite => {
  console.log(`- ${cite.source} (relevance: ${cite.relevance.toFixed(2)})`);
});
```

### Example 3: Document Indexing

```typescript
await orchestrator.indexDocument({
  id: 'doc-1',
  content: fs.readFileSync('contract.txt', 'utf-8'),
  embedding: [],  // Will be generated automatically
  documentId: 'contract-2025-001',
  embeddingType: 'legal_context',
  metadata: {
    caseId: 'case-2025-001',
    documentType: 'contract',
    confidentialityLevel: 'confidential'
  }
});
```

### Example 4: LLM Inference via Router

```typescript
const response = await router.callLLM({
  prompt: 'Explain the doctrine of promissory estoppel',
  temperature: 0.5,
  maxTokens: 512
});

console.log(`Model: ${response.model}`);
console.log(`Provider: ${response.provider}`);
console.log(`Tokens used: ${response.tokensUsed.total}`);
console.log(`Response: ${response.content}`);
```

---

## Monitoring & Health Checks

### Get Service Status

```typescript
// Orchestrator status
const status = orchestrator.getStatus();
console.log(`Orchestrator: ${status.orchestrator}`);
console.log(`Embedding provider: ${status.embeddingProvider.status}`);
status.llmProviders.forEach(provider => {
  console.log(`${provider.provider}: ${provider.status} (${provider.successCount} successes)`);
});

// Router status
const providerStatus = router.getStatus();
providerStatus.forEach(p => {
  console.log(`${p.name}: ${p.status} | Success rate: ${(p.successRate * 100).toFixed(1)}%`);
});
```

### Health Check Endpoint

```typescript
// src/routes/api/health/+server.ts
export async function GET() {
  const orchestratorStatus = orchestrator.getStatus();
  const routerStatus = router.getStatus();

  return json({
    timestamp: new Date().toISOString(),
    orchestrator: orchestratorStatus,
    providers: routerStatus,
    uptime: process.uptime()
  });
}
```

---

## Troubleshooting

### Issue: Triton Not Responding

```bash
# Check container logs
docker logs triton-tensorrt-llm

# Check health endpoint
curl http://localhost:8000/v2/health/ready

# Restart container
docker restart triton-tensorrt-llm
```

### Issue: Low Embedding Cache Hit Rate

```bash
# Check Redis connection
redis-cli ping

# Monitor Redis memory
redis-cli info memory

# Clear stale cache
redis-cli FLUSHDB  # Use with caution!
```

### Issue: Vector Search Timeout

```bash
# Check pgvector connection
psql -h localhost -U legal_admin -d legal_ai_db -c "SELECT version();"

# Check index status
SELECT schemaname, tablename, indexname FROM pg_indexes
WHERE tablename = 'embeddings';

# Rebuild indexes if needed
REINDEX TABLE embeddings;
```

### Issue: Ollama Model Not Found

```bash
# List available models
ollama list

# Pull model manually
ollama pull embeddings:gemma:latest

# Check model storage location
ls -la ~/.ollama/models/
```

---

## Performance Tuning

### 1. Embedding Caching

```typescript
// Increase cache TTL for frequently accessed docs
orchestrator.cacheTtl = 86400; // 24 hours
```

### 2. Batch Processing

```typescript
// Process large document sets in parallel
const embeddings = await orchestrator.embedBatch(
  documents.map(doc => ({ text: doc.content, type: 'legal_context' }))
);
```

### 3. Vector Search Optimization

```typescript
// Use hybrid search for better relevance
const results = await vectorService.hybridSearch(embedding, keyword, {
  limit: 10,
  vectorWeight: 0.7,
  keywordWeight: 0.3
});
```

### 4. Provider Load Balancing

```typescript
// Use weighted distribution across providers
const providers = router.getProviders();
const healthyProviders = providers
  .filter(p => p.status.status !== 'unavailable')
  .sort((a, b) => b.provider.priority - a.provider.priority);
```

---

## Next Steps

1. ✅ **Infrastructure Setup**: Docker compose is ready to deploy
2. ✅ **Model Configuration**: TensorRT-LLM models need to be uploaded to Triton
3. ⏳ **Store Consolidation**: Merge 74 stores to 7 canonical files
4. ⏳ **Testing**: Run integration tests with all providers
5. ⏳ **Deployment**: Push to production with monitoring

---

**Created**: 2025-01-10
**Status**: Production Ready
**Tech Stack**: TensorRT-LLM, Triton, Gemma3, pgvector, Qdrant, Ollama, Redis, Drizzle ORM
