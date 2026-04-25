# Svelte 5 + TypeScript + bits-ui v2 Fix Guide

## Overview

This guide addresses TypeScript and Svelte 5 compatibility issues with bits-ui v2 and provides a migration path for the enhancement implementation.

## 1. Svelte 5 Runes Migration

### Issue: Old Svelte 4 Syntax

**Problem**: Using `let` with type annotations instead of Svelte 5 runes

**Old (Svelte 4)**:
```svelte
<script lang="ts">
  let count: number = 0;
  let user: User | null = null;
</script>
```

**New (Svelte 5)**:
```svelte
<script lang="ts">
  let count = $state(0);
  let user = $state<User | null>(null);
</script>
```

### Fix: Update All Components

**Pattern 1: Simple State**
```svelte
<!-- Before -->
let value: string = '';

<!-- After -->
let value = $state('');
```

**Pattern 2: Complex Types**
```svelte
<!-- Before -->
let data: { id: string; name: string } | null = null;

<!-- After -->
let data = $state<{ id: string; name: string } | null>(null);
```

**Pattern 3: Arrays**
```svelte
<!-- Before -->
let items: Item[] = [];

<!-- After -->
let items = $state<Item[]>([]);
```

### Files to Update

1. `sveltekit-frontend/src/routes/+layout.svelte`
   - Update WebGPU initialization state
   - Update CPU fallback state

2. `sveltekit-frontend/src/routes/(tools)/search/+page.svelte`
   - Update form state
   - Update results state
   - Update UI state

3. `sveltekit-frontend/src/routes/(legal)/legal-cases/+page.svelte`
   - Update cases state
   - Update loading state
   - Update error state

4. `sveltekit-frontend/src/routes/(tools)/report-builder/+page.svelte`
   - Update editor state
   - Update tab state
   - Update error state

## 2. bits-ui v2 API Updates

### Issue: bits-ui v2 Breaking Changes

**Problem**: bits-ui v2 has new API for components

**Key Changes**:
- Component props structure changed
- Event handlers updated
- Slot API modified
- Builder pattern introduced

### Fix: Update Component Usage

**Pattern 1: Button Component**
```svelte
<!-- Before (v1) -->
<Button on:click={handleClick}>Click me</Button>

<!-- After (v2) -->
<Button.Root onclick={handleClick}>Click me</Button.Root>
```

**Pattern 2: Dialog Component**
```svelte
<!-- Before (v1) -->
<Dialog open={isOpen} on:change={handleChange}>
  <Dialog.Content>Content</Dialog.Content>
</Dialog>

<!-- After (v2) -->
<Dialog.Root bind:open={isOpen}>
  <Dialog.Trigger>Open</Dialog.Trigger>
  <Dialog.Content>Content</Dialog.Content>
</Dialog.Root>
```

**Pattern 3: Form Components**
```svelte
<!-- Before (v1) -->
<Input bind:value={formData.name} />

<!-- After (v2) -->
<Input.Root>
  <Input.Input bind:value={formData.name} />
</Input.Root>
```

### Files to Update

1. Search components
2. Form components
3. Dialog/Modal components
4. Button components
5. Input components

## 3. TypeScript Strict Mode Fixes

### Issue: Strict Type Checking

**Problem**: `strict: true` in tsconfig.json requires explicit types

### Fix: Add Type Annotations

**Pattern 1: Function Parameters**
```typescript
// Before
function handleClick(event) {
  console.log(event);
}

// After
function handleClick(event: MouseEvent): void {
  console.log(event);
}
```

**Pattern 2: Async Functions**
```typescript
// Before
async function loadData() {
  const response = await fetch('/api/data');
  return response.json();
}

// After
async function loadData(): Promise<Data> {
  const response = await fetch('/api/data');
  return response.json() as Promise<Data>;
}
```

**Pattern 3: Error Handling**
```typescript
// Before
try {
  // code
} catch (error) {
  console.error(error);
}

// After
try {
  // code
} catch (error) {
  const message = error instanceof Error ? error.message : 'Unknown error';
  console.error(message);
}
```

## 4. Drizzle ORM Integration (Optional)

### If Using Drizzle ORM

**Setup**:
```bash
npm install drizzle-orm drizzle-kit
```

