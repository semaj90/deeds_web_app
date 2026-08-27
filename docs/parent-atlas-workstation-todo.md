# Parent Atlas workstation status and deferred integration queue

Updated: 2026-08-27

## Historical checkpoint and deferred-lanes appendix (2026-08-20)

The supplied Phase 6/85 note describes a newer Query Routing V2/PyTorch
EmbeddingGemma classifier tranche, but that tranche is not present in this
checkout. No `query-routing-v2`, `classification_mrl_128`, PyTorch query-router
trainer, or matching OpenSpec was found. The actual local owner remains the
`query-routing-features-v1` neural-routing contract and its existing feature
adapters. Focused validation passed 10/10 across the V1 query-routing,
neural-routing, and RAPIDS capability-probe tests. This proves the existing
feature contract only; it does not prove a PyTorch classifier, MRL classifier
dataset, executor-policy training, or MiniLM retirement. No model training,
Qdrant index creation, Postgres write, Valkey mutation, or retrieval-policy
change occurred.

The existing V1 owner now has a pure revision-qualified classification export
contract. It emits `FEATURES_ONLY` rows until a real normalized 128-d
`classification_mrl_128` vector is supplied, then marks rows
`TRAINING_READY`. The dedicated exporter tests pass 4/4; the earlier combined
exporter/query tranche passed 5/5. No live producer,
training run, or MiniLM replacement is claimed.
Verified tool-training examples can now enter this export only through an
explicit-label adapter; domain, operation, retrieval-needs, and revision
metadata are caller-supplied. Labels are not inferred from tool names or query
text, and the live producer remains unproven.
The fixture harness produced one revision-qualified `FEATURES_ONLY` row and
zero `TRAINING_READY` rows; report:
`docs/reports/query-routing-classification-export-proof.json`.

The existing workflow-loop receipt is now supported by a pure classification
adapter. It accepts only explicit labels/revisions and requires a successful
receipt with schema, provenance, identity, and replay verification before a
row can be marked verified. The workflow loop remains an execution-receipt
owner, not a classifier or EmbeddingGemma inference owner; no live producer is
wired and no training-ready row is claimed.
The live error-agent route was audited separately; its current request contract
does not carry classifier feature/model/prompt/label revisions or an
EmbeddingGemma `classification_mrl_128` vector. Evidence is recorded in
`docs/reports/query-routing-live-producer-audit.json`.

This section is retained as a historical checkpoint. Its percentages and
August 20 claims are not the current promotion status.

## Current proof-gated status (2026-08-27)

| Lane | Current state | Next gate |
| --- | --- | --- |
| Replay admission | `PROVEN` — 10,135/10,135 | Preserve scope/checksum |
| Frozen DAG | `PROVEN / FROZEN` — checksum `2a74d304...` | No more topology work |
| Graphify source-byte integrity | `PROVEN` — 640 observed rows | Expand exact current-source coverage |
| Packet/chunk integrity | `PROVEN_PARTIAL` — 332 exact, 4,148 ambiguous | Quarantine ambiguous cases |
| Source lineage coverage | `BLOCKED` — 61,126 packet refs lack exact Graphify joins | Classify/materialize eligible current sources |
| CandidateOrdinal | Contract exists; promotion blocked | Freeze qualified cohort |
| CandidateFeatureMatrix | Not promotion-grade | Build from qualified cohort |
| Ranking | Diagnostic only | Held-out Recall/MRR/NDCG |
| Valkey prefill | Infrastructure exists | Deterministic MISS → HIT proof |
| Live repair DAG | Not promotion-proven | One bounded real execution |
| Neural DAG | Not trained | Dataset → challenger → held-out evaluation |
| Package promotion | Deferred correctly | Complete `scripts/atlas` proof gates first |

Current critical path:

```text
source coverage / lineage
  → LineageQualifiedCandidateOrdinalMapV1
  → CandidateFeatureMatrix
  → held-out ranking
  → deterministic Valkey replay
  → ContextManifest
  → bounded frozen-DAG execution
  → neural decoder evaluation
  → packages/atlas* promotion
```

## Historical completion estimates (2026-08-20)

The percentages below are historical planning estimates. They are not
substitutes for the explicit `PROVEN`, `PASS`, `DEGRADED`, or `NOT_PROVEN`
gates above.

## Current completion view

| Lane | Estimate | Current evidence | Next gate |
| --- | ---: | --- | --- |
| Runtime startup and service ownership | 90% | TurboQuant `:8090`, Valkey, Qdrant, Postgres, Ollama, Bifrost, and TRACE MCP are healthy; Topology Search and TurboVec remain soft dependencies | Keep soft dependencies explicit; avoid duplicate owners |
| Chat generation | 85% | llama-server `hforf.gguf` on `:8090` is the chat authority and session model is discoverable | Complete bounded OpenCode/Ornith sequential replay proof |
| Embeddings | 90% | Ollama is the current embedding owner; chat does not use Ollama | Keep embedding and chat URLs separate; add ONNX only as a later measured option |
| Valkey/Redis hot state | 90% | Valkey auth, hot-vector index, and OpenCode rule seed are proven | Continue receipt/readback coverage where a live caller needs it |
| Process packets | 100% | Dense `content` 768 Qdrant write/readback and ContextManifest receipt are proven | Performance follow-up only; no correctness blocker |
| Graph Phase 3–5 | 100% | DB/tool/endpoint/cache projections are proven against current extraction artifacts | Preserve dynamic extraction-count invariants |
| Graph Phase 6 | 85% | Bounded dry-run and local trace simulation proven | Keep live multi-store write mode separately gated |
| AST sidecar GPH-07–16 | 82% | `GraphifyStructuralMaterializer → AstProvider → 8095` boundary is created and fixture-tested; parity, determinism, failure isolation, and bounded incremental/tombstone proofs are complete | Wire the owner into live `graphify:daily` and emit the production receipt |
| Canonical identity RF4 | 70% | Resolver contract and degraded backend-ID fallback exist | Complete one live candidate acceptance proof |
| RF5 within-lane dedup | 40% | Design is defined; full live fusion proof is not complete | One canonical entity, one logical lane, one vote |
| Retrieval → ContextManifest | 65% | Process membership and manifest contracts exist; full grounded runtime loop is not proven | Runtime process retrieval and manifest round trip |
| Grounded execution / receipts | 45% | Worker router and Kanban v1 are wired; end-to-end receipt feedback is not proven | Claim/runId → worker → ExecutionReceipt → validation |
| GPU/RAPIDS sidecar | 55% | Dedicated 8098 sidecar is live-proven for exact cuVS `semantic_768` on a revision-qualified fixture; active 8095 container still reports optional GPU packages unavailable | Same-corpus Qdrant oracle comparison; CAGRA remains quarantined |
| TensorRT/LibTorch native lane | 40% | CUDA/TensorRT/LibTorch sources and OpenSpecs remain present | Build, backend identity, and runtime execution proofs |
| Performance lane | 25% | simdjson and multi-threading are candidates, not active architecture | Benchmark current bottleneck before promotion |

**Historical heuristic estimate: 68%.** This is retained for context only.

## Explicitly not deleted

The following remain in the repository or their dedicated runtime definitions:

- PyTorch and LibTorch integration sources
- `python/atlas_rapids_sidecar.py`
- `docker/cuvs-grpc/`
- RAPIDS/cuVS/cuGraph/CAGRA capability detection
- CUDA/TensorRT Dockerfiles and launch scripts
- simdjson bridge sources
- Redis/Valkey integration and hot-vector provisioning

The lightweight `miniforge-nlp-sidecar` intentionally does not install PyTorch, cuVS, cuGraph, CAGRA, or CuPy. Its current capability result is `false` for those optional packages and `true` for NetworkX and treesitter-chunker. That is deferred capability, not deletion.

## Deferred integration queue

These items are future work and must not block AST correctness or the workstation control plane:

1. Python 3.14 compatibility audit and pinned environment rebuild.
2. Multi-threaded extraction/projection only after profiling identifies a bottleneck; preserve deterministic ordering and receipts.
3. simdjson/Sonic benchmark against the current parser before any promotion.
4. TensorRT/LibTorch backend build and live execution proof.
5. Dedicated RAPIDS/cuVS sidecar health, exact-KNN oracle, and identity parity proof — exact live fixture now proven; same-corpus comparison remains open.
6. CAGRA benchmark only after the recorded architecture decision is explicitly revised; it remains quarantined.
7. Redis/Valkey cache warming and TTL policy expansion after current packet usage and rebuild-cost telemetry exists.
8. ONNX embedding lane only as an explicit alternative to the current Ollama embedding owner; never mix it with llama-server chat ownership.

Deferred lane policy:

- NetworkX remains the CPU oracle/compiler for the frozen execution DAG;
  cuGraph/nx-cugraph is a derived large-graph analytics executor where its
  supported operations apply. Do not reopen DAG topology work for GPU parity.
- The sparse lane is a challenger evaluation among PostgreSQL lexical,
  Qdrant BM25, experimental BM42, SPLADE, and miniCOIL. The legacy
  `lexical_v1` log-TF codec is not BM25 or BM42, and no sparse promotion is
  authorized without labeled ranking and identity-parity evidence.
