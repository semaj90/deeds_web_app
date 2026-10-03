# OpenSpec Workboard

> Generated from OpenSpec task ledgers. This is a navigation/progress projection, not task authority.

## Memory/agent ownership reconciliation

- [2026-09-05 bounded owner reconciliation](reports/memory-agent-openspec-ownership-reconciliation-v1.json): capability-to-owner mapping, current-tree evidence, pending gates and validation results.
- Existing owning tasks.md files remain implementation authority; this report creates no new change or portfolio authority.
- SearchRuntime owns fusion; query features feed the existing ACE/ContextManifest bridge; exact caches and server prefix state retain separate owners.
- The nested wire-agentic-workflows-e2e-test ledger is reference-only. WorkflowActionEventV1 and WorkflowExecutionCoordinatesV1 retain run/backend boundaries.
- Planning reconciliation does not prove runtime convergence, authorize cache/datastore writes, or advance current source/cohort admission.

Overall progress: [#######---] 6624/9943 tasks
Execution states: 2478 actionable; 785 waiting on dependencies; 54 superseded/historical; 2 invariants.
Scheduler permission: 0 explicitly selected; READY/actionable rows are not selected automatically.
Change states: 15 complete; 21 advanceable; 54 mixed actionable/waiting; 0 waiting/historical; 0 review required.
ETA: UNKNOWN — no receipt-linked throughput supports a defensible estimate.

## Execution program waves

- **WAVE-00** Authority and lineage — PLANNED_NOT_SELECTED; depends on none; gates: SOURCE_AUTHORITY_AND_LINEAGE; leaves: 88
- **WAVE-01** Identity and source qualification — PLANNED_NOT_SELECTED; depends on none; gates: IDENTITY_AUTHORITY_PROVEN; leaves: 326
- **WAVE-02** Packet and chunk lineage — PLANNED_NOT_SELECTED; depends on none; gates: REVISION_QUALIFIED_PACKET_CHUNK_READBACK; leaves: 151
- **WAVE-03** Canonical ingestion and index fabric — PLANNED_NOT_SELECTED; depends on none; gates: CANONICAL_ROWS_AND_READBACK; leaves: 402
- **WAVE-04** Retrieval lane convergence — PLANNED_NOT_SELECTED; depends on none; gates: RETRIEVAL_LANES_CANONICAL; leaves: 372
- **WAVE-05** Candidate features and matrices — PLANNED_NOT_SELECTED; depends on none; gates: FEATURE_MATRIX_REVISION_QUALIFIED; leaves: 207
- **WAVE-06** Adaptive DAG and ContextManifest — PLANNED_NOT_SELECTED; depends on none; gates: CONTEXT_MANIFEST_BOUND; leaves: 57
- **WAVE-07** Acceleration — PLANNED_NOT_SELECTED; depends on none; gates: PARITY_BEFORE_PERFORMANCE; leaves: 577
- **WAVE-08** LDR and validation — PLANNED_NOT_SELECTED; depends on none; gates: LDR_VALIDATION_PROVEN; leaves: 159
- **WAVE-09** Projections and executors — PLANNED_NOT_SELECTED; depends on none; gates: EXECUTOR_PARITY_PROVEN; leaves: 227
- **WAVE-10** Learning and challengers — PLANNED_NOT_SELECTED; depends on none; gates: FROZEN_EVAL_AND_EXPLICIT_PROMOTION; leaves: 224
- **UNCLASSIFIED_REVIEW** Unclassified task mapping review — REVIEW_REQUIRED; leaves: 20.
- Provisional bounded work packages: 805; assigned open leaf tasks: 3299; unclassified leaves are review-only.

## Promotion-critical dependency rank

- This rank identifies the authority gates that actually unblock promotion; task counts remain navigation metrics only.
- **1.** [parent-atlas-retrieval-lineage-dag-convergence](openspec/changes/parent-atlas-retrieval-lineage-dag-convergence/) [########--] 812/1063 complete; 251 open — depends on none; gate: Admitted workspace/source/packet identity and canonical packet revision ownership; blocker: Execution/source producer authority and PacketRevisionOwnerV1 remain unresolved.
- **2.** [parent-atlas-gate2-chunk-lineage-convergence](openspec/changes/parent-atlas-gate2-chunk-lineage-convergence/) [##--------] 3/20 complete; 17 open — depends on parent-atlas-retrieval-lineage-dag-convergence; gate: Revision-qualified packet to chunk closure; blocker: Current workspace to packet to chunk qualification is not proven; historical bridge is not current authority.
- **3.** [parent-atlas-graph-retrieval-proof](openspec/changes/parent-atlas-graph-retrieval-proof/) [######----] 160/285 complete; 125 open — depends on parent-atlas-retrieval-lineage-dag-convergence, parent-atlas-gate2-chunk-lineage-convergence; gate: Revision-qualified packet to AST/span closure; blocker: AST/tree identity and source-span ownership remain provisional.
- **4.** [parent-atlas-prefill-routing-residency-convergence](openspec/changes/parent-atlas-prefill-routing-residency-convergence/) [########--] 125/152 complete; 27 open — depends on parent-atlas-retrieval-lineage-dag-convergence, parent-atlas-gate2-chunk-lineage-convergence, parent-atlas-graph-retrieval-proof; gate: Planning and executor proofs over an admitted candidate cohort; blocker: Prefill, routing, residency, Qdrant/cuVS, and GPU work are downstream consumers.
- **5.** [parent-atlas-rpc-packet-registry-fabric](openspec/changes/parent-atlas-rpc-packet-registry-fabric/) [##########] 27/27 complete; 0 open — depends on parent-atlas-retrieval-lineage-dag-convergence, parent-atlas-gate2-chunk-lineage-convergence, parent-atlas-graph-retrieval-proof; gate: Downstream read surface; no new authority; blocker: Transport is complete but must remain fail-closed until lineage supplies qualified rows.

## Dependency-ordered execution steps

- **WAVE-00** [#######---] 227/315 complete; 88 open — Authority and lineage; depends on none; gate: SOURCE_AUTHORITY_AND_LINEAGE
- **WAVE-01** [#######---] 664/990 complete; 326 open — Identity and source qualification; depends on WAVE-00; gate: IDENTITY_AUTHORITY_PROVEN
- **WAVE-02** [#######---] 391/542 complete; 151 open — Packet and chunk lineage; depends on WAVE-01; gate: REVISION_QUALIFIED_PACKET_CHUNK_READBACK
- **WAVE-03** [#######---] 837/1239 complete; 402 open — Canonical ingestion and index fabric; depends on WAVE-02; gate: CANONICAL_ROWS_AND_READBACK
- **WAVE-04** [######----] 641/1013 complete; 372 open — Retrieval lane convergence; depends on WAVE-03; gate: RETRIEVAL_LANES_CANONICAL
- **WAVE-05** [#######---] 393/600 complete; 207 open — Candidate features and matrices; depends on WAVE-04; gate: FEATURE_MATRIX_REVISION_QUALIFIED
- **WAVE-06** [#######---] 116/173 complete; 57 open — Adaptive DAG and ContextManifest; depends on WAVE-05; gate: CONTEXT_MANIFEST_BOUND
- **WAVE-07** [#######---] 1429/2006 complete; 577 open — Acceleration; depends on WAVE-06; gate: PARITY_BEFORE_PERFORMANCE
- **WAVE-08** [######----] 284/443 complete; 159 open — LDR and validation; depends on WAVE-07; gate: LDR_VALIDATION_PROVEN
- **WAVE-09** [#####-----] 277/504 complete; 227 open — Projections and executors; depends on WAVE-08; gate: EXECUTOR_PARITY_PROVEN
- **WAVE-10** [####------] 183/407 complete; 224 open — Learning and challengers; depends on WAVE-09; gate: FROZEN_EVAL_AND_EXPLICIT_PROMOTION

### Advisory task samples by wave (not selected for execution)

**WAVE-00**
- local-llm-offload-ownership:294 — READY; NOT_SELECTED; GENERAL; **A0 Audit** per candidate: callers (`rg` over `src/`, `scripts/`, `package.json` scripts, compose, docs, OpenSpec), (openspec/changes/local-llm-offload-ownership/tasks.md:294)
- manual-migration-reconciliation:12 — WAITING_FOR_DEPENDENCY; NOT_SELECTED; GENERAL; Register the selected feature-registry owner in the sidecar/journal decision record only after the migration baseline and schema shape are approved. (openspec/changes/manual-migration-reconciliation/tasks.md:12)
- manual-migration-reconciliation:19 — BLOCKED_BY_RUNTIME; NOT_SELECTED; GENERAL; **BLOCKED_NEEDS_OPERATOR_SIGNOFF — runtime behavior confirmed precisely 2026-09-14 (refines the 2026-08-31 entry, not just re-checked):** `docker exec legal-ai-postgres psql ... -c "SELECT 1 FROM information_schema.tables WHERE table_name='agent_pickup_queue'..."` returns zero rows — confirmed still absent live. Read each of the 3 named call sites directly, not assumed: (openspec/changes/manual-migration-reconciliation/tasks.md:19)
- manual-migration-reconciliation:62 — READY; NOT_SELECTED; GENERAL; `drizzle/manual/0000_create_embeddings_if_missing.sql` → `embeddings` — **file does not (openspec/changes/manual-migration-reconciliation/tasks.md:62)
- manual-migration-reconciliation:67 — READY; NOT_SELECTED; GENERAL; `drizzle/manual/0007_court_opinions.sql` → `court_opinions` — **file does not exist.** (openspec/changes/manual-migration-reconciliation/tasks.md:67)

**WAVE-01**
- atlas-feature-intelligence:58 — WAITING_FOR_DEPENDENCY; NOT_SELECTED; GENERAL; FI-02 Add stable `feature_id` / `feature_key` registry with revision semantics. **Schema/repository written; live migration + identity round-trip proof pending.** Read-only contract audit on 2026-08-31 confirms `public.feature_registry` is absent. Do not apply the competing manual proposals until migration-ledger reconciliation selects one owner. (openspec/changes/atlas-feature-intelligence/tasks.md:58)
- atlas-feature-intelligence:59 — AUTHORIZATION_REQUIRED; NOT_SELECTED; GENERAL; FI-03 Add evidence identity normalization and canonical promotion. **Bounded proposal eligibility contract exists in `packages/parent-atlas/src/core/feature-promotion-eligibility-v1.ts`; live canonical promotion remains blocked on FI-02 and exact evidence-store ownership.** (openspec/changes/atlas-feature-intelligence/tasks.md:59)
- atlas-feature-intelligence:98 — WAITING_FOR_DEPENDENCY; NOT_SELECTED; RETRIEVAL_ACE; FI-16L Attach `AceHypergraphPayloadV1` to the existing `CanonicalAcePacketEnvelope` / `HyperRAGPacketPipeline` materialization path under a versioned optional field; keep packet identity unchanged. **Explicit optional `aceHypergraph` input and revision fail-closed guard are wired; the live HyperRAG API now exposes additive facade payloads through the same package boundary. Focused packet materialization and live DB readback remain pending.** (openspec/changes/atlas-feature-intelligence/tasks.md:98)
- atlas-feature-intelligence:106 — AUTHORIZATION_REQUIRED; NOT_SELECTED; RETRIEVAL_ACE; FI-20 Add degraded-identity observability and exact promotion before fusion. **The new n-ary fusion input is fail-closed on workspace/source/query revision mismatch and can only enrich an existing hit; full canonical identity adoption across all live lanes remains open.** (openspec/changes/atlas-feature-intelligence/tasks.md:106)
- atlas-feature-intelligence:138 — READY; NOT_SELECTED; GENERAL; Canonical identity survives path/cluster/projection changes in live Postgres readback. (openspec/changes/atlas-feature-intelligence/tasks.md:138)

**WAVE-02**
- deep-audit-code-gates-aug22:73 — READY; NOT_SELECTED; GENERAL; Add or verify a dedicated WSL2 RAPIDS environment before claiming GPU (openspec/changes/deep-audit-code-gates-aug22/tasks.md:73)
- deep-audit-code-gates-aug22:76 — READY; NOT_SELECTED; GENERAL; For every future helper claim, record interpreter path, package version, (openspec/changes/deep-audit-code-gates-aug22/tasks.md:76)
- parent-atlas-ace-rlm-bitfrost-integration:3387 — READY; NOT_SELECTED; RETRIEVAL_ACE; Require revision-qualified keys for ACE, BitFrost, centroid, artifact, and candidate-set state. (openspec/changes/parent-atlas-ace-rlm-bitfrost-integration/tasks.md:3387)
- parent-atlas-ace-rlm-bitfrost-integration:3388 — READY; NOT_SELECTED; RETRIEVAL_ACE; Treat keyspace notifications as best-effort observability only; durable outbox events carry (openspec/changes/parent-atlas-ace-rlm-bitfrost-integration/tasks.md:3388)
- parent-atlas-ace-rlm-bitfrost-integration:3390 — READY; NOT_SELECTED; RETRIEVAL_ACE; Distinguish hard invalidation, soft retirement, and selected prewarm. TTL/LRU is cleanup and (openspec/changes/parent-atlas-ace-rlm-bitfrost-integration/tasks.md:3390)

**WAVE-03**
- atlas-feature-intelligence:21 — READY; NOT_SELECTED; GENERAL; **FI-ONTO-04** Reconcile live feature registry and implementation bindings (openspec/changes/atlas-feature-intelligence/tasks.md:21)
- atlas-feature-intelligence:30 — READY; NOT_SELECTED; GENERAL; **FI-ONTO-06** Run the live crosswalk and reconcile each implementation (openspec/changes/atlas-feature-intelligence/tasks.md:30)
- atlas-feature-intelligence:64 — READY; NOT_SELECTED; GENERAL; FI-05 Parse OpenSpec requirements, scenarios, change proposals and task checklists. (openspec/changes/atlas-feature-intelligence/tasks.md:64)
- atlas-feature-intelligence:65 — READY; NOT_SELECTED; GENERAL; FI-06 Parse Spec Kit `.specify` artifacts when present without making them canonical authority. (openspec/changes/atlas-feature-intelligence/tasks.md:65)
- atlas-feature-intelligence:66 — READY; NOT_SELECTED; GENERAL; FI-07 Parse markdown headings, task checkboxes and tables into structured evidence candidates. (openspec/changes/atlas-feature-intelligence/tasks.md:66)

**WAVE-04**
- atlas-feature-intelligence:94 — BLOCKED_BY_RUNTIME; NOT_SELECTED; RETRIEVAL_ACE; FI-16H Wire `HyperRagFusionService` to the Parent Atlas package and expose the N-ary facade on the live search/API path. **The HyperRAG API now has an explicit `useGraph=true` read-only bridge through `@deeds/parent-atlas`, the PostgreSQL feature-intelligence repository, and the existing fusion boundary. It admits only exact current canonical hits and reports unavailable/degraded results without changing primary retrieval. Live production relationship rows and end-to-end API readback remain unproven.** (openspec/changes/atlas-feature-intelligence/tasks.md:94)
- atlas-feature-intelligence:95 — WAITING_FOR_DEPENDENCY; NOT_SELECTED; GENERAL; FI-16I Add query-conditioned PPR executor over relationship/incidence candidates and write revisioned receipts. **The existing deterministic CPU PPR executor is now injectable into the HyperGraph fusion facade and its receipt is returned with the fusion result; cuGraph/Neo4j parity and live current-corpus receipt remain pending.** (openspec/changes/atlas-feature-intelligence/tasks.md:95)
- atlas-feature-intelligence:96 — AUTHORIZATION_REQUIRED; NOT_SELECTED; GENERAL; FI-16J Add dynamic SQL hyperedge construction from canonical shared-entity/evidence joins and promotion review. **`atlas_evidence_entities`, event-hyperedge view, bounded SQL neighborhood function, TS reader, and a pure fail-closed promotion-review receipt are written; extractor/backfill, live evidence review, canonical materializer, and live readback remain pending. Dynamic candidates remain `promotable=false` and `writes_performed=false`.** (openspec/changes/atlas-feature-intelligence/tasks.md:96)
- atlas-feature-intelligence:99 — READY; NOT_SELECTED; RETRIEVAL_ACE; FI-16M Add retrieval-action receipt for every `NEED_* -> DAG action -> new evidence -> sufficiency re-evaluation` loop. (openspec/changes/atlas-feature-intelligence/tasks.md:99)
- atlas-feature-intelligence:104 — READY; NOT_SELECTED; GENERAL; FI-18 Add logical-lane candidate adapter for lexical/BM25, AST, semantic, graph and low-rank association. (openspec/changes/atlas-feature-intelligence/tasks.md:104)

**WAVE-05**
- atlas-feature-intelligence:60 — WAITING_FOR_DEPENDENCY; NOT_SELECTED; GENERAL; FI-04 Add Postgres migrations/materializers for canonical features, evidence edges, relationships/hyperedges and state receipts. **Manual PostgreSQL 18 migration + transactional repository written; apply/readback proof pending.** (openspec/changes/atlas-feature-intelligence/tasks.md:60)
- atlas-feature-intelligence:75 — READY; NOT_SELECTED; GENERAL; FI-12 Materialize typed Feature↔Evidence relations. (openspec/changes/atlas-feature-intelligence/tasks.md:75)
- atlas-feature-intelligence:77 — AUTHORIZATION_REQUIRED; NOT_SELECTED; GENERAL; FI-13B Persist canonical N-ary relationship/hyperedge records and member rows in Postgres. **Header/member/cardinality/evidence tables + transactional writer exist; live migration/receipt pending.** (openspec/changes/atlas-feature-intelligence/tasks.md:77)
- atlas-feature-intelligence:81 — WAITING_FOR_DEPENDENCY; NOT_SELECTED; GENERAL; FI-15 Compute PageRank/PPR/fanout/blocking metrics by canonical `feature_id`; keep graph node degree separate from relationship degree. **Deterministic CPU incidence-PPR reference + receipt written; live/cross-backend proof pending.** (openspec/changes/atlas-feature-intelligence/tasks.md:81)
- atlas-feature-intelligence:116 — READY; NOT_SELECTED; GENERAL; FI-22E Materialize revisioned feature matrices from existing packet/features/metrics/graph snapshots. (openspec/changes/atlas-feature-intelligence/tasks.md:116)

**WAVE-06**
- parent-atlas-ace-bitfrost-cache-correctness:9 — READY; NOT_SELECTED; RETRIEVAL_ACE; `CACHE-PREFILL-01/02/03` remain open. The narrow RLM request-key change does not (openspec/changes/parent-atlas-ace-bitfrost-cache-correctness/tasks.md:9)
- parent-atlas-ace-bitfrost-cache-correctness:90 — READY; NOT_SELECTED; RETRIEVAL_ACE; CACHE-PREFILL-01 audit the existing Ornith query-synthesis/prompt-build path, (openspec/changes/parent-atlas-ace-bitfrost-cache-correctness/tasks.md:90)
- parent-atlas-ace-bitfrost-cache-correctness:102 — READY; NOT_SELECTED; RETRIEVAL_ACE; CACHE-PREFILL-03 after caller ownership is verified, run a separately scoped (openspec/changes/parent-atlas-ace-bitfrost-cache-correctness/tasks.md:102)
- parent-atlas-adaptive-dag-fabric:320 — READY; NOT_SELECTED; GENERAL; NATS-EVENT-01 JetStream `PARENT_ATLAS_EVENTS` shadow event stream (openspec/changes/parent-atlas-adaptive-dag-fabric/tasks.md:320)
- parent-atlas-agentic-file-compiler:9 — READY; NOT_SELECTED; RETRIEVAL_ACE; AFC-04B Wire the LangGraph synthesis adapter to the existing `ContextManifestV1`/`ContextManifestV2` → `PromptPlanV1` → shared Ornith llama-server resolver path; prove a bounded multi-turn execution without hidden-state persistence, ad-hoc prompt bypass, or datastore writes. (openspec/changes/parent-atlas-agentic-file-compiler/tasks.md:9)

**WAVE-07**
- agent-branch-review-fanout-ace-centroid-aug22:24 — READY; NOT_SELECTED; RETRIEVAL_ACE; 3.3 If 3.2 fails, the operator's fallback is to patch the precise optional-lane return site in the ACE context assembler (explicitly scoped narrow — "not a blanket catch around ACE", citing the assembler's existing correct fail-open behavior for cached-chunk reads as the pattern to match). Deferred until 3.2 actually runs. (openspec/changes/agent-branch-review-fanout-ace-centroid-aug22/tasks.md:24)
- agent-branch-review-fanout-ace-centroid-aug22:25 — READY; NOT_SELECTED; RETRIEVAL_ACE; 3.4 If 3.2 succeeds, the operator's stated follow-on is to leave ACE degradation alone and move to wiring proof-qualified storage/GPU capabilities into the MCP Viterbi capability registry as hard executor admission masks (replacing probabilistic Viterbi weighting for those specific capabilities). Deferred — downstream of 3.2. (openspec/changes/agent-branch-review-fanout-ace-centroid-aug22/tasks.md:25)
- agent-branch-review-fanout-ace-centroid-aug22:31 — READY; NOT_SELECTED; RETRIEVAL_ACE; 4.3 The `fanout-proof-db-readiness` and `ace-centroid-alignment` branches remain unmerged, both still correctness-verified and low-risk per sections 1-2 above — the actual merge-to-`main` decision for those two specific branches is still an operator call, not made in this session. (openspec/changes/agent-branch-review-fanout-ace-centroid-aug22/tasks.md:31)
- atlas-feature-intelligence:103 — WAITING_FOR_DEPENDENCY; NOT_SELECTED; RETRIEVAL_ACE; FI-17 Materialize Qdrant feature/evidence/relationship points with canonical IDs, revisions, domains and embedding metadata. **Postgres relationship vector(768)+HNSW surface written; Qdrant/CAGRA projection pending.** (openspec/changes/atlas-feature-intelligence/tasks.md:103)
- atlas-feature-intelligence:189 — BLOCKED_BY_LINEAGE; NOT_SELECTED; RETRIEVAL_ACE; ACE packet construction produces canonical relationship IDs, typed participant roles, evidence refs, chain lineage and a sufficient-context decision. **End-to-end fixture written; execution pending.** (openspec/changes/atlas-feature-intelligence/tasks.md:189)

**WAVE-08**
- deep-audit-code-gates-aug22:3 — READY; NOT_SELECTED; GENERAL; 1.1 Exclude `scripts/api-cleanup/` (whole directory, ~2,558 stale route-file backups), `llama-cpp-turboquant-gemma4/`, `tools/agentic-research/`, `scripts/phase104-backups/`, `granite-docling-258M/` from the indexer's file inventory (`npm run index:codebase:fast` / `graphify:daily`) so raw gate counts aren't inflated by vendor/backup noise. Confirm no other backup-shaped directories exist via `find . -iname '*backup*' -maxdepth 4 -type d`. (openspec/changes/deep-audit-code-gates-aug22/tasks.md:3)
- parent-atlas-ace-rlm-bitfrost-integration:2845 — WAITING_FOR_DEPENDENCY; NOT_SELECTED; RETRIEVAL_ACE; Do not treat this reporting repair as Graphify completion; a completed receipt-bound run is (openspec/changes/parent-atlas-ace-rlm-bitfrost-integration/tasks.md:2845)
- parent-atlas-ace-rlm-bitfrost-integration:7263 — REVIEW_REQUIRED; NOT_SELECTED; RETRIEVAL_ACE; Select one real, current, revision-qualified error receipt. (openspec/changes/parent-atlas-ace-rlm-bitfrost-integration/tasks.md:7263)
- parent-atlas-ace-rlm-bitfrost-integration:7264 — REVIEW_REQUIRED; NOT_SELECTED; RETRIEVAL_ACE; Retrieve through the existing SearchRuntime and construct exact (openspec/changes/parent-atlas-ace-rlm-bitfrost-integration/tasks.md:7264)
- parent-atlas-ace-rlm-bitfrost-integration:7266 — REVIEW_REQUIRED; NOT_SELECTED; RETRIEVAL_ACE; Assemble one ACE packet/ContextManifest and nominate exactly three (openspec/changes/parent-atlas-ace-rlm-bitfrost-integration/tasks.md:7266)

**WAVE-09**
- parent-atlas-ace-rlm-bitfrost-integration:2760 — READY; NOT_SELECTED; RETRIEVAL_ACE; Treat native TensorRT-RTX and native Windows cuTile as future parity experiments, not (openspec/changes/parent-atlas-ace-rlm-bitfrost-integration/tasks.md:2760)
- parent-atlas-ace-rlm-bitfrost-integration:7458 — REVIEW_REQUIRED; NOT_SELECTED; RETRIEVAL_ACE; Rebuild/restart and re-run the readiness audit only with explicit runtime (openspec/changes/parent-atlas-ace-rlm-bitfrost-integration/tasks.md:7458)
- parent-atlas-ace-rlm-bitfrost-integration:7476 — REVIEW_REQUIRED; NOT_SELECTED; RETRIEVAL_ACE; Native `.venv` PyTorch reports `2.8.0+cu128` but (openspec/changes/parent-atlas-ace-rlm-bitfrost-integration/tasks.md:7476)
- parent-atlas-ace-rlm-bitfrost-integration:9117 — REVIEW_REQUIRED; NOT_SELECTED; RETRIEVAL_ACE; Keep live accelerator admission separate from dry-run safety. Do not (openspec/changes/parent-atlas-ace-rlm-bitfrost-integration/tasks.md:9117)
- parent-atlas-ace-rlm-bitfrost-integration:9136 — REVIEW_REQUIRED; NOT_SELECTED; RETRIEVAL_ACE; Keep cuVS/CUDA execution and GPU ordinal parity blocked until the 8098 (openspec/changes/parent-atlas-ace-rlm-bitfrost-integration/tasks.md:9136)

**WAVE-10**
- atlas-feature-intelligence:188 — AUTHORIZATION_REQUIRED; NOT_SELECTED; GENERAL; Dynamic SQL hyperedges cannot enter canonical relationship tables without promotion review. (openspec/changes/atlas-feature-intelligence/tasks.md:188)
- parent-atlas-ace-bitfrost-cache-correctness:663 — AUTHORIZATION_REQUIRED; NOT_SELECTED; RETRIEVAL_ACE; Current graph promotion remains blocked: the graph readiness audit reports `16` (openspec/changes/parent-atlas-ace-bitfrost-cache-correctness/tasks.md:663)
- parent-atlas-ace-rlm-bitfrost-integration:6765 — REVIEW_REQUIRED; NOT_SELECTED; RETRIEVAL_ACE; Do not promote the sprite/evaluation artifacts from their local (openspec/changes/parent-atlas-ace-rlm-bitfrost-integration/tasks.md:6765)
- parent-atlas-ace-rlm-bitfrost-integration:7312 — REVIEW_REQUIRED; NOT_SELECTED; RETRIEVAL_ACE; Add a read-only integration evaluator and receipt compiler before any (openspec/changes/parent-atlas-ace-rlm-bitfrost-integration/tasks.md:7312)
- parent-atlas-ace-rlm-bitfrost-integration:7314 — REVIEW_REQUIRED; NOT_SELECTED; RETRIEVAL_ACE; Run OpenSpec strict validation and focused contract tests for the (openspec/changes/parent-atlas-ace-rlm-bitfrost-integration/tasks.md:7314)

## Permanent acceptance invariants

- **INVARIANT** [parent-atlas-neural-prefill-encoder](openspec/changes/parent-atlas-neural-prefill-encoder/tasks.md#L3728) No canonical identity or source data changes during dry-run/training. — last updated 2026-09-20T07:24:51.094Z (FILESYSTEM_MTIME); ETA N/A
- **INVARIANT** [parent-atlas-neural-prefill-encoder](openspec/changes/parent-atlas-neural-prefill-encoder/tasks.md#L3729) No projection occurs while model, identity, or parity gates fail. — last updated 2026-09-20T07:24:51.094Z (FILESYSTEM_MTIME); ETA N/A

## Critical-path change frontiers

- Frontier rows are advisory recommendations only. `schedulerPermission=SELECTED` is granted only from an explicit selection file; READY/ADVANCEABLE never selects work.
- [ ] **P10** [parent-atlas-retrieval-lineage-dag-convergence](openspec/changes/parent-atlas-retrieval-lineage-dag-convergence/tasks.md#L1569) PROMOTION-01 — Keep source lineage, graph identity, feature layout, — lane RETRIEVAL_ACE; last updated 2026-09-26T21:32:32.634Z (FILESYSTEM_MTIME); ETA UNKNOWN
- [ ] **P20** [parent-atlas-gate2-chunk-lineage-convergence](openspec/changes/parent-atlas-gate2-chunk-lineage-convergence/tasks.md#L36) 2.1 Present the fresh snapshot's readback-proven receipt to the operator and request — lane GENERAL; last updated 2026-09-18T02:06:04.587Z (FILESYSTEM_MTIME); ETA UNKNOWN
- [ ] **P10** [parent-atlas-graph-retrieval-proof](openspec/changes/parent-atlas-graph-retrieval-proof/tasks.md#L39) Define separate contracts for `parse_node_id`, `symbol_id`, `symbol_version_id`, `chunk_id`, `packet_key`, `concept_id`, and `graph_node_key`. — lane RETRIEVAL_ACE; last updated 2026-09-24T20:54:51.746Z (FILESYSTEM_MTIME); ETA UNKNOWN
- [ ] **P10** [parent-atlas-prefill-routing-residency-convergence](openspec/changes/parent-atlas-prefill-routing-residency-convergence/tasks.md#L307) ANN-03 Require the same semantic_768 matrix and identity manifest across Qdrant/cuVS. — lane RETRIEVAL_ACE; last updated 2026-09-19T19:45:04.879Z (FILESYSTEM_MTIME); ETA UNKNOWN

## Parallel proof frontiers

- [ ] **P10** [parent-atlas-candidate-feature-execution-fabric](openspec/changes/parent-atlas-candidate-feature-execution-fabric/tasks.md#L211) FANOUT-01 Normalize all semantic results to CandidateOrdinal before feature fanout. — lane GENERAL; last updated 2026-09-28T17:15:24.928Z (FILESYSTEM_MTIME); ETA UNKNOWN
- [ ] **P10** [parent-atlas-ace-rlm-bitfrost-integration](openspec/changes/parent-atlas-ace-rlm-bitfrost-integration/tasks.md#L2897) Add a revision-qualified centroid manifest/pointer and pass identity before enabling — lane RETRIEVAL_ACE; last updated 2026-09-28T17:10:36.691Z (FILESYSTEM_MTIME); ETA UNKNOWN
- [ ] **P10** [parent-atlas-native-acceleration-cabi](openspec/changes/parent-atlas-native-acceleration-cabi/tasks.md#L12) P0.2 Add canonical identity join in `hydrate-candidates.ts` (symbol-tree / atlas_packets source — current SQL selects only `codebase_chunk_index`; the "optional atlas_packets join" comment has no join) — lane GENERAL; last updated 2026-09-28T02:45:39.086Z (FILESYSTEM_MTIME); ETA UNKNOWN
- [ ] **P10** [parent-atlas-repair-candidate-feature-matrix](openspec/changes/parent-atlas-repair-candidate-feature-matrix/tasks.md#L213) **CEI-16b-02 SOURCE-CHUNK-ADMISSION**: select exactly one canonical `codebase_chunk_index.content_embedding` writer. Require one current `atlas_workspace_source_bindings` tuple and proven `atlas_packet_chunk_lineage` (`chunk_row_id`, `canonical_chunk_id`, `source_ref`, `source_revision`, exact workspace revision) for every selected chunk; require full-file source digest agreement; ambiguous/missing evidence blocks the row. Add mock/repository tests and a bounded read-only live replay. — lane RETRIEVAL_ACE; last updated 2026-09-28T02:28:21.702Z (FILESYSTEM_MTIME); ETA UNKNOWN
- [ ] **P10** [parent-atlas-retrieval-executor-compatibility-convergence](openspec/changes/parent-atlas-retrieval-executor-compatibility-convergence/tasks.md#L10) 2.2 Add a lexical PostgreSQL read-only replay test covering tsvector/GIN results, source-revision filters, and stable evidence metadata. Read-only proof added at `scripts/atlas/prove-postgres-fts-replay-v1.mjs`; it must remain open until the live replay returns revision-qualified rows rather than only unqualified FTS hits. Receipt: `docs/reports/postgres-fts-replay-v1.json`. — lane RETRIEVAL_ACE; last updated 2026-09-28T02:16:19.937Z (FILESYSTEM_MTIME); ETA UNKNOWN
- [ ] **P10** [parent-atlas-ontology-kernel](openspec/changes/parent-atlas-ontology-kernel/tasks.md#L2703) Firecrawl capture identity, content hash, evidence revision, and `.okf` — lane GENERAL; last updated 2026-09-28T01:55:26.414Z (FILESYSTEM_MTIME); ETA UNKNOWN
- [ ] **P10** [parent-atlas-nlp-sidecar-feature-compiler](openspec/changes/parent-atlas-nlp-sidecar-feature-compiler/tasks.md#L777) 14.3a Emit `AstUnit` from treesitter-chunker into `atlas_ast_nodes` with `source_revision`+`workspace_id` on every row, and add a real-file `fixtureVerified` proof (health reports `fixtureVerified:false`); links tasks 2.1/2.2. — lane RETRIEVAL_ACE; last updated 2026-09-28T01:43:49.407Z (FILESYSTEM_MTIME); ETA UNKNOWN
- [ ] **P10** [parent-atlas-semantic-768-canonical-contract](openspec/changes/parent-atlas-semantic-768-canonical-contract/tasks.md#L862) Reconcile one source/revision-qualified representation owner against the — lane GENERAL; last updated 2026-09-28T01:30:08.711Z (FILESYSTEM_MTIME); ETA UNKNOWN
- [ ] **P10** [parent-atlas-workboard-feature-utility-fabric](openspec/changes/parent-atlas-workboard-feature-utility-fabric/tasks.md#L121) **WFU-04b** rg evidence resolves `sourceRef`; a real current ast-grep observation resolves through the WFU-04a resolver against an admitted same-revision AST candidate set with live readback (reuse `AstGrepObservationV1`; do NOT use `atlas_callable_search` as the resolver). Still open: the current observation stream and the AST snapshot cover disjoint files, so no live observation has been resolved. **Partial implementation proof (2026-09-23):** `packages/parent-atlas/src/core/ast-grep-tree-node-resolution-v1.ts` now resolves only an exact `(source_ref, source_revision, byte_start, byte_end)` match against supplied `atlas_ast_nodes` rows; path/revision/span mismatch and duplicate candidates remain explicit non-ID outcomes. Six focused tests/build pass. Live read-only census: 11,273 AST rows, only 98 with `sha256:` source revisions; those 98 have unique exact location keys. This does not yet prove a real current ast-grep observation matches an admitted workspace frame, and rg’s workspace-relative `sourceRef` is not by itself canonical source authority. Keep this task open until a same-source-revision extracted observation is read through the resolver with exact live readback; do not use the sparse `atlas_callable_search` projection as a substitute. — lane RETRIEVAL_ACE; last updated 2026-09-28T00:17:41.718Z (FILESYSTEM_MTIME); ETA UNKNOWN
- [ ] **P10** [parent-atlas-okf-knowledge-layers](openspec/changes/parent-atlas-okf-knowledge-layers/tasks.md#L426) If later approved, expose the reviewed registry through the existing Admin Unified Indexing Studio as a read-only inspector first. A Pokédex-like display is an ordinal/hex UI metaphor only; do not copy Pokémon source/assets or use display numbers as identity. — lane GENERAL; last updated 2026-09-28T00:17:41.561Z (FILESYSTEM_MTIME); ETA UNKNOWN
- [ ] **P10** [parent-atlas-memory-architecture-freeze](openspec/changes/parent-atlas-memory-architecture-freeze/tasks.md#L267) 5.4 Not built: `OrnithPrefixIdentityV1` (checksum-bound llama.cpp prefix-cache identity — — lane GENERAL; last updated 2026-09-28T00:17:41.435Z (FILESYSTEM_MTIME); ETA UNKNOWN
- [ ] **P10** [parent-atlas-graph-runtime-python-consolidation](openspec/changes/parent-atlas-graph-runtime-python-consolidation/tasks.md#L270) **GPU-FABRIC-AUDIT:** still open until a single frozen CandidateOrdinal — lane GENERAL; last updated 2026-09-28T00:17:41.421Z (FILESYSTEM_MTIME); ETA UNKNOWN
- [ ] **P10** [parent-atlas-compute-rank-cache-eval-dspy-gepa](openspec/changes/parent-atlas-compute-rank-cache-eval-dspy-gepa/tasks.md#L17) Prove canonical identity round-trip: candidate -> packetKey/canonicalId -> FeatureRowV1 -> exact evidence. — lane GENERAL; last updated 2026-09-28T00:17:41.349Z (FILESYSTEM_MTIME); ETA UNKNOWN
- [ ] **P10** [parent-atlas-best-fit-score-fabric](openspec/changes/parent-atlas-best-fit-score-fabric/tasks.md#L1216) **Context-prefix cache wiring and measurement**: connect the proven identity to the existing — lane GENERAL; last updated 2026-09-28T00:17:41.292Z (FILESYSTEM_MTIME); ETA UNKNOWN
- [ ] **P10** [parent-atlas-agentic-file-compiler](openspec/changes/parent-atlas-agentic-file-compiler/tasks.md#L53) AFC-14B-02 Prove one authenticated live request using an owner-produced packet-key CandidateOrdinal snapshot, admitted ContextManifestV2, and PromptPlanV1 through the Mastra route; preserve the exact loaded model ID and record immutable model-artifact provenance if the endpoint exposes it. No candidate selection or identity interpretation may move into Mastra. Until this receipt exists, application runtime execution is not live-proven. — lane RETRIEVAL_ACE; last updated 2026-09-28T00:17:41.249Z (FILESYSTEM_MTIME); ETA UNKNOWN
- [ ] **P10** [parent-atlas-code-intel-e2e](openspec/changes/parent-atlas-code-intel-e2e/tasks.md#L8) **SOURCE-SYMBOL-AUTHORITY-01** — Close current-source → symbol-version ownership. Foundation — lane GENERAL; last updated 2026-09-27T23:15:40.425Z (FILESYSTEM_MTIME); ETA UNKNOWN
- [ ] **P10** [parent-atlas-kv-cache-adaptation-research](openspec/changes/parent-atlas-kv-cache-adaptation-research/tasks.md#L8) ORNITH-CACHE-02 measure only server-managed prefix reuse against PrefixIdentityV1: — lane GENERAL; last updated 2026-09-27T06:29:06.729Z (FILESYSTEM_MTIME); ETA UNKNOWN
- [ ] **P10** [parent-atlas-code-ingestion-pipeline](openspec/changes/parent-atlas-code-ingestion-pipeline/tasks.md#L80) **GPH-05** Ownership proof — enumerate AST/symbol extraction paths and establish the sole canonical production owner, identity/revision semantics, consumers, persistence, fallback, and lifecycle evidence. 2026-09-24 read-only result: `GPH_05_OWNER_PARTIAL`; see `docs/reports/ast-ownership-gph05-v1.md`. No lifecycle or runtime behavior changed. — lane GENERAL; last updated 2026-09-25T00:16:58.052Z (FILESYSTEM_MTIME); ETA UNKNOWN
- [ ] **P10** [parent-atlas-transport-memory-boundaries](openspec/changes/parent-atlas-transport-memory-boundaries/tasks.md#L12) **ACP-02B** Wire the ACP ingress caller to resolve the canonical task attempt, ContextManifest checksum, and ExecutionReceipt from their existing owners, then prove a bounded end-to-end mapping/readback. ACP must not own graph identity. — lane RETRIEVAL_ACE; last updated 2026-09-24T22:23:17.761Z (FILESYSTEM_MTIME); ETA UNKNOWN
- [ ] **P10** [parent-atlas-retrieval-lod-algorithm-taxonomy](openspec/changes/parent-atlas-retrieval-lod-algorithm-taxonomy/tasks.md#L189) **LOD-02** Freeze `SemanticSnapshotV1` plus ordinal/canonical identity mapping as the immutable source: workspace/source/representation/ordinal-map revisions, rows, dimension 768, float32, normalization, ordinal, `packet_key`, optional `symbol_version_id`, and checksum. LOD transitions may evict/reload derived indexes but may not delete or rewrite canonical truth. Prefer Arrow IPC/mmap for direct tensor access; do not substitute Parquet where direct mmap is required. — lane RETRIEVAL_ACE; last updated 2026-09-24T16:59:45.680Z (FILESYSTEM_MTIME); ETA UNKNOWN
- [ ] **P10** [atlas-feature-intelligence](openspec/changes/atlas-feature-intelligence/tasks.md#L138) Canonical identity survives path/cluster/projection changes in live Postgres readback. — lane GENERAL; last updated 2026-09-23T02:51:11.032Z (FILESYSTEM_MTIME); ETA UNKNOWN
- [ ] **P10** [parent-atlas-ace-bitfrost-cache-correctness](openspec/changes/parent-atlas-ace-bitfrost-cache-correctness/tasks.md#L370) **CACHE-RETRIEVAL-IDENTITY-03** — Update all callers, including the MCP trace route and — lane RETRIEVAL_ACE; last updated 2026-09-23T02:30:51.938Z (FILESYSTEM_MTIME); ETA UNKNOWN
- [ ] **P10** [parent-atlas-retrieval-logic-convergence](openspec/changes/parent-atlas-retrieval-logic-convergence/tasks.md#L325) **CONTEXT-HANDOFF-02 — Preserve deterministic prefill identity.** Continue — lane RETRIEVAL_ACE; last updated 2026-09-21T19:03:38.864Z (FILESYSTEM_MTIME); ETA UNKNOWN
- [ ] **P10** [parent-atlas-topology-representation-admission](openspec/changes/parent-atlas-topology-representation-admission/tasks.md#L44) TOPO-02A Replace the latent writer's fallback identity/update path with — lane RETRIEVAL_ACE; last updated 2026-09-21T19:03:38.665Z (FILESYSTEM_MTIME); ETA UNKNOWN
- [ ] **P10** [parent-atlas-gpu-graph-vector-substrate](openspec/changes/parent-atlas-gpu-graph-vector-substrate/tasks.md#L47) 2.1 Canonical identity — confirm/fix the single identity join every retrieval — lane RETRIEVAL_ACE; last updated 2026-09-21T19:03:38.638Z (FILESYSTEM_MTIME); ETA UNKNOWN
- [ ] **P10** [parent-atlas-retrieval-fusion-reachability](openspec/changes/parent-atlas-retrieval-fusion-reachability/tasks.md#L1591) Add or expose the canonical identity envelope at the caller boundary, — lane RETRIEVAL_ACE; last updated 2026-09-21T19:03:38.612Z (FILESYSTEM_MTIME); ETA UNKNOWN
- [ ] **P10** [parent-atlas-pca-svd-representation-baseline](openspec/changes/parent-atlas-pca-svd-representation-baseline/tasks.md#L149) 3.1c **Define the symbol-identity contract in one place** (OpenSpec/spec, no code): confirm or amend the three — lane RETRIEVAL_ACE; last updated 2026-09-21T19:03:38.586Z (FILESYSTEM_MTIME); ETA UNKNOWN
- [ ] **P10** [parent-atlas-gpu-sidecar-patch-tournament](openspec/changes/parent-atlas-gpu-sidecar-patch-tournament/tasks.md#L209) CAGRA endpoint (`POST /v1/knn/cagra`) with the same bounded identity manifest — tiny-fixture runtime and exact-oracle Recall@3 are proven, but production remains **quarantined** because larger-corpus recall, filter parity, revision swaps, fallback, and promotion approval are open. `RAPIDS_CAGRA_ENDPOINT: RUNTIME_PROVEN_ON_TINY_FIXTURE; PRODUCTION_QUARANTINED`. — lane GENERAL; last updated 2026-09-21T06:00:14.786Z (FILESYSTEM_MTIME); ETA UNKNOWN
- [ ] **P10** [parent-atlas-canonical-directory-ingestion-fabric](openspec/changes/parent-atlas-canonical-directory-ingestion-fabric/tasks.md#L69) **DIR-INDEX-04E** Add lexical fixtures for exact path, heading, symbol, body, tag/concept, and typo/substring cases with canonical candidate identity readback. — lane GENERAL; last updated 2026-09-21T00:42:48.726Z (FILESYSTEM_MTIME); ETA UNKNOWN
- [ ] **P10** [parent-atlas-neural-prefill-encoder](openspec/changes/parent-atlas-neural-prefill-encoder/tasks.md#L527) **SOURCE-REVISION-CANARY-01 — Persist one approved Graphify canary.** — lane GENERAL; last updated 2026-09-20T07:24:51.094Z (FILESYSTEM_MTIME); ETA UNKNOWN
- [ ] **P10** [parent-atlas-search-classifier-sidecar](openspec/changes/parent-atlas-search-classifier-sidecar/tasks.md#L571) The probe returned `source_revision="unknown"` and no grounded entities; — lane GENERAL; last updated 2026-09-18T00:47:30.906Z (FILESYSTEM_MTIME); ETA UNKNOWN
- [ ] **P10** [parent-atlas-query-routing-classifier](openspec/changes/parent-atlas-query-routing-classifier/tasks.md#L197) Require no canonical identity changes. — lane GENERAL; last updated 2026-09-14T01:40:58.004Z (FILESYSTEM_MTIME); ETA UNKNOWN
- [ ] **P10** [parent-atlas-telemetry-lowrank-recommendation-okf-integration](openspec/changes/parent-atlas-telemetry-lowrank-recommendation-okf-integration/tasks.md#L84) Record domain classification as a lineage-linked navigation surface, not canonical identity. — lane RESEARCH_CHALLENGER_EWIN_TANG; last updated 2026-09-07T16:46:55.636Z (FILESYSTEM_MTIME); ETA UNKNOWN
- [ ] **P10** [parent-atlas-governed-compute-fabric](openspec/changes/parent-atlas-governed-compute-fabric/tasks.md#L103) 2.2 Finalize `AtlasKernelSessionV1` identity: `sessionId`, kernel/environment — lane GENERAL; last updated 2026-09-05T22:34:04.227Z (FILESYSTEM_MTIME); ETA UNKNOWN
- [ ] **P10** [parent-atlas-semantic-512-canonicalization](openspec/changes/parent-atlas-semantic-512-canonicalization/tasks.md#L177) S512-16 — Exact promotion proves **current** source span + Tree-sitter structural identity + compiler-semantic evidence and resolves UNKNOWN freshness before LLM synthesis. — lane GENERAL; last updated 2026-08-31T20:24:09.902Z (FILESYSTEM_MTIME); ETA UNKNOWN
- [ ] **P10** [parent-atlas-branch-merge-consolidation-aug20](openspec/changes/parent-atlas-branch-merge-consolidation-aug20/tasks.md#L125) `cross_store_identity_verifier.ts` — lane GENERAL; last updated 2026-08-20T23:13:34.911Z (FILESYSTEM_MTIME); ETA UNKNOWN
- [ ] **P10** [parent-atlas-unordered-execution-contract](openspec/changes/parent-atlas-unordered-execution-contract/tasks.md#L33) 0A.4 After refresh, freeze `workspace_revision`, `source_revision`, — lane RETRIEVAL_ACE; last updated 2026-08-10T02:47:35.235Z (FILESYSTEM_MTIME); ETA UNKNOWN
- [ ] **P20** [parent-atlas-policy-routing-integration](openspec/changes/parent-atlas-policy-routing-integration/tasks.md#L120) canonical reducer -> rerank/ACE -> model if needed -> compile/test -> RouteTrace — lane RETRIEVAL_ACE; last updated 2026-09-28T02:12:44.099Z (FILESYSTEM_MTIME); ETA UNKNOWN
- [ ] **P20** [parent-atlas-pass-fabric](openspec/changes/parent-atlas-pass-fabric/tasks.md#L1176) LEXICAL-PASS-WRITER-01D — run bounded live readback/idempotency proof — lane GENERAL; last updated 2026-09-28T02:01:50.856Z (FILESYSTEM_MTIME); ETA UNKNOWN
- [ ] **P20** [parent-atlas-onnx-webgpu-embedding-promotion](openspec/changes/parent-atlas-onnx-webgpu-embedding-promotion/tasks.md#L94) **10. Scale 15 → 128 → 768 row parity benchmark** before any eligibility/primary-lane — lane GENERAL; last updated 2026-09-28T00:17:41.581Z (FILESYSTEM_MTIME); ETA UNKNOWN
- [ ] **P20** [parent-atlas-multi-agent-wave-plan](openspec/changes/parent-atlas-multi-agent-wave-plan/tasks.md#L157) 3.11 **Worker K — Ingestion/lineage critical path.** Owns: — lane GENERAL; last updated 2026-09-27T10:11:31.796Z (FILESYSTEM_MTIME); ETA UNKNOWN
- [ ] **P20** [parent-atlas-graphify-recovery-proof-ladder](openspec/changes/parent-atlas-graphify-recovery-proof-ladder/tasks.md#L569) Prove a bounded apply run against the same sample and verify readback / edge counts / — lane GENERAL; last updated 2026-09-24T22:12:03.650Z (FILESYSTEM_MTIME); ETA UNKNOWN
- [ ] **P20** [parent-atlas-document-governance-master-index](openspec/changes/parent-atlas-document-governance-master-index/tasks.md#L69) 5.5 Add contradiction validation against active `CLAUDE.md`, canonical OpenSpec specs, representation manifests, and current architecture contracts. — lane GENERAL; last updated 2026-09-24T01:21:11.534Z (FILESYSTEM_MTIME); ETA UNKNOWN
- [ ] **P20** [parent-atlas-tensor-residency-integration](openspec/changes/parent-atlas-tensor-residency-integration/tasks.md#L32) T2-lineage `FeatureSourceManifest`: prove a live source column exists for each of the 5 — lane GENERAL; last updated 2026-09-23T18:01:28.100Z (FILESYSTEM_MTIME); ETA UNKNOWN
- [ ] **P20** [manual-migration-reconciliation](openspec/changes/manual-migration-reconciliation/tasks.md#L243) Resolve lineage/structural/semantic migration ownership row-by-row; — lane GENERAL; last updated 2026-09-23T03:42:06.872Z (FILESYSTEM_MTIME); ETA UNKNOWN
- [ ] **P20** [parent-atlas-agentic-repair-bundle-integration](openspec/changes/parent-atlas-agentic-repair-bundle-integration/tasks.md#L135) Confirm RF6's canonical-owner decision (Option A: Qdrant-owns-fusion, or Option B: — lane RETRIEVAL_ACE; last updated 2026-09-23T02:15:21.142Z (FILESYSTEM_MTIME); ETA UNKNOWN
- [ ] **P20** [parent-atlas-deep-research-ingestion](openspec/changes/parent-atlas-deep-research-ingestion/tasks.md#L86) DISCOVERY-04B live handoff readback — exercise the existing acquisition and DOC-06A owners — lane GENERAL; last updated 2026-09-23T00:06:07.469Z (FILESYSTEM_MTIME); ETA UNKNOWN
- [ ] **P20** [parent-atlas-rrf-fusion-consolidation](openspec/changes/parent-atlas-rrf-fusion-consolidation/tasks.md#L112) 3.1 For each non-`CANONICAL_OWNER` primitive: migrate its callers, formally designate it a — lane GENERAL; last updated 2026-09-21T17:31:58.357Z (FILESYSTEM_MTIME); ETA UNKNOWN
- [ ] **P20** [parent-atlas-workstation-domain-classifier](openspec/changes/parent-atlas-workstation-domain-classifier/tasks.md#L342) Revision-qualified HyperRAG cache admission and live MCP/API readback — lane GENERAL; last updated 2026-09-20T06:49:07.944Z (FILESYSTEM_MTIME); ETA UNKNOWN
- [ ] **P20** [local-llm-offload-ownership](openspec/changes/local-llm-offload-ownership/tasks.md#L260) Old-alias vs canonical-name **output** parity is guaranteed by shared implementation — lane GENERAL; last updated 2026-09-19T23:49:54.428Z (FILESYSTEM_MTIME); ETA UNKNOWN

## Change execution states

- [ace-hyperrag-chr97-graphify-audit](openspec/changes/ace-hyperrag-chr97-graphify-audit/) — **COMPLETE**; 0 actionable, 0 waiting, 0 superseded/historical; raw progress [##########] 7/7
- [agent-branch-review-fanout-ace-centroid-aug22](openspec/changes/agent-branch-review-fanout-ace-centroid-aug22/) — **ADVANCEABLE**; 3 actionable, 0 waiting, 0 superseded/historical; raw progress [#########-] 17/20
- [atlas-feature-intelligence](openspec/changes/atlas-feature-intelligence/) — **MIXED_ACTIONABLE_AND_WAITING**; 37 actionable, 15 waiting, 1 superseded/historical; raw progress [###-------] 27/80
- [codereview-inference-wiring-followup-aug22](openspec/changes/codereview-inference-wiring-followup-aug22/) — **COMPLETE**; 0 actionable, 0 waiting, 0 superseded/historical; raw progress [##########] 10/10
- [codereview-semantic-dimension-regression-aug22](openspec/changes/codereview-semantic-dimension-regression-aug22/) — **COMPLETE**; 0 actionable, 0 waiting, 0 superseded/historical; raw progress [##########] 12/12
- [deep-audit-code-gates-aug22](openspec/changes/deep-audit-code-gates-aug22/) — **MIXED_ACTIONABLE_AND_WAITING**; 11 actionable, 1 waiting, 0 superseded/historical; raw progress [######----] 16/28
- [docker-compose-duplication-remediation](openspec/changes/docker-compose-duplication-remediation/) — **COMPLETE**; 0 actionable, 0 waiting, 0 superseded/historical; raw progress [##########] 9/9
- [feature-label-semantic-derivation](openspec/changes/feature-label-semantic-derivation/) — **COMPLETE**; 0 actionable, 0 waiting, 0 superseded/historical; raw progress [##########] 3/3
- [inference-wiring-deep-audit-aug22](openspec/changes/inference-wiring-deep-audit-aug22/) — **COMPLETE**; 0 actionable, 0 waiting, 0 superseded/historical; raw progress [##########] 56/56
- [local-llm-offload-ownership](openspec/changes/local-llm-offload-ownership/) — **MIXED_ACTIONABLE_AND_WAITING**; 18 actionable, 1 waiting, 0 superseded/historical; raw progress [#######---] 43/62
- [manual-migration-reconciliation](openspec/changes/manual-migration-reconciliation/) — **MIXED_ACTIONABLE_AND_WAITING**; 21 actionable, 5 waiting, 0 superseded/historical; raw progress [########--] 84/110
- [parent-atlas-ace-bitfrost-cache-correctness](openspec/changes/parent-atlas-ace-bitfrost-cache-correctness/) — **MIXED_ACTIONABLE_AND_WAITING**; 28 actionable, 5 waiting, 0 superseded/historical; raw progress [######----] 56/89
- [parent-atlas-ace-rlm-bitfrost-integration](openspec/changes/parent-atlas-ace-rlm-bitfrost-integration/) — **MIXED_ACTIONABLE_AND_WAITING**; 127 actionable, 90 waiting, 4 superseded/historical; raw progress [########--] 712/933
- [parent-atlas-adaptive-dag-fabric](openspec/changes/parent-atlas-adaptive-dag-fabric/) — **MIXED_ACTIONABLE_AND_WAITING**; 1 actionable, 1 waiting, 0 superseded/historical; raw progress [########--] 11/13
- [parent-atlas-agentic-completion](openspec/changes/parent-atlas-agentic-completion/) — **ADVANCEABLE**; 1 actionable, 0 waiting, 0 superseded/historical; raw progress [#########-] 10/11
- [parent-atlas-agentic-file-compiler](openspec/changes/parent-atlas-agentic-file-compiler/) — **MIXED_ACTIONABLE_AND_WAITING**; 16 actionable, 6 waiting, 0 superseded/historical; raw progress [#######---] 56/78
- [parent-atlas-agentic-repair-bundle-integration](openspec/changes/parent-atlas-agentic-repair-bundle-integration/) — **MIXED_ACTIONABLE_AND_WAITING**; 44 actionable, 13 waiting, 1 superseded/historical; raw progress [###-------] 26/84
- [parent-atlas-agentic-repair-fabric](openspec/changes/parent-atlas-agentic-repair-fabric/) — **ADVANCEABLE**; 1 actionable, 0 waiting, 0 superseded/historical; raw progress [##########] 37/38
- [parent-atlas-agentic-run-receipt-binding](openspec/changes/parent-atlas-agentic-run-receipt-binding/) — **COMPLETE**; 0 actionable, 0 waiting, 0 superseded/historical; raw progress [##########] 16/16
- [parent-atlas-analysis-pass-ornith-adapter](openspec/changes/parent-atlas-analysis-pass-ornith-adapter/) — **ADVANCEABLE**; 1 actionable, 0 waiting, 0 superseded/historical; raw progress [##########] 24/25
- [parent-atlas-autoresearch-fabric](openspec/changes/parent-atlas-autoresearch-fabric/) — **COMPLETE**; 0 actionable, 0 waiting, 0 superseded/historical; raw progress [##########] 8/8
- [parent-atlas-best-fit-score-fabric](openspec/changes/parent-atlas-best-fit-score-fabric/) — **MIXED_ACTIONABLE_AND_WAITING**; 190 actionable, 83 waiting, 3 superseded/historical; raw progress [######----] 406/682
- [parent-atlas-branch-merge-consolidation-aug20](openspec/changes/parent-atlas-branch-merge-consolidation-aug20/) — **ADVANCEABLE**; 17 actionable, 0 waiting, 0 superseded/historical; raw progress [#####-----] 18/35
- [parent-atlas-candidate-feature-execution-fabric](openspec/changes/parent-atlas-candidate-feature-execution-fabric/) — **MIXED_ACTIONABLE_AND_WAITING**; 65 actionable, 33 waiting, 3 superseded/historical; raw progress [#######---] 257/358
- [parent-atlas-canonical-directory-ingestion-fabric](openspec/changes/parent-atlas-canonical-directory-ingestion-fabric/) — **ADVANCEABLE**; 44 actionable, 0 waiting, 1 superseded/historical; raw progress [###-------] 21/66
- [parent-atlas-chunk-index-whole-file-hash](openspec/changes/parent-atlas-chunk-index-whole-file-hash/) — **COMPLETE**; 0 actionable, 0 waiting, 0 superseded/historical; raw progress [##########] 17/17
- [parent-atlas-code-ingestion-pipeline](openspec/changes/parent-atlas-code-ingestion-pipeline/) — **ADVANCEABLE**; 5 actionable, 0 waiting, 4 superseded/historical; raw progress [#######---] 26/35
- [parent-atlas-code-intel-e2e](openspec/changes/parent-atlas-code-intel-e2e/) — **ADVANCEABLE**; 5 actionable, 0 waiting, 0 superseded/historical; raw progress [----------] 0/5
- [parent-atlas-compiler-semantic-graph-resolution](openspec/changes/parent-atlas-compiler-semantic-graph-resolution/) — **MIXED_ACTIONABLE_AND_WAITING**; 15 actionable, 3 waiting, 0 superseded/historical; raw progress [#######---] 40/58
- [parent-atlas-compute-rank-cache-eval-dspy-gepa](openspec/changes/parent-atlas-compute-rank-cache-eval-dspy-gepa/) — **MIXED_ACTIONABLE_AND_WAITING**; 42 actionable, 8 waiting, 1 superseded/historical; raw progress [###-------] 22/73
- [parent-atlas-deep-research-ingestion](openspec/changes/parent-atlas-deep-research-ingestion/) — **ADVANCEABLE**; 1 actionable, 0 waiting, 0 superseded/historical; raw progress [#########-] 6/7
- [parent-atlas-document-governance-master-index](openspec/changes/parent-atlas-document-governance-master-index/) — **MIXED_ACTIONABLE_AND_WAITING**; 4 actionable, 4 waiting, 4 superseded/historical; raw progress [########--] 52/64
- [parent-atlas-error-embedding-768-migration](openspec/changes/parent-atlas-error-embedding-768-migration/) — **ADVANCEABLE**; 13 actionable, 0 waiting, 0 superseded/historical; raw progress [#####-----] 12/25
- [parent-atlas-gate2-chunk-lineage-convergence](openspec/changes/parent-atlas-gate2-chunk-lineage-convergence/) — **MIXED_ACTIONABLE_AND_WAITING**; 16 actionable, 1 waiting, 0 superseded/historical; raw progress [##--------] 3/20
- [parent-atlas-governed-compute-fabric](openspec/changes/parent-atlas-governed-compute-fabric/) — **MIXED_ACTIONABLE_AND_WAITING**; 149 actionable, 7 waiting, 0 superseded/historical; raw progress [----------] 2/158
- [parent-atlas-gpu-graph-vector-substrate](openspec/changes/parent-atlas-gpu-graph-vector-substrate/) — **MIXED_ACTIONABLE_AND_WAITING**; 24 actionable, 1 waiting, 0 superseded/historical; raw progress [#---------] 2/27
- [parent-atlas-gpu-prellm-recommendation-v1](openspec/changes/parent-atlas-gpu-prellm-recommendation-v1/) — **ADVANCEABLE**; 2 actionable, 0 waiting, 0 superseded/historical; raw progress [#########-] 35/37
- [parent-atlas-gpu-runtime-abi-alignment](openspec/changes/parent-atlas-gpu-runtime-abi-alignment/) — **MIXED_ACTIONABLE_AND_WAITING**; 4 actionable, 1 waiting, 0 superseded/historical; raw progress [########--] 17/22
- [parent-atlas-gpu-sidecar-patch-tournament](openspec/changes/parent-atlas-gpu-sidecar-patch-tournament/) — **MIXED_ACTIONABLE_AND_WAITING**; 51 actionable, 7 waiting, 3 superseded/historical; raw progress [##--------] 17/78
- [parent-atlas-graph-analysis-contract](openspec/changes/parent-atlas-graph-analysis-contract/) — **MIXED_ACTIONABLE_AND_WAITING**; 20 actionable, 2 waiting, 0 superseded/historical; raw progress [#######---] 62/84
- [parent-atlas-graph-pagerank-okf-fanout-hardening](openspec/changes/parent-atlas-graph-pagerank-okf-fanout-hardening/) — **COMPLETE**; 0 actionable, 0 waiting, 0 superseded/historical; raw progress [##########] 4/4
- [parent-atlas-graph-retrieval-proof](openspec/changes/parent-atlas-graph-retrieval-proof/) — **MIXED_ACTIONABLE_AND_WAITING**; 114 actionable, 9 waiting, 2 superseded/historical; raw progress [######----] 160/285
- [parent-atlas-graph-runtime-enhancement](openspec/changes/parent-atlas-graph-runtime-enhancement/) — **MIXED_ACTIONABLE_AND_WAITING**; 4 actionable, 1 waiting, 0 superseded/historical; raw progress [####------] 3/8
- [parent-atlas-graph-runtime-python-consolidation](openspec/changes/parent-atlas-graph-runtime-python-consolidation/) — **MIXED_ACTIONABLE_AND_WAITING**; 7 actionable, 1 waiting, 0 superseded/historical; raw progress [#######---] 20/28
- [parent-atlas-graph-validation-fabric](openspec/changes/parent-atlas-graph-validation-fabric/) — **MIXED_ACTIONABLE_AND_WAITING**; 18 actionable, 15 waiting, 0 superseded/historical; raw progress [######----] 61/94
- [parent-atlas-graphify-recovery-proof-ladder](openspec/changes/parent-atlas-graphify-recovery-proof-ladder/) — **MIXED_ACTIONABLE_AND_WAITING**; 4 actionable, 1 waiting, 0 superseded/historical; raw progress [####------] 4/9
- [parent-atlas-grounded-knowledge-fabric](openspec/changes/parent-atlas-grounded-knowledge-fabric/) — **MIXED_ACTIONABLE_AND_WAITING**; 5 actionable, 6 waiting, 0 superseded/historical; raw progress [######----] 14/25
- [parent-atlas-kv-cache-adaptation-research](openspec/changes/parent-atlas-kv-cache-adaptation-research/) — **MIXED_ACTIONABLE_AND_WAITING**; 71 actionable, 7 waiting, 0 superseded/historical; raw progress [#---------] 10/88
- [parent-atlas-memory-architecture-freeze](openspec/changes/parent-atlas-memory-architecture-freeze/) — **ADVANCEABLE**; 12 actionable, 0 waiting, 0 superseded/historical; raw progress [######----] 20/32
- [parent-atlas-multi-agent-wave-plan](openspec/changes/parent-atlas-multi-agent-wave-plan/) — **MIXED_ACTIONABLE_AND_WAITING**; 14 actionable, 1 waiting, 0 superseded/historical; raw progress [######----] 21/36
- [parent-atlas-native-acceleration-cabi](openspec/changes/parent-atlas-native-acceleration-cabi/) — **MIXED_ACTIONABLE_AND_WAITING**; 26 actionable, 1 waiting, 0 superseded/historical; raw progress [######----] 36/63
- [parent-atlas-neural-prefill-encoder](openspec/changes/parent-atlas-neural-prefill-encoder/) — **MIXED_ACTIONABLE_AND_WAITING**; 490 actionable, 156 waiting, 6 superseded/historical; raw progress [#######---] 1531/2185
- [parent-atlas-nlp-sidecar-feature-compiler](openspec/changes/parent-atlas-nlp-sidecar-feature-compiler/) — **MIXED_ACTIONABLE_AND_WAITING**; 30 actionable, 19 waiting, 1 superseded/historical; raw progress [#######---] 99/149
- [parent-atlas-observation-routing-fabric](openspec/changes/parent-atlas-observation-routing-fabric/) — **MIXED_ACTIONABLE_AND_WAITING**; 7 actionable, 1 waiting, 0 superseded/historical; raw progress [#######---] 18/26
- [parent-atlas-okf-knowledge-layers](openspec/changes/parent-atlas-okf-knowledge-layers/) — **MIXED_ACTIONABLE_AND_WAITING**; 6 actionable, 1 waiting, 0 superseded/historical; raw progress [########--] 38/45
- [parent-atlas-onnx-webgpu-embedding-promotion](openspec/changes/parent-atlas-onnx-webgpu-embedding-promotion/) — **ADVANCEABLE**; 7 actionable, 0 waiting, 0 superseded/historical; raw progress [######----] 10/17
- [parent-atlas-ontology-kernel](openspec/changes/parent-atlas-ontology-kernel/) — **MIXED_ACTIONABLE_AND_WAITING**; 59 actionable, 33 waiting, 0 superseded/historical; raw progress [#######---] 221/313
- [parent-atlas-ontology-oaklib-fanout-bitmap](openspec/changes/parent-atlas-ontology-oaklib-fanout-bitmap/) — **ADVANCEABLE**; 3 actionable, 0 waiting, 0 superseded/historical; raw progress [#########-] 33/36
- [parent-atlas-opencode-replay-proof](openspec/changes/parent-atlas-opencode-replay-proof/) — **MIXED_ACTIONABLE_AND_WAITING**; 13 actionable, 4 waiting, 0 superseded/historical; raw progress [#---------] 2/19
- [parent-atlas-openspec-tasks-audit-fabric](openspec/changes/parent-atlas-openspec-tasks-audit-fabric/) — **COMPLETE**; 0 actionable, 0 waiting, 0 superseded/historical; raw progress [##########] 11/11
- [parent-atlas-openspec-workstation-synthesis](openspec/changes/parent-atlas-openspec-workstation-synthesis/) — **COMPLETE**; 0 actionable, 0 waiting, 0 superseded/historical; raw progress [##########] 31/31
- [parent-atlas-pass-fabric](openspec/changes/parent-atlas-pass-fabric/) — **ADVANCEABLE**; 31 actionable, 0 waiting, 0 superseded/historical; raw progress [####------] 25/56
- [parent-atlas-pca-svd-representation-baseline](openspec/changes/parent-atlas-pca-svd-representation-baseline/) — **MIXED_ACTIONABLE_AND_WAITING**; 10 actionable, 1 waiting, 0 superseded/historical; raw progress [####------] 7/18
- [parent-atlas-policy-routing-integration](openspec/changes/parent-atlas-policy-routing-integration/) — **MIXED_ACTIONABLE_AND_WAITING**; 4 actionable, 1 waiting, 0 superseded/historical; raw progress [#########-] 35/40
- [parent-atlas-prefill-routing-residency-convergence](openspec/changes/parent-atlas-prefill-routing-residency-convergence/) — **MIXED_ACTIONABLE_AND_WAITING**; 22 actionable, 5 waiting, 0 superseded/historical; raw progress [########--] 125/152
- [parent-atlas-qdrant-structural-payload-enrichment](openspec/changes/parent-atlas-qdrant-structural-payload-enrichment/) — **MIXED_ACTIONABLE_AND_WAITING**; 5 actionable, 1 waiting, 0 superseded/historical; raw progress [#######---] 17/23
- [parent-atlas-query-routing-classifier](openspec/changes/parent-atlas-query-routing-classifier/) — **MIXED_ACTIONABLE_AND_WAITING**; 54 actionable, 3 waiting, 0 superseded/historical; raw progress [####------] 41/98
- [parent-atlas-repair-candidate-feature-matrix](openspec/changes/parent-atlas-repair-candidate-feature-matrix/) — **MIXED_ACTIONABLE_AND_WAITING**; 23 actionable, 15 waiting, 1 superseded/historical; raw progress [########--] 135/174
- [parent-atlas-retrieval-executor-compatibility-convergence](openspec/changes/parent-atlas-retrieval-executor-compatibility-convergence/) — **ADVANCEABLE**; 9 actionable, 0 waiting, 0 superseded/historical; raw progress [########--] 39/48
- [parent-atlas-retrieval-fusion-reachability](openspec/changes/parent-atlas-retrieval-fusion-reachability/) — **MIXED_ACTIONABLE_AND_WAITING**; 11 actionable, 14 waiting, 0 superseded/historical; raw progress [########--] 119/144
- [parent-atlas-retrieval-lineage-dag-convergence](openspec/changes/parent-atlas-retrieval-lineage-dag-convergence/) — **MIXED_ACTIONABLE_AND_WAITING**; 113 actionable, 124 waiting, 14 superseded/historical; raw progress [########--] 812/1063
- [parent-atlas-retrieval-lod-algorithm-taxonomy](openspec/changes/parent-atlas-retrieval-lod-algorithm-taxonomy/) — **MIXED_ACTIONABLE_AND_WAITING**; 54 actionable, 1 waiting, 2 superseded/historical; raw progress [#####-----] 52/109
- [parent-atlas-retrieval-logic-convergence](openspec/changes/parent-atlas-retrieval-logic-convergence/) — **ADVANCEABLE**; 42 actionable, 0 waiting, 0 superseded/historical; raw progress [####------] 32/74
- [parent-atlas-rpc-packet-registry-fabric](openspec/changes/parent-atlas-rpc-packet-registry-fabric/) — **COMPLETE**; 0 actionable, 0 waiting, 0 superseded/historical; raw progress [##########] 27/27
- [parent-atlas-rrf-fusion-consolidation](openspec/changes/parent-atlas-rrf-fusion-consolidation/) — **ADVANCEABLE**; 1 actionable, 0 waiting, 0 superseded/historical; raw progress [########--] 5/6
- [parent-atlas-search-classifier-sidecar](openspec/changes/parent-atlas-search-classifier-sidecar/) — **MIXED_ACTIONABLE_AND_WAITING**; 4 actionable, 12 waiting, 0 superseded/historical; raw progress [########--] 70/86
- [parent-atlas-semantic-512-canonicalization](openspec/changes/parent-atlas-semantic-512-canonicalization/) — **MIXED_ACTIONABLE_AND_WAITING**; 5 actionable, 3 waiting, 0 superseded/historical; raw progress [#######---] 23/31
- [parent-atlas-semantic-768-canonical-contract](openspec/changes/parent-atlas-semantic-768-canonical-contract/) — **MIXED_ACTIONABLE_AND_WAITING**; 10 actionable, 16 waiting, 0 superseded/historical; raw progress [#######---] 52/78
- [parent-atlas-telemetry-lowrank-recommendation-okf-integration](openspec/changes/parent-atlas-telemetry-lowrank-recommendation-okf-integration/) — **MIXED_ACTIONABLE_AND_WAITING**; 24 actionable, 5 waiting, 0 superseded/historical; raw progress [#---------] 2/31
- [parent-atlas-tensor-residency-integration](openspec/changes/parent-atlas-tensor-residency-integration/) — **MIXED_ACTIONABLE_AND_WAITING**; 46 actionable, 8 waiting, 0 superseded/historical; raw progress [######----] 97/151
- [parent-atlas-topology-representation-admission](openspec/changes/parent-atlas-topology-representation-admission/) — **ADVANCEABLE**; 19 actionable, 0 waiting, 0 superseded/historical; raw progress [##--------] 6/25
- [parent-atlas-transport-memory-boundaries](openspec/changes/parent-atlas-transport-memory-boundaries/) — **MIXED_ACTIONABLE_AND_WAITING**; 41 actionable, 6 waiting, 2 superseded/historical; raw progress [#####-----] 44/93
- [parent-atlas-unified-symbol-ranking](openspec/changes/parent-atlas-unified-symbol-ranking/) — **COMPLETE**; 0 actionable, 0 waiting, 0 superseded/historical; raw progress [##########] 17/17
- [parent-atlas-unordered-execution-contract](openspec/changes/parent-atlas-unordered-execution-contract/) — **MIXED_ACTIONABLE_AND_WAITING**; 17 actionable, 2 waiting, 0 superseded/historical; raw progress [###-------] 7/26
- [parent-atlas-versioned-doc-intelligence](openspec/changes/parent-atlas-versioned-doc-intelligence/) — **ADVANCEABLE**; 6 actionable, 0 waiting, 0 superseded/historical; raw progress [#########-] 46/52
- [parent-atlas-workboard-feature-utility-fabric](openspec/changes/parent-atlas-workboard-feature-utility-fabric/) — **MIXED_ACTIONABLE_AND_WAITING**; 30 actionable, 11 waiting, 1 superseded/historical; raw progress [####------] 28/70
- [parent-atlas-workstation-domain-classifier](openspec/changes/parent-atlas-workstation-domain-classifier/) — **MIXED_ACTIONABLE_AND_WAITING**; 14 actionable, 12 waiting, 0 superseded/historical; raw progress [########--] 115/141
- [parent-atlas-xgboost-cuda-runtime-proof](openspec/changes/parent-atlas-xgboost-cuda-runtime-proof/) — **MIXED_ACTIONABLE_AND_WAITING**; 16 actionable, 2 waiting, 0 superseded/historical; raw progress [####------] 12/30
- [phase79-canonical-workflow-action-wiring](openspec/changes/phase79-canonical-workflow-action-wiring/) — **COMPLETE**; 0 actionable, 0 waiting, 0 superseded/historical; raw progress [##########] 16/16
- [route-import-infra-isolation](openspec/changes/route-import-infra-isolation/) — **ADVANCEABLE**; 1 actionable, 0 waiting, 0 superseded/historical; raw progress [#########-] 16/17

## Task indexing coverage

- Declared source_ref: 2/9943
- Declared source_revision: 11/9943
- Task ledger source pointer: 9943/9943 (OpenSpec file + line)
- Metadata-unclassified rows: 9930/9943; no source identity was inferred.
- Declared source fields are optional task metadata, not a measure of repository evidence coverage.

## Execution lanes

- **DAILY_GRAPHIFY_KANBAN** 14 open / 28 total
- **GENERAL** 2072 open / 5876 total
- **RESEARCH_CHALLENGER_EWIN_TANG** 31 open / 38 total
- **RETRIEVAL_ACE** 1202 open / 4001 total

## Lane dependencies

- **RESEARCH_CHALLENGER_EWIN_TANG** depends on DAILY_GRAPHIFY_KANBAN — RECEIPT_BACKED_RECOMMENDATIONS_ONLY; Ewin Tang remains an offline challenger; Daily Graphify may supply reviewed recommendation cards, never automatic canonical promotion.
- **RETRIEVAL_ACE** depends on DAILY_GRAPHIFY_KANBAN — EVIDENCE_AND_REVISION_BOUND; ACE may consume Graphify receipts after identity and source-revision eligibility checks.

## Daily Graphify Kanban reference

- Status: **STALE_SNAPSHOT**; source: docs/graph/kanban-board.json
- Snapshot age: 86 days; tasks: 123; sourceRefs: 246
- This snapshot is a reference/input surface only; it is not canonical identity or task authority.

## Historical and consolidation task sources

- **HISTORICAL_TASK_RANKING_REFERENCE** HISTORICAL_OR_STALE: memory/exports/kanban-ranking-report.json; task/board records 858; age 109.6 days
- **CURRENT_CONSOLIDATION_INPUT_REFERENCE** CURRENT_BOUNDED: docs/reports/kanban-turbovec-consolidation-latest.json; task/board records 123; age 0 days
- Historical ranking reports and consolidation inputs are evidence sources only; they are not merged into the OpenSpec task count automatically.

## Current consolidation reference

- Status: **CURRENT_BOUNDED_REFERENCE**; groups: 48; actions: 4; sourceRefs: 115; feature IDs: 114
- Consolidation groups remain candidate merges. They do not automatically close, rewrite, or merge OpenSpec tasks.

## Highest-volume consolidation candidates

- **todo-c-users-james-videos-deeds-web-app-master-feature-todo-2026-05-20-md:cluster:39** 6/6 open; 5 feature IDs; review only
- **todo-c-users-james-videos-deeds-web-app-master-feature-todo-2026-05-20-md:cluster:117** 5/5 open; 5 feature IDs; review only
- **todo-c-users-james-videos-deeds-web-app-master-feature-todo-2026-05-20-md:cluster:42** 5/5 open; 5 feature IDs; review only
- **todo-c-users-james-videos-deeds-web-app-master-feature-todo-2026-05-20-md:cluster:64** 5/5 open; 5 feature IDs; review only
- **todo-c-users-james-videos-deeds-web-app-master-feature-todo-2026-05-20-md:cluster:78** 5/5 open; 5 feature IDs; review only
- **todo-c-users-james-videos-deeds-web-app-master-feature-todo-2026-05-20-md:cluster:82** 5/5 open; 5 feature IDs; review only
- **lib:cluster:none** 4/4 open; 0 feature IDs; review only
- **todo-c-users-james-videos-deeds-web-app-master-feature-todo-2026-05-20-md:cluster:112** 4/4 open; 4 feature IDs; review only
- **todo-c-users-james-videos-deeds-web-app-master-feature-todo-2026-05-20-md:cluster:125** 4/4 open; 4 feature IDs; review only
- **todo-c-users-james-videos-deeds-web-app-master-feature-todo-2026-05-20-md:cluster:24** 4/4 open; 4 feature IDs; review only

## Change progress

- [ace-hyperrag-chr97-graphify-audit](openspec/changes/ace-hyperrag-chr97-graphify-audit/) [##########] 7/7 complete; 0 open
- [agent-branch-review-fanout-ace-centroid-aug22](openspec/changes/agent-branch-review-fanout-ace-centroid-aug22/) [#########-] 17/20 complete; 3 open
- [atlas-feature-intelligence](openspec/changes/atlas-feature-intelligence/) [###-------] 27/80 complete; 53 open
- [codereview-inference-wiring-followup-aug22](openspec/changes/codereview-inference-wiring-followup-aug22/) [##########] 10/10 complete; 0 open
- [codereview-semantic-dimension-regression-aug22](openspec/changes/codereview-semantic-dimension-regression-aug22/) [##########] 12/12 complete; 0 open
- [deep-audit-code-gates-aug22](openspec/changes/deep-audit-code-gates-aug22/) [######----] 16/28 complete; 12 open
- [docker-compose-duplication-remediation](openspec/changes/docker-compose-duplication-remediation/) [##########] 9/9 complete; 0 open
- [feature-label-semantic-derivation](openspec/changes/feature-label-semantic-derivation/) [##########] 3/3 complete; 0 open
- [inference-wiring-deep-audit-aug22](openspec/changes/inference-wiring-deep-audit-aug22/) [##########] 56/56 complete; 0 open
- [local-llm-offload-ownership](openspec/changes/local-llm-offload-ownership/) [#######---] 43/62 complete; 19 open
- [manual-migration-reconciliation](openspec/changes/manual-migration-reconciliation/) [########--] 84/110 complete; 26 open
- [parent-atlas-ace-bitfrost-cache-correctness](openspec/changes/parent-atlas-ace-bitfrost-cache-correctness/) [######----] 56/89 complete; 33 open
- [parent-atlas-ace-rlm-bitfrost-integration](openspec/changes/parent-atlas-ace-rlm-bitfrost-integration/) [########--] 712/933 complete; 221 open
- [parent-atlas-adaptive-dag-fabric](openspec/changes/parent-atlas-adaptive-dag-fabric/) [########--] 11/13 complete; 2 open
- [parent-atlas-agentic-completion](openspec/changes/parent-atlas-agentic-completion/) [#########-] 10/11 complete; 1 open
- [parent-atlas-agentic-file-compiler](openspec/changes/parent-atlas-agentic-file-compiler/) [#######---] 56/78 complete; 22 open
- [parent-atlas-agentic-repair-bundle-integration](openspec/changes/parent-atlas-agentic-repair-bundle-integration/) [###-------] 26/84 complete; 58 open
- [parent-atlas-agentic-repair-fabric](openspec/changes/parent-atlas-agentic-repair-fabric/) [##########] 37/38 complete; 1 open
- [parent-atlas-agentic-run-receipt-binding](openspec/changes/parent-atlas-agentic-run-receipt-binding/) [##########] 16/16 complete; 0 open
- [parent-atlas-analysis-pass-ornith-adapter](openspec/changes/parent-atlas-analysis-pass-ornith-adapter/) [##########] 24/25 complete; 1 open
- [parent-atlas-autoresearch-fabric](openspec/changes/parent-atlas-autoresearch-fabric/) [##########] 8/8 complete; 0 open
- [parent-atlas-best-fit-score-fabric](openspec/changes/parent-atlas-best-fit-score-fabric/) [######----] 406/682 complete; 276 open
- [parent-atlas-branch-merge-consolidation-aug20](openspec/changes/parent-atlas-branch-merge-consolidation-aug20/) [#####-----] 18/35 complete; 17 open
- [parent-atlas-candidate-feature-execution-fabric](openspec/changes/parent-atlas-candidate-feature-execution-fabric/) [#######---] 257/358 complete; 101 open
- [parent-atlas-canonical-directory-ingestion-fabric](openspec/changes/parent-atlas-canonical-directory-ingestion-fabric/) [###-------] 21/66 complete; 45 open
- [parent-atlas-chunk-index-whole-file-hash](openspec/changes/parent-atlas-chunk-index-whole-file-hash/) [##########] 17/17 complete; 0 open
- [parent-atlas-code-ingestion-pipeline](openspec/changes/parent-atlas-code-ingestion-pipeline/) [#######---] 26/35 complete; 9 open
- [parent-atlas-code-intel-e2e](openspec/changes/parent-atlas-code-intel-e2e/) [----------] 0/5 complete; 5 open
- [parent-atlas-compiler-semantic-graph-resolution](openspec/changes/parent-atlas-compiler-semantic-graph-resolution/) [#######---] 40/58 complete; 18 open
- [parent-atlas-compute-rank-cache-eval-dspy-gepa](openspec/changes/parent-atlas-compute-rank-cache-eval-dspy-gepa/) [###-------] 22/73 complete; 51 open
- [parent-atlas-deep-research-ingestion](openspec/changes/parent-atlas-deep-research-ingestion/) [#########-] 6/7 complete; 1 open
- [parent-atlas-document-governance-master-index](openspec/changes/parent-atlas-document-governance-master-index/) [########--] 52/64 complete; 12 open
- [parent-atlas-error-embedding-768-migration](openspec/changes/parent-atlas-error-embedding-768-migration/) [#####-----] 12/25 complete; 13 open
- [parent-atlas-gate2-chunk-lineage-convergence](openspec/changes/parent-atlas-gate2-chunk-lineage-convergence/) [##--------] 3/20 complete; 17 open
- [parent-atlas-governed-compute-fabric](openspec/changes/parent-atlas-governed-compute-fabric/) [----------] 2/158 complete; 156 open
- [parent-atlas-gpu-graph-vector-substrate](openspec/changes/parent-atlas-gpu-graph-vector-substrate/) [#---------] 2/27 complete; 25 open
- [parent-atlas-gpu-prellm-recommendation-v1](openspec/changes/parent-atlas-gpu-prellm-recommendation-v1/) [#########-] 35/37 complete; 2 open
- [parent-atlas-gpu-runtime-abi-alignment](openspec/changes/parent-atlas-gpu-runtime-abi-alignment/) [########--] 17/22 complete; 5 open
- [parent-atlas-gpu-sidecar-patch-tournament](openspec/changes/parent-atlas-gpu-sidecar-patch-tournament/) [##--------] 17/78 complete; 61 open
- [parent-atlas-graph-analysis-contract](openspec/changes/parent-atlas-graph-analysis-contract/) [#######---] 62/84 complete; 22 open
- [parent-atlas-graph-pagerank-okf-fanout-hardening](openspec/changes/parent-atlas-graph-pagerank-okf-fanout-hardening/) [##########] 4/4 complete; 0 open
- [parent-atlas-graph-retrieval-proof](openspec/changes/parent-atlas-graph-retrieval-proof/) [######----] 160/285 complete; 125 open
- [parent-atlas-graph-runtime-enhancement](openspec/changes/parent-atlas-graph-runtime-enhancement/) [####------] 3/8 complete; 5 open
- [parent-atlas-graph-runtime-python-consolidation](openspec/changes/parent-atlas-graph-runtime-python-consolidation/) [#######---] 20/28 complete; 8 open
- [parent-atlas-graph-validation-fabric](openspec/changes/parent-atlas-graph-validation-fabric/) [######----] 61/94 complete; 33 open
- [parent-atlas-graphify-recovery-proof-ladder](openspec/changes/parent-atlas-graphify-recovery-proof-ladder/) [####------] 4/9 complete; 5 open
- [parent-atlas-grounded-knowledge-fabric](openspec/changes/parent-atlas-grounded-knowledge-fabric/) [######----] 14/25 complete; 11 open
- [parent-atlas-kv-cache-adaptation-research](openspec/changes/parent-atlas-kv-cache-adaptation-research/) [#---------] 10/88 complete; 78 open
- [parent-atlas-memory-architecture-freeze](openspec/changes/parent-atlas-memory-architecture-freeze/) [######----] 20/32 complete; 12 open
- [parent-atlas-multi-agent-wave-plan](openspec/changes/parent-atlas-multi-agent-wave-plan/) [######----] 21/36 complete; 15 open
- [parent-atlas-native-acceleration-cabi](openspec/changes/parent-atlas-native-acceleration-cabi/) [######----] 36/63 complete; 27 open
- [parent-atlas-neural-prefill-encoder](openspec/changes/parent-atlas-neural-prefill-encoder/) [#######---] 1531/2185 complete; 654 open
- [parent-atlas-nlp-sidecar-feature-compiler](openspec/changes/parent-atlas-nlp-sidecar-feature-compiler/) [#######---] 99/149 complete; 50 open
- [parent-atlas-observation-routing-fabric](openspec/changes/parent-atlas-observation-routing-fabric/) [#######---] 18/26 complete; 8 open
- [parent-atlas-okf-knowledge-layers](openspec/changes/parent-atlas-okf-knowledge-layers/) [########--] 38/45 complete; 7 open
- [parent-atlas-onnx-webgpu-embedding-promotion](openspec/changes/parent-atlas-onnx-webgpu-embedding-promotion/) [######----] 10/17 complete; 7 open
- [parent-atlas-ontology-kernel](openspec/changes/parent-atlas-ontology-kernel/) [#######---] 221/313 complete; 92 open
- [parent-atlas-ontology-oaklib-fanout-bitmap](openspec/changes/parent-atlas-ontology-oaklib-fanout-bitmap/) [#########-] 33/36 complete; 3 open
- [parent-atlas-opencode-replay-proof](openspec/changes/parent-atlas-opencode-replay-proof/) [#---------] 2/19 complete; 17 open
- [parent-atlas-openspec-tasks-audit-fabric](openspec/changes/parent-atlas-openspec-tasks-audit-fabric/) [##########] 11/11 complete; 0 open
- [parent-atlas-openspec-workstation-synthesis](openspec/changes/parent-atlas-openspec-workstation-synthesis/) [##########] 31/31 complete; 0 open
- [parent-atlas-pass-fabric](openspec/changes/parent-atlas-pass-fabric/) [####------] 25/56 complete; 31 open
- [parent-atlas-pca-svd-representation-baseline](openspec/changes/parent-atlas-pca-svd-representation-baseline/) [####------] 7/18 complete; 11 open
- [parent-atlas-policy-routing-integration](openspec/changes/parent-atlas-policy-routing-integration/) [#########-] 35/40 complete; 5 open
- [parent-atlas-prefill-routing-residency-convergence](openspec/changes/parent-atlas-prefill-routing-residency-convergence/) [########--] 125/152 complete; 27 open
- [parent-atlas-qdrant-structural-payload-enrichment](openspec/changes/parent-atlas-qdrant-structural-payload-enrichment/) [#######---] 17/23 complete; 6 open
- [parent-atlas-query-routing-classifier](openspec/changes/parent-atlas-query-routing-classifier/) [####------] 41/98 complete; 57 open
- [parent-atlas-repair-candidate-feature-matrix](openspec/changes/parent-atlas-repair-candidate-feature-matrix/) [########--] 135/174 complete; 39 open
- [parent-atlas-retrieval-executor-compatibility-convergence](openspec/changes/parent-atlas-retrieval-executor-compatibility-convergence/) [########--] 39/48 complete; 9 open
- [parent-atlas-retrieval-fusion-reachability](openspec/changes/parent-atlas-retrieval-fusion-reachability/) [########--] 119/144 complete; 25 open
- [parent-atlas-retrieval-lineage-dag-convergence](openspec/changes/parent-atlas-retrieval-lineage-dag-convergence/) [########--] 812/1063 complete; 251 open
- [parent-atlas-retrieval-lod-algorithm-taxonomy](openspec/changes/parent-atlas-retrieval-lod-algorithm-taxonomy/) [#####-----] 52/109 complete; 57 open
- [parent-atlas-retrieval-logic-convergence](openspec/changes/parent-atlas-retrieval-logic-convergence/) [####------] 32/74 complete; 42 open
- [parent-atlas-rpc-packet-registry-fabric](openspec/changes/parent-atlas-rpc-packet-registry-fabric/) [##########] 27/27 complete; 0 open
- [parent-atlas-rrf-fusion-consolidation](openspec/changes/parent-atlas-rrf-fusion-consolidation/) [########--] 5/6 complete; 1 open
- [parent-atlas-search-classifier-sidecar](openspec/changes/parent-atlas-search-classifier-sidecar/) [########--] 70/86 complete; 16 open
- [parent-atlas-semantic-512-canonicalization](openspec/changes/parent-atlas-semantic-512-canonicalization/) [#######---] 23/31 complete; 8 open
- [parent-atlas-semantic-768-canonical-contract](openspec/changes/parent-atlas-semantic-768-canonical-contract/) [#######---] 52/78 complete; 26 open
- [parent-atlas-telemetry-lowrank-recommendation-okf-integration](openspec/changes/parent-atlas-telemetry-lowrank-recommendation-okf-integration/) [#---------] 2/31 complete; 29 open
- [parent-atlas-tensor-residency-integration](openspec/changes/parent-atlas-tensor-residency-integration/) [######----] 97/151 complete; 54 open
- [parent-atlas-topology-representation-admission](openspec/changes/parent-atlas-topology-representation-admission/) [##--------] 6/25 complete; 19 open
- [parent-atlas-transport-memory-boundaries](openspec/changes/parent-atlas-transport-memory-boundaries/) [#####-----] 44/93 complete; 49 open
- [parent-atlas-unified-symbol-ranking](openspec/changes/parent-atlas-unified-symbol-ranking/) [##########] 17/17 complete; 0 open
- [parent-atlas-unordered-execution-contract](openspec/changes/parent-atlas-unordered-execution-contract/) [###-------] 7/26 complete; 19 open
- [parent-atlas-versioned-doc-intelligence](openspec/changes/parent-atlas-versioned-doc-intelligence/) [#########-] 46/52 complete; 6 open
- [parent-atlas-workboard-feature-utility-fabric](openspec/changes/parent-atlas-workboard-feature-utility-fabric/) [####------] 28/70 complete; 42 open
- [parent-atlas-workstation-domain-classifier](openspec/changes/parent-atlas-workstation-domain-classifier/) [########--] 115/141 complete; 26 open
- [parent-atlas-xgboost-cuda-runtime-proof](openspec/changes/parent-atlas-xgboost-cuda-runtime-proof/) [####------] 12/30 complete; 18 open
- [phase79-canonical-workflow-action-wiring](openspec/changes/phase79-canonical-workflow-action-wiring/) [##########] 16/16 complete; 0 open
- [route-import-infra-isolation](openspec/changes/route-import-infra-isolation/) [#########-] 16/17 complete; 1 open

