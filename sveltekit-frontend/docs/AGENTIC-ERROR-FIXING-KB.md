# Agentic Error Fixing Knowledge Base - 2025 Edition

> **Last Updated:** 2026-01-05 | **For:** Gemini, Claude, Copilot, Local Agents
> **Purpose:** RAG + KAG + DAG knowledge base for automated svelte-check error fixing

---

## 📚 Technology Stack Reference (2025)

### 1. Drizzle ORM 0.44.x Best Practices

**Codebase-First Migration Strategy:**
- Define schema as TypeScript objects (source of truth)
- Use `drizzle-kit generate` for production SQL migration files
- Use `drizzle-kit push` only for rapid prototyping/dev

**Safe Migration Patterns:**
```typescript
// ✅ Additive changes (low-risk)
ALTER TABLE ADD COLUMN
CREATE TABLE
CREATE INDEX CONCURRENTLY

// ❌ Destructive changes (high-risk, multi-step required)
DROP TABLE
DROP COLUMN
ALTER COLUMN TYPE
```

**Safe Column Rename Process:**
1. Add new "shadow" column
2. Implement dual-writes in application
3. Backfill data
4. Flip reads to new column
5. Drop old column in later deployment

**Schema Type Mappings:**
| PostgreSQL | Drizzle ORM |
|------------|-------------|
| `uuid` | `uuid()` |
| `text` | `text()` |
| `varchar(n)` | `varchar('col', { length: n })` |
| `integer` | `integer()` |
| `boolean` | `boolean()` |
| `jsonb` | `jsonb()` |
| `timestamp` | `timestamp('col', { mode: 'string', withTimezone: true })` |
| `float8/double precision` | `doublePrecision()` |
| `float4/real` | `real()` |
| `text[]` | `text('col').array()` |
| `SERIAL` (deprecated) | Use `identity columns` instead |

---

### 2. Bits-UI v1.x/v2.x (Svelte 5 Components)

**Breaking Changes from 0.x to 1.x:**

| Old Pattern | New Pattern |
|------------|-------------|
| `el` prop | `ref` prop |
| `asChild` | `child` snippet prop |
| `let:` directives | `children` or `child` snippet props |
| `transition` props | Use `child` snippet + `forceMount` |

**Component-Specific Changes:**

**Accordion:**
```svelte
<!-- ❌ Old (0.x) -->
<Accordion.Root multiple>

<!-- ✅ New (1.x+) -->
<Accordion.Root type="multiple">
```

**Checkbox:**
```svelte
<!-- ❌ Old - Checkbox.ItemIndicator removed -->
<!-- ✅ New - Use children snippet for custom indicators -->
<Checkbox.Root onCheckedChange={(checked) => ...}>
  {#snippet children({ checked })}
    {#if checked}✓{/if}
  {/snippet}
</Checkbox.Root>
```

**Portalling (Select, Combobox, Popover):**
```svelte
<!-- Content no longer auto-portals -->
<Select.Portal>
  <Select.Content>...</Select.Content>
</Select.Portal>
```

---

### 3. SvelteKit 2.0 Load Functions

**Types of Load Functions:**

| File | Runs On | Use Case |
|------|---------|----------|
| `+page.js` | Server + Client | Public APIs, non-sensitive data |
| `+page.server.js` | Server Only | Database access, secrets, private APIs |
| `+layout.js` | Server + Client | App-wide data (auth, nav) |
| `+layout.server.js` | Server Only | App-wide sensitive data |

**SvelteKit 2.0 Promise Behavior:**
```typescript
// ❌ Old behavior - auto-awaited
export function load() {
  return { data: fetch('...') }; // Would auto-await
}

// ✅ New behavior - explicit await required for blocking
export async function load() {
  return { data: await fetch('...') }; // Blocks render
}

// ✅ Streaming (faster hydration)
export function load() {
  return { data: fetch('...') }; // Streams while rendering
}
```

**Best Practices:**
- Use `+page.server.js` for database/secret access
- Use contextual `fetch` from load args: `load({ fetch })`
- Use `invalidate()`, `invalidateAll()` for data refresh
- Use TypeScript types: `PageLoad`, `PageServerLoad`

---

### 4. Svelte 5 Runes

**State Management:**
```svelte
<script>
  // ✅ Svelte 5 (runes)
  let count = $state(0);
  let doubled = $derived(count * 2);

  // ❌ Old Svelte 4
  let count = 0;
  $: doubled = count * 2;
</script>
```

**Props:**
```svelte
<script>
  // ✅ Svelte 5
  let { name, age = 18 } = $props();

  // ❌ Old Svelte 4
  export let name;
  export let age = 18;
</script>
```

