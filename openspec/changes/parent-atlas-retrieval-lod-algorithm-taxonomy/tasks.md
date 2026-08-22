# Tasks: parent-atlas-retrieval-lod-algorithm-taxonomy

## T1 — Taxonomy authored (this session)

- [x] Write `README.md` + `proposal.md`: 12-domain classification, three-engine substrate
      restatement, honest per-domain status against the live `src/lib/server/retrieval/` tree
      (198 files inventoried via `Glob`), explicit cross-links to the 3 sibling changes that already
      own adjacent concerns (fusion census, OKF layering, graph identity).
- [x] Confirm no duplication: read `parent-atlas-okf-knowledge-layers/proposal.md` (status
      vocabulary source) and `parent-atlas-graph-retrieval-proof/proposal.md` (identity-split
      blocker source) before writing, instead of re-deriving either.
- [ ] Cross-link this change from the 3 siblings' README files (one line each, "see also"). Not yet
      done — do this before considering T1 fully closed.

## T2 — Domain 10 (evaluation harness) — the one domain safe to start now

Everything else in the taxonomy is blocked on work already in-flight in sibling changes. Domain 10
is not — it can be built against the *current* CPU fusion pipeline and gives RF6 (fusion-owner
convergence) a regression harness to converge against, which RF6 doesn't currently have.

- [ ] Reachability check first: confirm no existing Recall@k/NDCG/MRR harness is already live and
      just unwired (do not assume `MISSING` from a single `Glob` pass — grep test fixtures and
      `scripts/atlas/*eval*` too before building).
- [ ] If genuinely missing: scope a minimal harness — fixed query set with known-good top-k
      (hand-labeled or derived from the live entity trace already done in
      `parent-atlas-retrieval-fusion-reachability`), compute Recall@k / NDCG / MRR against
      `SearchRuntime`'s current output.
- [ ] Do not wire this into CI or a build gate yet — first pass is a standalone script, matching
      this repo's `DRY_RUN_PROVEN` before `APPLY_PROVEN` status discipline.

## T3 — Domains 1–5 architecture change

**2026-08-08 update**: T3's "blocked until RF6" gate was overridden by explicit user direction
("three-engine substrate wiring"), scoped narrowly to the canonical spine only — see the
"2026-08-08 addendum" in `proposal.md` for the full disclosed-deviation writeup. Domain 1
(candidate fusion) remains untouched and still blocked on RF6 as originally planned — only domains
3/4/5 moved.

- [x] Domain 4 (`feature-matrix.ts`): built narrower than originally designed — a batched
      Postgres authority lookup (`fetchAuthorityScores`, `resolveAuthorityScore`), not a full N×F
      matrix builder. 8 tests passing.
- [x] Domain 5: **did not** create `packet-ranker.ts`. Found `runtime-reranker.ts::blendScores()`
      already correctly implements `S = X·W`-shaped weighted scoring — reused it instead of
      duplicating it (avoids repeating the Domain 1 13-owner anti-pattern one level down). Fixed
      the real bug found while wiring: `pagerankScore` + `graphScore` were both silently dropped
      before reaching this function (~15% of total blend weight always inert). See
      `search-runtime.ts` Score-stage diff.
- [x] Domain 3 upgraded incidentally: `atlas_graph_authority_scores` (confirmed live, 50,164 rows)
      is now a real feature input. **Confirmed via live query, not assumed**: the newer-looking
      Drizzle-typed `atlas_graph_authority_scores_v2` table is 0 rows — do not join against it.
- [ ] Domain 1 (candidate fusion, 13-owner consolidation) — still untouched, still RF6's job.
- [ ] Full N×F feature-matrix object (beyond the single authority column added here) — still
      future work, not done in this pass.

## T4 — Domains 2–3 (graph traversal + structural features) — blocked

Blocked on `parent-atlas-graph-retrieval-proof`'s `symbol_id`/`symbol_version_id`/`tree_node_id`
identity split landing (graph snapshot promotion is explicitly blocked there until that split is
proven). Do not design `graph-expand.ts` or `graph-authority-features.ts` before that lands — any
API surface designed against unstable identity will need to change anyway.

## T5 — Domains 6–9 (vector/ANN, quantization, storage residency) — blocked, GPU-adjacent

Explicitly deferred per standing session instruction: no CAGRA/cuVS/cuGraph/CUDA-GEMM/quantized-LOD
work until the identity/fusion foundation (RF4–RF6) is proven. When that gate opens:

- [ ] Domain 6 first (cuVS exact-brute-force oracle vs. Qdrant, recall parity gate) — this repo's
      own stated rule: "Recall@k(kANN) / k(kExact) until that passes your gate, don't replace
      Qdrant" — cuVS stays an oracle/experiment lane, not a replacement, until proven.
- [ ] Domain 8 (quantization) requires *measuring* `effective_rank`, `singular_value_decay`,
      `condition_number` on the actual `latent_128` data before assuming low-rank structure exists
      — do not default to INT4 packing on faith.
