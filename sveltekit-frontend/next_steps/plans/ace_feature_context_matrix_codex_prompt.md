# Codex / Claude Code Prompt: ACE Feature Context Matrix + Workstation Indexing Fabric

**Target repo:** `C:\Users\james\Videos\deeds-web-app\sveltekit-frontend`  
**Target environment:** Windows 10 Home + WSL2 + Docker Desktop + RTX 3060 8GB + 20GB RAM  
**Purpose:** Index `.txt`, `.md`, docs, codebase paths, rg output, error logs, and AGENTS/Karpathy wiki notes into a searchable ACE/HyperRAG context matrix.

---

## 1. What This Is

Call this system:

```txt
ACE Feature Context Matrix
```

or:

```txt
Master Atlas Context Matrix
```

It converts loose text/code/docs/errors into a reusable retrieval fabric:

```txt
.txt / .md / codebase / docs / errors
  → rg/path-map discovery
  → chunk + summarize
  → tag + feature matrix
  → embed
  → Qdrant semantic search
  → Neo4j KAG/DAG graph edges
  → Redis ACE/BitFrost hot cache
  → HyperRAG retrieval
  → Gemma4 answer / fix / recommendation
  → GRPO feedback + token/context logging
```

This creates both:

```txt
many source files/chunks/docs/errors
  → one feature card / cluster / workflow

one query / feature / error
  → many code paths / docs / graph edges / cached context packets
```

---

## 2. Core Rule

Do not create another database or new monolithic system.

Use the existing stack:

```txt
Postgres  = durable metadata and audit truth
Qdrant    = semantic vector recall
Neo4j     = graph/path/KAG/DAG topology
Redis     = hot ACE/BitFrost context cache
DuckDB    = offline reconciliation
rg        = exact path/code search
HyperRAG  = merge/fusion layer
Gemma4    = synthesis/planning
```

Do not use Redis, GPU tensors, or one giant prompt to hold the whole codebase.

---

## 3. Source Types to Ingest

Ingest:

```txt
.txt notes
.md docs
AGENTS.md
Karpathy wiki pages
error logs
svelte-check output
drizzle migration notes
rg search output
Qdrant/pgvector notes
Codex/Claude/Gemma4 handoffs
architecture files
implementation checklists
```

Example useful tags from a current error/log source:

```txt
svelte-check
kmeans-worker
drizzle-kit
citations-table
qdrant-dev-ui
pgvector
context7
sveltekit2
uno.css
bits-ui
gpu-webgpu-cuda
```

---

## 4. Ingestion Pipeline

### Step A — Register Source

Create a `metadata_envelope`.

```json
{
  "source_id": "note_2026_05_14_errors",
  "source_type": "text_log",
  "path": "10_5_app_e2131rrors.txt",
  "title": "Svelte/Drizzle/Qdrant error notes",
  "hash": "sha256...",
  "created_at": "2026-05-14",
  "tags": ["svelte-check", "drizzle", "qdrant", "kmeans-worker"]
}
```

Store in:

```txt
Postgres metadata_envelopes
```

---

### Step B — Chunk Source

Chunk by:

```txt
markdown headings
file paths
commands
error blocks
"Next suggestions"
"Validation"
"Relevant files"
"TODO"
"Blocked"
```

Good chunk types:

```txt
raw_chunk
summary_chunk
action_chunk
feature_chunk
error_chunk
command_chunk
path_chunk
```

---

### Step C — Synthesize Actionable Chunks

Example synthesized error chunk:

```json
{
  "chunk_type": "error_fix",
  "feature_key": "workers.kmeans",
  "summary": "kmeans-worker.js has object literal syntax errors from missing commas in result objects.",
  "paths": ["src/lib/workers/kmeans-worker.js"],
  "actions": [
    "Add comma after iterations: iteration",
    "Add comma after converged: hasConverged",
    "Add comma after centroid: centroids[i]"
  ],
  "severity": "blocking_parse_error"
}
```

---

## 5. rg Search Matrix

Create reusable rg query arrays for every feature.

### File