**Effects:**
```svelte
<script>
  // ✅ Svelte 5
  $effect(() => {
    console.log('count changed:', count);
  });

  // ❌ Old Svelte 4
  $: console.log('count changed:', count);
</script>
```

---

### 5. WebGPU API (W3C 2025)

**Type Setup:**
```bash
npm install --save-dev @webgpu/types
```

**tsconfig.json:**
```json
{
  "compilerOptions": {
    "types": ["@webgpu/types"]
  }
}
```

**Key Interfaces:**
- `GPUDevice`: Main entry point
- `GPUBuffer`: GPU memory block
- `GPUComputePipeline`: Compute shader pipeline

**Buffer Creation Pattern:**
```typescript
const buffer = device.createBuffer({
    size: data.byteLength,
    usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST,
});
device.queue.writeBuffer(buffer, 0, data);
```

---

### 6. LangChain.js 0.3

**Embeddings Interface:**
```typescript
interface Embeddings {
    embedDocuments(documents: string[]): Promise<number[][]>;
    embedQuery(text: string): Promise<number[]>;
}
```

**Runnable Pattern:**
```typescript
import { RunnableSequence } from '@langchain/core/runnables';

const chain = RunnableSequence.from([
    retriever,
    (docs) => docs.map(d => d.pageContent).join('\n'),
    llm,
    outputParser,
]);
```

---

### 7. TypeScript 5.5+ Best Practices

**Key Features:**
1. **Inferred Type Predicates**: Auto-infers `Array.filter()` types
2. **`NoInfer<T>`**: Prevent unwanted generic inference
3. **Smarter Narrowing**: Better control flow analysis

**Best Practices:**
```typescript
// ✅ Use strict mode
{ "strict": true }

// ✅ Prefer unknown over any
function process(data: unknown): void {
    if (typeof data === 'string') {
        console.log(data.toUpperCase());
    }
}

// ✅ Use utility types
type PartialUser = Partial<User>;
type RequiredUser = Required<User>;
type UserName = Pick<User, 'firstName' | 'lastName'>;
```

---

### 8. Go 1.24/1.25 (2025)

**Key Features:**
- **Generic Type Aliases**: Full parameterization support
- **errors.Join**: Enhanced structured error wrapping
- **Swiss Tables**: 2-3% CPU overhead reduction
- **runtime.AddCleanup**: Efficient resource cleanup

**Go 1.25 Specifics:**
- Removed "core types" concept (simpler generics)
- Experimental `encoding/json/v2` (3-10x faster)
- Container-aware `GOMAXPROCS`
- FlightRecorder API for tracing

---

### 9. CUDA 12.8 + PyTorch 2.9

**Installation:**
```bash
pip install torch==2.9.0+cu128 --index-url https://download.pytorch.org/whl/cu128
```

**Best Practices:**
- Use `torch.cuda.is_available()` to check GPU
- Enable mixed precision with `torch.cuda.amp`
- Use `torch.compile()` for graph optimization
- Profile with `torch.profiler`

---

## 🛠️ Agentic Error Fixing Patterns

### Common TypeScript Corruption Patterns

**1. Colon-Instead-of-Space Pattern:**
```typescript
// ❌ CORRUPTED
import: { browser } from: '$app/environment';
interface Foo: {
function bar(param, string): void {

// ✅ CORRECT
import { browser } from '$app/environment';
interface Foo {
function bar(param: string): void {
```

**2. Comma-Instead-of-Colon Pattern:**
```typescript
// ❌ CORRUPTED
{ key, value }  // in type context

// ✅ CORRECT
{ key: value }
```

**3. Missing Return Type Colon:**
```typescript
// ❌ CORRUPTED
async function foo(), Promise<void> {

// ✅ CORRECT
async function foo(): Promise<void> {
```

### Fix Script Template

```javascript
// scripts/fix-pattern.cjs
const fs = require('fs');
const path = require('path');

const targetFiles = [
    'src/lib/...',
];

function fixPatterns(content) {
    let fixed = content;

    // Fix import statements
    fixed = fixed.replace(/import:\s*\{/g, 'import {');
    fixed = fixed.replace(/\}\s*from:\s*(['"`])/g, "} from $1");

    // Fix interface declarations
    fixed = fixed.replace(/interface\s+(\w+):\s*\{/g, 'interface $1 {');

    // Fix function return types
    fixed = fixed.replace(/\)\s*,\s*(Promise|void|string|number|boolean)/g, '): $1');

    return fixed;
}

