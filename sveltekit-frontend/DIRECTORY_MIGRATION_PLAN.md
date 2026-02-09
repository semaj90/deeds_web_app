# Directory Migration & Consolidation Plan

**Date:** February 4, 2026
**Purpose:** Consolidate sveltekit-frontend directory structure, migrate parked routes, and implement core features

---

## 📊 Current State Analysis

### Ripgrep/Awk Usage in Codebase

**Found 30+ implementations across:**

1. **Backend Python Services:**
   - `backend/services/pattern_search_service.py` (550 lines) - Full ripgrep + awk integration
   - `sveltekit-frontend/scripts/phase95-docling-context-extractor.py` - RipgrepSearcher class

2. **Frontend Scripts (Node.js):**
   - `scripts/test-ripgrep.mjs` - Ripgrep integration tester
   - `scripts/phase79-enhanced-agent.mts` - Codebase pattern search
   - `scripts/phase89-ripgrep-tagger.mjs` - AST tagging with ripgrep
   - `scripts/ripgrep-semantic-cache.mjs` - Semantic search with ripgrep caching
   - `scripts/redis-cache-helper.mjs` - `ripgrepSearchPatterns()` function
   - `scripts/discover-knowledge-bases.mjs` - Fast KB discovery
   - `scripts/phase87-knowledge-sync.mjs` - Pattern extraction
   - `scripts/fastmcp-server.mjs` - MCP ripgrep tool
   - `scripts/phase74-unified-fastmcp.mjs` - Codebase search tool

3. **PowerShell Scripts:**
   - `scripts/search-with-rg.ps1` - Ripgrep wrapper with awk

**Key Pattern:**
```javascript
// Standard ripgrep JSON output parsing
const rg = spawn('rg', [
    '--json',
    '--max-count', '50',
    '-i', // case-insensitive
    pattern,
    searchPath
]);

rg.stdout.on('data', (data) => {
    const lines = data.toString().split('\n');
    for (const line of lines) {
        const parsed = JSON.parse(line);
        if (parsed.type === 'match') {
            matches.push({
                file: parsed.data.path.text,
                line: parsed.data.line_number,
                text: parsed.data.lines.text
            });
        }
    }
});
```

---

## 🗂️ Directory Structure Analysis

### Current Routes (`src/routes/`)

#### ✅ Active Core Routes (Keep)
```
src/routes/
├── (app)/               # Main app layout group
├── +page.svelte         # Homepage (820 lines) - Dashboard
├── +layout.svelte       # Root layout
├── admin/               # Admin panel
├── api/                 # API endpoints
├── chat/                # Chat interface
├── knowledge/           # Knowledge base UI
├── rag-search/          # RAG search interface
├── login/               # Authentication
├── health/              # Health checks
├── indexing/            # Indexing tools
└── phase89/             # Phase 89 tools
```

#### 🚧 Parked Routes (`src/routes_parked/`)
**Status:** 150+ directories - Need evaluation

**Categories:**
1. **Disabled by Convention** (suffix: `_disabled`)
   - `(admin)_disabled/`
   - `(ai)_disabled/`
   - `(auth)_disabled/`
   - `(demo)_disabled/`
   - `(legal)_disabled/`
   - `cases_disabled/`
   - `dashboard_disabled/`
   - `persons-of-interest_disabled/`
   - `terminal_disabled/`

2. **Archived** (prefix: `_archive-`, `_yorha_legacy`)
   - `_archive-command-center/`
   - `_archive-terminal/`
   - `_yorha_legacy/`

3. **Duplicates/Variants**
   - `legal-ai/` vs `legal-ai-suite/`
   - `chat-standalone/` vs `phase72-chat/`
   - `search-main/` vs `search-standalone/` vs `search.bak/`
   - `terminal.old/` vs `terminal_disabled/`
   - `yorha/` vs `yorha-detective/` vs `_yorha_legacy/`

4. **Test Routes**
   - `test/`, `test-case-notes/`, `test-grey-balance/`, `test-rag/`, `test-route-discovery/`
   - `ui-test/`, `upload-test/`, `simple-test/`, `simple-upload-test/`
   - `authenticated-crud-test/`

5. **Demos**
   - `demo/`, `demos/`, `field-demo/`, `icon-demo/`, `mcp-demo/`, `ner-dialog-demo/`
   - `nier-showcase/`, `phase-74/`, `phase72-demo/`, `rag-demo/`, `trt-llm-demo/`
   - `showcase-standalone/`, `agent-demo/`, `machines-integration-example/`

