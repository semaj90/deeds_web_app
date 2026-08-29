# Tasks — Parent Atlas Candidate Feature Execution Fabric

## P0 — identity and revision closure

- [ ] CAND-01 Define `CanonicalCandidateV1` with CandidateOrdinal + canonicalId + packetKey + treeNodeId + symbolVersionId + revision axes.
- [ ] CAND-02 Add deterministic ordinal-map materializer and rerun determinism fixture twice.
- [ ] CAND-03 Prove Qdrant point id, cuGraph gpuNodeId and CandidateOrdinal cannot substitute for canonicalId.
- [ ] REV-01 Materialize `RevisionDependencyGraphV1` for source → AST → graph/semantic → candidate → feature → rerank artifacts.
- [ ] CACHE-01 Define `ComputationArtifactV1` and content-addressed cache key contract.

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
- [x] REV-OWNER-GRAPH-05G Re-run the post-binding graph-owner and artifact audits: the expected current workspace revision is `sha256:55edaaadab0cef724593287c7c908dad6cdc1b25039a752a6b5dab2c0c44fac9`, but `graph_analysis_runs` remains on `workspace:parent-atlas`, revisionless graph snapshot/relationship tables remain, and the current artifact still has 0 revision-qualified edges. The 111 source bindings therefore do not yet establish a graph-revision owner. See `docs/reports/graph-revision-owner-v1.json`, `docs/reports/current-graph-artifact-readiness-v1.json`, and `docs/reports/graphify-workspace-owner-v1.json`.
- [x] REV-OWNER-GRAPH-05H Run the existing relationship snapshot builder with the current workspace revision and the frozen 15-row candidate snapshot: the revision-bound non-authoritative artifact succeeds with 8 included current Feature Intelligence relationships, 9 entities, 16 incidence edges, deterministic Arrow checksum, and derived `graphRevision=sha256:e6179c52ef51adf1bb0b8fe52bd544646a53aa11c543c3d598b5cb271d5ba275`; 63,397 historical kernels are excluded. This proves the KAG/FI relationship path only, not an AST/Graphify edge owner or full-corpus admission. See `docs/reports/graph-prod-01-production-snapshot-sha256_e6179c52ef51adf1bb0b8fe52bd544646a53aa11c543c3d598b5cb271d5ba275.json`.
- [x] REV-OWNER-CODE-01 Prove the compatibility contract for exact content bytes plus preserved legacy Git `source_revision`.
- [x] REV-OWNER-CODE-01A Freeze `GraphifySourceInventoryWritePlanV1`; it cannot authorize writes or overwrite legacy source-revision semantics.
- [ ] REV-OWNER-CODE-02 Bind one canonical Graphify source-inventory writer and prove a bounded persistence/readback canary.
- [x] REV-OWNER-CODE-02G Audit the existing source-lineage bridge read-only: `atlas_source_refs` contains 22,493 stable identities, but only 6 Graphify refs are registered; packet source binding classifies 17,257 exact, 854 normalized-only, 2,549 ambiguous, and 40,999 unresolved. The workspace-source binding schema is available but has no proven producer/population. See `docs/reports/source-lineage-model-v1.json`, `docs/reports/source-ref-binding-v1.json`, and `docs/reports/live-source-lineage-table-audit.json`.
- [x] REV-OWNER-CODE-02I Validate the source-lineage relation migration in a rollback-only transaction: alias and workspace-binding tables were visible during validation and absent after rollback; durable writes were false. The migration is structurally ready but not applied. See `scripts/atlas/validate-source-lineage-relations-v1.mjs`.
- [x] REV-OWNER-CODE-02J Generate the read-only current Graphify batch plan: 111 sources have exact current source/workspace bindings with zero missing, ambiguous, or revision/content-mismatch rows; no canonical or projection writes were performed. See `docs/reports/current-source-graphify-batch-plan-v1.json`.
- [ ] REV-OWNER-CODE-02K Reconcile the planned current Graphify sources against `atlas_source_refs` before any binding apply: the 111-row exact current Graphify plan has `0/111` exact registry matches, and `atlas_workspace_source_bindings` has a foreign key to the stable source registry. Exact Graphify observation alone is insufficient for durable binding admission.
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

npx tsx scripts/atlas/prove-queue-artifact-lifecycle.mts
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
  proof scripts (`prove-artifact-transport-readiness.mts`,
  `prove-queue-artifact-lifecycle.mts`) that crashed with a SASL auth error before ever querying.
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
npx tsx scripts/atlas/prove-artifact-transport-readiness.mts   # expect ARTIFACT_TRANSPORT_STORE_READY
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
- [ ] Prove the live 8098/cuVS executor ABI and exact semantic parity; fixture ABI success does not imply live GPU execution or ranking promotion. Current 8098 capability probe is blocked because the actual WSL `Ubuntu` distro has system Python only and cannot import `torch`/`cuvs`; no package installation was performed.
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
- [x] REV-OWNER-GRAPH-05AB Audit the current Graphify run owner read-only: the current workspace revision has one `graphify_runs` row, but it remains `RUNNING` with `completed_at = NULL`, and its `workspace_id` has no matching `public.workspaces` row. `source_manifest_digest` and source count are present, but no authoritative completed run exists; graph revision and edge admission remain closed. See `scripts/atlas/audit-current-graphify-run-owner-v1.mjs` and `docs/reports/current-graphify-run-owner-v1.json`.
