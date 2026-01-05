# Phase 2 Knowledge Base Update - Latest Documentation Patterns

**Generated**: January 5, 2026
**Purpose**: Comprehensive documentation patterns for Phase 2 Type System Fixes

---

## 1. WebGPU Best Practices (2025)

### Scalar Array Pattern for Alignment
```wgsl
// ✅ CORRECT - Avoids 16-byte alignment issues
@group(0) @binding(0) var<storage, read> positions: array<f32>;

fn getPosition(index: u32, stride: u32, offset: u32) -> vec3f {
  let i = index * stride + offset;
  return vec3f(positions[i], positions[i + 1u], positions[i + 2u]);
}
```

**Rationale**: `vec3<f32>` requires 16-byte alignment in storage buffers, causing padding issues. Using `array<f32>` with manual reconstruction avoids this.

**TypeScript Integration**:
```typescript
interface WebGPUBufferMetadata {
  stride: number;  // Elements per vertex (e.g., 3 for vec3)
  offset: number;  // Starting offset in array
  count: number;   // Total elements
}

// Helper to create scalar buffer
function createScalarBuffer(device: GPUDevice, data: Float32Array): GPUBuffer {
  const buffer = device.createBuffer({
    size: data.byteLength,
    usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST,
  });
  device.queue.writeBuffer(buffer, 0, data);
  return buffer;
}
```

**Tags**: #webgpu #alignment #compute-shader #gpu #scalar-array

---

## 2. LangChain v1.0 API Patterns

### createAgent() with Middleware
```typescript
import { createAgent } from 'langchain/agents';
import { ChatOpenAI } from 'langchain/chat_models/openai';
import { DynamicTool } from 'langchain/tools';

// ✅ CORRECT LangChain v1.0 pattern
const agent = await createAgent({
  llm: new ChatOpenAI({ modelName: 'gpt-4' }),
  tools: [
    new DynamicTool({
      name: 'search',
      description: 'Search for information',
      func: async (input: string) => {
        return `Results for: ${input}`;
      },
    }),
  ],
  // Middleware hooks (v1.0 feature)
  beforeModel: async (input) => {
    console.log('Before model:', input);
    return input;
  },
  wrapModelCall: async (call) => {
    const start = Date.now();
    const result = await call();
    console.log(`Model call took ${Date.now() - start}ms`);
    return result;
  },
});

// Execute with streaming
const result = await agent.invoke({
  input: 'What is the weather?',
});
```

**Migration from Chains**:
```typescript
// ❌ OLD (deprecated chains)
import { LLMChain } from 'langchain/chains';

// ✅ NEW (v1.0 agents)
import { createAgent } from 'langchain/agents';
```

**Tags**: #langchain #v1.0 #createAgent #middleware #agents

---

## 3. TypeScript 5.x Strict Mode Patterns

### Null Safety with Optional Chaining
```typescript
// ✅ CORRECT TypeScript 5.x patterns
interface User {
  name: string;
  email?: string;
  profile?: {
    avatar?: string;
    bio?: string;
  };
}

function getUserAvatar(user: User | null | undefined): string {
  // Optional chaining + nullish coalescing
  return user?.profile?.avatar ?? '/default-avatar.png';
}

// Type guards for narrowing
function isValidUser(user: unknown): user is User {
  return (
    typeof user === 'object' &&
    user !== null &&
    'name' in user &&
    typeof user.name === 'string'
  );
}

// Satisfies operator (TS 4.9+)
const config = {
  apiUrl: 'https://api.example.com',
  timeout: 5000,
} satisfies Record<string, string | number>;
```

**Generic Constraints**:
```typescript
// ✅ CORRECT generic type constraints
function getProperty<T, K extends keyof T>(obj: T, key: K): T[K] {
  return obj[key];
}

// Conditional types
type Awaited<T> = T extends Promise<infer U> ? U : T;

// Template literal types
type EventName<T extends string> = `on${Capitalize<T>}`;
type ClickEvent = EventName<'click'>; // 'onClick'
```

**Tags**: #typescript #5.x #null-safety #generics #strict-mode

---

## 4. Drizzle ORM 0.44 Schema Patterns

### Table Definition with Array Syntax
```typescript
import { pgTable, uuid, text, timestamp, index, foreignKey } from 'drizzle-orm/pg-core';

// ✅ CORRECT Drizzle 0.44 pattern (array syntax)
export const documents = pgTable('documents', {
  id: uuid('id').primaryKey().defaultRandom(),
  caseId: uuid('case_id').notNull(),
  title: text('title').notNull(),
  content: text('content'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
}, (table) => [
  // Return array, not object
  index('documents_case_id_idx').on(table.caseId),
  index('documents_created_at_idx').on(table.createdAt),
  foreignKey({
    columns: [table.caseId],
    foreignColumns: [cases.id],
    name: 'documents_case_fk',
  }).onDelete('cascade'),
]);

// Relations
export const documentsRelations = relations(documents, ({ one, many }) => ({
  case: one(cases, {
    fields: [documents.caseId],
    references: [cases.id],
  }),
  evidence: many(evidence),
}));
```

