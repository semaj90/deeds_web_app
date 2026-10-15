# Tasks: parent-atlas-retrieval-lod-algorithm-taxonomy

## T1 — Taxonomy authored (this session)

- [x] Write `README.md` + `proposal.md`: 12-domain classification, three-engine substrate
      restatement, honest per-domain status against the live `src/lib/server/retrieval/` tree
      (198 files inventoried via `Glob`), explicit cross-links to the 3 sibling changes that already
      own adjacent concerns (fusion census, OKF layering, graph identity).
- [x] Confirm no duplication: read `parent-atlas-okf-knowledge-layers/proposal.md` (status
      vocabulary source) and `parent-atlas-graph-retrieval-proof/proposal.md` (identity-split
      blocker source) before writing, instead of re-deriving either.
- [x] Cross-link this change from the 3 siblings' README files (one line each, "see also"). Done
      2026-08-31: `parent-atlas-graph-retrieval-proof/README.md` already had it. Added one-line
      "See also" entries to `parent-atlas-retrieval-fusion-reachability/README.md` and
      `parent-atlas-okf-knowledge-layers/README.md`. T1 fully closed.

## T2 — Domain 10 (evaluation harness) — the one domain safe to start now

Everything else in the taxonomy is blocked on work already in-flight in sibling changes. Domain 10
is not — it can be built against the *current* CPU fusion pipeline and gives RF6 (fusion-owner
convergence) a regression harness to converge against, which RF6 doesn't currently have.

- [x] Reachability check completed 2026-09-01: existing evaluation harnesses and reviewer pool
      are present (`scripts/atlas/benchmark-retrieval-ndcg10.mjs`, `python/benchmark_*relevance*`,
      `.tmp/atlas/golden-relevance-review-pool-bound-v1.ndjson`). The pool validator reports
      60 queries / 2,433 candidates, zero structural errors, but 2,433 blank grades and zero
      revision-bound queries/candidates. This is an input-readiness finding, not a completed
      QRELS or baseline proof; see `docs/reports/golden-relevance-review-pool-validation-v1.json`.
      A separate read-only exact-text binding audit matched all 60 queue queries to existing
      `evaluation_queries` rows (`BINDINGS_COMPLETE`), but that does not supply query revisions,
      candidate revisions, or relevance grades; see
      `docs/reports/golden-review-query-binding-audit-v1.json` (2026-09-01).
      A representative queue row also has `candidateSnapshotRevision: null` and
      `ordinalMapChecksum: null`; its candidates have `candidateId`/`sourceRef` but no candidate
      revision fields. This confirms the remaining gap is artifact binding, not query-row lookup.
      A read-only comparison against
      `.tmp/atlas/ordinal-bridge-source/candidate-ordinal-map-v1-rebuilt-readonly.json` found
      2,247/2,433 exact `sourceRef` matches, zero ambiguous matches, and 186 unmatched rows.
      None of the unique matches are promotion-qualified because the map's `sourceRevision`
      value is `unknown`; this is `PARTIAL_REACHABILITY`, not a revision-binding pass.
      The existing exact producer was then attempted read-only with `--limit=32` into a separate
      temporary artifact and failed closed with `CANARY_EXACT_LINEAGE_COHORT_EMPTY`. No pool
      rewrite or database mutation occurred; the blocker is the absence of a qualifying live
      source/chunk/workspace cohort, not an unsafe fallback condition (2026-09-01).
      Predicate-level read-only census: the selected workspace binding and Graphify revision join
      has 111 exact rows; only 9 have a unique chunk hash; 0 have chunk content matching the
      bound source digest; and 0 have packet hash readback satisfying the final join. The next
      repair is source/chunk hash-owner reconciliation, not relaxing the exact query.
      The broader read-only cohort receipt reports 778 exact Graphify-source rows, 43 exact
      packet/chunk hash matches, 15 source/chunk-qualified rows, 0 graph revisions, and 0 fully
      qualified candidates (`docs/reports/lineage-qualified-candidate-cohort-v1.json`). The
      companion hash-authority audit records that packet, source, chunk, and artifact hashes are
      produced from different byte domains; they must not be compared as interchangeable values.
      Follow-up owner audits confirm the live state: `current-workspace-packet-chunk-join-v1`
      reports 111 binding rows, 111 Graphify exact sources, and 0 binding/chunk or packet/chunk
      content matches. `graph-revision-owner-v1` finds graph revisions in derived tables, but
      none bound to the canonical packet/chunk cohort; the available samples use incompatible
      workspace scopes. No graph revision was selected as a fallback.
      The hash-authority audit identifies a bounded future repair scope: 341 packets have a
      single distinct chunk hash, 332 are already populated, and 9 remain pending for a safe
      explicit backfill. The remaining 4,207 ambiguous and 57,112 no-chunk-hash packets remain
      excluded; no backfill was authorized or executed (`docs/reports/atlas-packets-content-hash-source-v1.json`).
      The bounded backfill dry-run selected exactly 9 rows, passed `CH_BF_01` and `CH_BF_02`,
      planned 0 updates, and performed 0 PostgreSQL writes. Apply, readback, and replay gates
      remain unset pending explicit authorization (`docs/reports/atlas-packets-content-hash-backfill-v1-dry_run.json`).
      A safety review of `atlas-packets-content-hash-backfill-v1.mjs` found that `--apply-bounded`
      currently has no explicit non-production authorization or database allow-list, no
      transaction-scoped advisory lock, and commits before its readback. Its NULL guard and
      bounded deterministic selection are useful, but they are not sufficient for promotion.
      Add `CH_BF_06 APPLY_AUTHORIZATION_AND_TRANSACTION_SAFETY` before any apply: require an
      explicit local/non-production database identity, dedicated authorization, xact advisory
      lock, repeatable-read transaction, full selected-key/hash readback, and rollback on any
      mismatch. No apply was attempted in this audit.
