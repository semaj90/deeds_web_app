# Phase 3 Store Consolidation & AI Infrastructure Refactor

## 🎯 Objective
Transform the Legal AI Platform from 74+ scattered store files into a clean, unified architecture with:
- **7 canonical Svelte 5 stores** (rune-based, type-safe)
- **Unified AI service orchestrator** (TensorRT-LLM → vLLM → Ollama routing)
- **Consolidated vector search** (pgvector + Qdrant with RRF)
- **Multi-provider health monitoring** with automatic failover

---

## 📊 Current State Analysis

### Store Bloat Problem
```
74 store files (462+ KB)
├── Duplicates: ai-assistant (2x), auth (2x), chat (2x), evidence (4x)
├── Unused: ai-chat-store-new.ts (0 bytes), analytics.ts (224 bytes)
├── Legacy: Various v4/old patterns, non-Svelte 5 runes
└── Mixed patterns: Some with $state, some with writable, some with classes
```

### AI Infrastructure Sprawl
```
28 AI server files (~420 KB)
├── 3 RAG implementations (need consolidation)
├── 3 orchestrators (need unification)
├── Inconsistent provider handling (Ollama, vLLM, OpenAI, TensorRT)
├── No unified health monitoring
└── No automatic provider fallback
```

---

## ✅ Phase 3 Implementation Plan

### STEP 1: Store Consolidation (Task #1)

**Target Structure**:
```
src/lib/stores/
├── index.ts                  # Barrel exports (keep)
├── auth.svelte.ts            # Auth + session (Svelte 5 $state)
├── ai-assistant.svelte.ts    # AI assistant state (Svelte 5 $state)
├── chat.svelte.ts            # Chat messages (Svelte 5 $state)
├── evidence.svelte.ts        # Evidence management
├── cases.svelte.ts           # Case management
└── types.ts                  # Shared types
```

**Consolidation Rules**:

1. **For auth stores** (currently 2 versions):
   - Keep: `auth.svelte.ts` (14.7 KB, has getSessionId + session logic)
   - Delete: `enhanced-auth.svelte.ts` (14.3 KB, similar)
   - Delete: `global-user-store.svelte.ts` (14.8 KB, different layer)
   - Merge sessionManager logic into auth.svelte.ts if useful

2. **For AI assistant** (currently 2 versions):
   - Keep: `ai-assistant.svelte.ts` (22.9 KB, latest)
   - Delete: `aiAssistant.svelte.ts` (23.2 KB, older naming)
   - Verify: Has proper Svelte 5 $state runes
   - Add: Integration with new ai-service-orchestrator

3. **For chat** (currently 2 versions):
   - Keep: `chat.svelte.ts` (9.2 KB, minimal)
   - Delete: `ai-chat-store.svelte.ts` (12.8 KB, more complex)
   - Delete: `chatStore.ts` (20.8 KB, writable-based)
   - Reason: chat.svelte.ts is cleanest, Svelte 5 ready

4. **For evidence** (currently 4 versions):
   - Keep: `evidence.svelte.ts` (exists?)
   - If not: Choose from: `evidence-store.ts` (12.5 KB), `evidence-global-store.svelte.ts` (17.1 KB)
   - Consolidate: evidence-workflow, evidence-unified, evidenceStore into ONE
   - Add: Vector search integration

5. **For cases** (currently 2+ versions):
   - Keep: `cases.svelte.ts` OR `legal-case.svelte.ts`
   - Delete duplicates

6. **Delete all other files**: 50+ files with AI, analytics, notifications, etc.

**Why this consolidation matters**:
- 🚀 Reduces bundle size by ~350 KB
- 📦 Single source of truth per concept
- 🔄 Easier testing and debugging
- 💾 Better tree-shaking for unused code
- 🧠 Svelte 5 $state/runes consistency

---

### STEP 2: Fix gpu-summary-store.svelte.ts (Task #2)

**Current Issues** (from copilot-instructions.md):

