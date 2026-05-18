# Codex / Claude Code Prompt: Parent Atlas + Karpathy Batch + Engram Plugin Research

**Repo root:** `C:\Users\james\Videos\deeds-web-app`
**Primary workspace:** `C:\Users\james\Videos\deeds-web-app\sveltekit-frontend`
**Target repo:** `semaj90/deeds_web_app`
**Purpose:** Finish the repo-root parent atlas pipeline, wrap the existing Karpathy batch synthesis lane, and define research/tasks for Engram-style agent memory plugin support.

---

## 1. System Name

Use this name in docs and commit messages:

```txt
Parent Atlas Karpathy Pipeline
```

or:

```txt
Repo-Root ACE/Karpathy Atlas Pipeline
```

This pipeline wraps the existing SvelteKit atlas and Karpathy batch script into a full repo-root indexing and memory substrate.

---

## 2. What the Current Batch Script Already Does

The current batch script is effectively the **Karpathy Batch Context Synthesis Lane**.

It combines:

```txt
docs/graph/codebase-graph.json
  + Redis wiki:note:dir:*
  + Redis couchdb:pagerank_scores
  + Qdrant codebase_chunks_768 cluster payloads
  + Gemma4 summaries
  + EmbeddingGemma embeddings
  → Qdrant glyph_atlas
  → Redis agents:dir:*
  → Redis code:llm_output:path:*
  → Redis summary:cluster:*
  → docs/graph/batch-gpu-analysis-report.json/md
```

It already has these stages:

```txt
1. Codebase map refresh
2. PageRank enrichment
3. Cluster / SOM audit
4. Glyph generation
5. Tag write-back
6. ACE hit logging
7. Report generation
8. ACE smoke
```

Keep the script, but refactor it so it becomes one stage in the parent atlas pipeline.

---

## 3. Target Parent Atlas Flow

```txt
repo root
  ↓
workspace discovery
  ↓
language / route / import / env maps
  ↓
SvelteKit route map import
  ↓
codebase graph refresh
  ↓
Qdrant tagging / clustering
  ↓
Neo4j GraphRAG projection
  ↓
CouchDB MapReduce wiki ingestion
  ↓
Karpathy batch synthesis
  ↓
Redis ACE / BitFrost hot cache
  ↓
AGENTS.md regeneration
  ↓
validation reports
```

---

## 4. Root Command

From:

```powershell
cd C:\Users\james\Videos\deeds-web-app
```

Run:

```powershell
npm run atlas:root:full
```

It should execute:

```txt
1. atlas:root:index
2. atlas:routes:import
3. atlas:imports:static
4. atlas:imports:dynamic
5. atlas:env:map
6. atlas:qdrant:tag
7. atlas:neo4j:ingest
8. atlas:couchdb:mapreduce
9. graphify:karpathy-batch
10. atlas:redis:sync
11. agents:write
12. atlas:validate
```

---

## 5. Scripts to Implement

### Repo-root atlas scripts

```txt
[ ] atlas.config.json
[ ] scripts/atlas/index-repo-root.mjs
[ ] scripts/atlas/ingest-sveltekit-route-map.mjs
[ ] scripts/atlas/build-repo-import-map.mjs
[ ] scripts/atlas/build-repo-env-map.mjs
[ ] scripts/atlas/project-neo4j-graphrag.mjs
[ ] scripts/atlas/ingest-couchdb-mapreduce.mjs
[ ] scripts/atlas/tag-qdrant-codebase-payloads.mjs
[ ] scripts/atlas/sync-redis-ace-cards.mjs
[ ] scripts/atlas/validate-parent-atlas.mjs
```

### Karpathy batch scripts

```txt
[ ] scripts/graphify/graphify-batch-karpathy-analysis.mjs
[ ] scripts/graphify/graphify-batch-gpu-analysis.mjs
```

`graphify-batch-gpu-analysis.mjs` should become a compatibility wrapper that calls `graphify-batch-karpathy-analysis.mjs`.