```txt
src/lib/server/atlas/rg-search-matrix.ts
```

### Example

```ts
export const rgSearchMatrix = [
  {
    featureKey: 'workers.kmeans',
    tags: ['kmeans', 'worker', 'clustering', 'svelte-check'],
    rg: [
      'kmeans-worker',
      'iterations: iteration',
      'converged: hasConverged',
      'centroid: centroids\\[i\\]',
      'postMessage',
      'cluster.length'
    ],
    paths: [
      'src/lib/workers',
      'src/lib/server/retrieval',
      'scripts'
    ]
  },
  {
    featureKey: 'db.drizzle.citations',
    tags: ['drizzle', 'citations', 'migration', 'schema'],
    rg: [
      'citations',
      'drizzle-kit generate',
      'error_logs',
      'indexed_files',
      'schema.ts',
      'schema-postgres'
    ],
    paths: [
      'src/lib/db',
      'src/lib/server/db',
      'drizzle'
    ]
  },
  {
    featureKey: 'retrieval.qdrant_pgvector',
    tags: ['qdrant', 'pgvector', 'legal_evidence', 'embeddingCache'],
    rg: [
      'QDRANT_URL',
      'legal_evidence',
      'embeddingCache',
      'pgvector',
      '/dev/qdrant',
      'Run Query'
    ],
    paths: [
      'src/routes',
      'src/lib/server',
      'docs'
    ]
  }
];
```

---

## 6. Feature Context Matrix

A Feature Context Matrix row maps:

```txt
feature
  → related paths
  → rg searches
  → docs
  → Qdrant tags
  → Neo4j graph nodes
  → Redis cache keys
  → tests
  → fixes
  → GPU/tensor artifacts if any
```

Example:

```json
{
  "feature_key": "workers.kmeans",
  "title": "KMeans worker clustering pipeline",
  "source_chunks": ["chunk_error_001"],
  "paths": ["src/lib/workers/kmeans-worker.js"],
  "rg_queries": [
    "kmeans-worker",
    "iterations: iteration",
    "centroid: centroids"
  ],
  "qdrant_tags": [
    "feature:workers.kmeans",
    "error:syntax",
    "domain:clustering"
  ],
  "neo4j_nodes": [
    "Feature:workers.kmeans",
    "File:src/lib/workers/kmeans-worker.js",
    "Error:missing-comma"
  ],
  "redis_keys": [
    "ace:feature:workers.kmeans",
    "ace:error:kmeans-worker"
  ],
  "recommended_actions": [
    "Fix missing commas",
    "Run svelte-check fast path",
    "Run worker unit test"
  ]
}
```

---

## 7. Storage Roles

### Postgres

Canonical metadata and audit:

```txt
metadata_envelopes
feature_maps
agent_workflow_events
retrieval_runs
retrieval_hits
llm_context_cache
```

Use for:

```txt
source of truth
document/chunk metadata
workflow state
trace logs
```

---

### Qdrant

Semantic search collections:

```txt
codebase_chunks_768
docs_chunks
error_notes
agent_memory_summaries
evidence_chunks
```

Payload standard:

```json
{
  "feature_key": "workers.kmeans",
  "tags": ["svelte-check", "syntax-error", "worker", "clustering"],
  "path": "src/lib/workers/kmeans-worker.js",
  "source_type": "uploaded_error_log",
  "severity": "blocking",
  "cluster_id": "cluster_workers",
  "manifold4": [8, 3, 0.81, 0.42]
}
```

Use Qdrant for semantic queries like:

```txt
why is svelte-check failing?
what code relates to kmeans worker?
find upload pipeline errors
show drizzle citations migration issue
```

---

### Neo4j

Graph/path relationships:

```txt
(:Feature)-[:HAS_FILE]->(:File)
(:File)-[:HAS_ERROR]->(:Error)
(:Error)-[:MENTIONED_IN]->(:DocChunk)
(:Feature)-[:USES]->(:Library)
(:Feature)-[:TESTED_BY]->(:Test)
(:Feature)-[:HAS_TAG]->(:Tag)
(:DocChunk)-[:REFERENCES]->(:Command)
```