- DSpark and speculative decoding are serving-performance experiments only;
  benchmark target compatibility, tool/reasoning parity, latency, and VRAM
  after lineage, ranking, cache, and bounded execution gates.

## Safe execution order

```text
GPH-13 AST parity corpus
  → GPH-14 determinism and line-shift proof
  → GPH-15 parse-failure isolation
  → Graphify replacement integration
  → RF4 live identity acceptance
  → RF5 canonical within-lane dedup
  → process-aware retrieval and ContextManifest runtime proof
  → worker claim/runId and ExecutionReceipt
  → validation outcome feedback
  → benchmark-gated GPU/performance promotion
```

Do not mark `ast-extractor.ts` `SUPERSEDED` until the replacement owner, parity, Graphify reachability, and canonical identity gates are all proven.

## Graphify and ANN ownership boundary

### Three-plane model

```text
TRUTH              Postgres + canonical graph + grounded observations
RETRIEVAL          Qdrant + cuVS/CAGRA + lexical retrieval + graph expansion
MEMORY/ROUTING     Valkey/BitFrost + KMeans/SOM + ACE/context cache
```

KMeans is coarse routing, KNN/CAGRA is nearest-neighbor retrieval, graph and
hypergraph expansion are bounded evidence expansion, and SOM is optional
topology-aware routing. They are not separate truth or fusion owners.

Runtime temperature controls retrieval breadth only:

```text
HOT   Valkey packets, ACE cards, centroid hints, cached candidate lists
WARM  Qdrant dense, approved lexical executor, bounded graph expansion
COLD  Postgres/source reconstruction, Arrow/mmap snapshots, broad evidence
```

The current Qdrant collection is dense-only. The WARM sparse branch remains
deferred until a sparse BM42 schema and identity round trip are proven.
The latest read-only sparse source audit found 52,417 source rows and 52,380
rows with text and dense embeddings, but no proven SPLADE/miniCOIL/BM42 runtime
owner or sparse projection. Its status remains `RUNTIME_PROOF_PENDING`; this
source census does not authorize a sparse collection or index write.
The corrected sparse discovery scan found 823 keyword-bearing files, existing
`lexical_v1`/BM42/Qdrant contract surfaces, and only reference-level
miniCOIL/SPLADE mentions. The earlier zero-hit result was a scanner defect, not
evidence that the repository was empty. Sparse owner consolidation must precede
any new encoder or collection work.
The duplicate Qdrant BM42 adapter was also corrected to identify its actual
legacy hashed FNV-1a/log-TF codec. It now emits sparse-lane metadata with
`is_true_qdrant_bm42: false`; the historical physical field name remains only
for compatibility. No collection or retrieval policy changed.
The sparse package commands were also corrected to point at their actual local
stage owners. A read-only 500-row vocabulary sample now runs and produces
4,369 `lexical_v1` tokens, but remains `RUNTIME_PROOF_PENDING`; it did not write
the vocabulary table or any vector projection.
The bounded sample also corrected a misleading `bm25_v1` weighting label: its
actual implementation is hashed log-TF without IDF, now reported as
`legacy_code_aware_logtf_v1`. It is not a BM25/BM42/SPLADE/miniCOIL proof.
The bounded shadow collection plan also passes in dry-run mode for the
allowlisted `codebase_chunks_sparse_test_v1` target with dense `content` 768
and sparse `lexical_v1`; `apply=false`, so no Qdrant collection was created.
The readback verifier was corrected to target the shadow collection and inspect
bounded point vectors rather than the canonical dense collection. The existing
shadow returned 10/10 dense and 10/10 `lexical_v1` sparse samples. This proves
projection shape only; the sparse algorithm remains legacy log-TF, not proven
BM42/SPLADE/miniCOIL.
The self-query also returned 10 points, but this is execution evidence only;
the corrected receipt records `QUERY_EXECUTED_QUALITY_NOT_PROVEN` because no
ground-truth recall or MRR set was supplied.
The RRF ablation command currently emits a pending evaluation ledger only;
dense-only, sparse-only, RRF, recall, and NDCG values remain unmeasured. It does
not change the canonical fusion owner or retrieval policy.
The promotion command was hardened to fail closed while those metrics are
pending. It now returns `BLOCKED_RRF_EVALUATION_PENDING` and does not mutate the
supersession registry.
The RRF scaffold now discovers the workspace-level 15-query keyword dataset;
it still reports `RUNTIME_PROOF_PENDING` because those labels are not yet mapped
to packet-level relevance and no dense/sparse/RRF comparison has run.
The evaluation-input audit confirms stable query IDs and text but no packet-key,
source-ref, or graded relevance judgments. It returns
`MISSING_PACKET_LEVEL_GROUND_TRUTH` and writes only a local report, so quality
metrics and sparse promotion remain blocked.
The annotation-template command now exports 15 review rows with the existing
keyword hints and empty packet/source judgments. Rows remain
`NEEDS_HUMAN_REVIEW`; no relevance labels are invented and no runtime store is
changed.
The annotation validator now fail-closes until all 15 rows have reviewed
packet/source judgments with no duplicate identities. Current status is
`BLOCKED_REVIEW_PENDING`.
The read-only proposal pass produced 271 keyword-based candidate suggestions
from canonical source rows. They remain `PROPOSED_NOT_GROUND_TRUTH` and require
review; they do not change packets, Qdrant, or retrieval policy.
The proposal audit found 161 unique packet/source identities and 110 repeated
identities across queries. This is acceptable for per-query review but is not a
relevance judgment; sparse promotion remains blocked.
The legacy-artifact supersession command is protected by the same gate and now
returns `BLOCKED_RRF_EVALUATION_PENDING` without changing the registry.

Embedding runtime correction (2026-08-20): FastEmbed is optional ONNX
inference tooling, not a replacement for Ollama/EmbeddingGemma, TurboVec,
Qdrant HNSW, or pgvector. The current official FastEmbed Python model table
does not list EmbeddingGemma. Jina Embeddings v2 base-en and base-code can
produce 768-dimensional vectors, but they are separate representation spaces
and require their own parity/evaluation receipt before use. EmbeddingGemma
MRL targets are 768/512/256/128; 384 remains legacy-only. `latent_64` is a
separate routing autoencoder projection from the 768 source, not an MRL lane.

TurboVec LOD clarification: the approximately 32 GB → 4 GB target is a
quantization benchmark hypothesis, not a current workstation fact. Rust
`simd-json` accelerates metadata parsing; Arrow/mmap avoids eager full-vector
copies; TurboVec 2/4-bit compression reduces the warm search representation.
The canonical FP32 `semantic_768` snapshot remains the cold backing store, and
TurboVec/CAGRA results must map through the revisioned ordinal table.

The memory target has two independent gates: `LOD-MEMORY-COMPRESSION-PROVEN`
(raw FP32 bytes versus compressed bytes and ratio) and
`LOD-PROCESS-WORKING-SET-PROVEN` (steady RSS, no hidden FP32 duplicate,
mmap-resident bound, reload, and fallback). A compressed 4 GB index alone is
not evidence that the process uses 4 GB.

BitFrost/Valkey should control orthogonal residency and representation changes,
for example `WARM/TURBO_4BIT → HOT/FP16` and
`WARM/TURBO_4BIT → COLD/FP32_MMAP`. Promotion receipts belong in the durable
Postgres/Drizzle receipt path; Valkey stores only revision-qualified hot state
and compact references. Receipts distinguish vector-payload bytes from actual
resident working-set bytes, not merely the cache key/value envelope.

Neo4j GDS boundary: Neo4j remains the structural graph projection, while the
Python `graphdatascience` client is only an algorithm executor for PageRank,
centrality, communities, and bounded graph analytics. Its outputs are derived
features keyed by canonical Atlas identity and graph revision; they do not own
packet identity, canonical truth, or final retrieval fusion.

The daily recommendation/Kanban flow consumes Graphify receipts; it does not own
AST parsing or vector indexing. The intended order is:

```text
workspace revision
  → file inventory and chunk index
  → AST evidence materialization
  → canonical identity and graph facts
  → semantic_768 embedding and Qdrant projection
  → optional dense executor selection inside the same semantic lane
  → centroid/routing assignment
  → Graphify receipt
  → recommendation/Kanban task
  → agent execution and validation feedback
```

The current owner trace shows that `graphify:daily` does not yet invoke either
the existing AST facts materializer or the 8095 replacement. This is an owner
selection blocker, not permission to create a parallel pipeline.

The selected integration shape is now explicit:

```text
graphify:daily
  → GraphifyStructuralMaterializer
  → AstProvider
  → 8095 treesitter-chunker
  → structural normalizer
  → canonical identity/persistence owner
```

The materializer currently fails closed when 8095 is unavailable. A legacy
fallback is not enabled until its retry/degradation policy is separately
approved and receipt-covered.

Valkey/Redis remains a cache and hot-routing layer for revision-qualified
centroid metadata, routing hints, manifests, and invalidation. It is not the
canonical vector store.