### Agent scripts

```txt
[ ] scripts/agents/generate-monorepo-agents.mjs
```

### Documentation

```txt
[ ] docs/architecture/parent-atlas-karpathy-pipeline.md
[ ] docs/architecture/engram-plugin-memory-support.md
[ ] docs/architecture/neo4j-graphrag-parent-atlas.md
[ ] docs/architecture/couchdb-mapreduce-atlas-ingestion.md
```

---

## 6. Package Scripts to Add

```json
{
  "scripts": {
    "atlas:root:index": "node scripts/atlas/index-repo-root.mjs --config atlas.config.json",
    "atlas:routes:import": "node scripts/atlas/ingest-sveltekit-route-map.mjs --config atlas.config.json",
    "atlas:imports:static": "node scripts/atlas/build-repo-import-map.mjs --static --config atlas.config.json",
    "atlas:imports:dynamic": "node scripts/atlas/build-repo-import-map.mjs --dynamic --config atlas.config.json",
    "atlas:env:map": "node scripts/atlas/build-repo-env-map.mjs --config atlas.config.json",
    "atlas:qdrant:tag": "node scripts/atlas/tag-qdrant-codebase-payloads.mjs --dry-run",
    "atlas:neo4j:ingest": "node scripts/atlas/project-neo4j-graphrag.mjs --dry-run",
    "atlas:couchdb:mapreduce": "node scripts/atlas/ingest-couchdb-mapreduce.mjs --dry-run",
    "graphify:karpathy-batch": "node scripts/graphify/graphify-batch-karpathy-analysis.mjs",
    "graphify:batch-gpu-analysis": "node scripts/graphify/graphify-batch-gpu-analysis.mjs",
    "atlas:redis:sync": "node scripts/atlas/sync-redis-ace-cards.mjs",
    "atlas:validate": "node scripts/atlas/validate-parent-atlas.mjs",
    "atlas:root:full": "npm run atlas:root:index && npm run atlas:routes:import && npm run atlas:imports:static && npm run atlas:imports:dynamic && npm run atlas:env:map && npm run atlas:qdrant:tag && npm run atlas:neo4j:ingest && npm run atlas:couchdb:mapreduce && npm run graphify:karpathy-batch && npm run atlas:redis:sync && npm run agents:write && npm run atlas:validate"
  }
}
```

---

## 7. Refactor Tasks for Karpathy Batch Script

### Required refactor

```txt
[ ] Rename conceptual lane to Karpathy Batch Context Synthesis.
[ ] Keep old graphify-batch-gpu-analysis.mjs as wrapper/alias.
[ ] Replace redis.keys with scanStream.
[ ] Make Redis optional during --dry-run.
[ ] Batch Qdrant upserts instead of one point at a time.
[ ] Add optional Postgres ace_retrieval_runs / ace_retrieval_hits persistence.
[ ] Add explicit CouchDB MapReduce ingestion stage.
[ ] Add explicit Neo4j GraphRAG projection stage.
[ ] Keep --limit, --dry-run, --skip-llm, --skip-qdrant, --skip-ace.
[ ] Add --write flag for actual Qdrant/Neo4j/CouchDB/Redis writes.
```

### Split into importable modules later

```txt
src/lib/server/atlas/karpathy-batch/
  load-graph.ts
  pagerank-enrichment.ts
  cluster-audit.ts
  glyph-generation.ts
  qdrant-glyph-upsert.ts
  redis-writeback.ts
  couchdb-mapreduce-sync.ts
  neo4j-graphrag-project.ts
```

The `.mjs` script should orchestrate these modules instead of containing all logic inline.

---

## 8. Neo4j GraphRAG Ingestion

### Input files

```txt
docs/graph/repo-root-atlas.json
docs/graph/repo-import-map.json
docs/graph/repo-env-map.json
sveltekit-frontend/docs/graph/sveltekit-route-map.json
sveltekit-frontend/docs/graph/codebase-graph.json
sveltekit-frontend/docs/graph/hypergraph-clusters.md
sveltekit-frontend/docs/graph/batch-gpu-analysis-report.json
```

