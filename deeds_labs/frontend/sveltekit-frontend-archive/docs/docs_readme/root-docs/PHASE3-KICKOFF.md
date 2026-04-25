# 🚀 Phase 3 Kickoff: AI Service Architecture Implementation

**Date**: 2025-10-15
**Status**: 🟢 ACTIVE
**Prerequisites**: ✅ Phase 2 Complete (Store Consolidation)

---

## 📊 Current State Assessment

### ✅ Existing AI Infrastructure (Already Built)

You already have extensive AI infrastructure in place:

**RAG Implementations** (3 variants found):
- `src/lib/server/ai/rag-pipeline-enhanced.ts` - LangChain + Ollama + pgvector
- `src/lib/server/ai/rag-pipeline.ts` - Basic RAG with PostgreSQL
- `langchain-rag-service/main.py` - Python FastAPI RAG service

**AI Orchestrators** (2 implementations):
- `src/lib/server/ai/enhanced-ai-synthesis-orchestrator.ts` - XState v5 + multi-vector search
- `src/lib/server/ai/enhanced-orchestrator.ts` - Simplified orchestrator with Neo4j + pgvector

**Vector Databases**:
- ✅ PostgreSQL with pgvector extension (active)
- ✅ Qdrant (Docker, port 6333) - ready but not fully integrated
- ✅ Neo4j (Docker) - partial integration

**LLM Providers**:
- ✅ Ollama (localhost:11434) - `gemma3-legal`, `nomic-embed-text`
- ⏳ vLLM (mentioned in architecture docs)
- ⏳ WebAssembly inference (partial implementation)
- ❌ OpenAI/Anthropic (not yet integrated)

**Supporting Services**:
- ✅ Redis (caching, pub/sub)
- ✅ MinIO (document storage)
- ✅ RabbitMQ (async processing)
- ✅ Enhanced RAG Go service (port 8094)

**AI Stores**:
- `src/lib/stores/ai-assistant.svelte.ts` (22,995 bytes) - Multi-backend store ✅ CANONICAL
- `src/lib/stores/ai-chat-store.svelte.ts` - Additional chat store
- `src/lib/stores/ai-unified.ts` - Unified AI interface
- `src/lib/stores/gpu-summary-store.svelte.ts` - GPU metrics ✅ NO ERRORS

---

## 🎯 Phase 3 Objectives

### Goal: Consolidate & Enhance AI Architecture

Instead of building from scratch, we need to:

1. **Consolidate Duplicate Implementations**
   - Merge 3 RAG pipelines into one canonical version
   - Unify 2 orchestrators into single service
   - Standardize on Svelte 5 runes pattern

2. **Complete Missing Integrations**
   - Full Qdrant integration for high-performance vector search
   - Multi-provider routing (Ollama → vLLM → OpenAI fallback)
   - Health monitoring with automatic failover

3. **Optimize Performance**
   - Leverage GPU acceleration (RTX 3060 Ti)
   - Redis caching for embeddings
   - WebAssembly browser-side inference

4. **Production Readiness**
   - Error handling and retry logic
   - Rate limiting and cost management
   - Monitoring and observability

---

## 🗺️ Implementation Roadmap

### Week 1: Consolidation & Audit

**Task 1.1: RAG Pipeline Audit** ⏱️ 4 hours
```bash
# Analyze existing RAG implementations
- rag-pipeline-enhanced.ts: 1,200+ lines, LangChain.js, comprehensive
- rag-pipeline.ts: 800 lines, simpler, PostgreSQL-focused
- Python RAG service: FastAPI, separate process

# Decision: Keep rag-pipeline-enhanced.ts as canonical, refactor others
```

