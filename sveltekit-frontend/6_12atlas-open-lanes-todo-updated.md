# Parent Atlas Open Lanes TODO

Generated from the current workstation evidence. This is the production-readiness board for the remaining open lanes, not a runtime plan.


## 2026-06-12 Update — Automation Intelligence / LangGraph / Bitfrost / Tool Manifests

### Current Gate Corrections

The board should now treat the following lanes as complete or baseline-ready:

- **Packet Contract Lane: complete.** Gates 1-6 pass: packet contract smoke, metadata verify, Qdrant payload verify, graphify packet contract, ranking signal coverage, and HyperRAG packet RPC smoke.
- **Neo4j `USED_CONCEPT` projection: complete for canonical concepts.** Packet-to-concept edges are allowlisted against `concept_records`; noisy path tokens remain in tags/BM25 payloads, not graph concept nodes.
- **Qdrant payload enrichment: complete enough for retrieval cascade work.** Enriched payloads should be the source for TurboVec loading; do not re-ingest raw files into TurboVec.
- **TurboVec/GpuBridge contract: complete.** Keep `TurboVecService` for ANN/compression/search and `GpuBridgeService` for numeric kernels.
- **HyperRAG smoke: passing.** Keep smoke threshold realistic for cold-start Neo4j; prefer warm-run measurements for regression tracking.

### New Active Lane — LangGraph Startup Orchestrator

Goal: turn existing Atlas audits into a read-only startup graph that recommends and optionally queues bounded work for OpenCode/subagents.

Create:

```txt
scripts/agentic/atlas-langgraph-workflow.ts
scripts/agentic/atlas-langgraph-startup.mjs
scripts/agentic/atlas-kanban-task-writer.mjs
```

Workflow nodes:

```txt
scanRepo
classifyFiles
validatePacketContract
auditRankingSignals
auditQdrantPayloads
auditProtoRegistry
auditMcpToolManifests
auditRewardCoverage
generateKanbanTasks
recommendNextLane
```

Hard rules:

- startup workflow is read-only by default
- no LLM-driven mutation without `--apply`
- every task must cite a report, script, or failing gate
- write task candidates to the durable OpenCode/kanban layer, not chat memory
- use Parent Atlas as truth; LangGraph is only orchestration

Output:

