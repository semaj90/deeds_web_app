# Tasks — Parent Atlas Candidate Feature Execution Fabric

## Taxonomy-scoped retrieval planning — 2026-09-06

These are additive, deterministic request artifacts. They do not create a taxonomy
owner, query-expansion store, retrieval executor, or additional semantic vote.

- [x] CFF-TAXONOMY-01 — added `TaxonomyScopeV1` beside the existing agentic-file
  compiler. It derives only from the existing `QueryClassificationV1` and explicitly
  admitted feature/API descriptors; taxonomy and ontology revisions are required and
  the result is derived (`canonicalAuthority` is not implied).
- [x] CFF-EXPANSION-01 — added `QueryExpansionBundleV1` with immutable
  `USER_LITERAL` terms and provenance-tagged derived terms. Literal terms are never
  replaced by the expansion lane.
- [x] CFF-PLAN-01 — extended the existing `RetrievalPlanV1` additively with taxonomy,
  expansion, query-fingerprint, reduction, token, topic, forest, and context-policy
  references. Query fingerprints are bound by checksum/reference only; the semantic
  lane remains exactly one `semantic_768` lane and no executor becomes a new vote.
- [x] CFF-RLM-CACHE-01 — taxonomy and ontology revisions now participate in the
  existing RLM retrieval request hash, so a taxonomy change cannot reuse an older
  request cache entry. This is a narrow RLM proof only; the broader
  `CACHE-PREFILL-01/02` ContextManifest/prompt identity gate remains open in its
  owning change.
- [x] CFF-QUERY-SHADOW-01 — bounded SearchRuntime shadow comparison proven for
  literal-only versus taxonomy-expanded retrieval. The actual `SearchRuntime` was
  constructed with one sparse and one dense retriever, `readOnly: true`, and the
  expanded query preserved the literal `TurboVec double vote` lane while adding
  the evidence-qualified `SearchRuntime` symbol term. Both calls reported
  `promotionAttempted: false`; promotion-outbox and policy-training exporters
  were not invoked. This is fixture/read-only proof, not live corpus quality or
  production model evidence. Report:
  `docs/reports/taxonomy-expansion-searchruntime-shadow-v1.json`.

Evidence: `sveltekit-frontend/src/lib/server/atlas/agentic-file-compiler/`,
`sveltekit-frontend/src/lib/server/retrieval/search-runtime.ts`, and
`sveltekit-frontend/src/lib/server/atlas/rlm/rlm-search-adapter.spec.ts` (16 focused
tests pass). Query-owner audit: `docs/reports/query-feature-owner-audit-v1.json`;
QueryFingerprint contract/tests: `query-fingerprint-v1.ts` and
`query-fingerprint-v1.spec.ts`; LexicalFingerprint contract/tests:
`lexical-fingerprint-v1.ts` and `lexical-fingerprint-v1.spec.ts`.

## Query and lexical features — owner reconciliation (2026-09-05)

All items below are planned, read-only or fixture-scoped until separately admitted.
Reuse existing lexical retrieval and CandidateFeatureSnapshotV1, not a feature store.

- [x] QUERY-FEATURE-01 audited query normalization, PostgreSQL FTS/`pg_trgm`,
  corpus scope, and statistics ownership. Live PostgreSQL reports `pg_search 0.25.1`,
  `pg_trgm 1.6`, `vector 0.8.3`, an existing `search_vector` GIN index, and a
  separate pg_search BM25 index. The canonical SearchRuntime path remains the
  existing `retrieveBM25` tsvector executor with an ILIKE fallback; no executor
  switch, table, index, or write was added. The audit also records 2,392 blank
  `source_ref` rows and the current filter-scope limitation. Report:
  `docs/reports/query-feature-owner-audit-v1.json`.
- [x] QUERY-FEATURE-02 added derived `QueryFingerprintV1` with queryChecksum,
  normalizedLexemes[], explicit rareLexemes availability, trigramFingerprint,
  observedAt, and normalizer/corpus revisions. `observedAt` and requestId are
  excluded from the deterministic checksum; unavailable rare-term statistics are
  never represented as fabricated values. Focused contract tests pass.
- [x] QUERY-FEATURE-03 added derived `LexicalFingerprintV1` referencing an existing
  candidate/source identity and both source/workspace revisions. It carries bounded
  `topLexemes[]` term/document/corpus frequencies, explicit statistics availability,
  lexical-feature revision, and corpus snapshot checksum. It is non-authoritative and
  cannot create identity from lexical similarity; focused contract tests pass.
- [x] QUERY-FEATURE-04 added a bounded read-only `ts_stat` proof over the existing
  `codebase_chunk_index.search_vector` source. It replays corpus counts and frozen
  term statistics in one `BEGIN READ ONLY` transaction with stable checksum
  `c5e21f419737a441542fbbfbea307c4cbe9d9e97b75fe014d3c479326d656416`; status is
  `QUERY_LEXICAL_STATS_READ_ONLY_PROVEN`, with no view/table/index creation or
  materialized-view refresh. Report:
  `docs/reports/query-lexical-stats-v1.json`.
- [ ] QUERY-FEATURE-05 only after baseline value is established, evaluate lexical
  KMeans as a routing challenger; freeze corpus, seed, metric, and recall baseline.
  clusterId never grants eligibility or another retrieval vote.
- [x] QUERY-FEATURE-06 joined validated query/lexical features through the existing
  `CandidateFeatureSnapshotV1` adapter using its CandidateOrdinal and source/workspace
  revisions. The fixture preserves candidate membership (`[0, 1]`), rejects missing
  lexical features and source-revision drift, binds evidence by checksum, keeps the
  single logical `semantic_768` lane, and changes no RRF owner or canonical state.
  This is fixture/contract-proven only; live producer alignment remains a separate
  gate. Report: `docs/reports/query-feature-candidate-snapshot-v1.json`.

Workflow separation already exists in
`packages/parent-atlas/src/core/workflow-execution-coordinates-v1.ts`.
Reuse framework/orchestrationRuntime/checkpointProvider/actionExecutor/transport;
actual enums include mastra, mastra_engine, mastra_storage (not invented uppercase
wire values). Backend resume proof belongs to governed-compute and receipt binding.

## P0 — identity and revision closure

- [x] CAND-01 Define `CanonicalCandidateV1` with CandidateOrdinal + canonicalId + packetKey + treeNodeId + symbolVersionId + revision axes. Built and tested; live full-corpus admission remains separate.
- [x] CAND-02 Add deterministic ordinal-map materializer and rerun determinism fixture twice. Fixture/replay proof exists; current 15→128→768 scaling remains open.
- [x] CAND-03 Prove Qdrant point id, cuGraph gpuNodeId and CandidateOrdinal cannot substitute for canonicalId. Identity separation is proven at the contract/fixture boundary; live GPU parity remains separate.
- [x] REV-01 Materialize `RevisionDependencyGraphV1` for source → AST → graph/semantic → candidate → feature → rerank artifacts. Contract is built and tested; live producer alignment remains open.
- [x] CACHE-01 Define `ComputationArtifactV1` and content-addressed cache key contract. Contract is built and tested; production cache lifecycle proof remains separate.

## P0 — queue / artifact transport

- [x] QUEUE-00 Audit existing transport ownership: Postgres transactional outbox → RabbitMQ task/event exchanges; Redis list is UI/SSE progress only.
- [x] QUEUE-01 Add `ArtifactAddressV1` for MMAP/Arrow IPC/SeaweedFS S3/Postgres/Qdrant/Valkey/GPU-resident immutable artifacts. SeaweedFS is durable artifact storage; Postgres remains metadata and checksum authority.
- [ ] QUEUE-01A Reconcile object-storage callers against the SeaweedFS owner. **IMPLEMENTED_UNPROVEN / convergence open** — fresh read-only audit on 2026-09-06 reports 9 candidate adapter surfaces, 5 legacy-named adapter surfaces, 1 local-disk fallback, 47 configuration/artifact-surface files, and no object-store writes. The direct caller census is now recorded: the Parent Atlas cold adapter is used by `firecrawl-v2-capture.ts`; the SeaweedFS transport is used by the file routes, `minio-service.ts`, and the cold adapter; the compatibility `seaweed-client.ts` is used by acquisition, evidence, upload, indexing, and legal-corpus paths; legacy `minio-client.ts`, `minio.ts`, `src/minio.ts`, and `MinioKnowledgeStore.ts` still have active callers. `sveltekit-frontend/src/lib/server/minio/client.ts` retains a `.local_storage` fallback. Blockers remain caller convergence, undeclared local-disk authority risk, and legacy URI compatibility classification. Read-only audit: `scripts/atlas/audit-parent-atlas-object-storage-owner-v1.mjs`; report: `docs/reports/parent-atlas-object-storage-owner-v1.json` (`generatedAt=2026-09-06T05:17:53.935Z`). Do not rename, delete, or remove fallback behavior until runtime migration authorization and per-caller cutover proof are complete.
- [x] QUEUE-02 Add `ActionWorkItemV1` so queue payloads carry artifact refs, revision-set hash, ordinal selection, budget and executor class instead of dense tensors.
- [x] QUEUE-03 Route artifact work through `enqueueTask()` transactional outbox via `enqueueArtifactWorkItem()`.
- [x] QUEUE-04 Fix event-fabric projection worker type ownership imports (`integration-events.ts` owns code-evidence; `event-fabric.ts` owns the control-loop event types).
- [ ] QUEUE-05 Replace remaining large vector/tensor RabbitMQ payloads (for example legacy `document.embed` / `vector.index`) with artifact references where profiling shows payload amplification. **OPEN / REPRESENTATIVE PROFILE COMPLETE, LIVE CAPTURE INSTRUMENTED, DISTRIBUTION UNMEASURED** — the read-only caller census found direct compatibility publishers in `rabbitmq-client.ts` (lines 128, 144) and manager-owned publishers in `rabbitmq-manager-fixed.ts` (lines 547, 616, 1091, 1101, 2261) carrying opaque text/vector data without the artifact-reference envelope; `dispatch-inline.ts` is an in-process fallback, not a RabbitMQ publisher. The deterministic representative profile measured the existing serializers and reference-only envelope: a 768-value raw vector was 15,097 bytes versus a 743-byte reference envelope (20.319×), and the 64 KiB document boundary exceeded the policy at 65,699 bytes. Actual serialization points now attach `payloadBytes` and `payloadEncoding=json-utf8` to existing queue traces in `rabbitmq-client.ts` and `rabbitmq-manager-fixed.ts`; this is observability only, not a migration. A read-only Langfuse query found 62 historical queue-publish traces but 0 traces with `payloadBytes`, so live publisher distribution and amplification ratios remain unmeasured; no publisher was redirected or removed. Reports: `docs/reports/queue-large-payload-census-v1.json`, `docs/reports/queue-large-payload-profile-v1.json`, `docs/reports/queue-large-payload-live-profile-v1.json`; harnesses: `scripts/atlas/profile-queue05-large-payloads-v1.mts`, `scripts/atlas/audit-queue05-live-publisher-profile-v1.mts`. Next gate: `QUEUE-05-LIVE-PUBLISHER-PROFILE-01`; requires current instrumented traffic and explicit migration authorization.
- [x] QUEUE-06 Add explicit `artifact.materialized` / `artifact.failed` integration events and non-noop event-fabric handlers. **CLOSED 2026-09-06 —** focused queue coverage passed `21/21` across artifact verification, lifecycle processing, event-fabric parsing, and dispatch. The live lifecycle proof against canonical Postgres produced `QUEUE_ARTIFACT_LIFECYCLE_PROVEN`: materialized event inserted, identical replay deduplicated to one durable row, equal-length checksum-corrupt replay rejected with `CHECKSUM_MISMATCH`, and `artifact.failed` read back as one durable row. Proof receipt: `docs/reports/queue-artifact-lifecycle-proof-v1.json`. The proof runner now closes both database pools before exit. This closes the event/handler gate; queue payload migration and consumer/outbox gates remain separate.
- [x] QUEUE-07 Add single-flight lease/fencing token keyed by ActionKey so duplicate at-least-once deliveries cannot compute the same expensive artifact concurrently. **CLOSED 2026-09-06 —** focused unit coverage passed `6/6` for existing receipt reuse, lease acquisition, current-fence completion, stale-fence rejection, and database-clock expiry. The bounded live proof selected one worker, returned `busy` to the contending worker, replaced an expired lease with a higher fencing token, rejected stale completion, and accepted the fresh fenced completion. Receipt: `docs/reports/action-single-flight-live-proof-v1.json`.
- [x] QUEUE-08 Add consumer idempotency proof: duplicate command delivery returns the same immutable output artifact or an existing receipt. **CLOSED 2026-09-06 —** the bounded live proof completed one ActionKey, replayed the command through a different worker, returned the existing receipt with the same artifact address/fence, and independently read back exactly one `workflow_action_receipts` row. The existing lifecycle proof separately establishes one-row duplicate event projection. Receipt: `docs/reports/action-single-flight-live-proof-v1.json`.
- [x] QUEUE-09 Prove publisher-confirm outbox path is the only authoritative durable task publisher; generic publish helper remains convenience/non-authoritative. **CLOSED 2026-09-06 —** the bounded live `atlas.tasks.v1` proof persisted exactly one disposable task/outbox pair, confirmed that the generic publisher rejects direct task-exchange delivery, published through a real RabbitMQ confirm channel, marked `delivered_at` only after broker confirmation, and received/acknowledged the exact action on a private queue. Preflight found exactly one pending outbox row, with no unrelated pending work. Receipt: `docs/reports/task-outbox-confirm-channel-proof-v1.json`; harness: `src/lib/server/queue/task-outbox-confirm-channel-live.spec.ts`. This closes the authoritative publisher boundary; `QUEUE-01A` object-storage reconciliation and `QUEUE-05` legacy payload migration remain open.
- [x] QUEUE-10 Add message-size telemetry and fail/redirect when a task envelope exceeds the artifact-reference policy limit. **CLOSED 2026-09-06 —** the 64 KiB UTF-8 JSON policy is wired through `enqueueArtifactWorkItem()`, records checked/accepted/rejected/largest-byte telemetry, and fails closed with `ARTIFACT_ENVELOPE_TOO_LARGE` for inlined vector/tensor payloads. Focused coverage passed `2/2`; the policy is deterministic and does not imply that legacy compatibility publishers have all been migrated. Receipt: `docs/reports/artifact-reference-envelope-policy-v1.json`.

### QUEUE-05 current canary addendum (2026-09-06)

- **Disposable canary proven:** `scripts/atlas/prove-queue05-disposable-publisher-canary-v1.mts` used the real `publishMessage()` serialization path for one `document.embed` payload (65,682 bytes) and one `vector.index.document` 768-value payload (15,076 bytes) on a unique unbound temporary exchange. The exchange was deleted and the connection closed; no consumer, Postgres, Qdrant, Valkey, or canonical application write was involved.
- **Trace readback proven:** `scripts/atlas/audit-queue05-live-publisher-profile-v1.mts` found four measured traces in Langfuse (`4/57` queue-publish traces, `7.02%` coverage): two `document.embed` samples at 65,682 bytes and two `vector.index.document` samples at 15,076 bytes. This proves trace metadata delivery and canary replay, not production traffic distribution.
- **Decision:** keep QUEUE-05 open. Do not redirect legacy publishers until naturally occurring production-shaped traffic is measured and a separate migration authorization identifies the exact callers.

### Mandatory spine versus implementation lanes (2026-08-29)

The mandatory Parent Atlas spine is intentionally small:

```text
source bytes / workspace revision
  → Tree-sitter + AST-grep observations
  → exact source/revision AST identity
  → stable_symbol_id / symbol_version_id
  → LSP semantic enrichment
  → PostgreSQL canonical evidence and eligibility
  → CandidateOrdinal
  → EmbeddingGemma semantic_768 retrieval
  → bounded graph/feature projection
  → CandidateFeatureMatrix
  → ACE / BitFrost context selection
  → ContextManifest
  → Ornith typed proposal
  → admission, validation, and bounded execution
```

Everything else is subordinate to that spine. It may be a baseline, challenger,
cache, transport, or offline analysis tool, but it cannot create canonical identity,
graph revisions, ontology truth, CandidateOrdinal values, or a second fusion vote.

- `[x]` Mandatory ownership boundary: Tree-sitter/AST-grep provide structural evidence; LSP provides revision-qualified semantic observations; PostgreSQL owns canonical identity/evidence/eligibility; EmbeddingGemma owns `semantic_768`; SearchRuntime owns lane normalization/fusion; ACE/ContextManifest compress evidence for Ornith.
- `[x]` Non-mandatory classification: Naive Bayes and logistic regression are routing baselines; PyTorch/XGBoost/MLP are learned challengers; PCA/TruncatedSVD are offline controls; LangExtract and OKF produce validated proposals/artifacts; NetworkX is a CPU oracle; cuGraph/cuVS/FastAPI `:8098` are accelerator executors.
- `[x]` Transport/cache boundary: JSON/LSP/MCP and canonical receipts remain control-plane formats; Arrow IPC/mmap is the preferred large numeric artifact plane; bitsets are execution masks; MessagePack and native SIMD JSON are measured transport/parser challengers; BitFrost/Valkey stores revision-keyed descriptors/cards, never canonical tensors or hidden reasoning.
- `[x]` Broker boundary: the current implementation inventory remains RabbitMQ-backed and is not silently reclassified as NATS. NATS/Core NATS/JetStream may be evaluated as a separate durable-worker challenger, but no second durable broker is added to the mandatory spine until a migration decision and live replay proof exist. DuckDB remains offline analytical staging; RabbitMQ and JetStream are not identity or retrieval authorities.
- `[x]` Explicitly optional: Redis/Valkey HNSW, Tang-style recommendation, Nibbler packing, TurboVec, TensorRT, Triton/cuTile, QLoRA, RL, and alternate vector/search executors require a baseline, held-out/replay evidence, and a new promotion receipt before affecting production ranking or writes.

### QUEUE-07 materialization verification gates

File-backed `MMAP` / `ARROW_IPC` materialization must prove:

- `ACTION_KEY_PRESENT`
- `PRODUCER_REVISION_PRESENT`
- `REVISION_SET_HASH_PRESENT`
- `ARTIFACT_EXISTS`
- `ARTIFACT_IS_FILE`
- `BYTE_LENGTH_MATCH` when a byte length is declared
- `CHECKSUM_MATCH` using streamed SHA-256 over materialized bytes
- `STORAGE_VERIFIER_AVAILABLE`

`POSTGRES`, `QDRANT`, `VALKEY`, and `GPU_RESIDENT` addresses fail closed as `NOT_PROVEN` until a storage-specific verifier is implemented. Queue events remain observations about materialization; they never become artifact ownership or canonical artifact storage.

## P1 — candidate feature fabric

- [x] FEAT-00 Add `CandidateFeatureRowV1` schema with nullable learned features and availability flags.
- [x] FEAT-01 Add `CandidateFeatureSnapshotV1` materializer with one row per CandidateOrdinal. **Fixture-proven; live lane join remains open.**
- [x] FEAT-02 Join semantic/lexical/AST/graph/domain/execution/memory features by ordinal and fail on revision mismatch. **Fixture-proven; live producer alignment remains open.**
- [ ] FEAT-03 Add CPU reference materializer and GPU gather/scatter/sort/compact challenger.
  - [x] **FEAT-03-CPU-COLUMNAR-REFERENCE** — the existing
    `materializeCandidateFeatureColumnar()` path is the revision-bound CPU
    reference over `CandidateFeatureSnapshotV1`; its current ABI is 12 scalar
    features and its checksum/ordinal invariants are covered by the feature
    suite.
  - [x] **FEAT-03-GPU-PACK-GATHER-REFERENCE** — the existing GPU pack/gather
    reference preserves dense `CandidateOrdinal` rows, masks padded rows, and
    carries the feature/identity checksums into the bounded GPU proof.
  - [x] **FEAT-03-SCATTER-SORT-COMPACT-CHALLENGER** — closed as a bounded
    CPU/reference challenger on 2026-09-06. `runCandidateFeatureScatterSortCompactChallenger()`
    validates the existing columnar snapshot, scatters a selected ordinal mask,
    sorts by one feature with presence-first and ordinal tie-break semantics,
    and compacts a deterministic top-K buffer. Replay is stable and duplicate or
    out-of-range ordinals fail before transformation. Focused suite:
    `candidate-feature-scatter-sort-compact-v1.spec.ts` (3/3). The artifact is
    non-authoritative (`identityAuthority=false`, `canonicalWritesAttempted=false`)
    and does not prove native CUDA/GPU performance, production-scale residency,
    or live producer alignment; those remain separate gates.
    Receipt: `docs/reports/candidate-feature-scatter-sort-compact-challenger-v1.json`.
- [x] FEAT-04 Require CPU↔GPU ordinal and feature parity receipt; bounded RTX proof passed, production residency and fanout remain separate gates.
- [x] FEAT-03E Add the revision-bound CPU feature-head GEMM oracle and checksum receipt. **Closed 2026-09-06 —** `candidate-feature-gemm-v1.ts` consumes the existing revision-bound columnar snapshot, emits float32 scores keyed by `CandidateOrdinal`, and includes input/score checksums with `identityAuthority=false`, `canonicalOwnerChanged=false`, and `canonicalWritesAttempted=false`. The focused oracle suite passes `3/3`; the fixture width now follows the current 12-scalar ABI after the latent-slot correction. Native CUDA/LibTorch parity, production residency, and live producer alignment remain open. Receipt/report: `docs/reports/candidate-feature-gemm-current-proof-v1.json`.

Current checkout reconciliation: the feature-fabric suite passes `52/52` across
12 files, including Arrow IPC write/readback, the revision-bound CPU GEMM oracle,
and the bounded scatter/sort/compact challenger. The root Arrow helper now
follows the current 12-scalar ABI; FEAT-03/04 remain open only for native
GPU parity/residency, production fanout, and live producer alignment. No executor
or canonical-store promotion is implied.

## P1 — manifold4 / SOM derived projection

- [x] MAN4-01 Add `Manifold4OrientationV1` unit-quaternion schema.
- [x] MAN4-02 Canonicalize antipodal q/-q representations deterministically.
- [x] MAN4-03 Add antipodal-aware similarity and angular-distance helpers.
- [x] MAN4-04 Add tests for unit norm and q/-q equivalence.
- [ ] MAN4-05 Wire existing SOM/manifold producer through this schema and record producer/feature revisions. **BLOCKED / producer alignment audit 2026-09-06:** `models/som/som_assignments.json` is packet-keyed (`32310` assignments in the recorded artifact) and contains only `row`, `col`, and `distance`; it has no `CandidateOrdinal`, `canonicalId`, source/workspace/feature revision, or evidence fields required by `Manifold4OrientationV1`. The existing SOM trainer and centroid path are write-capable, while `project-codebase-topology.mjs` includes synthetic manifold generation. No producer was invoked, no datastore was touched, and no identity was promoted. Report: `scripts/atlas/audit-manifold4-producer-alignment-v1.mjs` → `docs/reports/manifold4-producer-alignment-audit-v1.json`. Next: provide a revision-qualified producer receipt or an explicitly bounded adapter input with exact CandidateOrdinal/source joins; do not wire the packet-keyed or synthetic path directly.
- [ ] MAN4-06 Add Qdrant payload migration/validation for manifold4 fields without changing `semantic_768` vector ownership.
- [ ] MAN4-07 Add retrieval ablation: semantic-only vs semantic+SOM vs semantic+manifold4.

## P1 — Qdrant fanout

- [ ] FANOUT-01 Normalize all semantic results to CandidateOrdinal before feature fanout.

### Graph snapshot revision owner tranche — 2026-08-21

- [x] REV-OWNER-GRAPH-01 Add `GraphSnapshotRevisionV1` with workspace, source-inventory, graph, parser, identity, topology, policy, and producer revisions.
- [x] REV-OWNER-GRAPH-02 Keep revision ownership at immutable snapshot level; graph nodes bind through `snapshotId` without duplicated workspace/graph revisions.
- [x] REV-OWNER-GRAPH-03 Reject mixed snapshot bindings and source/topology/policy hash drift before fanout admission.
- [x] REV-OWNER-GRAPH-04 Prove the contract against persisted `atlas_graph_snapshots_v2` and selected node/edge readback in a non-production read-only transaction using `prove-graph-snapshot-revision-readback.mts`; manifest revisions remain incomplete, so the owner gate stays blocked.
- [ ] REV-OWNER-GRAPH-05 Unblock FANOUT-01 only after graph snapshot revision, candidate identity, and Qdrant `semantic_768` lineage agree.
- [x] REV-OWNER-GRAPH-05A Audit the live graph-revision candidates without mutation: `graph_analysis_runs` contains 24 revisioned analysis rows across 5 graph revisions, but its workspace marker is `workspace:parent-atlas` and is not bound to the current source workspace revision; `atlas_graph_snapshots_v2` and `atlas_relationships` remain revisionless. Keep this as a derived analysis owner candidate only; it does not unblock FANOUT-01 or 128/768 expansion. See `docs/reports/graph-revision-owner-v1.json` and `docs/reports/graphify-workspace-owner-v1.json`.
- [x] REV-OWNER-GRAPH-05C Trace the graph-analysis writers: adapters hard-code `workspace:parent-atlas`, and derive `graphRevision` from projection name plus node/relationship counts. Treat these as analysis/projection revisions, not current source-snapshot ownership. No graph result was repointed or rewritten.
- [x] REV-OWNER-GRAPH-05D Confirm the default is implementation-level, not a current snapshot binding: `graph-analysis-runner.ts` and PageRank/Betweenness/K-core/CheiRank adapters assign `DEFAULT_WORKSPACE_REVISION = 'workspace:parent-atlas'`; the graph revision hash is derived from projection shape. Keep these artifacts non-promotional until a snapshot-bound writer replaces the default.
- [x] REV-OWNER-GRAPH-05E Audit the current graph artifact read-only: 16 graph-node observations exist but 0 explicit revision-qualified edges, so the artifact is blocked on its edge producer and cannot become the current graph-revision owner. See `docs/reports/current-graph-artifact-readiness-v1.json`.
- [x] REV-OWNER-GRAPH-05F Characterize the legacy offline edge producer: `scripts/atlas/batch-offline-ingest.mjs` creates import-derived `DEPENDS_ON` edges, but its edge payload has no `sourceRevision`, `workspaceRevision`, or `graphRevision`; keep it outside current graph-snapshot promotion and do not backfill its edges into the canonical graph.
- [ ] REV-OWNER-GRAPH-05B Trace one authoritative Graphify/source snapshot writer to a current `workspace_revision` and prove a bounded read-only binding before adding any `graph_revision` to candidate admission. Do not synthesize revisions or populate legacy rows to satisfy the gate.
- [x] REV-OWNER-GRAPH-05B1 Run the registered Graphify source producer in exact run-bound dry-run mode for `14643371-f6f2-4131-906b-235a5c06619a`: 111/111 sources processed, 62 native, 39 recovered, 10 no-symbol, 0 hard failures, and 0 evidence/symbol writes. The run remains non-authoritative because source-revision authority is content-anchor-only and the attached database run remains `RUNNING`; NLP language-field and timeout diagnostics remain bounded follow-up work.
- [x] REV-OWNER-GRAPH-05B2 Classify unsupported registered extensions before structural/NLP extraction: the same 111-source dry-run now reports 103 supported files (64 native, 39 recovered), 8 explicit unsupported files, 0 hard failures, and 0 writes. No malformed sidecar requests are emitted for Markdown/shell inputs; authoritative completion remains blocked by revision authority and run completion.
- [x] REV-OWNER-GRAPH-05B3 Audit exact run-bound source bytes read-only: all 111 `graphify_files` rows for run `14643371-f6f2-4131-906b-235a5c06619a` match their stored content hashes, and all 111 have a stored `source_revision`. This proves byte availability/integrity only; it does not promote the legacy source-revision owner or complete the run. See `scripts/atlas/audit-current-graphify-source-revision-v1.mjs` and `docs/reports/current-graphify-source-revision-v1.json`.
- [x] REV-OWNER-GRAPH-05B4 Compare the same 111 source refs against the run's repository revision read-only: all 111 exist in the Git tree, but 0/111 have a recorded `git_blob_oid`, so Git-backed source authority is not proven. No revision fields were populated and no run status was changed. See `scripts/atlas/audit-graphify-git-source-authority-v1.mjs` and `docs/reports/graphify-git-source-authority-v1.json`.
- [x] REV-OWNER-GRAPH-05G Re-run the post-binding graph-owner and artifact audits: the expected current workspace revision is `sha256:55edaaadab0cef724593287c7c908dad6cdc1b25039a752a6b5dab2c0c44fac9`, but `graph_analysis_runs` remains on `workspace:parent-atlas`, revisionless graph snapshot/relationship tables remain, and the current artifact still has 0 revision-qualified edges. The 111 source bindings therefore do not yet establish a graph-revision owner. See `docs/reports/graph-revision-owner-v1.json`, `docs/reports/current-graph-artifact-readiness-v1.json`, and `docs/reports/graphify-workspace-owner-v1.json`.
- [x] REV-OWNER-GRAPH-05H Run the existing relationship snapshot builder with the current workspace revision and the frozen 15-row candidate snapshot: the revision-bound non-authoritative artifact succeeds with 8 included current Feature Intelligence relationships, 9 entities, 16 incidence edges, deterministic Arrow checksum, and derived `graphRevision=sha256:e6179c52ef51adf1bb0b8fe52bd544646a53aa11c543c3d598b5cb271d5ba275`; 63,397 historical kernels are excluded. This proves the KAG/FI relationship path only, not an AST/Graphify edge owner or full-corpus admission. See `docs/reports/graph-prod-01-production-snapshot-sha256_e6179c52ef51adf1bb0b8fe52bd544646a53aa11c543c3d598b5cb271d5ba275.json`.
- [x] REV-OWNER-CODE-01 Prove the compatibility contract for exact content bytes plus preserved legacy Git `source_revision`.
- [x] REV-OWNER-CODE-01A Freeze `GraphifySourceInventoryWritePlanV1`; it cannot authorize writes or overwrite legacy source-revision semantics.
- [ ] REV-OWNER-CODE-02 Bind one canonical Graphify source-inventory writer and prove a bounded persistence/readback canary.
- [x] REV-OWNER-CODE-02G Audit the existing source-lineage bridge read-only: `atlas_source_refs` contains 22,493 stable identities, but only 6 Graphify refs are registered; packet source binding classifies 17,257 exact, 854 normalized-only, 2,549 ambiguous, and 40,999 unresolved. The workspace-source binding schema is available but has no proven producer/population. See `docs/reports/source-lineage-model-v1.json`, `docs/reports/source-ref-binding-v1.json`, and `docs/reports/live-source-lineage-table-audit.json`.
- [x] REV-OWNER-CODE-02I Validate the source-lineage relation migration in a rollback-only transaction: alias and workspace-binding tables were visible during validation and absent after rollback; durable writes were false. The migration is structurally ready but not applied. See `scripts/atlas/validate-source-lineage-relations-v1.mjs`.
- [x] REV-OWNER-CODE-02J Generate the read-only current Graphify batch plan: 111 sources have exact current source/workspace bindings with zero missing, ambiguous, or revision/content-mismatch rows; no canonical or projection writes were performed. See `docs/reports/current-source-graphify-batch-plan-v1.json`.
- [x] REV-OWNER-CODE-02K Reconcile the planned current Graphify sources against `atlas_source_refs` before binding admission: the initial plan showed `0/111` literal matches, so registry semantics were audited and the explicitly authorized registry reconciliation later established `111/111 EXISTING_EXACT` rows with validated composite-key/FK agreement. Exact Graphify observation alone remains insufficient, but the current registry/binding contract is now proven. See `docs/reports/current-source-registry-contract-v1.json`.
- [x] REV-OWNER-CODE-02L Add and run the read-only registry reconciliation planner: 111 current exact Graphify rows become `REGISTRY_INSERT_CANDIDATE_REVIEW_ONLY`, 0 are already registered, and the plan checksum is `43a4cdc047c3d0e04aa441beafe41837254cc64f5d4c644acf06f31c269211a7`; no registry or binding writes occur. See `scripts/atlas/plan-current-source-registry-reconciliation-v1.mjs` and `docs/reports/current-source-registry-reconciliation-plan-v1.json`.
- [x] REV-OWNER-CODE-02M Apply the explicitly authorized 111-row stable source-registry insert and prove exact readback: `insertedCount=111`, `readbackCount=111`, apply checksum equals the plan checksum, and no workspace-binding or projection writes occurred. See `scripts/atlas/apply-current-source-registry-reconciliation-v1.mjs` and `docs/reports/current-source-registry-reconciliation-apply-v1.json`.
- [x] REV-OWNER-CODE-02H Prove one bounded current-workspace source binding using exact source/content/revision evidence, then populate the binding layer only through an explicitly approved additive migration and readback. Do not promote normalized-only, ambiguous, or unresolved matches.
- [x] REV-OWNER-CODE-02N Apply the explicitly authorized workspace-lineage migration and prove the bounded binding readback: 111/111 rows committed for workspace revision `sha256:55edaaadab0cef724593287c7c908dad6cdc1b25039a752a6b5dab2c0c44fac9`, with binding aggregate checksum `154651a454f0df42da4610699f0cdfca1682b9ae46908dba46eb5246c12768e9`. No packet, Graphify, Qdrant, Neo4j, or Valkey writes occurred.
- [x] REV-OWNER-CODE-02O Re-audit the source-lineage state after the authorized migrations: 111 current workspace bindings are joined, while the broader 885-row Graphify observation set still has 768 source refs outside the registry and the current packet cohort remains 15 source/chunk-qualified, 0 fully revision-qualified. Keep full-corpus promotion blocked; no additional binding or projection writes were performed.
- [x] REV-OWNER-CODE-02P Audit the live registry contract and current 111-source semantics read-only: `atlas_source_refs` has a validated composite primary key `(source_ref_key, repo_id)`; `atlas_workspace_source_bindings` has a validated composite FK `(repo_id, canonical_source_ref)` to that key plus validated primary/unique/check constraints. All 111 current plan rows classify `EXISTING_EXACT` with exact registry content and workspace-binding digest agreement. No registry, binding, graph, vector, or cache writes occurred. See `scripts/atlas/audit-current-source-registry-contract-v1.mjs` and `docs/reports/current-source-registry-contract-v1.json`.
- [x] REV-OWNER-CODE-02A Add read-only canary for historical `graphify_files` source bytes, content hashes, and legacy Git provenance.
- [x] REV-OWNER-CODE-02B Add the unapplied manual `graphify_files` schema/index migration; application and row population remain gated.
- [x] REV-OWNER-CODE-02C Add dry-run source-inventory materializer with explicit non-production apply confirmation gates.
- [x] REV-OWNER-CODE-02D Add rollback-only migration proof for table, constraints, and indexes.
- [x] REV-OWNER-CODE-02E Add additive-only migration collision guard and static destructive-SQL safety tests.
- [x] REV-OWNER-CODE-02F Prove the Graphify revision-authority v2 migration in a rollback-only transaction; durable application and row population remain gated.
- [x] REV-OWNER-CODE-03 Add `GraphifyWorkspaceManifestReceiptV1`; require complete expected/persisted source counts and exact revision/digest agreement before Graphify consumers can treat the manifest as complete.
- [x] REV-OWNER-GRAPH-04A Prove the snapshot revision-owner migration in a rollback-only transaction; durable application and manifest backfill remain gated.
- [x] FANOUT-02 Enforce one logical semantic-lane vote across Qdrant/cuVS/CAGRA executors.
  **Closed by the retrieval-fusion owner on 2026-09-06:** `combineViaRRF` now
  collapses Qdrant/TurboVec semantic executor aliases to one arithmetic vote while
  retaining physical-lane provenance. Native cuVS/CAGRA integration and live producer
  alignment remain separate gates. See `openspec/changes/parent-atlas-retrieval-fusion-reachability/tasks.md`.
- [ ] FANOUT-03 Add OKF soft-domain filter plan with indexed payload fields and broad-search fallback when confidence is low.
- [ ] FANOUT-04 Cache query-hash + semantic-snapshot-revision + filter-hash + K + executor-revision result artifacts.

## P2 — CrossEncoder

- [ ] CE-01 Define deterministic `RerankDocumentV1` from exact path/symbol/kind/signature/source text.
- [ ] CE-02 Implement backend-neutral `CrossEncoderRerankerV1` preserving CandidateOrdinal.
- [ ] CE-03 Python/PyTorch reference backend first; do not begin with LibTorch/TensorRT.
- [ ] CE-04 Benchmark Qwen3-Reranker-0.6B, mxbai-rerank-base-v2 and BGE-reranker-v2-m3 on frozen Atlas queries.
- [ ] CE-05 Store raw score, rank and optional calibrated score; never fabricate 0.5 when unavailable.
- [ ] CE-06 Add cache key including query, RerankDocument hash, model/tokenizer/instruction/truncation revisions.
- [ ] CE-07 Add VRAM-budget skip receipt and deterministic feature-ranker fallback.

## P2 — exact promotion and reasoning

- [ ] PROMOTE-01 Resolve top candidates to exact source span + AST node/path + graph evidence + revisions.
- [ ] PROMOTE-02 Fail promotion for unresolved/degraded canonical identity.
- [ ] CONTEXT-01 Adopt `ContextManifestV1` as sole DSPy evidence input boundary.
- [ ] DSPY-01 Add typed classify/evidence/DAG/outcome modules.
- [ ] GEPA-01 Define validator-derived `AtlasProgramMetricV1` before optimizing prompts/programs.

## P3 — neural retrieval adaptation

- [ ] ENC-01 Freeze `AtlasRetrievalExampleV1` query/positive/hard-negative schema.
- [ ] ENC-02 Train cheap OKF domain head over frozen canonical EmbeddingGemma vectors first.
- [ ] ENC-03 Use structural hard negatives: wrong revision/tree node/symbol/owner/path despite high semantic similarity.
- [ ] ENC-04 Distill CrossEncoder teacher ordering into an EmbeddingGemma PEFT challenger.
- [ ] ENC-05 Store challenger under a NEW representation/model revision and separate Qdrant collection.
- [ ] ENC-06 Do not replace canonical `semantic_768` until Recall/MRR/nDCG + exact-promotion + repair-success gates pass.

## P4 — verified learning loop

- [ ] ENV-01 Replayable `AgentTaskEnvV1` with deterministic state/action/validator receipts.
- [ ] TRAIN-01 Gold corpus accepts only validator-proven outcomes; OKF/LLM labels remain weak/teacher labels.
- [ ] TRAIN-02 Add dataset revision, model revision, RNG seed and evaluation receipt.
- [ ] TRAIN-03 Only after this authorize GEPA/GRPO/QLoRA experiments.

## Immediate validation commands

