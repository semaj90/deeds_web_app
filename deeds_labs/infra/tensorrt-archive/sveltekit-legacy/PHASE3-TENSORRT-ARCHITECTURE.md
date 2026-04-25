# 🚀 Phase 3: TensorRT-LLM + Triton Inference Architecture

**Date**: 2025-10-15
**Enhancement**: GPU-Accelerated Inference with TensorRT-LLM + Triton
**Status**: 🔥 PRODUCTION-GRADE ARCHITECTURE

---

## 🎯 Architecture Overview

### Primary Stack (GPU-Optimized)
```
┌─────────────────────────────────────────────────────────────┐
│                    SvelteKit Frontend                        │
│                  (AI Chat Interface)                         │
└──────────────────────┬──────────────────────────────────────┘
                       │
                       ▼
┌─────────────────────────────────────────────────────────────┐
│              AI Service Orchestrator                         │
│         (Intelligent Provider Routing)                       │
├─────────────────────────────────────────────────────────────┤
│  Priority 1: TensorRT-Triton (GPU, port 8000)               │
│  Priority 2: Ollama (CPU fallback, port 11434)              │
│  Priority 3: vLLM (optional, separate dir)                  │
│  Priority 4: OpenAI (optional, separate dir)                │
└──────────────────────┬──────────────────────────────────────┘
                       │
       ┌───────────────┼───────────────┐
       │               │               │
       ▼               ▼               ▼
┌──────────────┐ ┌──────────────┐ ┌──────────────┐
│ TensorRT-LLM │ │   Ollama     │ │ Vector DBs   │
│   + Triton   │ │ (Fallback)   │ │ (Dual Stack) │
├──────────────┤ ├──────────────┤ ├──────────────┤
│ gemma3-legal │ │ gemma3-legal │ │ pgvector     │
│ INT4 Engine  │ │ embedding    │ │ +            │
│ Port: 8000   │ │ Port: 11434  │ │ Qdrant       │
│ GPU: RTX     │ │              │ │ Port: 6333   │
│ 3060 Ti      │ │              │ │              │
└──────────────┘ └──────────────┘ └──────────────┘
```

---

## 📊 Infrastructure Components

### 1. TensorRT-LLM + Triton Inference Server

**Purpose**: Ultra-fast GPU-accelerated LLM inference (3-5x faster than Ollama)

**Configuration**:
```yaml
# Docker Compose (docker-compose.tensorrt.yml)
services:
  triton-inference:
    image: nvcr.io/nvidia/tritonserver:24.10-py3
    container_name: triton-gemma3-legal
    ports:
      - "8000:8000"   # HTTP
      - "8001:8001"   # gRPC
      - "8002:8002"   # Metrics
    volumes:
      - ./triton-models:/models
    environment:
      - CUDA_VISIBLE_DEVICES=0
    deploy:
      resources:
        reservations:
          devices:
            - driver: nvidia
              count: 1
              capabilities: [gpu]
    command: tritonserver --model-repository=/models --strict-model-config=false
```

**Model Repository Structure**:
```
triton-models/
├── gemma3-legal-tensorrt/
│   ├── config.pbtxt           # Triton model config
│   ├── 1/
│   │   ├── model.plan         # TensorRT engine (INT4 quantized)
│   │   └── config.json        # Model metadata
│   └── tokenizer/
│       ├── tokenizer.json
│       └── special_tokens_map.json
└── embeddinggemma-tensorrt/   # Optional TensorRT embeddings
    ├── config.pbtxt
    └── 1/
        └── model.plan
```

