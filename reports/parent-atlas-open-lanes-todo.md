# Parent Atlas Open Lanes TODO

Generated from the current workstation evidence. This is the production-readiness board for the remaining open lanes, not a runtime plan.

## Canonical Closure Update - 2026-06-19

Status: **ARCHITECTURE FROZEN / PROOF GATES PASS**

This block supersedes older percentages and unchecked items retained below as
historical evidence.

- Production readiness: **PASS 66 / WARN 0 / FAIL 0**
- Parent Atlas package ship gate: **5/5 PASS**
- OpenCode task registry: **22 tasks / 0 open / 0 archived**
- Deterministic retrieval proof: **50/50 PASS**
  - 50 cold misses
  - 50 warm hits
  - 50 second-warm hits
  - 50/50 packet identity matches
  - 50/50 fusion-score matches
- Runtime degradation proof: **3/3 PASS**
  - Valkey unavailable -> packet retrieval preserved -> service restored healthy
  - Neo4j unavailable -> packet retrieval preserved -> service restored healthy
  - Qdrant unavailable -> FTS fallback preserved -> service restored healthy
- Cache namespace proof: **5/5 required namespaces ready**, zero sampled collisions
- Cold-storage restore proof: **1/1 manifest PASS**, restored bytes and SHA-256 match
- Live services after restoration: **READY 6 / mismatch 0 / stopped 0 / auth required 0**
- Phase 16 truth-promotion invalidation binding: **CLOSED**
- Phase 16-H packet identity and higher-hop structural ledger: **CLOSED**
- Go Retrieval HTTP/gRPC, authenticated Valkey, Qdrant, Neo4j, and Postgres:
  **READY**

Canonical proof reports:

- `docs/reports/parent-atlas-proof-of-truth.md`
- `docs/reports/runtime-degradation-proof.md`
- `docs/reports/cache-namespace-proof.md`
- `docs/reports/cold-storage-restore-proof.md`
- `memory/exports/parent-atlas-final-completion.md`

No production implementation lane remains open on the current task board.
AE/SOM experimentation, PPO/adapters, TensorRT expansion, custom CUDA kernels,
and broader model research remain deferred behind measurable evaluation gains.

## Post-Frozen Phase 17-21 Audit - 2026-06-20

Evidence: `docs/reports/phase17-21-workstation-audit.md`

Post-frozen research/evaluation scope: **67% complete**. This does not reduce
the 100% completion of the frozen production scope.

| Phase | Status | Current truth | Next gate |
|---:|---|---|---|
| 17 | SCAFFOLD_ONLY | PyTorch/LibTorch/CUDA surfaces exist, but the compatibility output has 1 row | extract measured features from the validated retrieval/eval corpus |
| 18 | SCAFFOLD_ONLY | XGBoost/policy scripts exist, but the compatibility output has 1 row | prove NDCG/MRR improvement against the frozen baseline |
| 19 | OPERATIONAL | append-only retrieval loop has 439 rows | keep future rows tied to replay and outcome truth |
| 20 | OPERATIONAL | 3,251/3,251 Zod-valid packets; Rust SIMD/TurboVec parser, MapReduce NDJSON, DuckDB, Postgres/Qdrant/Valkey mirrors present | keep the 805 MB MapReduce artifact streaming and package-tested |
| 21 | EVAL_GATED | replay, namespace, degradation, and package gates pass | adversarial/tensor-analysis datasets may proceed without changing identity |

Gemma4 summary completion:

- 5,395/5,395 non-feature Parent Atlas documents have summary text.
- 5,395/5,395 have summary hash/model/backend/version/timestamp provenance.
- 0 summaries contain llama channel/thought markers.
- Production batch command: `npm run atlas:summaries:gemma4:500:apply`.
- Chat backend: llama-server `gemma4-legal-iq4xs-direct.gguf`.
- Ollama remains EmbeddingGemma-only.

Accelerator boundary:

- Native CUDA bridge is loadable and exposes PageRank, cosine, FP16 scoring,
  top-K, KMeans, SOM, AE encode/decode, PCA, CUDA graph replay, SIMD JSON, and
  cuVS-compatible compression.
- Qdrant contains 52,606 points with required identity/topology payload tags.
- The optional TurboVec HTTP sidecar is offline; the N-API fallback is packaged.
- ElectricSQL is not installed and is not a token-remapping engine.
- cuVS/CAGRA, RAPIDS, GEMM, AE, and SOM may accelerate vector/tensor analysis;
  they do not generate summaries or define packet identity.

## Next Actions - Atlas / NES CHR97 Production Readiness

### Status

Production-ready at the directory level.

The directory-lineage foundation is healthy, the core topology chain is now working, and the remaining work now moves into higher-order graph, recommendation, and storage-tiering lanes.

Workspace roots:

- `workspaceRoot`: `C:\Users\james\Videos\deeds-web-app`
- `projectRoot`: `C:\Users\james\Videos\deeds-web-app\sveltekit-frontend`
- template: `C:\Users\james\Videos\deeds-web-app\configs\templates\gemma4-opencode.jinja` (exists)
- staging surfaces: `scripts/atlas` and gitignored `.tmp` NDJSON/JSONL datasets
- production destination: `packages/parent-atlas`

