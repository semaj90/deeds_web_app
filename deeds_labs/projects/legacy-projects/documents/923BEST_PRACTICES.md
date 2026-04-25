# Modern SvelteKit Legal AI Platform - Best Practices Guide

## Overview
This guide outlines best practices for building scalable legal AI platforms using SvelteKit 2, PostgreSQL, pgvector, Drizzle ORM, TypeScript, Bits UI, Redis, XState, and RabbitMQ.

## 🚀 SvelteKit 2 Best Practices

### Project Structure
```
src/
├── lib/
│   ├── components/          # Reusable components
│   │   ├── ui/             # Bits UI customizations
│   │   ├── legal/          # Domain-specific components
│   │   └── forms/          # Form components
│   ├── stores/             # Global state management
│   ├── utils/              # Utility functions
│   ├── types/              # TypeScript definitions
│   └── server/             # Server-only code
├── routes/
│   ├── (auth)/             # Protected routes
│   ├── (public)/           # Public routes
│   └── api/                # API endpoints
└── app.html                # App shell
```

### Svelte 5 Runes (Modern Pattern)
```typescript
// ❌ Legacy Svelte 3/4 pattern
export let count = 0;
$: doubled = count * 2;
$: console.log(count);

// ✅ Modern Svelte 5 runes pattern
let count = $state(0);
let doubled = $derived(count * 2);
$effect(() => {
  console.log(count);
});
```

### Component Best Practices
```svelte
<script lang="ts">
  // ✅ Use const for non-reassigned variables
  const API_ENDPOINT = '/api/legal/cases';

  // ✅ Use let for mutable state
  let isLoading = $state(false);

  // ✅ Use proper TypeScript interfaces
  interface LegalCase {
    id: string;
    title: string;
    status: 'active' | 'closed' | 'pending';
  }

  // ✅ Use $derived for computed values
  let filteredCases = $derived(
    cases.filter(c => c.status === selectedStatus)
  );
</script>
```

### Route Organization
```typescript
// src/routes/(auth)/cases/+page.server.ts
import type { PageServerLoad } from './$types';
import { db } from '$lib/server/database';
import { redirect } from '@sveltejs/kit';

export const load: PageServerLoad = async ({ locals, depends }) => {
  // ✅ Check authentication server-side
  if (!locals.user) {
    throw redirect(302, '/login');
  }

  // ✅ Use depends for cache invalidation
  depends('cases:list');

  const cases = await db.query.legalCases.findMany({
    where: eq(legalCases.userId, locals.user.id),
  });

  return { cases };
};
```

## 🗄️ PostgreSQL + pgvector Best Practices

### Database Schema Design
```sql
-- ✅ Use JSONB for flexible legal metadata
CREATE TABLE legal_documents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title TEXT NOT NULL,
  content TEXT NOT NULL,
  metadata JSONB NOT NULL DEFAULT '{}',
  embedding vector(768), -- pgvector for semantic search
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- ✅ Create GIN index for JSONB queries
CREATE INDEX idx_legal_documents_metadata
ON legal_documents USING gin (metadata jsonb_path_ops);

-- ✅ Create HNSW index for vector similarity
CREATE INDEX idx_legal_documents_embedding
ON legal_documents USING hnsw (embedding vector_cosine_ops);
```

### Vector Search Optimization
```typescript
// ✅ Efficient vector similarity search
const searchSimilarDocuments = async (queryEmbedding: number[], limit = 10) => {
  return await db.execute(sql`
    SELECT
      id,
      title,
      metadata,
      1 - (embedding <=> ${queryEmbedding}::vector) as similarity
    FROM legal_documents
    WHERE embedding <=> ${queryEmbedding}::vector < 0.3
    ORDER BY embedding <=> ${queryEmbedding}::vector
    LIMIT ${limit}
  `);
};
```

## 🔄 Drizzle ORM Best Practices

### Schema Definition
```typescript
// src/lib/server/schema.ts
import { pgTable, uuid, text, jsonb, timestamp, vector } from 'drizzle-orm/pg-core';
import { relations } from 'drizzle-orm';

export const legalCases = pgTable('legal_cases', {
  id: uuid('id').primaryKey().defaultRandom(),
  title: text('title').notNull(),
  description: text('description'),
  metadata: jsonb('metadata').default('{}'),
  embedding: vector('embedding', { dimensions: 768 }),
  createdAt: timestamp('created_at').defaultNow(),
  updatedAt: timestamp('updated_at').defaultNow(),
});

export const evidence = pgTable('evidence', {
  id: uuid('id').primaryKey().defaultRandom(),
  caseId: uuid('case_id').references(() => legalCases.id),
  type: text('type', { enum: ['document', 'photo', 'video', 'audio'] }),
  content: text('content'),
  metadata: jsonb('metadata').default('{}'),
});

// ✅ Define relations for type safety
export const legalCasesRelations = relations(legalCases, ({ many }) => ({
  evidence: many(evidence),
}));
```

