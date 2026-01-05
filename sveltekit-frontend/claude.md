# Claude Brief: Phase13 Integration Pattern

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
