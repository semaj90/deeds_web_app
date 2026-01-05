# Gemini Brief: Phase13 Integration Pattern

## 🔧 TypeScript Language Server: Module Export Cache Issue

**Problem:** `Module '"$lib/server/db"' has no exported member 'db'` (but export exists)

**Cause:** TypeScript Language Server caches module shapes. When `index.ts` is modified, TSServer doesn't reload.

**Fix:**
```
Ctrl+Shift+P → "TypeScript: Restart TS Server"
```

**Code Snippet:**
```typescript
// Ensure correct import path
import { db } from '$lib/server/db';
```

**Why:** Runtime works perfectly - this is purely an IDE/editor cache issue.

**Prevention:**
- After modifying barrel files (`index.ts`), restart TSServer
- Avoid circular dependencies between schema and db files
- Clear `.svelte-kit` cache if issues persist: `rm -rf .svelte-kit && npm run dev`

---

- Health probes (cached): Ollama (`getOllamaEndpoint`), Enhanced RAG `/health`, Qdrant `healthz/readyz/collections`, Redis via env/ping, DB via env presence, Docker flag.
- Preferences: Enhanced RAG first, else Ollama `gemma3-legal:latest`; vector DB Qdrant > pgvector > memory; DB prod URL > memory; Redis caching when present.
- Performance stance: enable SSR, code splitting, UnoCSS; Redis-or-memory caching.
- Endpoint: `/api/system/phase13` exposes status + recommendations.
- Env-only wiring (no container changes): `ENHANCED_RAG_URL`, `DATABASE_URL` + `PGVECTOR_ENABLED`/`ENABLE_PGVECTOR`, `REDIS_URL`/`UPSTASH_REDIS_REST_URL`, `QDRANT_URL`, `OLLAMA_URL`/`OLLAMA_BASE_URL`, optional Docker flags.
// ...existing code...
- Replicate this shape for other health endpoints; call `initializePhase13()` or hit the GET endpoint for status.

---

## 🔧 WebGPU + LangChain + TypeScript: Corruption Pattern Database

**Gemini Analysis (Jan 2026):** Comprehensive corruption taxonomy from latest TypeScript/WebGPU/LangChain integration:

### Pattern Taxonomy (10 Categories)

| Pattern | Corruption | Correct | Frequency |
|---------|-----------|---------|----------|
| Import Type | `import type: { X } from: 'y'` | `import type { X } from 'y'` | High |
| Function Params | `f(param, Type)` | `f(param: Type)` | High |
| Interface Decl | `interface X: {,;` | `interface X {` | Medium |
| Return Types | `): Type :` | `): Type {` | Medium |
| Object Props | `{ key, value }` | `{ key: value }` | High |
| Missing Parens | `func(arg, next:` | `func(arg), next:` | High |
| Generic Types | `<T,U>` | `<T, U>` | Low |
| Array Types | `Array<T>:` | `Array<T>` | Medium |
| Statement Term | `), key:` | `); key:` | Medium |
| Type Alias | `type X = Y:` | `type X = Y;` | Low |

### Detection Strategy

```typescript
// Agentic approach:
// 1. Parse AST with TypeScript Compiler API
// 2. Apply 10 regex patterns sequentially
// 3. Validate with svelte-check after each pattern
// 4. Rollback if error count increases
// 5. Report improvement metrics
```

### WebGPU-Specific Patterns

```typescript
// ❌ Common corruption in WebGPU device initialization
const device = await adapter.requestDevice(,
  requiredFeatures: ['shader-f16'],

// ✅ Correct pattern (per WebGPU spec)
const device = await adapter.requestDevice({
  requiredFeatures: ['shader-f16']
});
```

### LangChain-Specific Patterns

```typescript
// ❌ Common corruption in LangChain chain composition
const chain = prompt.pipe(llm, outputParser:

// ✅ Correct pattern (per LangChain.js docs)
const chain = prompt.pipe(llm).pipe(outputParser);
```

