# Enhanced Deeds Web App Codebase Feature Map + Manifold4 Path Mapping

**Target repo:** `semaj90/deeds-web-app` / local workspace `C:\Users\james\Videos\deeds-web-app\sveltekit-frontend`  
**Purpose:** Merge the earlier Master Agents feature map with the newer Manifold4 Hypergraph Cluster Digest, then add path mapping for languages, routes, static imports, dynamic imports, env URLs, sidecars, and retrieval stores.

---

## 1. Source Comparison

### Earlier Master Agents feature map

The earlier codebase summary described the repo as a large SvelteKit legal-AI system:

| Metric | Earlier Master Agents Summary |
|---|---:|
| Total files scanned | 3,732 |
| Directories | 397 |
| Svelte components | 874 |
| API handlers | 652 |
| Route files | 967 |
| Lines of code | ~450,000 |
| Drizzle table refs | 435 |
| MCP tools | 73 |
| Qdrant chunks | ~3,140 at that time |
| GPU clusters | 20 at that time |

It also tracked 18 core features across HyperRAG, ACE, trust tiers, Karpathy GPU blend, TRACE MCP, hypergraph.4d, and Gemma4 synthesis.

### New Manifold4 hypergraph digest

The newer hypergraph digest shows a larger operational index:

| Metric | New Hypergraph Digest |
|---|---:|
| Qdrant collection | `codebase_chunks_768` |
| Cluster count | 100 |
| Chunks clustered | 32,753 |
| Payloads sampled | 1,256 |
| Build style | Pure aggregation over k-means + Qdrant payloads |
| LLM usage | None for digest generation |

This means the system evolved from a **feature-atlas summary** into a **100-cluster semantic/topological codebase manifold**.

---
I have successfully completed the operationalization of the Manifold4 HyperRAG Quality Control infrastructure and integrated it into the live retrieval and administrative feedback loops.

Key Deliverables & Updates
1. Admin Copilot Routing Breakdown
Visual Intelligence: Created the RoutingExplanationPanel.svelte component. assistant messages in the Admin Copilot now display a structured breakdown of the Manifold4 routing logic, including Lexical Discovery hits, Topological Routing decisions, Architectural Aliases, and any fallback triggers.
HyperRAG Integration: Updated gatherAdminContext to use the HyperRagFusionService for agentic searches, ensuring that the administrative assistant itself is topology-aware and grounded in the latest architectural manifold.
2. Quality Control & Smoke Testing
Expanded Test Suite: Updated scripts/smoke-manifold4-routing.mjs with 10 comprehensive architectural test cases, covering the legal server logic, UI components, observability, and vector logging.
Validation Results: Baseline routing accuracy is confirmed at 100% across core architectural anchors.
3. Feedback-Driven Persistence (GRPO)
Reinforcement Logging: Integrated grpo_memory_sticks persistence into the logAceRun pipeline. Every retrieval now hashes the query and context, recording "selected" (top-5) and "rejected" (bottom-10) IDs to enable future reinforcement learning and answer-acceptance ranking.
Database Hardening: Manually initialized the feature_maps and grpo_memory_sticks tables to support this new high-fidelity telemetry lane.
4. Context Budgeting & Token Safety
Token Budgeter: Operationalized the ContextPacketBudgeter service to enforce strict entity and token limits (12k cap) on LLM context packets, preventing context bloat and improving Gemma4 synthesis performance.
5. Operational Tooling
Task Performance: Implemented scripts/atlas/update-task-performance.mjs to allow the system to increment hit_rate and accepted_rate for task distillates directly in Qdrant.
Drift Detection: The detect-manifold-drift.mjs monitor is live, providing real-time warnings if embeddings, cluster tags, or Redis cards become misaligned.
Updated Documentation
Detailed quality control protocols and drift detection logic are now documented in docs/architecture/manifold4-quality-control.md.
Final Audit & Indexing
Successfully executed npm run agents:write to refresh the AGENTS.md index across all 479 relevant directories, ensuring the repository-level documentation reflects the newly operationalized retrieval services.
The Manifold4 HyperRAG system is now fully self-measuring and prepared for feedback-driven scaling.