DiskANN/Vamana, cuVS/CAGRA, and TurboVec are optional dense executors behind
the same SearchRuntime logical dense lane. They must consume the canonical
semantic snapshot and preserve filter, revision, and identity parity. They do
not add RRF votes, replace Qdrant truth, or promote Valkey into an ANN owner.

Review correction (2026-08-14): the exact cuVS oracle is only comparable after
the metric contract is frozen (`semantic_768`, float32, cosine, normalization,
score direction, and deterministic tie-breaking). The current CAGRA result is
tiny-fixture runtime evidence only; it does not establish production recall or
latency. The live Qdrant collection is dense-only, so BM42 remains
`DEGRADED/NOT_RUN` rather than a required hybrid-search gate.

LOD implementation checkpoint (2026-08-14): a pure `LodPromotionDecisionV1`
contract now validates revision-qualified identity, explicit COLD/WARM/HOT
transitions, utility bounds, and byte accounting. Focused validation passed
(2 files, 7 tests). This is `CREATED` and focused-test `PROVEN`, but not yet
`WIRED` or `DONE`: Valkey promotion/readback, Postgres receipt persistence,
TurboVec owner selection, memory census, compression ratio, and process
working-set proofs remain open. The approximately 32 GB → 4 GB target remains
a hypothesis until both `LOD-MEMORY-COMPRESSION-PROVEN` and
`LOD-PROCESS-WORKING-SET-PROVEN` have measured receipts.

The first read-only census run is recorded at
`docs/reports/lod-memory-census.json`. It measured only the census process RSS
and confirmed the `turbovec` source tree (1,433 files / 560,505,533 bytes); no frozen semantic snapshot,
compressed index, TurboVec owner RSS, mmap resident pages, Qdrant/Valkey
memory, or GPU VRAM was available to measure. This is useful inventory
evidence, not a compression or working-set proof.

TurboVec artifact audit: the supplied tree has Rust source/build outputs and
upstream benchmark JSON under `turbovec/benchmarks/results`, but no
Parent-Atlas `SemanticSnapshotV1`, ordinal map, or workload-specific index.
Those benchmark files are reference evidence only; they do not prove
EmbeddingGemma `semantic_768` recall, residency, or process working set.

The merged read-only null-hash audit was executed against the real local
Postgres/Qdrant owners with a 20-row sample. All 20 rows classified as
`METADATA_REPAIR_CANDIDATE`: source content, finite 768-dim Postgres vectors,
Qdrant points, matching source refs, and vector cosine agreement were present.
This is sample evidence only; no metadata repair or re-embedding is authorized.

Windows runtime readiness is currently strong: TurboVec `:8791`, Qdrant,
the native bridge, cuVS compression capability, and the dense collection all
passed the existing read-only audit at 100/100. WSL2 Ubuntu is installed on
version 2 but stopped, and its Python environment lacks `cuvs`, `cugraph`,
`cupy`, and `torch`; the native Windows/sidecar path remains the active owner.

An existing candidate input was validated read-only at
`.tmp/atlas-vector-snapshots/vector-snapshot-5k-turbovec-input.ndjson`:
100/100 rows passed the `semantic_768`/768-finite-float and identity checks,
with no duplicate packet keys or source refs. It is not yet a frozen
`SemanticSnapshotV1`: lineage revisions, ordinal-map revision, and immutable
Arrow/mmap artifact checksum are still missing.

The existing 5K 768 snapshot producer was then verified read-only. It produced
5,000 exact 768-dimensional positive-norm rows and 5,000 unique packet keys,
but only 4,999 unique source refs. The producer also had a path/registry bug:
it wrote under `scripts/.tmp` and embedded legacy 384 registry metadata. Both
are corrected; the old misplaced artifact remains untouched. The source-ref
collision still blocks full snapshot promotion.

OKF schema gap backlog: the remaining cross-domain contract work is tracked in
`openspec/changes/parent-atlas-okf-knowledge-layers/tasks.md` as OKF-06.1
through OKF-06.9. It covers domain classifications, ontology-linked tuples,
the derived 4×6 feature mapping, document/file derivations, runtime ownership
for LangChain/Deep Agents/OpenWiki/PyTorch/PostgreSQL AIO/pgvector, and
evidence-linked Kanban recommendations. These are governance and proof tasks;
they do not create a second truth store or authorize live migrations.

Embedding lane update (2026-08-20): `EMB0` is now `PROVEN` by the read-only
`docs/reports/emb0-embeddinggemma-writer-proof.{json,md}` receipt. The live
Ollama EmbeddingGemma owner returned finite normalized 768-dimensional vectors
for both document and query prompts, with `semantic_768`,
`embeddinggemma-native-768-v1`, workspace/source revisions, and source-card
identity. `EMB1` and `EMB2` are now proven on bounded read-only fixtures;
`EMB3A` remains degraded by missing live lineage, not by vector shape. No
canonical or projection data was modified.

`EMB1` is now `PROVEN` as a bounded live sidecar corpus: seven deterministic
semantic cards cover FILE, MODULE, CLASS, INTERFACE, FUNCTION, METHOD, and
TYPE units. The corpus preserves exact spans, structural relationships, scope
context, revisions, and upstream chunk provenance without creating embeddings
or changing canonical/projection stores. `EMB2` is proven below and `EMB3A`
Qdrant projection verification remains unstarted.

`EMB2` is now `PROVEN` on the bounded EMB1 corpus: 7/7 structural cards were
embedded by the live canonical EmbeddingGemma owner and passed 768-dimensional
finite/normalized checks with lineage preserved. The vectors remain a
disposable JSONL artifact; Qdrant projection work (`EMB3A`) is read-only and
blocked only on upstream revision ownership.

`EMB3A` inspection is now `PARTIAL_PROVEN`: the live
`codebase_chunks_768` collection is reachable and confirmed 768/COSINE with
identity payloads in the bounded sample. Revision payload coverage is absent
in that sample and the EMB2 fixture is not indexed, so revision-filter and
same-fixture round-trip proof remain blocked. No Qdrant points or collections
were modified.

The follow-up writer-lineage audit is also read-only and identified the live
SvelteKit owner at `qdrant-sync-worker.ts` → `qdrant-sync-payload.ts` →
`qdrant-payload-enricher.ts`. Its complete revision-lineage payload contract is
present, but Qdrant population and non-zero upstream revision values remain
unproven. Do not backfill or promote EMB3A until bounded readback proves those
fields.

Bounded EMB3A lineage readback (2026-08-20) sampled 50 PostgreSQL packet rows
and 50 Qdrant points read-only. The packet sample had zero non-zero workspace,
source, or representation revisions; the Qdrant sample had zero corresponding
fields and no join. Status: `LINEAGE_POPULATION_NOT_PROVEN`. The next task is
to establish the upstream revision source or document the migration prerequisite;
no payload backfill has been applied.

EMB3A v2 read-only proof update (2026-08-20): the live target is
`codebase_chunks_768_v2` with physical dense vector `content` (768/COSINE),
while the logical representation remains `semantic_768`. The proof now checks
identity/revision coverage, functional filters versus payload-index presence,
an explicit `_atlas_system_record=true` exclusion query, and the mutation
guard. Current result: dense schema, sentinel exclusion, and mutation guard
pass; identity/revision lineage, revision filters, and EMB2 fixture round-trip
remain unproven. No projection writes occurred.

Writer hardening now rejects missing/invalid revision lineage before a Qdrant
sync payload is built; it no longer silently converts missing revisions to
zero/null. Focused Vitest and full TypeScript validation were attempted but
did not complete with diagnostics, so this hardening is not marked test-proven
yet.

OKF cross-domain status (2026-08-14): `DomainClassificationV1`, the derived
4×6 mapping envelope, tuple lifecycle/source-span extensions, and
`OkfRecommendationV1` are now CREATED and focused-test PROVEN. The existing
`FeatureMatrix5`/`FeatureMatrixRowV1` remains the production feature owner.
The contracts are not yet WIRED to durable work-item evidence persistence or a
live agent execution loop. Deep Agents remains MISSING; LangChain/LangGraph
are WIRED_CANDIDATE only; OpenWiki is IMPORTED_UNPROVEN. PostgreSQL AIO,
pgvector/bitmap parity, PyTorch runtime ownership, and recommendation
promotion receipts remain open. The read-only runtime ownership inventory now
exists at `docs/reports/okf-runtime-ownership.json` and `.md`; it classifies
canonical, derived, executor, projection, cache, recommendation, and optional
orchestration surfaces, but does not prove live reachability. No runtime
services or canonical data changed.

Frontend dependency/render review (2026-08-20): Svelte 5.53.3, SvelteKit
2.59.1, `drizzle-orm` 0.45.2, and `drizzle-kit` 0.31.10 are now declared and
installed in `sveltekit-frontend`; `drizzle-kit check` passed. The local
`/admin` page rendered with HTTP 200, `System Overview`, and zero browser
console errors. Full `svelte-check` remains a separate pre-existing blocker
(87 errors, 291 warnings) and is not represented as fixed by this smoke gate.
Evidence: `docs/reports/okf-sveltekit-admin-smoke.json` and `.md`.