**Task 1.2: Create AI Service Orchestrator** ⏱️ 6 hours
```typescript
// File: src/lib/services/ai-service-orchestrator.ts
// Purpose: Unified entry point for all AI operations

import { aiAssistant } from '$lib/stores/ai-assistant.svelte.ts';
import { EnhancedLegalRAGPipeline } from '$lib/server/ai/rag-pipeline-enhanced';
import type { AIProvider, AITask } from '$lib/types/ai-types';

export class AIServiceOrchestrator {
  private providers: Map<string, AIProvider> = new Map();
  private ragPipeline: EnhancedLegalRAGPipeline;
  private healthMonitor: AIHealthMonitor;

  async initialize() {
    // Register providers
    this.registerProvider(new OllamaProvider());
    this.registerProvider(new VLLMProvider());
    this.registerProvider(new WebAssemblyProvider());

    // Initialize RAG pipeline
    this.ragPipeline = new EnhancedLegalRAGPipeline({
      ollama: { embeddingModel: 'nomic-embed-text' }
    });
    await this.ragPipeline.initialize();

    // Start health monitoring
    this.healthMonitor = new AIHealthMonitor(this.providers);
    await this.healthMonitor.start();
  }

  async processQuery(query: string, options?: AITaskOptions) {
    // 1. Determine task complexity
    const task = this.analyzeTask(query);

    // 2. Select optimal provider
    const provider = this.selectProvider(task);

    // 3. Retrieve context via RAG
    const context = await this.ragPipeline.retrieveContext(query);

    // 4. Generate response
    const response = await provider.inference(query, { context });

    // 5. Cache result
    await this.cacheResponse(query, response);

    return response;
  }

  private selectProvider(task: AITask): AIProvider {
    // Intelligent routing logic
    const healthyProviders = this.healthMonitor.getHealthyProviders();

    switch (task.complexity) {
      case 'simple':
        return healthyProviders.get('ollama') || healthyProviders.get('wasm');
      case 'complex':
        return healthyProviders.get('vllm') || healthyProviders.get('ollama');
      case 'specialized':
        return healthyProviders.get('openai'); // Fallback for critical tasks
      default:
        return healthyProviders.values().next().value;
    }
  }
}

export const aiOrchestrator = new AIServiceOrchestrator();
```

**Task 1.3: Vector Search Service** ⏱️ 5 hours
```typescript
// File: src/lib/services/vector-search-service.ts
// Purpose: Unified interface for pgvector + Qdrant

import { QdrantClient } from '@qdrant/js-client-rest';
import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';

export class VectorSearchService {
  private qdrant: QdrantClient;
  private pgVector: ReturnType<typeof drizzle>;

  async initialize() {
    // Qdrant for high-performance search
    this.qdrant = new QdrantClient({
      url: 'http://localhost:6333'
    });

    // PostgreSQL pgvector for relational + vector
    const sql = postgres(process.env.DATABASE_URL);
    this.pgVector = drizzle(sql);
  }

  async embed(text: string): Promise<Float32Array> {
    // Use Ollama nomic-embed-text
    const response = await fetch('http://localhost:11434/api/embeddings', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ model: 'nomic-embed-text', prompt: text })
    });
    const { embedding } = await response.json();
    return new Float32Array(embedding);
  }

  async searchHybrid(query: string, options: SearchOptions): Promise<SearchResult[]> {
    const embedding = await this.embed(query);

    // Parallel search across both databases
    const [qdrantResults, pgResults] = await Promise.all([
      this.searchQdrant(embedding, options),
      this.searchPGVector(embedding, options)
    ]);

    // Merge and rerank results
    return this.mergeResults(qdrantResults, pgResults);
  }

  private async searchQdrant(embedding: Float32Array, options: SearchOptions) {
    return this.qdrant.search('legal-documents', {
      vector: Array.from(embedding),
      limit: options.limit || 10,
      score_threshold: options.threshold || 0.7
    });
  }

  private async searchPGVector(embedding: Float32Array, options: SearchOptions) {
    // Use pgvector extension for cosine similarity
    return this.pgVector.execute(sql`
      SELECT id, content, metadata,
             1 - (embedding <=> ${embedding}::vector) as similarity
      FROM legal_documents
      WHERE 1 - (embedding <=> ${embedding}::vector) > ${options.threshold || 0.7}
      ORDER BY embedding <=> ${embedding}::vector
      LIMIT ${options.limit || 10}
    `);
  }
}

export const vectorSearch = new VectorSearchService();
```

### Week 2: Multi-Provider Integration