- [ ] CH_BF_06 — Verify the hardened bounded backfill apply path in a disposable non-production
      transaction fixture; require explicit authorization, local database scoping,
      `REPEATABLE READ`, a transaction-scoped advisory lock, full pre-commit readback, and
      rollback on mismatch. A dry-run or syntax check does not satisfy this gate. The
      unauthorized invocation guard is proven (exit 1 before pool creation); the transaction
      fixture and mismatch rollback proof remain open. The previously used disposable proof
      container is no longer present; the shared `legal-ai-postgres` database is not an
      acceptable substitute for this write-path proof.
      Fresh packet-hash audits still report 9 pending unique chunk-hash candidates, 4,207
      ambiguous chunk mappings, 57,112 without chunk hash, and 0 chunk/artifact hash agreements.
      Packet/source/chunk hash domains remain distinct; the 9-row backfill is eligible only after
      the disposable apply proof and explicit packet/chunk granularity decision.
      The narrower read-only chunk bridge examined 332 populated packet rows and found 15
      `EXACT_CHUNK_IDENTITY` rows, 74 source-only ambiguous rows, and 243
      `REVISION_UNPROVEN` rows (`docs/reports/chunk-bridge-v1.json`). Its `promotionEligible`
      flag applies only to exact chunk identity; it does not override the missing source/
      workspace/graph lineage required by the strict candidate materializer.
      The strict 15-row canary was correctly invoked through `npx tsx` (plain Node rejects
      `.mts`) and failed closed with `CANARY_EXACT_LINEAGE_COHORT_EMPTY`; no output cohort or
      database write was produced. This is the expected blocker until the current-workspace
      source/chunk revision bridge is repaired.
      The source-lineage census confirms the scope: 778 packets have exact Graphify source
      bindings, 885 source-revision bindings are available, 60,881 packets lack a Graphify
      source match, and the source-binding gate remains unproven (`cleanForBackfill: false`).
      Content integrity is proven only for the bounded exact subset; this does not authorize
      broad backfill (`docs/reports/graphify-packet-lineage-census-v1.json`).
      A separate current-source cohort audit narrows the defect: 111 rows are fully matched to
      the current workspace revision with zero missing, mismatched, or ambiguous source rows
      (`docs/reports/current-source-cohort-lineage-v1.json`). The remaining gap is specifically
      source/chunk content binding, not workspace-revision availability.
      Byte-scope reconciliation of the same 111-row cohort classified 96 as `UNPROVEN_SCOPE`
      and 15 as `MISSING_SOURCE`; packet spans are absent and no bounded exact whole-file
      agreement was proven. The report explicitly keeps packet backfill and projection cleanup
      blocked (`docs/reports/atlas-byte-scope-reconciliation-v1.json`).
      Live `codebase_chunk_index` inspection confirms it stores `line_start`, `line_end`,
      `content`, and `content_hash`, but no UTF-8 byte-start/byte-end fields. Exact line/chunk
      identity therefore cannot be upgraded to byte-scope proof without using the existing
      source-byte authority or adding a separately owned derived scope artifact; no schema
      change is authorized in this gate.
      The existing `atlas_ast_nodes` byte-span table was checked as a possible authority, but
      none of the 111 current Graphify source refs matched its `relative_path` or
      `source_ref_key`, and sampled rows are stale fixture data (`widget.c`). It cannot be
      substituted for the current source-byte/chunk bridge.
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

## Reduction taxonomy reconciliation — 2026-09-06

- [x] Reconciled the DeepSeek/MLA/TurboQuant analogy as a taxonomy of reductions, not an
      equivalence claim. Parent Atlas keeps the full authoritative source/graph/`semantic_768`
      state separate from derived `latent_256`/`latent_128`/`latent_64`, neighborhood, partition,
      sampling, abstraction, residency, and token-admission projections. Every projection still
      requires its parent revision and checksum.
- [x] Confirmed no new `ReductionTaxonomyV1` owner is needed. The existing
      `algorithm-execution-manifest.ts` owns algorithm class/kind/backend/geometry metadata, and
      `contextual-prefill-fabric.ts` owns the validated derived-recipe contract. These already
      classify KNN, PageRank/PPR, KMeans, SOM, and `RANDOM_FOREST` as derived, non-canonical work.
- [x] Confirmed the existing `TaxonomyOrdinalMapV1` remains the ordinal projection owner and that
      graph results must continue to reattach through canonical graph identity before export or
      cache. GPU/CUDA is an executor dimension, not a new Atlas identity or logical retrieval lane.
- [ ] Forest reduction remains `NOT_PROVEN`: the contract accepts `RANDOM_FOREST` only through
      `CUML` or `CPU_REFERENCE` with a recorded seed, but this audit found no promotion-grade
      forest sampling surface. Any future implementation must consume an admitted feature matrix,
      emit a deterministic routing-only receipt, compare against an exact baseline, and never
      create candidate identity, an RRF vote, or canonical evidence.
- [x] Kept `semantic_768` as the canonical dense lane; `latent_256` is the physical learned
      reduction, and `latent_128`/`latent_64` remain nested derived views. Legacy 384 paths are
      compatibility/archival only and are not reactivated by this reconciliation.

This entry is a status reconciliation only. It does not authorize GPU work, forest sampling,
Qdrant/Neo4j/Valkey writes, or a new cross-cutting OpenSpec change. The next executable LOD work
remains the existing QAS live feature/compiler and exact-baseline gates after identity and
SearchRuntime prerequisites are satisfied.

## Reduction router implementation — 2026-09-06

- [x] Added the read-only `REDUCTION-ROUTER-01` bridge at
      `sveltekit-frontend/src/lib/server/atlas/classification/reduction-router-v1.ts`.
      It consumes the existing `QueryClassificationV2` plus an existing taxonomy scope and emits
      a checksum-bound reduction plan for exact filtering, optional taxonomy filtering, the single
      `semantic_768` KNN lane, optional graph/hyperedge expansion, and ACE context cards.
- [x] Wired the reduction plan into `compileQueryRouterControlPlaneV2()` as an additive derived
      result. It does not execute retrieval, call a provider, add an RRF vote, or authorize writes.
- [x] Explicitly deferred `RANDOM_FOREST` because the existing LOD contract has no promotion-grade
      forest surface. `semantic_768` remains canonical; `latent_256/128/64` remain downstream
      derived representations and legacy 384 is not reactivated.
- [x] Focused proof covers deterministic replay, graph fail-closed behavior, one semantic lane,
      non-canonical/non-voting steps, and absence of any `DEEPSEEK_API_KEY` dependency.

## LOD identity + representation evidence handoff — 2026-09-24

**TL;DR.** Read-only identity/provenance work ahead of `LOD-02`. Strict `SemanticSnapshotV1` is still
**BLOCKED, 0 eligible rows**: source/chunk lineage and recipe are proven for 6,774 rows, but no immutable
historical model-artifact digest exists. No datastore writes were performed. No `LOD-*` box below is
checked by this entry. Receipt: `docs/reports/parent-atlas/lod-02-representation-reproducibility-evidence-v1.json`
(commit `9950262810`, pushed).

### Gate state (evidence-safe)

| Gate | Status | Numbers |
|---|---|---|
| LOD-02A source/chunk lineage | PROVEN | 6,774 rows = `atlas_packet_chunk_lineage` (7,421 rows, 627 packets) joined to `content_embedding IS NOT NULL` |
| LOD-02C recipe identity | PROVEN | 6,312 `eg-task-prefix-v1` (`title: {relative_path} \| text:`), 462 raw/`unprompted-v0`; 6,297 metadata-corroborated, 477 recovered, 0 contradicted/ambiguous/unresolved |
| LOD-02C current-runtime reproducibility | PROVEN | fp16 RNE, <= 1 ulp per element (frozen before measurement): 6,774 pass, 0 fail; digest-exact 6,453 is a single-pass observation, NOT a stable invariant (Ollama varies ~1 ulp with batch composition) |
| LOD-02B representation binding | BLOCKED | `REPRESENTATION_EXACT` 0, `MODEL_REVISION_EXACT` 0; `atlas_representations.semantic_768` revision/digest fields are all `unknown`, `CANDIDATE`/`UNVERIFIED` |
| Strict `SemanticSnapshotV1` | 0 eligible | blocker = `MODEL_REVISION_UNRESOLVED` |
| `SemanticSnapshotReproducibilityCanaryV1` | NOT BUILT | 6,774 candidate rows; `canonicalAuthority=false`, `promotionEligible=false`, `historicalModelArtifactVerified=false` |

`representationEvidenceGrade = CURRENT_RUNTIME_REPRODUCIBLE` (orthogonal fields: writer `SUBSTANTIALLY_IDENTIFIED`,
recipe `PROVEN`, reproducibility `PROVEN`, historical artifact `UNRESOLVED`). Reproducibility is not provenance.

