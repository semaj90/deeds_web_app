# Legal AI Platform - AI Agent Instructions

use mcp-server tools get-library-docs: use context7, sveltekit 2, typescript, drizzle-orm, bits-ui, svelte 5, qdrant, pg vector, postgresql, redis, xstate, webgpu, cuda, uno.css

svelte 5: fix Using on:click to listen to the click event is deprecated. Use the event attribute onclick instead
https://svelte.dev/e/event_directive_deprecated

svelte 5: Real-World Example Before/After
Before (Deprecated)
<script lang="ts">
	import CardA from '$lib/components/ui/CardA.svelte';
	import CardB from '$lib/components/ui/CardB.svelte';
	let active = 'A';
	let component = active === 'A' ? CardA : CardB;
</script>

<svelte:component this={component} />

✅ After (Runes Mode)
<script lang="ts">
	import CardA from '$lib/components/ui/CardA.svelte';
	import CardB from '$lib/components/ui/CardB.svelte';
	let active = $state('A');
	let Component = $derived(active === 'A' ? CardA : CardB);
</script>

<Component />

⚙️ If You Need to Loop Over Components
Old
```html
{#each cards as card}
  <card.component {...card.props} />
{/each}
```

✅ New
```html
{#each cards as card}
  <card.component {...card.props} />
{/each}
```
# GitHub Copilot Integration - Legal AI CMS

## Development Setup

### Prerequisites

- PostgreSQL 12+
- Node.js 18+
- Drizzle ORM
- SvelteKit 5

### Quick Start

```bash
# Clone and setup
git clone <repo>
cd sveltekit-frontend
npm install

# Database setup
TEST-FULL-SYSTEM.bat

# Start development
npm run dev
```

## Code Patterns
## Performance & Optimization
- **Code Splitting**: Use dynamic imports for heavy components
- **Caching**: Implement proper cache headers and strategies
- **Streaming**: Load essential content first, stream secondary data
- **Prefetching**: Use `data-sveltekit-preload-data` for navigation
- **Bundle Optimization**: Configure Vite for optimal chunking

### Error Handling
- **Custom Error Pages**: Create `+error.svelte` for graceful failures
- **Error Boundaries**: Wrap components with error handling logic
- **Graceful Degradation**: Ensure functionality without JavaScript

### Database Queries

```typescript
// Copilot-friendly patterns
const caseWithEvidence = await db.query.cases.findFirst({
  where: eq(cases.id, caseId),
  with: { evidence: true, creator: true },
});

const evidenceList = await db
  .select()
  .from(evidence)
  .where(eq(evidence.caseId, caseId))
  .orderBy(desc(evidence.createdAt));
```

### SvelteKit API Routes

```typescript
// src/routes/api/cases/+server.ts
export async function GET({ url }) {
  const cases = await db.select().from(schema.cases);
  return json(cases);
}

export async function POST({ request }) {
  const data = await request.json();
  const result = await db.insert(schema.cases).values(data);
  return json(result);
}
```

### Component Patterns

```svelte
<!-- Cases list component -->
<script lang="ts">
  import type { Case } from '$lib/db/schema';
  export let cases: Case[];
</script>

{#each cases as case}
  <div class="case-card">
    <h3>{case.title}</h3>
    <span class="status-{case.status}">{case.status}</span>
  </div>
{/each}
```

## Type Definitions

### Schema Types

```typescript
// Auto-generated from Drizzle
export type Case = typeof cases.$inferSelect;
export type NewCase = typeof cases.$inferInsert;
export type Evidence = typeof evidence.$inferSelect;
export type NewEvidence = typeof evidence.$inferInsert;
```

### API Types

```typescript
interface CaseResponse {
  success: boolean;
  data: Case[];
  error?: string;
}

interface EvidenceUpload {
  caseId: string;
  title: string;
  file: File;
  type: "document" | "image" | "video";
}
```

## Testing Patterns

### Database Tests

```typescript
// CRUD test pattern
describe('Cases CRUD', () => {
  test('create case', async () => {
    const case = await db.insert(cases).values({
      title: 'Test Case',
      createdBy: userId
    }).returning();
    expect(case[0].title).toBe('Test Case');
  });
});
```