Use Neo4j for:

```txt
what depends on this file?
which feature owns this error?
which docs mention this route?
what path from upload to OCR to Qdrant exists?
```

---

### Redis / ACE / BitFrost

Hot cache only:

```txt
ace:ctx:{cacheKey}
ace:feature:{featureKey}
ace:error:{errorHash}
ace:rg:{queryHash}
ace:cluster:{clusterId}
gpu:autoencoder:centroids_64
hypergraph:v1:centroids
```

Use Redis for:

```txt
current session context
frequently used feature cards
nearest centroid cache
recent query plans
workflow status
```

Never store the entire corpus in Redis.

---

### DuckDB

Offline validation and reconciliation:

```txt
cluster size reports
Qdrant/Postgres consistency
missing Qdrant payload tags
missing Neo4j edges
stale AGENTS cards
```

---

## 8. RTX Tensor Processing Role

Do not send raw `.txt` or `.md` to CUDA.

GPU work starts after text becomes vectors/tensors:

```txt
text/doc/code
  → chunk
  → embed into vector
  → tensor operations
```

GPU-friendly jobs:

```txt
batch cosine similarity
attention rerank
autoencoder 768→64
centroid assignment
SOM/BMU matching
matrix projection
```

CPU/datastore jobs:

```txt
rg search
markdown parsing
JSON normalization
path mapping
Postgres writes
Neo4j traversal
Redis key writes
```

Correct division:

```txt
rg/path mapping on CPU
  → embeddings
  → GPU rerank/compression
  → Redis/Qdrant/Neo4j updates
```

---

## 9. GRPO / MTP / Token Mapping

### GRPO-style feedback

Track what helped:

```json
{
  "query": "fix kmeans-worker svelte-check error",
  "selected_chunks": ["chunk_error_001", "chunk_file_002"],
  "rejected_chunks": ["chunk_irrelevant_009"],
  "answer_helpful": true,
  "tests_passed": true,
  "reward": 1.0
}
```

Store in:

```txt
grpo_memory_sticks
agent_workflow_events
retrieval_hits
```

---

### MTP/token mapping

For this app, token mapping means:

```txt
which chunks went into the prompt
how many tokens they used
which answer they produced
whether the context should be cached
```

Example:

```json
{
  "cacheKey": "llmctx_abc",
  "model": "gemma4-rotorquant:latest",
  "promptTokens": 3400,
  "chunkIds": ["chunk_error_001"],
  "featureKeys": ["workers.kmeans"],
  "graphPaths": ["Feature->File->Error"],
  "toolPolicy": "read_only"
}
```

Do not store raw KV cache or hidden reasoning.

---

## 10. tmux Workstation Lanes

Use `tmux` to run parallel lanes without mixing logs.

Create session:

```bash
tmux new -s ace-index
```

Create windows:

```bash
tmux rename-window dev
tmux new-window -n rg
tmux new-window -n chunk
tmux new-window -n embed
tmux new-window -n qdrant
tmux new-window -n graph
tmux new-window -n redis
tmux new-window -n smoke
```

### Window 1: dev

```bash
cd ~/Videos/deeds-web-app/sveltekit-frontend
npm run dev:gpu
```

### Window 2: rg

```bash
cd ~/Videos/deeds-web-app/sveltekit-frontend
rg -n "kmeans-worker|citations|QDRANT_URL|embeddingCache|svelte-check|drizzle-kit" . \
  --glob '!node_modules' \
  --glob '!dist' \
  > tmp/rg-error-context.txt
```

### Window 3: chunk

```bash
node scripts/atlas/chunk-text-notes.mjs \
  --input tmp/rg-error-context.txt \
  --out tmp/chunks/error-context.ndjson
```

### Window 4: embed

```bash
node scripts/atlas/embed-chunks.mjs \
  --input tmp/chunks/error-context.ndjson \
  --collection error_notes
```

### Window 5: qdrant

```bash
node scripts/atlas/qdrant-tag-backfill.mjs \
  --collection error_notes \
  --tags feature:workers.kmeans,error:syntax
```

