---
name: atlas-tools-mcp
description: Use before grepping/reading the codebase to answer "what depends on X", "where is feature/route Y", "what calls tool Z", or "what does the codebase graph say about this" — atlas-tools and atlas-task-kernel are local Neo4j-graph-backed MCP servers that answer these in one cheap call instead of a multi-file search. Load this before falling back to Grep/Bash for codebase-graph questions.
allowed-tools:
  - mcp__atlas-tools__find_dependencies
  - mcp__atlas-tools__trace_database
  - mcp__atlas-tools__trace_tool_chain
  - mcp__atlas-tools__find_source_refs
  - mcp__atlas-tools__find_feature
  - mcp__atlas-tools__find_route
  - mcp__atlas-tools__classify_intent
  - mcp__atlas-tools__build_agentic_rag_context
  - mcp__atlas-tools__build_recommendation
  - mcp__atlas-tools__record_outcome
  - mcp__atlas-task-kernel__atlas_context
  - mcp__atlas-task-kernel__atlas_inspect
  - mcp__atlas-task-kernel__atlas_expand
  - mcp__atlas-task-kernel__atlas_verify
  - mcp__atlas-task-kernel__atlas_research
---

# atlas-tools / atlas-task-kernel MCP

Two local stdio MCP servers (`.mcp.json`), both real and live, both currently undiscovered by
default because nothing points an agent at them — this is the actual context-token leak: a query
that `find_dependencies` or `trace_database` could answer in one ~1KB tool call instead gets
answered by a Grep → Read → Grep chain across several files, each read burning full file contents
into context. The `allowed-tools` list grants permission when this skill is invoked; it does not
replace deferred MCP schema discovery or guarantee that all listed tools are already loaded.
Claude Code may still perform ToolSearch on demand.

- **`atlas-tools`** (`sveltekit-frontend/scripts/mcp/atlas-tools-mcp.mjs`) — generic Neo4j-Cypher
  codebase-graph queries (`CodebaseFile`, `Feature`, `Route`, `Tool`, `SourceRef`, `Table` nodes)
  plus a small classify/recommend/record loop backed by a local NDJSON ledger.
- **`atlas-task-kernel`** (`sveltekit-frontend/scripts/mcp/atlas-task-kernel-mcp.mjs`) — a narrower,
  read-only front-door facade over the same context-selection engine `atlas-tools` uses
  (`atlas_context`/`atlas_inspect`/`atlas_expand`/`atlas_verify`/`atlas_research`); never exposes
  raw Python or storage operations. Prefer it when you want one bounded, pre-scored context packet
  rather than raw graph query results.

Both are read-only against the codebase graph (`atlas-tools` also does one narrow write —
`record_outcome` appends to a local ledger and Neo4j behavioral edges; nothing else here mutates
anything).

## When to use which tool (check this BEFORE Grep/Bash for these question shapes)

| Question | Tool | Why not Grep |
|---|---|---|
| "What files import/call `<file>`?" | `find_dependencies` | One Cypher IMPORTS/CALLS traversal vs. a repo-wide grep + manual read of every hit |
| "What files touch table/query `<name>`?" | `trace_database` | Graph already has `USES_DB` edges; no need to grep every server file |
| "What files invoke tool `<name>`?" | `trace_tool_chain` | Graph already has `USES_TOOL`/`CALLS` edges |
| "Where is `SourceRef`/file `<pattern>` in the graph?" | `find_source_refs` | Direct node lookup, not a filename grep |
| "What Feature nodes match `<name>`?" | `find_feature` | Feature mapping is graph data, not inferable from a filename search |
| "What route/layout matches `<path>`?" | `find_route` | Route mapping is graph data |
| "Classify this prompt/error into intent+domain+safe-next-command" | `classify_intent` | Deterministic keyword classifier, cheaper than reasoning it out from scratch |
| "Build a compact RAG context packet from the ACE cache for this query" | `build_agentic_rag_context` | Reads `.opencode/ace-packet.json` and scores cards; don't hand-roll this |
| "Produce a structured repair recommendation from evidence" | `build_recommendation` | Structured output contract (likely_cause/evidence/patch_targets/safe_next_command/do_not_do) |
| "Record whether a recommendation/tool choice worked" | `record_outcome` | Writes to the NDJSON ledger + Neo4j behavioral edges — the only write tool here |
| "Give me one bounded, pre-scored context packet for this query" | `atlas_context` | Same context-selection engine as `build_agentic_rag_context`, narrower/safer surface |
| "Inspect canonical source refs relevant to a bounded query" | `atlas_inspect` | Read-only, bounded |
| "Expand read-only structural dependencies for one target" | `atlas_expand` | Read-only, bounded — prefer over `find_dependencies` when you want it pre-filtered/bounded rather than raw graph output |
| "Classify a task and get a safe evidence-gathering direction, without editing" | `atlas_verify` | Same shape as `classify_intent`, via the narrower facade |
| "Run one bounded, read-only research circuit" | `atlas_research` | Multi-round but still read-only and bounded — never exposes raw Python/storage |

## Hard rule

If the question is shaped like "what depends on / calls / imports / uses X" or "where is Y
registered in the graph", **try the matching tool above before opening files with Grep/Read.**
Fall back to Grep/Bash only when the tool returns nothing useful, graph freshness/revision is not
proven, or the question doesn't fit any row above. A stale graph must never outrank current
filesystem evidence.

## Mock mode

Set `ATLAS_TOOLS_MOCK=1` to get deterministic fixture responses instead of live Neo4j queries —
useful for testing the calling code path itself, not for real answers.

## Anti-patterns

- Running a multi-file Grep/Read chain to answer "what imports this file" when `find_dependencies`
  answers it in one call — this is the exact context-token waste this skill exists to prevent.
- Treating `atlas-tools`' Neo4j graph as canonical identity truth — it's a query convenience layer
  over the codebase graph, not the Postgres-is-truth packet/identity system (see root `CLAUDE.md`'s
  Parent Atlas rules). Don't use it to answer packet-identity or embedding-dimension questions.
- Calling `record_outcome` speculatively "just in case" — it's a real write (NDJSON ledger + Neo4j
  edges); only call it when you actually want to record a real outcome.

## Cross-references

- [trace-mcp-tooling](../trace-mcp-tooling/SKILL.md) — the sibling skill for TRACE MCP (`:8788`,
  `kag_search`/`wiki_note_lookup`/graph tools) and local-LLM offload. Different servers, same
  "check the tool before you grep" discipline.
- `sveltekit-frontend/docs/architecture/atlas-kernel-gpu-ram-storage-ownership-map.md` — the
  broader ownership map these two servers sit inside (DRY lookup layer row).