### Query Patterns
```typescript
// ✅ Use prepared statements for performance
const findCasesByUser = db
  .select()
  .from(legalCases)
  .where(eq(legalCases.userId, placeholder('userId')))
  .prepare();

// ✅ Use transactions for data consistency
const createCaseWithEvidence = async (caseData: CaseInput, evidenceData: EvidenceInput[]) => {
  return await db.transaction(async (tx) => {
    const [newCase] = await tx.insert(legalCases).values(caseData).returning();

    const evidenceWithCaseId = evidenceData.map(e => ({
      ...e,
      caseId: newCase.id,
    }));

    await tx.insert(evidence).values(evidenceWithCaseId);
    return newCase;
  });
};
```

## 🎯 TypeScript Best Practices

### Type Definitions
```typescript
// src/lib/types/legal.ts

// ✅ Use const assertions for literal types
export const CASE_STATUSES = ['active', 'closed', 'pending'] as const;
export type CaseStatus = typeof CASE_STATUSES[number];

// ✅ Use discriminated unions for type safety
export type LegalDocument =
  | { type: 'contract'; parties: string[]; effectiveDate: Date }
  | { type: 'evidence'; caseId: string; collectedAt: Date }
  | { type: 'brief'; courtLevel: 'district' | 'appellate' | 'supreme' };

// ✅ Use generic types for reusable patterns
export interface APIResponse<T> {
  data: T;
  success: boolean;
  message?: string;
  pagination?: {
    page: number;
    totalPages: number;
    totalItems: number;
  };
}

// ✅ Use utility types for transformations
export type CreateLegalCase = Omit<LegalCase, 'id' | 'createdAt' | 'updatedAt'>;
export type UpdateLegalCase = Partial<CreateLegalCase>;
```

### Error Handling
```typescript
// src/lib/utils/result.ts
// ✅ Use Result pattern for error handling
export type Result<T, E = Error> =
  | { success: true; data: T }
  | { success: false; error: E };

export const safeAsync = async <T>(
  fn: () => Promise<T>
): Promise<Result<T>> => {
  try {
    const data = await fn();
    return { success: true, data };
  } catch (error) {
    return { success: false, error: error as Error };
  }
};
```

## 🎨 Bits UI Best Practices

### Component Composition
```svelte
<!-- src/lib/components/ui/legal-case-dialog.svelte -->
<script lang="ts">
  import * as Dialog from "bits-ui";
  import * as Form from "bits-ui/form";
  import Button from "$lib/components/ui/button.svelte";

  interface Props {
    open?: boolean;
    onSubmit?: (data: LegalCaseData) => void;
  }

  let { open = $bindable(false), onSubmit }: Props = $props();
</script>

<Dialog.Root bind:open>
  <Dialog.Trigger asChild let:builder>
    <Button builders={[builder]} variant="default">
      Create New Case
    </Button>
  </Dialog.Trigger>

  <Dialog.Content>
    <Dialog.Header>
      <Dialog.Title>Create Legal Case</Dialog.Title>
      <Dialog.Description>
        Enter case details to create a new legal case.
      </Dialog.Description>
    </Dialog.Header>

    <Form.Root {onSubmit}>
      <Form.Field name="title">
        <Form.Label>Case Title</Form.Label>
        <Form.Input required />
        <Form.Validation />
      </Form.Field>

      <Dialog.Footer>
        <Button type="submit">Create Case</Button>
      </Dialog.Footer>
    </Form.Root>
  </Dialog.Content>
</Dialog.Root>
```

### Theme Customization
```typescript
// src/lib/styles/theme.ts
export const legalTheme = {
  colors: {
    primary: "hsl(210, 100%, 40%)", // Legal blue
    secondary: "hsl(0, 0%, 20%)",   // Professional gray
    accent: "hsl(45, 100%, 50%)",   // Attention yellow
    destructive: "hsl(0, 85%, 60%)", // Warning red
  },
  fonts: {
    sans: ["Inter", "system-ui", "sans-serif"],
    mono: ["JetBrains Mono", "monospace"],
  },
};
```

## 🔴 Redis Best Practices

