# Claude Brief: Phase13 Integration Pattern

## 🔧 Phase 90/91 Transition (Jan 8, 2026)

**Milestone:** Phase 90 Complete (100% Coverage)
- **Reduction:** 51.6% (42k errors remaining)
- **Total Fixes:** 4,908 confirmed AST transformations
- **New Patterns:** UnionType, ForStatement, TypeAliasDeclaration (90-95% confidence)

### Phase 91 Objectives
1.  **Target Priority 2:** Svelte 5 Migration Patterns (`$:` replacement, Runes).
2.  **Semantic Fixes:** Address `TS2322` (Type Assignability) and `TS2339` (Property Missing).
3.  **Tooling:** Enhance AST fixer with TypeChecker awareness.

---

## 🔧 Phase 90: AST-Based TypeScript Fixer Progress (Jan 2026)

**Status:** Batch 13 complete (70% success), 3 new high-confidence patterns researched

### Batch 13 Summary (Jan 8, 2026)
- **Files processed:** 50 (ranks 206-255)
- **Success rate:** 70% (35/50 files fixed successfully)
- **Fixes applied:** 889 total
- **Rollbacks:** 0 (no breaking changes introduced)
- **Cumulative progress:** 255 files, 4,286 fixes, 67% overall success rate

### Knowledge-Augmented Generation (KAG) Patterns

**Active Patterns in Redis (4):**
1. BinaryExpression (75% confidence)
2. PropertySignature (85% confidence)
3. BindingElement (90% confidence)
4. AsExpression (70% confidence)

**New Patterns from Web Research (3):**
1. **UnionType** (95% confidence) - Rule: "DO NOT insert comma near union type pipe (|) separator"
   - Sources: TypeScript official docs, Stack Overflow 474 questions, Basarat GitBook
   - Skip indicators: Found '|' within 5 chars, parent is UnionType/TypeReference

2. **ForStatement** (90% confidence) - Rule: "Commas ONLY in initialization & afterthought, NEVER in condition"
   - Sources: MDN for statement reference, Stack Overflow 824k views, TypeScript Handbook
   - Skip indicators: Comma in valid sections, parent is ForStatement

3. **TypeAliasDeclaration** (90% confidence) - Rule: "Commas valid for object properties, generics, tuples; NEVER for unions (|) or intersections (&)"
   - Sources: TypeScript Handbook (2 sections), Stack Overflow 38 questions
   - Skip indicators: Found '|' or '&' within 5 chars, parent has UnionType/IntersectionType

**Test Coverage:** 45+ test cases created in `phase90-pattern-test-cases.ts`

### Next Phase Goals
- Execute Batches 14-16 (150 files, ranks 256-405) with 7 total patterns
- Target: 75%+ success rate with refined skip logic
- Projected impact: 100% codebase coverage (~300 files total)

---

## 🔐 Database Authentication: Fallback Strategy (Jan 9, 2026)

**Pattern:** PostgreSQL Connection Resilience

**Implementation:**
```typescript
// src/lib/server/adapters/service-integrations.ts
postgresConfig: {
  user: dbUrl.username || process.env.POSTGRES_USER || 'legal_admin',
  password: dbUrl.password || process.env.POSTGRES_PASSWORD || '123456',
  fallbackUser: 'postgres',
  fallbackPassword: process.env.POSTGRES_SUPERUSER_PASSWORD || 'postgres'
}
```

**Key Findings:**
- **Primary User:** `legal_admin` (application-level access)
- **Fallback User:** `postgres` (superuser for emergency access)
- **Database:** `legal_ai_db`
- **Environment Support:** Reads from `POSTGRES_USER`, `POSTGRES_PASSWORD`, `POSTGRES_SUPERUSER_PASSWORD`

**Use Case:** Production deployments where app user credentials differ from development

---

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

- Probes (cached): Ollama via `getOllamaEndpoint`, Enhanced RAG `/health`, Qdrant `healthz/readyz/collections`, Redis via env/ping, DB via env presence, Docker flag. Cache results ~30s.
- Preference order: Enhanced RAG > Ollama (`gemma3-legal:latest`); vector DB Qdrant > pgvector > memory; DB prod URL > memory; Redis caching when available.
- Performance defaults: SSR on, code splitting, UnoCSS, Redis-or-memory caching.
- Health endpoint `/api/system/phase13` returns status + recommendations.
- Env-only wiring (no infra mutations): `ENHANCED_RAG_URL`, `DATABASE_URL`, `PGVECTOR_ENABLED`/`ENABLE_PGVECTOR`, `REDIS_URL`/`UPSTASH_REDIS_REST_URL`, `QDRANT_URL`, `OLLAMA_URL`/`OLLAMA_BASE_URL`, optional Docker flags.
- Mirror pattern for other system health endpoints if needed; consume via `initializePhase13()` or the GET endpoint.

