# AGENTS.md — `src/lib/server/search`

## Scope

KAG / ACE retrieval layer — hybrid search (Postgres FTS + Qdrant vector), MLA attention rerank, SOM proximity boost, Neo4j neighbor expansion, semantic cache, MLA KV compression.

## Key files

| File | Purpose |
|------|---------|
| `hybrid-search.ts` | Fuses Postgres FTS + Qdrant ANN → `UnifiedRetrievalResult[]` |
| `qdrant-search.ts` | `searchQdrantCode()` — vector ANN with topo_class filter |
| `postgres-fts.ts` | `searchCodeLexical()` — BM25/FTS with topoClass filter |
| `neo4j-rerank.ts` | `expandNeighbours(stableKey)` — single key → `string[]` neighbor keys |
| `mla-kv-compress.ts` | 768→128 SOM token compression, MLA attention weights |
| `gpu-rerank.ts` | `attentionRerank()` — GPU cosine similarity top-K selection |
| `semantic-cache.ts` | Redis cache for repeated hybrid queries (30 min TTL) |
| `retrieval-explainer.ts` | `explainRetrieval()` — trace object stored at `trace:{sha1}` in Redis |

## Cache / memory keys

| Key pattern | Owner | TTL |
|-------------|-------|-----|
| `trace:{sha1}` | `retrieval-explainer.ts` — retrieval trace | 1h |
| `ace:topo:{class}:{hash}` | `topo-candidate-cache.ts` — ANN pre-filter | 300s |
| `semantic:{hash}` | `semantic-cache.ts` — hybrid query cache | 30 min |

## MCP tool mapping

These files back the in-process MCP tools dispatched by `mcp-tool-dispatch.ts`:

| MCP tool | Implementation |
|----------|---------------|
| `search.dev_context` | → `hybrid-search.ts` filtered to codebase chunks (default first tool for coding prompts via Step 5B planner) |
| `search.hybrid` | → `hybrid-search.ts` via `postgres-fts.ts` |
| `search.postgres_fts` | → `searchCodeLexical()` in `postgres-fts.ts` |
| `search.qdrant_topology` | → `searchQdrantCode()` in `qdrant-search.ts` |
| `graph.expand_neighborhood` | → `expandNeighbours()` in `neo4j-rerank.ts` (fan-out) |
| `trace.explain_retrieval` | → Redis `trace:{sha1}` read — called only when `hitCount > 5`, `confidence === 'low'`, or `sourceTypes.length > 2` |

## ACE scoring spine

```
semantic_vector × 0.60
+ tag_score × 0.12
+ ast_graph × 0.10
+ som_boost × 0.08
+ hyperedge × 0.10
+ community_context (GraphRAG preamble)
```

## Safety rules

- `expandNeighbours(key)` takes a **single** `stableKey: string` — fan out with `Promise.all(keys.map(...))` for multi-key calls.
- Never pass a Qdrant filter `match: { value: myVar }` as shorthand — use `match: { value: myVar }` explicitly (shorthand `{ value }` fails when `value` is not the variable name).
- Redis semantic cache keys must include model hash — stale cache after model upgrade otherwise.
- Retrieval traces (`trace:{sha1}`) are read-only from MCP tools; write only from `explainRetrieval()`.

## First tools for agents editing this directory

```
trace.kag_search({ query: "hybrid search retrieval", limit: 5 })
search.dev_context({ query: "expandNeighbours neo4j rerank" })
```