### Frozen policy: `QdrantPgIdentityResolutionV1` (`codebase_chunks_768`, `revisionQualified=false`)

Precedence: point ID <-> `codebase_chunk_index.qdrant_id` -> unique `source_ref`+`content_hash` -> consistent payload
`chunk_id` -> `atlas_packet_chunk_lineage` -> `atlas_packet_identity_aliases` -> unresolved.
Payload `qdrant_point_id` is deliberately NOT a V1 step; adding it requires a named V2 with an authority proof.

| Bucket | Points (of 328,348) |
|---|---|
| POINT_BINDING_CONSISTENT | 225,385 |
| CONTENT_HASH_MISMATCH | 493 |
| CHUNK_ID_LABEL_CONFLICT | 84 |
| DUPLICATE_PROJECTION | 82,866 |
| PLACEHOLDER_BACKFILL | 1,000 |
| ORPHAN (= no accepted owner under V1) | 18,520 |

`ORPHAN` splits: 18,449 payload-pointer-only (hash agrees on all; only 2,130 share `source_ref`, 16,319 point at
identical content under a different `source_ref`, so the pointer is not a safe identity owner) + 71 no owner by any
tested method. Earlier counts (226,350 / 100,350 / 71 / 90 / 100,331) came from different procedures; V1 supersedes them.

### Findings to preserve

- `qdrant_id` (varchar, unique, total) is a projection slot/address, not a revision identity. Families: 235,314
  `fullrepo:` rows = `hashToUuid(sha256("fullrepo:<relPath>:<idx>"))` (100% recomputed); 28,812 `card:` UUID rows =
  `sha256("<source_ref>:<idx>")[:32]` (no version bits); 3,539 numeric = `abs(javaHash(chunk_id))`; **~6,800 unexplained**
  (6,763 numeric + 37 blank) = projection debt, not a blocker.
- Qdrant `packet_key`: 222,010 UUID-shaped values all equal the point's own ID -> `PROJECTION_ID_MISLABELED_AS_PACKET_KEY`
  (not in `atlas_packets`/lineage/aliases); never add them to `atlas_packet_identity_aliases`.
- Two vector columns, almost disjoint: `content_embedding` (halfvec, 55,169, declared canonical) vs
  `content_embedding_768` (vector, 219,998; noncanonical). Only 739 rows have both, cosine ~0.90 (different recipes).
  `content_embedding_768` is a **dual write** from one fresh raw-text embedding by `scripts/atlas/index-full-repo-for-search.mjs`
  (99.75% `fullrepo:` rows), NOT a Qdrant->Postgres copy. 47,405 canonical-column rows have no Qdrant point.
- Postgres revision columns (`source_/workspace_/representation_revision`) are empty on 0 of 274,465 `codebase_chunk_index`
  rows; revision-qualified identity exists only in `atlas_packet_chunk_lineage`.
- Historical writer for the tagged cohort: `scripts/atlas/reembed-corpus-document-prefix-v1.mjs`, run 2026-08-25, Ollama
  `embeddinggemma:latest` alias, no digest recorded. Receipt defect kept verbatim:
  `WRITE_FLAG_CONTRADICTS_REPORTED_UPDATE_COUNT` (52,324 updated, `writesPerformed:false`).
- **Retraction:** `embedding_version='qdrant-backfill-v1'` on cohort rows is a stale label from the retired 384 backfill
  (`backfill-content-embedding-384.mjs`); it is not vector provenance.
- TurboVec: `sveltekit-frontend/scripts/turbovec-sidecar.py` = RUNTIME_OWNER of `:8791` (live Qdrant scroll, no snapshot
  authority, stride-12 768->64, INT4, loaded at process start); `scripts/sidecars/turbovec-grpc-bridge.mjs` = ADAPTER
  (`:50062`); `scripts/ingest/turbovec-sidecar.py` = LEGACY; Node MCP sidecar is a separate `:8792` service (not a `:8791`
  competitor). The live index (327,820 vectors) cannot support any compression/recall claim.
- **TurboVec runtime recheck (2026-10-07, read-only):** existing `scripts/atlas/turbovec-sidecar-health.mjs`
  returned HTTP 200 from `127.0.0.1:8791/health`, but reported `indexed=0`, `dim=64`, `bits=4`, and `turbovec=false`.
  This supersedes the older live-count observation as current runtime state; it does not prove an empty canonical corpus
  or a retrieval failure. No index/search request or service operation was performed. Keep frozen-snapshot, model-revision,
  owner-decision, and recall gates open; do not benchmark or promote TurboVec from this health response.
- **Frozen-corpus artifact audit (2026-10-07, read-only):** an existing 5,000-row vector snapshot manifest
  (`.tmp/atlas-vector-snapshots/vector-snapshot-5k-768-manifest.json`, generated 2026-08-25) records 5,000 vectors,
  but only 4,999 identity-parity rows, 4,999 unique source refs, and a legacy `embeddinggemma-full768-v1` label; it has
  no workspace revision or independently bound model-artifact checksum. It is not admitted as the benchmark truth set.
  The 14,564-row candidate ordinal corpus/receipt is from workspace revision
  `sha256:e24bb97187ea6394eeba457dd849915f570045b7a1867780fdc7aa9ea62b9acc`, generated 2026-09-29, and explicitly
  reports `fullAdmittedRootCoverage=false`; its matching receipt does not bind those rows to the 5,000-vector snapshot.
  A separate 4,951-row admission receipt has `downstreamAllowed=false` and a fallback `workspace-active-v1` snapshot
  revision. These artifacts cannot be combined or substituted for one frozen, identity- and recipe-qualified corpus.
  **Gate remains `BLOCKED_FROZEN_TRUTH_SET_GATE`;** no approximate-vs-exact benchmark or index build was run.
- **Small-cohort cross-check (2026-10-07, read-only):** `docs/reports/lineage-semantic-768-cohort-v1.json` is a separate
  15-candidate cohort generated 2026-09-15. Its rows have content-qualified source revisions, but the per-row
  `semanticRevision` includes `encoder-unspecified` and the cohort has no single independently attested
  `representationRevision`; it is therefore not a TurboVec benchmark truth set. This confirms that simply shrinking
  the old 5K population does not fix recipe qualification.
- Existing `SemanticSnapshotManifest` (`tensor-artifact-contract.ts`, `atlas.semantic-snapshot.v1`) cannot express the
  cohort (fixed float32, single `sourceRevision` vs 558, non-empty `representationRevision`). Do not fork a second
  snapshot owner; the canary layers on it by id.

### Code (committed and pushed in `9950262810`, tests pass)

`sveltekit-frontend/src/lib/server/atlas/tensors/semantic-snapshot-reproducibility-canary-v1.{ts,spec.ts}` (commit
`9950262810`): frozen fp16 classifier + noncanonical evidence envelope; 19/19 tests. It is a contract, not the snapshot.

### Open (all unchecked; none authorized yet)

- [ ] **LOD-02B** Recover an immutable historical model artifact digest for the 2026-08-25 run, or leave `MODEL_REVISION_UNRESOLVED`.
      Further alternate-artifact testing (Q8_0 etc.) was rejected as unable to close this gate. Any `atlas_representations`
      update needs recoverable evidence for every field plus operator approval; do not write it from circumstantial evidence.
- [ ] **Canary build** (separate authorized tranche): deterministic ordering -> ordinal map -> cohort/vector checksums ->
      Arrow/mmap -> reload parity -> exact 768 baseline -> 64-d/INT4 recall + memory comparison. Must not be named
      `SemanticSnapshotV1`.