```txt
docs/reports/atlas-langgraph-startup.json
docs/reports/atlas-langgraph-startup.md
sveltekit-frontend/.opencode/tasks/task-state.md
```
### New Active Lane — MCP Tool Manifest Packets
Goal: reduce tool-selection entropy for Gemma4 / OpenAI-compatible llama-server by retrieving tool candidates before exposing tools.
Create:
```txt
scripts/atlas/build-mcp-tool-manifest-packets.mjs
scripts/atlas/audit-mcp-tool-selection.mjs
Packet shape:
```json
{
  "packet_kind": "tool_manifest",
  "tool_name": "atlas.find_feature",
  "domain": "atlas",
  "ontology": ["retrieval", "feature_lookup"],
  "examples": ["find feature by source_ref", "locate packet by feature_id"],
  "requires": ["packet_key", "feature_id"],
  "transport": "mcp",
  "source_ref": "opencode.json#tools.atlas.find_feature"
}
Tool-call flow:
```txt
user query
  ↓
EmbeddingGemma
  ↓
Qdrant search over tool_manifest packets
  ↓
Top 5-10 candidate tools
  ↓
llama-server/OpenAI-compatible facade receives narrowed tools[]
  ↓
tool_calls[] validation and dispatch
Gate:
- manifest packets created for all active MCP/grpc/http tools
- Qdrant has tool manifest payloads
- startup selects <=10 tools for a sample query
- no raw 300+ tool list is sent by default
### New Active Lane — Domain Ontology Indexing for Legal-AI App
Goal: index the SvelteKit legal-ai app by durable product domains so cases/login/register/evidence/RAG flows are discoverable and prunable.
Initial ontology:
```txt
auth_login_register
case_management
evidence_upload_storage
document_processing
rag_search_retrieval
legal_reports_citations
admin_status_observability
api_routes_endpoints
database_drizzle_postgres
redis_bitfrost_cache
qdrant_vector_index
neo4j_graph_context
ui_svelte_components
mcp_tooling_agents
gpu_turbovec_libtorch
infra_docker_seaweedfs
tests_smoke_harness
Tasks:
- [ ] add `scripts/atlas/classify-domain-ontology.mjs`
- [ ] map `source_ref -> domain_id -> feature_id -> packet_key`
- [ ] store domain tags in `atlas_packets.payload.domain_ids`
- [ ] mirror domain tags into Qdrant payloads
- [ ] add domain rollups to Neo4j as `(:Domain)` nodes
- [ ] use domain filters for codebase pruning and kanban task routing
### New Active Lane — Bitfrost / Redis Temporal Indexing
Goal: cluster all pipeline files and task/retrieval outcomes into a 7-day hot temporal cache for OpenCode and subagents.
Redis key patterns:
```txt
bitfrost:temporal:file:{source_ref_hash}        TTL 7d
bitfrost:temporal:domain:{domain_id}            TTL 7d
bitfrost:temporal:task:{task_id}                TTL 7d
bitfrost:temporal:query:{query_hash}            TTL 7d
bitfrost:temporal:tool:{tool_name_hash}         TTL 7d
gpu:rerank:{query_hash}                         TTL 5m
gpu:karpathy:scores                             TTL 24h
ace:rank:dirty_files                            TTL 7d
Tasks:
- [ ] add `scripts/atlas/build-temporal-bitfrost-index.mjs`
- [ ] cache domain/file clusters for 7 days
- [ ] cache top tool manifest candidates per query for 7 days
- [ ] cache recently failed/warned gates for startup briefing
- [ ] write OpenCode task candidates from temporal cache
- [ ] keep deterministic GPU rerank cache separate from semantic LLM response cache
### New Active Lane — Reward Prior / Learning Labels
Goal: create labels for XGBoost, QLoRA, reward-weighted clustering, and planner adaptation.
Create:
```txt
scripts/atlas/backfill-reward-prior.mjs
scripts/atlas/audit-reward-prior.mjs
Writes:
```json
{
  "reward_score": 0.73,
  "reward_count": 12,
  "success_count": 9,
  "failure_count": 3,
  "last_rewarded_at": "2026-06-12"
}
Gate:
- reward_score coverage >= 40% on addressable packets
- >=500 successful trace-linked packet examples
- no reward writes without trace evidence
### New Active Lane — TurboVec Load From Qdrant Enriched Points
Goal: make TurboVec search non-empty without re-ingesting raw files.
Create:
```txt
scripts/atlas/load-turbovec-index-from-qdrant.mjs
scripts/atlas/verify-turbovec-qdrant-load.mjs
Flow:
```txt
Qdrant codebase_chunks_768 enriched points
  ↓ scroll with vectors + payload
  ↓ require feature_id/community_id/tags or concept_ids
  ↓ TurboVecService.Upsert
  ↓ Health.indexed > 0
  ↓ Search returns candidates
Gate:
- Upsert indexed > 0
- Search returns candidates > 0
- sample candidate can be resolved back to Qdrant payload and atlas_packets packet_key
### New Active Lane — Proto Registry Packets
Goal: index gRPC/protobuf services and RPCs as packets so tools/RPCs are discoverable.
Create:
```txt
scripts/atlas/audit-proto-registry.mjs
scripts/atlas/build-proto-registry-packets.mjs
Classify:
```txt
ACTIVE CORE: tool_calling, retrieval, vectors, embedding, turbovec, gpu_bridge
ACTIVE DOMAIN: chat_assistant, chr97_agent, codeintel, codeintel_enrichment, evidence_metadata, library_search
COMPATIBILITY SHIM: turbovec_cuda
ARCHIVED: proto/archived/*
Packet kinds:
```txt
proto_file
proto_service
rpc_method
### New Active Lane — Codebase Prune Classifier
Goal: classify file surfaces before deletion/move; never delete directly from an LLM suggestion.
Create:
```txt
scripts/atlas/classify-codebase-prune-candidates.mjs
Classes:
```txt
keep_canonical
convert_to_ndjson
compress_zstd
move_to_cold
delete_if_regenerable
index_metadata_only
Gate:
- report-only first
- no delete/move unless restore manifest exists
- SeaweedFS restore proof required for cold moves
- generated proto outputs and caches may be regenerable but require source proof
### Revised Finish Order
1. MCP tool manifest packets
2. LangGraph startup workflow and kanban task writer
3. Bitfrost/Redis 7-day temporal index
4. Domain ontology classifier for legal-ai app files
5. Proto registry audit and packets
6. Reward prior backfill
7. TurboVec load from Qdrant enriched points
8. XGBoost feature export
9. HyperRAG bounded traversal improvements
10. Codebase prune classifier and storage-tier moves
11. GPU latent projection / SOM topology
12. QLoRA policy export only after reward labels are stable
## Next Actions - Atlas / NES CHR97 Production Readiness
### Status
Production-ready at the directory level.
The directory-lineage foundation is healthy, the core topology chain is now working, and the remaining work now moves into higher-order graph, recommendation, and storage-tiering lanes.
Current live spine:
- `packet_keys` joins to live `atlas_packets.packet_key` at high coverage.
- `feature_ids` also join cleanly enough to stay authoritative for the current concept-memory lane.
- `evidence_cards` is now a compatibility/backfill field, not the primary live spine.
## Consolidated Action Plan And Roadmap
The canonical staged order is:
### Stage 1 - Storage & Registry Alignment
Approx completion: ~45%
- hidden surface registry reconstruction: complete, compare-only
 - artifact bloat audit complete: 7,781 files / 15,052.68 MB / 463 duplicates, no single 6 GB file present; TurboVec tiering open
- packet contract mirror audit complete: read-only validator now covers `task_semantic_packets`, `atlas_packets`, `nes_chrom_packets`, `nes_chrom_kag_dag_hits`, `parent_atlas_documents`, and `route_runtime_packets`; live DB is reachable and the current repairs are additive sidecar alignments, not new packet models
- recommendation merge deduplication audit: open
### Stage 2 - Core Graph & Native Execution
Approx completion: ~45%
- native GEMM binding classification: partial, public export missing
- Neo4j live projection writer: open
- Phase 16 cache invalidation binding: partial
### Stage 3 - Advanced Retrieval R&D
Approx completion: ~30%
 - HyperRAG Packet RPC / Qdrant tagging: partial
 - higher-hop enrichment and supernode backfill: open; current app audit still reports `somCluster`, `glyphRecord`, `qdrantHit`, `redisHotKey`, and `neo4jNode` at 0% coverage