Current live spine:

- `packet_keys` joins to live `atlas_packets.packet_key` at high coverage.
- `feature_ids` also join cleanly enough to stay authoritative for the current concept-memory lane.
- `evidence_cards` is now a compatibility/backfill field, not the primary live spine.
- `packet_key` is immutable identity; `feature_id` may be enriched; `metadata` may grow.
- compare-only future surfaces: `atlas_tree_nodes`, `atlas_topology_index`, `atlas_svg_glyphs`.
- higher-hop schema repair is now applied to `atlas_feature_packets`: `file_path` is backfilled on 277 rows, `som_cluster` is backfilled on 7 rows, and `tree_node_id` is present as a nullable forward link with no safe live join path yet.
- `packages/parent-atlas` now exists as a real scaffold with `src/index.ts`, `src/cli.ts`, gates, adapters, and pipeline ports; consolidation is now a wiring/refinement task.
- The next blocker before the next backfill is live schema reconciliation: tree nodes, summary layers, and topology indexes still lag the package gate contract.
- Phase 16-H identity spine is closed.
- Higher-hop ledger validation is structurally PASS and enrichment WARN.
- Redis/Bifrost mirrors are optional runtime cache, not a backfill blocker.
- Neo4j / GDS topology pass is complete. ✅ (GDS/SOM enrichment applied to 3,251 packets)
- ACE context-pack smoke is green after Valkey auth handling was fixed; cache hit is verified in the smoke path, not the canonical identity lane.
- ACE planner cache-hit validation is now green via `npm run ace:context-planner:smoke`; the proof run writes and rereads the same stable planner state, with `beforeHit: false` and `afterHit: true`, and the second read comes back from Redis. Proof artifact: `docs/reports/ace_cache_hit_2026-06-18T00-47-18-309Z.json`.
- OpenCode's `yorha` provider now reaches the real ACE facade through `/api/v1/chat/completions`; the endpoint no longer bypasses `assembleACEContext`.
- The live EmbeddingGemma route is `http://127.0.0.1:11434`, Qdrant retrieval produces ranked source refs, and a repeated packet-router query hits `bitfrost:retrieval:*` from Redis in 1 ms.
- Bifrost L3 now treats an empty gateway completion as a failure and falls back to the launcher-backed `llama-server.exe` model on `:8090`.
- OpenCode semantic retrieval/cache correctness is green: the OpenAI-compatible endpoint returned a Tier 1 scenario-cache hit with `selected_lane=redis`, `cache_hit=prior-answer`, and 7 ms internal latency.
- The remaining runtime issues are cold synthesis latency for large ACE contexts and the durable `scenario_cache` Postgres mirror schema drift (`pipeline_key` is absent); Redis hot-cache writes remain available and fail open while that mirror is reconciled.
- SOM 20x20 coordinates backfilled. ✅
- The previous replay and package-consolidation lanes are closed by the
  2026-06-19 proof block above.
- The served `/.well-known/llms.txt` and `/.well-known/llms-full.txt` contract now share a single Parent Atlas agent contract helper, and the packet RPC now emits ACE-ready packet metadata (`packet_type`, `canonical_source_ref`, `recommended_action`, `verification_command`) in addition to the identity spine.
- HyperRAG fusion telemetry is fully operational and passes the smoke test suite. ✅


## Consolidated Action Plan And Roadmap

The canonical staged order is:

### Stage 1 - Storage & Registry Alignment

Approx completion: ~80%

- hidden surface registry reconstruction: complete, compare-only
- artifact bloat audit complete: 7,781 files / 15,052.68 MB / 463 duplicates, no single 6 GB file present; TurboVec tiering open
- packet contract mirror audit complete: read-only validator covers all 6 packet tables; repairs are additive sidecar alignments, not new packet models
- identity contract freeze: packet_key stays immutable; do not add new packet fields until the derived compare-only tables exist
- higher-hop repair: `atlas_feature_packets.file_path` + `som_cluster` now have additive coverage; `tree_node_id` remains a pending forward-link field until a safe join is proven
- recommendation merge deduplication audit: complete — collapse by design (detectStaleFeatures caps at 5; no normalization bug)
- overlay sync: complete — 18/18 root rows matched, 4,209 app rows aligned
- domain ontology: complete — 97.3% of addressable packets classified; 100% gate pass (addressable denominator)

### Stage 2 - Core Graph & Native Execution

Approx completion: ~75%

- native GEMM binding classification: partial, public export missing (deferred until Stages 1–3 complete per ATLAS-3.0 roadmap)
- Neo4j USED_CONCEPT projection: **complete** — 32,012 edges written; planner graph separated from retrieval
- Phase 16 cache invalidation binding: runtime graph-refresh artifacts are present and the invalidation binding is verified through atlas truth promotion

### Stage 3 - Advanced Retrieval R&D

