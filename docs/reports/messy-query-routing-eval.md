# Phase 18 — Messy Query Orchestration Evaluation

Generated: 2026-05-22T16:22:51.722Z

## 1. Codebase Documentation References

- Parent Atlas Karpathy Pipeline — docs/architecture/parent-atlas-karpathy-pipeline.md
  Reason: CHR97, Atlas, and retrieval-stage architecture context
- Neo4j GraphRAG Parent Atlas — docs/architecture/neo4j-graphrag-parent-atlas.md
  Reason: GraphRAG and topology-backed fallback behavior
- Legal AI Parent Atlas Product Integration — docs/architecture/legal-ai-parent-atlas-product-integration.md
  Reason: How retrieval and synthesis connect to product-facing flows
- TRACE KAG Web Development Guide — docs/architecture/trace-kag-web-development-guide.md
  Reason: Router/tool boundaries and TRACE/KAG implementation rules
- TRACE Runtime Split — docs/architecture/trace-runtime-split.md
  Reason: Gemma4, MCP, and raw infra boundary guidance
- Repo SvelteKit Route Atlas — docs/graph/repo-sveltekit-route-atlas.md
  Reason: Route-level surface map for app/API retrieval grounding
- Karpathy LLM Wiki — docs/codebase_atlas/karpathy_llmwiki.md
  Reason: Higher-level codebase atlas and synthesis reference
- LangGraph API Reference — memory/langgraph-api-reference.md
  Reason: LangGraph StateGraph, supervisor, and node orchestration reference for workflow design

## 2. Redis BitFrost Sample

- No `gpu:karpathy:scores` sample available from Redis.

## 3. Query Routing Results

### Query: why does the evidence upload modal reject files when qdrant is healthy and the Redis cache shows old gpu:karpathy:scores values

- Parsed files: none
- Parsed services: qdrant, Redis
- Parsed commands: none
- Parsed errors: none
- Subqueries:
  - why does the evidence upload modal reject files when qdrant is healthy
  - the Redis cache shows old gpu:karpathy:scores values
- Signal: semantic=0.90, lexical=0.90, graph=0.25, trust=0.10, messy=true
- Router dispatch: chr97, hyperrag
- CHR97 fast-path selected: false (0.35)
- Tool plan: mcp:service-inspector
- MCP tools: mcp:service-inspector
- gRPC calls: embeddings, rerank, vector-ops
- ACE sourceRefs: none
- Most relevant docs:
  - Parent Atlas Karpathy Pipeline — docs/architecture/parent-atlas-karpathy-pipeline.md (score=7.05)
  - Karpathy LLM Wiki — docs/codebase_atlas/karpathy_llmwiki.md (score=5.05)
  - Repo SvelteKit Route Atlas — docs/graph/repo-sveltekit-route-atlas.md (score=4.35)

### Query: find dependency path between src/lib/server/ace/context-assembler.ts and qdrant cluster prefilter code

- Parsed files: src/lib/server/ace/context-assembler.ts
- Parsed services: qdrant
- Parsed commands: none
- Parsed errors: none
- Subqueries:
  - find dependency path between src/lib/server/ace/context-assembler.ts
  - qdrant cluster prefilter code
- Signal: semantic=0.40, lexical=0.90, graph=0.85, trust=0.10, messy=true
- Router dispatch: graphrag
- CHR97 fast-path selected: false (0.26)
- Tool plan: mcp:service-inspector, mcp:codebase-file-lens
- MCP tools: mcp:service-inspector, mcp:codebase-file-lens
- gRPC calls: embeddings, rerank, vector-ops
- ACE sourceRefs: src/lib/server/ace/context-assembler.ts
- Most relevant docs:
  - Neo4j GraphRAG Parent Atlas — docs/architecture/neo4j-graphrag-parent-atlas.md (score=5.90)
  - Repo SvelteKit Route Atlas — docs/graph/repo-sveltekit-route-atlas.md (score=1.50)
  - Karpathy LLM Wiki — docs/codebase_atlas/karpathy_llmwiki.md (score=1.50)

### Query: check if Neo4j graph retrieval can explain failure of hermes tool output for TurboQuant router

- Parsed files: none
- Parsed services: Neo4j, hermes, TurboQuant
- Parsed commands: none
- Parsed errors: failure
- Subqueries:
  - check if Neo4j graph retrieval can explain failure of hermes tool output for TurboQuant router
- Signal: semantic=0.90, lexical=0.90, graph=0.85, trust=0.10, messy=false
- Router dispatch: chr97
- CHR97 fast-path selected: false (0.33)
- Tool plan: mcp:command-checker, mcp:service-inspector
- MCP tools: mcp:command-checker, mcp:service-inspector
- gRPC calls: embeddings, rerank, vector-ops
- ACE sourceRefs: none
- Most relevant docs:
  - Parent Atlas Karpathy Pipeline — docs/architecture/parent-atlas-karpathy-pipeline.md (score=5.20)
  - Legal AI Parent Atlas Product Integration — docs/architecture/legal-ai-parent-atlas-product-integration.md (score=3.50)
  - Karpathy LLM Wiki — docs/codebase_atlas/karpathy_llmwiki.md (score=2.20)

### Query: run a safe grep for old postgres migrations and explain why user_id mismatch happens in drift cases

- Parsed files: none
- Parsed services: postgres
- Parsed commands: none
- Parsed errors: mismatch
- Subqueries:
  - run a safe grep for old postgres migrations
  - explain why user_id mismatch happens in drift cases
- Signal: semantic=0.90, lexical=0.90, graph=0.25, trust=0.10, messy=true
- Router dispatch: chr97, hyperrag
- CHR97 fast-path selected: false (0.35)
- Tool plan: mcp:command-checker, mcp:service-inspector
- MCP tools: mcp:command-checker, mcp:service-inspector
- gRPC calls: embeddings, rerank, vector-ops
- ACE sourceRefs: none
- Most relevant docs:
  - Parent Atlas Karpathy Pipeline — docs/architecture/parent-atlas-karpathy-pipeline.md (score=6.05)
  - Legal AI Parent Atlas Product Integration — docs/architecture/legal-ai-parent-atlas-product-integration.md (score=4.05)
  - Karpathy LLM Wiki — docs/codebase_atlas/karpathy_llmwiki.md (score=4.05)

## 4. CHR97 Calibration

- Current threshold: 0.700 (fast-rate=0.000)
- Target fast-rate: 0.300 -> suggested threshold 0.351 (projected fast-rate=0.500)
- Confidence range: min=0.258, median=0.351, max=0.351
- Fast-rate gap to target: 0.300 (allowed=0.200, failOnDrift=false)
