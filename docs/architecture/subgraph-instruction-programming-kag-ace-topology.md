# Subgraph Instruction Programming + KAG/ACE Topology

## Overview
This architecture defines an end-to-end legal AI platform in which SvelteKit 2 is the SSR and API gateway, Svelte 5 runes power the UI layer, Bits UI and Superforms/Zod handle interaction and validation, Drizzle/Postgres stores durable truth, and Redis, Qdrant, Neo4j, CouchDB, and gRPC sidecars provide retrieval, graph, cache, and worker capabilities.

## System Boundary
- SvelteKit owns browser-facing rendering, route boundaries, server actions, and API orchestration.
- All durable state changes flow through Postgres via Drizzle.
- All heavy compute and specialized processing live behind internal sidecars.
- Retrieval and graph stores are supporting systems, not the source of truth.

## Presentation Layer
- Use Svelte 5 runes for component state, derived state, and side effects.
- Use Bits UI for accessible primitives such as dialogs, tabs, selects, tooltips, command inputs, progress, and scroll areas.
- Keep browser logic minimal and push business rules into server modules.

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

## Companion Artifact
- Implementation TODO: `docs/design/subgraph-instruction-programming-kag-ace-topology-todo.md`