- [ ] Domain 9 (storage residency) follows domain 8, not before.

## T6 — Domains 11–12 (temporal coherence, learned promotion) — not investigated, do not design yet

Both are genuinely new capability, not renames of existing code. Before any design work:

- [ ] Domain 11 needs its own reachability pass over `context-buffer.ts` and ACE session state to
      establish what temporal state already exists, before proposing new state to carry forward.
- [ ] Domain 12 (execution-feedback-driven promotion) needs domains 1–5 and 10 solid first — there
      is no signal to learn promotion *from* until a stable ranker and an evaluation harness exist.

## T7 — Rust SIMD/TurboVec and bounded LOD residency — audit before integration

Repository audit (2026-08-14): Rust `simd-json` exists at
`simd-bridge/rust-simdjson` as an N-API library with Rayon; Rust TurboVec
bindings exist at `crates/turbovec-napi` and already depend on the local
TurboVec crate plus `simd-json`; the reachable TurboVec HTTP sidecar is
`scripts/ingest/turbovec-sidecar.py` on `:8791` and currently keeps its NumPy
vectors/index in process memory. `scripts/sidecars/turbovec-grpc-bridge.mjs`
is a compatibility bridge over that Python owner, not a proven Rust ANN
service. No 4 GB resident-working-set proof exists yet.

- [ ] **LOD-01** Produce a read-only memory census with separate measurements for canonical FP32 bytes, Python/NumPy RSS, Rust N-API RSS if built, Arrow/mmap virtual size, Arrow/mmap resident set, Qdrant memory, Valkey memory, GPU VRAM, index metadata, and ordinal-map size. Do not claim a 4 GB target until hidden FP32 duplicates are accounted for.
- [ ] **LOD-02** Freeze `SemanticSnapshotV1` plus ordinal/canonical identity mapping as the immutable source: workspace/source/representation/ordinal-map revisions, rows, dimension 768, float32, normalization, ordinal, `packet_key`, optional `symbol_version_id`, and checksum. LOD transitions may evict/reload derived indexes but may not delete or rewrite canonical truth. Prefer Arrow IPC/mmap for direct tensor access; do not substitute Parquet where direct mmap is required.
- [ ] **LOD-03** Define HOT/WARM/COLD artifacts: hot query/index pages, warm mmap/Arrow vectors and routing metadata, cold Postgres/source/Qdrant reconstruction. Every artifact must carry workspace, representation, source, and ordinal-map revisions.
- [ ] **LOD-04** Evaluate paged/mmap or shard-local TurboVec residency against the current in-memory Python sidecar. A 4 GB working-set target is accepted only with measured recall, latency, rebuild, and RSS evidence.
- [ ] **LOD-05** Choose one TurboVec execution owner and primary transport: existing Python `:8791`, Rust N-API, or an isolated Rust sidecar. Classify all other paths (gRPC bridge, CLI spawn, alternate HTTP) as compatibility, deprecated, or rollback; do not leave multiple live owners.
- [ ] **LOD-06** Benchmark Rust `simd-json` only for metadata/JSONL control paths such as snapshot manifests and receipts; never hex-encode or JSON-serialize the float32 vector bulk path.
- [ ] **LOD-07** Prove fail-open tier swaps: stale/missing hot state falls back to warm mmap/Qdrant; missing warm artifacts reconstruct from canonical sources; no cache/index artifact becomes identity truth.
- [ ] **LOD-08** Emit an immutable LOD receipt with tier, revision, artifact checksum, resident bytes, peak RSS, cache hit/miss, recall, latency, and fallback reason.

- [ ] **LOD-MEMORY-COMPRESSION-PROVEN** Report raw FP32 bytes versus compressed TurboVec bytes and ratio for the same snapshot.
- [ ] **LOD-PROCESS-WORKING-SET-PROVEN** Separately prove steady-state RSS, hidden FP32 duplicate absence, mmap resident bounds, index reload, and fallback behavior.

The proposed Neo4j GDS Python sidecar on `:8099` is also a future executor
boundary, not a currently proven listener. If implemented, it should compute
revision-qualified graph features from Neo4j GDS and return compact derived
features; it must not become a second graph or retrieval owner.

### TurboVec LOD refinement — 2026-08-14

The 31–32 GB to approximately 4 GB target is a quantization hypothesis, not
an mmap or swap result. TurboVec/TurboQuant may reduce the vector coordinate
representation; Arrow/mmap avoids eagerly copying the full-precision backing
store; simd-json only accelerates control-plane parsing. These are separate
measurements.

Keep residency and representation orthogonal. `COLD`, `WARM`, and `HOT`
describe where an artifact is resident; `FP32_MMAP`, `TURBO_4BIT`, `FP16`,
and similar values describe fidelity/encoding. They are not one combined
state and may evolve independently.

