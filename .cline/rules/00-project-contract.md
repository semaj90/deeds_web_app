# Project Contract

## Stack
- SvelteKit 2 / Svelte 5 runes / TypeScript (strict)
- PostgreSQL 18 + Drizzle ORM — canonical truth
- Qdrant, Neo4j, Redis/Valkey — derived mirrors, rebuildable from Postgres
- UnoCSS (svelte-scoped), Bits UI v2, Superforms v2 + Zod

## Canonical write order (never skip)
1. Validate structure (CPU only — no GPU for JSON/CRUD)
2. Write to Postgres (`atlas_packets`, `codebase_chunk_index`)
3. Invalidate Redis keys after Postgres succeeds
4. Emit async events (RabbitMQ / EventEmitter)
5. Projection worker mirrors to Qdrant / TurboVec / BitFrost

## Identity chain
`directory_path → source_ref → feature_id → feature_label → packet_key`
Join by `packet_key` + `source_ref`. Never join on `feature_id` alone.

## Forbidden
- Direct Qdrant/Redis writes before Postgres
- `stream: false` on llama-server :8090 (thinking block exhausts max_tokens)
- `feature_id`-only joins
- Svelte 4 patterns (`export let`, `$:`, `on:click`, `<slot>`)

## Before touching any file
1. `rg` for existing implementations
2. Read the relevant file section (line range, not whole file)
3. State the smallest patch
