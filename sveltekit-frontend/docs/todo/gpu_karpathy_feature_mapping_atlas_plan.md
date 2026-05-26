# Deeds Web App — Consolidated Feature Breakdown + GPU/Karpathy Atlas Enhancement Plan

**Repo target:** `semaj90/deeds_web_app`  
**Local target:** `C:\Users\james\Videos\deeds-web-app\sveltekit-frontend`  
**Goal:** Align the consolidated repo with the latest Manifold4 / HyperRAG / ACE / Karpathy / GPU indexing direction and define the next graph/indexing/memory-optimization upgrades.

---

## 1. Repo Status

`semaj90/deeds_web_app` should be treated as the consolidated active repo.

Evidence:

- It is much larger than `semaj90/deeds-web-app`.
- GitHub search surfaced recent ACE/Manifold4/HyperRAG-aligned work in `semaj90/deeds_web_app`.
- The repo contains anchors such as:
  - `sveltekit-frontend/src/mcp/trace-mcp-server.ts`
  - `sveltekit-frontend/docs/architecture/hyperrag-feature-atlas-runtime.md`
  - `sveltekit-frontend/src/lib/server/ace/context-assembler.ts`
  - `sveltekit-frontend/docs/master_agents.md`
  - `sveltekit-frontend/docs/graph/deep-audit-ast.json`

The local workspace may still contain the very latest Manifold4 quality-control files that have not yet been pushed.

---

## 2. Existing Feature Families

### 2.1 HyperRAG Retrieval

Current role:

```txt
User query
  → lexical discovery
  → topology routing
  → profile priors
  → task distillates
  → Qdrant semantic search
  → Neo4j graph expansion
  → Redis ACE cards
  → weighted fusion
  → Gemma4 synthesis
```

Existing / expected anchors:

```txt
src/lib/server/retrieval/hyperrag-fusion-service.ts
src/lib/server/retrieval/query-profile-router.ts
src/lib/server/retrieval/routing-explanation.ts
scripts/hyperrag-dense-multiquery.mjs
src/lib/server/retrieval/cluster-aware-reranker.ts
src/lib/server/retrieval/centroid-cache.ts
```

Enhance next:

```txt
[ ] Persist every routingExplanation into ace_retrieval_runs JSONB.
[ ] Add per-lane hit records to ace_retrieval_hits.
[ ] Add route-aware retrieval priors from route-feature-map.
[ ] Add expected-cluster smoke tests.
[ ] Add query budgeter to avoid prompt/context bloat.
```

---

### 2.2 ACE / BitFrost Context Cache

Current role:

```txt
Logical context packet reuse:
  chunk IDs
  graph paths
  cluster cards
  task distillates
  summaries
  tool policy
```

Not raw model KV cache.

Existing / expected anchors:

```txt
src/lib/server/ace/context-assembler.ts
src/lib/server/ace/llm-context-cache.ts
src/lib/server/ace/context-packet-budgeter.ts
src/lib/server/ace/agents-context-source.ts
```

Enhance next:

```txt
[ ] Keep cache key identity tied to repo SHA, model/backend, prompt hash, tool hash, corpus hash, graph snapshot.
[ ] Cache final context packets in Redis ace:ctx:{cacheKey}.
[ ] Store durable packet metadata in Postgres llm_context_cache or ace_retrieval_runs.
[ ] Store local fallback packets under .cache/ace/context-packs/.
[ ] Never store raw KV cache, tensors, native pointers, or hidden reasoning.
```

---

### 2.3 TRACE MCP / Agentic Tool Surface

Current role:

```txt
Model-facing safe tool protocol.
Gemma4/Claude/Codex should call allowlisted tools only.
```

Existing anchor:

```txt
src/mcp/trace-mcp-server.ts
```

Known tools to keep read-only:

```txt
trace.kag_search
trace.explain_retrieval
trace.graphrag_search
topology.search_near
topology.same_som_cluster
topology.search_som_neighborhood
search.rerank
context.prefetch_feature_context
```

Enhance next:

```txt
[ ] Add context.prefetch_feature_context for pre-edit context packing.
[ ] Add feature-aware tool metadata: featureKey, clusters, risks, maxResultChars.
[ ] Enforce maxToolRounds=3.
[ ] Add smoke-agentic-tools test.
[ ] Block raw shell, apply_patch, destructive DB mutations, external sends.
```