**TensorRT Engine Build** (WSL/Linux):
```bash
# File: scripts/build-tensorrt-gemma3.sh

#!/bin/bash
set -e

# Configuration
MODEL_NAME="gemma3-legal"
OLLAMA_MODEL_DIR="$HOME/.ollama/models"
OUTPUT_DIR="./triton-models/gemma3-legal-tensorrt/1"
QUANTIZATION="int4_awq"  # Options: fp16, int8, int4_awq
MAX_BATCH_SIZE=4
MAX_INPUT_LEN=2048
MAX_OUTPUT_LEN=1024

echo "🔧 Building TensorRT-LLM engine for ${MODEL_NAME}..."

# Step 1: Export Ollama model to HuggingFace format
echo "📦 Exporting from Ollama..."
ollama show ${MODEL_NAME} --modelfile > /tmp/${MODEL_NAME}.modelfile

# Step 2: Convert to TensorRT-LLM checkpoint
echo "🔄 Converting to TensorRT checkpoint..."
python3 -m tensorrt_llm.commands.convert_checkpoint \
  --model_dir ${OLLAMA_MODEL_DIR}/${MODEL_NAME} \
  --output_dir /tmp/${MODEL_NAME}_checkpoint \
  --dtype float16 \
  --quantization ${QUANTIZATION}

# Step 3: Build TensorRT engine
echo "🏗️ Building optimized TensorRT engine..."
trtllm-build \
  --checkpoint_dir /tmp/${MODEL_NAME}_checkpoint \
  --output_dir ${OUTPUT_DIR} \
  --gemm_plugin auto \
  --max_batch_size ${MAX_BATCH_SIZE} \
  --max_input_len ${MAX_INPUT_LEN} \
  --max_output_len ${MAX_OUTPUT_LEN} \
  --max_beam_width 1 \
  --use_gpt_attention_plugin float16 \
  --paged_kv_cache enable \
  --remove_input_padding enable \
  --use_custom_all_reduce disable

# Step 4: Create Triton config
echo "⚙️ Creating Triton configuration..."
cat > ./triton-models/gemma3-legal-tensorrt/config.pbtxt <<EOF
name: "gemma3-legal-tensorrt"
backend: "tensorrtllm"
max_batch_size: ${MAX_BATCH_SIZE}

input [
  {
    name: "input_ids"
    data_type: TYPE_INT32
    dims: [-1]
  },
  {
    name: "input_lengths"
    data_type: TYPE_INT32
    dims: [1]
    reshape: { shape: [ ] }
  },
  {
    name: "request_output_len"
    data_type: TYPE_INT32
    dims: [1]
  }
]

output [
  {
    name: "output_ids"
    data_type: TYPE_INT32
    dims: [-1, -1]
  }
]

instance_group [
  {
    count: 1
    kind: KIND_GPU
  }
]

parameters: {
  key: "gpt_model_type"
  value: {
    string_value: "gemma"
  }
}

parameters: {
  key: "gpt_model_path"
  value: {
    string_value: "/models/gemma3-legal-tensorrt/1/model.plan"
  }
}
EOF

echo "✅ TensorRT engine built successfully!"
echo "📊 Engine info:"
trtllm-engine-info ${OUTPUT_DIR}/model.plan
```

### 2. Dual Vector Database Setup

**pgvector (PostgreSQL)**:
```yaml
# docker-compose.tensorrt.yml
services:
  postgres-vectordb:
    image: pgvector/pgvector:pg16
    container_name: legal-ai-postgres
    ports:
      - "5432:5432"
    environment:
      POSTGRES_DB: legal_ai_db
      POSTGRES_USER: legal_admin
      POSTGRES_PASSWORD: ${POSTGRES_PASSWORD}
      POSTGRES_INITDB_ARGS: "-E UTF8"
    volumes:
      - postgres-data:/var/lib/postgresql/data
      - ./db/init-pgvector.sql:/docker-entrypoint-initdb.d/01-init.sql
    networks:
      - legal-ai-net
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U legal_admin -d legal_ai_db"]
      interval: 10s
      timeout: 5s
      retries: 5
```

**Qdrant (Vector Search)**:
```yaml
# docker-compose.tensorrt.yml
services:
  qdrant:
    image: qdrant/qdrant:v1.11.0
    container_name: legal-ai-qdrant
    ports:
      - "6333:6333"   # HTTP API
      - "6334:6334"   # gRPC API
    volumes:
      - qdrant-storage:/qdrant/storage
    networks:
      - legal-ai-net
    environment:
      - QDRANT__SERVICE__GRPC_PORT=6334
    healthcheck:
      test: ["CMD", "curl", "-f", "http://localhost:6333/health"]
      interval: 10s
      timeout: 5s
      retries: 5
```

**Docker Network**:
```yaml
networks:
  legal-ai-net:
    driver: bridge
    ipam:
      config:
        - subnet: 172.28.0.0/16

volumes:
  postgres-data:
  qdrant-storage:
  triton-models:
```

