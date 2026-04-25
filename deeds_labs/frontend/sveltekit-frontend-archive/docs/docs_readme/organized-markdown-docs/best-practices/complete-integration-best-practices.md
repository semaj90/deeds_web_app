# Complete Integration Best Practices - Legal AI with Enhanced RAG & YoRHa Interface

## Overview
This document outlines best practices for merging the enhanced RAG system, YoRHa interface, and all supporting components into a unified legal AI platform.

## System Architecture

### 1. Core Technology Stack
```yaml
Frontend:
  Framework: SvelteKit 2
  UI Components:
    - YoRHa Dashboard (primary interface)
    - Melt-UI (unstyled components)
    - Bits-UI (additional components)
    - Shadcn-Svelte (styled components)
  Styling: UnoCSS with YoRHa theme
  State Management:
    - XState (complex workflows)
    - Svelte stores (global state)
    - Superforms (form management)

Backend:
  Server: Node.js with Express/Vite
  Database: PostgreSQL with pgvector
  ORM: Drizzle ORM
  Cache: Redis
  Queue: RabbitMQ
  Graph DB: Neo4j
  Vector Store: Qdrant + pgvector

AI/ML:
  Embeddings:
    - ONNX Runtime (primary)
    - nomic-embed-text (fallback)
  LLM:
    - gemma3legal:latest (Ollama)
    - Legal-BERT (specialized tasks)
  Orchestration:
    - AutoGen (multi-agent)
    - CrewAI (complex workflows)
```

### 2. Service Architecture
```
┌─────────────────────────────────────────────────────────┐
│                    YoRHa Interface                       │
│  (Main Dashboard with Role-Based Access Control)         │
└────────────────┬────────────────────────────────────────┘
                 │
┌────────────────▼────────────────────────────────────────┐
│              SvelteKit Backend (Node.js)                │
│  - API Routes                                           │
│  - Authentication                                       │
│  - Session Management                                   │
└────────────────┬────────────────────────────────────────┘
                 │
     ┌───────────┼───────────┬─────────────┬─────────────┐
     │           │           │             │             │
┌────▼────┐ ┌───▼────┐ ┌────▼────┐ ┌─────▼────┐ ┌──────▼──────┐
│ PostgreSQL│ │ Redis  │ │ Neo4j   │ │RabbitMQ  │ │  MinIO      │
│ +pgvector │ │ Cache  │ │ Graph   │ │ Queue    │ │Object Store │
└──────────┘ └────────┘ └─────────┘ └──────────┘ └─────────────┘
```

## Integration Checklist

### Phase 1: Foundation Setup ✅
- [x] PostgreSQL with pgvector extension
- [x] Drizzle ORM schema
- [x] Neo4j connection
- [x] MinIO for object storage
- [ ] Redis cache configuration
- [ ] RabbitMQ message queue

### Phase 2: Backend Services
- [ ] ONNX Runtime integration
- [ ] AutoGen agent setup
- [ ] CrewAI orchestration
- [ ] OCR service (Python)
- [ ] PDF processing pipeline
- [ ] Embedding service
- [ ] RAG pipeline

### Phase 3: Frontend Integration
- [ ] YoRHa as main interface
- [ ] Authentication flow
- [ ] Role-based dashboards
- [ ] Enhanced RAG UI
- [ ] Document processing UI
- [ ] Evidence board
- [ ] AI assistant panel

## Best Practices

### 1. Environment Configuration
```env
# Database
DATABASE_URL=postgresql://postgres:postgres@localhost:5432/legal_ai_db?sslmode=disable

# Neo4j
NEO4J_URI=neo4j+s://04d6547a.databases.neo4j.io
NEO4J_USERNAME=neo4j
NEO4J_PASSWORD=VGLunwtms0Hn9K8bQO8RWan01_ePnzJBUsGWRSRRaeg
NEO4J_DATABASE=neo4j

# MinIO
MINIO_ENDPOINT=localhost:9000
MINIO_ACCESS_KEY=minioadmin
MINIO_SECRET_KEY=minioadmin123
MINIO_BUCKET=legal-documents

# AI Models
OLLAMA_URL=http://localhost:11434
OLLAMA_MODEL=gemma3legal:latest
OLLAMA_EMBEDDING_MODEL=nomic-embed-text

# Backend Services
BACKEND_RAG_STREAM_ENDPOINT=http://localhost:8094/stream
REDIS_URL=redis://localhost:6379
RABBITMQ_URL=amqp://localhost:5672
```

### 2. Error Handling
```typescript
// Consistent error handling pattern
export class ServiceError extends Error {
  constructor(
    message: string,
    public code: string,
    public statusCode: number = 500,
    public details?: any
  ) {
    super(message);
    this.name = 'ServiceError';
  }
}

// Use try-catch with proper logging
try {
  const result = await performOperation();
  return result;
} catch (error) {
  console.error(`Operation failed: ${error.message}`, error);
  throw new ServiceError(
    'Operation failed',
    'OPERATION_ERROR',
    500,
    error
  );
}
```