### Stage 4 - Agent Memory & Scoring Pipeline
Approx completion: ~49%
- workspace kanban and discovery scanners: partial
- custom engram nes chrom claude-mem-opencode like spectra-g/engram integration: partial/optional
- XGBoost formal reranking: partial
- agentic startup briefing: partial
### Merged Packet Lanes
Approx completion: ~20%
- Packet Contract Lane: stable `packet_key`, `source_ref`, `feature_id`, `community_id`, plus packet metadata normalization and Postgres JSONB/index verification
- Packet Enrichment Lane: Gemma4 summaries, LangExtract tags, embeddings, autoencoder, SOM
- Contextual Tree Lane: Neo4j `USED_CONCEPT`, higher-hop enrichment, supernode audit
- Retrieval Ranking Lane: Qdrant cosine, PageRank, XGBoost, MARCO reranker, reward score
- Agent Policy Lane: RL tool policy, Gemma4 QLoRA adapter
- Memory Lane: Redis/Bifrost dedupe, SOM-cell cache, reward memory
Status:
- verified native bridge artifacts exist for the implementation boundary: `simd-bridge/rust/graph-engine` and `simd-bridge/rust/hmm-repair`
- `graphPath` and `hmmPath` resolve to the expected `.node` binaries in the current app workspace audit
- this lane is a merged roadmap surface, not a duplicate packet model
The next work now moves into:
1. concept evidence spine repair,
2. recommendation merge audit,
3. Neo4j `USED_CONCEPT` edge projection,
4. atlas_feature_map / parent_atlas_documents code-file join repair (0.00% in the current workspace audit; `0/6765` rows joined, so the join is still fully open here),
5. packet contract mirror follow-up on the stable packet spine (`ADD_DRIZZLE_MIRROR` / `APPLY_EXISTING_SQL` repairs, not new packet models),
6. artifact bloat audit and storage tiering (7,781 files / 15,052.68 MB / 463 duplicates in the app workspace),
7. semantic index mirroring,
8. cold-storage restore verification,
9. evaluation harnesses and agent-learning gates,
10. high-ROI parser / embedding lanes,
11. agentic startup briefing for read-only planning bootstraps,
12. merged packet-lane implementation on the stable packet identity spine.
### P0 - Directory Readiness
#### 1. Directory-level sourceRef map, including gitignored paths
Goal: map directories, not loose files.
Run from repo root:
```bash
rg --files --hidden --no-ignore \
  -g '!node_modules/**' \
  -g '!.git/**' \
  -g '!*.lock' \
  | node scripts/atlas/build-directory-source-map.mjs
Expected output:
- `directory_path`
- `source_ref`
- `feature_id`
- `feature_label`
- `packet_count`
- `summary_count`
- `cold_storage_status`
- `qdrant_collection`
- `redis_centroid_key`
#### 2. Verify gitignored Atlas / NES / CHR97 directories
```bash
git status --ignored -s | rg "atlas|nes|chrom|chr97|engram|packet|ndjson|jsonl|qdrant|redis|duckdb"
Create report:
```bash
node scripts/atlas/audit-ignored-directories.mjs --apply=false
Output:
- `memory/reports/ignored-directory-audit.md`
- `memory/exports/ignored-directory-map.json`
#### 3. SourceRef -> feature_id -> feature_label lineage check
Hard gate:
```bash
node scripts/atlas/verify-feature-lineage.mjs
Must prove:
- `directory_path -> source_ref -> file_path -> function_symbol -> feature_id -> feature_label -> packet_id`
Fail if any packet has:
- missing `source_ref`
- missing `feature_id`
- missing `feature_label`
- orphaned Qdrant payload
- orphaned Redis centroid
- mismatched Postgres row
#### 4. Parent Atlas ingestion indexing spec
Create tests before more ingestion:
- `tests/atlas/parent-ingestion-indexing.spec.ts`
- `tests/atlas/source-ref-lineage.spec.ts`
- `tests/atlas/qdrant-payload-mirror.spec.ts`
- `tests/atlas/redis-centroid-cache.spec.ts`
- `tests/atlas/cold-storage-manifest.spec.ts`
Minimum assertions:
- directory maps are stable
- gitignored dirs are visible to audit
- generated dirs are excluded unless explicitly allowed
- `node_modules` is never indexed as app source
- summaries can be restored from cold storage
- Qdrant, Postgres, Redis agree on `feature_id`
# P1 - High ROI
## 5. Rust N-API parser lane -> search for this we already have one built.
Purpose: faster symbol extraction than Node AST scripts.
Kanban task:
- [ ] Create `crates/atlas-parser-napi`
- [ ] Parse TS/Svelte/Rust/SQL/MD
- [ ] Emit function symbols
- [ ] Emit import/export graph
- [ ] Emit directory summaries
- [ ] Write napi binding
- [ ] Compare output with existing Node parser
- [ ] Add snapshot tests
Target output:
```json
{
  "file_path": "...",
  "source_ref": "...",
  "directory_path": "...",
  "symbols": [],
  "imports": [],
  "exports": [],
  "feature_candidates": []
}
#### 6. Libtorch / embedding lane
Do not make libtorch the first blocker. Use it after lineage is stable.
Kanban:
- [ ] Export existing embeddings from Qdrant/Postgres
- [ ] Train/evaluate centroid compression
- [ ] Compare 768 -> 386 -> 64 dims
- [ ] Add ANN recall test
- [ ] Add centroid drift report
- [ ] Only then wire libtorch sidecar
#### 7. Cold storage extraction to SeaweedFS
Move only after manifests exist.
Manifest shape:
```json
{
  "source_ref": "...",
  "file_path": "...",
  "directory_path": "...",
  "feature_id": "...",
  "feature_label": "...",
  "summary": "...",
  "packet_ids": [],
  "postgres_row_id": "...",
  "qdrant_point_ids": [],
  "redis_keys": [],
  "seaweedfs_uri": "...",
  "restore_verified": true
}
Hard rule:
- No delete/move unless `restore_verified=true`
### P2 - Semantic Search Wiring
#### 8. Mirror stores
Postgres 18 / pgvector:
- `atlas_directories`
- `atlas_source_refs`
- `atlas_feature_labels`
- `atlas_packets`
- `atlas_cold_storage_manifest`
Qdrant payload must include:
```json
{
  "source_ref": "...",
  "directory_path": "...",
  "feature_id": "...",
  "feature_label": "...",
  "packet_type": "nes_chrom",
  "cold_storage_uri": null
}
Redis centroid keys:
- `centroid:directory:{hash}`
- `centroid:feature:{feature_id}`
- `centroid:packet:{packet_id}`
Read-only community coverage audit:
- `atlas_packets.community_id` is currently 100% populated in the live Postgres table.
- No P2 community backfill is required at the packet layer.
- Keep SOM / community propagation checks as a watchpoint, not an active blocker, unless a later live audit regresses.
### Updated Status
Status: Production-ready at the directory level.
P0 is now:
> P0: Validate lineage, directory maps, ignored dirs, semantic mirrors, and cold-storage restore before claim
P0 tasks #3 and #4 are now verified complete by `scripts/atlas/verify-feature-lineage.mjs` and `tests/parent-atlas-ingestion-spec.ts`.
## What Is Already Wired
- OpenCode bootstrap now pulls ACE/recommendation evidence and verifies Bitfrost without blocking on a full startup-truth sweep.
- Recommendation materialization no longer forwards to the legacy Gemma4 hook by default.
- Parent Atlas / feature lineage / runtime packet / PostgreSQL mirror audits are already in place.
- Temporal task registry now persists findings, recommendations, tasks, and task-history packets instead of overwriting the latest recommendation snapshot.
- Use `sveltekit-frontend/.opencode/tasks/task-state.md` and `npm run opencode:tasks:refresh` for the durable Kanban layer.
- Concept-memory telemetry is live on `packet_keys` and `feature_ids`; `evidence_cards` is compatibility/backfill only.
## Current Runtime Topology Order
1. Redis preflight / wait-for-cache
2. Concept evidence spine backfill from `packet_keys`
3. Neo4j `USED_CONCEPT` edges
4. `atlas_feature_map` ↔ `parent_atlas_documents` join audit
5. `route_runtime_packets` materialization
6. SOM coverage audit/backfill from existing topology
7. Phase 4B benchmark
8. AE train `768 -> 64`
9. SOM `20x20` retrain
10. PPO / QLoRA dataset export
## Runtime Coverage Audit
Read-only coverage measurement now lives in `docs/reports/runtime-coverage-audit.md` and `docs/reports/runtime-coverage-audit.json`.
- atlas_feature_map ↔ parent_atlas_documents join: 0.00% in the current workspace audit (0/6765); the join is still fully open here
- route_runtime_packets cache-hit coverage: 96.2%
- SOM coverage: 0%
- selected_concepts coverage: 100%
- USED_CONCEPT / Neo4j projection coverage: 0%
The highest-leverage next lane remains `Neo4j USED_CONCEPT` edges, because trace population is now complete and the graph projection spine still has no live write lane. The join repair lane now only needs the remaining code-file subset; 262 rows are backfill-ready and parent-doc coverage is no longer the blocker; the packet community lane is closed.
## Active Data-Maturity Lane - 3F Trace Population
Status: complete.
Completion: 100%.
The trace-learning lane is now green:
- `agent_traces_total`: 1134
- target traces: 1000+
- `selected_concepts`: complete on fresh traces
- `selected_packets`: present enough for export gating
- `retrieval_strategy`: present
- `repair_actions`: present on fresh traces
- `reward`: stable
- `outcome`: present on fresh traces
- QLoRA examples exported: 779
Active target:
```json
{
  "selected_concepts": ["..."],
  "selected_packets": ["..."],
  "retrieval_strategy": "fusion",
  "repair_actions": ["..."],
  "reward": 0.92,
  "outcome": "pending"
}
Next safe action:
- keep planner-learning export gated on fresh traces and move to graph projection work.
Read-only evidence:
- `docs/reports/agent-trace-data-maturity-report.md`
- `C:/Users/james/Videos/deeds-web-app/docs/open-lanes/phase-3f-agent-trace-distillation.md`
- `C:/Users/james/Videos/deeds-web-app/docs/reports/qlora_distillation_report.json`
- `C:/Users/james/Videos/deeds-web-app/memory/packets/synthetic-traces.jsonl`
- `docs/reports/sourceRef-context-neo4j-report.md`
## Active Subgraph Checklist — HyperRAG Packet RPC
Goal: expose codebase semantic indexing as replayable multi-hop RPC over NES/CHR packets.
### Storage Layers
- Postgres 18 / JSONB / pgvector: canonical packet ledger, `source_ref -> feature_id -> feature_label`, `packet_markdown_chunks`, `retrieval_telemetry`.
- Qdrant: dense ANN lane, multi-vector payload tagging, `codebase_chunks_768` for codebase topology, `legal_documents` for legal document runtime retrieval.
- Neo4j / GDS: `directory -> sourceRef -> feature -> packet` graph, community detection, centrality / neighborhood expansion.
- DuckDB / Arrow: offline joins, MapReduce reports, large audit compaction.
- SeaweedFS: cold raw artifacts, large `.json` / `.md`, summaries, manifests, centroids.
- Redis: hot packet cache, centroid shortcuts, recently retrieved HyperRAG context.
### RPC API Target
Return a bounded packet response with query, strategy, ranked packets, Qdrant tags, Neo4j neighbors, lane scores, Gemma4 summaries, and replay trace fields for Qdrant/Postgres/Neo4j/DuckDB latency.
### Implementation Tasks
- [ ] Add Qdrant payload tags: `source_ref`, `feature_id`, `feature_label`, `directory_path`, `packet_key`, `som_cluster`, `community_id`, `temperature`, `surface`.
- [ ] Add `hyperrag_packet_rpc` route/server helper.
- [ ] Verify build-time imports for the RRF chain behind the existing route file: `rrf-integration.ts`, `bm25-search.ts`, `concept-extraction-tool.ts`, `neo4j-graph-signal.ts`, and `embedding-client.ts`.
- [ ] Fuse lanes: Qdrant dense, Postgres JSONB/FTS/trigram, Neo4j neighborhood expansion, Redis hot cache.
- [x] Project `sourceRef-context-neo4j` as a bounded read-only projection report before any live Neo4j write lane.
- [ ] Summarize packet groups with Gemma4 after repo evidence is retrieved.
- [ ] Write retrieval telemetry.
- [ ] Return replay trace.
- [ ] Add smoke test: `npm run smoke:hyperrag-packet-rpc`.
### Hard Rules
- No re-ingest.
- No raw large `.md` in Git.
- No direct Gemma4 mutations.
- All writes go through bounded scripts.
- Keep `codebase_chunks_768` separate from `legal_documents`.
- SeaweedFS is cold evidence, not hot retrieval.
## Open Lanes To Finish
### 1. Concept evidence spine repair
- Status: active
- Completion: ~80%
- Live spine: `packet_keys` and `feature_ids`
- Compatibility field: `evidence_cards`
- Audit command: `npm run atlas:concept-evidence:audit`
- Backfill command: `npm run atlas:concept-evidence:backfill:dry`
- Finish line:
  - keep `packet_keys` authoritative for live joins
  - regenerate `evidence_cards` from `packet_keys` where a compatibility copy is still needed
  - do not re-ingest or rebuild the concept-memory layer