### 3. Embedding Service (embeddinggemma via Ollama)

**Configuration**:
```typescript
// src/lib/services/embedding-service.ts

import type { EmbeddingProvider } from './types';

export class EmbeddingGemmaService implements EmbeddingProvider {
  private baseUrl = 'http://localhost:11434';
  private model = 'embeddinggemma:latest';
  private cache = new Map<string, Float32Array>();

  async embed(text: string): Promise<Float32Array> {
    // Check cache first
    const cacheKey = this.hashText(text);
    if (this.cache.has(cacheKey)) {
      return this.cache.get(cacheKey)!;
    }

    // Call Ollama embeddinggemma
    const response = await fetch(`${this.baseUrl}/api/embeddings`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: this.model,
        prompt: text
      })
    });

    const { embedding } = await response.json();
    const vector = new Float32Array(embedding);

    // Cache result (with size limit)
    if (this.cache.size < 1000) {
      this.cache.set(cacheKey, vector);
    }

    return vector;
  }

  async embedBatch(texts: string[]): Promise<Float32Array[]> {
    // Batch processing with parallel requests
    const batchSize = 16;
    const results: Float32Array[] = [];

    for (let i = 0; i < texts.length; i += batchSize) {
      const batch = texts.slice(i, i + batchSize);
      const promises = batch.map(text => this.embed(text));
      const batchResults = await Promise.all(promises);
      results.push(...batchResults);
    }

    return results;
  }

  private hashText(text: string): string {
    // Simple hash for cache key
    let hash = 0;
    for (let i = 0; i < text.length; i++) {
      const char = text.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash; // Convert to 32bit integer
    }
    return hash.toString(36);
  }
}

export const embeddingService = new EmbeddingGemmaService();
```

---

## 🗂️ Reorganized Directory Structure

```
src/lib/services/
├── ai-service-orchestrator.ts          # Main orchestrator
├── vector-search-service.ts            # Dual vector DB wrapper
├── embedding-service.ts                # embeddinggemma via Ollama
├── rag-orchestrator.ts                 # Consolidated RAG
├── health-monitor.ts                   # Service health checks
│
├── providers/                          # Provider implementations
│   ├── tensorrt-triton/               # Primary provider (NEW)
│   │   ├── triton-client.ts          # gRPC/HTTP client
│   │   ├── tokenizer.ts              # Gemma tokenizer
│   │   ├── types.ts                  # TensorRT-specific types
│   │   └── config.ts                 # Model configuration
│   │
│   ├── ollama/                        # Fallback provider
│   │   ├── ollama-client.ts          # Existing Ollama integration
│   │   ├── streaming.ts              # Streaming support
│   │   └── models.ts                 # Model management
│   │
│   ├── vllm/                          # Optional (move to separate)
│   │   ├── vllm-client.ts
│   │   └── config.ts
│   │
│   └── openai/                        # Optional (move to separate)
│       ├── openai-client.ts
│       └── config.ts
│
└── types/
    ├── ai-provider.ts                 # Provider interface
    ├── vector-search.ts               # Vector DB types
    └── rag.ts                         # RAG types
```

**Migration Plan**:
```typescript
// OLD (current scattered structure)
src/lib/server/ai/ollama-service.ts
src/lib/server/ai/ollama-config.ts
src/lib/server/ai/embeddings.ts

// NEW (organized structure)
src/lib/services/providers/ollama/ollama-client.ts
src/lib/services/providers/ollama/config.ts
src/lib/services/embedding-service.ts  // Abstraction over Ollama embeddings
```

---

## 💻 Implementation: AI Service Orchestrator