### 3. Caching Strategy
```typescript
// Multi-level caching
class CacheManager {
  private memoryCache: Map<string, any> = new Map();
  private redis: Redis;

  async get(key: string): Promise<any> {
    // L1: Memory cache
    if (this.memoryCache.has(key)) {
      return this.memoryCache.get(key);
    }

    // L2: Redis cache
    const cached = await this.redis.get(key);
    if (cached) {
      this.memoryCache.set(key, cached);
      return cached;
    }

    return null;
  }

  async set(key: string, value: any, ttl: number = 3600): Promise<void> {
    this.memoryCache.set(key, value);
    await this.redis.set(key, value, 'EX', ttl);
  }
}
```

### 4. Streaming & Real-time Updates
```typescript
// SSE for real-time updates
export const GET: RequestHandler = async ({ url }) => {
  const stream = new ReadableStream({
    async start(controller) {
      for await (const event of streamEvents()) {
        controller.enqueue(
          new TextEncoder().encode(`data: ${JSON.stringify(event)}\n\n`)
        );
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

### 5. Vector Search Optimization
```sql
-- Optimize pgvector indexes
CREATE INDEX ON documents USING ivfflat (embedding vector_cosine_ops)
WITH (lists = 100);

-- Partition large tables
CREATE TABLE documents_2025_01 PARTITION OF documents
FOR VALUES FROM ('2025-01-01') TO ('2025-02-01');
```

### 6. Security Best Practices
```typescript
// Input validation
import { z } from 'zod';

const DocumentSchema = z.object({
  title: z.string().min(1).max(255),
  content: z.string().max(100000),
  caseId: z.string().uuid(),
  documentType: z.enum(['legal', 'evidence', 'report'])
});

// Rate limiting
import { RateLimiter } from './rate-limiter';

const limiter = new RateLimiter({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100 // limit each IP to 100 requests per windowMs
});

// XSS protection
import DOMPurify from 'isomorphic-dompurify';

const sanitizedContent = DOMPurify.sanitize(userInput);
```

### 7. Performance Optimization
```typescript
// Batch processing
async function batchProcess<T, R>(
  items: T[],
  processor: (batch: T[]) => Promise<R[]>,
  batchSize: number = 10
): Promise<R[]> {
  const results: R[] = [];

  for (let i = 0; i < items.length; i += batchSize) {
    const batch = items.slice(i, i + batchSize);
    const batchResults = await processor(batch);
    results.push(...batchResults);
  }

  return results;
}

// Connection pooling
const pool = new Pool({
  connectionString: DATABASE_URL,
  max: 20,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 2000,
});
```

### 8. Testing Strategy
```typescript
// Unit tests
describe('EmbeddingService', () => {
  it('should generate embeddings', async () => {
    const text = 'Legal document text';
    const embedding = await embeddingService.generateEmbedding(text);
    expect(embedding).toHaveLength(384);
  });
});

// Integration tests
describe('RAG Pipeline', () => {
  it('should retrieve relevant documents', async () => {
    const query = 'contract breach';
    const results = await ragPipeline.search(query);
    expect(results).toHaveLength(5);
  });
});
```

## Deployment Architecture

### Local Development
```bash
# Start all services
-d postgres redis neo4j rabbitmq minio

# Start Ollama
ollama serve

# Start development server
npm run dev
```

## Monitoring & Observability

### 1. Logging
```typescript
import winston from 'winston';

const logger = winston.createLogger({
  level: 'info',
  format: winston.format.json(),
  transports: [
    new winston.transports.File({ filename: 'error.log', level: 'error' }),
    new winston.transports.File({ filename: 'combined.log' })
  ]
});
```

### 2. Metrics
```typescript
// Track key metrics
const metrics = {
  ragQueryTime: new Histogram('rag_query_duration_seconds'),
  embeddingGenerationTime: new Histogram('embedding_generation_seconds'),
  documentProcessingCount: new Counter('documents_processed_total')
};
```

### 3. Health Checks
```typescript
// Health check endpoint
export const GET: RequestHandler = async () => {
  const checks = {
    postgres: await checkPostgres(),
    redis: await checkRedis(),
    neo4j: await checkNeo4j(),
    ollama: await checkOllama()
  };

  const healthy = Object.values(checks).every(c => c);

  return new Response(JSON.stringify({
    status: healthy ? 'healthy' : 'unhealthy',
    checks
  }), {
    status: healthy ? 200 : 503,
    headers: { 'Content-Type': 'application/json' }
  });
};
```

## Conclusion
This integration brings together multiple cutting-edge technologies to create a comprehensive legal AI platform. Follow these best practices to ensure a robust, scalable, and maintainable system.