- Useful evidence:
  - `scripts/atlas/audit-concept-evidence-spine.mjs`
  - `scripts/atlas/backfill-concept-evidence-spine.mjs`
  - `docs/reports/concept-evidence-spine-audit-report.md`
  - `docs/reports/concept-evidence-spine-audit-report.json`
  - `docs/reports/concept-evidence-spine-backfill-report.md`
  - `docs/reports/concept-evidence-spine-backfill-report.json`
### 1B. Higher-hop enrichment audit / backfill
- Status: active
- Completion: ~30%
- Missing: measured supernode pressure and bounded live-edge repair from the trace spine
- Finish line:
  - keep joins anchored on packet_key, source_ref_key, and qdrant_point_id
  - classify concept / feature / community supernode pressure before any graph expansion
  - seed `USED_CONCEPT` and the later `USED_PACKET` lane only from bounded trace evidence
- Useful evidence:
  - `scripts/atlas/audit-higher-hop-enrichment.mjs`
  - `scripts/atlas/seed-neo4j-used-concept-edges.mjs`
  - `docs/reports/higher-hop-enrichment-report.md`
  - `docs/reports/higher-hop-enrichment-report.json`
  - app apply evidence: 1134 traces with selected concepts, first 25 traces created 25 `USED_CONCEPT` edges across 4 concepts (`agent_intelligence`, `database_orm`, `observability_telemetry`, `ui_components`)