### Component Tests

```typescript
// Svelte component test
import { render } from "@testing-library/svelte";
import CaseCard from "./CaseCard.svelte";

test("renders case data", () => {
  const { getByText } = render(CaseCard, {
    props: { case: mockCase },
  });
  expect(getByText(mockCase.title)).toBeInTheDocument();
});
```

## AI Integration

### Vector Search

```typescript
// Document similarity
const similarDocs = await db
  .select()
  .from(documents)
  .where(sql`embeddings <-> ${queryVector} < 0.5`)
  .limit(10);
```

### AI History

```typescript
// Track AI usage
await db.insert(aiHistory).values({
  caseId,
  userId,
  prompt: question,
  response: aiAnswer,
  model: "gpt-4",
  tokensUsed: response.usage.total_tokens,
});
```

## Common Copilot Prompts

### Database Queries

- "Create a query to get all cases with evidence count"
- "Write a function to update case status"
- "Generate a complex join query for cases and users"

### Components

- "Create a Svelte component for case filtering"
- "Build an evidence upload form"
- "Design a responsive cases grid layout"

### API Routes

- "Create REST endpoints for case management"
- "Add file upload handling for evidence, rag, documents" minio superforms sveltekit 2/svelte 5.
- "Implement search functionality"

## Development Commands

```bash
# Testing
npm run check          # TypeScript check
npm run test          # Run tests
TEST-FULL-SYSTEM.bat  # Full system test

# Database
npm run db:studio     # Database GUI
npm run db:seed       # Add sample data
node validate-schema.mjs  # Validate schema

# Development
npm run dev           # Start dev server
npm run build         # Production build
```

## File Structure

```
src/
├── lib/
│   ├── db/schema.ts         # Drizzle schema
│   ├── types/              # TypeScript types
│   └── components/         # Reusable components
├── routes/
│   ├── api/               # API endpoints
│   ├── cases/             # Cases pages
│   └── evidence/          # Evidence pages
└── app.html               # Main template
```

## Best Practices

1. **Always use types** from schema
2. **Validate input** with Zod
3. **Handle errors** gracefully
4. **Use transactions** for multi-table operations
5. **Log AI interactions** for audit trail


Svelte 5 now supports dynamic tag names even in loops.

## Project Overview
This is a sophisticated legal AI platform with microservices architecture featuring SvelteKit 5 frontend, 37+ Go microservices, XState v5 state management, and WebAssembly/GPU acceleration.

svelte-check fix
on:click ui component errors
Most modern UI kits (Bits-UI, shadcn/ui, Melt-UI, etc.) export named components, not default ones.

Fix:

<!-- ❌ Wrong -->
<script lang="ts">
  import Card from '$lib/components/ui/card';
</script>

<!-- ✅ Correct -->
<script lang="ts">
  import { Card, CardContent, CardHeader } from '$lib/components/ui/card';
</script>


If you only have Card.svelte (a single component), change its export to:

<!-- src/lib/components/ui/card/index.ts -->
export { default as Card } from './Card.svelte';

ur database client (Node-Postgres / postgres-js)

From your recent code, you have this:

import postgres from 'postgres';
import { drizzle } from 'drizzle-orm/postgres-js';


That means you’re using the postgres package — a modern, fast, pure JavaScript PostgreSQL client — not the older pg driver.

So your stack looks like:

Layer	Library	Purpose
Database	postgres (postgres-js)	Node Postgres adapter
ORM	drizzle-orm/postgres-js	Type-safe ORM for the postgres-js driver
SvelteKit runtime	@sveltejs/adapter-node	Runs your app in Node for SSR
Optional vector search	pgvector	Adds vector support for embeddings
⚙️ 3. Confirming the driver in src/lib/server/db/client.ts

You’ll probably see something like:

import postgres from 'postgres';
import { drizzle } from 'drizzle-orm/postgres-js';
import * as schema from './schema-postgres';

const connection = postgres(process.env.DATABASE_URL!);
export const db = drizzle(connection, { schema });