### Node types

```txt
(:Repo)
(:Workspace)
(:File)
(:Directory)
(:Route)
(:Feature)
(:Cluster)
(:TaskDistillate)
(:EnvVar)
(:Datastore)
(:Sidecar)
(:McpTool)
(:QdrantPoint)
(:RedisKey)
(:CouchDoc)
(:Test)
(:EngramMemory)
(:AgentEpisode)
(:WorkflowRun)
```

### Edge types

```txt
(:Repo)-[:HAS_WORKSPACE]->(:Workspace)
(:Workspace)-[:HAS_FILE]->(:File)
(:Directory)-[:CONTAINS]->(:File)
(:Route)-[:IMPLEMENTED_BY]->(:File)
(:File)-[:STATIC_IMPORTS]->(:File)
(:File)-[:DYNAMIC_IMPORTS]->(:RuntimeDependency)
(:File)-[:USES_ENV]->(:EnvVar)
(:File)-[:USES_STORE]->(:Datastore)
(:File)-[:BELONGS_TO_FEATURE]->(:Feature)
(:File)-[:IN_CLUSTER]->(:Cluster)
(:Feature)-[:USES_CLUSTER]->(:Cluster)
(:TaskDistillate)-[:USES_CLUSTER]->(:Cluster)
(:QdrantPoint)-[:REPRESENTS]->(:File)
(:RedisKey)-[:CACHES]->(:Feature)
(:CouchDoc)-[:SUMMARIZES]->(:Directory)
(:Test)-[:COVERS]->(:Route)
(:EngramMemory)-[:SUMMARIZES]->(:WorkflowRun)
(:AgentEpisode)-[:PRODUCED_MEMORY]->(:EngramMemory)
(:EngramMemory)-[:RELATED_TO_FEATURE]->(:Feature)
```

### Edge properties

```json
{
  "confidence": 0.92,
  "source": "static-import-extractor",
  "createdAt": "2026-05-15T00:00:00Z",
  "snapshot": "atlas-root-v1"
}
```

### Script behavior

```bash
node scripts/atlas/project-neo4j-graphrag.mjs --dry-run
node scripts/atlas/project-neo4j-graphrag.mjs --write
node scripts/atlas/project-neo4j-graphrag.mjs --limit 500
```

Dry-run should report counts:

```txt
Repo nodes
Workspace nodes
File nodes
Route nodes
Feature nodes
Cluster nodes
TaskDistillate nodes
EnvVar nodes
Datastore nodes
Sidecar nodes
CouchDoc nodes
EngramMemory nodes
Edges by type
```

---

## 9. CouchDB MapReduce Ingestion

### Document types

```json
{
  "_id": "wiki:dir:src/lib/server/retrieval",
  "type": "directory_wiki",
  "workspace": "sveltekit-frontend",
  "path": "src/lib/server/retrieval",
  "summary": "...",
  "clusters": ["72", "73"],
  "topFiles": [],
  "tags": [],
  "pageRankAvg": 0.42,
  "updatedAt": "..."
}
```

```json
{
  "_id": "cluster:72",
  "type": "cluster_summary",
  "clusterId": "72",
  "alias": "ace_context",
  "summary": "...",
  "dirs": [],
  "topTags": []
}
```

```json
{
  "_id": "feature:hyperrag.routing",
  "type": "feature_card",
  "featureKey": "hyperrag.routing",
  "summary": "...",
  "routes": [],
  "files": [],
  "clusters": []
}
```

```json
{
  "_id": "engram:workflow:abc123",
  "type": "engram_memory",
  "memoryType": "workflow_episode",
  "summary": "...",
  "featureKeys": ["hyperrag.routing"],
  "clusters": ["72", "94"],
  "accepted": true,
  "reward": 1.0,
  "updatedAt": "..."
}
```