```text
COLD / FP32_MMAP    immutable Arrow IPC/mmap rebuild source
WARM / TURBO_2BIT   compressed candidate generator (later experiment)
WARM / TURBO_4BIT   first compressed candidate-generator target
HOT / FP16          selected high-fidelity RAM/GPU working set
HOT / FP32          exact or precision rerank working set
```

TurboVec local IDs remain ordinals. The ordinal map resolves them to
`packet_key`, `symbol_version_id`, and source/revision fields. The compressed
representation never replaces canonical `semantic_768`.

- [ ] **TV-LOD-01** Build a frozen `semantic_768` corpus from `SemanticSnapshotV1`; verify checksum, cosine metric, float32 source, and ordinal-map revision.
- [ ] **TV-LOD-02** Compare TurboVec 4-bit against exact cuVS on the same corpus: Recall@10/@50, top-1 agreement, identity parity, latency, RSS, and index size.
- [ ] **TV-LOD-03** Compare TurboVec 2-bit using the same oracle and measurements; keep it an experiment after the 4-bit gate and do not assign residency status before results exist.
- [ ] **TV-LOD-04** Verify filtered allowlist/slot-mask parity from canonical `SearchFilter` and routed ordinals; no post-search identity filtering may hide false positives.
- [ ] **TV-LOD-05** Prove candidate promotion: TurboVec ordinal candidates → Arrow/mmap FP32/FP16 rows → exact cuVS or approved hot CAGRA rerank.
- [ ] **TV-LOD-06** Choose one TurboVec production execution owner: Python `:8791`, Rust N-API, or an isolated Rust service. Prefer the isolated Rust service only if process-level memory/crash isolation outweighs N-API call overhead; keep the existing gRPC bridge compatibility-only and CLI spawn deprecated until ownership is proven.
- [ ] **TV-LOD-07** Add explicit memory-budget receipts: compressed bytes, mmap bytes, resident RSS, peak RSS, VRAM, page faults, rebuild time, cache transitions, and fallback reason. A 4 GB target is accepted only from measured evidence.
- [ ] **TV-LOD-08** Keep JSON/simd-json on the control plane (manifests, filters, receipts); use Arrow IPC/mmap or equivalent binary transport for vector bulk data.

### BitFrost-controlled promotion policy

### Review corrections — 2026-08-14

- cuVS brute-force is an oracle only when the metric contract explicitly sets
  `semantic_768`, float32, 768 dimensions, cosine normalization, score
  direction, deterministic tie-breaking, and the canonical eligibility mask;
  do not inherit a squared-Euclidean default from a toy fixture.
- Valkey Search capability exists, but the current production ownership choice
  remains BitFrost hot state/routing/cache and Qdrant persistent projection.
  Any future Valkey vector executor must be one selectable executor in the
  existing logical semantic lane, not another fusion vote or truth store.
- PostgreSQL 18 maintenance version is runtime evidence only. Do not record a
  specific minor version as current without probing `SELECT version()` and
  `SHOW server_version` on the workstation.
- Qdrant sparse/BM42 remains deferred because the live collection has no sparse
  vector slot; dense semantic proof does not require creating that schema.
- The LOD lane now has four explicit planes: Postgres truth, retrieval
  projections/executors, evidence expansion, and BitFrost memory/routing.

BitFrost/Valkey controls residency policy, not canonical vector truth. A cache
entry may contain routing metadata, an ordinal allowlist, a compact packet/card
reference, or a promotion decision; it must not be the only copy of a vector,
identity, ontology tuple, or ACE policy record.

- [x] **BF-LOD-01** Define and test pure `LodPromotionDecisionV1` with `packetKey` or ordinal, orthogonal residency/representation tiers, artifact and revision references, vector-payload versus resident-byte accounting, utility, policy revision, and timestamp. Implementation: `sveltekit-frontend/src/lib/server/atlas/tensors/lod-promotion-contract.ts`.
- [x] **BF-LOD-02** Validate promotion/demotion decisions with the Zod contract boundary; invalid residency transitions, missing identity/revisions, out-of-range utility, and negative byte counts are rejected. Stale policy readback remains an integration gate.
- [ ] **BF-LOD-03** Persist promotion receipts and policy outcomes through the existing Postgres/Drizzle durable receipt owner; Valkey stores the revision-qualified hot state and may be rebuilt.
- [ ] **BF-LOD-04** Prove transitions `WARM/TURBO_4BIT → HOT/FP16`, `HOT/FP16 → WARM/TURBO_4BIT`, `WARM/TURBO_4BIT → COLD/FP32_MMAP`, and stale-revision eviction. No transition may mutate `packet_key`, `symbol_version_id`, ontology links, or canonical ACE state.
- [ ] **BF-LOD-05** Measure utility inputs separately: relevance, access frequency, graph authority, domain affinity, expected reuse, and memory cost. The policy chooses residency; SearchRuntime still chooses candidates and fusion.
- [ ] **BF-LOD-06** Keep ACE packet contents bounded and provenance-linked: packet/card references, selected evidence, policy revision, and ContextManifest hash; do not put full corpus vectors or hidden reasoning into Valkey.