- [ ] **LOD-05** Decide the single TurboVec owner in code (owner census above is done); the live `:8791` load must not be used
      as a compression/recall baseline until a frozen snapshot exists.
- [ ] **Owner decision:** which column is canonical `semantic_768` (`content_embedding` per policy vs the larger,
      Qdrant-aligned `content_embedding_768`). Not decided here.
- [ ] Projection debt: 82,866 duplicate projections (concentrated in ~4,500 chunks), 47,405 canonical rows with no point,
      ~6,800 unexplained `qdrant_id` rows. Needs a bounded cleanup gate with retrieval-parity proof; no deletes yet.

### Restart rule

Completed evidence + missing input or approval => WAITING => STOP. Do not scan the OpenSpec board and pick another change.
Scratch per-row measurement ledgers were kept only in the session scratchpad and are not persisted.
## Canonical-state correction — 2026-10-14

- Canonical dense representation is `semantic_768` (EmbeddingGemma, 768-d). The 384 representation is retired from active retrieval; 384 references above are historical and are not current canonical claims.
- Latent/MRL facts (code is authoritative; root `CLAUDE.md` "Autoencoder latents"): `z128` is a learned bottleneck, not a slice of `z256`; `z64 = normalize(z128[:64])`; MRL prefix `v_k = normalize(v_768[:k])`. Existing `latent_128` rows described as a slice of `latent_256` must be re-verified before citation.
- Parity canonical contract is `codebase_chunks_768_v2`; `codebase_chunks_768` is legacy.
- This note changes no database, Qdrant, or runtime state.

## Retrieval learning and topology experiment tranche — 2026-10-14

These are separate algorithm families, not interchangeable forms of low-rank approximation. Reuse their current owners; keep every challenger advisory until its own evidence gate passes.

- [ ] **EXP-01 — Freeze the experiment cohort.** Use revision-qualified canonical candidate identities, source/evidence references, a frozen candidate snapshot, and an exact CPU Top-K oracle. Record query/repository grouping and independently reviewed relevance labels; without labels, supervised ranking remains `NOT_RUN`.
- [ ] **EXP-02 — Separate candidate generation from ranking.** Compare existing PostgreSQL FTS/trigram, semantic, AST, and bounded graph-expansion candidates by Recall@K against the exact oracle. In this repository, `bm25-search.ts` is a compatibility-named PostgreSQL `tsvector`/`ts_rank` path, not evidence of a standalone BM25 implementation; do not add a second sparse index under the BM25 name.
- [ ] **EXP-03 — Preserve one fusion owner.** Normalize and deduplicate by canonical identity and logical lane, then retain the existing SearchRuntime/RRF and stable Top-K/pagination contracts. Qdrant, cuVS exact, and CAGRA are alternative semantic executors, not extra semantic votes. Compare rerankers on the same frozen candidate pool separately from candidate-generation recall.
- [ ] **EXP-04 — Evaluate unsupervised representation challengers independently.** On one frozen, lineage-complete matrix, compare PCA/TruncatedSVD against the exact full-dimensional baseline; measure numerical correctness, reconstruction/variance, Recall@K, MRR/NDCG, latency, and memory. Any KMeans/SOM routing must report candidate recall lost versus global exact Top-K and must not assign identity or add an RRF vote.
- [ ] **EXP-05 — Gate supervised challengers on reviewed labels.** Compare Naive Bayes, logistic regression, XGBoost, then MLP using query/repository-grouped train/validation/test splits. Fit normalization only on training folds; record model/feature revisions, leakage checks, ranking metrics, calibration (Brier/ECE where probabilities are claimed), latency, and fallback parity. Do not train on synthetic labels or equate retrieval frequency with relevance.
- [ ] **EXP-06 — Keep HMM and spelling assistance in routing/lexical scope.** Evaluate HMM routing on real, revision-qualified execution traces and bounded tool budgets. Evaluate `did-you-mean` as a separate lexical suggestion on typo fixtures; preserve the original query and never silently replace it or create canonical candidates from suggestions.
- [ ] **EXP-07 — Compare graph executors on the same frozen graph.** Preserve directed typed edges and N-ary role incidence. Compare Neo4j traversal with the existing Python/NetworkX reference using identical graph revision, qualified endpoints, hop/fanout budgets, and checksums; compare result identities and direction, not just counts. Any undirected projection is a separate analysis input. cuGraph is optional acceleration only after CPU parity and resource approval.
- [ ] **EXP-08 — Restrict interpolation to a qualified grid.** Trilinear/tricubic interpolation is not a general embedding-ranker or quantum-like Top-K method. Use interpolation only for a defined regular-grid/SOM visualization or field approximation, document the chosen continuity constraints, and test against direct grid values. It must not change retrieval ordering or evidence admission.
- [ ] **EXP-09 — Emit a joined experiment receipt.** Bind request/query-set checksum, canonical candidate snapshot, source/workspace/graph/feature revisions, algorithm/backend versions, random seeds, exact commands and exits, metrics, memory/latency, and write counts. Report missing labels, lineage, or runtime as `BLOCKED`/`NOT_RUN`; no database, Qdrant, graph-store, or cache writes are authorized by this tranche.
- [ ] **EXP-10 — Qualify Tang-inspired sampling before any prototype.** Document the exact data-access model, ℓ²-sampling/query assumptions, preprocessing and storage costs, and supported output guarantee. Compare total cost and sample quality on the same frozen feature matrix; do not describe it as exact or faster Top-K without end-to-end evidence. If the access assumptions cannot be met by existing owners, record `NOT_APPLICABLE` and do not add an index.
- [ ] **EXP-11 — Keep peripheral research claims scoped.** Treat quaternion/QVM as out of scope unless an actual rotation workload exists; treat AlphaGo self-play as an analogy only, not an Atlas unsupervised-training method. Any TabFM comparison must identify the exact model/configuration, benchmark, hardware, memory, and latency, and use the same frozen, independently labeled Atlas dataset as logistic/XGBoost baselines.
- [ ] **EXP-12 — Qualify native and probability boundaries.** Record that Node-API stabilizes the Node-facing ABI only; LibTorch/CUDA/TensorRT C++ ABI, compiler/runtime compatibility, and buffer lifetime require separate native tests. If an MLP emits probabilities, use a separate held-out calibration set and report Brier/ECE; otherwise report an uncalibrated score, not confidence.

## LOD → ACE → residency implementation handoff — 2026-10-14