---

### 2.4 Manifold4 / Hypergraph / Topological Routing

Current role:

```txt
Qdrant codebase embeddings
  → k-means clusters
  → SOM / manifold4 coordinates
  → Redis cluster cards
  → Neo4j cluster graph
  → HyperRAG route filters
```

Current digest signals:

```txt
Qdrant collection: codebase_chunks_768
Cluster count: 100
Chunks clustered: 32,753+
Payloads sampled: 1,256
```

Enhance next:

```txt
[ ] Validate 99%+ gpu_cluster/som_cluster/manifold4 coverage.
[ ] Track manifold4 = [som_x, som_y, semantic_z, activity_w].
[ ] Update activity_w from retrieval hit rate, accepted answer rate, test pass rate, graph authority.
[ ] Add detect-manifold-drift.mjs.
[ ] Add update-manifold-activity.mjs.
[ ] Add route-feature-map cluster priors.
```

Recommended activity formula:

```txt
activity_w =
  0.35 * retrieval_hit_rate
+ 0.25 * accepted_answer_rate
+ 0.20 * recent_usage_decay
+ 0.10 * test_pass_rate
+ 0.10 * graph_authority
```

---

### 2.5 Karpathy / GPU Blend / Codebase Indexing

Current role:

```txt
GPU-assisted codebase mapping:
  PageRank
  attention score
  authority score
  encoded summaries
  optional autoencoder compression
```

Existing direction from prior notes:

```txt
Karpathy blend = 0.4 * pagerank + 0.3 * attention + 0.3 * authority
Redis hash: gpu:karpathy:scores
Encoded vectors: gpu:karpathy:encoded
```

Enhance next:

```txt
[ ] Add GPU autoencoder 768d → 64d for routing/compression only.
[ ] Store compressed vector refs, not raw tensors, in Redis.
[ ] Add CUDA/LibTorch rerank as optional canary.
[ ] Add CPU fallback for every GPU path.
[ ] Add batch processing with worker threads for chunk metadata and hashing.
[ ] Add async N-API for graphSimilarity / batchCosineSimilarity if native addon exists.
```

Do not:

```txt
[ ] Do not make GPU required for indexing.
[ ] Do not store CUDA tensors in Redis.
[ ] Do not require WebGPU for backend search.
[ ] Do not run Gemma4 in worker pool except selective summaries.
```

---

### 2.6 Feature Mapping Atlas

Current role:

```txt
Remember:
  what was built
  why it was built
  where it lives
  what it depends on
  what broke before
  what to prefetch next time
```

Minimum feature record:

```json
{
  "featureId": "feature:trace:graphrag-search",
  "title": "TRACE GraphRAG Search",
  "status": "implemented",
  "implementedAt": "2026-05-10T00:41:49Z",
  "sourcePromptHash": "sha256:...",
  "sourcePromptSummary": "Add GraphRAG dense+sparse+graph retrieval lane.",
  "files": [],
  "retrieval": {
    "qdrantCollections": ["codebase_chunks_768"],
    "redisKeys": ["feature:trace:graphrag-search", "wiki:note:*"],
    "neo4jNodes": ["Feature", "File", "Tool", "Cluster"],
    "topology": {
      "clusterKey": "gpu:...",
      "somCluster": "...",
      "manifold4": [0.12, -0.33, 0.81, 0.44]
    }
  },
  "summaryTags": ["graphrag", "dense-search", "neo4j", "qdrant", "mcp-tool"],
  "futureEditingHints": []
}
```

Enhance next:

```txt
[ ] `npm run feature-gap:registry:report` -> writes the live atlas-backed registry slice to `docs/reports/feature-gap-registry-live-latest.json`.
[ ] scripts/features/record-feature-implementation.mjs
[ ] scripts/features/derive-feature-map.mjs
[ ] scripts/features/prefetch-feature-context.mjs
[ ] Postgres feature_implementations table
[ ] Neo4j (:Feature)-[:TOUCHES]->(:File)
[ ] Neo4j (:Feature)-[:REGISTERS]->(:McpTool)
[ ] Redis feature:{featureId}
[ ] Qdrant task_distillates / feature cards
```

---

### 2.7 Static / Dynamic Import Atlas

Current need:

```txt
Agentic coding needs to know which files must be read first.
```