DAG-4 / Query Adaptive Synthesis status (2026-08-14): the bounded sampler is
`CREATED` and focused-test `PROVEN_FIXTURE`. It is wired as a non-blocking,
non-mutating receipt step after the existing daily Graphify chain. It currently
has no live revision-qualified candidate feature-matrix input, so daily mode
remains `DEFERRED_NO_FEATURE_MATRIX` until exact promotion/recall and identity
parity are proven. Tang-style sampling is treated as routing inspiration, not
an online theorem implementation. GEPA, GRPO, LoRA stitching, WebGPU/Dawn,
and GPU residency mutation remain deferred.
The next missing artifact is a validated
`docs/reports/atlas-qas-candidate-features.jsonl` input. Existing Graphify
task-candidate JSONL has task metadata but not the complete revisioned QAS
feature vector, so it is not promoted or padded automatically.
The supplied `parent-atlas-qas-bundle` was reviewed as reference; its shadow
runner remains `NOT_WIRED`, so the application keeps one QAS owner under the
existing retrieval boundary.
QAS-00 owner audit is now `OWNER_AUDIT_PARTIAL`: Graphify and the sampler are
wired; SOM, exact promotion, ContextManifest adoption, Kanban linkage, and
BitFrost policy remain existing-owner proof gates.
DAG-5 status: feature-row compiler, SearchRuntime-to-QAS adapter seam,
exact-promotion states, evaluator, daily receipt hook, and read-only export
harness are `CREATED / FOCUSED_PROVEN / WIRED`. The adapter requires an existing feature
owner to supply the complete revision-qualified feature context and rejects
missing canonical identity rather than falling back to packet keys. Live
candidate export and the revision-qualified SearchRuntime exact baseline
remain missing, so live recall, overlap, MRR, candidate reduction, and Kanban
promotion are not proven.
The repository-native 25-column query feature owner now has a direct QAS
adapter, including process affinity, prior execution success, and reuse
probability. Canonical symbol identity, graph revision, and task lineage remain
explicit inputs to that adapter and are not inferred from `packetKey`. The live
producer export still needs to bind those inputs before rows can be generated.
Repository reachability review found the existing matrix owner and an opt-in
read-only `createAtlasSearchAdapter().searchWithQas()` caller. The caller
composition is now wired and focused-tested, but no live invocation has yet
emitted `CandidateFeatureMatrixRowV1` rows. This remains the next runtime gate,
not a reason to create a second QAS feature store.
The bounded producer function now calls the existing matrix builder and rejects
incomplete presence-mask rows before QAS adaptation. A live SearchRuntime call
site is still required; the producer function alone is not production proof.
The existing Atlas SearchRuntime adapter now exposes both a read-only projection
helper and an opt-in `searchWithQas()` caller; it still requires an external
feature projection and identity/revision resolver.
The projection result now includes accepted rows, categorized rejections, and
the same-request exact baseline. Artifact emission remains in the existing
QAS harness; the runtime adapter does not write files.
The production path is identified as `semantic-search-workflow.ts` through
`createAtlasSearchAdapter().search()` into `SearchRuntime.search()`. It still
lacks a complete feature projection and graph/task revision resolver, so live
QAS observation remains blocked without fabricating fields.
The harness now accepts that projection result and can emit accepted raw JSONL
and the same-request exact baseline with counts. The current dry run remains
`MISSING_INPUT`, so `LIVE_INPUT_PRODUCED` is not claimed.
The standard project Vitest now proves the adapter projection path and
same-request exact baseline with a read-only fixture. This is integration
contract proof, not live service or corpus proof.
QAS scope is explicitly a read-only analytical join: SearchRuntime candidates
plus existing Graphify and feature-owner evidence produce revision-qualified
JSONL audit rows. DuckDB is a later join backend, Arrow IPC a later compute
artifact, and simdjson/GPU sampling/BitFrost residency/Kanban/ACE remain
deferred until the CPU exact baseline is proven.

The read-only EMB3A upstream revision-owner audit (2026-08-20) now returns
`REVISION_OWNER_NOT_PROVEN`. `atlas_packets` exposes workspace and representation
revision columns, but workspace values are all zero and only one representation
value is non-zero; source revision and representation ID are absent.
`atlas_ast_nodes.source_revision` exists but has zero populated values, and no
representation-record owner was found. These columns are not treated as lineage
authority until a real populated revision source is proven. No canonical or
projection data was modified.

Live packet lineage dry-run (2026-08-20):
`npm run atlas:embedding:emb3a:packet-live-dry-run` reached the live PostgreSQL
packet table and inspected 25 rows. None contained explicit source content;
all 25 were blocked with `SOURCE_CONTENT_NOT_STORED_IN_PACKET_ROW`, producing
`LIVE_INPUT_BLOCKED_SOURCE_CONTENT_UNAVAILABLE`. The dry-run adapter and live
database binding are proven, but authoritative source-byte resolution remains
open. Do not derive a code revision from summaries, paths, hashes, or Qdrant
payloads. The next safe implementation is a read-only source snapshot/file
content resolver keyed by `source_ref`, followed by the same dry-run receipt.
No canonical, Qdrant, or Valkey writes occurred.

The follow-up live resolver also checks `graphify_files` plus its
`graphify_runs.repository_revision` owner and verifies current workspace bytes
against `content_hash` before deriving a source revision. The current database
does not expose `public.graphify_files` (`graphifySourceTableAvailable=false`),
so the result remains `LIVE_INPUT_BLOCKED_SOURCE_CONTENT_UNAVAILABLE` with
`graphifySourceRows=0`, `sourceContentRows=0`, `readyRows=0`, and
`blockedRows=25`. No path, summary, hash-only value, or Qdrant payload was
promoted to source content.

The read-only source-lineage inventory
(`npm run atlas:embedding:emb3a:source-lineage-audit`) returns
`SOURCE_LINEAGE_OWNER_NOT_FOUND`: `public.graphify_files` is absent from the
live database. `atlas_source_revisions` is present but remains an unrelated
acquisition owner with no proven code-packet binding. Applying a migration is
outside this proof gate; the next decision is to deploy or identify the
existing canonical source-inventory owner, then rerun the dry-run.

Migration reconciliation confirms `drizzle/001_graphify_lineage.sql` exists in
the repository, but no `001_graphify_lineage` entry is present in either local
Drizzle journal and `public.graphify_files` is absent from the live database.
This is an unapplied-migration decision point. Do not use `drizzle-kit push`,
direct SQL, or packet backfill to close EMB3A; schema deployment and its
post-deployment source/hash readback require a separate authorized gate.

The read-only schema checks add a separate repository gate: Drizzle migration
consistency passes, but live drift comparison is `EXPECTED_SNAPSHOT_MISSING`
because `_journal.json` points to `0040_snapshot.json` while `drizzle/meta`
currently ends at `0039_snapshot.json`. The comparator now records this as a
structured failure instead of throwing. Do not synthesize the snapshot or run
a migration as part of the lineage proof.

The 2026-08-20 candidate census adds bounded counts for likely source owners.
The live database has no `atlas_packets`, `atlas_ast_nodes`, `graphify_files`,
`analysis_pass_results`, or `codebase_chunk_index` tables in the active schema.
`atlas_source_refs` has 22,487 content hashes but no source references or
revisions; `atlas_source_revisions` has 2 content digests but no source
references or revision columns; `file_index`, `storage_files`, and
`uploaded_files` are empty or expose no usable lineage fields. The status
remains `SOURCE_LINEAGE_OWNER_NOT_FOUND`; no table was promoted and no
schema/data write occurred.

GPH-17 local execution (2026-08-20): `graphify:daily` was run through the
real startup wrapper with native structural-only mode, `APPLY=0`, symbol
creation disabled, limit 5, and the indexing prefix. It completed
`REACHABILITY_PROVEN_DRY_RUN`; 5 files were processed, 0 evidence rows were
written, and 0 symbols were created/versioned. This closes wrapper reachability
only. A non-fatal invalid canonical DB URL warning was emitted. The local
checkout does not contain the separately claimed GPH-14R source-revision
authority fields or GPH-18 persistence readback collector, so those gates
remain open.

GPH-14R hardening is now present locally: structural materialization exposes a
nullable canonical `sourceRevision`, a SHA-256 `sourceVersionAnchor`, and
explicit `sourceRevisionAuthority`; parser revision tokens remain opaque
correlation metadata. Native parser provenance no longer authorizes promotion
without proven revision authority. Focused materializer, batch, and adapter
tests pass 11/11. The live Graphify dry-run remains nonpromotable with
`CONTENT_ANCHOR_ONLY` and performed no writes.

GPH-18 now has a read-only persistence-owner collector at
`scripts/atlas/prove-graphify-structural-persistence-readback.mjs`. It
identifies `PARENT_ATLAS_ATLAS_EVIDENCE_LEDGER` as the intended
`atlas_evidence` owner but the live table is absent, so the receipt is
`PERSISTENCE_OWNER_NOT_READY`. No canary row or other database mutation was
attempted. Schema deployment and source-revision authority remain separate
blocked gates.