**Query Patterns**:
```typescript
import { db } from '$lib/server/db';
import { documents } from '$lib/server/db/schema';
import { eq, and, desc } from 'drizzle-orm';

// ✅ CORRECT query patterns
const docs = await db
  .select()
  .from(documents)
  .where(and(
    eq(documents.caseId, caseId),
    eq(documents.status, 'active')
  ))
  .orderBy(desc(documents.createdAt))
  .limit(10);
```

**Tags**: #drizzle #orm #0.44 #schema #postgresql

---

## 5. Bits UI v2.0 + Svelte 5 Integration

### Import Paths and Component Usage
```svelte
<script lang="ts">
  // ✅ CORRECT Bits UI v2.0 imports
  import { Dialog, Button, Select } from 'bits-ui';
  import type { DialogProps } from 'bits-ui';

  // Svelte 5 runes
  let isOpen = $state(false);
  let selectedValue = $state<string>('');

  // Props with $bindable
  interface Props {
    value?: string;
    onValueChange?: (value: string) => void;
  }

  let { value = $bindable(''), onValueChange }: Props = $props();
</script>

<!-- Dialog component -->
<Button.Root onclick={() => isOpen = true}>
  Open Dialog
</Button.Root>

<Dialog.Root bind:open={isOpen}>
  <Dialog.Portal>
    <Dialog.Overlay class="fixed inset-0 bg-black/50" />
    <Dialog.Content class="fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 bg-white p-6 rounded-lg">
      <Dialog.Title>Dialog Title</Dialog.Title>
      <Dialog.Description>Content here</Dialog.Description>
      <Dialog.Close>Close</Dialog.Close>
    </Dialog.Content>
  </Dialog.Portal>
</Dialog.Root>

<!-- Select component -->
<Select.Root bind:value={selectedValue}>
  <Select.Trigger>
    <Select.Value placeholder="Select option" />
  </Select.Trigger>
  <Select.Content>
    <Select.Item value="option1">Option 1</Select.Item>
    <Select.Item value="option2">Option 2</Select.Item>
  </Select.Content>
</Select.Root>
```

**Migration from @melt-ui**:
```typescript
// ❌ OLD (@melt-ui/svelte)
import { createDialog } from '@melt-ui/svelte';

// ✅ NEW (bits-ui)
import { Dialog } from 'bits-ui';
```

**Tags**: #bits-ui #v2.0 #svelte5 #headless #components

---

## 6. Svelte 5 Runes Patterns

### Complete Runes Reference
```svelte
<script lang="ts">
  // $state - Reactive state
  let count = $state(0);
  let user = $state({ name: 'John', age: 30 });

  // $derived - Computed values
  let doubled = $derived(count * 2);
  let isAdult = $derived(user.age >= 18);

  // $effect - Side effects
  $effect(() => {
    console.log('Count changed:', count);
    // Cleanup function
    return () => {
      console.log('Cleanup');
    };
  });

  // $props - Component props
  interface Props {
    title: string;
    count?: number;
    onUpdate?: (value: number) => void;
  }

  let { title, count: initialCount = 0, onUpdate }: Props = $props();

  // $bindable - Two-way binding
  interface BindableProps {
    value = $bindable('');
  }

  let { value = $bindable('') }: BindableProps = $props();

  // $inspect - Debug reactive state
  $inspect(count, doubled);
</script>

<!-- Event handlers (no 'on:' prefix) -->
<button onclick={() => count++}>
  Increment: {count}
</button>

<!-- Snippets (replacement for slots) -->
{#snippet header()}
  <h1>{title}</h1>
{/snippet}

{@render header()}
```

**Migration Guide**:
```typescript
// ❌ OLD (Svelte 4)
export let prop;
let value = 0;
$: doubled = value * 2;
$: { console.log(value); }

// ✅ NEW (Svelte 5)
let { prop } = $props();
let value = $state(0);
let doubled = $derived(value * 2);
$effect(() => { console.log(value); });
```

**Tags**: #svelte5 #runes #$state #$derived #$effect #$props

---

## 7. SvelteKit 2.0 API Changes

### Load Functions and Form Actions
```typescript
// +page.server.ts
import type { PageServerLoad, Actions } from './$types';

// ✅ CORRECT SvelteKit 2.0 load function
export const load: PageServerLoad = async ({ params, fetch, locals }) => {
  const response = await fetch(`/api/data/${params.id}`);
  const data = await response.json();

  return {
    data,
    user: locals.user, // From hooks
  };
};

// Form actions
export const actions: Actions = {
  default: async ({ request, locals }) => {
    const formData = await request.formData();
    const title = formData.get('title');

    // Process form data
    return {
      success: true,
      message: 'Form submitted',
    };
  },
};
```

