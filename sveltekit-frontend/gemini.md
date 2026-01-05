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