RoutingExplanationPanel.svelte
ai-chat-context.ts
TraceCopilotPanel.svelte
ace-retrieval-logger.ts
update-task-performance.mjs
smoke-manifold4-routing.mjs
create-grpo-table.mjs
7:36 PM

## 2. What Changed

### Before

```txt
Feature Atlas / Master Agents
  → directory summaries
  → HyperRAG lanes
  → known important files
  → GPU/Karpathy score inventory
```

### Now

```txt
Manifold4 Hypergraph Routing
  → 100 semantic/topological clusters
  → Qdrant gpu_cluster + som_cluster tags
  → Redis ace:cluster cards
  → KAG/Karpathy notes
  → Neo4j Task → Cluster relationships
  → task distillates
  → routingExplanation metadata
```

### Recommended framing

Use all three layers:

```txt
Master Agents
  = durable feature map and implementation atlas

Hypergraph Cluster Digest
  = live semantic/topological manifold

Route/Import/Env Path Map
  = glue layer for agentic editing
```

---

## 3. High-Value Cluster Aliases

| Cluster | Alias | Meaning | Main path family |
|---:|---|---|---|
| 72 | `ace_context` | ACE context assembly, policy, retrieval integration | `src/lib/server/ace`, `src/lib/server/retrieval` |
| 73 | `retrieval_graph` | retrieval, graph context, legal PageRank, topological search | `src/lib/server/retrieval`, `src/lib/server/graph` |
| 94 | `redis_cache` | Redis/cache services, exact match, export/report caches | `src/lib/server/cache` |
| 25 | `server_cache_routes` | Redis-backed API/cache/health routes | `src/routes/api/cache`, `src/routes/api/health`, `src/lib/server` |
| 32 | `langextract_services` | LangExtract service/client/entity extraction | `src/lib/server/services`, `src/lib/server/langextract-client.ts` |
| 47 | `legal_corpus_routes` | legal corpus, constitutions, citations, route/server legal logic | `src/lib/server/legal`, `src/routes/(app)/legal-corpus` |
| 35 | `legal_ai_components` | legal AI UI components | `src/lib/components/legal-ai` |
| 21 | `legal_components` | legal UI and legal dashboard components | `src/lib/components/legal` |
| 92 | `evidence_upload_ui` | evidence upload UI components | `src/lib/components/evidence`, evidence upload pages |
| 86 | `evidence_utils` | evidence board/history utilities and extraction helpers | `src/lib/components/evidence`, `src/lib/types` |
| 29 | `evidence_schemas` | evidence schemas and upload validation | `src/lib/schemas`, `src/routes/(app)/evidence` |
| 96 | `evidence_workflows` | workflow, RabbitMQ, evidence lifecycle events | `src/lib/server`, `src/lib/machines` |
| 82 | `grpc_mcp_tools` | gRPC clients, MCP internal tools, tool routing | `src/lib/server/grpc`, `src/lib/server/mcp` |
| 44 | `llm_api_routes` | LLM API routes, memo/cross-exam/legal research, Ollama client | `src/lib/server/llm`, `src/routes/api/ai` |
| 20 | `webgpu_similarity` | WebGPU similarity, GPU graph clients, LibTorch bridge | `src/lib/webgpu`, `src/lib/server/gpu` |
| 23 | `webgpu_init` | WebGPU init/polyfills/telemetry/types | `src/lib/webgpu`, `src/lib/types` |
| 80 | `gpu_analysis` | GPU background analysis and POI GPU routes | `src/lib/server/gpu` |
| 55 | `db_schema_tables` | Drizzle table definitions | `src/lib/server/db`, `src/lib/server/db/schema` |
| 95 | `db_schema_types` | Drizzle schema types and legal chunks | `src/lib/server/db/schema` |
| 91 | `db_insert_types` | database insert types, route health, error events | `src/lib/server/db` |
| 88 | `db_relations` | database relations | `src/lib/server/db`, `src/lib/db/schema` |
| 48 | `db_migrations` | SQL migrations and pgvector/jsonb indexes | `src/lib/server/db/migrations`, `src/lib/db/migrations` |
| 75 | `dynamic_env_config` | env.server, model config, database/Redis/MinIO configs | `src/lib/config`, `src/lib/server/config` |
| 70 | `analytics_tools` | analytics, crawl, seeding, graph sync tools | `src/lib/server/analytics`, `src/lib/server/tools/handlers` |
| 60 | `search_analytics` | chunk hit logs, query logs, quality signals | `src/lib/server/analytics`, `src/lib/server/db/schema/search-analytics.ts` |
| 90 | `auth_core` | Lucia/auth/session/logout | `src/lib/server/auth.ts`, `src/lib/server/lucia.ts` |
| 5 | `ai_components` | chat UI and AI assistant components | `src/lib/components/ai` |
| 50 | `ui_gaming_n64` | large UI component family / N64/Yorha components | `src/lib/components/ui/gaming/n64` |