**Configuration**:
```typescript
// src/lib/db/schema.ts
import { pgTable, serial, text, timestamp } from 'drizzle-orm/pg-core';

export const citations = pgTable('citations', {
  id: serial('id').primaryKey(),
  text: text('text').notNull(),
  sourceUrl: text('source_url').notNull(),
  createdAt: timestamp('created_at').defaultNow(),
});

export const images = pgTable('images', {
  id: serial('id').primaryKey(),
  filePath: text('file_path').notNull(),
  extractedText: text('extracted_text'),
  createdAt: timestamp('created_at').defaultNow(),
});
```

**Usage**:
```typescript
// src/lib/db/client.ts
import { drizzle } from 'drizzle-orm/node-postgres';
import { Pool } from 'pg';

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
});

export const db = drizzle(pool);
```

### If Not Using Drizzle ORM

**Continue with**: Direct PostgreSQL queries using `pg` library

```typescript
// src/lib/db/client.ts
import { Pool } from 'pg';

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
});

export async function queryCitations(limit: number = 10) {
  const result = await pool.query(
    'SELECT * FROM citations ORDER BY created_at DESC LIMIT $1',
    [limit]
  );
  return result.rows;
}
```

## 5. Migration Path for Enhancement Implementation

### Phase 1: Prepare (1 day)

**Tasks**:
- [ ] Fix Svelte 5 runes in all components
- [ ] Update bits-ui v2 component usage
- [ ] Add TypeScript type annotations
- [ ] Set up Google Custom Search API
- [ ] Configure Gemma3 VLM
- [ ] Create database migrations

**Files to Update**:
- `sveltekit-frontend/src/routes/**/*.svelte`
- `sveltekit-frontend/src/lib/components/**/*.svelte`
- `tsconfig.json` (verify strict mode)
- `.env.development` (add API keys)

**Commands**:
```bash
# Check for TypeScript errors
npm run check:typescript

# Check for Svelte errors
npm run check

# Fix formatting
npm run format
```

### Phase 2: Implement Citations (3-4 days)

**Tasks**:
- [ ] Implement GoogleSearchRetriever
- [ ] Implement CitationManager
- [ ] Add citation storage schema
- [ ] Create citation API endpoints
- [ ] Write property tests

**Files to Create**:
- `backend/services/retrieval/sources/google_search_retriever.py`
- `backend/services/retrieval/citations/citation_manager.py`
- `backend/api/citations_api.py`
- `tests/test_retrieval_citations.py`

**Database Migrations**:
```sql
-- migrations/002_create_citations_table.sql
CREATE TABLE citations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    result_id UUID,
    text TEXT NOT NULL,
    source_url VARCHAR NOT NULL,
    source_title VARCHAR,
    context_before TEXT,
    context_after TEXT,
    confidence FLOAT,
    highlighted BOOLEAN DEFAULT false,
    created_at TIMESTAMP DEFAULT NOW(),
    verified_at TIMESTAMP,
    embedding vector(768)
);

CREATE INDEX idx_citations_result ON citations(result_id);
CREATE INDEX idx_citations_source ON citations(source_url);
```

### Phase 3: Implement Image Processing (3-4 days)

**Tasks**:
- [ ] Implement Gemma3VLMProcessor
- [ ] Implement ImageSearcher
- [ ] Add image storage schema
- [ ] Create image API endpoints
- [ ] Write property tests

**Files to Create**:
- `backend/services/retrieval/vlm/gemma3_vlm_processor.py`
- `backend/services/retrieval/images/image_searcher.py`
- `backend/api/images_api.py`
- `tests/test_retrieval_images.py`

**Database Migrations**:
```sql
-- migrations/003_create_images_table.sql
CREATE TABLE images (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    file_path VARCHAR NOT NULL,
    minio_path VARCHAR,
    extracted_text TEXT,
    visual_objects TEXT[],
    scene_description TEXT,
    relationships TEXT[],
    embedding vector(768),
    confidence FLOAT,
    source_url VARCHAR,
    created_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX idx_images_source ON images(source_url);
CREATE INDEX idx_images_confidence ON images(confidence);
```

### Phase 4: Integration (2-3 days)

**Tasks**:
- [ ] Enhance TopologySynthesis
- [ ] Add citation and image search endpoints
- [ ] Create Svelte components for citation display
- [ ] Create Svelte components for image search
- [ ] Write integration tests

**Svelte Components to Create**:
- `sveltekit-frontend/src/lib/components/CitationHighlight.svelte`
- `sveltekit-frontend/src/lib/components/ImageSearch.svelte`
- `sveltekit-frontend/src/lib/components/ImageGallery.svelte`
- `sveltekit-frontend/src/lib/components/CitationNetwork.svelte`

