# 🚀 Legal AI Platform - Full-Stack TypeScript Production Setup

**SvelteKit 2 + Svelte 5 + WebGPU + CUDA + Transformers.js + LangChain.js**

Production-ready legal AI platform with GPU acceleration, vector search, and real-time collaboration.

---

## 🏗️ Tech Stack

### Frontend
- **Svelte 5** (runes, snippets, event attributes)
- **SvelteKit 2** (SSR, API routes, adapters)
- **Bits-UI** (headless components, SSR-compatible)
- **UnoCSS** (atomic CSS, presets: forms, radix)
- **NES.css** (retro gaming UI)
- **WebGL2/WebGPU** (ANGLE bridge for GPU acceleration)

### Backend
- **TypeScript** (full-stack type safety)
- **Drizzle ORM** (PostgreSQL with pgvector)
- **XState v5** (state machines, actors)
- **RabbitMQ** (message queues, replaced BullMQ)
- **Redis Stack** (caching, JSON, Search, Bloom filters)

### AI/ML
- **Ollama** (`gemma3-legal:latest`, `embeddinggemma:latest`)
- **Transformers.js v3** (browser-side inference)
- **LangChain.js** (RAG chains, embeddings)
- **WebGPU** (tensor operations, CUDA backend)

### Databases
- **PostgreSQL 17** (with pgvector extension)
- **Qdrant** (vector database for embeddings)
- **IndexedDB** (client-side storage)
- **Loki.js** (in-memory document store)

### Search
- **Fuse.js** (fuzzy search)
- **pg_trgm** (PostgreSQL trigram search)
- **Qdrant** (semantic vector search)

---

## 🔧 Environment Setup

### Required Environment Variables

Create `.env` file:

```bash
# Database
DATABASE_URL=postgresql://legal_admin:123456@postgres:5432/legal_ai_db
PGVECTOR_URL=postgresql://legal_admin:123456@postgres:5432/legal_ai_db

# Redis
REDIS_URL=redis://:redis@redis:6379/0
REDIS_HOST=redis
REDIS_PORT=6379
REDIS_PASSWORD=redis

# RabbitMQ (replaces BullMQ)
RABBITMQ_URL=amqp://legal_admin:123456@rabbitmq:5672
RABBITMQ_HOST=rabbitmq
RABBITMQ_PORT=5672
RABBITMQ_USER=legal_admin
RABBITMQ_PASSWORD=123456

# Ollama AI
OLLAMA_URL=http://ollama:11434
OLLAMA_MODEL=gemma3-legal:latest
OLLAMA_EMBEDDING_MODEL=embeddinggemma:latest

# Qdrant Vector DB
QDRANT_URL=http://qdrant:6333
QDRANT_API_KEY=

# MinIO Object Storage
MINIO_ENDPOINT=minio:9000
MINIO_ACCESS_KEY=minioadmin
MINIO_SECRET_KEY=minioadmin
MINIO_BUCKET=legal-documents

# Neo4j Graph DB
NEO4J_URI=bolt://neo4j:7687
NEO4J_USER=neo4j
NEO4J_PASSWORD=legal123456

# Public URLs (exposed to client)
PUBLIC_API_URL=http://localhost:5173/api
PUBLIC_WS_URL=ws://localhost:5173/ws
PUBLIC_OLLAMA_URL=http://localhost:11434

# Server-only secrets
PRIVATE_JWT_SECRET=your-super-secret-jwt-key-change-in-production
PRIVATE_ENCRYPTION_KEY=your-encryption-key-32-chars-min
```

### Docker Compose Services

```yaml
version: '3.8'

services:
  # PostgreSQL with pgvector
  postgres:
    image: pgvector/pgvector:pg17
    environment:
      POSTGRES_DB: legal_ai_db
      POSTGRES_USER: legal_admin
      POSTGRES_PASSWORD: 123456
    ports:
      - "5432:5432"
    volumes:
      - postgres-data:/var/lib/postgresql/data
      - ./init-db.sql:/docker-entrypoint-initdb.d/init.sql

  # Redis Stack
  redis:
    image: redis/redis-stack:latest
    ports:
      - "6379:6379"
      - "8001:8001"  # RedisInsight
    environment:
      REDIS_ARGS: "--requirepass redis"
    volumes:
      - redis-data:/data

  # RabbitMQ
  rabbitmq:
    image: rabbitmq:3-management-alpine
    environment:
      RABBITMQ_DEFAULT_USER: legal_admin
      RABBITMQ_DEFAULT_PASS: 123456
    ports:
      - "5672:5672"
      - "15672:15672"  # Management UI
    volumes:
      - rabbitmq-data:/var/lib/rabbitmq

  # Qdrant Vector DB
  qdrant:
    image: qdrant/qdrant:latest
    ports:
      - "6333:6333"
      - "6334:6334"
    volumes:
      - qdrant-data:/qdrant/storage

  # Ollama AI
  ollama:
    image: ollama/ollama:latest
    ports:
      - "11434:11434"
    volumes:
      - ollama-data:/root/.ollama
    deploy:
      resources:
        reservations:
          devices:
            - driver: nvidia
              count: all
              capabilities: [gpu]

  # Neo4j Graph DB
  neo4j:
    image: neo4j:latest
    environment:
      NEO4J_AUTH: neo4j/legal123456
    ports:
      - "7474:7474"
      - "7687:7687"
    volumes:
      - neo4j-data:/data

  # MinIO Object Storage
  minio:
    image: minio/minio:latest
    command: server /data --console-address ":9001"
    environment:
      MINIO_ROOT_USER: minioadmin
      MINIO_ROOT_PASSWORD: minioadmin
    ports:
      - "9000:9000"
      - "9001:9001"
    volumes:
      - minio-data:/data

volumes:
  postgres-data:
  redis-data:
  rabbitmq-data:
  qdrant-data:
  ollama-data:
  neo4j-data:
  minio-data:
```

