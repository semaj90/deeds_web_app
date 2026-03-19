# Architecture Reference — Legal AI Platform

## Last Updated: February 16, 2026

---

## Technology Stack
- **Frontend**: SvelteKit 2 + Svelte 5 (runes) + bits-ui v2.15.5 + UnoCSS
- **Local Caching**: IndexedDB + Loki.js (client-side persistence)
- **Server Caching**: Redis (SSR page cache + session data)
- **Primary Database**: PostgreSQL 16 + Drizzle ORM 0.44
- **Vector Storage**: Qdrant + pgvector (GPU-accelerated with CUDA)
- **AI Models**: Ollama (embeddinggemma:latest + gemma3-legal:latest)
- **Real-Time**: Server-Sent Events (SSE) for route health monitoring
- **State Machines**: XState v5
- **Message Queue**: RabbitMQ

## AI Model Notes
- **LegalBERT ONNX**: CPU-only model for browser usage (client-side classification/entity extraction)
- **embeddinggemma:latest**: Primary embedding model for semantic search (server-side, 768 dims)
- **gemma3-legal:latest**: Primary LLM for legal text generation and analysis (server-side)
- **nomic-embed-text**: Fallback embedding model

## Multi-Tier Caching Strategy

### Tier 1: Client-Side (IndexedDB + Loki.js)
```typescript
// Loki.js for fast in-memory queries, IndexedDB for persistence
import Loki from 'lokijs';
import { openDB } from 'idb';

// Hot data in Loki.js (metadata), full docs in IndexedDB
```

### Tier 2: Server-Side (Redis SSR Cache)
```typescript
import { Redis } from 'ioredis';
import { building } from '$app/environment';

const redis = building ? null : new Redis({
  host: process.env.REDIS_HOST || 'localhost',
  port: parseInt(process.env.REDIS_PORT || '6379'),
  maxRetriesPerRequest: 3
});

// SSR page cache: 5min TTL
// Session data: 1hr TTL
```

### Tier 3: PostgreSQL + pgvector (Primary Storage)
```typescript
// Drizzle ORM 0.44 schema with pgvector
export const legalDocuments = pgTable('legal_documents', {
  id: uuid('id').primaryKey().defaultRandom(),
  embedding: vector('embedding', { dimensions: 768 }), // embeddinggemma
  metadata: jsonb('metadata').$type<LegalMetadata>(),
}, (table) => ({
  embeddingIndex: index('idx_hnsw').using('hnsw', table.embedding.op('vector_cosine_ops')),
  metadataIndex: index('idx_gin').using('gin', table.metadata)
}));
```

### Tier 4: Qdrant (Vector Database)
```typescript
import { QdrantClient } from '@qdrant/js-client-rest';
// GPU-accelerated semantic search
// score_threshold: 0.7 for high-confidence matches
```

## JSONB for Legal Metadata
```sql
-- GIN index for instant JSONB queries
CREATE INDEX idx_legal_metadata ON legal_documents USING gin (metadata jsonb_path_ops);

-- Query example (sub-millisecond with index)
SELECT * FROM legal_documents
WHERE metadata @> '{"case": {"parties": [{"role": "defendant"}]}}';
```

```typescript
interface LegalMetadata {
  case: {
    jurisdiction: string;
    courtLevel: 'district' | 'appellate' | 'supreme';
    parties: Array<{ role: string; name: string; type: string }>;
  };
  classification: {
    practiceArea: string[];
    confidenceLevel: number;
    riskLevel: 'low' | 'medium' | 'high' | 'critical';
  };
  processing: {
    extractedEntities: string[];
    keyTerms: string[];
    sentiment: number;
  };
}
```

## Vector Quantization (Future Optimization)
```sql
-- Current: Full precision (3KB per 768-dim vector)
ALTER TABLE legal_documents ADD COLUMN embedding vector(768);

-- Optimized: Quantized vectors (768 bytes per vector, 4x compression)
ALTER TABLE legal_documents ADD COLUMN embedding_quantized bytea;
```

## RabbitMQ 4.0 Notes
- Quorum queues replace classic mirrored queues
- Default redelivery limit: 20 (configure DLX!)
- Streams for append-only, replayable logs
```typescript
import { connect } from 'rabbitmq-stream-js-client';
const client = await connect({ hostname: 'localhost', port: 5552 });
```

## LangChain.js Chunking
```typescript
import { RecursiveCharacterTextSplitter } from 'langchain/text_splitter';
const splitter = new RecursiveCharacterTextSplitter({
  chunkSize: 512,    // 256-512 tokens optimal
  chunkOverlap: 50,  // 10-20% overlap
});
```
