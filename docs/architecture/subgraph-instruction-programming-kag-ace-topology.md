# Subgraph Instruction Programming + KAG/ACE Topology

## Overview
This architecture defines an SSR-first hybrid MPA where SvelteKit 2 is the page and API gateway, Svelte 5 runes power local component reactivity, TypeScript is the implementation language, Bits UI and Superforms v2/Zod handle interaction and validation, Drizzle ORM/Postgres stores durable truth, WebGPU accelerates local visualization and compute paths, and Redis, Qdrant, Neo4j, CouchDB, and gRPC sidecars provide retrieval, graph, cache, and worker capabilities.

## System Boundary
- SvelteKit owns browser-facing rendering, route boundaries, server actions, and API orchestration.
- All durable state changes flow through Postgres via Drizzle.
- All heavy compute and specialized processing live behind internal sidecars.
- Retrieval and graph stores are supporting systems, not the source of truth.
- The UI is hybrid MPA, not a pure SPA: pages are server-rendered first, with client navigation used only where it adds value.

## Rendering, Language, and State Model

This application is a **SvelteKit SSR-first hybrid MPA with Svelte 5 runes for local component reactivity**.

SvelteKit owns:

- browser-facing route boundaries
- server-rendered pages
- `+page.server.ts` data loading
- form actions
- API routes
- streaming/SSE endpoints
- invalidation and refresh boundaries

Svelte 5 runes are used for local component reactivity only:

- `$state` for local mutable UI state
- `$derived` for local computed values
- `$effect` for browser-side effects
- `$props` for component props

Do not describe this as a global rune-syncing architecture. State synchronization should flow through SvelteKit server loads, actions, fetches, SSE, and explicit invalidation, not through a client-only sync layer.

TypeScript is the implementation language across routes, server modules, workers, shared utilities, and tests.

Use:

- **Bits UI v2** for accessible headless UI primitives
- **Superforms v2 + Zod** for form state, validation, file uploads, and progressive enhancement
- **Drizzle ORM + Postgres** for durable truth
- **Redis** for hot ACE/BitFrost context packets
- **Qdrant** for dense/hybrid semantic retrieval
- **Neo4j** for KAG/DAG graph paths and topology traversal
- **CouchDB** for stitched wiki and MapReduce rollups
- **WebGPU** only for browser-side visualization or local compute paths where it is clearly warranted
- **gRPC/Protobuf** only for internal sidecars, not browser-facing UI
- **MCP** as the model-facing safe tool boundary

Use SPA-like behavior only where the interaction is inherently live or incremental:

- chat streaming
- timeline scrubbers
- video/frame viewers
- workflow progress panels
- dashboard live-refresh widgets
- graph visualizations

Do not turn the full app into a single client shell.

## Presentation Layer
- Use Svelte 5 runes for local component state, derived state, and side effects.
- Do not build a global client sync layer; sync state through SvelteKit loads, actions, and fetches.
- Use Bits UI for accessible primitives such as dialogs, tabs, selects, tooltips, command inputs, progress, and scroll areas.
- Keep browser logic minimal and push business rules into server modules.

## Language and UI Stack
- Use TypeScript across routes, server modules, and shared utilities.
- Use Superforms v2 with Zod for all form validation and submit workflows.
- Use Drizzle ORM as the typed database layer over Postgres.
- Use WebGPU only where GPU-accelerated browser-side rendering or compute is warranted.
- Keep these tools aligned with SvelteKit's server/client boundary rather than treating them as a standalone app framework.

## Form and Validation Layer
- Use Superforms v2 for form state, submit behavior, file uploads, and progressive enhancement.
- Use Zod as the validation contract at the server boundary.
- Validate all request payloads before persistence or side effects.

## Truth Layer
- Use Drizzle/Postgres for authoritative records, workflow state, and auditability.
- Keep schema changes migration-driven.
- Model derived retrieval artifacts separately from canonical application state.

## Retrieval and Graph Layer
- Redis handles short-lived cache, coordination, and hot read paths.
- Qdrant stores embeddings and vector search candidates.
- Neo4j handles relationship traversal, topology expansion, and multi-hop graph reasoning.
- CouchDB stores document-shaped ACE artifacts and flexible envelopes where versioned structure is useful.