---

## 🔧 WebGPU + LangChain + TypeScript: Corruption Patterns

**Latest Analysis (Jan 2026):** Systematic corruption patterns in WebGPU/LangChain TypeScript code:

### Critical Patterns Detected

1. **Import Type Syntax** - Colons replacing spaces
   - Pattern: `import type: { X } from: 'y'`
   - Fix: `import type { X } from 'y'`
   - Source: TypeScript 5.6 module resolution docs

2. **Function Parameters** - Commas replacing colons
   - Pattern: `function f(param, Type)`
   - Fix: `function f(param: Type)`
   - Source: LangChain.js v0.3 type safety guidelines

3. **Interface Declarations** - Extra punctuation
   - Pattern: `interface X: {,;`
   - Fix: `interface X {`
   - Source: TypeScript handbook

4. **Missing Closing Parentheses** - Early termination
   - Pattern: `crypto.randomUUID(, next:`
   - Fix: `crypto.randomUUID(), next:`
   - Common in WebGPU device initialization

5. **Object Property Shorthand** - Wrong separator
   - Pattern: `{ id, item.id }`
   - Fix: `{ id: item.id }`
   - Source: MDN JavaScript object literals

**Automated Detection:** `scripts/agentic-corruption-fixer.mjs` uses 10 regex patterns with svelte-check validation loop.

**Reference Documentation:**
- WebGPU Spec: https://gpuweb.github.io/gpuweb/
- LangChain TypeScript Guide: https://js.langchain.com/docs/get_started/introduction
- TypeScript 5.6 Release Notes: https://devblogs.microsoft.com/typescript/announcing-typescript-5-6/

---

## 📦 Technology Stack Specifications (Jan 2026)

### 🟦 Drizzle ORM 0.44
**Relations Syntax (Breaking Change from 0.33):**
```typescript
import { pgTable, text, integer, relations } from 'drizzle-orm/pg-core';

export const users = pgTable('users', {
  id: text('id').primaryKey(),
  name: text('name').notNull()
});

// ✅ Drizzle 0.44 syntax
export const usersRelations = relations(users, ({ many }) => ({
  posts: many(posts)
}));

// ❌ OLD Drizzle 0.33 syntax (no longer valid)
export const usersRelations: Relations<'users', {}> = { ... };
```
**Docs:** https://orm.drizzle.team/docs/rqb

### 🧩 Bits UI Svelte 5 Components
**$bindable Rune Pattern:**
```svelte
<script lang="ts">
import type { Snippet } from 'svelte';

interface Props {
  value = $bindable('');
  placeholder?: string;
  class?: string;
  children?: Snippet;
}

let { value = $bindable(''), placeholder, class: className, children }: Props = $props();
</script>
```
**Docs:** https://bits-ui.com/docs/components/button

### ⚡ SvelteKit 2 Patterns
**Load Function (No Generic Return Type):**
```typescript
// ✅ SvelteKit 2
export async function load({ params, parent, fetch, url }) {
  const parentData = await parent();
  return {
    post: await getPost(params.id),
    metadata: parentData.metadata
  };
}

// ❌ SvelteKit 1 (deprecated)
export const load: PageLoad = async () => { ... };
```
**Docs:** https://kit.svelte.dev/docs/load

### 🔶 Go 1.25 WASM
**WASM Export Directive:**
```go
package main

import "syscall/js"

//go:wasmexport add
func add(a, b int32) int32 {
  return a + b
}

func main() {
  js.Global().Set("goAdd", js.FuncOf(addWrapper))
  select {}
}
```
**Docs:** https://go.dev/wiki/WebAssembly

### 🐍 Python 3.13 Types
**Type Annotations with Annotated:**
```python
from typing import Annotated
import torch

def process_tensor(
    data: Annotated[torch.Tensor, "Input tensor"],
    device: Annotated[str, "cuda or cpu"] = "cuda"
) -> Annotated[torch.Tensor, "Processed output"]:
    return data.to(device).float()
```
**Docs:** https://docs.python.org/3.13/library/typing.html