That’s the Node Postgres adapter (postgres-js).

If you were using the traditional pg driver, it would look like:

import pkg from 'pg';
const { Pool } = pkg;
const pool = new Pool({ connectionString: process.env.DATABASE_URL });


But you’re not — you’re using postgres-js (the better async version).

✅ Summary

Adapter: @sveltejs/adapter-node → Node.js runtime.

DB driver: postgres (from postgres-js).

ORM: drizzle-orm/postgres-js.

Result: Yes, you are using the Node Postgres adapter (via postgres-js), not the older pg library

That way, you can always use named imports consistently.

## Architecture Essentials

### Service Ecosystem
- **Frontend**: SvelteKit 2 + Svelte 5 runes on ports 5173-5179
- **Go Services**: Ports 8080-8136 (37 microservices with health checks)
- **Context7 MCP**: Port 8777 (AI documentation server, official endpoint: `http://localhost:8777`)
- **Databases**:
  - PostgreSQL:5434 (pgvector/pgvector:pg17) - `postgresql://legal_admin:123456@localhost:5434/legal_ai_db`
  - PostgreSQL Test:5434 (isolated test instance)
  - Redis:6379 (redis-stack with RediSearch, RedisJSON) - `redis://:redis@localhost:6379/0`
  - Redis Test:6380 (isolated test cache)
  - Neo4j:7474 (HTTP), :7687 (Bolt) - `bolt://localhost:7687` auth: `neo4j/legal123456`
  - Qdrant:6333 (HTTP), :6334 (gRPC) - `http://localhost:6333`
- **AI**:
  - Ollama:11434 (host) or :11435 (docker) - `http://localhost:11434`
  - FastAPI Embed:8000 - `http://localhost:8000`
  - GPU: NVIDIA RTX 3060 Ti (CUDA enabled)
  - Models: gemma3, embeddinggemma:latest, nomic-embed-text
  - WebAssembly inference (browser-side)
- **Infrastructure**:
  - RabbitMQ:5672 (AMQP), :15672 (Management UI) - `amqp://legal_admin:123456@localhost:5672`
  - MinIO:9000 (API), :9001 (Console) - `http://localhost:9000`
  - Caddy:443 (HTTPS/QUIC), :80 (HTTP)
  - QUIC Server:4433/udp, :4434/udp, :8095 (HTTP fallback)

## Docker Service Endpoints (Use These Envs Everywhere)

Always code endpoints to respect Docker service names first, with localhost fallbacks for dev without Compose. Prefer process.env and central helpers over literals.

- PostgreSQL
  - `DATABASE_URL=postgresql://legal_admin:123456@postgres:5432/legal_ai_db`
  - Admin URL if needed: `ADMIN_DATABASE_URL=postgresql://postgres:postgres@postgres:5432/postgres`
- Redis
  - `REDIS_URL=redis://:redis@redis:6379/0`
  - Or split: `REDIS_HOST=redis`, `REDIS_PORT=6379`, `REDIS_PASSWORD=redis`
- Qdrant
  - `QDRANT_URL=http://qdrant:6333`
- Ollama
  - `OLLAMA_URL=http://ollama:11434`
- MinIO
  - `MINIO_ENDPOINT=minio:9000`, `MINIO_ACCESS_KEY=minioadmin`, `MINIO_SECRET_KEY=minioadmin`
- Neo4j
  - `NEO4J_URI=bolt://neo4j:7687`, `NEO4J_USER=neo4j`, `NEO4J_PASSWORD=password`

Guidelines
- Centralize service endpoints in small utility functions (e.g., `getOllamaEndpoint()` or db client factory) and import them across routes/services.
- Never hardcode `http://localhost` in server code; use envs and fallbacks like `process.env.OLLAMA_URL || 'http://localhost:11434'` only at the edge.
- When inserting records via Drizzle, prefer schema defaults (e.g., `defaultRandom()` on UUIDs). If you hit legacy schemas (e.g., `documents.uuid NOT NULL`), handle with a raw SQL fallback that sets `uuid = gen_random_uuid()`.
- For WebSocket URLs, derive from `request.url` or `location` with protocol switch `ws/wss`.

