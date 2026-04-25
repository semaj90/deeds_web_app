# Quick Start Guide - Modern Tech Stack

## 🚀 5-Minute Getting Started

### 1. Install Dependencies (if not already installed)

All packages are already in package.json. Just run:
```bash
npm install
```

**Verified Versions:**
- bits-ui: v2.11.6 ✅
- UnoCSS: v66.5.4 ✅
- Drizzle ORM: v0.44.6 ✅
- Svelte: v5.39.2 ✅

---

## 2. Use Barrel Stores (Svelte 5)

### Import from centralized store
```typescript
import { counterStore, legalAIStore, themeStore } from '$lib/stores';

// Or import from example file
import { counterStore } from '$lib/stores/example-barrel-pattern';
```

### Use in components
```svelte
<script lang="ts">
  import { counterStore } from '$lib/stores';
</script>

<div>
  <p>Count: {counterStore.count}</p>
  <p>Doubled: {counterStore.doubled}</p>

  <button onclick={counterStore.increment}>+</button>
  <button onclick={counterStore.decrement}>-</button>
  <button onclick={counterStore.reset}>Reset</button>
</div>
```

---

## 3. Use bits-ui Components

### Import the example button
```svelte
<script lang="ts">
  import ButtonExample from '$lib/components/bits-ui/ButtonExample.svelte';
</script>

<!-- Basic usage -->
<ButtonExample variant="default" onclick={() => alert('Clicked!')}>
  Click Me
</ButtonExample>

<!-- With loading state -->
<ButtonExample variant="nier" loading={isLoading}>
  YoRHa Processing...
</ButtonExample>

<!-- With icon -->
<ButtonExample variant="outline">
  <span class="i-lucide-download mr-2 h-4 w-4" />
  Download
</ButtonExample>
```

### Available Variants
- `default` - Primary button
- `destructive` - Danger/delete button
- `outline` - Bordered button
- `secondary` - Secondary action
- `ghost` - Minimal style
- `link` - Link style
- `nier` - YoRHa dark theme

### Available Sizes
- `sm` - Small
- `default` - Normal
- `lg` - Large
- `icon` - Icon only (square)

---

## 4. Database with Drizzle ORM

### Import schema and functions
```typescript
import { db } from '$lib/db';
import { legalDocuments, legalCases } from '$lib/db/schema-example-legal';
import {
  createLegalDocument,
  semanticSearch,
  findHighRiskDocuments,
} from '$lib/db/drizzle-usage-examples';
```

### Basic CRUD
```typescript
// Create document
const doc = await createLegalDocument({
  caseId: 'uuid-here',
  title: 'Employment Contract',
  content: 'Document content...',
  documentType: 'contract',
  // ... other fields
});

// Get document
const doc = await getLegalDocument(docId);

// Update document
const updated = await updateLegalDocument(docId, {
  aiSummary: 'New summary...',
});

// Delete document
await deleteLegalDocument(docId);
```

### JSONB Queries (Fast with GIN Index)
```typescript
// Find by jurisdiction
const docs = await findDocumentsByJurisdiction('California');

// Find high-risk documents
const highRisk = await findHighRiskDocuments();

// Find by practice area and confidence
const relevant = await findDocumentsByPracticeAreaAndConfidence(
  'Employment Law',
  0.8
);
```

### Vector Similarity Search
```typescript
// Semantic search with embeddings
const embedding = await generateEmbedding('employment contract dispute');
const results = await semanticSearch(embedding, 10, 0.7);

// Find similar documents
const similar = await findSimilarDocuments(documentId, 5);
```

### Transactions
```typescript
// Upload and queue for processing (atomic)
const doc = await uploadAndQueueDocument(documentData, [
  'embedding',
  'summary',
  'analysis',
]);
```

---

## 5. Svelte 5 Runes Cheat Sheet

### State
```svelte
<script lang="ts">
  // ✅ Svelte 5
  let count = $state(0);
  let user = $state<User | null>(null);
  let items = $state<Item[]>([]);

  // ❌ Svelte 4 (DON'T USE)
  export let count = 0;
</script>
```

### Derived (Computed)
```svelte
<script lang="ts">
  let count = $state(0);

  // ✅ Svelte 5
  let doubled = $derived(count * 2);
  let isEven = $derived(count % 2 === 0);

  // ❌ Svelte 4 (DON'T USE)
  $: doubled = count * 2;
</script>
```

### Effects (Side Effects)
```svelte
<script lang="ts">
  let count = $state(0);

  // ✅ Svelte 5
  $effect(() => {
    console.log('Count changed:', count);
  });

  // ❌ Svelte 4 (DON'T USE)
  $: console.log('Count:', count);
</script>
```

### Props
```svelte
<script lang="ts">
  // ✅ Svelte 5
  interface Props {
    title: string;
    count?: number;
    onclick?: () => void;
  }

  let { title, count = 0, onclick }: Props = $props();

  // ❌ Svelte 4 (DON'T USE)
  export let title: string;
  export let count = 0;
</script>
```

---

## 6. UnoCSS Class Examples

### Layout
```html
<!-- Flex -->
<div class="flex items-center justify-between gap-4">

<!-- Grid -->
<div class="grid grid-cols-2 md:grid-cols-4 gap-4">

<!-- Container -->
<div class="max-w-7xl mx-auto px-4">
```