Approx completion: ~65%

- HyperRAG Packet RPC / Qdrant tagging: packet contract helper is wired, ACE-ready packet metadata now emits `packet_type`, `canonical_source_ref`, `recommended_action`, and `verification_command`; remaining gap is telemetry depth / E2E benchmark gating rather than core fusion wiring
- 5-stage ANN cascade operational: BM25 + Qdrant ANN + TurboVec + Neo4j expansion + RRF fusion
- XGBoost reranker (Stage 4): all 7 training gates now pass; training unblocked
- higher-hop enrichment and supernode backfill: open
- packet reader / writer: implementation lane for replayable NDJSON/JSONL packet flow; the current full-corpus bounded apply now tags batching, full materialization, resume semantics, atomic publication, and Qdrant mirror as PROVEN while identity coverage remains partial; evidence: `docs/reports/packet-reader-writer-audit.json` and `docs/reports/qdrant-postgres-mirror-reconciliation.json`
- SOM 20x20 / auto-clustering: follows the packet reader/writer and graph pass before board consolidation
- Qdrant embedding tags + pgvector mirror: follow the SOM pass, then refresh the kanban task board
- packages/parent-atlas consolidation: pure contract smoke PASS; downstream WSL2/Postgres/Qdrant wire-up report READY_FOR_DOWNSTREAM_IMPORT; runtime adapters remain in their server/browser lanes

### Stage 4 - Agent Memory & Scoring Pipeline

Approx completion: ~65%

- startup intelligence: 7/7 gates passing (domain gate fixed to use addressable denominator)
- XGBoost formal reranker: training gates pass; ready to train
- agentic startup briefing: operational (board-state + kanban + risk + next-actions written each run)
- Engram: decided — hint-only, fail-open, 0.05 boost max

### Merged Packet Lanes

Approx completion: ~65%

- Packet Contract Lane: ✅ stable `packet_key`, `source_ref`, `feature_id`, `community_id`; Postgres JSONB GIN indexes in place
- Packet Enrichment Lane: ✅ Gemma4 summaries (100% BM25 gate), community provenance (99%), domain classification (100% addressable), concept_ids (99% addressable); autoencoder/SOM payloads pending AE weight training
- Contextual Tree Lane: ✅ 32,012 USED_CONCEPT edges; 29,744 Packet→Concept + 2,268 Trace→Concept
- Retrieval Ranking Lane: ✅ Qdrant cosine + BM25 + TurboVec + Neo4j expansion + RRF fusion; XGBoost Stage 4 training-ready; reward_prior backfill open
- Agent Policy Lane: scaffold complete (train-policy-reranker.py + serve-policy-reranker.py); training after XGBoost sidecar is proven
- Memory Lane: Redis/Bifrost cache operational; SOM cell routing in payload; reward memory via reward_prior column

Current live spine: every packet has `packet_key`, `source_ref`, `feature_id`, `community_id`, `community_confidence`, `domain_class` (addressable), `concept_ids` (addressable), `summary` (BM25).

The next work moves into:

1. Live schema reconciliation for tree nodes, summary layers, and topology indexes — PROVEN_WITH_WARNINGS; `node scripts/atlas/reconcile-parent-atlas-live-schema.mjs --json` PASS; evidence: `docs/reports/parent-atlas-live-schema-reconciliation.json`; live tables present, `summary_level` remains the alias lane for `summary_type`, and the audit now reflects the actual drift surface instead of a guessed schema.
2. Replayable packet reader / writer for NDJSON and JSONL datasets — PROVEN; `node scripts/atlas/replayable-packet-reader-writer.mjs --input .tmp/addressable-packets.ndjson --apply --json` PASS; evidence: `docs/reports/parent-atlas-replayable-packet-reader-writer.json` plus `.tmp/parent-atlas-replayable-packets.ndjson` and `.tmp/parent-atlas-replayable-packets.manifest.json`; the materializer now carries explicit proof states for batching, full materialization, resume semantics, atomic publication, Qdrant mirror, and identity coverage in `docs/reports/packet-reader-writer-audit.json`.
3. Neo4j / GDS topology pass on the aligned bridge spine — PROVEN_WITH_WARNINGS; `npm run atlas:phase16:gds:topology:dry` PASS; evidence: `docs/reports/addressable-packet-topology-report.json`; topology relationship resolved to `SIMILAR_TOPOLOGY`, with 59,692 projected nodes and 102,666 relationships.
4. RRF / Neo4j / HyperRAG wiring and packet ranking stabilization — PROVEN_WITH_WARNINGS; `npm run atlas:phase3:neo4j:rff:dry` PASS; evidence: `docs/reports/addressable-packet-topology-report.json`; env loading now resolves Neo4j correctly, dry-run sees `SIMILAR_TOPOLOGY`, and verification classifies auth/service issues instead of crashing.
5. SOM 20x20 / auto-clustering pass — ACTIVE_DEGRADED; `npm run atlas:validate:som:20x20 -- --gates-only` now shows Gate 4 PASS after `npm run atlas:phase16:som:adjacency:apply`; evidence: `docs/reports/som-tricubic-adjacency-report.json`; remaining blockers are 210/400 populated cells and latent_64 coverage at 2.14%, so occupancy / latent backfill still gates promotion.
6. Qdrant embedding tags + pgvector mirror refresh
7. Parent Atlas kanban task board refresh from validated evidence
8. packages/parent-atlas consolidation after the staging lanes are complete
9. XGBoost supervised reranker — train + smoke (`npm run atlas:xgboost:train` then `atlas:xgboost:serve`)
10. Proto/RPC tool registry packetization
11. Reward prior backfill (reward_prior column on packets without traces)
12. PyTorch policy sidecar scaffold (Stage 5, after XGBoost is proven)
13. Graph refresh invalidation binding
14. semantic index mirroring
15. cold-storage restore verification
16. evaluation harnesses and agent-learning gates
17. high-ROI parser / embedding lanes
18. agentic startup briefing for read-only planning bootstraps
19. merged packet-lane implementation on the stable packet identity spine