Code patterns
- Database client: use `$lib/server/db/client` which picks up `DATABASE_URL` and supports production pooling.
- Redis cache: use `$lib/server/cache/redis` or `$lib/server/optimize/query-cache` which respect `REDIS_*` envs.
- Vector search: use the unified `enhancedVectorSearchService` which reads `PGVECTOR_URL`/`QDRANT_URL`.

### Route Discovery Pattern
```typescript
// src/routes/all-routes/+page.server.ts - Service discovery
export interface RoutePageData {
  systemHealth: SystemHealthData;
  availableRoutes: RouteDefinition[];
  routeInventory: {
    counts: { config: number; fileBased: number };
    fileRoutesSample: Array<{ route: string; title: string }>;
  };
}
```
### Critical File Patterns
#### XState Integration (Core Pattern)
```typescript
// src/lib/services/xstate-integration.ts - Central coordinator
import xstateIntegration from '$lib/services/xstate-integration'
const state = xstateIntegration.getGlobalState()
xstateIntegration.sendEvent(machineId, event)
```
#### Go Microservice Communication
```typescript
// Always use productionServiceClient for Go services
import { productionServiceClient } from '$lib/api/production-service-client'
const result = await productionServiceClient.makeRequest(endpoint, data)
```
#### Database Operations
```typescript
// src/lib/server/db/drizzle-vector-config.ts patterns
const results = await VectorSearchService.searchDocuments(embedding, threshold)
// Always handle vector operations with proper type casting
```

## Development Workflows
### Essential Commands
```bash
# Development with GPU detection
npm run dev:gpu
# TypeScript validation (current: 247 errors)
npx tsc --noEmit --skipLibCheck
# Health check all services
curl http://localhost:5173/api/health/status
```

### Error Resolution Patterns
- **XState Issues**: Check xstate-integration service, ensure all 4 machines (auth, session, AI assistant, agent shell) are properly wired
- **Type Errors**: Use ReturnType<typeof postgres> for PostgreSQL, stub missing dependencies with interfaces
- **Service Communication**: All Go services have standardized health checks on /health endpoint

## Key Conventions

### State Management
- Use XState v5 syntax: `createMachine()`, `fromPromise()`, `assign()`
- Central integration via `xstate-integration.ts` service
- Event-driven architecture: machines communicate through events, not direct calls

### API Patterns
```typescript
// Standard SvelteKit +server.ts pattern
export async function GET({ url, params }) {
  const service = url.searchParams.get('service')
  return json(await serviceRegistry[service].health())
}
```
## Microservice Integration Patterns
### RabbitMQ + XState Coordination
```typescript
// src/lib/messaging/rabbitmq-xstate-integration.ts
export class RabbitMQXStateIntegration {
  static async processLegalAIMessage(message: LegalAIMessage): Promise<any> {
    switch (message.type) {
      case 'document_ingestion': return await this.processDocumentIngestion(message.payload);
      case 'vector_search': return await this.processVectorSearch(message.payload);
      case 'wasm_inference': return await this.processWASMInference(message.payload);
    }
  }
}
```
### Legal AI Workflow Orchestration
```typescript
// Multi-service legal document processing pipeline
class LegalDocumentProcessor {
  async processDocument(file: File): Promise<ProcessingResult> {
    // 1. Upload to MinIO storage
    const storedFile = await minioStorage.upload(file);
    // 2. XState triggers OCR workflow
    const ocrState = documentProcessingMachine.send('START_OCR');
    // 3. RabbitMQ distributes processing tasks
    await rabbitmq.publish('legal.documents.queue', { fileId: storedFile.id });
    // 4. Vector embedding with Ollama
    const embeddings = await ollama.embed(extractedText);
    // 5. Store in pgvector + cache in Redis
    await Promise.all([
      pgvector.store(embeddings),
      redis.cache(`doc:${fileId}`, results, 3600)
    ]);
  }
}
```