### YoRHa/NieR Theme
```html
<div class="yorha-card p-6">
  <h2 class="text-nier-text-primary text-2xl font-bold">YoRHa Style</h2>
  <button class="yorha-button">Execute</button>
</div>
```

### bits-ui Styling
```html
<button class="bits-btn-default">Default</button>
<button class="bits-btn-destructive">Delete</button>
<button class="bits-btn-outline">Cancel</button>
```

### NES Gaming Style
```html
<button class="nes-button-primary">Start Game</button>
<div class="nes-card p-4">
  <p class="font-nes text-sm">Retro Gaming UI</p>
</div>
```

---

## 7. Development Commands

```bash
# Start dev server (default)
npm run dev

# Start with GPU optimization
npm run dev:gpu

# Start with Redis + full stack
npm run dev:full

# Type checking (fast)
npm run check:ultra-fast

# Build for production
npm run build

# Database migrations
npm run db:generate  # Generate from schema
npm run db:migrate   # Apply migrations
npm run db:studio    # Open Drizzle Studio UI

# Tests
npm run test
npm run test:unit
npm run test:e2e
```

---

## 8. File Locations

### Components
```
src/lib/components/bits-ui/
├── ButtonExample.svelte         ← Use this
├── ButtonExampleUsage.svelte    ← Full demo
├── Upload.svelte                ← Existing
└── VectorCard.svelte            ← Existing
```

### Stores
```
src/lib/stores/
├── index.ts                     ← Main barrel exports
└── example-barrel-pattern.ts    ← NEW: Examples
```

### Database
```
src/lib/db/
├── schema.ts                    ← Main schema
├── schema-example-legal.ts      ← NEW: Legal AI schema
└── drizzle-usage-examples.ts    ← NEW: Query examples
```

---

## 9. Common Patterns

### Loading State
```svelte
<script lang="ts">
  let isLoading = $state(false);

  async function handleSubmit() {
    isLoading = true;
    try {
      await someAsyncOperation();
    } finally {
      isLoading = false;
    }
  }
</script>

<ButtonExample loading={isLoading} onclick={handleSubmit}>
  Submit
</ButtonExample>
```

### Form with Store
```svelte
<script lang="ts">
  import { todoStore } from '$lib/stores';

  let text = $state('');

  function addTodo() {
    if (text.trim()) {
      todoStore.addTodo(text);
      text = '';
    }
  }
</script>

<input bind:value={text} class="bits-input" />
<ButtonExample onclick={addTodo}>Add Todo</ButtonExample>

<ul>
  {#each todoStore.filteredTodos as todo}
    <li>
      <input
        type="checkbox"
        checked={todo.completed}
        onchange={() => todoStore.toggleTodo(todo.id)}
      />
      {todo.text}
    </li>
  {/each}
</ul>
```

### API Call with Error Handling
```svelte
<script lang="ts">
  let data = $state<Data | null>(null);
  let error = $state<string | null>(null);
  let isLoading = $state(false);

  async function fetchData() {
    isLoading = true;
    error = null;

    try {
      const res = await fetch('/api/data');
      if (!res.ok) throw new Error('Failed to fetch');
      data = await res.json();
    } catch (err) {
      error = err instanceof Error ? err.message : 'Unknown error';
    } finally {
      isLoading = false;
    }
  }
</script>

{#if error}
  <div class="text-red-500">{error}</div>
{:else if isLoading}
  <div>Loading...</div>
{:else if data}
  <div>{JSON.stringify(data)}</div>
{/if}

<ButtonExample onclick={fetchData}>Fetch Data</ButtonExample>
```

---

## 10. Troubleshooting

### bits-ui not rendering?
```typescript
// ✅ Use default import
import ButtonExample from '$lib/components/bits-ui/ButtonExample.svelte';

// ❌ Don't use named import
import { ButtonExample } from '$lib/components/bits-ui/ButtonExample.svelte';
```

### UnoCSS classes not working?
1. Check if class is in safelist (uno.config.ts)
2. Restart dev server
3. Clear `.svelte-kit` cache

### Drizzle type errors?
```bash
# Regenerate types
npm run db:generate

# Check DATABASE_URL in .env
DATABASE_URL="postgresql://legal_admin:123456@localhost:5432/legal_ai_db"
```

### Svelte 5 errors?
- Replace `export let` with `let { } = $props()`
- Replace `$:` with `$derived()` or `$effect()`
- Use `lang="ts"` in script tags

---

## 11. Next Steps

1. **Explore Examples**: Check out `ButtonExampleUsage.svelte` for live demos
2. **Read Docs**: See `MODERN_TECH_STACK_SUMMARY.md` for details
3. **Test Database**: Run `npm run db:studio` to explore schema
4. **Build Component**: Create your own bits-ui component using ButtonExample as template
5. **Add Store**: Create new stores in `example-barrel-pattern.ts`

---

## 12. Resources

- **Project Docs**: `MODERN_TECH_STACK_SUMMARY.md`
- **Svelte 5**: https://svelte.dev/docs/svelte/overview
- **bits-ui**: https://bits-ui.com
- **UnoCSS**: https://unocss.dev
- **Drizzle**: https://orm.drizzle.team
- **pgvector**: https://github.com/pgvector/pgvector

---

**Happy Coding! 🚀**

*This stack is optimized for the Legal AI Platform with GPU support, vector search, and modern Svelte 5 patterns.*