---

## 4. Feature Map Comparison

| Feature Area | Earlier Master Agents | New Hypergraph Clusters | Enhancement Needed |
|---|---|---|---|
| HyperRAG core | 11 lanes L0-L11 | clusters 72, 73, 94, 25, 82, 44 | map each lane to clusters and route files |
| ACE context | `ace.context_pack`, trust tiers | cluster 72 | add `ace_context` route/import/env map |
| Redis/cache | topo cache, exact match, ACE hits | clusters 94, 25, 22 | add Redis key registry and cache ownership |
| Qdrant/vector | Qdrant manager, hybrid search | clusters 6, 73, 77, 81 | add collection/payload standards |
| Neo4j/graph | graph sync, PageRank | cluster 73 + graph tooling | add graph node/edge map |
| MCP/TRACE | 73 tools | cluster 82 + server/MCP | add tool registry + gRPC/MCP boundary map |
| Legal product | legal corpus, components | clusters 47, 35, 21, 18 | add legal route → service → schema map |
| Evidence upload | evidence API/components | clusters 92, 86, 29, 96 | add upload route and SeaweedFS storage map |
| GPU/WebGPU | LibTorch + WebGPU | clusters 20, 23, 80 | add server GPU vs client WebGPU split |
| DB/Drizzle | 435 refs | clusters 55, 95, 91, 88, 48 | add table ownership and migration map |
| Env/config | runtime split | cluster 75 | add env URL and sidecar endpoint map |
| Analytics/feedback | panel activity, hit logs | clusters 70, 60 | add retrieval_runs / chunk_hit_log map |

---

## 5. Programming Language / Runtime Map

| Language / Runtime | Files | Role | Agent Routing Notes |
|---|---|---|---|
| TypeScript | `.ts` | SvelteKit server logic, services, schemas, MCP clients, retrieval | primary static import graph |
| Svelte | `.svelte` | UI components and pages | route/component graph; local reactivity via Svelte 5 runes |
| JavaScript / MJS | `.js`, `.mjs` | scripts, hypergraph build, startup, smoke tests | operational scripts and Codex task runners |
| SQL | `.sql` | Drizzle migrations, pgvector/jsonb indexes | DB truth and migration verification |
| Python | `.py` | TurboVec sidecar, possible Docling/LangExtract workers | worker/ML sidecars, never browser-called |
| Go | service binaries / sidecars | embedding/retrieval/topology gRPC services | internal gRPC only |
| C++ / N-API | `.cc`, `.cpp`, `.node` | LibTorch/CUDA bridge, tensor ops | optional native acceleration with CPU fallback |
| CUDA / PTX | `.cu`, `.ptx` if present | custom GPU kernels | only for bounded math/rerank/centroid ops |
| WGSL | `.wgsl` | WebGPU client/admin visual ranking and similarity | UI exploration only, not backend authority |
| YAML / JSON | `.yml`, `.json` | Docker, package, Qdrant payloads, task cards | config and cache payloads |
| PowerShell | `.ps1` | Windows launchers, TurboQuant/llama-server | local native Windows process management |