Use topological sort for dependency order, not semantic similarity.

Correct dependency order example:

```txt
schema
  → service
  → MCP tool
  → synth loop
  → dashboard
  → tests
  → docs
```

Enhance next:

```txt
[ ] Extract static imports for TypeScript/Svelte/JS.
[ ] Extract dynamic imports: import(), require(), Worker(new URL()), native .node addons.
[ ] Resolve $lib aliases.
[ ] Store file_import_edges in Postgres or JSON snapshot.
[ ] Project (:File)-[:STATIC_IMPORTS]->(:FileOrLibrary) into Neo4j.
[ ] Project (:File)-[:DYNAMIC_IMPORTS]->(:RuntimeDependency) into Neo4j.
[ ] Use topological sort to produce agent read order.
```

---

### 2.8 Route / Env / Sidecar Map

Current need:

```txt
Given a route or error, find:
  page/API file
  server services
  env URLs
  sidecars
  datastores
  tests
  clusters
```

Enhance next:

```txt
[ ] src/lib/server/atlas/route-feature-map.ts
[ ] src/lib/server/atlas/env-url-map.ts
[ ] scripts/atlas/build-route-feature-map.mjs
[ ] scripts/atlas/build-env-url-map.mjs
```

Env map fields:

```ts
export type EnvUrlMapEntry = {
  envKey: string;
  defaultValue?: string;
  service: string;
  protocol: 'http' | 'grpc' | 'postgres' | 'redis' | 's3' | 'amqp' | 'bolt';
  port?: number;
  usedBy: string[];
  clusterAliases: string[];
  failOpen: boolean;
};
```

Critical env keys:

```txt
DATABASE_URL
REDIS_URL
QDRANT_URL
NEO4J_URI
HG_LOOKUP_URL
TOPOLOGY_SEARCH_URL
TURBOVEC_SIDECAR
OLLAMA_BASE_URL
SEAWEED_S3_ENDPOINT
RABBITMQ_URL
TRACE_MCP_URL
KB_MCP_URL
CUDA_SERVICE_URL
GO_EMBEDDING_GRPC_URL
GO_RETRIEVAL_GRPC_URL
```

---

### 2.9 Legal-AI Product Layer

Current target product:

```txt
Evidence-centered legal/case intelligence:
  victim help
  detective mode
  prosecutor review
  evidence organization
  crime analysis
  what/who/why/how
  statute matching
  similar case retrieval
  optional scene reconstruction
```

Enhance next:

```txt
[ ] CrimeAnalysisService
[ ] /api/legal/analyze-crime
[ ] AgentWorkflowOrchestrator plan-only mode
[ ] Docling / Granite document parsing worker
[ ] LangExtract structured extraction worker
[ ] KAG projection for entities/events/claims/crime signals
[ ] Legal output separation: facts / allegations / inferences / unknowns
[ ] Human review required for legal conclusions
```

---

### 2.10 Ingestion / OCR / LangExtract / Docling

Current desired flow:

```txt
PDF / doc / image / transcript
  → SeaweedFS
  → Docling / Granite-Docling
  → LangExtract
  → chunks + summaries
  → EmbeddingGemma
  → Qdrant
  → Neo4j
  → Redis ACE context
  → Gemma4 synthesis
```

Enhance next:

```txt
[ ] workers/docling-worker/
[ ] workers/langextract-worker/
[ ] src/lib/server/extraction/langextract-client.ts
[ ] src/lib/server/extraction/legal-extraction-normalizer.ts
[ ] src/lib/server/kag/kag-projection-service.ts
[ ] RabbitMQ queues: evidence.docling, evidence.langextract, evidence.embed, evidence.index_qdrant, evidence.graph_edges
```

---

### 2.11 Master Atlas Reconciliation

Current need:

```txt
Merge distributed intelligence:
  source code
  tests
  DB/migrations
  Qdrant payloads
  Neo4j edges
  Redis keys
  CouchDB wiki
  AGENTS.md cards
  runtime traces
```

Use DuckDB for local reconciliation, not SurrealDB/Spark/Kafka yet.

Enhance next:

```txt
[ ] scripts/atlas/reconcile-master-atlas.mjs
[ ] Export Qdrant payload sample to tmp/atlas/qdrant_chunks.ndjson
[ ] Export Neo4j nodes/edges to tmp/atlas/neo4j_edges.ndjson
[ ] Export CouchDB wiki docs to tmp/atlas/wiki_docs.ndjson
[ ] Export Postgres metadata_envelopes to tmp/atlas/metadata_envelopes.ndjson
[ ] Load all exports into DuckDB temp tables
[ ] Emit docs/graph/master-atlas-reconciliation.md
[ ] Emit logs/atlas/reconcile-latest.json
[ ] Add npm run atlas:reconcile
```

Source-of-truth precedence:

```txt
1. Source code + tests
2. DB introspection / migrations
3. docs/master_agents.md + CLAUDE.md
4. KAG/ACE runtime traces
5. Qdrant/Neo4j/CouchDB/Redis projections
6. AGENTS.md generated cards
7. LLM summaries
```

---

## 3. Programming Languages / AST Detection Plan

### Languages to detect

```txt
TypeScript
Svelte
JavaScript / MJS
SQL
Python
Go
C++
CUDA
WGSL
JSON
YAML
PowerShell
Markdown
```

### AST extractors

| Language | Extractor |
|---|---|
| TypeScript / JavaScript | TypeScript compiler API or ts-morph |
| Svelte | svelte/compiler + parse `<script>` blocks |
| SQL | regex + sql-formatter/parser for table/index refs |
| Python | Python `ast` module in sidecar or tree-sitter |
| Go | `go list`, `go/parser`, or tree-sitter |
| C++ / CUDA | tree-sitter-cpp / ripgrep symbols first |
| WGSL | regex/tree-sitter-wgsl if available |
| JSON/YAML | native parsers |
| Markdown | markdown-it / unified / remark |

### Common output

```json
{
  "file": "src/lib/server/retrieval/hyperrag-fusion-service.ts",
  "language": "typescript",
  "symbols": [],
  "staticImports": [],
  "dynamicImports": [],
  "exports": [],
  "envKeys": [],
  "routes": [],
  "datastores": [],
  "sidecars": [],
  "tests": [],
  "clusters": [],
  "manifold4": [0, 0, 0, 0]
}
```

---

## 4. Graph Parameter Upgrade

Add more graph properties, not just more nodes.

### Node parameters

```txt
File:
  path
  language
  file_hash
  loc
  last_modified
  cluster_id
  som_cluster
  manifold4
  pagerank
  audit_status
  route_count
  test_count

Feature:
  feature_key
  status
  source_prompt_hash
  source_prompt_summary
  implemented_at
  tags
  trust_tier
  activity_w

Route:
  route_path
  route_type
  auth_required
  env_keys
  sidecars
  fail_open_policy

Chunk:
  chunk_id
  content_hash
  embedding_model
  qdrant_collection
  point_id
  summary_hash
  token_count

Task:
  task_key
  tool_policy
  recommended_actions
  cluster_aliases
  hit_rate
  accepted_rate
```

### Edge parameters

```txt
STATIC_IMPORTS:
  type_only
  resolved
  import_specifier

DYNAMIC_IMPORTS:
  expression
  confidence
  fallback

USES_ENV:
  env_key
  required
  fail_open

USES_STORE:
  store
  collection_or_table
  access_mode

BELONGS_TO_CLUSTER:
  distance_to_centroid
  cluster_confidence

PRODUCED_BY:
  source_prompt_hash
  commit_sha
  agent
```

---

## 5. Memory Optimization Plan

### CPU / Node

```txt
[ ] Use directory checkpoint hashes.
[ ] Skip unchanged files.
[ ] Batch Qdrant payload updates.
[ ] Use worker threads for hashing/chunking/metadata extraction.
[ ] Keep Vite separate from heavy indexers.
[ ] Run graph/index jobs in tmux separate lanes.
```

### Redis

```txt
[ ] Store hot cards only.
[ ] TTL cluster/task cards if rebuildable.
[ ] Pipeline Redis writes.
[ ] Avoid storing raw chunks unless tiny summaries.
[ ] Use contentHash and queryHash keys.
```

### Qdrant

```txt
[ ] Use payload filters: feature_key, cluster_alias, gpu_cluster, som_cluster, path, language.
[ ] Keep raw text in Postgres/SeaweedFS, not only Qdrant.
[ ] Store summaries in payload only if small.
[ ] Add task_distillates collection.
[ ] Add directory_summaries_768 collection.
```

### Neo4j