### Caching Strategies
```typescript
// src/lib/server/cache.ts
import { Redis } from 'ioredis';

const redis = new Redis({
  host: 'localhost',
  port: 6379,
  password: process.env.REDIS_PASSWORD,
  retryDelayOnFailover: 100,
  maxRetriesPerRequest: 3,
});

// ✅ Use namespaced keys
const CACHE_KEYS = {
  LEGAL_CASE: (id: string) => `legal:case:${id}`,
  USER_CASES: (userId: string) => `user:${userId}:cases`,
  SEARCH_RESULTS: (query: string) => `search:${Buffer.from(query).toString('base64')}`,
} as const;

// ✅ Implement cache-aside pattern
export const getCachedLegalCase = async (id: string): Promise<LegalCase | null> => {
  const cached = await redis.get(CACHE_KEYS.LEGAL_CASE(id));

  if (cached) {
    return JSON.parse(cached);
  }

  const caseData = await db.query.legalCases.findFirst({
    where: eq(legalCases.id, id),
  });

  if (caseData) {
    // Cache for 1 hour
    await redis.setex(CACHE_KEYS.LEGAL_CASE(id), 3600, JSON.stringify(caseData));
  }

  return caseData || null;
};

// ✅ Use Redis for session management
export const createUserSession = async (userId: string, sessionData: SessionData) => {
  const sessionId = crypto.randomUUID();
  const sessionKey = `session:${sessionId}`;

  await redis.setex(sessionKey, 86400, JSON.stringify({
    userId,
    ...sessionData,
    createdAt: new Date().toISOString(),
  }));

  return sessionId;
};
```

## 🤖 XState Best Practices

### Machine Definition
```typescript
// src/lib/machines/legal-case-machine.ts
import { setup, assign } from 'xstate';

interface LegalCaseContext {
  caseId: string | null;
  currentCase: LegalCase | null;
  evidence: Evidence[];
  error: string | null;
  isLoading: boolean;
}

type LegalCaseEvent =
  | { type: 'LOAD_CASE'; caseId: string }
  | { type: 'ADD_EVIDENCE'; evidence: Evidence }
  | { type: 'UPDATE_CASE'; updates: Partial<LegalCase> }
  | { type: 'DELETE_CASE' }
  | { type: 'RETRY' };

export const legalCaseMachine = setup({
  types: {
    context: {} as LegalCaseContext,
    events: {} as LegalCaseEvent,
  },
  actions: {
    setLoading: assign({ isLoading: true, error: null }),
    setCase: assign({
      currentCase: ({ event }) => event.case,
      isLoading: false
    }),
    setError: assign({
      error: ({ event }) => event.error,
      isLoading: false
    }),
    addEvidence: assign({
      evidence: ({ context, event }) => [...context.evidence, event.evidence]
    }),
  },
  actors: {
    loadCase: fromPromise(async ({ input }: { input: { caseId: string } }) => {
      const response = await fetch(`/api/cases/${input.caseId}`);
      if (!response.ok) throw new Error('Failed to load case');
      return response.json();
    }),
  },
}).createMachine({
  id: 'legalCase',
  initial: 'idle',
  context: {
    caseId: null,
    currentCase: null,
    evidence: [],
    error: null,
    isLoading: false,
  },
  states: {
    idle: {
      on: {
        LOAD_CASE: {
          target: 'loading',
          actions: [
            'setLoading',
            assign({ caseId: ({ event }) => event.caseId })
          ],
        },
      },
    },
    loading: {
      invoke: {
        src: 'loadCase',
        input: ({ context }) => ({ caseId: context.caseId! }),
        onDone: {
          target: 'loaded',
          actions: assign({
            currentCase: ({ event }) => event.output,
            isLoading: false
          }),
        },
        onError: {
          target: 'error',
          actions: 'setError',
        },
      },
    },
    loaded: {
      on: {
        ADD_EVIDENCE: {
          actions: 'addEvidence',
        },
        UPDATE_CASE: {
          target: 'updating',
        },
        DELETE_CASE: {
          target: 'deleting',
        },
      },
    },
    error: {
      on: {
        RETRY: 'loading',
      },
    },
  },
});
```