Retrieval collection contract freeze (2026-08-20): `codebase_chunks_768_v2`
is modeled as dense-only `semantic_768`/EmbeddingGemma with physical vector
`content`; sparse BM42/SPLADE/miniCOIL is not implied. `tree_node_id` and
`symbol_version_id` remain payload identity/provenance, while domain tags,
4D topology, KMeans/SOM/community labels, and PageRank remain filter/routing
metadata. A pure blocked plan exists for future revision indexes, but no
Qdrant index or payload migration is authorized while upstream revision
lineage is unpopulated. KMeans and HNSW are rebuildable retrieval artifacts;
Postgres remains canonical truth and Valkey remains hot routing/cache state.

Graphify→Qdrant fanout alignment update (2026-08-20): the existing read-only
fanout proof now applies the pure alignment gate to each Qdrant neighbor. The
live run reached Postgres, Neo4j, and Qdrant; bounded fanout and canonical
identity passed. The sampled Qdrant payload lacks workspace/graph revision and
uses `embeddinggemma_768_native_v1`/`dense_768` rather than the frozen
`semantic_768`/`content` contract, so lineage alignment is `DEGRADED`. No
Qdrant, Postgres, Neo4j, or Valkey writes occurred.

Qdrant payload propagation hardening (2026-08-20): the existing sync payload
builder now accepts the database row's explicit representation aliases,
requires canonical `semantic_768`, carries optional graph/identity lineage,
and fails closed when `source_revision` is missing. This repairs the builder
boundary only; it does not invent source revisions or authorize a backfill.

The companion writer audit found 9 payload writers, with only the live
SvelteKit payload path classified as a complete-lineage candidate; legacy and
backfill scripts omit revision fields and remain blocked for alignment use.

The upstream audit also found `atlas_source_revisions` with two populated
content-digest rows. That table belongs to acquisition/web-source revisions;
no proven binding exists to `atlas_packets` code identities, so it remains an
adjacent owner rather than the code ingestion source-revision authority. The
single apparent digest overlap is rejected as an untrusted empty-SHA collision
on a generated Turbovec lock-file packet matched to `https://example.com`.

`CodeSourceRevisionV1` now defines a pure UTF-8/SHA-256 code-content revision
contract. It is tested but not persisted or wired into packet materialization;
that ownership decision remains open.

The packet lineage dry-run adapter and proof command are now implemented. The
fixture receipt is `DRY_RUN_CONTRACT_PROVEN_INPUT_BINDING_OPEN`; it compares
content digests and fails closed without canonical writes. Live packet input
binding remains open.

The existing `semantic-packet-writer.ts` is recorded as a representation
writer candidate, while `qdrant-sync-worker.ts` remains the Qdrant projection
writer. Neither currently proves populated workspace/source revision authority;
do not make the projection worker infer revisions from mutable latest state.

GPH bounded execution update (2026-08-20): focused Graphify structural
materializer/adapter tests passed 7/7. Live 8095 failure isolation passed 4/4
with valid files completing alongside malformed `ERROR` and missing-delimiter
recovery cases. The bounded incremental proof returned `BOUNDED_PROVEN` for
unchanged skip, changed-file re-extraction, and explicit deletion tombstone
input. This proves executor contracts, not production `graphify:daily`
reachability, persistence, projection readback, or fallback policy. Native
Tree-sitter incremental reuse remains a separate optimization; no daily owner
switch or legacy supersession is authorized.

GPH production dry-run tranche (2026-08-20): the new
`GraphifyStructuralBatchV1` wrapper and focused tests are present. Contract
tests pass 3/3 and the live 8095 dry-run is `DRY_RUN_PROVEN`: 3 proven files,
1 recovered malformed file, 1 unchanged skip, 1 changed re-extraction, and 1
deletion tombstone. Persistence/readback and `graphify:daily` reachability are
explicitly false; the native apply flag remains disabled and no canonical or
projection stores were modified.

GPH-17C reachability proof (2026-08-20): the existing startup wrapper now has
an explicit proof-only mode, `GRAPHIFY_NATIVE_STRUCTURAL_ONLY=1`, which invokes
the native materializer with `APPLY=0` while skipping the write-capable daily
chain. A missing public export boundary in `@deeds/parent-atlas` was fixed for
the existing evidence/symbol repositories. The limit-2 run returned
`REACHABILITY_PROVEN_DRY_RUN` with zero writes. Both sampled files were
`COMPATIBILITY_ONLY`, so reachability is proven but native provenance quality,
persistence, and canonical owner acceptance remain open.

GPH-17 verifier hardening (2026-08-20): the new read-only verifier checks the
reachability receipt schema, dry-run-only flags, child completion, native
receipt checksum, zero write counters, and skipped daily-chain state. The
bounded rerun returned `GPH17_LIVE_REACHABILITY_PROVEN`. The native proof
runner now uses a validated local `pg` pool instead of importing the full app
DB client, removing the unrelated invalid-URL startup warning. No apply,
symbol creation, persistence, or projection write was enabled.

Node Tree-sitter challenger update (2026-08-20): added a separate
`createNodeTreeSitterAstProvider()` behind the existing `AstProvider` seam.
The locked Node parser/TypeScript grammar emits the existing structural
evidence shape, preserves byte spans, and cannot persist or promote canonical
identity. Focused challenger validation passed 1/1 and SvelteKit TypeScript
validation passed. The 8095 sidecar remains the current migration executor;
no provider switch or apply path was made.

## Session 2026-08-21: native-structural-materializer Zod schema bug (fixed)

Ran `scripts/atlas/native-structural-materializer.mts` (read-only dry-run, no
canonical writes) against a 5-file sample and hit **100% failure** at the
`compileStructuralExtractionFabric` step, downstream of a fully successful
native structural parse (`proven_native_files: 5/5`). Root cause: two Zod
schema bugs in `packages/parent-atlas/src/core/structural-symbol.ts` /
`treesitter-chunker-evidence-adapter.ts`, both matching the same class of
mistake — the schema was stricter than the real, legitimate data shape the
upstream extractor produces:

1. `upstream_symbol_id: id.optional()` (3 occurrences in
   `structural-symbol.ts`, 1 in `treesitter-chunker-evidence-adapter.ts`)
   rejected `null`, but a file/module-level chunk with no enclosing symbol
   legitimately has `upstream_symbol_id: null` — and downstream code already
   null-coalesces this field (`chunk.upstream_symbol_id ?? null` in
   `atlas-ast-evidence-normalizer.ts:169`), confirming `null` was always the
   intended value. Sibling fields in the same file
   (`container_qualified_name`, `signature_normalized`, `export_name`,
   `stable_symbol_id`) already correctly used `.nullable().optional()` for
   the identical semantic — this was an isolated oversight, not a design
   choice. Fixed all 4 occurrences to `.nullable().optional()`.
2. `parent_context: z.string().min(1).optional()` rejected `""` (empty
   string), but the real extractor represents "no parent context" as an
   empty string rather than omitting the field or using `null`. Fixed with
   `z.preprocess((v) => (v === '' ? undefined : v), z.string().min(1).optional())`
   — preserves "if present, must be non-empty" for genuine values while
   treating the extractor's empty-string convention as absent.