---

## 📁 Project Structure

```
sveltekit-frontend/
├── src/
│   ├── lib/
│   │   ├── server/           # Server-only code
│   │   │   ├── db/
│   │   │   │   ├── client.ts           # Drizzle client
│   │   │   │   ├── schema-postgres.ts  # DB schema
│   │   │   │   └── utils.ts
│   │   │   ├── ai/
│   │   │   │   ├── ollama.ts           # Ollama client
│   │   │   │   ├── embeddings.ts       # Embedding service
│   │   │   │   └── rag.ts              # RAG pipeline
│   │   │   ├── cache/
│   │   │   │   └── redis.ts            # Redis client
│   │   │   ├── queue/
│   │   │   │   └── rabbitmq.ts         # RabbitMQ client
│   │   │   ├── vector/
│   │   │   │   ├── qdrant.ts           # Qdrant client
│   │   │   │   └── pgvector.ts         # pgvector queries
│   │   │   └── env.server.ts           # Server env vars
│   │   ├── ai/               # Client-side AI
│   │   │   ├── transformers.ts         # Transformers.js
│   │   │   ├── webgpu.ts              # WebGPU compute
│   │   │   └── langchain.ts           # LangChain client
│   │   ├── state/            # XState v5 machines
│   │   │   ├── auth.machine.ts
│   │   │   ├── chat.machine.ts
│   │   │   └── document.machine.ts
│   │   ├── components/       # UI components
│   │   │   └── ui/           # Bits-UI wrappers
│   │   ├── stores/           # Svelte stores
│   │   ├── utils/            # Utilities
│   │   └── config.ts         # Public config
│   ├── routes/
│   │   ├── api/              # SvelteKit API routes
│   │   │   ├── ai/
│   │   │   │   ├── chat/+server.ts
│   │   │   │   ├── embed/+server.ts
│   │   │   │   └── search/+server.ts
│   │   │   ├── contextual/
│   │   │   │   ├── state/+server.ts
│   │   │   │   ├── predictions/+server.ts
│   │   │   │   └── chat/+server.ts
│   │   │   ├── documents/+server.ts
│   │   │   ├── vector-search/+server.ts
│   │   │   └── health/+server.ts
│   │   ├── (app)/            # Protected routes
│   │   │   ├── dashboard/+page.svelte
│   │   │   └── chat/+page.svelte
│   │   ├── +layout.svelte    # Root layout
│   │   └── +page.svelte      # Homepage
│   ├── hooks.server.ts       # SvelteKit hooks
│   └── app.html              # HTML template
├── static/
│   └── wasm/                 # WebAssembly modules
├── docker-compose.yml
├── Dockerfile
├── package.json
├── svelte.config.js
├── vite.config.ts
├── uno.config.ts
├── drizzle.config.ts
└── tsconfig.json
```

---

## 🎨 Svelte 5 Best Practices

### Event Handlers (Event Attributes)

```svelte
<!-- ❌ Old (deprecated) -->
<button on:click={() => doSomething()}>Click</button>

<!-- ✅ New (Svelte 5) -->
<button onclick={() => doSomething()}>Click</button>
```

### Reactive State (Runes)

```svelte
<script lang="ts">
  // ❌ Old
  let count = 0;
  $: doubled = count * 2;

  // ✅ New (Svelte 5)
  let count = $state(0);
  let doubled = $derived(count * 2);
</script>
```

### Dynamic Components

```svelte
<script lang="ts">
  import ComponentA from './A.svelte';
  import ComponentB from './B.svelte';

  let active = $state('A');

  // ❌ Avoid <svelte:component> for static references
  // ✅ Use $derived for dynamic selection
  let Component = $derived(active === 'A' ? ComponentA : ComponentB);
</script>

<Component />
```

