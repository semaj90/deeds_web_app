# OpenSpec Workboard

> Generated from OpenSpec task ledgers. This is a navigation/progress projection, not task authority.

## Memory/agent ownership reconciliation

- [2026-09-05 bounded owner reconciliation](reports/memory-agent-openspec-ownership-reconciliation-v1.json): capability-to-owner mapping, current-tree evidence, pending gates and validation results.
- Existing owning tasks.md files remain implementation authority; this report creates no new change or portfolio authority.
- SearchRuntime owns fusion; query features feed the existing ACE/ContextManifest bridge; exact caches and server prefix state retain separate owners.
- The nested wire-agentic-workflows-e2e-test ledger is reference-only. WorkflowActionEventV1 and WorkflowExecutionCoordinatesV1 retain run/backend boundaries.
- Planning reconciliation does not prove runtime convergence, authorize cache/datastore writes, or advance current source/cohort admission.

Overall progress: [######----] 7866/13289 tasks
Execution states: 4240 actionable; 1104 waiting on dependencies; 0 receipt-confirmed superseded/historical; 115 supersession-review candidates; 2 invariants.
Scheduler permission: 0 explicitly selected; READY/actionable rows are not selected automatically.
Change states: 10 complete; 21 advanceable; 75 mixed actionable/waiting; 1 waiting/historical; 0 review required.
ETA: UNKNOWN — no receipt-linked throughput supports a defensible estimate.

## Execution program waves

- **WAVE-00** Authority and lineage — PLANNED_NOT_SELECTED; depends on none; gates: SOURCE_AUTHORITY_AND_LINEAGE; leaves: 134
- **WAVE-01** Identity and source qualification — PLANNED_NOT_SELECTED; depends on none; gates: IDENTITY_AUTHORITY_PROVEN; leaves: 576
- **WAVE-02** Packet and chunk lineage — PLANNED_NOT_SELECTED; depends on none; gates: REVISION_QUALIFIED_PACKET_CHUNK_READBACK; leaves: 194
- **WAVE-03** Canonical ingestion and index fabric — PLANNED_NOT_SELECTED; depends on none; gates: CANONICAL_ROWS_AND_READBACK; leaves: 613
- **WAVE-04** Retrieval lane convergence — PLANNED_NOT_SELECTED; depends on none; gates: RETRIEVAL_LANES_CANONICAL; leaves: 516
- **WAVE-05** Candidate features and matrices — PLANNED_NOT_SELECTED; depends on none; gates: FEATURE_MATRIX_REVISION_QUALIFIED; leaves: 259
- **WAVE-06** Adaptive DAG and ContextManifest — PLANNED_NOT_SELECTED; depends on none; gates: CONTEXT_MANIFEST_BOUND; leaves: 104
- **WAVE-07** Acceleration — PLANNED_NOT_SELECTED; depends on none; gates: PARITY_BEFORE_PERFORMANCE; leaves: 1040
- **WAVE-08** LDR and validation — PLANNED_NOT_SELECTED; depends on none; gates: LDR_VALIDATION_PROVEN; leaves: 224
- **WAVE-09** Projections and executors — PLANNED_NOT_SELECTED; depends on none; gates: EXECUTOR_PARITY_PROVEN; leaves: 350
- **WAVE-10** Learning and challengers — PLANNED_NOT_SELECTED; depends on none; gates: FROZEN_EVAL_AND_EXPLICIT_PROMOTION; leaves: 336
- **UNCLASSIFIED_REVIEW** Unclassified task mapping review — REVIEW_REQUIRED; leaves: 448.
- Provisional bounded work packages: 1619; assigned open leaf tasks: 4975; unclassified leaves are review-only.

## Promotion-critical dependency rank

- This rank identifies the authority gates that actually unblock promotion; task counts remain navigation metrics only.
- **1.** [parent-atlas-retrieval-lineage-dag-convergence](openspec/changes/parent-atlas-retrieval-lineage-dag-convergence/) [#######---] 865/1188 complete; 323 open — depends on none; gate: Admitted workspace/source/packet identity and canonical packet revision ownership; blocker: Execution/source producer authority and PacketRevisionOwnerV1 remain unresolved.
- **2.** [parent-atlas-gate2-chunk-lineage-convergence](openspec/changes/parent-atlas-gate2-chunk-lineage-convergence/) [###-------] 6/20 complete; 14 open — depends on parent-atlas-retrieval-lineage-dag-convergence; gate: Revision-qualified packet to chunk closure; blocker: Current workspace to packet to chunk qualification is not proven; historical bridge is not current authority.
- **3.** [parent-atlas-graph-retrieval-proof](openspec/changes/parent-atlas-graph-retrieval-proof/) [######----] 165/293 complete; 128 open — depends on parent-atlas-retrieval-lineage-dag-convergence, parent-atlas-gate2-chunk-lineage-convergence; gate: Revision-qualified packet to AST/span closure; blocker: AST/tree identity and source-span ownership remain provisional.
- **4.** [parent-atlas-prefill-routing-residency-convergence](openspec/changes/parent-atlas-prefill-routing-residency-convergence/) [#######---] 127/171 complete; 44 open — depends on parent-atlas-retrieval-lineage-dag-convergence, parent-atlas-gate2-chunk-lineage-convergence, parent-atlas-graph-retrieval-proof; gate: Planning and executor proofs over an admitted candidate cohort; blocker: Prefill, routing, residency, Qdrant/cuVS, and GPU work are downstream consumers.
- **5.** [parent-atlas-rpc-packet-registry-fabric](openspec/changes/parent-atlas-rpc-packet-registry-fabric/) [#######---] 30/41 complete; 11 open — depends on parent-atlas-retrieval-lineage-dag-convergence, parent-atlas-gate2-chunk-lineage-convergence, parent-atlas-graph-retrieval-proof; gate: Downstream read surface; no new authority; blocker: Transport is complete but must remain fail-closed until lineage supplies qualified rows.

## Dependency-ordered execution steps

- **WAVE-00** [######----] 263/418 complete; 155 open — Authority and lineage; depends on none; gate: SOURCE_AUTHORITY_AND_LINEAGE
- **WAVE-01** [######----] 785/1398 complete; 613 open — Identity and source qualification; depends on WAVE-00; gate: IDENTITY_AUTHORITY_PROVEN
- **WAVE-02** [#######---] 446/646 complete; 200 open — Packet and chunk lineage; depends on WAVE-01; gate: REVISION_QUALIFIED_PACKET_CHUNK_READBACK
- **WAVE-03** [######----] 992/1647 complete; 655 open — Canonical ingestion and index fabric; depends on WAVE-02; gate: CANONICAL_ROWS_AND_READBACK
- **WAVE-04** [######----] 753/1298 complete; 545 open — Retrieval lane convergence; depends on WAVE-03; gate: RETRIEVAL_LANES_CANONICAL
- **WAVE-05** [######----] 443/711 complete; 268 open — Candidate features and matrices; depends on WAVE-04; gate: FEATURE_MATRIX_REVISION_QUALIFIED
- **WAVE-06** [#####-----] 130/241 complete; 111 open — Adaptive DAG and ContextManifest; depends on WAVE-05; gate: CONTEXT_MANIFEST_BOUND
- **WAVE-07** [######----] 1831/2951 complete; 1120 open — Acceleration; depends on WAVE-06; gate: PARITY_BEFORE_PERFORMANCE
- **WAVE-08** [######----] 329/564 complete; 235 open — LDR and validation; depends on WAVE-07; gate: LDR_VALIDATION_PROVEN
- **WAVE-09** [#####-----] 337/706 complete; 369 open — Projections and executors; depends on WAVE-08; gate: EXECUTOR_PARITY_PROVEN
- **WAVE-10** [####------] 252/627 complete; 375 open — Learning and challengers; depends on WAVE-09; gate: FROZEN_EVAL_AND_EXPLICIT_PROMOTION

### Advisory task samples by wave (not selected for execution)

**WAVE-00**
- local-llm-offload-ownership:294 — READY; NOT_SELECTED; GENERAL; **A0 Audit** per candidate: callers (`rg` over `src/`, `scripts/`, `package.json` scripts, compose, docs, OpenSpec), (openspec/changes/local-llm-offload-ownership/tasks.md:294)
- manual-migration-reconciliation:12 — WAITING_FOR_DEPENDENCY; NOT_SELECTED; GENERAL; Register the selected feature-registry owner in the sidecar/journal decision record only after the migration baseline and schema shape are approved. (openspec/changes/manual-migration-reconciliation/tasks.md:12)
- manual-migration-reconciliation:19 — BLOCKED_BY_RUNTIME; NOT_SELECTED; GENERAL; **BLOCKED_NEEDS_OPERATOR_SIGNOFF — runtime behavior confirmed precisely 2026-09-14 (refines the 2026-08-31 entry, not just re-checked):** `docker exec legal-ai-postgres psql ... -c "SELECT 1 FROM information_schema.tables WHERE table_name='agent_pickup_queue'..."` returns zero rows — confirmed still absent live. Read each of the 3 named call sites directly, not assumed: (openspec/changes/manual-migration-reconciliation/tasks.md:19)
- manual-migration-reconciliation:62 — READY; NOT_SELECTED; GENERAL; `drizzle/manual/0000_create_embeddings_if_missing.sql` → `embeddings` — **file does not (openspec/changes/manual-migration-reconciliation/tasks.md:62)
- manual-migration-reconciliation:67 — READY; NOT_SELECTED; GENERAL; `drizzle/manual/0007_court_opinions.sql` → `court_opinions` — **file does not exist.** (openspec/changes/manual-migration-reconciliation/tasks.md:67)

**WAVE-01**
- atlas-feature-intelligence:130 — REVIEW_REQUIRED; NOT_SELECTED; GENERAL; FI-02 Add stable `feature_id` / `feature_key` registry with revision semantics. **Schema/repository written; live migration + identity round-trip proof pending.** Read-only contract audit on 2026-08-31 confirms `public.feature_registry` is absent. Do not apply the competing manual proposals until migration-ledger reconciliation selects one owner. (openspec/changes/atlas-feature-intelligence/tasks.md:130)
- atlas-feature-intelligence:131 — REVIEW_REQUIRED; NOT_SELECTED; GENERAL; FI-03 Add evidence identity normalization and canonical promotion. **Bounded proposal eligibility contract exists in `packages/parent-atlas/src/core/feature-promotion-eligibility-v1.ts`; live canonical promotion remains blocked on FI-02 and exact evidence-store ownership.** (openspec/changes/atlas-feature-intelligence/tasks.md:131)
- atlas-feature-intelligence:170 — REVIEW_REQUIRED; NOT_SELECTED; RETRIEVAL_ACE; FI-16L Attach `AceHypergraphPayloadV1` to the existing `CanonicalAcePacketEnvelope` / `HyperRAGPacketPipeline` materialization path under a versioned optional field; keep packet identity unchanged. **Explicit optional `aceHypergraph` input and revision fail-closed guard are wired; the live HyperRAG API now exposes additive facade payloads through the same package boundary. Focused packet materialization and live DB readback remain pending.** (openspec/changes/atlas-feature-intelligence/tasks.md:170)
- atlas-feature-intelligence:178 — REVIEW_REQUIRED; NOT_SELECTED; RETRIEVAL_ACE; FI-20 Add degraded-identity observability and exact promotion before fusion. **The new n-ary fusion input is fail-closed on workspace/source/query revision mismatch and can only enrich an existing hit; full canonical identity adoption across all live lanes remains open.** (openspec/changes/atlas-feature-intelligence/tasks.md:178)
- atlas-feature-intelligence:210 — REVIEW_REQUIRED; NOT_SELECTED; GENERAL; Canonical identity survives path/cluster/projection changes in live Postgres readback. (openspec/changes/atlas-feature-intelligence/tasks.md:210)

**WAVE-02**
- deep-audit-code-gates-aug22:74 — REVIEW_REQUIRED; NOT_SELECTED; GENERAL; Add or verify a dedicated WSL2 RAPIDS environment before claiming GPU (openspec/changes/deep-audit-code-gates-aug22/tasks.md:74)
- deep-audit-code-gates-aug22:77 — REVIEW_REQUIRED; NOT_SELECTED; GENERAL; For every future helper claim, record interpreter path, package version, (openspec/changes/deep-audit-code-gates-aug22/tasks.md:77)
- parent-atlas-ace-rlm-bitfrost-integration:3492 — REVIEW_REQUIRED; NOT_SELECTED; RETRIEVAL_ACE; Require revision-qualified keys for ACE, BitFrost, centroid, artifact, and candidate-set state. (openspec/changes/parent-atlas-ace-rlm-bitfrost-integration/tasks.md:3492)
- parent-atlas-ace-rlm-bitfrost-integration:3493 — REVIEW_REQUIRED; NOT_SELECTED; RETRIEVAL_ACE; Treat keyspace notifications as best-effort observability only; durable outbox events carry (openspec/changes/parent-atlas-ace-rlm-bitfrost-integration/tasks.md:3493)
- parent-atlas-ace-rlm-bitfrost-integration:3495 — REVIEW_REQUIRED; NOT_SELECTED; RETRIEVAL_ACE; Distinguish hard invalidation, soft retirement, and selected prewarm. TTL/LRU is cleanup and (openspec/changes/parent-atlas-ace-rlm-bitfrost-integration/tasks.md:3495)

**WAVE-03**
- atlas-feature-intelligence:48 — REVIEW_REQUIRED; NOT_SELECTED; GENERAL; **PACKET-ROUTING-INDEX-01** After `FI-TITLE-ADDRESS-01` and a frozen, (openspec/changes/atlas-feature-intelligence/tasks.md:48)
- atlas-feature-intelligence:93 — REVIEW_REQUIRED; NOT_SELECTED; GENERAL; **FI-ONTO-04** Reconcile live feature registry and implementation bindings (openspec/changes/atlas-feature-intelligence/tasks.md:93)
- atlas-feature-intelligence:102 — REVIEW_REQUIRED; NOT_SELECTED; GENERAL; **FI-ONTO-06** Run the live crosswalk and reconcile each implementation (openspec/changes/atlas-feature-intelligence/tasks.md:102)
- atlas-feature-intelligence:136 — REVIEW_REQUIRED; NOT_SELECTED; GENERAL; FI-05 Parse OpenSpec requirements, scenarios, change proposals and task checklists. (openspec/changes/atlas-feature-intelligence/tasks.md:136)
- atlas-feature-intelligence:137 — REVIEW_REQUIRED; NOT_SELECTED; GENERAL; FI-06 Parse Spec Kit `.specify` artifacts when present without making them canonical authority. (openspec/changes/atlas-feature-intelligence/tasks.md:137)

**WAVE-04**
- atlas-feature-intelligence:166 — REVIEW_REQUIRED; NOT_SELECTED; RETRIEVAL_ACE; FI-16H Wire `HyperRagFusionService` to the Parent Atlas package and expose the N-ary facade on the live search/API path. **The HyperRAG API now has an explicit `useGraph=true` read-only bridge through `@deeds/parent-atlas`, the PostgreSQL feature-intelligence repository, and the existing fusion boundary. It admits only exact current canonical hits and reports unavailable/degraded results without changing primary retrieval. Live production relationship rows and end-to-end API readback remain unproven.** (openspec/changes/atlas-feature-intelligence/tasks.md:166)
- atlas-feature-intelligence:167 — REVIEW_REQUIRED; NOT_SELECTED; GENERAL; FI-16I Add query-conditioned PPR executor over relationship/incidence candidates and write revisioned receipts. **The existing deterministic CPU PPR executor is now injectable into the HyperGraph fusion facade and its receipt is returned with the fusion result; cuGraph/Neo4j parity and live current-corpus receipt remain pending.** (openspec/changes/atlas-feature-intelligence/tasks.md:167)
- atlas-feature-intelligence:168 — REVIEW_REQUIRED; NOT_SELECTED; GENERAL; FI-16J Add dynamic SQL hyperedge construction from canonical shared-entity/evidence joins and promotion review. **`atlas_evidence_entities`, event-hyperedge view, bounded SQL neighborhood function, TS reader, and a pure fail-closed promotion-review receipt are written; extractor/backfill, live evidence review, canonical materializer, and live readback remain pending. Dynamic candidates remain `promotable=false` and `writes_performed=false`.** (openspec/changes/atlas-feature-intelligence/tasks.md:168)
- atlas-feature-intelligence:171 — REVIEW_REQUIRED; NOT_SELECTED; RETRIEVAL_ACE; FI-16M Add retrieval-action receipt for every `NEED_* -> DAG action -> new evidence -> sufficiency re-evaluation` loop. (openspec/changes/atlas-feature-intelligence/tasks.md:171)
- atlas-feature-intelligence:176 — REVIEW_REQUIRED; NOT_SELECTED; GENERAL; FI-18 Add logical-lane candidate adapter for lexical/BM25, AST, semantic, graph and low-rank association. (openspec/changes/atlas-feature-intelligence/tasks.md:176)

**WAVE-05**
- atlas-feature-intelligence:22 — REVIEW_REQUIRED; NOT_SELECTED; GENERAL; **FI-TITLE-ADDRESS-01** Reconcile `title_id` semantics before designing a (openspec/changes/atlas-feature-intelligence/tasks.md:22)
- atlas-feature-intelligence:132 — REVIEW_REQUIRED; NOT_SELECTED; GENERAL; FI-04 Add Postgres migrations/materializers for canonical features, evidence edges, relationships/hyperedges and state receipts. **Manual PostgreSQL 18 migration + transactional repository written; apply/readback proof pending.** (openspec/changes/atlas-feature-intelligence/tasks.md:132)
- atlas-feature-intelligence:147 — REVIEW_REQUIRED; NOT_SELECTED; GENERAL; FI-12 Materialize typed Feature↔Evidence relations. (openspec/changes/atlas-feature-intelligence/tasks.md:147)
- atlas-feature-intelligence:149 — REVIEW_REQUIRED; NOT_SELECTED; GENERAL; FI-13B Persist canonical N-ary relationship/hyperedge records and member rows in Postgres. **Header/member/cardinality/evidence tables + transactional writer exist; live migration/receipt pending.** (openspec/changes/atlas-feature-intelligence/tasks.md:149)
- atlas-feature-intelligence:153 — REVIEW_REQUIRED; NOT_SELECTED; GENERAL; FI-15 Compute PageRank/PPR/fanout/blocking metrics by canonical `feature_id`; keep graph node degree separate from relationship degree. **Deterministic CPU incidence-PPR reference + receipt written; live/cross-backend proof pending.** (openspec/changes/atlas-feature-intelligence/tasks.md:153)

**WAVE-06**
- legal-corpus-california-codes:222 — REVIEW_REQUIRED; NOT_SELECTED; RETRIEVAL_ACE; QL-02 Wire PromptPlanV1 (`packages/atlas-core/src/langgraph/ornith-prompt-plan-adapter.ts`) and an admitted ContextManifest into the fixture; reuse, do not copy (second contract owner). Decide copy/mirror policy for atlas-core. (openspec/changes/legal-corpus-california-codes/tasks.md:222)
- legal-corpus-california-codes:258 — REVIEW_REQUIRED; NOT_SELECTED; RETRIEVAL_ACE; QDRANT-E2E-VERIFY-01 (2026-10-17, read-only verification) Fresh `6333` and `6334` TCP probes passed and Qdrant `GET /readyz` returned HTTP 200. Re-ran `node --test scripts/atlas/qdrant-grpc-upsert-request.test.mjs`: 9/9 pass; the test confirms request construction performs no network I/O. Caller audit found `createQdrantGrpcPayloadClient` used by `upsert-qdrant-packet-payload.mjs` for `findPointIds` and `setPayload`; no caller for the new vector `upsertPoints` method was found. The existing canonical projection worker remains REST-based. `query-lifecycle-fixture-v1.mts` explicitly reports SearchRuntime, GraphV2, and ContextManifestV2 as `NOT_RUN`; SearchRuntime's fusion owner is present but the full projection → final Top-K → ContextManifest live chain is not proven. Recipe/manifest, KMeans replay, human-reviewed labels, canonical lineage, and independent scratch-collection readback remain prerequisites. No upsert, database write, GPU execution, or canonical mutation performed. Overall result: health proven; vector gRPC request contract proven; live vector projection and end-to-end retrieval NOT_PROVEN. (openspec/changes/legal-corpus-california-codes/tasks.md:258)
- legal-corpus-california-codes:351 — REVIEW_REQUIRED; NOT_SELECTED; RETRIEVAL_ACE; SEM-DAG-01 MCP query -> qualified SearchRuntime evidence -> ContextManifest -> DAG prefill, only with revision-qualified evidence (the 50-entry prefill LUT is synthetic: its vectors come from a hash-seeded generator, see ONNX-ROOTCAUSE-01 session notes). (openspec/changes/legal-corpus-california-codes/tasks.md:351)
- parent-atlas-ace-bitfrost-cache-correctness:14 — REVIEW_REQUIRED; NOT_SELECTED; RETRIEVAL_ACE; `CACHE-PREFILL-01/02/03` remain open. The narrow RLM request-key change does not (openspec/changes/parent-atlas-ace-bitfrost-cache-correctness/tasks.md:14)
- parent-atlas-ace-bitfrost-cache-correctness:95 — REVIEW_REQUIRED; NOT_SELECTED; RETRIEVAL_ACE; [workstation-p14] CACHE-PREFILL-01 audit the existing Ornith query-synthesis/prompt-build path, (openspec/changes/parent-atlas-ace-bitfrost-cache-correctness/tasks.md:95)

**WAVE-07**
- agent-branch-review-fanout-ace-centroid-aug22:24 — READY; NOT_SELECTED; RETRIEVAL_ACE; 3.3 If 3.2 fails, the operator's fallback is to patch the precise optional-lane return site in the ACE context assembler (explicitly scoped narrow — "not a blanket catch around ACE", citing the assembler's existing correct fail-open behavior for cached-chunk reads as the pattern to match). Deferred until 3.2 actually runs. (openspec/changes/agent-branch-review-fanout-ace-centroid-aug22/tasks.md:24)
- agent-branch-review-fanout-ace-centroid-aug22:25 — READY; NOT_SELECTED; RETRIEVAL_ACE; 3.4 If 3.2 succeeds, the operator's stated follow-on is to leave ACE degradation alone and move to wiring proof-qualified storage/GPU capabilities into the MCP Viterbi capability registry as hard executor admission masks (replacing probabilistic Viterbi weighting for those specific capabilities). Deferred — downstream of 3.2. (openspec/changes/agent-branch-review-fanout-ace-centroid-aug22/tasks.md:25)
- agent-branch-review-fanout-ace-centroid-aug22:31 — READY; NOT_SELECTED; RETRIEVAL_ACE; 4.3 The `fanout-proof-db-readiness` and `ace-centroid-alignment` branches remain unmerged, both still correctness-verified and low-risk per sections 1-2 above — the actual merge-to-`main` decision for those two specific branches is still an operator call, not made in this session. (openspec/changes/agent-branch-review-fanout-ace-centroid-aug22/tasks.md:31)
- atlas-feature-intelligence:175 — REVIEW_REQUIRED; NOT_SELECTED; RETRIEVAL_ACE; FI-17 Materialize Qdrant feature/evidence/relationship points with canonical IDs, revisions, domains and embedding metadata. **Postgres relationship vector(768)+HNSW surface written; Qdrant/CAGRA projection pending.** (openspec/changes/atlas-feature-intelligence/tasks.md:175)
- atlas-feature-intelligence:261 — REVIEW_REQUIRED; NOT_SELECTED; RETRIEVAL_ACE; ACE packet construction produces canonical relationship IDs, typed participant roles, evidence refs, chain lineage and a sufficient-context decision. **End-to-end fixture written; execution pending.** (openspec/changes/atlas-feature-intelligence/tasks.md:261)

**WAVE-08**
- deep-audit-code-gates-aug22:3 — READY; NOT_SELECTED; GENERAL; 1.1 Exclude `scripts/api-cleanup/` (whole directory, ~2,558 stale route-file backups), `llama-cpp-turboquant-gemma4/`, `tools/agentic-research/`, `scripts/phase104-backups/`, `granite-docling-258M/` from the indexer's file inventory (`npm run index:codebase:fast` / `graphify:daily`) so raw gate counts aren't inflated by vendor/backup noise. Confirm no other backup-shaped directories exist via `find . -iname '*backup*' -maxdepth 4 -type d`. (openspec/changes/deep-audit-code-gates-aug22/tasks.md:3)
- legal-corpus-california-codes:221 — REVIEW_REQUIRED; NOT_SELECTED; RETRIEVAL_ACE; QL-01 `scripts/atlas/query-lifecycle-fixture-v1.mts` (QUERY-LIFECYCLE-01): RAN classification, compiler evidence with exact UTF-8 spans, cited external rule (svelte.dev compiler-warnings, fetched locally via the sidecar's BeautifulSoup, NOT written to `atlas_external_doc_pages`), real Ornith calls, citation check, strict checker (in-memory patch + svelte recompile + no dangling/non-labelable `for` target), repair loop. Result: 0 valid repairs across runs; first "pass" was a checker gap (dangling `for`), fixed by tightening, not loosening. NOT_RUN: SearchRuntime, graph, ContextManifestV2, PromptPlanV1. Receipts: `logs/task-output/query-lifecycle-fixture-v1.json`, `query-lifecycle-citations-v1.ndjson` (append-only, local). (openspec/changes/legal-corpus-california-codes/tasks.md:221)
- legal-corpus-california-codes:357 — REVIEW_REQUIRED; NOT_SELECTED; GENERAL; TP-3 Bounded concurrency: N parallel batch workers sharing the one Ollama embedder, limited by `OLLAMA_NUM_PARALLEL` (dev-agentic.ps1 sets 2), by VRAM (Ollama holds about 685 MB next to Ornith, about 318 MiB free) and by Postgres write contention; find the knee on a small slice before any long run. Multi-core CPU work (hashing, prompt assembly, batching, JSON) may use a `worker_threads` pool with bounded queues on the 8 logical cores; the model call itself stays on Ollama. (openspec/changes/legal-corpus-california-codes/tasks.md:357)
- parent-atlas-ace-rlm-bitfrost-integration:2905 — REVIEW_REQUIRED; NOT_SELECTED; RETRIEVAL_ACE; Do not treat this reporting repair as Graphify completion; a completed receipt-bound run is (openspec/changes/parent-atlas-ace-rlm-bitfrost-integration/tasks.md:2905)
- parent-atlas-ace-rlm-bitfrost-integration:7413 — REVIEW_REQUIRED; NOT_SELECTED; RETRIEVAL_ACE; Select one real, current, revision-qualified error receipt. (openspec/changes/parent-atlas-ace-rlm-bitfrost-integration/tasks.md:7413)

**WAVE-09**
- legal-corpus-california-codes:251 — REVIEW_REQUIRED; NOT_SELECTED; GENERAL; TOPO4D-01 `scripts/atlas/ARCHITECTURE-4D-TOPOLOGY.md` already defines a 4D topology (X=som_col, Y=som_row, Z=cluster_id/latent_64, T=created_at + supersedes chain). The SOM is a 20x20 (2D, 400-cell) grid. All three spatial axes are currently unreliable (SOM: random/equal-count; cluster ids: stale vs vectors; latent_64: 1,703 rows). A manifold/HyperGraphRAG variant is premature until REPR-MANIFEST-01 + KMEANS-REBUILD-01 exist; GPU work (cuVS/RAPIDS) needs `:8090` freed by the operator. (openspec/changes/legal-corpus-california-codes/tasks.md:251)
- legal-corpus-california-codes:255 — REVIEW_REQUIRED; NOT_SELECTED; GENERAL; GPU-BRIDGE-01 `sveltekit-frontend/src/lib/server/gpu/libtorch-bridge.ts` already exports usable native-addon wrappers: `clusterEmbeddings(embeddings,k)` (GPU KMeans), `batchCosineSimilarity` (+Chunked, +Fp16), `graphSimilarity(+Half)`, `attentionScoreChunks(+fp16)`, `somCache`/`queryBmuCached`, `isCudaAvailable`, `gpuHasRoom(requiredMB)`, `vramNeededMB(n,dim)`; simdjson via `simdjson-bridge.ts`. Not run (card at 7.4/8.2 GiB with `:8090` up; size from nvidia-smi, not cudaMemGetInfo). Candidate use after the recipe decision: KMeans K=256 refit + exact KNN top-k Recall@10 oracle. (openspec/changes/legal-corpus-california-codes/tasks.md:255)
- legal-corpus-california-codes:345 — REVIEW_REQUIRED; NOT_SELECTED; GENERAL; SEM768-01 Dimensions/norm/duplicate-vector census on the CANONICAL column `content_embedding` (and, as challenger, `content_embedding_768`): `vector_dims`, zero-norm count, whole-vector duplicate distribution (not one shared coordinate); read-only; use `SET paradedb.check_aggregate_scan = false`. Already known: 219,998 raw vectors populated; 53,364 canonical task-prefix rows after REEMBED-CANARY-01. (openspec/changes/legal-corpus-california-codes/tasks.md:345)
- legal-corpus-california-codes:361 — REVIEW_REQUIRED; NOT_SELECTED; GENERAL; TP-7 SIMT / cuTile: only for TENSOR work that is a measured bottleneck after the above (for example nearest-centroid assignment, top-k, normalisation); the embedding itself is Ollama inference and not a cuTile target. Follow the LEVEL ladder in `sveltekit-frontend/openspec/changes/parent-atlas-gpu-compute-lanes-consolidation/tasks.md` (L1 vendor primitive / CPU oracle, L2 SIMT, L3 cuTile), keep it a challenger behind cuBLASLt/LibTorch/cuVS with CPU-reference parity, and schedule it as an exclusive GPU lease (not while Ornith holds `:8090`). (openspec/changes/legal-corpus-california-codes/tasks.md:361)
- local-llm-offload-ownership:434 — REVIEW_REQUIRED; NOT_SELECTED; GENERAL; **IMAGE-SYNTH-FLUX-01 — OPEN.** `/health` reports `flux_keyframe=false`; no FLUX load or (openspec/changes/local-llm-offload-ownership/tasks.md:434)

**WAVE-10**
- atlas-feature-intelligence:260 — REVIEW_REQUIRED; NOT_SELECTED; GENERAL; Dynamic SQL hyperedges cannot enter canonical relationship tables without promotion review. (openspec/changes/atlas-feature-intelligence/tasks.md:260)
- legal-corpus-california-codes:349 — REVIEW_REQUIRED; NOT_SELECTED; GENERAL; KMEANS-V2-01/02 Refit/evaluate K=256 on the CANONICAL vectors only after the re-embed completes: frozen cohort (dedupe repeated chunks), scikit-learn MiniBatchKMeans CPU baseline first, deterministic seed, centroid checksum; replay >= 99% using the SAME assignment rule as the fit (Euclidean predict vs cosine on renormalised centroids differed by about 1.6% in KMEANS-RAW768-DRYRUN-01); holdout agreement, cluster balance (min/median/max), domain-label review; cuML GPU only as a scheduled challenger. Model id 6 (`mbk-spherical-content768-k256-v2`, inactive evaluation candidate) already exists; do not activate (`is_assignment_active`) or project without a human-approved shadow comparison. Normalisation (Euclidean vs spherical) is an explicit recorded choice. (openspec/changes/legal-corpus-california-codes/tasks.md:349)
- local-llm-offload-ownership:513 — REVIEW_REQUIRED; NOT_SELECTED; GENERAL; **BROWSER-GEN-EVAL-05 — Run paired runtime quality/performance evaluation.** Only after (openspec/changes/local-llm-offload-ownership/tasks.md:513)
- local-llm-offload-ownership:519 — REVIEW_REQUIRED; NOT_SELECTED; GENERAL; **BROWSER-GEN-EVAL-06 — Keep routing and promotion gated.** Publish an independently (openspec/changes/local-llm-offload-ownership/tasks.md:519)
- parent-atlas-ace-bitfrost-cache-correctness:712 — REVIEW_REQUIRED; NOT_SELECTED; RETRIEVAL_ACE; Current graph promotion remains blocked: the graph readiness audit reports `16` (openspec/changes/parent-atlas-ace-bitfrost-cache-correctness/tasks.md:712)

## Permanent acceptance invariants

- **INVARIANT** [parent-atlas-neural-prefill-encoder](openspec/changes/parent-atlas-neural-prefill-encoder/tasks.md#L3766) No canonical identity or source data changes during dry-run/training. — last updated 2026-10-20T17:43:21.574Z (FILESYSTEM_MTIME); ETA N/A
- **INVARIANT** [parent-atlas-neural-prefill-encoder](openspec/changes/parent-atlas-neural-prefill-encoder/tasks.md#L3767) No projection occurs while model, identity, or parity gates fail. — last updated 2026-10-20T17:43:21.574Z (FILESYSTEM_MTIME); ETA N/A

## Critical-path change frontiers

- Frontier rows are advisory recommendations only. `schedulerPermission=SELECTED` is granted only from an explicit selection file; READY/ADVANCEABLE never selects work.
- [ ] **P10** [parent-atlas-retrieval-lineage-dag-convergence](openspec/changes/parent-atlas-retrieval-lineage-dag-convergence/tasks.md#L1636) PROMOTION-01 — Keep source lineage, graph identity, feature layout, — lane RETRIEVAL_ACE; last updated 2026-10-22T18:53:23.256Z (FILESYSTEM_MTIME); ETA UNKNOWN
- [ ] **P20** [parent-atlas-gate2-chunk-lineage-convergence](openspec/changes/parent-atlas-gate2-chunk-lineage-convergence/tasks.md#L84) 3.1 Re-run `audit-canonical-source-inventory-hygiene-v1.mts` against the fresh snapshot and — lane GENERAL; last updated 2026-10-23T04:42:55.708Z (FILESYSTEM_MTIME); ETA UNKNOWN
- [ ] **P10** [parent-atlas-graph-retrieval-proof](openspec/changes/parent-atlas-graph-retrieval-proof/tasks.md#L39) **GS1-10-IDENTITY-CONTRACTS-01** Define separate contracts for `parse_node_id`, `symbol_id`, `symbol_version_id`, `chunk_id`, `packet_key`, `concept_id`, and `graph_node_key`. — lane RETRIEVAL_ACE; last updated 2026-10-15T02:17:47.496Z (FILESYSTEM_MTIME); ETA UNKNOWN
- [ ] **P10** [parent-atlas-prefill-routing-residency-convergence](openspec/changes/parent-atlas-prefill-routing-residency-convergence/tasks.md#L307) ANN-03 Require the same semantic_768 matrix and identity manifest across Qdrant/cuVS. — lane RETRIEVAL_ACE; last updated 2026-10-15T19:58:26.495Z (FILESYSTEM_MTIME); ETA UNKNOWN
- [ ] **P10** [parent-atlas-rpc-packet-registry-fabric](openspec/changes/parent-atlas-rpc-packet-registry-fabric/tasks.md#L65) 7.5 Promote only after artifact checksum/shape/dtype readback, canonical identity/revision resolution, replay parity, and an independently validated metric receipt. No database, cache, or tensor-payload writes are authorized by this contract. — lane GENERAL; last updated 2026-10-15T22:54:00.137Z (FILESYSTEM_MTIME); ETA UNKNOWN

## Parallel proof frontiers

- [ ] **P10** [parent-atlas-compute-rank-cache-eval-dspy-gepa](openspec/changes/parent-atlas-compute-rank-cache-eval-dspy-gepa/tasks.md#L397) OAK-HGR-01 — `CURRENT_PACKET_CHUNK_IDENTITY_RECONCILIATION` blocker: investigate missing canonical packet/chunk linkage across a full frozen cohort, preserving exact source_ref/source_revision/workspace_revision/content digest. The operator-reported 52/52 revision/content matches, 24/52 packet identity matches and 5/52 proven packet/chunk lineage are bounded observations, **not** full-cohort proof. Legacy packet content_hash is diagnostic, never substitute identity. Read-only until coverage/owner resolved. — lane RETRIEVAL_ACE; last updated 2026-10-25T03:58:48.014Z (FILESYSTEM_MTIME); ETA UNKNOWN
- [ ] **P10** [parent-atlas-workstation-domain-classifier](openspec/changes/parent-atlas-workstation-domain-classifier/tasks.md#L62) **TAXONOMY-CROSSWALK-01.2** Emit a reviewable mapping proposal with exact-match, case-only, proposed mapping, unresolved, and ambiguous statuses; preserve original label, source table/row identity where available, evidence, and taxonomy revision. Normalize case-only matches only in the derived proposal; do not update canonical source records. — lane GENERAL; last updated 2026-10-24T02:43:59.210Z (FILESYSTEM_MTIME); ETA UNKNOWN
- [ ] **P10** [parent-atlas-gpu-sidecar-patch-tournament](openspec/changes/parent-atlas-gpu-sidecar-patch-tournament/tasks.md#L293) CAGRA endpoint (`POST /v1/knn/cagra`) with the same bounded identity manifest — tiny-fixture runtime and exact-oracle Recall@3 are proven, but production remains **quarantined** because larger-corpus recall, filter parity, revision swaps, fallback, and promotion approval are open. `RAPIDS_CAGRA_ENDPOINT: RUNTIME_PROVEN_ON_TINY_FIXTURE; PRODUCTION_QUARANTINED`. — lane GENERAL; last updated 2026-10-23T18:24:21.872Z (FILESYSTEM_MTIME); ETA UNKNOWN
- [ ] **P10** [parent-atlas-ml-graph-retrieval-convergence](openspec/changes/parent-atlas-ml-graph-retrieval-convergence/tasks.md#L16) ML-DATA-01 Trace the actual feature/label producer from `ranking-features.ts`, existing policy reranker and XGBoost grouped ranking inputs. Record schema, label origin, query group identity, snapshot/checksum, and train-only statistics. No labels inferred from production RRF scores as independent ground truth. — lane RETRIEVAL_ACE; last updated 2026-10-23T18:01:51.547Z (FILESYSTEM_MTIME); ETA UNKNOWN
- [ ] **P10** [parent-atlas-workspace-snapshot-runtime](openspec/changes/parent-atlas-workspace-snapshot-runtime/tasks.md#L40) WSR-12 `ProjectionFreshnessV1` / revision-DAG invalidation (descendants of a changed source revision only). — lane RETRIEVAL_ACE; last updated 2026-10-23T05:17:52.036Z (FILESYSTEM_MTIME); ETA UNKNOWN
- [ ] **P10** [parent-atlas-canonical-directory-ingestion-fabric](openspec/changes/parent-atlas-canonical-directory-ingestion-fabric/tasks.md#L103) **DIR-INDEX-04E** Add lexical fixtures for exact path, heading, symbol, body, tag/concept, and typo/substring cases with canonical candidate identity readback. — lane GENERAL; last updated 2026-10-23T04:49:38.566Z (FILESYSTEM_MTIME); ETA UNKNOWN
- [ ] **P10** [parent-atlas-governed-compute-fabric](openspec/changes/parent-atlas-governed-compute-fabric/tasks.md#L103) 2.2 Finalize `AtlasKernelSessionV1` identity: `sessionId`, kernel/environment — lane GENERAL; last updated 2026-10-23T04:07:00.515Z (FILESYSTEM_MTIME); ETA UNKNOWN
- [ ] **P10** [parent-atlas-agentic-file-compiler](openspec/changes/parent-atlas-agentic-file-compiler/tasks.md#L53) AFC-14B-02 Prove one authenticated live request using an owner-produced packet-key CandidateOrdinal snapshot, admitted ContextManifestV2, and PromptPlanV1 through the Mastra route; preserve the exact loaded model ID and record immutable model-artifact provenance if the endpoint exposes it. No candidate selection or identity interpretation may move into Mastra. Until this receipt exists, application runtime execution is not live-proven. — lane RETRIEVAL_ACE; last updated 2026-10-23T03:57:27.351Z (FILESYSTEM_MTIME); ETA UNKNOWN
- [ ] **P10** [parent-atlas-nlp-sidecar-feature-compiler](openspec/changes/parent-atlas-nlp-sidecar-feature-compiler/tasks.md#L791) 14.3a Emit `AstUnit` from treesitter-chunker into `atlas_ast_nodes` with `source_revision`+`workspace_id` on every row, and add a real-file `fixtureVerified` proof (health reports `fixtureVerified:false`); links tasks 2.1/2.2. — lane RETRIEVAL_ACE; last updated 2026-10-22T23:40:43.248Z (FILESYSTEM_MTIME); ETA UNKNOWN
- [ ] **P10** [parent-atlas-ace-rlm-bitfrost-integration](openspec/changes/parent-atlas-ace-rlm-bitfrost-integration/tasks.md#L2957) Add a revision-qualified centroid manifest/pointer and pass identity before enabling — lane RETRIEVAL_ACE; last updated 2026-10-22T22:20:57.810Z (FILESYSTEM_MTIME); ETA UNKNOWN
- [ ] **P10** [parent-atlas-retrieval-lod-algorithm-taxonomy](openspec/changes/parent-atlas-retrieval-lod-algorithm-taxonomy/tasks.md#L211) **LOD-02** Freeze `SemanticSnapshotV1` plus ordinal/canonical identity mapping as the immutable source: workspace/source/representation/ordinal-map revisions, rows, dimension 768, float32, normalization, ordinal, `packet_key`, optional `symbol_version_id`, and checksum. LOD transitions may evict/reload derived indexes but may not delete or rewrite canonical truth. Prefer Arrow IPC/mmap for direct tensor access; do not substitute Parquet where direct mmap is required. — lane RETRIEVAL_ACE; last updated 2026-10-22T18:34:43.174Z (FILESYSTEM_MTIME); ETA UNKNOWN
- [ ] **P10** [parent-atlas-ast-summary-lineage-pipeline](openspec/changes/parent-atlas-ast-summary-lineage-pipeline/tasks.md#L119) 2.2 Keep AST-grep matches as observations. They are not identity. — lane GENERAL; last updated 2026-10-22T16:41:01.328Z (FILESYSTEM_MTIME); ETA UNKNOWN
- [ ] **P10** [parent-atlas-tensor-residency-integration](openspec/changes/parent-atlas-tensor-residency-integration/tasks.md#L2353) EVENT-QUEUE-01 Treat Kafka as an optional transport/queue only if a current producer-consumer need is demonstrated; document event identity, ordering, replay, backpressure, and idempotency against canonical packet IDs before adding a runtime dependency. — lane GENERAL; last updated 2026-10-22T02:51:39.953Z (FILESYSTEM_MTIME); ETA UNKNOWN
- [ ] **P10** [parent-atlas-source-qualified-corpus-admission](openspec/changes/parent-atlas-source-qualified-corpus-admission/tasks.md#L13) 0.1 Read the existing OpenSpec changes, `docs/repo-analysis/atlas.md`, the AST V2 contract, feature-identity drafts, corpus manifests, writer receipts, and retrieval contracts. — lane RETRIEVAL_ACE; last updated 2026-10-21T20:28:30.409Z (FILESYSTEM_MTIME); ETA UNKNOWN
- [ ] **P10** [feature-label-semantic-derivation](openspec/changes/feature-label-semantic-derivation/tasks.md#L186) Migration owner reviews the source-local identity semantics and the future evidence needed to — lane GENERAL; last updated 2026-10-21T03:18:46.236Z (FILESYSTEM_MTIME); ETA UNKNOWN
- [ ] **P10** [parent-atlas-ontology-kernel](openspec/changes/parent-atlas-ontology-kernel/tasks.md#L2703) Firecrawl capture identity, content hash, evidence revision, and `.okf` — lane GENERAL; last updated 2026-10-21T03:04:02.705Z (FILESYSTEM_MTIME); ETA UNKNOWN
- [ ] **P10** [parent-atlas-versioned-doc-intelligence](openspec/changes/parent-atlas-versioned-doc-intelligence/tasks.md#L1532) `DOC-BATCH-01` — freeze the indexed-document artifact/readback contract. Treat each source page and chunk as immutable revision-qualified records; publish JSON/JSONL manifests with schema/version, source ID, exact canonical URL, product/documentation version, source content hash, parser/normalizer revision, page/chunk IDs and evidence lineage. Keep raw Markdown/page files as immutable source artifacts and JSONL as bounded control/index transport; do not duplicate full page bodies into packet envelopes. Reopen artifacts independently and verify counts, uniqueness, hashes, source/version identity, and manifest-to-corpus joins before downstream work. No packet identity may be minted from a filename, ordinal, URL, or content hash alone. — lane GENERAL; last updated 2026-10-20T19:19:59.960Z (FILESYSTEM_MTIME); ETA UNKNOWN
- [ ] **P10** [parent-atlas-neural-prefill-encoder](openspec/changes/parent-atlas-neural-prefill-encoder/tasks.md#L565) **SOURCE-REVISION-CANARY-01 — Persist one approved Graphify canary.** — lane GENERAL; last updated 2026-10-20T17:43:21.574Z (FILESYSTEM_MTIME); ETA UNKNOWN
- [ ] **P10** [parent-atlas-ace-bitfrost-cache-correctness](openspec/changes/parent-atlas-ace-bitfrost-cache-correctness/tasks.md#L406) **CACHE-RETRIEVAL-IDENTITY-03** — Update all callers, including the MCP trace route and — lane RETRIEVAL_ACE; last updated 2026-10-20T00:09:35.242Z (FILESYSTEM_MTIME); ETA UNKNOWN
- [ ] **P10** [parent-atlas-semantic-768-canonical-contract](openspec/changes/parent-atlas-semantic-768-canonical-contract/tasks.md#L978) Reconcile one source/revision-qualified representation owner against the — lane GENERAL; last updated 2026-10-18T21:25:14.381Z (FILESYSTEM_MTIME); ETA UNKNOWN
- [ ] **P10** [legal-corpus-california-codes](openspec/changes/legal-corpus-california-codes/tasks.md#L4) SEARCH-OWNER-01 CORRECTION (2026-10-18, read-only census): prior two-caller inventory is incomplete. `rrf-fuse.ts::reciprocalRankFusion` already delegates score aggregation to `fusion-core-v1.ts::fuseContributionsV1`; it retains distinct weighted-lane, identity-normalization and provenance behavior. The legal `search-fused` route (dense/sparse weights 0.6/0.4) and MCP `marco_rerank_chunks` (six caller-supplied weighted signals) are not interchangeable SearchRuntime requests. Additional local RRF helpers exist in admin Parents Atlas, admin Atlas query, query-router-4x4 and ACE context assembly. No route-level apples-to-apples replay was run; keep migration gated. Census: `docs/reports/search-fusion-owner-census-20261018.md`. — lane RETRIEVAL_ACE; last updated 2026-10-18T09:59:20.674Z (FILESYSTEM_MTIME); ETA UNKNOWN
- [ ] **P10** [parent-atlas-adaptive-backprop-hll-monitoring](openspec/changes/parent-atlas-adaptive-backprop-hll-monitoring/tasks.md#L29) AWM-00-01 Freeze the worktree change record: `{sourceRef, prior_source_revision, current_source_revision, detected_at, detector}`. Detector is byte hash only. — lane GENERAL; last updated 2026-10-18T06:19:30.125Z (FILESYSTEM_MTIME); ETA UNKNOWN
- [ ] **P10** [parent-atlas-retrieval-fusion-reachability](openspec/changes/parent-atlas-retrieval-fusion-reachability/tasks.md#L1591) Add or expose the canonical identity envelope at the caller boundary, — lane RETRIEVAL_ACE; last updated 2026-10-18T03:07:17.270Z (FILESYSTEM_MTIME); ETA UNKNOWN
- [ ] **P10** [parent-atlas-gpu-graph-vector-substrate](openspec/changes/parent-atlas-gpu-graph-vector-substrate/tasks.md#L47) 2.1 Canonical identity — confirm/fix the single identity join every retrieval — lane RETRIEVAL_ACE; last updated 2026-10-18T03:06:49.804Z (FILESYSTEM_MTIME); ETA UNKNOWN
- [ ] **P10** [parent-atlas-query-routing-classifier](openspec/changes/parent-atlas-query-routing-classifier/tasks.md#L218) Require no canonical identity changes. — lane GENERAL; last updated 2026-10-18T03:01:56.183Z (FILESYSTEM_MTIME); ETA UNKNOWN
- [ ] **P10** [parent-atlas-transport-memory-boundaries](openspec/changes/parent-atlas-transport-memory-boundaries/tasks.md#L14) **PROTO-02B-AUDIT-03** Record protocol-specific identity mapping and reject namespace confusion: Parent Atlas `packet_key`/source revisions, transport request/receipt IDs, vector-service document IDs, and Qdrant point IDs remain distinct. Confirm Qdrant messages come from the installed SDK rather than introducing a local duplicate proto. — lane RETRIEVAL_ACE; last updated 2026-10-18T02:35:25.451Z (FILESYSTEM_MTIME); ETA UNKNOWN
- [ ] **P10** [svelte-a11y-warning-remediation](openspec/changes/svelte-a11y-warning-remediation/tasks.md#L48) Bind the fixture to one exact Svelte source revision and the compiler warning/rule evidence. Keep deterministic compiler/AST observations authoritative; documentation and any model-generated summary remain advisory. — lane GENERAL; last updated 2026-10-17T23:37:50.155Z (FILESYSTEM_MTIME); ETA UNKNOWN
- [ ] **P10** [parent-atlas-pass-fabric](openspec/changes/parent-atlas-pass-fabric/tasks.md#L766) PF4B-EMBED-02 — freeze representation identity on new canonical — lane GENERAL; last updated 2026-10-17T17:29:56.842Z (FILESYSTEM_MTIME); ETA UNKNOWN
- [ ] **P10** [parent-atlas-graphify-recovery-proof-ladder](openspec/changes/parent-atlas-graphify-recovery-proof-ladder/tasks.md#L605) Production daily admission remains **NOT_PROVEN**. The explicitly reviewed existing fabric receipt (`2026-10-16T06:10:29.961Z`, not refreshed here) reports seven open predicates: symbol extraction coverage, semantic ownership, latent lineage, ordinal-map sealing, projection checksums, BitFrost readback and ACE grounding. No source/revision writes, maintenance run, database/cache access, model/GPU job or backfill was performed. These fixture checks do not close the live gates. — lane RETRIEVAL_ACE; last updated 2026-10-17T00:58:23.886Z (FILESYSTEM_MTIME); ETA UNKNOWN
- [ ] **P10** [parent-atlas-kv-cache-adaptation-research](openspec/changes/parent-atlas-kv-cache-adaptation-research/tasks.md#L8) ORNITH-CACHE-02 measure only server-managed prefix reuse against PrefixIdentityV1: — lane GENERAL; last updated 2026-10-17T00:05:09.926Z (FILESYSTEM_MTIME); ETA UNKNOWN
- [ ] **P10** [parent-atlas-code-intel-e2e](openspec/changes/parent-atlas-code-intel-e2e/tasks.md#L8) **SOURCE-SYMBOL-AUTHORITY-01** — Close current-source → symbol-version ownership. Foundation — lane GENERAL; last updated 2026-10-16T23:21:31.739Z (FILESYSTEM_MTIME); ETA UNKNOWN
- [ ] **P10** [parent-atlas-agent-framework-integration-hardening](openspec/changes/parent-atlas-agent-framework-integration-hardening/tasks.md#L11) 2.3 Define adapter conformance checks for request identity, source/workspace revisions, authorization result, bounded execution, evidence references, and replay metadata. — lane RETRIEVAL_ACE; last updated 2026-10-16T22:27:39.543Z (FILESYSTEM_MTIME); ETA UNKNOWN
- [ ] **P10** [parent-atlas-telemetry-lowrank-recommendation-okf-integration](openspec/changes/parent-atlas-telemetry-lowrank-recommendation-okf-integration/tasks.md#L84) Record domain classification as a lineage-linked navigation surface, not canonical identity. — lane RESEARCH_CHALLENGER_EWIN_TANG; last updated 2026-10-16T21:08:05.922Z (FILESYSTEM_MTIME); ETA UNKNOWN
- [ ] **P10** [parent-atlas-document-governance-master-index](openspec/changes/parent-atlas-document-governance-master-index/tasks.md#L186) **DOC-GOV-TOC-CLAUDE-SYNC-01** Keep the "Revision definitions" table in `scripts/atlas/build-master-toc.mjs` identical in wording to the `sourceRevision and workspaceRevision` sections in `codex.md` and `CLAUDE.md`. Add a check so future edits to either side are caught. — lane RETRIEVAL_ACE; last updated 2026-10-16T20:21:32.926Z (FILESYSTEM_MTIME); ETA UNKNOWN
- [ ] **P10** [parent-atlas-chunk-index-whole-file-hash](openspec/changes/parent-atlas-chunk-index-whole-file-hash/tasks.md#L316) `file_hash` still hashes decoded UTF-8 text, not raw bytes. Differs only for invalid UTF-8. Left unchanged; `source_revision` is the canonical field. — lane GENERAL; last updated 2026-10-16T17:47:27.580Z (FILESYSTEM_MTIME); ETA UNKNOWN
- [ ] **P10** [parent-atlas-best-fit-score-fabric](openspec/changes/parent-atlas-best-fit-score-fabric/tasks.md#L1216) **Context-prefix cache wiring and measurement**: connect the proven identity to the existing — lane GENERAL; last updated 2026-10-15T21:28:13.406Z (FILESYSTEM_MTIME); ETA UNKNOWN
- [ ] **P10** [parent-atlas-candidate-feature-execution-fabric](openspec/changes/parent-atlas-candidate-feature-execution-fabric/tasks.md#L211) FANOUT-01 Normalize all semantic results to CandidateOrdinal before feature fanout. — lane GENERAL; last updated 2026-10-15T21:26:55.695Z (FILESYSTEM_MTIME); ETA UNKNOWN
- [ ] **P10** [parent-atlas-pca-svd-representation-baseline](openspec/changes/parent-atlas-pca-svd-representation-baseline/tasks.md#L149) 3.1c **Define the symbol-identity contract in one place** (OpenSpec/spec, no code): confirm or amend the three — lane RETRIEVAL_ACE; last updated 2026-10-15T16:11:29.639Z (FILESYSTEM_MTIME); ETA UNKNOWN
- [ ] **P10** [parent-atlas-topology-representation-admission](openspec/changes/parent-atlas-topology-representation-admission/tasks.md#L345) TOPO-02A Replace the latent writer's fallback identity/update path with — lane RETRIEVAL_ACE; last updated 2026-10-15T02:17:48.579Z (FILESYSTEM_MTIME); ETA UNKNOWN
- [ ] **P10** [parent-atlas-code-ingestion-pipeline](openspec/changes/parent-atlas-code-ingestion-pipeline/tasks.md#L80) **GPH-05** Ownership proof — enumerate AST/symbol extraction paths and establish the sole canonical production owner, identity/revision semantics, consumers, persistence, fallback, and lifecycle evidence. 2026-09-24 read-only result: `GPH_05_OWNER_PARTIAL`; see `docs/reports/ast-ownership-gph05-v1.md`. No lifecycle or runtime behavior changed. — lane GENERAL; last updated 2026-10-15T02:17:46.519Z (FILESYSTEM_MTIME); ETA UNKNOWN
- [ ] **P10** [parent-atlas-okf-knowledge-layers](openspec/changes/parent-atlas-okf-knowledge-layers/tasks.md#L491) If later approved, expose the reviewed registry through the existing Admin Unified Indexing Studio as a read-only inspector first. A Pokédex-like display is an ordinal/hex UI metaphor only; do not copy Pokémon source/assets or use display numbers as identity. — lane GENERAL; last updated 2026-10-14T19:23:57.081Z (FILESYSTEM_MTIME); ETA UNKNOWN
- [ ] **P10** [parent-atlas-graph-analysis-contract](openspec/changes/parent-atlas-graph-analysis-contract/tasks.md#L1943) **LIVE-GRAPH-01 — Establish one current graph seed.** Reconcile the existing graph snapshot, AST/source-binding, packet/chunk, and ordinal-map owners. Require one immutable snapshot ID, graph/projection/workspace/source revisions, producer/run identity, full node/edge artifact checksums, deterministic ordinal-map checksum, canonical node keys, and typed edge semantics. Reject stale, synthetic, ambiguous, path-only, or unbound artifacts; do not rebuild Graphify as part of this audit. — lane RETRIEVAL_ACE; last updated 2026-10-14T06:28:38.986Z (FILESYSTEM_MTIME); ETA UNKNOWN
- [ ] **P10** [parent-atlas-kafka-projection-initiative](openspec/changes/parent-atlas-kafka-projection-initiative/tasks.md#L59) KAFKA-09 Revision-bound event envelope for OpenSpec task transitions, source revisions and evidence receipts. `AtlasWorkEventV1` is a local contract prototype, not yet a production event producer; it still needs canonical task/evidence identity, immutable revision requirements and a verified event source. — lane GENERAL; last updated 2026-10-13T21:25:41.898Z (FILESYSTEM_MTIME); ETA UNKNOWN
- [ ] **P10** [parent-atlas-nlp-sidecar-okf-alignment](openspec/changes/parent-atlas-nlp-sidecar-okf-alignment/tasks.md#L9) DEC-NLP-03 Add `source_revision` to the analyze response, or mark it non-admissible. Status: DECISION_NEEDED. — lane GENERAL; last updated 2026-10-13T06:27:14.954Z (FILESYSTEM_MTIME); ETA UNKNOWN
- [ ] **P10** [local-llm-offload-ownership](openspec/changes/local-llm-offload-ownership/tasks.md#L467) **BROWSER-GEN-EVAL-01 — Freeze exact artifact identity and footprint.** Record the local — lane GENERAL; last updated 2026-10-13T05:53:11.785Z (FILESYSTEM_MTIME); ETA UNKNOWN
- [ ] **P10** [parent-atlas-retrieval-logic-convergence](openspec/changes/parent-atlas-retrieval-logic-convergence/tasks.md#L338) **CONTEXT-HANDOFF-02 — Preserve deterministic prefill identity.** Continue — lane RETRIEVAL_ACE; last updated 2026-10-13T03:54:00.927Z (FILESYSTEM_MTIME); ETA UNKNOWN
- [ ] **P10** [parent-atlas-repair-candidate-feature-matrix](openspec/changes/parent-atlas-repair-candidate-feature-matrix/tasks.md#L213) **CEI-16b-02 SOURCE-CHUNK-ADMISSION**: select exactly one canonical `codebase_chunk_index.content_embedding` writer. Require one current `atlas_workspace_source_bindings` tuple and proven `atlas_packet_chunk_lineage` (`chunk_row_id`, `canonical_chunk_id`, `source_ref`, `source_revision`, exact workspace revision) for every selected chunk; require full-file source digest agreement; ambiguous/missing evidence blocks the row. Add mock/repository tests and a bounded read-only live replay. — lane RETRIEVAL_ACE; last updated 2026-10-11T23:16:11.299Z (FILESYSTEM_MTIME); ETA UNKNOWN
- [ ] **P10** [parent-atlas-openspec-task-triage-pipeline](openspec/changes/parent-atlas-openspec-task-triage-pipeline/tasks.md#L40) 3.1 Stream task ledgers and emit task-block identity, exact source span/checksum, checkbox claim, declared links, and snapshot revision; reject inputs that change during read. — lane GENERAL; last updated 2026-10-09T18:50:20.754Z (FILESYSTEM_MTIME); ETA UNKNOWN
- [ ] **P10** [parent-atlas-compiler-semantic-graph-resolution](openspec/changes/parent-atlas-compiler-semantic-graph-resolution/tasks.md#L793) The 440-nomination live producer cohort proves 440 exact source spans/nodes across 50 source files and records zero writes, but it is extraction evidence—not endpoint-to-packet identity, exact workspace/graph qualification, or admitted incidence. A separate one-source replay reports 453 extracted edges but carries no `workspaceRevision` and records zero structural-edge writes. Neither proves a 419-edge admitted cohort. — lane RETRIEVAL_ACE; last updated 2026-10-08T06:29:31.068Z (FILESYSTEM_MTIME); ETA UNKNOWN
- [ ] **P10** [atlas-feature-intelligence](openspec/changes/atlas-feature-intelligence/tasks.md#L210) Canonical identity survives path/cluster/projection changes in live Postgres readback. — lane GENERAL; last updated 2026-10-08T06:29:31.040Z (FILESYSTEM_MTIME); ETA UNKNOWN

## Change execution states

- [ace-hyperrag-chr97-graphify-audit](openspec/changes/ace-hyperrag-chr97-graphify-audit/) — **COMPLETE**; 0 actionable, 0 waiting, 0 superseded/historical; raw progress [##########] 7/7
- [agent-branch-review-fanout-ace-centroid-aug22](openspec/changes/agent-branch-review-fanout-ace-centroid-aug22/) — **ADVANCEABLE**; 3 actionable, 0 waiting, 0 superseded/historical; raw progress [#########-] 17/20
- [atlas-feature-intelligence](openspec/changes/atlas-feature-intelligence/) — **MIXED_ACTIONABLE_AND_WAITING**; 39 actionable, 15 waiting, 0 superseded/historical; raw progress [###-------] 27/82
- [codereview-inference-wiring-followup-aug22](openspec/changes/codereview-inference-wiring-followup-aug22/) — **COMPLETE**; 0 actionable, 0 waiting, 0 superseded/historical; raw progress [##########] 10/10
- [codereview-semantic-dimension-regression-aug22](openspec/changes/codereview-semantic-dimension-regression-aug22/) — **COMPLETE**; 0 actionable, 0 waiting, 0 superseded/historical; raw progress [##########] 12/12
- [deep-audit-code-gates-aug22](openspec/changes/deep-audit-code-gates-aug22/) — **MIXED_ACTIONABLE_AND_WAITING**; 11 actionable, 1 waiting, 0 superseded/historical; raw progress [######----] 16/28
- [docker-compose-duplication-remediation](openspec/changes/docker-compose-duplication-remediation/) — **COMPLETE**; 0 actionable, 0 waiting, 0 superseded/historical; raw progress [##########] 9/9
- [feature-label-semantic-derivation](openspec/changes/feature-label-semantic-derivation/) — **ADVANCEABLE**; 3 actionable, 0 waiting, 0 superseded/historical; raw progress [#######---] 6/9
- [inference-wiring-deep-audit-aug22](openspec/changes/inference-wiring-deep-audit-aug22/) — **COMPLETE**; 0 actionable, 0 waiting, 0 superseded/historical; raw progress [##########] 56/56
- [legal-corpus-california-codes](openspec/changes/legal-corpus-california-codes/) — **MIXED_ACTIONABLE_AND_WAITING**; 37 actionable, 7 waiting, 0 superseded/historical; raw progress [######----] 61/106
- [local-llm-offload-ownership](openspec/changes/local-llm-offload-ownership/) — **MIXED_ACTIONABLE_AND_WAITING**; 31 actionable, 2 waiting, 0 superseded/historical; raw progress [######----] 49/82
- [manual-migration-reconciliation](openspec/changes/manual-migration-reconciliation/) — **MIXED_ACTIONABLE_AND_WAITING**; 28 actionable, 6 waiting, 0 superseded/historical; raw progress [#######---] 98/132
- [parent-atlas-ace-bitfrost-cache-correctness](openspec/changes/parent-atlas-ace-bitfrost-cache-correctness/) — **MIXED_ACTIONABLE_AND_WAITING**; 47 actionable, 6 waiting, 0 superseded/historical; raw progress [#####-----] 57/110
- [parent-atlas-ace-rlm-bitfrost-integration](openspec/changes/parent-atlas-ace-rlm-bitfrost-integration/) — **MIXED_ACTIONABLE_AND_WAITING**; 473 actionable, 137 waiting, 0 superseded/historical; raw progress [######----] 1047/1664
- [parent-atlas-adaptive-backprop-hll-monitoring](openspec/changes/parent-atlas-adaptive-backprop-hll-monitoring/) — **MIXED_ACTIONABLE_AND_WAITING**; 47 actionable, 6 waiting, 0 superseded/historical; raw progress [##--------] 10/64
- [parent-atlas-adaptive-dag-fabric](openspec/changes/parent-atlas-adaptive-dag-fabric/) — **ADVANCEABLE**; 1 actionable, 0 waiting, 0 superseded/historical; raw progress [#########-] 12/13
- [parent-atlas-agent-framework-integration-hardening](openspec/changes/parent-atlas-agent-framework-integration-hardening/) — **MIXED_ACTIONABLE_AND_WAITING**; 54 actionable, 5 waiting, 0 superseded/historical; raw progress [##--------] 12/71
- [parent-atlas-agentic-completion](openspec/changes/parent-atlas-agentic-completion/) — **ADVANCEABLE**; 1 actionable, 0 waiting, 0 superseded/historical; raw progress [#########-] 10/11
- [parent-atlas-agentic-file-compiler](openspec/changes/parent-atlas-agentic-file-compiler/) — **MIXED_ACTIONABLE_AND_WAITING**; 19 actionable, 6 waiting, 0 superseded/historical; raw progress [#######---] 56/81
- [parent-atlas-agentic-repair-bundle-integration](openspec/changes/parent-atlas-agentic-repair-bundle-integration/) — **MIXED_ACTIONABLE_AND_WAITING**; 48 actionable, 15 waiting, 0 superseded/historical; raw progress [###-------] 29/95
- [parent-atlas-agentic-repair-fabric](openspec/changes/parent-atlas-agentic-repair-fabric/) — **MIXED_ACTIONABLE_AND_WAITING**; 5 actionable, 1 waiting, 0 superseded/historical; raw progress [#########-] 55/62
- [parent-atlas-agentic-run-receipt-binding](openspec/changes/parent-atlas-agentic-run-receipt-binding/) — **COMPLETE**; 0 actionable, 0 waiting, 0 superseded/historical; raw progress [##########] 16/16
- [parent-atlas-analysis-pass-ornith-adapter](openspec/changes/parent-atlas-analysis-pass-ornith-adapter/) — **ADVANCEABLE**; 1 actionable, 0 waiting, 0 superseded/historical; raw progress [##########] 24/25
- [parent-atlas-ast-summary-lineage-pipeline](openspec/changes/parent-atlas-ast-summary-lineage-pipeline/) — **MIXED_ACTIONABLE_AND_WAITING**; 37 actionable, 4 waiting, 0 superseded/historical; raw progress [----------] 2/43
- [parent-atlas-autoresearch-fabric](openspec/changes/parent-atlas-autoresearch-fabric/) — **COMPLETE**; 0 actionable, 0 waiting, 0 superseded/historical; raw progress [##########] 8/8
- [parent-atlas-best-fit-score-fabric](openspec/changes/parent-atlas-best-fit-score-fabric/) — **MIXED_ACTIONABLE_AND_WAITING**; 202 actionable, 88 waiting, 0 superseded/historical; raw progress [######----] 422/714
- [parent-atlas-branch-merge-consolidation-aug20](openspec/changes/parent-atlas-branch-merge-consolidation-aug20/) — **ADVANCEABLE**; 17 actionable, 0 waiting, 0 superseded/historical; raw progress [#####-----] 18/35
- [parent-atlas-candidate-feature-execution-fabric](openspec/changes/parent-atlas-candidate-feature-execution-fabric/) — **MIXED_ACTIONABLE_AND_WAITING**; 105 actionable, 52 waiting, 0 superseded/historical; raw progress [#######---] 311/471
- [parent-atlas-canonical-directory-ingestion-fabric](openspec/changes/parent-atlas-canonical-directory-ingestion-fabric/) — **MIXED_ACTIONABLE_AND_WAITING**; 53 actionable, 6 waiting, 0 superseded/historical; raw progress [###-------] 27/86
- [parent-atlas-chunk-index-whole-file-hash](openspec/changes/parent-atlas-chunk-index-whole-file-hash/) — **ADVANCEABLE**; 2 actionable, 0 waiting, 0 superseded/historical; raw progress [#########-] 25/29
- [parent-atlas-code-ingestion-pipeline](openspec/changes/parent-atlas-code-ingestion-pipeline/) — **MIXED_ACTIONABLE_AND_WAITING**; 5 actionable, 3 waiting, 0 superseded/historical; raw progress [#######---] 26/35
- [parent-atlas-code-intel-e2e](openspec/changes/parent-atlas-code-intel-e2e/) — **MIXED_ACTIONABLE_AND_WAITING**; 25 actionable, 1 waiting, 0 superseded/historical; raw progress [#---------] 2/28
- [parent-atlas-compiler-semantic-graph-resolution](openspec/changes/parent-atlas-compiler-semantic-graph-resolution/) — **MIXED_ACTIONABLE_AND_WAITING**; 43 actionable, 5 waiting, 0 superseded/historical; raw progress [####------] 40/89
- [parent-atlas-compute-rank-cache-eval-dspy-gepa](openspec/changes/parent-atlas-compute-rank-cache-eval-dspy-gepa/) — **MIXED_ACTIONABLE_AND_WAITING**; 72 actionable, 11 waiting, 0 superseded/historical; raw progress [#####-----] 77/160
- [parent-atlas-deep-research-ingestion](openspec/changes/parent-atlas-deep-research-ingestion/) — **ADVANCEABLE**; 1 actionable, 0 waiting, 0 superseded/historical; raw progress [#########-] 6/7
- [parent-atlas-document-governance-master-index](openspec/changes/parent-atlas-document-governance-master-index/) — **MIXED_ACTIONABLE_AND_WAITING**; 11 actionable, 6 waiting, 0 superseded/historical; raw progress [########--] 60/80
- [parent-atlas-error-embedding-768-migration](openspec/changes/parent-atlas-error-embedding-768-migration/) — **ADVANCEABLE**; 14 actionable, 0 waiting, 0 superseded/historical; raw progress [#####-----] 12/26
- [parent-atlas-gate2-chunk-lineage-convergence](openspec/changes/parent-atlas-gate2-chunk-lineage-convergence/) — **MIXED_ACTIONABLE_AND_WAITING**; 13 actionable, 1 waiting, 0 superseded/historical; raw progress [###-------] 6/20
- [parent-atlas-governed-compute-fabric](openspec/changes/parent-atlas-governed-compute-fabric/) — **MIXED_ACTIONABLE_AND_WAITING**; 170 actionable, 8 waiting, 0 superseded/historical; raw progress [----------] 2/180
- [parent-atlas-gpu-graph-vector-substrate](openspec/changes/parent-atlas-gpu-graph-vector-substrate/) — **MIXED_ACTIONABLE_AND_WAITING**; 46 actionable, 8 waiting, 0 superseded/historical; raw progress [#---------] 3/57
- [parent-atlas-gpu-prellm-recommendation-v1](openspec/changes/parent-atlas-gpu-prellm-recommendation-v1/) — **ADVANCEABLE**; 8 actionable, 0 waiting, 0 superseded/historical; raw progress [########--] 38/46
- [parent-atlas-gpu-runtime-abi-alignment](openspec/changes/parent-atlas-gpu-runtime-abi-alignment/) — **MIXED_ACTIONABLE_AND_WAITING**; 4 actionable, 1 waiting, 0 superseded/historical; raw progress [########--] 17/22
- [parent-atlas-gpu-sidecar-patch-tournament](openspec/changes/parent-atlas-gpu-sidecar-patch-tournament/) — **MIXED_ACTIONABLE_AND_WAITING**; 90 actionable, 19 waiting, 0 superseded/historical; raw progress [#---------] 18/130
- [parent-atlas-graph-analysis-contract](openspec/changes/parent-atlas-graph-analysis-contract/) — **MIXED_ACTIONABLE_AND_WAITING**; 51 actionable, 8 waiting, 0 superseded/historical; raw progress [#####-----] 68/128
- [parent-atlas-graph-pagerank-okf-fanout-hardening](openspec/changes/parent-atlas-graph-pagerank-okf-fanout-hardening/) — **ADVANCEABLE**; 4 actionable, 0 waiting, 0 superseded/historical; raw progress [######----] 6/10
- [parent-atlas-graph-retrieval-proof](openspec/changes/parent-atlas-graph-retrieval-proof/) — **MIXED_ACTIONABLE_AND_WAITING**; 117 actionable, 10 waiting, 0 superseded/historical; raw progress [######----] 165/293
- [parent-atlas-graph-runtime-enhancement](openspec/changes/parent-atlas-graph-runtime-enhancement/) — **MIXED_ACTIONABLE_AND_WAITING**; 4 actionable, 1 waiting, 0 superseded/historical; raw progress [####------] 3/8
- [parent-atlas-graph-runtime-python-consolidation](openspec/changes/parent-atlas-graph-runtime-python-consolidation/) — **MIXED_ACTIONABLE_AND_WAITING**; 9 actionable, 1 waiting, 0 superseded/historical; raw progress [#######---] 20/30
- [parent-atlas-graph-validation-fabric](openspec/changes/parent-atlas-graph-validation-fabric/) — **MIXED_ACTIONABLE_AND_WAITING**; 18 actionable, 15 waiting, 0 superseded/historical; raw progress [######----] 61/94
- [parent-atlas-graphify-recovery-proof-ladder](openspec/changes/parent-atlas-graphify-recovery-proof-ladder/) — **MIXED_ACTIONABLE_AND_WAITING**; 24 actionable, 2 waiting, 0 superseded/historical; raw progress [####------] 16/42
- [parent-atlas-grounded-knowledge-fabric](openspec/changes/parent-atlas-grounded-knowledge-fabric/) — **MIXED_ACTIONABLE_AND_WAITING**; 5 actionable, 6 waiting, 0 superseded/historical; raw progress [######----] 14/25
- [parent-atlas-kafka-projection-initiative](openspec/changes/parent-atlas-kafka-projection-initiative/) — **MIXED_ACTIONABLE_AND_WAITING**; 24 actionable, 9 waiting, 0 superseded/historical; raw progress [#####-----] 38/71
- [parent-atlas-kv-cache-adaptation-research](openspec/changes/parent-atlas-kv-cache-adaptation-research/) — **MIXED_ACTIONABLE_AND_WAITING**; 87 actionable, 8 waiting, 0 superseded/historical; raw progress [##--------] 23/118
- [parent-atlas-memory-architecture-freeze](openspec/changes/parent-atlas-memory-architecture-freeze/) — **MIXED_ACTIONABLE_AND_WAITING**; 12 actionable, 1 waiting, 0 superseded/historical; raw progress [########--] 44/57
- [parent-atlas-ml-graph-retrieval-convergence](openspec/changes/parent-atlas-ml-graph-retrieval-convergence/) — **MIXED_ACTIONABLE_AND_WAITING**; 158 actionable, 17 waiting, 0 superseded/historical; raw progress [###-------] 72/254
- [parent-atlas-multi-agent-wave-plan](openspec/changes/parent-atlas-multi-agent-wave-plan/) — **MIXED_ACTIONABLE_AND_WAITING**; 14 actionable, 1 waiting, 0 superseded/historical; raw progress [######----] 21/36
- [parent-atlas-native-acceleration-cabi](openspec/changes/parent-atlas-native-acceleration-cabi/) — **MIXED_ACTIONABLE_AND_WAITING**; 22 actionable, 2 waiting, 0 superseded/historical; raw progress [######----] 39/63
- [parent-atlas-nes-lut-single-owner](openspec/changes/parent-atlas-nes-lut-single-owner/) — **ADVANCEABLE**; 2 actionable, 0 waiting, 0 superseded/historical; raw progress [#######---] 5/7
- [parent-atlas-neural-prefill-encoder](openspec/changes/parent-atlas-neural-prefill-encoder/) — **MIXED_ACTIONABLE_AND_WAITING**; 522 actionable, 164 waiting, 0 superseded/historical; raw progress [#######---] 1546/2238
- [parent-atlas-nlp-sidecar-feature-compiler](openspec/changes/parent-atlas-nlp-sidecar-feature-compiler/) — **MIXED_ACTIONABLE_AND_WAITING**; 39 actionable, 18 waiting, 0 superseded/historical; raw progress [######----] 102/160
- [parent-atlas-nlp-sidecar-okf-alignment](openspec/changes/parent-atlas-nlp-sidecar-okf-alignment/) — **MIXED_ACTIONABLE_AND_WAITING**; 3 actionable, 5 waiting, 0 superseded/historical; raw progress [#####-----] 8/16
- [parent-atlas-observation-routing-fabric](openspec/changes/parent-atlas-observation-routing-fabric/) — **MIXED_ACTIONABLE_AND_WAITING**; 5 actionable, 2 waiting, 0 superseded/historical; raw progress [#######---] 19/26
- [parent-atlas-okf-knowledge-layers](openspec/changes/parent-atlas-okf-knowledge-layers/) — **MIXED_ACTIONABLE_AND_WAITING**; 23 actionable, 1 waiting, 0 superseded/historical; raw progress [######----] 39/63
- [parent-atlas-onnx-webgpu-embedding-promotion](openspec/changes/parent-atlas-onnx-webgpu-embedding-promotion/) — **ADVANCEABLE**; 6 actionable, 0 waiting, 0 superseded/historical; raw progress [#######---] 15/21
- [parent-atlas-ontology-kernel](openspec/changes/parent-atlas-ontology-kernel/) — **MIXED_ACTIONABLE_AND_WAITING**; 114 actionable, 45 waiting, 0 superseded/historical; raw progress [######----] 250/410
- [parent-atlas-ontology-oaklib-fanout-bitmap](openspec/changes/parent-atlas-ontology-oaklib-fanout-bitmap/) — **ADVANCEABLE**; 3 actionable, 0 waiting, 0 superseded/historical; raw progress [#########-] 33/36
- [parent-atlas-opencode-replay-proof](openspec/changes/parent-atlas-opencode-replay-proof/) — **MIXED_ACTIONABLE_AND_WAITING**; 13 actionable, 4 waiting, 0 superseded/historical; raw progress [#---------] 2/19
- [parent-atlas-openspec-ledger-reconciliation](openspec/changes/parent-atlas-openspec-ledger-reconciliation/) — **MIXED_ACTIONABLE_AND_WAITING**; 11 actionable, 1 waiting, 0 superseded/historical; raw progress [----------] 0/13
- [parent-atlas-openspec-task-triage-pipeline](openspec/changes/parent-atlas-openspec-task-triage-pipeline/) — **MIXED_ACTIONABLE_AND_WAITING**; 35 actionable, 5 waiting, 0 superseded/historical; raw progress [##--------] 12/54
- [parent-atlas-openspec-tasks-audit-fabric](openspec/changes/parent-atlas-openspec-tasks-audit-fabric/) — **WAITING_OR_HISTORICAL**; 0 actionable, 1 waiting, 0 superseded/historical; raw progress [#########-] 16/17
- [parent-atlas-openspec-workstation-synthesis](openspec/changes/parent-atlas-openspec-workstation-synthesis/) — **COMPLETE**; 0 actionable, 0 waiting, 0 superseded/historical; raw progress [##########] 31/31
- [parent-atlas-pass-fabric](openspec/changes/parent-atlas-pass-fabric/) — **MIXED_ACTIONABLE_AND_WAITING**; 140 actionable, 8 waiting, 0 superseded/historical; raw progress [##--------] 36/184
- [parent-atlas-pca-svd-representation-baseline](openspec/changes/parent-atlas-pca-svd-representation-baseline/) — **MIXED_ACTIONABLE_AND_WAITING**; 10 actionable, 2 waiting, 0 superseded/historical; raw progress [####------] 7/20
- [parent-atlas-policy-routing-integration](openspec/changes/parent-atlas-policy-routing-integration/) — **MIXED_ACTIONABLE_AND_WAITING**; 3 actionable, 1 waiting, 0 superseded/historical; raw progress [#########-] 36/40
- [parent-atlas-prefill-routing-residency-convergence](openspec/changes/parent-atlas-prefill-routing-residency-convergence/) — **MIXED_ACTIONABLE_AND_WAITING**; 37 actionable, 7 waiting, 0 superseded/historical; raw progress [#######---] 127/171
- [parent-atlas-qdrant-structural-payload-enrichment](openspec/changes/parent-atlas-qdrant-structural-payload-enrichment/) — **MIXED_ACTIONABLE_AND_WAITING**; 5 actionable, 1 waiting, 0 superseded/historical; raw progress [#######---] 17/23
- [parent-atlas-query-routing-classifier](openspec/changes/parent-atlas-query-routing-classifier/) — **MIXED_ACTIONABLE_AND_WAITING**; 60 actionable, 4 waiting, 0 superseded/historical; raw progress [####------] 49/113
- [parent-atlas-repair-candidate-feature-matrix](openspec/changes/parent-atlas-repair-candidate-feature-matrix/) — **MIXED_ACTIONABLE_AND_WAITING**; 23 actionable, 15 waiting, 0 superseded/historical; raw progress [########--] 135/174
- [parent-atlas-retire-384-lane](openspec/changes/parent-atlas-retire-384-lane/) — **MIXED_ACTIONABLE_AND_WAITING**; 6 actionable, 6 waiting, 0 superseded/historical; raw progress [#####-----] 17/31
- [parent-atlas-retrieval-executor-compatibility-convergence](openspec/changes/parent-atlas-retrieval-executor-compatibility-convergence/) — **ADVANCEABLE**; 9 actionable, 0 waiting, 0 superseded/historical; raw progress [########--] 39/48
- [parent-atlas-retrieval-fusion-reachability](openspec/changes/parent-atlas-retrieval-fusion-reachability/) — **MIXED_ACTIONABLE_AND_WAITING**; 11 actionable, 16 waiting, 0 superseded/historical; raw progress [########--] 121/148
- [parent-atlas-retrieval-lineage-dag-convergence](openspec/changes/parent-atlas-retrieval-lineage-dag-convergence/) — **MIXED_ACTIONABLE_AND_WAITING**; 158 actionable, 153 waiting, 0 superseded/historical; raw progress [#######---] 865/1188
- [parent-atlas-retrieval-lod-algorithm-taxonomy](openspec/changes/parent-atlas-retrieval-lod-algorithm-taxonomy/) — **MIXED_ACTIONABLE_AND_WAITING**; 86 actionable, 9 waiting, 0 superseded/historical; raw progress [####------] 60/157
- [parent-atlas-retrieval-logic-convergence](openspec/changes/parent-atlas-retrieval-logic-convergence/) — **ADVANCEABLE**; 42 actionable, 0 waiting, 0 superseded/historical; raw progress [####------] 32/74
- [parent-atlas-rpc-packet-registry-fabric](openspec/changes/parent-atlas-rpc-packet-registry-fabric/) — **MIXED_ACTIONABLE_AND_WAITING**; 4 actionable, 7 waiting, 0 superseded/historical; raw progress [#######---] 30/41
- [parent-atlas-rrf-fusion-consolidation](openspec/changes/parent-atlas-rrf-fusion-consolidation/) — **ADVANCEABLE**; 1 actionable, 0 waiting, 0 superseded/historical; raw progress [########--] 5/6
- [parent-atlas-runtime-log-remediation](openspec/changes/parent-atlas-runtime-log-remediation/) — **ADVANCEABLE**; 17 actionable, 0 waiting, 0 superseded/historical; raw progress [----------] 0/18
- [parent-atlas-search-classifier-sidecar](openspec/changes/parent-atlas-search-classifier-sidecar/) — **MIXED_ACTIONABLE_AND_WAITING**; 6 actionable, 12 waiting, 0 superseded/historical; raw progress [########--] 70/88
- [parent-atlas-semantic-512-canonicalization](openspec/changes/parent-atlas-semantic-512-canonicalization/) — **MIXED_ACTIONABLE_AND_WAITING**; 5 actionable, 3 waiting, 0 superseded/historical; raw progress [#######---] 23/31
- [parent-atlas-semantic-768-canonical-contract](openspec/changes/parent-atlas-semantic-768-canonical-contract/) — **MIXED_ACTIONABLE_AND_WAITING**; 22 actionable, 20 waiting, 0 superseded/historical; raw progress [######----] 69/111
- [parent-atlas-source-qualified-corpus-admission](openspec/changes/parent-atlas-source-qualified-corpus-admission/) — **MIXED_ACTIONABLE_AND_WAITING**; 70 actionable, 1 waiting, 0 superseded/historical; raw progress [##--------] 21/94
- [parent-atlas-telemetry-lowrank-recommendation-okf-integration](openspec/changes/parent-atlas-telemetry-lowrank-recommendation-okf-integration/) — **MIXED_ACTIONABLE_AND_WAITING**; 32 actionable, 6 waiting, 0 superseded/historical; raw progress [###-------] 17/55
- [parent-atlas-tensor-residency-integration](openspec/changes/parent-atlas-tensor-residency-integration/) — **MIXED_ACTIONABLE_AND_WAITING**; 133 actionable, 19 waiting, 0 superseded/historical; raw progress [#####-----] 179/332
- [parent-atlas-topology-representation-admission](openspec/changes/parent-atlas-topology-representation-admission/) — **MIXED_ACTIONABLE_AND_WAITING**; 14 actionable, 7 waiting, 0 superseded/historical; raw progress [######----] 37/58
- [parent-atlas-transport-memory-boundaries](openspec/changes/parent-atlas-transport-memory-boundaries/) — **MIXED_ACTIONABLE_AND_WAITING**; 54 actionable, 7 waiting, 0 superseded/historical; raw progress [####------] 44/106
- [parent-atlas-unified-symbol-ranking](openspec/changes/parent-atlas-unified-symbol-ranking/) — **COMPLETE**; 0 actionable, 0 waiting, 0 superseded/historical; raw progress [##########] 17/17
- [parent-atlas-unordered-execution-contract](openspec/changes/parent-atlas-unordered-execution-contract/) — **MIXED_ACTIONABLE_AND_WAITING**; 17 actionable, 2 waiting, 0 superseded/historical; raw progress [###-------] 7/26
- [parent-atlas-versioned-doc-intelligence](openspec/changes/parent-atlas-versioned-doc-intelligence/) — **MIXED_ACTIONABLE_AND_WAITING**; 34 actionable, 6 waiting, 0 superseded/historical; raw progress [######----] 57/98
- [parent-atlas-workboard-feature-utility-fabric](openspec/changes/parent-atlas-workboard-feature-utility-fabric/) — **MIXED_ACTIONABLE_AND_WAITING**; 30 actionable, 11 waiting, 0 superseded/historical; raw progress [####------] 28/70
- [parent-atlas-workspace-snapshot-runtime](openspec/changes/parent-atlas-workspace-snapshot-runtime/) — **MIXED_ACTIONABLE_AND_WAITING**; 27 actionable, 6 waiting, 0 superseded/historical; raw progress [##--------] 8/44
- [parent-atlas-workstation-domain-classifier](openspec/changes/parent-atlas-workstation-domain-classifier/) — **MIXED_ACTIONABLE_AND_WAITING**; 60 actionable, 24 waiting, 0 superseded/historical; raw progress [######----] 148/234
- [parent-atlas-xgboost-cuda-runtime-proof](openspec/changes/parent-atlas-xgboost-cuda-runtime-proof/) — **MIXED_ACTIONABLE_AND_WAITING**; 16 actionable, 2 waiting, 0 superseded/historical; raw progress [####------] 12/30
- [phase79-canonical-workflow-action-wiring](openspec/changes/phase79-canonical-workflow-action-wiring/) — **COMPLETE**; 0 actionable, 0 waiting, 0 superseded/historical; raw progress [##########] 16/16
- [route-import-infra-isolation](openspec/changes/route-import-infra-isolation/) — **ADVANCEABLE**; 1 actionable, 0 waiting, 0 superseded/historical; raw progress [#########-] 16/17
- [svelte-a11y-warning-remediation](openspec/changes/svelte-a11y-warning-remediation/) — **MIXED_ACTIONABLE_AND_WAITING**; 5 actionable, 2 waiting, 0 superseded/historical; raw progress [#######---] 13/20
- [sveltekit2-docs-corpus-analysis](openspec/changes/sveltekit2-docs-corpus-analysis/) — **ADVANCEABLE**; 10 actionable, 0 waiting, 0 superseded/historical; raw progress [#####-----] 9/19
- [visual-element-rendering](openspec/changes/visual-element-rendering/) — **ADVANCEABLE**; 1 actionable, 0 waiting, 0 superseded/historical; raw progress [#########-] 15/16

## Task indexing coverage

- Declared source_ref: 4/13289
- Declared source_revision: 12/13289
- Task ledger source pointer: 13289/13289 (OpenSpec file + line)
- Metadata-unclassified rows: 13273/13289; no source identity was inferred.
- Declared source fields are optional task metadata, not a measure of repository evidence coverage.

## Execution lanes

- **DAILY_GRAPHIFY_KANBAN** 19 open / 37 total
- **GENERAL** 3063 open / 7391 total
- **RESEARCH_CHALLENGER_EWIN_TANG** 46 open / 72 total
- **RETRIEVAL_ACE** 2295 open / 5789 total

## Lane dependencies

- **RESEARCH_CHALLENGER_EWIN_TANG** depends on DAILY_GRAPHIFY_KANBAN — RECEIPT_BACKED_RECOMMENDATIONS_ONLY; Ewin Tang remains an offline challenger; Daily Graphify may supply reviewed recommendation cards, never automatic canonical promotion.
- **RETRIEVAL_ACE** depends on DAILY_GRAPHIFY_KANBAN — EVIDENCE_AND_REVISION_BOUND; ACE may consume Graphify receipts after identity and source-revision eligibility checks.

## Daily Graphify Kanban reference

- Status: **STALE_SNAPSHOT**; source: docs/graph/kanban-board.json
- Snapshot age: 112.4 days; tasks: 123; sourceRefs: 246
- This snapshot is a reference/input surface only; it is not canonical identity or task authority.

## Historical and consolidation task sources

- **HISTORICAL_TASK_RANKING_REFERENCE** HISTORICAL_OR_STALE: memory/exports/kanban-ranking-report.json; task/board records 858; age 136 days
- **CURRENT_CONSOLIDATION_INPUT_REFERENCE** CURRENT_BOUNDED: docs/reports/kanban-turbovec-consolidation-latest.json; task/board records 123; age 8.5 days
- Historical ranking reports and consolidation inputs are evidence sources only; they are not merged into the OpenSpec task count automatically.

## Current consolidation reference

- Status: **CURRENT_BOUNDED_REFERENCE**; groups: 48; actions: 4; sourceRefs: 109; feature IDs: 109
- Consolidation groups remain candidate merges. They do not automatically close, rewrite, or merge OpenSpec tasks.

## Highest-volume consolidation candidates

- **todo-c-users-james-videos-deeds-web-app-master-feature-todo-2026-05-20-md:cluster:102** 5/5 open; 5 feature IDs; review only
- **todo-c-users-james-videos-deeds-web-app-master-feature-todo-2026-05-20-md:cluster:113** 5/5 open; 5 feature IDs; review only
- **todo-c-users-james-videos-deeds-web-app-master-feature-todo-2026-05-20-md:cluster:115** 5/5 open; 5 feature IDs; review only
- **todo-c-users-james-videos-deeds-web-app-master-feature-todo-2026-05-20-md:cluster:39** 5/5 open; 5 feature IDs; review only
- **todo-c-users-james-videos-deeds-web-app-master-feature-todo-2026-05-20-md:cluster:42** 5/5 open; 5 feature IDs; review only
- **todo-c-users-james-videos-deeds-web-app-master-feature-todo-2026-05-20-md:cluster:62** 5/5 open; 5 feature IDs; review only
- **todo-c-users-james-videos-deeds-web-app-master-feature-todo-2026-05-20-md:cluster:70** 5/5 open; 5 feature IDs; review only
- **todo-c-users-james-videos-deeds-web-app-master-feature-todo-2026-05-20-md:cluster:76** 5/5 open; 5 feature IDs; review only
- **todo-c-users-james-videos-deeds-web-app-master-feature-todo-2026-05-20-md:cluster:78** 5/5 open; 5 feature IDs; review only
- **todo-c-users-james-videos-deeds-web-app-master-feature-todo-2026-05-20-md:cluster:89** 5/5 open; 5 feature IDs; review only

## Change progress

- [ace-hyperrag-chr97-graphify-audit](openspec/changes/ace-hyperrag-chr97-graphify-audit/) [##########] 7/7 complete; 0 open
- [agent-branch-review-fanout-ace-centroid-aug22](openspec/changes/agent-branch-review-fanout-ace-centroid-aug22/) [#########-] 17/20 complete; 3 open
- [atlas-feature-intelligence](openspec/changes/atlas-feature-intelligence/) [###-------] 27/82 complete; 55 open
- [codereview-inference-wiring-followup-aug22](openspec/changes/codereview-inference-wiring-followup-aug22/) [##########] 10/10 complete; 0 open
- [codereview-semantic-dimension-regression-aug22](openspec/changes/codereview-semantic-dimension-regression-aug22/) [##########] 12/12 complete; 0 open
- [deep-audit-code-gates-aug22](openspec/changes/deep-audit-code-gates-aug22/) [######----] 16/28 complete; 12 open
- [docker-compose-duplication-remediation](openspec/changes/docker-compose-duplication-remediation/) [##########] 9/9 complete; 0 open
- [feature-label-semantic-derivation](openspec/changes/feature-label-semantic-derivation/) [#######---] 6/9 complete; 3 open
- [inference-wiring-deep-audit-aug22](openspec/changes/inference-wiring-deep-audit-aug22/) [##########] 56/56 complete; 0 open
- [legal-corpus-california-codes](openspec/changes/legal-corpus-california-codes/) [######----] 61/106 complete; 45 open
- [local-llm-offload-ownership](openspec/changes/local-llm-offload-ownership/) [######----] 49/82 complete; 33 open
- [manual-migration-reconciliation](openspec/changes/manual-migration-reconciliation/) [#######---] 98/132 complete; 34 open
- [parent-atlas-ace-bitfrost-cache-correctness](openspec/changes/parent-atlas-ace-bitfrost-cache-correctness/) [#####-----] 57/110 complete; 53 open
- [parent-atlas-ace-rlm-bitfrost-integration](openspec/changes/parent-atlas-ace-rlm-bitfrost-integration/) [######----] 1047/1664 complete; 617 open
- [parent-atlas-adaptive-backprop-hll-monitoring](openspec/changes/parent-atlas-adaptive-backprop-hll-monitoring/) [##--------] 10/64 complete; 54 open
- [parent-atlas-adaptive-dag-fabric](openspec/changes/parent-atlas-adaptive-dag-fabric/) [#########-] 12/13 complete; 1 open
- [parent-atlas-agent-framework-integration-hardening](openspec/changes/parent-atlas-agent-framework-integration-hardening/) [##--------] 12/71 complete; 59 open
- [parent-atlas-agentic-completion](openspec/changes/parent-atlas-agentic-completion/) [#########-] 10/11 complete; 1 open
- [parent-atlas-agentic-file-compiler](openspec/changes/parent-atlas-agentic-file-compiler/) [#######---] 56/81 complete; 25 open
- [parent-atlas-agentic-repair-bundle-integration](openspec/changes/parent-atlas-agentic-repair-bundle-integration/) [###-------] 29/95 complete; 66 open
- [parent-atlas-agentic-repair-fabric](openspec/changes/parent-atlas-agentic-repair-fabric/) [#########-] 55/62 complete; 7 open
- [parent-atlas-agentic-run-receipt-binding](openspec/changes/parent-atlas-agentic-run-receipt-binding/) [##########] 16/16 complete; 0 open
- [parent-atlas-analysis-pass-ornith-adapter](openspec/changes/parent-atlas-analysis-pass-ornith-adapter/) [##########] 24/25 complete; 1 open
- [parent-atlas-ast-summary-lineage-pipeline](openspec/changes/parent-atlas-ast-summary-lineage-pipeline/) [----------] 2/43 complete; 41 open
- [parent-atlas-autoresearch-fabric](openspec/changes/parent-atlas-autoresearch-fabric/) [##########] 8/8 complete; 0 open
- [parent-atlas-best-fit-score-fabric](openspec/changes/parent-atlas-best-fit-score-fabric/) [######----] 422/714 complete; 292 open
- [parent-atlas-branch-merge-consolidation-aug20](openspec/changes/parent-atlas-branch-merge-consolidation-aug20/) [#####-----] 18/35 complete; 17 open
- [parent-atlas-candidate-feature-execution-fabric](openspec/changes/parent-atlas-candidate-feature-execution-fabric/) [#######---] 311/471 complete; 160 open
- [parent-atlas-canonical-directory-ingestion-fabric](openspec/changes/parent-atlas-canonical-directory-ingestion-fabric/) [###-------] 27/86 complete; 59 open
- [parent-atlas-chunk-index-whole-file-hash](openspec/changes/parent-atlas-chunk-index-whole-file-hash/) [#########-] 25/29 complete; 4 open
- [parent-atlas-code-ingestion-pipeline](openspec/changes/parent-atlas-code-ingestion-pipeline/) [#######---] 26/35 complete; 9 open
- [parent-atlas-code-intel-e2e](openspec/changes/parent-atlas-code-intel-e2e/) [#---------] 2/28 complete; 26 open
- [parent-atlas-compiler-semantic-graph-resolution](openspec/changes/parent-atlas-compiler-semantic-graph-resolution/) [####------] 40/89 complete; 49 open
- [parent-atlas-compute-rank-cache-eval-dspy-gepa](openspec/changes/parent-atlas-compute-rank-cache-eval-dspy-gepa/) [#####-----] 77/160 complete; 83 open
- [parent-atlas-deep-research-ingestion](openspec/changes/parent-atlas-deep-research-ingestion/) [#########-] 6/7 complete; 1 open
- [parent-atlas-document-governance-master-index](openspec/changes/parent-atlas-document-governance-master-index/) [########--] 60/80 complete; 20 open
- [parent-atlas-error-embedding-768-migration](openspec/changes/parent-atlas-error-embedding-768-migration/) [#####-----] 12/26 complete; 14 open
- [parent-atlas-gate2-chunk-lineage-convergence](openspec/changes/parent-atlas-gate2-chunk-lineage-convergence/) [###-------] 6/20 complete; 14 open
- [parent-atlas-governed-compute-fabric](openspec/changes/parent-atlas-governed-compute-fabric/) [----------] 2/180 complete; 178 open
- [parent-atlas-gpu-graph-vector-substrate](openspec/changes/parent-atlas-gpu-graph-vector-substrate/) [#---------] 3/57 complete; 54 open
- [parent-atlas-gpu-prellm-recommendation-v1](openspec/changes/parent-atlas-gpu-prellm-recommendation-v1/) [########--] 38/46 complete; 8 open
- [parent-atlas-gpu-runtime-abi-alignment](openspec/changes/parent-atlas-gpu-runtime-abi-alignment/) [########--] 17/22 complete; 5 open
- [parent-atlas-gpu-sidecar-patch-tournament](openspec/changes/parent-atlas-gpu-sidecar-patch-tournament/) [#---------] 18/130 complete; 112 open
- [parent-atlas-graph-analysis-contract](openspec/changes/parent-atlas-graph-analysis-contract/) [#####-----] 68/128 complete; 60 open
- [parent-atlas-graph-pagerank-okf-fanout-hardening](openspec/changes/parent-atlas-graph-pagerank-okf-fanout-hardening/) [######----] 6/10 complete; 4 open
- [parent-atlas-graph-retrieval-proof](openspec/changes/parent-atlas-graph-retrieval-proof/) [######----] 165/293 complete; 128 open
- [parent-atlas-graph-runtime-enhancement](openspec/changes/parent-atlas-graph-runtime-enhancement/) [####------] 3/8 complete; 5 open
- [parent-atlas-graph-runtime-python-consolidation](openspec/changes/parent-atlas-graph-runtime-python-consolidation/) [#######---] 20/30 complete; 10 open
- [parent-atlas-graph-validation-fabric](openspec/changes/parent-atlas-graph-validation-fabric/) [######----] 61/94 complete; 33 open
- [parent-atlas-graphify-recovery-proof-ladder](openspec/changes/parent-atlas-graphify-recovery-proof-ladder/) [####------] 16/42 complete; 26 open
- [parent-atlas-grounded-knowledge-fabric](openspec/changes/parent-atlas-grounded-knowledge-fabric/) [######----] 14/25 complete; 11 open
- [parent-atlas-kafka-projection-initiative](openspec/changes/parent-atlas-kafka-projection-initiative/) [#####-----] 38/71 complete; 33 open
- [parent-atlas-kv-cache-adaptation-research](openspec/changes/parent-atlas-kv-cache-adaptation-research/) [##--------] 23/118 complete; 95 open
- [parent-atlas-memory-architecture-freeze](openspec/changes/parent-atlas-memory-architecture-freeze/) [########--] 44/57 complete; 13 open
- [parent-atlas-ml-graph-retrieval-convergence](openspec/changes/parent-atlas-ml-graph-retrieval-convergence/) [###-------] 72/254 complete; 182 open
- [parent-atlas-multi-agent-wave-plan](openspec/changes/parent-atlas-multi-agent-wave-plan/) [######----] 21/36 complete; 15 open
- [parent-atlas-native-acceleration-cabi](openspec/changes/parent-atlas-native-acceleration-cabi/) [######----] 39/63 complete; 24 open
- [parent-atlas-nes-lut-single-owner](openspec/changes/parent-atlas-nes-lut-single-owner/) [#######---] 5/7 complete; 2 open
- [parent-atlas-neural-prefill-encoder](openspec/changes/parent-atlas-neural-prefill-encoder/) [#######---] 1546/2238 complete; 692 open
- [parent-atlas-nlp-sidecar-feature-compiler](openspec/changes/parent-atlas-nlp-sidecar-feature-compiler/) [######----] 102/160 complete; 58 open
- [parent-atlas-nlp-sidecar-okf-alignment](openspec/changes/parent-atlas-nlp-sidecar-okf-alignment/) [#####-----] 8/16 complete; 8 open
- [parent-atlas-observation-routing-fabric](openspec/changes/parent-atlas-observation-routing-fabric/) [#######---] 19/26 complete; 7 open
- [parent-atlas-okf-knowledge-layers](openspec/changes/parent-atlas-okf-knowledge-layers/) [######----] 39/63 complete; 24 open
- [parent-atlas-onnx-webgpu-embedding-promotion](openspec/changes/parent-atlas-onnx-webgpu-embedding-promotion/) [#######---] 15/21 complete; 6 open
- [parent-atlas-ontology-kernel](openspec/changes/parent-atlas-ontology-kernel/) [######----] 250/410 complete; 160 open
- [parent-atlas-ontology-oaklib-fanout-bitmap](openspec/changes/parent-atlas-ontology-oaklib-fanout-bitmap/) [#########-] 33/36 complete; 3 open
- [parent-atlas-opencode-replay-proof](openspec/changes/parent-atlas-opencode-replay-proof/) [#---------] 2/19 complete; 17 open
- [parent-atlas-openspec-ledger-reconciliation](openspec/changes/parent-atlas-openspec-ledger-reconciliation/) [----------] 0/13 complete; 13 open
- [parent-atlas-openspec-task-triage-pipeline](openspec/changes/parent-atlas-openspec-task-triage-pipeline/) [##--------] 12/54 complete; 42 open
- [parent-atlas-openspec-tasks-audit-fabric](openspec/changes/parent-atlas-openspec-tasks-audit-fabric/) [#########-] 16/17 complete; 1 open
- [parent-atlas-openspec-workstation-synthesis](openspec/changes/parent-atlas-openspec-workstation-synthesis/) [##########] 31/31 complete; 0 open
- [parent-atlas-pass-fabric](openspec/changes/parent-atlas-pass-fabric/) [##--------] 36/184 complete; 148 open
- [parent-atlas-pca-svd-representation-baseline](openspec/changes/parent-atlas-pca-svd-representation-baseline/) [####------] 7/20 complete; 13 open
- [parent-atlas-policy-routing-integration](openspec/changes/parent-atlas-policy-routing-integration/) [#########-] 36/40 complete; 4 open
- [parent-atlas-prefill-routing-residency-convergence](openspec/changes/parent-atlas-prefill-routing-residency-convergence/) [#######---] 127/171 complete; 44 open
- [parent-atlas-qdrant-structural-payload-enrichment](openspec/changes/parent-atlas-qdrant-structural-payload-enrichment/) [#######---] 17/23 complete; 6 open
- [parent-atlas-query-routing-classifier](openspec/changes/parent-atlas-query-routing-classifier/) [####------] 49/113 complete; 64 open
- [parent-atlas-repair-candidate-feature-matrix](openspec/changes/parent-atlas-repair-candidate-feature-matrix/) [########--] 135/174 complete; 39 open
- [parent-atlas-retire-384-lane](openspec/changes/parent-atlas-retire-384-lane/) [#####-----] 17/31 complete; 14 open
- [parent-atlas-retrieval-executor-compatibility-convergence](openspec/changes/parent-atlas-retrieval-executor-compatibility-convergence/) [########--] 39/48 complete; 9 open
- [parent-atlas-retrieval-fusion-reachability](openspec/changes/parent-atlas-retrieval-fusion-reachability/) [########--] 121/148 complete; 27 open
- [parent-atlas-retrieval-lineage-dag-convergence](openspec/changes/parent-atlas-retrieval-lineage-dag-convergence/) [#######---] 865/1188 complete; 323 open
- [parent-atlas-retrieval-lod-algorithm-taxonomy](openspec/changes/parent-atlas-retrieval-lod-algorithm-taxonomy/) [####------] 60/157 complete; 97 open
- [parent-atlas-retrieval-logic-convergence](openspec/changes/parent-atlas-retrieval-logic-convergence/) [####------] 32/74 complete; 42 open
- [parent-atlas-rpc-packet-registry-fabric](openspec/changes/parent-atlas-rpc-packet-registry-fabric/) [#######---] 30/41 complete; 11 open
- [parent-atlas-rrf-fusion-consolidation](openspec/changes/parent-atlas-rrf-fusion-consolidation/) [########--] 5/6 complete; 1 open
- [parent-atlas-runtime-log-remediation](openspec/changes/parent-atlas-runtime-log-remediation/) [----------] 0/18 complete; 18 open
- [parent-atlas-search-classifier-sidecar](openspec/changes/parent-atlas-search-classifier-sidecar/) [########--] 70/88 complete; 18 open
- [parent-atlas-semantic-512-canonicalization](openspec/changes/parent-atlas-semantic-512-canonicalization/) [#######---] 23/31 complete; 8 open
- [parent-atlas-semantic-768-canonical-contract](openspec/changes/parent-atlas-semantic-768-canonical-contract/) [######----] 69/111 complete; 42 open
- [parent-atlas-source-qualified-corpus-admission](openspec/changes/parent-atlas-source-qualified-corpus-admission/) [##--------] 21/94 complete; 73 open
- [parent-atlas-telemetry-lowrank-recommendation-okf-integration](openspec/changes/parent-atlas-telemetry-lowrank-recommendation-okf-integration/) [###-------] 17/55 complete; 38 open
- [parent-atlas-tensor-residency-integration](openspec/changes/parent-atlas-tensor-residency-integration/) [#####-----] 179/332 complete; 153 open
- [parent-atlas-topology-representation-admission](openspec/changes/parent-atlas-topology-representation-admission/) [######----] 37/58 complete; 21 open
- [parent-atlas-transport-memory-boundaries](openspec/changes/parent-atlas-transport-memory-boundaries/) [####------] 44/106 complete; 62 open
- [parent-atlas-unified-symbol-ranking](openspec/changes/parent-atlas-unified-symbol-ranking/) [##########] 17/17 complete; 0 open
- [parent-atlas-unordered-execution-contract](openspec/changes/parent-atlas-unordered-execution-contract/) [###-------] 7/26 complete; 19 open
- [parent-atlas-versioned-doc-intelligence](openspec/changes/parent-atlas-versioned-doc-intelligence/) [######----] 57/98 complete; 41 open
- [parent-atlas-workboard-feature-utility-fabric](openspec/changes/parent-atlas-workboard-feature-utility-fabric/) [####------] 28/70 complete; 42 open
- [parent-atlas-workspace-snapshot-runtime](openspec/changes/parent-atlas-workspace-snapshot-runtime/) [##--------] 8/44 complete; 36 open
- [parent-atlas-workstation-domain-classifier](openspec/changes/parent-atlas-workstation-domain-classifier/) [######----] 148/234 complete; 86 open
- [parent-atlas-xgboost-cuda-runtime-proof](openspec/changes/parent-atlas-xgboost-cuda-runtime-proof/) [####------] 12/30 complete; 18 open
- [phase79-canonical-workflow-action-wiring](openspec/changes/phase79-canonical-workflow-action-wiring/) [##########] 16/16 complete; 0 open
- [route-import-infra-isolation](openspec/changes/route-import-infra-isolation/) [#########-] 16/17 complete; 1 open
- [svelte-a11y-warning-remediation](openspec/changes/svelte-a11y-warning-remediation/) [#######---] 13/20 complete; 7 open
- [sveltekit2-docs-corpus-analysis](openspec/changes/sveltekit2-docs-corpus-analysis/) [#####-----] 9/19 complete; 10 open
- [visual-element-rendering](openspec/changes/visual-element-rendering/) [#########-] 15/16 complete; 1 open