1. ❌ **`getSessionId()` doesn't exist on GPUMetricsBatcher**
   ```typescript
   // Before (line with error)
   state.sessionId = gpuMetricsBatcher.getSessionId();

   // After (fix)
   import { randomUUID } from 'crypto';
   state.sessionId = randomUUID(); // Generate unique session ID
   // TODO: If gpuMetricsBatcher.getSessionId() is intended, update type definition
   ```

2. ❌ **`state` should be `const` not `let`**
   ```typescript
   // Before
   let state = $state({ ... });

   // After
   const state = $state({ ... });
   ```

3. ❌ **`frameCount` is incremented but never used**
   ```typescript
   // Before
   let frameCount = 0;
   frameCount++; // Unused

   // After
   // Remove frameCount entirely
   ```

4. ❌ **`summaryUpdateInterval` should be `const`**
   ```typescript
   // Before
   let summaryUpdateInterval = ...;

   // After
   const summaryUpdateInterval = ...;
   ```

---

### STEP 3: Create AI Service Orchestrator (Task #3)

**Architecture**:
```typescript
// src/lib/services/ai-service-orchestrator.ts

export class AIServiceOrchestrator {
  private providers: Map<string, AIProvider> = new Map();
  private health: HealthMonitor;

  constructor() {
    // Tier 1: TensorRT-LLM via Triton
    this.providers.set('tensorrt', new TensorRTProvider());

    // Tier 2: vLLM with custom OpenAI routing
    this.providers.set('vllm', new VLLMProvider());

    // Tier 3: Ollama local fallback
    this.providers.set('ollama', new OllamaProvider());

    this.health = new HealthMonitor(this.providers);
  }

  async inference(request: InferenceRequest): Promise<InferenceResponse> {
    // 1. Get healthy providers (30s health check)
    const healthy = await this.health.getHealthyProviders();

    // 2. Try Tier 1 (TensorRT) first
    if (healthy.has('tensorrt')) {
      try {
        return await this.providers.get('tensorrt')!.inference(request);
      } catch (err) {
        console.warn('TensorRT failed, trying vLLM');
      }
    }

    // 3. Try Tier 2 (vLLM)
    if (healthy.has('vllm')) {
      try {
        return await this.providers.get('vllm')!.inference(request);
      } catch (err) {
        console.warn('vLLM failed, trying Ollama');
      }
    }

    // 4. Try Tier 3 (Ollama)
    if (healthy.has('ollama')) {
      return await this.providers.get('ollama')!.inference(request);
    }

    throw new Error('All AI providers unavailable');
  }

  async generateEmbedding(text: string): Promise<number[]> {
    // Always use Ollama's nomic-embed-text for embeddings
    return await this.providers.get('ollama')!.embed(text);
  }
}
```

**File Structure**:
```
src/lib/services/
├── ai-service-orchestrator.ts    (unified entry point)
├── providers/
│   ├── tensorrt-triton/
│   │   ├── index.ts
│   │   ├── triton-client.ts
│   │   └── schema.ts
│   ├── vllm-openai/
│   │   ├── index.ts
│   │   ├── openai-router.ts
│   │   └── schema.ts
│   ├── ollama/
│   │   ├── index.ts
│   │   ├── ollama-client.ts
│   │   └── schema.ts
│   └── utils/
│       ├── health-monitor.ts
│       ├── rate-limiter.ts
│       └── request-logger.ts
├── vector-search-service.ts      (pgvector + Qdrant)
└── rag-pipeline-unified.ts       (consolidated)
```

---

### STEP 4: Vector Search Service (Task #5)

**Key Features**:
- 🔍 **Dual-backend**: pgvector (primary) + Qdrant (fallback)
- 🎯 **Reciprocal Rank Fusion** for result merging
- 💾 **Redis caching** (900s TTL)
- 🔄 **Automatic fallback** if primary fails
- 📊 **Search statistics** (hit rate, latency)