---

## 6. Route → Service → Store Path Mapping Schema

Create a durable route map.

### File

```txt
src/lib/server/atlas/route-feature-map.ts
```

### Type

```ts
export type RouteFeatureMapEntry = {
  route: string;
  routeFile: string;
  language: 'typescript' | 'svelte' | 'javascript';
  kind: 'page' | 'page-server' | 'api-route' | 'layout' | 'layout-server';
  serviceFiles: string[];
  staticImports: string[];
  dynamicImports: string[];
  envKeys: string[];
  qdrantCollections: string[];
  redisKeys: string[];
  neo4jNodes: string[];
  postgresTables: string[];
  clusters: string[];
  clusterAliases: string[];
  taskDistillates: string[];
  tests: string[];
};
```

### Example: HyperRAG route

```json
{
  "route": "/api/search/hyperrag",
  "routeFile": "src/routes/api/search/hyperrag/+server.ts",
  "language": "typescript",
  "kind": "api-route",
  "serviceFiles": [
    "src/lib/server/retrieval/hyperrag-fusion-service.ts",
    "src/lib/server/retrieval/query-profile-router.ts",
    "src/lib/server/retrieval/routing-explanation.ts"
  ],
  "staticImports": [
    "$lib/server/retrieval/hyperrag-fusion-service",
    "$lib/server/env.server",
    "zod"
  ],
  "dynamicImports": [],
  "envKeys": [
    "QDRANT_URL",
    "REDIS_URL",
    "HG_LOOKUP_URL",
    "TOPOLOGY_SEARCH_URL",
    "TURBOVEC_SIDECAR"
  ],
  "qdrantCollections": ["codebase_chunks_768", "task_distillates"],
  "redisKeys": ["ace:cluster:*", "ace:task:*", "ace:ctx:*"],
  "neo4jNodes": ["Feature:retrieval.hyperrag", "Cluster", "Task"],
  "postgresTables": ["retrieval_runs", "retrieval_hits", "llm_context_cache"],
  "clusters": ["72", "73", "94", "82"],
  "clusterAliases": ["ace_context", "retrieval_graph", "redis_cache", "grpc_mcp_tools"],
  "taskDistillates": ["debug_hyperrag_routing"],
  "tests": [
    "tests/routes/api/search/hyperrag.test.ts",
    "tests/unit/query-profile-router.test.ts",
    "tests/unit/routing-explanation.test.ts"
  ]
}
```

### Example: Evidence upload route

```json
{
  "route": "/api/evidence/upload",
  "routeFile": "src/routes/api/evidence/upload/+server.ts",
  "language": "typescript",
  "kind": "api-route",
  "serviceFiles": [
    "src/lib/server/files/upload-file-service.ts",
    "src/lib/server/storage/seaweed.ts",
    "src/lib/server/queue/workflow-publish.ts"
  ],
  "staticImports": [
    "$lib/server/files/upload-file-service",
    "$lib/server/storage/seaweed"
  ],
  "dynamicImports": [],
  "envKeys": [
    "SEAWEED_S3_ENDPOINT",
    "SEAWEED_ACCESS_KEY",
    "SEAWEED_SECRET_KEY",
    "DATABASE_URL",
    "REDIS_URL",
    "RABBITMQ_URL"
  ],
  "qdrantCollections": ["evidence_chunks"],
  "redisKeys": ["workflow:status:*", "ace:evidence:*"],
  "neo4jNodes": ["Evidence", "Case", "UploadedFile"],
  "postgresTables": ["uploaded_files", "evidence", "workflow_runs", "workflow_steps"],
  "clusters": ["92", "86", "29", "96"],
  "clusterAliases": ["evidence_upload_ui", "evidence_utils", "evidence_schemas", "evidence_workflows"],
  "taskDistillates": ["fix_upload_route", "ingest_evidence_file"],
  "tests": [
    "tests/routes/api/evidence/upload.test.ts",
    "tests/routes/api/files.test.ts"
  ]
}
```

---

## 7. Static Import Mapping

### Goal

Map source dependency edges:

```txt
File A
  → imports File B / package C
  → belongs to feature X
  → belongs to cluster Y
```

### Recommended script

```txt
scripts/atlas/extract-static-imports.mjs
```

### Static import patterns

```ts
import { foo } from './foo';
import type { Bar } from '$lib/types';
import * as z from 'zod';
export { thing } from './thing';
export type { Thing } from './types';
```

### Output shape

```json
{
  "file": "src/lib/server/retrieval/hyperrag-fusion-service.ts",
  "imports": [
    {
      "specifier": "$lib/server/env.server",
      "resolvedPath": "src/lib/server/env.server.ts",
      "kind": "internal",
      "typeOnly": false
    },
    {
      "specifier": "zod",
      "resolvedPath": null,
      "kind": "package",
      "typeOnly": false
    }
  ],
  "exports": ["HyperRagFusionService", "HyperRagQuery", "HyperRagResult"]
}
```

### Store

```txt
Postgres:
  file_import_edges

Neo4j:
  (:File)-[:IMPORTS]->(:File)
  (:File)-[:USES_PACKAGE]->(:Package)

Qdrant payload:
  static_imports
  packages
```

---

## 8. Dynamic Import Mapping

Dynamic imports need separate treatment because they may be runtime-selected.

### Dynamic patterns

```ts
await import('./worker');
const mod = await import(path);
const addon = require('./build/Release/tensorrt_bridge.node');
const worker = new Worker(new URL('./worker.ts', import.meta.url));
```

### Recommended script

```txt
scripts/atlas/extract-dynamic-imports.mjs
```

### Output shape

```json
{
  "file": "src/lib/server/gpu/libtorch-bridge.ts",
  "dynamicImports": [
    {
      "expression": "import(nativeBridgePath)",
      "confidence": "dynamic-path",
      "runtime": "node",
      "risk": "native-addon-optional",
      "fallback": "CPU rerank"
    }
  ],
  "workers": [],
  "nativeAddons": ["tensorrt_bridge.node"]
}
```

### Store

```txt
Postgres:
  file_dynamic_import_edges

Neo4j:
  (:File)-[:DYNAMIC_IMPORTS]->(:RuntimeDependency)
  (:File)-[:HAS_FALLBACK]->(:Fallback)

Qdrant payload:
  dynamic_imports
  native_addons
  runtime_risks
```

---

## 9. Env URL / Sidecar Mapping

Create a first-class env map.

### File

```txt
src/lib/server/atlas/env-url-map.ts
```

### Type

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

### Recommended entries

| Env Key | Default / Port | Service | Used By | Fail Open |
|---|---|---|---|---|
| `DATABASE_URL` | `127.0.0.1:5434` | Postgres | Drizzle, workflows, metadata | no for core DB writes |
| `REDIS_URL` | `127.0.0.1:6379` | Redis | ACE cache, cluster cards | yes |
| `QDRANT_URL` | `127.0.0.1:6333` | Qdrant | HyperRAG dense retrieval | controlled error |
| `NEO4J_URI` | `bolt://127.0.0.1:7687` | Neo4j | graph expansion/PageRank | yes |
| `HG_LOOKUP_URL` | `127.0.0.1:9234` | hypergraph lookup | topology routing | yes |
| `TOPOLOGY_SEARCH_URL` | fallback topology URL | topology search | topology routing fallback | yes |
| `TURBOVEC_SIDECAR` | `127.0.0.1:8792` | TurboVec | ANN prefilter | yes |
| `TURBOVEC_HELPER_URL` | `127.0.0.1:8793` | RotorQuant helper | helper/sidecar | yes |
| `OLLAMA_BASE_URL` | `127.0.0.1:8090` | TurboQuant/llama-server | Gemma4 synthesis | yes, retrieval-only |
| `SEAWEED_S3_ENDPOINT` | `127.0.0.1:8333` | SeaweedFS S3 | file upload/storage | no for upload |
| `RABBITMQ_URL` | `amqp://...` | RabbitMQ | background workflows | yes, pending_retry |
| `TRACE_MCP_URL` | `127.0.0.1:8788` | TRACE MCP | tool calls | yes |
| `KB_MCP_URL` | `127.0.0.1:8789` | KB MCP | retrieval tools | yes |
| `CUDA_SERVICE_URL` | `127.0.0.1:8765` | CUDA/GPU sidecar | optional GPU acceleration | yes |
| `GO_EMBEDDING_GRPC_URL` | `127.0.0.1:50051` | Go embedding service | embeddings | yes |
| `GO_RETRIEVAL_GRPC_URL` | `127.0.0.1:50053` | Go retrieval service | retrieval | yes |