6. **Potential Core Features**
   - `evidence-board/` ⭐ (Could be Visual Evidence Board)
   - `evidence-editor/`
   - `evidenceboard/`
   - `investigation/`
   - `detective/`
   - `legal-report-compare/`
   - `interactive-canvas/` ⭐ (Potential board engine)
   - `memory-palace/` ⭐ (Knowledge visualization)
   - `graph-mode/` ⭐ (Graph visualization)

#### 🗑️ Quarantined Routes
```
quarantined-routes/
├── evidence-gallery/
├── evidence-organize/
├── legal-all/
├── legal-documents/
├── legal-research/
└── motive-analysis/
```

---

## 🎯 Migration Strategy

### Phase 1: Audit & Tag (Week 1)

**Use ripgrep to categorize routes:**

```powershell
# Find all routes with TODO/FIXME
rg --type svelte "TODO|FIXME" src/routes_parked/ --json > audit-todos.json

# Find routes with active imports
rg "import.*from.*\$lib" src/routes_parked/ --json > audit-imports.json

# Find routes with API calls
rg "fetch\(/api/" src/routes_parked/ --json > audit-api.json

# Find Svelte 5 runes usage
rg "\$state|\$derived|\$effect" src/routes_parked/ --json > audit-svelte5.json
```

**Create migration database:**
```sql
-- PostgreSQL table to track migration status
CREATE TABLE route_migration_audit (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    route_path TEXT NOT NULL,
    status TEXT NOT NULL, -- 'keep', 'migrate', 'delete', 'merge'
    category TEXT, -- 'core', 'demo', 'test', 'duplicate'
    priority INTEGER, -- 1 (high) to 5 (low)
    dependencies JSONB, -- { imports: [], apis: [], components: [] }
    notes TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW()
);
```

### Phase 2: Consolidate Visual Evidence Board (Week 2)

**Target:** Implement Fabric.js infinite canvas from architecture doc

**Routes to merge:**
- `routes_parked/evidence-board/`
- `routes_parked/evidenceboard/`
- `routes_parked/interactive-canvas/`
- `quarantined-routes/evidence-gallery/`
- `quarantined-routes/evidence-organize/`

**New structure:**
```
src/routes/
└── boards/
    ├── [boardId]/
    │   ├── +page.svelte         # Fabric.js canvas
    │   ├── +page.server.ts      # Load board snapshot
    │   └── +layout.svelte       # Board chrome
    ├── components/
    │   ├── Toolbar.svelte       # Bits-UI tools
    │   ├── Minimap.svelte
    │   ├── Inspector.svelte
    │   ├── CommandPalette.svelte
    │   └── ContextMenu.svelte
    └── +page.svelte             # Board list
```

**Implementation checklist:**
- [ ] Create `packages/board-core/` (headless engine)
- [ ] Create `packages/board-render-fabric/` (Fabric.js adapter)
- [ ] Create `packages/board-ui-svelte/` (Bits-UI components)
- [ ] Migrate PostgreSQL schema (boards, board_versions, board_ops)
- [ ] Implement Loki.js + IndexedDB offline-first
- [ ] Add Redis caching layer
- [ ] Create Drizzle ORM migrations

### Phase 3: Core Legal Features (Week 3)

**Routes to consolidate:**

#### Legal AI Suite
Merge: `legal-ai/`, `legal-ai-suite/`, `quarantined-routes/legal-all/`

Target:
```
src/routes/legal/
├── ai/                  # AI analysis
├── documents/           # Document viewer
├── research/            # Legal research
└── compare/             # Report comparison
```

#### Investigation Tools
Merge: `investigation/`, `detective/`, `yorha-detective/`

Target:
```
src/routes/investigate/
├── timeline/
├── persons/
└── evidence/
```

#### Memory & Knowledge
Merge: `memory-palace/`, `graph-mode/`, `brain/`, `knowledge/`

Target:
```
src/routes/knowledge/
├── graph/               # Neo4j visualization
├── search/              # RAG search
└── palace/              # Memory palace UI
```

### Phase 4: Clean Up (Week 4)

#### Delete Categories