### MapReduce views

```txt
by_type
by_workspace
by_cluster
by_feature
by_route
by_tag
by_updated_at
by_engram_memory_type
by_engram_feature
by_engram_reward
stale_docs
```

### Script behavior

```bash
node scripts/atlas/ingest-couchdb-mapreduce.mjs --dry-run
node scripts/atlas/ingest-couchdb-mapreduce.mjs --write
```

Dry-run should report:

```txt
directory_wiki docs to write
cluster_summary docs to write
feature_card docs to write
engram_memory docs to write
views to ensure
stale docs detected
```

---

## 10. Qdrant Tagging / Clustering / PageRank Payload

Collections:

```txt
codebase_chunks_768
codebase_chunks_64d
glyph_atlas
task_distillates
docs_chunks
error_notes
engram_memories
```

Standard payload:

```json
{
  "repo": "deeds-web-app",
  "workspace": "sveltekit-frontend",
  "path": "src/lib/server/ace/context-assembler.ts",
  "language": "typescript",
  "kind": "service",
  "feature_key": "ace.context",
  "cluster_alias": "ace_context",
  "gpu_cluster": "72",
  "som_cluster": "som_8_3",
  "manifold4": [8, 3, 0.84, 0.41],
  "pagerank": 0.62,
  "activity_w": 0.41,
  "routes": [],
  "env_keys": [],
  "stores": ["redis", "postgres", "qdrant"],
  "graph_node_ids": [],
  "engram_refs": []
}
```

Engram memory payload:

```json
{
  "memory_id": "engram_abc123",
  "memory_type": "workflow_episode",
  "summary": "The last HyperRAG routing fix required using gpu_cluster filters and fail-open fallback.",
  "feature_keys": ["hyperrag.routing"],
  "clusters": ["72", "73", "94"],
  "task_keys": ["debug_hyperrag_routing"],
  "accepted": true,
  "reward": 1.0,
  "created_at": "...",
  "source": "engram_plugin"
}
```

---

## 11. Redis / BitFrost / ACE Key Registry

Standard key families:

```txt
ace:ctx:{cacheKey}
ace:cluster:{clusterId}
ace:task:{taskKey}
ace:feature:{featureKey}
agents:dir:{path}
wiki:note:dir:{pathSlug}
summary:cluster:{clusterId}
code:llm_output:path:{pathHash}
code:llm_output:by-cluster:{clusterId}
atlas:glyph:{clusterId}
engram:memory:{memoryId}
engram:feature:{featureKey}
engram:recent
engram:rewarded
```

Rules:

```txt
Redis stores hot summaries, counters, preflight context, and small memory cards.
Redis does not store raw tensors, raw KV cache, native pointers, hidden reasoning, or full corpus chunks.
```

---

## 12. Engram Plugin Support

### Purpose

Engram should be an **optional episodic memory plugin**, not canonical storage.

Use it for:

```txt
agent workflow episodes
operator decisions
accepted/rejected retrieval results
prompt fixes
tool-use lessons
case workflow notes
routing failures
successful repair paths
```

Do not use it for:

```txt
canonical evidence
raw PDFs
raw code chunks
Qdrant vector truth
Neo4j topology truth
Postgres audit truth
legal conclusions
```

### Proposed adapter

```txt
src/lib/server/memory/engram-plugin-adapter.ts
```

Type:

```ts
export type EngramMemory = {
  id: string;
  memoryType:
    | 'workflow_episode'
    | 'retrieval_lesson'
    | 'prompt_fix'
    | 'tool_use_lesson'
    | 'case_workflow_note'
    | 'routing_failure'
    | 'successful_repair_path';
  summary: string;
  featureKeys: string[];
  clusters: string[];
  taskKeys: string[];
  sourceRefs: string[];
  accepted?: boolean;
  reward?: number;
  createdAt: string;
  updatedAt?: string;
};
```

Interface:

```ts
export interface EngramPluginAdapter {
  health(): Promise<{ ok: boolean; source: string; warning?: string }>;
  writeMemory(memory: EngramMemory): Promise<{ ok: boolean; id?: string; warning?: string }>;
  searchMemories(query: string, opts?: {
    featureKeys?: string[];
    clusters?: string[];
    limit?: number;
  }): Promise<EngramMemory[]>;
}
```

Fail-open behavior:

```txt
If Engram unavailable:
  return empty memories
  log warning
  do not block HyperRAG
  do not block uploads
  do not block AGENTS generation
```

### Projection flow

```txt
Engram plugin
  → EngramPluginAdapter
  → Postgres metadata_envelopes
  → Qdrant engram_memories
  → Neo4j (:EngramMemory)
  → CouchDB engram_memory docs
  → Redis engram:memory:{id}
  → ACE context packet if relevant
```

### HyperRAG lane

Add later, not immediately:

```txt
Lane: engram_memory
Weight: 0.05 to 0.10
Use only if:
  query profile = agent_workflow | code_debug | retrieval_debug
  memory confidence high
  memory has sourceRefs
```

---

## 13. Engram Research Topics

Research before implementation:

```txt
[ ] Exact Engram repo/API surface.
[ ] Does Engram expose HTTP, gRPC, MCP, file, or embedded library API?
[ ] Memory object schema.
[ ] Search/retrieval API.
[ ] Persistence backend.
[ ] License.
[ ] Node/TypeScript support.
[ ] Python/Go support.
[ ] Auth/security model.
[ ] Local-only mode.
[ ] Export/import format.
[ ] How to delete or redact memories.
[ ] How to version memories.
[ ] Whether memories can be linked to source refs.
[ ] Whether memory confidence/reward can be stored.
[ ] Whether it supports graph edges or only records.
[ ] Whether it can be used as an MCP server.
```

Related memory-system topics to review:

```txt
[ ] Task-agnostic plugin memory modules for LLM agents.
[ ] Knowledge-centric memory graphs.
[ ] Episodic vs semantic memory in agent systems.
[ ] Long-term + short-term memory replacement policies.
[ ] Context-aware memory ingestion.
[ ] Memory retrieval before extraction.
[ ] RRF fusion for memory + vector + graph recall.
[ ] Tool-poisoning and memory poisoning risks in MCP workflows.
[ ] Structured provenance for memories.
[ ] Redaction/deletion workflows for legal evidence systems.
```

---

## 14. Engram Safety Rules

```txt
[ ] Engram memories are hints, not truth.
[ ] Memories must include source refs if used in legal/case context.
[ ] Memories must be excluded from final legal conclusions unless corroborated by evidence.
[ ] Memory ingestion must be disabled for privileged/secret material unless explicitly allowed.
[ ] Memory search should be scoped by user/case/workspace.
[ ] Memory deletion/redaction must be supported.
[ ] Memory poisoning must be considered.
[ ] MCP/tool descriptions must be signed or allowlisted.
[ ] No memory should bypass HyperRAG provenance.
```

---

## 15. Validation Tests

### Parent atlas

```txt
[ ] atlas:root:full completes in dry-run mode.
[ ] SvelteKit route counts are imported into repo-root atlas summary.
[ ] Existing SvelteKit graph files remain unchanged.
[ ] No ignored directories are indexed.
[ ] Human-edited AGENTS.md files are preserved.
```

### Neo4j

```txt
[ ] Neo4j dry-run reports File/Route/Feature/Cluster/Task counts.
[ ] Neo4j --write creates expected node labels.
[ ] Neo4j --write creates expected edge types.
[ ] PageRank/Louvain jobs can run or are skipped with warning.
```

### CouchDB

```txt
[ ] CouchDB dry-run reports docs/views to write.
[ ] CouchDB --write creates directory_wiki docs.
[ ] CouchDB views exist: by_cluster, by_feature, by_route, by_tag, by_workspace.
```