### Window 6: graph

```bash
node scripts/atlas/project-feature-matrix-neo4j.mjs \
  --input tmp/chunks/error-context.ndjson \
  --dry-run
```

### Window 7: redis

```bash
node scripts/atlas/cache-feature-cards.mjs \
  --input tmp/chunks/error-context.ndjson \
  --prefix ace:feature \
  --ttl 86400
```

### Window 8: smoke

```bash
npm run smoke:hyperrag
npm run smoke:atlas
```

Detach:

```bash
Ctrl-b d
```

Reattach:

```bash
tmux attach -t ace-index
```

---

## 11. Retrieval Routing

Use this retrieval order:

```txt
Exact text / path / error:
  rg + Postgres metadata

Semantic meaning:
  Qdrant

Dependency/path relationships:
  Neo4j

Hot current session:
  Redis ACE cache

Audit/reconciliation:
  DuckDB

Full merged answer:
  HyperRAG Fusion Service
```

Example query:

```txt
fix kmeans worker svelte-check error
```

Retrieval flow:

```txt
1. Redis: ace:error:{hash} hot cache?
2. Qdrant: semantic search error_notes + codebase_chunks
3. Neo4j: Feature → File → Error → Test path
4. rg fallback: search exact strings
5. HyperRAG merges it
6. Gemma4 proposes fix
```

---

## 12. MCP / gRPC / Cosine Retrieval

### MCP

Model-facing tool calls:

```txt
trace.kag_search
trace.explain_retrieval
hyperrag.search
topology.search_near
```

Gemma4 should call these through validated plans, not raw shell.

### gRPC

Internal service calls only:

```txt
embedding sidecar
Go retrieval
topology search
GPU rerank service
```

Never call gRPC from the browser.

### Cosine retrieval

Cosine similarity belongs in:

```txt
Qdrant
TurboVec
LibTorch/CUDA reranker
batchCosineSimilarity
```

Flow:

```txt
query embedding
  → cosine search Qdrant
  → optional GPU cosine rerank top 50
  → cluster/graph boost
```

---

## 13. One-to-Many Triggers

When a new `.md` or `.txt` is indexed:

```txt
source doc
  → many chunks
  → many tags
  → many features
  → many graph edges
  → one summary card
  → one ACE cache packet
```

Trigger:

```txt
on document indexed:
  create FeatureContextMatrix rows
  upsert Qdrant chunks
  project Neo4j edges
  cache Redis feature card
  update Daily Atlas
  invalidate old ACE cache packet
```

---

## 14. Scripts to Create

```txt
[ ] scripts/atlas/chunk-text-notes.mjs
[ ] scripts/atlas/build-rg-search-matrix.mjs
[ ] scripts/atlas/embed-chunks.mjs
[ ] scripts/atlas/qdrant-tag-backfill.mjs
[ ] scripts/atlas/project-feature-matrix-neo4j.mjs
[ ] scripts/atlas/cache-feature-cards.mjs
[ ] scripts/atlas/synthesize-context-chunks.mjs
```

---

## 15. Services to Create

```txt
[ ] src/lib/server/atlas/feature-context-matrix.ts
[ ] src/lib/server/atlas/rg-search-matrix.ts
[ ] src/lib/server/atlas/context-chunk-synthesizer.ts
[ ] src/lib/server/ace/feature-context-cache.ts
```

---

## 16. Qdrant Payload Standards

Collections:

```txt
[ ] error_notes
[ ] docs_chunks
```

Payload fields:

```txt
[ ] feature_key
[ ] tags
[ ] source_path
[ ] graph_node_ids
[ ] manifold4
[ ] severity
[ ] source_type
[ ] cluster_id
```

---

## 17. Redis Keys

```txt
[ ] ace:feature:{featureKey}
[ ] ace:error:{errorHash}
[ ] ace:rg:{queryHash}
[ ] ace:cluster:{clusterId}
[ ] ace:ctx:{cacheKey}
```

---

## 18. Validation Tests