### 💡 CUDA 12+ Kernel Launch
**Execution Configuration:**
```cpp
// ✅ CUDA 12+ unified memory pattern
__global__ void vectorAdd(float* a, float* b, float* c, int n) {
  int idx = blockIdx.x * blockDim.x + threadIdx.x;
  if (idx < n) c[idx] = a[idx] + b[idx];
}

int main() {
  int n = 1<<20;
  size_t bytes = n * sizeof(float);

  float *a, *b, *c;
  cudaMallocManaged(&a, bytes);
  cudaMallocManaged(&b, bytes);
  cudaMallocManaged(&c, bytes);

  int threads = 256;
  int blocks = (n + threads - 1) / threads;
  vectorAdd<<<blocks, threads>>>(a, b, c, n);
  cudaDeviceSynchronize();
}
```
**Docs:** https://docs.nvidia.com/cuda/cuda-c-programming-guide/

---

## 📚 Knowledge Graph / RAG / KAG / DAG Sources

### AI Agent Context Files
| File | Purpose | Load When |
|------|---------|-----------|
| `copilot.md` | Primary Copilot instructions | Copilot sessions |
| `claude.md` | Primary Claude context | Always (this file) |
| `gemini.md` | Gemini agent context | Gemini sessions |
| `CLAUDE_RAG_KAG_RULES.md` | RAG/KAG endpoint generation rules | API endpoints |

### Extended Documentation (docs/)
| File | Content |
|------|---------|
| `docs/CLAUDE.md` | GPU environment, Phase 72 logging |
| `docs/GEMINI.md` | FastMCP tools, Phase 72 automation |
| `docs/COPILOT.md` | VS Code tasks, Phase 72 integration |

### Cross-Reference Rules
```
WHEN editing database schema:
  READ: claude.md#drizzle-orm-0.44
  APPLY: db:check → db:generate → review → db:migrate:apply

WHEN fixing TypeScript errors:
  READ: COPILOT_ERROR_FIXING_GUIDE.md
  APPLY: Largest cluster first, validate with svelte-check

WHEN creating API endpoints:
  READ: CLAUDE_RAG_KAG_RULES.md
  APPLY: Category-specific rules (auth, data, ai, cache)
```

---

## 🔄 Phase 74: Core Route Gate & Fix Waves

### Operating Loop
1. **Inventory**: Run `node scripts/routes-inventory.mjs` to map Core vs Dev routes.
2. **Check**: Run `scripts/advanced-check.ps1` to get a fresh error baseline.
3. **Prioritize**:
   - **Wave 1**: Fix all errors in `Core Routes` (must be 0 errors).
   - **Wave 2**: Fix `Import` and `Type` errors globally.
   - **Wave 3**: Fix `Event Handler` deprecations (on:click -> onclick).
4. **Verify**: Re-run `scripts/advanced-check.ps1` after each wave.

// ...existing code...
### Fix Rules
- **Never** delete a file unless explicitly instructed.
- **If a fix is complex**, wrap it in `// @ts-ignore` with a TODO comment: `// TODO: Phase 75 fix`.
- **Core Routes** take precedence over everything else.

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

## 🎨 Svelte 5 Component Library (2026-01-04)

### Import Path
```typescript
import { Svelte5Button, Svelte5Dialog, Svelte5Input, ... } from '$lib/components/ui/svelte5-index';
```

### Components Available
- **Form**: `Svelte5Input`, `Svelte5Select`, `Svelte5Checkbox`, `Svelte5Switch`, `Svelte5Slider`, `Svelte5RadioGroup`
- **Navigation**: `Svelte5Tabs`, `Svelte5TabPanel`, `Svelte5DropdownMenu`
- **Overlay**: `Dialog`, `Svelte5Tooltip`, `Svelte5Popover`
- **Feedback**: `Svelte5Alert`, `Svelte5Badge`, `Svelte5Progress`
- **Layout**: `Svelte5Card`, `Svelte5Accordion`
- **Display**: `Svelte5Avatar`, `Svelte5Button`

### Key Patterns
```svelte
<!-- Props with runes -->
let { value, variant = 'default' }: Props = $props();

<!-- Bindable for two-way -->
let open = $bindable(false);

<!-- Snippets replace slots -->
{#if header}{@render header()}{/if}

<!-- New event syntax -->
<button onclick={handler}>
```