### Qdrant

```txt
[ ] Qdrant dry-run reports payload tags to patch.
[ ] Qdrant --write updates repo/workspace/path/language/feature_key/cluster_alias.
[ ] glyph_atlas collection exists.
[ ] engram_memories collection can be created dry-run.
```

### Redis

```txt
[ ] Redis sync reports ace:cluster keys.
[ ] Redis sync reports agents:dir keys.
[ ] Redis sync reports summary:cluster keys.
[ ] Redis sync reports code:llm_output keys.
[ ] Redis sync reports engram:* keys only if Engram adapter enabled.
```

### Engram

```txt
[ ] Engram unavailable fails open.
[ ] Engram health check returns warning, not fatal error.
[ ] writeMemory dry-run validates schema.
[ ] searchMemories returns [] when disabled.
[ ] Engram memory projection writes to metadata_envelopes dry-run.
[ ] Engram memories never override evidence/provenance truth.
```

---

## 16. Codex / Claude Code Prompt

```txt
You are working in:
C:\Users\james\Videos\deeds-web-app

Task:
Finish the Parent Atlas Karpathy Pipeline and add optional Engram plugin memory support.

Context:
The uploaded graphify-batch-gpu-analysis.mjs already performs:
- graph JSON load
- Redis wiki note load
- PageRank enrichment
- cluster/SOM audit
- Gemma4 glyph summaries
- EmbeddingGemma embeddings
- Qdrant glyph_atlas upserts
- Redis agents:dir, code:llm_output, summary:cluster writeback
- ACE batch logging
- report generation
- ACE smoke probe

We need to make this one stage inside a repo-root parent atlas pipeline.

Parent atlas pipeline:
1. atlas:root:index
2. atlas:routes:import
3. atlas:imports:static
4. atlas:imports:dynamic
5. atlas:env:map
6. atlas:qdrant:tag
7. atlas:neo4j:ingest
8. atlas:couchdb:mapreduce
9. graphify:karpathy-batch
10. atlas:redis:sync
11. agents:write
12. atlas:validate

Rules:
- Do not delete existing SvelteKit graph files.
- Do not overwrite human-edited AGENTS.md files.
- Do not index node_modules, .git, dist, build, .svelte-kit, coverage, .cache.
- Do not make GPU required for correctness.
- Do not store raw tensors, raw KV cache, native pointers, or hidden reasoning.
- Qdrant/Neo4j/CouchDB/Redis writes must default to dry-run unless --write is passed.
- Redis is hot cache only.
- Neo4j is graph traversal authority.
- Qdrant is semantic vector retrieval.
- CouchDB is wiki/MapReduce rollup storage.
- Postgres JSONB is durable audit truth.
- Engram is optional episodic memory, not canonical truth.
- Engram must fail open when unavailable.

Implement:
1. atlas.config.json at repo root
2. scripts/atlas/index-repo-root.mjs
3. scripts/atlas/ingest-sveltekit-route-map.mjs
4. scripts/atlas/build-repo-import-map.mjs
5. scripts/atlas/build-repo-env-map.mjs
6. scripts/atlas/project-neo4j-graphrag.mjs
7. scripts/atlas/ingest-couchdb-mapreduce.mjs
8. scripts/atlas/tag-qdrant-codebase-payloads.mjs
9. scripts/atlas/sync-redis-ace-cards.mjs
10. scripts/atlas/validate-parent-atlas.mjs
11. scripts/graphify/graphify-batch-karpathy-analysis.mjs
12. scripts/graphify/graphify-batch-gpu-analysis.mjs wrapper/alias
13. src/lib/server/memory/engram-plugin-adapter.ts
14. docs/architecture/parent-atlas-karpathy-pipeline.md
15. docs/architecture/engram-plugin-memory-support.md

Refactor uploaded graphify-batch-gpu-analysis.mjs:
- Rename conceptual lane to Karpathy Batch Context Synthesis.
- Keep old command as wrapper for compatibility.
- Replace redis.keys with scanStream.
- Make Redis optional during --dry-run.
- Batch Qdrant upserts.
- Add optional Postgres ace_retrieval_runs / ace_retrieval_hits persistence.
- Add explicit CouchDB MapReduce ingestion stage.
- Add explicit Neo4j GraphRAG projection stage.
- Keep --limit, --dry-run, --skip-llm, --skip-qdrant, --skip-ace.

Engram support:
- Add adapter interface only first.
- Do not assume a concrete Engram API until repo/API is verified.
- Add health(), writeMemory(), searchMemories().
- Fail open when unavailable.
- Project memories as low-trust hints into metadata_envelopes/Qdrant/Neo4j/CouchDB/Redis only when enabled.
- Do not allow Engram to override evidence or source-of-truth records.

Validation:
- atlas:root:full completes in dry-run mode.
- SvelteKit route counts are imported into repo-root atlas summary.
- Neo4j dry-run reports File/Route/Feature/Cluster/Task counts.
- CouchDB dry-run reports docs/views to write.
- Qdrant dry-run reports payload tags to patch.
- Redis sync reports ace:cluster, agents:dir, summary:cluster, code:llm_output counts.
- Engram disabled/unavailable returns empty memories and warning.
- No raw vectors are returned to browser.
- Human-edited AGENTS.md files are preserved.
- Existing sveltekit-frontend graph files remain unchanged.

Return:
- files changed
- commands run
- tests passed/failed/skipped
- blockers
- next commit message
```