**Demos (95% confidence):**
```bash
rm -rf src/routes_parked/{demo,demos,field-demo,icon-demo,mcp-demo}
rm -rf src/routes_parked/{nier-showcase,showcase-standalone,agent-demo}
rm -rf src/routes_parked/{phase-74,phase72-demo,rag-demo,trt-llm-demo}
```

**Tests (merge valuable tests to src/tests/):**
```bash
# Extract test code first
rg "describe\(|test\(|it\(" src/routes_parked/test* --json > tests-to-migrate.json

# Then delete
rm -rf src/routes_parked/{test,test-*,*-test}
```

**Disabled Routes:**
```bash
rm -rf src/routes_parked/*_disabled/
```

**Archives:**
```bash
rm -rf src/routes_parked/_archive-*
rm -rf src/routes_parked/_yorha_legacy
```

**Old/Backup:**
```bash
rm -rf src/routes_parked/*.old/
rm -rf src/routes_parked/*.bak/
```

#### Merge Duplicates

**Chat:**
```bash
# Keep: src/routes/chat/
# Migrate features from: chat-standalone/, phase72-chat/, aichat/
# Delete after merge
```

**Search:**
```bash
# Keep: src/routes/rag-search/
# Migrate features from: search-main/, search-standalone/, search.bak/
# Delete after merge
```

**YoRHa Theme:**
```bash
# Keep: Core theme in lib/
# Migrate: yorha/, yorha-detective/ → src/routes/investigate/
# Delete: _yorha_legacy/
```

---

## 🔧 Implementation TODOs

### High Priority (This Week)

- [ ] **Audit Script:** Create `scripts/audit-routes.mjs`
  ```javascript
  // Use ripgrep to scan all routes
  // Output: CSV report with recommendations
  ```

- [ ] **Migration Database:** Set up route_migration_audit table

- [ ] **Board Engine:** Start `packages/board-core/` implementation
  - [ ] Command system (undo/redo)
  - [ ] Selection state
  - [ ] Viewport management
  - [ ] Plugin architecture

- [ ] **Fabric Renderer:** Create `packages/board-render-fabric/`
  - [ ] FabricBoardRenderer class
  - [ ] FabricEventBridge
  - [ ] Custom object types (sticky notes, evidence cards)

### Medium Priority (Next Week)

- [ ] **Consolidate Legal Routes:**
  - [ ] Merge legal-ai + legal-ai-suite → routes/legal/ai/
  - [ ] Move legal-documents → routes/legal/documents/
  - [ ] Move legal-research → routes/legal/research/

- [ ] **Knowledge Graph:**
  - [ ] Merge graph-mode + brain → routes/knowledge/graph/
  - [ ] Implement Neo4j visualization
  - [ ] Add Cypher query interface

- [ ] **Memory Palace:**
  - [ ] Design 3D spatial UI (Three.js or Babylon.js)
  - [ ] Implement method of loci algorithm
  - [ ] Link to case evidence

### Low Priority (Later)

- [ ] **Extract Demos to Separate Repo:**
  - [ ] Create `deeds-demos` repository
  - [ ] Move showcase/demo routes
  - [ ] Keep as documentation/examples

- [ ] **Test Suite Migration:**
  - [ ] Move Playwright tests to src/tests/
  - [ ] Delete redundant test routes
  - [ ] Set up CI/CD pipeline

---

## 📐 Architectural Decisions

### Why Keep Ripgrep/Awk?

**Use Cases:**
1. **Backend Pattern Search** (Python) - `pattern_search_service.py`
   - Find function calls, imports, variable usage
   - Cache results in PostgreSQL
   - Fast symbol search (50ms vs 5s with AST parsing)

2. **Frontend Scripts** (Node.js) - Multiple tools
   - Semantic caching (ripgrep-semantic-cache.mjs)
   - Knowledge discovery (discover-knowledge-bases.mjs)
   - MCP server tools (fastmcp-server.mjs)

3. **CLI Tools** (PowerShell) - `search-with-rg.ps1`
   - Developer productivity
   - Git hook integration

**Not Used In:**
- Client-side (browser) - Use Fuse.js instead
- SSR routes - PostgreSQL full-text search
- Real-time search - Redis + Qdrant

### Package Architecture

