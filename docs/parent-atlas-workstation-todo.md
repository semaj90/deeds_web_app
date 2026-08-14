# Parent Atlas workstation status and deferred integration queue

Updated: 2026-08-14

The percentages below are planning estimates for the workstation roadmap. They are not substitutes for the explicit `PROVEN`, `PASS`, `DEGRADED`, or `NOT_PROVEN` gates in the OpenSpecs.

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

**Heuristic workstation estimate: 68%.** The primary remaining correctness gap is grounded execution with durable receipts, not missing GPU packages.

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
Repository reachability review also found no live caller currently emitting
`CandidateFeatureMatrixRowV1`; the schema and in-memory matrix builder exist,
but producer wiring is not proven. This remains the next implementation gate,
not a reason to create a second QAS feature store.
The bounded producer function now calls the existing matrix builder and rejects
incomplete presence-mask rows before QAS adaptation. A live SearchRuntime call
site is still required; the producer function alone is not production proof.
The existing Atlas SearchRuntime adapter now exposes a read-only projection
helper for that call site; it still requires an external feature projection and
identity/revision resolver.
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