### Service Health Monitoring
```typescript
// src/routes/api/go/+server.ts - 37 microservice registry
const goServices = {
  'legal-gateway': { baseUrl: 'http://localhost:8080', healthPath: '/health' },
  'enhanced-rag': { baseUrl: 'http://localhost:8094', protocols: ['http', 'grpc'] },
  'gpu-orchestrator': { baseUrl: 'http://localhost:8095', capabilities: ['cuda', 'tensor'] },
  // ... 34 more services
};
```
## Legal AI Domain Workflows
### Evidence Canvas Integration
```typescript
// Fabric.js + WebSocket + PostgreSQL persistence
class EvidenceCanvasManager {
  async syncCanvasState(canvasData: FabricCanvasData): Promise<void> {
    // Real-time collaboration via WebSocket
    websocket.broadcast('canvas:update', canvasData);

    // PostgreSQL persistence with Redis caching
    await db.evidenceCanvas.upsert(canvasData);
    await redis.set(`canvas:${caseId}`, canvasData, 300);
  }
}
```

### Self-Prompting AI Systems
```typescript
// Background AI analysis based on user patterns
export const selfPromptingMachine = createMachine({
  id: 'legalAISelfPrompting',
  context: {
    userHistory: [],
    pendingTasks: [],
    performanceMetrics: { successRate: 0.95, cacheHitRate: 0.8 }
  },
  states: {
    analyzing: {
      invoke: {
        src: fromPromise(async ({ input }) => {
          const patterns = analyzeUserPatterns(input.userHistory);
          return generateRecommendations(patterns);
        })
      }
    }
  }
});
```
## Performance Considerations
### WebAssembly Inference Pipeline
```typescript
// src/lib/webasm/llama-cpp-engine.ts - Browser-side LLM inference
export class WebASMLlamaCppEngine {
  async runInference(prompt: string): Promise<InferenceResult> {
    // Load WASM module with threading support
    const wasmModule = await WebAssembly.instantiateStreaming(
      fetch('/wasm/llama-cpp.wasm'),
      { env: { memory: new WebAssembly.Memory({ initial: 256, maximum: 1024, shared: true }) } }
    );
    // GPU-accelerated vector operations
    const embeddings = await this.computeEmbeddings(prompt);
    // Multi-threaded inference with Web Workers
    const result = await this.workerPool.execute({
      type: 'INFERENCE',
      prompt,
      embeddings,
      config: { contextSize: 2048, threads: navigator.hardwareConcurrency }
    });
    return result;
  }
}
```
### QUIC Protocol Implementation
```typescript
// src/lib/cache/proto-serializer.ts - Ultra-low latency communication
export class QUICTensorStream {
  async connect(url: string) {
    if (!('WebTransport' in window)) throw new Error('WebTransport not supported');

    // @ts-ignore - WebTransport API
    const transport = new WebTransport(url);
    await transport.ready;
    // Bidirectional streaming for real-time tensor data
    const stream = await transport.createBidirectionalStream();
    this.stream = stream.writable;
  }

  async sendTensor(tensor: Float32Array): Promise<void> {
    const compressed = this.serializer.compressTensor(tensor);
    await this.stream.write(compressed);
  }
}
```
### GPU Acceleration Strategy
```typescript
// WebGPU compute shaders for vector operations
class WebGPUVectorProcessor {
  async computeSimilarityMatrix(embeddings: Float32Array): Promise<Float32Array> {
    const computeShader = `
      @compute @workgroup_size(64)
      fn computeSimilarity(@builtin(global_invocation_id) id: vec3<u32>) {
        // Parallel cosine similarity computation
        let idx = id.x;
        similarity[idx] = dot(vectorA[idx], vectorB[idx]) /
                         (length(vectorA[idx]) * length(vectorB[idx]));
      }
    `;
    // Execute on GPU with WebGPU
    const resultBuffer = await this.executeComputeShader(computeShader, embeddings);
    return new Float32Array(await resultBuffer.mapAsync(GPUMapMode.READ));
  }
}
```
### Caching Strategy
- **Redis**: API responses, session data, vector similarity cache
- **MinIO**: Large document storage with CDN-like access patterns
- **Browser**: IndexedDB for offline WASM model caching
- **Service Worker**: Background tensor computation caching

