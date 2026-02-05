# Production Analysis & Consolidation Plan

## current State Analysis
The application has a sprawling structure with numerous experimental, testing, and phase-specific directories in both `src/routes` and `src/lib`.

### Routes Analysis (`src/routes`)

| Directory | Status | Recommendation |
|-----------|--------|----------------|
| `(app)` | **Core** | Keep. Ensure all main features (cases, evidence, etc.) are routed here. |
| `api` | **Core** | Keep. Primary backend API. |
| `login` | **Core** | Keep. Authentication entry point. |
| `health` | **Core** | Keep. System monitoring. |
| `acp` | *Tooling* | Keep as Developer Tool / Admin feature (Agent Command Protocol). |
| `admin` | *Feature* | Keep, possibly merge into `(app)/admin` if using layout. |
| `chat` | *Feature* | Merge into `(app)/chat` or keep if standalone. |
| `couchdb-analytics` | *feature* | Consolidate into `(app)/analytics`. |
| `demo` | *Experimental* | Move to `src/routes/(dev)/demo` or remove in prod. |
| `indexing` | *Utility* | Move to `(app)/admin/indexing` or `api/admin/indexing`. |
| `knowledge` | *Feature* | Consolidate into `(app)/knowledge`. |
| `odin` | *Experimental* | "Project Odin" - Evaluate for integration or archive. |
| `phase89` | *Experimental* | Archive or merge relevant features. |
| `rag-search` | *Feature* | Consolidate into `(app)/search`. |
| `test*` | *Test* | Move to `src/routes/(dev)/test` or delete. |
| `verify-drizzle` | *Utility* | Move to `src/routes/(dev)/verify`. |

### Lib Analysis (`src/lib`)

The `src/lib` directory is highly fragmented.

**Proposed Core Structure:**
- `src/lib/components/`: Shared UI components (Bits UI, atomic elements).
- `src/lib/server/`: Backend logic, DB clients, Auth.
- `src/lib/stores/`: Global state (Svelte 5 runes/stores).
- `src/lib/types/`: Shared TypeScript interfaces.
- `src/lib/utils/`: Shared helper functions.
- `src/lib/features/`: Feature-specific logic (replacing top-level folders like `ai`, `analysis`, `cases`, `search`).

**Consolidation Targets:**
- `ai`, `analysis`, `demos`, `machines`, `maps`, `memory`, `models`, `rag-search` -> `src/lib/features/ai` or similar.
- `db`, `drizzle` -> `src/lib/server/db`.
- `auth`, `security` -> `src/lib/server/auth`.
- `wasm`, `webgpu`, `workers` -> `src/lib/core/compute` or `src/lib/features/compute`.

## Production Roadmap

1.  **Establish Core Layout**: Ensure `src/routes/(app)` handles the main authenticated user flow with the `+layout.svelte` we verified.
2.  **Consolidate Routes**: Move standalone feature routes (`chat`, `knowledge`) into `(app)` to reuse the storage/sidebar context.
3.  **Clean `src/lib`**: Group scattered feature folders into a cohesive structure.
4.  **Archive Experimental**: Create a `_archive` or `_experimental` folder for `odin`, `phase89`, etc., to clear the active workspace without deleting code yet.

## Immediate Action Items

1.  Create `src/routes/(dev)` group for tests and demos.
2.  Move `test*`, `demo`, `verify-drizzle` into `(dev)`.
3.  Verify `(app)` routing covers `active cases`, `evidence`, `analysis`.
4.  Standardize imports after moving files.
