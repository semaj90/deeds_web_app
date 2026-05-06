# Comprehensive Consolidation Roadmap
**Date**: February 7, 2026
**Goal**: Fix svelte-check errors + Consolidate types & services + Implement RAG/KAG/DAG + Gemma3 VLM/YOLO

---

## 🎯 Phase 1: Top 100 Error Files (Priority 1)

### Current Status
- **Total Errors**: 1,443
- **Affected Files**: 375
- **Target**: Fix top 100 highest-impact files first

### Strategy
1. **CSS Spacing Errors** (✅ DONE)
   - Fixed 6 core routes
   - Pattern: `focus: border` → `focus:border`

2. **Import/Type Errors** (NEXT)
   - Missing imports
   - Type mismatches
   - XState v5 migration issues

3. **Svelte 5 Migration** (IN PROGRESS)
   - `export let` → `$props()`
   - `$:` → `$derived()` / `$effect()`
   - Event handlers: `on:click` → `onclick`

---

## 🎯 Phase 2: All-Routes Data Persistence

### Current Implementation
Location: `sveltekit-frontend/src/routes/(app)/all-routes/`

**Files:**
- `+page.svelte` - SSE-based real-time updates
- `+page.server.ts` - Server data loading
- `__tests__/page.test.ts` - Vite tests

### Data Flow
```
┌─────────────────┐
│ +page.server.ts │ → Load routes from DB/API
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│  +page.svelte   │ → Display routes + SSE updates
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│ /api/routes/    │ → SSE endpoint for real-time
│     events      │    health status changes
└─────────────────┘
```

### Action Items
- [ ] **Verify Vite tests pass** (`npm run test`)
- [ ] **Add data persistence tests**
  - Route health updates save to DB
  - Error count changes persist
  - SSE reconnection handling
- [ ] **Implement save endpoint** (`/api/routes/save`)
- [ ] **Add optimistic UI updates**

---

## 🎯 Phase 3: Shared Types Consolidation

### 3.1 RAG/KAG/DAG Types

**Current State:** Scattered across 20+ files

**Consolidate Into:**
```typescript
// src/lib/types/knowledge-graph.ts
export interface RAGConfig {
  endpoint: string;
  grpcPort: number;
  restPort: number;
  useGrpc: boolean;
  timeout: number;
  embeddingModel: 'embeddinggemma:latest' | 'nomic-embed-text';
}

export interface KAGNode {
  id: string;
  type: 'entity' | 'concept' | 'document';
  properties: Record<string, unknown>;
  embeddings?: number[];
}

export interface KAGEdge {
  source: string;
  target: string;
  relation: string;
  weight: number;
  metadata?: Record<string, unknown>;
}

export interface KAGGraph {
  nodes: KAGNode[];
  edges: KAGEdge[];
  metadata: {
    version: string;
    created: Date;
    updated: Date;
  };
}

export interface DAGWorkflow {
  id: string;
  name: string;
  nodes: DAGNode[];
  edges: DAGEdge[];
  status: 'pending' | 'running' | 'completed' | 'failed';
}

export interface DAGNode {
  id: string;
  type: 'task' | 'decision' | 'merge';
  handler: string;
  config: Record<string, unknown>;
  dependencies: string[];
}

export interface DAGEdge {
  from: string;
  to: string;
  condition?: string;
}

// RAG Pipeline Types
export interface RAGQuery {
  query: string;
  userId: string;
  contextWindow: number;
  topK: number;
  threshold: number;
  filters?: Record<string, unknown>;
}

export interface RAGResponse {
  answer: string;
  sources: RAGSource[];
  confidence: number;
  processingTime: number;
  model: string;
}

export interface RAGSource {
  id: string;
  text: string;
  score: number;
  metadata: Record<string, unknown>;
}
```

### 3.2 Gemma3 VLM Types

**New File:** `src/lib/types/gemma3-vlm.ts`

```typescript
export interface Gemma3VLMConfig {
  modelPath: string;
  ollamaEndpoint: string;
  model: 'gemma3-legal:latest';
  maxTokens: number;
  temperature: number;
}

export interface VLMImageInput {
  imageData: string | ArrayBuffer;
  mimeType: string;
  width: number;
  height: number;
}

export interface VLMAnalysisRequest {
  image: VLMImageInput;
  prompt: string;
  mode: 'ocr' | 'description' | 'legal-analysis' | 'entity-extraction';
  context?: string;
}

export interface VLMAnalysisResponse {
  text: string;
  entities?: VLMEntity[];
  confidence: number;
  processingTime: number;
  metadata: {
    model: string;
    tokensUsed: number;
  };
}

export interface VLMEntity {
  type: 'person' | 'organization' | 'location' | 'date' | 'legal-term';
  text: string;
  boundingBox?: {
    x: number;
    y: number;
    width: number;
    height: number;
  };
  confidence: number;
}
```

### 3.3 YOLO Integration Types

**New File:** `src/lib/types/yolo.ts`