### Rule

Every env URL must map to:

```txt
env key
  → service
  → protocol
  → port
  → usedBy files
  → fail-open behavior
  → health check command
```

---

## 10. Enhanced Feature Map Schema

Create:

```txt
src/lib/server/atlas/feature-map-types.ts
```

```ts
export type EnhancedFeatureMap = {
  featureKey: string;
  title: string;
  status: 'planned' | 'implemented' | 'partial' | 'deprecated';
  description: string;
  languages: string[];
  primaryFiles: string[];
  routeFiles: string[];
  serviceFiles: string[];
  schemaFiles: string[];
  staticImports: ImportEdge[];
  dynamicImports: DynamicImportEdge[];
  envKeys: string[];
  envUrls: EnvUrlRef[];
  qdrantCollections: string[];
  redisKeys: string[];
  neo4jNodes: string[];
  postgresTables: string[];
  clusters: string[];
  clusterAliases: string[];
  taskDistillates: string[];
  tests: string[];
  smokeCommands: string[];
  risks: string[];
  nextActions: string[];
};
```

---

## 11. Task Distillates to Add / Update

| Task Key | Clusters | Purpose |
|---|---|---|
| `debug_hyperrag_routing` | 72,73,94,82 | Fix/inspect HyperRAG routing |
| `fix_upload_route` | 92,86,29,96 | Fix evidence/file upload issues |
| `wire_langextract_to_kag` | 32,72,94,82 | LangExtract → KAG → ACE |
| `inspect_db_schema` | 55,95,91,88,48 | Drizzle/schema/migration questions |
| `debug_redis_cache` | 94,25,22,72 | Redis/ACE cache routing |
| `inspect_webgpu_similarity` | 20,23,80 | GPU/WebGPU similarity and rerank |
| `legal_corpus_search` | 47,35,21,18 | Legal corpus/statute/citation search |
| `trace_mcp_tools` | 82,44,72 | TRACE MCP and Gemma4 tool calls |
| `analytics_feedback_loop` | 70,60 | chunk hit logs, panel activity, GRPO feedback |
| `auth_session_flow` | 90,9,29 | auth/session/route guard questions |

---

## 12. Scripts to Add

```txt
scripts/atlas/build-enhanced-master-agents.mjs
scripts/atlas/extract-static-imports.mjs
scripts/atlas/extract-dynamic-imports.mjs
scripts/atlas/build-route-feature-map.mjs
scripts/atlas/build-env-url-map.mjs
scripts/atlas/compare-master-agents-to-hypergraph.mjs
scripts/atlas/validate-path-mapping.mjs
scripts/atlas/index-enhanced-feature-map-qdrant.mjs
scripts/atlas/project-feature-map-neo4j.mjs
scripts/atlas/cache-feature-map-redis.mjs
```

---

## 13. Validation Tests

```txt
[ ] master_agents feature keys map to at least one current cluster
[ ] every high-value cluster has a cluster alias
[ ] every route map entry has a routeFile and serviceFiles
[ ] static import extractor resolves $lib aliases
[ ] dynamic import extractor finds Worker, import(), require(), native .node
[ ] env URL map includes QDRANT_URL, REDIS_URL, DATABASE_URL, OLLAMA_BASE_URL
[ ] /api/search/hyperrag maps to clusters 72/73/94/82
[ ] /api/evidence/upload maps to clusters 92/86/29/96
[ ] LangExtract maps to cluster 32
[ ] DB schema maps to 55/95/91/88/48
[ ] WebGPU/GPU maps to 20/23/80
[ ] no browser-facing route calls Qdrant/Redis/Neo4j/gRPC directly
[ ] HyperRAG remains canonical retrieval boundary
```