### 2. Recommendation merge audit
- Status: active
- Completion: ~20%
- Missing: merge-key / sourceRef normalization audit for recommendation materialization; the current snapshot only emits 5 recommendations in this workspace, so the older 4173-seed collapse claim is stale here
- Finish line:
  - explain why the current snapshot only emits 5 recommendations
  - verify whether the merge key, sourceRef normalization, or dedupe filter is too aggressive
  - keep recommendation materialization bounded and replayable
- Likely causes:
  - merge-key mismatch
  - sourceRef normalization mismatch
  - over-aggressive dedupe
- Useful evidence:
  - `C:/Users/james/Videos/deeds-web-app/scripts/atlas/audit-recommendation-merge.mjs`
  - `scripts/atlas/route-runtime-packet-recommendations.mjs`
  - `scripts/atlas/parent-atlas-coverage-recommendations.mjs`
  - `scripts/opencode/materialize-recommendation-tasks.mjs`
  - `docs/reports/parent-atlas-doc-indexing-2026-06-01.json`
  - `docs/reports/postgres18-promotion-contract-report.md`
### 3. Artifact bloat audit
- Status: active
- Completion: ~25%
- Missing: classification of raw, derived, embedding, checkpoint, and duplicate artifact surfaces; the hidden-surface registry reconstruction is already complete as a read-only audit artifact and should stay compare-only
- Finish line:
  - quantify raw_size, ndjson_size, minified_size, embedding_size, checkpoint_size, duplicate_outputs, and gitignored surfaces
  - confirm there is no single 6 GB file in the current workspace audit
  - tier the real large-artifact set: the 4.86 GB Gemma checkpoint, the 768 MB mapreduce NDJSON, and the remaining model / checkpoint / `.tmp` surfaces
  - classify each artifact as keep_canonical, convert_to_ndjson, compress_zstd, move_to_cold, delete_if_regenerable, or index_metadata_only
  - keep Gemma4 and OpenCode away from raw large artifacts by default
  - keep TurboVec / KAG / DAG / ACE / Bitfrost / Redis / Qdrant on the hot-indexed lane, not on raw artifact parsing
  - keep the hidden surface registry reconstruction as a compare-only audit artifact and compare it against any future live registry return instead of replacing it blindly