- **Existing-owner inventory:** LOD fidelity/promotion contracts are `sveltekit-frontend/src/lib/server/atlas/tensors/latent-lod-contract.ts` and `lod-promotion-contract.ts`; advisory hot/warm/cold scoring and byte budgeting are in `sveltekit-frontend/src/lib/server/atlas/cache/bitfrost-residency-warming-v1.ts`; bounded state transitions are in `bitfrost-token-fsm-v1.ts`; descriptor and GPU-budget seams are in `unified-residency-adapter-v1.ts` and `gpu-memory-admission-v1.ts`. PCA/SVD baselines are in `python/pca_svd_representation_baseline_v1.py`; KMeans/SOM have existing Python and LibTorch-facing owners. cuTile/SIMT files under `python/atlas_cuda_cutile_simt_*_probe_v1.py` are probes, not a promoted retrieval kernel. The audit found no production Atlas workload for UMAP, RoPE/YaRN as retrieval transforms, PolarQuant/IsoQuant, or quaternion/QVM; they remain out of the runtime path.
- [x] **LOD-ACE-01 — Bind residency descriptors to admitted Top-K (contract-level).** The descriptor bridge validates the `AceContextManifestAdmissionV1` contract, snapshot/ordinal-map identity, selected candidate IDs, selected-ordinal checksum, and source-revision-set checksum before preparing descriptors. It emits descriptors only for manifest-selected rows. Focused subset, tamper, and missing-selection cases pass in the isolated test run below; this is fixture-backed contract proof, not a live ACE or retrieval receipt.
- [ ] **LOD-ACE-02 — Prove representation and residency execution.** Feature-pack residency now carries a separate SHA-256 payload checksum; the existing artifact checksum continues to bind the complete pack. Descriptor validation binds shape × dtype to exact byte length, and unsafe shape products fail closed. `UnifiedResidencyAdapter.load` rejects missing or mismatched payload checksums before residency and checks both reported and actual view lengths. **Local validation:** 3 focused files, 17 tests passed with `cd sveltekit-frontend; .\node_modules\.bin\vitest.cmd run --config vitest.lane-contracts.config.ts --pool=threads --maxWorkers=1 --reporter=dot src/lib/server/atlas/tensors/unified-residency-adapter-v1.spec.ts src/lib/server/atlas/tensors/unified-residency-feature-pack-v1.spec.ts src/lib/server/atlas/tensors/unified-residency-ace-bridge-v1.spec.ts` (exit 0). This is a CPU-side fixture/provider proof, not immutable artifact-service readback, physical GPU allocation, or cache persistence. CUDA/SIMT tile execution and persistent GPU residency remain unproven.
- [ ] **LOD-RESEARCH-01 — Keep algorithm families distinct.** PCA/SVD are projection baselines; KMeans/SOM are advisory coarse-routing/visualization; UMAP is analysis/visualization; RoPE/YaRN are model positional/context mechanisms; PolarQuant, IsoQuant, quaternion/QVM, and ℓ²-sampling remain research or not-applicable unless a measured Atlas workload and frozen evaluation qualify them. None may alter canonical `semantic_768`, create an RRF vote, or bypass evidence admission.

## Ingestion → retrieval → agent integration handoff — 2026-10-14

Requested audit scope: Rust/simdjson, PostgreSQL storage and index choices, Tree-sitter fanout, TurboVec/cuVS/RAPIDS/LibTorch, DAG prefill, SearchRuntime, tRPC/MCP, HMM routing, and Mastra. This is an owner/caller audit, not a live end-to-end proof. No migration, index build, corpus ingestion, cache write, or GPU job was run.

| Stage | Existing owner | Current evidence | First unresolved proof |
|---|---|---|---|
| JSON/NDJSON control input | `simdjson-typed-evidence-bridge.ts` plus the native parser wrapper | Bounded streaming parser, UTF-8 validation, per-record schema admission and fixture tests exist. The wrapper loads `tensorrt_bridge.node`; the Rust `simd_bridge_rs` crate has Rayon and async N-API exports but the repository's normal `fastJsonParseWithBackend()` path does not load it. `worker.cjs` is a separate adapter and no production caller was found in the main app path. | Select one actual runtime owner; exercise the built artifact through its real caller and report parser backend, byte/line ceilings, accepted/rejected counts and checksum parity. Rust unit tests alone do not prove Node addon load or app wiring. |
| Canonical packet/source and binary payload | PostgreSQL packet/lineage schemas and existing `bytea` owners | `bytea` is used for binary packet/vector artifacts; canonical identity remains PostgreSQL-owned. | Prove one admitted immutable source/packet readback and exact checksum/revision join. Do not store dense-vector bulk data as JSON, hexadecimal text, or TOON. |
| Metadata and lexical indexes | Existing JSONB, B-tree, and `tsvector`/GIN owners; `bm25-search.ts` is PostgreSQL FTS compatibility naming | Existing owners and migrations are present. `tsvector`/GIN is a lexical path; JSONB GIN and B-tree serve different predicates. | Read-only schema/data census plus `EXPLAIN (ANALYZE, BUFFERS, SETTINGS)` on representative queries before proposing DDL. BRIN is only a candidate for physically correlated range columns after measurement; no required BRIN or Merkle-tree owner was established. |
| Tree-sitter / AST fanout | 8095 parser/AST owners and existing AST retrieval lane | Structural extraction and retrieval contracts exist. | Replay the same frozen packet through parser → source-byte span → canonical packet join; bound fanout, worker count, retries, timeout/cancellation and report partial failures. |
| Dense retrieval / ranking | PostgreSQL canonical `semantic_768`; Qdrant projection; SearchRuntime owns normalization, dedupe, RRF and Top-K | SearchRuntime, FTS/AST/MCP and GPU challenger code exist. TurboVec, cuVS and CAGRA remain executors/projections, not identity or extra semantic votes. | Same-request frozen candidate pool, exact CPU oracle, canonical identity parity and one semantic-lane vote. Do not combine Qdrant/cuVS/CAGRA results as separate votes. |
| Graph and tensor execution | NetworkX reference; optional cuGraph/cuVS on the RAPIDS sidecar; existing LibTorch N-API bridge | CPU/GPU algorithm owners and fixtures exist. Rust simdjson is not a GPU executor. LibTorch GEMM is distinct from graph traversal; no live end-to-end CUDA result is established by this audit. | Immutable graph/vector snapshot, revision-bound ordinal map, CPU/GPU result parity, device-memory budget and an execution receipt. No GPU dispatch is authorized by this task. |
| Agent boundary | Existing MCP search tools, ACP bounded tool loop, tRPC router, and request-scoped Mastra route | These are separate caller/API/orchestration owners; existence does not prove one shared request or evidence chain. HMM classification may route budgets but cannot establish identity or authorize calls. | One read-only request ID from MCP/ACP through SearchRuntime and ACE/ContextManifest, with tool schema/auth checks, bounded async fanout, stable Top-K, source revisions and zero writes. tRPC is not a substitute for MCP authorization. |

