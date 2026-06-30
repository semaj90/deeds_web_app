# Agentic Retrieval Checklist - 2026-05-08

## Prompt-Ready Checklist

1. Identify the exact file, route, or error.
2. Check route ownership and AGENTS.md first.
3. Pull repo truth: source, tests, schemas, next_steps, graph cards.
4. Search sparse: path, symbols, error text, citations.
5. Search dense (multi-lane hybrid retrieval):
   5a. Vector ANN: Embed query via `/api/embed` → Qdrant `codebase_chunks_768` (768-dim) top-5 by cosine similarity
   5b. Authority rank: Check Redis `gpu:karpathy:scores` hash for Karpathy blend (0.4·PageRank + 0.3·attention + 0.3·authority)
   5c. Graph expand: Neo4j IMPORTS/BELONGS_TO/SIMILAR_TOPOLOGY edges (bounded 2-hop) OR 4-lane hypergraph members (cluster_context/shared_resource/agents_context/vault_link)
   5d. Hybrid synthesis: vector results → graph expansion → Karpathy rerank (canonical ordering)

6. For agentic loops: Route all retrieval via TRACE MCP (:8788) named tools only:
   6a. Gemma4 MUST call MCP tools; no direct Qdrant/Neo4j/Redis/Postgres access
   6b. Available tools: `kb.trace_search` (vector + BM25 fusion), `context.build_kv_packet` (pack builder), `graph.expand_neighborhood`, `topology.search_near`, `clusters.get_summary_lenses`
   6c. Non-agentic (direct TypeScript): use retrieval lane decision tree (see refs below)

7. Add external sources only if repo evidence covers <70% of the question:
   7a. Web search / Firecrawl for out-of-repo context (API docs, legal precedent, etc.)
   7b. GitHub MCP for cross-repo patterns (dependency version, upstream changes)
   7c. Language/framework docs if repo lacks canonical reference
8. Rank results against repo truth.
9. Build a small context pack.
10. Make the smallest fix.
11. Verify with the narrowest test.
12. Escalate to smoke gates if needed.
13. Log the outcome.

## Rules

- Exact matches first.
- Legal/admin and dev/codebase stay separate.
- No raw source dump unless required.
- No mutation during inspection.
- No fix without verification.

## Sources (Priority Order)

1. **Repo files** — source of truth (Postgres, code, tests)
2. **AGENTS.md** — directory-scoped agent rules and conventions
3. **next_steps notes** — current phase context and blockers
4. **Graph cards** — KnowledgeCard embeddings and relationships
5. **Tests and smoke outputs** — verification gates
6. **Web search / Firecrawl** — only if repo evidence <70%
7. **GitHub MCP** — cross-repo patterns
8. **Language/framework docs** — canonical reference (last resort)

## Retrieval Lane Decision Tree

**Use this to pick between vector RAG, hyper-graph-RAG, and sparse RAG:**

| Question Pattern | Lane | Backing Store | Tool/API |
|---|---|---|---|
| "Find chunks semantically similar to this query" | Vector RAG | Qdrant `codebase_chunks_768` (768-dim ANN) | `/api/search/chunks` or Qdrant HTTP |
| "What depends on X?" or "Shortest path from auth → DB?" | Hyper-graph-RAG | Neo4j (IMPORTS/BELONGS_TO/SIMILAR_TOPOLOGY) + CouchDB PageRank (6h TTL) | Neo4j Cypher (trace-mcp :8788) |
| "Expand cluster neighbors" or "Who shares these tags?" | 4-Lane Hypergraph | Neo4j edges (`cluster_context`, `shared_resource`, `agents_context`, `vault_link`) | TRACE MCP `graph.expand_neighborhood` |
| "Exact filename / export / Redis key?" | Sparse RAG | Fuse.js (browser), `rg` CLI, BM25 index | `/api/search/symbol` or CLI |
| **Hybrid (most common)** | **Vector + Graph + Rerank** | **Qdrant ANN → Neo4j expansion → Redis blend** | **`kb.trace_search` (MCP) or `fetchACPKnowledgeResults()` (TS)** |

## References

- **Retrieval stack deep-dive**: `docs/architecture/trace-kag-web-development-guide.md` (§7 Retrieval Lane Decision Tree)
- **4-lane hypergraph inventory**: `memory/hypergraph-4-lanes-vault.md` (282 edges across cluster/shared/agents/vault lanes)
- **Karpathy GPU blend formula**: `docs/architecture/retrieval-layer-separation.md` (0.4·PageRank + 0.3·attention + 0.3·authority)
- **MCP tool surface health**: `memory/architecture/mcp-mount-smoke-2026-05-09.md` (42 tools registered, healthy as of 2026-05-09)
- **TRACE runtime boundary**: `docs/architecture/trace-runtime-split.md` (Gemma4 → MCP only, no direct DB access)
- **AGENTS.md authority**: `docs/agents-md-howto.md` (directory-scoped agent rules)
- **Karpathy authority blend**: Root CLAUDE.md §"Karpathy GPU Authority Blend + Redis ACE Cache"
