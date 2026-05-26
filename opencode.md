# OpenCode Bridge Notes

Launch scope matters:
- repo root for atlas, memory, and repo-wide audit work
- `sveltekit-frontend` for app runtime, ACE, HyperRAG, and memory ingestion

OpenCode memory bridge:
- Claude-Mem is an observation source only
- the bridge posts compact observations to `POST /api/memory/claude-mem`
- Postgres is durable truth, Qdrant is recall, Redis is hot cache
- SQLite stays ingest-only
- keep OpenCode packets compact; semantic meaning should come back through embeddings + Qdrant, not prompt stuffing
- if a step needs a higher-level summary, write it separately to `llm_synthesis`
- prefer `rg`, globbing, and narrow file hits before opening new `.md` files end to end
- use vector search for single-fact lookups and agentic search for code navigation
- when the corpus is tiny, use HyperGraph RAG plus tricubic search for prompt engineering rather than stuffing more context

Use the helper:
```powershell
node scripts/opencode/post-memory.mjs --file .tmp\observation.json
```

Or via npm:
```powershell
npm run opencode:post-memory -- --file .tmp\observation.json
```

Do not mix this lane with MCP/TurboVec transport cleanup. That work is separate.

Reference docs:
- `docs/architecture/opencode-claude-mem-bridge.md`
- `docs/operations/stack-audit-playbook.md`
- `docs/security/CLAUDE_MEM.md`
