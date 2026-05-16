# Subgraph Instruction Programming + KAG/ACE Topology TODO

**Goal:** Model the SvelteKit 2 application as a multi-page SSR/API-gateway system with agentic pathfinding, KAG/DAG retrieval, BitFrost ACE cache packets, Drizzle/Postgres truth, Qdrant dense search, Neo4j graph traversal, Redis hot cache, and optional sidecars for gRPC/TurboVec/media workers.

---

## 1. Architecture Decision

This app should be treated as a **multi-page web application**, not a pure SPA.

```text
SvelteKit 2
  = SSR + server load functions + form actions + API gateway + UI shell

Svelte 5 runes
  = component state and client interactivity

Bits UI v2
  = accessible headless UI primitives

Superforms v2 + Zod
  = typed server/client form validation and file upload workflows

Drizzle ORM + Postgres
  = durable source of truth and SQL-shaped application model

Redis
  = hot cache and BitFrost/ACE context packet memory

Qdrant
  = dense/hybrid semantic retrieval

Neo4j
  = graph paths, KAG/DAG, topology, subgraph traversal

CouchDB
  = stitched wiki pages and MapReduce rollups

SeaweedFS
  = evidence/media/document binary storage

gRPC/Protobuf
  = typed sidecar worker boundary

MCP
  = safe model-facing tool boundary

Gemma4/TurboQuant
  = local inference, planning, synthesis
```

---

## 2. Why SSR/MWA, Not SPA

Use SvelteKit as a server-rendered app with progressive enhancement:

```text
+page.server.ts
  → auth
  → DB query
  → initial dashboard data

+page.svelte
  → Svelte 5 runes
  → Bits UI components
  → progressive interactivity

+server.ts
  → API gateway to internal services

form actions
  → safe uploads
  → validated form submissions
```

Use SPA-like behavior only where it helps:

```text
timeline scrubber
video frame viewer
chat streaming
workflow progress panel
dashboard live refresh
```

Do not convert the whole app into a client-only SPA.

---

## 3. UI/Form Stack

### Svelte 5 runes

Use:

```text
$state     = local mutable component state
$derived   = computed state
$effect    = browser/client side effects
$props     = typed component props
```

### Bits UI

Use for:

```text
Dialog
Tabs
Dropdown Menu
Popover
Select
Command
Tooltip
Progress
Scroll Area
Pagination
```

### Superforms v2 + Zod

Use for:

```text
evidence upload forms
case creation/edit forms
workflow retry/cancel forms
patch proposal approval forms
daily atlas filter forms
search forms
```

Form pattern:

```text
Zod schema
  → server validation
  → Superforms load
  → enhance
  → action result
  → invalidate specific data
  → UI status update
```

---

## 4. API Gateway Pattern

SvelteKit API routes should be thin gateway wrappers.

```text
/api/evidence/video/ingest
  → validates request
  → creates workflow run
  → enqueues job
  → returns workflow_id

/api/search/evidence
  → validates query
  → calls KAG retrieval service
  → returns ranked context

/api/atlas/daily/build
  → operator-gated
  → triggers daily atlas summarizer

/api/agent/patch-proposals
  → stores patch proposal
  → never applies automatically
```

Internal services should live under:

```text
src/lib/server/evidence
src/lib/server/atlas
src/lib/server/ace
src/lib/server/kag
src/lib/server/retrieval
src/lib/server/graph
src/lib/server/analytics
src/lib/server/workflows
```

---

## 5. Sidecar / Proxy / Load Balancer Model

Keep SvelteKit as the API gateway, but route heavy work to sidecars.

```text
Browser
  → SvelteKit SSR/API
  → internal service router
    ├─ TurboQuant/Gemma4 :8080
    ├─ Ollama/EmbeddingGemma :11434
    ├─ TRACE MCP :8788
    ├─ gRPC embedding worker :50051
    ├─ gRPC retrieval worker :50053
    ├─ TurboVec sidecar :optional
    ├─ Whisper/OCR worker :optional
    └─ Qdrant/Neo4j/Postgres/Redis/CouchDB
```