```typescript
// src/lib/services/vector-search-service.ts

export class VectorSearchService {
  async search(
    embedding: number[],
    limit: number = 10,
    threshold: number = 0.7
  ): Promise<SearchResult[]> {
    // 1. Check Redis cache
    const cached = await redis.get(`search:${hash(embedding)}`);
    if (cached) return JSON.parse(cached);

    // 2. Try pgvector first (faster)
    try {
      const pgResults = await this.searchPgVector(embedding, limit, threshold);
      if (pgResults.length > 0) {
        await redis.set(`search:${hash(embedding)}`, JSON.stringify(pgResults), 'EX', 900);
        return pgResults;
      }
    } catch (err) {
      console.warn('pgvector search failed:', err);
    }

    // 3. Fallback to Qdrant
    try {
      const qdrantResults = await this.searchQdrant(embedding, limit, threshold);
      if (qdrantResults.length > 0) {
        await redis.set(`search:${hash(embedding)}`, JSON.stringify(qdrantResults), 'EX', 900);
        return qdrantResults;
      }
    } catch (err) {
      console.warn('Qdrant search failed:', err);
    }

    return [];
  }

  private async searchPgVector(
    embedding: number[],
    limit: number,
    threshold: number
  ): Promise<SearchResult[]> {
    // PostgreSQL cosine similarity search
    return await db.query(`
      SELECT
        id,
        content,
        1 - (embedding <=> $1) as similarity
      FROM documents
      WHERE 1 - (embedding <=> $1) > $2
      ORDER BY similarity DESC
      LIMIT $3
    `, [embedding, threshold, limit]);
  }

  private async searchQdrant(
    embedding: number[],
    limit: number,
    threshold: number
  ): Promise<SearchResult[]> {
    // Qdrant vector similarity search
    return await qdrant.search({
      collection_name: 'legal_documents',
      query_vector: embedding,
      limit,
      score_threshold: threshold,
    });
  }
}
```

---

### STEP 5: Health Monitor (Task #7)

**30-second health check cycle**:
```typescript
// src/lib/services/providers/utils/health-monitor.ts

export class HealthMonitor {
  private checkInterval = 30 * 1000; // 30 seconds
  private timeout = 5 * 1000; // 5 second timeout
  private health: Map<string, ProviderHealth> = new Map();

  async checkAllProviders() {
    // TensorRT/Triton
    this.health.set('tensorrt', await this.checkTensorRT());

    // vLLM
    this.health.set('vllm', await this.checkVLLM());

    // Ollama
    this.health.set('ollama', await this.checkOllama());

    // pgvector
    this.health.set('pgvector', await this.checkPgVector());

    // Qdrant
    this.health.set('qdrant', await this.checkQdrant());

    // Redis
    this.health.set('redis', await this.checkRedis());
  }

  getHealthyProviders(): Set<string> {
    return new Set(
      Array.from(this.health.entries())
        .filter(([_, health]) => health.isHealthy)
        .map(([name, _]) => name)
    );
  }
}
```

---

### STEP 6: Multi-Provider Routing (Task #6)

**Smart routing logic**:
```typescript
// Decide which provider to use based on:
// 1. Health status (30s checks)
// 2. Request type (embed → always Ollama, inference → TensorRT first)
// 3. Model availability
// 4. Load balancing
// 5. Latency metrics

const routing = {
  embeddings: 'ollama', // Always Ollama for embeds (fast, local)
  inference: [
    { provider: 'tensorrt', weight: 0.7 }, // TensorRT if healthy
    { provider: 'vllm', weight: 0.2 },      // vLLM fallback
    { provider: 'ollama', weight: 0.1 }     // Ollama as last resort
  ],
  reasoning: [
    { provider: 'tensorrt', weight: 0.6 },
    { provider: 'vllm', weight: 0.4 }
  ]
};
```

---

## 🐳 Docker Stack Configuration

