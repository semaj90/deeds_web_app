# Subgraph Instruction Programming + KAG/ACE Topology TODO

## Goal
Implement the stack as an end-to-end system where SvelteKit 2 is the SSR and API gateway, Svelte 5 runes plus Bits UI and Superforms/Zod handle UI and forms, Drizzle/Postgres is the source of truth, Redis/Qdrant/Neo4j/CouchDB support ACE/KAG retrieval and graph state, and sidecars handle gRPC, TurboVec, and media work.

## Scope
- SvelteKit 2 as the single browser-facing entry point and server boundary.
- Svelte 5 runes for component state and interaction.
- Bits UI for accessible primitives.
- Superforms v2 plus Zod for validation, uploads, and form actions.
- Drizzle plus Postgres for durable relational truth.
- Redis, Qdrant, Neo4j, and CouchDB for cache, vector search, graph traversal, and document graph memory.
- gRPC sidecars for embedding, vector, media, and other CPU/GPU workers.

## Implementation TODO

### 1. Frontend gateway
- Keep SvelteKit as the SSR shell, route layer, and API gateway.
- Use server-only modules for secrets, DB access, and internal service calls.
- Keep browser code thin and push business logic into `+server.ts` and shared server modules.

### 2. UI and forms
- Build all interactive UI with Svelte 5 runes.
- Use Bits UI for dialogs, tabs, selects, command palettes, tooltips, progress, and scroll areas.
- Use Superforms v2 with Zod for every user-editable form, upload flow, and server action.

### 3. Source of truth
- Model durable application state in Drizzle/Postgres first.
- Treat Redis, Qdrant, Neo4j, and CouchDB as derived or supporting stores, not authoritative truth.
- Keep schema changes explicit and migration-driven.

### 4. ACE / KAG layers
- Store retrieval-ready embeddings in Qdrant.
- Use Neo4j for graph navigation, relationship expansion, and topology queries.
- Use CouchDB for document-shaped or versioned ACE artifacts where flexible envelopes help.
- Use Redis for hot cache, session-adjacent state, and task coordination.

### 5. Sidecar boundary
- Keep gRPC internal to worker processes and sidecars.
- Use sidecars for TurboVec, media processing, embedding generation, and other heavy compute paths.
- Expose only SvelteKit-facing HTTP endpoints and internal service contracts needed by the app.

### 6. Data and fine-tuning
- Log instruction-programming interactions, retrieval traces, and accepted outputs as training material.
- Build a curated dataset from successful subgraph instructions, KAG hits, ACE traces, and human corrections.
- Separate raw operational logs from sanitized training samples.

### 7. Validation
- Add one smoke path for UI, one for API, one for retrieval, and one for worker sidecars.
- Verify form validation, SSR behavior, and internal service routing before expanding scope.

## Suggested Deliverables
- `src/routes/*` SSR pages and server actions.
- `src/lib/server/*` service modules for DB, retrieval, and worker orchestration.
- `drizzle/` migrations for all truth-bearing tables.
- Sidecar contracts for gRPC worker interfaces.
- A sanitized dataset export for future tuning.

## Notes
- This is an implementation TODO, not a final architecture spec.
- If the plan changes, update this document before changing code.