## Debugging Patterns
### Service Health Monitoring
```bash
# Check all microservices
curl http://localhost:5173/api/go/health
# XState status
curl http://localhost:5173/api/v1/xstate
# Context7 MCP server
curl http://localhost:8777/health
# Qdrant vector database
curl http://localhost:6333/health
# MinIO object storage
curl http://localhost:9000/minio/health/live
# RabbitMQ management
curl -u legal_admin:123456 http://localhost:15672/api/overview
# QUIC server
curl http://localhost:8095/health
```

### Database Connection Testing
```bash
# PostgreSQL main instance
PGPASSWORD=123456 psql -h localhost -p 5434 -U legal_admin -d legal_ai_db -c "\dt"
# PostgreSQL test instance
PGPASSWORD=123456 psql -h localhost -p 5434 -U legal_admin -d legal_ai_db -c "\d cases"
# Redis main instance
redis-cli -p 6379 -a redis ping
redis-cli -p 6379 -a redis INFO
# Redis test instance
redis-cli -p 6380 ping
# Neo4j browser
curl http://localhost:7474
# Qdrant collections
curl http://localhost:6333/collections
```

# 🤖 Copilot Instructions: Legal AI DB Layer

This section explains how GitHub Copilot or VS Code AI can assist you when editing the database layer.

---

## 💡 Primary Goals
- Simplify repetitive Drizzle query patterns.
- Help generate schema migrations and vector queries.
- Autocomplete `db.select().from(schema.table).where(eq(...))` syntax.
- Suggest helper utilities (cachedQuery, hybridVectorSearch, storeEmbedding).

---

## 🧩 Suggested Copilot Prompts
### For queries
> "Generate a Drizzle ORM query to get all documents for a user with Redis caching."

### For schema
> "Add a new 'legal_opinions' table with vector and AI summary support, similar to documents."

### For AI integration
> "Suggest a pgvector + Qdrant hybrid search query for finding related cases."

### For migrations
> "Generate a Drizzle migration to add 'confidence' and 'tokens' columns to the embeddings table."

### For performance
> "Add an index to the cases table on (userId, status)."

## XState v5 Integration (recommended)
- Use XState v5 APIs: createMachine(), fromPromise(), assign().
- Central service: src/lib/services/xstate-integration.ts should export:
  - getGlobalState(): read-only snapshot
  - sendEvent(machineId, event): dispatches events to machines
- Example usage:
```ts
// src/lib/services/xstate-integration.ts (pattern)
export const xstateIntegration = {
  getGlobalState: () => { /* return current snapshot */ },
  sendEvent: (machineId: string, event: any) => { /* forward event */ },
  subscribe: (listener: (snapshot: any) => void) => { /* subscribe */ }
};
```

## Redis "langcache" (vector / language cache)
- Introduce a lightweight "langcache" layer for embeddings & language model results:
  - Key pattern: langcache:{model}:{shaPrompt} => {embedding, result, tokens, ttl}
  - Respect REDIS_* env vars and centralize client in $lib/server/cache/redis
- Use cache-first pattern for embedding/model calls to reduce cost.

## Docker / Env Production Wiring
- Always prefer Docker service hostnames with localhost fallbacks only at the edge:
  - OLLAMA_URL=http://ollama:11434
  - DATABASE_URL=postgresql://legal_admin:123456@postgres:5432/legal_ai_db
  - REDIS_URL=redis://:redis@redis:6379/0
  - QDRANT_URL=http://qdrant:6333
- Centralize endpoint helpers (getOllamaEndpoint(), getDatabaseUrl()) that read process.env and provide safe defaults for local dev only.

## Svelte 5 — Migration notes and best practices

- Event directive deprecation
  - Summary: Using `on:click` (and other `on:` directives) is deprecated in Svelte 5. Use the event attribute form (`onclick`, `oninput`, etc.).
  - Before (deprecated):
    ```svelte
    <button on:click={() => doSomething()}>Click</button>
    ```
  - After:
    ```svelte
    <button onclick={() => doSomething()}>Click</button>
    ```