- [ ] **PIPE-E2E-01 — Freeze one qualified seed.** Select an already admitted packet/chunk with exact source bytes, packet key, workspace/source revisions and evidence references. If any field is absent, stop as `BLOCKED_LINEAGE`; do not synthesize identity from a path, ordinal, vector point ID, or current checkout.
- [ ] **PIPE-E2E-02 — Prove parser-to-canonical-readback.** Run the existing bounded NDJSON typed-evidence stream using the runtime parser actually loaded by the application, then resolve the output against the canonical packet/source owner. Record native-vs-fallback counts, accepted/rejected rows, input and output checksums, exact byte/span verification, and side effects. Decide Rust N-API versus C++ N-API ownership from this result; do not load two parsers as independent authorities.
- [ ] **PIPE-E2E-03 — Qualify PostgreSQL representation/index alignment.** Inspect existing schema and query plans read-only. Keep packet/source identity and binary payload in their existing canonical owners; use JSONB indexes for actual JSON predicates, B-tree for exact keys/revisions, and the existing `tsvector`/GIN or approved lexical owner for text. Add BRIN, Merkle structures, TOON, or migrations only after a concrete workload, owner, and measured acceptance test are approved.
- [ ] **PIPE-E2E-04 — Bound parser and AST concurrency.** Verify worker-pool maximum concurrency is a hard ceiling (not only a spawn target), input bytes and batch sizes are bounded, output order is deterministic, and timeout/cancellation/errors are visible. Compare sequential/parallel outputs and checksums; do not fan out all corpus files or embedding calls at once.
- [ ] **PIPE-E2E-05 — Connect one retrieval request.** Feed the qualified seed to the existing AST/lexical/semantic executors and SearchRuntime. Compare against an exact CPU oracle; deduplicate by canonical identity and logical lane before RRF; preserve stable Top-K and pagination. GPU/ANN outputs are advisory until parity passes.
- [ ] **PIPE-E2E-06 — Prove graph/GPU challenger parity.** Use the same frozen graph/vector snapshot and revision-qualified ordinal mapping for NetworkX/CPU and optional cuGraph/cuVS/LibTorch execution. Record backend, metric, dtype, dimensions, device, memory, checksum and result-identity parity. Keep GEMM, graph traversal, HNSW and DAG context prefill as distinct stages; do not assert GPU availability from a compiled bridge alone.
- [ ] **PIPE-E2E-07 — Prove agent handoff and admission.** Carry the same request ID, candidate snapshot checksum and source revisions through the existing MCP/ACP caller into ACE/ContextManifest. Require bounded tool authorization and independent evidence admission before context injection; keep tRPC/Mastra as adapters/orchestration only. Record attempted/committed writes as zero for this read-only proof.
- [ ] **PIPE-E2E-08 — Emit one joined execution receipt.** Bind producer/consumer revisions, parser backend, canonical packet/source identity, PostgreSQL query/index plan, retrieval lane outputs, graph/GPU backend, Top-K, ContextManifest checksum, MCP tool call, concurrency limits, exact commands/exits and write counts. Report stages individually as `OWNER_PRESENT`, `CONTRACT_TESTED`, `CALLER_PROVEN`, `COMPONENT_LIVE`, `VERTICAL_PARTIAL`, or `LIVE_PROVEN`; never mark the whole path complete from component tests.

### Adapter training, LibTorch, and transport alignment

Additional owner check for the requested QLoRA/Unsloth/Cython/LibTorch/gRPC/QUIC path:

- `python/parent_atlas_neural_router/train_tool_cross_encoder.py` is the existing Python PyTorch/Transformers/PEFT LoRA trainer over schema-checked JSONL. It requires train/eval inputs and writes a model/evaluation output directory. Its source explicitly leaves QLoRA optional pending resource qualification; no Unsloth integration or Cython training owner was found in the active training path.
- Existing Python `loss.backward()`/`optimizer.step()` owners are training experiments. `simd-bridge/cpp/pytorch_graph.cc` and `libtorch_graph_impl.cpp` use LibTorch inference/no-grad operations. `torch::from_blob` wraps host memory; `.to(CUDA)` still transfers data. The N-API ABI does not qualify LibTorch/CUDA C++ ABI compatibility, pointer lifetime, pinned-memory behavior, GPU availability, or numerical parity.
- gRPC clients/services and QUIC/Caddy deployment/test artifacts exist. `atlas.custom-rpc-packet.v1` and related packet-registry contracts are data contracts, not by themselves proof that the same packet is transported end-to-end over gRPC or QUIC. Existing ACP/gRPC/QUIC tests must be classified as fixture/registry checks unless a live service invocation and packet readback are captured.

- [ ] **ADAPTER-QUAL-01 — Qualify LoRA/QLoRA against existing Python owner.** Freeze reviewed, lineage-complete train/eval data with query-grouped splits and immutable base-model/tokenizer checksums. Compare the current PEFT LoRA path before considering QLoRA or Unsloth; verify GPU memory, adapter-only output, held-out ranking/calibration metrics, reproducibility, and rollback metadata. Do not train synthetic labels or promote a model from a smoke run.
- [x] **LIBTORCH-ALIGN-01 — Prove host-to-device tensor contract.** Verified via `scripts/atlas/test-atlas-cuda-gather-01.mjs` (`graphCandidateGatherGPU` in `tensorrt_bridge.node`). Measures host-to-device transfer latency separately (0.6875ms) from GPU kernel execution (0.5933ms), bounds-checked indices fail-closed on negatives/overflow, exact numerical agreement vs CPU reference (`maxDiff = 0`), preserves 6.91 GB VRAM free alongside `:8090` Ornith, receipt in `docs/reports/atlas-cuda-gather-01-receipt.json`.
- [ ] **RPC-PACKET-01 — Prove one revision-qualified packet transport.** Select the already-owned transport for the caller (existing HTTP/MCP by default; gRPC or QUIC only if its measured requirements justify it). Round-trip a bounded typed packet and immutable artifact reference, validate schema/version/checksum/identity at the consumer, and capture service health, exact bytes and readback. Caddy routing or a port declaration alone is not transport proof; do not add a parallel registry, packet authority, or transport without this gate.

### Function recall and Atlas tensor-LOD wiring — 2026-10-15

- [x] **FR-SEARCH-WIRE-01 — Add opt-in FunctionRegistry → SearchRuntime bridge.** The existing PostgreSQL snapshot loader and source-byte qualifier can now supplement the existing AST results through `/api/search/hyperrag` when both `ATLAS_FUNCTION_REGISTRY_RETRIEVAL_ENABLED=true` and `ATLAS_FUNCTION_REGISTRY_REPO_ROOT` are configured and the request supplies a workspace revision. It remains off by default; missing revision, read failure, or qualification failure yields no supplement. Route-level tests cover default-off and explicit enablement; live DB/source readback is still unproven.
- [x] **FR-SEARCH-WIRE-02 — Preserve one AST vote.** Function-registry results carry the existing `ast_tree` score source and explicit executor provenance. SearchRuntime's existing revision-qualified RRF grouping merges same-identity AST hits into one contribution; regression test covers parser + registry duplicate hits.
- [ ] **FR-SEARCH-WIRE-03 — Live receipt.** Configure the approved read-only workspace root and explicit feature flag, run one revision-qualified route query, and record candidates qualified/rejected, source and workspace revisions, snapshot checksum, AST lane contribution count, Top-K, ContextManifest checksum, and zero writes. Keep the feature flag off until this gate is reviewed.
- [x] **ATLAS-LOD-WIRE-01 — Prove numerical row mapping before GPU/cache.** Verified via `scripts/atlas/prove-tensor-io-01.mjs`. 1000-row × 768-col flat float32 binary matrix (`corpus_semantic_768_proof.f32bin`) paired with parallel NES-style CPU lookup table (`corpus_semantic_768_lut.json`). CPU ordinal gather of 50 candidates transferred to RTX 3060 Ti cuBLAS (`cuda_cublas`) SGEMM; top-1 matched ground-truth target (ordinal 42), max absolute oracle difference 1.7881e-7 < 1e-5, zero canonical writes, receipt in `docs/reports/tensor-io-01-receipt.json`.
- [ ] **ATLAS-LOD-WIRE-02 — Cache residency proof.** Reuse BitFrost transitions; Valkey stores revision/checksum-qualified descriptors and counters only, while the GPU process owns device allocations. Distinguish descriptor hit, CPU artifact hit, and actual GPU-resident hit; record bytes, cold/warm identity parity, evictions and stale-revision behavior. No hidden reasoning, model KV cache, or raw CUDA pointers in Redis/Valkey.
- [ ] **ATLAS-INTENT-01 — Keep routing/classification advisory.** HMM/domain taxonomy may choose bounded retrieval budgets and MCP tool candidates; lexical “did you mean” remains suggestion-only. Tool authorization, canonical identity, ontology assertions, and ContextManifest admission remain separate deterministic gates.
- [ ] **ATLAS-LEARNING-01 — Keep training/evaluation gated.** PCA/SVD are frozen projection baselines; KMeans/SOM are coarse-routing challengers; logistic/XGBoost/MLP are supervised rankers requiring reviewed query-grouped labels. DSPy/GEPA optimize prompts against held-out evaluation; OAK validates ontology references. No synthetic-label production claim, online backprop, automatic adapter merge, or model-driven action authorization.
- **Architecture clarification:** ATen is PyTorch's tensor/operator layer (multidimensional arrays plus dispatch), not a new database or identity system. GEMM is dense linear algebra; SIMT is GPU execution; SIMDJSON is CPU parsing; cuGraph is graph analytics; MCP is tool invocation; FastAPI/gRPC/QUIC are transports. Shader/LOD imagery is useful only as the coarse-select → bounded-refine analogy. Pokémon/move/hotkey registries were not found as a canonical Parent Atlas retrieval owner; do not bind them to packet identity absent a concrete user-facing requirement and source-backed registry.
- **Proof status:** Existing owner contracts remain stronger than end-to-end evidence. The new optional bridge and duplicate-vote test are locally testable, but no production caller, GPU operation, residency hit, model-training run, or live MCP → ContextManifest trace is claimed here.