```txt
[ ] Do not run PageRank inline per query.
[ ] Precompute PageRank/community if possible.
[ ] Cache graph neighborhoods.
[ ] Project only useful multi-hop paths into ACE context.
```

### GPU

```txt
[ ] Use GPU for vector/tensor math only.
[ ] Use CPU for AST, rg, JSON normalization, path mapping.
[ ] Add optional batch cosine / attention rerank.
[ ] Add autoencoder compression as routing aid, not canonical data.
[ ] Use CPU fallback for every GPU bridge.
```

---

## 6. Hyper-Dense HMM / KAG Search Upgrade

Interpret "HMM" here as hidden state routing, not a full probabilistic model at first.

### Query hidden states

```txt
semantic_intent
lexical_symbol
route_path
graph_traversal
legal_case
evidence_ingest
code_debug
gpu_topology
env_config
db_schema
```

### Routing state machine

```txt
query
  → classify hidden state
  → choose profile priors
  → choose cluster aliases
  → choose retrieval lanes
  → choose budget
  → choose tool policy
```

### State output

```json
{
  "hiddenState": "code_debug",
  "profile": "agent_workflow",
  "clusters": ["72", "82", "94"],
  "lanes": ["lexical", "topology", "task", "qdrant", "neo4j"],
  "budget": {
    "taskDistillates": 2,
    "clusterCards": 3,
    "graphPaths": 8,
    "rawChunks": 12
  },
  "toolPolicy": "read_only"
}
```

---

## 7. Web Search Ingest Fallback

Use web search as a low-trust lane.

```txt
Trust tier:
  T4 external / unverified

Allowed:
  docs lookup
  dependency version check
  official docs
  missing API behavior

Not allowed:
  override repo truth
  legal conclusion
  replace source evidence
```

Flow:

```txt
query
  → local HyperRAG first
  → if miss or stale dependency:
      web search official docs
      summarize with source
      store as external_web_note
      do not make canonical until reviewed
```

Store:

```txt
Postgres metadata_envelopes:
  source_type = external_web_note

Qdrant:
  external_docs_chunks

Redis:
  temporary ace:web:{queryHash}

Neo4j:
  (:ExternalDoc)-[:REFERENCES]->(:Library)
```

---

## 8. Prioritized Build Plan

### Phase 1 — Graph schema enrichment

```txt
[ ] Add feature-map-types.ts.
[ ] Add route-feature-map.ts.
[ ] Add env-url-map.ts.
[ ] Add graph parameter schema docs.
[ ] Add import extractors for TS/Svelte/JS.
[ ] Add language detector.
```

### Phase 2 — Feature Mapping Atlas

```txt
[ ] record-feature-implementation.mjs
[ ] derive-feature-map.mjs
[ ] prefetch-feature-context.mjs
[ ] Write feature cards to memory/features/*.json.
[ ] Write markdown cards to karpathy-wiki/features/*.md.
[ ] Upsert feature cards to Qdrant task_distillates.
[ ] Upsert graph edges to Neo4j.
[ ] Cache feature cards in Redis.
```

### Phase 3 — GPU/Karpathy indexing

```txt
[ ] Add encoded64 autoencoder lane.
[ ] Add gpu:karpathy:encoded Redis hash.
[ ] Add batch cosine / attention rerank smoke.
[ ] Add memory cap and CPU fallback.
[ ] Add worker-thread chunk pipeline.
```

### Phase 4 — Atlas reconciliation

```txt
[ ] Add DuckDB local reconcile script.
[ ] Export Postgres/Qdrant/Neo4j/CouchDB/Redis snapshots.
[ ] Emit master-atlas-reconciliation.md.
[ ] Emit reconcile-latest.json.
```

### Phase 5 — Product wiring

```txt
[ ] CrimeAnalysisService.
[ ] AgentWorkflowOrchestrator.
[ ] LangExtract bridge.
[ ] Docling worker.
[ ] KAG projection.
[ ] Legal output safety separation.
```

---

## 9. Validation Commands

```bash
npm run smoke:atlas
npm run smoke:graphify
npm run smoke:hyperrag
npm run smoke:trace
npm run smoke:manifold4-routing
npm run atlas:reconcile -- --dry-run
npm run agents:write -- --dry-run --limit 25
npx vitest run tests/unit/context-packet-budgeter.test.ts
npx vitest run tests/unit/query-profile-router.test.ts
npx vitest run tests/unit/routing-explanation.test.ts
```