### Component Integration
```svelte
<!-- src/lib/components/legal-case-manager.svelte -->
<script lang="ts">
  import { useMachine } from '@xstate/svelte';
  import { legalCaseMachine } from '$lib/machines/legal-case-machine';

  const { state, send } = useMachine(legalCaseMachine);

  // ✅ Reactive derived values
  $: isLoading = $state.matches('loading');
  $: currentCase = $state.context.currentCase;
  $: hasError = $state.matches('error');
</script>

{#if isLoading}
  <div>Loading case...</div>
{:else if hasError}
  <div>
    Error: {$state.context.error}
    <button onclick={() => send({ type: 'RETRY' })}>
      Retry
    </button>
  </div>
{:else if currentCase}
  <div>
    <h1>{currentCase.title}</h1>
    <button onclick={() => send({ type: 'ADD_EVIDENCE', evidence: newEvidence })}>
      Add Evidence
    </button>
  </div>
{/if}
```

## 🐰 RabbitMQ Best Practices

### Queue Configuration
```typescript
// src/lib/server/messaging.ts
import amqp from 'amqplib';

const QUEUES = {
  DOCUMENT_PROCESSING: 'legal.document.processing',
  AI_ANALYSIS: 'legal.ai.analysis',
  NOTIFICATION: 'legal.notification',
} as const;

export class MessageQueue {
  private connection: amqp.Connection | null = null;
  private channel: amqp.Channel | null = null;

  async connect(): Promise<void> {
    this.connection = await amqp.connect(process.env.RABBITMQ_URL!);
    this.channel = await this.connection.createChannel();

    // ✅ Declare queues with durability
    for (const queue of Object.values(QUEUES)) {
      await this.channel.assertQueue(queue, {
        durable: true,
        arguments: {
          'x-max-retries': 3,
          'x-message-ttl': 300000, // 5 minutes
        },
      });
    }
  }

  // ✅ Use typed message publishing
  async publishDocumentProcessing(payload: DocumentProcessingPayload): Promise<void> {
    if (!this.channel) throw new Error('Channel not initialized');

    await this.channel.sendToQueue(
      QUEUES.DOCUMENT_PROCESSING,
      Buffer.from(JSON.stringify(payload)),
      {
        persistent: true,
        messageId: crypto.randomUUID(),
        timestamp: Date.now(),
      }
    );
  }

  // ✅ Implement consumer with error handling
  async consumeDocumentProcessing(
    handler: (payload: DocumentProcessingPayload) => Promise<void>
  ): Promise<void> {
    if (!this.channel) throw new Error('Channel not initialized');

    await this.channel.consume(QUEUES.DOCUMENT_PROCESSING, async (msg) => {
      if (!msg) return;

      try {
        const payload = JSON.parse(msg.content.toString());
        await handler(payload);
        this.channel!.ack(msg);
      } catch (error) {
        console.error('Message processing failed:', error);
        // Reject and requeue with limit
        this.channel!.nack(msg, false, msg.properties.headers?.['x-death']?.length < 3);
      }
    });
  }
}
```

## 🔧 Development Workflow Best Practices

### Environment Setup
```typescript
// src/lib/env.ts
import { z } from 'zod';

const envSchema = z.object({
  DATABASE_URL: z.string(),
  REDIS_URL: z.string(),
  RABBITMQ_URL: z.string(),
  OLLAMA_URL: z.string().default('http://localhost:11434'),
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
});

export const env = envSchema.parse(process.env);
```

### Testing Strategy
```typescript
// src/lib/test-utils.ts
import { render } from '@testing-library/svelte';
import { interpret } from 'xstate';
import { legalCaseMachine } from '$lib/machines/legal-case-machine';

// ✅ Machine testing utilities
export const createTestActor = (initialContext = {}) => {
  return interpret(legalCaseMachine.withContext({
    ...legalCaseMachine.initialState.context,
    ...initialContext,
  }));
};

// ✅ Component testing with proper context
export const renderWithProviders = (component: any, props = {}) => {
  return render(component, {
    props,
    context: new Map([
      ['db', mockDb],
      ['redis', mockRedis],
    ]),
  });
};
```

### Performance Monitoring
```typescript
// src/lib/server/monitoring.ts
export const withTiming = <T extends (...args: any[]) => any>(
  fn: T,
  name: string
): T => {
  return ((...args: Parameters<T>) => {
    const start = performance.now();
    const result = fn(...args);

    if (result instanceof Promise) {
      return result.finally(() => {
        console.log(`${name} took ${performance.now() - start}ms`);
      });
    }

    console.log(`${name} took ${performance.now() - start}ms`);
    return result;
  }) as T;
};
```

## 🚦 Code Quality Guidelines