Recommended receipt shape:

```json
{
  "schema": "atlas.lod-promotion.v1",
  "packetKey": "packet:...",
  "representationRevision": "semantic_768:r1",
  "artifactId": "semantic-snapshot:r1",
  "artifactRevision": "artifact:r1",
  "from": { "residency": "WARM", "representation": "TURBO_4BIT" },
  "to": { "residency": "HOT", "representation": "FP16" },
  "reason": "QUERY_REUSE",
  "utility": 0.87,
  "vectorPayloadBytesBefore": 384,
  "vectorPayloadBytesAfter": 1536,
  "residentBytesBefore": 4096,
  "residentBytesAfter": 3072,
  "policyRevision": "bitfrost:r3",
  "workspaceRevision": "workspace:r1",
  "sourceRevision": "source:r1"
}
```

`bytesBefore` and `bytesAfter` describe the selected artifact or resident
working set, not the size of a metadata key/value pair. Vector bytes remain in
Arrow/mmap, TurboVec, or GPU artifacts; identity and ontology relationships
remain in their canonical stores and projections.

Execution order for this lane is fixed as:

```text
LOD-01 memory census
  → LOD-02 SemanticSnapshotV1
  → LOD-05 single TurboVec owner
  → LOD-04 compression/mmap benchmark
  → exact cuVS comparison
  → LOD-03 HOT/WARM/COLD policy
  → BF-LOD promotion/demotion proof
  → LOD-07 fail-open swaps
  → LOD-08 durable residency receipts
```

## Implementation checkpoint — 2026-08-14

- [x] **BF-LOD contract implementation** Added the pure revision-qualified
  `LodPromotionDecisionV1` Zod contract and focused tests at
  `sveltekit-frontend/src/lib/server/atlas/tensors/lod-promotion-contract.ts`
  and `.spec.ts`. It validates identity, revisions, allowed state transitions,
  utility bounds, and byte accounting without carrying vectors or canonical
  identity truth.
- [x] **BF-LOD focused proof** `npx vitest run
  src/lib/server/atlas/tensors/lod-promotion-contract.spec.ts
  src/lib/server/atlas/tensors/latent-lod-contract.spec.ts` passed: 2 files,
  7 tests.
- [x] **BF-LOD orthogonal tiers** Corrected the contract so residency
  (`COLD/WARM/HOT`) and representation (`FP32_MMAP/FP16/TURBO_4BIT/...`) are
  separate dimensions. Receipts now distinguish vector-payload bytes from
  actual resident bytes and carry artifact identity/revision.
- [ ] **BF-LOD live wiring** The contract is not yet connected to Valkey
  promotion/readback or Postgres/Drizzle durable receipts. Do not report
  BitFrost LOD promotion as live or complete.
- [ ] **LOD memory proofs** No memory census, TurboVec 2/4-bit compression
  measurement, hidden-FP32-duplicate check, or process working-set proof has
  been completed.
- [ ] **TurboVec owner** Rust N-API/sidecar ownership and the reachable Python
  `:8791` compatibility path remain unresolved; no production owner promotion
  occurred.
- [x] **LOD-01 census scaffold** Added the read-only command
  `npm run atlas:lod:memory:census` backed by
  `scripts/atlas/prove-lod-memory-census.mjs`. It records the census process
  RSS, optional snapshot/index artifact metadata, and explicit unavailable
  measurements without claiming service memory.
- [x] **LOD-01 initial run** Report written to
  `docs/reports/lod-memory-census.json`: the `turbovec` source tree was found,
  measured as 1,433 files / 560,505,533 bytes, but no frozen semantic snapshot
  or compressed index was supplied. Status is `PARTIAL_NOT_MEASURED`; both
  memory promotion gates remain `NOT_PROVEN`. Source-tree bytes are not index
  residency evidence.
- [x] **LOD-01 artifact audit** The supplied tree contains Rust source/build
  outputs and upstream benchmark JSON (for example `benchmarks/results`), but
  no Parent Atlas `SemanticSnapshotV1`, ordinal map, or workload-specific
  TurboVec index. Benchmark files remain reference evidence only and cannot
  promote `TV-LOD-02` or either memory gate.
- [x] **LOD-02 candidate input proof** Reused the existing
  `.tmp/atlas-vector-snapshots/vector-snapshot-5k-turbovec-input.ndjson` as a
  read-only candidate input. `npm run atlas:lod:snapshot:input:proof` validated
  100/100 rows, 768 finite float values per row, zero duplicate packet keys,
  and zero duplicate source refs. It remains
  `CANDIDATE_VALIDATED_MANIFEST_INCOMPLETE` because workspace/source/
  representation/ordinal-map revisions and an immutable Arrow/mmap artifact
  checksum are absent.