### Sidecar proxy responsibilities

```text
health checks
timeouts
retries
circuit breakers
queue depth checks
model availability checks
GPU/VRAM guard
fallback routing
trace spans
```

### Do not expose sidecars directly to the browser

Browser should call SvelteKit only.

---

## 6. HTTP vs gRPC vs QUIC

### HTTP/REST/SSE

Use for:

```text
browser → SvelteKit
UI actions
chat streaming
workflow polling/SSE
admin dashboards
```

### gRPC/Protobuf

Use for:

```text
SvelteKit → internal workers
embedding worker
retrieval worker
media processing worker
TurboVec sidecar
Whisper/OCR worker
```

### QUIC

Do not add now.

Use QUIC only later if:

```text
you have custom high-throughput streaming transport needs
you deploy behind Caddy/Envoy/Cloudflare-like infra
HTTP/2/gRPC is not enough
```

For now:

```text
Browser → HTTP/SSE
SvelteKit → gRPC/HTTP internal workers
```

---

## 7. Subgraph Instruction Programming

Subgraph instruction programming means each subsystem has a structured instruction card that tells agents:

```text
what the subsystem owns
which files implement it
which APIs/routes are allowed
which DB tables it touches
which graph nodes/edges represent it
which tools are safe
which patches are forbidden
which tests prove it works
```

### SubgraphInstruction schema

```ts
export type SubgraphInstruction = {
  key: string;
  title: string;
  intent: string;
  owners: string[];
  rootDirs: string[];
  routes: string[];
  apiRoutes: string[];
  tables: string[];
  qdrantCollections: string[];
  redisKeys: string[];
  neo4jLabels: string[];
  couchDocs: string[];
  allowedTools: string[];
  blockedTools: string[];
  entrypoints: string[];
  tests: string[];
  smokeCommands: string[];
  patchPolicy: 'operator-gated' | 'read-only' | 'auto-fix-disabled';
  status: 'SHIPPED' | 'PARTIAL' | 'SPEC_ONLY' | 'MISSING';
  recommendations: string[];
};
```

### Store subgraph instructions in

```text
Postgres:
  subgraph_instructions

Qdrant:
  subgraph_instruction_chunks

Neo4j:
  (:SubgraphInstruction)-[:OWNS]->(:Feature)
  (:SubgraphInstruction)-[:TOUCHES]->(:Table)
  (:SubgraphInstruction)-[:EXPOSES]->(:Route)

Redis:
  subgraph:instruction:{key}

CouchDB:
  wiki page for humans
```

---

## 8. Recommended Subgraphs

```text
ui.evidence_upload
evidence.video_ingest
evidence.ocr_langextract
analytics.user_activity
analytics.daily_atlas
ace.bitfrost_cache
retrieval.kag_dense_graph
retrieval.turbovec_sidecar
graph.master_atlas
graph.topology_manifold4
agent.patch_proposals
agent.workflow_events
forms.superforms_zod
db.drizzle_postgres
sidecar.grpc_workers
```

---

## 9. KAG/DAG Retrieval Model

KAG packet:

```json
{
  "query": "upload fails and button does not work",
  "intent": "ui_evidence_bug",
  "subgraph": "ui.evidence_upload",
  "operators": [
    "search_ui_components",
    "trace_form_action",
    "trace_api_route",
    "check_db_schema",
    "find_playwright_tests"
  ],
  "semantic_hits": [],
  "graph_paths": [],
  "topology_neighbors": [],
  "recent_activity": [],
  "recommendations": []
}
```

DAG path:

```text
User query
  → intent state
  → subgraph instruction
  → Qdrant semantic hits
  → Neo4j graph paths
  → Postgres truth lookup
  → Redis cached context
  → ACE packet
  → Gemma4 recommendation
```

---

## 10. 4D Topology Model

```text
manifold4 = [som_x, som_y, semantic_z, grpo_w]
```

Meaning:

```text
som_x / som_y
  = topology location

semantic_z
  = relevance / authority / dense similarity

grpo_w
  = reward, helpfulness, usage, acceptance
```

Store in:

```text
Postgres:
  topology_positions
  topology_snapshots
  tensor_analysis_cache

Qdrant payload:
  som_cluster
  som_bmu_row
  som_bmu_col
  manifold4
  feature_keys
  agents_card_id
  subgraph_key

Neo4j:
  node.manifold4_x/y/z/w

Redis:
  topology:cluster:{id}
  gpu:autoencoder:centroids_64
  ace:ctx:{cacheKey}
```

---

## 11. Adaptive HMM / State Model

Use a simple state machine first.

States:

```text
architecture_question
bug_error_fix
ui_upload_issue
schema_drift
retrieval_search
evidence_media
agent_workflow
cache_topology
```

Observations:

```text
keywords
file paths
routes
recent user activity
recent agent events
failed tests
cache misses
workflow state
```

Transition example:

```text
ui_upload_issue
  → inspect component
  → inspect form schema
  → inspect API route
  → inspect DB write
  → inspect invalidation
  → add Playwright regression
```

Store:

```text
Redis:
  hmm:state:{sessionId}
  hmm:transition:{from}:{to}

Postgres:
  user_activity_events
  agent_workflow_events
  daily_activity_atlas
```

---

## 12. Fine-Tuning Strategy

Do **not** fine-tune Gemma4 first.

First collect examples.

Training record:

```json
{
  "query": "upload succeeds but card list does not refresh",
  "intent": "ui_evidence_bug",
  "subgraph_key": "ui.evidence_upload",
  "retrieval_packet": {
    "semantic_hits": ["EvidenceBulkUploadDialog.svelte"],
    "graph_paths": [["component", "api/evidence/upload", "evidence table"]],
    "recent_activity": ["upload card list did not refresh"]
  },
  "accepted_next_actions": [
    "inspect upload component state",
    "inspect API response",
    "add invalidateAll after success",
    "add Playwright regression"
  ],
  "rejected_next_actions": [
    "change identity strategy",
    "run broad drizzle push"
  ],
  "outcome": {
    "test_passed": true,
    "patch_accepted": true
  }
}
```

### What to train first

```text
1. Decision tree / logistic reranker
2. Small classifier for intent → subgraph
3. Small reranker for file/action priority
4. Only later: LoRA/QLoRA for Gemma4
```

Fine-tune Gemma4 only when you have:

```text
1000+ successful workflows
query → correct subgraph
query → correct file path
query → correct action plan
accepted/rejected recommendations
test result / outcome
```

---

## 13. Data Needed End-to-End

### From codebase

```text
static imports
dynamic imports
route files
API handlers
server/client boundaries
package imports
Drizzle table references
Zod schemas
Superforms usage
Bits UI components
MCP tool definitions
tests/smokes
```

### From runtime

```text
user_activity_events
agent_workflow_events
ace_retrieval_runs
context cache hits/misses
Qdrant hits
Neo4j paths
Redis hit rate
workflow failures
upload failures
test failures
patch proposals
recommendation feedback
```

### From topology

```text
som_cluster
manifold4
PageRank
community
cluster summaries
hotness/activity
feature keys
subgraph keys
```

---

## 14. Implementation TODO

### Phase 1 — Subgraph instruction schema

```text
[ ] Add docs/design/subgraph-instruction-programming.md
[ ] Add SubgraphInstruction TypeScript type
[ ] Add Zod schema
[ ] Add Postgres table or JSONB store
[ ] Add seed instructions for 10 core subgraphs
[ ] Add Redis cache for subgraph instructions
[ ] Add Qdrant embeddings for subgraph instructions
```

### Phase 2 — Codebase path mapping

```text
[ ] Extract static imports
[ ] Extract dynamic imports
[ ] Extract import.meta.glob usage
[ ] Extract SvelteKit routes
[ ] Extract API route handlers
[ ] Extract Drizzle table refs
[ ] Extract Zod schemas
[ ] Extract Superforms usage
[ ] Extract package/node_modules imports
[ ] Write graph edges to Neo4j
[ ] Write summary cards to CouchDB
```