### Modern JavaScript/TypeScript Patterns
```typescript
// ✅ Use const for immutable values
const API_ENDPOINTS = {
  CASES: '/api/cases',
  EVIDENCE: '/api/evidence',
} as const;

// ✅ Use let only when reassignment is needed
let currentUser: User | null = null;

// ✅ Prefer arrow functions for callbacks
const processDocuments = documents.map(doc => ({
  ...doc,
  processed: true,
}));

// ✅ Use optional chaining and nullish coalescing
const userName = user?.profile?.name ?? 'Anonymous';

// ✅ Use template literals for string interpolation
const message = `Processing ${count} documents for case ${caseId}`;

// ✅ Use destructuring for cleaner code
const { title, status, createdAt } = legalCase;
const [first, ...rest] = documents;
```

### Error Handling Patterns
```typescript
// ✅ Use custom error types
export class LegalCaseNotFoundError extends Error {
  constructor(caseId: string) {
    super(`Legal case with ID ${caseId} not found`);
    this.name = 'LegalCaseNotFoundError';
  }
}

// ✅ Implement proper error boundaries
export const errorHandler = (error: unknown, event: any) => {
  console.error('Unhandled error:', error);

  if (error instanceof LegalCaseNotFoundError) {
    return new Response('Case not found', { status: 404 });
  }

  return new Response('Internal server error', { status: 500 });
};
```

## 📊 Performance Optimization

### Database Optimization
```sql
-- ✅ Use partial indexes for filtered queries
CREATE INDEX CONCURRENTLY idx_active_cases
ON legal_cases (created_at)
WHERE status = 'active';

-- ✅ Use materialized views for complex aggregations
CREATE MATERIALIZED VIEW case_statistics AS
SELECT
  status,
  COUNT(*) as count,
  AVG(EXTRACT(days FROM NOW() - created_at)) as avg_age_days
FROM legal_cases
GROUP BY status;
```

### Frontend Optimization
```svelte
<!-- ✅ Use lazy loading for large components -->
<script lang="ts">
  import { onMount } from 'svelte';

  let LargeComponent: any;

  onMount(async () => {
    const module = await import('./LargeComponent.svelte');
    LargeComponent = module.default;
  });
</script>

{#if LargeComponent}
  <svelte:component this={LargeComponent} {props} />
{/if}
```

## 🔒 Security Best Practices

### Input Validation
```typescript
// src/lib/validation/legal-case.ts
import { z } from 'zod';

export const createLegalCaseSchema = z.object({
  title: z.string().min(1).max(255),
  description: z.string().optional(),
  type: z.enum(['civil', 'criminal', 'administrative']),
  priority: z.enum(['low', 'medium', 'high', 'critical']),
  metadata: z.record(z.unknown()).optional(),
});

export type CreateLegalCase = z.infer<typeof createLegalCaseSchema>;
```

### Authentication & Authorization
```typescript
// src/lib/server/auth.ts
import jwt from 'jsonwebtoken';

export const requireAuth = async (locals: App.Locals) => {
  if (!locals.user) {
    throw redirect(302, '/login');
  }
  return locals.user;
};

export const requireRole = (requiredRole: UserRole) => {
  return async (locals: App.Locals) => {
    const user = await requireAuth(locals);

    if (!user.roles.includes(requiredRole)) {
      throw error(403, 'Insufficient permissions');
    }

    return user;
  };
};
```

## 📈 Monitoring & Observability

### Structured Logging
```typescript
// src/lib/server/logger.ts
import pino from 'pino';

export const logger = pino({
  level: process.env.LOG_LEVEL ?? 'info',
  formatters: {
    level: (label) => ({ level: label }),
  },
  timestamp: pino.stdTimeFunctions.isoTime,
});

export const auditLogger = logger.child({
  component: 'audit',
  service: 'legal-ai'
});

// Usage
auditLogger.info({
  action: 'case_created',
  caseId: newCase.id,
  userId: user.id,
  timestamp: new Date().toISOString(),
}, 'New legal case created');
```

## 🎯 Summary

This comprehensive guide covers modern development patterns for building scalable legal AI platforms. Key takeaways:

1. **Use modern language features** - const over var, arrow functions, optional chaining
2. **Implement proper TypeScript patterns** - strict typing, error handling, result types
3. **Leverage Svelte 5 runes** - $state, $derived, $effect for reactive programming
4. **Optimize database performance** - proper indexing, prepared statements, transactions
5. **Structure state management** - XState for complex flows, stores for global state
6. **Implement robust caching** - Redis for session management and query caching
7. **Use message queues effectively** - RabbitMQ for background processing
8. **Focus on developer experience** - proper tooling, testing, and monitoring

Following these patterns will result in maintainable, scalable, and performant legal AI applications.