One follow-on type error surfaced by the schema widening:
`deriveUpstreamSymbolNominationKey()`'s parameter type was `string |
undefined`, now needed `string | null | undefined` to match (its logic
already null-safe via truthy check, `if (input.upstream_symbol_id) ...`).

**Verification**: `packages/parent-atlas` typechecks clean
(`tsc --noEmit`, 0 errors). Existing focused tests pass 7/7
(`test:structural-extraction` 4/4, `test:structural-vertical` +
`test:sidecar-provenance-compat` 3/3 combined). Live re-run on the same
5-file sample: `0 failed_files`, `status: DRY_RUN_COMPLETE` (was 5/5
failed before the fix). Scaled to a 300-file whole-repo sample:
`284/299 proven_native_files`, `5,643 symbol_nominations`, **zero** Zod
validation failures of this class. 15 files still report `failed_files`
with an empty `failures` array (a different, pre-existing provenance-status
path unrelated to this fix — not investigated this session). No canonical
writes occurred (dry-run throughout; `APPLY` was never set).

This directly unblocks the "GPH-17 owner-selection" gap this doc records
above (`graphify:daily` does not yet invoke the materializer) — the
downstream compile step that previously failed 100% of the time on real
repository files now succeeds, which was a prerequisite before any owner-
wiring decision could be usefully tested end-to-end. Owner selection itself
(wiring `graphify:daily` to call this path) remains a separate, not-yet-made
decision.

**Follow-up (same session): the remaining 15 `failed_files` were investigated
and were never real failures.** Traced `evaluateProvenanceReadiness()` in
`graphify-structural-materializer.ts`: a file with zero extractable symbols
(a pure re-export barrel, type-only file, constants file, etc.) returns
`status: NO_EVIDENCE`, but the underlying 8095 sidecar call still succeeded
(`structural.evidence` stays truthy) — there is nothing wrong with the file.
The run script's status tally had no bucket for this case and fell through
to `report.failed_files += 1`, mislabeling a benign, expected outcome as a
failure. Fixed `native-structural-materializer.mts`: added a distinct
`no_symbols_files` counter (with `no_symbols_refs` source-ref list for
inspectability) so `failed_files` is reserved for genuine exceptions only.
Separately, 5 of the original 15 turned out to be vendored CPython stdlib
files under `.python311/` (a bundled interpreter directory — `bin/`,
`include/`, `lib/`, `share/`, 1,453 `.py` files) — not real repository code.
Added `.python311` to `EXCLUDED_DIRS` alongside the existing `.venv`/`venv`
entries. **Live re-run on the same 300-file sample after both fixes:
`status: DRY_RUN_COMPLETE`, `failed_files: 0`, `proven_native_files: 289`,
`symbol_nominations: 2837`, `no_symbols_files: 10`** (the remaining 10 are
genuinely symbol-free files — `.eslintrc.cjs` and several vendored
`.tmp/atomicbot-src/` gguf/llama.cpp Python scripts with no top-level
functions/classes — correctly categorized, not chased further as they are
not repository-native code). No canonical writes occurred.

**Second follow-up (same session): scaled the dry-run to 2,000 files and
found two more real issues, both fixed.** First, `EXCLUDED_DIRS` used exact
string matching and missed vendored virtualenv variants
(`.venv-cu130`, `.venv-gemma4` — CUDA/model-specific Python environments
alongside the already-excluded `.venv`), which flooded the sample with
`numpy`/`PIL`/`pip`/`pika` site-packages. Hardened to a prefix-matching
`isExcludedDir()` (`.venv*`, `.python3*`) so any current or future vendored
interpreter tree is skipped. Also excluded `claude-mem/` (its own
`package.json` describes it as "Runtime dependencies for claude-mem bundled
hooks" — 44,250 files of vendored bundled dependencies, not first-party
code). Second, found the sidecar client
(`miniforge-nlp-sidecar.ts::astChunk`) was discarding the real FastAPI error
body on non-2xx responses, reporting only `422 Unprocessable Content` with
no detail — had to manually probe the 8095 endpoint directly to learn the
real cause was `source` exceeding the sidecar's `max_length=200000`
Pydantic constraint on genuinely huge minified/bundled files. Fixed to
surface the already-parsed response body (truncated to 500 chars) in the
thrown error, since debugging this class of issue should not require a
manual out-of-band probe next time. Existing `miniforge-nlp-sidecar.spec.ts`
still passes 3/3.

**Final state after all fixes, 2,000-file live sample**:
`status: DRY_RUN_COMPLETE`, `failed_files: 0`, `proven_native_files: 1840`,
`recovered_files: 97`, `symbol_nominations: 16777`, `no_symbols_files: 57`,
`diagnostics: 4` (all four are honest, correctly-categorized size-limit
skips on genuinely huge vendored/generated files — a Drizzle introspection
dump, a vendored llama.cpp fork's converter script and bundled JS, and an
Obsidian plugin bundle — not failures, and not chased further). No
canonical writes occurred at any point in this investigation.

## Session 2026-08-20: branch merge consolidation, duplicate-owner cleanup, G11 localhost hardening

**Branch merge audit.** 17 new `agent/*`/`atlas/*`/`feature/*`/`codex/*`/`parent-atlas-*`
remote branches surveyed. Only 3 actually landed on `main` via PR (#6
`agent/parent-atlas-aug16-integration`, #7 `agent/atlas-feature-intelligence-specs`,
#8 `feature/parent-atlas-spectral-multihop`) — the remaining 14, including
`agent/parent-atlas-integration-reconciliation-aug18`, are NOT merged and were
never audited as if they were. `aug16` and `aug18` are divergent siblings (neither
is an ancestor of the other), not sequential despite the naming; `aug16`'s content
reached `main` only via `atlas-feature-intelligence-specs`. Local `main` was
772 commits behind `origin/main` at session start and was fast-forwarded
(local uncommitted WIP stashed first, restored after, one real merge conflict
in `code-evidence-projection-worker.ts` resolved — duplicate type-import block,
kept the upstream side).

**Merkle-identity-pack import** (`parent-atlas-event-merkle-identity-pack/`,
a stray doubled-directory scaffold drop at repo root, dated 2026-08-12, never
wired into any workspace). Compared file-by-file against the live codebase
before importing anything, per this doc's own duplication-prevention
discipline: `contracts/events.ts` was `ALREADY_EXISTS` (`event-fabric.ts`
already owns the same 6 envelope classes as Zod schemas) except `WorkCommandV1`,
deliberately not ported (the pack's own `NEXT_AGENT_PROMPT.md` says command
queues are not integration-event queues). `contracts/merkle.ts`'s envelope
types were also not ported — `event-fabric.ts`'s `CheckpointCommitPayloadV1`
already owns that shape; only the genuinely new RFC-9162 Merkle tree hashing
primitives were ported, adapted to emit the existing payload type instead of
a second one. Genuine gaps ported as-is: `graph-identity.ts` (branded
`symbolId`/`symbolVersionId`/`treeNodeId`/`graphNodeKey` identity types,
sitting beneath the existing `packet_key`/`source_ref` lineage contract, not
duplicating it), `identity-audit.ts`, `kanban-contracts.ts` (a priority-scoring
formula, not a competing task-board owner), `parent-atlas-daily-compiler.ts`.
Landed at `sveltekit-frontend/src/lib/server/atlas/{merkle,identity,graph,daily}/`.
`npx tsgo --noEmit` clean on all ported files. **Not applied**: the 3 SQL
migration templates — the pack's own README says they need schema
reconciliation first; per this repo's Drizzle Safety Rule they stay
unreviewed/unapplied, archived alongside the rest of the pack (see
`docs/archive-manifest.json`, 2026-08-20 entries).

**Test coverage + live wiring proof added same session (2026-08-20).** Wrote
the 4 spec files this port had zero coverage for; all 5 pass, 19/19 tests.
Then wired `buildAnalyticsCheckpoint()` to a real caller — deliberately not
the gated `graphify:daily` chain (GPH-17 `OWNER_SELECTION_BLOCKED`) and not
`runParentAtlasDailyCompiler` (its GPU-feature/recommendation ports have no
real backing anywhere in the repo yet). Investigation found
`event-fabric-analytics-projection.ts`'s `projectCheckpointCommit()` was
already wired to a real durable sink (`analytics-sink.ts` — Postgres
`analytics_events` insert + Redis Streams `XADD`) with zero producers.
New standalone proof script `sveltekit-frontend/scripts/atlas/merkle-checkpoint-demo.mts`
(manually-invoked only, same class as `pagerank-authority-demo.mts`) pulls
real `analytics_events` rows, builds a real checkpoint, emits it through
that path, and reads the result back. Live run independently re-verified via
direct `psql`: row `703eec9c-d659-4d93-b921-20cc68afb347`,
`merkleRoot=51f5dddcb7c531254aa89afa7110b9be5418fd52693fd76aac0f325531d97ce0`
confirmed landed. One bug fixed along the way: the script hung on exit
(open `pg.Pool`/`ioredis` handles from imported singletons) — fixed with an
explicit `process.exit()` in `.finally()`. Leaf-manifest persistence remains
demo-scope only (no durable leaf-manifest table exists yet) — the checkpoint
root and its real-infrastructure landing are proven; the per-leaf audit
trail is not.

**Top-level `src/` duplication cleanup.** A second, unregistered SvelteKit-shaped
`src/` tree (196 files) at repo root, predating this merge wave by ~3 months
(introduced commit `93c23afbf0`, mid-May), collides on 54 filenames with the
real `sveltekit-frontend/src/`. Root-level `tests/`, `cypress/`, `__tests__/`
that reference it are confirmed not wired into any CI or test runner (no root
`package.json` test script, no `.github/workflows`, no `cypress.config.*`
anywhere). Of the 54: 16 were confirmed as pure stubs relative to
sveltekit-frontend (placeholder/no-op vs. sveltekit-frontend's real, tested
implementation — e.g. `graph-retriever.ts` root was a 15-line stub returning
`[]` vs. sveltekit-frontend's 130-line real retriever; `pagerank-promotion-gate.ts`
root was additionally stale, still calling the PG18-removed `isfinite()`
float overload) and were initially archived to
`deeds_labs/archive/2026-08-20/root-src-stubs/` and removed from the working
tree. **This was a mistaken archival, corrected same session.** The
pre-archival check only verified zero *cross-tree* importers (root `src/` vs
`sveltekit-frontend/src/`) and never checked whether other root-only files —
with no sveltekit-frontend counterpart — depend on the archived files
internally. Root `src/` turned out to be an internally-coherent mini-package
(its own `contracts/index.ts`, `retrieval/index.ts`, `ranking/index.ts`,
`context/index.ts` barrel files, enrichers, retrievers, rankers
cross-importing each other), not scattered stray duplicates. Concretely,
`scripts/atlas/pagerank-authority-demo.mts` (a legitimate manually-runnable
demo script, not CI-wired but not dead) imports the archived
`pagerank-authority-contract.ts`, which sits beside `pagerank-authority-builder.ts`
(root-only, no sveltekit-frontend duplicate, never touched) — that file
internally imports the one that got archived. A broader re-check found 11 of
the 16 had real internal dependents within root `src/` itself. All 16
restored to their original locations same session; manifest entries in
`docs/archive-manifest.json` updated with `restored` timestamps and the
corrected root-cause note, following this repo's own prior
`phase101-parent-atlas-packetizer.js` incident precedent. **Whether root
`src/` as a whole is scaffold-for-future-integration or dead weight remains
an open, undecided question** — archival of any of it should not be
attempted again without first mapping the tree's full internal dependency
graph, not just its filename collisions with sveltekit-frontend.
**~12 collisions are `COMPETING_REAL`** — both sides
are genuine, differing implementations, left in place pending manual
reconciliation, NOT archived: `ace-materializer.ts`, `centroid-compression.ts`,
`ace-packet-reader.ts`, `ace-packet-validator.ts`, `ace-packet-writer.ts`
(root does inline Postgres+Redis, sveltekit-frontend delegates to
`ace-packet-store.ts` — check that file before deciding), `feature-tracking-layer.ts`
(root uses raw `pg` Pool, sveltekit-frontend uses Drizzle — sveltekit-frontend
matches convention), `cross_store_identity_verifier.ts`, `runtime-lease-manager.ts`,
`domain-classifier.ts` (classifier/, not the archived indexing/ re-export),
and a **live DB schema divergence** — `synthesis-logs.ts` schema + paired
`synthesis-logger.ts` — root uses integer PK, sveltekit-frontend uses uuid PK
with a materially different shape; do not touch either without an explicit
schema-migration review. **1 `ROOT_ONLY_VALUE`** not yet ported:
`topology-ontology.ts` root has 2 `TOPOLOGY_CLASSES` entries
(`storage_boundary`, `inference_boundary`) and 2 `DOMAIN_CLUSTERS` entries
(`documents-atlas`, `observability`) sveltekit-frontend's copy lacks — worth
porting just those array entries. **15 collisions sized but not read**
(same stub-pattern size skew as the confirmed 16, unverified): `cross-ranker.ts`,
`embedding-cache.ts`, `embedding-contract-768.ts`, `embedding-service.ts`,
`gpu-compute-pipeline.ts`, `ingest-packet-schema.ts`, `learning-loop.ts`
(flagged — root is *bigger* than sveltekit-frontend's copy here, a possible
reversal of the usual pattern, check this one first), `normalize-labels.ts`,
`openai-facade.ts`, `redis-cache-aggressive.ts`, `search-lanes.ts`,
`search-runtime.ts`, `shared-cache-api.ts`, `unified-orchestrator.ts`,
`validation-result-v1.ts`.

**G11 localhost-hardcoding hardening** (from a `/deep-audit` pass against the
existing `codebase-graph.json` index, code tier gates G1-G26). Of 61 files the
index flagged, 30 were false positives already using the correct
`ENV.X ?? 'http://127.0.0.1:PORT'` fallback pattern (or, for `api-endpoints.ts`/
`ollama-endpoint.ts`/`phase101-parent-atlas-packetizer.{js,mjs}`, ARE
themselves the canonical resolver whose final-fallback literal is correct by
design). The other 31 had at least one real unguarded hardcode; 19 files
across 21 call sites were fixed — server-side via the existing `ENV` object
in `env.server.ts` where a key existed, local `process.env.X ?? fallback`
matching established repo style where it didn't (`POLICY_RERANKER_*`,
`CRAWL4AI_URL`, `FEATURE_EXTRACTOR_URL`, `TURBOVEC_HEALTH_URL`,
`POSTGRES_HEALTH_URL`, `REDIS_HEALTH_URL`), and `$env/dynamic/public` +
`PUBLIC_*` vars for the 3 client-side `.svelte` call sites (browser code
can't read server env). One real bug caught and fixed before it shipped:
the first edit to `mcp/server.ts`'s TRACE MCP proxy would have dropped the
required `/mcp` path suffix whenever `TRACE_MCP_URL` is actually set,
breaking the request — caught by checking that env var's canonical usage
elsewhere in the same file before assuming the fix was correct. `npx tsgo
--noEmit` clean on all 19 touched files.

**Still open, not started this session**:
- G4 (44 API routes without `locals.user` auth check, 6 legitimately public
  — auth/login/logout/register/reset-password/session, health — 38 real
  gaps, 4 of them `api/admin/*` and highest-risk)
- G5 (44 mutating routes without Zod body validation)
- G20 (16 cyclic import pairs, not yet itemized)
- The ~12 `COMPETING_REAL` src/ collisions above (needs manual reconciliation,
  not mechanical)
- `topology-ontology.ts` 4-entry port
- The 15 unread src/ collisions (start with `learning-loop.ts`, the size-reversal flag)

## Neural decoder gate checkpoint (2026-08-27)

The neural decoder remains deliberately outside `packages/parent-atlas` until
the script-level proof lanes are complete. `scripts/atlas` is the current
proving ground; the decoder and DAG contracts are not yet wired to package
execution.

Current evidence:

- `atlas:graphify:neural-prefill:preflight`: `PASS`, read-only, readiness `70%`.
- `atlas:neural:prefill:shortlist:dry`: `EXECUTED_UNPROVEN`; 512 inputs,
  96 shortlist, exact semantic 768 rerank, Recall@24 `0.333`, no labeled
  NDCG proof.
- `audit-ranker-envelope-readiness.mjs`: `WARN`; active ranker and ontology
  readiness remain unresolved.
- `audit-replay-semantic-admission-v1.mts`: `PROVEN` for the comparable corpus;
  10,135 manifest rows and 10,135 scanner rows agree with zero replay-only or
  indexer-only eligible paths.
- `audit-bitfrost-semantic-cache.mjs`: `PASS` audit, but zero BitFrost,
  centroid, or SOM keys were observed.
- `audit-cache-namespace-proof.mjs`: `FAIL`; only 2 of 5 required namespaces
  were ready.
- Canonical packet/source content-hash lineage and a lineage-qualified
  CandidateOrdinal snapshot remain unproven.
- The packet-lineage census now classifies the gap: 1 packet is
  `IDENTITY_UNRESOLVED`, 60,998 are `MISSING_GRAPHIFY_SOURCE`, and 4,148
  packet/chunk joins are ambiguous; no source-level canonical packet lineage
  is currently promotable.
- The new source-reference samples show a grain/scope mismatch, not a safe
  hash-only repair: packet references include historical `.txt`/basename
  artifacts and `$lib` aliases, while Graphify-only references are current
  workspace paths such as `.claude/...`. Build an explicit canonical source
  resolver or bounded source bridge before attempting any backfill; do not
  fuzzy-join or stamp revisions.
- The representative Git/scanner/manifest oracle is recorded in
  `docs/reports/source-admission-parity-v1.json`: 3 paths are `EXACT` and 3
  are intentionally `CANONICAL_SCOPE_EXCLUDES_GIT_VISIBLE` (Git-visible
  archives or reference data excluded from the canonical code corpus). Git
  tracking is therefore an input, not the canonical admission authority.
- The corrected multi-domain census now separates packet/chunk integrity from
  source integrity: 332 packet/chunk hashes are exact, 4,148 are ambiguous,
  and all 768 Graphify rows match the workspace-observed source-byte digest.
  Graphify source-revision binding is now proven for the 768 observed rows via
  `code_source_revision`; `source_revision` remains separately recorded as
  Git/base-commit provenance.
- The packet-targeted batches have now selected and committed 640 deterministic
  missing source refs with the first-batch checksum
  `e7c1d6b32faeef6971969efc0dc13986386c0a1715a929a1f14111f6cdbf69f6`.
  Independent readback proved all three bounded batches; the initial broad
  readback failure was an accounting defect caused by a reused run identifier,
  not a source mismatch. The latest batch receipt records selection checksum
  `9946353cdf321cd79ea5558f6bd784d14fc4d3686bd8803dd6cc49b581c61ae4`,
  `latest_batch_applied=true`, and `latest_batch_readback_count=128`. The
  fourth batch used selection checksum
  `42f00214e3f7d2af6751ced04148d15c93a23dded5e5e5fc1ce6b7c15556739a`.
  The fifth batch used selection checksum
  `6bd9f922c178b04b29cca6765f6d8ce35c7b7b4eaa0aba760d191430799d859c`.
  The 44,451 value is the batch planner's observation-scope gap; the current
  packet census separately reports 60,998 packet refs without an exact
  `graphify_files.source_ref` join.
- The read-only source-reference resolver now quantifies the bridge needed
  before lineage promotion: 405 raw exact matches, 621 basename-only
  candidates, 2,665 ambiguous basename matches, and 57,968 unresolved refs.
  Basename matches remain diagnostic-only until packet/chunk content or an
  explicit canonical bridge proves identity; no fuzzy resolver is authorized.
- The next lineage implementation gate is therefore a read-only canonical
  source-ref bridge design, not another Graphify batch. It must classify each
  proposed mapping as exact, content-proven, explicit-bridge, ambiguous, or
  unresolved and preserve the source-level versus packet/chunk hash domains.
- The read-only source-reference resolver audit is recorded in
  `docs/reports/graphify-source-ref-resolution-v1.json`: 405 raw exact refs,
  621 basename-only candidates, 2,665 ambiguous basename candidates, and
  57,968 unresolved refs. A separate exact packet-hash → chunk-hash →
  Graphify-source bridge is available for 39 packet identities. Basename and
  normalized matches remain diagnostic only; only exact refs or this
  independently verified bridge can enter the promotion path. The next
  implementation gate is a canonical resolver for historical aliases, not
  fuzzy backfill.
- Decoder training and Parent Atlas package integration remain blocked.
- The new packet-source coverage classifier records 17,208 packet refs that
  match the current workspace observation exactly, of which 405 are already
  present in Graphify and 16,803 are eligible missing sources for a future
  bounded batch. It also records 2,854 normalized aliases, 5,230 ambiguous
  candidates, 970 historical-artifact refs, 2,862 non-canonical-scope refs,
  and 32,535 unresolved refs. The eligible missing-source count is now 16,675;
  the refreshed selection checksum is
  `cf23888c4970b2f4514dc2bdf1467eb0efa4292c34c81865e9393807c589af90`.
- The existing `audit-candidate-corpus-lineage-v1.mjs` remains diagnostic-only:
  it reports 4,951 candidates but assigns the prohibited fallback
  `workspace-active-v1` and derives `graph-tree:<tree_node_id>` as a graph
  revision. That receipt must not seed CandidateOrdinal promotion. A new
  cohort producer must join exact packet/source refs to `graphify_files` and
  carry the measured workspace/source revisions without fallbacks.
- The new exact-join cohort audit finds 661 packet rows joined to Graphify,
  128 with the repaired `graphify_files.workspace_revision`, and 11 with
  exact source-plus-packet/chunk identity. The writer now persists and reads
  back workspace revision; the remaining cohort blocker is explicit graph
  revision ownership. No synthetic workspace revision or tree-node graph
  revision may fill that gap.
- An existing structural graph receipt is not compatible with this cohort:
  it uses `workspaceRevision=ws:0084288f26` and
  `graphRevision=graph:ws:0084288f26`, while the current source manifest is
  SHA-256 revision `sha256:b19b04...`. Reuse is therefore rejected until a
  graph snapshot is rebuilt and independently bound to the current workspace
  revision.
- The current-revision structural graph proof was run with the SHA-256
  workspace revision and produced a deterministic empty, non-authoritative
  artifact: 62,802 hyperedges and 603 feature relationships were read, but
  all 63,405 kernels were excluded for workspace-revision mismatch. This
  proves the graph projector path, not graph evidence for the current cohort;
  relationship revision ownership must be repaired before PPR or graph
  features can enter CandidateOrdinal.
- `GraphRevisionV1` is now fixture-proven in
  `scripts/atlas/prove-graph-revision-v1.mjs`: relationship order is invariant,
  relationship addition and workspace changes alter the digest, and mixed
  workspace or missing-checksum kernels are rejected. The production snapshot
  builder now requires explicit workspace/candidate/ordinal inputs, rejects a
  caller-supplied graph revision, and derives `graphRevision` from the included
  relationship kernel set. The current live rebuild derived an empty,
  deterministic graph revision because all 63,405 available kernels remain
  historical.
- The read-only `SourceRefBindingCandidateV1` audit now confirms that the
  existing `atlas_source_refs` registry has 22,487 rows, but it is not yet an
  approved alias/binding authority. It classifies packet refs as 17,208
  `EXACT`, 855 `NORMALIZED_EXACT` review candidates, 2,548 `AMBIGUOUS`, and
  41,048 `UNRESOLVED`. Only exact current-workspace bindings are promotable;
  normalized matches remain review-only until an explicit durable alias
  relation is approved. Report: `docs/reports/source-ref-binding-v1.json`.
- The binding audit does not write `atlas_source_refs`, `atlas_packets`, or
  Graphify rows. It establishes the missing relational boundary: packet ref →
  canonical source → observed `sourceRevision` and `workspaceRevision`.
  `atlas_packets.source_revision` is not required when that revision is
  derived through the proven source binding.
- The graph-revision owner audit identifies the current stale producer values:
  all 62,802 `atlas_hyperedges` rows carry `workspace_revision=git:0084288f26`
  and `graph_revision=taxonomy-edges-v1-2026-05-08`, while the current source
  observation is `sha256:b19b04...`. The 24 `graph_analysis_runs` rows use
  `workspace:parent-atlas`, also not the current observation. This is an owner
  and materializer alignment problem, not evidence that the relationship rows
  are current. Report: `docs/reports/graph-revision-owner-v1.json`.
- The four-layer source-lineage audit confirms that `atlas_source_refs` is a
  stable-identity layer with 22,487 rows and Graphify is a proven source-version
  observation layer with 768 rows. The durable alias relation and the
  workspace-scoped source-binding relation are both absent. A read-only current
  projection joins 661 packet rows to Graphify, but only 128 currently carry
  the active workspace revision. Report: `docs/reports/source-lineage-model-v1.json`.
- The same audit found `0/768` Graphify source refs currently overlap the
  `atlas_source_refs.source_ref_key` registry. The proposed foreign keys are
  structurally valid, but applying the migration before reconciling these
  identity namespaces would create no usable binding rows. Identity
  reconciliation is therefore required before migration application.
- The PostgreSQL FTS receipt is operational but not aligned: the
  `compute_codebase_chunk_search_vector` producer is detected, the
  `search_vector` GIN index is present, but the document producer is `MIXED`
  while the query lane uses `english` (`configurationAligned=false`). This is
  an independent lexical-lane gate and does not weaken or redefine the
  canonical `semantic_768` representation. Report:
  `docs/reports/postgres-fts-configurations-v1.json`.
- The `MIXED` FTS result is explained by the producer definition: natural
  language fields use `english`, while AST identifiers/imports/exports use
  `simple`. Preserve this dual-tokenization for now; do not replace the whole
  vector with one dictionary. A future identifier lane may justify a second
  vector, but that requires a focused benchmark and separate index ownership.

Required order before package promotion:

1. Approve the source-binding authority and explicit aliases; do not promote
   normalized, basename, suffix, or fuzzy matches.
2. Repair or identify the relationship graph-revision owner, then rebuild a
   current-workspace graph snapshot; do not derive graph revision from a
   tree-node ID.
3. Prove packet-to-Graphify source and content-hash lineage; do not mass-stamp
   workspace revisions.
4. Produce a revision-qualified CandidateOrdinal snapshot and complete feature
   matrix input.
5. Run labeled held-out ranking evaluation; the current synthetic exact-rerank
   receipt is diagnostic only.
6. Prove Valkey prefill MISS/HIT replay and required namespace readiness.
7. Replay deterministic DAG templates through the script-level validator.
8. Only then wire the proven pure contracts into `packages/parent-atlas`.
9. Train or benchmark a neural decoder challenger last, behind explicit
   approval and promotion gates.

The pure DAG authority boundary is now fixture-proven in
`scripts/atlas/prove-kernel-dag-validator-v1.mjs`. `KernelDagCandidateV1`
is non-authoritative and non-executable; the validator binds it to frozen
kernel, lineage, runtime-capability, permission, and budget inputs before
`TypedRepairDagV1` can be constructed. The fixture covers acceptance plus
cycle, unknown function, forbidden relation, stale candidate/graph ordinals,
revision mismatches, missing evidence, argument-schema failure,
unauthorized mutation, missing validator, unavailable runtime capability, and
budget overflow. Report: `docs/reports/kernel-dag-validator-v1.json`.

This remains `PROVEN_FIXTURE_ONLY`: live lineage-qualified CandidateOrdinal,
live runtime capability evidence, live tool execution, and a trained neural
decoder are not proven. AST identifier tokenization remains separate from
English FTS tokenization, and `semantic_768` remains unchanged.

The ReAct role is bounded exception replanning only. OaK remains the frozen
typed kernel, and the neural decoder remains a proposal generator rather than
an execution authority.

### DAG incubation evidence

`node scripts/atlas/prove-frozen-dag-v1.mjs` is now `PROVEN` for the isolated
read-only fixture. It proves deterministic node/edge ordering, reversed-input
checksum invariance, acyclicity, topological generations, ready-set
derivation, execution-state replay, and the orthogonal mutation transitions
through `ROLLED_BACK`. Generation semantics are explicitly
`longest_dependency_distance_from_source`. The current DAG checksum is
`2a74d304f27f0f98cc4e84548f645658bdf89d337faa6a5c2cf17a442d520584`. This does not yet
prove the append-only PostgreSQL event projection, live bounded replay, or
neural DAG quality. Those remain promotion gates.

The existing Parent Atlas temporal ledger, runtime, and PostgreSQL repository
fixture suites also passed 16/16 tests. This proves the fixture-level event
and projection substrate; it does not prove live database readback or neural
decoder promotion.

Replay admission is now `PROVEN` for the full comparable code corpus:
`admittedByBoth=10135`, `replayOnlyEligible=0`, and
`indexerOnlyEligible=0`. The receipt is read-only and remains limited to the
scanner-comparable extensions; it does not prove packet lineage, ranking
quality, Valkey MISS/HIT behavior, or decoder readiness.