```bash
cd sveltekit-frontend
npx vitest run \
  src/lib/server/queue/artifact-work-item-v1.spec.ts \
  src/lib/server/queue/action-single-flight-v1.spec.ts \
  src/lib/server/queue/message-size-policy-v1.spec.ts \
  src/lib/server/queue/rabbitmq-client.spec.ts \
  src/lib/server/queue/artifact-materialization-verification.spec.ts \
  src/lib/server/queue/artifact-event-processing.spec.ts \
  src/lib/server/queue/event-fabric-dispatch.spec.ts

npx tsx sveltekit-frontend/scripts/atlas/prove-queue-artifact-lifecycle.mts
```

Acceptance target:

```text
focused queue tests: PASS
materialized file checksum/size gates: PROVEN
duplicate event projection: 1 row
corrupt equal-length artifact: REJECTED / CHECKSUM_MISMATCH
artifact.failed durable readback: 1 row
QUEUE_ARTIFACT_LIFECYCLE_PROVEN
```

Only after those proofs should QUEUE-06 through QUEUE-10 be checked off. QUEUE-05 remains a separate payload-census/remediation task; do not claim it from schema work alone.

## Handoff (2026-08-21, context-limited session end)

**Pushed to `origin/main` at `8e56c821b7`.** Everything below is real and verified unless
marked otherwise; nothing here is speculative.

### Done and merged this session
- CAND-01/02/03, REV-01, CACHE-01 (identity/revision/cache contracts) — built, tested, unique
  (checked against all 45+ `agent/*` branches, no duplicate).
- QUEUE-06/07/08/09/10 — merged from `agent/parent-atlas-queue-artifact-transport-20260821`
  (their implementation kept over an earlier local draft; theirs was more complete). Found and
  fixed a real production-breaking TDZ bug in their `outbox.ts` (`enqueueTask` self-shadowed its
  own `idempotencyKey` helper). Also fixed a missing `loadAtlasEnv()` call in two of their new
  proof scripts (`sveltekit-frontend/scripts/atlas/prove-artifact-transport-readiness.mts`,
  `sveltekit-frontend/scripts/atlas/prove-queue-artifact-lifecycle.mts`) that crashed with a SASL auth error before ever querying.
- **QUEUE-05 steps 1–3 proven live** against production Postgres: applied
  `parent_atlas_artifact_transport_v1.sql` (4 new tables, additive-only), confirmed
  `ARTIFACT_TRANSPORT_STORE_READY`, then ran `prove-queue-artifact-lifecycle.mts` →
  `QUEUE_ARTIFACT_LIFECYCLE_PROVEN` (idempotent replay, checksum-mismatch rejection, failure
  persistence all verified for real). **Steps 4–8 remain open** — nothing yet redirects the real
  `document.embed`/`vector.index` producers onto this store.
- PR #15 (`parent-atlas-semantic-prefill-spine`) and PR #16 (`atlas-aligned-snapshot-proof-v2`) —
  both already merged on GitHub, pulled into local main cleanly, zero conflicts, zero new
  typecheck errors (20 pre-existing repo-wide errors remain, none in the new files).
- Fixed a **real, pre-existing file corruption** unrelated to this session's own work: commit
  `401f319770`'s merge byte-interleaved two independent implementations inside
  `graphify-structural-materializer.ts` and `node-tree-sitter-ast-provider.ts` (+ its spec) —
  confirmed via `git show HEAD` before any edits. Restored both from the last clean commit
  (`e2376a0021`) and reapplied the FUNCTION-vs-VARIABLE taxonomy fix on top (a `const`/`let`
  bound to an arrow/function-expression now classifies `FUNCTION`, not the old blanket
  `VARIABLE`) — this closes the sidecar-vs-node-challenger parity mismatch found earlier in the
  session. 2/2 tests pass, typecheck clean.
- OKF frontmatter correction: verified the real GoogleCloudPlatform OKF v0.2 spec live (fetched
  it), found the earlier session's `generated: manual_curation` / `verified: unverified` additions
  didn't match (real spec: `generated` is a structured `{by, at}` object; `verified` should be
  *omitted*, never a scalar "unverified" string). Fixed all 8 `.okf/*.md` files.
- `llama-server` on `:8090` was down (no process at all) — restarted via
  `npm run turbo:start:text:detached`. Running **text-only**: `mmproj-F16.gguf` doesn't match the
  loaded `hforf.gguf` model's `n_embd` (2560 vs 4096) — vision/multimodal is disabled until a
  matching mmproj file is found/built. Chat/synthesis works normally.

### Explicitly NOT done — real open items for next session
1. **FANOUT-01** — still blocked. `synthesize/+server.ts` assigns `candidateOrdinal` by plain
   array position (twice, inconsistently across sort/slice). Root blocker: `GraphViewNodeV1` /
   the live `atlas_graph_nodes_v2` table has **no revision columns at all** (checked directly
   against production Postgres). Fixing this needs a real schema migration + identifying/fixing
   whichever writer populates that table — and ties directly into the still-unproven
   `REVISION_OWNER_NOT_PROVEN` status from the separate `agent/revision-owner-proof` work
   (already merged, still says NOT_PROVEN). Do not attempt FANOUT-01 until revision ownership is
   proven elsewhere first.