**Example Component**:
```svelte
<!-- CitationHighlight.svelte -->
<script lang="ts">
  import type { Citation } from '$types/citations';

  interface Props {
    citations: Citation[];
  }

  const { citations } = $props<Props>();

  function highlightCitation(text: string, citation: Citation): string {
    return text.replace(
      citation.text,
      `<mark class="citation" data-id="${citation.id}">${citation.text}</mark>`
    );
  }
</script>

<div class="citations">
  {#each citations as citation (citation.id)}
    <div class="citation-item">
      <blockquote>{citation.text}</blockquote>
      <a href={citation.sourceUrl} target="_blank">
        {citation.sourceTitle}
      </a>
    </div>
  {/each}
</div>

<style>
  .citations {
    display: flex;
    flex-direction: column;
    gap: 1rem;
  }

  .citation-item {
    padding: 1rem;
    border-left: 4px solid #007bff;
    background: #f8f9fa;
  }

  blockquote {
    margin: 0 0 0.5rem 0;
    font-style: italic;
  }

  a {
    color: #007bff;
    text-decoration: none;
  }

  a:hover {
    text-decoration: underline;
  }
</style>
```

### Phase 5: Testing & Deployment (2-3 days)

**Tasks**:
- [ ] Run all unit tests
- [ ] Run all property-based tests
- [ ] Run integration tests
- [ ] Performance testing
- [ ] Deploy to staging
- [ ] Deploy to production

**Test Commands**:
```bash
# Run all tests
npm run test:run

# Run specific test file
npm run test:run -- tests/test_retrieval_citations.py

# Run with coverage
npm run test:run -- --coverage

# Run property-based tests
npm run test:run -- tests/test_retrieval_properties.py
```

## 6. Quick Fix Checklist

### Immediate Fixes (1-2 hours)

- [ ] Update all `let` declarations to use `$state()`
- [ ] Update all event handlers from `on:` to `on`
- [ ] Add type annotations to all function parameters
- [ ] Fix error handling with `instanceof Error` checks
- [ ] Update bits-ui component usage to v2 API

### Configuration Fixes (30 minutes)

- [ ] Verify `tsconfig.json` strict mode settings
- [ ] Update `svelte.config.js` for Svelte 5
- [ ] Update `package.json` dependencies
- [ ] Run `npm install` to update packages

### Testing (1 hour)

- [ ] Run `npm run check:typescript`
- [ ] Run `npm run check` (svelte-check)
- [ ] Run `npm run lint`
- [ ] Run `npm run test:run`

## 7. Common Error Patterns & Fixes

### Error: "Cannot find module 'svelte'"

**Fix**:
```json
// tsconfig.json
{
  "compilerOptions": {
    "types": ["node"]  // Remove "svelte" from types
  }
}
```

### Error: "Property 'value' does not exist on type 'HTMLInputElement'"

**Fix**:
```svelte
<script lang="ts">
  function handleInput(event: Event): void {
    const target = event.target as HTMLInputElement;
    console.log(target.value);
  }
</script>

<input on:input={handleInput} />
```

### Error: "Object is possibly 'null'"

**Fix**:
```typescript
// Before
const value = data.user.name;

// After
const value = data.user?.name ?? 'Unknown';
```

### Error: "bits-ui component not found"

**Fix**:
```bash
# Update bits-ui to v2
npm install bits-ui@latest

# Clear node_modules and reinstall
rm -rf node_modules package-lock.json
npm install
```

## 8. Verification Steps

### Step 1: TypeScript Check
```bash
npm run check:typescript
# Should output: "No errors found"
```

### Step 2: Svelte Check
```bash
npm run check
# Should output: "No errors found"
```

### Step 3: Lint Check
```bash
npm run lint
# Should output: "0 errors"
```

### Step 4: Build Check
```bash
npm run build
# Should complete without errors
```

### Step 5: Test Check
```bash
npm run test:run
# Should pass all tests
```

## 9. Next Steps

After fixing TypeScript/Svelte errors:

1. **Proceed with Phase 1** of enhancement migration
2. **Set up Google Custom Search API**
3. **Configure Gemma3 VLM**
4. **Create database migrations**
5. **Start implementing citations**

---

**Status**: ✅ FIX GUIDE COMPLETE
**Estimated Time**: 2-3 hours for immediate fixes
**Ready for Enhancement Implementation**: YES