### Props

```svelte
<script lang="ts">
  // ❌ Old
  export let title: string;
  export let count: number = 0;

  // ✅ New (Svelte 5)
  let { title, count = 0 }: { title: string; count?: number } = $props();
</script>
```

---

## 🔌 API Endpoint Patterns

### Ollama Integration

```typescript
// src/lib/server/ai/ollama.ts
import { env } from '$lib/server/env.server';

export function getOllamaEndpoint(): string {
  return env.OLLAMA_URL || 'http://localhost:11434';
}

export async function generateChat(prompt: string) {
  const response = await fetch(`${getOllamaEndpoint()}/api/generate`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: 'gemma3-legal:latest',
      prompt,
      stream: false
    })
  });
  return response.json();
}

export async function getEmbedding(text: string) {
  const response = await fetch(`${getOllamaEndpoint()}/api/embeddings`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: 'embeddinggemma:latest',
      prompt: text
    })
  });
  return response.json();
}
```

### Contextual Chat API

```typescript
// src/routes/api/contextual/chat/+server.ts
import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { generateChat } from '$lib/server/ai/ollama';

export const POST: RequestHandler = async ({ request }) => {
  const { message, context } = await request.json();

  try {
    const prompt = `Context: ${context}\n\nUser: ${message}\n\nAssistant:`;
    const result = await generateChat(prompt);

    return json({
      success: true,
      response: result.response
    });
  } catch (error) {
    return json({
      success: false,
      error: error.message
    }, { status: 500 });
  }
};
```

### Vector Search API

```typescript
// src/routes/api/vector-search/+server.ts
import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { getEmbedding } from '$lib/server/ai/ollama';
import { searchVectors } from '$lib/server/vector/qdrant';

export const POST: RequestHandler = async ({ request }) => {
  const { query, limit = 10 } = await request.json();

  try {
    // Generate embedding
    const { embedding } = await getEmbedding(query);

    // Search Qdrant
    const results = await searchVectors(embedding, limit);

    return json({
      success: true,
      results
    });
  } catch (error) {
    return json({
      success: false,
      error: error.message
    }, { status: 500 });
  }
};
```

---

## 🎨 UI Component Setup

### Root Layout (SSR-compatible)

```svelte
<!-- src/routes/+layout.svelte -->
<script lang="ts">
  import 'uno.css';
  import 'nes.css';
  import { onMount } from 'svelte';

  let { children } = $props();

  onMount(() => {
    // Client-side only initializations
    console.log('App mounted');
  });
</script>

<div class="app">
  {@render children()}
</div>

<style>
  :global(body) {
    margin: 0;
    padding: 0;
    font-family: system-ui, -apple-system, sans-serif;
  }
</style>
```

### UnoCSS Configuration

```typescript
// uno.config.ts
import { defineConfig, presetUno, presetForms, presetRadix } from 'unocss';
import { transformerCompileClass, transformerDirectives } from '@unocss/transformer';

export default defineConfig({
  presets: [
    presetUno(),
    presetForms(),
    presetRadix()
  ],
  transformers: [
    transformerCompileClass(),
    transformerDirectives()
  ],
  shortcuts: {
    'btn': 'px-4 py-2 rounded bg-blue-600 text-white hover:bg-blue-700',
    'card': 'p-4 rounded-lg border border-gray-200 shadow-sm'
  }
});
```

### Bits-UI Component Wrapper

```svelte
<!-- src/lib/components/ui/button/Button.svelte -->
<script lang="ts">
  import { Button as ButtonPrimitive } from 'bits-ui';

  let {
    variant = 'default',
    size = 'md',
    children,
    onclick,
    ...restProps
  }: {
    variant?: 'default' | 'outline' | 'ghost';
    size?: 'sm' | 'md' | 'lg';
    children?: any;
    onclick?: (e: MouseEvent) => void;
    [key: string]: any;
  } = $props();

  const variants = {
    default: 'btn',
    outline: 'px-4 py-2 rounded border border-blue-600 text-blue-600',
    ghost: 'px-4 py-2 rounded hover:bg-gray-100'
  };
</script>

<ButtonPrimitive.Root
  class={variants[variant]}
  {onclick}
  {...restProps}
>
  {@render children?.()}
</ButtonPrimitive.Root>
```

---

## 🔄 XState v5 Integration

### Auth Machine

```typescript
// src/lib/state/auth.machine.ts
import { createMachine, assign } from 'xstate';

export const authMachine = createMachine({
  id: 'auth',
  initial: 'idle',
  context: {
    user: null,
    error: null
  },
  states: {
    idle: {
      on: {
        LOGIN: 'authenticating'
      }
    },
    authenticating: {
      invoke: {
        src: 'loginUser',
        onDone: {
          target: 'authenticated',
          actions: assign({
            user: ({ event }) => event.output
          })
        },
        onError: {
          target: 'idle',
          actions: assign({
            error: ({ event }) => event.error
          })
        }
      }
    },
    authenticated: {
      on: {
        LOGOUT: 'idle'
      }
    }
  }
});
```