## Phase 24 — source-qualified function recommendations and governed edits — 2026-10-14

**Parent Atlas Priority Shift:** The next blocker is **live source lineage**, not GPU performance. The latest investigation changes the priority. RTX gather, tensor I/O, native graph helpers, and focused integration tests have passed their respective proof gates. But the attempt to run a real Function Registry lookup exposed a more fundamental problem: the registry (`atlas_callable_search`), AST projection (`atlas_ast_nodes`), workspace revision, and source-byte verifier do not yet agree on identity and revision semantics (0/85 matched in live census). Another CUDA benchmark, embedding model, or HyperGraphRAG traversal will not resolve the current integration blocker.

Phase 24 is **NOT COMPLETE**. Strict safeguards must be enforced: the trained NLP symbol editor with function/module recommendation engine (PCA/SVD low-rank tangent/manifold projection) must be trained, qualified, and verified against live source lineage **BEFORE** any AST-grep / TS-Morph document editing is tested or enabled. The live callable-search census recorded below is a hard stop for enabling the registry-backed route or evaluating document edits against purported canonical symbols. Keep the feature flag off until source lineage is reconciled and a live read-only qualification succeeds.

- [ ] **P24-LINEAGE-01 — Reconcile the live function identity chain.** Repair the producer/materializer contract so each `atlas_callable_search` candidate resolves to exactly one canonical `atlas_symbol_versions` record, an exact packet/source binding, and one native-provenance AST node at matching workspace/source revisions and content digest. Do not infer identity from path, name, ordinal, or a projection row. Re-run the bounded read-only census; require zero revision mismatches, unresolved AST IDs, and ambiguous matches before proceeding. Current census: 85 rows; 85 source-revision mismatches; 85 workspace-revision mismatches; 85 projected AST IDs unresolved; 0 canonical AST matches. No DDL, rebuild, or repair write is authorized by this task.
- [ ] **P24-SNAPSHOT-02 — Prove source-byte qualification before editor testing.** Load one live symbol through the existing snapshot loader, reopen exact source bytes, verify whole-file SHA-256, UTF-8 byte boundaries, exact function span, packet key, and expected workspace/source revisions, then emit a checksummed read-only receipt. Wrong revisions, absent/ambiguous AST, changed bytes, missing packet, and stale preimage must reject. This gate is blocked by P24-LINEAGE-01; fixture tests do not close it.
- [ ] **P24-EDITOR-03 — Keep TS-Morph analysis separate from document mutation.** TS-Morph may parse and produce a source-bound symbol/edit proposal, but must not save, overwrite, or create canonical files directly. Bind each proposal to canonical symbol-version ID, source and workspace revisions, source-content SHA-256, exact byte span, preimage checksum, allowed-root policy, and a deterministic diff checksum. Route any write through the existing governed action-DAG/file-mutation owner with plan-bound human approval, path containment, compare-and-swap preimage check, idempotency key, required validation nodes, and post-write readback. Stale source or failed validation aborts; do not auto-rebase or retry against changed bytes.
- [ ] **P24-NLP-04 — Qualify the symbol/function recommendation model.** Before enabling learned recommendations, freeze a lineage-complete query→function cohort with independently reviewed labels, hard negatives, query/repository/revision-grouped train/validation/test splits, and immutable source/model/feature checksums. Establish deterministic SearchRuntime/RRF as baseline; compare Naive Bayes and logistic regression before XGBoost/MLP. Report Recall@K, MRR/NDCG, calibration where probabilities are claimed, leakage checks, latency, and fallback parity. No synthetic labels, generated summaries, retrieval frequency, or self-labeling from the incumbent ranker may be used as ground truth. Until this gate passes, model output is unavailable or advisory-only and cannot authorize an edit.
- [ ] **P24-LOWRANK-05 — Evaluate PCA/SVD before learned compression.** Use only the same frozen, source-qualified feature matrix and candidate ordinal map. Compare PCA/TruncatedSVD projections with the exact full-dimensional semantic baseline; record dimensions, fit-scope, reconstruction/variance, Recall@K, MRR/NDCG, memory, latency, seed, and checksums. Keep projection artifacts separate from canonical `semantic_768`; reject stale or cross-revision rows.
- [ ] **P24-TANG-06 — Decide Tang-inspired sampling from its access assumptions.** Document and verify the required ℓ²-sampling/query access model, preprocessing/storage overhead, approximation guarantee, and total query cost against the existing exact Top-K oracle. Implement only if current qualified owners can provide the required access without a new canonical index and the frozen evaluation demonstrates utility. Otherwise record `NOT_APPLICABLE`; do not claim Tang sampling is implemented, exact Top-K, or production-ready.
- [ ] **P24-RECEIPT-07 — Join the proof into one read-only recommendation receipt.** Bind request ID, canonical symbol and packet IDs, source/workspace/feature/model revisions, training-cohort and evaluation checksums, algorithm/backend versions, exact commands/exits, selected candidates, source qualification outcomes, edit proposal/diff checksum if present, validation results, and writes performed. Require `writesPerformed:false` for recommendation-only evaluation and keep production feature flags disabled until review.