```typescript
// src/lib/services/ai-service-orchestrator.ts

import { TritonInferenceClient } from './providers/tensorrt-triton/triton-client';
import { OllamaClient } from './providers/ollama/ollama-client';
import { HealthMonitor } from './health-monitor';
import { embeddingService } from './embedding-service';
import type { AIProvider, InferenceRequest, InferenceResponse } from './types/ai-provider';

export class AIServiceOrchestrator {
  private providers: Map<string, AIProvider> = new Map();
  private healthMonitor: HealthMonitor;
  private currentProvider: string = 'tensorrt-triton';

  async initialize() {
    console.log('🚀 Initializing AI Service Orchestrator...');

    // Register TensorRT-Triton (Primary)
    try {
      const tritonClient = new TritonInferenceClient({
        httpUrl: 'http://localhost:8000',
        grpcUrl: 'localhost:8001',
        modelName: 'gemma3-legal-tensorrt',
        modelVersion: '1'
      });
      await tritonClient.initialize();
      this.providers.set('tensorrt-triton', tritonClient);
      console.log('✅ TensorRT-Triton provider registered (PRIMARY)');
    } catch (error) {
      console.warn('⚠️ TensorRT-Triton unavailable:', error.message);
    }

    // Register Ollama (Fallback)
    try {
      const ollamaClient = new OllamaClient({
        baseUrl: 'http://localhost:11434',
        model: 'gemma3-legal:latest'
      });
      await ollamaClient.healthCheck();
      this.providers.set('ollama', ollamaClient);
      console.log('✅ Ollama provider registered (FALLBACK)');
    } catch (error) {
      console.error('❌ Ollama unavailable:', error.message);
    }

    // Start health monitoring
    this.healthMonitor = new HealthMonitor(this.providers);
    await this.healthMonitor.start();

    // Set initial provider based on health
    this.currentProvider = this.selectOptimalProvider();
    console.log(`🎯 Active provider: ${this.currentProvider}`);
  }

  async inference(request: InferenceRequest): Promise<InferenceResponse> {
    const provider = this.providers.get(this.currentProvider);

    if (!provider) {
      throw new Error(`No healthy providers available`);
    }

    try {
      // Attempt inference with current provider
      const response = await provider.generate(request);
      return {
        ...response,
        provider: this.currentProvider,
        metadata: {
          latency: response.latency,
          tokens: response.tokens,
          model: provider.modelName
        }
      };
    } catch (error) {
      console.error(`❌ Inference failed with ${this.currentProvider}:`, error);

      // Automatic fallback
      if (this.currentProvider === 'tensorrt-triton' && this.providers.has('ollama')) {
        console.log('🔄 Falling back to Ollama...');
        this.currentProvider = 'ollama';
        return this.inference(request); // Retry with fallback
      }

      throw error;
    }
  }

  async generateEmbedding(text: string): Promise<Float32Array> {
    return embeddingService.embed(text);
  }

  private selectOptimalProvider(): string {
    const healthyProviders = this.healthMonitor.getHealthyProviders();

    // Priority order
    if (healthyProviders.has('tensorrt-triton')) return 'tensorrt-triton';
    if (healthyProviders.has('ollama')) return 'ollama';
    if (healthyProviders.has('vllm')) return 'vllm';

    throw new Error('No healthy providers available');
  }

  getStatus() {
    return {
      currentProvider: this.currentProvider,
      providers: Array.from(this.providers.keys()).map(name => ({
        name,
        healthy: this.healthMonitor.isHealthy(name),
        latency: this.healthMonitor.getLatency(name)
      })),
      embedding: {
        model: 'embeddinggemma:latest',
        provider: 'ollama'
      }
    };
  }
}

export const aiOrchestrator = new AIServiceOrchestrator();
```

---

## 🔍 Vector Search Service (Dual Database)