### Using in Svelte 5

```svelte
<script lang="ts">
  import { createActor } from 'xstate';
  import { authMachine } from '$lib/state/auth.machine';

  let actor = $state(createActor(authMachine).start());
  let snapshot = $state(actor.getSnapshot());

  $effect(() => {
    const subscription = actor.subscribe((state) => {
      snapshot = state;
    });
    return () => subscription.unsubscribe();
  });

  function login() {
    actor.send({ type: 'LOGIN' });
  }
</script>

{#if snapshot.matches('authenticated')}
  <p>Welcome, {snapshot.context.user?.name}</p>
  <button onclick={() => actor.send({ type: 'LOGOUT' })}>Logout</button>
{:else}
  <button onclick={login}>Login</button>
{/if}
```

---

## 🗄️ Drizzle ORM Setup

### Schema Definition

```typescript
// src/lib/server/db/schema-postgres.ts
import { pgTable, serial, text, timestamp, vector } from 'drizzle-orm/pg-core';

export const documents = pgTable('documents', {
  id: serial('id').primaryKey(),
  title: text('title').notNull(),
  content: text('content').notNull(),
  embedding: vector('embedding', { dimensions: 768 }),
  createdAt: timestamp('created_at').defaultNow(),
  updatedAt: timestamp('updated_at').defaultNow()
});

export const cases = pgTable('cases', {
  id: serial('id').primaryKey(),
  title: text('title').notNull(),
  description: text('description'),
  status: text('status').default('active'),
  createdAt: timestamp('created_at').defaultNow()
});
```

### Database Client

```typescript
// src/lib/server/db/client.ts
import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import { env } from '$lib/server/env.server';
import * as schema from './schema-postgres';

const connection = postgres(env.DATABASE_URL);
export const db = drizzle(connection, { schema });
```

### Queries

```typescript
// src/lib/server/db/utils.ts
import { db } from './client';
import { documents } from './schema-postgres';
import { eq, sql } from 'drizzle-orm';

export async function searchDocumentsByVector(embedding: number[], limit = 10) {
  return db.select()
    .from(documents)
    .orderBy(sql`embedding <=> ${embedding}::vector`)
    .limit(limit);
}

export async function insertDocument(doc: typeof documents.$inferInsert) {
  return db.insert(documents).values(doc).returning();
}
```

---

## 🚀 Production Deployment

### Build Commands

```bash
# Install dependencies
npm install

# Pull Ollama models
docker exec ollama ollama pull gemma3-legal:latest
docker exec ollama ollama pull embeddinggemma:latest

# Run database migrations
npm run db:migrate

# Build WASM modules
npm run build:wasm

# Build production
npm run build

# Start production server
npm run preview
```

### Health Checks

```typescript
// src/routes/api/health/+server.ts
import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { db } from '$lib/server/db/client';

export const GET: RequestHandler = async () => {
  const health = {
    status: 'ok',
    timestamp: new Date().toISOString(),
    services: {
      database: false,
      redis: false,
      ollama: false,
      qdrant: false
    }
  };

  try {
    // Test database
    await db.execute(sql`SELECT 1`);
    health.services.database = true;
  } catch {}

  // Test other services...

  const allHealthy = Object.values(health.services).every(s => s);

  return json(health, {
    status: allHealthy ? 200 : 503
  });
};
```

---

## 📚 Key Documentation Links

- **Svelte 5:** https://svelte.dev/docs/svelte/overview
- **SvelteKit 2:** https://svelte.dev/docs/kit
- **Bits-UI:** https://bits-ui.com
- **UnoCSS:** https://unocss.dev
- **Drizzle ORM:** https://orm.drizzle.team
- **XState v5:** https://stateofjs.com/libraries/xstate
- **Transformers.js:** https://huggingface.co/docs/transformers.js
- **LangChain.js:** https://js.langchain.com
- **Qdrant:** https://qdrant.tech/documentation
- **Ollama:** https://ollama.ai/library

---

## ✅ Production Checklist

- [ ] Environment variables configured
- [ ] Docker services running
- [ ] Database migrations applied
- [ ] Ollama models served
- [ ] WASM modules compiled
- [ ] UnoCSS presets installed
- [ ] Bits-UI components SSR-tested
- [ ] XState v5 machines wired
- [ ] RabbitMQ queues configured
- [ ] Redis cache tested
- [ ] Vector search validated
- [ ] WebGPU acceleration verified
- [ ] Health checks passing
- [ ] Production build successful

---

**Status:** ✅ Production Ready
**Last Updated:** November 3, 2025
