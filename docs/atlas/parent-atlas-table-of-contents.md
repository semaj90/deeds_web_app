# Parent Atlas Table of Contents

This page is the navigation entry for the Parent Atlas workstream. It links the active design notes, storage decisions, execution lanes, and the current todo spine in one place.

## Core References

- [**Retrieval Layer Separation**](</C:/Users/james/Videos/deeds-web-app/docs/architecture/retrieval-layer-separation.md>) — Three-layer architecture: Orchestrator → Search Contract → Backend Implementation. Caller rule: never call Qdrant directly.
- [Compressed Semantic Geometry](</C:/Users/james/Videos/deeds-web-app/docs/architecture/compressed-semantic-geometry.md>) — Qdrant/TurboVec/Redis LOD as approximate search geometry with optional exact rescore.
- [Parent Atlas - Storage & Runtime Decision](</C:/Users/james/Videos/deeds-web-app/docs/atlas/parent-atlas-storage-decision.md>)
- [Parent Atlas Package Boundary Registry](</C:/Users/james/Videos/deeds-web-app/docs/atlas/package-boundary-registry.json>)
- [Spec Supersedes Check](</C:/Users/james/Videos/deeds-web-app/docs/reports/spec-supersedes-check.md>)
- [Parent Atlas - Data Spine](</C:/Users/james/Videos/deeds-web-app/docs/atlas/parent-atlas-data-spine.md>)
- [Parent Atlas - Packet Identity Operating System](</C:/Users/james/Videos/deeds-web-app/docs/PARENT-ATLAS-PACKET-IDENTITY-OS.md>)
- [Parent Atlas Karpathy Pipeline](</C:/Users/james/Videos/deeds-web-app/docs/architecture/parent-atlas-karpathy-pipeline.md>)
- [Cold / Warm / Hot Packet Lifecycle](</C:/Users/james/Videos/deeds-web-app/docs/architecture/cold-warm-hot-packet-lifecycle.md>)
- [Dual-Lane Hot Brain, Cold Queue](</C:/Users/james/Videos/deeds-web-app/docs/architecture/dual-lane-hot-brain-cold-queue.md>)
- [Kanban and Parent Atlas Alignment](</C:/Users/james/Videos/deeds-web-app/docs/architecture/kanban-parent-atlas-alignment.md>)
- [Local Deep Research Boundary](</C:/Users/james/Videos/deeds-web-app/docs/architecture/local-deep-research-boundary.md>)
- [Legal-AI Parent Atlas Product Integration](</C:/Users/james/Videos/deeds-web-app/docs/architecture/legal-ai-parent-atlas-product-integration.md>)
- [Neo4j GraphRAG Parent Atlas](</C:/Users/james/Videos/deeds-web-app/docs/architecture/neo4j-graphrag-parent-atlas.md>)
- [Unified ACE / Engram / NES Pipeline](</C:/Users/james/Videos/deeds-web-app/docs/architecture/unified-ace-engram-pipeline.md>)
- [OpenCode Routing Guardrails](</C:/Users/james/Videos/deeds-web-app/docs/reports/sessions/OPENCODE_ROUTING_GUARDRAILS_2026-06-05.md>)
- [Offline Synthesis Parent Atlas](</C:/Users/james/Videos/deeds-web-app/docs/architecture/offline-synthesis-parent-atlas.md>)
- [VRAM Hygiene Policy](</C:/Users/james/Videos/deeds-web-app/docs/architecture/vram-hygiene-policy.md>)

## Current Runtime Ownership

| Runtime | Current role | Decision |
|---|---|---|
| `miniforge-nlp-sidecar :8095` | CPU NLP/OaK and classifier fallbacks; scikit-learn is already declared in its image | Keep CPU-only; do not add PyTorch for the current classifier gate |
| `atlas-neural-decoder :8121` | PyTorch 2.13 / CUDA 13.2 decoder baseline | Keep unchanged |
| WSL `atlas-rapids-cu13` | Proven direct cuGraph/cuVS diagnostic and parity executor | Reuse; no second RAPIDS environment |
| `atlas-gpu-8098 :8098` | Containerized RAPIDS 26.08 HTTP graph executor | Keep `rapidsai/base:26.08-cuda12-py3.13-amd64` for now |
| Windows `C:\Python313` | Offline/reference model environment | Not a production owner |
| cuTile | Optional Ampere kernel challenger | Not installed; pilot only after a measured kernel gap |
| TensorRT-RTX | Optional decoder challenger | Separate compatibility gate; not part of RAPIDS |

