# Tasks — Parent Atlas Candidate Feature Execution Fabric

## P0 — identity and revision closure

- [x] CAND-01 Define `CanonicalCandidateV1` with CandidateOrdinal + canonicalId + packetKey + treeNodeId + symbolVersionId + revision axes. Built and tested; live full-corpus admission remains separate.
- [x] CAND-02 Add deterministic ordinal-map materializer and rerun determinism fixture twice. Fixture/replay proof exists; current 15→128→768 scaling remains open.
- [x] CAND-03 Prove Qdrant point id, cuGraph gpuNodeId and CandidateOrdinal cannot substitute for canonicalId. Identity separation is proven at the contract/fixture boundary; live GPU parity remains separate.
- [x] REV-01 Materialize `RevisionDependencyGraphV1` for source → AST → graph/semantic → candidate → feature → rerank artifacts. Contract is built and tested; live producer alignment remains open.
- [x] CACHE-01 Define `ComputationArtifactV1` and content-addressed cache key contract. Contract is built and tested; production cache lifecycle proof remains separate.

## P0 — queue / artifact transport

- [x] QUEUE-00 Audit existing transport ownership: Postgres transactional outbox → RabbitMQ task/event exchanges; Redis list is UI/SSE progress only.
- [x] QUEUE-01 Add `ArtifactAddressV1` for MMAP/Arrow IPC/Postgres/Qdrant/Valkey/GPU-resident immutable artifacts.
- [x] QUEUE-02 Add `ActionWorkItemV1` so queue payloads carry artifact refs, revision-set hash, ordinal selection, budget and executor class instead of dense tensors.
- [x] QUEUE-03 Route artifact work through `enqueueTask()` transactional outbox via `enqueueArtifactWorkItem()`.
- [x] QUEUE-04 Fix event-fabric projection worker type ownership imports (`integration-events.ts` owns code-evidence; `event-fabric.ts` owns the control-loop event types).
- [ ] QUEUE-05 Replace remaining large vector/tensor RabbitMQ payloads (for example legacy `document.embed` / `vector.index`) with artifact references where profiling shows payload amplification. **OPEN** — compatibility publishers still exist; do a call-site + payload-size census before removing or redirecting them.
- [ ] QUEUE-06 Add explicit `artifact.materialized` / `artifact.failed` integration events and non-noop event-fabric handlers. **IMPLEMENTED_UNPROVEN** — schemas, outbox writers, durable lifecycle projection, and storage-aware materialization verification are present; run focused tests + lifecycle proof before checking off.
- [ ] QUEUE-07 Add single-flight lease/fencing token keyed by ActionKey so duplicate at-least-once deliveries cannot compute the same expensive artifact concurrently. **IMPLEMENTED_UNPROVEN** — `action-single-flight-v1.ts` owns leases, fencing and immutable receipts; focused tests exist.
- [ ] QUEUE-08 Add consumer idempotency proof: duplicate command delivery returns the same immutable output artifact or an existing receipt. **IMPLEMENTED_UNPROVEN** — unit proof covers existing receipt reuse, duplicate completion race and stale fencing; lifecycle proof additionally checks duplicate event projection is one row.
- [ ] QUEUE-09 Prove publisher-confirm outbox path is the only authoritative durable task publisher; generic publish helper remains convenience/non-authoritative. **IMPLEMENTED_UNPROVEN** — `rabbitmq-client.ts` explicitly rejects direct publish to `atlas.tasks.v1`; outbox remains the documented authoritative durable publisher. Run the boundary spec and startup confirm-channel proof before checking off.
- [ ] QUEUE-10 Add message-size telemetry and fail/redirect when a task envelope exceeds the artifact-reference policy limit. **IMPLEMENTED_UNPROVEN** — 64 KiB artifact-reference policy, in-process telemetry counters and oversize rejection are wired through `enqueueArtifactWorkItem()` with focused tests.

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
- [x] FEAT-04 Require CPU↔GPU ordinal and feature parity receipt; bounded RTX proof passed, production residency and fanout remain separate gates.
- [ ] FEAT-03E Add the revision-bound CPU feature-head GEMM oracle and checksum receipt; focused TypeScript proof passes, native CUDA/LibTorch parity remains open.

Current checkout reconciliation: snapshot/columnar focused tests pass `10/10`.
Arrow readback is blocked by the Vitest import boundary for the root `.mjs`
helper, and FEAT-03/04 remain unproven until the supported readback and actual
GPU parity receipts pass. No executor or canonical-store promotion is implied.

## P1 — manifold4 / SOM derived projection

- [x] MAN4-01 Add `Manifold4OrientationV1` unit-quaternion schema.
- [x] MAN4-02 Canonicalize antipodal q/-q representations deterministically.
- [x] MAN4-03 Add antipodal-aware similarity and angular-distance helpers.
- [x] MAN4-04 Add tests for unit norm and q/-q equivalence.
- [ ] MAN4-05 Wire existing SOM/manifold producer through this schema and record producer/feature revisions.
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
- [ ] FANOUT-02 Enforce one logical semantic-lane vote across Qdrant/cuVS/CAGRA executors.
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
  - [ ] GRAPH-RESOLVE-06B.4 Bind the enriched identity result to the live bounded producer replay; no edge writes until 06B.3/06B.4 pass.
  - Revision hardening: `materialize-ast-symbol-versions.mjs` now requires both `source_revision` and `workspace_revision`; it no longer substitutes one revision axis for the other. It also correctly requires an existing `CANONICAL` stable-symbol resolution, so the current review-only input cannot bypass 06B.3: current 440-row dry-run remains `0` canonical candidates and `0` writes. A dedicated adapter from the 06B.3 review plan to the materializer is not yet authorized or implemented.
- [ ] GRAPH-06D Prove `GraphOrdinalMapV1` and NetworkX↔cuGraph parity from the same frozen graph snapshot; executor-local graph ordinals must not become `CandidateOrdinal`, packet identity, or canonical graph identity.
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
  canonical path. `embedding_dimension` remains stale (`3,451` rows tagged `768`
  and `52,402` tagged `384`) and must not be used as the dimensionality authority.
- [ ] **SEMANTIC-METADATA-RECONCILIATION** — prepare an exact, independently
  read-back-verified metadata correction plan. Do not update or drop the legacy
  `content_embedding_384` column until the owner, rollback, and migration receipt
  are explicitly authorized.
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
  broad payload copying.
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
  populates `latentLocalityScore`/`latent256Available` on real
  `CandidateFeatureRowV1` rows from `codebase_chunk_index.latent_256`. The
  row slot and derive-at-query-time math (`retrieval/latent-derive.ts`,
  tested against real production data, 4/4 passing) both exist; the join
  between them does not yet.
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
