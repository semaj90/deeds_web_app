# Codex Bridge Notes

Use this repo as a Postgres-first Engram stack.

Canonical lanes:
- Postgres + pgvector: durable memory truth
- Qdrant: semantic recall and tagging
- Redis: hot memory and cache keys
- SeaweedFS: canonical object storage via the S3 gateway
- ACE / NES: context cards and prompt injection
- TurboVec / Karpathy / SOM: quantization, clustering, and routing hints

OpenCode / Claude-Mem:
- treat as an observation source only
- do not make SQLite canonical
- do not duplicate memory backends
- mirror sanitized observations into `POST /api/memory/claude-mem`

Helper:
- `node scripts/opencode/post-memory.mjs --file <observation.json>`
- `npm run opencode:post-memory -- --file <observation.json>`

Audit and safety:
- see `docs/architecture/opencode-claude-mem-bridge.md`
- see `docs/operations/stack-audit-playbook.md`
- port checks: `5173`, `37777`, `8788`, `8791`, `8792`, `8793`

If a feature exists in another lane, carry the logic forward only if it maps cleanly to this stack and does not break canonical feature IDs, labels, or storage ownership.

Recent Parent Atlas findings:
- `packet_id` stays the canonical UUID identity.
- `packet_ulid` is now the sortable workflow/order field for packet lineage.
- `packet_key` remains the deterministic duplicate/content guard.
- `title_id` is a derived semantic grouping key, not an identity key.
- `canonical_source_ref` is now populated across the packet ledger to keep source provenance aligned.
- The current backfill left one malformed legacy packet row needing source-side repair rather than generic lineage repair.
- `0.0.0.0:8080` is not a valid browser target; Bitfrost is exposed on host `127.0.0.1:3040` and the container listens on `8080`, so use the host URL for browser checks.

Env discovery rule:
- `.env` and `.env.local` stay gitignored; do not relax ignore rules for real secret files.
- Plain content search against the target env paths works for the main repo and `sveltekit-frontend` env files, even though Git still ignores them.
- For file discovery, use `rg --files -g ".env*"` rather than plain `rg --files`.
- If a path falls outside the usual target files, use an explicit override such as `rg -n --hidden --no-ignore "DATABASE_URL|REDIS_URL|TRACE_MCP_URL" .env .env.local sveltekit-frontend/.env sveltekit-frontend/.env.local`.
- For repeatable presence-only audits, use `npm run env:audit` or pass a custom key set such as `npm run env:audit -- --keys DATABASE_URL,POSTGRES_URL,REDIS_URL,VALKEY_URL,QDRANT_URL,NEO4J_URI,TRACE_MCP_URL`.
- Prefer `.env` as the primary source and `.env.local` as the local override when tracing runtime configuration.

Object storage rule:
- SeaweedFS is the canonical object store. Do not add new MinIO-first architecture, docs, or feature names.
- Legacy names such as `minio_key`, `MINIO_*`, or `minio-client.ts` may remain only where the live schema or compatibility layer still requires them.
- New ingestion paths should describe and generate SeaweedFS or generic S3 object keys, while preserving legacy column names until a deliberate schema rename lands.