- Runes mode / reactive stores
  - Svelte 5 encourages "runes" patterns for local reactive state in components:
    - Use `$state(...)` to create reactive values.
    - Use `$derived(...)` to derive component values.
  - Example:
    ```svelte
    <script lang="ts">
      // $state and $derived are provided by runes-mode types
      let query = $state('');
      let results = $derived(() => search(query));
    </script>
    ```

- Dynamic components & looping — CRITICAL PATTERN
  - **When to use `<svelte:component>`** (decision tree):
    - **Is component reference known at compile time?**
      - YES → Use direct component tag: `<Component {...props} />`
      - NO → Use `<svelte:component this={dynamicComponent} />`

  - **✅ VALID uses** of `<svelte:component>`:
    1. **Dynamic icons** (selected at runtime):
       ```svelte
       <svelte:component this={icon} size={28} />
       <svelte:component this={getFileIcon(file)} />
       ```
    2. **Conditional components** (varies by condition):
       ```svelte
       <svelte:component this={currentComponent} {data} />
       ```
    3. **Component from array/object**:
       ```html
       {#each components as comp}
         <comp.component {...comp.props} />
       {/each}
       ```

  - **❌ DEPRECATED uses** (remove `<svelte:component>`):
    - Static imports (component always the same)
    - Wrapper/shim components (enhanced-bits pattern)
    - Compile-time known components

  - **Static component forwarding** (shims/wrappers):
    - Before (deprecated):
      ```svelte
      <script>
        import RealButton from './Button.svelte';
      </script>
      <svelte:component this={RealButton} {...$$props}>
        <slot />
      </svelte:component>
      ```
    - After (Svelte 5 correct):
      ```svelte
      <script lang="ts">
        import RealButton from './Button.svelte';
        let props = $props();
      </script>
      <RealButton {...props}>
        <slot />
      </RealButton>
      ```

  - **Derived components** (conditional selection):
    - Before:
      ```svelte
      <script>
        import CardA from '$lib/components/ui/CardA.svelte';
        import CardB from '$lib/components/ui/CardB.svelte';
        let active = 'A';
        let component = active === 'A' ? CardA : CardB;
      </script>
      <svelte:component this={component} />
      ```
    - After (runes-style):
      ```svelte
      <script lang="ts">
        import CardA from '$lib/components/ui/CardA.svelte';
        import CardB from '$lib/components/ui/CardB.svelte';
        let active = $state('A');
        let Component = $derived(active === 'A' ? CardA : CardB);
      </script>
      <Component />
      ```

  - **Looping over components** (fixes "Unknown tool or toolset 'each'"):
    - Before (problematic pattern):
      ```html
      {#each cards as card}
        <card.component {...card.props} />
      {/each}
      ```
    - After (Svelte 5 supports dynamic tags in loops):
      ```html
      {#each cards as card}
        <card.component {...card.props} />
      {/each}
      ```

  - **Key insight**: `<svelte:component>` adds runtime overhead. Use direct component tags when the component is known at compile time. Reserve `<svelte:component>` for truly dynamic scenarios (icons, conditional rendering, data-driven components).

- UI kit named exports
  - Most modern UI kits export named components. Prefer named imports:
    ```ts
    // ❌ avoid default import if library exports named symbols
    import Card from '$lib/components/ui/card';
    // ✅ correct
    import { Card, CardContent, CardHeader } from '$lib/components/ui/card';
    ```
  - If you have a single Svelte file and want a named export, add an index file:
    ```ts
    // src/lib/components/ui/card/index.ts
    export { default as Card } from './Card.svelte';
    ```

- Small tips
  - Replace `on:...` handlers with `on...` attributes across projects to avoid Svelte 5 deprecation warnings.
  - When addressing compile errors about unknown directives or template constructs, check if the template was intended for runes-mode and convert store usage accordingly (`let foo = $state(...)`).
  - Keep dynamic service and endpoint helpers centralized (see Docker/env guidelines already in this file).