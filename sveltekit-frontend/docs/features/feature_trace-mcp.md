---
featureId: "trace-mcp"
title: "TRACE MCP / Agentic Tool Surface"
status: "research"
keywords: ["trace-mcp", "TRACE MCP / Agentic Tool Surface", "model", "context", "protocol", "tool", "orchestration"]
services: ["src/mcp", "src/mcp/trace-mcp-server.ts"]
docs: []
tests: []
---

# TRACE MCP / Agentic Tool Surface

## Summary

TRACE MCP / Agentic Tool Surface is the read-only project-context boundary for Parent Atlas. Use it to retrieve evidence, topology, and compressed context for agentic workflows without writing raw store access code.

## Feature Intent

read-only project-context retrieval, graph evidence, and compressed context assembly

## Research Query

`trace-mcp TRACE MCP / Agentic Tool Surface live tool surface evidence assembly graph topology context packet orchestration`

## Official Docs

- [What is MCP?](https://modelcontextprotocol.io/docs/getting-started/intro)
- [MCP Architecture](https://modelcontextprotocol.io/docs/learn/architecture)
- [Model Context Protocol TypeScript SDK](https://github.com/modelcontextprotocol/typescript-sdk)

## Live Tool Surface

These are the actual tool namespaces exposed by `src/mcp/trace-mcp-server.ts` today:

- `trace.kag_search` - bounded KAG-DAG retrieval for current project context
- `trace.explain_retrieval` - explain a prior retrieval trace
- `trace.validate_ace_hit` - validate cache-key and graph-node presence
- `context.build_kv_packet` / `context.get_compressed_card` - build and expand compressed context cards
- `kag.record_agent_run` - persist run artifacts and queue ingest metadata
- `kag.ingest_memory_directory` - flush queued JSONL memory into the ACE cache
- `kag.multi_lane_search` - combined dense / lexical / graph retrieval helper
- `graph.expand_neighborhood` - ego-graph expansion in Neo4j
- `graph.shortest_path` - shortest path between stable keys
- `graph.community_for_node` - community membership lookup
- `graph.pagerank_top` - top-N PageRank nodes
- `topology.search_near` - 4D topology neighborhood search
- `topology.same_som_cluster` - nodes sharing a SOM cluster
- `clusters.get_members` - files in the same GPU cluster
- `clusters.get_summary_lenses` - cluster notes and summary lenses
- `hypergraph.search` / `hypergraph.get_edge` / `hypergraph.explain_activation` / `hypergraph.expand_members`
- `knowledge.get_minified_map` - compact directory map with top edges and LLMS.md note
- `legal.*` - evidence, precedents, recordings, cross-exam, scoring, similarity, and ingest helpers
- `ops.*` - operator-gated patch/test/quality helpers

## Planned or External Helpers

These names may appear in higher-level agent notes, but they are not the live TRACE MCP tool names:

- `atlas-tools_*` - repository alias layer or agent wrapper naming
- `gemma4-offload.*` - separate short-form local Gemma4 helper, not a TRACE MCP tool
- `db.schema_overview` / `db.table_inspect` - planned database-inspection tools when registered

## Atlas Anchors

- `src/mcp`
- `src/mcp/trace-mcp-server.ts`
- `scripts/atlas/agentic-recommendation-workflow.mjs`
- `docs/reports/agentic-recommendation-workflow.json`

## Notes

- Never read raw Postgres, Qdrant, Neo4j, or Redis from a custom script when a TRACE MCP tool already exists.
- Use TRACE MCP for cross-store context, evidence assembly, graph traversal, and packet preparation.
- Use direct repository reads for local source files, generated board artifacts, and implementation diffs.
- Tool responses usually come back as `{ content: [{ type: 'text', text: '...' }] }`; parse the JSON text explicitly and surface `isError: true` responses.
- Keep `manifest.json` as the machine-readable source list and this file as the curated operator note.