**Task 2.1: Provider Configuration** ⏱️ 3 hours
```typescript
// File: src/lib/config/ai-providers.ts

export interface AIProviderConfig {
  name: string;
  baseUrl: string;
  models: string[];
  cost: 'free' | 'low' | 'medium' | 'high';
  streaming: boolean;
  healthEndpoint: string;
}

export const aiProviders: Record<string, AIProviderConfig> = {
  ollama: {
    name: 'Ollama (Local)',
    baseUrl: 'http://localhost:11434',
    models: ['gemma3-legal:latest', 'nomic-embed-text:latest'],
    cost: 'free',
    streaming: true,
    healthEndpoint: '/api/tags'
  },

  vllm: {
    name: 'vLLM (Self-Hosted)',
    baseUrl: 'http://localhost:8000',
    models: ['mistral-7b-instruct', 'llama-2-13b-chat'],
    cost: 'low',
    streaming: true,
    healthEndpoint: '/health'
  },

  enhancedRAG: {
    name: 'Enhanced RAG (Go Service)',
    baseUrl: 'http://localhost:8094',
    models: ['enhanced-rag-legal'],
    cost: 'free',
    streaming: false,
    healthEndpoint: '/health'
  },

  openai: {
    name: 'OpenAI GPT-4',
    baseUrl: 'https://api.openai.com/v1',
    models: ['gpt-4-turbo', 'gpt-3.5-turbo'],
    cost: 'high',
    streaming: true,
    healthEndpoint: '/models' // Requires API key
  },

  anthropic: {
    name: 'Anthropic Claude',
    baseUrl: 'https://api.anthropic.com/v1',
    models: ['claude-3-opus', 'claude-3-sonnet'],
    cost: 'high',
    streaming: true,
    healthEndpoint: '/messages' // Requires API key
  },

  wasm: {
    name: 'WebAssembly (Browser)',
    baseUrl: '/wasm/llama-cpp',
    models: ['gemma-2b-it-q4'],
    cost: 'free',
    streaming: false,
    healthEndpoint: null // Browser-based, no network health check
  }
};
```

**Task 2.2: Health Monitoring Service** ⏱️ 4 hours
```typescript
// File: src/lib/services/ai-health-monitor.ts

import Redis from 'ioredis';
import { aiProviders } from '$lib/config/ai-providers';

export class AIHealthMonitor {
  private redis: Redis;
  private healthCache: Map<string, HealthStatus> = new Map();
  private checkInterval: NodeJS.Timeout | null = null;

  async start() {
    this.redis = new Redis({ host: 'localhost', port: 6379 });

    // Initial health check
    await this.checkAllProviders();

    // Periodic monitoring (every 30 seconds)
    this.checkInterval = setInterval(() => {
      this.checkAllProviders();
    }, 30000);
  }

  async checkAllProviders() {
    for (const [name, config] of Object.entries(aiProviders)) {
      const status = await this.checkProvider(name, config);
      this.healthCache.set(name, status);

      // Cache in Redis with 60s TTL
      await this.redis.setex(
        `ai:health:${name}`,
        60,
        JSON.stringify(status)
      );
    }
  }

  private async checkProvider(name: string, config: AIProviderConfig): Promise<HealthStatus> {
    if (!config.healthEndpoint) {
      return { healthy: true, latency: 0, lastCheck: Date.now() };
    }

    const start = Date.now();
    try {
      const response = await fetch(`${config.baseUrl}${config.healthEndpoint}`, {
        signal: AbortSignal.timeout(5000)
      });

      const latency = Date.now() - start;
      return {
        healthy: response.ok,
        latency,
        lastCheck: Date.now(),
        statusCode: response.status
      };
    } catch (error) {
      return {
        healthy: false,
        latency: Date.now() - start,
        lastCheck: Date.now(),
        error: error.message
      };
    }
  }

  getHealthyProviders(): Map<string, AIProviderConfig> {
    const healthy = new Map();
    for (const [name, config] of Object.entries(aiProviders)) {
      const status = this.healthCache.get(name);
      if (status?.healthy) {
        healthy.set(name, config);
      }
    }
    return healthy;
  }
}

export const healthMonitor = new AIHealthMonitor();
```

### Week 3: RAG Enhancement & Testing

**Task 3.1: Consolidate RAG Pipelines** ⏱️ 6 hours
- Merge best features from 3 RAG implementations
- Standardize on `rag-pipeline-enhanced.ts`
- Add streaming support
- Integrate with vector-search-service

