# Retrieval Architecture

This system treats retrieval as a staged pipeline, not a single search call. Each
stage has a specific job: prune, score, expand, synthesize, then cache.

## 1. Retrieval Stages

### Sparse gate

Use sparse, boolean, or exact-match search first.

Best for:

- file paths
- symbol names
- route names
- table names
- Redis keys
- Qdrant collection names
- MCP tool names
- hashes
- error strings
- tags and simple filters

Typical tools:

- `rg`
- BM25 / FTS
- Postgres text search
- tag filters
- JSONB predicates

The goal is to narrow the candidate set before any expensive work.

Output contract:

- candidate IDs
- matched terms, paths, symbols, tags, or hashes
- source provenance
- cheap confidence score

### Dense recall

Use embeddings and GPU math after the sparse gate.

Best for:

- semantic rerank
- nearest-neighbor search
- batched similarity
- clustering
- centroid assignment
- topology projection

This is where `embeddinggemma`-style vectors and GPU acceleration help.

GPU is for batch math after pruning. It is good for rerank, clustering,
embedding, SOM/BMU, manifold projection, repeated kernels, and batched
similarity. It is not the default answer for blind corpus-wide retrieval.

### Graph and KAG expansion

Use graph reasoning after the first candidate set exists.

Best for:

- shortest paths
- communities
- PageRank-aware ordering
- dependency chains
- hypergraph expansion
- DAG-style orchestration

This is the relationship layer: it explains how candidates connect.
KAG combines retrieval, graph facts, notes, audit gates, and provenance into a
ranked context packet.

### LLM synthesis

Use Gemma4 last.

The model should synthesize from already-scored context, not browse raw infra.
The LLM is not the retrieval engine.

Runtime loop:

1. retrieve
2. score
3. expand
4. rerank
5. synthesize
6. validate
7. cache

## 2. MCP Tool Selection

Pick the tool based on intent:

- exact or near-exact lookup -> sparse search tool
- semantic recall -> vector search / rerank tool
- dependency or path query -> graph expansion tool
- topology or cluster query -> `topology4D` / topology tool
- external facts -> web search tool
- final answer or plan -> LLM synthesis
- broad unknown query -> sparse, then dense, then graph, then LLM

TypeScript middleware should decide this before any model call when possible.
The orchestrator should choose the first tool from query intent, then escalate
only when the current layer cannot answer with enough confidence.

Use materialized pathways only after scorecard and dry-run approval.

## 3. Caching

Cache each layer separately.

- Embedding cache: normalized text + embedding model + dimensions -> vector
- Rerank cache: query hash + corpus hash + candidate set hash + reranker model -> scores
- Pathway cache: deterministic pathway ID + graph version + scorecard version -> persisted card
- LLM cache: prompt hash + context hash + model hash + tool policy hash -> final output

Do not treat generation cache as truth.
Treat it as memoized synthesis.
Invalidate caches on corpus hash, model, prompt template, graph version, or tool
policy changes as appropriate.

## 4. Pathways

Materialized pathways are scored artifacts.

- Generate a dry-run preview first.
- Produce a scorecard before the orchestrator depends on it.
- Keep the pathway ID deterministic.
- Promote to persistent memory only after review.
- Do not let `AgentOrchestrator` depend on a materialized pathway until the scorecard passes.

`graph.materialize_pathway` should behave like a durable synthesis cache, not a control-flow primitive.

## 5. GPU vs Metaphor

Metaphors that map well:

- DLSS: coarse-to-fine retrieval
- ray tracing: aggressive pruning and bounded traversal
- NES textures: small cached tiles of structured memory
- clustered VRAM: keeping hot vectors and batches contiguous

Implementation guidance:

- CUDA graphs for repeated fixed pipelines
- batched rerank kernels
- batched embedding or similarity work
- clustered vector storage for hot sets
- fixed GPU sequences such as embed -> rerank -> pool -> score

Not useful as literal design:

- brute-force GPU search over everything
- treating the LLM as the retrieval engine
- using ray tracing language to hide missing indexing logic
- requiring DLSS, NES texture packing, or ray tracing APIs to implement retrieval
- CUDA graphs for highly dynamic one-off branching

The real implementation equivalent of the ray tracing metaphor is:

1. boolean prefilter
2. score
3. expand neighbors
4. rerank
5. synthesize

## 6. Operational Rule

The orchestrator should prefer the cheapest sufficient layer:

1. sparse gate
2. dense recall
3. graph expansion
4. LLM synthesis

If a later stage can be skipped, skip it.

TypeScript is the runtime orchestrator. Middleware should own auth, routing,
scoring, retries, cache lookup, and tool selection. LangGraph can be a reference
model, but explicit TypeScript state transitions are enough.

## 7. Mental Model

- Sparse search = gate
- Dense search = semantic recall
- Graph search = relationship expansion
- GPU = batch math accelerator
- LLM = final synthesis only

That is the retrieval stack the MCP surface should expose.

## 8. Action Tracker

Use `sveltekit-frontend/next_steps/active/2026-05-08_knowledge-graph-retrieval-feature-tracker.md`
for the implementation timeline, owner files, feature todos, and production
recommendation inputs for graph datastore retrieval.

See also: [Qdrant search contract](qdrant-search-contract.md) for the Query API,
hybrid prefetch/fusion, grouping, and cluster-topic retrieval notes.