```typescript
// src/lib/services/vector-search-service.ts

import { QdrantClient } from '@qdrant/js-client-rest';
import postgres from 'postgres';
import { drizzle } from 'drizzle-orm/postgres-js';
import { embeddingService } from './embedding-service';
import type { VectorSearchResult, SearchOptions } from './types/vector-search';

export class VectorSearchService {
  private qdrant: QdrantClient;
  private pgVector: ReturnType<typeof drizzle>;
  private sql: ReturnType<typeof postgres>;

  async initialize() {
    // Qdrant connection
    this.qdrant = new QdrantClient({
      url: 'http://localhost:6333',
      apiKey: process.env.QDRANT_API_KEY
    });

    // PostgreSQL pgvector connection
    this.sql = postgres(process.env.DATABASE_URL!, {
      max: 10,
      idle_timeout: 20,
      connect_timeout: 10
    });
    this.pgVector = drizzle(this.sql);

    // Create collections/tables if needed
    await this.ensureCollections();
  }

  async search(query: string, options: SearchOptions = {}): Promise<VectorSearchResult[]> {
    const {
      limit = 10,
      threshold = 0.7,
      useQdrant = true,
      usePgVector = true,
      hybrid = true
    } = options;

    // Generate embedding
    const queryEmbedding = await embeddingService.embed(query);

    // Parallel search across both databases
    const searches = [];

    if (useQdrant) {
      searches.push(this.searchQdrant(queryEmbedding, limit, threshold));
    }

    if (usePgVector) {
      searches.push(this.searchPgVector(queryEmbedding, limit, threshold));
    }

    const [qdrantResults = [], pgResults = []] = await Promise.all(searches);

    // Merge and rerank results
    if (hybrid && useQdrant && usePgVector) {
      return this.mergeResults(qdrantResults, pgResults, limit);
    }

    return [...qdrantResults, ...pgResults].slice(0, limit);
  }

  private async searchQdrant(
    embedding: Float32Array,
    limit: number,
    threshold: number
  ): Promise<VectorSearchResult[]> {
    const results = await this.qdrant.search('legal-documents', {
      vector: Array.from(embedding),
      limit,
      score_threshold: threshold,
      with_payload: true
    });

    return results.map(hit => ({
      id: hit.id as string,
      content: hit.payload?.content as string,
      metadata: hit.payload?.metadata as Record<string, any>,
      score: hit.score,
      source: 'qdrant'
    }));
  }

  private async searchPgVector(
    embedding: Float32Array,
    limit: number,
    threshold: number
  ): Promise<VectorSearchResult[]> {
    const embeddingArray = `[${Array.from(embedding).join(',')}]`;

    const results = await this.sql`
      SELECT
        id,
        content,
        metadata,
        1 - (embedding <=> ${embeddingArray}::vector) as score
      FROM legal_documents
      WHERE 1 - (embedding <=> ${embeddingArray}::vector) > ${threshold}
      ORDER BY embedding <=> ${embeddingArray}::vector
      LIMIT ${limit}
    `;

    return results.map((row: any) => ({
      id: row.id,
      content: row.content,
      metadata: row.metadata,
      score: parseFloat(row.score),
      source: 'pgvector'
    }));
  }

  private mergeResults(
    qdrantResults: VectorSearchResult[],
    pgResults: VectorSearchResult[],
    limit: number
  ): VectorSearchResult[] {
    // Reciprocal Rank Fusion (RRF) for hybrid ranking
    const k = 60; // RRF constant
    const scores = new Map<string, { result: VectorSearchResult; score: number }>();

    // Score Qdrant results
    qdrantResults.forEach((result, index) => {
      const rrf = 1 / (k + index + 1);
      scores.set(result.id, { result, score: rrf });
    });

    // Add pgVector results (boost if also in Qdrant)
    pgResults.forEach((result, index) => {
      const rrf = 1 / (k + index + 1);
      const existing = scores.get(result.id);

      if (existing) {
        existing.score += rrf; // Boost score if found in both
      } else {
        scores.set(result.id, { result, score: rrf });
      }
    });

    // Sort by combined score
    return Array.from(scores.values())
      .sort((a, b) => b.score - a.score)
      .map(({ result }) => result)
      .slice(0, limit);
  }

  private async ensureCollections() {
    // Create Qdrant collection
    try {
      await this.qdrant.createCollection('legal-documents', {
        vectors: {
          size: 768, // embeddinggemma dimension
          distance: 'Cosine'
        }
      });
    } catch (error) {
      // Collection already exists
    }

    // Create pgvector table (via migration)
    // See: db/migrations/001_create_vector_table.sql
  }
}

export const vectorSearch = new VectorSearchService();
```

---

## 🧪 Testing Strategy