**Hooks**:
```typescript
// hooks.server.ts
import type { Handle } from '@sveltejs/kit';

export const handle: Handle = async ({ event, resolve }) => {
  // Add user to locals
  event.locals.user = await getUser(event.cookies);

  const response = await resolve(event);
  return response;
};
```

**Tags**: #sveltekit #2.0 #load-functions #form-actions #hooks

---

## 8. Go 1.25 Best Practices

### Error Handling and Generics
```go
package main

import (
    "context"
    "errors"
    "fmt"
)

// ✅ CORRECT Go 1.25 generic function
func Map[T, U any](slice []T, fn func(T) U) []U {
    result := make([]U, len(slice))
    for i, v := range slice {
        result[i] = fn(v)
    }
    return result
}

// Error handling with context
func ProcessData(ctx context.Context, data []byte) error {
    if ctx.Err() != nil {
        return ctx.Err()
    }

    if len(data) == 0 {
        return errors.New("empty data")
    }

    // Process data
    return nil
}

// Error wrapping
func FetchData(id string) error {
    err := validateID(id)
    if err != nil {
        return fmt.Errorf("fetch data: %w", err)
    }
    return nil
}
```

**Tags**: #go #1.25 #generics #error-handling #context

---

## 9. Python 3.12+ Type Hints

### Modern Type Annotations
```python
from typing import Annotated, TypeVar, Generic
from collections.abc import Sequence

# ✅ CORRECT Python 3.12+ patterns
def process_items(items: list[str], count: int) -> dict[str, int]:
    """Process items with modern type hints."""
    return {item: count for item in items}

# Generic types
T = TypeVar('T')

class Container(Generic[T]):
    def __init__(self, value: T) -> None:
        self.value = value

    def get(self) -> T:
        return self.value

# Annotated types
UserId = Annotated[int, "User ID must be positive"]

def get_user(user_id: UserId) -> dict[str, str]:
    return {"id": str(user_id), "name": "John"}

# Pattern matching (3.10+)
def process_command(command: str) -> str:
    match command.split():
        case ["quit"]:
            return "Quitting"
        case ["load", filename]:
            return f"Loading {filename}"
        case _:
            return "Unknown command"
```

**Tags**: #python #3.12 #type-hints #generics #pattern-matching

---

## 10. CUDA 12.x Library Patterns

### Kernel Launch and Memory Management
```cpp
#include <cuda_runtime.h>
#include <stdio.h>

// ✅ CORRECT CUDA 12.x kernel
__global__ void vectorAdd(const float* a, const float* b, float* c, int n) {
    int idx = blockIdx.x * blockDim.x + threadIdx.x;
    if (idx < n) {
        c[idx] = a[idx] + b[idx];
    }
}

// Host code
int main() {
    const int n = 1024;
    const size_t bytes = n * sizeof(float);

    // Allocate unified memory (CUDA 12+)
    float *a, *b, *c;
    cudaMallocManaged(&a, bytes);
    cudaMallocManaged(&b, bytes);
    cudaMallocManaged(&c, bytes);

    // Initialize data
    for (int i = 0; i < n; i++) {
        a[i] = i;
        b[i] = i * 2;
    }

    // Launch kernel
    int threadsPerBlock = 256;
    int blocksPerGrid = (n + threadsPerBlock - 1) / threadsPerBlock;
    vectorAdd<<<blocksPerGrid, threadsPerBlock>>>(a, b, c, n);

    // Synchronize
    cudaDeviceSynchronize();

    // Check for errors
    cudaError_t err = cudaGetLastError();
    if (err != cudaSuccess) {
        printf("CUDA error: %s\n", cudaGetErrorString(err));
    }

    // Free memory
    cudaFree(a);
    cudaFree(b);
    cudaFree(c);

    return 0;
}
```

**Tags**: #cuda #12.x #kernel #memory-management #gpu

---

## Summary

**Total Pattern Categories**: 10
**Total Code Examples**: 30+
**Coverage**:
- ✅ WebGPU scalar array patterns
- ✅ LangChain v1.0 API
- ✅ TypeScript 5.x strict mode
- ✅ Drizzle ORM 0.44
- ✅ Bits UI v2.0 + Svelte 5
- ✅ Svelte 5 runes
- ✅ SvelteKit 2.0
- ✅ Go 1.25
- ✅ Python 3.12+
- ✅ CUDA 12.x

**Next Steps**:
1. Update copilot.md with these patterns
2. Update claude.md with these patterns
3. Update gemini.md with these patterns
4. Format for RAG+KAG+DAG retrieval
5. Create unified AST error analyzer
6. Execute dry-run validation on files 1-210