```
packages/
├── board-core/              # Headless board engine
│   ├── package.json
│   ├── src/
│   │   ├── models/          # BoardState, BoardNode, etc.
│   │   ├── commands/        # Command pattern
│   │   ├── history/         # Undo/redo
│   │   ├── selection/       # Selection manager
│   │   └── plugins/         # Plugin system
│   └── tsconfig.json
│
├── board-render-fabric/     # Fabric.js renderer
│   ├── package.json
│   ├── src/
│   │   ├── FabricRenderer.ts
│   │   ├── FabricEventBridge.ts
│   │   └── objects/         # Custom Fabric objects
│   └── tsconfig.json
│
└── board-ui-svelte/         # Svelte components
    ├── package.json
    ├── src/
    │   ├── Toolbar.svelte
    │   ├── Minimap.svelte
    │   ├── Inspector.svelte
    │   ├── CommandPalette.svelte
    │   └── ContextMenu.svelte
    └── tsconfig.json
```

**Monorepo Setup:**
```json
// package.json
{
  "workspaces": [
    "packages/*",
    "apps/*"
  ],
  "devDependencies": {
    "turbo": "^1.11.0"
  }
}
```

### Database Schema

```sql
-- Legal AI database (existing: legal_ai_db)
-- Add new tables for Visual Evidence Board

-- ====================================
-- Boards
-- ====================================
CREATE TABLE boards (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    case_id UUID NOT NULL REFERENCES cases(id),
    title TEXT NOT NULL,
    description TEXT,
    version INTEGER NOT NULL DEFAULT 1,
    snapshot JSONB NOT NULL, -- BoardSnapshot type
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    created_by UUID REFERENCES users(id),
    updated_by UUID REFERENCES users(id)
);

CREATE INDEX idx_boards_case_id ON boards(case_id);
CREATE INDEX idx_boards_updated_at ON boards(updated_at DESC);

-- ====================================
-- Board Versions (Snapshots)
-- ====================================
CREATE TABLE board_versions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    board_id UUID NOT NULL REFERENCES boards(id) ON DELETE CASCADE,
    version INTEGER NOT NULL,
    snapshot JSONB NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    created_by UUID REFERENCES users(id),

    UNIQUE(board_id, version)
);

CREATE INDEX idx_board_versions_board_id ON board_versions(board_id, version DESC);

-- ====================================
-- Board Operations (Op-Log for Collaboration)
-- ====================================
CREATE TABLE board_ops (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    board_id UUID NOT NULL REFERENCES boards(id) ON DELETE CASCADE,
    version INTEGER NOT NULL,
    op_type TEXT NOT NULL, -- 'add_node', 'move_node', 'delete_node', etc.
    op_data JSONB NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    created_by UUID REFERENCES users(id)
);

CREATE INDEX idx_board_ops_board_id ON board_ops(board_id, version);
CREATE INDEX idx_board_ops_created_at ON board_ops(created_at);

-- ====================================
-- Route Migration Audit
-- ====================================
CREATE TABLE route_migration_audit (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    route_path TEXT NOT NULL UNIQUE,
    status TEXT NOT NULL CHECK (status IN ('keep', 'migrate', 'delete', 'merge')),
    category TEXT CHECK (category IN ('core', 'demo', 'test', 'duplicate', 'unknown')),
    priority INTEGER CHECK (priority BETWEEN 1 AND 5),
    dependencies JSONB, -- { imports: [], apis: [], components: [] }
    notes TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_route_migration_status ON route_migration_audit(status);
CREATE INDEX idx_route_migration_priority ON route_migration_audit(priority);
```