```txt
[ ] chunker preserves file paths
[ ] chunker isolates error blocks
[ ] rg matrix creates correct search arrays
[ ] Qdrant payload includes feature_key and tags
[ ] Neo4j dry-run edges are valid
[ ] Redis cache packet excludes raw tensors
[ ] HyperRAG retrieves from error_notes
[ ] Feature matrix row includes paths, tags, graph refs, and actions
[ ] GRPO feedback row stores selected/rejected chunks
```

---

## 19. Immediate Error Fix from Uploaded Notes

The uploaded error log contains a concrete parse issue:

```txt
src/lib/workers/kmeans-worker.js:133
iterations: iteration
converged: hasConverged
processingTime,
```

Fix:

```js
iterations: iteration,
converged: hasConverged,
processingTime,
```

Also:

```txt
src/lib/workers/kmeans-worker.js:195
centroid: centroids[i]
size: cluster.length,
```

Fix:

```js
centroid: centroids[i],
size: cluster.length,
```

Run after fixing:

```bash
npx tsc --noEmit --skipLibCheck
npm run check:svelte:fast
```

---

## 20. Codex / Claude Code Prompt

```txt
You are working in:
C:\Users\james\Videos\deeds-web-app\sveltekit-frontend

Task:
Build the ACE Feature Context Matrix pipeline for indexing .txt/.md/error/code docs into HyperRAG/ACE.

Context:
The workstation has Postgres, Qdrant, Neo4j, Redis, CouchDB, SeaweedFS, RabbitMQ, Gemma4/TurboQuant, TRACE MCP, and optional TurboVec/LibTorch lanes.
SvelteKit 2 is the SSR/API gateway.
HyperRagFusionService is canonical retrieval.
Redis is hot cache only.
Qdrant is semantic vector search.
Neo4j is graph/KAG/DAG topology.
Postgres is durable metadata/audit truth.
Gemma4 is planner/synthesizer.
Do not add new datastores.

Implement:
1. scripts/atlas/chunk-text-notes.mjs
2. scripts/atlas/build-rg-search-matrix.mjs
3. scripts/atlas/embed-chunks.mjs
4. scripts/atlas/qdrant-tag-backfill.mjs
5. scripts/atlas/project-feature-matrix-neo4j.mjs
6. scripts/atlas/cache-feature-cards.mjs
7. src/lib/server/atlas/feature-context-matrix.ts
8. src/lib/server/atlas/rg-search-matrix.ts
9. src/lib/server/atlas/context-chunk-synthesizer.ts
10. src/lib/server/ace/feature-context-cache.ts
11. tests/unit/feature-context-matrix.test.ts
12. docs/architecture/ace-feature-context-matrix.md

Start in dry-run mode.
Do not write to Qdrant/Neo4j/Redis unless dryRun=false.
Use exact rg paths and file references.
Preserve source paths and evidence/source refs.
Never store raw KV cache, GPU tensors, or hidden reasoning.
Do not expose raw shell/apply_patch to Gemma4.
Do not bypass HyperRagFusionService.

First low-risk fix:
Patch src/lib/workers/kmeans-worker.js missing commas around:
- iterations: iteration
- converged: hasConverged
- centroid: centroids[i]

Validation:
- chunker preserves file paths
- rg matrix creates correct search arrays
- Qdrant payload includes tags
- Neo4j dry-run edges are valid
- Redis cache packet excludes raw tensors
- HyperRAG can retrieve indexed error_notes
- npx tsc --noEmit --skipLibCheck
- npm run check:svelte:fast if available

Return:
- summary of files changed
- commands run
- tests passed/failed/skipped
- blockers
- next commit message
```

---

## 21. Recommended Commit Sequence

```txt
1. fix(workers): repair kmeans worker object literal syntax
2. docs(architecture): add ACE feature context matrix design
3. feat(atlas): add rg search matrix and chunk synthesizer
4. feat(atlas): add Qdrant tag backfill dry-run
5. feat(atlas): add Neo4j feature matrix projection dry-run
6. feat(ace): cache feature context cards in Redis
7. test(atlas): validate feature context matrix pipeline
8. feat(hyperrag): add error_notes retrieval lane
```
