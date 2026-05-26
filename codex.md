# Codex Bridge Notes

Use this repo as a Postgres-first Engram stack.

Canonical lanes:
- Postgres + pgvector: durable memory truth
- Qdrant: semantic recall and tagging
- Redis: hot memory and cache keys
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