### End-to-End Missing Features Plan

The missing work is now a dependency chain, not a single lane:

1. Live schema reconciliation for tree nodes, summary layers, and topology indexes — PROVEN_WITH_WARNINGS; evidence: `docs/reports/parent-atlas-live-schema-reconciliation.json`.
2. Replayable packet reader / writer for NDJSON and JSONL datasets — PROVEN; evidence: `docs/reports/parent-atlas-replayable-packet-reader-writer.json`, `.tmp/parent-atlas-replayable-packets.ndjson`, `.tmp/parent-atlas-replayable-packets.manifest.json`.
3. Neo4j / GDS topology pass, then SOM 20x20 auto-clustering on the aligned spine.
4. Qdrant embedding tags, pgvector mirror refresh, and semantic index mirroring.
5. RRF stabilization, XGBoost supervised reranker smoke, and reward_prior backfill.
6. Proto/RPC tool registry packetization plus the agentic startup briefing surface.
7. Cold-storage manifest population and restore verification.
8. Evaluation harnesses, replay checks, and agent-learning gates.
9. Parent Atlas downstream import refresh and kanban board resync from validated evidence.
10. Merged packet-lane implementation on the stable packet identity spine.

### Active GPU / Parser Lanes

These are acceleration and hygiene lanes, not the current blocker.

- Graphify structural discovery: keep `atlas:startup` and `graphify:feature-labels` / `graphify:domain-topology` as the read-only startup signals for cache-hit quality. Graphify is the topology scanner; Parent Atlas remains the canonical join spine.
- Neo4j GDS / GPU acceleration: run the graph topology pass before any further `libtorch`, `TensorRT`, or SOM retraining so the ranking spine has a stable graph substrate.
- GPU bridge review: `libtorch`, `TensorRT` bridge node, and Rust `n-api` parser remain acceleration lanes behind the stable packet identity spine.
- TurboVec / LangExtract: treat as downstream enrichment and ranking aids, not as the source of truth for stale-document grouping.
- Stale document compaction: group by `feature_label`, `function_id`, `method`, and `variable` before assigning kanban tasks.
- Kanban task spec board: use the grouped cache-hit candidates to consolidate task cards instead of emitting one card per raw stale file.

### P0 Proof Of Truth

#### 1. Directory-level sourceRef map, including gitignored paths

Goal: map directories, not loose files.

Run from repo root:

```bash
rg --files --hidden --no-ignore \
  -g '!node_modules/**' \
  -g '!.git/**' \
  -g '!*.lock' \
  | node scripts/atlas/build-directory-source-map.mjs
```

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
```

Create report:

```bash
node scripts/atlas/audit-ignored-directories.mjs --apply=false
```

Output:

- `memory/reports/ignored-directory-audit.md`
- `memory/exports/ignored-directory-map.json`

#### 3. SourceRef -> feature_id -> feature_label lineage check

Hard gate:

```bash
node scripts/atlas/verify-feature-lineage.mjs
```

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

### P1 Runtime Reliability
## 5. Rust N-API parser lane

Purpose: faster symbol extraction than Node AST scripts.

Kanban task:

- [x] Create `crates/atlas-parser-napi`
- [x] Parse TS/Svelte/Rust/SQL/MD
- [x] Emit function symbols
- [x] Emit import/export graph
- [x] Emit directory summaries
- [x] Write napi binding
- [x] Compare output with existing Node parser
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
```

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
```

Hard rule:

- No delete/move unless `restore_verified=true`

### P2 Operator Experience

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
```

Redis centroid keys:

- `centroid:directory:{hash}`
- `centroid:feature:{feature_id}`
- `centroid:packet:{packet_id}`

Read-only community coverage audit:

- `atlas_packets.community_id` is currently 100% populated in the live Postgres table.
- No P2 community backfill is required at the packet layer.
- Keep SOM / community propagation checks as a watchpoint, not an active blocker, unless a later live audit regresses.

### P3 Research

#### 10. Autoencoder / SOM / CUDA Kernels