- **Current evidence (read-only refresh, 2026-10-15):** The bounded lineage audit reports projection and canonical-symbol evidence separately. Against workspace revision `sha256:55edaaadab0cef724593287c7c908dad6cdc1b25039a752a6b5dab2c0c44fac9`, 85 projection rows have 85 source-revision mismatches, 85 workspace-revision mismatches, 0 projection-exact packet matches, 85 missing exact projection source bindings, 85 unresolved projected AST IDs, 0 exact canonical AST matches, and 0 unique source-repo-key-to-UUID mappings. Canonical symbol rows have 85 exact packet matches and 85 unique source bindings; projection packet keys match canonical keys, but projection revision tuples do not. Read-only repository inventory found 523,271 AST rows under UUID `00000000-0000-0000-0000-000000000000` and one `code_repos` row named `00000000-0000-0000-0000-000000000000`; no mapping exists for the source-binding key `deeds-web-app`. Do not assume those identities are interchangeable. The audit is diagnostic, not a source repair or live snapshot proof. AST candidate producers now bind SHA-256 of supplied UTF-8 source, and TS-Morph rejects missing/mismatched candidate-to-input bytes before parsing. The PostgreSQL snapshot loader now resolves native AST candidates by exact repo registry join, normalized path, source revision/hash, qualified symbol, and byte span, rather than equating `upstream_node_id` with `tree_node_id`. Focused fixture validation passed 6 files / 31 tests for TS-Morph/AST and 3 files / 11 tests for the Function Registry loader/qualifier. Neither test group proves canonical repo mapping, live AST/source readback, or editing safety.
- **Training/editing boundary:** Reviewed training data is a prerequisite for enabling a learned recommendation/reranker, not a prerequisite for deterministic source parsing or for the existing human-authorized file mutation guard. TS-Morph must not edit documents directly; any actual edit requires the separate lineage, approval, preimage, validation, and readback gates above. Do not postpone fail-closed contract tests, but do not run or claim a live editing test before P24-SNAPSHOT-02 and explicit approval.
- **No promotion implied:** Existing PCA/SVD, classifier, model-training scripts, or Tang-related research notes are not evidence of a trained Phase 24 model or a completed sampling implementation. All P24 gates remain unchecked until their specified evidence exists.
- **Local validation (2026-10-15):** `npx vitest run --pool=threads --maxWorkers=1 --reporter=dot src/routes/api/search/hyperrag/server.route.test.ts src/lib/server/retrieval/__tests__/search-runtime-fusion.test.ts src/lib/server/atlas/function-registry/function-registry-retriever-v1.spec.ts src/lib/server/atlas/function-registry/function-registry-postgres-snapshot-loader-v1.spec.ts src/lib/server/cache/rpc-cache.spec.ts src/lib/gpu/tensorrt-worker-pool.spec.ts` — exit 0, 6 files / 47 tests. The route test confirms the opt-in flag/repository-root gate and default-off behavior. `npx openspec validate parent-atlas-retrieval-lod-algorithm-taxonomy --strict` — exit 0. Scoped `git diff --check` — exit 0. `npm run check` was started but interrupted after prolonged no-output stall; typecheck remains unverified. A repo-wide diff check reports pre-existing whitespace in unrelated dirty files and was not used as this patch's result.
- **Workstation execution (2026-10-15):** `node scripts/atlas/test-atlas-cuda-gather-01.mjs` exit 0, 5/5; RTX 3060 Ti, `cuda_libtorch`, six gathered candidates, max row difference 0, transfer 0.6861 ms, kernel 0.9844 ms, 6.91 GB free. `node scripts/atlas/prove-tensor-io-01.mjs` exit 0, 1,000 × 768 generated FP32 fixture, 50-candidate pool, GEMM Top-5, CPU/GPU discrepancy `1.7881393432617188e-7` under `1e-5`, `cuda_cublas`, 6.91 GB free; generated input digest `dd9159fe17e67a8479c4e047f5973f6e3a9001cd25234e5c182f9ee26dffde15`. `node scripts/atlas/test-native-graph-tree-parity.mjs` exit 0, 7/7. `node scripts/atlas/test-atlas-native-graph-01.mjs` exit 0, 16/16 including worker-thread tests. `npx vitest run --pool=threads --maxWorkers=1 --reporter=dot src/lib/server/atlas/contracts/atlas-action-dag-v1.spec.ts` exit 0, 4/4. These are fixture/native-operation proofs; they do not establish live Postgres→source lineage, production retrieval, cache residency, or MCP→ACE execution.
- **E2E receipt qualification:** `scripts/atlas/prove-ace-4d-manifold-e2e-pipeline-v1.mjs` generates candidate vectors, query vectors, manifold features, GRPO-like scores, and hard-coded workspace/source/graph revisions in-process. It does not read a live canonical embedding cohort, call the configured SearchRuntime/MCP path, or perform actual BitFrost residency. Its `PROVEN` label is therefore fixture-pipeline status only, not a live end-to-end claim; do not rerun it as live proof or promote its generated ACE proposal.
- **SIMDJSON copy-boundary correction:** `simd-bridge/cpp/simdjson_bridge.cc::SimdJsonToCSR` copies a TypedArray input into a padded `std::string`, parses a DOM, then allocates new ArrayBuffers for CSR outputs. It is SIMD-accelerated parsing plus materialization, not zero-copy JSON→CSR or AVX2 zero-copy layout conversion. CPU parser acceleration is still usable; zero-copy claims require a separate native buffer ownership/readback proof.
- **Live Function Registry join census (2026-10-15):** Read-only PostgreSQL inspection of `atlas_callable_search` for workspace revision `sha256:55edaaadab0cef724593287c7c908dad6cdc1b25039a752a6b5dab2c0c44fac9` found 85 projection rows. All 85 resolve to a symbol-version row and have a packet key, but **0/85** have workspace-revision parity with `atlas_symbol_versions`, **0/85** have source-revision parity, and the projection `tree_node_id` values did not resolve to AST rows (85/85 not found). Four inspected examples confirm the projection claims workspace `sha256:55ed…fac9` and source `1bb240…7aaf`, while the canonical symbol owner has workspace `sha256:e24b…bacc` and different per-symbol SHA-256 source revisions. `atlas_ast_nodes` has no `workspace_revision` column; its available revision evidence is `source_revision`, so audits must join only on actual columns plus canonical workspace/source-binding evidence. The snapshot loader correctly rejected the sampled symbol with `REVISION_MISMATCH`. All probes used `BEGIN READ ONLY`/rollback; no data was changed. **Status: BLOCKED for live registry-to-retrieval qualification; projection census is proven, not repaired.**
- **Next safe gate:** Keep the retriever fail-closed and the feature flag disabled. Produce a full read-only reconciliation grouped by symbol version and packet key across callable projection, canonical symbol owner, AST `tree_node_id`/source hash/span, packet, and workspace-source binding. Do not backfill or rerun the materializer until the mismatched rows are explained and separately authorized. The current evidence points to stale or incorrectly revision-bound callable projection rows, not a missing validation step in the loader.
- [ ] **FR-SEARCH-WIRE-04 — Reconcile the live callable projection before enabling it.** Added `scripts/atlas/audit-callable-search-lineage-v1.mjs`, a bounded `REPEATABLE READ READ ONLY` census requiring an explicit workspace revision and capped at 2,000 rows. Live command `node scripts/atlas/audit-callable-search-lineage-v1.mjs --workspace-revision=sha256:55edaaadab0cef724593287c7c908dad6cdc1b25039a752a6b5dab2c0c44fac9 --limit=500` exited 0: 85 rows, 0 source/workspace revision matches to canonical symbols, 85 exact packet matches, 85 unique workspace-source bindings, 85 unresolved projected AST IDs, and 0 canonical AST matches under the snapshot loader's source/revision/hash/path anchor. This is diagnostic evidence only; no database write, report persistence, materializer run, or feature-flag enablement occurred. Reconcile producer revisions and AST node identity, then rerun the census and a real source-byte snapshot load before closing FR-SEARCH-WIRE-03.