- [x] **LOD-02 existing producer verification** Ran
  `npx tsx scripts/atlas/duckdb/freeze-vector-snapshot-5k-768.mts --verify`.
  The producer validated 5,000/5,000 exact 768-dimensional positive-norm rows
  and 5,000 unique packet keys, but only 4,999 unique source refs. The result
  is a verified 5K reference candidate, not a complete promotion proof until
  the source-ref collision is explained and the Arrow/mmap artifact plus full
  lineage manifest are accepted.
- [x] **LOD-02 registry correction** Fixed the producer root path and added a
  dedicated `vectorSnapshot5k768` registry entry. The generated manifest now
  carries `embeddinggemma-full768-v1` instead of the stale legacy 384 registry
  metadata. The prior misplaced `scripts/.tmp` artifact was not deleted.

## DAG-4 / Query Adaptive Synthesis (QAS) bounded seam

- [x] **QAS-00 owner audit** Added
  `scripts/atlas/audit-qas-owner.mjs` and command
  `npm run atlas:graphify:qas:owner:audit`. The current audit is
  `OWNER_AUDIT_PARTIAL`: Graphify and the QAS sampler are wired, while SOM,
  ContextManifest, exact promotion, Kanban linkage, and BitFrost policy are
  existing owners with adoption/proof gates still open.
- [x] Added the deterministic QAS sampler at
  `sveltekit-frontend/src/lib/server/atlas/retrieval/query-adaptive-sampler.ts`.
  It uses query-conditioned feature weights and a stable hash seed to select a
  bounded candidate sketch. It emits `packetKey`, `sourceRef`, optional
  `symbolVersionId`, and proposal metadata only.
- [x] Added the non-mutating proof command
  `npm run atlas:graphify:qas:proof` and receipt
  `docs/reports/query-adaptive-sampling-proof.json`.
- [x] Wired a best-effort daily receipt step into
  `scripts/startup/run-graphify-daily-startup.mjs`. Missing candidate feature
  input produces `DEFERRED_NO_FEATURE_MATRIX` and cannot block Graphify.
- [x] **QAS-03 candidate input adapter** Added the read-only adapter
  `scripts/atlas/adapt-qas-candidate-input.mts` and command
  `npm run atlas:graphify:qas:input:adapt`. It rejects rows without complete
  identity, revision lineage, or all QAS features; the current run is
  `MISSING_INPUT` with zero rows written.
  `docs/reports/atlas-qas-candidate-features.jsonl` only from validated
  query-time feature rows. Every row must carry packet/source identity,
  workspace/source/representation/feature revisions, and all QAS feature
  values; the existing 25-column candidate matrix alone is insufficient for
  memory/promotion cost features and must not be silently padded.
- [ ] **QAS-04 exact promotion proof** Consume a real revision-qualified
  candidate feature matrix, fetch exact canonical evidence through
  SearchRuntime, and compare sketch recall/identity preservation against an
  exact baseline. No sampling result may invent a file, packet, or symbol.
- [ ] **QAS-05 receipt-to-Kanban linkage** Feed the QAS receipt into the
  existing Graphify recommendation/Kanban owner as an evidence reference only.
  Do not create a second recommendation ledger or mutate canonical truth.
- [ ] **QAS-06 offline GEPA/GRPO evaluation** Use execution receipts as an
  offline dataset only. No online policy-gradient update, LoRA stitching, or
  adapter composition is part of DAG-4 acceptance.
- [ ] **QAS-07 GPU/WebGPU/LOD promotion** Deferred until the semantic snapshot,
  exact baseline, GPU KNN/CAGRA, and residency receipts are proven.

## DAG-5 / live feature matrix and exact promotion

Scope rule: DAG-5 is a read-only analytical join/materialization lane. It
does not create a second retrieval owner or feature store. DuckDB is a later
read-only join backend; JSONL is the audit artifact and Arrow IPC is a later
compute artifact. simdjson, GPU sampling, BitFrost residency, Kanban, and ACE
remain deferred until the CPU exact baseline is proven.

- [x] **DAG-5A feature-row contract** Added
  `query-adaptive-feature-compiler.ts` with identity, workspace/source/graph/
  feature/representation revisions, task/domain metadata, core QAS features,
  and evidence references. It adapts existing candidate evidence; it does not
  create a retrieval universe.
- [x] **DAG-5A SearchRuntime bridge** Added
  `adaptSearchRuntimeCandidatesToQasRows` as a resolver-based, read-only
  boundary. It accepts SearchRuntime identity/revision envelopes plus feature
  rows from existing owners, rejects missing canonical IDs or provenance, and
  never treats `packetKey` as `canonicalId` or queries a backing store.
- [x] **DAG-5A existing matrix-owner bridge** Added
  `adaptCandidateFeatureMatrixRowToQas`. It maps the repository-native
  25-column query feature owner into the QAS core dimensions, including
  process fit, execution utility, and retrieval frequency, while requiring
  canonical identity and graph/task lineage as explicit inputs.