- Useful evidence:
  - `docs/reports/lod-nes-memory-ldjson-paths-report.md`
  - `docs/reports/runtime-coverage-audit.md`
  - `docs/reports/gpu-json-processing-runtime-decision-2026-06-11.md`
  - `docs/reports/hidden-surface-registry-reconstruction.md`
  - `docs/reports/hidden-surface-registry-reconstruction.json`
  - `docs/reports/artifact-bloat-report.md`
  - `docs/reports/artifact-bloat-report.json`
  - `.tmp/feature_labels.jsonl`
  - `.tmp/kanban_tasks.jsonl`
  - `.tmp/missing_feature_todos.jsonl`
### 4. Engram / Gemma4 memory wiring
- Status: partial
- Missing: dedicated Engram adapter startup hook
- Finish line:
  - decide whether Engram stays hint-only or gets a first-class adapter
  - keep `repo_report_answer` as the repo-audit path
  - keep `gemma4_chat` deprecated
- Useful evidence:
  - `docs/architecture/engram-plugin-memory-support.md`
  - `sveltekit-frontend/src/lib/server/ai/engram-memory.ts`
  - `sveltekit-frontend/src/lib/server/memory/local-engram-memory-adapter.ts`
### 5. Parent Atlas overlay sync
- Status: partial
- Missing: canonical-to-app overlay crosswalk promotion for the 6 root-contract-only features
- Finish line:
  - keep the 18-row root registry as the canonical feature contract
  - keep `sveltekit-frontend/docs/atlas/feature-registry.json` as the generated codebase inventory
  - use the crosswalk instead of overwriting either registry
  - keep the doc-indexer reading the app-side reports first
  - use `npm run atlas:parent-atlas:overlay-sync` to track the mirror state
  - use `npm run atlas:parent-atlas:overlay-crosswalk` to track canonical-to-app mapping
  - review `docs/reports/parent-atlas-overlay-sync-report.md`
  - review `docs/reports/parent-atlas-overlay-crosswalk-report.md`
- Useful evidence:
  - `docs/atlas/parent-atlas.json`
  - `docs/atlas/feature-registry.json`
  - `sveltekit-frontend/docs/atlas/feature-registry.json`
  - `scripts/atlas/parent-atlas-doc-indexing.mjs`
  - `docs/reports/parent-atlas-overlay-sync-report.md`
  - `docs/reports/parent-atlas-overlay-crosswalk-report.md`
### 6. Atlas / NESCHR97 directory mapping and cold storage
- Status: partial
- Completion: ~60%
- LD-JSON batching subgate: 96.3%
- Missing: stable directory-level mapping from hidden atlas/NESCHR97 paths to sourceRef, feature_id, and featureLabel
- Finish line:
  - map directory roots, not just individual files, into replayable packet surfaces
  - keep `neschrom97/cards/*.json` materialized as deterministic LD-JSON and finish the smaller remaining JSON object/text surfaces before any GpJSON/GPU JSONPath experiment
  - derive sourceRef -> feature_id -> featureLabel from the existing repo functions and hidden `.tmp`/card directories
  - keep the extracted summaries and summaries-index path-maps ready for SeaweedFS cold storage
  - preserve Postgres 18 / pgvector / Qdrant / Redis centroid mirrors as the hot indexed layers
  - keep Rust N-API / libtorch parsing as the extraction boundary if that becomes the implementation path
  - keep GpJSON / GrCUDA deferred until CPU/Rust/DuckDB parsing is the measured bottleneck
  - treat the 15.0 GB artifact footprint as a storage-tiering problem, not a minify-only problem
  - use the focused open-lanes bundle and lane-scoped normalization preview when triaging unmatched refs; the current bundle is 9,514 files / 220.3 MB and the preview only scans 2 open-lane refs