### Phase 3 — KAG packet builder

```text
[ ] Add getSubgraphInstructionForQuery(query)
[ ] Add getAdaptivePathContext(query)
[ ] Add getKagDagPacket(query)
[ ] Pull Qdrant semantic hits
[ ] Pull Neo4j graph paths
[ ] Pull Redis cached cluster cards
[ ] Pull Daily Atlas recent context
[ ] Merge into ACE packet
[ ] Add Langfuse trace spans
```

### Phase 4 — UI/Form reliability layer

```text
[ ] Standardize Superforms + Zod for upload forms
[ ] Ensure non-submit buttons use type="button"
[ ] Add loading/disabled states
[ ] Add inline validation errors
[ ] Add upload workflow events
[ ] Add Playwright upload regression
[ ] Add UploadReliabilityPanel
```

### Phase 5 — Sidecar routing

```text
[ ] Add sidecar health registry
[ ] Add timeout/retry/circuit breaker helper
[ ] Add gRPC client wrappers
[ ] Add TurboQuant health check
[ ] Add Ollama/EmbeddingGemma health check
[ ] Add TurboVec sidecar health check
[ ] Add Whisper/OCR worker health check
[ ] Add sidecar lane fallback policy
```

### Phase 6 — Fine-tuning dataset

```text
[ ] Log query → subgraph → files → actions → outcome
[ ] Store accepted/rejected recommendations
[ ] Export JSONL
[ ] Train simple reranker first
[ ] Evaluate on held-out workflow tasks
[ ] Only then consider Gemma4 LoRA/QLoRA
```

---

## 15. Sidecar Proxy / Load Balancer Ideas

### Sidecar registry

```ts
type SidecarService = {
  name: string;
  url: string;
  protocol: 'http' | 'grpc';
  healthPath?: string;
  timeoutMs: number;
  maxConcurrency: number;
  fallback?: string;
  gpuRequired?: boolean;
};
```

### Policies

```text
TurboQuant:
  maxConcurrency = 1-2 on RTX 3060 Ti

EmbeddingGemma:
  batch requests if possible

Whisper/OCR:
  queue jobs, do not run during Gemma4 heavy synthesis

TurboVec:
  fast sidecar, fallback to Qdrant

Qdrant:
  primary vector DB, no browser direct access

Neo4j:
  graph expansion, bounded depth

Redis:
  hot cache, fail open
```

---

## 16. Recommended Commit Sequence

```text
1. docs(agents): add subgraph instruction programming plan
2. feat(subgraph): add SubgraphInstruction schema and seed cards
3. feat(atlas): extract static/dynamic imports into graph edges
4. feat(kag): build getKagDagPacket from Qdrant/Neo4j/Redis
5. feat(forms): standardize upload forms with Superforms/Zod
6. feat(sidecars): add sidecar health registry and fallback policy
7. feat(training): export workflow pathfinding JSONL
```

---

## 17. Guardrails

```text
[ ] Do not run broad drizzle push.
[ ] Do not change identity strategy.
[ ] Do not expose raw apply_patch.
[ ] Do not make LangGraph main request path.
[ ] Do not add QUIC yet.
[ ] Do not make TurboVec canonical.
[ ] Do not treat AGENTS.md as truth.
[ ] Do not fine-tune before collecting workflow examples.
[ ] Do not run GPU-heavy workers concurrently without VRAM guard.
```

---

## 18. Final Recommendation

Build this as:

```text
SvelteKit SSR/API Gateway
  → Superforms/Zod validated UI
  → Drizzle/Postgres truth
  → SubgraphInstruction cards
  → Qdrant semantic hits
  → Neo4j graph paths
  → Redis BitFrost cache
  → ACE KAG/DAG packet
  → Gemma4 recommendation
  → workflow event ledger
  → fine-tuning dataset later
```

Use LangGraph only as a deferred background worker for slow conditional jobs, not as the primary app brain.
