---
name: Claude Code as Agent-OS Operator Shell
description: How Claude Code, project subagents, hooks, and TRACE MCP fit together as an operator console over the SvelteKit/Postgres/Qdrant/Neo4j/Redis stack — without giving the model raw infrastructure access.
type: project
tags:
  - claude-code
  - mcp
  - trace
  - subagents
  - hooks
  - safety
---

# Claude Code as Agent-OS Operator Shell

Claude Code is **not** the operating system. It is the operator console.
TRACE MCP is the syscall boundary; SvelteKit handlers are the kernel
services; Postgres/Qdrant/Neo4j/Redis/CouchDB/Obsidian are storage
devices. CLAUDE.md + AGENTS.md are the constitution.

This means: every read-or-write that touches infrastructure flows
through a **named MCP tool** with a TypeScript handler. Claude/Gemma
never speaks raw SQL, raw Cypher, raw Qdrant HTTP, or raw shell against
production state.

## Layer map

| Layer | Role | Owner |
|-------|------|-------|
| Claude Code (CLI + VS Code) | operator shell, plan mode, checkpoints | human + LLM |
| Project subagents (`.claude/agents/*.md`) | task-scoped specialists with restricted tool sets | repo |
| Hooks (`PreToolUse` / `PostToolUse` / `UserPromptSubmit` / …) | policy gates, redaction, audit trail | repo |
| TRACE MCP (`src/mcp/trace-mcp-server.ts`, port 8788) | syscall boundary — every model→infra call passes through a registered tool | repo |
| `gemma4-offload` MCP (stdio, [scripts/mcp/gemma4-offload-mcp.mjs](../../scripts/mcp/gemma4-offload-mcp.mjs)) | local generation routing for cheap subtasks | repo |
| SvelteKit handlers (`src/routes/api/**`) | typed kernel services | repo |
| Drizzle / `pg` Pool | only DB caller | repo |
| Postgres / Qdrant / Neo4j / Redis / CouchDB / Obsidian | storage devices | infra |

The runtime split itself is canonical at [trace-runtime-split.md](trace-runtime-split.md).
This document only covers how Claude Code sits *on top* of that split.

## Recommended project subagents

Drop these in `.claude/agents/` (or `~/.claude/agents/` for personal). Each
one declares an `allowed-tools` set so a runaway agent can't reach for
write surfaces it shouldn't have.

| Agent | Purpose | Allowed tools (suggested) |
|-------|---------|---------------------------|
| `topology-medic` | inspect SOM/cluster/PageRank health, recommend reruns | `trace.kag_search`, `graph.pagerank_top`, `graph.expand_neighborhood`, `topology.search_4d` |
| `drizzle-inspector` | read-only schema/migration/JSONB-key inspection (see [drizzle-inspection-mcp.md](drizzle-inspection-mcp.md)) | `db.schema_overview`, `db.table_inspect`, `db.relation_map`, `db.indexes`, `db.migration_status`, `db.find_jsonb_keys` |
| `sveltekit-route-auditor` | enumerate routes, find unguarded handlers, audit Zod coverage | `Glob`, `Grep`, `Read`, `mcp__trace__route_inspect` (planned) |
| `obsidian-cartographer` | walk vault, find gaps in pathway/feature/timeline cards | `obsidian.note_lookup`, `obsidian.topic_neighbors`, `obsidian.changed_notes_since` (planned) |
| `retrieval-ranker` | tune Karpathy blend weights, evaluate ACE traces | `gpu.karpathy_scores`, `ace.replay_trace`, `trace.explain_retrieval` |
| `evidence-pipeline-auditor` | verify SHA-256 chain, check 9-stage pipeline state | `db.table_inspect` (read-only), `evidence.audit_log_query` (planned) |

### Subagent file shape