- [x] **DAG-5A read-only export harness** Added
  `scripts/atlas/build-qas-candidate-features.mts` and
  `npm run atlas:graphify:qas:search-runtime:build`. It consumes an explicit
  SearchRuntime candidate export plus an existing feature-owner context and
  writes only the regenerable QAS JSONL artifact. The current dry run is
  `MISSING_INPUT`; no canonical stores are touched.
- [ ] **DAG-5A SearchRuntime producer binding** The final `FeatureEnvelope`
  exposes dense, lexical, AST, authority, metadata, and recency signals, but
  does not consistently expose the complete QAS core set (`processAffinity`,
  `priorExecutionSuccess`, and `reuseProbability`) or a stable canonical
  symbol ID. Bind the existing query-time feature owner and identity join
  before generating live rows; do not derive or zero-fill those fields.
- **Owner trace note:** process metadata is available through the existing
  Qdrant payload enrichment path, retrieval-frequency counts are produced by
  the hotness job, and execution utility is owned by the trace utility
  compiler. These are separate producers; none is currently joined at the
  SearchRuntime query boundary. This remains a composition gap, not permission
  to treat cache hotness, demand utility, or packet text as equivalent QAS
  features.
- [ ] **DAG-5A producer reachability audit** Current repository search finds the
  25-column matrix builder and schema, but no live caller that emits
  `CandidateFeatureMatrixRowV1` for SearchRuntime results. This is now the
  precise blocker: attach the existing builder to the canonical query-time
  feature owner before invoking the export harness.
- [ ] **DAG-5A.1 SearchRuntime producer caller** Add one bounded caller where
  canonical SearchRuntime candidates and the existing 25-column feature owner
  are simultaneously available. It may emit only the regenerable
  `search-runtime-qas-candidates.raw.jsonl` artifact.
- [x] **DAG-5A.1 producer function** Added
  `buildSearchRuntimeQasRows`. It calls the existing
  `buildCandidateFeatureMatrix`, checks the presence mask for every QAS core
  column, and passes only complete rows through the identity/revision adapter.
  A live SearchRuntime call site is still required.
- [x] **DAG-5A.1 Atlas adapter helper** Added
  `projectAtlasSearchResponseToQas` at the existing Atlas SearchRuntime
  adapter boundary. It is read-only and requires external feature projections
  plus the existing identity/revision resolver; it does not change retrieval
  fusion or persist rows.
- [x] **DAG-5A.1 projection result contract** The helper now returns accepted
  QAS rows, categorized rejected candidates, and a same-request exact baseline
  from canonical SearchRuntime packets. File emission remains owned by the
  existing export harness.
- [x] **DAG-5A.1 owner-composition seam** Added the pure
  `search-runtime-qas-feature-resolver.ts` adapter. It composes injected
  projection/context owners, preserves missing evidence, and performs no
  store reads or writes. It is tested but not yet wired to a live producer.
- [x] **DAG-5A.1 response composition helper** Added
  `projectAtlasSearchResponseToQasFromSources`, which aligns the existing
  SearchRuntime packet envelope with injected owners before QAS validation.
  The helper is opt-in and leaves the SearchRuntime response unchanged.
- [ ] **DAG-5A.2 lineage join** Require canonical ID/symbol version, workspace,
  graph, feature, representation, request, and task lineage. Missing
  process/execution/reuse evidence remains `UNKNOWN` and rejects promotion; it
  is never zero-filled.
- [x] **DAG-5A.2 production path identified** The live path is
  `semantic-search-workflow.ts` → `createAtlasSearchAdapter().search()` →
  `SearchRuntime.search()`. It currently returns finalized packets but does
  not expose the complete query feature projection or graph/task revision
  resolver, so no incomplete observation was wired into the response.
- [ ] **DAG-5A.3 live artifact** Produce raw SearchRuntime rows, pass them
  through the existing validator, and promote the status to
  `LIVE_QAS_RAW_ROWS` only when all rows are revision-qualified.
- [x] **DAG-5A.3 harness emission contract** Extended the existing harness to
  accept the adapter projection result, emit accepted raw JSONL plus a
  same-request exact-baseline JSON, and report candidate/accepted/rejected/
  baseline counts. The current run remains `MISSING_INPUT` because no live
  projection envelope exists yet.
- [x] **DAG-5A adapter integration proof** Standard project Vitest now proves
  SearchRuntime packet identity → complete feature projection → strict QAS
  row → same-request exact baseline. The test is read-only; live service
  invocation and artifact emission remain separate gates.
- [x] **DAG-5A focused regression proof** The adapter and DAG-5 tests pass
  together (`7/7`). The owner audit remains `OWNER_AUDIT_PARTIAL`, and the
  export harness remains `MISSING_INPUT`; these results are expected until a
  real SearchRuntime caller supplies the existing complete feature projection.