GPU/native validation:

```bash
pnpm test gpu-cluster-correctness gpu-graph-safety
node scripts/smoke-gpu-hardening.mjs
pnpm run typecheck:native
```

---

## 10. Codex / Claude Code Prompt

```txt
You are working in:
C:\Users\james\Videos\deeds-web-app\sveltekit-frontend

Task:
Upgrade the consolidated deeds_web_app codebase into a complete GPU/Karpathy Feature Mapping Atlas.

Context:
The active repo is semaj90/deeds_web_app. It already contains TRACE MCP, HyperRAG runtime docs, ACE context assembly, master_agents.md, deep-audit AST JSON, and a Manifold4 hypergraph digest over codebase_chunks_768.

Current architecture:
- Postgres = durable truth / JSONB metadata / retrieval traces
- Qdrant = semantic vector retrieval
- Neo4j = graph/KAG/DAG multi-hop traversal
- Redis = ACE/BitFrost hot cache
- CouchDB = Karpathy wiki / MapReduce pages
- SeaweedFS = cold document/object storage
- RabbitMQ = background workflows
- Gemma4 = planner/synthesizer
- EmbeddingGemma = embeddings
- LibTorch/CUDA/WebGPU = optional acceleration, not canonical truth

Rules:
- Do not add new datastores.
- Do not add SurrealDB, Spark, or Kafka.
- Do not bypass HyperRagFusionService.
- Do not make GPU/WebGPU required for backend correctness.
- Do not store raw KV cache, raw tensors, native pointers, or hidden reasoning.
- Use topological sort only for dependency ordering.
- Use Qdrant for semantic similarity.
- Use Neo4j for graph traversal.
- Use manifold4/SOM for topology neighborhoods.
- Use Redis only for hot cache.
- Everything optional must fail open.

Implement:
1. src/lib/server/atlas/feature-map-types.ts
2. src/lib/server/atlas/route-feature-map.ts
3. src/lib/server/atlas/env-url-map.ts
4. scripts/atlas/detect-programming-languages.mjs
5. scripts/atlas/extract-static-imports.mjs
6. scripts/atlas/extract-dynamic-imports.mjs
7. scripts/features/record-feature-implementation.mjs
8. scripts/features/derive-feature-map.mjs
9. scripts/features/prefetch-feature-context.mjs
10. scripts/atlas/reconcile-master-atlas.mjs
11. docs/architecture/gpu-karpathy-feature-mapping-atlas.md

Enhance:
- docs/master_agents.md
- docs/architecture/enhanced-master-agents-path-map.md
- docs/graph/master-atlas-reconciliation.md if generated

Validation:
- Static extractor resolves $lib aliases.
- Dynamic extractor detects import(), require(), Worker(new URL()), .node native addons.
- Language detector classifies TS/Svelte/JS/MJS/SQL/Python/Go/C++/CUDA/WGSL/JSON/YAML/PowerShell/Markdown.
- /api/search/hyperrag maps to ace_context/retrieval_graph/redis_cache/grpc_mcp_tools.
- /api/evidence/upload maps to evidence_upload_ui/evidence_utils/evidence_schemas/evidence_workflows.
- LangExtract maps to langextract_services.
- DB schema maps to db_schema_tables/db_schema_types/db_insert_types/db_relations/db_migrations.
- GPU/WebGPU maps to webgpu_similarity/webgpu_init/gpu_analysis.
- Feature cards write to JSON first in dry-run.
- Neo4j/Qdrant/Redis writes are dry-run by default.
- No browser-facing route calls Qdrant/Redis/Neo4j/gRPC directly.

Return:
- files changed
- commands run
- tests passed/failed/skipped
- blockers
- next commit message
```

---

## 11. Recommended Commit Sequence

```txt
1. docs(atlas): define GPU Karpathy Feature Mapping Atlas
2. feat(atlas): add feature map, route map, and env URL types
3. feat(atlas): add language and import extractors
4. feat(features): record feature implementations from prompt/git/AST metadata
5. feat(context): add feature-aware prefetch context
6. feat(atlas): add DuckDB master atlas reconciliation
7. feat(gpu): add optional encoded64 autoencoder routing lane
8. test(atlas): validate route/import/env/language mapping
```