```yaml
---
name: drizzle-inspector
description: Inspect Drizzle/Postgres schema, migrations, and JSONB shape via read-only TRACE MCP tools. Never writes, never migrates.
tools: mcp__trace__db_schema_overview, mcp__trace__db_table_inspect, mcp__trace__db_relation_map, mcp__trace__db_find_jsonb_keys, mcp__trace__kb_hybrid_search
model: inherit
---

You inspect schema shape, migrations, indexes, JSONB envelopes, and
relationships. You never run migrations. You never write data. You
return compact findings with file paths and table names.
```

## Hooks (safety + observability)

Hooks live in `.claude/settings.json` (or `~/.claude/settings.json`).
Three categories matter for this stack:

### `PreToolUse` — block destructive actions

- Bash commands matching `npm run db:push`, `drizzle-kit push`, `psql .* -c "(DROP|TRUNCATE|DELETE)"`, `rm -rf`, `taskkill /F` → **deny unless approved**.
- Edits/Writes touching `src/lib/server/db/schema-postgres.ts`, `src/mcp/trace-mcp-server.ts`, `src/lib/server/reconstruction/scene-compiler.ts`, `memory/reconstruction/aesthetic-presets.json`, `scripts/launch-turboquant.ps1` → **require plan mode**.

### `UserPromptSubmit` — inject runtime ground truth

Pre-pend a short context block per turn:

- Current port map (5173 dev, 8090 TurboQuant, 8788 TRACE MCP, 11434 Ollama, 6379 Redis, 5432 Postgres, 6333 Qdrant, 7474/7687 Neo4j, 5984 CouchDB).
- `git status -s` summary (≤10 lines).
- Active `next_steps/active/*.md` headers.
- Last 3 entries from `memory/runs/claude-code/`.

### `PostToolUse` — audit trail

After any Edit/Write/Bash run, append a JSONL line to
`memory/runs/claude-code/<YYYY-MM-DD>.jsonl`:

```json
{"ts":"…","tool":"Edit","path":"src/…","diff_lines":12,"agent":"main"}
```

This is what `evidence-pipeline-auditor` and the chain-of-custody log
hook into later.

## What to keep out of Claude Code

- **Raw `psql` write sessions.** Use `db.*` read tools + planned
  `migration.run` (which itself goes through a hook + human approval).
- **Raw Cypher writes.** Use the official Neo4j MCP with
  `NEO4J_READ_ONLY=true`; route writes through a typed SvelteKit handler.
- **Raw Qdrant `PUT /collections/…/points` from the model side.** Use
  the `kb.*` and `evidence.*` MCP tools that wrap embedding + upsert.
- **Reconstruction compiler edits without a plan.** `scene-compiler.ts`
  + `aesthetic-presets.json` + `demo-scene.py` are byte-hash-frozen by
  G01/G02/G05. Hash drift breaks legal admissibility.

## Verification gates

Three validator gates back this layer:

- **G29** (`drizzle:destructive-pending`) — scans pending Drizzle
  migrations for `DROP/TRUNCATE/DELETE` before they can run.
- **G30** (`mcp:gemma4-offload-handshake`) — proves the local stdio
  MCP server boots and registers ≥4 tools.
- **G31** (`mcp:gemma4-offload-roundtrip`) — proves a tool call
  reaches a backend (TurboQuant or Ollama) and returns.

Add later (planned):

- `G32` (`mcp:trace-server-tools-list`) — TRACE MCP `tools/list`
  returns the canonical 30+ tool set without Zod errors.
- `G33` (`mcp:db-inspection-readonly`) — assert no `db.*` MCP tool
  exposes a write verb in its schema.

## Implementation order

1. Add `.claude/agents/{drizzle-inspector,topology-medic,retrieval-ranker}.md` (read-only tool sets only).
2. Add `.claude/settings.json` hooks for the destructive-Bash deny list and the JSONL audit.
3. Spec the read-only `db.*` MCP tools in [drizzle-inspection-mcp.md](drizzle-inspection-mcp.md); land schemas before handlers.
4. Wire `trace.alignment_check` (a single tool that runs G29 + G30 + G31 + a `tools/list` probe and returns one JSON blob).
5. Only then enable agentic write paths — and only behind hook + plan mode.