**Task 3.2: Create Unified RAG Orchestrator** ⏱️ 5 hours
```typescript
// File: src/lib/services/rag-orchestrator.ts

import { EnhancedLegalRAGPipeline } from '$lib/server/ai/rag-pipeline-enhanced';
import { vectorSearch } from './vector-search-service';
import { aiOrchestrator } from './ai-service-orchestrator';

export class RAGOrchestrator {
  private pipeline: EnhancedLegalRAGPipeline;

  async initialize() {
    this.pipeline = new EnhancedLegalRAGPipeline({
      ollama: {
        embeddingModel: 'nomic-embed-text',
        llmModel: 'gemma3-legal'
      },
      vectorSearch: {
        threshold: 0.7,
        limit: 10
      }
    });
    await this.pipeline.initialize();
  }

  async processQuery(query: string, options?: RAGOptions): Promise<RAGResponse> {
    // Step 1: Retrieve relevant documents
    const documents = await vectorSearch.searchHybrid(query, {
      limit: options?.retrievalLimit || 10,
      threshold: options?.similarityThreshold || 0.7
    });

    // Step 2: Rerank documents (if enabled)
    const reranked = options?.rerank
      ? await this.rerankDocuments(query, documents)
      : documents;

    // Step 3: Build context
    const context = this.buildContext(reranked);

    // Step 4: Generate response via AI orchestrator
    const response = await aiOrchestrator.processQuery(query, {
      context,
      provider: options?.preferredProvider
    });

    return {
      answer: response,
      sources: reranked,
      metadata: {
        retrievalCount: documents.length,
        contextTokens: this.countTokens(context),
        provider: response.provider
      }
    };
  }

  private buildContext(documents: Document[]): string {
    return documents
      .map((doc, i) => `[${i + 1}] ${doc.content}\nSource: ${doc.metadata.source}`)
      .join('\n\n---\n\n');
  }
}

export const ragOrchestrator = new RAGOrchestrator();
```

**Task 3.3: Integration Testing** ⏱️ 4 hours
```typescript
// File: tests/phase3-ai-integration.spec.ts

import { test, expect } from '@playwright/test';

test.describe('Phase 3: AI Service Integration', () => {
  test('AI orchestrator selects optimal provider', async ({ page }) => {
    await page.goto('http://localhost:5173/ai-chat');

    // Send simple query (should use Ollama)
    await page.fill('textarea[name="message"]', 'What is a contract?');
    await page.click('button[type="submit"]');

    // Verify provider selection
    const providerBadge = page.locator('[data-testid="active-provider"]');
    await expect(providerBadge).toContainText('Ollama');
  });

  test('RAG pipeline retrieves relevant context', async ({ page }) => {
    await page.goto('http://localhost:5173/ai-chat');

    // Enable RAG mode
    await page.click('[data-testid="enable-rag"]');

    // Send query requiring context
    await page.fill('textarea[name="message"]', 'Summarize the evidence in case #12345');
    await page.click('button[type="submit"]');

    // Verify sources displayed
    const sources = page.locator('[data-testid="rag-sources"]');
    await expect(sources).toBeVisible();
    await expect(sources.locator('.source-item')).toHaveCount(3); // At least 3 sources
  });

  test('Health monitor provides fallback routing', async ({ page }) => {
    // Simulate Ollama down, vLLM up
    await page.route('http://localhost:11434/**', route => route.abort());

    await page.goto('http://localhost:5173/ai-chat');
    await page.fill('textarea[name="message"]', 'Test fallback');
    await page.click('button[type="submit"]');

    // Should automatically failover to vLLM or Enhanced RAG
    const providerBadge = page.locator('[data-testid="active-provider"]');
    await expect(providerBadge).not.toContainText('Ollama');
  });

  test('Vector search returns accurate results', async ({ page }) => {
    await page.goto('http://localhost:5173/search');

    // Semantic search query
    await page.fill('input[name="search"]', 'breach of contract cases');
    await page.click('button[aria-label="Vector Search"]');

    // Verify similarity scores
    const results = page.locator('[data-testid="search-result"]');
    await expect(results).toHaveCount(10); // Default limit

    const firstScore = await results.first().locator('[data-testid="similarity-score"]').textContent();
    expect(parseFloat(firstScore)).toBeGreaterThan(0.7); // Above threshold
  });
});
```