```typescript
export interface YOLOConfig {
  modelPath: string;
  confidenceThreshold: number;
  iouThreshold: number;
  inputSize: [number, number];
  gpuAcceleration: boolean;
}

export interface YOLODetection {
  class: string;
  confidence: number;
  bbox: {
    x: number;
    y: number;
    width: number;
    height: number;
  };
  metadata?: Record<string, unknown>;
}

export interface YOLOAnalysisResult {
  detections: YOLODetection[];
  processingTime: number;
  imageSize: [number, number];
  model: string;
}

// Legal document specific
export interface LegalDocumentYOLO {
  signatures: YOLODetection[];
  seals: YOLODetection[];
  tables: YOLODetection[];
  headers: YOLODetection[];
  annotations: YOLODetection[];
}
```

---

## 🎯 Phase 4: Service Consolidation

### 4.1 Caching Services (8 → 1 Unified Service)

**New File:** `src/lib/services/unified-cache-service.ts`

```typescript
import Redis from 'ioredis';
import type { EmbeddingResponse } from '$lib/types/enhanced-rag-types';

export class UnifiedCacheService {
  private redis: Redis;
  private nesGpuCache: Map<string, unknown>;
  private embeddingCache: Map<string, EmbeddingResponse>;

  constructor() {
    this.redis = new Redis(process.env.REDIS_URL);
    this.nesGpuCache = new Map();
    this.embeddingCache = new Map();
  }

  // Redis operations
  async getRedis(key: string): Promise<unknown> { }
  async setRedis(key: string, value: unknown, ttl?: number): Promise<void> { }

  // NES GPU Cache (in-memory, high-speed)
  getNesGpu(key: string): unknown { }
  setNesGpu(key: string, value: unknown): void { }

  // Embedding cache (specialized for embeddinggemma:latest)
  async getEmbedding(text: string): Promise<EmbeddingResponse | null> { }
  async setEmbedding(text: string, embedding: EmbeddingResponse): Promise<void> { }

  // Invalidation
  async invalidate(pattern: string): Promise<void> { }
  async clear(): Promise<void> { }
}
```

**Consolidate These Files:**
- `caching-service.ts` → Core Redis logic
- `comprehensive-caching-architecture.ts` → Advanced features
- `enhanced-caching-service.ts` → Merge strategies
- `caching-service-stub.ts` → DELETE (stub)
- NES GPU caching → Integrate into unified service

### 4.2 CouchDB Service (1 file, verify usage)

**File:** `src/lib/services/couchdb-client.ts`

**Usage Check:**
```bash
# Find all CouchDB references
grep -r "CouchDB\|couchdb-client" sveltekit-frontend/src --include="*.ts" --include="*.svelte"
```

**Decision:**
- ✅ **KEEP** if actively used for error_graph, llm_summaries
- ❌ **ARCHIVE** if replaced by PostgreSQL + pgvector

### 4.3 Embedding Service (14 → 2 files)

**Primary:** `src/lib/services/embedding-service.ts` (unified)

```typescript
export class EmbeddingService {
  private model: 'embeddinggemma:latest' | 'nomic-embed-text';
  private cache: UnifiedCacheService;

  async generateEmbedding(text: string): Promise<number[]> {
    // Check cache first
    const cached = await this.cache.getEmbedding(text);
    if (cached) return cached.embedding;

    // Generate with embeddinggemma:latest (PRIMARY)
    const embedding = await this.ollamaEmbed(text, 'embeddinggemma:latest');

    // Cache result
    await this.cache.setEmbedding(text, {
      embedding,
      dimensions: embedding.length,
      model: 'embeddinggemma:latest'
    });

    return embedding;
  }

  async batchEmbed(texts: string[]): Promise<number[][]> { }
}
```

**Archive 12 duplicate embedding services**

---

## 🎯 Phase 5: Implementation Priorities

### Week 1: Error Fixes + Types
- [ ] Fix top 100 svelte-check error files
- [ ] Consolidate RAG/KAG/DAG types into `knowledge-graph.ts`
- [ ] Create Gemma3 VLM types (`gemma3-vlm.ts`)
- [ ] Create YOLO types (`yolo.ts`)

### Week 2: Service Consolidation
- [ ] Create `unified-cache-service.ts`
- [ ] Consolidate 8 caching services → 1
- [ ] Consolidate 14 embedding services → 2
- [ ] Verify CouchDB usage (keep or archive)

### Week 3: RAG/KAG/DAG Implementation
- [ ] Implement KAG graph builder
- [ ] Implement DAG workflow orchestrator
- [ ] Connect to embeddinggemma:latest
- [ ] Add Redis caching layer

### Week 4: VLM + YOLO Integration
- [ ] Implement Gemma3 VLM service
- [ ] Integrate YOLO object detection
- [ ] Connect to legal document processing pipeline
- [ ] Add comprehensive tests

---

## 📊 Expected Results

| Metric | Before | After | Improvement |
|--------|--------|-------|-------------|
| **Errors** | 1,443 | <100 | 93% reduction |
| **Service Files** | 519 | ~50 | 90% reduction |
| **Type Files** | 30+ scattered | 10 consolidated | 67% reduction |
| **Build Time** | Slow/timeout | <2 min | 80% faster |
| **Type Safety** | Partial | Full | 100% coverage |

---

## 🚀 Quick Start

```bash
# 1. Run tests to verify current state
npm run test

# 2. Start with error fixes
npm run check

# 3. Create type consolidation PR
git checkout -b feature/type-consolidation

# 4. Implement unified cache service
git checkout -b feature/unified-cache
```

---

**Status**: Ready for execution
**Next Action**: Review and approve this roadmap