**Automation Tool:** `scripts/agentic-corruption-fixer.mjs` with 10 patterns, backup/restore, validation loop.

**Latest Documentation Sources:**
- WebGPU Best Practices: https://toji.github.io/webgpu-best-practices/
- LangChain.js v0.3 Migration: https://js.langchain.com/docs/versions/v0_2/migrating_chains/
- TypeScript 5.6 Type System: https://www.typescriptlang.org/docs/handbook/2/everyday-types.html
- MDN JavaScript Reference: https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference

---

## 📚 Knowledge Graph / RAG / KAG / DAG Sources

### AI Agent Context Files
| File | Purpose | Load When |
|------|---------|-----------|
| `copilot.md` | Primary Copilot instructions | Copilot sessions |
| `claude.md` | Claude/Cursor context | Claude sessions |
| `gemini.md` | Primary Gemini context | Always (this file) |
| `CLAUDE_RAG_KAG_RULES.md` | RAG/KAG endpoint generation rules | API endpoints |

### Extended Documentation (docs/)
| File | Content |
|------|---------|
| `docs/GEMINI.md` | FastMCP tools, Phase 72 automation |
| `docs/CLAUDE.md` | GPU environment, Phase 72 logging |
| `docs/COPILOT.md` | VS Code tasks, Phase 72 integration |

### Cross-Reference Rules
```
WHEN editing database schema:
  READ: gemini.md#drizzle-orm-0.44
  APPLY: db:check → db:generate → review → db:migrate:apply

WHEN fixing TypeScript errors:
  READ: COPILOT_ERROR_FIXING_GUIDE.md
  APPLY: Largest cluster first, validate with svelte-check

WHEN creating API endpoints:
  READ: CLAUDE_RAG_KAG_RULES.md
  APPLY: Category-specific rules (auth, data, ai, cache)
```

---

## 🗺️ Route Structure & Command Center
- **Core Routes Location**: `src/routes/(app)/` contains the authenticated core application routes.
- **Public Routes**: Root level `src/routes/` contains public/marketing pages.
- **Command Center**: The main dashboard is at `src/routes/(app)/command-center/`.
- **Navigation**: Defined in `src/lib/components/yorha/CommandCenterNav.svelte`.

### Route Status
The following routes have been migrated to `(app)`:
- `active-cases`
- `evidence-library`
- `analysis-center`
- `global-search`
- `system-configuration`
- `gpu-evidence-graph`
- `persons-of-interest`

---

## 🗄️ Drizzle ORM 0.44.7 Migration Best Practices

### Stack
- **Drizzle ORM**: 0.44.7 (CRITICAL: use array syntax for table callbacks)
- **Drizzle Kit**: 0.31.6
- **PostgreSQL**: via `postgres-js` driver
- **Schema Location**: `src/lib/server/db/schema-postgres.ts`
- **Migrations Directory**: `drizzle/`

### ⚠️ CRITICAL: Table Callback Syntax (0.31+)
**Old (WRONG) - Returns object:**
```typescript
// ❌ DO NOT USE - causes ExtraConfigColumn errors
pgTable('users', { ... }, (table) => ({
  indexes: [index('name_idx').on(table.name)],
  foreignKeys: [foreignKey({ ... })]
}));
```

**New (CORRECT) - Returns array:**
```typescript
// ✅ CORRECT for Drizzle 0.31+
pgTable('users', { ... }, (table) => [
  index('name_idx').on(table.name),
  uniqueIndex('email_idx').on(table.email),
  foreignKey({
    columns: [table.parentId],
    foreignColumns: [users.id],
    name: 'custom_fk'
  }),
  primaryKey({ columns: [table.id, table.name] })
]);
```

### Migration Scripts (package.json)
```bash
db:check           # Validate schema syntax before any operation
db:push:dev        # Interactive push (development only, with prompts)
db:generate        # Create SQL migration files (review before applying)
db:migrate:apply   # Apply migrations (production-safe)
db:verify:canvas   # Verify canvas_states table exists
db:studio          # Open Drizzle Studio GUI
```