### Template
`src/lib/components/ui/templates/Svelte5ComponentTemplate.svelte`

---

## 🔍 Error Analysis (70,914 errors)

### Top Categories
| Category | % | Fix |
|----------|---|-----|
| Object corruption | 40% | AST repair |
| `import type` | 25% | `import { z }` |
| Event syntax | 10% | `fix-svelte5-events.mjs` |
| Module exports | 10% | Fix barrels |

### Priority Files
1. `src/lib/command-center-manifest.ts`
2. `src/lib/server/auth.ts`
3. `src/lib/services/ollamaService.ts`

### Resources
- `logs/ERROR_ANALYSIS_RECOMMENDATIONS.md`
- `logs/svelte-check-top-1000.txt`

---

## 🎯 UnoCSS Shortcuts

| Shortcut | Effect |
|----------|--------|
| `nes-btn` | NES button |
| `nes-panel` | NES panel |
| `nes-badge-*` | Status badges |
| `glass` | Glassmorphism |

Config: `uno.config.ts`


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


---

## 🚀 Phase 2: Svelte 5 + Drizzle ORM 0.44 Patterns (Jan 7, 2026)

### Svelte 5 Runes Reactivity System

**Migration Priority:** CRITICAL - 77,146 svelte-check errors

#### 1. State Management ($state)
```typescript
// ❌ Svelte 4 (Old)
let count = 0;
let user = { name: 'Alice', age: 30 };

// ✅ Svelte 5 (New)
let count = $state(0);
let user = $state({ name: 'Alice', age: 30 });
```
**Key:** Direct read/write, automatic deep reactivity

#### 2. Derived State ($derived)
```typescript
// ❌ Svelte 4 (Old)
$: doubleCount = count * 2;

// ✅ Svelte 5 (New)
let doubleCount = $derived(count * 2);
```
**Key:** Replaces `$:` reactive statements for computed values

#### 3. Side Effects ($effect)
```typescript
// ❌ Svelte 4 (Old)
$: {
  console.log('Count:', count);
}

// ✅ Svelte 5 (New)
$effect(() => {
  console.log('Count:', count);
});
```
**Key:** Runs after DOM updates, cleanup via return function

#### 4. Props ($props)
```typescript
// ❌ Svelte 4 (Old)
export let title: string;
export let count: number = 0;

// ✅ Svelte 5 (New)
let { title, count = 0 }: {
  title: string;
  count?: number;
} = $props();
```
**Key:** Destructuring with defaults, no `export` keyword

#### 5. Event Handlers
```svelte
<!-- ❌ Svelte 4 (Old) -->
<button on:click={handleClick}>Click</button>

<!-- ✅ Svelte 5 (New) -->
<button onclick={handleClick}>Click</button>
```
**Key:** Lowercase event names, no `on:` prefix

### Drizzle ORM 0.44 Patterns

#### 1. SQL Raw Queries
```typescript
import { sql } from 'drizzle-orm';

// ✅ Type-safe raw SQL
const result = await db.execute(
  sql`SELECT * FROM users WHERE age > ${minAge}`
);
```
**Key:** Prevents SQL injection, type-safe interpolation

#### 2. Prepared Statements
```typescript
// ✅ Prepared statement for performance
const getUserById = db
  .select()
  .from(users)
  .where(eq(users.id, sql.placeholder('id')))
  .prepare('get_user_by_id');

const user = await getUserById.execute({ id: 1 });
```
**Key:** Reuses compiled SQL, use `sql.placeholder()` for params

#### 3. Hybrid Query Builder + Raw SQL
```typescript
import { sql } from 'drizzle-orm';

const result = await db
  .select()
  .from(posts)
  .where(eq(posts.status, 'published'))
  .$dynamic()
  .orderBy(sql.raw('RANDOM()'))
  .limit(10);
```
**Key:** Mix query builder with raw SQL, use `.$dynamic()` for flexibility

### TypeScript Error Patterns (TS1005, TS1128, TS1135)

#### Pattern 1: Import Type Syntax
```typescript
// ❌ Error: Missing comma
import { User type UserRole } from './types';

// ✅ Fixed
import { User, type UserRole } from './types';
```

#### Pattern 2: Arrow Function Parameters
```typescript
// ❌ Error: Missing parentheses
parser.on("headers", headers:any => console.log(headers));

// ✅ Fixed
parser.on("headers", (headers: any) => console.log(headers));
```

