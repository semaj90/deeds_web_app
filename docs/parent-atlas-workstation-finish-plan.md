# Parent Atlas workstation finish plan

Updated: 2026-08-17

This document is the integration/closure plan for the workstation. It does not replace the detailed OpenSpec task files. The detailed OpenSpecs remain the source of task-level acceptance criteria; this file defines the shortest dependency order to reach a production-proven Parent Atlas loop without creating duplicate owners.

## Finish definition

Parent Atlas workstation is `DONE` only when one revision-qualified end-to-end path is runtime-proven:

```text
workspace/source revision
  -> daily Graphify
  -> AST + canonical identity + n-ary relations
  -> semantic_768 snapshot + graph projection
  -> promoted PageRank/community/static features
  -> immutable artifacts + receipts + hot references
  -> query intent + SeedSetV1
  -> semantic/lexical/AST/taxonomy seeds
  -> bounded hypergraph/PPR expansion
  -> RankingFeatureVectorV1
  -> CrossEncoder or deterministic fallback
  -> exact evidence promotion
  -> ACEContext -> ContextManifestV1
  -> PrefillPlanV1
  -> DSPy/RLM/model
  -> MCP tool DAG
  -> mutation/test/validator receipt
  -> Kanban/HITL outcome
  -> next Graphify consumes the verified receipt
```

`DONE` does not require every challenger to be promoted. CAGRA, cuGraph, cuTile, TurboVec, SVD, GEPA, and QLoRA may remain challengers if the canonical CPU/Neo4j/Qdrant path is correct, replayable, and measured.

## Ownership freeze

Do not add another truth store or ranking owner.

```text
canonical truth         Postgres + revisioned immutable artifacts
AST / structural facts Graphify structural owner
semantic lane          semantic_768
semantic executors     Qdrant; cuVS exact oracle; CAGRA challenger
structural graph       Neo4j promoted projection; NetworkX oracle; cuGraph challenger
hot residency          Valkey/BitFrost references only
bulk artifacts         Arrow IPC / mmap / binary arrays
query ranking          RankingFeatureAssemblerV1
model context          ContextManifestV1
semantic synthesis     DSPy/RLM/model after promoted evidence
agent-to-tool boundary MCP
human task lifecycle   existing recommendation/TaskPromotionGate/Kanban owners
```

## P0 — reconcile contracts and trackers

- [ ] Update the older OpenSpec checkboxes that still describe pre-reconciliation behavior (especially legacy PageRank resolver ownership, monolithic FeatureRowV1, and old Kanban projection naming).
- [ ] Freeze `CanonicalCandidateV1` and `CandidateOrdinalMapV1`; prove CandidateOrdinal, Qdrant point id, cuGraph gpuNodeId, packet ULID, and canonicalId cannot substitute for one another.
- [ ] Freeze `RevisionDependencyGraphV1` covering source -> AST -> graph/semantic -> candidate -> feature -> rerank -> context -> execution receipt.
- [ ] Freeze deterministic projection identity rules. Qdrant point ids must derive from canonical packet/content/revision identity, never wall-clock time.
- [ ] Mark experimental/dead duplicate PageRank paths compatibility/reference-only; promoted ranking must consume provenance-qualified PageRank evidence only.

### P0 exit gate

`IDENTITY_REVISION_CLOSURE_PROVEN`

Required proof: same frozen input run twice produces the same canonical ids, ordinals, projection ids, dependency hashes, and artifact keys.

## P1 — make Daily Graphify the state compiler