```typescript
// tests/phase3-tensorrt-integration.spec.ts

import { test, expect } from '@playwright/test';

test.describe('Phase 3: TensorRT-Triton Integration', () => {
  test('TensorRT-Triton inference works', async ({ page }) => {
    await page.goto('http://localhost:5173/ai-chat');

    // Send message
    await page.fill('textarea[name="message"]', 'Explain contract law');
    await page.click('button[type="submit"]');

    // Verify TensorRT provider used
    const providerBadge = page.locator('[data-testid="active-provider"]');
    await expect(providerBadge).toContainText('TensorRT-Triton');

    // Verify response received
    const response = page.locator('[data-testid="ai-response"]').last();
    await expect(response).toBeVisible({ timeout: 10000 });
  });

  test('Ollama fallback works when Triton down', async ({ page, context }) => {
    // Block Triton server
    await context.route('**/localhost:8000/**', route => route.abort());

    await page.goto('http://localhost:5173/ai-chat');
    await page.fill('textarea[name="message"]', 'Test fallback');
    await page.click('button[type="submit"]');

    // Should automatically use Ollama
    const providerBadge = page.locator('[data-testid="active-provider"]');
    await expect(providerBadge).toContainText('Ollama');
  });

  test('Dual vector search returns accurate results', async ({ page }) => {
    await page.goto('http://localhost:5173/search');

    // Semantic search
    await page.fill('input[name="search"]', 'employment contract disputes');
    await page.click('button[aria-label="Vector Search"]');

    // Verify results from both databases
    const results = page.locator('[data-testid="search-result"]');
    await expect(results).toHaveCount(10);

    // Check source badges (should have both Qdrant and pgvector)
    const qdrantResults = page.locator('[data-source="qdrant"]');
    const pgvectorResults = page.locator('[data-source="pgvector"]');

    await expect(qdrantResults.count()).resolves.toBeGreaterThan(0);
    await expect(pgvectorResults.count()).resolves.toBeGreaterThan(0);
  });
});
```

---

## 📋 Implementation Checklist

### Week 1: Infrastructure Setup
- [ ] Install TensorRT-LLM and Triton dependencies
- [ ] Build gemma3-legal TensorRT engine (INT4)
- [ ] Setup Docker Compose with all services
- [ ] Configure Docker Desktop networking
- [ ] Test Triton server with basic inference
- [ ] Verify pgvector and Qdrant connectivity

### Week 2: Service Integration
- [ ] Create `triton-client.ts` with gRPC support
- [ ] Implement `vector-search-service.ts` (dual DB)
- [ ] Build `embedding-service.ts` (embeddinggemma)
- [ ] Create `ai-service-orchestrator.ts` with fallback
- [ ] Setup health monitoring
- [ ] Reorganize provider directories

### Week 3: RAG & Testing
- [ ] Consolidate RAG pipelines
- [ ] Integrate TensorRT with RAG orchestrator
- [ ] Create Playwright integration tests
- [ ] Performance benchmarking (latency, throughput)
- [ ] Load testing with concurrent requests
- [ ] Documentation updates

### Week 4: Optimization & Production
- [ ] Fine-tune TensorRT engine parameters
- [ ] Optimize Docker resource limits
- [ ] Add Redis caching for embeddings
- [ ] Monitoring dashboard integration
- [ ] Deployment guide
- [ ] Rollback procedures

---

## 🎯 Success Metrics

**Performance Targets**:
- TensorRT-Triton latency: **<500ms** for 512 tokens
- Ollama fallback latency: **<2s** for 512 tokens
- Vector search (dual DB): **<100ms** for 10 results
- Embedding generation: **<50ms** per text (cached)
- Failover time: **<1s** Triton → Ollama

**Resource Utilization**:
- GPU Memory: <3.5GB (RTX 3060 Ti has 4GB)
- System RAM: <8GB total
- Docker containers: <2GB each

**Reliability**:
- Uptime: 99.9% (automatic fallback)
- Health check frequency: 30s
- Cache hit ratio: >80% for embeddings

---

## 🚀 Quick Start

```bash
# 1. Build TensorRT engine (WSL)
cd scripts
./build-tensorrt-gemma3.sh

# 2. Start all services
docker-compose -f docker-compose.tensorrt.yml up -d

# 3. Verify services
curl http://localhost:8000/v2/health/ready  # Triton
curl http://localhost:11434/api/tags        # Ollama
curl http://localhost:6333/collections      # Qdrant
psql -h localhost -U legal_admin -d legal_ai_db -c "SELECT version();"  # pgvector

# 4. Start frontend
cd sveltekit-frontend
npm run dev

# 5. Test AI chat
# http://localhost:5173/ai-chat
```

---

**This architecture provides production-grade GPU inference with intelligent fallback!** 🚀