### "No Data Loss" Workflow
```
1. Change schema → src/lib/server/db/schema-postgres.ts
2. npm run db:generate → Creates drizzle/00XX_xxx.sql
3. REVIEW the SQL file:
   ✅ CREATE TABLE, ALTER TABLE ADD COLUMN
   ❌ DROP TABLE, DROP COLUMN, TRUNCATE, ALTER COLUMN TYPE
4. npm run db:migrate:apply → Applies to database
```

### Critical Rules
1. **Never use `db:push` on production** - Use `db:generate` → review → `db:migrate:apply`
2. **Always review generated SQL** for DROP/TRUNCATE statements
3. **Use `doublePrecision()` for float8 columns** to avoid precision loss
4. **Run `db:check` before any migration** to catch syntax errors early
5. **Backup before migrations**: `pg_dump -Fc -f backup.dump`

### Schema Type Mappings
| PostgreSQL | Drizzle |
|------------|---------|
| `uuid` | `uuid()` |
| `text` | `text()` |
| `varchar(n)` | `varchar('col', { length: n })` |
| `integer` | `integer()` |
| `boolean` | `boolean()` |
| `jsonb` | `jsonb()` |
| `timestamp` | `timestamp('col', { mode: 'string' })` |
| `float8/double precision` | `doublePrecision()` |
| `float4/real` | `real()` |
| `text[]` | `text('col').array()` |

### Canvas States Table Verification
Before saving board state, verify table exists:
```typescript
import { verifyCanvasStatesTable } from '$lib/server/db/verify-canvas-table';

const tableExists = await verifyCanvasStatesTable();
if (!tableExists) {
    return json({ error: 'canvas_states table missing', code: 'TABLE_MISSING' }, { status: 503 });
}
```

### Related Files
- `src/lib/server/db/schema-postgres.ts` - Main schema
- `src/lib/server/db/index.ts` - DB client + exports
- `drizzle.config.ts` - Drizzle Kit configuration
- `drizzle/` - Migration files

---

## 🎨 Svelte 5 Native Component Library (2026-01-04)

### Available Components
Import from `$lib/components/ui/svelte5-index`:

| Component | Purpose | Key Props |
|-----------|---------|-----------|
| `Svelte5Button` | Buttons | `variant`, `size`, `loading`, `disabled` |
| `Svelte5Dialog` | Modals | `open`, `title`, `description`, `variant` |
| `Svelte5Input` | Text input | `value`, `label`, `error`, `variant` |
| `Svelte5Select` | Dropdown | `value`, `options`, `placeholder` |
| `Svelte5Checkbox` | Boolean | `checked`, `indeterminate`, `variant` |
| `Svelte5Switch` | Toggle | `checked`, `size`, `variant` |
| `Svelte5Tabs` | Tab navigation | `value`, `tabs`, `variant` |
| `Svelte5Tooltip` | Hover tooltip | `content`, `position`, `delay` |
| `Svelte5Popover` | Click popover | `open`, `position`, `align` |
| `Svelte5Alert` | Notifications | `variant`, `title`, `dismissible` |
| `Svelte5Badge` | Status tags | `variant`, `pill`, `removable` |
| `Svelte5Progress` | Progress bar | `value`, `max`, `indeterminate` |
| `Svelte5Card` | Content box | `variant`, `padding`, `interactive` |
| `Svelte5Accordion` | Collapsible | `type`, `items`, `collapsible` |
| `Svelte5Avatar` | User image | `src`, `initials`, `status` |
| `Svelte5Slider` | Range input | `value`, `min`, `max`, `showValue` |
| `Svelte5RadioGroup` | Radio buttons | `value`, `options`, `variant` |
| `Svelte5DropdownMenu` | Context menu | `items`, `align`, `side` |