### Week 4: Optimization & Production Readiness

**Task 4.1: Performance Optimization**
- Add Redis caching for embeddings (reduce Ollama calls)
- Implement batch processing for multiple documents
- GPU optimization for vector operations
- WebAssembly offloading for browser-side inference

**Task 4.2: Error Handling & Retry Logic**
- Exponential backoff for failed API calls
- Circuit breaker pattern for unhealthy providers
- Graceful degradation (fallback to simpler models)

**Task 4.3: Monitoring & Observability**
- Integrate with `gpu-summary-store.svelte.ts` metrics
- Add AI-specific metrics (latency, token usage, cost tracking)
- Dashboard for real-time provider health

---

## 📋 Quick Start Commands

```bash
# 1. Verify current services
docker ps  # Check PostgreSQL, Redis, Qdrant, Neo4j

# 2. Test Ollama connection
curl http://localhost:11434/api/tags

# 3. Check Enhanced RAG Go service
curl http://localhost:8094/health

# 4. Start development server
cd sveltekit-frontend
npm run dev

# 5. Run Phase 3 health check (create custom script)
node scripts/phase3-health-check.mjs
```

---

## 🎯 Success Metrics

**Technical Metrics**:
- ✅ All AI providers health-checked successfully
- ✅ RAG pipeline retrieves relevant context (>0.7 similarity)
- ✅ Provider failover works within 2 seconds
- ✅ Vector search latency <100ms for 10 results
- ✅ TypeScript errors remain stable or decrease

**User Experience Metrics**:
- ✅ AI chat responses stream in real-time
- ✅ RAG sources displayed with citations
- ✅ Provider status visible in UI
- ✅ No visible errors during provider failures

**Architecture Quality**:
- ✅ Single canonical AI orchestrator
- ✅ Consolidated RAG pipeline (down from 3 to 1)
- ✅ Type-safe provider interfaces
- ✅ Comprehensive test coverage (80%+)

---

## 🔗 Key Files Reference

**Core Services**:
- `src/lib/services/ai-service-orchestrator.ts` (NEW)
- `src/lib/services/vector-search-service.ts` (NEW)
- `src/lib/services/rag-orchestrator.ts` (NEW)
- `src/lib/services/ai-health-monitor.ts` (NEW)

**Configuration**:
- `src/lib/config/ai-providers.ts` (NEW)
- `.env` (add OPENAI_API_KEY, ANTHROPIC_API_KEY)

**Existing (To Consolidate)**:
- `src/lib/server/ai/rag-pipeline-enhanced.ts` (KEEP)
- `src/lib/server/ai/enhanced-ai-synthesis-orchestrator.ts` (REFACTOR)
- `src/lib/stores/ai-assistant.svelte.ts` (INTEGRATE)

**Testing**:
- `tests/phase3-ai-integration.spec.ts` (NEW)

---

## 🚧 Known Challenges

1. **Multiple RAG Implementations**: Need to consolidate without losing functionality
2. **Provider Credentials**: OpenAI/Anthropic require API keys (cost implications)
3. **Vector Database Performance**: Qdrant vs pgvector optimization
4. **WebAssembly Integration**: Browser WASM models have limited context windows
5. **Type Safety**: Ensure all provider interfaces match TypeScript definitions

---

## 💡 Next Steps

**Immediate Actions** (Today):
1. Run audit of existing AI files: `find src -name "*ai*" -o -name "*rag*"`
2. Test current Ollama integration: Visit http://localhost:5173/ai-chat
3. Review existing RAG pipelines for consolidation opportunities
4. Create Phase 3 health check script

**This Week**:
1. Implement `ai-service-orchestrator.ts` foundation
2. Create `vector-search-service.ts` with Qdrant + pgvector
3. Build health monitoring system
4. Write integration tests

**Next Week**:
1. Consolidate RAG pipelines
2. Add multi-provider routing
3. Optimize caching and performance
4. Production deployment preparation

---

**Ready to start Phase 3?** 🚀

Run this command to begin:
```bash
cd sveltekit-frontend
code src/lib/services/ai-service-orchestrator.ts  # Create new file
```
