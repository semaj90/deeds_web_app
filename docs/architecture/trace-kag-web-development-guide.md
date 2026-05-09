# TRACE/Karpathy Web Development Guide

## 1. Goals
Build a SvelteKit 2 app that supports legal/evidence workflows, AI retrieval, uploads, graph analysis, and durable memory.

## 2. Runtime Split
Reference `trace-runtime-split.md`.

## 3. RAG / HyperRAG / KAG / DAG / TRACE
- **RAG**: Retrieve chunks from Qdrant, then answer with Gemma4.
- **HyperRAG**: Retrieve across many memory types: chunks, summaries, wiki notes, research notes, prior answers, topology regions.
- **KAG (Knowledge-Augmented Generation)**: vectors + graph facts + ontology + audit gates + AGENTS.md + research provenance.
- **DAG (Directed Acyclic Graph)**: safe ordered execution plan with no loops.
- **TRACE**: Triage → Retrieve → Align → Compose → Encode.

## 4. SvelteKit Route Pattern
- Zod validate input
- Auth guard
- Call TypeScript service
- Service writes metadata
- Background jobs do heavy work

## 5. Drizzle + Postgres
Use Postgres for canonical app state and JSONB metadata envelopes via Drizzle ORM.

## 6. Object Storage
Use local filesystem in dev and S3-compatible storage (R2, B2, S3) in prod. Avoid hard-coding MinIO; use a generic S3 adapter.

## 7. Qdrant Collections
- `codebase_chunks_768`
- `directory_summaries_768`
- `summary_lenses_768`
- `synthesis_memory_768`
- `research_memory_768`
- `evidence_items`

## 8. Neo4j Graph Model
- `File`, `Directory`, `Route`
- `Evidence`, `ResearchNote`
- `Cluster`, `SynthesisMemory`
- Relationships: `IMPORTS`, `DEPENDS_ON`, `MEMBER_OF`, `BELONGS_TO`

## 9. Redis Cache Keys
- `wiki:note:*`
- `rag:exact:*`
- `tensor:embedding:*`
- `similarity:query:*`
- `centroid:members:*`
- `ace:trace:*`

## 10. MCP Tool Boundary
Gemma4 calls MCP tools only. See `trace-mcp-server.ts`.

## 11. Worker Threads
Use `worker_threads` for CPU-intensive tasks: chunking, hashing, extraction, metadata, and Qdrant payload generation.

## 12. GPU Rules
GPU only for dense math and bounded reranking/clustering (LibTorch/CUDA).

## 13. Gemma4 Rules
Gemma4 synthesizes from retrieved context; it does not browse raw infra.

## 14. Obsidian/Karpathy Memory
High-gain synthesis becomes wiki memory only after validation.

## 15. Testing
- `smoke:trace`: Basic connectivity
- `smoke:trace:full`: End-to-end loop
- `typecheck:native`: TS types
- `svelte-check`: Svelte 5 compliance
- Dashboard tests

## 16. Topological Path Mapping & Manifold Synthesis
- **Dynamic Path Mapping**: Use `graph.semantic_path_synthesis` to bridge structural (Neo4j) and semantic (Postgres/Qdrant) domains.
- **Topological Expansion**: Use `topology.search_som_neighborhood` to find BMU anchors and expand into structurally-adjacent SOM grid regions.
- **Pathway Materialization**: Persist synthesized narratives into `graph_pathway_cards` via `graph.materialize_pathway`.
- **Manifold Synthesis**: Combine high-fidelity LLM summaries with 4D manifold coordinates to derive cross-cluster insights without live LLM loops.