**docker-compose.yml structure**:
```yaml
version: '3.8'
services:
  # Inference Servers
  triton:
    image: nvcr.io/nvidia/tritonserver:24.10-py3
    ports: [8000:8000, 8001:8001, 8002:8002]
    volumes: [./models/triton:/models]
    environment:
      - NVIDIA_VISIBLE_DEVICES=0

  vllm:
    image: vllm/vllm-openai:latest
    ports: [8001:8000]
    environment:
      - MODEL_NAME=meta-llama/Llama-2-7b

  ollama:
    image: ollama/ollama:latest
    ports: [11434:11434]
    volumes: [ollama-data:/root/.ollama]

  # Vector Databases
  postgres:
    image: pgvector/pgvector:pg16
    ports: [5432:5432]
    volumes: [postgres-data:/var/lib/postgresql/data]

  qdrant:
    image: qdrant/qdrant:latest
    ports: [6333:6333]
    volumes: [qdrant-data:/qdrant/storage]

  # Cache
  redis:
    image: redis:7-alpine
    ports: [6379:6379]

  # Frontend
  sveltekit:
    build: .
    ports: [5173:5173]
    depends_on: [triton, vllm, ollama, postgres, qdrant, redis]
```

---

## 📋 Implementation Checklist

- [ ] **Task 1**: Identify canonical versions of each store (auth, ai-assistant, chat, evidence, cases)
- [ ] **Task 1**: Delete 67 redundant store files
- [ ] **Task 1**: Update index.ts barrel exports with 7 canonical stores
- [ ] **Task 2**: Fix gpu-summary-store.svelte.ts (4 issues)
- [ ] **Task 3**: Create ai-service-orchestrator.ts
- [ ] **Task 3**: Implement TensorRT provider wrapper
- [ ] **Task 3**: Implement vLLM provider wrapper
- [ ] **Task 3**: Implement Ollama provider wrapper
- [ ] **Task 5**: Create vector-search-service.ts with pgvector + Qdrant
- [ ] **Task 6**: Implement multi-provider routing logic
- [ ] **Task 7**: Create health-monitor.ts with 30s check cycle
- [ ] **Task 9**: Update docker-compose.yml with Triton, vLLM, Ollama
- [ ] **Task 10**: Write Playwright E2E tests for routing/fallback

---

## 🚀 Success Metrics

| Metric | Before | After | Target |
|--------|--------|-------|--------|
| Store files | 74 | 7 | ✅ 90% reduction |
| AI server duplication | 3 RAG, 3 orchestrators | 1 of each | ✅ 100% consolidation |
| Health check frequency | None | Every 30s | ✅ Continuous |
| Provider failover | Manual | Automatic | ✅ Zero-downtime |
| Bundle size (stores) | 462 KB | ~50 KB | ✅ 89% smaller |
| Vector search latency | N/A | <100ms cached | ✅ Fast |

---

## 📅 Implementation Timeline

- **Day 1**: Store consolidation (Task #1, #2) — 2-3 hours
- **Day 2**: Orchestrator + providers (Task #3, #6) — 4-5 hours
- **Day 3**: Vector search + health monitor (Task #5, #7) — 3-4 hours
- **Day 4**: Docker integration + testing (Task #9, #10) — 3-4 hours

**Total**: 12-16 hours of focused development

---

## Next Immediate Action

```bash
# 1. List stores and identify duplicates
ls -1 src/lib/stores/*.svelte.ts src/lib/stores/*.ts | sort

# 2. Back up current stores
cp -r src/lib/stores src/lib/stores.backup-$(date +%s)

# 3. Start Task #1 consolidation
```

---

**Start Point**: Task #1 - Store Consolidation
**Files to Keep**: auth.svelte.ts, ai-assistant.svelte.ts, chat.svelte.ts, evidence.svelte.ts, cases.svelte.ts, types.ts, index.ts
**Files to Delete**: 67 duplicates/unused stores
**Estimated Time**: 2-3 hours