- Autoencoder weight training for dimensional reduction (768 -> 64-dim latents).
- SOM 20x20 cell clustering optimization.
- TensorRT engine bridges, custom CUDA kernel compilations (e.g. for rapid RRF attention or CAGRA approximate semantic graph lookups).
- DeepSeek-MLA style caching structures.

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

1. Feature coverage: close `feature_id` payload/fallback gaps to >95%.
2. Replay telemetry: 50+ golden/cache-hit/graph/low-density/Kanban queries, one row per query.
3. HyperRAG timing: record BM25, Qdrant, Valkey, Neo4j, fusion, rerank, total, cache-hit, and fusion score.
4. SOM join audit: classify Qdrant ID, packet key, source ref, payload ID, and metadata ID mismatches. No retraining.
5. Glyph coverage: map domain, ontology, and topology labels to UnoCSS glyphs.

Dense retrieval remains `embedding_384 -> Qdrant`. `latent_128` is semantic
compression; `latent_64` is a routing/topology/rerank feature; `som_cluster` is
a neighborhood pointer. Neither latent vectors nor SOM replace packet identity
or dense retrieval.

## Runtime Coverage Audit

Read-only coverage measurement now lives in `docs/reports/runtime-coverage-audit.md` and `docs/reports/runtime-coverage-audit.json`.

- atlas_feature_map ↔ parent_atlas_documents join: 0.00% in the current workspace audit (0/6765); the join is still fully open here
- route_runtime_packets cache-hit coverage: 96.2%
- SOM coverage: 0%
- selected_concepts coverage: 100%
- USED_CONCEPT / Neo4j projection coverage: 0%

### Current Closed / Open Split

Closed:
- Redis/Valkey auth in `collect-runtime-evidence`
- SOM column / coordinate mapping
- basic `feature_id` placement fallback
- feature_id coverage: Postgres packet ledgers 100%; sampled Qdrant payloads 100/100
- replay telemetry breadth: 307 rows / 228 distinct queries; all required scenarios represented
- HyperRAG timing: one detailed eval row per packet-RPC query; Qdrant/BM25/Valkey/Neo4j/rerank/total populated
- SOM join audit: 2,647/2,736 addressable entries matched (96.75%); 89 gRPC/NES identities classified
- glyph coverage: 3,251/3,251 higher-hop joins and 100% of observed labels mapped
- MapReduce regeneration
- parent-atlas package mapreduce execution
- retrieval E2E benchmark gate

The focused coverage/provenance cleanup is closed. Glyph presentation uses
`configs/atlas-glyph-label-registry.json` as the static Lucide/UnoCSS contract.

Next broader workstation lanes:

1. Cold-storage manifest population and restore verification.
2. `packages/parent-atlas` downstream wire-up and pure contract promotion.
3. Evaluation and agent-learning gates.

Temporal Kanban consolidation is complete. The append-only registry now holds
22 durable tasks with 7 open tasks, and 288 Markdown sources are classified
without moving or deleting historical evidence. See
`docs/reports/temporal-kanban-consolidation.md` and
`sveltekit-frontend/.opencode/tasks/task-state.md`.

Artifact tier classification is also complete at the manifest layer:
8,245 files / 15,237.74 MB are classified in
`docs/reports/artifact-tiering-application.md`. No file was moved, compressed,
or deleted; cold and delete actions remain gated by restore verification.

Go Retrieval runtime recovery is complete. The existing Docker service is
healthy on HTTP `:8100` and gRPC `:50053`, uses authenticated Valkey, the live
service audit is 6 READY / 0 WARN, and the Gemma4/TRACE tool smoke passes 7/7.

Cold-storage verification is structurally green but evidence-incomplete:
`atlas_cold_storage_manifest` exists with the expected schema, but contains
0 rows. The verifier now reports `WARN_EMPTY`; 0/0 is not treated as restore
proof.