2. **A real 3-way `CandidateFeatureRowV1` naming collision** — `graph-runtime-contracts.ts`,
   `features/candidate-feature-row-v1.ts` (this change's canonical one), and
   `neural-routing/contracts.ts` (different domain, tool-routing) all independently declare a
   type with this exact name. Not renamed — cross-codebase rename is out of scope for a quick fix.
3. **QUEUE-05 steps 4–8** — redirect the real `document.embed`/`vector.index` producers
   (`rabbitmq-manager-fixed.ts`, `queue-worker.ts`) onto `ArtifactAddressV1` references, Qdrant
   readback verification, large-payload audit, before/after latency benchmark.
4. **FEAT-01→04** — implementation and bounded proof now exist. FEAT-01/02 are
   fixture-proven, FEAT-03D/04 have a real RTX CUDA parity receipt, and the CPU
   feature-head GEMM oracle is focused-test proven. Native LibTorch/cuBLAS GEMM
   parity, production residency, and live producer alignment remain open.
5. The corruption-fix pattern found in indexing/ (§ above) suggests other files touched by the
   same `401f319770` merge may have the same interleaving bug — **not swept for this pass**, only
   the two files actually needed for the taxonomy fix were checked and repaired. Worth a
   dedicated audit (`git show 401f319770 --stat` to find every file that merge touched, then spot
   check a few for the interleaving signature: duplicate `export function`/`export type` names in
   one file).
6. mmproj/vision file mismatch (see above) — not investigated further; text-only is fine for now.

### Verification commands for next session to re-confirm state
```bash
cd sveltekit-frontend
npx vitest run src/lib/server/atlas/indexing/node-tree-sitter-ast-provider.spec.ts
npx vitest run src/lib/server/queue/outbox-authority.spec.ts src/lib/server/queue/event-fabric.spec.ts
npx tsx sveltekit-frontend/scripts/atlas/prove-artifact-transport-readiness.mts   # expect ARTIFACT_TRANSPORT_STORE_READY
npx tsc --noEmit -p tsconfig.json 2>&1 | grep -c "error TS"    # expect ~20, none new
```

## Ownership freeze and bounded current-graph proof (2026-08-28)

- [x] Freeze PostgreSQL 18 as canonical identity, revision, eligibility, evidence, and relationship authority; pgvector is the canonical-side exact/reference vector executor.
- [x] Freeze Qdrant as a rebuildable dense/sparse retrieval projection; Qdrant point IDs and executor-local ordinals never become canonical identity.
- [x] Freeze Go Retrieval as a read-only executor that returns raw lane hits; TypeScript `SearchRuntime` remains the single production fusion/RRF owner.
- [x] Freeze Neo4j/cuGraph as structural traversal/execution projections; graph features remain derived and do not add an independent retrieval vote.
- [x] Reconfirm the Graphify lexical owner as PostgreSQL `search_vector` with `ts_rank_cd`: 55,206/55,206 rows have the search vector; `pg_search` is installed but remains unpromoted pending live scorer/index proof and shared text-search configuration. See `docs/reports/graphify-lexical-owner-v1.json`.
- [x] Prove bounded current structural graph artifact: 23 nodes, 12 resolved edges, revision-bound Parquet, no production writes.
- [x] Prove NetworkX↔cuGraph PageRank parity on the current artifact: identical ordering, max absolute error below `1e-5`.
- [x] Prove graph-node↔CandidateOrdinal round-trip: 23/23 bound, zero workspace conflicts.
- [x] Join graph features through the existing 25-column presence-masked CandidateFeatureMatrix: 15 candidates, 7 graph-feature-bearing rows.
- [x] Replay golden retrieval and ContextManifest with graph features attached as non-ranking metadata; both replays remain deterministic.
- [x] Audit the exact semantic canary intersection: 15/15 candidates have exact chunk bindings, populated `content_embedding_768`, and embedding producer metadata; see `docs/reports/lineage-semantic-768-cohort-v1.json`.
- [x] Correct and rerun the read-only semantic backfill planner so it selects `content_embedding_768` before classifying rows: 15/15 PostgreSQL vectors present, 30 Qdrant lineage points present, and zero embeddings planned; see `docs/reports/lineage-qualified-semantic-768-backfill-plan-v1.json`.
- [x] Rerun the read-only full-corpus lineage census: 61,660 packets, 778 exact Graphify sources, 43 exact packet/chunk joins, 15 source/chunk-qualified canary rows, and 0 fully qualified rows because the current corpus has no graph revision owner; see `docs/reports/lineage-qualified-candidate-cohort-v1.json`.
- [ ] Scale exact lineage-qualified candidates from 15 to 128, then 768; do not use aliases, fuzzy matches, or synthetic revisions.
- [x] Complete live pgvector-exact↔Qdrant identity/score parity for the frozen 15-row cohort: 15/15 identities, vectors, scores, and rank ordering now match; see `docs/reports/lineage-pgvector-qdrant-parity-v1.json`.
- [x] Repair the Qdrant `content` projection from canonical PostgreSQL `content_embedding_768`: 15 explicitly resolved target points updated through the named-vector endpoint, zero deletes, zero PostgreSQL writes; see `docs/reports/lineage-qdrant-named-vector-repair-v1.json`.
- [x] Run `QDRANT-PROJ-01` read-only target census: all 15 candidates have two same-collection Qdrant points; PostgreSQL `codebase_chunk_index.qdrant_id` matches the legacy numeric point through its `qdrant_point_id` payload (`DUPLICATE_SAME_COLLECTION` 15/15), while the UUID point is a duplicate projection. No deletion is authorized; named-vector update review may target the explicit matching point. See `docs/reports/lineage-qdrant-projection-targets-v1.json`.
- [x] Prepare `QDRANT-PROJ-02` named-vector repair plan: PostgreSQL read-only source resolves 15/15 explicit targets; 30 points observed, exactly 15 planned; repair uses `PUT /points/vectors` for `content` only, with zero payload replacement, point creation, deletion, or PostgreSQL write. Dry-run: `docs/reports/lineage-qdrant-named-vector-repair-v1.json`.
- [x] Complete `QDRANT-PROJ-03` named-vector repair and independent parity readback: 15/15 PostgreSQL↔Qdrant identities, content vectors, scores, and rank ordering match; 30 same-collection projection points remain; no PostgreSQL writes, deletes, or point creation. Duplicate UUID projections remain review-only. See `docs/reports/lineage-pgvector-qdrant-parity-v1.json` and `docs/reports/lineage-qdrant-projection-targets-v1.json`.
- [x] Prove Go Retrieval HTTP/gRPC health and live `StreamCodebase` delivery: 3 chunk events received from `:50053`; see `docs/reports/go-retrieval-chunk-stream-replay-v1.json`.
- [x] Preserve the transport contract for stream lineage metadata: `CodebaseChunk` already carries packet/source/revision fields, and the TypeScript adapter now preserves them; focused typecheck and 4/4 client tests pass.
- [x] Prove `ORNITH_EXTERNAL_EVIDENCE_SYNTHESIS_REPLAY`: 11 bounded external evidence records, strict JSON envelope, fixed seed/temperature, thinking disabled, prompt-cache disabled, citation point-ID binding validated, three identical raw/normalized response checksums, and a bounded review packet; synthesis remains `REVIEW_ONLY` with no durable writes. Automated review flags detect the external `vector(1024)` claim against the ingested 768-dimensional metadata, so human review remains required. See `docs/reports/ornith-external-evidence-synthesis-replay-v1.json`.
- [x] Add optional exact `packet_keys` allowlisting to `CodebaseSearchRequest`/HTTP `/search/codebase`; constrain the Qdrant projection without creating canonical identity. Go protobuf regeneration and Go tests pass.
- [x] Replay `StreamCodebase` against the repaired 15-candidate packet-key canary after rebuilding/restarting the live Go service: 15/15 streamed chunks carry packet/source/workspace/source/representation revisions; 8 unique packet keys reflect duplicate projection points; no writes. See `docs/reports/go-retrieval-chunk-stream-replay-v1.json`.
- [x] Audit the bounded 15-point Qdrant projection against packet fan-out rules: 15/15 packet keys, 15/15 chunk IDs, 0/15 revision-qualified; three source-path conflict groups and one revision-unproven group remain; see `docs/reports/qdrant-packet-fanout-v1.json`.
- [x] Run the read-only PostgreSQL chunk bridge: 15 exact chunk identities found, zero content/source mismatches; 243 broader rows remain revision-unproven, so the bridge is evidence for bounded repair planning only; see `docs/reports/chunk-bridge-v1.json`.
- [x] Rebuild the lineage-qualified CandidateOrdinal map from the exact chunk bridge: 15 rows, frozen candidate snapshot revision `lineage-qualified-canary:sha256:b19b04b6b19a1fe0cfd48d2fa9507f9e7055f9f3dfed277d2e3d5dea3303f4dc:v1:15`, ordinal checksum `86fee5d38619d3065d8710942068f26fb5b0d3c09992b1b523083ae0a593d297`, and no graph revision asserted. See `docs/reports/lineage-qualified-candidate-map-v1.json`.
- [x] Generate the frozen 15-candidate Qdrant projection repair plan: 15 canonical PostgreSQL rows, 30 exact Qdrant points planned, zero writes/deletes; see `docs/reports/lineage-qdrant-projection-repair-dry-run-v1.json`.
- [x] Correct the bounded repair writer to emit `representation_revision` from the candidate's proven `semanticRevision`; revalidated the dry-run with zero writes/deletes.
- [ ] Scale the exact parity proof from 15 to 128, then 768; preserve exact `source_ref`/`content_hash`/revision bindings and do not use aliases, fuzzy matches, or synthetic revisions.
- [x] Wrap the `[15,25]` matrix in `CandidateFeatureMatrixManifestV1` and prove graph A/B replay: baseline and graph replays identical, 7 graph-present rows, 8 graph-absent rows, no ranking promotion; see `docs/reports/current-candidate-feature-matrix-manifest-v1.json`.
- [x] Prove the fixture `CandidateOrdinalGpuAbiV1` decode boundary: 23 graph executor rows, zero unknown ordinals, zero revision mismatches, dense executor-local graph ordinals; see `docs/reports/candidate-ordinal-gpu-abi-v1.json`.
- [ ] Prove live cuVS exact semantic parity at the representation/quality boundary; executor fixture success does not imply ranking promotion. The existing WSL `atlas-rapids-cu13` environment passes CUDA/cuGraph capability, graph parity, and the bounded 8098 PyTorch↔cuVS CandidateOrdinal round-trip. Cross-executor semantic recall/rank parity remains open.
- [x] Prove the live 8098 graph capability and bounded NetworkX↔cuGraph PageRank parity without writes; see `docs/reports/graph-ordinal-cpu-gpu-parity-v1.json`.
  - **2026-09-01 correction:** after restarting the current `atlas_rapids_sidecar_graph.py` entrypoint, the live response explicitly reported `renumbered: false`. Numerical parity passed with identical ordering, max error `7.19e-7`, unknown ordinals `0`, and writes `false`. This proves the bounded fixture only; full production graph projection remains separate.
- [x] Prove the live 8098 PyTorch/cuVS CandidateOrdinal decode and ordinal-set parity without writes; see `docs/reports/8098-candidate-ordinal-roundtrip-v1.json`.
- [ ] Prove graph-aware feature use in ranking separately; PageRank attachment currently does not affect ordering.
- [ ] Keep neural shortlist/classifier, Valkey cache, relationship fan-out, and mutation execution outside this correctness gate until independently proven.
- [x] REV-OWNER-GRAPH-05I Characterize the current 8095 structural edge producer without promotion: the read-only plan emits 23 nodes, 12 resolved edges, and 50 unresolved edges, but remains bound to the older `sha256:b19b04b6b19a1fe0cfd48d2fa9507f9e7055f9f3dfed277d2e3d5dea3303f4dc` workspace revision rather than the current 111-source binding revision `sha256:55edaaadab0cef724593287c7c908dad6cdc1b25039a752a6b5dab2c0c44fac9`. The current artifact audit therefore reports 0 current revision-qualified edges. This is structural-provider evidence only; no Postgres, Qdrant, Neo4j, Valkey, or canonical graph writes occurred. See `docs/reports/current-structural-edge-artifact-plan-v1.json` and `docs/reports/current-graph-artifact-readiness-v1.json`.
- [x] REV-OWNER-GRAPH-05J Run the additive current-source structural planner against the 111-source Graphify batch: 103 source files processed, 2,442 native chunks, 12,106 diagnostic edge observations, and 0 resolved current structural edges. Classifications were `native_chunk=1,600`, `unresolved_target=9,730`, and `syntax_only=776`; no planner errors or durable writes occurred. Current graph promotion remains blocked on a revision-bound edge resolver/producer, not on PostgreSQL, Qdrant, or the GPU executor. See `docs/reports/current-structural-edge-artifact-plan-v2.json`.
- [x] REV-OWNER-GRAPH-05K Prove the bounded 8095 Tree-sitter structural observation surface independently: 6 selected sources extracted successfully with 555 chunks, 3,262 edge observations, and 0 failures. This proves sidecar/parser availability only; it does not prove symbol resolution, current graph-revision ownership, CandidateOrdinal admission, or graph promotion. See `docs/reports/treesitter-structural-observation-v1.json`.
- [x] REV-OWNER-GRAPH-05L Separate resolver availability from resolver readiness: the read-only TypeScript LSP proof returned 1 definition with `PROVEN_READ_ONLY` (`docs/reports/typescript-lsp-readonly-proof-v1.json`), while `verify-symbol-resolver.mjs` found the resolver table populated (58,365 rows, 37,237 unique feature IDs) but 4,270 feature-ID collisions, an empty cache, and no current revision-qualified structural edge output. LSP/symbol infrastructure is available for an adapter, but it is not yet a promoted graph-edge owner.
- [x] REV-OWNER-GRAPH-05M Build and read back the current structural graph artifact from the v2 read-only plan: current workspace revision `sha256:55edaaadab0cef724593287c7c908dad6cdc1b25039a752a6b5dab2c0c44fac9`, 2,545 unique nodes, 1,334 resolved structural edges, all edge endpoints known, and deterministic derived `graphRevision=sha256:5fdebed5628a322d9af29069458463c4fb931aaf8f5d1897ac38d65666740008`. Artifact is non-production and non-authoritative; no canonical or projection-store writes occurred. See `docs/reports/current-structural-edge-artifact-plan-v2.json` and `docs/reports/current-structural-graph-artifact-v2/manifest.json`.
- [x] REV-OWNER-GRAPH-05N Preserve structural node provenance and run the read-only source bridge: all 103 processed current Graphify source/revision/workspace triples are covered by the derived artifact under workspace revision `sha256:55edaaadab0cef724593287c7c908dad6cdc1b25039a752a6b5dab2c0c44fac9`; the frozen 15-candidate map has 0 overlap because it is bound to the older `b19…` snapshot. This confirms a revision mismatch between current structural artifacts and the frozen canary; it does not authorize remapping or candidate expansion.
- [x] REV-OWNER-GRAPH-05O Characterize the CandidateOrdinal materializer input mismatch: a separate read-only 15-row run still derives `workspaceRevision=sha256:b19b04b6b19a1fe0cfd48d2fa9507f9e7055f9f3dfed277d2e3d5dea3303f4dc` from `graphify_files`, despite the authorized current binding revision `sha256:55edaaadab0cef724593287c7c908dad6cdc1b25039a752a6b5dab2c0c44fac9`. The materializer must be updated to consume/validate `atlas_workspace_source_bindings` before a current CandidateOrdinal map can be produced. No canonical writes occurred. See `docs/reports/lineage-qualified-current-candidate-map-v2.json`.
- [x] REV-OWNER-GRAPH-05P Make CandidateOrdinal materialization binding-authoritative and fail closed: the new read-only join requires the authorized workspace binding, matching Graphify source/content revisions, and packet/chunk content equality. The current 15-row run returns `CANARY_EXACT_LINEAGE_COHORT_EMPTY`, proving that current bindings do not yet have packet+chunk exact joins; no relabeling or synthetic candidates were emitted. Evidence is the bounded command run against `scripts/atlas/materialize-lineage-qualified-candidate-map-v1.mts`; no v3 artifact was written because the gate correctly stopped before materialization.
- [x] REV-OWNER-GRAPH-05Q Measure the current binding-to-packet/chunk bridge directly: 111/111 workspace bindings match Graphify source/revision/content rows, but binding-to-chunk content matches are 0, packet content matches are 0, and current packet+chunk exact sources are 0. The CandidateOrdinal expansion gate is therefore a packet/chunk identity reconciliation problem; no fallback, fuzzy match, or synthetic revision is permitted. See `docs/reports/current-workspace-packet-chunk-join-v1.json`.
- [x] REV-OWNER-GRAPH-05R Confirm the mismatch is hash-grain and inventory coverage, not a failed Graphify binding: `atlas_workspace_source_bindings.content_digest` equals the whole-source `graphify_files.content_hash`, while `codebase_chunk_index.content_hash` is per-chunk; the current chunk inventory has 55,206 rows, 55,206 relative paths, 52,417 source refs, and only 1 of 111 bound sources has a relative-path chunk match. The exact CandidateOrdinal gate remains blocked until a producer supplies packet/chunk-level identity for the current source batch. The audit is read-only and performs no fallback or writes. See `docs/reports/current-workspace-packet-chunk-join-v1.json`.
- [x] REV-OWNER-GRAPH-05S Repair the narrow chunk-index provenance omission: `index-full-repo-for-search.mjs` already derives `relative_path`/`source_ref` but previously inserted only `relative_path`; it now writes and idempotently updates `source_ref`. The live table does not expose source/workspace revision columns, so those remain external binding metadata. This improves future inventory coverage only; it does not equate whole-source and per-chunk hashes, populate historical rows, or unblock current CandidateOrdinal expansion. Validate with a dry-run before any apply.
- [x] REV-OWNER-GRAPH-05T Add source-plan targeting to the indexer so `--source-plan=docs/reports/current-source-graphify-batch-plan-v1.json` selects the current Graphify-exact source set instead of an arbitrary filesystem prefix. This is a dry-run/apply targeting improvement only; it does not authorize writes or create packet/chunk identity.
- [x] REV-OWNER-GRAPH-05U Run the exact current-source-plan dry-run: 108/111 bound files exist in the checkout, 65 files require work, 1 is already indexed, 630 chunks are planned, and 0 errors/writes occurred. The three absent files and 43 files with no pending chunks remain explicit reconciliation items; no current CandidateOrdinal map was produced.
- [x] REV-OWNER-GRAPH-05V Correct source-plan targeting: include `.mts`/`.cts`/`.sh` sources and map the canonical `src/...` binding reference to the checkout's `sveltekit-frontend/src/...` path while retaining the canonical binding reference in chunk metadata. Validate with a source-plan dry-run; no apply or identity promotion is implied.
- [x] REV-OWNER-GRAPH-05W Complete the exact source-plan dry-run after path normalization: 111/111 bound files selected, 68 files produced 647 planned chunks, 1 file was already indexed, and 0 errors/writes occurred. This establishes the bounded write plan only; packet/chunk exact identity and CandidateOrdinal admission remain blocked until an authorized apply plus independent readback.
- [x] REV-OWNER-GRAPH-05X Execute the authorized current 111-source apply and repair the observed SQL-shape failure: the first attempt made 647 Qdrant projection writes before PostgreSQL rejected nonexistent `source_revision`/`workspace_revision` columns; no PostgreSQL chunks were committed by that failed attempt. After removing those unsupported columns while retaining `source_ref`, the retry completed 647/647 chunks with 0 errors and Redis warming disabled. Independent readback found 647 new `semantic_768` rows and 675 matching `fullrepo:` Qdrant points; no deletions or graph writes occurred.
- [x] REV-OWNER-GRAPH-05Y Characterize the remaining packet bridge after projection repair: the 111 current `atlas_packets` rows have UUID `chunk_id` values that do not match the new `fullrepo:<source_ref>:<segment>` chunk IDs. Legacy numeric Qdrant IDs are a separate coordinate system; do not infer CandidateOrdinal or rewrite packet IDs.
- [x] REV-OWNER-GRAPH-05Z Audit legacy packet Qdrant IDs independently: all 111 current packet IDs were requested from `codebase_chunks_768`; Qdrant returned 20/111, with 20/20 source and legacy chunk-ID payload matches, but 0 content-hash matches. The bridge is therefore partial and cannot qualify the full cohort. Persisted read-only evidence: `docs/reports/current-packet-qdrant-bridge-v1.json`. No deletion, remapping, or identity promotion occurred.
- [x] REV-OWNER-GRAPH-05AA Audit `GraphNodeInventoryV1` over the current derived structural plan: 2,545 unique graph-node keys across 103 processed sources share the current workspace revision, but all 2,545 lack a producer revision. The inventory is therefore non-authoritative and edge admission remains closed; no graph revision or durable graph/projection writes occurred. See `scripts/atlas/audit-current-graph-node-inventory-v1.mjs` and `docs/reports/current-graph-node-inventory-v1.json`.
- [x] REV-OWNER-GRAPH-05AB Audit the current Graphify run owner read-only: the current workspace revision has one `graphify_runs` row, and its `workspace_id` now resolves to one matching `public.workspaces` row, but the run remains `RUNNING` with `completed_at = NULL`. `source_manifest_digest` and source count are present, but no authoritative completed run exists; graph revision and edge admission remain closed. See `scripts/atlas/audit-current-graphify-run-owner-v1.mjs` and `docs/reports/current-graphify-run-owner-v1.json`.
- [x] REV-OWNER-CODE-02Q Trace the current inventory writer lifecycle read-only: `graphify-source-inventory-writer-v2.ts` creates/updates a `graphify_runs` row as `RUNNING` and writes/readbacks `graphify_files`, but does not finalize the run as `COMPLETED` or create a workspace owner. Treat it as source-inventory persistence, not the authoritative Graphify snapshot-completion owner; do not mark the live run complete from this audit.
- [x] REV-OWNER-CODE-02R Characterize the remaining completion-owner split read-only: `daily-graphify-mastra-workflow.mjs` finalizes a separate `graphify_workflow_runs` table with status `COMPLETE`, while the canonical `graphify_runs` row remains `RUNNING`; no existing adapter bridges workflow completion to the canonical Graphify run with source/node/edge checksums. Do not treat the workflow table as the canonical snapshot owner or copy its status into `graphify_runs` without a receipt-bound completion step.
- [x] GRAPH-06C0 Build and maintain the read-only `GraphifyRunCompletionPlanV1`: it joins the canonical run-owner audit with the current structural artifact, treats the source selection as complete (`111/111`, including 8 explicitly unsupported non-code files), and fails closed on incomplete run status and 10,506 unresolved edges. It computes node/edge checksums but assigns no `graphRevision` and performs no durable writes. See `scripts/atlas/plan-graphify-run-completion-v1.mjs` and `docs/reports/graphify-run-completion-plan-v1.json`.
- [x] GRAPH-06A Confirm the graph-ownership gap is a snapshot-contract gap, not merely missing edge columns: the current node inventory has 2,545 unique keys under the current workspace revision but no producer revisions; the current Graphify run is incomplete, and no authoritative completed source snapshot owns a `graphRevision`. Keep `Candidate-128-SEMANTIC` conceptually separate from `Candidate-128-FULL-FEATURE`; graph absence must remain feature absence until full-feature admission is explicitly requested.
- [x] GRAPH-06B Define, emit, and audit the revision-qualified graph-edge artifact contract read-only: the planner now emits stable `graphNodeKey` endpoints, exact source/revision evidence, `producerRevision`, deterministic `edgeId`, and `evidenceChecksum`; the audit passes all required fields across 2,545 nodes and 1,334 known-endpoint edges with 0 duplicate edge shapes and 0 unknown endpoints. This is still a non-authoritative plan with `graphRevision = null`; snapshot admission remains closed until the completed-source owner and replay gates pass. No legacy edges were mutated and no graph revision was synthesized. See `scripts/atlas/plan-current-structural-edge-artifact-v2.mjs`, `scripts/atlas/audit-current-structural-edge-contract-v1.mjs`, and `docs/reports/current-structural-edge-contract-v1.json`.
- [x] GRAPH-06B1 Replay the current 111-source structural planner twice: both runs produced the same report checksum `sha256:3b4e9960c504b69f698c9f6db52d9da7f5f7845b912fdf4c7850ce5ec20938f8`, with 2,545 nodes, 1,334 resolved edges, and 10,506 unresolved observations. This proves deterministic shadow-plan replay only; it does not prove a completed Graphify run, graph ownership, or promotion.
- [ ] GRAPH-06C Build the bounded 111-source edge snapshot from one completed Graphify/source snapshot, then emit a `GraphifyRunReceiptV1` and `GraphSnapshotV1` only after node/edge/source checksums and independent replay are stable.
- [x] GRAPH-06C0 Correct the read-only completion-plan classification: the current source-selection plan is complete (`111/111` exact, zero missing/ambiguous/mismatch rows); the remaining coverage blocker is structural processing (`103/111`), not source selection. The completion plan now reports `STRUCTURAL_SOURCE_PROCESSING_INCOMPLETE` separately.
- [x] GRAPH-06C1 Classify the eight selected non-code sources (`.md`/`.sh`) as `STRUCTURAL_LANGUAGE_ADAPTER_NOT_CONFIGURED` in the read-only structural artifact plan. Structural coverage now accounts for `103` processed code sources plus `8` explicitly unsupported sources; no source is silently omitted and no graph revision is admitted.
- [x] GRAPH-06C2 Refine the unresolved-edge census read-only: `10,506` unresolved observations comprise `9,730` unresolved `CALLS`/`REFERENCES` targets and `776` syntax-only `IMPORTS`/`EXPORTS` observations (`308` imports, `468` exports). Keep all non-resolved observations non-admissible; do not convert syntax-only evidence into graph edges without a target identity.
- [x] GRAPH-RESOLVE-01 Audit the existing symbol resolver/cache before structural-edge admission: PostgreSQL lookup/index/performance/confidence gates pass, but Valkey cache-key coverage fails (`0` keys; `0/3` sampled prefix caches populated) and the resolver reports `4,270` feature-ID collisions across `37,237` unique features. Keep the resolver available but non-promotional until revision-qualified identity and cache-key behavior are proven; no edges or graph revisions were written.
- [x] GRAPH-RESOLVE-02 Plan the revision-qualified resolver/cache key contract read-only: `symbol_resolver` has no `workspace_revision`, `source_revision`, or `graph_revision` columns, so the current `symbol:<prefix>:packets` cache cannot be revision-safe; no cache keys were written. See `scripts/atlas/plan-symbol-resolver-revision-key-v1.mjs` and `docs/reports/symbol-resolver-revision-key-plan-v1.json`.
- [x] GRAPH-RESOLVE-03 Define the pure `RevisionQualifiedSymbolResolutionV1` contract and revision-addressed cache-key builder in `packages/parent-atlas`; deterministic checksum/key tests pass and the contract remains non-authoritative. No live resolver rows, cache keys, structural edges, or graph revisions were written.
- [x] GRAPH-RESOLVE-04 Run the bounded structural target-identity audit fail-closed: sampled unresolved observations carry source revisions but no canonical target source/symbol/revision identity, so `0` legacy resolver matches are promoted and `0` structural edges are admitted. See `scripts/atlas/audit-bounded-structural-target-identity-v1.mjs` and `docs/reports/bounded-structural-target-identity-v1.json`.
- [x] GRAPH-RESOLVE-05 Add the pure LSP-to-`RevisionQualifiedSymbolResolutionV1` adapter: resolved LSP observations require target source, target source revision, stable symbol ID, and symbol-version ID; ambiguous/unresolved/incomplete targets reject closed. Focused package tests pass; no resolver rows, cache keys, edges, or graph revisions were written.
- [x] GRAPH-RESOLVE-06A Add the pure injected-reader LSP target-identity enrichment layer: canonical URI mapping, exact target source revision/content digest, UTF-16 LSP range to UTF-8 byte range conversion, and exact tree-node/symbol-range/containing-symbol selection. Ambiguous, missing, and outside-workspace targets fail closed; focused package compile and tests pass 5/5. No persistence or edge admission is performed.
  - [ ] GRAPH-RESOLVE-06B Bind the enrichment layer to a live authoritative LSP/compiler producer and prove target identity on the bounded unresolved-edge sample. Keep this gate split into offline snapshot/replay and later authoritative identity enrichment. The current live census is fail-closed: 85 of the 353 tree-bound nominations have exact registry and symbol-version bindings after seventeen bounded canaries, while 268 remain unresolved. Identity enrichment attempted/admitted edges remain 0. Do not create synthetic symbol versions, use fuzzy aliases, or bulk-populate structural edges from unresolved/collision-prone matches.
  - [x] GRAPH-RESOLVE-06B.1 Export the current 111-source Tree-sitter snapshot read-only: 1,592 AST rows from 84 supported sources, 27 explicitly unsupported sources, stable snapshot checksum `sha256:1adb82b653cb4efcd1decad1bfa07ebbd5e5e37bf8dd6e1af78b5f220ae38de1`, and zero database/projection writes. The snapshot now preserves the existing deterministic tree-node identity constructor. See `scripts/atlas/audit-treesitter-structural-observation-v1.mjs` and `docs/reports/treesitter-structural-observation-v1.json`. The earlier AST table backfill remains deferred; it is a later materialization step, not a prerequisite for this frozen-snapshot proof.
  - [x] GRAPH-RESOLVE-06B.2 Resolve the 440 current nominations against the frozen snapshot only, using the explicit `sveltekit-frontend/` namespace rule plus exact content hash, source revision, byte span, and upstream node identity. Result: 353 exact AST/span/tree-node bindings, 87 source-only rows, 0 ambiguous matches, 0 revision mismatches, 0 fuzzy matches, 0 symbol/version resolution attempts, and 0 writes. Replay artifact: `docs/reports/current-structural-symbol-resolution-v1.json`.
  - [ ] GRAPH-RESOLVE-06B.3 Resolve the 353 tree-bound rows to the existing authoritative `stable_symbol_id` registry, then revision-qualify `symbol_version_id`; remain read-only and fail closed on missing or ambiguous registry coverage. After two bounded five-row registry canaries and the separate second symbol-version tranche, the corrected proof reports `exactCanonicalKey=10`, `registryMissing=343`, `symbolVersionMissing=3`, `symbolVersionBound=7`, and `fuzzyMatches=0` across 10,180 active registry rows and 207 symbol-version rows. The earlier all-missing result was caused by a proof/planner source-namespace normalization mismatch; the proof now uses the same canonical source-reference rule as the review plan. Full reconciliation remains open: 343 rows still lack exact registry coverage and three exact registry rows still lack symbol-version bindings. No aliases, fuzzy matches, or edges were created. See `scripts/atlas/prove-tree-bound-symbol-registry-resolution-v1.mjs`, `scripts/atlas/plan-tree-bound-symbol-registry-reconciliation-v1.mjs`, `scripts/atlas/plan-current-tree-bound-symbol-registry-input-v1.mjs`, and `docs/reports/tree-bound-symbol-registry-resolution-v1.json`.
  - [x] GRAPH-RESOLVE-06B.3A Build a format-safe five-row canary adapter from the validated current registry-input plan. The adapter selects deterministic review-only rows and emits the legacy materializer-compatible fields without authorization or writes. Result: `5/5` selected, output checksum `sha256:136b3cac2b7c8bad8e88c40566d2d38f7b1d92d51e4d2c1500042c5064e6fbde`, database/symbol-version/edge writes `0`. See `scripts/atlas/plan-current-tree-bound-symbol-registry-canary-v1.mjs` and `docs/reports/current-tree-bound-symbol-registry-canary-v1.json`.
  - [x] GRAPH-RESOLVE-06B.3B Add the explicitly guarded canary apply/readback adapter. It requires both `--apply` and `ATLAS_AUTHORIZE_SYMBOL_REGISTRY_CANARY=1`, limits input to exactly five rows, verifies field-level readback, rolls back on mismatch, and never creates symbol versions or edges. Dry-run proof: `5` selected, authorization absent, writes `0`. See `scripts/atlas/apply-current-tree-bound-symbol-registry-canary-v1.mjs` and `docs/reports/current-tree-bound-symbol-registry-canary-apply-v1.json`.
  - [x] GRAPH-RESOLVE-06B.3C Add the read-only bridge from the corrected tree-bound/registry proof to the existing AST symbol-version materializer contract. It emits `CANONICAL` only for exact active registry-key matches, strips the agreed frontend namespace consistently, and produced `5` revision-qualified candidates from `440` nominations with `0` aliases, fuzzy matches, symbol-version writes, or database writes. The materializer dry-run accepted all `5` candidates without attempting insertion. See `scripts/atlas/adapt-tree-bound-symbol-registry-to-materializer-v1.mjs` and `docs/reports/current-materializer-symbol-resolution-adapter-v1.json`.
  - [x] GRAPH-RESOLVE-06B.3D Apply the explicitly authorized five-row symbol-version canary and independently replay the resolver. Result: `5` symbol versions and `5` projection rows inserted, then read-only proof confirmed `exactCanonicalKey=5`, `symbolVersionBound=5`, `symbolVersionMissing=0`, `registryMissing=348`, `fuzzyMatches=0`, and `0` edge writes. The materializer’s AST bridge was then corrected to consume the revision-qualified frozen AST snapshot and now reports `RESOLVED=5`, `UNRESOLVED=0`, `AMBIGUOUS=0` on an idempotent replay. See `docs/reports/ast-symbol-version-materialization-v1.json` and `docs/reports/tree-bound-symbol-registry-resolution-v1.json`.
  - [x] GRAPH-RESOLVE-06B.3E Apply the next explicitly authorized five-row unresolved registry canary and replay the registry proof. Result: `5` additional stable-symbol rows inserted and read back `5/5` with no mismatches; active registry coverage is now `10/353`, remaining unresolved `343`, symbol-version bindings `5`, and symbol-version rows for the new canary remain pending their separate materialization step. No edge writes occurred. See `docs/reports/current-tree-bound-symbol-registry-canary-apply-v1.json` and `docs/reports/tree-bound-symbol-registry-resolution-v1.json`.
  - [x] GRAPH-RESOLVE-06B.3F Prepare the separate five-row symbol-version tranche read-only. The materializer now supports deterministic `--skip=N --limit=N` selection; dry-run `--skip=5 --limit=5` selected exactly `5` of `10` canonical, revision-qualified candidates, listed the next five nominations, and reported `databaseWrites=false`.
  - [x] GRAPH-RESOLVE-06B.3G Apply the explicitly authorized second five-row symbol-version tranche with independent readback. Result: `5` attempted, `2` inserted, `3` already present, `5` projection rows refreshed, identity bridge `RESOLVED=5`, and no ambiguous/unresolved bridge rows. The independent registry proof then reported `symbolVersionBound=7` with three exact registry rows still pending because they belonged to the first five candidate positions.
  - [x] GRAPH-RESOLVE-06B.3H Complete the bounded ten-row symbol-version canary with independent readback. Replayed the first five deterministically: `5` attempted, `3` inserted, `2` already present, `5` projection rows refreshed, identity bridge `RESOLVED=5`. Final proof reports `exactCanonicalKey=10`, `symbolVersionBound=10`, `symbolVersionMissing=0`, `registryMissing=343`, `sourceRevisionMismatch=0`, `fuzzyMatches=0`, and `0` edge writes. The full 353-row identity gate remains open because only ten exact registry candidates are currently authoritative. See `docs/reports/ast-symbol-version-materialization-v1.json` and `docs/reports/tree-bound-symbol-registry-resolution-v1.json`.
  - [x] GRAPH-RESOLVE-06B.3I Refresh the registry reconciliation after the ten-row canary and prepare the next review-only tranche. The stale input-plan issue was detected before apply; after regeneration, counts are `exactCurrent=10`, `unresolved=343`, and the next plan selects five previously unregistered candidates with checksum `sha256:3191c2ec0a9b73eb0aebb1840f6c5fb7611134f9dffe5291c8a278a0a9eacb8e`. Registry, symbol-version, and edge writes remain `0`; explicit canary authorization is still required.
  - [x] GRAPH-RESOLVE-06B.3J Apply the refreshed five-row registry canary and complete its bounded symbol-version materialization. Registry readback was `5/5`; the materializer processed the bounded canonical set of `15` with `5` new inserts and `10` idempotent matches, refreshed `15` projection rows, and resolved all `15` identity bridges. Final proof reports `exactCanonicalKey=15`, `symbolVersionBound=15`, `symbolVersionMissing=0`, `registryMissing=338`, `sourceRevisionMismatch=0`, `fuzzyMatches=0`, and `0` edge writes. See `docs/reports/current-tree-bound-symbol-registry-canary-apply-v1.json`, `docs/reports/ast-symbol-version-materialization-v1.json`, and `docs/reports/tree-bound-symbol-registry-resolution-v1.json`.
  - [x] GRAPH-RESOLVE-06B.3K Apply the next refreshed five-row registry canary and complete bounded symbol-version materialization. Registry readback was `5/5`; the materializer processed the bounded canonical set of `20` with `5` new inserts and `15` idempotent matches, refreshed `20` projection rows, and resolved all `20` identity bridges. Final proof reports `exactCanonicalKey=20`, `symbolVersionBound=20`, `symbolVersionMissing=0`, `registryMissing=333`, `sourceRevisionMismatch=0`, `fuzzyMatches=0`, and `0` edge writes. See `docs/reports/current-tree-bound-symbol-registry-canary-apply-v1.json`, `docs/reports/ast-symbol-version-materialization-v1.json`, and `docs/reports/tree-bound-symbol-registry-resolution-v1.json`.
  - [x] GRAPH-RESOLVE-06B.3L Apply the next refreshed five-row registry canary and complete bounded symbol-version materialization. Registry readback was `5/5`; the materializer processed the bounded canonical set of `25` with `5` new inserts and `20` idempotent matches, refreshed `25` projection rows, and resolved all `25` identity bridges. Final proof reports `exactCanonicalKey=25`, `symbolVersionBound=25`, `symbolVersionMissing=0`, `registryMissing=328`, `sourceRevisionMismatch=0`, `fuzzyMatches=0`, and `0` edge writes. See `docs/reports/current-tree-bound-symbol-registry-canary-apply-v1.json`, `docs/reports/ast-symbol-version-materialization-v1.json`, and `docs/reports/tree-bound-symbol-registry-resolution-v1.json`.
  - [x] GRAPH-RESOLVE-06B.3M Apply the next refreshed five-row registry canary and complete bounded symbol-version materialization. Registry readback was `5/5`; the materializer processed the bounded canonical set of `30` with `5` new inserts and `25` idempotent matches, refreshed `30` projection rows, and resolved all `30` identity bridges. Final proof reports `exactCanonicalKey=30`, `symbolVersionBound=30`, `symbolVersionMissing=0`, `registryMissing=323`, `sourceRevisionMismatch=0`, `fuzzyMatches=0`, and `0` edge writes. See `docs/reports/current-tree-bound-symbol-registry-canary-apply-v1.json`, `docs/reports/ast-symbol-version-materialization-v1.json`, and `docs/reports/tree-bound-symbol-registry-resolution-v1.json`.
  - [x] GRAPH-RESOLVE-06B.3N Apply the next refreshed five-row registry canary and complete bounded symbol-version materialization. Registry readback was `5/5`; the materializer processed the bounded canonical set of `35` with `5` new inserts and `30` idempotent matches, refreshed `35` projection rows, and resolved all `35` identity bridges. Final proof reports `exactCanonicalKey=35`, `symbolVersionBound=35`, `symbolVersionMissing=0`, `registryMissing=318`, `sourceRevisionMismatch=0`, `fuzzyMatches=0`, and `0` edge writes. See `docs/reports/current-tree-bound-symbol-registry-canary-apply-v1.json`, `docs/reports/ast-symbol-version-materialization-v1.json`, and `docs/reports/tree-bound-symbol-registry-resolution-v1.json`.
  - [x] GRAPH-RESOLVE-06B.3O Apply the next refreshed five-row registry canary and complete bounded symbol-version materialization. Registry readback was `5/5`; the materializer processed the bounded canonical set of `40` with `5` new inserts and `35` idempotent matches, refreshed `40` projection rows, and resolved all `40` identity bridges. Final proof reports `exactCanonicalKey=40`, `symbolVersionBound=40`, `symbolVersionMissing=0`, `registryMissing=313`, `sourceRevisionMismatch=0`, `fuzzyMatches=0`, and `0` edge writes. See `docs/reports/current-tree-bound-symbol-registry-canary-apply-v1.json`, `docs/reports/ast-symbol-version-materialization-v1.json`, and `docs/reports/tree-bound-symbol-registry-resolution-v1.json`.
  - [x] GRAPH-RESOLVE-06B.3P Apply the next refreshed five-row registry canary and complete bounded symbol-version materialization. Registry readback was `5/5`; the materializer processed the bounded canonical set of `45` with `5` new inserts and `40` idempotent matches, refreshed `45` projection rows, and resolved all `45` identity bridges. Final proof reports `exactCanonicalKey=45`, `symbolVersionBound=45`, `symbolVersionMissing=0`, `registryMissing=308`, `sourceRevisionMismatch=0`, `fuzzyMatches=0`, and `0` edge writes. See `docs/reports/current-tree-bound-symbol-registry-canary-apply-v1.json`, `docs/reports/ast-symbol-version-materialization-v1.json`, and `docs/reports/tree-bound-symbol-registry-resolution-v1.json`.
  - [x] GRAPH-RESOLVE-06B.3Q Apply the next refreshed five-row registry canary and complete bounded symbol-version materialization. Registry readback was `5/5`; the materializer processed the bounded canonical set of `50` with `5` new inserts and `45` idempotent matches, refreshed `50` projection rows, and resolved all `50` identity bridges. Final proof reports `exactCanonicalKey=50`, `symbolVersionBound=50`, `symbolVersionMissing=0`, `registryMissing=303`, `sourceRevisionMismatch=0`, `fuzzyMatches=0`, and `0` edge writes. See `docs/reports/current-tree-bound-symbol-registry-canary-apply-v1.json`, `docs/reports/ast-symbol-version-materialization-v1.json`, and `docs/reports/tree-bound-symbol-registry-resolution-v1.json`.
  - [x] GRAPH-RESOLVE-06B.3R Apply the next refreshed five-row registry canary and complete bounded symbol-version materialization. Registry readback was `5/5`; the materializer processed the bounded canonical set of `55` with `5` new inserts and `50` idempotent matches, refreshed `55` projection rows, and resolved all `55` identity bridges. Final proof reports `exactCanonicalKey=55`, `symbolVersionBound=55`, `symbolVersionMissing=0`, `registryMissing=298`, `sourceRevisionMismatch=0`, `fuzzyMatches=0`, and `0` edge writes. See `docs/reports/current-tree-bound-symbol-registry-canary-apply-v1.json`, `docs/reports/ast-symbol-version-materialization-v1.json`, and `docs/reports/tree-bound-symbol-registry-resolution-v1.json`.
  - [x] GRAPH-RESOLVE-06B.3S Apply the next refreshed five-row registry canary and complete bounded symbol-version materialization. Registry readback was `5/5`; the materializer processed the bounded canonical set of `60` with `5` new inserts and `55` idempotent matches, refreshed `60` projection rows, and resolved all `60` identity bridges. Final proof reports `exactCanonicalKey=60`, `symbolVersionBound=60`, `symbolVersionMissing=0`, `registryMissing=293`, `sourceRevisionMismatch=0`, `fuzzyMatches=0`, and `0` edge writes. See `docs/reports/current-tree-bound-symbol-registry-canary-apply-v1.json`, `docs/reports/ast-symbol-version-materialization-v1.json`, and `docs/reports/tree-bound-symbol-registry-resolution-v1.json`.
  - [x] GRAPH-RESOLVE-06B.3T Apply the next refreshed five-row registry canary and complete bounded symbol-version materialization. Registry readback was `5/5`; the materializer processed the bounded canonical set of `65` with `5` new inserts and `60` idempotent matches, refreshed `65` projection rows, and resolved all `65` identity bridges. Final proof reports `exactCanonicalKey=65`, `symbolVersionBound=65`, `symbolVersionMissing=0`, `registryMissing=288`, `sourceRevisionMismatch=0`, `fuzzyMatches=0`, and `0` edge writes. See `docs/reports/current-tree-bound-symbol-registry-canary-apply-v1.json`, `docs/reports/ast-symbol-version-materialization-v1.json`, and `docs/reports/tree-bound-symbol-registry-resolution-v1.json`.
  - [x] GRAPH-RESOLVE-06B.3U Apply the next refreshed five-row registry canary and complete bounded symbol-version materialization. Registry readback was `5/5`; the materializer processed the bounded canonical set of `70` with `5` new inserts and `65` idempotent matches, refreshed `70` projection rows, and resolved all `70` identity bridges. Final proof reports `exactCanonicalKey=70`, `symbolVersionBound=70`, `symbolVersionMissing=0`, `registryMissing=283`, `sourceRevisionMismatch=0`, `fuzzyMatches=0`, and `0` edge writes. See `docs/reports/current-tree-bound-symbol-registry-canary-apply-v1.json`, `docs/reports/ast-symbol-version-materialization-v1.json`, and `docs/reports/tree-bound-symbol-registry-resolution-v1.json`.
  - [x] GRAPH-RESOLVE-06B.3V Apply the next refreshed five-row registry canary and complete bounded symbol-version materialization. Registry readback was `5/5`; the materializer processed the bounded canonical set of `75` with `5` new inserts and `70` idempotent matches, refreshed `75` projection rows, and resolved all `75` identity bridges. Final proof reports `exactCanonicalKey=75`, `symbolVersionBound=75`, `symbolVersionMissing=0`, `registryMissing=278`, `sourceRevisionMismatch=0`, `fuzzyMatches=0`, and `0` edge writes. See `docs/reports/current-tree-bound-symbol-registry-canary-apply-v1.json`, `docs/reports/ast-symbol-version-materialization-v1.json`, and `docs/reports/tree-bound-symbol-registry-resolution-v1.json`.
  - [x] GRAPH-RESOLVE-06B.3W Re-run the next five-row registry canary with the explicit materializer input and verify idempotence. Registry readback was `5/5` with `0` new rows; explicit materialization processed `75` canonical candidates with `75` idempotent matches, refreshed `75` projection rows, and resolved `75` identity bridges. Independent proof remains `exactCanonicalKey=75`, `symbolVersionBound=75`, `symbolVersionMissing=0`, `registryMissing=278`, `sourceRevisionMismatch=0`, `fuzzyMatches=0`, and `0` edge writes. The earlier apparent `80` count was discarded as a stale/mismatched input-path result. See `docs/reports/current-tree-bound-symbol-registry-canary-apply-v1.json`, `docs/reports/ast-symbol-version-materialization-v1.json`, and `docs/reports/tree-bound-symbol-registry-resolution-v1.json`.
  - [x] GRAPH-RESOLVE-06B.3X Refresh the reconciliation plan, apply the next five genuinely unresolved registry entries, and materialize symbol versions with explicit nomination/resolution/snapshot inputs. Registry readback was `5/5` with `5` new rows; materialization processed `80` canonical candidates with `5` new inserts and `75` idempotent matches, refreshed `80` projection rows, and resolved all `80` identity bridges. Independent proof reports `exactCanonicalKey=80`, `symbolVersionBound=80`, `symbolVersionMissing=0`, `registryMissing=273`, `sourceRevisionMismatch=0`, `fuzzyMatches=0`, and `0` edge writes. See `docs/reports/current-tree-bound-symbol-registry-canary-apply-v1.json`, `docs/reports/ast-symbol-version-materialization-v1.json`, and `docs/reports/tree-bound-symbol-registry-resolution-v1.json`.
  - [x] GRAPH-RESOLVE-06B.3Y Refresh the reconciliation plan, apply the next five genuinely unresolved registry entries, and materialize symbol versions with explicit nomination/resolution/snapshot inputs. Registry readback was `5/5` with `5` new rows; materialization processed `85` canonical candidates with `5` new inserts and `80` idempotent matches, refreshed `85` projection rows, and resolved all `85` identity bridges. Independent proof reports `exactCanonicalKey=85`, `symbolVersionBound=85`, `symbolVersionMissing=0`, `registryMissing=268`, `sourceRevisionMismatch=0`, `fuzzyMatches=0`, and `0` edge writes. See `docs/reports/current-tree-bound-symbol-registry-canary-apply-v1.json`, `docs/reports/ast-symbol-version-materialization-v1.json`, and `docs/reports/tree-bound-symbol-registry-resolution-v1.json`.
  - [x] GRAPH-RESOLVE-06B.4A Prove the bounded current-producer artifact replay read-only: `440` nominations, `353` AST-bound resolutions, `5` exact registry/symbol-version identities, `0` identity failures, materializer readback `RESOLVED=5`, and replay checksum stable across two runs. No graph edges, canonical writes, or additional database writes were performed. This is an artifact replay proof, not yet a live `:8095` service restart/replay proof. See `scripts/atlas/prove-graph-resolve-06b4-live-producer-replay-v1.mjs` and `docs/reports/graph-resolve-06b4-live-producer-replay-v1.json`.
  - [x] GRAPH-RESOLVE-06B.4B Prove the live `:8095` producer on the 23-nomination `llm-context-cache.ts` bounded sample. The exact Graphify namespace path is required for deterministic upstream IDs; live `treesitter-chunker 4.0.0` returned `65` chunks and `453` edges, with source hash parity, `23/23` exact byte-span matches, `23/23` upstream-node matches, zero ambiguous spans, stable replay checksum across two runs, and zero canonical/edge/database writes. This proves the live adapter path for the bounded file, not full 440-nomination coverage. See `scripts/atlas/prove-live-structural-producer-replay-v1.mjs` and `docs/reports/live-structural-producer-replay-v1.json`.
  - [x] GRAPH-RESOLVE-06B.4C Prove the live `:8095` producer across the full current nomination cohort read-only. Fifty source files covering all `440` nominations passed source-content hash parity, exact byte-span matching, and exact upstream-node matching (`440/440`), with zero failures and a stable replay checksum across two runs. This proves the live structural producer cohort, but not full canonical symbol/version coverage: only the five authorized canary identities are currently materialized. See `scripts/atlas/prove-live-structural-producer-cohort-v1.mjs` and `docs/reports/live-structural-producer-cohort-v1.json`.
  - [x] **Full live cohort recheck 2026-09-05:** the existing producer proof returned `LIVE_STRUCTURAL_PRODUCER_COHORT_PROVEN` for `50` sources and `440/440` exact span and upstream-node matches, with `0` failures and replay checksum `sha256:e017da411c7e3024b4913310d793691f87bedee40a2488fb310ba23e79403ba6`. This confirms live producer coverage, not canonical symbol-version admission. Receipt: `docs/reports/live-structural-producer-cohort-v1.json`.
  - [ ] **Registry reconciliation plan recheck 2026-09-05:** the existing read-only planner returned `RECONCILIATION_REQUIRED` for `353` tree-bound rows: `90` exact current registry matches, `263` unresolved, `0` ambiguous, and `0` content/revision conflicts. Plan checksum: `sha256:51000ffd4727294f83b6c9e914c55d1b722f430cbdc9b34598d72512b0321de3`. No aliases, fuzzy matches, symbol versions, edges, or database writes are authorized. Receipt: `.tmp/atlas/tree-bound-symbol-registry-reconciliation-plan-v1.ndjson`.
  - [x] **Current registry-input plan recheck 2026-09-05 — superseded:** the existing planner emitted `353` `REGISTER_NEW_EXACT_REVIEW_ONLY` entries with checksum `sha256:6f38d0cb30de302ad02695ebbf89a77c2fdea3464741cf87e4ac758a8de34764`. This was a deterministic review artifact only: `promotionAuthorized=false`, `canonicalWrites=0`, `databaseWrites=0`, `aliasWrites=0`, and `symbolVersionWrites=0`. It is retained as historical evidence and must not be treated as current registry coverage. Receipt: `.tmp/atlas/current-tree-bound-symbol-registry-input-v1.ndjson`.
  - [x] **Five-row canary preparation recheck 2026-09-05 — superseded:** the canary planner selected exactly `5` review-only rows from the 353-entry input plan, with output checksum `sha256:136b3cac2b7c8bad8e88c40566d2d38f7b1d92d51e4d2c1500042c5064e6fbde`. It reported `promotionAuthorized=false`, `canonicalWrites=0`, `databaseWrites=0`, `symbolVersionWrites=0`, and `edgeWrites=0`. This remains historical review evidence only; its checksum is not transferable to the current 461-row plan. Receipt: `.tmp/atlas/current-tree-bound-symbol-registry-canary-v1.ndjson` and `docs/reports/current-tree-bound-symbol-registry-canary-v1.json`.
  - [x] **Authorized five-row canary replay 2026-09-05:** explicit `--apply` authorization was supplied for the frozen checksum `sha256:136b3cac2b7c8bad8e88c40566d2d38f7b1d92d51e4d2c1500042c5064e6fbde`. The bounded adapter acquired its lock, verified `5/5` rows, found `inserted=0` and `alreadyPresent=5`, read back `5/5` with no mismatches, and wrote `0` symbol versions or edges. This was an idempotent exact replay, not new registry coverage. Independent registry proof remains `90` exact keys / `85` symbol-version-bound rows / `263` unresolved. Receipt: `docs/reports/current-tree-bound-symbol-registry-canary-apply-v1.json`.
  - [x] **Current registry recheck 2026-09-05 (read-only) — superseded:** `scripts/atlas/prove-tree-bound-symbol-registry-resolution-v1.mjs` replayed the then-current tree-bound input and returned `READ_ONLY_PROVEN`: `353` tree-bound rows, `90` exact active registry keys, `85` revision-qualified symbol-version bindings, `263` registry-missing rows, `5` symbol-version-missing rows, `0` ambiguous rows, `0` fuzzy matches, `0` source-revision mismatches, and `0` database writes. The result remains historical evidence and does not describe the current 461-row cohort. Receipt: `docs/reports/tree-bound-symbol-registry-resolution-v1.json`.
  - [x] GRAPH-RESOLVE-06B.4 Bind the enriched identity result to the live bounded producer replay; no edge writes until 06B.3/06B.4 pass. **Closed 2026-09-05 (read-only):** after aligning the existing materializer with the canonical source-reference normalizer, preserving the outer source revision, and reporting dry-run bridge outcomes, two consecutive replay runs returned `READ_ONLY_PRODUCER_REPLAY_PROVEN` with `90` candidates, `90` `RESOLVED` bridges, `0` unresolved/ambiguous outcomes, `0` attempted/inserted/already-present rows, `0` edge writes, and identical replay checksum `sha256:28fe94f396690e2503ba55ca2cf9a20139ce912d6d6aa2a21d897ba135d097e9`. This closes only the bounded replay binding; the parent `GRAPH-RESOLVE-06B` gate remains open for unresolved registry coverage and does not authorize edge admission. Receipt: `docs/reports/graph-resolve-06b4-live-producer-replay-v1.json`.
  - [x] **Live replay recheck 2026-09-05 — superseded by the aligned replay closure:** the supplied AST snapshot was limited to a separate six-source observation audit, so the intermediate dry-run reported `RESOLVED=0`, `UNRESOLVED=90`, `AMBIGUOUS=0`. This was a historical artifact mismatch, not permission to loosen identity matching. No canonical, edge, or database writes occurred.
  - [x] **Artifact normalization recheck 2026-09-05 — superseded by the aligned replay closure:** the intermediate materializer run reported `RESOLVED=0`, `UNRESOLVED=90`, `AMBIGUOUS=0` because the source-reference/span artifact was not aligned. No writes occurred; the later shared normalization proof is the authoritative bounded result.
  - [x] **Path-alignment correction 2026-09-05:** after comparing both existing owners, the materializer preserved the outer source revision and applied the shared `canonicalAstSourceRef()` path normalization. The bounded dry-run returned `RESOLVED=90`, `UNRESOLVED=0`, `AMBIGUOUS=0`, with `rowsAttempted=0` and `databaseWrites=false`; the resulting bounded replay closure is recorded in the checked task above. This closes only the bounded replay binding, not unresolved registry coverage or edge admission.
  - Revision hardening: `materialize-ast-symbol-versions.mjs` now requires both `source_revision` and `workspace_revision`; it no longer substitutes one revision axis for the other. It also correctly requires an existing `CANONICAL` stable-symbol resolution, so the current review-only input cannot bypass 06B.3: current 440-row dry-run remains `0` canonical candidates and `0` writes. A dedicated adapter from the 06B.3 review plan to the materializer is not yet authorized or implemented.
- [ ] GRAPH-06D Prove `GraphOrdinalMapV1` and NetworkX↔cuGraph parity from the same frozen graph snapshot; executor-local graph ordinals must not become `CandidateOrdinal`, packet identity, or canonical graph identity.

Registry resolution recheck (read-only, 2026-09-18): `scripts/atlas/prove-tree-bound-symbol-registry-resolution-v1.mjs` now emits a checksum-bound v2 receipt. The current checkout's admitted workspace authority is `sha256:e24bb97187ea6394eeba457dd849915f570045b7a1867780fdc7aa9ea62b9acc`; the current plan contains `461` rows, all classified `STALE_WORKSPACE_REVISION_REVIEW_ONLY` (`promotableInputCount=0`, `nonPromotableInputCount=461`), and the resolver reports `0` exact canonical-key matches, `461` registry-missing rows, `0` symbol-version bindings, `0` fuzzy matches, and `0` source-revision mismatches. The receipt reports `inputPlanChecksum=sha256:011a7d0b66f80f451b20ad7d8af1fd8e53f19c44b1c61b2c2b74b7f5bb88a3e2`, `promotionAuthorized=false`, `canonicalWrites=0`, and `databaseWrites=0`; this does not close registry coverage or authorize packet-ID/materializer writes. Evidence: `docs/reports/tree-bound-symbol-registry-resolution-v2.json`.

- [ ] **GRAPH-RESOLVE-06B.3-CURRENT-COHORT-REBASE-01:** rebase the symbol-registry review against a plan whose `workspaceRevision` is admitted for the selected current source cohort, then require exact `inputPlanChecksum`, row-count, and workspace-revision parity across planner, resolver, and canary. The current checksum-bound v2 proof is valid but non-promotable because all `461` rows are `STALE_WORKSPACE_REVISION_REVIEW_ONLY`; do not generate or apply a new canary until a current plan exists. Evidence: `docs/reports/tree-bound-symbol-registry-resolution-v2.json`; `promotionAuthorized=false`, `canonicalWrites=0`, `databaseWrites=0`.

**Materializer freshness correction (read-only, 2026-09-20):** `docs/reports/current-materializer-symbol-resolution-adapter-v1.json` is a historical 440-nomination/353-tree-bound receipt with 90 canonical matches. It has no current plan checksum or workspace-revision binding and must not be used for the current 461-row cohort. The bounded audit `scripts/atlas/audit-tree-bound-symbol-materializer-freshness-v1.mjs` reports `HISTORICAL_ADAPTER_SUPERSEDED_FOR_CURRENT_COHORT`, confirms current planner/resolver checksum parity, and records `canonicalAuthority=false`, `canonicalWrites=0`, and `databaseWrites=0`. This is evidence classification only; no checkbox or canonical data was changed.

### P10 convergence cleanup (read-only, 2026-09-18)

The earlier `353`-row registry plan, `sha256:136b3cac...` five-row canary, and `90/85/263` resolution counts are historical and **SUPERSEDED_BY_CURRENT_INPUT_CHECKSUM**. They remain retained as evidence but must not be used for a new canary or apply. The current chain is: current plan → input audit → checksum-bound v2 resolution → only then canary review. The current v2 receipt is read-only and reports `promotionAuthorized=false`, `canonicalWrites=0`, and `databaseWrites=0`.
  - **Diagnostic (2026-09-01, read-only investigation, no canonical writes, not yet resolved)**: `graphify/frozen-graph-snapshot-v2.json` (the artifact behind the existing "PROVEN" `docs/reports/graph-snapshot-parity/receipt.json`, 162,234 nodes/108,156 edges, PASS 2026-08-12) **cannot satisfy this task as-is**. Verified live: (1) 108,156 of 162,234 nodes are keyed `tree:<uuid>` — confirmed via `packages/parent-atlas/src/core/graph-node-key-v1.ts`'s own doc comment and `exact-promotion.ts`'s error text that `tree_node_id` is **deliberately excluded** from `GraphNodeKeyV1` ("structural evidence only," never identity) — only the 54,078 `packet:`-keyed nodes validate against `graphNodeKeyV1Schema`. (2) Checked edge composition directly: **zero** of the 108,156 edges connect two packet-kind nodes — every edge is a `packet→tree` provenance link (`DERIVED_FROM`). Restricting to the canonical-identity-only (packet) subgraph leaves zero edges, nothing to bind. The existing receipt remains a valid *backend-algorithm* parity proof (NetworkX and cuGraph agree with each other on this graph's structure) but does not exercise `GraphOrdinalMapV1`'s canonical-identity binding, because this snapshot has no packet↔packet relationship structure to bind. Attempted script (kept, not deleted): `sveltekit-frontend/scripts/atlas/bind-graph-ordinal-map-to-snapshot-parity-v1.mts` + exported `docs/reports/graph-snapshot-parity/graph-node-keys.json`/`graph-edges-by-key.json` (fails at the packet-vs-tree key validation step by design, left as the reusable binding harness for whichever real snapshot ends up used).
  - **Candidate found, not investigated further (context-budget-limited)**: `docs/reports/graph-artifacts/structural-graph-snapshot-graph_rel-fi-uses-concept-git-0084288f26.arrow` (2026-08-31, 126,810 rows) has real `INCIDENT_TO`/`USES_CONCEPT` hyperedges (`srcGpuNodeId`, `dstGpuNodeId`, `edgeType`, `participantRole`, `participantOrdinal`, `relationId`, `weight`) — but it's a **hypergraph incidence structure** (part/whole roles per `relationId`, not a plain directed graph) keyed by integer `gpuNodeId` needing a companion node-key mapping file not yet located. Whether/how to project a hypergraph incidence structure into a simple graph for `GraphOrdinalMapV1`/PageRank/BFS parity is a real design decision, not investigated here.
  - **Resolved diagnosis (2026-09-01, follow-up search)**: do NOT bind the Aug-12 receipt to
    `GraphOrdinalMapV1` and call the gate closed — the failed binding correctly caught a real
    identity-model mismatch (packet↔tree provenance projection promoted toward canonical graph
    identity, exactly the failure mode this task exists to prevent). Searched for an existing real
    `CanonicalRelationshipSnapshotV1`-shaped artifact (`rg` across `packages/`, `sveltekit-frontend/src`,
    `scripts/`, `graphify/`, `docs/`, `openspec/` for `CanonicalRelationshipSnapshotV1`,
    `StructuralGraphSnapshotV1`, `GraphOrdinalMapV1`, `GraphNodeKeyV1`, hyperedge/incidence-projection
    terms, and `FI-13C`/`FI-14`): **none exists**. `CanonicalRelationshipSnapshotV1` has zero matches
    anywhere. Found the closer artifact instead — `packages/parent-atlas/src/core/graph-projection-parity.ts`
    defines a real `GraphProjectionParityReceiptV1` Zod schema (canonical/projected relationship
    checksums, PPR delta+tolerance, NetworkX-vs-{neo4j,cugraph} `passed` gate) — i.e. the *receipt
    shape* GRAPH-06D would want is already designed. But its two projector interfaces are explicit,
    unimplemented stubs: `Neo4jIncidenceProjectorV1` (`TODO(FI-13C2/FI-14)`) and
    `CugraphIncidenceProjectorV1` (`TODO(FI-14/FI-16I)`). **The real upstream blocker is
    FI-13C2/FI-14/FI-16I (canonical-relationship-to-incidence-graph materialization) — GRAPH-06D
    cannot proceed until that lands.** Per this task's own governing principle: do not manufacture a
    snapshot merely to force this gate closed. Also formalize (not yet applied anywhere) the
    identity/projection/executor three-layer distinction this investigation surfaced: **Atlas
    identity** (`GraphNodeKeyV1`: symbol/packet/chunk/occurrence) is separate from **structural
    evidence identity** (`tree:` / `TreeNodeId`) is separate from **projection identity**
    (`ProvenanceProjectionV1` packet↔tree, valid for cuGraph/NetworkX execution today, vs. the
    still-unbuilt `CanonicalRelationshipSnapshotV1`/`CanonicalRelationshipProjectionV1` — the actual
    GRAPH-06D target) is separate from **executor identity** (cuGraph's internal dense `[0,V)`
    vertex ids via `NumberMap`, `renumber=True`, unrenumber before comparing — never compare by
    result row position). The Aug-12 receipt remains valid evidence for what it actually proves
    (provenance-graph NetworkX↔cuGraph parity, PageRank/Louvain agreement=1) — it is not invalidated,
    just correctly scoped as answering a different question (provenance connectivity centrality, not
    canonical-relationship centrality). Do not run further PPR/cache experiments against it and
    interpret the results as canonical-relationship centrality.
- [x] ALIGN-01A Characterize the SymbolFeatureAlignment prerequisite read-only: the available 15-row CandidateFeatureMatrix manifest is bound to the older `b19...` workspace revision, while the current source/binding cohort is `55ed...`; the active observation-feature contract is the ORF `(packet_key, feature_revision)` schema, while an incompatible candidate-id/vector migration remains non-active. No complete current CandidateOrdinal ↔ symbol version ↔ observation feature-row materializer exists, so alignment and GPU promotion remain blocked without synthetic joins.
- [x] ALIGN-01B Re-run current-revision CandidateOrdinal materialization read-only after the 111-source index apply: it fails closed with `CANARY_EXACT_LINEAGE_COHORT_EMPTY`. The current chunk index still exposes per-chunk hashes/IDs while workspace bindings and Graphify expose whole-source digests; packet chunk IDs remain a separate legacy coordinate. No remapping, synthetic identity, or canonical/projection writes occurred.
- [x] ALIGN-01C Audit byte-scope identity read-only: 4,527 Qdrant points have unique `tree_node_id` values and join packet rows, but packet byte spans are absent, AST-node joins are absent, and exact packet-span-to-AST identity is `0`; 1,140 path-only matches remain non-promotional. CandidateOrdinal admission therefore still requires a reviewed packet/chunk span producer. See `docs/reports/atlas-byte-scope-reconciliation-v1.json` and `docs/reports/atlas-ast-qdrant-tree-bridge-v1.json`.
- [x] ALIGN-01D Audit packet content-hash authority read-only: `codebase_chunk_index.content_hash` is the per-chunk FTS join target; `atlas_packets.content_hash` has no live writer, while packet `sha256` and artifact hashes use different grains. Only 341 packets map to one distinct chunk hash, 332 are already populated, and 9 remain safely eligible for the existing bounded hash backfill. 4,207 packet sources remain ambiguous and 57,112 have no chunk hash; no backfill or identity promotion was performed. See `scripts/atlas/audit-atlas-packets-content-hash-source.mjs` and `docs/reports/atlas-packets-content-hash-source-v1.json`.

## Cross-provider alignment backlog (2026-08-29)

### Architecture is broader than the current correctness queue

The full Parent Atlas architecture remains:

```text
source / Graphify / LSP / external evidence
  → bounded parse and schema validation
  → PostgreSQL canonical identity, revisions, eligibility, FTS, semantic_768
  → Qdrant / Neo4j / GPU / Arrow-mmap rebuildable projections
  → SearchRuntime lane normalization and one fusion owner
  → CandidateFeatureMatrix and bounded GPU enrichment
  → ACE cards → ContextManifest → Ornith
  → verified claim → admitted DAG → bounded execution/readback
```

The current gate ladder is intentionally narrower and must not be read as deleting
the data plane. `simdjson`/`simd-json`, MessagePack, Arrow IPC/mmap, BitFrost/Valkey,
cuVS/cuGraph/PyTorch, HyperGraphRAG, legal adapters, QLoRA, and domain-directed
memory residency remain architecture or later optimization/promotion layers. They
must consume revisioned artifacts and receipts; they do not become alternate
canonical stores, identity owners, or fusion owners.

### Phase 8 envelope reconciliation (2026-08-29)

The shared `scripts/atlas/lib/envelope-builder.mjs` is present and is used by the
current summary, lexical, LangExtract, Qdrant, Graphify, HyperRAG, topology-export,
and contract-validation writers. This proves a reusable canonical envelope builder,
not that every historical Phase 8 writer or storage projection has been replayed.

The pasted Phase 8 report names three additional cache/materialization writers, but
those exact script names are not present in the current checkout. Treat their
retrofit status as unverified until an equivalent current producer is identified
and run read-only. The envelope remains a control-plane packet: it may carry
`packet_key`, `source_ref`, `feature_id`, concepts, routing hints, and optional
projection pointers, but it does not establish `CandidateOrdinal`, `graphRevision`,
stable symbol identity, or canonical embedding ownership.

Required integration proof remains:

```text
PostgreSQL canonical packet/revision state
  → canonical envelope builder + schema validation
  → projection-specific receipt/checksum
  → independent readback
  → CandidateOrdinal / source / revision reconciliation
```

`graphRevision: null` remains valid for graph-independent envelopes. Missing
`qdrant_point_id`, community, SOM, PageRank, or ontology fields must remain absent
or explicitly nullable; they must not be filled with synthetic values. Phase 8
envelope shape parity is therefore `PARTIALLY_PROVEN`, while cross-storage
readback, revision-keyed cache replay, and full writer coverage remain open under
`ALIGN-CONTEXT-01` and the lineage gates below.

### Alignment sequence and measured completion (2026-08-29)

These percentages are task-state percentages for this OpenSpec change, not a
production-readiness claim. `DONE` means the corresponding proof is wired and
evidenced; architecture coverage alone does not count.

| Phase | Sequence | Current state | Completion basis |
|---|---|---|---:|
| A | canonical source/run ownership and exact lineage | active blocker: completed Graphify owner and namespace reconciliation remain open | 0% of remaining owner gates |
| B | symbol/feature/filter alignment | `ALIGN-01A..D` audits complete; current materializer and shared eligibility proof remain open | 4/6 = 66.7% |
| C | graph projection and executor parity | fixture ABI exists; current frozen graph snapshot and live NetworkX↔cuGraph proof remain open | 0/2 live gates |
| D | neural/runtime receipts | Ornith model is live; adapter, QLoRA, and neural execution receipts remain planned | 0/3 promotion gates |
| E | ontology, HyperGraphRAG, ACE, and memory residency | contracts are documented; evidence-qualified promotion and revision-keyed replay remain open | 0/4 promotion gates |
| F | optimization challengers | benchmark-only until baselines and replay receipts exist | 0% |

Recommended order:

```text
A canonical owner/lineage
  → B symbol + feature + eligibility alignment
  → C current graph snapshot + CPU/GPU parity
  → D neural execution receipts
  → E ontology/HyperGraphRAG + ACE residency replay
  → F optimization challengers
```

Current counts from this file: `110/174 = 63.2%` complete overall. The
cross-provider backlog contains `1/18 = 5.6%` completed tasks; it is a focused
alignment backlog and must not be used as the completion percentage for the
entire Parent Atlas system.

### Latest proof-log gate state (2026-08-29)

| Lane | Result | Gate state | Evidence |
|---|---|---|---|
| 8095 structural CST/AST | live provider, syntax/XRef observations | `PROVEN_BOUNDED` | `docs/reports/structural-intelligence-integration-proof.json` |
| TypeScript LSP | read-only definitions/references/symbol observations | `PROVEN_READ_ONLY` | `docs/reports/typescript-lsp-readonly-proof-v1.json` |
| LangExtract grounding | bounded grounded extraction | `PROVEN_BOUNDED` | `docs/reports/langextract-grounding-v1.json` |
| current source lineage | 111/111 current workspace rows, 0 missing/mismatch/ambiguous | `LINEAGE_PROVEN` | `docs/reports/current-source-cohort-lineage-v1.json` |
| feature/GPU/ACE/Ornith | tile readback, ordinal roundtrip, feature replay, ContextManifest, synthesis, claim and read-only DAG validation | `READ_ONLY_CHAIN_PROVEN` | `docs/reports/parent-atlas-gpu-ace-ornith-readiness-v1.json` |
| Graphify owner | canonical run still `RUNNING`; no completed owner | `BLOCKED` | `docs/reports/current-graphify-run-owner-v1.json` |
| graph snapshot | 103 code sources processed + 8 explicitly unsupported non-code sources; 10,506 unresolved observations; no graph revision | `BLOCKED` | `docs/reports/graphify-run-completion-plan-v1.json` |
| graph resolution | structural plan is deterministic, but unresolved targets remain non-admissible | `SHADOW_ONLY` | `docs/reports/current-structural-edge-resolution-v1.json` |
| semantic scale | 15-row proof remains valid; 128/768 expansion not admitted | `BLOCKED_ON_LINEAGE_GRAPH_OWNER` | latest alignment sequence receipt |
| SIMD/native bridge | audit reports 13 high and 58 medium findings, including timeout/fallback/concurrency gaps | `HARDENING_OPEN` | `docs/reports/simd-bridge-memory-audit.json` |

This log closes the read-only reasoning spine but does not close canonical
lineage, graph ownership, full-corpus scaling, or mutation execution. The next
gate is `GRAPHIFY-RUN-OWNER-01`; do not mark graph revision, CandidateOrdinal
128/768, HyperGraphRAG promotion, QLoRA merge, or repair execution complete from
these proofs.

`graphRevision: null` is an intentional valid value for non-authoritative shadow
plans, graph-absent feature rows, and read-only alignment receipts. It must not
be replaced with a synthetic revision. The graph-owner blocker is isolated: the
remaining JSON/provider, context, model-boundary, ACE, and execution-admission
tasks may proceed in parallel as long as they do not promote graph evidence or
claim full-corpus graph qualification.

**Re-confirmed still valid, not stale — 2026-09-15 (from a sibling session working
`parent-atlas-retrieval-lineage-dag-convergence`'s `CURRENT-STRUCTURAL-LINEAGE-01` gate)**: that
session made real progress on the packet↔chunk structural lineage bridge (an informational
`file_content_hash` join rose `0%→33.6%`) and, before assuming this unblocked 128-scaling here,
explicitly re-checked this file's `BLOCKED_ON_LINEAGE_GRAPH_OWNER` status against a live read of
`docs/reports/current-graphify-run-owner-v1.json`: for the currently-expected workspace revision,
`runCount: 0`, `completedOwnerCount: 0` — this blocker is still genuinely, currently true, not
inherited stale data. **The two blockers are independent** — closing `CURRENT-STRUCTURAL-LINEAGE-01`
alone will not unblock 128/768 scaling here; the Graphify execution-owner ambiguity (this section's
own `GRAPHIFY-RUN-OWNER-01` next-gate) is a separate, still-open prerequisite. Full trail in
`parent-atlas-retrieval-lineage-dag-convergence/tasks.md`'s "Stage-3 (CandidateOrdinalMapV1
128-scale) gate re-investigation" entry (same date).

Parallel work order while the owner remains unresolved:

```text
P0-A  preserve null graphRevision and fail-closed graph admission
P0-B  JsonDecodeProvider / simdjson typed parity
P0-C  BitFrost + ACE revision/checksum key audit
P0-D  Ornith model/adapter receipt boundaries
P0-E  grounded DAG admission and read-only execution receipt
P1    completed Graphify owner → graph snapshot → graph parity
P2    CandidateOrdinal 128 → 768 and full-feature promotion
```

- [ ] ALIGN-EVIDENCE-01 Split `collect-runtime-evidence.mjs` into an explicitly read-only evidence mode and a separately authorized apply mode. Dry-run is now the default, rejects mixed mode flags, skips all write-capable subprocesses and Postgres/Valkey connections, and was validated over 8,170 cards. Apply now performs a read-only `atlas_packets` identity preflight before any subprocess or local artifact write, and fails closed because `packet_id` is NOT NULL with no default. The apply path remains unsafe until packet identity derivation and a side-effect manifest are repaired. Do not treat apply mode as a read-only audit.
- [ ] PACKET-ID-OWNER-01 Resolve the canonical `atlas_packets.packet_id` owner before enabling the collector apply path. The live table contains 61,660 non-null IDs, 61 IDs with UUID-shaped length, 0 64-character SHA-256 IDs, and all 61,660 rows have `packet_key`; existing producers disagree between UUID, packet-key, and truncated/full hash conventions. The live constraint census shows `packet_id` is the table primary key, while the majority of downstream foreign keys intentionally target unique `packet_key`; only packet identity-conflict/materialization-queue tables reference `packet_id`. A value census found `packet_id = packet_key` for 58,305 rows and different values for 3,355 rows, so equality cannot be assumed. By source kind, all 58,304 rows with NULL `source_kind` and the single `cluster-summary` row have equality, while all 3,294 `codebase_chunk` rows diverge with `packet_*` IDs and all 61 `rpc_method` rows diverge with UUID-shaped IDs. Source inspection points to legacy orphan-chunk registration and RPC packet producers. The current packet materializer explicitly rejects `packet_id != packet_key`, making equality a candidate active rule for new materialization but not proof that legacy rows can be rewritten. This characterizes legacy producers but does not establish a single owner. Do not derive a new ID in the collector or equate `packet_id` with `packet_key` until the registry contract and downstream expectations are reconciled.
- [ ] PACKET-MATERIALIZER-INPUT-01 Reconcile the collector’s packet-key input contract before apply: `collect-runtime-evidence.mjs` now uses the shared `buildPacketKey(sourceRef, featureId)` helper when cards lack `packet_key`, producing the established `nes:<slug>:<sha8(source_ref)>` shape. The 8,170-card corpus contains 0 explicit `packet_key` values; a read-only full-corpus audit produced 8,170 non-empty unique keys with 0 live PostgreSQL collisions. These remain planned derived keys until apply identity ownership is approved. Do not silently rewrite existing evidence-card keys during ingestion.
- [ ] PACKET-LINEAGE-EXCEPTIONS-01 Classify the two packet completeness anomalies before any apply path: one `codebase_chunk` row has an empty `source_ref`, and one `cluster-summary` row has no `workspace_id`. The packet contract validator now treats blank identity strings as missing and the live validation remains threshold-pass, but neither anomaly is repaired. `register-orphaned-chunks.mjs` was the admitting producer for the empty-source class; its orphan query and preparation path now reject blank `relative_path` values, and its default dry-run now prepares 58 valid registrations without that row. Keep both anomalies excluded from current Graphify/source-binding qualification until their owning producer and repair authority are proven; do not fill either field from packet keys or defaults.
- [ ] PACKET-ORPHAN-CANARY-01 Prove the 58 orphan registration candidates before any apply: 58 non-empty source refs, 58 unique generated packet keys, and 0 packet-key collisions with `atlas_packets`. The apply path remains blocked because it still generates time/index-based `packet_*` primary IDs; do not authorize a canary until the packet-ID owner is resolved.
- [ ] ALIGN-XJSON-01 Define `JsonDecodeProviderV1` and compare Node JSON, C++ simdjson, and Rust simd-json on a bounded fixture. Direct invocation of `packages/parent-atlas-retrieval/src/gpu/simdjson-bridge.spec.ts` now passes `2/2`; native-addon/runtime evidence exists, but typed Node/C++/Rust checksum parity remains open. The package-wide TypeScript check is not a standalone gate because this package imports SvelteKit `$lib` aliases/app-local modules and reports unrelated configuration errors. Keep key-selector experiments out of the first gate.
- [ ] ALIGN-SYMBOL-01 Implement the missing current-cohort `SymbolFeatureAlignmentV1` materializer. It must bind `CandidateOrdinal`, packet/chunk identity, optional symbol/observation rows, feature revisions, and evidence references without fuzzy joins, fabricated IDs, or synthetic graph revisions. Existing schema/fixture contracts do not prove this materializer exists.
- [ ] ALIGN-FILTER-01 Define one revision-bound `EligibilitySetV1` and prove equivalent admissible CandidateOrdinals across PostgreSQL planner filters, Qdrant payload filters, and cuVS bitset filtering. PostgreSQL AIO/bitmap scans remain planner behavior and must not become a second authority.
- [ ] ALIGN-GRAPH-01 Bind one frozen `GraphProjectionArtifactV1` to `GraphOrdinalMapV1`, preserving all vertices `[0,V)` including isolated vertices, then compare direct NetworkX CPU output with direct cuGraph output from that same artifact. Do not use automatic nx-cugraph dispatch as the parity oracle.
- [ ] ALIGN-NEURAL-01 Add revision-bound `NeuralExecutionReceiptV1` for PyTorch/LibTorch/TensorRT challengers. Record model/head/executor revisions, input artifact checksum, ordinal map checksum, output checksum, and numeric parity against the CPU reference before any ranking promotion.
- [ ] ALIGN-ONTOLOGY-01 Require evidence-qualified `OntologyLinkedTupleV1` promotion before relationship or hypergraph revisions can feed retrieval or fanout. Domain classification, ontology proposals, and topology annotations remain non-authoritative until independently reviewed and revision-bound.
- [ ] ALIGN-CONTEXT-01 Make BitFrost/Valkey and ACE/ContextManifest keys revision-addressed by candidate snapshot, representation, graph, feature, and artifact checksums. Cache hits may accelerate replay but cannot bypass canonical identity or evidence closure.
- [ ] ALIGN-OPT-01 Keep TensorRT-RTX, cuTile, TurboVec, and learned routing as benchmarked challengers only. Do not add them to the correctness gate until the corresponding baseline, held-out evaluation, and replay receipt exist.
- [ ] ALIGN-SIMD-01 Resolve the native bridge audit findings before promotion: 104 findings across 12 files, including 13 high, 58 medium, missing timeout bounds, fallback coverage, and possible concurrent GPU-job hazards. The audit is complete, the native addon load proof passes with `simdJsonParse`, `simdJsonValidate`, and `simdJsonExtractNumbers` exported, and the runtime checker now confirms the TypeScript bridge loads through the repository `tsx` loader with the native backend active; remediation, typed parity, and replay are still open. See `docs/reports/simd-bridge-memory-audit.json`.
- [x] WEB-ALIGN-01 Route the primary `/api/websearch`, agent web-search tool, and MCP research tools through the shared SearXNG/DuckDuckGo adapter, including empty-result fallback behavior and provider metadata.
- [ ] WEB-ALIGN-02 Audit remaining specialized direct SearXNG callers (`ldr/web-search-client`, `gemma4-tool-loop`, and `gemma4-agent`) and either adapt them to the shared provider contract or document their intentionally separate engine policy. Do not silently maintain competing fallback chains.

## Ornith, legal adaptation, and agentic memory backlog (2026-08-29)

### Workflow executor ownership (2026-08-29)

- [x] WF-EXEC-00 Audit the orchestration dependency and caller surface: native LangGraph `StateGraph` imports are present in the SvelteKit dispatcher/DAG and the LangGraph packages are installed; the root compatibility probe currently fails because it resolves `@langchain/core@1.1.45` while the active SvelteKit graph requires `@langchain/core >=1.1.48` (`@langchain/core/utils/uuid` does not export `v6`). Mastra has no direct dependency or native import in the SvelteKit runtime; the Mastra-named Graphify script is a legacy shell using direct workflow-log SQL and must not be treated as a Mastra runtime or canonical Graphify owner.
- [x] WF-EXEC-01 Repair and re-run the LangGraph dependency compatibility gate in the owning package: the validator now resolves imports from `sveltekit-frontend/node_modules` instead of accidentally testing the root dependency tree; frontend `@langchain/langgraph@1.4.7` with `@langchain/core@1.2.4` passes the declared peer-range and native import gates. Adapter replay, checkpoint, and failure semantics remain separate tasks.
- [x] WF-EXEC-02 Freeze workflow execution coordinates in `packages/parent-atlas/src/core/workflow-execution-coordinates-v1.ts`: framework, orchestration runtime, checkpoint provider, action executor, transport, workflow-spec checksum, and deterministic coordinate checksum are separate fields; `WorkflowActionEventV1` remains the identity owner and checkpoints remain non-canonical. TypeScript compilation and two focused tests pass.
- [x] WF-EXEC-03 Prove a bounded local-vs-native LangGraph StateGraph read-only replay: the same two action IDs and order produce identical output/checksum, with no mutation executor or external-store writes. See `scripts/atlas/prove-langgraph-readonly-adapter-replay-v1.mjs` and `docs/reports/langgraph-readonly-adapter-replay-v1.json`. Full production workflow/event binding remains separate.
- [x] WF-EXEC-04 Prove memory-checkpoint failure, retry, cooperative cancellation, and read-only replay semantics for the selected LangGraph adapter; the bounded fixture passes with no mutation or canonical-store writes. Durable Postgres checkpoint behavior remains a separate production gate. See `scripts/atlas/prove-langgraph-failure-retry-replay-v1.mjs` and `docs/reports/langgraph-failure-retry-replay-v1.json`.
- [x] WF-EXEC-05 Decide against Mastra installation in this tranche: LangGraph now has bounded adapter, failure, retry, cancellation, and replay evidence, while Mastra has no direct dependency or native runtime import. Mastra remains `PLANNED/UNPROVEN` and may only be evaluated later as a separately authorized challenger adapter.

- [ ] MODEL-ORNITH-01 Treat the live `/v1/models` response and environment-backed resolver as the synthesis model authority. Record the resolved model ID, loaded endpoint, model checksum/path when available, and context configuration in execution receipts; hard-coded Gemma4 aliases are compatibility labels only.
- [ ] MODEL-ADAPTER-01 Define `LegalAdapterArtifactV1` for a legal/domain adapter proposal. Bind base model ID, adapter type, training/evaluation corpus revisions, tokenizer/prompt revisions, adapter checksum, license/provenance evidence, and rollback target. No live merge or model-owner change until held-out evaluation and replay pass.
- [ ] MODEL-QLORA-01 Add a QLoRA adapter merge/evaluation receipt path. Keep the canonical base model and adapter separately addressable; produce a new merged model revision only after checksum, regression, safety, latency, and grounded-evidence evaluation. Do not write adapter weights to BitFrost/Valkey as canonical state.
- [ ] MEMORY-SWAP-01 Define `DomainContextResidencyPlanV1` for domain-classified context budgets and memory/artifact swaps. Keys must include model/adapter, candidate snapshot, representation, graph/feature revisions, and artifact checksums; swaps may select bounded ACE cards or descriptors but may not persist hidden thoughts, KV cache, tensors, or unvalidated evidence.
- [ ] HGR-AGENT-01 Bind HyperGraphRAG expansion to reviewed `OntologyLinkedTupleV1`/`HyperRelationV1` evidence and a revision-qualified graph projection. Domain classification and ontology proposals remain non-authoritative until evidence closure and promotion receipt.
- [ ] DAG-ERROR-01 Prove the agentic error-fixing boundary as `GroundedClaimValidationReceiptV1 → KernelDagCandidateV1 → KernelDagValidatorV1 → TypedRepairDagV1 → bounded executor → ExecutionReceiptV1`. Require authorization, lineage, tool allowlist, budget, readback, and explicit mutation policy; verified claims alone must never authorize writes.
- [ ] CONTROL-EXECUTOR-ADAPTER-11 Compile one validated `QueryExecutionPlanV1` node into `ExecutorRequestV1`, dispatch only through its declared local/FastAPI/gRPC transport, and convert a checksummed execution response into the existing validation barrier. The initial TypeScript adapter and strict evidence gate are implemented in `sveltekit-frontend/src/lib/server/atlas/agentic/query-executor-adapter-v1.ts` and `agentic-file-compiler/validation-barrier.ts`; focused Vitest suites pass (12/12). This is non-persistent scaffolding only: live 8098/gRPC endpoint binding, authorization-admitted plan production, LearningOutcome linkage, and runtime readback remain unproven. Do not mark complete from fixture tests alone.
- [ ] ORNITH-ACE-01 Keep Ornith downstream of ACE/ContextManifest. Domain classification may select retrieval lanes, context token budgets, and approved residency plans, but only the canonicalized ContextManifest may enter synthesis or tool planning.

## Current status reconciliation (2026-08-29)

The current evidence closes several bounded lanes, but not the full Parent Atlas promotion path.
These statuses are additive and do not rewrite historical task entries.

- [x] **UTF8-BYTE-SPAN-01 / CSGR-3 producer handoff** — canonical UTF-8 byte-coordinate
  conversion is covered by the focused structural/span suite (`8 passed`), and the rebuilt
  `:8095` sidecar plus current edge planner now report `8,795` occurrence-positioned unresolved
  edges and `1,711` legacy-only edges. No structural edge writes occurred.

  **2026-08-29 hardening:** UTF-16 LSP offsets that split an astral surrogate pair now fail
  closed with `LSP_POSITION_SPLITS_CODE_POINT`; package build, seven focused LSP/Tree-sitter
  tests, the byte-offset replay (4/4), and diff validation pass. This strengthens the byte
  boundary but does not establish compiler target identity or admit graph edges.
- [x] **QDRANT-PROJ-03 bounded semantic parity** — the frozen 15-candidate PostgreSQL
  `semantic_768` to Qdrant `content` projection repair and independent parity readback are
  complete. Qdrant remains a rebuildable projection; duplicate same-collection points remain
  review-only and are not deleted.
- [x] **GPU-33 fixture ABI** — the `CandidateOrdinal`/`GraphOrdinal` executor boundary is
  fixture-proven with dense local graph ordinals, zero unknown ordinals, and zero revision
  mismatches. This is not live cuVS semantic parity or production ranking promotion.
- [ ] **GRAPH-RESOLVE-06B / current symbol-feature alignment** — remains open at the
  authoritative symbol/version stage. The offline frozen-snapshot proof now covers all `440`
  nominations: `353` exact tree bindings, `87` source-only rows, `0` ambiguous matches, and
  `0` revision mismatches. The next stage must resolve only the `353` tree-bound rows to the
  existing authoritative symbol registry/version tables; no synthetic IDs, fuzzy aliases, or
  structural-edge writes are allowed.
- [ ] **GRAPHIFY-RUN-OWNER-01 and GRAPH-REV-ADMIT-01** — remain blocked. A completed,
  source-manifest-bound Graphify run and independent graph snapshot receipt are still required
  before new graph revisions, graph-aware promotion, or graph-qualified 128/768 expansion.
  Latest read-only audit confirms `runCount: 1`, `workspaceRowCount: 1`,
  `completedOwnerCount: 0`, `currentStatus: RUNNING`, and `currentCompletedAt: null` for the
  expected workspace revision. See `docs/reports/current-graphify-run-owner-v1.json`.
- [ ] **15 → 128 → 768 scaling** — remains blocked for the full lineage/feature path. The
  15-row semantic canary is valid; expansion must preserve exact source/chunk/revision bindings
  and must not invent graph or feature revisions. Live 8098/cuVS semantic parity also remains
  open even though the CandidateOrdinal round-trip fixture is proven. Latest read-only census:
  `61,660` packets, `778` exact Graphify sources, `43` exact packet/chunk joins, `524`
  ambiguous packet/chunk joins, `15` source/chunk-qualified candidates, and `0` fully qualified
  candidates; `graph_revision_present: 0`.
- [x] **latent_128 interpretation** — treated as a derived representation/routing artifact,
  not a separate canonical lane or an independent blocker. It must remain revisioned and
  evaluation-gated if activated; no corpus-wide latent rebuild is implied by this ledger.

### Active gate order

`GRAPHIFY-RUN-OWNER-01` → `GRAPH-RESOLVE-06B` identity enrichment →
`GRAPHIFY-COMPLETE-01` → `GRAPH-REV-ADMIT-01` → current graph snapshot/CPU-GPU parity →
`CandidateOrdinal` 128/768 qualification → live cuVS/cuGraph semantic/feature parity →
ranking and mutation promotion. ACE, ContextManifest, Ornith, QLoRA, RL, Triton/cuTile, and
cache-residency work remain downstream or challenger work and must consume revisioned artifacts
and receipts.

No PostgreSQL, Qdrant, Neo4j, Valkey, symbol-registry, or structural-edge writes were performed
by this reconciliation.

### Daily Graphify readiness and 384→768 reconciliation (2026-08-30)

- [x] **SEMANTIC-DIMENSION-LIVE-AUDIT** — live schema confirms the canonical
  `codebase_chunk_index.content_embedding` lane is `halfvec(768)` with `55,169`
  populated rows out of `55,853`. The migration is operationally live for the
  canonical path. A historical census recorded `3,451` rows tagged `768` and
  `52,402` tagged `384`; the current read-only receipt observes `37` legacy
  `384` tags and zero populated canonical-vector metadata mismatches. The
  `embedding_dimension` metadata remains non-authoritative for vector shape.
  Representation policy is frozen in `packages/semantic-contracts/src/vector-manifest.ts`:
  EmbeddingGemma `semantic_768` is canonical; `semantic_mrl_512`,
  `semantic_mrl_256`, and `semantic_mrl_128` are derived MRL prefix views; and
  `latent_256` → `latent_128` → `latent_64` is a separate nested-autoencoder
  family. No new `384` writer is permitted.
- [x] **SEMANTIC-METADATA-RECONCILIATION** — prepared an exact, independently
  read-back-verified metadata correction plan. Do not update or drop the legacy
  `content_embedding_384` column until the owner, rollback, and migration receipt
  are explicitly authorized. The prepared sidecar changes only the
  `embedding_dimension` default to `768` and adds a `NOT VALID` future-write
  guard for canonical `content_embedding halfvec(768)` (including a non-null
  `embedding_dimension` requirement); it performs no row or
  vector rewrite. Read-only receipt: `docs/reports/semantic-metadata-reconciliation-v1.json`.
- [ ] **QDRANT-768-PROJECTION-OWNER** — two 768-dimensional collections remain
  present, but the live census now distinguishes their roles: `codebase_chunks_768`
  is the active retrieval projection (`109,776` points with rich payloads), while
  `codebase_chunks_768_v2` is a smaller lineage/provenance projection (`52,380`
  points) and is not equivalent. Freeze that distinction and require parity before
  any v2 cutover. The 384 collections are legacy review targets; the 512 collection
  remains a valid derived MRL lane and is not migration debris.
- [ ] **QDRANT-768-PROVENANCE-03** — the bounded live census found `MIXED_HISTORY`
  for `codebase_chunks_768` and `PARTIAL` provenance for `codebase_chunks_768_v2`,
  with zero exact packet links in the 50-point sample from either collection.
  Collection size/vector shape is therefore not sufficient for promotion; exact
  PostgreSQL identity/revision reconciliation and numerical corroboration remain
  required.
- [ ] **QDRANT-768-IDENTITY-RECONCILIATION** — corrected the identity audit to
  load the canonical `content_embedding` population (`55,169` rows); the prior
  `1,386`-row result was invalid because it filtered the alternate
  `content_embedding_768` column. The corrected full read-only audit found
  `107,796` matched points, `1,299` ambiguous points, `681` unmatched points,
  and `5,634` duplicate PostgreSQL mappings. Qdrant is therefore not safe for
  promotion yet; repair must be based on exact identity/revision evidence, not
  broad payload copying. **2026-09-06 auditor correction:**
  `scripts/atlas/audit-turbovec-ordinal-bridge-v1.mjs` now accepts the
  canonical ordinal-map wrapper, requires explicit `candidateOrdinal`, treats
  repeated `sourceRef` values as source-level ambiguity rather than a fatal
  map error, and reports exact chunk-identity matches separately from
  packet/source overlap. A read-only run against
  `docs/reports/candidate-ordinal-corpus-v1.json` and the live
  `codebase_chunks_768` collection sampled 1,000 points: 408 source-level
  overlaps, 1 packet-level overlap, **0 exact chunk-identity matches**, and
  `status=BLOCKED_NO_EXACT_CHUNK_IDENTITY`. The live sidecar remains empty
  (`indexed=0`); this does not authorize loading it. The remaining bridge must
  bind a real chunk identity plus source/workspace revisions to each Qdrant
  point and CandidateOrdinal; do not derive ordinals from `sourceRef`, packet
  key, Qdrant point order, or array position.
- [x] **GRAPHIFY-READ-ONLY-DRY-RUN-READY** — the required daily Graphify script
  inventory is complete and the native structural path defaults to non-authoritative
  dry-run behavior. The ordinary `graphify:daily` family still contains
  apply-capable stages, so it is not a production-promotion command.
- [ ] **DAILY-GRAPHIFY-GPU-PROMOTION** — not ready. Graphify run ownership,
  `GRAPH-RESOLVE-06B` symbol/version enrichment, authoritative graph revision,
  and live `:8098` RAPIDS parity remain open. NetworkX/cuGraph and AST/CST
  artifacts may proceed only as bounded read-only projections.
- [x] **GRAPHIFY-768-BACKFILL-TARGET** — corrected the Graphify 768 backfill
  script to inspect and write the canonical `content_embedding` column
  (`halfvec(768)`), not the separate `content_embedding_768` compatibility
  column. Automatic Ollama fallback remains a separate embedding-runtime
  cutover decision and is not silently changed by this fix.
- [ ] **QDRANT-LEGACY-384-SCHEMA-REVIEW** —
  `sveltekit-frontend/src/lib/server/vector/qdrant-multivector-schema.ts`
  still declares an older 384-dimensional named-vector contract. It has no
  verified current caller in the audited path; keep it out of production
  `semantic_768` retrieval until it is either migrated with a parity proof or
  archived under the normal recovery process.
- [ ] **GO-LEGACY-384-BRIDGE-REVIEW** — the unreferenced
  `sveltekit-frontend/src/lib/server/retrieval/go-service-integration.ts`
  still documents a 384-dimensional query/vector envelope. The active Go
  service protobuf path must remain the contract owner; this bridge must be
  migrated to `semantic_768` with identity/revision fields or archived before
  it can be reused.

See `docs/reports/daily-graphify-readiness-audit-v1.json` for the live evidence
and the JSON/JSONL/JSONB/Arrow/RPC ownership split. Historical `.md`/`.txt`
material under `docs/archive/` and `memory/atlas/documents-atlas.latest.md` still
contains superseded 384-dimension claims; it is archival context, not an active
runtime contract, and should be handled through archival reconciliation rather
  than a bulk rewrite.

### GRAPH-RESOLVE-06B.3 read-only registry replay (2026-08-30)

- [x] **GRAPH-RESOLVE-06B.3-REPLAY** — current frozen-resolution input contains
  `353` tree-bound rows. Exact registry replay resolved `85` canonical symbols and
  `85` symbol versions; `268` rows remain registry-missing. Ambiguous matches,
  revision mismatches, fuzzy matches, and database writes were all `0`. Next gate:
  live producer replay; no structural edges are admitted.

### Current Kanban / consistency reconciliation (2026-08-30)

- [x] **KANBAN-POSTGRES-SIDECAR-01** — authorized additive Kanban sidecar applied
  and read back: five `kanban_*` tables and expected indexes are present. No task
  rows were inserted. The existing ownership is now confirmed: `0033_odd_moonstone.sql`
  creates `kanban_tasks` with `feature_id NOT NULL`; `0040_kanban_task_lifecycle.sql`
  owns lifecycle additions, not a second `feature_id` column.
- [x] **KANBAN-BOARD-SOURCE-01** — admin loader selects the newest populated valid
  board source; board tests pass `11/11`. The board remains file-backed.
- [ ] **KANBAN-TASK-SYNC-01** — not proven. The file-backed export contains
  `3,312` feature tasks with `feature_id` plus one valid workflow-only GAN task
  identified by `task_id/story_id/worker_id`; database table existence does not
  prove synchronization or import completeness.
- [ ] **DRIZZLE-LEDGER-RECONCILIATION-01** — blocked: live schema comparison
  reports `159` blockers and `215` warnings, while migration integrity still
  reports `41` journal migrations without matching applied rows. Do not apply the
  full migration chain.
- [ ] **CONSISTENCY-CACHE-01** — Qdrant/PostgreSQL/Neo4j smoke checks pass, but
  no ACE/BitFrost hot record was found. Cache warming/readback remains unproven.

Evidence: `scripts/atlas/audit-parent-atlas-consistency.mjs`,
`sveltekit-frontend/drizzle/manual/kanban_task_lifecycle_baseline.sql`,
`docs/reports/schema/expected-vs-live.diff.json`, and
`sveltekit-frontend/.tmp/consistency-audit-results.json`.

### GRAPH-RESOLVE-06B.3 registry reconciliation plan (2026-08-30)

- [x] **GRAPH-RESOLVE-06B.3-RECONCILIATION-PLAN** — read-only reconciliation
  consumed the frozen `353` tree-bound resolutions and `10,255` active registry
  rows. Exact current-key matches remain `85`; `268` are `UNRESOLVED`; ambiguous
  matches and content/revision conflicts are both `0`. The plan checksum is
  `sha256:8b12c12afd2cf058f09aae2772b4eab66a76dc392789acf1e74db8a20ae6a7c8`.
- [x] **GRAPH-RESOLVE-06B.3-REVIEW-CANARY** — generated a five-row canary from
  the unresolved pool for review only. It contains deterministic proposed IDs,
  but `promotionAuthorized=false`, `symbolVersionWrites=0`, `edgeWrites=0`, and
  database writes are `0`. Canary checksum:
  `sha256:f69415d3ce50f73b637b249787966a2936a761246ccbf4a60b0729a50e9566ee`.
- [ ] **GRAPH-RESOLVE-06B.3-PROMOTION-REVIEW** — blocked pending explicit review
  of the five proposed registry entries and authorization for any non-production
  insert. Proposed IDs are not canonical authority and must not be used for edge
  admission until an authorized apply/readback proof succeeds.

Evidence: `docs/reports/tree-bound-symbol-registry-reconciliation-plan-v1.json`,
`.tmp/atlas/tree-bound-symbol-registry-reconciliation-plan-v1.ndjson`,
`docs/reports/current-tree-bound-symbol-registry-input-v1.json`, and
`docs/reports/current-tree-bound-symbol-registry-canary-v1.json`.

### GRAPH-RESOLVE-06B.3 materializer adapter dry run (2026-08-30)

- [x] **GRAPH-RESOLVE-06B.3-MATERIALIZER-ADAPTER** — the existing symbol-version
  materializer contract was exercised read-only against all `440` nominations.
  It recognized `353` tree-bound rows and `85` exact active canonical registry
  matches. The remaining `355` rows are unresolved at this adapter boundary,
  including the `268` tree-bound registry misses and `87` source-only rows.
  Fuzzy matches and aliases were `0`; canonical and database writes were `0`.
  Adapter checksum:
  `sha256:fb7b0d2ce0b98839f422a20c1a45f8f2dc9c8fc7fc4839294d24aec4f9e4e812`.
- [ ] **GRAPH-RESOLVE-06B.3-MATERIALIZER-APPLY** — not authorized or proven.
  The adapter is ready for review, but proposed stable IDs remain non-canonical
  until an explicit non-production insertion authorization and independent
  readback are completed.

Evidence: `scripts/atlas/adapt-tree-bound-symbol-registry-to-materializer-v1.mjs`,
`docs/reports/current-materializer-symbol-resolution-adapter-v1.json`, and
`.tmp/atlas/current-materializer-symbol-resolution-v1.ndjson`.

### GRAPH-RESOLVE-06B.3 registry input audit (2026-08-30)

- [x] **GRAPH-RESOLVE-06B.3-INPUT-AUDIT** — the `353`-row review input is
  structurally valid: all required source/revision/span/key fields are present,
  spans are valid, kinds are accepted, and canonical/proposed-key uniqueness is
  clean. The audit checksum matches the generated input plan. It remains
  review-only with `promotionAuthorized=false` and `canonicalWrites=0`.
- [ ] **GRAPH-RESOLVE-06B.3-AUTHORIZED-APPLY** — still pending explicit review
  and authorization; no registry or symbol-version insertion is performed by
  this audit.

Evidence: `scripts/atlas/audit-current-tree-bound-symbol-registry-input-v1.mjs`
  and `docs/reports/current-tree-bound-symbol-registry-input-audit-v1.json`.

### GRAPH-RESOLVE-06B.3 apply safety check (2026-08-30)

- [x] **GRAPH-RESOLVE-06B.3-APPLY-DRY-RUN** — the existing five-row apply
  adapter was invoked without `--apply` or authorization. It accepted the exact
  canary checksum, attempted `0` rows, performed `0` readbacks, and recorded
  `databaseWrites=false`, `symbolVersionWrites=0`, and `edgeWrites=0`.
- [ ] **GRAPH-RESOLVE-06B.3-APPLY** — remains gated by both the explicit
  `--apply` flag and `ATLAS_AUTHORIZE_SYMBOL_REGISTRY_CANARY=1`; no authorization
  was supplied in this pass.

Evidence: `scripts/atlas/apply-current-tree-bound-symbol-registry-canary-v1.mjs`
  and `docs/reports/current-tree-bound-symbol-registry-canary-apply-v1.json`.

### GRAPH-RESOLVE-06B.4 symbol-version materializer dry run (2026-08-30)

- [x] **GRAPH-RESOLVE-06B.4-MATERIALIZER-DRY-RUN** — the existing materializer
  was run with the current nomination, adapter, and AST snapshot artifacts. It
  selected `85` revision-qualified canonical declaration candidates from `440`
  nominations and attempted `0` writes. The downstream symbol-version apply is
  therefore structurally ready, but not executed.
- [ ] **GRAPH-RESOLVE-06B.4-APPLY-READBACK** — pending the five-row registry
  approval/apply boundary and an explicitly bounded symbol-version insertion.

Evidence: `scripts/atlas/materialize-ast-symbol-versions.mjs` and
`docs/reports/ast-symbol-version-materialization-v1.json`.

### GRAPH-RESOLVE-06B.4 database safety readback (2026-08-30)

- [x] **GRAPH-RESOLVE-06B.4-NO-WRITE-READBACK** — after the canary and
  materializer dry runs, the live database still reports `10,255` active symbol
  registry rows, `285` symbol-version rows, and `285` callable-search rows. The
  check itself was read-only; no promotion or materialization write occurred.

Evidence: live read-only count query; apply remains separately gated.

### AST-CST-FREEZE-01 bounded coverage replay (2026-08-30)

- [x] **AST-CST-FREEZE-01-OBSERVATION-PROOF** — current Graphify source-bound
  replay completed read-only for `111` source bindings. Tree-sitter produced
  `1,592` AST rows with `1,592` chunks and `8,367` structural edges; `84` source
  rows were extracted and `27` were classified unsupported. Failures were `0`.
  The snapshot checksum remained
  `sha256:1adb82b653cb4efcd1decad1bfa07ebbd5e5e37bf8dd6e1af78b5f220ae38de1`.
- [ ] **AST-CST-FREEZE-01-COMPILER-ENRICHMENT** — compiler/LSP enrichment,
  AST-grep fact coverage, and full stable-symbol/symbol-version join coverage
  remain separate downstream measurements; unsupported languages are excluded,
  not assigned synthetic identities.

Evidence: `scripts/atlas/audit-treesitter-structural-observation-v1.mjs --current`
  and `docs/reports/treesitter-structural-observation-v1.json`.

### GRAPH-RESOLVE-06B.3 authorized canary apply (2026-08-30)

- [x] **GRAPH-RESOLVE-06B.3-AUTHORIZED-CANARY** — the explicitly authorized
  five-row non-production registry insert completed under the transaction-scoped
  lock and passed readback: `5` attempted, `5` inserted, `5` read back, `0`
  mismatches. Symbol-version and edge writes remained `0`.
- [x] **GRAPH-RESOLVE-06B.4-DOWNSTREAM-REFRESH** — after the insert, the adapter
  was refreshed read-only and now resolves `90` canonical declarations from the
  `440` nominations; the symbol-version materializer dry run selected all `90`
  revision-qualified candidates and performed `0` writes.
- [ ] **GRAPH-RESOLVE-06B.4-SYMBOL-VERSION-APPLY** — remains a separate bounded
  operation; no symbol versions or graph edges are admitted by this tranche.

Evidence: `docs/reports/current-tree-bound-symbol-registry-canary-apply-v1.json`,
`docs/reports/current-materializer-symbol-resolution-adapter-v1.json`, and
`docs/reports/ast-symbol-version-materialization-v1.json`.

### SYMBOL-REGISTRY-CANARY write-safety hardening (2026-08-30)

- [x] **SYMBOL-REGISTRY-CANARY-NONPROD-GUARD** — the bounded writer now refuses
  any target except `127.0.0.1:5434/legal_ai_db`.
- [x] **SYMBOL-REGISTRY-CANARY-FULL-READBACK** — readback now compares canonical
  key, qualified name, nomination ID, source lineage, registry revision, and
  active status in addition to the stable ID and basic symbol fields.
- [x] **SYMBOL-REGISTRY-CANARY-REPLAY** — explicit local rerun passed with the
  frozen checksum: `5` already present, `5` read back, `0` mismatches, and no
  symbol-version or edge writes. No additional rows were inserted.

Evidence: `scripts/atlas/apply-current-tree-bound-symbol-registry-canary-v1.mjs`
  and `docs/reports/current-tree-bound-symbol-registry-canary-apply-v1.json`.

### GRAPH-RESOLVE-06B.3-CANARY / symbol-version boundary (2026-08-30)

- [x] **GRAPH-RESOLVE-06B.3-CANARY-SELECTED** — the five authorized registry
  nominations were matched back to the refreshed canonical adapter input. All
  five are canonical and revision-qualified, with no unrelated nominations
  included.
- [x] **GRAPH-RESOLVE-06B.3-SYMBOL-VERSION-DRY-RUN** — the existing materializer
  selected exactly `5` candidates using the frozen canary input and
  `--limit=5`; source and workspace revisions were present for all five. The
  run attempted `0` writes and produced no callable projection changes.
- [ ] **GRAPH-RESOLVE-06B.3-SYMBOL-VERSION-APPLY** — not authorized in this
  tranche. Stable-symbol registry insertion is complete; symbol-version,
  callable-search, and graph-edge writes remain off.

Evidence: `scripts/atlas/materialize-ast-symbol-versions.mjs` and
`docs/reports/ast-symbol-version-materialization-v1.json`.

### LIVE-FEATURE-JOIN-01 bounded matrix replay (2026-08-30)

- [x] **LIVE-FEATURE-JOIN-01-CANARY-REPLAY** — the existing CandidateFeature
  Matrix manifest proof replayed `15` candidates with `25` features. Baseline
  and graph-enabled manifests were identical across repeated runs; `7` graph
  rows were present and `8` were explicitly absent/masked. The result was
  `GRAPH_FEATURE_MATRIX_REPLAY_PROVEN` with ranking promotion and writes both
  disabled.
- [ ] **LIVE-FEATURE-JOIN-01-LIVE-PRODUCER-JOIN** — full live AST/compiler/
  ontology/latent producer integration is not yet proven. This canary validates
  the existing matrix/ordinal/mask contract, not corpus-scale feature coverage.

  - [x] **LIVE-FEATURE-JOIN-01-ADAPTER-BOUNDARY** — `searchWithAceManifest()` now
    returns the exact derived `CandidateFeatureSnapshotV1` used for ACE admission;
    the additive adapter proof passes without canonical/cache writes. This does
    not close the full live producer requirement below.

  The runtime boundary is now wired additively: `searchWithAceManifest()` returns
  the exact `CandidateFeatureSnapshotV1` used to build the ACE admission, so a
  downstream caller does not rematerialize from raw SearchRuntime packets. This
  is a fixture/adapter-boundary proof only; it does not close the live AST,
  compiler, ontology, or latent producer requirement.

Evidence: `scripts/atlas/prove-current-candidate-feature-matrix-manifest-v1.mts`
  and `docs/reports/current-candidate-feature-matrix-manifest-v1.json`.

### LATENT-BIND-01 / feature ABI correction (2026-08-30)

- [x] **LATENT-BIND-01** — `latent_256` is now admitted as the physical
  `LEARNED_AUTOENCODER` representation sourced from `semantic_768`;
  `latent_128` and `latent_64` use `NESTED_PREFIX_L2_RENORMALIZE` sourced from
  `latent_256`. Candidate-level validation rejects duplicate bindings and any
  available derived binding whose source representation is unavailable.
- [x] **FEATURE-ABI-12-CORRECTION** — removed the temporary
  `latentLocalityScore` scalar and `latent256Available` duplicate row field,
  removed the latent lane bit, and restored the columnar/GPU fixture width to
  `12`. A direct complete-chain contract check passed; an incomplete chain
  correctly failed closed.
- [ ] **LATENT-BRIDGE-01** — exact CandidateOrdinal to canonical chunk ID to
  `latent_256` hydration and checkpoint readback remains a separate proof. No
  latent retrieval vote or production ranking activation is enabled.

Validation note: focused Vitest and full TypeScript commands started but did not
complete within the bounded execution window; they are inconclusive, not marked
as passed.

Evidence: `sveltekit-frontend/src/lib/server/atlas/features/canonical-candidate-v1.ts`,
`sveltekit-frontend/src/lib/server/atlas/features/candidate-feature-row-v1.ts`,
`sveltekit-frontend/src/lib/server/atlas/features/candidate-feature-columnar-v1.ts`,
and the focused feature fixtures.

### Latent-256 locality feature slot + ContextManifest feature-presence bridge (2026-08-30)

- [x] **CFF-LATENT-01-ROW-SCHEMA** — added `latentLocalityScore` (nullable
  score) and `latent256Available` (boolean) to `CandidateFeatureRowV1Schema`
  in `candidate-feature-row-v1.ts`, mirroring the existing
  `crossEncoderRawScore`/`crossEncoderAvailable`
  `NULL_PLUS_AVAILABILITY_FLAG` pattern exactly, with a matching
  `superRefine` invariant. Added `'latent'` to the `laneMask` enum.
- [x] **CFF-LATENT-02-COLUMNAR-SYNC** — extended `CANDIDATE_SCALAR_FEATURES`
  (12 → 13) and `CANDIDATE_LANE_BITS` (`latent: 1<<9`) in
  `candidate-feature-columnar-v1.ts` to keep the GPU-facing columnar encoder
  in sync with the row schema.
- [x] **CFF-LATENT-03-FIXTURE-RIPPLE** — the 12→13 width change broke 6
  hardcoded fixtures across `candidate-feature-gemm-v1.spec.ts`,
  `candidate-feature-gpu-batch-request-v1.spec.ts`,
  `candidate-feature-gpu-residency-v1.spec.ts`, and
  `scripts/atlas/write-candidate-feature-arrow.mjs` (module-level
  `FEATURE_COUNT`/`F` constants, `featureNames` literal arrays, and
  `[rows,12]` GPU buffer shape tuples). All fixed and reconciled.
- [x] **CFF-LATENT-04-TEST-GREEN** — full `src/lib/server/atlas/features/`
  suite (9 files) now passes 42/42, including Arrow IPC readback.
- [x] **CFF-CONTEXTMANIFEST-01-PRESENCE-MAP** — added an additive
  `feature_presence?: Record<string, FeaturePresenceState>` field
  (`'PROVEN'|'DERIVED'|'PARTIAL'|'UNAVAILABLE'`) to `ContextManifest` in
  `context-compiler.parent-atlas.ts`, threaded through `compileContext()`
  and `buildContextManifestFromACE()` in `ace-context-manifest.ts` via a
  new `deriveFeaturePresenceFromACE()` conservative default (only
  `semantic768`/`lexical`/`exact`/`graph` are derivable from `ACEContext`
  today; `ast`/`compiler`/`latent256`/`latent128`/`latent64`/`som` default
  `UNAVAILABLE` until a real producer wires them). Existing 14 `ContextManifest`
  consumers unaffected (additive-only). 8/8 tests passing
  (`ace-context-manifest.spec.ts`).
- [ ] **CFF-LATENT-05-ROW-PRODUCER-JOIN** — not started: no live producer yet
  joins `codebase_chunk_index.latent_256` into real
  `CandidateFeatureRowV1` rows. The current row/columnar ABI is intentionally
  12-wide; the former `latentLocalityScore`/`latent256Available` slot was
  removed by `FEATURE-ABI-12-CORRECTION`. The existing latent hydration and
  derive-at-query-time math are separate, tested artifacts; they do not yet
  provide a live candidate-row producer, latent retrieval vote, or production
  ranking activation.
- [ ] **CFF-CONTEXTMANIFEST-02-DEEP-PRESENCE** — `deriveFeaturePresenceFromACE`
  is a request-level heuristic over `ACEContext` array presence, not a
  true per-candidate propagation from `CandidateFeatureRowV1.laneMask`/
  `crossEncoderAvailable`/`latent256Available`. Wiring real candidate-level
  availability through into the manifest is the next real step in this
  bridge.

Also this session (same date, adjacent but outside this fabric):
verified/fixed the 768-dim embedding backfill (`embedding_dimension`
metadata was stale on 52,402 rows, corrected via `vector_dims()`); ran a
deep-audit fix pass (34 real auth/Zod fixes across 59 API routes); wired
BM25 (`ts_rank` on `codebase_chunk_index.search_vector`) into
`hydrate-candidates.ts`'s `FeatureEnvelope.lexical` (was silently dropped
before, `canonical-rerank-executor.ts` already had a live 20% weight for
it); extended `python/backfill_latent_256.py` to also persist `latent_64`
(200/55,169 rows proven, verified idempotent); froze a checksummed
`semantic_768` training snapshot (`python/export_frozen_semantic768_snapshot.py`,
`docs/reports/semantic768-ae-training-snapshot-v4.json`, rowCount=55,169 —
no corpus growth over the existing v3 checkpoint). No `AE_TRAIN_V4` run has
been started. See session transcript for the full architecture discussion
this was scoped from (Candidate Feature Fabric already exists and should
not get a competing `RepairCandidateFeatureMatrix` owner — extend the
existing row/snapshot/columnar chain instead, which is what CFF-LATENT-01
through 04 above do).

### External critique review (2026-08-30, same session, post-handoff-note)

A pasted external analysis (transcript-style, unverified provenance) proposed
two changes. Both were checked against the live repo before acting on either.

- **Claim: revert `latentLocalityScore` (13th scalar) back to 12** — reasoning
  given was that `Latent256CandidateProviderV1` only supports
  candidate↔candidate diversity today, not a real query-side scalar producer,
  so the slot is premature. **Not reverted this session** — user explicitly
  deferred this to a future review rather than approving either the revert or
  a rebuttal in-session. Recorded here as an open decision for next time:
  `CFF-LATENT-05-ROW-PRODUCER-JOIN` (already logged above as `[ ]`) is exactly
  the missing piece the critique is pointing at — the row/columnar/GEMM/Arrow
  slot exists and is test-green, but nothing populates it from real data yet.
  Whoever picks this up next should decide: build the join (keep 13), or
  revert to 12 until a producer is designed. Do not do neither silently.

  **Current reconciliation 2026-09-06:** that deferred decision is now closed
  by the later `FEATURE-ABI-12-CORRECTION`; the canonical feature fabric is
  12-wide and the latent row slot is not present. `CFF-LATENT-05-ROW-PRODUCER-JOIN`
  remains open only for a future explicit producer design and must not be read
  as a request to restore a thirteenth scalar.
- **Claim: the committed Graphify embedding writer
  (`scripts/atlas/backfill-graphify-file-embeddings-768.mjs`) writes to
  `content_embedding_768` instead of canonical `content_embedding`, and
  silently falls back from a `:8081` executor to Ollama** — **checked and
  found FALSE/stale against current main.** Read the live file directly:
  `CANONICAL_COLUMN = 'content_embedding'` (line 44, with an explicit comment
  distinguishing it from the smaller `content_embedding_768` compatibility
  column), and the actual `UPDATE` statement (line 193) writes
  `content_embedding = $1::halfvec(768)` plus `embedding_model`,
  `embedding_version`, `embedding_dimension`, `embedding_normalized`,
  `embedding_created_at` — real provenance, not absent. The Ollama fallback
  (`embedBatch()`) is not silent: every fallback path (`useCudaEmbed` health
  probe miss, VRAM guard below `MIN_FREE_VRAM_MB`, mid-run CUDA failure) is
  `console.warn`/`console.error`-logged with an explicit "fail open, never
  hard-fail" design rationale in the surrounding comments, and is a documented
  deliberate choice, not an accidental promotion-boundary leak.
  `rg "content_embedding_768"` across `scripts/` and `sveltekit-frontend/src`
  returns zero live-code hits (comment-only reference in this same file).
  `git log` shows this file's last change is today's
  `f4d00849d6 Parent Atlas: Qdrant 1.19 upgrade, Ornith 1.5 promotion,
  embedding backend hardening` — the critique appears to describe a
  pre-hardening state of this script, not current main. **No fix applied;
  none was needed.** The one genuinely real, smaller gap the critique also
  raised — `.slice(0, 12_000)` truncates by JS string length, not by an
  EmbeddingGemma-tokenizer-qualified token count — is accurate and still
  open, but is a truncation-precision nit, not the "wrong physical target /
  unsafe silent fallback" P0 blocker the critique framed it as.

### External critique review, part 2 — LATENT-BIND-01 / LATENT-BRIDGE-01 (2026-08-30)

### LATENT-BRIDGE-01 — read-only hydration receipt completed (2026-08-30)

The existing PostgreSQL provider was strengthened with explicit per-ordinal
outcomes and duplicate-ID detection. It now distinguishes `AVAILABLE`,
`MISSING`, `REVISION_MISMATCH`, `INVALID_SHAPE`, and `IDENTITY_UNRESOLVED`;
the latter is included in the receipt checksum and cannot be silently treated
as a missing vector. The provider continues to use only the exact
`codebase_chunk_index.id` supplied by the caller and never derives that ID from
`packetKey`, a Qdrant point ID, or a path.

The read-only runner
`sveltekit-frontend/scripts/atlas/prove-latent256-provider-live-readonly-v1.mts`
was updated to emit the outcome list rather than JSON-serializing `Map` objects
and to record `databaseWrites: false`. The live replay used 32 ordered
PostgreSQL chunk IDs and ran twice with the same checkpoint and representation
inputs:

- `LIVE_READBACK_PROVEN`
- canonical IDs resolved: 32/32
- vectors hydrated: 32/32
- revision mismatches: 0
- invalid dimensions/non-finite vectors: 0
- ambiguous rows: 0; identity-unresolved rows: 0
- candidate drops/reorders: 0/0
- replay identity parity: true
- replay checksum parity: true
- canonical/database writes: 0/0
- production activation: false

Receipt: `docs/reports/latent256-live-readback-v1.json`.
This proves the bounded PostgreSQL identity-to-vector hydration boundary and
replay determinism only; it does not prove retrieval quality, QRELS promotion,
full-corpus coverage, or production activation.

Continued verifying the same pasted critique's P1 claims against live code.

- **Claim: `CanonicalCandidateV1` is stale, lacks `latent_256`, treats nested
  latents as direct autoencoder outputs from `semantic_768`** — **checked and
  found FALSE/stale.** `sveltekit-frontend/src/lib/server/atlas/features/canonical-candidate-v1.ts`
  already has `latent_256`/`latent_128`/`latent_64` in `candidateRepresentationId`
  (lines 12-14), a `projectionKind` enum including
  `NESTED_PREFIX_L2_RENORMALIZE` (line 22), and `superRefine` logic (lines
  48-58) that already enforces exactly what the critique asked for: `latent_256`
  is `LEARNED_AUTOENCODER` sourced from `semantic_768` (physical), while
  `latent_128`/`latent_64` are `NESTED_PREFIX_L2_RENORMALIZE` sourced from
  `latent_256` (derived) — not from `semantic_768` directly. The set-level
  invariants the critique asked for also already exist:
  `REPRESENTATION_BINDING_DUPLICATE_ID` (one binding per representationId,
  line 90) and `REPRESENTATION_BINDING_SOURCE_UNAVAILABLE` (derived
  availability requires source availability, lines 91-97) in
  `assertRepresentationBindingSet()`. No fix needed.
- **Claim: no identity bridge exists between `CandidateOrdinal` and
  `codebase_chunk_index.id` for `latent_256`, so no `CandidateOrdinal` can
  legitimately claim latent data yet** — **checked and found ALREADY BUILT.**
  `sveltekit-frontend/src/lib/server/retrieval/latent256-candidate-provider.ts`
  (`PostgresLatent256CandidateProvider`) does exactly this: takes
  `codebase_chunk_index.id` values, reads `latent_256` +
  `latent_256_checkpoint_revision` directly, buckets every requested id into
  `found`/`missing`/`revisionMismatch`/`invalidShape`, and returns
  `vectorsChecksum`/`receiptChecksum` — functionally equivalent to the
  critique's proposed `CandidateLatent256HydrationReceiptV1`. Its own
  docstring already states `canonicalAuthority=false`, `queryEncoder=false`,
  `activeRetrievalLane=false` (matching the critique's own framing) and is
  consumed by `post-process-reranker.ts`'s `LATENT256_SEMANTIC_DEDUP` step —
  candidate↔candidate diversity pruning, confirmed live.
- **What this confirms is still real** (the one part of the critique that
  was already correctly identified before it arrived): that same provider's
  docstring is explicit that it is "Not a query-time encoder... no
  query-latent-vector step here and none is needed for candidate-side
  diversity pruning." This is the same gap already logged above as
  `CFF-LATENT-05-ROW-PRODUCER-JOIN` — `latentLocalityScore` on
  `CandidateFeatureRowV1` has no real producer, because the only live
  `latent_256` consumer does dedup, not a per-candidate relevance scalar.
  **Net effect of this review round: every structural claim in the critique
  (writer target, representation bindings, identity bridge) was already
  fixed in code that predates the critique; the one substantive gap it
  raised (no scalar producer for the 13th feature) was already the exact
  thing flagged as open in the first review-round entry above.** No new
  code changes made this round — this was a verification-only pass.

### CFF-CONTEXTMANIFEST-02-DEEP-PRESENCE: blocked on a prerequisite the earlier entries missed (2026-08-30)

Picked this up as the next open item. Before building deeper per-candidate presence propagation
on top of `deriveFeaturePresenceFromACE()`, checked who actually calls
`buildContextManifestFromACE()` in production. **Zero real callers found** --
`grep -rln "buildContextManifestFromACE" src/` returns only `ace-context-manifest.ts` itself and
its own `ace-context-manifest.spec.ts`. The underlying `compileContext()` it wraps
(`context-compiler.parent-atlas.ts`) is in the same state -- only its own spec test calls it.
The `ContextManifest` *type* is referenced in 2 real files (`execution-feedback.ts`, `types.ts`)
but only as a type import on a function parameter, which doesn't establish that anything actually
constructs and passes a real one at runtime yet.

**This means the whole `CFF-CONTEXTMANIFEST-01-PRESENCE-MAP` addition from earlier this session
(and the `compileContext`/`buildContextManifestFromACE` machinery it built on) is currently
well-designed, tested, and additive-safe -- but not yet wired into any live request path.**
Per this repo's own duplication-prevention rule ("if ownership can't be established, stop and
record the ambiguity in an OpenSpec change -- don't implement past that point"), building
`CFF-CONTEXTMANIFEST-02-DEEP-PRESENCE` (deeper per-candidate propagation) on top of a currently-
unwired function would be adding a second speculative layer on top of a first one, not closing a
real gap in a live path. **Not implemented this round -- deliberately stopped here instead of
building further on dead code.**

**Corrected next step, if this thread is picked up again**: before touching
`deriveFeaturePresenceFromACE()` further, find (or build) the real call site -- whichever route
or ACE pipeline stage is supposed to be constructing a `ContextManifest` from a live `ACEContext`
and currently isn't. That's a wiring task (find/create the integration point), not a feature-depth
task (make the presence map smarter). Once a real caller exists and is confirmed to have latent_256
hydration data available (e.g. via `PostgresLatent256CandidateProvider`, live and tested per the
origin merge earlier this session), *that* caller is the right place to pass an explicit
`featurePresence` override with real per-candidate coverage -- not a change to the pure/sync
`deriveFeaturePresenceFromACE()` default, which is deliberately conservative and synchronous by
design (its own JSDoc: "without re-running retrieval").

### QDRANT-768-IDENTITY-AUDIT-02: live full-census diagnostic correction (2026-08-31)

Ran the existing read-only `audit-qdrant-768-identity.mjs --json` against the live
`codebase_chunks_768` collection. The census found 109,776 Qdrant points, 55,169 eligible
PostgreSQL rows, 1,299 ambiguous mappings, 681 unmatched points, 5,634 PostgreSQL rows with
multiple mapped Qdrant points, and zero CandidateOrdinal payloads. Qdrant point IDs are unique.

The auditor was corrected so integer-ID continuity is observational only for the numeric subset;
UUID point IDs are valid and do not fail retrieval safety. JSON mode now emits machine-parseable
JSON on stdout while progress/env diagnostics go to stderr. The report remains
`safe_for_retrieval: false` because identity ambiguity, unmatched points, duplicate canonical
fanout, and absent CandidateOrdinal payloads remain unresolved. No database, Qdrant, or projection
writes occurred. See `docs/reports/qdrant-768-identity-audit-live.json`.

The independent read-only parity verifier agrees: `codebase_chunks_768` has 109,776 points versus
55,169 PostgreSQL eligible rows, with 57,396 stale/mixed points and 2,789 missing projection rows;
payload contract violations are zero. `--fix-stale` was not run. The projection remains blocked
until the mixed historical cohort is reconciled and a revision-qualified CandidateOrdinal payload
bridge is proven.

### CANDIDATE_FEATURE_GPU_LEASE duplicate owner: resolved via archival (2026-08-31)

`docs/reports/gpu-residency-cutile-simt-readiness-v1.json` (a concurrent audit, same day)
re-confirmed a `DUPLICATE_OWNER` finding first flagged as an unresolved "operator decision" on
2026-08-21 (`openspec/changes/parent-atlas-branch-merge-consolidation-aug20/
swarm-reconciliation-2026-08-21-addendum.md`): `candidate-feature-gpu-residency-v1.ts` and
`candidate-feature-gpu-resident-lease-v1.ts` implement the same capability (checksum-bound lease
over GPU-resident candidate-feature buffers, build/verify/release lifecycle) with near-identical
naming ("residency" vs "resident"). Both audits' preferred consolidation direction: keep
`candidate-feature-gpu-residency-v1.ts` (it has a real caller,
`candidate-feature-gpu-batch-request-v1.ts`); archive `resident-lease-v1` once its caller census
is confirmed empty.

Independently re-verified the caller census myself before acting, not trusted from either report:
`residency-v1.ts` has a real production caller plus its own spec; `resident-lease-v1.ts` has zero
callers anywhere in the repo outside its own spec and its own dedicated prove script
(`prove-candidate-feature-gpu-resident-lease.mts`). Found and included two more files in the same
orphaned family that neither prior report enumerated: that `.mts` prove script and its Python-side
CUDA counterpart, `scripts/atlas/prove-candidate-feature-gpu-resident-lease.py` -- neither is
referenced by any npm script or CI, and both exist solely to exercise the orphaned module.

Archived all 4 files per this repo's archive-not-delete convention (SHA-256 recorded in
`docs/archive-manifest.json`, copies in `deeds_labs/archive/2026-08-31/`, `git rm` from the live
tree) rather than deleting them -- recoverable via `git show <pre-removal-commit>:<path>` or the
`.bak` copies if this consolidation direction is ever revisited:
- `sveltekit-frontend/src/lib/server/atlas/features/candidate-feature-gpu-resident-lease-v1.ts`
- `sveltekit-frontend/src/lib/server/atlas/features/candidate-feature-gpu-resident-lease-v1.spec.ts`
- `sveltekit-frontend/scripts/atlas/prove-candidate-feature-gpu-resident-lease.mts`
- `scripts/atlas/prove-candidate-feature-gpu-resident-lease.py`

Verified after removal: repo-wide grep for any remaining reference found only historical
docs/reports (audit snapshots, session notes) -- no live code references. `tsc --noEmit -p
tsconfig.json --skipLibCheck`: 77 errors (down from the pre-removal 79 baseline; consistent with
removing dead code, zero new errors introduced). `candidate-feature-gpu-residency-v1.ts` remains
the sole canonical owner of `CANDIDATE_FEATURE_GPU_LEASE`, unchanged by this pass.

**Not addressed this pass**: the second finding in the same concurrent audit,
`NUMERIC_ARTIFACT_MANIFEST` (`OVERLAPPING_CONTRACTS` across `tensor-artifact-contract.ts`,
`tensor-artifact-manifest-v1.ts`, `representation-artifact-v1.ts`, `artifact-work-item-v1.ts`) --
that audit's own recommendation is "do not add a new contract yet; first define which existing
contract owns immutable numeric artifact lineage", which is a design decision, not a mechanical
archive like this one was.

**Reconciliation with a concurrent decision receipt (same day, `docs/reports/
candidate-feature-gpu-lease-owner-v1.json`)**: a different agent independently reached the same
canonical-owner conclusion and the same caller-census facts (zero production callers of
`resident-lease-v1`) via its own audit, landed in a separate commit
(`705b4bd592`, "docs(atlas): canonicalize candidate feature GPU lease owner") that merged cleanly
with the archival above (no file overlap). That receipt planned a *staged* process before
archival/removal -- add a deprecated marker, migrate any worth-preserving test invariants into the
canonical spec, re-verify callers, *then* archive (its own `GPU-LEASE-CONSOLIDATE-02` gate,
recorded `status: "OPEN"`, not executed) -- whereas this entry went straight from independent
verification to archival.

The two are not actually in conflict on substance: that receipt's own `migrationPolicy` already
states `archiveBeforeRemoval: true` and `deleteWorkingProofScripts: false` -- exactly what
happened here (archived with SHA-256 + `.bak` copies per this repo's archive-not-delete
convention, nothing deleted, fully recoverable via `git show` or the archive). The receipt's
`evidenceWorthPreserving` list (real-CUDA physical resident checksum proof, release-transition
proof, post-release-access-rejection proof) is intact in the archived `.spec.ts` file, just no
longer imported into it live. `GPU-LEASE-CONSOLIDATE-02`'s own precondition -- "search again for
zero non-test/non-doc legacy callers before archive/removal" -- is satisfied by the independent
caller census performed before this archival, recorded above. Treat
`GPU-LEASE-CONSOLIDATE-02` as closed by this entry rather than separately re-running it; if a
future session wants the specific test invariants migrated into `candidate-feature-gpu-residency-
v1.spec.ts` for extra belt-and-suspenders coverage, that remains a legitimate, low-priority
follow-up, not a blocker -- the underlying safety properties are still proven, just not
double-proven in the canonical spec file.
### QDRANT-PACKET-FANOUT-IDENTITY-01 recheck (2026-09-10)

- [x] Ran the read-only packet fanout census against `codebase_chunks_768`.
- [x] Confirmed `109,776` points, `9,964` packet keys, `4,351` multi-point
      groups, and `104,163` points in fanout groups.
- [x] Confirmed only `30` points carry source/workspace revisions and only
      `677` carry representation revisions; `5,701` groups remain revision
      unproven, with `1,616` conflicting-source groups and `2,630` exact
      duplicate projection groups.
- [ ] Keep Qdrant promotion blocked. No payload repair or projection write was
      performed.

Evidence: `docs/reports/qdrant-packet-fanout-v1.json`.
Status: `IDENTITY_OR_REVISION_GAPS`; authority=false; writesPerformed=false.
First blocker: `QDRANT_CANONICAL_IDENTITY_AND_REVISION_COVERAGE_UNPROVEN`.
Next gate: current source/structural lineage before any bounded Qdrant canary.
- [ ] CANONICAL-IDENTITY-V1 POINTER (2026-09-21): canonical object identity (symbol/file/chunk discriminants, mandatory workspaceRevision + sourceRevision, no 'unknown'/latest-row inference, representation/execution/transport ids and CandidateOrdinal are NOT canonical identity) is owned by `CANONICAL-IDENTITY-V1-SPEC-01` in `openspec/changes/parent-atlas-retrieval-lineage-dag-convergence/tasks.md`. This change SHALL reference that contract and not define its own identity rules; it may add representation-, execution-, feature-, cache-, transport- or projection-specific identities only. Pointer only; no scope change here. Spec status: SPEC_DRAFT (not signed off).

### LARGE-CORPUS-ENRICHMENT-01 (2026-09-26; artifact-only, noncanonical)

- [x] `LARGE_CORPUS_ENRICHMENT_CENSUS_01`: streamed schema census of `.tmp/mapreduce-full-v5.ndjson` and `sveltekit-frontend/tmp/codebase_chunks_768-embeddings.ndjson`. Receipt: `docs/reports/large-corpus-enrichment-census-v1.json`. Metadata input: 805,352,974 bytes / 5,000 records; stableKey, filePath and contentHash present, but no packet key, sourceRef, summary, source revision, workspace revision or embedding. Representation input: 739,230,455 bytes / 76,261 records; 76,241 source_refs, 61,738 distinct refs, 14,503 duplicate rows, 76,261 768-dimensional embeddings; no packet key, summary or source/workspace revisions. Classification: first input is metadata-only evidence; second is representation-only and remains unqualified. Neither is canonical enrichment-ready.
- [x] `LARGE_CORPUS_ENRICHMENT_CENSUS_RECHECK_02` (2026-09-27T17:18Z): reran the same streamed census with a unique output path, preserving the earlier v1 receipt. Both files retain their prior byte counts and SHA-256 values; row counts, schema fingerprints, duplicate counts, and zero malformed-line counts also match. Metadata remains 5,000 rows without packet/source/revision/summary fields. Representation remains 76,261 rows / 61,738 distinct source refs / 14,503 duplicate rows / 768 dimensions, without packet/source/workspace revisions or summaries. No model calls, DB/projection/cache writes, or Graphify runs. Fresh receipt: `docs/reports/large-corpus-enrichment-census-v2-20260927T1718Z.json`.
- Read-only census recheck 03 (2026-09-27T23:29Z): the same two immutable artifacts retain their recorded byte sizes and SHA-256 values. The 5,000-row metadata export still has no packet/source identity, source/workspace revision, or summary fields; the 76,261-row representation export remains 768-D with 61,738 distinct `source_ref` values and 14,503 duplicate rows, but no packet/canonical identity or source/workspace/representation revisions. This confirms neither artifact is independently enrichment-ready and does not supersede the exact canonical join gates below. No inference, datastore/cache/projection writes, or Graphify execution. Fresh receipt: `docs/reports/large-corpus-enrichment-census-v3-20260927T2329Z.json`.
- [x] `LARGE_CORPUS_ENRICHMENT_BUILD_01`: streamed, bounded local enrichment shards using the existing `build-large-corpus-enrichment-shards-v1.mjs` worker-thread pool (8 workers, maximum 5,000 rows/shard). Run: `.tmp/atlas/large-corpus-enrichment-shards-v1/20260926T165445Z/`; 5,000 metadata rows into 1 shard and 76,261 representation rows into 16 shards. Manifest root checksum `85712fd9ec1c065857361b2f926cb218b479555f89cd89d28094165e20e3f3ff`; `canonicalAuthority=false`, no IDs/revisions inferred and embedding vectors were referenced, not copied into the enrichment records.
- [x] `LARGE_CORPUS_ENRICHMENT_SHARD_VERIFY_01`: added `scripts/atlas/validate-large-corpus-enrichment-shards-v1.mjs`; validated 17 shard boundaries, all row counts/ordinals and per-shard hashes, full 81,261-row conservation, root checksum and no-authority invariants. Receipt: `.tmp/atlas/large-corpus-enrichment-shards-v1/20260926T165445Z/validation-receipt.json`; 72 checks, 0 failures.
- [x] `LARGE_CORPUS_POSTGRES_SOURCE_REF_JOIN_01` (read-only exact-key reconciliation): `scripts/atlas/audit-large-corpus-shards-postgres-reconciliation-v1.mjs` revalidated all 17 shard checksums and joined the 61,738 distinct representation-corpus source_ref strings byte-exactly under `BEGIN READ ONLY; ... ROLLBACK`. Result: 0 matching `codebase_chunk_index` refs, 2 matching `atlas_packets` refs (neither with source/workspace revision), 61,736 matching neither, and 0 promotion-eligible rows. Receipt `docs/reports/large-corpus-shards-postgres-reconciliation-v1-20260926T1702Z.json`. Added an explicit immutable `--output` argument because the legacy fixed report path already existed; prior report preserved.
- [x] `LARGE_CORPUS_CANONICAL_JOIN_01`: exact packet/candidate and packet→chunk evidence joins completed read-only; prior 2026-09-26T172434Z crosswalk is historical and its CandidateOrdinal coordinates are superseded. Current-map replay is recorded under `LARGE_CORPUS_SNAPSHOT_REBASE_01` below. Full input conservation and unmatched/ambiguous cases remain explicit; no persistence or feature promotion.
- [x] `LARGE_CORPUS_PACKET_CANDIDATE_CROSSWALK_01`: sealed metadata → current byte-verified binding → exact packet revision tuple → existing CandidateOrdinalMapV1 crosswalk completed read-only with conservation and checksums. Content hash was used only through the existing unique-digest binding owner; historical path remained a hint. Receipt records canonicalAuthority=false, featureAdmitted=false, and zero writes.
- [x] `LARGE_CORPUS_CURRENT_BINDING_01`: current source authority and exact noncanonical packet/chunk evidence composition completed read-only. The 1,520 chunk rows are qualified by admitted source binding + proven packet/chunk lineage + exact full-file digest, not by null chunk mirror columns. Current CandidateOrdinal rebase and row counts are in `LARGE_CORPUS_SNAPSHOT_REBASE_01`; no filePath/stableKey inference and no database write.
- [ ] `LARGE_CORPUS_FEATURE_SNAPSHOT_01`: BLOCKED_ON_CURRENT_OWNER_SEMANTIC_INPUTS. The historical V2 readiness receipt qualified 1,520 rows using `content_embedding`; the current-owner V3 replay below shows `content_embedding_768` is missing on all 1,520. The old column's vector-quality proof is historical-column evidence only and does not satisfy the current `semantic_768` input gate. All 1,520 current source bytes still match their source revisions and packet/chunk lineage qualifies; summaries are absent and immutable per-vector model/tokenizer/input/vector provenance is not present. No feature matrix admission or promotion.
- [x] `LARGE_CORPUS_PACKET_CHUNK_OVERLAY_01`: follow-up to the earlier mirror-only blocker in `LARGE_CORPUS_CANONICAL_JOIN_01` / `LARGE_CORPUS_CURRENT_BINDING_01`. The indexed chunk mirrors are null, but a read-only exact evidence composition now joins packet-key CandidateOrdinal → `atlas_packet_chunk_lineage` (`EXACT_MULTI_MEMBER/PROVEN`) → `codebase_chunk_index` row/sourceRef → full-file hash. Of 363 exact metadata candidates, 127 have proven chunk lineage, yielding 1,520 unique chunk rows; 236 candidates have no chunks, no candidate has exactly one, and maximum multiplicity is 50. All 1,520 indexed `file_content_hash` values equal the byte-verified lineage `sourceRevision`; chunk revision mirrors remain null and untouched. The rows have 0 summary texts and 0 `content_embedding_768` vectors. The overlay preserves multiplicity and upstream revisions as noncanonical evidence only; no feature is admitted. Two replays produced identical output checksum `sha256:e8ea213c5e8a452682f3008a48b41e1973703ce24213eb7e8d29c42364df524b`. Receipts: `.tmp/atlas/mapreduce-packet-chunk-evidence-overlay-v1/20260926T173355Z/manifest.json` and `20260926T173429Z/manifest.json`.
- [x] `LARGE_CORPUS_CURRENT_BINDING_01` correction: the prior mirror-only blocker is superseded by exact noncanonical evidence composition: full-file digest + exact packet/chunk lineage qualifies the 1,520 overlay rows without repairing/populating canonical mirror columns. Summary and vector inputs remain absent and the feature snapshot gate stays open.
- [x] `CURRENT_ENRICHED_INDEX_REVISION_STATE_01` (2026-09-26; read-only DB → sealed local artifacts): the current enriched-index owner now distinguishes `REVISION_QUALIFIED_PACKET_SHA256_STALE` from true source-revision conflict; the source/workspace/packet identity tuple, not compatibility `packet.sha256`, controls qualification. Fresh replay: 24,456 rows = 15,732 `REVISION_QUALIFIED` + 419 source-revision-qualified/stale compatibility SHA + 392 missing packet source revision + 7,913 unresolved identity. All 3,630 current packet summaries remain explicitly `LEGACY_HINT_UNQUALIFIED` (`summaryRevisionQualified=0`). Fresh matrix has 16,151 candidates and exact live readback, retaining the stale-SHA state; snapshot/ordinal owners and chunk-HINT bridge are recorded in the retrieval-lineage OpenSpec. Matrix `docs/reports/candidate-feature-matrix-draft-v1-20260926T174833Z.json`; shard report `docs/reports/current-enriched-index-shards-v1-20260926T1745Z.json` (actual artifact run `20260926T174815Z`). The promotion smoke remains blocked by shared placeholder embeddings; AST is explicitly not joined. No canonical/projection writes.
- [x] `LARGE_CORPUS_SNAPSHOT_REBASE_01` (2026-09-26; artifact-only): reran the existing metadata→binding→packet→CandidateOrdinal crosswalk against the current `CandidateOrdinalMapV1`/`CandidateFeatureSnapshotV1` owner, snapshot `sha256:09bfbf6125ddc67f194edd6170f6d9c87a14d001f877eef1ec269600b2424388`, ordinal checksum `90c237c8d8afd41d176540e2a5a3430ae86b626b7de94e08b49255e7b7fd4bf9`. All 5,000 metadata rows conserved; 363 exact candidates / 363 unique current ordinals, 45 exact packet tuple misses, 4,583 without unique verified current binding, 9 duplicate digest inputs excluded. Rebuilt packet→chunk overlay against this exact map: 1,520 unique chunk rows, all 1,520 full-file digests equal proven source revisions; 127 candidates have multiple chunks, 236 have none, max multiplicity 50. Chunk source/workspace mirrors remain null; prior “0 semantic_768” status is superseded by `MAPREDUCE-CHUNK-READINESS-01`: 1,520/1,520 exact current chunk bindings and canonical `content_embedding` representation present, but 0 immutable encoder revisions and no summary text in the canonical summary column. The original crosswalk `.tmp/atlas/mapreduce-candidate-evidence-crosswalk-v1/20260926T181922Z/manifest.json` and overlay `.tmp/atlas/mapreduce-packet-chunk-evidence-overlay-v1/20260926T181939Z/manifest.json` remain historical artifacts; the corrected readiness receipt is `docs/reports/mapreduce-chunk-readiness-v2-20260926T194719Z.json`. All Postgres/Qdrant/Valkey/RabbitMQ/Neo4j/Graphify writes zero. Feature snapshot remains blocked on quality-approved, policy-admitted feature inputs and immutable representation provenance.
- [x] `LARGE_CORPUS_ORNITH_SUMMARY_PROPOSAL_CANARY_01` (2026-09-26; proposal-only): reused the current exact 6,732-row source/chunk cohort and generated through the shared llama-server SSE adapter at `:8090`, with active model `ornith-1.5-9b`, runtime build `b8757-a29e4c0b7`, and the model artifact SHA256 pinned in each manifest as `sha256:a9a8d6d859b540502f57c53ef78a4a608df818061b180022a32b9af46698d5c6`. The 12-target spread run is `.tmp/atlas/ornith-summary-proposals-v1/20260926T200225Z/manifest.json`: 12 generated, 0 generation failures, 12 distinct CandidateOrdinals and exact current chunk bindings; shared quality detector accepted 11 and rejected 1 as `PLACEHOLDER_PATTERN`. The earlier `20260926T195945Z` run is retained as history but is not the spread canary (its 12 rows clustered on only 2 candidates). A separate read-only target revalidation plan for the spread run reports 12/12 eligible with exact bindings and empty canonical summary slots. These are proposals only: none was admitted or written to canonical summaries. Model artifact hashing, adapter tests (3/3), and script syntax check passed. Next gate is quality review/replacement of the rejected target, then atomic admission hardening and explicit authorization; no SUM-04C.
- [x] `LARGE_CORPUS_CHUNK_VECTOR_DEGENERACY_01` (2026-09-26; read-only, 1,520-row current chunk cohort): added `scripts/atlas/audit-mapreduce-chunk-vector-degeneracy-v1.mts`, which verifies the sealed readiness receipt/row-details checksum and exact unique chunk IDs, then reads only those IDs in a `REPEATABLE READ READ ONLY` transaction. Two runs against `docs/reports/mapreduce-chunk-readiness-v2-20260926T194719Z.json` conserved 1,520/1,520 rows and reproduced vector-row checksum `sha256:ccfb0eb79f30d4006e1ed976cd85e0384d1938baa3f7d3cdd5a247f28cd7f99b`. Both receipts report 1,520 distinct digests; duplicate vectors 0; missing, wrong-dimension, non-finite, zero-norm and non-unit vectors 0; representation revision `UNRECORDED` on 1,520/1,520. Receipts: `docs/reports/mapreduce-chunk-vector-degeneracy-v1-20260926T200920Z.json` and `20260926T200932Z.json`. This closes only quality/degeneracy for the exact slice, not encoder provenance or the independent whole-corpus shared-vector diagnosis. No datastore writes; canonicalAuthority=false.
- [x] `SEM768-ENCODER-RUNTIME-OBSERVATION-01` (2026-09-26; read-only): queried the live `:8097` `/health` and `/stats`, verified its container config uses `OLLAMA_URL=http://host.docker.internal:11434` and `EMBED_MODEL=embeddinggemma:latest`, then read Ollama `/api/tags` and `/api/version`. The service reports the model alias loaded at 768 dimensions; Ollama reports model digest `85462619ee721b466c5927d109d4cb765861907d5417b9109caebc4e614679f1` (model size 621,875,917 bytes; Ollama 0.34.4). This pins the currently observed backend model artifact, but `:8097` does not expose the digest in its own health/capability or per-vector receipts; therefore it does not bind the historical 1,520 stored vectors to that model and is not immutable per-vector provenance admission. No inference request or service/container change was made.
- [x] `LARGE_CORPUS_ENRICHMENT_REPLAY_V2` (2026-09-26): replayed the original bounded 8-worker builder against both census-pinned inputs, then its existing shard verifier. Current run `.tmp/atlas/large-corpus-enrichment-shards-v1/20260926T190202Z/`; 5,000 metadata + 76,261 representation rows = 81,261 conserved; 17 shards; root checksum reproduced as `85712fd9ec1c065857361b2f926cb218b479555f89cd89d28094165e20e3f3ff`; verifier 72/72, 0 failures. Inspection of scalar representation-row fields confirms only numeric export `id`, raw `source_ref`, null `stable_key`, `protocols`, and the vector are present; no source/workspace revision, packet identity, summary, or stable chunk identity was found. This is reproducibility proof, not a new authority or feature snapshot.
- [x] `LARGE_CORPUS_QDRANT_ID_BRIDGE_CENSUS_01` (2026-09-27; read-only): streamed all 76,261 representation-export rows and compared their distinct point IDs against current `codebase_chunk_index.qdrant_id`, `atlas_packets.qdrant_point_id`, and legacy `code_retrieval_chunks.qdrant_id` (including its historical `qdrant:<id>` form) inside a repeatable-read read-only PostgreSQL transaction. Matches: 484 current chunk-index projection IDs, 0 packet point IDs, and 1,486 legacy retrieval IDs. None of the 484 current chunk-index matches had an exact exported `source_ref` or `relative_path` match; all 1,486 legacy matches lacked a stored `source_ref`, and none had an exact `file_path` match. These are projection-locator matches only, not a representation-to-current-chunk binding; vectors were not fetched and no datastore writes occurred. The later v3 receipt includes the legacy `metadata.source_ref` fallback and path checks, superseding earlier receipts' narrower diagnostics. Receipt: `docs/reports/large-corpus-qdrant-id-bridge-v3-20260927T192218Z.json`; reproducible audit: `scripts/atlas/audit-large-corpus-qdrant-id-bridge-v1.mjs`.
- [x] `LARGE_CORPUS_SOURCE_REF_CANDIDATE_AUDIT_01` (2026-09-27; local immutable artifacts only): added `scripts/atlas/audit-large-corpus-source-ref-candidate-bridge-v1.mjs`; two replays verified census input checksums plus all 5 current-enriched shard checksums and reproduced identical counts for the 5,000 metadata records and 76,261 representation rows through exact and existing `normalizeSourceRef` keys. Exact representation sourceRef found only 1 distinct current file ref / 3 vector rows, with no revision-qualified packet candidate. The normalizer yields 4,788 source-file candidate refs covering 51,207 vector rows; 41,941 rows have a revision-qualified *file-level* packet candidate, but 6,663 normalized keys collapse multiple raw export refs. Metadata exact path+hash matches are 0; normalized path+hash produces 415 candidates, 367 with a revision-qualified file-level packet candidate. These are diagnostic file-group candidates only: the export still has no chunk row ID, packet key, source/workspace revision, or stable key, and no output is admitted. Receipts: `docs/reports/large-corpus-source-ref-candidate-bridge-v1-20260927T200051Z.json` and `docs/reports/large-corpus-source-ref-candidate-bridge-v1-20260927T200252Z.json`; no DB/cache/projection writes or model calls.
- [x] `LARGE_CORPUS_QDRANT_PAYLOAD_CANONICAL_BRIDGE_AUDIT_01` (2026-09-27; payload-only, read-only): the live `codebase_chunks_768` collection was green at 328,348 points before and after a full scroll; no vectors were fetched. Qdrant payload `chunk_id` joined uniquely to `codebase_chunk_index` for 239,395 points; 925 points had ambiguous chunk rows and 88,028 had no chunk-row match. Of unique joins, 236,495 matched source_ref, 220,802 matched content_hash, and 220,673 matched both. **Zero** canonical rows carried all of `source_revision`, `workspace_revision`, and `representation_revision`, so strict revision-qualified representation binding remains 0/328,348. `packet_key` joined 106,337 points and was unmatched for 222,011; packet rows are not used to override chunk identity. Receipt: `docs/reports/qdrant-payload-canonical-bridge-v1-20260927T201208Z.json`; auditor: `scripts/atlas/audit-qdrant-payload-canonical-bridge-v1.mjs`. Qdrant is a projection; no vectors, datastore/cache writes, or inference.
- [x] `LARGE_CORPUS_REPRESENTATION_ID_CANONICAL_BRIDGE_AUDIT_01` (2026-09-27; full payload scroll, read-only): Qdrant `representation_id` is not a consistent semantic-revision field or row-ID field. Of 328,348 points, 324,981 had a value but only 1,000 were UUID-shaped and all 1,000 joined a unique `codebase_chunk_index.id`; a spot check at point 1002 returned literal `semantic_768`. The separate `atlas_chunk_packet_identity_links` has 105,762 point links, but 0 with source_revision and only 1,001 chunk UUIDs equal to payload representation_id. None of the 1,000 canonical rows had all required source/workspace/representation revisions; strict qualified count remains 0. Receipt: `docs/reports/qdrant-representation-id-canonical-bridge-v1-20260927T201624Z.json`; auditor: `scripts/atlas/audit-qdrant-representation-id-canonical-bridge-v1.mjs`. No vectors, inference, or datastore/cache writes.
- [x] `LARGE_CORPUS_CHUNK_LINEAGE_REVISION_CROSSWALK_AUDIT_01` (2026-09-27; read-only): among 105,762 Qdrant identity-link rows, 6,312 resolve through canonical chunk rows to `atlas_packet_chunk_lineage` rows marked `revision_status=PROVEN`, each with a source revision. Exact source-ref/source-revision matches reach workspace bindings (11,246 joined rows spanning 2 workspace revisions). This improves source-lineage evidence for a bounded subset only: identity-link source_revision remains empty, chunk content_hash equals workspace file digest for 0 rows, and the relation does not bind vector generation time or semantic representation revision. Receipt: `docs/reports/qdrant-chunk-lineage-revision-crosswalk-v1-20260927T202040Z.json`. No vectors or writes.
- [ ] `LARGE_CORPUS_REPRESENTATION_BINDING_V2`: blocked on an admitted representation-to-current-chunk binding. Payload `chunk_id` joins uniquely to 239,395/328,348 points; 220,673 also match source_ref and content_hash. The payload `representation_id` is mixed: only 1,000 UUID-shaped values join canonical primary keys, while a point-1002 spot check is the literal `semantic_768`. There are 925 ambiguous and 88,028 missing chunk_id joins; **zero** canonical rows or identity-link rows have the complete source/workspace/representation revision tuple. A separate exact lineage join recovers source revisions for 6,312 linked rows, but does not bind those vectors to their generation inputs; content_hash-to-file-digest matches remain 0. These are locator/source-lineage results, not semantic admission or vector-byte proof. V1 export discarded payload identity fields. Next: identify any immutable per-vector generation receipt; otherwise regenerate only under the frozen content and representation policy. Do not stamp current revisions onto historical vectors, infer IDs/ordinals, or use vector similarity to manufacture binding.
- [ ] `LARGE_CORPUS_FEATURE_SNAPSHOT_V3`: blocked. Same-snapshot source/chunk coordinates and vector well-formedness are proven for 1,520 rows; exact vector digests are unique, but representation revisions are unrecorded on every row. Current Ollama backend model digest is observed, but no per-vector link to it exists and `:8097` does not expose the digest in its capability/receipt. Canonical `summary_text` remains absent, and the Ornith output is proposal-only (11/12 quality-clean in the spread canary; no admission). Whole-corpus shared-vector cause, immutable per-vector encoder provenance, admitted feature input, and broader matrix readiness remain open. Do not create an empty or zero-filled feature matrix, and do not treat proposals as admitted summary features.

### FEATURE-PRODUCER-PROPOSAL / GPU-FABRIC-AUDIT checkpoint (2026-09-27)

- [x] **FEATURE-PRODUCER-PROPOSAL-CENSUS:** existing evidence indicates the
  historical 1,808 ORF rows do not form a revision-qualified producer for the
  current 16,151 packet-key cohort; the prior live adapter read accepted 0 and
  found null workspace revisions among the rows it matched. Do not stamp or
  backfill those rows. Exact current producer inputs/revisions remain absent.
- [ ] **GPU-FABRIC-AUDIT:** contract owners expose snapshot/map coordinates,
  but no shared frozen artifact has been replayed through cuVS, hypergraph
  incidence, feature GEMM and GPU residency. See the first-tranche report.

Report: `docs/reports/graph-ace-gpu-first-tranche-20260927.md`.

### MAPREDUCE-CHUNK-READINESS-03 — current physical owner (2026-09-28; read-only)

- [x] Added `scripts/atlas/measure-mapreduce-chunk-readiness-v3.mts` and pure
      vector/provenance checks in `scripts/atlas/lib/mapreduce-readiness-v3-utils.mjs`.
      It pins the existing sealed overlay and candidate map, rehashes current
      source files, then checks PostgreSQL in a repeatable-read read-only
      transaction. The historical V2 runner and receipts were not rewritten.
- [x] Replayed 127 candidates / 1,520 chunks. Exact current-source byte hashes
      matched 1,520/1,520; packet and chunk lineage qualified 1,520/1,520.
      `content_embedding_768` was MISSING 1,520/1,520; historical
      `content_embedding` was PRESENT 1,520/1,520; canonical summaries were
      MISSING 1,520/1,520 (summary embeddings: 1,338 missing, 182 unbound).
      Complete immutable representation binding was absent on 1,520/1,520.
      Receipt: `docs/reports/mapreduce-chunk-readiness-v3-20260928T012835Z.json`;
      row details: `.tmp/atlas/mapreduce-chunk-readiness-v3/20260928T012835Z/readiness.ndjson`.
- [x] Pure utility tests pass 3/3; script syntax and targeted TypeScript
      compilation pass; no PostgreSQL, Qdrant, Valkey, RabbitMQ, Neo4j,
      Graphify, or model writes/calls. `canonicalAuthority=false`.
- [ ] Next: resolve current-owner writer/materialization policy and immutable
      model/tokenizer/input/vector provenance. Do not promote old-column vectors,
      stamp revisions onto existing vectors, or create an empty/zero-filled
      feature matrix. Broad shared-vector diagnosis and relevance evaluation
      remain separate open gates.

Workboard pivot snapshot: `docs/reports/openspec-workboard-run-20260928T0131Z.md`
and `.json` record the switch to the current-owner MAPREDUCE/semantic contract
gates. Snapshot census: 90 OpenSpec changes, 9,937 tasks, 6,613 complete and
3,324 open. Relevant boards: semantic-768 contract 52/78 complete; candidate
feature execution fabric 253/352 complete. The snapshot is a projection, not
an authorization or completion receipt for remaining gates.

### MAPREDUCE-CHUNK-READINESS-03 / GAN-READINESS-V3-ADAPTER-01 recheck (2026-09-28)

- Replayed the existing V3 measurement against the same sealed overlay and live PostgreSQL owner. It rehashed 127 current source files and conserved 1,520/1,520 packet/chunk/source-byte bindings; the current `content_embedding_768` vector is still missing for every row, with no immutable representation binding. Fresh receipts: `docs/reports/mapreduce-chunk-readiness-v3-20260928T022535Z.json` and `docs/reports/feature-promotion-readiness-v2-20260928T022535Z.json`.
- Extended the GAN audit's lineage adapter to recognize the validated, checksum-verified V3 receipt without promoting semantic availability. Six adapter tests pass; fresh live GAN result is `LIVE_READ_ONLY_PROVEN` for the packet validator and structural cohort, while semantic projection remains `NOT_EXERCISED`. Final receipt: `docs/reports/gan-readonly-live-proof-v1-20260928T022800Z.json`.
- This refresh closes no materialization, matrix, scorer, persistence, cache, or promotion gate. No PostgreSQL or projection writes, embedding calls, inference, or service rebuilds occurred.

### SEM-EMBED-RESPONSE-BINDING-01 — local response admission contract (2026-09-28)

- [x] Added a pure TypeScript validator for `/embed/v2` responses. The request boundary now verifies that the full supplied file SHA-256 equals the declared `sourceRevision`, then binds selected source segments and exact admitted input to the capability/receipt revisions, observed Ollama model digest, and float32-LE vector checksum/norm. It rejects full-source/segment drift, request/capability disagreement, resident-digest drift, vector corruption, and authority/atomic-binding overclaims.
- [x] Focused request/response/compiler tests pass 23/23; targeted strict TypeScript checking passes. The result is explicitly `OBSERVED_NONCANONICAL` with `canonicalAuthority=false`; cache hits are marked as not executing the model for that request.
- [ ] **Not wired or runtime-proven:** no live `/embed/v2` call, TypeScript production caller, immutable per-call model binding, runtime tokenizer attestation, canonical Postgres row readback, or semantic materialization was performed. The existing MAPREDUCE semantic owner/materialization gate remains open; this validator is an adapter contract only.
- GAN audit classification: request/response contract is CREATED and unit-PROVEN; it is not production-WIRED and is not DONE. The existing read-only GAN adapter suite passes 6/6; the latest live receipt remains explicitly `semanticProjection=NOT_EXERCISED` / `BLOCKED_SEMANTIC_PROJECTION_NOT_EXERCISED` (`docs/reports/gan-readonly-live-proof-v1-20260928T022800Z.json`). This code-only change does not update that live receipt.
- No datastore/cache writes, inference, service deployment, or container rebuilds.

### SEM-EMBED-RUNTIME-PROVENANCE-CENSUS-01 (2026-09-28T165305Z; read-only)

- Host-mapped Go embedding service `:8097` is reachable. `GET /health` reports healthy; `GET /stats` reports model alias `embeddinggemma:latest` and configured dimension 768. These endpoints do not prove per-call inference or GPU execution. `:8081` is not reachable.
- Read-only Ollama `GET /api/tags` and `GET /api/ps` both report `embeddinggemma:latest` with the same observed API digest `85462619ee721b466c5927d109d4cb765861907d5417b9109caebc4e614679f1`. This is catalog/resident observation only: not a GGUF-file digest, not an atomic per-call binding, and not a representation receipt.
- Filtered inspection of the running `legal-ai-go-embedding` container found `OLLAMA_URL` and mutable `EMBED_MODEL` only; `EMBEDDING_SERVICE_BUILD_REVISION`, `EMBEDDING_TOKENIZER_REVISION`, `EMBEDDING_INPUT_POLICY_REVISION`, and `EMBEDDING_CONTENT_SELECTION_REVISIONS` are absent. `resolveEmbeddingCapabilityV2` therefore rejects before Ollama embedding execution; `/embed/v2` was not called. `/ready` was also not called because its implementation performs a warm-up embedding.
- The running container is image `sha256:431ddc0acb6fb8252b003fb514727f2fee9dad6b81735a1cf485dc3d98617fd2`, created `2026-07-29T16:00:28Z`; GET-only `http://127.0.0.1:8097/embed/v2` returned 404, confirming the current runtime image does not expose the later strict handler. Added future Compose/env-example pass-through for the strict policy variables, leaving immutable build/tokenizer revisions blank. No container recreation or rebuild was performed.
- The existing Compose healthcheck targets `/ready`, whose implementation performs a warm-up embedding. That is pre-existing orchestration behavior, not an embedding call initiated by this audit; treat future health polling as potentially inference-bearing.
- Result: strict live materialization remains BLOCKED on explicit immutable service/tokenizer/input/selection configuration. This audit initiated no embedding request or datastore/cache write and performed no container rebuild; the pre-existing `/ready` healthcheck may independently execute its warm-up inference. No claims of canonical admission.

### SEMANTIC-768-STORAGE-CONTRACT-ALIGNMENT-01 (2026-09-28; code-only)

- [x] Reconciled the semantic registry and Drizzle declaration with the current
      canonical storage contract: `semantic_768` targets
      `codebase_chunk_index.content_embedding_768` and Qdrant's `content` slot.
      Drizzle now maps that column separately while preserving
      `content_embedding` as a historical/transition surface.
- [x] Focused semantic-manifest tests pass 3/3; the semantic-contract package
      TypeScript build passes; runtime Drizzle metadata confirms both physical
      embedding columns are represented. Strict OpenSpec validation and scoped
      whitespace checks are run after this entry.
- This is contract/schema declaration alignment only. It does not qualify
  existing vectors, resolve the 19-writer census, authorize a migration or
  data write, or close the current cohort's missing 1,520/1,520
  `content_embedding_768` values and immutable representation provenance.
- [ ] Next: reconcile every producer/reader against this canonical column and
  retain the live semantic owner/materialization gate until per-row provenance
  and readback are proven. Do not redirect a writer or backfill from this
  declaration alone.
- Workboard pivot recorded in `docs/reports/openspec-workboard-run-20260928T1716Z.md`
  and `.json`: 90 changes / 9,943 checklist tasks (6,624 complete, 3,319 open);
  scheduler selected 0 tasks. The focused work moved from deployment
  configuration to the canonical semantic-column contract because the checked
  in manifest and current repo instructions disagreed. This projection is not
  task authorization or writer-owner proof.

### MAPREDUCE-CHUNK-READINESS-03 / GAN-READINESS-V3-ADAPTER-01 refresh (2026-09-28T1742Z; read-only)

- Replayed the explicitly pinned sealed evidence overlay with the V3 runner via `tsx` (plain Node cannot load this `.mts` file's TypeScript `.js` imports). The source manifest and candidate-map coordinates were unchanged: snapshot `sha256:09bfbf6125ddc67f194edd6170f6d9c87a14d001f877eef1ec269600b2424388`, ordinal checksum `90c237c8d8afd41d176540e2a5a3430ae86b626b7de94e08b49255e7b7fd4bf9`.
- Fresh receipt `docs/reports/mapreduce-chunk-readiness-v3-20260928T174041Z.json` (`sha256:299a309201bb94d628383c8b3e70b7a97c1e42147c2805b9bbe806b2b655dbc8`): 127 candidates / 1,520 chunks; packet, chunk, and current-source-byte bindings qualify 1,520/1,520, with all 127 source files rehashed. Current canonical `content_embedding_768` is missing 1,520/1,520; representation binding is `UNQUALIFIED_OR_INCOMPLETE` 1,520/1,520; historical `content_embedding` exists 1,520/1,520 but is not promoted. Summary text is missing 1,520/1,520; summary vectors are 1,338 missing / 182 unbound.
- Fresh explicit-input GAN receipt `docs/reports/gan-readonly-live-proof-v1-20260928T174202Z.json`: `LIVE_READ_ONLY_PROVEN` for the packet validator and named structural cohort; 61,718 rows read, five `ERR_INVALID_SOURCE_REF`, 56,719 legacy extension-only false rejections, all five consistency checks true. The structural claim is cohort-scoped; semantic projection remains `NOT_EXERCISED`, so aggregate validation remains blocked on that lane.
- Both runners used repeatable-read read-only PostgreSQL transactions and rolled them back. No PostgreSQL/cache/projection writes, embedding calls, model inference, or promotion occurred. These receipts refresh measurement only; semantic materialization, matrix admission, scorer exposure, held-out evaluation, and MMR remain separate open gates.

### LARGE_CORPUS_CURRENT_ORDINAL_OWNER_REPAIR_AND_REBASE_02 (2026-09-28; local artifact proof only)

- [x] Repaired `scripts/atlas/materialize-candidate-ordinal-corpus-v1.mts` to build and verify the ordinal map through the canonical `CandidateOrdinalMapV1` owner, rather than hashing a reduced projection. The owner check uses the full canonical candidate payload and deterministic ordering. Existing workspace-revision filtering, exact `source_ref` matching, and explicit apply authorization guards were preserved.
- [x] Replayed the producer read-only against the pinned workspace/snapshot. It read 16,151 packet rows and admitted 1,358 lineage-qualified candidates into a new local-only map. Reverse-input replay produced the same canonical checksum. Map checksum: `sha256:2a13b99f9b5ee911b14b7259cf8d8767e3c415ad86002108100531f693205c51`.
- [x] Added exact-tuple current-map rebase and independent validation under `scripts/atlas/lib/large-corpus-current-map-rebase-v2.mjs`, `scripts/atlas/rebase-large-corpus-crosswalk-to-current-map-v2.mts`, and `scripts/atlas/validate-large-corpus-current-map-rebase-v2.mts`. The 5,000-row prior crosswalk was conserved: 90 rows matched the current qualified map; 273 historical exact matches were outside that current map; 4,637 rows had no exact prior map match and were not attempted. No ordinal was inferred for any non-exact row.
- [x] Validation: canonical ordinal owner suite 19/19; rebase helper tests 7/7; producer/rebase syntax checks pass; independent rebase validator reports `VALIDATED_NONCANONICAL_REBASE`, 1,358 map entries, 5,000 conserved rows, 90 exact matches, unique current ordinals, `canonicalAuthority=false`, `featureAdmitted=false`, and zero datastore writes. Local artifacts: `.tmp/atlas/candidate-ordinal-corpus-v2/20260928T184318Z/` and `.tmp/atlas/mapreduce-candidate-evidence-rebase-v2/20260928T184401Z/`.
- [ ] Promotion/current-report repair remains open. The existing `docs/reports/candidate-ordinal-corpus-v1.json` was preserved and is not owner-verified by this run; do not silently substitute the local artifact as canonical or interpret the 1,358 candidates as full-cohort semantic eligibility. Any update to the established report/current owner requires its separately authorized materialization path.
- [ ] Semantic materialization, embedding provenance, feature-matrix admission, and projection/cache writes remain independent open gates. This rebase is identity-coordinate evidence only; it does not qualify semantic vectors or admit features.

### LARGE_CORPUS_CURRENT_MAP_CHUNK_REBASE_03 (2026-09-28; current-map subset, read-only)

- [x] Re-ran `scripts/atlas/audit-mapreduce-verified-source-lineage-v1.mjs` against the pinned source-binding report in a read-only PostgreSQL transaction. Fresh report: `docs/reports/mapreduce-verified-source-lineage-v1-20260928T185319.466Z.json`; its source workspace revision matches the current map (`sha256:e24bb97187ea6394eeba457dd849915f570045b7a1867780fdc7aa9ea62b9acc`), with 1,520 exact proven packet→chunk lineage rows and 1,520 indexed chunk rows whose file hash equals the lineage source revision.
- [x] Added an explicit `--allow-lineage-qualified-subset-map` mode to the existing metadata crosswalk builder. The default full-snapshot mode remains pinned to 16,151 rows; subset mode validates the producer’s lineage-qualified count/order metadata, strips only the three recognized non-owner extension fields before canonical Zod validation, and writes to a distinct V2 local artifact root. It does not equate `canonicalId` with `packetKey`.
- [x] Fresh V2 crosswalk conserved all 5,000 metadata rows: 90 exact current-map matches, 273 prior packet matches outside the current map, 4,583 with no unique verified current binding, 45 with no exact packet/source/revision match, and 9 duplicate digest inputs. Receipt: `.tmp/atlas/mapreduce-candidate-evidence-crosswalk-v2/20260928T185550Z/manifest.json`; artifact remains noncanonical and feature-unadmitted.
- [x] Added the matching explicit subset mode to the packet→chunk overlay composer and removed its invalid `canonicalId === packetKey` assumption while preserving each field independently. The current-map overlay contains 90 candidates / 1,059 unique chunks; every candidate has proven chunk lineage, every chunk file hash matches the source revision, and all 90 candidates have multiple chunks (maximum 50). No chunk revision mirrors were populated. Receipt: `.tmp/atlas/mapreduce-packet-chunk-evidence-overlay-v2/20260928T185721Z/manifest.json`.
- [x] Replayed `scripts/atlas/measure-mapreduce-chunk-readiness-v3.mts` against that exact V2 overlay. Read-only PostgreSQL readback and rehashing qualified packet/chunk/source bytes for 1,059/1,059 chunks and rehashed 90/90 source files. Canonical `content_embedding_768` is missing 1,059/1,059; immutable representation binding is unqualified 1,059/1,059; canonical summary text is missing 1,059/1,059; summary-semantic rows are 977 missing / 82 unbound. Historical `content_embedding` exists on 1,059/1,059 but is not promoted. Receipt: `docs/reports/mapreduce-chunk-readiness-v3-20260928T185744Z.json`; row details: `.tmp/atlas/mapreduce-chunk-readiness-v3/20260928T185744Z/readiness.ndjson`.
- [x] Focused rebase tests pass 7/7; crosswalk, overlay, and readiness script syntax checks pass; strict OpenSpec validation and scoped diff checks pass. No inference, embedding calls, PostgreSQL writes, cache/projection writes, or source edits were performed by the read-only audits.
- GAN status: the local subset map/crosswalk/overlay are CREATED and replay-PROVEN; they are not production-WIRED, canonical, feature-admitted, or DONE. The readiness runner is WIRED to the existing PostgreSQL reader and PROVEN read-only for this exact 90-candidate/1,059-chunk cohort. Semantic projection remains blocked; do not use historical `content_embedding` to satisfy `semantic_768`.

### SEMANTIC_768_WRITER_CENSUS_CONTRACT_ALIGNMENT_01 (2026-09-28; static-only, no store access)

- [x] Corrected `scripts/atlas/audit-semantic-768-writer-ownership-v1.mjs` to label `codebase_chunk_index.content_embedding_768` as the canonical contract target while keeping writer ownership explicitly `UNRESOLVED_NOT_PROMOTED`; `content_embedding` is classified as a historical/transition surface.
- [x] Added `--static-only` and repository-confined `--output=...` options so the writer census can be exercised without a PostgreSQL connection and without overwriting its established report. Static scan found 17 writer/reader surfaces (16 mutation-capable by source-pattern classification) spanning `atlas_packets.embedding`, `content_embedding`, and `content_embedding_768`; operator entrypoints remain owner-unproven. Among the 768-column surfaces, `index-full-repo-for-search.mjs` has source/workspace revision tokens but no paired row guard, `api/codebase-index/index-stream` is route-reachable and lacks those revision bindings, and the lineage-qualified apply script has row guards but remains a separately gated writer. The Graphify backfill and document-prefix re-embed paths still target historical `content_embedding`.
- [x] Syntax check and static-only census passed. Receipt: `.tmp/atlas/semantic-768-writer-ownership-v2-static-20260928.json`; `live.reachable=false`, `writesPerformed=false`, verdict `OWNER_NOT_PROVEN`.
- [x] Corrected `scripts/atlas/audit-atlas-indexing-surfaces.mjs` to prioritize and report `content_embedding_768` as the declared semantic_768 contract target, while labeling its owner unproven and keeping the historical column's population separate. Added a repository-confined `--output=...` option so live receipts do not overwrite the existing report.
- [x] Corrected the semantic predicate in `scripts/atlas/audit-canonical-projection-fabric.mjs`: vector-column presence now reports `NOT_PROVEN`, records the 768 contract target separately from historical/unresolved surfaces, and cannot turn mere schema presence into partial owner proof. Other pre-existing edits in that file were preserved.
- [x] Ran the read-only indexing-surface audit to `.tmp/atlas/atlas-indexing-surfaces-v2-20260928.json`: PostgreSQL 18.4 reports `content_embedding_768` present at 219,998/274,465 rows and historical `content_embedding` at 55,169/274,465. The 768 target is partial and populated values still lack this audit's per-row representation/source proof; the 90-candidate readiness cohort remains 0/1,059 on the 768 column. The pre-existing report was not overwritten.
- [x] Ran the full SELECT-only owner census to `.tmp/atlas/semantic-768-writer-ownership-v2-live-20260928.json`: `atlas_packets.embedding` 61,659/61,718, historical `content_embedding` 55,169/274,465, and declared `content_embedding_768` 219,998/274,465. It still returns `OWNER_NOT_PROVEN`; counts do not attest per-row representation provenance.
- [x] Traced the reachable index-stream writer: it copies the Qdrant `content` vector when dimension=768, then upserts by Qdrant point ID and path/content fields; the route payload is not bound to source/workspace revisions before Postgres mirroring. It also has Qdrant mutation stages. The route was not invoked; preserve as a blocked writer surface until exact identity/provenance and authorization policy are settled.
- [x] Read-only Go Retrieval owner trace: `services/go-retrieval-service/generate.sh` generates from root `proto/active/retrieval.proto`; `SearchCodebase` embeds the query and searches Qdrant, then hydrates candidate/source/workspace/representation lineage from PostgreSQL via exact Qdrant-row and source-binding joins. `StreamCodebase` only forwards the resulting chunks. This establishes a projection-retrieval executor and metadata bridge, not an embedding writer or `content_embedding_768` owner.
- [x] Identified a receipt propagation gap without changing the stream: unary `SearchCodebase` computes `validationStatus`, `identityError`, and an output checksum into `CodebaseSearchResponse.receipt`, but `StreamCodebase` discards that response envelope and sends only `CodebaseChunk` events. The generated stream schema has no terminal receipt event, so revision fields on streamed chunks alone must not be treated as proof that the whole response passed lineage validation.
- [x] Confirmed the duplicate `sveltekit-frontend/proto/retrieval.proto` is an older contract: its `CodebaseSearchRequest`/`CodebaseChunk` omit the packet-key allowlist and lineage/revision fields. Go code generation does not use it, and no imports/callers of the legacy `go-retrieval-coordinator.ts` or `go-service-integration.ts` were found under `sveltekit-frontend/src`; do not infer these legacy TypeScript vector fields are the live Go path.
- [ ] Define and prove a versioned stream receipt/terminal-event contract (or a separately bound unary receipt) before any stream consumer promotes chunk lineage; reconcile/remove the stale frontend proto only after its actual generation/runtime consumers are identified.
- [x] Syntax checks, static receipt invariants, stale-owner-phrase search, strict OpenSpec validation, and scoped diff checks pass. No database writes, embedding calls, projection/cache writes, or container changes.
- [ ] Do not redirect or run any writer from this census. Reconcile every producer/reader, verify exact input/model/tokenizer/representation provenance, then obtain explicit authorization and independent readback before canonical materialization.

### CANDIDATE_ORDINAL_MATRIX_ROW_CROSSWALK_01 (2026-10-07; contract hardening, fixture only)

- [ ] Hardened the existing `atlas-pipeline-stage-contracts-v1.ts` crosswalk builder to require the matrix producer's ordered `matrixRowCandidateOrdinals`, not just a row count and caller-supplied ordinal-map checksum. It rejects missing/duplicate/invalid row ordinals and any row whose candidate ordinal differs from the corresponding admitted `CandidateOrdinalMapV1` binding. The crosswalk remains inside the existing matrix/orchestration owner; no registry or datastore writer was added.
- [ ] Added fixture cases for correct order, reversed order, duplicate row ordinal, missing row binding, deterministic shuffled observation input, duplicate feature-row ordinal, revision mismatch, candidate-cell mismatch, feature-column mismatch, and JSON serialize/readback. Focused spec passed 12/12 on 2026-10-07; this proves the bounded contract fixture only.
- [ ] Production row producer/caller remains unproven: repository search found only the contract/spec builder references, no live matrix producer invoking it. The fixture crosswalk binds the admitted map to an explicit producer-supplied ordinal sequence; it does not establish that live CandidateFeatureMatrix cell generation emits that sequence or that a persisted artifact was independently read back.
- [ ] Nearby matrices are not interchangeable owners: `atlas/neural-routing/materializer.ts` builds a tool-routing matrix; `retrieval/candidate-feature-matrix-adapter-v1.ts` wraps the existing 25-column retrieval matrix and now requires a supplied `CandidateOrdinalMapV1`, exact packet/source/workspace/source-revision matching, and map-ordered profile rows. `atlas/retrieval/query-adaptive-feature-compiler.ts` consumes another retrieval-row contract. The 25-column adapter remains distinct from the 11-feature fixture artifact; do not merge their schemas or promote either by name similarity.
- [ ] Corrected an incompatible schema-ID collision: the neural-routing matrix has 18 tool-routing features and a different row shape, but had claimed `atlas.candidate-feature-matrix.v1`. Renamed its discriminator and encoder-manifest feature revision to `atlas.tool-routing-feature-matrix.v1`; the packet candidate matrix keeps `atlas.candidate-feature-matrix.v1`. Regression assertion passed in the focused 12/12 spec; compatibility with persisted historical tool-routing payloads remains unverified.
- [ ] Hardened frozen-matrix validation to reject reordered feature columns and artifact readbacks whose receipt ordinal-map revision/checksum, graph/representation revision state, or availability counts disagree with the matrix/crosswalk. Focused 12/12 spec passed, including fixture serialize/readback and checksum checks; this is not independent persisted-artifact readback.
- [ ] Corrected the matrix fixture to represent unproduced values as unavailable with explicit reasons; a measured zero is valid only when marked available. Focused 12/12 spec passed.
- [ ] Tightened `CandidateFeatureCellV1`: unavailable cells require `value=null` plus a reason; available cells require a finite value and no unavailable reason. Focused 12/12 spec passed.
- [ ] Added `candidateOrdinal`, `rowOrdinal`, and `featureName` coordinates to cells; artifact validation binds each cell to the exact crosswalk row and frozen feature-column order. Candidate-row and feature-column mismatch regressions passed in the focused 12/12 spec.
- [ ] Added pure `buildCandidateFeatureCellsV1()` in the existing matrix owner. It joins signal rows by admitted ordinal, checks canonical identity plus source/workspace revisions, rejects duplicate/missing/orphaned rows and vocabulary drift, and emits deterministic row-major cells independent of input order. Focused 12/12 fixture spec passed; this is not a live feature producer.
- [ ] Fixed the full-project TypeScript error in matrix-revision validation by explicitly normalizing optional refinement-input revision fields to `null` before hashing. Matrix and graph focused suites pass 26/26; full `npx tsc --noEmit --pretty false` passes. Runtime/persisted artifact readback remains unproven.
- [ ] `CFM-OBSERVATION-SOURCE-01` static source audit: `ChunkRetrievalProfileV1` carries `canonicalChunkId`, packet/source refs, source/workspace revisions, `embeddingRepresentation='semantic_768'`, optional PageRank/community/domain fields, and `featureRevision`; however its builder does not produce a query semantic score or domain confidence, and PageRank/community have no graph revision binding. The adjacent 25-column matrix encodes absent values as zero plus a presence mask and its packet-key profile ordinal is not the admitted CandidateOrdinal. Do not map its semantic, graph, or chunk identity fields into the fixed 11-feature matrix without a receipt-backed exact join and signal semantics. No live DB query or adapter was run.
- [ ] Next: reconcile real feature observations with this builder and independently read back a frozen artifact with recomputed row-binding and matrix checksums before live retrieval integration. No Graphify refresh, database/cache writes, or production ranking changes.

### CFM_PRODUCER_CALLER_AUDIT_01 (2026-10-07; static source audit)

- The exact 11-feature contract and pure builders live in the existing
  `atlas-pipeline-stage-contracts-v1.ts` owner. Repository call-site search
  finds the crosswalk/cell/artifact builders only in that module and its
  fixture spec; there is no live producer invoking them with an admitted
  candidate cohort or measured feature observations.
- The execution-pipeline binding still declares
  `atlas.candidate-feature-matrix.v1` as `SCAFFOLD_CREATED` with
  `promotionEligible=false`. Its presence is not a runtime caller.
- Bounded artifact search found no
  `atlas.candidate-feature-matrix-artifact.v1` or
  `atlas.candidate-feature-matrix-receipt.v1` JSON under `docs/reports/` or
  `.tmp/`; code search found no non-test serializer/readback callsite.
  Independent persisted readback is therefore absent, not merely unobserved
  by a production route.
- Adjacent 25-feature retrieval matrices and the 18-feature tool-routing
  matrix remain separate contracts. Neither is an interchangeable producer
  for the 11-feature packet matrix. The tool-routing schema-ID correction is
  source evidence only; historical payload compatibility remains unverified.
- **Canonical 25-feature row-binding hardening (2026-10-08):** the existing
  `candidate-feature-matrix-adapter-v1.ts` now consumes the supplied
  `CandidateOrdinalMapV1`, validates map integrity and exact packet/source/
  workspace/source-revision bindings, then reorders profiles by map ordinal.
  Its row identities include canonical ID and symbol-version ID, and its
  identity checksum includes the ordinal-map revision/checksum. Reversed input
  profile order, duplicate packet keys, missing map rows, and revision mismatch
  are covered by focused adapter/tile tests (6/6); targeted TypeScript checking
  passed. This is contract/fixture proof only: no live application caller or
  admitted candidate cohort was exercised, and it does not make the adjacent
  11-feature artifact canonical.
- Therefore `CFM-PRODUCER-01`, `CFM-ORDINAL-01`, `CFM-ORDER-01`,
  `CFM-RECEIPT-01`, `CFM-READBACK-01`, and `CFM-CALLER-01` remain open.
  `CFM-OAK-01` and `CFM-GEPA-01` stay gated: do not expose an unproduced or
  fixture-only matrix to OaK/GEPA, and do not optimize feature meaning,
  identity, ordering, lineage, or contents.
- Focused Vitest recheck passed: `atlas-pipeline-stage-contracts-v1.spec.ts`
  12/12 and `neural-routing.spec.ts` 5/5 (17/17 total). This confirms the
  fixture contracts and distinct schema IDs only; it does not prove a live
  matrix producer, caller, or independent persisted readback.
- **2026-10-08 live-feature-join syntax repair:** corrected a malformed escaped-newline type literal in `search-runtime-live-feature-join-v1.ts` that prevented TypeScript parsing and caused cascading diagnostics. Its focused spec now passes 4/4. This restores source parseability only; no live matrix caller, admitted input, or readback is implied.
- **SearchRuntime caller recheck (2026-10-08):** focused canonical row-binding,
  tile, QAS resolver, and QAS adapter suites passed 12/12. Source-call search
  confirms application code reaches `createAtlasSearchAdapter().search()`;
  `searchWithQas()` / `searchWithAceManifest()` have no demonstrated
  request-scoped application caller (their observed invocations are tests or
  internal opt-in wrappers). The QAS feature-source contract accepts
  caller-supplied projections/context, but this audit found no production
  provider for the exact admitted `CandidateOrdinalMapV1` plus matching
  `ChunkRetrievalProfileV1` cohort required by the `[C,25]` adapter. Therefore
  the adapter is safer and tested but still not live-wired; no candidate,
  matrix row, receipt, or ranking change is claimed.
- **Independent continuation recheck (2026-10-07):** reran those same two
  focused suites from `sveltekit-frontend/`; 17/17 passed. A fresh source call
  search still finds crosswalk/cell/artifact serialization only in the matrix
  owner and its fixture spec; no non-test producer or caller was found. The
  fixed 11-feature names are `semantic_score`, `lexical_score`, `bfs_depth`,
  `global_pagerank`, `personalized_pagerank`, `leiden_community`,
  `domain_score`, `error_signal`, `smoke_signal`, `hyper_fact_hits`, and
  `relational_chain_score`. Existing observation rows expose some topology
  metadata but do not supply all query-scoped scores or an exact current
  CandidateOrdinal binding. Do not synthesize unavailable values or adapt the
  25-column/tool-routing matrices. No task checkbox was changed.
- No live retrieval, OaK, GEPA, datastore read/write, ranking change, or
  Graphify refresh was run.
- **Ordinal-map owner alignment (2026-10-07; fixture-only):** removed the
  matrix module's second, incompatible schema using the shared
  `atlas.candidate-ordinal-map.v1` identifier. The matrix crosswalk now parses
  and integrity-checks the existing `CandidateOrdinalMapV1`, binds each matrix
  row to that map's candidate ordinal/canonical identity/packet key and
  source/workspace revisions, rejects candidates without a packet key, and
  verifies the matrix candidate-set checksum against the ordered crosswalk IDs.
  The fixture uses the canonical source-chunk map materializer; it does not
  establish a live producer or current-workspace cohort. The focused matrix
  and canonical-candidate suites pass 38/38. No task checkbox was changed;
  live matrix producer/caller and independent persisted readback remain open.

- **Current-worktree correction (2026-10-07):** the pure producer is invoked
  by `searchWithAceManifest()` in `search-runtime-adapter.ts`; the
  `searchWithUnifiedResidencyFeaturePack()` wrapper composes that method, and
  `prove-unified-residency-searchruntime-duckdb-wsl-v1.mts` calls the wrapper
  with a synthetic one-row runtime fixture. This is a fixture/proof-harness
  caller, not evidence of a production request-path caller or admitted live
  cohort. The producer's serialize/readback is in-memory only; persisted,
  independently reopened artifact readback remains unproven. The harness also
  overwrites a tracked report and was not run during this recheck.
- **Bridge input recheck (2026-10-07; read-only):**
 `.tmp/atlas/cfm01-bridged-identity.ndjson` contains 6,732 rows but only 577
  distinct packet keys; 6,155 rows repeat an existing packet-key binding.
  Repeated keys had no conflicting `(source_ref, source_revision,
  workspace_revision)` values, but multiplicity ranged from 1 to 50. All rows
  use `sha256:e24bb971...`; the latest saved workspace derivation instead has
  candidate `sha256:97bcf2e7...` with `authority=false` and no admitted
  `workspaceRevision`. Therefore the bridge cannot be called a current or
  admitted cohort, and no revision-mismatch rate is defined against an
  admitted target. Its generating script/receipt was not located by scoped
  source and adjacent-artifact search. Do not deduplicate/promote this file or
  use its first 16–32 lines as a bounded candidate sample.

## 2026-10-07 — HyperGraphRAG executor and representation alignment gates

- **Repository/package boundary:** root `scripts/atlas/` remains the proof-runner/materializer/readback owner; `sveltekit-frontend/src/lib/server/atlas/` owns application composition; `packages/*` remain present as reusable contracts and pure logic. The merged HyperGraphRAG modules/tests are not grounds to delete `packages/` or Neo4j; Neo4j remains a projection/reference adapter unless a source-and-caller census proves an exact dead duplicate.

- Audit baseline: reusable owners already exist in this repository (`python/atlas_graph_runtime/networkx_executor.py`, `python/atlas_graph_runtime/cugraph_executor.py`, `python/atlas_cuda_cutile_simt_gemm_probe_v1.py`, and `sveltekit-frontend/src/lib/server/atlas/indexing/simdjson-typed-evidence-bridge.ts`). Their existence is not proof that a single admitted HyperGraphRAG incidence artifact is consumed by all of them, nor does it establish GPU runtime availability or parity. Keep this work in the root repository; package extraction is deferred.
- GNN scope audit: NetworkX is the topology/algorithm CPU owner, not a learned GNN framework; the RAPIDS environment has NetworkX, PyTorch, cuGraph, and nx-cugraph, but no detected PyG/cuGraph-PyG, DGL, or cuTile package. The CPU fixture roster now covers symmetric GCN, GraphSAGE mean/max-pooling, single-/multi-head additive GAT, dynamic GATv2, GIN sum + two-layer MLP, K-step SGC, APPNP propagation, Chebyshev spectral convolution, and a GCNII layer; this finite set does not claim coverage of every GNN family.
- CPU fixture now exists at `python/atlas_graph_runtime/gnn_reference.py`; CPU and test runners consume the same fixture definitions from `python/atlas_graph_runtime/gnn_fixtures.py`. 58 focused existing-environment tests passed (NetworkX GNN, graph runtime/PPR, OaK contracts, and grounded-fact models). Root runner `scripts/atlas/prove-networkx-gnn-cpu-v1.py` passed in WSL `atlas-rapids-cu13` (`NetworkX 3.6.1`, `PyTorch 2.13.0`, `cuGraph 26.6.0`) using CPU execution. Latest independent-readback receipt: `.tmp/atlas/networkx-gnn-cpu-fixture-proof-v1-20261008T033651320017Z.json` (`sha256:a05edb752c9950e7153b4b644d6e8654961b65753cba6130c202a80c71ca91db`). ACE payload and admitted topology coordinates are explicitly unavailable; fixture embeddings are not topology coordinates.
- Grounded-fact proof now covers TypeScript → stdlib frozen dataclass → OaK Pydantic → JSON readback, with matching checksum `sha256:0977972f5711c4344aa4625d53a5b2ec74895eb147305cc76c8ddcc5e63479df`. Independent receipt readback matched at `.tmp/atlas/grounded-nlp-dataclass-pydantic-parity-v1.json` (`sha256:0f71ed1f8798ed20b8efe83a807931a575ed82f64105db5a913a4538d1c3fd4c`). It explicitly records ACE payload and topology coordinates as unavailable. This is not fact admission or `:8095` runtime binding.
- Existing SvelteKit-focused Vitest collection was attempted for grounded NLP, tuple projection, simdjson typed bridge, packet incidence, and candidate tile suites, but all seven suites stopped before collection because `@adobe/css-tools` is missing from the current `node_modules`; zero tests ran. No dependency install was attempted.
- The corrected query-conditioned PPR test matches NetworkX (`A > B > C`); no PageRank algorithm change was needed. Existing SvelteKit read-only AgentExecutionSpine tests previously passed 12/12. These are code/fixture proofs, not production wiring.
- Latest read-only runtime inventory: RTX 3060 Ti has 7,717/8,192 MiB allocated and 0% utilization; llama-server `:8090/slots` is not processing, but this is not an idle GPU. Existing WSL environment has NetworkX, cuGraph, nx-cugraph, PyTorch, and CuPy; cuTile is not installed. No CUDA/cuGraph/cuTile execution was attempted.
- Final fixture gate: `npx tsx scripts/atlas/prove-gan-adversarial-v1.mts` returned `ADVERSARIAL_FIXTURES_PROVEN` (16/16; authority 7/7, structural lineage 4/4, semantic projection 2/2, runtime side effects 3/3), receipt `docs/reports/gan-adversarial-proof-v1-20261008T031436Z.json`. This is fixture-only gate behavior, not live graph admission, GPU parity, or production wiring.
- Final validation rerun after the CPU fixture and Python contract updates: `ADVERSARIAL_FIXTURES_PROVEN` (16/16; authority 7/7, structural lineage 4/4, semantic projection 2/2, runtime side effects 3/3), receipt `docs/reports/gan-adversarial-proof-v1-20261008T033725Z.json`. This is fixture-only gate behavior, not live graph admission, GPU parity, or production wiring.
- GPU execution was intentionally not attempted during this audit: `:8090/slots` reported no active generation, but `nvidia-smi` reported 7,725/8,192 MiB allocated and the `llama-server.exe` process present. A free request slot is not an idle GPU; cuGraph/cuTile parity remains gated on the operator-approved GPU handoff.
- Do not add a PyTorch KMeans lane for this graph/agent integration; any future cuML clustering remains an optional derived feature lane with its own snapshot/ordinal checksum and CPU comparison.
- Focused offline checks: NetworkX executor fixtures pass 3/3; the packet-incidence endpoint resolver passes 6/6; the typed simdjson evidence bridge passes 5/5 with the freshly built root package aliased because the installed `.pnpm` package snapshot lacks the newly restored adapter module. This is contract/parser proof only, not HyperGraphRAG incidence parity or cross-language simdjson streaming benchmark.
- Current standalone JSON parser smoke passed 6/6 using `JSON.parse` fallback; the Node simdjson addon was not found. This proves fallback correctness only, not simdjson parity or throughput. The focused Vitest suites still cannot collect because `@adobe/css-tools` is missing; no dependency install was attempted.
- **2026-10-08 focused recheck:** OaK Pydantic + stdlib dataclass tests passed 7/7 in the existing `.venv`; merged HyperGraphRAG package suites passed 9/9. The simdjson bridge suite passed 19/19 with `SIMDJSON_REQUIRE_NATIVE=1`; its >1-KiB fixture loaded `simd-bridge/cpp/build/Release/tensorrt_bridge.node`, exercised the native parser, and matched standard JSON semantics for Unicode, arrays, integers, booleans, and null. WSL RAPIDS has NetworkX 3.6.1, PyTorch 2.13.0+cu130, and cuGraph 26.06.00; its Python has no pytest, so pytest-only GNN tests did not run. The root CPU GNN proof runner independently passed all three frozen fixture operators and reopened its receipt (`.tmp/atlas/networkx-gnn-cpu-fixture-proof-v1-20261008T034056570000Z.json`, `sha256:3e3a58180d385b2ad2f4f4125ea58657f8bc811021379ee3e85c8b4c222562de`). It explicitly reports no admitted Parent Atlas payload/topology coordinates and zero writes.
- **SIMDJSON native-path audit:** current C++ N-API addon is present and its bounded parsing behavior is now exercised. The Rust crate has no unit tests; `cargo fmt --check` reports pre-existing formatting differences, and `cargo test` was not run because its build script auto-detects installed `nvcc` and may compile the CUDA SOM helper. Rust `simd-json` cross-parser parity, malformed-input matrix, and JSONL throughput remain OPEN.
- **2026-10-08 CPU GNN expansion:** added `GIN_SUM_MLP_V1` and bounded `SGC_K_STEP_V1` to the shared NetworkX/PyTorch CPU reference and deterministic fixture roster. Focused tests passed 9/9. The root runner passed all five architectures and independently reopened its receipt: `.tmp/atlas/networkx-gnn-cpu-fixture-proof-v1-20261008T034518035770Z.json`, checksum `sha256:71d17fba47ed98649494c13a8875537dc9701c1bf8cf5ed11d6df299714286fa`. Its parent-Atlas payload and topology coordinates remain explicitly unavailable; no store writes occurred. Extend the finite architecture coverage matrix before making any “all GNNs” claim.
- **Broader-suite boundary:** the focused GNN + graph-executor suite passed 12/12. Adding `test_parent_atlas_networkx_pagerank.py` exercised unrelated sidecar tests and produced 6 failures: the Python 3.11 parser rejects a backslash in an f-string expression in `python/miniforge_nlp_sidecar.py`; `python/langextract_service.py` has a `re` fallback NameError and BeautifulSoup is unavailable in that test interpreter. These pre-existing sidecar/environment issues were not changed by the GNN work.
- **Final GAN gate (2026-10-08):** `npx tsx scripts/atlas/prove-gan-adversarial-v1.mts` returned `ADVERSARIAL_FIXTURES_PROVEN` (16/16; authority 7/7, structural lineage 4/4, semantic projection 2/2, runtime side effects 3/3; self-tests all pass), receipt `docs/reports/gan-adversarial-proof-v1-20261008T034657Z.json`. Fixture-only; no live cohort/store writes.
- [ ] **HGR-NETWORKX-01** Reuse the existing NetworkX graph-analysis owner as the deterministic CPU oracle for request-local incidence and graph algorithms. Bind the fixture input checksum, node/participant ordinal map, algorithm parameters, output checksum, and graph-revision availability; do not add a second PageRank/CheiRank/Louvain/Leiden owner.
- **HGR-NETWORKX-01 partial evidence (2026-10-08):** the existing pytest-style `test_parent_atlas_networkx_pagerank_fixture` was invoked directly under the WSL `atlas-rapids-cu13` interpreter because pytest is not installed. With both local frozen snapshot and `.okf` manifest present, its two read-only executions passed: `NETWORKX_REFERENCE_PROVEN`, normalized nonnegative scores, excluded `SEMANTIC_SIMILAR`, and identical topology/result hashes. No `--build-fixture` flag was used, so the exporter/database path was not entered. This is a binary graph CPU-fixture check only; it does not bind a HyperGraphRAG incidence artifact, participant ordinal map, or graph revision, so the gate remains open.
- **HGR-NETWORKX-01 / HGR-E2E-FIXTURE-01 partial proof (2026-10-08):** root runner `scripts/atlas/prove-hypergraph-networkx-incidence-v1.py` composes the existing external-document chunk bridge, n-ary `build_networkx_projection`, and existing `networkx_pagerank` owner through a request-local adapter. WSL `atlas-rapids-cu13` returned `FIXTURE_PROVEN`; two proposal relations produced six role-bearing incidence edges, zero entity-to-entity edges, stable participant ordinals, normalized nonnegative PageRank scores, stable replay, and matching JSON scratch readback. Latest receipt `.tmp/atlas/hypergraph-networkx-incidence-proof-v1-20261008T204207753885Z.json`; inner receipt checksum `17f065f70ea38cd66e915534959b2e2f17b85cb11cf0976754883aa922cee6d5`, projection checksum `c1afffda90136b2ef1fe7614bac43a083d32fc1d82b22a2113b5108a89bbf929`. `graphRevision=null`, `graphRevisionAvailable=false`, `canonicalAuthority=false`, and `writesPerformed=false` are asserted. Focused proposal/bridge/snapshot tests passed 13/13. This is a normalized external-document fixture, not a live BeautifulSoup fetch, admitted Atlas incidence, full graph-algorithm parity, ACE projection, or GPU execution; those gates remain open.
- **SIMDJSON-HGRAG-01 focused recheck (2026-10-08):** five main-app SvelteKit suites passed 34/34, including the N-ary hypergraph contract, KAG read-only reader, retrieval, grounded-NLP tuple projection, and `simdjson-typed-evidence-bridge`. With `SIMDJSON_REQUIRE_NATIVE=1`, the active main-app bridge loaded `simd-bridge/cpp/build/Release/tensorrt_bridge.node` and its semantic comparison passed. This confirms the checked test path uses the native parser; canonical serializer parity, malformed UTF-8 streaming, JSONL scale, and throughput remain open.
- **HGR-ACE contract recheck (2026-10-08):** five existing SvelteKit suites passed 34/34 across the HyperRAG fusion runtime adapter, AcePacketV3→ContextManifest bridge, ContextManifest admission, ContextManifestV2, and HyperGraph retrieval. They validate the existing consumer contracts only; this fixture has `graphRevision=null` and `PROPOSAL_ONLY`, so it is intentionally not attached to AcePacketV3 or admitted into ContextManifest. Live admitted hypergraph evidence and request-scoped production reachability remain open.
- [x] **HGR-GNN-OWNER-01** Resolve whether “GNN” means deterministic graph analytics or learned message passing. NetworkX provides graph structures/algorithms but no learned GNN layer owner. Keep topology construction separate from PyTorch tensor execution. The finite fixture roster is not “all possible GNNs.”
- [x] **HGR-GNN-COVERAGE-01** Maintain the bounded-operator coverage matrix in `docs/.okf/architecture/domain-classification-and-agentic-retrieval-v1.md`; historical target counts are superseded by the current checked-in roster and this finite roster does not close “all GNN” coverage. `HGT_TYPED_ATTENTION_V1` is a bounded multi-head node-/relation-specific attention layer with input node/edge budgets; it omits full HGT meta-relation parameterization, temporal encoding, scalable HGSampling, and training. `GRAPHORMER_SPATIAL_ATTENTION_V1` implements one bounded single-head layer with degree, shortest-path, and per-hop typed-relation forward/reverse biases; each topology edge must have one relation binding. It still omits the full multi-layer/multi-head architecture and richer path-edge encoding/training. `GRAND_DROP_NODE_AVERAGE_V1` implements bounded seeded DropNode/propagation averaging but not GRAND training or consistency regularization; `GGNN_GRU_PROPAGATION_V1` is a bounded GRU-style propagation layer, not the full Gated Graph Sequence output model; `COMPGCN_MULTIPLICATIVE_V1` is a bounded multiplicative relation-composition/message-aggregation operator, not full CompGCN training or joint relation-embedding updates. `SIGN_CONCAT_V1` is a bounded linear multi-hop concatenation operator, not a full SIGN training/inference stack; `EDGE_CONV_FIXED_GRAPH_V1` uses a frozen adjacency and does not rebuild DGCNN's dynamic k-NN graph; `JKNET_CONCAT_V1`, `JKNET_MAXPOOL_V1`, and `JKNET_LSTM_ATTENTION_V1` cover concatenation, coordinate-wise max, and bounded bidirectional-LSTM attention selectors, respectively, without claiming full training integration. `H2GCN_CHANNEL_CONCAT_V1` is a bounded ego/one-hop/two-hop channel operator; `AGNN_PROPAGATION_V1` is a bounded single cosine-attention propagation layer. For every selected architecture, bind exact operator semantics, input feature/edge schema, model revision, NetworkX topology contract, CPU implementation, GPU executor, parity tolerance, and receipt before marking it supported. Do not invent an unbounded “all models” completion claim.
- **HGR-GNN-COVERAGE-01 evidence (2026-10-08):** added a regression guard requiring the 27 executable `fixture_gnn_models_v1()` operators to equal the `.okf` coverage table. In the existing WSL `atlas-rapids-cu13` environment, the GNN CPU and GPU-preflight unittest suites passed 18/18; the preflight tests verify that a busy llama slot blocks before GPU memory probing and that 4,095 MiB free fails the 4,096-MiB floor before CUDA execution. The root CPU runner passed all 27 fixture operators with independent receipt readback at `.tmp/atlas/networkx-gnn-cpu-fixture-proof-v1-20261008T053554038062Z.json` (`sha256:4c82bcda17f9fbf16579ebff8fb38c8087f48ff6c7df5f72cf24b661466a5fca`). Receipt evidence keeps Parent Atlas canonical payload, ACE Packet V3, ContextManifest V2, and admitted topology coordinates unavailable/null. The result proves the finite fixture CPU roster and documentation alignment only; it does not prove full papers/models, admitted inputs, CUDA parity, or production promotion. No persistent writes occurred.
- **HGR-GNN-COVERAGE-01 count correction (2026-10-08):** the checked-in `.okf` coverage table and executable fixture roster now contain 35 bounded operators, including the ordinal-ordered GraphSAGE LSTM aggregator. Coverage remains finite and non-exhaustive.
- [ ] **HGR-GNN-CPU-01** CPU fixture implementation currently covers thirty-five bounded operators; historical receipts below may cover smaller rosters. Keep this gate open until the root runner/proof passes against a real frozen, revision-qualified incidence/feature artifact; the current receipt is fixture-only and has no admitted Parent Atlas/ACE payload or topology coordinates.
- **2026-10-08 Graphormer relation-path CPU extension:** `GRAPHORMER_SPATIAL_ATTENTION_V1` now requires exactly one relation edge per topology edge and applies checksum-bound per-hop/per-relation forward/reverse bias only when the complete ordinal-sorted shortest path fits the configured cap (maximum 16). Longer paths receive spatial-distance bias only. Focused stdlib tests pass 9/9, including relation-bias sensitivity, direction sensitivity, missing-edge rejection, parameter-shape validation, and node budgets. The root CPU runner passed all 27 operators and independently reopened the receipt at `.tmp/atlas/networkx-gnn-cpu-fixture-proof-v1-20261008T052320853498Z.json` (`sha256:81ba88cb7d98a9ba4317a7ff4a2c755b0d14e86973defe4c9162b809a9e8b087`). The evidence table retains Parent Atlas payload and topology coordinates as unavailable; this remains a bounded one-layer fixture, not full Graphormer or trained/admitted input. GPU parity remains open.
- [ ] **HGR-GNN-RTX-01** CPU/GPU parity runner scaffolded at `scripts/atlas/prove-networkx-gnn-gpu-parity-v1.py`; its no-approval refusal path was verified (`GPU_EXECUTION_NOT_AUTHORIZED`, zero GPU work). Run only after an operator explicitly approves GPU preparation and a fresh preflight reports idle `:8090` slots and at least 4,096 MiB free. Compare all thirty-five current frozen operators on the shared input/ordinal map, record tolerance/device/runtime/readback receipt, and never promote ranking or write live graph/store state. GPU execution and parity remain unproven.
- **2026-10-08 CPU fixture proof refresh:** in the existing WSL `atlas-rapids-cu13` interpreter, focused GNN + GPU-preflight unittests passed 19/19; fixture roster and `.okf` table match all 28 operators. The root CPU runner independently reopened `.tmp/atlas/networkx-gnn-cpu-fixture-proof-v1-20261008T060117635059Z.json` with checksum `sha256:883830218c1d708e4e0ae20077e34ece94f10625227c198c579029fdb7810c50`. The receipt binds the fixture input and operator outputs, while canonical Parent Atlas payload, ACE Packet V3, ContextManifest V2, graph revision, and topology coordinates remain null/unavailable; persistent-store write counts are zero. Fixture-only; no full-paper/trained-model or admitted-cohort claim.
- **2026-10-08 GPU preflight refresh (read-only):** WSL RTX 3060 Ti reports 7,739/8,192 MiB used (453 MiB free, 0% utilization); `127.0.0.1:8090/slots` is unreachable. The configured GPU runner's 4,096-MiB safety floor and live idle-slot check are not satisfied. No model/service was stopped or restarted and no GPU execution occurred; CUDA/cuGraph/cuTile parity remain open.
- **Fresh GPU preflight (read-only):** RTX 3060 Ti reports 7,789/8,192 MiB allocated (236 MiB free, 0% utilization); `127.0.0.1:8090/slots` is unreachable. This is not an eligible runtime; no shutdown/restart or GPU execution was attempted.
- **2026-10-08 CPU architecture expansion and semantic correction:** added `GCNII_LAYER_V1` with a one-layer initial-residual/identity-mapping implementation and direct alpha=1/beta=0 identity control test. Focused GNN + executor tests passed 23/23. Root CPU proof passed all eleven operators and independently reopened `.tmp/atlas/networkx-gnn-cpu-fixture-proof-v1-20261008T040116624817Z.json` (`sha256:0861f3f7d75bb231e8320206058211430026560ff77d18f6c0f857de14b28ade`); producer digest includes fixtures, implementation, and runner. Final GAN fixture validation passed 16/16 at `docs/reports/gan-adversarial-proof-v1-20261008T040135Z.json`. Fixture-only; Parent Atlas canonical payload/topology coordinates remain unavailable, and no GPU or persistent-store writes occurred. The full CPU family inventory remains open.
- **2026-10-08 R-GCN CPU expansion:** added `RGCN_LAYER_V1` to the shared NetworkX/PyTorch CPU/CUDA runner. The fixture now carries directed typed relations; their labels and endpoints are checksum-bound, must correspond to a topology edge, and must match the model's ordered relation-weight schema. Root CPU proof passed all twelve operators with independent receipt readback at `.tmp/atlas/networkx-gnn-cpu-fixture-proof-v1-20261008T041111979431Z.json` (`sha256:c63eb3c2118e96a2c69b6d60eb2d025c69106b09ac18658bd2131dc0cef59815`). Focused direct checks confirmed relation-label sensitivity and rejection of unbound edges; pytest is unavailable in the existing WSL RAPIDS environment. Final GAN validation passed 16/16 at `docs/reports/gan-adversarial-proof-v1-20261008T041242Z.json`. The GPU parity runner automatically includes the new operator but remains unrun pending idle-slot/operator approval. Fixture-only; full CPU family inventory and admitted Parent Atlas input remain open.
- **2026-10-08 PNA CPU expansion:** added `PNA_LAYER_V1` with mean/max/min/population-standard-deviation aggregators and identity/amplification/attenuation degree scalers. Input width and positive finite average-log-degree parameters are validated and model-checksum-bound; isolated candidates produce finite output. CPU proof passed all thirteen architectures with independent readback at `.tmp/atlas/networkx-gnn-cpu-fixture-proof-v1-20261008T041433201930Z.json` (`sha256:3aa756dc819f17f320ed65aae034bd021d57e9b7f3b5c99c425161988363e805`). Direct checks confirmed scaler sensitivity, isolated-node handling, and width rejection. The existing WSL RAPIDS environment has no pytest; no new environment was created. The fresh read-only GPU snapshot is 7,710/8,192 MiB used (0% utilization), so GPU execution remains deferred. Final GAN validation passed 16/16 at `docs/reports/gan-adversarial-proof-v1-20261008T041542Z.json`. PNA semantics reference [Corso et al., 2020](https://arxiv.org/abs/2004.05718). Fixture-only; full CPU family inventory and admitted Parent Atlas input remain open.
- **2026-10-08 GPR-GNN CPU expansion:** added `GPR_GNN_V1`, a bounded normalized-adjacency propagation polynomial over projected node features. Its coefficient vector (2–17 terms) is strictly validated and included in the model checksum. CPU proof passed all fourteen fixture architectures with independent readback at `.tmp/atlas/networkx-gnn-cpu-fixture-proof-v1-20261008T041743703866Z.json` (`sha256:3dc8a6418483b6ad8b7f8d7f93116324a78bbe3321ef3dba227a148f6ccb6c9b`). Fourteen-model repeated-run determinism, PNA edge-order invariance, and the GCNII identity control passed; direct checks confirmed coefficient changes affect outputs/checksums and reject excess propagation depth. The existing WSL environments lack pytest; no new environment was created. GPU execution remains pending an idle device and explicit operator approval. Final GAN validation passed 16/16 at `docs/reports/gan-adversarial-proof-v1-20261008T041840Z.json`. GPR-GNN formulation references [Chien et al., 2021](https://arxiv.org/abs/2006.07988). Fixture-only; this is not a trained/admitted model or real Parent Atlas input.
- **2026-10-08 MixHop CPU expansion:** added `MIXHOP_LAYER_V1` with bounded hop-specific normalized-adjacency channels and independently checksum-bound projection matrices. Root CPU proof passed all fifteen fixture architectures with independent readback at `.tmp/atlas/networkx-gnn-cpu-fixture-proof-v1-20261008T042027634314Z.json` (`sha256:a3edac913c5c1263b726e82552b3ad3f2227f6663db20271009419862e3039d1`). The receipt reports `FIXTURE_PROVEN`, readback `MATCH`, no admitted Parent Atlas payload/topology coordinates, and no writes. Direct checks passed repeated-run determinism, hop-weight/output and model-checksum sensitivity, and rejection beyond the hop bound. Focused pytest tests were not run because pytest is unavailable in the existing WSL environment. Read-only GPU snapshot: 7,717/8,192 MiB used (475 MiB free), below the 4,096 MiB parity threshold; CUDA was not run. Final GAN fixture validation passed 16/16 at `docs/reports/gan-adversarial-proof-v1-20261008T042230Z.json`. MixHop formulation references [Abu-El-Haija et al., 2019](https://arxiv.org/abs/1905.00067). This is fixture operator coverage only, not a trained/admitted model or real Parent Atlas input.
- **2026-10-08 SIGN CPU operator:** added `SIGN_CONCAT_V1`, a bounded shared-normalized-adjacency propagation with separate per-hop transforms concatenated in output space. Channel count is bounded to four propagated hops, every channel matrix is shape-validated and included in the model checksum, and the shared runner supports CPU/CUDA execution paths. Direct checks passed deterministic output, expected concatenated width, channel/output/checksum sensitivity, excessive-hop rejection, and projection-shape rejection. The root CPU proof passed all sixteen operators with independent readback below. Pytest-specific suite remains unavailable in the existing WSL environment. This is a defined SIGN-style operator, not a claim of full published-model training coverage; formulation basis: [Frasca et al., 2020](https://arxiv.org/abs/2004.11198).
- **2026-10-08 pre-EdgeConv WSL CPU replay:** reran `scripts/atlas/prove-networkx-gnn-cpu-v1.py` with the existing `atlas-rapids-cu13` interpreter (Python 3.14.6, NetworkX 3.6.1, PyTorch 2.13.0+cu130). All sixteen operators then in scope completed; independently reopened receipt `.tmp/atlas/networkx-gnn-cpu-fixture-proof-v1-20261008T043810149074Z.json`, checksum `sha256:211a9004e7f6dee872495f56fcbacba340b0fdeba7ee0499e7988e4da8490ce3`. The receipt marks Parent Atlas canonical payload and topology coordinates unavailable and records zero writes. The Windows default Python lacks NetworkX; use the existing WSL environment. This replay does not close `HGR-GNN-CPU-01`.
- **2026-10-08 fixed-topology EdgeConv CPU operator:** added `EDGE_CONV_FIXED_GRAPH_V1`, computing shared messages from `[x_i, x_j-x_i]`, applying ReLU, and max-aggregating fixed NetworkX neighbors; isolated nodes yield finite zero vectors. Input width is validated; the unchanged weight matrix is part of the model checksum. The formulation is EdgeConv-style based on [Wang et al., 2018](https://arxiv.org/abs/1801.07829), but this does not implement DGCNN's dynamic graph rebuilding. Direct checks passed edge-order invariance, isolated-node handling, and invalid-width rejection. Root CPU proof passed all seventeen fixture operators with independent readback at `.tmp/atlas/networkx-gnn-cpu-fixture-proof-v1-20261008T044045516518Z.json` (`sha256:9e1eee49dc7eb45feb600e7efb6388f96cfded768aaea5b59cd51bafe633ed20`). Parent Atlas canonical payload/topology coordinates remain unavailable; no writes occurred. Pytest is unavailable in the existing WSL environment, so the focused pytest suite remains unrun.
- **2026-10-08 fixed-topology EdgeConv CPU operator:** added `EDGE_CONV_FIXED_GRAPH_V1`, computing shared messages from `[x_i, x_j-x_i]`, applying ReLU, and max-aggregating fixed NetworkX neighbors; isolated nodes yield finite zero vectors. Input width is validated; the unchanged weight matrix is part of the model checksum. The formulation is EdgeConv-style based on [Wang et al., 2018](https://arxiv.org/abs/1801.07829), but this does not implement DGCNN's dynamic graph rebuilding. Direct checks passed edge-order invariance, isolated-node handling, and invalid-width rejection. Root CPU proof passed all seventeen fixture operators with independent readback at `.tmp/atlas/networkx-gnn-cpu-fixture-proof-v1-20261008T044045516518Z.json` (`sha256:9e1eee49dc7eb45feb600e7efb6388f96cfded768aaea5b59cd51bafe633ed20`). Parent Atlas canonical payload/topology coordinates remain unavailable; no writes occurred. Pytest is unavailable in the existing WSL environment, so the focused pytest suite remains unrun.
- **2026-10-08 JKNet concatenation CPU operator:** added `JKNET_CONCAT_V1`, a bounded stack of normalized-adjacency graph-convolution layers whose hidden states are concatenated as jumping representations. Layer count and intermediate/output dimensions are validated; layer matrices are included in the model checksum and CPU/CUDA share the same executor branch. Direct checks passed repeatability, concatenated output width, layer-parameter/output/checksum sensitivity, and depth/shape rejection. Root CPU proof passed all eighteen fixture operators with independent readback at `.tmp/atlas/networkx-gnn-cpu-fixture-proof-v1-20261008T044258093162Z.json` (`sha256:1f3deeba14f5a36a66386f42543962ee9bee4b8c7e21b4f7ab86de0877c42994`). This is the concatenation selector only; it does not claim full JKNet family coverage. Parent Atlas payload/topology coordinates remain unavailable; no writes occurred. Formulation basis: [Xu et al., 2018](https://arxiv.org/abs/1806.03536). Pytest remains unavailable in the existing WSL environment.
- **2026-10-08 bounded CompGCN-style CPU operator:** added `COMPGCN_MULTIPLICATIVE_V1`, composing source features with checksum-bound relation embeddings by elementwise multiplication, applying relation-specific projections, mean-aggregating typed incoming messages, and adding a self projection. Directed relation endpoints remain bound to topology edges; iteration order is canonicalized. Direct checks passed relation-edge-order determinism, relation-embedding output/model-checksum sensitivity, and invalid embedding-count rejection. Root CPU proof passed all nineteen fixture operators with independent readback at `.tmp/atlas/networkx-gnn-cpu-fixture-proof-v1-20261008T044647068075Z.json` (`sha256:ae81e2658ed3925a282ea70412abba4b5ffaf2a7470712367dcb59a27f63005f`). This does not claim full CompGCN, training, GPU parity, or admitted Parent Atlas input; payload/topology coordinates remain unavailable and writes were not performed. Formulation reference: [Vashishth et al., 2020](https://arxiv.org/abs/1911.03082). Pytest remains unavailable in the existing WSL environment.
- **2026-10-08 bounded GGNN-style CPU operator:** added `GGNN_GRU_PROPAGATION_V1` with initial feature projection, incoming-neighbor mean aggregation, and a bounded recurrent GRU update using checksum-bound update/reset/candidate matrices (1–5 steps). The shared runner supports CPU/CUDA execution, but no GPU run was performed. Direct checks passed determinism, step-count/output/checksum sensitivity, and step/matrix-count rejection. Root CPU proof passed all twenty fixture operators with independent readback at `.tmp/atlas/networkx-gnn-cpu-fixture-proof-v1-20261008T044847498296Z.json` (`sha256:dee32e619213fa83c5b8fd5b722134e55e0bc1b320dd3284d60231e90b39ea54`). This is a bounded GGNN-style propagation layer, not the sequence-output model or full published architecture. Parent Atlas payload/topology coordinates remain unavailable; no writes occurred. Formulation basis: [Li et al., 2016](https://arxiv.org/abs/1511.05493). Focused pytest remains unrun because pytest is unavailable in the existing WSL environment.
- **2026-10-08 bounded GRAND-style CPU operator:** added `GRAND_DROP_NODE_AVERAGE_V1`: seeded per-sample whole-node DropNode masks, bounded propagation on the self-loop row-normalized adjacency, shared feature projection, and averaging across augmentation samples. Direct checks passed deterministic seed replay, seed/output/checksum sensitivity, and sample/drop-probability bounds. Root CPU proof passed all twenty-one fixture operators with independent readback at `.tmp/atlas/networkx-gnn-cpu-fixture-proof-v1-20261008T045008709603Z.json` (`sha256:290945e70faf2f9da25e119df1a73a5a59b490bf0272117a3a740fb760b19d8d`). This is not GRAND training, its consistency objective, or full benchmark parity. Parent Atlas payload/topology coordinates remain unavailable; no writes occurred. Formulation basis: [Feng et al., 2020](https://arxiv.org/abs/2005.11079). Focused pytest remains unrun because pytest is unavailable in the existing WSL environment.
- **2026-10-08 bounded Graphormer-style CPU operator:** added `GRAPHORMER_SPATIAL_ATTENTION_V1`, one global single-head attention layer with degree embedding and shortest-path distance bias derived from the request-local NetworkX graph. Projections, degree embeddings, spatial-distance biases, and disconnected-node bias are model-checksum-bound. Direct checks passed deterministic replay, topology/bias sensitivity, and invalid projection-shape rejection. Root CPU proof passed all twenty-two fixture operators with independent readback at `.tmp/atlas/networkx-gnn-cpu-fixture-proof-v1-20261008T045159875793Z.json` (`sha256:54f352a3a9042b227678543fae81f2e90fc97fd6f0a60361f97da7fd37b5bd95`). This is not the full multi-layer/multi-head Graphormer and does not implement its edge/path encodings. Parent Atlas payload/topology coordinates remain unavailable; no writes occurred. Formulation basis: [Ying et al., 2021](https://arxiv.org/abs/2106.05234). Focused pytest remains unrun because pytest is unavailable in the existing WSL environment.
- **2026-10-08 bounded HGT-style CPU operator:** added `HGT_TYPED_ATTENTION_V1` with required typed-node inputs, ordered per-node-type query/key/value/output projections, per-relation key/value transforms and per-head attention priors, multi-head per-target incoming-edge softmax, a self-message, and checksum-bound node/edge budgets. Direct checks passed deterministic replay, per-head relation-prior sensitivity, incompatible head-width rejection, node-type schema rejection, Graphormer node-budget cutoff, and invalid HGT budget rejection. Root CPU proof passed all twenty-three fixture operators with independent readback at `.tmp/atlas/networkx-gnn-cpu-fixture-proof-v1-20261008T045809352263Z.json` (`sha256:7e94792de4b33c7a9ebc5106c9c3300d49479f96ac33148e7fec96bb9a290652`). This is not full HGT: meta-relation-specific parameters, relative temporal encoding, HGSampling, and training are not implemented. Parent Atlas payload/topology coordinates remain unavailable; no writes occurred. Formulation basis: [Hu et al., 2020](https://arxiv.org/abs/2003.01332). Focused pytest remains unrun because pytest is unavailable in the existing WSL environment.
- **2026-10-08 stdlib GNN regression suite:** added `python/tests/test_networkx_gnn_reference_unittest.py` so the existing WSL RAPIDS environment can execute contract tests without adding pytest or modifying dependencies. `python -m unittest discover -s python/tests -p "test_networkx_gnn_reference_unittest.py" -v` passed 5/5 tests, including deterministic checks across all 23 fixture operators, strict identity/relation rejection, HGT multi-head and Graphormer budget checks, checksum sensitivity, and ordinal parity validation. Pytest remains unavailable; no environment or package changes were made.
- **2026-10-08 GNN evidence-table receipt refresh:** the CPU proof artifact now embeds explicit status/value rows for Parent Atlas canonical payload, ACE Packet V3, ContextManifest V2, and topology coordinates; unavailable evidence remains `null` with a reason, not inferred from fixture embeddings. The producer digest includes the stdlib test file. Receipt `.tmp/atlas/networkx-gnn-cpu-fixture-proof-v1-20261008T050014168325Z.json` checksum `sha256:0203940514df98a4017202c42c7be59589dafa3f766de9c596769d996e21fad6`; producer revision `sha256:dac5a5e68bd52bae73e6f7bb37dedf433d79b311d772ae91c8948a3fd52ffdbf`. Independent readback matched, `canonicalAuthority=false`, `writesPerformed=false`, and persistent-store write counts are zero. This remains fixture-only and does not close admitted Parent Atlas payload/topology gates.
- **2026-10-08 CPU proof refresh:** in the existing WSL `atlas-rapids-cu13` environment, the focused GNN and GPU-preflight unittest suites passed 16/16, including a newly added guard that the 27 executable fixture operators exactly match the `.okf` coverage table. The root CPU runner independently reopened `.tmp/atlas/networkx-gnn-cpu-fixture-proof-v1-20261008T053554038062Z.json` with checksum `sha256:4c82bcda17f9fbf16579ebff8fb38c8087f48ff6c7df5f72cf24b661466a5fca`. Parent Atlas payload, ACE Packet V3, ContextManifest V2, and admitted topology coordinates remain unavailable/null; this proves only the bounded deterministic CPU fixture roster. CUDA parity, production inputs, and promotion remain open; no persistent writes occurred.
- **2026-10-08 GPU preflight refresh (read-only):** WSL `nvidia-smi` reports RTX 3060 Ti 7,798/8,192 MiB used (394 MiB free, 0% utilization); llama-server `:8090/slots` reports `is_processing=false`. The 4,096-MiB safety floor is not met. No service was stopped/restarted and no GPU work was started; CUDA/cuGraph/cuTile parity remains blocked pending operator-approved graceful GPU preparation and a fresh preflight.
- **2026-10-08 GPU readiness preflight (read-only):** existing `atlas-rapids-cu13` sees an RTX 3060 Ti with 7,747 MiB used and only 278 MiB free, below the parity runner's 4,096 MiB requirement. The read-only `:8090/slots` response reports `is_processing: false`, but memory is insufficient, so no CUDA parity run was started. No model/service was stopped or restarted; await operator-approved GPU preparation and a fresh memory/slot check. `HGR-GNN-RTX-01` remains open.
- **2026-10-08 05:23 UTC GPU recheck (read-only):** RTX 3060 Ti reports 7,770/8,192 MiB used (255 MiB free); `:8090/slots` reports `is_processing: false`. Slot idleness does not override the 4,096 MiB free-memory floor, so GPU execution remains blocked and was not attempted. The parity-runner preflight/refusal unittest suite passes 6/6 in the existing `atlas-rapids-cu13` environment; no service lifecycle action occurred.
- **2026-10-08 final GAN validation after JKNet CPU slice:** `ADVERSARIAL_FIXTURES_PROVEN`, 16/16 probes passed; final receipt `docs/reports/gan-adversarial-proof-v1-20261008T044332Z.json`. This does not prove GPU parity or admitted production graph inputs.
- **2026-10-08 final GAN validation after CompGCN-style CPU slice:** `ADVERSARIAL_FIXTURES_PROVEN`, 16/16 probes passed; final receipt `docs/reports/gan-adversarial-proof-v1-20261008T044728Z.json`. This does not prove GPU parity or admitted production graph inputs.
- [ ] **HGR-RTX-CUGRAPH-01** Treat RTX as hardware and cuGraph/RAPIDS as optional executors. Compare CPU and GPU outputs from the exact same immutable incidence artifact and ordinal map; emit a parity receipt. First prove the configured WSL2 interpreter/runtime and device are reachable; otherwise report `UNAVAILABLE`, not a failed parity or fabricated result. No Graphify/Neo4j writes or ranking promotion.
- [ ] **HGR-SIMT-CUTILE-01** Do not assume a frozen logical candidate/incidence tile already exists. First reconcile the separate `CandidateTileV1` proposal (`CANDIDATE-TILE-01..06` in `openspec/changes/parent-atlas-best-fit-score-fabric/tasks.md`) and the hypergraph participant/incidence manifest (`SIMT-GRAPH-01`) without merging their semantics. After those owners establish a revision-bound input artifact, specify layout, dtype, stride, alignment, and checksum; compare SIMT/cuTile against the CPU oracle and existing CUDA/cuBLASLt path. cuTile remains a benchmarked challenger until correctness and measured lift pass.
- [ ] **HGR-SIMDJSON-01** Extend the existing `ALIGN-XJSON-01` owner and typed evidence bridge rather than creating another parser. On bounded JSONL metadata fixtures, compare standard JSON, simdjson, and Rust simd-json typed values and canonical checksums; keep large numeric arrays on Arrow IPC/mmap and never treat parser success as identity/admission.
- [ ] **HGR-CONTEXT-01** Prove only admitted, revision-qualified facts can feed ACE/ContextManifest and BitFrost descriptors. Proposal-only incidence and accelerator outputs remain diagnostic and non-authoritative.
- [ ] **HGR-E2E-FIXTURE-01** Run the merged external-doc fixture through chunk → grounded fact → hypergraph proposal → request-local incidence → NetworkX oracle → optional accelerator parity → context projection, with independent checksum/readback and zero persistent writes.
- [ ] **HGRAG-OAK-01** Census merged HyperGraphRAG, OaK, Neo4j, and NetworkX owners/callers. Classify each as `CANONICAL_CONTRACT`, `CPU_ORACLE`, `GPU_EXECUTOR`, `NEO4J_PROJECTION`, `HYPERGRAPH_PROJECTION`, `ORCHESTRATION`, or `DEAD_DUPLICATE`; no module deletion from naming similarity alone.
- **HGRAG-OAK-01 partial evidence (2026-10-08):** added root read-only census runner `scripts/atlas/audit-hgrag-oak-owner-map-v1.mjs` / `npm run atlas:hgrag:oak:owners:audit`. It verified 12 curated owner paths and symbol declarations across 6,979 bounded source files, recording file hashes and bounded text references in `.tmp/atlas/hgrag-oak-owner-map-v1.json`. The HyperRagRetriever class has no direct class-name references, but its module is re-exported by two barrels (`ace/index.ts`, `ace/retrieval/index.ts`); construction/runtime invocation is still unproven. All classifications remain `REVIEW_REQUIRED`; the inventory is curated, not exhaustive, text references do not prove runtime registration, and no `DEAD_DUPLICATE` decision or deletion was made. Corrected receipt checksum: `sha256:e70c23c55c63df58579b600c7d0475f751389b0424485054ae86a31a3853107c`. This does not close HGRAG-OAK-01.
- [ ] **HGRAG-OAK-02** Prove `HyperEdgeEvidenceV1`/`NaryFactV1` parity across fact checksum, participant canonical IDs and roles, workspace/source revisions, ontology/producer revisions, evidence refs, and non-authority/no-write flags.
- [x] **HGRAG-OAK-03** Fixture parity proven: TypeScript `GroundedNlpFactV1`, stdlib frozen Python dataclass, and strict OaK Pydantic model preserve fields/JSON/checksum and reject authority escalation. Fresh root receipt `.tmp/atlas/grounded-nlp-dataclass-pydantic-parity-v1.json` has fact checksum `sha256:f73ad01d36af9b997782d51d1321b9c250679a131a6269bac8bbb944609a6f7e`, independent readback `MATCH`, and `canonicalAuthority=false` / `writesPerformed=false`. This does not prove `:8095` runtime binding, fact admission, or HyperGraphRAG incidence parity.
- [ ] **HGRAG-OAK-04** Prove grounded fact → ontology tuple → hyperedge → incidence parity: preserve roles, identity and revisions; reject identity minting; recompute deterministic hyperedge checksum.
- [x] **NETWORKX-RTX-01** Inventory the graph algorithms actually used and classify each as NetworkX CPU supported, `nx-cugraph` supported, or CPU-fallback-required. Do not silently alter algorithm semantics.
- **NETWORKX-RTX-01 evidence (2026-10-08):** Root read-only census `scripts/atlas/audit-networkx-cugraph-capabilities-v1.py` scanned 73 NetworkX API call sites under `python/` and `scripts/atlas/` using the existing WSL `atlas-rapids-cu13` environment (NetworkX 3.6.1, `nx-cugraph` 26.6.0). The receipt `.tmp/atlas/networkx-cugraph-capability-census-v1-20261008T053404280592Z.json` has checksum `sha256:784034b03c10f8485ea7847f843101a95ba3cf008858615e6603e6713bebfe9a` and independently validated readback. `nx-cugraph` metadata declares support for a subset including PageRank, connected components, shortest-path operations, Dijkstra, degree centrality, and NumPy adjacency conversion; the census marks these `NX_CUGRAPH_API_DECLARED_PARITY_UNVERIFIED`. `strongly_connected_components`, `is_directed_acyclic_graph`, `topological_generations`, `topological_sort`, and `is_weighted` are classified CPU-fallback-required for this backend version. Constructors and serialization are separated from algorithm classification. This closes the static inventory only; declared support is not dispatch or semantic parity evidence. No graph/GPU execution or persistent writes occurred. Focused census tests pass 3/3.
- [ ] **NETWORKX-RTX-02** On one identical frozen incidence fixture, compare nodes, incidences, components, BFS distances, PageRank, and supported centrality outputs between NetworkX and `nx-cugraph`/cuGraph with explicit tolerances and a parity receipt.
- [ ] **NETWORKX-RTX-03** Measure persistent conversion separately from execution: create the graph once, reuse the converted backend graph, record conversion time, execution time, peak VRAM, and CPU parity. First verify the WSL2 RAPIDS runtime/device; no live Graphify or datastore writes.
- [ ] **NEO4J-HGRAG-01** Keep Neo4j as a queryable projection unless the owner census proves a true duplicate. Verify participant-role and hyperedge-checksum round-trip with projection-only writes disabled for the fixture proof.
- [ ] **SIMDJSON-HGRAG-01** Compare the current parser and simdjson on a frozen fixture for exact UTF-8 strings, integer/null/boolean/array/object semantics, malformed-input rejection, canonical serialization, and checksum equality.
- **SIMDJSON-HGRAG-01 partial evidence (2026-10-08):** fixed native-addon lookup for package-root execution in `packages/parent-atlas-retrieval/src/gpu/simdjson-bridge.ts`; with `SIMDJSON_REQUIRE_NATIVE=1`, the focused active suite passed 5/5 from `packages/parent-atlas-retrieval`, and the log confirms the root N-API addon loaded. Tests cover UTF-8 byte counts, >1-KiB typed Unicode/object/array/integer/boolean/null semantics against `JSON.parse`, malformed JSON rejection, and equality of test-defined sorted-key canonical JSON SHA-256 checksums with native parsing explicitly asserted. This does **not** yet prove parity with the production canonical serializer/checksum owner, invalid-UTF-8 byte-stream behavior, JSONL streaming, or performance; keep the gate open.
- **SIMDJSON-HGRAG-01 recheck (2026-10-08):** invoked the installed package-local Vitest 2.1.9 binary directly from `packages/parent-atlas-retrieval` with `SIMDJSON_REQUIRE_NATIVE=1`; all 5 focused tests passed and output confirmed `simd-bridge/cpp/build/Release/tensorrt_bridge.node` loaded. The parent npm workspace wrapper refused mixed workspace flags, so it was bypassed without changing configuration. No parser fallback, store writes, or canonical serialization changes occurred; production serializer parity and JSONL streaming remain open.
- [ ] **SIMDJSON-HGRAG-02** Benchmark bounded JSONL streaming with parser reuse; report cold/warm bytes/s, records/s, allocations, peak RSS, failures, and semantic parity. Parser speed cannot confer identity or admission.
- **SIMDJSON-HGRAG-02 partial evidence (2026-10-08):** added `parseNdjsonTypedEvidenceStream` to the existing typed-evidence owner; it incrementally decodes UTF-8 byte chunks, yields validated records immediately, rejects malformed UTF-8, and enforces an 8 MiB default per-record bound. The legacy whole-string API remains unchanged for existing callers. Focused owner Vitest suite passed 8/8 with the native addon required, including checksum parity across split Unicode chunks, malformed-byte rejection, and the line-size bound. The root runner `scripts/atlas/benchmark-simdjson-jsonl-v1.mts` / `npm run atlas:simdjson:jsonl:benchmark` measured the new stream API over 1,024 valid records + one malformed record (1.92 MB); V8, cold native, and warm-cache semantic checksums matched (`a2a0864e2fad108a6a903b1f7542a29abea2bfb176402cb75b3d8d4ce2e5615e`), and each path rejected the malformed row. Measured V8 baseline 42.06 MB/s, cold native bridge 14.26 MB/s, warm LRU replay 26.35 MB/s. Native cold includes the existing simdjson minify + V8 parse + Zod validation boundary and was slower than V8 on this fixture; warm measures cache hits, not parser throughput. Process RSS is sampled and heap deltas reported, but exact allocation counts remain unavailable. Receipt: `.tmp/atlas/simdjson-jsonl-benchmark-v1/receipt-20261008T205140768Z.json`. Keep the gate open for production canonical-serializer parity, allocation measurement, repeated/stable benchmarks, and caller adoption; no persistent writes, authority, or production data use.
- **2026-10-08 ARMA recursive CPU extension:** added `ARMA_RECURSIVE_V1` to the shared NetworkX/PyTorch GNN owner as a bounded single-stack recurrence with checksum-bound recurrent/skip matrices and 1–8 steps. Focused operator tests cover deterministic replay, recurrence sensitivity, parameter checksum binding, invalid dimensions, and bounds. The root CPU proof passed all 29 fixtures with independent readback at `.tmp/atlas/networkx-gnn-cpu-fixture-proof-v1-20261008T060927593554Z.json` (`sha256:17398f030fc93866a8543ea858c68d3cbc11b9bf77829009a231a897bf57b065`). The receipt explicitly leaves canonical payload, ACE Packet V3, ContextManifest V2, graph/workspace revisions, and topology coordinates null/unavailable; persistent writes are zero. This is a fixture operator, not full ARMA training, admitted Atlas topology, or GPU parity. The coverage matrix now has 29 rows; the finite roster remains non-exhaustive. Formulation basis: [Bianchi et al., 2019](https://arxiv.org/abs/1901.01343).
- **2026-10-08 LightGCN CPU extension:** added `LIGHTGCN_PROPAGATION_V1` to the shared NetworkX/PyTorch CPU/CUDA reference as projection-free normalized-adjacency propagation with bounded depth and layer-average output; architecture parameters are checksum-bound and no trainable weights are accepted for this fixture operator. Focused GNN + GPU-preflight unittests passed 21/21 in the existing WSL `atlas-rapids-cu13` environment. The root CPU proof passed all 30 fixtures and independently reopened `.tmp/atlas/networkx-gnn-cpu-fixture-proof-v1-20261008T061159302300Z.json` (`sha256:c2dd818b77c3815c41c4dc323d1ffde7bdd45e9db34807063eab36c09abd6e08`). Parent Atlas canonical payload, ACE Packet V3, ContextManifest V2, graph/workspace revisions, and topology coordinates remain unavailable/null; persistent-store writes are zero. This proves a deterministic CPU fixture and artifact readback only—not admitted Atlas data, trained-model parity, GPU execution, or exhaustive GNN coverage. Formulation basis: [He et al., 2020](https://arxiv.org/abs/2002.02126).
- **2026-10-08 full focused GNN recheck:** existing WSL `atlas-rapids-cu13` stdlib suites passed 24/24 (GNN reference, GPU-preflight refusal/safety, and NetworkX/cuGraph capability audit); existing Windows Python 3.13 pytest suite passed 52/52. The root CPU runner then passed all 30 operators and independently verified its serialized receipt: `.tmp/atlas/networkx-gnn-cpu-fixture-proof-v1-20261008T181914257137Z.json`, checksum `sha256:22c9f8df2e655e45922c33bba0be04528f1e1515e22f6b92993f8b15dcf2bdfc`, `proofLevel=CPU_FIXTURE_ONLY`. Its evidence table explicitly records canonical Parent Atlas payload, ACE Packet V3, ContextManifest V2, and topology coordinates as `null`/unavailable; graph/workspace revisions are unavailable and all five persistent-store write counts are zero. This closes current fixture-test alignment only; it does not establish a live admitted cohort, GPU parity, or all-GNN completeness.
- **2026-10-08 FAGCN CPU expansion:** added `FAGCN_FREQUENCY_ADAPTATION_V1`, implementing the paper's shared signed pairwise self-gate, degree-normalized propagation, epsilon-scaled initial residual, and bounded layer stack in the existing NetworkX/PyTorch CPU/CUDA owner. Gate/projection parameters and depth are checksum-bound; tests cover replay, edge-order invariance, parameter sensitivity, shape and bounds rejection. The pytest operator suite passed 53/53; WSL GNN, GPU-preflight, and cuGraph-capability unittests passed 25/25. Root CPU proof passed all 31 fixtures and independently verified `.tmp/atlas/networkx-gnn-cpu-fixture-proof-v1-20261008T182611969892Z.json` (`sha256:5bb2d9a40c216f33dddd8a04fdc15f27f84ad6406214b5fe3ccd49e811ac6b57`). Parent Atlas payload, ACE Packet V3, ContextManifest V2, graph/workspace revisions, and topology coordinates remain unavailable/null; persistent-store writes are zero. This is fixture-only, not a trained full-paper model, live admitted cohort, GPU parity, or exhaustive coverage. Formulation basis: [Bo et al., 2021](https://arxiv.org/abs/2101.00797).
- **2026-10-08 GatedGCN-style edge-gate CPU expansion:** added `GATED_GCN_EDGE_GATE_V1` to the existing NetworkX/PyTorch executor and the finite `.okf`/fixture roster (32 operators). Each undirected topology edge needs exactly one bounded edge-feature vector bound to endpoint ordinals, source revision, evidence refs, and producer revision; missing/duplicate/orphan bindings reject, and all bindings enter the input checksum. CPU operator tests cover deterministic replay, edge-order invariance, edge-feature sensitivity, lineage/coverage/width rejection, and authority flags. Focused GNN reference, preflight, and cuGraph-audit suites passed 80/80. Root CPU fixture proof passed all 32 operators with independent receipt readback at `.tmp/atlas/networkx-gnn-cpu-fixture-proof-v1-20261008T183150049263Z.json` (`sha256:df8ffb8df31fe518cd17394f06c18dcd03dd85b54efd6431a9e01a44dcf962f7`). Receipt evidence keeps canonical Parent Atlas payload, ACE Packet V3, ContextManifest V2, graph/workspace revisions, and topology coordinates unavailable/null; persistent writes are zero. This is a bounded residual edge-gated operator (fixed edge features; no batch norm or training), not full GatedGCN, admitted Atlas input, GPU parity, or exhaustive coverage. Formulation basis: [Bresson and Laurent, 2017](https://arxiv.org/abs/1711.07553); [Dwivedi et al., 2023](https://www.jmlr.org/papers/v24/22-0567.html).
- **2026-10-08 MoNet-style CPU expansion:** added `MONET_GAUSSIAN_PSEUDOCOORD_V1` to the existing NetworkX/PyTorch operator owner, using the already checksummed, revision/evidence-bound edge feature as pseudo-coordinates. The bounded single-layer operator computes diagonal Gaussian kernel weights and sums kernel-specific transformed neighbor messages; kernel centers, positive variances, and projection matrices are shape/bound validated and model-checksum-bound. It omits learned coordinate transforms, batch normalization, and training and is not a full MoNet reproduction. Focused Windows GNN reference, preflight, and cuGraph-audit suites passed 84/84 after the ECC addition; configured WSL `atlas-rapids-cu13` stdlib GNN suite passed 17/17. The WSL root runner passed all 34 fixtures and independently read back `.tmp/atlas/networkx-gnn-cpu-fixture-proof-v1-20261008T183720726203Z.json` (`sha256:cb5195a2ec7a70c41fedc01cc7ae52358403cfd41a124cc09bf8c9eb2eadff98`). Canonical Parent Atlas payload, ACE Packet V3, ContextManifest V2, graph/workspace revisions, and topology coordinates remain explicitly unavailable/null; writes are zero. This remains fixture-only: no live admitted graph, trained model, GPU parity, or exhaustive-coverage claim. Formulation basis: [Monti et al., 2017](https://arxiv.org/abs/1611.08402).
- **2026-10-08 ECC CPU expansion:** added `ECC_EDGE_CONDITIONED_FILTER_V1`, which generates a bounded edge-specific filter from each revision/evidence-bound edge feature and applies it to the source node before target aggregation. Generator/root matrix shapes and feature width are validated and checksum-bound. Fixture uses symmetric edge attributes over the undirected topology; it is not full ECC training or directed edge-label support. Focused Windows GNN reference, preflight, and cuGraph-audit suites passed 84/84; configured WSL GNN unittests passed 17/17. WSL root proof passed all 34 fixtures with independent receipt readback at `.tmp/atlas/networkx-gnn-cpu-fixture-proof-v1-20261008T183720726203Z.json` (`sha256:cb5195a2ec7a70c41fedc01cc7ae52358403cfd41a124cc09bf8c9eb2eadff98`). Parent Atlas/ACE/ContextManifest payloads and topology coordinates remain unavailable/null; writes are zero. This is a bounded single linear filter-generator fixture, not a trained/full ECC model, admitted input, GPU parity, or exhaustive family coverage. Formulation basis: [Simonovsky and Komodakis, 2017](https://arxiv.org/abs/1704.02901).
- **2026-10-08 GraphSAGE LSTM CPU expansion:** added `SAGE_LSTM_V1` alongside the mean and max-pool variants. It uses checksum-bound LSTM parameters, deterministic ascending-ordinal neighbor order, and a bounded maximum of 256 neighbors; focused WSL GNN unittests passed 18/18. The root CPU runner covered all 35 documented fixtures and independently read back `.tmp/atlas/networkx-gnn-cpu-fixture-proof-v1-20261008T184126157020Z.json` (`sha256:b8995ed436347020d53d904772fcd167234543ecc70ba7bb90e8b0a232f80708`). Parent Atlas payload and topology coordinates remain unavailable, and writes are false. This is a deterministic operator fixture—not full GraphSAGE sampling/training, admitted Atlas data, CUDA parity, or exhaustive GNN coverage. Formulation basis: [Hamilton et al., 2017](https://arxiv.org/abs/1706.02216).
- **2026-10-08 CPU proof refresh:** on the working tree based at `main` commit `10fb9fe68dfef97d758f572c14bae105258d5117`, with local GNN roster/operator edits present, the existing WSL `atlas-rapids-cu13` environment ran the root CPU fixture proof for 35 operators. Receipt `.tmp/atlas/networkx-gnn-cpu-fixture-proof-v1-20261008T185313453275Z.json`, checksum `sha256:bd5e800ed5134bd7e3b0716bd65fcef01f4f85464d3132f07bb05726b91a25cb`, reports `FIXTURE_PROVEN`, independent readback `MATCH`, `writesPerformed=false`, and Parent Atlas payload/topology coordinates unavailable. The selected WSL GNN/preflight/cuGraph-audit unittest suites passed 29/29. A later read-only fetch found remote `main` at `a2690db85577a65a7a3df5e58c9723b95b06e41c`; no merge was performed. This supersedes the older 30-operator receipt for the tested working tree only; it does not prove GPU parity, admitted Atlas topology, or exhaustive model-family coverage.
- **2026-10-08 current-source CPU proof refresh:** using the existing WSL `atlas-rapids-cu13` interpreter, the current working tree passed the root CPU fixture proof for all 35 declared operators. Latest receipt `.tmp/atlas/networkx-gnn-cpu-fixture-proof-v1-20261008T204235192916Z.json` (`sha256:3b1ca872dab895c8a19093ee8d5b85c19851614af218380abcc97939f4493098`) reports `FIXTURE_PROVEN`, independent readback `MATCH`, `writesPerformed=false`, and explicit unavailable Parent Atlas payload/topology coordinates. Focused WSL GNN/preflight/cuGraph-audit unittest suites passed 29/29. This is fixture-only; `HGR-GNN-CPU-01` remains open pending an admitted revision-qualified Atlas input, and GPU/cuGraph/cuTile parity remains unproven.
- **2026-10-08 Windows focused suite refresh:** Python 3.13 pytest passed 86/86 across the GNN reference, GPU-preflight, and NetworkX/cuGraph capability-audit suites against the same current 35-operator working tree. CPU/test evidence only; GPU execution and promotion remain gated.
- **2026-10-08 post-validation refresh:** the existing WSL `atlas-rapids-cu13` root CPU runner again passed all 35 operators with independent readback `MATCH`; receipt `.tmp/atlas/networkx-gnn-cpu-fixture-proof-v1-20261008T190314269443Z.json` (`sha256:238beb1e2bc534c4b0859d70a270b10b878461d6400d87b4506e01621280d8b2`) reports `FIXTURE_PROVEN`, `writesPerformed=false`, and unavailable Parent Atlas payload/topology coordinates. WSL GNN/preflight/cuGraph-audit unittests passed 29/29; Windows Python 3.13 focused pytest passed 86/86. The three current SvelteKit policy/agentic barrier specs passed 15/15 when run from `sveltekit-frontend`; running from repository root also discovered archived `.tmp` copies without generated Svelte configs, so that invocation is not a valid suite result. No GPU or persistent-store work occurred. This is still fixture-only and does not establish admitted graph inputs, accelerator parity, or durable DAG activation.
- **2026-10-08 CPU proof refresh:** reran `scripts/atlas/prove-networkx-gnn-cpu-v1.py` from WSL `atlas-rapids-cu13`; all 35 operators returned `FIXTURE_PROVEN` and independent readback `MATCH`. Receipt `.tmp/atlas/networkx-gnn-cpu-fixture-proof-v1-20261008T195326954789Z.json`, checksum `sha256:b9cb627b5053dac18d5ea2f59db8e0db397ad335b87a8fc55a0832e7ca491531`; `writesPerformed=false`, Parent Atlas payload and admitted topology coordinates unavailable. Focused WSL GNN, GPU-preflight, and cuGraph capability-audit unittests passed 29/29. Four focused SvelteKit barrier/tile/matrix/ACE resolver suites passed 13/13 from the frontend root. This refresh supersedes earlier fixture receipts for this working tree only; real admitted incidence/feature input, GPU parity, and production admission remain open.
- **2026-10-08 fresh CPU-only replay:** the current working tree's existing WSL `atlas-rapids-cu13` environment reran `scripts/atlas/prove-networkx-gnn-cpu-v1.py`; all 35 documented operators completed and independent receipt readback matched. Receipt `.tmp/atlas/networkx-gnn-cpu-fixture-proof-v1-20261008T193436933210Z.json`, checksum `sha256:514cb3202f12f304e05358e30c2f372df6a566fd9175d5344dcbaa07c953689b`, reports `FIXTURE_PROVEN`, `writesPerformed=false`, `canonicalAuthority=false`, and unavailable/null Parent Atlas payload, ACE/ContextManifest, graph/workspace revisions, and topology coordinates. The current WSL stdlib GNN regression suite passed 18/18, including all-fixture determinism, roster/.okf alignment, lineage rejection, and new operator-specific cases. No GPU or persistent-store execution occurred; this does not prove admitted topology, accelerator parity, or exhaustive model-family coverage.
- **Fresh GPU preflight (read-only, 2026-10-08):** `:8090/slots` reports `is_processing=false`, but WSL RTX 3060 Ti has only 155 MiB free of 8,192 MiB. The required 4,096-MiB floor is not met. No GPU work, service stop/restart, or persistent write was attempted; cuGraph/cuTile parity remains blocked pending the documented operator-controlled handoff.
- [ ] **SIMT-GRAPH-01** Bind canonical IDs to dense participant ordinals and hyperedge offsets/role IDs in a revision-qualified manifest; verify checksum before execution and exact ordinal remapping afterward.
- [x] **CUTILE-GRAPH-01** Restrict cuTile to custom dense kernels (feature transforms, reductions, scoring, incidence SpMM-like work, low-rank projections); do not reimplement cuGraph graph algorithms merely to use cuTile.
- **CUTILE-GRAPH-01 evidence (2026-10-08):** documented the owner boundary in `docs/.okf/architecture/domain-classification-and-agentic-retrieval-v1.md`: NetworkX CPU topology/oracle, `nx-cugraph`/cuGraph declared graph-algorithm acceleration with parity still required, PyTorch shared CPU/CUDA learned-GNN tensor path, and cuTile challenger limited to custom dense kernels. Source inspection confirms existing cuTile probes perform vector addition and GEMM, not graph traversal. This closes the architectural ownership rule only; no GPU kernel ran and no tile/incident artifact or parity is proven.
- [ ] **CUTILE-GRAPH-02** After the approved GPU slot is idle and the configured WSL2 environment is reachable, run a deterministic sm86 fixture against CPU/PyTorch reference; record tolerance, correctness, timing, and no-write receipt. Do not contend with Ornith on `:8090`.
- **2026-10-08 HGNN CPU extension:** added `HGNN_INCIDENCE_CONV_V1` to the shared `GnnInputV1` / `run_gnn_v1` owner. NetworkX constructs a bounded bipartite node↔fact incidence topology; PyTorch applies normalized incidence convolution on the shared CPU/CUDA path. The checksummed input binds fact ID, participant ordinal/role, source revision, evidence refs, and producer revision; role is provenance and the kernel uses unweighted membership incidence. Invalid/unmapped participants reject. The finite documented/tested roster is now 28 operators (not exhaustive “all GNN” coverage). Focused GNN + GPU-preflight unittests passed 19/19. Root CPU runner passed all 28 fixtures with independent readback at `.tmp/atlas/networkx-gnn-cpu-fixture-proof-v1-20261008T055350958303Z.json` (`sha256:8932a7029d9352b003b6eab8ecf21bc83dbfba93829ce9a95928e9ec4a244d42`). Fixture only: Parent Atlas canonical payload, ACE/ContextManifest, and admitted topology coordinates remain unavailable; no persistent writes occurred. CUDA parity and admitted-incidence execution remain open.
- **2026-10-08 tile/cuTile alignment audit:** repository search found no admitted `CandidateTileV1` or hypergraph incidence-tile artifact. `CandidateTileV1` is explicitly a proposal with all six gates unchecked in `openspec/changes/parent-atlas-best-fit-score-fabric/tasks.md`; it is a candidate-feature projection and must not be conflated with a participant/incidence graph manifest. The configured `atlas-rapids-cu13` environment has NetworkX 3.6.1 and PyTorch 2.13.0 but no `cuda-tile` distribution; a pre-existing `/home/james/.venvs/atlas-cutile-cu132` reports `cuda-tile` 1.5.0 and PyTorch 2.14.0+cu132. This alternate environment is metadata-only evidence, not an approved executor substitution; GPU work remains bound to the configured RAPIDS environment and its operator-approved preflight. No new environment or package was created and no CUDA/cuTile kernel was run.
- **2026-10-08 H2GCN-style CPU expansion:** added `H2GCN_CHANNEL_CONCAT_V1`, a bounded single-layer feature operator preserving ego, one-hop, and exact two-hop NetworkX neighborhood channels before projection. Its node budget is model-checksum-bound; tests verify channel separation, topology sensitivity, isolated-node behavior, shape/budget rejection, and budget checksum binding. The root CPU runner passed all 24 fixture operators and independently reopened `.tmp/atlas/networkx-gnn-cpu-fixture-proof-v1-20261008T050923952308Z.json` (`sha256:261fcb1d8e64b0aadbf63551873ed95b82a4107593e04643164340fb1163dc23`). The evidence table marks Parent Atlas canonical payload, ACE Packet V3, ContextManifest V2, and topology coordinates unavailable; `canonicalAuthority=false`, `writesPerformed=false`, and persistent-store writes are zero. Focused GNN tests pass 6/6 and GPU preflight tests pass 6/6 in the existing WSL `atlas-rapids-cu13` environment. Latest read-only GPU snapshot: RTX 3060 Ti has 238 MiB free of 8,192 MiB with the `:8090` slot idle; parity remains blocked below the 4,096-MiB safety floor. This is an H2GCN-style single layer, not the full trained paper model. Full family inventory, GPU parity, cuTile, and final GAN validation remain open; no new environment, dependency, or persistent write was created.
- **2026-10-08 AGNN CPU fixture expansion:** added `AGNN_PROPAGATION_V1`, a single masked cosine-attention propagation operator over input hidden states and self plus NetworkX neighbors, without intermediate dense projection. `agnn_beta` is model-checksum-bound in `[0,16]`; tests cover deterministic fixture execution, beta sensitivity, invalid parameter rejection, width mismatch, and isolated-node self behavior. After aligning to the paper’s attention-only propagation layer, focused GNN unittests passed 7/7 and the root CPU runner passed 25 operators with independent readback (`.tmp/atlas/networkx-gnn-cpu-fixture-proof-v1-20261008T051448921638Z.json`, checksum `sha256:2368665d3f89ec83be4069d0d2df63792aee5ccac96ab28dc58af2cdde25f85d`). Parent Atlas payload and topology coordinates remain unavailable; `canonicalAuthority=false`, `writesPerformed=false`, and no persistent writes occurred. This remains an operator fixture, not a trained model, admitted graph, GPU parity result, or feature promotion. Formulation basis: [Thekumparampil et al., 2018](https://arxiv.org/abs/1803.03735). GPU/cuTile parity and final GAN validation remain open.
- **2026-10-08 final GAN refresh:** after the current CPU GNN, OaK, frontend, and bounded-lineage checks, `npx tsx scripts/atlas/prove-gan-adversarial-v1.mts` returned `ADVERSARIAL_FIXTURES_PROVEN` (16/16; authority 7/7, structural lineage 4/4, semantic projection 2/2, runtime side effects 3/3; all self-tests passed). Receipt: `docs/reports/gan-adversarial-proof-v1-20261008T195733Z.json`. This remains adversarial fixture evidence, not live admission or GPU parity.
- **2026-10-08 GPU preflight refresh (read-only):** configured WSL RAPIDS environment reports RTX 3060 Ti 7,913/8,192 MiB used (112 MiB free; 0% utilization); `127.0.0.1:8090/slots` is unreachable. The 4,096-MiB floor and idle-slot endpoint requirements are not met, so no GPU execution or service lifecycle action was attempted. `HGR-GNN-RTX-01`, `HGR-RTX-CUGRAPH-01`, and cuTile parity remain open.
- **2026-10-08 current CPU-only replay:** reran the root GNN fixture proof in the existing WSL `atlas-rapids-cu13` environment; all 35 declared operators completed with `FIXTURE_PROVEN` and independent readback `MATCH`. Receipt `.tmp/atlas/networkx-gnn-cpu-fixture-proof-v1-20261008T205646265235Z.json`, checksum `sha256:db8e2104e73d69bd43e9cc6b0628a49ba3d2b41e199bf40b894ca635b7bf66ee`; `writesPerformed=false`, Parent Atlas payload and admitted topology coordinates unavailable. Focused GNN reference, GPU-preflight safety, and cuGraph capability unittests passed 29/29. GPU parity remains unrun and blocked by the previously recorded VRAM/`:8090/slots` preflight; do not interpret CPU fixtures as GPU or admitted-data proof.
- **2026-10-08 focused integration recheck:** frontend-only Vitest invocations passed 8/8 (incremental simdjson stream), 15/15 (hypergraph compute plan, feature tile, grounded-NLP tuple projection, tuple Postgres adapter, and journal mapping), and 6/6 (CAS plus journal mapping; journal suite intentionally repeated). The stream boundary now recognizes cross-realm `Uint8Array` views rather than relying on realm-sensitive `instanceof`; malformed UTF-8 and over-limit records still fail closed. WSL `atlas-rapids-cu13` ran the two HyperGraphRAG/ontology lineage unittest modules directly (pytest is absent there): 5/5 passed. The root incidence runner returned `FIXTURE_PROVEN`, six participant-incidence edges, zero entity-to-entity edges, deterministic replay and independent JSON readback; receipt `.tmp/atlas/hypergraph-networkx-incidence-proof-v1-20261008T210055199663Z.json`, SHA-256 `a89b2fe872861ad122d3549d356a8fa3d67063e67fc21491e1db98facfec6209`. It asserts `graphRevision=null`, `canonicalAuthority=false`, and `writesPerformed=false`. Running Vitest at repo root is invalid because it discovers archived `.tmp` copies; run from `sveltekit-frontend`. These are fixture/contract checks only; admitted Atlas incidence, live source binding, GPU parity, and production reachability remain open.
- **2026-10-08 final adversarial fixture gate:** `npx tsx scripts/atlas/prove-gan-adversarial-v1.mts` passed 16/16 probes (authority 7/7, structural lineage 4/4, semantic projection 2/2, runtime side effects 3/3); all five harness self-tests passed. Receipt `docs/reports/gan-adversarial-proof-v1-20261008T210226Z.json`. Fixture-only adversarial coverage does not establish live admission, production reachability, or GPU parity.
- **2026-10-08 PR #109 helper validation/alignment audit:** fetched `origin/main` at `24057026c9c1df1973e4732a807810ecd58d8986` without integrating it into the dirty local checkout; PR #109's `a2f6229121a40c0eabf3377aab66c7530d7ccfd4` is an ancestor of that remote head. Extracted only `experiments/atlas-helper-proofs/` to scratch and ran its full unittest discovery in the existing WSL `atlas-rapids-cu13` environment: 83/83 passed. Separately, the canonical app-side `[C,25]` owner and adapter tests passed 11/11 and assert that unavailable observations retain a `presence_mask`. Alignment caveat: experimental `packet_bridge.ordered_features()` instead maps missing entries to `0.0` without carrying a mask; its own test codifies that default. Do not reuse/promote that dense vector as canonical evidence unless missingness is preserved or the input contract proves every feature is present. The separate experimental `cpu_candidate_matrix.py` does preserve a mask. This is not a production bug in the canonical `[C,25]` owner and does not establish matrix caller/admission proof. No source files from the remote experiment were copied or modified; no persistent stores were touched.
- **2026-10-08 post-merge GNN CPU proof refresh:** existing WSL `atlas-rapids-cu13` ran `scripts/atlas/prove-networkx-gnn-cpu-v1.py` over all 35 declared fixtures; result `FIXTURE_PROVEN`, independent readback `MATCH`, receipt `.tmp/atlas/networkx-gnn-cpu-fixture-proof-v1-20261008T211042072100Z.json` (`sha256:271037708151ad40a6ff6bf83f1d03dacc93687e437829dbfae1dd51e6b41978`). Focused GNN reference, GPU-preflight, and cuGraph capability unittests passed 29/29. Parent Atlas payload and admitted topology coordinates remain unavailable; `canonicalAuthority=false`, `writesPerformed=false`. This refresh establishes deterministic CPU fixture execution only; it does not close `HGR-GNN-CPU-01`, prove an admitted incidence/feature artifact, GPU/cuGraph/cuTile parity, or exhaustive GNN-family coverage.
- **2026-10-08 Windows GNN cross-check:** existing Python 3.13 ran the corresponding four focused pytest modules (reference, unittest parity, GPU safety preflight, and cuGraph capability census): 86/86 passed. Together with the WSL root receipt and 29/29 WSL unittests this confirms the bounded 35-fixture CPU implementation across the two configured test environments; it remains fixture-only and does not satisfy the admitted-Atlas-input or accelerator-parity gates.