- [ ] Wire the selected AST owner into live `graphify:daily`; no second AST pipeline.
- [ ] Materialize canonical entities, source spans, tree-node/symbol identities, and HyperRelationV1/HyperedgeV1 n-ary facts.
- [ ] Materialize/reconcile OKF domain classifications, concepts, ontology-linked tuples, and taxonomy evidence without allowing KNN/DSPy to create canonical taxonomy truth.
- [ ] Produce a frozen `SemanticSnapshotV1` for canonical `semantic_768` with ordinal map, model/representation revision, source revision, checksum, and Arrow/mmap artifact refs.
- [ ] Produce `GraphProjectionSnapshotV1`/incidence projection from canonical facts.
- [ ] Materialize promoted PageRank and community snapshots with algorithm/projection/run lineage.
- [ ] Materialize `CandidateStaticFeaturesV1` and `CandidateFeatureSnapshotV1` by named fields, not legacy `vector[i]` offsets.
- [ ] Produce `DailySeedSnapshotV1` from changed symbols, failures, concepts, community representatives, high-utility packets, and verified repairs.
- [ ] Emit one content-addressed stage receipt per expensive Graphify stage.

### P1 exit gate

`DAILY_GRAPHIFY_STATE_COMPILER_PROVEN`

Required proof: one real workspace revision runs daily Graphify and every output resolves back to exact canonical source evidence with no degraded identity fallback.

## P2 — artifact cache and mirror closure

- [ ] Implement `ComputationArtifactReceiptV1` persistence in Postgres.
- [ ] Persist large immutable results as Arrow/mmap/binary artifacts; queue/MCP messages carry refs rather than tensors.
- [ ] Add Valkey/BitFrost `cacheKey -> artifactId/artifactRef` hot-pointer adapter with revision/residency metadata.
- [ ] Add single-flight lease/fencing keyed by ActionKey for expensive artifact construction.
- [ ] Prove duplicate command delivery returns the existing immutable artifact/receipt.
- [ ] Fix ACE Qdrant materialization to use deterministic revision-qualified point ids and readback verification.
- [ ] Implement real TurboVec materialize/status adapter or leave TurboVec explicitly `NOT_WIRED`; do not report pretend success.
- [ ] Add content-addressed PageRank/PPR/community/CrossEncoder result artifacts so unrelated revision changes do not invalidate them.
- [ ] Add cache hit/miss/reuse/bytes/residency telemetry to Graphify receipts.

### P2 exit gate

`ARTIFACT_CACHE_MIRROR_PROVEN`

Required proof: replaying unchanged input performs no expensive recomputation, changing one source invalidates only its true downstream dependencies, and all mirrors round-trip to canonical identity.

## P3 — prove the executor matrix

- [ ] Keep relational/tabular snapshot work behind DuckDB/Polars CPU reference; add cuDF only after same-snapshot parity/benchmark.
- [ ] Keep graph topology behind Neo4j promoted runs, NetworkX oracle, cuGraph challenger.
- [ ] Run PageRank parity on the same frozen projection and promote only provenance-qualified output.
- [ ] Run Louvain/Leiden Neo4j-vs-cuGraph partition parity using ARI/NMI/pairwise agreement/modularity receipts; compare membership, never numeric community ids.
- [ ] Use cuVS exact as the semantic nearest-neighbor correctness oracle against the same `semantic_768` snapshot.
- [ ] Keep CAGRA quarantined until same-corpus recall/identity/latency/VRAM gates pass.
- [ ] Keep PyTorch CPU as tensor/SVD reference; CUDA/cuTile are accelerators only after numerical parity.

### P3 exit gate

`EXECUTOR_PARITY_PROVEN`

Required proof: every promoted challenger consumes the same frozen artifact, preserves canonical identity, and has an explicit parity receipt. Executor count must never inflate logical retrieval-lane votes.

## P4 — finish the query SeedSet and prefill path

