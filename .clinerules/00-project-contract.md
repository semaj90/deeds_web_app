# Atlas universal contract

- PostgreSQL is canonical truth. Repair canonical data before derived mirrors.
- Search for existing ownership before editing: `rg "<symbol>" src/ --type ts`
- Make the smallest patch that satisfies the active specification.
- Run a focused validation command before reporting completion.
- Do not create a parallel authority alongside an existing module.

## Canonical write order (never skip, never reorder)
1. Validate structure — CPU only (no GPU for JSON/CRUD/joins)
2. Write to Postgres (`atlas_packets`, `codebase_chunk_index`)
3. Invalidate Redis keys after Postgres succeeds
4. Emit async events (RabbitMQ / EventEmitter)
5. Projection worker mirrors to Qdrant / TurboVec / bifrost cache

## Identity chain
`directory_path → source_ref → feature_id → feature_label → packet_key`
Always join on `packet_key + source_ref`. Never join on `feature_id` alone.

## Forbidden
- Writing to Qdrant/Redis before Postgres succeeds
- `stream: false` on llama-server :8090 (thinking block exhausts max_tokens)
- `feature_id`-only joins
- Svelte 4 patterns (`export let`, `$:`, `on:click`, `<slot>`)
- Lowercasing unresolved feature candidates into fake feature IDs