## Feature Map Context
These are the contextual chunks to keep aligned with codebase indexing and GraphRAG-style verification:
- `src/routes/(app)/codebase-graph/+page.svelte` and `src/routes/(app)/code-intel/+page.svelte` for the user-facing code intelligence surfaces.
- `src/lib/server/ace/context-assembler.ts` and `src/lib/server/ace/retrieval-lanes.ts` for the ACE orchestration spine.
- `src/lib/server/ace/graph-expander.ts` for import-graph expansion and compact neighborhood context.
- `src/lib/server/retrieval/graph-context.ts`, `src/lib/server/retrieval/manifold4-search.ts`, and `src/lib/server/graph/community-graph.ts` for graph-backed retrieval.
- `src/routes/api/codebase-index/deep-research/+server.ts`, `src/routes/api/vector-search/+server.ts`, `src/routes/api/search/+server.ts`, and `src/routes/api/topology/+server.ts` for exposed retrieval and topology entry points.
- `src/lib/server/db/schema/features.ts` and `src/lib/server/db/schema/metadata-spine.ts` for persisted feature and retrieval metadata.

## Subgraph Rendering Rules

Each subgraph instruction should carry explicit rendering metadata so agents can distinguish local UI reactivity from synchronization boundaries.

```ts
renderingModel: 'ssr_hybrid_mpa';
reactivityModel: 'svelte5_runes_local';
syncBoundary: 'sveltekit_load_actions_fetch_sse';
```

Example:

```json
{
  "key": "ui.evidence_upload",
  "renderingModel": "ssr_hybrid_mpa",
  "reactivityModel": "svelte5_runes_local",
  "syncBoundary": "sveltekit_load_actions_fetch_sse",
  "blockedPatterns": [
    "global rune syncing",
    "client-only evidence mutation",
    "browser-direct database writes",
    "browser state as source of truth",
    "Gemma4 direct DB mutation",
    "ungated patch application"
  ]
}
```

## Sidecar Layer
- gRPC is the internal contract for workers and compute services.
- Sidecars handle embedding generation, TurboVec work, media processing, and other CPU/GPU-intensive tasks.
- SvelteKit calls sidecars indirectly; the browser never talks to them directly.

## Core Workflows
1. A user interacts with a SvelteKit page or action.
2. Input is validated with Superforms v2 and Zod.
3. SvelteKit writes or reads durable state through Drizzle/Postgres.
4. Retrieval requests may consult Redis, Qdrant, Neo4j, or CouchDB.
5. Heavy computation is delegated to internal gRPC sidecars.
6. Results are returned through SvelteKit as the presentation boundary.

## Data Roles
- Postgres: source of truth.
- Redis: cache and ephemeral coordination.
- Qdrant: vector retrieval.
- Neo4j: graph structure and traversal.
- CouchDB: flexible document memory.
- Sidecars: compute and media execution.

## Non-Goals
- Do not make the browser a state authority.
- Do not use gRPC as the public browser protocol.
- Do not treat vector or graph stores as canonical data stores.
- Do not duplicate validation logic outside the server contract.

## Implementation Guidance
- Prefer small server modules under `src/lib/server/` for DB and worker orchestration.
- Keep API routes thin and explicit.
- Treat retrieval artifacts as derived outputs that can be rebuilt.
- Add smoke coverage for UI, API, retrieval, and sidecar paths before expanding surface area.
- During verification, cross-check the feature map above against the latest codebase indexing output so the spec stays synchronized with reality.

## Verification Criteria

The architecture is correct when:

- `+page.server.ts` loads durable page data.
- `+page.svelte` uses runes for local UI state.
- Form actions or `+server.ts` perform mutations.
- Superforms v2 and Zod validate form data.
- Drizzle ORM writes durable state to Postgres.
- Redis caches hot ACE/BitFrost packets.
- Qdrant and Neo4j retrieve semantic and graph context.
- CouchDB stores stitched wiki/context pages.
- WebGPU is limited to visualization or bounded browser compute.
- gRPC sidecars are called from the server, never directly from the browser.
- Gemma4 receives compact ACE/KAG packets.
- UI updates through `invalidate()`, polling, SSE, or explicit fetches.

The architecture is wrong when:

- browser state becomes the source of truth.
- runes are used as global app sync.
- Gemma4 directly mutates DB/search stores.
- components bypass server actions for durable writes.
- agent patches are applied without operator approval.

Final wording: `SvelteKit SSR-first hybrid MPA with Svelte 5 runes for local component reactivity.`

## Companion Artifact
- Implementation TODO: `docs/design/subgraph-instruction-programming-kag-ace-topology-todo.md`