#### Pattern 3: Try-Catch Corruption
```typescript
// ❌ Error: Corrupted catch
} catch (e: unknown: Error: any) {

// ✅ Fixed
} catch (e) {
  const error = e as Error;
```

#### Pattern 4: Function Signature Corruption
```typescript
// ❌ Error: Missing closing brace
export function createHandler(
  config: Config
return async (data: unknown) => {

// ✅ Fixed
export function createHandler(
  config: Config
): (data: unknown) => Promise<void> {
  return async (data: unknown) => {
```

### Automated Fix Priority Order
1. **Import statements** (highest impact - cascading errors)
2. **Function signatures** (structural errors)
3. **Object literals** (common pattern)
4. **Try-catch blocks** (syntax errors)
5. **Type annotations** (lowest impact)

### Validation Workflow
1. **Syntax check:** Balanced brackets/braces
2. **Type check:** `npx tsc --noEmit`
3. **Svelte check:** `npx svelte-check`
4. **Rollback:** Restore if validation fails

### Current Error Status (Jan 7, 2026)
- **TypeScript Errors:** 34,810 (down from 42,923)
- **Svelte-check Errors:** 77,146
- **Target:** <5,000 errors
- **Progress:** 18.9% reduction in TypeScript errors

**Tags:** `#svelte5` `#runes` `#drizzle-orm` `#typescript` `#error-fixing` `#phase2` `#migration` `#reactivity`



---

## 🚀 Phase 2: Type System Fixes - Knowledge Base Update (Jan 10, 2026)

### Overview
**Objective:** Systematic type system error fixes targeting ~27,000 errors (57% reduction from 88,500)
**Approach:** AST-based automated fixes with knowledge base integration
**Patterns:** 6 new high-confidence patterns from latest documentation

---

### Pattern 1: WebGPU Scalar Array (95% confidence)
**Source:** WebGPU Best Practices (toji.dev, Feb 2024)
**Problem:** vec3<f32> requires 16-byte alignment, but vertex data is 12-byte packed
**Solution:** Use `array<f32>` with manual vector reconstruction

```wgsl
// ✅ Pattern
@group(0) @binding(0) var<storage> positions: array<f32>;

fn getPosition(index: u32, stride: u32, offset: u32) -> vec3f {
  let i = index * stride + offset;
  return vec3f(positions[i], positions[i + 1], positions[i + 2]);
}
```

**Key Rules:**
- Stride/offset in elements (floats), not bytes
- Manual indexing for flexible layouts
- Atomic operations require quantization to i32

**Skip Indicators:**
- Already using `array<f32>` pattern
- No compute shader context
- Render pipeline only (no storage buffers)

---

### Pattern 2: LangChain v1 createAgent (98% confidence)
**Source:** LangChain v1 Documentation (Jan 2025)
**Problem:** Deprecated chain abstractions (LLMChain, etc.)
**Solution:** Use `createAgent()` with middleware

```typescript
// ✅ Pattern
import { createAgent, createMiddleware } from "langchain";

const agent = createAgent({
  model: "openai:gpt-4o",
  tools: [searchTool],
  middleware: [
    createMiddleware({
      name: "ErrorHandler",
      wrapToolCall: async (request, handler) => {
        try {
          return await handler(request);
        } catch (error) {
          return new ToolMessage({
            content: `Tool error: ${error}`,
            tool_call_id: request.toolCall.id!,
          });
        }
      },
    }),
  ],
});
```

**Key Rules:**
- Replace `LLMChain` with `createAgent()`
- Use middleware for customization
- Import from `langchain`, not `@langchain/core`

**Skip Indicators:**
- Already using `createAgent()`
- No LangChain imports
- Using LangGraph directly

---

### Pattern 3: TypeScript Null Safety (100% confidence)
**Source:** TypeScript 5.x Documentation
**Problem:** Unsafe property access causing runtime errors
**Solution:** Optional chaining (`?.`) and nullish coalescing (`??`)

```typescript
// ✅ Pattern
const userName = user?.profile?.name;
const count = value ?? 0;
const firstItem = array?.[0];

// Function parameters
function process(data: string | null | undefined): void {
  if (data === null || data === undefined) return;
  // data is now string
}
```

**Key Rules:**
- Use `?.` for potentially undefined properties
- Use `??` for null/undefined defaults (not `||`)
- Use union types for nullable parameters
- Strict equality for null checks (`=== null`)

