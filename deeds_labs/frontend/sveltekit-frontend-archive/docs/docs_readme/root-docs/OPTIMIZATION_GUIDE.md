# Legal AI Platform - SvelteKit 2 Optimizations Guide
## TypeScript Migration & Best Practices

### 🎯 What We Accomplished

#### 1. **Removed `// @ts-nocheck`** ✅
- **Before**: Files had blanket type checking disabled
- **After**: Proper TypeScript types with localized `@ts-expect-error` only where needed
- **Benefit**: Full IDE autocomplete, type safety, refactoring support

#### 2. **Created Shared Types Module** ✅
**File**: `src/lib/server/workflows/shared-types.ts`

Provides platform-wide types for:
- **Vector Databases**: PostgreSQL pgvector + Qdrant compatible types
- **XState v5**: Actor and Snapshot types for workflows
- **Redis Cache**: Type-safe cache keys and values
- **SvelteKit**: Server load, form actions, API responses
- **Legal Domain**: Case types, statuses, jurisdictions
- **Database**: Pagination, vector search, Drizzle ORM integration

#### 3. **XState v5 Migration Pattern** ✅
**Old (v4) Pattern**:
```typescript
import { interpret } from 'xstate';
const service = interpret(machine).start();
const state = service.state;
```

**New (v5) Pattern**:
```typescript
import { createActor, type Actor, type SnapshotFrom } from 'xstate';
const actor = createActor(machine);
actor.start();
const snapshot = actor.getSnapshot();
```

**Benefits**:
- Type-safe context and events
- Better testing (pause/resume actors)
- Modern XState v5 API compliance
- Works with `xstate-compat` helpers for gradual migration

#### 4. **Barrel Exports** ✅
**File**: `src/lib/server/workflows/index.ts`

**Before**:
```typescript
import { workflowOrchestrator } from '$lib/server/workflows/orchestrator';
import type { DocumentProcessingContext } from '$lib/server/workflows/document-processing';
import type { VectorEmbedding } from '$lib/server/workflows/shared-types';
```

**After**:
```typescript
import { workflowOrchestrator, type DocumentProcessingContext, type VectorEmbedding } from '$lib/server/workflows';
```

---

### 📚 Type System Architecture

#### **Vector Database Integration**

```typescript
// PostgreSQL pgvector + Qdrant compatible
type VectorEmbedding = number[]; // 1536 dims for OpenAI, 768 for Gemma

interface DocumentChunk {
  id: string;
  content: string;
  embedding: VectorEmbedding;
  metadata: DocumentMetadata;
}

interface PgVectorSearchResult {
  id: string;
  content: string;
  similarity: number; // Cosine similarity score
  metadata: DocumentMetadata;
}

interface QdrantSearchResult {
  id: string;
  score: number;
  payload: DocumentMetadata;
  vector?: VectorEmbedding;
}
```

**Usage Example**:
```typescript
// +page.server.ts
import type { VectorSearchParams, VectorSearchResult } from '$lib/server/workflows';

export const load: PageServerLoad = async ({ url }) => {
  const query = url.searchParams.get('q') || '';

  const searchParams: VectorSearchParams = {
    query,
    limit: 10,
    threshold: 0.7,
    filter: { caseId: '123' }
  };

  const results: VectorSearchResult = await vectorSearch(searchParams);
  return { results };
};
```

#### **XState Workflow Types**

```typescript
// Fully typed actors and snapshots
type DocumentProcessingActor = Actor<typeof documentProcessingMachine>;
type DocumentProcessingSnapshot = SnapshotFrom<typeof documentProcessingMachine>;

// Usage in orchestrator
const actor: DocumentProcessingActor = createActor(documentProcessingMachine, {
  input: { documentId, content, metadata }
});

actor.start();
const snapshot: DocumentProcessingSnapshot = actor.getSnapshot();
console.log(snapshot.context.progress); // Type-safe!
```

#### **Redis Cache Types**

```typescript
// Type-safe cache keys
type CacheKeyPattern =
  | `workflow:${string}`
  | `embedding:${string}`
  | `document:${string}`;

interface CachedValue<T> {
  data: T;
  expiresAt: number;
  metadata?: Record<string, unknown>;
}

// Usage
const cacheKey: CacheKeyPattern = `workflow:${workflowId}`;
const cached: CachedValue<WorkflowInstance> = await cache.get(cacheKey);
```

#### **SvelteKit Integration**

```typescript
// Standard server load result
interface ServerLoadResult<T> {
  data: T;
  error?: string;
  cached?: boolean;
  timestamp?: number;
}

// +page.server.ts
export const load: PageServerLoad = async (): Promise<ServerLoadResult<DocumentChunk[]>> => {
  const chunks = await db.query.documentChunks.findMany();

  return {
    data: chunks,
    cached: false,
    timestamp: Date.now()
  };
};
```

```typescript
// Form action result
interface FormActionResult<T> {
  success: boolean;
  data?: T;
  error?: string;
  validationErrors?: Record<string, string>;
}

// +page.server.ts actions
export const actions = {
  upload: async ({ request }): Promise<FormActionResult<{ documentId: string }>> => {
    const formData = await request.formData();
    const file = formData.get('file');

    if (!file) {
      return {
        success: false,
        validationErrors: { file: 'File is required' }
      };
    }

    const doc = await processDocument(file);
    return {
      success: true,
      data: { documentId: doc.id }
    };
  }
};
```

---

### 🚀 Optimization Patterns

#### **1. Vector Search with PostgreSQL pgvector**

