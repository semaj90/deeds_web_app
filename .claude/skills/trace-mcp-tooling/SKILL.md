---
name: trace-mcp-tooling
description: Use when calling TRACE MCP tools (port 8788) or the gemma4-offload stdio MCP. Covers tool naming, when to use which tool, how to read the responses, and the "no raw infra" rule.
allowed-tools:
  - mcp__trace__kag_search
  - mcp__trace__wiki_note_lookup
  - mcp__trace__graph_expand_neighborhood
  - mcp__trace__graph_pagerank_top
  - mcp__trace__topology_search_4d
  - mcp__trace__context_build_kv_packet
  - mcp__gemma4-offload__gemma4_chat
  - mcp__gemma4-offload__gemma4_summarize
  - mcp__gemma4-offload__gemma4_classify
  - mcp__gemma4-offload__gemma4_health
---

# TRACE MCP tooling

Use TRACE MCP whenever you need to read project context safely. Use the
`gemma4-offload` MCP whenever a subtask is small enough that local
Gemma4 should handle it instead of spending Claude tokens.

## Hard rule

Never read raw Postgres / Qdrant / Neo4j / Redis from a script you
write here. Call a registered MCP tool. The tool boundary exists so
that infrastructure changes (port moves, schema renames, new caches)
don't ripple into the model side.

## When to use which tool

| Question | Tool |
|----------|------|
| "Find code chunks related to X" | `trace.kag_search` |
| "What does the wiki note for `<dir>` say?" | `trace.wiki_note_lookup` |
| "Which files are 1-2 hops from `<file>` in the graph?" | `graph.expand_neighborhood` |
| "Top-N by PageRank?" | `graph.pagerank_top` |
| "Find files in the same 4D topology cell as this query" | `topology.search_4d` |
| "Build a compressed context card for the LLM" | `context.build_kv_packet` |
| "Schema shape / column list" *(when implemented)* | `db.schema_overview` / `db.table_inspect` |
| "Summarize this 8 KB tool output to 80 words" | `gemma4-offload.gemma4_summarize` |
| "Classify this snippet into one of {bug, feature, docs}" | `gemma4-offload.gemma4_classify` |
| "Draft a short paraphrase / commit message" | `gemma4-offload.gemma4_chat` |

## Reading responses

TRACE MCP tools return `{ content: [{ type: 'text', text: '...' }] }`
with the text usually JSON. Parse it explicitly. Do not assume shape —
if the tool returns `isError: true`, surface the error rather than
silently retrying.

## Testing tools without Claude

Use `mcporter` for shell-level smoke testing:

```bash
npx mcporter list                                          # discover registered tools
npx mcporter call trace.kag_search query:"reranker topology"
npx mcporter call gemma4-offload.gemma4_health
```

Validator gates `G30` and `G31` already cover handshake + round-trip
for `gemma4-offload`. Run a single gate:

```bash
node scripts/validate/full-system.mjs --gate=G30
```

## Anti-patterns

- Calling an HTTP endpoint directly when an MCP tool exists for the
  same data (defeats the boundary; the tool may add caching / scrubbing).
- Using `gemma4-offload.gemma4_chat` for tasks that need the full
  Claude context window — Gemma4 is for short-form work.
- Writing a new ad-hoc script that talks to Postgres/Qdrant when the
  same query could be a new TRACE MCP tool. Add the tool, then use it.

## Cross-references

- [docs/architecture/claude-code-agent-os.md](../../../sveltekit-frontend/docs/architecture/claude-code-agent-os.md)
- [docs/architecture/gemma4-to-claude-code-handoff.md](../../../sveltekit-frontend/docs/architecture/gemma4-to-claude-code-handoff.md)
- [docs/architecture/drizzle-inspection-mcp.md](../../../sveltekit-frontend/docs/architecture/drizzle-inspection-mcp.md)