**Skip Indicators:**
- Already using optional chaining
- Non-nullable type context
- Strict null checks disabled

---

### Pattern 4: Drizzle ORM 0.44 Schema (95% confidence)
**Source:** Drizzle ORM Documentation (2025)
**Problem:** Outdated schema definition patterns
**Solution:** Use `pgTable()` with typed columns

```typescript
// ✅ Pattern
import { pgTable, serial, text, timestamp } from "drizzle-orm/pg-core";
import { relations } from "drizzle-orm";

export const users = pgTable("users", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  email: text("email").notNull().unique(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const usersRelations = relations(users, ({ many }) => ({
  posts: many(posts),
}));
```

**Key Rules:**
- Use `pgTable()` for table definitions
- Chain modifiers (`.notNull()`, `.unique()`)
- Use `relations()` for foreign keys
- Import from `drizzle-orm/pg-core`

**Skip Indicators:**
- Already using Drizzle 0.44 API
- No Drizzle imports
- Using different ORM

---

### Pattern 5: Bits UI v2.0 Imports (98% confidence)
**Source:** Bits UI v2.0 Documentation
**Problem:** Deprecated `@melt-ui/svelte` imports
**Solution:** Use `bits-ui` package

```typescript
// ✅ Pattern
import { Dialog, Button, Select } from "bits-ui";
import type { DialogProps } from "bits-ui";

// ❌ Deprecated
import { createDialog } from "@melt-ui/svelte";
```

**Key Rules:**
- Replace `@melt-ui/svelte` with `bits-ui`
- Use component-based API (not builders)
- Add `import type` for props
- Follow Svelte 5 runes pattern

**Skip Indicators:**
- Already using `bits-ui`
- No Melt UI imports
- Custom component library

---

### Pattern 6: Svelte 5 Runes (100% confidence)
**Source:** Svelte 5 Documentation
**Problem:** Deprecated Svelte 4 reactivity patterns
**Solution:** Use runes (`$state`, `$derived`, `$effect`, `$props`)

```typescript
// ✅ Pattern
let count = $state(0);
let doubled = $derived(count * 2);

$effect(() => {
  console.log(`Count is ${count}`);
});

let { title, description = "Default" } = $props<{
  title: string;
  description?: string;
}>();

// ❌ Deprecated
let count = 0;
$: doubled = count * 2;
export let title: string;
```

**Key Rules:**
- Use `$state()` for reactive variables
- Use `$derived()` for computed values
- Use `$effect()` for side effects
- Use `$props()` for component props
- Remove `export let` declarations

**Skip Indicators:**
- Already using runes
- Svelte 4 project
- No reactive declarations

---

### Implementation Strategy

**Phase 2 Execution Plan:**
1. **Task 0:** Fetch docs, update knowledge base, create AST analyzer
2. **Task 1:** Bits UI imports (~5,000 errors)
3. **Task 2:** Null safety (~4,000 errors)
4. **Task 3:** WebGPU types (~3,000 errors)
5. **Task 4:** LangChain v1 (~2,000 errors)
6. **Task 5:** Generic types (~10,000 errors)
7. **Task 6:** Type mismatches (~8,000 errors)
8. **Task 7:** Import types (~2,000 errors)

**Validation:**
- Dry-run on files 1-210 before full execution
- svelte-check + tsc validation after each task
- Incremental commits with rollback capability
- Knowledge base hit rate >90%

**Expected Outcome:**
- ~27,000 errors fixed (57% reduction)
- Build success rate 100%
- Test pass rate 100%
- Production-ready codebase

---

## 🌐 SvelteKit 2 Architecture: SSR vs Remote Functions (Jan 2026)

### Current Pattern Analysis
- **API Endpoints (+server.ts):** 4175 files
- **SSR Load Functions (+page.server.ts):** 264 files
- **Ratio:** 16:1 (API-heavy, needs refactoring)

### SvelteKit 2 Best Practices

| Pattern | When to Use | Benefits |
|---------|-------------|----------|
| **SSR Load Functions** | Page data, navigation-triggered fetching, auth-dependent data | SEO optimization, faster initial render, type-safe with `$types`, no extra HTTP round-trip |
| **API Endpoints (+server.ts)** | Third-party API access, webhooks, mobile apps, non-page requests | External client support, JSON API for other consumers |
| **Form Actions** | Mutations, form submissions | Progressive enhancement, works without JS, CSRF protection |