```typescript
// Using Drizzle ORM with typed pgvector queries
import { sql } from 'drizzle-orm';
import { db } from '$lib/server/db/client';
import type { VectorEmbedding, PgVectorSearchResult } from '$lib/server/workflows';

async function searchDocuments(
  queryEmbedding: VectorEmbedding,
  limit = 10,
  threshold = 0.7
): Promise<PgVectorSearchResult[]> {
  const results = await db.execute(sql`
    SELECT
      id,
      content,
      embedding,
      1 - (embedding <=> ${queryEmbedding}::vector) as similarity,
      metadata
    FROM document_chunks
    WHERE 1 - (embedding <=> ${queryEmbedding}::vector) > ${threshold}
    ORDER BY embedding <=> ${queryEmbedding}::vector
    LIMIT ${limit}
  `);

  return results.rows as PgVectorSearchResult[];
}
```

#### **2. Qdrant Integration**

```typescript
import { QdrantClient } from '@qdrant/js-client-rest';
import type { QdrantSearchResult, VectorEmbedding } from '$lib/server/workflows';

const qdrant = new QdrantClient({ url: 'http://localhost:6333' });

async function qdrantSearch(
  collectionName: string,
  queryVector: VectorEmbedding,
  limit = 10
): Promise<QdrantSearchResult[]> {
  const results = await qdrant.search(collectionName, {
    vector: queryVector,
    limit,
    with_payload: true,
    with_vector: false
  });

  return results.map(r => ({
    id: r.id.toString(),
    score: r.score,
    payload: r.payload as DocumentMetadata,
  }));
}
```

#### **3. Redis Caching Strategy**

```typescript
import { cache } from '$lib/server/cache/redis';
import type { CacheKeyPattern, CachedValue } from '$lib/server/workflows';

async function getCachedOrCompute<T>(
  key: CacheKeyPattern,
  computeFn: () => Promise<T>,
  ttl = 3600
): Promise<T> {
  // Try cache first
  const cached = await cache.get<T>(key);
  if (cached) return cached;

  // Compute and cache
  const data = await computeFn();
  await cache.set(key, data, ttl);

  return data;
}

// Usage
const embedding = await getCachedOrCompute(
  `embedding:${documentId}`,
  () => embedText(content),
  7200 // 2 hours
);
```

#### **4. Workflow Orchestration**

```typescript
import { workflowOrchestrator, type WorkflowInstance } from '$lib/server/workflows';

// Start document processing workflow
const workflowId = await workflowOrchestrator.startDocumentProcessing(
  documentId,
  content,
  { caseId: '123', tags: ['evidence'] }
);

// Monitor progress
const workflow: WorkflowInstance = workflowOrchestrator.getWorkflowStatus(workflowId);
console.log(`Progress: ${workflow.progress}%`);

// Send events
await workflowOrchestrator.sendToWorkflow(workflowId, {
  type: 'CHUNKING_COMPLETE',
  chunks: ['chunk1', 'chunk2']
});
```

---

### 🧪 Testing Patterns

#### **Type-Safe Unit Tests**

```typescript
import { describe, it, expect } from 'vitest';
import { createActor } from 'xstate';
import { documentProcessingMachine } from '$lib/server/workflows';
import type { DocumentProcessingSnapshot } from '$lib/server/workflows';

describe('Document Processing Workflow', () => {
  it('should transition from idle to processing', () => {
    const actor = createActor(documentProcessingMachine);
    actor.start();

    actor.send({
      type: 'START_PROCESSING',
      documentId: 'doc-123',
      content: 'test content'
    });

    const snapshot: DocumentProcessingSnapshot = actor.getSnapshot();
    expect(snapshot.value).toBe('processing');
    expect(snapshot.context.documentId).toBe('doc-123');
  });
});
```

---

### 📋 Migration Checklist

- [x] Replace `// @ts-nocheck` with proper types
- [x] Create shared-types.ts with platform types
- [x] Add XState Actor/Snapshot types
- [x] Create barrel exports (index.ts)
- [x] Update WorkflowInstance to use typed actors
- [ ] Replace remaining `any` with proper types in orchestrator.ts
- [ ] Add `@ts-expect-error` comments where temporary workarounds needed
- [ ] Migrate ai-recommendation-engine.ts to XState v5
- [ ] Add integration tests for workflows
- [ ] Document API endpoints with typed request/response

---

### 🎓 Best Practices Summary

1. **Always use typed imports**:
   ```typescript
   import type { VectorEmbedding } from '$lib/server/workflows';
   ```

2. **Prefer `Record<string, unknown>` over `any`**:
   ```typescript
   // ❌ Bad
   metadata: any

   // ✅ Good
   metadata: Record<string, unknown>
   ```

3. **Use XState v5 Actor pattern**:
   ```typescript
   const actor = createActor(machine);
   actor.start();
   const snapshot = actor.getSnapshot();
   ```

4. **Leverage barrel exports**:
   ```typescript
   // Single import statement
   import { workflowOrchestrator, type VectorEmbedding } from '$lib/server/workflows';
   ```

5. **Type SvelteKit endpoints**:
   ```typescript
   export const load: PageServerLoad = async (): Promise<ServerLoadResult<Data>> => {
     return { data: await fetchData() };
   };
   ```

---

### 🔗 Related Files

- **Shared Types**: `src/lib/server/workflows/shared-types.ts`
- **Barrel Exports**: `src/lib/server/workflows/index.ts`
- **Orchestrator**: `src/lib/server/workflows/orchestrator.ts`
- **Document Processing**: `src/lib/server/workflows/document-processing.ts`
- **Legal Case**: `src/lib/server/workflows/legal-case-management.ts`

---

**Next Steps**: Continue migrating XState usage across the codebase and gradually tighten types in orchestrator.ts by replacing remaining `any` types with proper Actor/Snapshot types from shared-types.ts.
