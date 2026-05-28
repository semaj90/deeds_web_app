# OpenCode Integration TODOs

## TS-106 — Implement `agent-executor` + `runAgentSkill`

**Affected route**: `sveltekit-frontend/src/routes/api/atlas/audit/+server.ts`

**What's needed**: A server-side `$lib/server/agent-executor` module that exports `runAgentSkill(skillName, input)`.

### Design

The function should dispatch to OpenCode agent skills via one of these approaches (pick one):

**Option A — HTTP dispatch to OpenCode CLI process** (simplest, no new deps):
```ts
// $lib/server/agent-executor.ts
export async function runAgentSkill(skill: string, input: Record<string, unknown>) {
  // POST to a local OpenCode HTTP endpoint or write to a shared queue
  // OpenCode runs as a sidecar; result returned as JSON
}
```

**Option B — Direct MCP tool call** (preferred, already wired):
The TRACE MCP server at `:8788` exposes `kag_search`, `atlas_query`, etc. The `atlas-audit` skill maps to `trace.kag_search` + `context.build_kv_packet`. Implement `runAgentSkill` as a thin wrapper that calls the relevant TRACE MCP tools via the existing MCP client in `src/mcp/server.ts`.

**Option C — Subprocess / OpenCode CLI** (straightforward but slow):
```ts
import { spawnSync } from 'node:child_process';
export async function runAgentSkill(skill: string, input: Record<string, unknown>) {
  const result = spawnSync('opencode', ['run', '--agent', skill, JSON.stringify(input.query)], { encoding: 'utf8' });
  return JSON.parse(result.stdout || '{}');
}
```

### Current stub
The route returns HTTP 501 until this is implemented. It is safe — no crash, no data loss.

### Recommended path
Option B. Wire `runAgentSkill('atlas-audit', { query })` to call `trace.kag_search` via the existing TRACE MCP HTTP client. The ACE packet pipeline already does this in `src/lib/server/ai/ace-prompt-preflight.ts`.

---

## claude-mem-opencode + ACE packet injection

**Status**: Module loads at SSR runtime (build fixed). Worker must be started before `initClaudeMem()` returns successfully.

**Bootstrap flow** (for OpenCode sessions):
1. `npm run opencode:bootstrap` — runs once at workspace open, writes `.opencode/startup-context.json`
2. OpenCode reads that file as session context injection
3. The ACE packet (`.opencode/ace-context.json`) is loaded into the Gemma4 system prefix

**How to launch**:
- Just run `opencode` (or `npm run opencode:root`) — bootstrap is wired as `command.workspace-bootstrap` in `opencode.json`
- The `workspace-bootstrap` command triggers `npm run opencode:bootstrap` which runs `get-ace-context.mjs` and writes the startup context
- No need to run bootstrap manually before launching OpenCode; the command fires on demand via `/workspace-bootstrap`

**PostgreSQL-backed claude-mem (server-beta)**:
- Current default: SQLite worker (CLAUDE_MEM_WORKER_PORT)
- To switch to Postgres: set `CLAUDE_MEM_SERVER_DATABASE_URL=postgresql://...` and `CLAUDE_MEM_SERVER_PORT=<port>`
- No code changes needed in `claude-mem.ts` — `initClaudeMem(workerUrl)` accepts the URL

---

## Claude-Mem Scope Correction

`claude-mem-opencode` is **not** vector search, pgvector, or ACE retrieval.

**Actual role:**
- SQLite-backed worker (or Postgres opt-in via `server-beta`)
- Stores compressed OpenCode session/tool logs (bash commands, file ops, tool calls)
- Supports plain text search over past agent actions
- Injects project context as text into the Gemma4 system prompt prefix

**Use it for:**
- "What did the agent run last time?"
- "What files did the agent touch in the last session?"
- "What command fixed this before?"
- Cross-session action replay

**Do NOT use it for:**
- Vector similarity search
- GraphRAG or KAG retrieval
- Canonical ACE packet generation
- PostgreSQL-backed memory (unless `CLAUDE_MEM_SERVER_DATABASE_URL` is set)

**Correct injection order:**
1. ACE startup packet first (`get-ace-context.mjs` → `.opencode/ace-context.json`)
2. Claude-Mem project context second (keyword search over past agent logs)
3. TRACE MCP / Qdrant / Neo4j remain retrieval authority — claude-mem does not replace them

**Architecture mapping:**
| Layer | Tool | Role |
|---|---|---|
| Project knowledge retrieval | ACE / TRACE / Qdrant / Neo4j | Semantic + graph search |
| Agent session memory | claude-mem-opencode | Past action replay |
| Startup context | `.opencode/ace-context.json` | Prompt injection |
| RL audit history | Postgres `context_timeline` | Feedback + reward loop |

---

## Port map (do not change without updating opencode.json)

| Service | Port | Role |
|---|---|---|
| Bifrost | 3040 | OpenAI-compatible semantic routing gateway |
| TurboQuant llama-server | 8090 | Fast direct generation |
| TRACE MCP | 8788 | Canonical agentic tool surface |
| claude-mem worker (legacy) | `CLAUDE_MEM_WORKER_PORT` | SQLite memory worker |
| claude-mem server-beta | `CLAUDE_MEM_SERVER_PORT` | Postgres-backed memory (opt-in) |