### Recommended Refactoring Pattern

**BEFORE (API-centric):**
```typescript
// routes/api/cases/+server.ts
export const GET: RequestHandler = async ({ locals }) => {
  const cases = await db.select()...;
  return json({ cases });
};

// routes/cases/+page.svelte
onMount(async () => {
  cases = await fetch('/api/cases').then(r => r.json());
});
```

**AFTER (SSR-centric):**
```typescript
// routes/cases/+page.server.ts
export const load: PageServerLoad = async ({ locals }) => {
  if (!locals.user) throw redirect(302, '/login');
  return { cases: await db.select()... };
};

// routes/cases/+page.svelte
let { data }: PageProps = $props();
// data.cases available immediately, SSR-rendered
```

### Form Actions (Progressive Enhancement)
```typescript
// routes/cases/create/+page.server.ts
export const actions = {
  create: async ({ request, locals }) => {
    const data = await request.formData();
    await db.insert(cases).values({...});
    return { success: true };
  }
} satisfies Actions;
```

```svelte
<form method="POST" action="?/create" use:enhance>
  <input name="title" required />
  <button>Create Case</button>
</form>
```

---

## 📡 SSE vs WebSocket: Contextual Chat Architecture

### Decision Matrix

| Feature | SSE (Server-Sent Events) | WebSocket |
|---------|--------------------------|-----------|
| **Direction** | Server → Client (unidirectional) | Bidirectional |
| **Reconnection** | Automatic | Manual implementation |
| **SvelteKit Integration** | Native with +server.ts | Requires adapter config |
| **Edge Deployment** | ✅ Vercel/Cloudflare compatible | ⚠️ May need custom handling |

### Recommendation: SSE for Contextual Chat

**SSE Implementation Pattern:**
```typescript
// routes/api/chat/stream/+server.ts
export const GET: RequestHandler = async ({ request }) => {
  const stream = new ReadableStream({
    async start(controller) {
      for await (const token of llmStream) {
        controller.enqueue(`data: ${JSON.stringify({ type: 'token', content: token })}\n\n`);
      }
      controller.enqueue(`data: ${JSON.stringify({ type: 'done' })}\n\n`);
      controller.close();
    }
  });

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive'
    }
  });
};
```

---

## 🏗️ ADK TypeScript Architecture (RAG, KAG, DAG)

### Separation of Concerns

| Layer | Purpose | Location |
|-------|---------|----------|
| **User Functions** | Auth, profile, preferences, cases CRUD | `src/lib/server/user/` |
| **RAG (Retrieval)** | Vector search, document retrieval | `src/lib/server/rag/` |
| **KAG (Knowledge)** | Pattern learning, fix confidence | `src/lib/server/kag/` |
| **DAG (Document)** | Document processing, chunking | `src/lib/server/dag/` |

### User Functions (Separate from ADK)
```typescript
// src/lib/server/user/index.ts
export async function getUserCases(userId: string) {
  return db.select().from(cases).where(eq(cases.userId, userId));
}

export async function updateUserPreferences(id: string, prefs: Partial<UserPrefs>) {
  return db.update(users).set({ preferences: prefs }).where(eq(users.id, id));
}
```

### RAG Functions (AI/Search - Separate)
```typescript
// src/lib/server/rag/index.ts
export async function searchKnowledgeBase(query: string, topK = 5) {
  const embedding = await generateEmbedding(query);
  return qdrant.search('knowledge_base', embedding, topK);
}
```

---

## 🔄 Route Consolidation Plan

### Duplicate Routes to Merge
| Keep | Remove | Reason |
|------|--------|--------|
| `/cases/new` | `/cases/create` | Consistent naming |
| `/evidence` | `/evidence-library` | Shorter URL |
| `/settings` | `/system-configuration` | User-friendly |

### Implementation Pattern
```typescript
// routes/cases/create/+page.server.ts (old route - redirect)
export const load = () => redirect(301, '/cases/new');
```

---

## 🤖 Local-First Agent Frameworks (Jan 2026)

### Preferred Stack ($0 Cost, 100% Local)
- **CrewAI** - Structured role-based agent pipelines
- **AutoGen** (Microsoft) - Conversational multi-agent collaboration
- **GraphRAG** (Microsoft) - Knowledge graph + RAG hybrid
- **Langfuse** - Open-source LLM observability (LangSmith alternative)

### Installation
```bash
pip install crewai crewai-tools pyautogen graphrag langfuse
```

