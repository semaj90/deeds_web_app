# OpenSpec Workboard

> Generated from OpenSpec task ledgers. This is a navigation/progress projection, not task authority.

## Memory/agent ownership reconciliation

- [2026-09-05 bounded owner reconciliation](reports/memory-agent-openspec-ownership-reconciliation-v1.json): capability-to-owner mapping, current-tree evidence, pending gates and validation results.
- Existing owning tasks.md files remain implementation authority; this report creates no new change or portfolio authority.
- SearchRuntime owns fusion; query features feed the existing ACE/ContextManifest bridge; exact caches and server prefix state retain separate owners.
- The nested wire-agentic-workflows-e2e-test ledger is reference-only. WorkflowActionEventV1 and WorkflowExecutionCoordinatesV1 retain run/backend boundaries.
- Planning reconciliation does not prove runtime convergence, authorize cache/datastore writes, or advance current source/cohort admission.

Overall progress: [######----] 6046/9393 tasks
Execution states: 2534 actionable; 752 waiting on dependencies; 59 superseded/historical; 2 invariants.
Change states: 11 complete; 24 advanceable; 53 mixed actionable/waiting; 0 waiting/historical; 0 review required.
ETA: UNKNOWN — no receipt-linked throughput supports a defensible estimate.

## P10 dependency work packages

- **P10-A** Migration ledger reconciliation — BLOCKED; depends on none; gates: migration baseline, owner manifest, pre-apply guard
- **P10-B** Canonical candidate identity — OPEN; depends on P10-A; gates: feature identity, packet identity, CandidateOrdinal
- **P10-C** Symbol lineage — OPEN; depends on P10-B; gates: stableSymbolId, symbolVersionId, treeNodeId
- **P10-D** Lexical identity — OPEN; depends on P10-B; gates: source revision, FTS identity, cross-store lineage
- **P10-E** Top-K cross-store readback — OPEN; depends on P10-C, P10-D; gates: CandidateTopKV1, Qdrant parity, Go retrieval parity

## Promotion-critical dependency rank

- This rank identifies the authority gates that actually unblock promotion; task counts remain navigation metrics only.
- **1.** [parent-atlas-retrieval-lineage-dag-convergence](openspec/changes/parent-atlas-retrieval-lineage-dag-convergence/) [########--] 736/974 complete; 238 open — depends on none; gate: Admitted workspace/source/packet identity and canonical packet revision ownership; blocker: Execution/source producer authority and PacketRevisionOwnerV1 remain unresolved.
- **2.** [parent-atlas-gate2-chunk-lineage-convergence](openspec/changes/parent-atlas-gate2-chunk-lineage-convergence/) [##--------] 3/20 complete; 17 open — depends on parent-atlas-retrieval-lineage-dag-convergence; gate: Revision-qualified packet to chunk closure; blocker: Current workspace to packet to chunk qualification is not proven; historical bridge is not current authority.
- **3.** [parent-atlas-graph-retrieval-proof](openspec/changes/parent-atlas-graph-retrieval-proof/) [######----] 157/284 complete; 127 open — depends on parent-atlas-retrieval-lineage-dag-convergence, parent-atlas-gate2-chunk-lineage-convergence; gate: Revision-qualified packet to AST/span closure; blocker: AST/tree identity and source-span ownership remain provisional.
- **4.** [parent-atlas-prefill-routing-residency-convergence](openspec/changes/parent-atlas-prefill-routing-residency-convergence/) [########--] 125/152 complete; 27 open — depends on parent-atlas-retrieval-lineage-dag-convergence, parent-atlas-gate2-chunk-lineage-convergence, parent-atlas-graph-retrieval-proof; gate: Planning and executor proofs over an admitted candidate cohort; blocker: Prefill, routing, residency, Qdrant/cuVS, and GPU work are downstream consumers.
- **5.** [parent-atlas-rpc-packet-registry-fabric](openspec/changes/parent-atlas-rpc-packet-registry-fabric/) [##########] 27/27 complete; 0 open — depends on parent-atlas-retrieval-lineage-dag-convergence, parent-atlas-gate2-chunk-lineage-convergence, parent-atlas-graph-retrieval-proof; gate: Downstream read surface; no new authority; blocker: Transport is complete but must remain fail-closed until lineage supplies qualified rows.

## Dependency-ordered execution steps

- **STEP-01** [######----] 471/745 complete; 274 open — Identity and source authority; depends on none; gate: Exact identity, source, symbol, and revision ownership
- **STEP-02** [#######---] 1224/1775 complete; 551 open — Eligibility and provenance; depends on STEP-01; gate: Canonical eligibility, readback, and lineage proofs
- **STEP-03** [######----] 777/1302 complete; 525 open — Runtime and retrieval; depends on STEP-02; gate: Embedding, Qdrant, Go Retrieval, and fusion execution
- **STEP-04** [#######---] 1443/2159 complete; 716 open — Feature and structural context; depends on STEP-03; gate: AST/CST, LSP, ontology, feature fabric, and ContextManifest
- **STEP-05** [######----] 201/341 complete; 140 open — Workflow and receipts; depends on STEP-04; gate: Agent execution, NATS/JetStream, validation, and receipts
- **STEP-06** [######----] 42/76 complete; 34 open — Governance and operations; depends on STEP-05; gate: Admin, Kanban, documents, supersession, and archive
- **STEP-07** [######----] 1862/2904 complete; 1042 open — Unclassified supporting work; depends on STEP-01; gate: Review and attach each task to an upstream gate
- **STEP-08** [###-------] 26/91 complete; 65 open — Benchmarks and challengers; depends on STEP-03, STEP-04; gate: Evaluation, GPU challengers, topology, and Ewin Tang

### Next bounded tasks by step

**STEP-01**
- atlas-feature-intelligence:138 — GENERAL; Canonical identity survives path/cluster/projection changes in live Postgres readback. (openspec/changes/atlas-feature-intelligence/tasks.md:138)
- atlas-feature-intelligence:195 — RETRIEVAL_ACE; CANONICAL-IDENTITY-V1 POINTER (2026-09-21): canonical object identity (symbol/file/chunk discriminants, mandatory workspaceRevision + sourceRevision, no 'unknown'/latest-row inference, representation/execution/transport ids and CandidateOrdinal are NOT canonical identity) is owned by `CANONICAL-IDENTITY-V1-SPEC-01` in `openspec/changes/parent-atlas-retrieval-lineage-dag-convergence/tasks.md`. This change SHALL reference that contract and not define its own identity rules; it may add representation-, execution-, feature-, cache-, transport- or projection-specific identities only. Pointer only; no scope change here. Spec status: SPEC_DRAFT (not signed off). (openspec/changes/atlas-feature-intelligence/tasks.md:195)
- manual-migration-reconciliation:321 — GENERAL; Resolve the packet writer's admitted source-revision input and prove (openspec/changes/manual-migration-reconciliation/tasks.md:321)
- parent-atlas-ace-bitfrost-cache-correctness:370 — RETRIEVAL_ACE; **CACHE-RETRIEVAL-IDENTITY-03** — Update all callers, including the MCP trace route and (openspec/changes/parent-atlas-ace-bitfrost-cache-correctness/tasks.md:370)
- parent-atlas-ace-bitfrost-cache-correctness:597 — RETRIEVAL_ACE; `CACHE-PREFILL-03` and `CACHE-RETRIEVAL-IDENTITY-03` remain open. No production (openspec/changes/parent-atlas-ace-bitfrost-cache-correctness/tasks.md:597)

**STEP-02**
- atlas-feature-intelligence:65 — GENERAL; FI-06 Parse Spec Kit `.specify` artifacts when present without making them canonical authority. (openspec/changes/atlas-feature-intelligence/tasks.md:65)
- atlas-feature-intelligence:79 — GENERAL; FI-13C2 Materialize pairwise/incidence graph projections and prove reconstruction/parity against canonical Postgres facts. (openspec/changes/atlas-feature-intelligence/tasks.md:79)
- atlas-feature-intelligence:80 — GENERAL; FI-14 Project canonical graph snapshot to Neo4j and NetworkX/cuGraph with parity receipts. (openspec/changes/atlas-feature-intelligence/tasks.md:80)
- atlas-feature-intelligence:118 — GENERAL; FI-22G Add QLoRA dataset selection/export from verified canonical evidence + derived feature rows; derived manifold/rotation values may guide sampling but cannot become labels/truth. (openspec/changes/atlas-feature-intelligence/tasks.md:118)
- atlas-feature-intelligence:139 — RETRIEVAL_ACE; Neo4j/NetworkX/cuGraph/Qdrant records round-trip to canonical feature/evidence/relationship IDs. (openspec/changes/atlas-feature-intelligence/tasks.md:139)

**STEP-03**
- atlas-feature-intelligence:99 — RETRIEVAL_ACE; FI-16M Add retrieval-action receipt for every `NEED_* -> DAG action -> new evidence -> sufficiency re-evaluation` loop. (openspec/changes/atlas-feature-intelligence/tasks.md:99)
- atlas-feature-intelligence:124 — GENERAL; FI-25 Add staleness propagation from source/schema/dependency/test/runtime revisions. (openspec/changes/atlas-feature-intelligence/tasks.md:124)
- atlas-feature-intelligence:131 — RETRIEVAL_ACE; FI-29 Seed known Atlas workstreams from existing Gate 12, PageRank, Qdrant/TurboVec, OKF and Parent Atlas scripts as evidence candidates, not completion claims. (openspec/changes/atlas-feature-intelligence/tasks.md:131)
- atlas-feature-intelligence:132 — GENERAL; FI-30 Reconcile existing static Kanban/progress documents against current source/test/runtime evidence. (openspec/changes/atlas-feature-intelligence/tasks.md:132)
- atlas-feature-intelligence:150 — RETRIEVAL_ACE; Qdrant/pgvector/CAGRA/TurboVec similarity changes retrieval candidates but cannot directly change completion. (openspec/changes/atlas-feature-intelligence/tasks.md:150)

**STEP-04**
- ace-hyperrag-chr97-graphify-audit:45 — RETRIEVAL_ACE; Ask the user (or infer from context) whether "graphify GPU indexed json packets" — now that (openspec/changes/ace-hyperrag-chr97-graphify-audit/tasks.md:45)
- ace-hyperrag-chr97-graphify-audit:51 — RETRIEVAL_ACE; Decide whether ACE's AST-blindness (context-assembler reads `codebase-graph.json`, which (openspec/changes/ace-hyperrag-chr97-graphify-audit/tasks.md:51)
- agent-branch-review-fanout-ace-centroid-aug22:24 — RETRIEVAL_ACE; 3.3 If 3.2 fails, the operator's fallback is to patch the precise optional-lane return site in the ACE context assembler (explicitly scoped narrow — "not a blanket catch around ACE", citing the assembler's existing correct fail-open behavior for cached-chunk reads as the pattern to match). Deferred until 3.2 actually runs. (openspec/changes/agent-branch-review-fanout-ace-centroid-aug22/tasks.md:24)
- agent-branch-review-fanout-ace-centroid-aug22:25 — RETRIEVAL_ACE; 3.4 If 3.2 succeeds, the operator's stated follow-on is to leave ACE degradation alone and move to wiring proof-qualified storage/GPU capabilities into the MCP Viterbi capability registry as hard executor admission masks (replacing probabilistic Viterbi weighting for those specific capabilities). Deferred — downstream of 3.2. (openspec/changes/agent-branch-review-fanout-ace-centroid-aug22/tasks.md:25)
- agent-branch-review-fanout-ace-centroid-aug22:31 — RETRIEVAL_ACE; 4.3 The `fanout-proof-db-readiness` and `ace-centroid-alignment` branches remain unmerged, both still correctness-verified and low-risk per sections 1-2 above — the actual merge-to-`main` decision for those two specific branches is still an operator call, not made in this session. (openspec/changes/agent-branch-review-fanout-ace-centroid-aug22/tasks.md:31)

**STEP-05**
- local-llm-offload-ownership:294 — GENERAL; **A0 Audit** per candidate: callers (`rg` over `src/`, `scripts/`, `package.json` scripts, compose, docs, OpenSpec), (openspec/changes/local-llm-offload-ownership/tasks.md:294)
- parent-atlas-adaptive-dag-fabric:290 — GENERAL; NATS-EVENT-01 JetStream `PARENT_ATLAS_EVENTS` shadow event stream (openspec/changes/parent-atlas-adaptive-dag-fabric/tasks.md:290)
- parent-atlas-agentic-file-compiler:49 — GENERAL; AFC-16 Wire bounded filesystem mutation behind authorization and human-approval policy. (openspec/changes/parent-atlas-agentic-file-compiler/tasks.md:49)
- parent-atlas-agentic-file-compiler:64 — GENERAL; AFC-19 Run CPU/GPU semantic executor parity and confirm one-vote-per-lane behavior. (openspec/changes/parent-atlas-agentic-file-compiler/tasks.md:64)
- parent-atlas-agentic-repair-bundle-integration:12 — GENERAL; Before wiring anything, diff each bundle repair-script against the existing repair spine: (openspec/changes/parent-atlas-agentic-repair-bundle-integration/tasks.md:12)

**STEP-06**
- deep-audit-code-gates-aug22:17 — GENERAL; 3.3 G14 (3 fails, all scratch files): decide whether to archive `sveltekit-frontend/temp_upload.svelte`, `test-errors-validation.svelte`, `test-errors.svelte` per repo's archive-not-delete convention, or confirm they're intentionally kept as manual test fixtures. (openspec/changes/deep-audit-code-gates-aug22/tasks.md:17)
- deep-audit-code-gates-aug22:21 — GENERAL; 4.1 G4 (47 fails): review each `+server.ts` missing `locals.user` — some (`/api/acp/rpc`, `/api/admin/atlas/*`) may be intentionally internal/service-to-service and not need a user-session guard; don't blanket-add auth without checking intended access model per route. (openspec/changes/deep-audit-code-gates-aug22/tasks.md:21)
- local-llm-offload-ownership:296 — GENERAL; **A1 Classify** each as LIVE_OWNER / COMPATIBILITY / FIXTURE / DOCUMENTATION / ARCHIVED / STALE with the evidence attached. (openspec/changes/local-llm-offload-ownership/tasks.md:296)
- local-llm-offload-ownership:297 — GENERAL; **A2 Operator decision** recorded per candidate (archive / keep / rebuild). `image-synthesis` needs VRAM measurement first. (openspec/changes/local-llm-offload-ownership/tasks.md:297)
- parent-atlas-best-fit-score-fabric:1428 — GENERAL; Retain the failed export artifacts until an explicit archive/cleanup decision is authorized; (openspec/changes/parent-atlas-best-fit-score-fabric/tasks.md:1428)

**STEP-07**
- deep-audit-code-gates-aug22:4 — GENERAL; 1.2 Re-run `npm run graphify:daily` to refresh the index (currently 33.9h stale at time of this audit) before trusting any fail count here for fixing. (openspec/changes/deep-audit-code-gates-aug22/tasks.md:4)
- deep-audit-code-gates-aug22:10 — GENERAL; 2.2 Reconcile this session's approximation (routeHandlers-mutating-method + hasZod===false → 47 fails) against the graph's own precomputed `gateStats.routesWithoutZod: 23` — figure out which is closer to the skill's actual intended "G5" definition, or whether both are wrong. (openspec/changes/deep-audit-code-gates-aug22/tasks.md:10)
- deep-audit-code-gates-aug22:15 — GENERAL; 3.1 G16 (67 fails): `npm run audit:test-stubs --filter <path>` per failing route, or in bulk. (openspec/changes/deep-audit-code-gates-aug22/tasks.md:15)
- deep-audit-code-gates-aug22:16 — GENERAL; 3.2 G26 (4 fails): add `// @vitest-environment node` to `tests/routes/all-routes-page.test.ts`, `cache-stats.test.ts`, `codebase-tags-rename.test.ts`, `phase109-tag-chunks.test.ts`. (openspec/changes/deep-audit-code-gates-aug22/tasks.md:16)
- deep-audit-code-gates-aug22:23 — GENERAL; 4.3 G11 (41 fails): wrap bare `localhost`/`127.0.0.1` literals in `ENV.SERVICE_URL ?? 'http://localhost:N'` per the repo's own G11 fix pattern. (openspec/changes/deep-audit-code-gates-aug22/tasks.md:23)

**STEP-08**
- parent-atlas-best-fit-score-fabric:736 — GENERAL; AGMR-03B Run a separate FP16-versus-INT8 precision parity benchmark (openspec/changes/parent-atlas-best-fit-score-fabric/tasks.md:736)
- parent-atlas-best-fit-score-fabric:1060 — GENERAL; FT-07 Run the QKV/KV-cache precision experiment through the existing (openspec/changes/parent-atlas-best-fit-score-fabric/tasks.md:1060)
- parent-atlas-best-fit-score-fabric:1121 — GENERAL; Run a safe warm CPU benchmark separating initialization/checkpoint load (openspec/changes/parent-atlas-best-fit-score-fabric/tasks.md:1121)
- parent-atlas-compute-rank-cache-eval-dspy-gepa:30 — GENERAL; Adapt existing `scripts/crossencoder-benchmark.py` to consume the final fused candidate set rather than only legacy XGBoost-v2 rows. (openspec/changes/parent-atlas-compute-rank-cache-eval-dspy-gepa/tasks.md:30)
- parent-atlas-compute-rank-cache-eval-dspy-gepa:155 — GENERAL; GEPA-SHADOW-01 — run a bounded validation-only GEPA experiment with fixed seed, resumable log, and candidate checksum. (openspec/changes/parent-atlas-compute-rank-cache-eval-dspy-gepa/tasks.md:155)

## Permanent acceptance invariants

- **INVARIANT** [parent-atlas-neural-prefill-encoder](openspec/changes/parent-atlas-neural-prefill-encoder/tasks.md#L3728) No canonical identity or source data changes during dry-run/training. — last updated 2026-09-20T07:24:51.094Z (FILESYSTEM_MTIME); ETA N/A
- **INVARIANT** [parent-atlas-neural-prefill-encoder](openspec/changes/parent-atlas-neural-prefill-encoder/tasks.md#L3729) No projection occurs while model, identity, or parity gates fail. — last updated 2026-09-20T07:24:51.094Z (FILESYSTEM_MTIME); ETA N/A

## Critical-path change frontiers

- One frontier item is shown per promotion-critical change. The full actionable inventory and parallel frontiers are in `openspec-workboard-v1.json`.
- [ ] **P10** [parent-atlas-retrieval-lineage-dag-convergence](openspec/changes/parent-atlas-retrieval-lineage-dag-convergence/tasks.md#L1559) PROMOTION-01 — Keep source lineage, graph identity, feature layout, — lane RETRIEVAL_ACE; last updated 2026-09-21T20:26:00.020Z (FILESYSTEM_MTIME); ETA UNKNOWN
- [ ] **P20** [parent-atlas-gate2-chunk-lineage-convergence](openspec/changes/parent-atlas-gate2-chunk-lineage-convergence/tasks.md#L36) 2.1 Present the fresh snapshot's readback-proven receipt to the operator and request — lane GENERAL; last updated 2026-09-18T02:06:04.587Z (FILESYSTEM_MTIME); ETA UNKNOWN
- [ ] **P10** [parent-atlas-graph-retrieval-proof](openspec/changes/parent-atlas-graph-retrieval-proof/tasks.md#L15) Define separate contracts for `parse_node_id`, `symbol_id`, `symbol_version_id`, `chunk_id`, `packet_key`, `concept_id`, and `graph_node_key`. — lane RETRIEVAL_ACE; last updated 2026-09-09T01:02:53.461Z (FILESYSTEM_MTIME); ETA UNKNOWN
- [ ] **P10** [parent-atlas-prefill-routing-residency-convergence](openspec/changes/parent-atlas-prefill-routing-residency-convergence/tasks.md#L307) ANN-03 Require the same semantic_768 matrix and identity manifest across Qdrant/cuVS. — lane RETRIEVAL_ACE; last updated 2026-09-19T19:45:04.879Z (FILESYSTEM_MTIME); ETA UNKNOWN

## Parallel proof frontiers

- [ ] **P10** [parent-atlas-transport-memory-boundaries](openspec/changes/parent-atlas-transport-memory-boundaries/tasks.md#L10) **ACP-02** Map ACP session/task/action identifiers to existing `runId`, `taskId`, `ContextManifest` hash, and `ExecutionReceipt`; ACP must not own graph identity. — lane RETRIEVAL_ACE; last updated 2026-09-21T19:03:38.894Z (FILESYSTEM_MTIME); ETA UNKNOWN
- [ ] **P10** [parent-atlas-retrieval-logic-convergence](openspec/changes/parent-atlas-retrieval-logic-convergence/tasks.md#L325) **CONTEXT-HANDOFF-02 — Preserve deterministic prefill identity.** Continue — lane RETRIEVAL_ACE; last updated 2026-09-21T19:03:38.864Z (FILESYSTEM_MTIME); ETA UNKNOWN
- [ ] **P10** [parent-atlas-ace-rlm-bitfrost-integration](openspec/changes/parent-atlas-ace-rlm-bitfrost-integration/tasks.md#L2897) Add a revision-qualified centroid manifest/pointer and pass identity before enabling — lane RETRIEVAL_ACE; last updated 2026-09-21T19:03:38.834Z (FILESYSTEM_MTIME); ETA UNKNOWN
- [ ] **P10** [parent-atlas-ace-bitfrost-cache-correctness](openspec/changes/parent-atlas-ace-bitfrost-cache-correctness/tasks.md#L370) **CACHE-RETRIEVAL-IDENTITY-03** — Update all callers, including the MCP trace route and — lane RETRIEVAL_ACE; last updated 2026-09-21T19:03:38.802Z (FILESYSTEM_MTIME); ETA UNKNOWN
- [ ] **P10** [parent-atlas-semantic-768-canonical-contract](openspec/changes/parent-atlas-semantic-768-canonical-contract/tasks.md#L862) Reconcile one source/revision-qualified representation owner against the — lane GENERAL; last updated 2026-09-21T19:03:38.775Z (FILESYSTEM_MTIME); ETA UNKNOWN
- [ ] **P10** [parent-atlas-retrieval-executor-compatibility-convergence](openspec/changes/parent-atlas-retrieval-executor-compatibility-convergence/tasks.md#L10) 2.2 Add a lexical PostgreSQL read-only replay test covering tsvector/GIN results, source-revision filters, and stable evidence metadata. Read-only proof added at `scripts/atlas/prove-postgres-fts-replay-v1.mjs`; it must remain open until the live replay returns revision-qualified rows rather than only unqualified FTS hits. Receipt: `docs/reports/postgres-fts-replay-v1.json`. — lane RETRIEVAL_ACE; last updated 2026-09-21T19:03:38.748Z (FILESYSTEM_MTIME); ETA UNKNOWN
- [ ] **P10** [parent-atlas-candidate-feature-execution-fabric](openspec/changes/parent-atlas-candidate-feature-execution-fabric/tasks.md#L211) FANOUT-01 Normalize all semantic results to CandidateOrdinal before feature fanout. — lane GENERAL; last updated 2026-09-21T19:03:38.720Z (FILESYSTEM_MTIME); ETA UNKNOWN
- [ ] **P10** [atlas-feature-intelligence](openspec/changes/atlas-feature-intelligence/tasks.md#L138) Canonical identity survives path/cluster/projection changes in live Postgres readback. — lane GENERAL; last updated 2026-09-21T19:03:38.691Z (FILESYSTEM_MTIME); ETA UNKNOWN
- [ ] **P10** [parent-atlas-topology-representation-admission](openspec/changes/parent-atlas-topology-representation-admission/tasks.md#L44) TOPO-02A Replace the latent writer's fallback identity/update path with — lane RETRIEVAL_ACE; last updated 2026-09-21T19:03:38.665Z (FILESYSTEM_MTIME); ETA UNKNOWN
- [ ] **P10** [parent-atlas-gpu-graph-vector-substrate](openspec/changes/parent-atlas-gpu-graph-vector-substrate/tasks.md#L47) 2.1 Canonical identity — confirm/fix the single identity join every retrieval — lane RETRIEVAL_ACE; last updated 2026-09-21T19:03:38.638Z (FILESYSTEM_MTIME); ETA UNKNOWN
- [ ] **P10** [parent-atlas-retrieval-fusion-reachability](openspec/changes/parent-atlas-retrieval-fusion-reachability/tasks.md#L1591) Add or expose the canonical identity envelope at the caller boundary, — lane RETRIEVAL_ACE; last updated 2026-09-21T19:03:38.612Z (FILESYSTEM_MTIME); ETA UNKNOWN
- [ ] **P10** [parent-atlas-pca-svd-representation-baseline](openspec/changes/parent-atlas-pca-svd-representation-baseline/tasks.md#L149) 3.1c **Define the symbol-identity contract in one place** (OpenSpec/spec, no code): confirm or amend the three — lane RETRIEVAL_ACE; last updated 2026-09-21T19:03:38.586Z (FILESYSTEM_MTIME); ETA UNKNOWN
- [ ] **P10** [parent-atlas-native-acceleration-cabi](openspec/changes/parent-atlas-native-acceleration-cabi/tasks.md#L15) P0.1 Replace session-188 global-nullable hotfix with discriminated identity contract in `feature-envelope.ts`: `identity_kind: 'symbol'|'file'|'chunk'`; symbol ⇒ `stable_symbol_id`+`symbol_version_id` non-null; file/chunk ⇒ explicitly null + `stable_file_id` required — lane RETRIEVAL_ACE; last updated 2026-09-21T19:03:38.560Z (FILESYSTEM_MTIME); ETA UNKNOWN
- [ ] **P10** [parent-atlas-gpu-sidecar-patch-tournament](openspec/changes/parent-atlas-gpu-sidecar-patch-tournament/tasks.md#L209) CAGRA endpoint (`POST /v1/knn/cagra`) with the same bounded identity manifest — tiny-fixture runtime and exact-oracle Recall@3 are proven, but production remains **quarantined** because larger-corpus recall, filter parity, revision swaps, fallback, and promotion approval are open. `RAPIDS_CAGRA_ENDPOINT: RUNTIME_PROVEN_ON_TINY_FIXTURE; PRODUCTION_QUARANTINED`. — lane GENERAL; last updated 2026-09-21T06:00:14.786Z (FILESYSTEM_MTIME); ETA UNKNOWN
- [ ] **P10** [parent-atlas-nlp-sidecar-feature-compiler](openspec/changes/parent-atlas-nlp-sidecar-feature-compiler/tasks.md#L576) 14.3a Emit `AstUnit` from treesitter-chunker into `atlas_ast_nodes` with `source_revision`+`workspace_id` on every row, and add a real-file `fixtureVerified` proof (health reports `fixtureVerified:false`); links tasks 2.1/2.2. — lane RETRIEVAL_ACE; last updated 2026-09-21T05:37:33.896Z (FILESYSTEM_MTIME); ETA UNKNOWN
- [ ] **P10** [parent-atlas-workboard-feature-utility-fabric](openspec/changes/parent-atlas-workboard-feature-utility-fabric/tasks.md#L136) Deterministic checksum; carries topic/domain/language evidence with `packet_key`, `source_ref`, `source_revision`, `producer_revision`. — lane GENERAL; last updated 2026-09-21T01:33:10.759Z (FILESYSTEM_MTIME); ETA UNKNOWN
- [ ] **P10** [parent-atlas-canonical-directory-ingestion-fabric](openspec/changes/parent-atlas-canonical-directory-ingestion-fabric/tasks.md#L69) **DIR-INDEX-04E** Add lexical fixtures for exact path, heading, symbol, body, tag/concept, and typo/substring cases with canonical candidate identity readback. — lane GENERAL; last updated 2026-09-21T00:42:48.726Z (FILESYSTEM_MTIME); ETA UNKNOWN
- [ ] **P10** [parent-atlas-neural-prefill-encoder](openspec/changes/parent-atlas-neural-prefill-encoder/tasks.md#L527) **SOURCE-REVISION-CANARY-01 — Persist one approved Graphify canary.** — lane GENERAL; last updated 2026-09-20T07:24:51.094Z (FILESYSTEM_MTIME); ETA UNKNOWN
- [ ] **P10** [manual-migration-reconciliation](openspec/changes/manual-migration-reconciliation/tasks.md#L321) Resolve the packet writer's admitted source-revision input and prove — lane GENERAL; last updated 2026-09-19T20:46:29.939Z (FILESYSTEM_MTIME); ETA UNKNOWN
- [ ] **P10** [parent-atlas-search-classifier-sidecar](openspec/changes/parent-atlas-search-classifier-sidecar/tasks.md#L571) The probe returned `source_revision="unknown"` and no grounded entities; — lane GENERAL; last updated 2026-09-18T00:47:30.906Z (FILESYSTEM_MTIME); ETA UNKNOWN
- [ ] **P10** [parent-atlas-best-fit-score-fabric](openspec/changes/parent-atlas-best-fit-score-fabric/tasks.md#L1216) **Context-prefix cache wiring and measurement**: connect the proven identity to the existing — lane GENERAL; last updated 2026-09-16T01:13:53.546Z (FILESYSTEM_MTIME); ETA UNKNOWN
- [ ] **P10** [parent-atlas-ontology-kernel](openspec/changes/parent-atlas-ontology-kernel/tasks.md#L2703) Firecrawl capture identity, content hash, evidence revision, and `.okf` — lane GENERAL; last updated 2026-09-14T16:51:04.795Z (FILESYSTEM_MTIME); ETA UNKNOWN
- [ ] **P10** [parent-atlas-pass-fabric](openspec/changes/parent-atlas-pass-fabric/tasks.md#L494) PF4D — recover `source_revision`/`pass_revision` where evidence exists — lane GENERAL; last updated 2026-09-14T01:44:50.703Z (FILESYSTEM_MTIME); ETA UNKNOWN
- [ ] **P10** [parent-atlas-query-routing-classifier](openspec/changes/parent-atlas-query-routing-classifier/tasks.md#L197) Require no canonical identity changes. — lane GENERAL; last updated 2026-09-14T01:40:58.004Z (FILESYSTEM_MTIME); ETA UNKNOWN
- [ ] **P10** [parent-atlas-telemetry-lowrank-recommendation-okf-integration](openspec/changes/parent-atlas-telemetry-lowrank-recommendation-okf-integration/tasks.md#L84) Record domain classification as a lineage-linked navigation surface, not canonical identity. — lane RESEARCH_CHALLENGER_EWIN_TANG; last updated 2026-09-07T16:46:55.636Z (FILESYSTEM_MTIME); ETA UNKNOWN
- [ ] **P10** [parent-atlas-kv-cache-adaptation-research](openspec/changes/parent-atlas-kv-cache-adaptation-research/tasks.md#L8) ORNITH-CACHE-02 measure only server-managed prefix reuse against PrefixIdentityV1: — lane GENERAL; last updated 2026-09-07T16:26:59.140Z (FILESYSTEM_MTIME); ETA UNKNOWN
- [ ] **P10** [parent-atlas-retrieval-lod-algorithm-taxonomy](openspec/changes/parent-atlas-retrieval-lod-algorithm-taxonomy/tasks.md#L189) **LOD-02** Freeze `SemanticSnapshotV1` plus ordinal/canonical identity mapping as the immutable source: workspace/source/representation/ordinal-map revisions, rows, dimension 768, float32, normalization, ordinal, `packet_key`, optional `symbol_version_id`, and checksum. LOD transitions may evict/reload derived indexes but may not delete or rewrite canonical truth. Prefer Arrow IPC/mmap for direct tensor access; do not substitute Parquet where direct mmap is required. — lane RETRIEVAL_ACE; last updated 2026-09-06T00:59:49.386Z (FILESYSTEM_MTIME); ETA UNKNOWN
- [ ] **P10** [parent-atlas-memory-architecture-freeze](openspec/changes/parent-atlas-memory-architecture-freeze/tasks.md#L267) 5.4 Not built: `OrnithPrefixIdentityV1` (checksum-bound llama.cpp prefix-cache identity — — lane GENERAL; last updated 2026-09-05T22:34:33.067Z (FILESYSTEM_MTIME); ETA UNKNOWN
- [ ] **P10** [parent-atlas-governed-compute-fabric](openspec/changes/parent-atlas-governed-compute-fabric/tasks.md#L103) 2.2 Finalize `AtlasKernelSessionV1` identity: `sessionId`, kernel/environment — lane GENERAL; last updated 2026-09-05T22:34:04.227Z (FILESYSTEM_MTIME); ETA UNKNOWN
- [ ] **P10** [parent-atlas-adaptive-dag-fabric](openspec/changes/parent-atlas-adaptive-dag-fabric/tasks.md#L313) Live Ornith identity and output parity remain environment-dependent and — lane GENERAL; last updated 2026-09-04T00:43:46.417Z (FILESYSTEM_MTIME); ETA UNKNOWN
- [ ] **P10** [parent-atlas-compute-rank-cache-eval-dspy-gepa](openspec/changes/parent-atlas-compute-rank-cache-eval-dspy-gepa/tasks.md#L17) Prove canonical identity round-trip: candidate -> packetKey/canonicalId -> FeatureRowV1 -> exact evidence. — lane GENERAL; last updated 2026-08-31T21:22:45.346Z (FILESYSTEM_MTIME); ETA UNKNOWN
- [ ] **P10** [parent-atlas-document-governance-master-index](openspec/changes/parent-atlas-document-governance-master-index/tasks.md#L29) 4.1 Finish/reconcile `parent-atlas-agentic-run-receipt-binding` T1 against current `WorkflowActionEventV1`; reuse canonical workflow/action/sequence identity. — lane GENERAL; last updated 2026-08-31T21:14:52.586Z (FILESYSTEM_MTIME); ETA UNKNOWN
- [ ] **P10** [parent-atlas-repair-candidate-feature-matrix](openspec/changes/parent-atlas-repair-candidate-feature-matrix/tasks.md#L46) Require exact live identity/revision coverage and feature-state receipt before changing that feature from `UNAVAILABLE` in a workstation proof. — lane GENERAL; last updated 2026-08-31T21:10:00.515Z (FILESYSTEM_MTIME); ETA UNKNOWN
- [ ] **P10** [parent-atlas-semantic-512-canonicalization](openspec/changes/parent-atlas-semantic-512-canonicalization/tasks.md#L177) S512-16 — Exact promotion proves **current** source span + Tree-sitter structural identity + compiler-semantic evidence and resolves UNKNOWN freshness before LLM synthesis. — lane GENERAL; last updated 2026-08-31T20:24:09.902Z (FILESYSTEM_MTIME); ETA UNKNOWN
- [ ] **P10** [parent-atlas-observation-routing-fabric](openspec/changes/parent-atlas-observation-routing-fabric/tasks.md#L182) ORF-3A — External-doc 768→512 migration dry run. Reject zero vectors; preserve document/chunk checksums; compare Recall@K and exact identity before apply. — lane GENERAL; last updated 2026-08-31T20:24:09.889Z (FILESYSTEM_MTIME); ETA UNKNOWN
- [ ] **P10** [parent-atlas-code-ingestion-pipeline](openspec/changes/parent-atlas-code-ingestion-pipeline/tasks.md#L79) **GPH-04** Stable symbol identity — separate logical `symbol_id`, revisioned `symbol_version_id`, and source span. — lane GENERAL; last updated 2026-08-31T20:24:09.813Z (FILESYSTEM_MTIME); ETA UNKNOWN
- [ ] **P10** [parent-atlas-branch-merge-consolidation-aug20](openspec/changes/parent-atlas-branch-merge-consolidation-aug20/tasks.md#L125) `cross_store_identity_verifier.ts` — lane GENERAL; last updated 2026-08-20T23:13:34.911Z (FILESYSTEM_MTIME); ETA UNKNOWN
- [ ] **P10** [parent-atlas-unordered-execution-contract](openspec/changes/parent-atlas-unordered-execution-contract/tasks.md#L33) 0A.4 After refresh, freeze `workspace_revision`, `source_revision`, — lane RETRIEVAL_ACE; last updated 2026-08-10T02:47:35.235Z (FILESYSTEM_MTIME); ETA UNKNOWN
- [ ] **P20** [parent-atlas-graphify-recovery-proof-ladder](openspec/changes/parent-atlas-graphify-recovery-proof-ladder/tasks.md#L533) Confirm `graph-projection-manifest.ts` remains the canonical place for — lane RETRIEVAL_ACE; last updated 2026-09-21T17:53:18.004Z (FILESYSTEM_MTIME); ETA UNKNOWN
- [ ] **P20** [parent-atlas-rrf-fusion-consolidation](openspec/changes/parent-atlas-rrf-fusion-consolidation/tasks.md#L112) 3.1 For each non-`CANONICAL_OWNER` primitive: migrate its callers, formally designate it a — lane GENERAL; last updated 2026-09-21T17:31:58.357Z (FILESYSTEM_MTIME); ETA UNKNOWN
- [ ] **P20** [parent-atlas-workstation-domain-classifier](openspec/changes/parent-atlas-workstation-domain-classifier/tasks.md#L342) Revision-qualified HyperRAG cache admission and live MCP/API readback — lane GENERAL; last updated 2026-09-20T06:49:07.944Z (FILESYSTEM_MTIME); ETA UNKNOWN
- [ ] **P20** [parent-atlas-okf-knowledge-layers](openspec/changes/parent-atlas-okf-knowledge-layers/tasks.md#L74) Validate existing `.okf/` files against OKF v0.2 (provenance, trust, lifecycle fields present and well-formed). — lane GENERAL; last updated 2026-09-20T06:03:32.908Z (FILESYSTEM_MTIME); ETA UNKNOWN
- [ ] **P20** [local-llm-offload-ownership](openspec/changes/local-llm-offload-ownership/tasks.md#L260) Old-alias vs canonical-name **output** parity is guaranteed by shared implementation — lane GENERAL; last updated 2026-09-19T23:49:54.428Z (FILESYSTEM_MTIME); ETA UNKNOWN
- [ ] **P20** [parent-atlas-agentic-repair-bundle-integration](openspec/changes/parent-atlas-agentic-repair-bundle-integration/tasks.md#L103) Confirm (not assume) `parent-atlas-semantic-768-canonical-contract`'s outstanding drift item — lane GENERAL; last updated 2026-09-19T09:19:23.239Z (FILESYSTEM_MTIME); ETA UNKNOWN
- [ ] **P20** [parent-atlas-onnx-webgpu-embedding-promotion](openspec/changes/parent-atlas-onnx-webgpu-embedding-promotion/tasks.md#L76) **10. Scale 15 → 128 → 768 row parity benchmark** before any eligibility/primary-lane — lane GENERAL; last updated 2026-09-17T22:48:26.979Z (FILESYSTEM_MTIME); ETA UNKNOWN
- [ ] **P20** [parent-atlas-ontology-oaklib-fanout-bitmap](openspec/changes/parent-atlas-ontology-oaklib-fanout-bitmap/tasks.md#L207) 6.3 Update `parent-atlas-retrieval-lineage-dag-convergence/tasks.md`'s ontology audit — lane RETRIEVAL_ACE; last updated 2026-09-15T23:45:14.135Z (FILESYSTEM_MTIME); ETA UNKNOWN
- [ ] **P20** [parent-atlas-tensor-residency-integration](openspec/changes/parent-atlas-tensor-residency-integration/tasks.md#L32) T2-lineage `FeatureSourceManifest`: prove a live source column exists for each of the 5 — lane GENERAL; last updated 2026-09-15T01:47:42.154Z (FILESYSTEM_MTIME); ETA UNKNOWN
- [ ] **P20** [parent-atlas-graph-analysis-contract](openspec/changes/parent-atlas-graph-analysis-contract/tasks.md#L828) Emit a fresh graph revision and provenance receipt. — lane GENERAL; last updated 2026-09-14T01:40:57.993Z (FILESYSTEM_MTIME); ETA UNKNOWN
- [ ] **P20** [parent-atlas-deep-research-ingestion](openspec/changes/parent-atlas-deep-research-ingestion/tasks.md#L22) DISCOVERY-04 reuse fetched content hashes, canonical acquisition envelope and — lane GENERAL; last updated 2026-09-05T22:35:49.269Z (FILESYSTEM_MTIME); ETA UNKNOWN
- [ ] **P20** [parent-atlas-policy-routing-integration](openspec/changes/parent-atlas-policy-routing-integration/tasks.md#L102) SOM 20x20 coordinates remain derived/not canonical. — lane GENERAL; last updated 2026-09-01T02:41:34.571Z (FILESYSTEM_MTIME); ETA UNKNOWN

## Change execution states

- [ace-hyperrag-chr97-graphify-audit](openspec/changes/ace-hyperrag-chr97-graphify-audit/) — **ADVANCEABLE**; 2 actionable, 0 waiting, 0 superseded/historical; raw progress [#######---] 5/7
- [agent-branch-review-fanout-ace-centroid-aug22](openspec/changes/agent-branch-review-fanout-ace-centroid-aug22/) — **ADVANCEABLE**; 3 actionable, 0 waiting, 0 superseded/historical; raw progress [#########-] 17/20
- [atlas-feature-intelligence](openspec/changes/atlas-feature-intelligence/) — **MIXED_ACTIONABLE_AND_WAITING**; 40 actionable, 15 waiting, 1 superseded/historical; raw progress [###-------] 24/80
- [codereview-inference-wiring-followup-aug22](openspec/changes/codereview-inference-wiring-followup-aug22/) — **COMPLETE**; 0 actionable, 0 waiting, 0 superseded/historical; raw progress [##########] 10/10
- [codereview-semantic-dimension-regression-aug22](openspec/changes/codereview-semantic-dimension-regression-aug22/) — **COMPLETE**; 0 actionable, 0 waiting, 0 superseded/historical; raw progress [##########] 12/12
- [deep-audit-code-gates-aug22](openspec/changes/deep-audit-code-gates-aug22/) — **MIXED_ACTIONABLE_AND_WAITING**; 12 actionable, 1 waiting, 0 superseded/historical; raw progress [#####-----] 15/28
- [docker-compose-duplication-remediation](openspec/changes/docker-compose-duplication-remediation/) — **COMPLETE**; 0 actionable, 0 waiting, 0 superseded/historical; raw progress [##########] 9/9
- [feature-label-semantic-derivation](openspec/changes/feature-label-semantic-derivation/) — **ADVANCEABLE**; 1 actionable, 0 waiting, 0 superseded/historical; raw progress [#######---] 2/3
- [inference-wiring-deep-audit-aug22](openspec/changes/inference-wiring-deep-audit-aug22/) — **MIXED_ACTIONABLE_AND_WAITING**; 1 actionable, 1 waiting, 0 superseded/historical; raw progress [##########] 54/56
- [local-llm-offload-ownership](openspec/changes/local-llm-offload-ownership/) — **MIXED_ACTIONABLE_AND_WAITING**; 18 actionable, 1 waiting, 0 superseded/historical; raw progress [#######---] 43/62
- [manual-migration-reconciliation](openspec/changes/manual-migration-reconciliation/) — **MIXED_ACTIONABLE_AND_WAITING**; 24 actionable, 5 waiting, 0 superseded/historical; raw progress [#######---] 60/89
- [parent-atlas-ace-bitfrost-cache-correctness](openspec/changes/parent-atlas-ace-bitfrost-cache-correctness/) — **MIXED_ACTIONABLE_AND_WAITING**; 28 actionable, 5 waiting, 0 superseded/historical; raw progress [######----] 56/89
- [parent-atlas-ace-rlm-bitfrost-integration](openspec/changes/parent-atlas-ace-rlm-bitfrost-integration/) — **MIXED_ACTIONABLE_AND_WAITING**; 119 actionable, 88 waiting, 4 superseded/historical; raw progress [########--] 698/909
- [parent-atlas-adaptive-dag-fabric](openspec/changes/parent-atlas-adaptive-dag-fabric/) — **ADVANCEABLE**; 5 actionable, 0 waiting, 1 superseded/historical; raw progress [#####-----] 7/13
- [parent-atlas-agentic-completion](openspec/changes/parent-atlas-agentic-completion/) — **MIXED_ACTIONABLE_AND_WAITING**; 1 actionable, 1 waiting, 0 superseded/historical; raw progress [########--] 9/11
- [parent-atlas-agentic-file-compiler](openspec/changes/parent-atlas-agentic-file-compiler/) — **MIXED_ACTIONABLE_AND_WAITING**; 8 actionable, 2 waiting, 0 superseded/historical; raw progress [#######---] 24/34
- [parent-atlas-agentic-repair-bundle-integration](openspec/changes/parent-atlas-agentic-repair-bundle-integration/) — **MIXED_ACTIONABLE_AND_WAITING**; 45 actionable, 13 waiting, 1 superseded/historical; raw progress [###-------] 25/84
- [parent-atlas-agentic-repair-fabric](openspec/changes/parent-atlas-agentic-repair-fabric/) — **ADVANCEABLE**; 1 actionable, 0 waiting, 0 superseded/historical; raw progress [##########] 37/38
- [parent-atlas-agentic-run-receipt-binding](openspec/changes/parent-atlas-agentic-run-receipt-binding/) — **COMPLETE**; 0 actionable, 0 waiting, 0 superseded/historical; raw progress [##########] 16/16
- [parent-atlas-analysis-pass-ornith-adapter](openspec/changes/parent-atlas-analysis-pass-ornith-adapter/) — **ADVANCEABLE**; 1 actionable, 0 waiting, 0 superseded/historical; raw progress [##########] 24/25
- [parent-atlas-autoresearch-fabric](openspec/changes/parent-atlas-autoresearch-fabric/) — **COMPLETE**; 0 actionable, 0 waiting, 0 superseded/historical; raw progress [##########] 8/8
- [parent-atlas-best-fit-score-fabric](openspec/changes/parent-atlas-best-fit-score-fabric/) — **MIXED_ACTIONABLE_AND_WAITING**; 189 actionable, 82 waiting, 3 superseded/historical; raw progress [######----] 404/678
- [parent-atlas-branch-merge-consolidation-aug20](openspec/changes/parent-atlas-branch-merge-consolidation-aug20/) — **ADVANCEABLE**; 17 actionable, 0 waiting, 0 superseded/historical; raw progress [#####-----] 18/35
- [parent-atlas-candidate-feature-execution-fabric](openspec/changes/parent-atlas-candidate-feature-execution-fabric/) — **MIXED_ACTIONABLE_AND_WAITING**; 62 actionable, 31 waiting, 1 superseded/historical; raw progress [#######---] 228/322
- [parent-atlas-canonical-directory-ingestion-fabric](openspec/changes/parent-atlas-canonical-directory-ingestion-fabric/) — **ADVANCEABLE**; 44 actionable, 0 waiting, 1 superseded/historical; raw progress [###-------] 21/66
- [parent-atlas-chunk-index-whole-file-hash](openspec/changes/parent-atlas-chunk-index-whole-file-hash/) — **COMPLETE**; 0 actionable, 0 waiting, 0 superseded/historical; raw progress [##########] 17/17
- [parent-atlas-code-ingestion-pipeline](openspec/changes/parent-atlas-code-ingestion-pipeline/) — **ADVANCEABLE**; 7 actionable, 0 waiting, 5 superseded/historical; raw progress [#######---] 23/35
- [parent-atlas-compiler-semantic-graph-resolution](openspec/changes/parent-atlas-compiler-semantic-graph-resolution/) — **MIXED_ACTIONABLE_AND_WAITING**; 15 actionable, 3 waiting, 0 superseded/historical; raw progress [#######---] 40/58
- [parent-atlas-compute-rank-cache-eval-dspy-gepa](openspec/changes/parent-atlas-compute-rank-cache-eval-dspy-gepa/) — **MIXED_ACTIONABLE_AND_WAITING**; 42 actionable, 8 waiting, 1 superseded/historical; raw progress [###-------] 18/69
- [parent-atlas-deep-research-ingestion](openspec/changes/parent-atlas-deep-research-ingestion/) — **ADVANCEABLE**; 5 actionable, 0 waiting, 0 superseded/historical; raw progress [##--------] 1/6
- [parent-atlas-document-governance-master-index](openspec/changes/parent-atlas-document-governance-master-index/) — **MIXED_ACTIONABLE_AND_WAITING**; 40 actionable, 6 waiting, 11 superseded/historical; raw progress [#---------] 7/64
- [parent-atlas-error-embedding-768-migration](openspec/changes/parent-atlas-error-embedding-768-migration/) — **ADVANCEABLE**; 13 actionable, 0 waiting, 0 superseded/historical; raw progress [#####-----] 12/25
- [parent-atlas-gate2-chunk-lineage-convergence](openspec/changes/parent-atlas-gate2-chunk-lineage-convergence/) — **MIXED_ACTIONABLE_AND_WAITING**; 16 actionable, 1 waiting, 0 superseded/historical; raw progress [##--------] 3/20
- [parent-atlas-governed-compute-fabric](openspec/changes/parent-atlas-governed-compute-fabric/) — **MIXED_ACTIONABLE_AND_WAITING**; 149 actionable, 7 waiting, 0 superseded/historical; raw progress [----------] 2/158
- [parent-atlas-gpu-graph-vector-substrate](openspec/changes/parent-atlas-gpu-graph-vector-substrate/) — **MIXED_ACTIONABLE_AND_WAITING**; 24 actionable, 1 waiting, 0 superseded/historical; raw progress [#---------] 2/27
- [parent-atlas-gpu-prellm-recommendation-v1](openspec/changes/parent-atlas-gpu-prellm-recommendation-v1/) — **ADVANCEABLE**; 3 actionable, 0 waiting, 1 superseded/historical; raw progress [#########-] 33/37
- [parent-atlas-gpu-runtime-abi-alignment](openspec/changes/parent-atlas-gpu-runtime-abi-alignment/) — **MIXED_ACTIONABLE_AND_WAITING**; 4 actionable, 1 waiting, 0 superseded/historical; raw progress [########--] 17/22
- [parent-atlas-gpu-sidecar-patch-tournament](openspec/changes/parent-atlas-gpu-sidecar-patch-tournament/) — **MIXED_ACTIONABLE_AND_WAITING**; 51 actionable, 7 waiting, 3 superseded/historical; raw progress [##--------] 17/78
- [parent-atlas-graph-analysis-contract](openspec/changes/parent-atlas-graph-analysis-contract/) — **MIXED_ACTIONABLE_AND_WAITING**; 20 actionable, 2 waiting, 0 superseded/historical; raw progress [#######---] 62/84
- [parent-atlas-graph-pagerank-okf-fanout-hardening](openspec/changes/parent-atlas-graph-pagerank-okf-fanout-hardening/) — **ADVANCEABLE**; 1 actionable, 0 waiting, 0 superseded/historical; raw progress [########--] 3/4
- [parent-atlas-graph-retrieval-proof](openspec/changes/parent-atlas-graph-retrieval-proof/) — **MIXED_ACTIONABLE_AND_WAITING**; 116 actionable, 9 waiting, 2 superseded/historical; raw progress [######----] 157/284
- [parent-atlas-graph-runtime-enhancement](openspec/changes/parent-atlas-graph-runtime-enhancement/) — **MIXED_ACTIONABLE_AND_WAITING**; 5 actionable, 1 waiting, 0 superseded/historical; raw progress [###-------] 2/8
- [parent-atlas-graph-runtime-python-consolidation](openspec/changes/parent-atlas-graph-runtime-python-consolidation/) — **MIXED_ACTIONABLE_AND_WAITING**; 11 actionable, 2 waiting, 0 superseded/historical; raw progress [###-------] 5/18
- [parent-atlas-graph-validation-fabric](openspec/changes/parent-atlas-graph-validation-fabric/) — **MIXED_ACTIONABLE_AND_WAITING**; 18 actionable, 15 waiting, 0 superseded/historical; raw progress [######----] 61/94
- [parent-atlas-graphify-recovery-proof-ladder](openspec/changes/parent-atlas-graphify-recovery-proof-ladder/) — **MIXED_ACTIONABLE_AND_WAITING**; 6 actionable, 2 waiting, 0 superseded/historical; raw progress [#---------] 1/9
- [parent-atlas-grounded-knowledge-fabric](openspec/changes/parent-atlas-grounded-knowledge-fabric/) — **MIXED_ACTIONABLE_AND_WAITING**; 5 actionable, 6 waiting, 0 superseded/historical; raw progress [######----] 14/25
- [parent-atlas-kv-cache-adaptation-research](openspec/changes/parent-atlas-kv-cache-adaptation-research/) — **MIXED_ACTIONABLE_AND_WAITING**; 22 actionable, 1 waiting, 0 superseded/historical; raw progress [#---------] 4/27
- [parent-atlas-memory-architecture-freeze](openspec/changes/parent-atlas-memory-architecture-freeze/) — **ADVANCEABLE**; 12 actionable, 0 waiting, 0 superseded/historical; raw progress [######----] 19/31
- [parent-atlas-native-acceleration-cabi](openspec/changes/parent-atlas-native-acceleration-cabi/) — **ADVANCEABLE**; 49 actionable, 0 waiting, 0 superseded/historical; raw progress [##--------] 14/63
- [parent-atlas-neural-prefill-encoder](openspec/changes/parent-atlas-neural-prefill-encoder/) — **MIXED_ACTIONABLE_AND_WAITING**; 490 actionable, 156 waiting, 6 superseded/historical; raw progress [#######---] 1531/2185
- [parent-atlas-nlp-sidecar-feature-compiler](openspec/changes/parent-atlas-nlp-sidecar-feature-compiler/) — **MIXED_ACTIONABLE_AND_WAITING**; 36 actionable, 15 waiting, 3 superseded/historical; raw progress [#####-----] 65/119
- [parent-atlas-observation-routing-fabric](openspec/changes/parent-atlas-observation-routing-fabric/) — **MIXED_ACTIONABLE_AND_WAITING**; 9 actionable, 1 waiting, 0 superseded/historical; raw progress [######----] 16/26
- [parent-atlas-okf-knowledge-layers](openspec/changes/parent-atlas-okf-knowledge-layers/) — **MIXED_ACTIONABLE_AND_WAITING**; 6 actionable, 1 waiting, 0 superseded/historical; raw progress [########--] 34/41
- [parent-atlas-onnx-webgpu-embedding-promotion](openspec/changes/parent-atlas-onnx-webgpu-embedding-promotion/) — **ADVANCEABLE**; 13 actionable, 0 waiting, 0 superseded/historical; raw progress [##--------] 4/17
- [parent-atlas-ontology-kernel](openspec/changes/parent-atlas-ontology-kernel/) — **MIXED_ACTIONABLE_AND_WAITING**; 57 actionable, 33 waiting, 0 superseded/historical; raw progress [#######---] 218/308
- [parent-atlas-ontology-oaklib-fanout-bitmap](openspec/changes/parent-atlas-ontology-oaklib-fanout-bitmap/) — **ADVANCEABLE**; 7 actionable, 0 waiting, 0 superseded/historical; raw progress [########--] 29/36
- [parent-atlas-opencode-replay-proof](openspec/changes/parent-atlas-opencode-replay-proof/) — **MIXED_ACTIONABLE_AND_WAITING**; 13 actionable, 4 waiting, 0 superseded/historical; raw progress [#---------] 2/19
- [parent-atlas-openspec-tasks-audit-fabric](openspec/changes/parent-atlas-openspec-tasks-audit-fabric/) — **COMPLETE**; 0 actionable, 0 waiting, 0 superseded/historical; raw progress [##########] 11/11
- [parent-atlas-openspec-workstation-synthesis](openspec/changes/parent-atlas-openspec-workstation-synthesis/) — **COMPLETE**; 0 actionable, 0 waiting, 0 superseded/historical; raw progress [##########] 31/31
- [parent-atlas-pass-fabric](openspec/changes/parent-atlas-pass-fabric/) — **ADVANCEABLE**; 41 actionable, 0 waiting, 0 superseded/historical; raw progress [###-------] 15/56
- [parent-atlas-pca-svd-representation-baseline](openspec/changes/parent-atlas-pca-svd-representation-baseline/) — **MIXED_ACTIONABLE_AND_WAITING**; 10 actionable, 1 waiting, 0 superseded/historical; raw progress [####------] 7/18
- [parent-atlas-policy-routing-integration](openspec/changes/parent-atlas-policy-routing-integration/) — **MIXED_ACTIONABLE_AND_WAITING**; 14 actionable, 1 waiting, 0 superseded/historical; raw progress [######----] 25/40
- [parent-atlas-prefill-routing-residency-convergence](openspec/changes/parent-atlas-prefill-routing-residency-convergence/) — **MIXED_ACTIONABLE_AND_WAITING**; 22 actionable, 5 waiting, 0 superseded/historical; raw progress [########--] 125/152
- [parent-atlas-qdrant-structural-payload-enrichment](openspec/changes/parent-atlas-qdrant-structural-payload-enrichment/) — **MIXED_ACTIONABLE_AND_WAITING**; 7 actionable, 1 waiting, 0 superseded/historical; raw progress [#######---] 15/23
- [parent-atlas-query-routing-classifier](openspec/changes/parent-atlas-query-routing-classifier/) — **MIXED_ACTIONABLE_AND_WAITING**; 54 actionable, 3 waiting, 0 superseded/historical; raw progress [####------] 41/98
- [parent-atlas-repair-candidate-feature-matrix](openspec/changes/parent-atlas-repair-candidate-feature-matrix/) — **MIXED_ACTIONABLE_AND_WAITING**; 6 actionable, 1 waiting, 0 superseded/historical; raw progress [########--] 34/41
- [parent-atlas-retrieval-executor-compatibility-convergence](openspec/changes/parent-atlas-retrieval-executor-compatibility-convergence/) — **ADVANCEABLE**; 9 actionable, 0 waiting, 0 superseded/historical; raw progress [########--] 39/48
- [parent-atlas-retrieval-fusion-reachability](openspec/changes/parent-atlas-retrieval-fusion-reachability/) — **MIXED_ACTIONABLE_AND_WAITING**; 11 actionable, 14 waiting, 0 superseded/historical; raw progress [########--] 119/144
- [parent-atlas-retrieval-lineage-dag-convergence](openspec/changes/parent-atlas-retrieval-lineage-dag-convergence/) — **MIXED_ACTIONABLE_AND_WAITING**; 105 actionable, 122 waiting, 11 superseded/historical; raw progress [########--] 736/974
- [parent-atlas-retrieval-lod-algorithm-taxonomy](openspec/changes/parent-atlas-retrieval-lod-algorithm-taxonomy/) — **MIXED_ACTIONABLE_AND_WAITING**; 50 actionable, 1 waiting, 1 superseded/historical; raw progress [#####-----] 52/104
- [parent-atlas-retrieval-logic-convergence](openspec/changes/parent-atlas-retrieval-logic-convergence/) — **ADVANCEABLE**; 42 actionable, 0 waiting, 0 superseded/historical; raw progress [####------] 32/74
- [parent-atlas-rpc-packet-registry-fabric](openspec/changes/parent-atlas-rpc-packet-registry-fabric/) — **COMPLETE**; 0 actionable, 0 waiting, 0 superseded/historical; raw progress [##########] 27/27
- [parent-atlas-rrf-fusion-consolidation](openspec/changes/parent-atlas-rrf-fusion-consolidation/) — **ADVANCEABLE**; 1 actionable, 0 waiting, 0 superseded/historical; raw progress [########--] 5/6
- [parent-atlas-search-classifier-sidecar](openspec/changes/parent-atlas-search-classifier-sidecar/) — **MIXED_ACTIONABLE_AND_WAITING**; 4 actionable, 12 waiting, 0 superseded/historical; raw progress [########--] 70/86
- [parent-atlas-semantic-512-canonicalization](openspec/changes/parent-atlas-semantic-512-canonicalization/) — **MIXED_ACTIONABLE_AND_WAITING**; 5 actionable, 3 waiting, 0 superseded/historical; raw progress [#######---] 23/31
- [parent-atlas-semantic-768-canonical-contract](openspec/changes/parent-atlas-semantic-768-canonical-contract/) — **MIXED_ACTIONABLE_AND_WAITING**; 8 actionable, 17 waiting, 0 superseded/historical; raw progress [######----] 45/70
- [parent-atlas-telemetry-lowrank-recommendation-okf-integration](openspec/changes/parent-atlas-telemetry-lowrank-recommendation-okf-integration/) — **MIXED_ACTIONABLE_AND_WAITING**; 24 actionable, 5 waiting, 0 superseded/historical; raw progress [#---------] 2/31
- [parent-atlas-tensor-residency-integration](openspec/changes/parent-atlas-tensor-residency-integration/) — **MIXED_ACTIONABLE_AND_WAITING**; 47 actionable, 8 waiting, 0 superseded/historical; raw progress [######----] 96/151
- [parent-atlas-topology-representation-admission](openspec/changes/parent-atlas-topology-representation-admission/) — **ADVANCEABLE**; 19 actionable, 0 waiting, 0 superseded/historical; raw progress [##--------] 6/25
- [parent-atlas-transport-memory-boundaries](openspec/changes/parent-atlas-transport-memory-boundaries/) — **MIXED_ACTIONABLE_AND_WAITING**; 58 actionable, 6 waiting, 2 superseded/historical; raw progress [###-------] 23/89
- [parent-atlas-unified-symbol-ranking](openspec/changes/parent-atlas-unified-symbol-ranking/) — **COMPLETE**; 0 actionable, 0 waiting, 0 superseded/historical; raw progress [##########] 17/17
- [parent-atlas-unordered-execution-contract](openspec/changes/parent-atlas-unordered-execution-contract/) — **MIXED_ACTIONABLE_AND_WAITING**; 17 actionable, 2 waiting, 0 superseded/historical; raw progress [###-------] 7/26
- [parent-atlas-versioned-doc-intelligence](openspec/changes/parent-atlas-versioned-doc-intelligence/) — **ADVANCEABLE**; 15 actionable, 0 waiting, 0 superseded/historical; raw progress [#####-----] 16/31
- [parent-atlas-workboard-feature-utility-fabric](openspec/changes/parent-atlas-workboard-feature-utility-fabric/) — **MIXED_ACTIONABLE_AND_WAITING**; 46 actionable, 9 waiting, 1 superseded/historical; raw progress [##--------] 11/67
- [parent-atlas-workstation-domain-classifier](openspec/changes/parent-atlas-workstation-domain-classifier/) — **MIXED_ACTIONABLE_AND_WAITING**; 14 actionable, 12 waiting, 0 superseded/historical; raw progress [########--] 115/141
- [parent-atlas-xgboost-cuda-runtime-proof](openspec/changes/parent-atlas-xgboost-cuda-runtime-proof/) — **MIXED_ACTIONABLE_AND_WAITING**; 16 actionable, 2 waiting, 0 superseded/historical; raw progress [####------] 12/30
- [phase79-canonical-workflow-action-wiring](openspec/changes/phase79-canonical-workflow-action-wiring/) — **COMPLETE**; 0 actionable, 0 waiting, 0 superseded/historical; raw progress [##########] 16/16
- [route-import-infra-isolation](openspec/changes/route-import-infra-isolation/) — **ADVANCEABLE**; 3 actionable, 0 waiting, 0 superseded/historical; raw progress [########--] 14/17

## Task indexing coverage

- Declared source_ref: 2/9393
- Declared source_revision: 4/9393
- Task ledger source pointer: 9393/9393 (OpenSpec file + line)
- Metadata-unclassified rows: 9387/9393; no source identity was inferred.
- Declared source fields are optional task metadata, not a measure of repository evidence coverage.

## Execution lanes

- **DAILY_GRAPHIFY_KANBAN** 12 open / 22 total
- **GENERAL** 2144 open / 5612 total
- **RESEARCH_CHALLENGER_EWIN_TANG** 31 open / 37 total
- **RETRIEVAL_ACE** 1160 open / 3722 total

## Lane dependencies

- **RESEARCH_CHALLENGER_EWIN_TANG** depends on DAILY_GRAPHIFY_KANBAN — RECEIPT_BACKED_RECOMMENDATIONS_ONLY; Ewin Tang remains an offline challenger; Daily Graphify may supply reviewed recommendation cards, never automatic canonical promotion.
- **RETRIEVAL_ACE** depends on DAILY_GRAPHIFY_KANBAN — EVIDENCE_AND_REVISION_BOUND; ACE may consume Graphify receipts after identity and source-revision eligibility checks.

## Daily Graphify Kanban reference

- Status: **STALE_SNAPSHOT**; source: docs/graph/kanban-board.json
- Snapshot age: 79.2 days; tasks: 123; sourceRefs: 246
- This snapshot is a reference/input surface only; it is not canonical identity or task authority.

## Historical and consolidation task sources

- **HISTORICAL_TASK_RANKING_REFERENCE** HISTORICAL_OR_STALE: memory/exports/kanban-ranking-report.json; task/board records 858; age 102.8 days
- **CURRENT_CONSOLIDATION_INPUT_REFERENCE** CURRENT_BOUNDED: docs/reports/kanban-turbovec-consolidation-latest.json; task/board records 123; age 0 days
- Historical ranking reports and consolidation inputs are evidence sources only; they are not merged into the OpenSpec task count automatically.

## Current consolidation reference

- Status: **CURRENT_BOUNDED_REFERENCE**; groups: 48; actions: 4; sourceRefs: 112; feature IDs: 110
- Consolidation groups remain candidate merges. They do not automatically close, rewrite, or merge OpenSpec tasks.

## Highest-volume consolidation candidates

- **todo-c-users-james-videos-deeds-web-app-master-feature-todo-2026-05-20-md:cluster:90** 7/7 open; 5 feature IDs; review only
- **todo-c-users-james-videos-deeds-web-app-master-feature-todo-2026-05-20-md:cluster:5** 6/6 open; 5 feature IDs; review only
- **lib:cluster:18** 5/5 open; 0 feature IDs; review only
- **todo-c-users-james-videos-deeds-web-app-master-feature-todo-2026-05-20-md:cluster:0** 5/5 open; 5 feature IDs; review only
- **todo-c-users-james-videos-deeds-web-app-master-feature-todo-2026-05-20-md:cluster:109** 5/5 open; 5 feature IDs; review only
- **todo-c-users-james-videos-deeds-web-app-master-feature-todo-2026-05-20-md:cluster:113** 5/5 open; 5 feature IDs; review only
- **todo-c-users-james-videos-deeds-web-app-master-feature-todo-2026-05-20-md:cluster:127** 5/5 open; 5 feature IDs; review only
- **todo-c-users-james-videos-deeds-web-app-master-feature-todo-2026-05-20-md:cluster:79** 5/5 open; 5 feature IDs; review only
- **lib:cluster:none** 4/4 open; 0 feature IDs; review only
- **todo-c-users-james-videos-deeds-web-app-master-feature-todo-2026-05-20-md:cluster:102** 4/4 open; 4 feature IDs; review only

## Change progress

- [ace-hyperrag-chr97-graphify-audit](openspec/changes/ace-hyperrag-chr97-graphify-audit/) [#######---] 5/7 complete; 2 open
- [agent-branch-review-fanout-ace-centroid-aug22](openspec/changes/agent-branch-review-fanout-ace-centroid-aug22/) [#########-] 17/20 complete; 3 open
- [atlas-feature-intelligence](openspec/changes/atlas-feature-intelligence/) [###-------] 24/80 complete; 56 open
- [codereview-inference-wiring-followup-aug22](openspec/changes/codereview-inference-wiring-followup-aug22/) [##########] 10/10 complete; 0 open
- [codereview-semantic-dimension-regression-aug22](openspec/changes/codereview-semantic-dimension-regression-aug22/) [##########] 12/12 complete; 0 open
- [deep-audit-code-gates-aug22](openspec/changes/deep-audit-code-gates-aug22/) [#####-----] 15/28 complete; 13 open
- [docker-compose-duplication-remediation](openspec/changes/docker-compose-duplication-remediation/) [##########] 9/9 complete; 0 open
- [feature-label-semantic-derivation](openspec/changes/feature-label-semantic-derivation/) [#######---] 2/3 complete; 1 open
- [inference-wiring-deep-audit-aug22](openspec/changes/inference-wiring-deep-audit-aug22/) [##########] 54/56 complete; 2 open
- [local-llm-offload-ownership](openspec/changes/local-llm-offload-ownership/) [#######---] 43/62 complete; 19 open
- [manual-migration-reconciliation](openspec/changes/manual-migration-reconciliation/) [#######---] 60/89 complete; 29 open
- [parent-atlas-ace-bitfrost-cache-correctness](openspec/changes/parent-atlas-ace-bitfrost-cache-correctness/) [######----] 56/89 complete; 33 open
- [parent-atlas-ace-rlm-bitfrost-integration](openspec/changes/parent-atlas-ace-rlm-bitfrost-integration/) [########--] 698/909 complete; 211 open
- [parent-atlas-adaptive-dag-fabric](openspec/changes/parent-atlas-adaptive-dag-fabric/) [#####-----] 7/13 complete; 6 open
- [parent-atlas-agentic-completion](openspec/changes/parent-atlas-agentic-completion/) [########--] 9/11 complete; 2 open
- [parent-atlas-agentic-file-compiler](openspec/changes/parent-atlas-agentic-file-compiler/) [#######---] 24/34 complete; 10 open
- [parent-atlas-agentic-repair-bundle-integration](openspec/changes/parent-atlas-agentic-repair-bundle-integration/) [###-------] 25/84 complete; 59 open
- [parent-atlas-agentic-repair-fabric](openspec/changes/parent-atlas-agentic-repair-fabric/) [##########] 37/38 complete; 1 open
- [parent-atlas-agentic-run-receipt-binding](openspec/changes/parent-atlas-agentic-run-receipt-binding/) [##########] 16/16 complete; 0 open
- [parent-atlas-analysis-pass-ornith-adapter](openspec/changes/parent-atlas-analysis-pass-ornith-adapter/) [##########] 24/25 complete; 1 open
- [parent-atlas-autoresearch-fabric](openspec/changes/parent-atlas-autoresearch-fabric/) [##########] 8/8 complete; 0 open
- [parent-atlas-best-fit-score-fabric](openspec/changes/parent-atlas-best-fit-score-fabric/) [######----] 404/678 complete; 274 open
- [parent-atlas-branch-merge-consolidation-aug20](openspec/changes/parent-atlas-branch-merge-consolidation-aug20/) [#####-----] 18/35 complete; 17 open
- [parent-atlas-candidate-feature-execution-fabric](openspec/changes/parent-atlas-candidate-feature-execution-fabric/) [#######---] 228/322 complete; 94 open
- [parent-atlas-canonical-directory-ingestion-fabric](openspec/changes/parent-atlas-canonical-directory-ingestion-fabric/) [###-------] 21/66 complete; 45 open
- [parent-atlas-chunk-index-whole-file-hash](openspec/changes/parent-atlas-chunk-index-whole-file-hash/) [##########] 17/17 complete; 0 open
- [parent-atlas-code-ingestion-pipeline](openspec/changes/parent-atlas-code-ingestion-pipeline/) [#######---] 23/35 complete; 12 open
- [parent-atlas-compiler-semantic-graph-resolution](openspec/changes/parent-atlas-compiler-semantic-graph-resolution/) [#######---] 40/58 complete; 18 open
- [parent-atlas-compute-rank-cache-eval-dspy-gepa](openspec/changes/parent-atlas-compute-rank-cache-eval-dspy-gepa/) [###-------] 18/69 complete; 51 open
- [parent-atlas-deep-research-ingestion](openspec/changes/parent-atlas-deep-research-ingestion/) [##--------] 1/6 complete; 5 open
- [parent-atlas-document-governance-master-index](openspec/changes/parent-atlas-document-governance-master-index/) [#---------] 7/64 complete; 57 open
- [parent-atlas-error-embedding-768-migration](openspec/changes/parent-atlas-error-embedding-768-migration/) [#####-----] 12/25 complete; 13 open
- [parent-atlas-gate2-chunk-lineage-convergence](openspec/changes/parent-atlas-gate2-chunk-lineage-convergence/) [##--------] 3/20 complete; 17 open
- [parent-atlas-governed-compute-fabric](openspec/changes/parent-atlas-governed-compute-fabric/) [----------] 2/158 complete; 156 open
- [parent-atlas-gpu-graph-vector-substrate](openspec/changes/parent-atlas-gpu-graph-vector-substrate/) [#---------] 2/27 complete; 25 open
- [parent-atlas-gpu-prellm-recommendation-v1](openspec/changes/parent-atlas-gpu-prellm-recommendation-v1/) [#########-] 33/37 complete; 4 open
- [parent-atlas-gpu-runtime-abi-alignment](openspec/changes/parent-atlas-gpu-runtime-abi-alignment/) [########--] 17/22 complete; 5 open
- [parent-atlas-gpu-sidecar-patch-tournament](openspec/changes/parent-atlas-gpu-sidecar-patch-tournament/) [##--------] 17/78 complete; 61 open
- [parent-atlas-graph-analysis-contract](openspec/changes/parent-atlas-graph-analysis-contract/) [#######---] 62/84 complete; 22 open
- [parent-atlas-graph-pagerank-okf-fanout-hardening](openspec/changes/parent-atlas-graph-pagerank-okf-fanout-hardening/) [########--] 3/4 complete; 1 open
- [parent-atlas-graph-retrieval-proof](openspec/changes/parent-atlas-graph-retrieval-proof/) [######----] 157/284 complete; 127 open
- [parent-atlas-graph-runtime-enhancement](openspec/changes/parent-atlas-graph-runtime-enhancement/) [###-------] 2/8 complete; 6 open
- [parent-atlas-graph-runtime-python-consolidation](openspec/changes/parent-atlas-graph-runtime-python-consolidation/) [###-------] 5/18 complete; 13 open
- [parent-atlas-graph-validation-fabric](openspec/changes/parent-atlas-graph-validation-fabric/) [######----] 61/94 complete; 33 open
- [parent-atlas-graphify-recovery-proof-ladder](openspec/changes/parent-atlas-graphify-recovery-proof-ladder/) [#---------] 1/9 complete; 8 open
- [parent-atlas-grounded-knowledge-fabric](openspec/changes/parent-atlas-grounded-knowledge-fabric/) [######----] 14/25 complete; 11 open
- [parent-atlas-kv-cache-adaptation-research](openspec/changes/parent-atlas-kv-cache-adaptation-research/) [#---------] 4/27 complete; 23 open
- [parent-atlas-memory-architecture-freeze](openspec/changes/parent-atlas-memory-architecture-freeze/) [######----] 19/31 complete; 12 open
- [parent-atlas-native-acceleration-cabi](openspec/changes/parent-atlas-native-acceleration-cabi/) [##--------] 14/63 complete; 49 open
- [parent-atlas-neural-prefill-encoder](openspec/changes/parent-atlas-neural-prefill-encoder/) [#######---] 1531/2185 complete; 654 open
- [parent-atlas-nlp-sidecar-feature-compiler](openspec/changes/parent-atlas-nlp-sidecar-feature-compiler/) [#####-----] 65/119 complete; 54 open
- [parent-atlas-observation-routing-fabric](openspec/changes/parent-atlas-observation-routing-fabric/) [######----] 16/26 complete; 10 open
- [parent-atlas-okf-knowledge-layers](openspec/changes/parent-atlas-okf-knowledge-layers/) [########--] 34/41 complete; 7 open
- [parent-atlas-onnx-webgpu-embedding-promotion](openspec/changes/parent-atlas-onnx-webgpu-embedding-promotion/) [##--------] 4/17 complete; 13 open
- [parent-atlas-ontology-kernel](openspec/changes/parent-atlas-ontology-kernel/) [#######---] 218/308 complete; 90 open
- [parent-atlas-ontology-oaklib-fanout-bitmap](openspec/changes/parent-atlas-ontology-oaklib-fanout-bitmap/) [########--] 29/36 complete; 7 open
- [parent-atlas-opencode-replay-proof](openspec/changes/parent-atlas-opencode-replay-proof/) [#---------] 2/19 complete; 17 open
- [parent-atlas-openspec-tasks-audit-fabric](openspec/changes/parent-atlas-openspec-tasks-audit-fabric/) [##########] 11/11 complete; 0 open
- [parent-atlas-openspec-workstation-synthesis](openspec/changes/parent-atlas-openspec-workstation-synthesis/) [##########] 31/31 complete; 0 open
- [parent-atlas-pass-fabric](openspec/changes/parent-atlas-pass-fabric/) [###-------] 15/56 complete; 41 open
- [parent-atlas-pca-svd-representation-baseline](openspec/changes/parent-atlas-pca-svd-representation-baseline/) [####------] 7/18 complete; 11 open
- [parent-atlas-policy-routing-integration](openspec/changes/parent-atlas-policy-routing-integration/) [######----] 25/40 complete; 15 open
- [parent-atlas-prefill-routing-residency-convergence](openspec/changes/parent-atlas-prefill-routing-residency-convergence/) [########--] 125/152 complete; 27 open
- [parent-atlas-qdrant-structural-payload-enrichment](openspec/changes/parent-atlas-qdrant-structural-payload-enrichment/) [#######---] 15/23 complete; 8 open
- [parent-atlas-query-routing-classifier](openspec/changes/parent-atlas-query-routing-classifier/) [####------] 41/98 complete; 57 open
- [parent-atlas-repair-candidate-feature-matrix](openspec/changes/parent-atlas-repair-candidate-feature-matrix/) [########--] 34/41 complete; 7 open
- [parent-atlas-retrieval-executor-compatibility-convergence](openspec/changes/parent-atlas-retrieval-executor-compatibility-convergence/) [########--] 39/48 complete; 9 open
- [parent-atlas-retrieval-fusion-reachability](openspec/changes/parent-atlas-retrieval-fusion-reachability/) [########--] 119/144 complete; 25 open
- [parent-atlas-retrieval-lineage-dag-convergence](openspec/changes/parent-atlas-retrieval-lineage-dag-convergence/) [########--] 736/974 complete; 238 open
- [parent-atlas-retrieval-lod-algorithm-taxonomy](openspec/changes/parent-atlas-retrieval-lod-algorithm-taxonomy/) [#####-----] 52/104 complete; 52 open
- [parent-atlas-retrieval-logic-convergence](openspec/changes/parent-atlas-retrieval-logic-convergence/) [####------] 32/74 complete; 42 open
- [parent-atlas-rpc-packet-registry-fabric](openspec/changes/parent-atlas-rpc-packet-registry-fabric/) [##########] 27/27 complete; 0 open
- [parent-atlas-rrf-fusion-consolidation](openspec/changes/parent-atlas-rrf-fusion-consolidation/) [########--] 5/6 complete; 1 open
- [parent-atlas-search-classifier-sidecar](openspec/changes/parent-atlas-search-classifier-sidecar/) [########--] 70/86 complete; 16 open
- [parent-atlas-semantic-512-canonicalization](openspec/changes/parent-atlas-semantic-512-canonicalization/) [#######---] 23/31 complete; 8 open
- [parent-atlas-semantic-768-canonical-contract](openspec/changes/parent-atlas-semantic-768-canonical-contract/) [######----] 45/70 complete; 25 open
- [parent-atlas-telemetry-lowrank-recommendation-okf-integration](openspec/changes/parent-atlas-telemetry-lowrank-recommendation-okf-integration/) [#---------] 2/31 complete; 29 open
- [parent-atlas-tensor-residency-integration](openspec/changes/parent-atlas-tensor-residency-integration/) [######----] 96/151 complete; 55 open
- [parent-atlas-topology-representation-admission](openspec/changes/parent-atlas-topology-representation-admission/) [##--------] 6/25 complete; 19 open
- [parent-atlas-transport-memory-boundaries](openspec/changes/parent-atlas-transport-memory-boundaries/) [###-------] 23/89 complete; 66 open
- [parent-atlas-unified-symbol-ranking](openspec/changes/parent-atlas-unified-symbol-ranking/) [##########] 17/17 complete; 0 open
- [parent-atlas-unordered-execution-contract](openspec/changes/parent-atlas-unordered-execution-contract/) [###-------] 7/26 complete; 19 open
- [parent-atlas-versioned-doc-intelligence](openspec/changes/parent-atlas-versioned-doc-intelligence/) [#####-----] 16/31 complete; 15 open
- [parent-atlas-workboard-feature-utility-fabric](openspec/changes/parent-atlas-workboard-feature-utility-fabric/) [##--------] 11/67 complete; 56 open
- [parent-atlas-workstation-domain-classifier](openspec/changes/parent-atlas-workstation-domain-classifier/) [########--] 115/141 complete; 26 open
- [parent-atlas-xgboost-cuda-runtime-proof](openspec/changes/parent-atlas-xgboost-cuda-runtime-proof/) [####------] 12/30 complete; 18 open
- [phase79-canonical-workflow-action-wiring](openspec/changes/phase79-canonical-workflow-action-wiring/) [##########] 16/16 complete; 0 open
- [route-import-infra-isolation](openspec/changes/route-import-infra-isolation/) [########--] 14/17 complete; 3 open

