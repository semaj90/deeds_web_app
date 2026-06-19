# MCP Tool Summary Registry

Generated: 2026-06-19T04:53:48.603Z
Query: (none)
Matched rows: 10

## Summary

# MCP Tool Summary Registry

## What exists

- mcp.tool.ace.compact.search (ace.compact_search)
- mcp.tool.atlas.compact.context (atlas.compact_context)
- mcp.tool.atlas.coverage (atlas.coverage)
- mcp.tool.atlas.explain.trace (atlas.explain_trace)
- mcp.tool.atlas.get.chunk (atlas.get_chunk)

## What is missing

A live Gemma4 summary endpoint was unavailable, so this briefing is deterministic. The registry is already canonical in Postgres, but the summarization transport still needs a healthy llama-server or MCP route.

## Next bounded lane

Wire the registry summarizer to the live llama-server path and keep the Postgres-backed registry as the source of truth.

## Observed workflow lanes

- cache
- lexical
- dense
- graph
- rerank
- read
- identity
- unknown