The highest-leverage next lane is now telemetry and provenance enrichment over the already aligned spine. Identity repair is no longer the blocker; the remaining work is coverage expansion, replay breadth, and feature provenance. SOM coverage is still a follow-on lane, not a blocker to the retrieval path.

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
```

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

- [x] Add Qdrant payload tags: `source_ref`, `feature_id`, `feature_label`, `directory_path`, `packet_key`, `som_cluster`, `community_id`, `temperature`, `surface`.
- [x] Add `hyperrag_packet_rpc` route/server helper.
- [x] Verify build-time imports for the RRF chain behind the existing route file: `rrf-integration.ts`, `bm25-search.ts`, `concept-extraction-tool.ts`, `neo4j-graph-signal.ts`, and `embedding-client.ts`.
- [x] Fuse lanes: Qdrant dense, Postgres JSONB/FTS/trigram, Neo4j neighborhood expansion, Redis hot cache.
- [x] Project `sourceRef-context-neo4j` as a bounded read-only projection report before any live Neo4j write lane.
- [x] Summarize packet groups with Gemma4 after repo evidence is retrieved.
- [x] Write retrieval telemetry.
- [x] Return replay trace.
- [x] Add smoke test: `npm run smoke:hyperrag-packet-rpc`.

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
- Status: **complete**
- Missing: none
- Finish line:
  - ✅ live registry regenerated from synced overlay
  - ✅ bootstrap rows reconciled against current atlas sources
  - ✅ overlay sync: 18/18 root rows, 4,209 app rows aligned
- Useful evidence:
  - `docs/reports/feature-gap-registry-live-latest.json`
  - `docs/reports/feature-gap-registry-live-latest.md`
  - `scripts/atlas/audit-feature-gap-registry.mjs`

### 7. Graph / KAG / DAG refresh manifest
- Status: complete
- Completion: ~100%
- Missing: none
- Finish line:
  - refresh-manifest invalidation is now bound through atlas truth promotion
  - keep graph refreshes from drifting away from the promoted truth
- Read-only evidence:
  - `docs/reports/phase16-refresh-promotion-report.md`
  - `docs/reports/phase16-runtime-artifact-locator.md`
- Useful evidence:
  - `C:/Users/james/Videos/deeds-web-app/memory/exports/graph-refresh-manifest.json`
  - `C:/Users/james/Videos/deeds-web-app/scripts/atlas/generate-graph-exports.mjs`
  - `C:/Users/james/Videos/deeds-web-app/scripts/atlas/write-graph-refresh-manifest.mjs`
  - `C:/Users/james/Videos/deeds-web-app/scripts/atlas/sourceRef-first-parent-atlas-refresh.mjs`

### 9. PyTorch / LibTorch feature extraction lane
- Status: partial — existing GPU exports bound; AE weights untrained
- Architecture confirmed:
  - EmbeddingGemma 768 → AE 768→256→64 → SOM 20×20 → `som_row/col/index` in payload
  - SOM routing is topology addressing, NOT a retrieval feature; policy (Stage 5) reads it
- Existing GPU exports in N-API bridge: `batchCosineSimilarity, topKIndicesGPU, autoencoderEncode, autoencoderDecode, trainSOMAsync, kmeansWithCentroidsAsync, rewardScoreGpuFp16, captureGraph, replayGraph`
- Remaining:
  - [ ] train AE weights (Xavier-init is flat; needs real training data)
  - [ ] export TorchScript artifact (`ae_encoder.ts.pt`)
  - [ ] build TensorRT engine (`ae_encoder.plan`)
  - [ ] populate `latent_64` packet payloads
  - [ ] populate SOM topology payloads (`som_row`, `som_col`, `som_index`)
- Useful evidence:
  - `sveltekit-frontend/src/lib/server/gpu/pytorch-graph.ts`
  - `sveltekit-frontend/src/lib/server/gpu/libtorch-bridge.ts`
  - `scripts/quick-pytorch-check.ps1`
  - `scripts/run-pytorch-check.ps1`

### 10. XGBoost / gradient tree boosting reranker
- Status: **training-ready** (all 7 gates pass as of 2026-06-12)
- Decision: XGBoost is formal Stage 4 supervised reranker — tabular, fast, explainable; NOT RL, NOT policy
- FEATURE_COLS (16): `cosine_score, bm25_rank_norm, ann_turbovec_score, concept_overlap, same_feature, community_conf, reward_prior, domain_class_match, freshness_score, pagerank_score, som_cache_hit (binary), provenance_git_age, packet_hit_count, n_retrieved, n_concepts, trace_score`
- NOTE: `som_cell_id` (int 0–399) is explicitly excluded — tree splits on SOM topology indices are semantically meaningless; SOM routing belongs in PyTorch policy (Stage 5)
- Training gate (all pass):
  - ✅ BM25 summary ≥85%: 100%
  - ✅ concept_ids addressable ≥60%: 99%
  - ✅ community_conf ≥95%: 99%
  - ✅ USED_CONCEPT ≥10,000: 32,012 edges
  - ✅ feature rows ≥50,000: 101,708 rows
  - ✅ domain classification ≥95%: 100% addressable
- SERVE: `serve-xgboost-reranker.py` on :8765; `rerank_source` reflects actual model type (`xgboost`, `lightgbm`, `pytorch_policy`)
- Train command: `npm run atlas:xgboost:train` (NDCG@10 gate ≥0.70)
- Useful evidence:
  - `scripts/atlas/train-xgboost-reranker.py`
  - `scripts/atlas/serve-xgboost-reranker.py`
  - `scripts/atlas/export-xgboost-features.mjs`
  - `docs/reports/xgboost-features.csv` (101,708 rows × 16 features)
  - `sveltekit-frontend/src/routes/api/atlas/search/+server.ts`

### 11. Domain ontology classification
- Status: **complete** (2026-06-12)
- Coverage: 100% of 8,483 addressable packets; 97.3% classified (2.7% unknown)
- Architecture: `Packet → Feature → Domain → Community → Concept → File`
- Domain taxonomy (14 domains for this legal AI app):
  `auth_login_register, case_management, evidence_upload_storage, document_processing, legal_reports, citation_engine, rag_retrieval, qdrant_vector_index, neo4j_context_graph, redis_bitfrost_cache, gpu_turbovec_libtorch, admin_observability, mcp_agents, tests_smoke_harness`
- Storage: `atlas_packets.payload.domain_class` + `atlas_packets.payload.domain_confidence` + Qdrant payload + Redis `domain:packet:class` hash (TTL 24h)
- Scripts:
  - `scripts/atlas/classify-domain-ontology.mjs --apply`
  - `scripts/atlas/extract-domain-ontology-relations.mjs`
  - `scripts/atlas/validate-domain-ontology.mjs`
  - `scripts/atlas/generate-bitfrost-schema.mjs`
  - `scripts/atlas/build-temporal-bitfrost-index.mjs`
- Report: `docs/reports/domain-ontology-classification.json`

### 12. Proto / RPC tool registry
- Status: **open** (P0 — enables Gemma4 to receive narrowed tools[], not a flat 300+ list)
- Active proto files: `chat_assistant, chr97_agent, codeintel, codeintel_enrichment, embedding, evidence_metadata, gpu_bridge, library_search, retrieval, tool_calling, turbovec, vectors`
- Compatibility: `turbovec_cuda.proto`
- Archived: `ai-service, analytics-service, auth, case_scoring, chat, cuda, embed`
- Finish line:
  - [ ] `audit-proto-registry.mjs` — inventory active proto files, extract service + RPC method names
  - [ ] packetize gRPC services → `atlas_packets` with `feature_id=grpc_service`
  - [ ] packetize RPC methods → sub-packets with `source_ref=proto:ServiceName.MethodName`
  - [ ] embed tool manifests into Qdrant with `domain_class=mcp_agents`
  - [ ] wire Qdrant RPC retrieval → MCP runtime selection (Gemma4 gets top-K tools, not all 300+)
  - [ ] wire Neo4j RPC graph → tool dependency edges
- OWNER: `scripts/atlas/audit-proto-registry.mjs` (to be created)

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
- [x] keep `packet_keys` authoritative for live joins
- [x] regenerate `evidence_cards` from `packet_keys` where compatibility copies are still needed
- [x] do not re-ingest or rebuild the concept-memory layer
- Evidence: 10/10 concepts, pk=100%, fid=100%; 3 gates PASS

### 2. Recommendation merge audit
- [x] explain why the current snapshot only emits 5 recommendations — collapse is by design (detectStaleFeatures caps at 5; no normalization bug)
- [x] verify merge key normalization — normalization correct
- [x] verify sourceRef normalization — normalizeRef() rejects audit warning strings
- [x] verify dedupe behavior is not too aggressive — dedupe correct

### 2B. Agentic startup briefing
- [x] read current production-readiness and runtime coverage reports
- [x] write a startup briefing artifact from live report evidence
- [ ] wire the assistant bootstrap to read the briefing before planning
- [ ] surface the next bounded lane from the briefing instead of chat memory

### 3. Artifact bloat audit
- [x] inventory raw_size, ndjson_size, minified_size, embedding_size, checkpoint_size, duplicate_outputs, and gitignored surfaces
- [x] confirm there is no single 6 GB file in the current workspace audit
- [x] inventory hidden GPU / HMM / trace / MCP / TurboVec surfaces from `rg --files -uu`
- [x] classify each surface as keep_canonical, convert_to_ndjson, compress_zstd, move_to_cold, delete_if_regenerable, or index_metadata_only
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
- [x] preserve cold-storage restore proofs before any move/delete
- [x] use the open-lanes bundle / lane-scoped normalization preview for narrower unmatched-ref triage
- [x] record GpJSON as deferred; keep Rust N-API/DuckDB/Postgres as the current parsing path

### 7. Feature-gap registry completion
- [x] regenerate the live registry from the synced overlay
- [x] reconcile remaining row-level gaps
- [x] keep live and postgres snapshots aligned

### 7. Graph / KAG / DAG refresh manifest
- [x] publish the read-only phase16 refresh promotion audit report
- [x] publish the read-only phase16 runtime artifact locator report
- [x] locate app-side graph refresh manifest and refresh writer
- [x] wire refresh-manifest invalidation to atlas truth promotion
- [x] prevent graph refresh drift
- [x] keep manifest promotion deterministic 

### 8. HyperRAG Dense Search / Cache Hit Lane
- Status: active
- Completion: ~84%
- Finish line:
  - keep Qdrant as dense recall only, with payload tags for `source_ref`, `feature_id`, `feature_label`, `directory_path`, `packet_key`, `som_cluster`, and `community_id`
  - keep Redis / Bitfrost as hot packet cache and centroid shortcut layer
  - fuse BM25 + FTS/trigram + Qdrant ANN + Neo4j expansion through the bounded retrieval orchestrator
  - summarize with Gemma4 only after repo evidence is retrieved and bounded packets are assembled
  - replay trace export, parent-atlas health logging, and retrieval telemetry rows are live read-only report lanes
  - archive stale originals only after the new packet path is replayable
- Useful evidence:
  - `docs/atlas/parent-atlas-table-of-contents.md`
  - `docs/architecture/compressed-semantic-geometry.md`
  - `docs/architecture/cold-warm-hot-packet-lifecycle.md`
  - `scripts/atlas/atlas-startup-intelligence.mjs`
  - `scripts/atlas/validate-pg18-redis-bifrost-stack.mjs`
  - `scripts/atlas/verify-qdrant-packet-payload.mjs`
  - `scripts/atlas/write-used-concepts-live.mjs`

### 8. Neo4j USED_CONCEPT edge projection
- [x] publish the read-only sourceRef context projection report
- [x] publish the runtime coverage audit for USED_CONCEPT
- [x] publish the bounded USED_CONCEPT edge projection readiness report
- [x] publish the bounded USED_CONCEPT edge projection plan
- [x] create a bounded Neo4j projection writer for USED_CONCEPT edges
- [x] keep the planner graph separate from retrieval scoring
- [x] project only rows with stable sourceRef -> feature_id -> featureLabel evidence
- Evidence: 32,012 USED_CONCEPT edges (29,744 Packet→Concept + 2,268 Trace→Concept); canonical allowlist; duplicate prevention active

### 9. PyTorch / LibTorch feature extraction lane
- [x] bind GPU outputs to the parent atlas registry (N-API exports confirmed)
- [x] keep the canonical `768 -> 256 -> 64` lane intact
- [ ] train AE weights for provenance and topology labels
- [ ] export TorchScript artifact (`ae_encoder.ts.pt`)
- [ ] populate `latent_64` + SOM topology payloads (`som_row`, `som_col`, `som_index`)

### 10. XGBoost / gradient tree boosting reranker
- [x] decided: XGBoost is formal Stage 4 supervised reranker (tabular, not RL, not policy)
- [x] som_cell_id excluded from FEATURE_COLS; som_cache_hit (binary) included
- [x] 4 new signals added: ann_turbovec_score, som_cache_hit, provenance_git_age, domain_class_match
- [x] training gate documented and all 7 gates passing (101,708 rows × 16 features)
- [x] sidecar serve contract: POST /score, GET /health, rerank_source reflects actual model type
- [ ] run: `npm run atlas:xgboost:train` (NDCG@10 ≥ 0.70 gate)
- [ ] run: `npm run atlas:xgboost:serve` + `npm run atlas:cascade:smoke`

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

1. XGBoost supervised reranker — train (`npm run atlas:xgboost:train`) + smoke (`atlas:xgboost:serve` + `atlas:cascade:smoke`)
2. Proto/RPC tool registry packetization — audit-proto-registry.mjs → packetize gRPC services + RPC methods → embed tool manifests → Qdrant rpc retrieval → Neo4j rpc graph → MCP runtime selection
3. Reward prior backfill — populate `reward_prior` on packets without traces; gates XGBoost label quality
4. PyTorch policy sidecar scaffold — Stage 5 agent action selector (after XGBoost sidecar is proven); SOM Embedding(400,64) for topology context
5. Graph / KAG / DAG refresh invalidation binding — complete: refresh-manifest invalidation now binds through atlas truth promotion
6. PyTorch workstation artifact — train AE weights; export TorchScript + TensorRT; populate latent_64 + SOM payloads
7. Atlas / NESCHR97 cold-storage restore proof — finish remaining 3.7% LD-JSON surfaces; tier Gemma checkpoint to cold storage
8. QLoRA/RL policy export — only after reward labels are stable and ≥500 success traces with NDCG≥0.80

Completed lanes (no further action needed):
- ✅ Domain ontology classification (100% addressable gate)
- ✅ Startup intelligence (7/7 gates)
- ✅ Neo4j USED_CONCEPT (32,012 edges)
- ✅ Overlay sync (18/18 root rows, 4,209 app rows)
- ✅ Packet contract (all 6 tables)
- ✅ Recommendation merge audit (collapse by design, not a bug)
- ✅ Concept evidence spine (10/10 concepts, pk=100%, fid=100%)
- ✅ Qdrant payload enrichment (Layer C complete)
- ✅ Engram decision (hint-only, fail-open, 0.05 boost max)
- ✅ Neo4j / GDS / SOM Topology pass (3,251 packets enriched, 99.2% GDS, 100% SOM coordinates, 100% contract check pass)
- ✅ HyperRAG fusion telemetry (smoke test pass, 191+ telemetry rows logged)

## Exit Criteria

- Startup intelligence reports 7/7 gates passing. ✅
- Domain classification coverage ≥95% (addressable). ✅
- XGBoost reranker smoke reports `rerank_source=xgboost` or explicit sidecar model type.
- OpenCode startup uses ACE, recommendations, Bitfrost, and tool-manifest candidates first.
- Gemma4 receives narrowed `tools[]`, not a flat 300+ tool list.
- No lane depends on hidden legacy Gemma4 forwarding.
- All mutations remain behind bounded scripts with `--apply`.