### Svelte 5 Runes Reference
```typescript
// Props
let { value, variant = 'default' }: Props = $props();
let open = $bindable(false);  // Two-way binding

// Reactivity
let count = $state(0);
let doubled = $derived(count * 2);

// Side effects
$effect(() => {
	console.log('Value changed:', value);
	return () => cleanup();  // Cleanup function
});
```

### Snippet Pattern (replaces slots)
```svelte
<script>
interface Props { header?: Snippet; children?: Snippet; }
let { header, children }: Props = $props();
</script>

{#if header}{@render header()}{/if}
{@render children?.()}
```

### Event Handlers (new syntax)
```svelte
<!-- ❌ Old Svelte 4 -->
<button on:click={handler}>

<!-- ✅ New Svelte 5 -->
<button onclick={handler}>
```

### Template Location
`src/lib/components/ui/templates/Svelte5ComponentTemplate.svelte`

---

## 🎯 UnoCSS Configuration

### Config File: `uno.config.ts`

### Key Shortcuts
| Shortcut | Description |
|----------|-------------|
| `nes-btn` | NES-style button |
| `nes-panel` | NES bordered panel |
| `nes-badge` | NES status badge |
| `nes-input` | NES text input |
| `glass` | Glassmorphism effect |
| `btn-primary` | Primary button |
| `btn-ghost` | Ghost button |

### NES Theme Colors
- `nes-bg`: #212529
- `nes-accent`: #f8f4e3
- `nes-accent2`: #ffcc66
- `nes-success`: #4ade80
- `nes-danger`: #ff5c5c
- `nes-warning`: #fbbf24

---

## 🔍 Error Analysis (Current State: 70,914 errors)

### Top Error Categories
| Category | % | Fix Strategy |
|----------|---|--------------|
| Object literal corruption | 40% | AST repair / git restore |
| `import type` misuse | 25% | Change to `import { z }` |
| Svelte 4 event syntax | 10% | `node scripts/fix-svelte5-events.mjs` |
| Module export errors | 10% | Fix barrel files |
| Schema redeclarations | 5% | Deduplicate exports |
| Svelte 5 runes | 5% | Use Svelte5 components |

### Priority Files to Fix
1. `src/lib/command-center-manifest.ts`
2. `src/lib/polyfills.ts`
3. `src/lib/utils/type-guards.ts`
4. `src/lib/server/auth.ts`
5. `src/lib/services/ollamaService.ts`

### Error Analysis Location
`logs/ERROR_ANALYSIS_RECOMMENDATIONS.md`
`logs/svelte-check-top-1000.txt`

---

## 🛠️ Fix Scripts

```bash
# Event handler migration
node scripts/fix-svelte5-events.mjs src

# Format all files
npx prettier --write "src/**/*.ts" "src/**/*.svelte"

# Type check
npm run check -- --threshold error

# Clear caches
rm -rf .svelte-kit node_modules/.vite
```


---

## 🚀 Phase 2 Knowledge Base Update (Jan 5, 2026)

### WebGPU Scalar Array Pattern (2025)
**Source**: WebGPU Best Practices
**Pattern**: Use `array<f32>` with manual vector reconstruction
**Example**:
```wgsl
@group(0) @binding(0) var<storage, read> positions: array<f32>;

fn getPosition(index: u32, stride: u32, offset: u32) -> vec3f {
  let i = index * stride + offset;
  return vec3f(positions[i], positions[i + 1u], positions[i + 2u]);
}
```
**Rationale**: Avoids 16-byte alignment issues with vec3<f32>
**Tags**: #webgpu #alignment #compute-shader #gpu #scalar-array

### LangChain v1.0 createAgent Pattern
**Source**: LangChain v1.0 Documentation
**Pattern**: Use `createAgent()` with middleware hooks
**Example**:
```typescript
import { createAgent } from 'langchain/agents';

const agent = await createAgent({
  llm: new ChatOpenAI({ modelName: 'gpt-4' }),
  tools: [/* tools */],
  beforeModel: async (input) => input,
  wrapModelCall: async (call) => await call(),
});
```
**Rationale**: Replaces deprecated chain patterns
**Tags**: #langchain #v1.0 #createAgent #middleware