- [ ] Define `QueryIntentV1` from bounded lexical/domain/intent classification.
- [ ] Define `SeedSetV1` with request/workspace/graph/semantic revisions, canonical ids, packet/source refs, evidence refs, originating lane, scores, and deterministic seed-set hash.
- [ ] Normalize Qdrant/cuVS/CAGRA outputs to one semantic lane and CandidateOrdinal before fusion.
- [ ] Add semantic entity and semantic hyperrelation retrieval as separate artifact kinds under the same `semantic_768` representation family.
- [ ] Use bounded HyperGraph retrieval over incidence projection; never synthesize pairwise canonical facts from an n-ary relation.
- [ ] Add query-specific PPR/community/taxonomy/KAG expansion as overlays, not persistent packet features.
- [ ] Assemble `QueryCandidateFeaturesV1` and `RankingFeatureVectorV1`; operational residency/VRAM fields remain outside ranking truth.
- [ ] Define `RerankDocumentV1`; score/calibrate CrossEncoder results and cache raw scores independently of calibration.
- [ ] Implement exact promotion to source span + AST path + graph/hyperrelation evidence + revision lineage; reject unresolved/degraded identity.
- [ ] Define `PrefillPlanV1` with explicit LOD/budget transitions and artifact refs.

### P4 exit gate

`QUERY_TO_PROMOTED_EVIDENCE_PROVEN`

Required proof: a real query returns promoted evidence with one semantic vote, bounded expansion, exact source round-trip, deterministic cache keys, and a recorded fallback when GPU/reranker capacity is unavailable.

## P5 — ACE and MCP closure

- [ ] Add one adapter from promoted retrieval/hypergraph evidence into the existing ACEContext fields; ACE must not re-run retrieval.
- [ ] Adopt `ContextManifestV1` as the sole model/DSPy/RLM evidence boundary.
- [ ] Define explicit packet identity semantics: `packet_key` logical identity, `packet_ulid` materialization/event identity, canonicalId/symbolVersionId entity identity, Qdrant point id projection identity only.
- [ ] Define `AtlasWorkFrameV1`/route mask only as local control metadata; MessagePack may encode work/control payloads, while Arrow/mmap/device buffers own bulk data.
- [ ] Audit the MCP server/client for the 2026-07-28 stateless protocol: self-contained calls, explicit request/artifact handles, protocol/version metadata, header routing where HTTP is used, and no Parent Atlas state hidden in MCP transport sessions.
- [ ] Expose narrow MCP tools/resources around existing state machines: resolve seeds, expand hypergraph, read promoted evidence, run validator/test, apply approved patch, read receipt.
- [ ] MCP results return artifact/evidence/receipt refs by default; bounded inline content is an optimization, never the canonical store.

### P5 exit gate

`CONTEXT_MCP_BOUNDARY_PROVEN`

Required proof: a fresh process can execute a self-contained request from ContextManifest through MCP tools using explicit handles only; reconnect/retry does not lose Parent Atlas state.

## P6 — grounded mutation, validators, receipts, Kanban

- [ ] Build/finish the deterministic candidate DAG from promoted ContextManifest evidence.
- [ ] Require permission/promotion gate before mutation.
- [ ] Execute one approved patch through the real worker/tool path.
- [ ] Run targeted tests, typecheck, regression checks, evidence checks, and minimality checks.
- [ ] Persist immutable `ExecutionReceiptV1`/workflow action events with inputs, outputs, tool/model revisions, mutations, validations, timings, and failure evidence.
- [ ] Project recommendations into the existing Kanban lifecycle; the view must not own approval state.
- [ ] Record approve/reject/request-changes as append-only review events.
- [ ] Materialize validated Engram/cache candidates only from exact/verified evidence and receipts.
- [ ] Feed verified outcome refs into the next Daily Graphify revision.

### P6 exit gate

`GROUNDED_AGENT_LOOP_PROVEN`

Required proof: recommendation -> human approval -> patch -> tests -> receipt -> Kanban outcome -> next Graphify, with rollback/replay evidence and no hidden mutation path.

## P7 — memory/LOD and workstation resource proof

- [ ] Implement measured COLD/WARM/HOT residency transitions using artifact refs, not canonical copies.
- [ ] Keep LOD-0 identity/checksums, LOD-1 routing/taxonomy/cache hints, LOD-2 cheap semantic projections, LOD-3 semantic_768, LOD-4 AST/hypergraph, LOD-5 exact evidence, LOD-6 model context.
- [ ] Measure canonical FP32 snapshot bytes, compressed/TurboVec bytes if used, process RSS, mmap resident pages, Valkey/Qdrant memory, and GPU VRAM separately.
- [ ] Prove no hidden full-precision duplicate invalidates the compression/working-set claim.
- [ ] Add load/unload/promotion receipts and deterministic fallback when VRAM is exhausted.
- [ ] Benchmark cuTile/CUDA feature-matrix/SVD/GEMM paths only after CPU parity; no JSON enters GPU kernels.