- Useful evidence:
  - `.tmp/feature_labels.jsonl`
  - `.tmp/kanban_tasks.jsonl`
  - `.tmp/missing_feature_todos.jsonl`
  - `.tmp/parent-atlas-workstation-todo.json`
  - `docs/reports/feature-lineage-report.json`
  - `docs/reports/feature-labelling-parent-atlas-report.json`
  - `docs/reports/gpu-json-processing-runtime-decision-2026-06-11.md`
  - `docs/reports/lod-nes-memory-ldjson-paths-report.md`
  - `docker/seaweedfs/s3.json`
  - `sveltekit-frontend/src/lib/server/gpu/libtorch-bridge.ts`
### 7. Feature-gap registry completion
- Status: implemented
- Missing: none
- Finish line:
  - keep the live registry regenerated from the synced overlay
  - keep the bootstrap rows reconciled against the current atlas sources
- Useful evidence:
  - `docs/reports/feature-gap-registry-live-latest.json`
  - `docs/reports/feature-gap-registry-live-latest.md`
  - `scripts/atlas/audit-feature-gap-registry.mjs`
### 7. Graph / KAG / DAG refresh manifest
- Status: partial
- Completion: ~85%
- Missing: invalidation and promotion gate validation
- Finish line:
  - wire refresh-manifest invalidation to atlas truth promotion
  - keep graph refreshes from drifting away from the promoted truth
- Read-only evidence:
  - `docs/reports/phase16-refresh-promotion-report.md`
  - `docs/reports/phase16-runtime-artifact-locator.md`
- Useful evidence:
  - `C:/Users/james/Videos/deeds-web-app/memory/exports/graph-refresh-manifest.json`
  - `C:/Users/james/Videos/deeds-web-app/scripts/atlas/generate-graph-exports.mjs`
  - `C:/Users/james/Videos/deeds-web-app/scripts/atlas/write-graph-refresh-manifest.mjs`
  - `C:/Users/james/Videos/deeds-web-app/scripts/atlas/sourceRef-first-parent-atlas-refresh.mjs`
### 6. PyTorch / LibTorch feature extraction lane
- Status: partial
- Missing: a named workstation completion artifact
- Finish line:
  - bind the existing GPU outputs to the parent atlas registry
  - keep the canonical `768 -> 256 -> 64` lane intact
- Useful evidence:
  - `sveltekit-frontend/src/lib/server/gpu/pytorch-graph.ts`
  - `sveltekit-frontend/src/lib/server/gpu/libtorch-bridge.ts`
  - `scripts/quick-pytorch-check.ps1`
  - `scripts/run-pytorch-check.ps1`
### 7. XGBoost / gradient tree boosting reranker
- Status: partial
- Missing: formal reranker contract
- Finish line:
  - decide whether XGBoost stays a side-channel hotness scorer or becomes a formal reranker input
  - keep phase 18 bounded until the contract is explicit
- Useful evidence:
  - `scripts/xgboost-hotness-train.py`
  - `scripts/atlas/xgboost-hotness-score.mjs`
  - `sveltekit-frontend/src/lib/server/ace/context-assembler.ts`
  - `sveltekit-frontend/memory/exports/xgboost-hotness/features.json`
### 8. Phase 3F trace population
- Status: complete
- Completion: 100%
- Missing: none
- Finish line:
  - keep `agent_traces_total` above 1000
  - keep `selected_concepts`, `selected_packets`, `retrieval_strategy`, `repair_actions`, `reward`, and `outcome` on fresh traces
  - export QLoRA candidates only after trace coverage is stable
  - keep meaningful Neo4j trace edges separate from retrieval scores
- Useful evidence:
  - `docs/reports/agent-trace-data-maturity-report.md`
  - `C:/Users/james/Videos/deeds-web-app/docs/open-lanes/phase-3f-agent-trace-distillation.md`
  - `C:/Users/james/Videos/deeds-web-app/docs/reports/qlora_distillation_report.json`
  - `C:/Users/james/Videos/deeds-web-app/scripts/atlas/populate-traces-3f.mjs`
  - `C:/Users/james/Videos/deeds-web-app/scripts/atlas/verify-traces-3f.mjs`