**Drizzle Schema:**
```typescript
// lib/server/db/schema/boards.ts
import { pgTable, uuid, text, integer, jsonb, timestamp } from 'drizzle-orm/pg-core';
import { cases } from './cases';
import { users } from './users';

export const boards = pgTable('boards', {
    id: uuid('id').primaryKey().defaultRandom(),
    caseId: uuid('case_id').notNull().references(() => cases.id),
    title: text('title').notNull(),
    description: text('description'),
    version: integer('version').notNull().default(1),
    snapshot: jsonb('snapshot').$type<BoardSnapshot>().notNull(),
    createdAt: timestamp('created_at').notNull().defaultNow(),
    updatedAt: timestamp('updated_at').notNull().defaultNow(),
    createdBy: uuid('created_by').references(() => users.id),
    updatedBy: uuid('updated_by').references(() => users.id)
});

export const boardVersions = pgTable('board_versions', {
    id: uuid('id').primaryKey().defaultRandom(),
    boardId: uuid('board_id').notNull().references(() => boards.id, { onDelete: 'cascade' }),
    version: integer('version').notNull(),
    snapshot: jsonb('snapshot').$type<BoardSnapshot>().notNull(),
    createdAt: timestamp('created_at').notNull().defaultNow(),
    createdBy: uuid('created_by').references(() => users.id)
});

export const boardOps = pgTable('board_ops', {
    id: uuid('id').primaryKey().defaultRandom(),
    boardId: uuid('board_id').notNull().references(() => boards.id, { onDelete: 'cascade' }),
    version: integer('version').notNull(),
    opType: text('op_type').notNull(),
    opData: jsonb('op_data').$type<BoardOperation>().notNull(),
    createdAt: timestamp('created_at').notNull().defaultNow(),
    createdBy: uuid('created_by').references(() => users.id)
});

// Types
export type BoardSnapshot = {
    version: number;
    viewport: { x: number; y: number; zoom: number };
    nodes: Array<BoardNode>;
    edges: Array<ConnectorEdge>;
    frames: Array<Frame>;
    meta: { updatedBy: string; updatedAt: string };
};
```

---

## 🚀 Next Steps

### Immediate Actions (Today)

1. **Create Audit Script:**
   ```bash
   cd sveltekit-frontend
   node scripts/create-route-audit.mjs
   ```

2. **Run Initial Scan:**
   ```powershell
   # Find all routes with imports
   rg "import.*from.*\$lib" src/routes_parked/ --json > audit-imports.json

   # Find Svelte 5 usage
   rg "\$state|\$derived|\$effect" src/routes_parked/ --json > audit-svelte5.json

   # Find API calls
   rg "fetch\(/api/" src/routes_parked/ --json > audit-api.json
   ```

3. **Set Up Migration Database:**
   ```bash
   npx drizzle-kit generate:pg --schema=lib/server/db/schema/boards.ts
   npx drizzle-kit push:pg
   ```

### This Week

1. **Audit Report:** Generate comprehensive CSV of all routes
2. **Board Core:** Start implementing headless board engine
3. **Delete Phase 1:** Remove obvious duplicates and archives

### Next Week

1. **Board UI:** Implement Fabric.js renderer + Bits-UI components
2. **Legal Routes:** Consolidate legal-ai routes
3. **Knowledge Graph:** Start Neo4j integration

---

## 📝 Notes

### Ripgrep Best Practices

**Performance Tips:**
```javascript
// Use --max-count to limit results
const rg = spawn('rg', ['--max-count', '100', pattern]);

// Use --type filters
const rg = spawn('rg', ['--type', 'svelte', pattern]);

// Use --json for structured output
const rg = spawn('rg', ['--json', pattern]);

// Cache results in Redis
const cacheKey = `ripgrep:${pattern}:${fileGlob}`;
await redis.setex(cacheKey, 300, JSON.stringify(results));
```

**Error Handling:**
```javascript
rg.on('close', (code) => {
    // Exit code 0 = matches found
    // Exit code 1 = no matches (not an error!)
    // Exit code 2+ = actual error
    if (code === 0 || code === 1) {
        resolve(matches);
    } else {
        reject(new Error(`ripgrep failed with code ${code}`));
    }
});
```

### Svelte 5 Migration Status

**Runes Found:**
- 50+ uses of `$state`
- 30+ uses of `$derived`
- 20+ uses of `$effect`

**Legacy Patterns (still in parked routes):**
- `export let` (needs migration to `$props()`)
- `$:` reactive statements (needs migration to `$derived`)
- `new Component()` (needs migration to `mount()`)

---

## ✅ Success Metrics

### Week 1 Goals
- [ ] 100% route audit complete
- [ ] Migration database populated
- [ ] Deleted 50+ obsolete routes

### Week 2 Goals
- [ ] Board engine POC functional
- [ ] Fabric.js rendering working
- [ ] First board saved to Postgres

### Week 3 Goals
- [ ] Legal routes consolidated
- [ ] Knowledge graph integrated
- [ ] Reduced routes_parked by 75%

### Week 4 Goals
- [ ] Zero routes in routes_parked
- [ ] All core features migrated
- [ ] Documentation complete

---

**Status:** Draft - Ready for Implementation
**Next Review:** February 11, 2026
