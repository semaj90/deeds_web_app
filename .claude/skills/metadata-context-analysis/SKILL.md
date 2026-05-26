---
name: metadata-context-analysis
description: Use when analyzing jsonb metadata usage in the app without loading raw files or blowing the context window. Focuses on compact schema reads, usage tracing, and short synthesis.
allowed-tools:
  - mcp__trace__kag_search
  - mcp__trace__wiki_note_lookup
  - mcp__trace__graph_expand_neighborhood
  - mcp__trace__context_build_kv_packet
  - mcp__gemma4-offload__gemma4_summarize
  - mcp__gemma4-offload__gemma4_classify
  - mcp__gemma4-offload__gemma4_chat
---

# Metadata context analysis

Use this skill when the user asks what `jsonb` metadata does, where it is stored, or how it flows through the app.

## Core rule

Keep retrieval compact. Prefer schema summaries, targeted usage hits, and 1-2 line synthesis over raw file dumps.

## What to do

1. Start with `db.schema_overview` or `db.table_inspect` for the smallest relevant table set.
2. Use `trace.kag_search` for concrete usage sites like API routes, serializers, or persistence helpers.
3. Use `trace.graph_expand_neighborhood` only if you need nearby files to understand a flow.
4. Convert results into a short fact packet: purpose, tables, writers, readers, and risks.
5. If the answer is getting long, summarize with `gemma4-offload.gemma4_summarize`.

## Reading limits

- Prefer line windows, not whole files.
- Avoid broad repo sweeps unless the first pass is empty.
- Do not paste full JSON blobs into chat when a field list or example object is enough.

## Typical questions

| Question | Best tool |
|---|---|
| What does this metadata store? | `db.table_inspect` |
| Where is it written? | `trace.kag_search` |
| Where is it read? | `trace.kag_search` |
| What is the minimal summary? | `gemma4-offload.gemma4_summarize` |

## Anti-patterns

- Loading every file that mentions `metadata`.
- Copying large JSON samples into context.
- Writing ad-hoc scripts that query infra directly when a registered tool exists.

## Cross-references

- [trace-mcp-tooling](../trace-mcp-tooling/SKILL.md)