for (const file of targetFiles) {
    const content = fs.readFileSync(file, 'utf-8');
    const fixed = fixPatterns(content);
    if (content !== fixed) {
        fs.writeFileSync(file + '.backup', content);
        fs.writeFileSync(file, fixed);
        console.log(`✅ Fixed: ${file}`);
    }
}
```

---

## 📋 Top High-Error Files Priority List

| Priority | File | Est. Errors | Pattern |
|----------|------|-------------|---------|
| 1 | `qlora-rl-langextract-integration.ts` | ~409 | Colon corruption |
| 2 | `webgpu-simd-accelerator.ts` | ~397 | Colon corruption |
| 3 | `webgpu-langchain-bridge.ts` | ~396 | Colon corruption |
| 4 | `ErrorClustering.ts` | ~330 | Type errors |
| 5 | `recursive-evidence-chain-worker.ts` | ~328 | Type errors |
| 6 | `evidenceCustodyMachine.ts` | ~327 | XState types |
| 7 | `gguf-runtime.ts` | ~325 | WASM types |
| 8 | `schema-phase90-hardened.ts` | ~325 | Drizzle schema |

---

## 🔄 Agentic Workflow for Error Fixing

### Phase 1: Dry-Run (1-210 files)
```bash
# 1. Git commit current state
git add -A && git commit -m "Pre-fix checkpoint"

# 2. Run dry-run analyzer
node scripts/agentic-corruption-fixer.mjs --dry-run --limit 210

# 3. Review proposed changes
cat fix-report.json | jq '.changes | length'
```

### Phase 2: Apply and Verify
```bash
# 4. Apply fixes
node scripts/agentic-corruption-fixer.mjs --apply

# 5. Run svelte-check
npm run check

# 6. Run TypeScript check
npx tsc --noEmit

# 7. If errors reduced, commit
git add -A && git commit -m "Applied batch fixes"
```

### Phase 3: Iterate
```bash
# 8. Get new error count
npx svelte-check --threshold error 2>&1 | tail -5

# 9. Repeat with next batch
```

---

## 🔍 RAG/KAG/DAG Integration

### Knowledge Graph Structure
```
[Error] --caused_by--> [Pattern]
[Pattern] --fixed_by--> [Transform]
[Transform] --applies_to--> [FileType]
[FileType] --uses--> [Technology]
[Technology] --documented_in--> [DocSource]
```

### Embedding Strategy
- Error messages → 8D vectors for clustering
- File paths → Semantic routing
- Fix patterns → Retrieval for similar errors

### Recommended Vector Store
- **Qdrant**: For error embeddings
- **PostgreSQL pgvector**: For document chunks
- **Redis**: For hot cache of recent fixes

---

## ✅ Checklist Before Agentic Run

- [ ] Git working directory clean
- [ ] `npm run check` baseline captured
- [ ] Dry-run executed and reviewed
- [ ] Backup files created
- [ ] Error count tracked in logs
- [ ] Token accounting enabled


---

## 📊 Phase 74/75: Advanced Agentic Error Fixing & UI Restoration

### Stub Restoration Strategy
Many files were previously replaced with "Page under reconstruction" stubs to bypass build errors. Phase 75 focuses on:
1. **Detection**: Finding files with `<h1>Page under reconstruction</h1>`.
2. **Restoration**: Reverting to the largest backup (`.css-backup`, `.bak-phase42...`).
3. **Multi-Pass Correction**:
   - Fix **Redundant Object Literals**: `{ key: key }` → `{ key }`.
   - Fix **Colon-Instead-of-Space**: `as: 'foo'` → `as 'foo'`.
   - Fix **Displaced Types**: `), Type: ReturnType` → `): ReturnType`.
   - Fix **CSS placeholders**: Replaces `{}` in complex CSS properties with valid values.
4. **Svelte 5 Lifecycle Update**: Replace `<slot />` with `{@render children?.()}`.

### UI Transformation: Bits-UI (Svelte 5)
- **Objective**: Replace unstable custom headless components with `@bits-ui`.
- **Bits-UI Pattern**:
  ```svelte
  <Component.Trigger>
    {#snippet child({ props })}
      <button {...props} onclick={() => console.log('clicked')}>
        Trigger
      </button>
    {/snippet}
  </Component.Trigger>
  ```
- **Reactivity Upgrade**: Transition components from `$state` stubs back to fully-realized reactive logic using Svelte 5 runes.

### ACE Contextual Engineering Extensions
- **RAG**: Use `npx svelte-check --output machine` results as the searchable index for targeted fixes.
- **KAG**: Build a dependency graph of stubs to prioritize restoring "hub" components (like `Button` or `Input`) that many other pages depend on.
- **DAG**: Execute restoration tasks in topological order of the dependency graph to minimize cascading errors.

---

*This document is optimized for RAG retrieval by AI agents fixing svelte-check errors.*