### TypeScript 5.x Null Safety Pattern
**Source**: TypeScript 5.x Documentation
**Pattern**: Optional chaining + nullish coalescing
**Example**:
```typescript
function getUserAvatar(user: User | null | undefined): string {
  return user?.profile?.avatar ?? '/default-avatar.png';
}
```
**Rationale**: Type-safe null handling
**Tags**: #typescript #5.x #null-safety #optional-chaining

### Drizzle ORM 0.44 Array Syntax Pattern
**Source**: Drizzle ORM 0.44 Documentation
**Pattern**: Return array from table callback, not object
**Example**:
```typescript
export const documents = pgTable('documents', {
  id: uuid('id').primaryKey(),
  title: text('title').notNull(),
}, (table) => [
  index('documents_title_idx').on(table.title),
  foreignKey({
    columns: [table.caseId],
    foreignColumns: [cases.id],
  }).onDelete('cascade'),
]);
```
**Rationale**: Required syntax for Drizzle 0.31+
**Tags**: #drizzle #orm #0.44 #schema #array-syntax

### Bits UI v2.0 Import Pattern
**Source**: Bits UI v2.0 Documentation
**Pattern**: Import from `bits-ui` package
**Example**:
```svelte
<script lang="ts">
  import { Dialog, Button } from 'bits-ui';

  let isOpen = $state(false);
</script>

<Button.Root onclick={() => isOpen = true}>Open</Button.Root>
```
**Rationale**: Replaces @melt-ui/svelte
**Tags**: #bits-ui #v2.0 #svelte5 #headless

### Svelte 5 Runes Pattern
**Source**: Svelte 5 Documentation
**Pattern**: Use $state, $derived, $effect, $props
**Example**:
```svelte
<script lang="ts">
  let count = $state(0);
  let doubled = $derived(count * 2);

  $effect(() => {
    console.log('Count:', count);
  });

  let { title } = $props<{ title: string }>();
</script>
```
**Rationale**: Replaces export let, $:, and reactive declarations
**Tags**: #svelte5 #runes #$state #$derived #$effect

### SvelteKit 2.0 Load Function Pattern
**Source**: SvelteKit 2.0 Documentation
**Pattern**: Typed load functions with PageServerLoad
**Example**:
```typescript
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ params, fetch }) => {
  const data = await fetch(`/api/data/${params.id}`).then(r => r.json());
  return { data };
};
```
**Rationale**: Type-safe data loading
**Tags**: #sveltekit #2.0 #load-functions #types

### Go 1.25 Generics Pattern
**Source**: Go 1.25 Documentation
**Pattern**: Generic functions with type parameters
**Example**:
```go
func Map[T, U any](slice []T, fn func(T) U) []U {
    result := make([]U, len(slice))
    for i, v := range slice {
        result[i] = fn(v)
    }
    return result
}
```
**Rationale**: Type-safe generic operations
**Tags**: #go #1.25 #generics #type-parameters

### Python 3.12+ Type Hints Pattern
**Source**: Python 3.12 Documentation
**Pattern**: Modern type annotations with list[T] syntax
**Example**:
```python
def process_items(items: list[str], count: int) -> dict[str, int]:
    return {item: count for item in items}
```
**Rationale**: Simplified type hint syntax
**Tags**: #python #3.12 #type-hints #modern-syntax

### CUDA 12.x Unified Memory Pattern
**Source**: CUDA 12.x Documentation
**Pattern**: Use cudaMallocManaged for unified memory
**Example**:
```cpp
float *data;
cudaMallocManaged(&data, bytes);
// Use on both host and device
cudaDeviceSynchronize();
cudaFree(data);
```
**Rationale**: Simplified memory management
**Tags**: #cuda #12.x #unified-memory #gpu