RAPIDS CUDA-13 convergence is a future measured migration, not a current
repair. Any future change must compare graph, Jaccard, PageRank, KNN, startup,
VRAM, and latency receipts before changing the `:8098` owner.

## Evaluation and Prefill Phase Gates 17–24

Use the [workstation TODO](../parent-atlas-workstation-todo.md) as a projection and the [prefill/residency OpenSpec ledger](../../openspec/changes/parent-atlas-prefill-routing-residency-convergence/tasks.md) as the task-claim owner. The phase status below reflects those existing records; this TOC does not define new phase contracts.

| Phase | Existing scope / recorded status | Owner and next gate |
|---|---|---|
| 17 | Feature extraction is diagnostic; source-qualified feature-row admission remains open. | [Phase 17 implementation review](../architecture/phase17-feature-extractor-upgrade-v2.md); `PHASE17-FEATURE-ROW-ADMISSION-01` in the [workstation TODO](../parent-atlas-workstation-todo.md). |
| 18 | Partial XGBoost evaluation surface; held-out evaluation and promotion evidence remain open. | [XGBoost ranking lineage contract](../../sveltekit-frontend/src/lib/server/atlas/classification/xgboost-ranking-lineage-v1.ts); `PHASE18-RERANKER-EVALUATION-01` in the [workstation TODO](../parent-atlas-workstation-todo.md). |
| 19 | Existing rows are recorded, but their phase status is unresolved. | Reconcile the phase owner and row provenance in the [prefill/residency ledger](../../openspec/changes/parent-atlas-prefill-routing-residency-convergence/tasks.md) before scheduling work. |
| 20 | No phase definition or tracking is recorded. | Definition/owner decision required in the [prefill/residency ledger](../../openspec/changes/parent-atlas-prefill-routing-residency-convergence/tasks.md). |
| 21 | Included in a partial 17–21 audit; this review did not establish a distinct current gate. | Keep unclassified until its owner and acceptance evidence are identified in the [workstation TODO](../parent-atlas-workstation-todo.md). |
| 22 | No phase definition or tracking is recorded. | Definition/owner decision required in the [prefill/residency ledger](../../openspec/changes/parent-atlas-prefill-routing-residency-convergence/tasks.md). |
| 23 | Edge-model artifact is recorded as missing; do not claim runtime evaluation. | Artifact and phase gate are tracked in the [prefill/residency ledger](../../openspec/changes/parent-atlas-prefill-routing-residency-convergence/tasks.md). |
| 24 | Quantization method is undefined; Titans is research-only and DPO is evaluation-only in the current ledger. | Define the method and acceptance gate in the [prefill/residency ledger](../../openspec/changes/parent-atlas-prefill-routing-residency-convergence/tasks.md). |

### Shared evaluation-sequence gate

Before adding a PostgreSQL sequence table, reconcile existing `evaluation_runs`, `model_analysis_results.sequence_id`, `llm_synthesis_events`, and the separate prefill/decode receipts. The open `SEQ-EVAL-01`–`SEQ-EVAL-04` items in the [prefill/residency ledger](../../openspec/changes/parent-atlas-prefill-routing-residency-convergence/tasks.md) define the ordered run/step, tuple/artifact, metric, and later mmap/PyTorch parity review. Tensor payloads remain outside PostgreSQL; this TOC change does not authorize a migration, backfill, or runtime write.

### Diagnostic tuples, OAKlib, PostgreSQL, and RTX evaluation

This is a staged lane under the Phase 17–24 crosswalk—not a claim that the end-to-end workflow is wired:

1. **Create diagnostic tuples from logs** with the existing Node capture/replay owners ([Svelte-check ingestion](../../scripts/atlas/ingest-svelte-check-errors.mjs), [TypeScript evidence capture](../../scripts/atlas/capture-typescript-error-evidence-v1.mjs)). Preserve log digest, run ID, exact line, fingerprint, and source locator. A diagnostic tuple is not an ontology tuple or canonical source identity.
2. **Enrich, don’t mint identity, with OAKlib.** The [OAKlib adapter](../../python/parent_atlas_ontology/oaklib_external_adapter.py) emits noncanonical concept/relation candidates. Reuse the existing [ontology tuple contract](../../sveltekit-frontend/src/lib/server/atlas/contracts/ontology-linked-tuple-v1.ts), [PostgreSQL persistence owner](../../sveltekit-frontend/src/lib/server/atlas/ontology-linked-tuple-postgres.ts), and [manual table DDL](../../sveltekit-frontend/drizzle/manual/20260825_atlas_ontology_linked_tuples.sql); reconcile the separate `feature_ontology_tuples` family rather than merging table meanings. Candidate tuples require source/workspace revisions and evidence admission before promotion.
3. **Use existing PostgreSQL access paths.** B-tree supports exact IDs/fingerprints; FTS uses its existing text-search owner and GIN where registered. Verified 2026-10-13 (read-only catalog and `EXPLAIN ANALYZE`, PostgreSQL 18.4): `error_logs` has a btree on `packet_key` (partial, non-null) and `error_signal_stream` has a composite btree on `(packet_key, task_id, error_class)`. Neither has a full-text index. Plans run on 1 and 6 rows, so they show access paths only, not index value at volume. `atlas_packets` carries 10 exact-duplicate index groups (20 indexes). Dropping them needs approval and matching `schema.ts` edits, because Drizzle declares several of them (for example `idx_atlas_packets_source_ref_idx`, first declared 2026-07-29). Pending decisions are listed in the [log tasks file](../../openspec/changes/parent-atlas-runtime-log-remediation/tasks.md#decisions-pending-collected-2026-10-13). PostgreSQL 18 AIO and bitmap scans are planner behavior, not a table, LUT, or required execution plan. Do not add DDL from this TOC review.
4. **Keep vector search conditional.** pgvector HNSW is only eligible after the indexed column, model/representation, cohort, and filtered-search parity are proven. The [neural-prefill ledger](../../openspec/changes/parent-atlas-neural-prefill-encoder/tasks.md) records the current HNSW representation-policy block; the separate `halfvec` column must not be relabeled canonical `semantic_768`.
5. **Treat RTX interpolation as a challenger.** Run only against a frozen, revision-qualified tuple/feature cohort after a deterministic CPU reference and output checksums exist. PyTorch/ATen, cuVS/cuGraph, and any interpolation method are derived analysis executors; they cannot establish tuple identity, create a canonical lookup, or promote results. No GPU job is authorized here.

The detailed parameter-plan, locator, PostgreSQL schema/index, and DAG synthesis gates are `NE-23O1`–`NE-23O5` in the [neural-prefill ledger](../../openspec/changes/parent-atlas-neural-prefill-encoder/tasks.md). Keep diagnostic log tuples, ontology relation tuples, training tuples, and tensor artifacts as distinct typed records.

Step 1 also has a second owner: the [svelte-check capture and replay script](../../sveltekit-frontend/scripts/svelte-check-capture.mjs) (pretty and machine formats, checker-summary cross-check, fail-closed `INCOMPLETE` status without a capture receipt).

### Pipeline sequence and ordering keys

No new `sequence_id` is introduced by this section. The existing ordering key is `model_analysis_results.sequence_id` (text, btree `model_analysis_results_sequence_idx`). Each pipeline stage keeps its own ordering key, and the mapping below is the alignment contract.

| Stage | Ordering key | Owner | Persistence |
|---|---|---|---|
| Diagnostic capture | `runId` plus `logLine` | svelte-check capture script | `.tmp` replay files; not in PostgreSQL |
| Diagnostic observation | `fingerprint` plus `logLine` | same script | candidate `error_logs` reuse (not approved) |
| Ontology candidate | tuple identity under the ontology contract | OAKlib adapter and tuple contract | `atlas_ontology_linked_tuples` (manual DDL) |
| Model analysis run | `sequence_id` (text), PK `(run_id, sequence_id)`, btree | `model_analysis_results` | LIVE and empty (applied 2026-10-13 from `drizzle/manual/model_analysis_runs.sql`; registered in `sidecar-migrations.json`); no runtime writer yet |
| Agent action ledger | live sequence `atlas_agent_action_ledger_sequence_seq`; owning column not identified | `packages/parent-atlas` temporal action sequence reservation | live sequence exists; column owner not verified |
| Evaluation run | `SEQ-EVAL-01`–`04` gate | prefill/residency ledger | pending reconciliation |

Rules:
- Do not add a PostgreSQL sequence table until `model_analysis_results.sequence_id`, `evaluation_runs`, and `llm_synthesis_events` are reconciled (see the shared gate above).
- A `runId` or `fingerprint` is not a `sequence_id`. Ordering across stages uses the stage's own key plus its evidence checksum, never a shared counter.
- This table is a contract only. It authorizes no migration, backfill, or runtime write.

## Active Todo Spine

- [MASTER FEATURE TODO](</C:/Users/james/Videos/deeds-web-app/MASTER-FEATURE-TODO-2026-05-20.md>)
- [gRPC Binary Memory Registry Master Todo](</C:/Users/james/Videos/deeds-web-app/docs/architecture/grpc-binary-memory-registry-master-todo.md>)
- [Implementation Status](</C:/Users/james/Videos/deeds-web-app/IMPLEMENTATION_STATUS.md>)
- [Master todo kanban board](</C:/Users/james/Videos/deeds-web-app/docs/graph/kanban-board.json>)
- [Master todo consolidation report](</C:/Users/james/Videos/deeds-web-app/memory/exports/master-todo-consolidation-report.json>)
- [OKF bundle export](</C:/Users/james/Videos/deeds-web-app/sveltekit-frontend/.okf/README.md>) - generated derived index, not canonical source
- [TurboVec kanban consolidation report](</C:/Users/james/Videos/deeds-web-app/docs/reports/kanban-turbovec-consolidation-latest.md>)
- [Raw rg transcript organizer](</C:/Users/james/Videos/deeds-web-app/docs/reports/parent-atlas-rg-dump-organizer.md>)
- [Concept Fabric owner and contract audit](</C:/Users/james/Videos/deeds-web-app/docs/reports/parent-atlas-concept-fabric-audit-v1.json>) - read-only inventory of OKF, domain, AST/NLP, retrieval, ACE, DAG, cache, and synthesis owners
- [Raw rg transcript projection](</C:/Users/james/Videos/deeds-web-app/docs/reports/parent-atlas-rg-dump-projection.md>)
- [Offline synthesis mapreduce DuckDB](</C:/Users/james/Videos/deeds-web-app/docs/reports/offline-synthesis-mapreduce-duckdb-report.md>)
- [Compressed semantic geometry report](</C:/Users/james/Videos/deeds-web-app/docs/reports/compressed-semantic-geometry-report.md>)
- [Hidden packet pathmap report](</C:/Users/james/Videos/deeds-web-app/docs/reports/hidden-packet-pathmap-report.md>)
- [Ignored directory audit](</C:/Users/james/Videos/deeds-web-app/docs/reports/ignored-directory-audit.md>)
- [Hidden packet pathmap DuckDB report](</C:/Users/james/Videos/deeds-web-app/docs/reports/hidden-packet-pathmap-duckdb-report.md>)
- [Live service env report](</C:/Users/james/Videos/deeds-web-app/docs/reports/live-service-env-report.md>)
- [Doc-feature crosswalk](</C:/Users/james/Videos/deeds-web-app/docs/reports/doc-feature-crosswalk-2026-06-01.md>)
- [PyTorch / Qdrant / Redis / SOM index](</C:/Users/james/Videos/deeds-web-app/docs/reports/pytorch-qdrant-redis-som-index-2026-06-01.md>)
- [Production Qdrant without SOM report](</C:/Users/james/Videos/deeds-web-app/docs/reports/production-qdrant-no-som-report.md>)
- [Multi-hop traversal class matrix](</C:/Users/james/Videos/deeds-web-app/docs/reports/multihop-traversal-class-matrix.md>)
- [Repo dirty tree classification](</C:/Users/james/Videos/deeds-web-app/docs/reports/repo-dirty-tree-classification-2026-06-01.md>)
- [Repo archive move plan](</C:/Users/james/Videos/deeds-web-app/docs/reports/repo-archive-move-plan-2026-06-01.md>)
- [Original superseded score](</C:/Users/james/Videos/deeds-web-app/docs/reports/original-superseded-score-2026-06-02.md>)
- [Parent Atlas feature command atlas](</C:/Users/james/Videos/deeds-web-app/docs/reports/parent-atlas-feature-command-atlas.md>)
- [Parent Atlas feature command atlas projection](</C:/Users/james/Videos/deeds-web-app/docs/reports/parent-atlas-feature-command-atlas-projection.md>)
- [Parent Atlas feature command atlas Qdrant projection](</C:/Users/james/Videos/deeds-web-app/docs/reports/parent-atlas-feature-command-atlas-qdrant.md>)
- [Parent Atlas feature command atlas Postgres mirror](</C:/Users/james/Videos/deeds-web-app/docs/reports/parent-atlas-feature-command-atlas-postgres.md>)
- [Parent Atlas Cypher apply report](</C:/Users/james/Videos/deeds-web-app/docs/reports/parent-atlas-cypher-apply-report.md>)
- [MCP tool registry index](</C:/Users/james/Videos/deeds-web-app/docs/reports/mcp-tool-registry-index.md>)
- [MCP tool ontology](</C:/Users/james/Videos/deeds-web-app/docs/reports/mcp-tool-ontology.md>)
- [SourceRef context Neo4j projection](</C:/Users/james/Videos/deeds-web-app/docs/reports/sourceRef-context-neo4j-report.md>)
- [SourceRef parent join dry-run](</C:/Users/james/Videos/deeds-web-app/docs/reports/sourceRef-parent-join-dry-run.md>)
- [SourceRef parent join archive plan](</C:/Users/james/Videos/deeds-web-app/docs/reports/sourceRef-parent-join-archive-plan.md>)
- [SourceRef parent join move list](</C:/Users/james/Videos/deeds-web-app/docs/reports/sourceRef-parent-join-archive-move-list.md>)
- [All-lanes parent atlas report](</C:/Users/james/Videos/deeds-web-app/memory/exports/all-lanes-parent-atlas-report.json>)

## Identity Contract Freeze

The packet identity spine is frozen at the canonical contract:

- `packet_key` is immutable identity.
- Legacy packet-key hardening and open collision-proof gate: [Manual Migration Reconciliation tasks](</C:/Users/james/Videos/deeds-web-app/openspec/changes/manual-migration-reconciliation/tasks.md>) — the shared 12-hex builder and selected writer guards are implemented; full source-denominator and historical silent-drop proof remain open. The legacy helper is not the unresolved future PacketKeyV2 production owner.
- `source_ref` remains canonical source provenance.
- `feature_id` may be enriched, but not repurposed as an identity rewrite.
- `feature_label` remains the human-readable owner.
- `metadata` may grow.
- `file_path` and `file_url` are secondary location hints.
- `community_id` stays a derived grouping field.

The next derived surfaces are compare-only until the live contract exists:

- `atlas_tree_nodes`
- `atlas_topology_index`
- `atlas_svg_glyphs`

## Lane Index

### Canonical working order
1. BM25 + concept activation
2. deeds/engram optional adapter
3. Retrieval telemetry and lineage
4. XGBoost formal reranker
5. Neo4j GDS topology pass + contextual tree enrichment + HyperRAG packet RPC
6. Autoencoder / SOM latent topology
7. Native GEMM / pybind11 deferred

### Two-lane storage model
- Cold originals stay in the repo, SeaweedFS, or other archive stores
- Warm index packets stay small and point back to cold originals
- Hot cache holds only active task memory and recent retrieval state
- Queue holds work waiting to be processed, not source truth
- Postgres is the durable ledger and packet registry
- Qdrant is semantic lookup plus payload filters, not the canonical store
- See also: [Dual-Lane Hot Brain, Cold Queue](</C:/Users/james/Videos/deeds-web-app/docs/architecture/dual-lane-hot-brain-cold-queue.md>)

### Storage and retrieval
- Postgres 18 + pgvector
- Qdrant ANN and payload filters
- Neo4j graph traversal
- Redis / Bitfrost hot cache
- DuckDB offline analysis
- offline synthesis mapreduce DuckDB
- SeaweedFS artifact storage

### Agent and packet flow
- ACE packet generation
- task semantic packets
- OpenCode / Gemma4 pickup tuple
- sourceRef + feature_id replay spine
- Phase 101 parent-atlas packetizer (dry-run first)

### Atlas generation
- feature labeling
- kanban merge
- TurboVec kanban consolidation report
- raw rg transcript organizer
- raw rg transcript projection
- Parent Atlas feature command atlas
- Parent Atlas feature command atlas projection
- Parent Atlas feature command atlas Qdrant projection
- Parent Atlas feature command atlas Postgres mirror
- Parent Atlas Cypher apply
- SourceRef context Neo4j projection
- parent atlas indexing
- sourceRef parent join dry-run
- sourceRef parent join archive plan
- sourceRef parent join move list
- validation and consistency audits
- offline synthesis
- Graphify startup review and cache-hit validation
- GPU parser lanes: libtorch, TensorRT bridge node, Rust n-api parser
- Neo4j GDS / GPU acceleration: stabilize topology before any further `libtorch`, `TensorRT`, or SOM retraining expansion.
- TurboVec / LangExtract enrichment lanes
- stale document grouping by `feature_label`, `function_id`, `method`, and `variable`
- kanban task spec board consolidation from grouped stale-document hits

### Graphify / Structural Discovery
- Graphify is the structural discovery lane: file, import, call, and topology scanning for codebase shape.
- Parent Atlas is the canonical join lane: `source_ref`, `feature_id`, `feature_label`, `packet_key`, and provenance contracts.
- Graphify may classify and surface gaps, but it must not replace the canonical storage spine.
- HyperRAG packet-incidence status and gates: [Parent Atlas Pass Fabric tasks](</C:/Users/james/Videos/deeds-web-app/openspec/changes/parent-atlas-pass-fabric/tasks.md>) — distinguish taxonomy hyperedges from structural Graphify edges and packet incidence; current endpoint resolvers require exact source/span/workspace bindings.
- Next sequenced Workboard gate: [OpenSpec task-triage tasks](</C:/Users/james/Videos/deeds-web-app/openspec/changes/parent-atlas-openspec-task-triage-pipeline/tasks.md>) — reuse `buildSupersessionLinkV1()` / `buildTaskTriageCorpusV1()`. A fresh isolated corpus replay is recorded there; exact reviewed successor receipts remain absent. Do not infer supersession from text similarity or dates.
- Exact endpoint resolution: `sveltekit-frontend/src/lib/server/atlas/indexing/graphify-packet-incidence-endpoint-resolver-v1.ts` → `sveltekit-frontend/src/lib/server/atlas/lineage/packet-incidence-endpoint-resolver-v1.ts` → canonical packet identity resolver. This is a future-candidate resolver, not a matcher/backfill for existing taxonomy rows.
- Historical local structural artifact census: `docs/reports/current-structural-graph-artifact-v2/manifest.json` and the HyperRAG artifact-follow-up section in the linked tasks ledger. It contains 1,334 `DEFINES` edges with internal GPU-node endpoint matches, but zero packet-keyed nodes and a superseded workspace revision; diagnostic only, not an incidence source.
- Domain classification: `sveltekit-frontend/src/lib/server/atlas/domain-taxonomy.ts` supplies derived classification/routing features only; it cannot establish packet identity or incidence endpoints.
- Hyperedge persistence owner: `sveltekit-frontend/src/lib/server/atlas/kag-hyperedge-postgres.ts`; taxonomy bridge: `scripts/atlas/populate-hyperedges-from-taxonomy-edges-v1.mts`. Do not repurpose either as a packet-identity repair path.
- Integration order: structural-edge producer and current revisions → exact two-endpoint resolution → diagnostic mapping/readback → separately authorized incidence materialization → strict-reader wiring → bounded multihop proof. No Graphify refresh or datastore write is implied by these links.

### HyperRAG Dense Search
- Qdrant dense ANN + payload tags for semantic recall
- Redis / Bitfrost hot cache for recent packet hits and centroid shortcuts
- Neo4j multi-hop expansion for neighborhood traversal
- BM25 + FTS/trigram + RRF for bounded fusion
- Gemma4 summaries only after repo evidence is retrieved
- Replay trace export and parent-atlas health logging are live read-only report lanes.

### Remaining todo focus
- Graphify execution-ledger separation is the current P0 lifecycle lane:
  `GRAPHIFY-EXECUTION-LEDGER-SCHEMA-02` → coordinator → A/B/C canary. The canonical migration is
  an unapplied draft; `graphify_runs` remains historical compatibility state.
- reconcile the live tree / summary / topology schema before any fresh backfill or plugin promotion
- refresh-manifest invalidation is now bound to atlas truth promotion
- OpenCode `/api/v1/chat/completions` now delegates to the ACE facade; EmbeddingGemma, Qdrant packet retrieval, Valkey/Bitfrost reuse, and llama-server fallback are wired end to end
- reduce cold ACE synthesis latency while preserving the verified Redis repeat-hit path
- stage packet reader / writer work in `scripts/atlas` and `.tmp`, then consolidate into `packages/parent-atlas`
- keep HyperRAG telemetry, replay traces, and health logging read-only and append-only
- expand `feature_id` placement coverage across the remaining cards
- increase replay export breadth so replay coverage rises above the current thin baseline
- finish nested-AE residency/provenance wiring for `semantic_768 -> latent_256 -> latent_128 -> latent_64 -> SOM 20x20`
- keep glyph coverage separate from retrieval and SOM work
- finish provenance parity and quality review
- finish provenance UI and trust-tier editing
- finish feature registry reconciliation and command mapping
- run live-service env audit before qdrant backfill applies
- keep the live tree / summary / topology schema aligned before any fresh backfill or plugin promotion
- refresh-manifest invalidation stays bound to atlas truth promotion
- OpenCode `/api/v1/chat/completions` delegates to the ACE facade; keep EmbeddingGemma, Qdrant packet retrieval, Valkey/Bitfrost reuse, and llama-server fallback wired end to end
- reduce cold ACE synthesis latency while preserving the verified Redis repeat-hit path
- stage packet reader / writer work in `scripts/atlas` and `.tmp`, then consolidate into `packages/parent-atlas`
- keep HyperRAG telemetry, replay traces, and health logging read-only and append-only
- expand `feature_id` placement coverage across the remaining cards
- increase replay export breadth so replay coverage rises above the current thin baseline
- finish nested-AE residency/provenance wiring for `semantic_768 -> latent_256 -> latent_128 -> latent_64 -> SOM 20x20`
- keep glyph coverage separate from retrieval and SOM work
- finish provenance parity and quality review
- finish provenance UI and trust-tier editing
- finish feature registry reconciliation and command mapping
- run live-service env audit before qdrant backfill applies
- keep offline mirrors downstream-only

### Lineage and Bitfrost findings
- `packet_id` is still the canonical UUID identity, while `packet_ulid` is now the sortable lineage field.
- `packet_key` remains the deterministic content guard and mirror lookup key.
- `title_id` is now present as a derived grouping surface for summary materialization.
- `canonical_source_ref` is backfilled to keep packet provenance aligned across the ledger.
- The remaining malformed legacy packet row needs source-side repair rather than more generic lineage backfill.
- For local Bitfrost checks, `0.0.0.0:8080` is invalid as a browser target; the live host URL is `http://127.0.0.1:3040` and the container listens on `8080`, so verify the host URL before treating it as a service outage.

## Retrieval abstraction and future cuVS swap

The current retrieval boundary is:
- `sveltekit-frontend/src/lib/server/search/qdrant-search.ts`
- `sveltekit-frontend/src/lib/server/retrieval/orchestrator.ts`

Current default: Qdrant handles semantic vector search, payload filters, quantized vector traversal, and structural pruning.

Retrieval policy: filter first, search compressed approximate semantic geometry second, then exact-rescore only the bounded candidate set when quality or telemetry requires it.

Future optional acceleration: cuVS/CAGRA may be introduced behind the same retrieval abstraction. Callers must not depend on Qdrant-specific client details. cuVS is an acceleration lane, not the canonical store.

Canonical truth remains: Postgres packet/ledger tables, sourceRef/cold-original provenance, and Parent Atlas joins.

## LangGraph boundary

LangGraph is optional orchestration/testing only.

**Allowed:**
- validation workflows, planning graphs, subagent sequencing
- Gemma4/function-tool calling, dry-run reasoning

**Not allowed:**
- direct writes to Postgres, Qdrant, Redis, Neo4j, DuckDB, or SeaweedFS
- archive/move/delete operations

Durable mutations must go through: promotion queue, schema gates, validation reports, and bounded apply scripts.

## Notes

- This TOC is intentionally short and stable.
- Use the linked docs for lane details, and the master todo for execution state.
- The canonical join spine remains `sourceRef + feature_id`.