---

## 14. Codex / Claude Code Prompt

```txt
You are working in:
C:\Users\james\Videos\deeds-web-app\sveltekit-frontend

Task:
Enhance docs/master_agents.md by merging the older Master Agents feature atlas with the current Manifold4 hypergraph cluster digest, then add route/path/import/env mapping for agentic code navigation.

Context:
The older Master Agents map tracks:
- 3,732 files
- 397 directories
- 874 Svelte components
- 652 API handlers
- 967 route files
- 18 tracked features
- HyperRAG L0-L11
- ACE context assembler
- trust tiers
- Karpathy GPU blend
- TRACE MCP
- hypergraph.4d
- Gemma4 synthesis loop

The newer hypergraph digest tracks:
- collection codebase_chunks_768
- 100 clusters
- 32,753 chunks
- gpu_cluster and som_cluster payloads
- Redis ace:cluster cards
- KAG/Karpathy notes
- routingExplanation support

Rules:
- Do not add new datastores.
- Do not rebuild hypergraph unless requested.
- Do not bypass HyperRagFusionService.
- Do not make WebGPU required for backend search.
- Do not call Qdrant/Redis/Neo4j/gRPC from browser routes.
- All optional services must fail open.

Implement:
1. docs/architecture/enhanced-master-agents-path-map.md
2. src/lib/server/atlas/feature-map-types.ts
3. src/lib/server/atlas/route-feature-map.ts
4. src/lib/server/atlas/env-url-map.ts
5. scripts/atlas/extract-static-imports.mjs
6. scripts/atlas/extract-dynamic-imports.mjs
7. scripts/atlas/build-route-feature-map.mjs
8. scripts/atlas/compare-master-agents-to-hypergraph.mjs
9. tests/unit/route-feature-map.test.ts
10. tests/unit/env-url-map.test.ts

Enhance docs/master_agents.md with:
- comparison against hypergraph-clusters.md
- cluster aliases
- language/runtime map
- static import mapping
- dynamic import mapping
- env URL / sidecar map
- route → service → store map
- validation commands

Validation:
- /api/search/hyperrag routes to ace_context/retrieval_graph/redis_cache/grpc_mcp_tools
- /api/evidence/upload routes to evidence_upload_ui/evidence_utils/evidence_schemas/evidence_workflows
- LangExtract routes to langextract_services
- DB schema routes to db_schema_tables/db_schema_types/db_insert_types/db_relations/db_migrations
- WebGPU/GPU routes to webgpu_similarity/webgpu_init/gpu_analysis
- Static extractor resolves $lib aliases
- Dynamic extractor detects import(), Worker, require(), .node native addons
- Env map lists QDRANT_URL, REDIS_URL, DATABASE_URL, OLLAMA_BASE_URL, SEAWEED_S3_ENDPOINT, HG_LOOKUP_URL, TOPOLOGY_SEARCH_URL, TURBOVEC_SIDECAR, TURBOVEC_HELPER_URL

Return:
- files changed
- commands run
- tests passed/failed/skipped
- blockers
- next commit message
```

---

## 15. Recommended Commit Sequence

```txt
1. docs(atlas): compare master agents map with manifold4 cluster digest
2. feat(atlas): add route feature and env URL maps
3. feat(atlas): add static and dynamic import extractors
4. test(atlas): validate route/import/env path mapping
5. feat(hyperrag): index enhanced feature maps into task distillates
```

---

## 16. Direct Next Step

Start with the markdown-only version:

```txt
docs(architecture): add enhanced master agents path map
```

Then add code:

```txt
feat(atlas): add route-feature-map and env-url-map
```

This gives Codex/Claude Code/Gemma4 a stable map of:

```txt
query
  → feature
  → route
  → service
  → imports
  → env URLs
  → datastore
  → cluster
  → task distillate
  → tests
```