### P7 exit gates

- `LOD_MEMORY_COMPRESSION_PROVEN`
- `LOD_PROCESS_WORKING_SET_PROVEN`
- `VRAM_FALLBACK_PROVEN`

## P8 — evaluation and learning closure

- [ ] Freeze repair/localization train/validation/test IDs from verified historical receipts.
- [ ] Repair CrossEncoder benchmark inputs/metrics and run all challengers against the same frozen candidate sets.
- [ ] Run DSPy through a sidecar/RPC boundary that accepts promoted ContextManifest evidence only; reject invented evidence refs.
- [ ] Separate `RepairQualityMetricV1` from `SystemCostMetricV1`; failed correctness/permission/regression gates force optimization score to zero.
- [ ] Run GEPA baseline -> optimized comparison on train/validation only; persist program artifacts and per-example receipts.
- [ ] Evaluate a promoted GEPA candidate exactly once on held-out test data.
- [ ] Mine verified hard negatives and train a CrossEncoder challenger only after the frozen eval path is proven.
- [ ] QLoRA/adapter training remains last: verified corpus, fixed base-model revision, held-out evaluation, training receipt, route-map delta, and rollback required.

### P8 exit gate

`VERIFIED_LEARNING_LOOP_PROVEN`

Learning must improve held-out execution/retrieval outcomes without weakening correctness or permission gates.

## P9 — release/merge gate

- [ ] Run focused Vitest/Pytest contract suites for every new branch-owned contract.
- [ ] Run targeted TypeScript checks for Parent Atlas/ACE/queue/retrieval/graph surfaces.
- [ ] Run one real Daily Graphify smoke and capture its receipt.
- [ ] Run one real query-to-ContextManifest smoke.
- [ ] Run one approved patch-to-ExecutionReceipt smoke.
- [ ] Re-run the same request after restart and prove deterministic identity/cache/replay behavior.
- [ ] Prove degraded/unavailable sidecars fail closed or use the explicitly authorized deterministic fallback.
- [ ] Reconcile all OpenSpec checkboxes with recorded proof; `CREATED` is not `WIRED`, and `WIRED` is not `PROVEN`.
- [ ] Only then merge the integration branch to `main`.

### Final release gate

`PARENT_ATLAS_WORKSTATION_PROVEN`

Minimum receipt bundle:

```text
GraphifyReceiptV1
SemanticSnapshotReceiptV1
GraphProjectionReceiptV1
PageRankPromotionReceiptV1
CommunityParity/PromotionReceiptV1
ArtifactCacheReceiptV1
SeedSetReceiptV1
RetrievalPromotionReceiptV1
ContextManifestReceiptV1
ExecutionReceiptV1
ValidationReceiptV1
HumanReviewEventV1
ReplayReceiptV1
Resource/VRAMReceiptV1
```

## Critical path summary

```text
P0 identity/revisions
  -> P1 Daily Graphify state compiler
  -> P2 immutable artifacts/cache/mirrors
  -> P3 executor parity
  -> P4 SeedSet/query/exact promotion
  -> P5 ACE + stateless MCP boundary
  -> P6 grounded mutation + receipts + Kanban
  -> P7 measured LOD/resource behavior
  -> P8 frozen eval/learning
  -> P9 replay/release/merge
```

Do not block the canonical workstation release on optional acceleration. The canonical CPU/Neo4j/Qdrant/Postgres path should be able to pass P0-P6 and the required P7 fallback/resource gates without CAGRA/cuGraph/cuTile/TurboVec/GEPA/QLoRA promotion. Those components become eligible when their parity and measured-benefit receipts pass.
