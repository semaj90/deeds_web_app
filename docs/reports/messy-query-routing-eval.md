# Phase 18 — Messy Query Orchestration Evaluation

Generated: 2026-05-19T02:31:44.583Z

## 1. Redis BitFrost Sample

- No `gpu:karpathy:scores` sample available from Redis.

## 2. Query Routing Results

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