- [x] **DAG-5C exact promotion contract** Added
  `query-adaptive-exact-promotion.ts`. Only revision-compatible resolver
  results become `EXACT_PROMOTED`; missing, stale, and revision-mismatched
  results remain explicitly ineligible.
- [x] **DAG-5D evaluator fixture** Added
  `query-adaptive-evaluator.ts` and
  `scripts/atlas/evaluate-query-adaptive-sampling.mts`. Fixture evaluation
  passed; it is not live recall evidence.
- [x] **DAG-5E daily receipt hook** Daily Graphify now emits a non-blocking
  evaluation receipt after QAS sampling. Current daily status is
  `DEFERRED_MISSING_INPUT_OR_BASELINE`.
- [ ] **DAG-5A live feature compiler binding** Produce the real
  `docs/reports/atlas-qas-candidate-features.jsonl` from the existing
  SearchRuntime candidate set and feature owners. The adapter seam is now
  `CREATED / FOCUSED_PROVEN`; the live candidate export and feature-owner
  resolver are still missing. Current repository evidence shows
  `buildCandidateFeatureMatrix` has no production caller and SearchRuntime
  packets do not consistently carry `process_fit`, `execution_utility`, and
  `retrieval_frequency`. Do not use task-candidate metadata, packet-text
  heuristics, or zero-filled matrix values as a substitute.
- [ ] **DAG-5B exact SearchRuntime baseline** Provide a revision-qualified
  exact top-K oracle and query set across task kinds/domains. No recall,
  overlap, MRR, or candidate-reduction claim is valid before this exists.
- [ ] **DAG-5B same-request oracle** Capture ordered exact IDs and QAS rows
  from the same request and revision tuple so evaluation cannot drift.
- [ ] **DAG-5F live recall/promotion proof** Evaluate budgets 128/512/2048,
  validate exact promotion, and emit the complete QAS receipt before any
  Kanban or ACE linkage.

### QAS bundle review

- [x] Reviewed `parent-atlas-qas-bundle`. Its contracts and owner audit are
  useful reference material, but `run-qas-shadow.mjs --json` reports
  `NOT_WIRED` and expects a separate `atlas/qas` owner path. It is not copied
  into the application as a second sampler or receipt owner.

## Reconciliation vs stale "End-to-End Gaps" doc (2026-08-22)

A July 13, 2026 status doc (`End-to-End Gaps: Domain Classifier + Cross-Reranker
→ XGBoost/RL`, not part of this OpenSpec change — a standalone note the
operator was re-reading) claimed 9 gaps in the `SearchRuntime` → promotion →
XGBoost pipeline, several flagged `❌ NOT WIRED`. Read `search-runtime.ts`
(the real `SearchRuntime.search()` method, 1359 lines) plus its downstream
promotion path in full and checked real callers (not just file existence,
per the Duplication Prevention rule in root CLAUDE.md) before trusting the
doc. Verdict: **the doc is 5+ weeks stale and wrong in both directions** —
some gaps it called trivial are still open, some it called missing are done,
just under different names/architecture than it assumed.

- [x] **Confirmed PageRank is live**, contrary to the doc's "not wired" claim.
  `neo4j-gds-client.ts::runPageRankClient()` runs a real
  `CALL gds.pageRank.mutate(...)`, with real callers
  (`graph-analysis-runner.ts`, `graph-analytics-service.ts`,
  `pagerank-analysis-adapter.ts`, `cheirank-analysis-adapter.ts`,
  `kcore-analysis-adapter.ts`). `pagerankScore` is consumed in
  `search-runtime.ts`'s Stage 3b blended score. This matches the Aug 9
  governance audit's finding that this is the one PageRank implementation
  (of 5 total) with a live runtime proof; the other 4 remain dead/fixture-only
  per `docs/architecture/runtime-ownership-baseline.json`.
