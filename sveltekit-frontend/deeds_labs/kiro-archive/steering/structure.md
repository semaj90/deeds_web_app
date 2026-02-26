# Project Structure

## Root Organization

```
legal-ai-platform/
├── sveltekit-frontend/          # Main SvelteKit application
├── backend/                     # Backend services and APIs
├── src/                         # Shared source code
├── docker-compose.yml           # Full stack orchestration
├── package.json                 # Frontend dependencies
├── tsconfig.json                # TypeScript configuration
├── svelte.config.cjs            # SvelteKit configuration
└── .kiro/                       # Kiro IDE configuration
```

## Frontend Structure (`sveltekit-frontend/src/`)

```
src/
├── routes/                      # SvelteKit page routes
│   ├── (app)/                   # Authenticated app routes
│   ├── admin/                   # Admin dashboard
│   ├── dashboard/               # Case dashboard
│   └── +page.svelte             # Root page
├── lib/
│   ├── components/              # Reusable Svelte components
│   │   ├── evidence/            # Evidence board components
│   │   ├── ui/                  # UI primitives (buttons, inputs, etc.)
│   │   ├── admin/               # Admin-specific components
│   │   └── ...
│   ├── stores/                  # Svelte stores (state management)
│   ├── services/                # API client services
│   ├── types/                   # TypeScript type definitions
│   └── utils/                   # Utility functions
├── styles/                      # Global CSS and theme
├── wasm/                        # WebAssembly modules (vector ops)
├── workers/                     # Web Workers
├── proto/                       # Generated protobuf files
├── app.html                     # HTML entry point
├── app.d.ts                     # App type definitions
├── hooks.client.ts              # Client-side hooks
├── hooks.server.ts              # Server-side hooks
└── service-worker.ts            # Service worker
```

## Backend Structure (`backend/`)

```
backend/
├── api/                         # REST API endpoints
├── services/                    # Business logic services
│   ├── gemma_service.py         # Gemma model inference
│   ├── search_service.py        # Vector search service
│   ├── reranker_service.py      # Reranking service
│   └── ...
├── go_quic/                     # Go QUIC gateway service
├── gemma_reranker/              # Go gRPC reranker
├── graph_authority/             # Neo4j authority service
├── ocr_pipeline/                # OCR processing pipeline
├── evidence-pipeline/           # Evidence ingestion pipeline
├── migrations/                  # Database migrations
├── proto/                       # Protocol buffer definitions
├── sql/                         # SQL schemas and queries
├── utils/                       # Utility functions
├── workers/                     # Background job workers
├── requirements.txt             # Python dependencies
└── Dockerfile*                  # Service-specific Dockerfiles
```

## Key Directories

### Components (`sveltekit-frontend/src/lib/components/`)
- **evidence/**: EvidenceBoard, EvidenceNode, EvidenceConnections, RelationshipInspector
- **ui/**: Button, Input, Select, Modal, Card (Bits UI based)
- **admin/**: TagSelector, AuditLog, UserManagement
- **layout/**: Navigation, Sidebar, Header

### Stores (`sveltekit-frontend/src/lib/stores/`)
- Case state management
- Evidence data store
- Search results cache
- User session store
- UI state (modals, filters)

### Services (`sveltekit-frontend/src/lib/services/`)
- API client for backend endpoints
- Vector search client
- Evidence management service
- Authentication service

### Types (`sveltekit-frontend/src/lib/types/`)
- Evidence types
- Case types
- Search query types
- API response types

## Configuration Files

### Frontend
- **tsconfig.json**: TypeScript compiler options
- **svelte.config.cjs**: SvelteKit adapter and preprocessing
- **vite.config.ts**: Vite build configuration
- **.prettierrc**: Code formatting (2 spaces, 100 char width)
- **.eslintrc.minimal.cjs**: Linting rules
- **package.json**: Dependencies and scripts

### Backend
- **docker-compose.yml**: Service orchestration
- **Dockerfile**: Container images for services
- **requirements.txt**: Python dependencies
- **go.mod/go.sum**: Go dependencies
- **.env.example**: Environment variable template

## Database Schema
- **database_schema.sql**: PostgreSQL schema with pgvector
- **migrations/**: Incremental schema changes
- Tables: cases, evidence, connections, users, audit_logs, vectors

## Static Assets
- **static/**: Public files (favicon, fonts, WASM modules)
- **static/wasm/**: Compiled WebAssembly modules
- **static/fonts/**: Custom fonts (Inter, JetBrains Mono)

## Build Artifacts
- **build/**: SvelteKit build output
- **.svelte-kit/**: SvelteKit generated files
- **dist/**: Production build output
- **node_modules/**: Installed dependencies

## Important Patterns

### Route Organization
- Routes use SvelteKit's file-based routing
- `+page.svelte` = page component
- `+layout.svelte` = layout wrapper
- `+server.ts` = API endpoint
- `(group)` = route grouping without URL segment

### Component Structure
- Single-file Svelte components with `<script>`, `<style>`, markup
- TypeScript for type safety
- Svelte 5 runes for reactivity (`$state`, `$derived`, `$effect`)
- Props via `let { prop } = $props()`

### State Management
- Svelte stores for global state
- `writable()` for mutable stores
- `derived()` for computed values
- `readable()` for read-only stores

### API Communication
- Fetch-based API client
- Type-safe request/response handling
- Error handling with try/catch
- Loading states managed in stores