### CrewAI with Ollama (FREE)
```python
from crewai import Agent, Task, Crew

researcher = Agent(
    role='Legal Researcher',
    goal='Find relevant case law',
    tools=[kb_vector_search, web_search],
    llm='ollama/gemma3-legal:latest'  # FREE LOCAL
)

crew = Crew(agents=[researcher], tasks=[...])
result = crew.kickoff()
```

### Microsoft GraphRAG
```bash
graphrag init --root ./legal-knowledge
graphrag index --root ./legal-knowledge
graphrag query --method global --query "IP precedents"
```

### Langfuse (Self-Hosted LangSmith Alternative)
```bash
docker-compose -f docker/langfuse.yml up -d
# Access at http://localhost:3000
```

---

## 📊 Agentic RAG + KAG + DAG Architecture

### RAG (Retrieval-Augmented Generation)
**Purpose:** Vector similarity search for semantic document retrieval
**Storage:** Qdrant (Port 6333)
**Tool:** `kb_vector_search`

### KAG (Knowledge-Augmented Generation)
**Purpose:** Graph-based entity relationships via GraphRAG
**Storage:** GraphRAG parquet + Neo4j (Port 7687)
**Tool:** `graphrag_search`

### DAG (Document-Augmented Generation)
**Purpose:** Structured document processing pipelines
**Storage:** MinIO (Port 9000) + PostgreSQL
**Pattern:** CrewAI sequential process

---

## 🗺️ Phase 96 Roadmap: Evidence Management SSR

### Immediate Tasks
- [ ] Migrate `/evidence` to SSR + form actions
- [ ] Consolidate `/evidence` and `/evidence-library` routes
- [ ] Add SSE for real-time notifications
- [ ] Refactor `/cases/[id]/chat` to use SSE instead of WebSocket

### SSR Migration Pattern
```typescript
// routes/evidence/+page.server.ts
export const load: PageServerLoad = async ({ locals }) => {
  if (!locals.user) throw redirect(302, '/login');
  return { evidence: await db.select().from(evidenceTable)... };
};

export const actions = {
  upload: async ({ request, locals }) => {
    const formData = await request.formData();
    await db.insert(evidenceTable).values({...});
    return { success: true };
  }
} satisfies Actions;
```

### SSE Implementation for Chat
```typescript
// routes/api/chat/stream/+server.ts
export const GET: RequestHandler = async ({ url }) => {
  const prompt = url.searchParams.get('prompt');

  const stream = new ReadableStream({
    async start(controller) {
      for await (const token of llmStream(prompt)) {
        controller.enqueue(`data: ${JSON.stringify({ token })}\n\n`);
      }
      controller.close();
    }
  });

  return new Response(stream, {
    headers: { 'Content-Type': 'text/event-stream' }
  });
};
```

### Long-term (Phase 97+)
- [ ] Migrate `/admin/knowledge-search` to SSR (SEO boost)
- [ ] Add optimistic UI updates with `use:enhance` callbacks
- [ ] Infinite scroll with SSR pagination
- [ ] Lighthouse CI for performance monitoring

### Expected Impact
- **Performance:** 30-50% faster page loads
- **SEO:** Score 95+/100 across all pages

---

## 📚 Reference Documentation

| Topic | Resource |
|-------|----------|
| **CrewAI** | https://docs.crewai.com/ |
| **AutoGen** | https://microsoft.github.io/autogen/ |
| **GraphRAG** | https://github.com/microsoft/graphrag |
| **Langfuse** | https://langfuse.com/docs |
| **FastMCP** | https://github.com/jlowin/fastmcp |
| SvelteKit Load | https://kit.svelte.dev/docs/load |
| SvelteKit Actions | https://kit.svelte.dev/docs/form-actions |
| Svelte 5 Runes | https://svelte.dev/docs/runes |
| Drizzle ORM | https://orm.drizzle.team/docs/overview |

---

## 💰 Cost Summary (Local Stack)

| Framework | License | LLM Cost | Notes |
|-----------|---------|----------|-------|
| CrewAI | MIT | FREE | Uses Ollama |
| AutoGen | MIT | FREE | Uses Ollama |
| GraphRAG | MIT | FREE | Uses Ollama |
| Langfuse | MIT | N/A | Self-hosted |
| FastMCP | MIT | FREE | Uses Ollama |

**Total Monthly Cost:** $0