## Subgraph Checklists
### 1. Concept evidence spine repair
- [ ] keep `packet_keys` authoritative for live joins
- [ ] regenerate `evidence_cards` from `packet_keys` where compatibility copies are still needed
- [ ] do not re-ingest or rebuild the concept-memory layer
### 2. Recommendation merge audit
- [ ] explain why the current snapshot only emits 5 recommendations
- [ ] verify merge key normalization
- [ ] verify sourceRef normalization
- [ ] verify dedupe behavior is not too aggressive
### 2B. Agentic startup briefing
- [x] read current production-readiness and runtime coverage reports
- [x] write a startup briefing artifact from live report evidence
- [ ] wire the assistant bootstrap to read the briefing before planning
- [ ] surface the next bounded lane from the briefing instead of chat memory
### 3. Artifact bloat audit
- [x] inventory raw_size, ndjson_size, minified_size, embedding_size, checkpoint_size, duplicate_outputs, and gitignored surfaces
- [x] confirm there is no single 6 GB file in the current workspace audit
- [x] inventory hidden GPU / HMM / trace / MCP / TurboVec surfaces from `rg --files -uu`
- [ ] classify each surface as keep_canonical, convert_to_ndjson, compress_zstd, move_to_cold, delete_if_regenerable, or index_metadata_only
- [ ] tier the Gemma checkpoint and other model checkpoints to cold storage
- [ ] compress the large mapreduce NDJSON surfaces with a replay-safe archive path
- [ ] keep Gemma4 away from raw large artifacts by default
- [ ] keep TurboVec / KAG / DAG / ACE / Bitfrost / Redis / Qdrant on the hot-indexed lane, not on raw artifact parsing
### 4. Engram / Gemma4 memory wiring
- [ ] keep `repo_report_answer` as the repo-audit path
- [ ] keep `gemma4_chat` deprecated
- [ ] decide whether Engram stays optional or gets a startup hook
### 5. Parent Atlas overlay sync
- [ ] keep the root registry canonical
- [ ] keep the frontend registry generated from the root contract
- [ ] keep the doc-indexer reading app-side reports first
### 6. Atlas / NESCHR97 directory mapping and cold storage
- [ ] map directory roots, not just individual files
- [x] batch `neschrom97/cards/*.json` into `neschrom97/packets/cards.ndjson`
- [x] batch `.tmp/parent_atlas_packets/*.json` into `.tmp/parent_atlas_packets/parent-atlas-packets.ndjson`
- [ ] finish remaining JSON object/text surfaces; current LD-JSON subgate is 96.3%
- [ ] keep sourceRef -> feature_id -> featureLabel derivation replayable
- [ ] preserve cold-storage restore proofs before any move/delete
- [x] use the open-lanes bundle / lane-scoped normalization preview for narrower unmatched-ref triage
- [x] record GpJSON as deferred; keep Rust N-API/DuckDB/Postgres as the current parsing path
### 7. Feature-gap registry completion
- [ ] regenerate the live registry from the synced overlay
- [ ] reconcile remaining row-level gaps
- [ ] keep live and postgres snapshots aligned
### 7. Graph / KAG / DAG refresh manifest
- [x] publish the read-only phase16 refresh promotion audit report
- [x] publish the read-only phase16 runtime artifact locator report
- [x] locate app-side graph refresh manifest and refresh writer
- [ ] wire refresh-manifest invalidation to atlas truth promotion
- [ ] prevent graph refresh drift
- [ ] keep manifest promotion deterministic
### 8. Neo4j USED_CONCEPT edge projection
- [x] publish the read-only sourceRef context projection report
- [x] publish the runtime coverage audit for USED_CONCEPT
- [x] publish the bounded USED_CONCEPT edge projection readiness report
- [x] publish the bounded USED_CONCEPT edge projection plan
- [ ] create a bounded Neo4j projection writer for USED_CONCEPT edges
- [ ] keep the planner graph separate from retrieval scoring
- [ ] project only rows with stable sourceRef -> feature_id -> featureLabel evidence
### 9. PyTorch / LibTorch feature extraction lane
- [ ] bind GPU outputs to the parent atlas registry
- [ ] keep the canonical `768 -> 256 -> 64` lane intact
- [ ] add the named workstation completion artifact
### 10. XGBoost / gradient tree boosting reranker
- [ ] decide whether XGBoost stays a side-channel scorer
- [ ] decide whether XGBoost becomes a formal reranker input
- [ ] keep training/export gating explicit
### 11. Phase 3F trace population
- [x] populate 1000+ traces
- [x] ensure fresh traces write selected concepts
- [x] ensure fresh traces write selected packets
- [x] keep retrieval strategy on every trace
- [x] keep reward on every eligible trace
- [x] keep repair actions on every trace
- [x] keep outcome on every eligible trace
- [x] export QLoRA candidates only after trace coverage is stable
- [x] sync meaningful Neo4j trace edges only after trace coverage is stable
- [x] enrich Qdrant payloads with concept IDs, community ID, temperature, strategy, and trace count only after trace coverage is stable
## Finish Order
1. Concept evidence spine repair
2. Recommendation merge audit
3. Neo4j USED_CONCEPT edge projection
4. atlas_feature_map / parent_atlas_documents join repair
5. Artifact bloat audit
6. Engram adapter decision
7. Parent Atlas overlay crosswalk
8. Atlas / NESCHR97 directory mapping and cold storage
9. Graph refresh runtime artifact location, invalidation, and promotion wiring
10. PyTorch workstation artifact
11. XGBoost reranker contract
## Exit Criteria
- Parent Atlas reports stay app-root aware.
- OpenCode startup keeps using ACE hits, recommendations, and Bitfrost evidence first.
- No lane depends on a hidden legacy Gemma4 forwarding path.
- The open lanes have explicit owners, commands, and evidence files.
## Board Review Notes — Applied Corrections
- The older board still lists some lanes as open that are now completed in the latest workspace state, especially Packet Contract, canonical Neo4j `USED_CONCEPT`, and HyperRAG smoke.
- Treat global packet coverage numbers carefully. Retrieval gates should use addressable/retrieval packet denominators, not cache/generated/synthetic artifacts.
- Keep raw large artifacts out of hot retrieval. Use SeaweedFS/cold manifests and index metadata only.
- Keep `codebase_chunks_768` separate from `legal_documents`.
- Keep Gemma4/OpenAI-compatible facade focused on narrowed tool manifests and retrieved packet evidence, not a flat 300+ tool list.