- [x] **Confirmed SOM→Neo4j cluster fan-out is live** (doc's gap #8),
  predating even the July doc — `BELONGS_TO_CLUSTER` edges are written by
  `scripts/graphify-som-cluster-summaries.mjs` and consumed across
  `neo4j-gds-client.ts`, `graph-projection-manifest.ts`,
  `node-sync-neo4j-mirror.ts`, and others. No action needed.
- [x] **Confirmed Neo4j fan-out after Postgres write exists** (doc's gap #4)
  but as a narrower mechanism than the doc's proposed `promote-results-neo4j.ts`:
  `promote-results-outbox.ts` implements a transactional-outbox pattern with a
  `PROMOTE_NEO4J` operation; its `promoteNeo4j()` substage matches the
  `Packet` node by `packet_key` and creates a `RETRIEVED_BY → RetrievalEvent`
  edge (retrieval-history telemetry), updating only `summary`/`retrieved_at`/
  `updated_at` on the node. It does **not** currently propagate `latent_64`,
  `latent_128`, `domain_class`, or `title_id` onto the Neo4j `Packet` node —
  those land in Postgres only (see next item). If Neo4j-side topology
  properties for those fields are wanted, that is still a real, scoped gap —
  distinct from "no fan-out exists," which is false.
- [x] **Confirmed domain classification AND title generation are both wired**
  (doc's gaps #5 and #7, both called trivial/schema-only in the doc) — via
  `promote-results-outbox.ts::recordPromotionIntent()` → `enrichPacketSemantics()`
  in `src/lib/server/ace/promotion-enrichment-service.ts`, which calls
  `classifyDomainTaxonomy()` (from `src/lib/server/atlas/domain-taxonomy.ts`)
  and `generateTitleIdentity()` (from `src/lib/server/ace/title-id-generator.ts`).
  Both write `domain_class` / `title_id` / `title_generator_version` /
  `domain_classification` / `domain_class_source` to Postgres in the
  `PROMOTE_SUMMARY` stage. **Important nuance the doc missed**: this runs in
  Stage 6 (promotion), strictly *after* Stage 4 rerank and Stage 4b
  postProcess have already fixed `finalPackets`' order. So while domain
  classification is wired end-to-end for storage/labeling, the doc's
  specific ask — "domain-aware reranking boost" — genuinely is not done;
  classification never feeds back into ranking. Don't close that half of
  the gap by pointing at the promotion-stage wiring.
- [ ] **Domain-classifier duplication (new finding, governance-relevant per
  root CLAUDE.md "Duplication Prevention" / one-canonical-owner rules)** — at
  least 5 modules implement domain/taxonomy classification, only 3 have any
  real caller:
  | File | Export | Real callers | Role |
  |---|---|---|---|
  | `src/lib/server/atlas/domain-taxonomy.ts` | `classifyDomainTaxonomy` | `ace/promotion-enrichment-service.ts` | **CANONICAL_OWNER** for the live SearchRuntime promotion path |
  | `src/lib/server/ace/features/domain-classifier.ts` | `DomainClassifier` class, 13-class | `ace/features/feature-extraction-orchestrator.ts` | live, but a *different* pipeline (ACE feature extraction, not SearchRuntime promotion) |
  | `src/lib/server/enrichment/domain-classifier.ts` | `classifyDomain`, `DOMAIN_TAXONOMY` | `atlas/feature-doc-enrichment.ts` | live, but a third distinct pipeline (feature-doc enrichment) |
  | `src/lib/server/classifier/domain-classifier.ts` | `classifyDomainFromText` | **none found** | dead — this is the exact function name the July doc wanted wired; it was written but never called anywhere |
  | `src/lib/server/ai/parent-atlas-workstation-domain-classifier.ts` | `classifyWorkstationDomain` | not checked for callers here | out of scope — belongs to the workstation chunking/summarization tool (tree-sitter + NLP sidecar + llama-server), unrelated taxonomy |
  Per the CLAUDE.md classification vocabulary, `domain-taxonomy.ts` should be
  recorded as `CANONICAL_OWNER` for the SearchRuntime/promotion capability;
  the ACE and feature-doc-enrichment classifiers are legitimate distinct-layer
  `CANONICAL_OWNER`s for their own pipelines (not peers to reconcile away);
  `classifier/domain-classifier.ts` is `DEAD` and should be flagged for
  archival (not deleted, per root CLAUDE.md archival rules) rather than
  reused — do not wire the July doc's exact suggested call
  (`classifyDomainFromText`) since that would resurrect a dead, unreviewed,
  differently-shaped classifier alongside the one already live in production.
- [ ] **Latent128/Latent64 status needs a dedicated read, not grep** (doc's
  gaps #2/#3) — both have substantially more real infrastructure than the
  doc's "schema only" claim (a `src/lib/server/atlas/contracts/*` subsystem:
  `canonical-chunk-contract.ts`, `dense-lane-policy.ts`,
  `cluster-feature-projection-v1.ts`, `classification-ledger-writer.ts`,
  `retrieval-router-feature-row-v1.ts`), but this session did not verify
  whether that infrastructure actually trains/encodes/persists a real
  768→128→64 latent end-to-end or is still contract/schema scaffolding
  without a live producer. Do not claim either DONE or MISSING for these two
  without reading that contracts subsystem directly.
- [ ] **E2E search→XGBoost test still does not exist** (doc's gap #9,
  confirmed) — no `search-to-xgboost` test anywhere. `train-baseline-xgboost.mts`
  and `train-xgboost-v2-with-domain.mts` exist as separate training scripts
  under `scripts/atlas/`; not verified here whether they actually consume
  `SearchRuntime` promotion output or a different, disconnected dataset path.

## Non-goals (repeat from proposal.md — do not action these under this change)

- No re-run of the RF2 13-implementation census.
- No attempt to unblock the graph identity split.
- No OKF concept-file registration until `PARENT_ATLAS_KNOWLEDGE_GAP_AUDIT_V1` lands.