---

## 17. Recommended Commit Sequence

```txt
1. docs(atlas): define parent atlas karpathy pipeline
2. feat(atlas): add repo-root parent atlas config and indexer
3. feat(atlas): import sveltekit route map into parent atlas
4. feat(graphify): refactor batch gpu analysis into karpathy synthesis lane
5. feat(graph): add neo4j graphrag projection from parent atlas
6. feat(couchdb): add mapreduce ingestion for atlas wiki docs
7. feat(qdrant): add parent atlas payload tagging
8. feat(redis): sync ace cluster and code llm preflight cards
9. feat(memory): add optional engram plugin adapter
10. test(atlas): validate parent atlas dry-run pipeline
11. docs(memory): document engram plugin support and safety rules
```

---

## 18. Documentation / Research Backlog

Research and document:

```txt
[ ] Engram exact repo/API/license.
[ ] Engram local deployment and persistence model.
[ ] Engram memory object schema.
[ ] Engram search API.
[ ] Engram deletion/redaction API.
[ ] Engram MCP server possibility.
[ ] Plug-in memory modules for LLM agents.
[ ] MCP tool security / tool poisoning.
[ ] CouchDB MapReduce view maintenance.
[ ] Neo4j GDS PageRank/Louvain operational costs.
[ ] Qdrant payload indexing / filtering best practices.
[ ] Postgres JSONB audit query patterns.
[ ] pgvector HNSW index maintenance.
[ ] Legal evidence provenance and memory safety.
[ ] Agent memory poisoning risk.
```

---

## 19. Bottom Line

The batch script is the correct foundation for Karpathy synthesis. The next move is to wrap it with:

```txt
repo-root atlas
  + route/import/env maps
  + Neo4j GraphRAG projection
  + CouchDB MapReduce ingestion
  + Qdrant payload tagging
  + Redis ACE hot-cache sync
  + optional Engram episodic memory adapter
  + AGENTS regeneration
  + validation gates
```

Engram should be treated as a **low-trust episodic memory plugin** until the exact repo/API/license and deletion model are verified.

---

## 20. Tool Trace Observability

```txt
[ ] tool_traces stores status and error alongside args/result_summary/duration_ms.
[ ] logToolTrace marks tool-loop failures with status=error and preserves error text.
[ ] Observability views can filter traces by status without parsing result_summary.
[ ] The trace logger stays fire-and-forget and fails open.
```
