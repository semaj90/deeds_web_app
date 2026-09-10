# Parent Atlas — Transport, Memory, and Structural Boundaries

## Classification backlog

- [ ] **PROTO-01** Freeze the transport ownership matrix for tRPC, gRPC, MCP, ACP, and A2A; record current callers and reject duplicate bus ownership.
- [ ] **PROTO-02** Audit all active sidecar transports, including HTTP, gRPC, N-API, and spawned CLI paths; assign each to exactly one owner or mark it legacy/experimental.
- [ ] **PROTO-03** Declare gRPC canonical for native polyglot compute only: Node, Python, Rust, C/CUDA, RAPIDS, TurboVec, and simdjson services.
- [ ] **PROTO-04** Declare tRPC optional for TypeScript application-local control surfaces: SvelteKit UI, Kanban, recommendations, and receipts.
- [ ] **ACP-01** Define the Parent Atlas coding-agent ACP boundary for editor sessions, permissions, tool actions, patches, terminal output, and progress.
- [ ] **ACP-02** Map ACP session/task/action identifiers to existing `runId`, `taskId`, `ContextManifest` hash, and `ExecutionReceipt`; ACP must not own graph identity.
- [ ] **A2A-01** Add a Parent Atlas AgentCard only after single-agent execution and receipts are proven.
- [ ] **A2A-02** Map A2A task/message/artifact identifiers to existing task, run, receipt, and provenance records.
- [ ] **A2A-03** Prohibit exposing canonical Postgres/Graphify operations as peer-agent writable state.
- [ ] **MEM-01** Freeze the three-memory taxonomy: llama KV prompt cache, BitFrost/Valkey hot memory, and Postgres durable semantic/canonical memory.
- [ ] **MEM-02** Keep `ContextManifest` as the reproducible model-context boundary; KV cache reuse is an optimization and never durable truth.
- [ ] **MEM-03** Prove revision-qualified BitFrost keys and fail-open behavior across workspace, policy, graph, and representation revisions.
- [ ] **STRUCT-01** Use Tree-sitter CST named-node projection for compact structural memory; do not create a canonical CAST subsystem.
- [ ] **STRUCT-02** Define `StructuralMemoryCard` as derived evidence containing canonical IDs, source span, typed relationships, syntax status, and representation revision; upstream Tree-sitter node IDs remain provenance.
- [x] **STRUCT-03** Define one language-extension registry for TypeScript (`.ts/.tsx/.mts/.cts`), JavaScript (`.js/.jsx/.mjs/.cjs`), Python (`.py/.pyi`), Rust (`.rs`), Go (`.go`), and Java (`.java`); unsupported extensions stop at explicit classification. Live 8095 probe passed.
- [x] **STRUCT-04** Normalize failures into typed diagnostics: `ChunkingError` for parse/extraction failure and `UnsupportedLanguageError` for unsupported extensions; preserve source revision and file path without fabricating evidence. Live unsupported-language probe passed; parse-failure parity remains tracked by STRUCT-05/GPH-15.
- [ ] **STRUCT-05** Preserve Tree-sitter `ERROR`/`MISSING` syntax evidence in `syntaxStatus` (`CLEAN` or `RECOVERED_WITH_ERRORS`) separately from canonical identity validity. `ERROR` detection is live-proven; a dedicated `MISSING` fixture remains to be added.
- [ ] **STRUCT-06** Evaluate `supermemoryai/code-chunk` only as a contextual chunking/reference implementation; its chunk IDs and memory graph cannot become Parent Atlas canonical identity or truth.
- [ ] **STRUCT-07** Prove the bounded path `CST named nodes → structural evidence → GIS identity → Postgres packet → semantic_768 projection`; no direct chunker writes to Qdrant or Neo4j.
- [ ] **CC-01** Audit `supermemoryai/code-chunk` output against `StructuralChunkV1`: scope chain, entities, signatures, imports, siblings, byte/line ranges, contextualized text, and per-file errors.
- [ ] **CC-02** Benchmark contextual structural metadata against the current treesitter-chunker evidence on a fixed corpus; record symbol localization and repair-localization Recall@10/MRR without changing identity.
- [ ] **CC-03** Classify code-chunk as `EXPERIMENTAL_CONTEXT_ENRICHER` or `REPLACEMENT_CANDIDATE`; it must not become a second canonical Graphify/GIS/SearchRuntime owner.
- [ ] **CC-04** Feed code-chunk-style context into the existing SemanticCard compiler only after GIS identity assignment; contextualized text is representation input, never identity.
- [ ] **CC-05** Prove batch failure isolation and bounded concurrency: one file may return `ChunkingError` while other files complete and the Graphify receipt counts each result.
- [ ] **HG-01** Map process/repair/execution n-ary events to the existing hypergraph owner using event provenance, not duplicate binary graph truth.
- [ ] **HG-02** Keep hypergraph expansion after canonical retrieval as additional evidence; SearchRuntime remains the only candidate fusion owner.
- [ ] **HG-03** Preserve hyperedge participants, task/run IDs, revisions, selected packets, tests, and receipts without promoting event IDs to packet identity.
- [ ] **MEM-04** Define a CAST-like `TaskScene` episodic record around request/task/workspace revision, actors, evidence, actions, outcome, `ContextManifest`, `RLMTrace`, and `ExecutionReceipt`; reserve CAST-like for episodic memory.
- [ ] **MEM-05** Model temporal semantic relationships as provenance-owned `UPDATES`, `EXTENDS`, and `DERIVES` observations while preserving superseded history.
- [ ] **MEM-06** Keep semantic, episodic, and procedural memory separate: Atlas packets/graph, TaskScene/RLMTrace/receipts, and ACE playbooks/policy revisions; BitFrost/Valkey remains cache only.
- [ ] **SIMD-05** Benchmark simdjson only on metadata JSON/JSONL paths such as receipts, snapshots, and traces; retain Zod/Pydantic/TypeScript schemas as semantic authorities.
- [ ] **TV-01** Restrict TurboVec to the canonical `semantic_768` representation and its own exact oracle.
- [ ] **TV-02** Map TurboVec stable external IDs/ordinals back to canonical Atlas identity; never promote TurboVec local IDs to packet identity.
- [ ] **TV-03** Prove TurboVec filtering parity with the canonical `SearchFilter` contract.
- [ ] **TV-04** Treat TurboVec, Qdrant, and future CAGRA as one logical dense lane with one SearchRuntime fusion contribution.
- [ ] **TV-05** Define one `DenseExecutor` seam for `semantic_768`, query vectors, allowed ordinals, `k`, and index revision; Qdrant, cuVS exact, TurboVec, and CAGRA are interchangeable executors, not separate fusion lanes.
- [ ] **TV-06A** Prove `TURBOVEC_EXECUTION_OWNER_PROVEN`: select one live transport and classify HTTP, gRPC, Rust N-API, and spawned CLI paths as primary, compatibility, deprecated, or rollback before building a TurboVec index.
- [ ] **GRAPH-01** Prove bounded graph expansion: seed cap, explicit max depth, per-seed neighbor limit, visited canonical packet dedupe, final candidate cap, and fail-open behavior. Graph expansion supplies evidence only; it must not become a standalone ranking or fusion owner.
- [ ] **GRAPH-02** Prove vector-seed expansion: semantic top-K canonical symbols → depth-limited typed edges → canonical-ID dedupe; PageRank remains a feature and hypergraph events remain additional evidence.
- [ ] **GDS-01** Classify the Python `graphdatascience` client as a graph-algorithm executor only; Neo4j remains the structural graph projection and Postgres remains canonical truth.
- [ ] **GDS-02** Run revision-qualified PageRank/community algorithms from the canonical Neo4j projection and emit derived feature records keyed by `symbol_version_id`/`workspace_revision`.
- [ ] **GDS-03** Prove derived graph features enter `FeatureMatrixRow`/`RetrievalFeatureRow` without becoming a second ranker, embedding component, or RRF lane.
- [ ] **GDS-04** Keep CPU Neo4j GDS and optional cuGraph comparisons on the same graph snapshot; record parity and runtime without promoting either implementation to identity ownership.
- [ ] **ROUTE-07** Prove hot/warm/cold tier transitions with revision-qualified cache keys, fail-open behavior, and no truth mutation when Valkey entries are stale or missing.
- [ ] **LEX-01** Freeze one logical lexical lane: BM25 baseline first; BM42 is an alternative executor only after a sparse collection and sparse identity round trip exist.
- [ ] **TV-06B** Prove the ordinal map from TurboVec external IDs to `symbol_version_id`, `packet_key`, and `workspace_revision`; local numeric IDs never become canonical identity.
- [ ] **TV-07** Prove filtered dense-search parity using the canonical `SearchFilter` and ordinal allowlist/bitset; retain one logical dense contribution per canonical entity.
- [ ] **RPC-01** Use gRPC control messages plus Arrow/mmap immutable bulk tensor transport for GPU/vector compute; do not send large tensor payloads through tRPC or MCP.
- [ ] **RPC-02** Freeze a small typed `BuildIndexRequest` control contract containing snapshot, representation, ordinal-map revisions, mmap path, dimensions, and vector count.
- [ ] **RPC-03** Prove Arrow/mmap is the bulk semantic-vector transport before sending large tensors through JSON, tRPC, MCP, or protobuf messages.
- [ ] **RLM-01** Keep `RLMEnvironment`, `RLMTrace`, budgets, and recursive evidence navigation internal to Parent Atlas; expose agent behavior through ACP/A2A only after their gates pass.
- [ ] **ACE-INJ-01** Compile RLM retrieval and optional hypergraph evidence into the existing `ContextManifest` and bounded ACE packet; never inject raw unranked results.
- [ ] **ACE-INJ-02** Link `ContextManifest`, model execution, `ExecutionReceipt`, and a CAST-like `TaskScene` by immutable revision/hash fields.
- [ ] **ACE-INJ-03** Feed validated execution outcomes into ACE Reflector/Curator only after receipt and provenance gates pass; policy updates cannot rewrite canonical graph truth.

## Architecture review — 2026-08-14

The reviewed workstation split is now explicit: Postgres owns canonical
revisions, identities, receipts, ontology tuples, and ACE state; Qdrant owns
persistent dense/sparse/multivector projections; cuVS brute force is the exact
`semantic_768` oracle; CAGRA is an optional executor; Neo4j supplies bounded
structural expansion and PageRank evidence; Valkey stores revision-qualified
hot routing, centroid buckets, manifests, and ACE packets only.

### Three-plane boundary

```text
TRUTH
  Postgres + canonical graph + grounded observations

RETRIEVAL
  Qdrant + exact cuVS + optional CAGRA/TurboVec + lexical executor + graph expansion

MEMORY/ROUTING
  Valkey/BitFrost + KMeans/SOM routing metadata + ACE/context cache
```

KMeans answers “which region should be searched”; KNN/CAGRA answers “which
vectors are nearest”; graph expansion supplies relational evidence; hypergraph
expansion supplies bounded multi-entity process evidence; SOM is optional
topology-preserving routing/visualization. None of these may become a second
canonical identity or fusion owner.

The runtime temperature policy is explicit:

```text
HOT   Valkey packets, ACE cards, centroid hints, cached candidate lists
WARM  Qdrant dense retrieval, approved lexical executor, bounded graph expansion
COLD  Postgres/source reconstruction, immutable Arrow/mmap snapshots, broader evidence
```

Temperature controls retrieval breadth, not truth. Cache misses, stale
revisions, and unavailable executors must fail open to the next eligible tier.
The current live Qdrant collection has no sparse vector, so the WARM lexical
branch is baseline-only until a separate BM42 sparse schema and identity proof
exist.

KMeans and a 20x20 SOM are routing/visualization metadata derived from
`semantic_768`, not canonical identity or independent retrieval votes. BM42
remains deferred until a sparse collection and sparse identity round trip are
proven. Arrow IPC/mmap is the preferred bulk vector snapshot boundary for a
future Go/cuVS reader; hashes identify snapshots, while vectors remain binary
float data rather than hexadecimal text.

Current reviewed gates: exact cuVS live fixture `PROVEN`; CAGRA tiny-fixture
runtime and Recall@3 `PROVEN`, production `QUARANTINED`; graph bounded
expansion `OPEN`; TurboVec transport owner `OPEN`; LangExtract grounding and
live Graphify owner integration remain upstream correctness gates.

## Sequencing

1. GPH-13 parse-failure parity and CHUNK0 ownership closure.
2. AR-04 through AR-07 bounded RLM safety and deterministic receipt.
3. PROTO-01/02 transport audit.
4. ACP-01/02 coding-agent boundary.
5. A2A-01/02 only after independent-agent delegation is real and needed.
6. MEM, STRUCT, SIMD, TurboVec, and gRPC bulk-transport proofs as bounded lanes.

## Current lane state

- `PROTO-01`: `IN_PROGRESS` — ownership matrix not yet closed.
- `PROTO-02`: `IN_PROGRESS` — duplicate transport audit not yet closed.
- TurboVec HTTP, gRPC, N-API, and spawned-CLI evidence: historical capability evidence; no live transport promotion.
- ACP packet artifacts: capability evidence only; no proven editor-agent session.
- A2A: not started; no independent-agent delegation requirement has been proven.
- `STRUCT-03/04`: implementation is live in the rebuilt `miniforge-nlp-sidecar`; supported TypeScript returned `CLEAN` with chunks and unsupported `.txt` returned `UnsupportedLanguageError` with a diagnostic. Python syntax and client tests pass.
- `STRUCT-05`: syntax recovery is represented in the response contract; live malformed-source `ERROR` detection is proven, while a dedicated `MISSING` node fixture remains open.
- Runtime mutations from this OpenSpec: none.

## Existing evidence boundary

- `docs/reports/transport-pressure-audit.{json,md}` is historical evidence only: it records TurboVec HTTP/MCP reachability on `:8791`, but its RabbitMQ port data predates the current published-port contract and must not be reused as current configuration truth.
- `docs/reports/turbovec-sidecar-contract.json` proves an earlier bounded dual HTTP/gRPC contract (`grpcHealth`, transform, encode, SOM, batch cosine, and search all passed); it does not select a canonical production transport or authorize a migration.
- `sveltekit-frontend/scripts/atlas/audit-acp-packet-transport.mjs` is an existing packet audit owner, not evidence that ACP is a live editor-agent protocol boundary.
- A fresh PROTO-01/PROTO-02 audit must record endpoint, caller, owner, live status, and lifecycle (`CANONICAL`, `COMPATIBILITY`, `EXPERIMENTAL`, or `LEGACY`) before any transport is promoted.

## Promotion gates

- `TRANSPORT_OWNER_MATRIX_PASS`
- `NO_DUPLICATE_SIDECAR_BUS_PASS`
- `MEMORY_TAXONOMY_PASS`
- `TREE_SITTER_CST_BOUNDARY_PASS`
- `CANONICAL_IDENTITY_NOT_UPSTREAM_PASS`
- `TURBOVEC_SEMANTIC_768_PASS`
- `TURBOVEC_FILTER_PARITY_PASS`
- `ACP_RECEIPT_LINK_PASS`
- `A2A_RECEIPT_LINK_PASS`

No task in this change may promote CAGRA, change RRF semantics, or alter canonical identity ownership.

## Structural CST/AST retrieval lane — 2026-08-28

The retrieval fabric is now explicitly modeled as lexical, sparse, dense,
structural CST/AST/symbol, graph, and optional late-interaction lanes. Tree-sitter
owns syntax/CST evidence; ast-grep owns structural matching; PostgreSQL remains
canonical identity/revision authority; SearchRuntime remains the single RRF owner.
Structural results must resolve to `CandidateOrdinal` before fusion.

- [x] **STRUCT-08** Define and export `StructuralQueryPlanV1` with deterministic
  query digest, literal terms, target symbols, node-kind hints, structural
  predicates, and CST/AST/signature mode. The plan is non-authoritative and
  non-executable until an executor is proven.
- [x] **STRUCT-09** Add fixture validation proving `canonicalAuthority=false` and
  `executable=false` for structural query plans.
- [x] **STRUCT-10A** Implement a read-only observation query adapter consuming
  `StructuralQueryPlanV1`; preserve source references, source revisions, byte
  spans, captures, and extractor revisions. The adapter is deliberately not a
  parser process, identity resolver, projection writer, or CandidateOrdinal
  assigner.
- [ ] **STRUCT-10B** Add the live Tree-sitter/ast-grep parser-process executor
  behind the observation adapter; preserve grammar revision and source bytes in
  its receipt.
- [ ] **STRUCT-11** Resolve structural observations through the existing Atlas
  identity bridge to `packetKey`, `canonicalId`, and `CandidateOrdinal`; reject
  unresolved, ambiguous, stale, or mixed-workspace results.
- [ ] **STRUCT-12** Emit a lane-local structural result envelope with rank/score
  diagnostics only; do not compare structural scores directly with dense or
  lexical scores.
- [ ] **STRUCT-13** Feed the structural lane into the existing SearchRuntime
  identity-resolution and RRF path as one logical contribution; do not add a
  second fusion owner or a second canonical writer.
- [ ] **STRUCT-14** Define `AtlasStructuralSparseV1` as a derived deterministic
  feature representation for symbols, node kinds, CST/AST paths, calls, imports,
  type references, grounded concepts, and evidence classes. Do not label it SPLADE
  unless a learned SPLADE-style producer is actually implemented and evaluated.
- [ ] **STRUCT-15** Prove bounded structural queries for declaration, call, import,
  implementation, and revision/checksum lookup on a fixed source corpus.
- [ ] **STRUCT-16** Add structural-vs-lexical-vs-dense ablation receipts with exact
  CandidateOrdinal deduplication before RRF; no topology, ColBERT, TurboVec, or
  PyTorch classifier is a prerequisite for this gate.

### Current structural-lane status

- Query-plan contract: `PROVEN_FIXTURE`.
- Tree-sitter/ast-grep observation adapters: present and separately tested.
- Observation query adapter: `PROVEN_FIXTURE` (`STRUCT-10A`).
- Live Tree-sitter/ast-grep parser-process executor: `OPEN` (`STRUCT-10B`).
- Exact-only structural identity bridge: bounded live proof passed against the
  15-row lineage-qualified map; one JavaScript source resolved exactly with
  `candidateOrdinal=0` under checksum
  `86fee5d38619d3065d8710942068f26fb5b0d3c09992b1b523083ae0a593d297`.
  Full-corpus identity resolution remains open (`STRUCT-11`).
- Structural lane-local result envelope: implemented and fixture-covered;
  scores remain diagnostic-only and `fusionReady=false` (`STRUCT-12`).
- SearchRuntime bridge: implemented as a DI adapter over the existing `ast`
  logical lane; exact identities only, deterministic deduplication, and no
  second fusion owner. Focused integration tests remain to be run (`STRUCT-13`).
- Structural hit coordinates now carry nullable `astGraphRevision` and
  `compilerSemanticGraphRevision`, plus `patternId`, `patternRevision`, and
  `scoreClass`; missing graph coordinates remain non-promotable rather than
  being substituted with a tree-node or relationship revision.
- Feature-gated live provider now exists with an explicit `sourceRefs` allowlist,
  current source loader, existing 8095 client, exact identity bridge, and
  existing SearchRuntime `ast` lane projection. Default production composition
  remains unchanged until a caller supplies a current candidate map (`STRUCT-13`).
- `StructuralProviderV1` contract and `legacy | shadow | structural` mode
  resolver are now defined with bounded budgets and a non-authoritative receipt;
  default mode remains `legacy` until shadow parity is proven.
- Shadow parity receipt is implemented: legacy remains the sole RRF contributor;
  structural-only, legacy-only, overlap, stale, ambiguous, and unresolved counts
  are recorded deterministically (`STRUCT-13D`).
- `STRUCT-13E` coverage audit is implemented and read-only: the current 15-source
  CandidateOrdinal cohort has 15 packet rows but 0 legacy `function_symbol` rows;
  legacy structural coverage reconciliation is required before `STRUCT-14`.
- Structural projection planning is now available as a read-only 15-source plan;
  code-capable sources produced 16 observations, while 8 non-code/document sources
  were explicitly reported as unsupported. No legacy packet rows were populated.
- Added an additive idempotency contract for future structural projection rows:
  nullable `projection_key` plus a partial unique index. The migration is not applied;
  existing structural facts remain untouched until the normal migration process runs.
- Added and tested `GraphNodeKeyV1`: canonical symbol/packet/chunk identities are
  preferred, exact source occurrences are projection-only fallbacks, and `treeNodeId`
  is not an identity source.
- Added a thin graph algorithm registry that delegates PageRank, Katz, K-truss,
  cuVS, cuML, and related execution to library backends; Atlas retains policy,
  identity, revisions, and receipts rather than reimplementing algorithms.
- Added revision-qualified `GraphAlgorithmExecutionReceiptV1` binding the selected
  policy decision to graph/workspace/ordinal checksums and library revision; focused
  receipt tests pass and the receipt remains non-executing/non-authoritative.
- Graph expansion now attaches that receipt when callers provide complete graph,
  workspace, ordinal-map, and library revision coordinates; incomplete requests
  remain backward-compatible but produce no falsely qualified receipt.
- Added `GraphOrdinalMapV1` with deterministic graph-node sorting, dense executor
  ordinals, revision binding, checksum, duplicate rejection, and reverse lookup;
  it remains distinct from CandidateOrdinal and upstream/tree node IDs.
- Added `GraphOrdinalEdgeCompilerV1` so NetworkX/cuGraph can consume the same
  identity-keyed topology; unknown nodes, disallowed self-loops, and invalid
  weights fail closed. Focused ordinal/edge tests pass.
- Added `GraphOrdinalParityInputV1` to package one revision-bound ordinal map and
  compiled edge list for independent CPU/GPU execution; focused parity-input tests
  pass and the artifact remains non-authoritative/non-persistent.
- Live `:8095 /ast/chunk` -> observation-query proof runner: available;
  execute `scripts/atlas/prove-structural-query-live-v1.mjs` to establish the
  live receipt. This remains non-authoritative until `STRUCT-11` identity
  resolution succeeds.
- Go `LaneAST`: declared, but currently unsupported by the live lane service.
- Structural sparse representation: `OPEN`.
- CandidateOrdinal bridge and RRF integration: `OPEN`.
- ColBERT/late interaction, TurboVec, AVX2, simdjson, PyTorch/logistic
  classification, Arrow/mmap, ACP/A2A, and Mastra remain downstream or optional
  lanes and must not block structural query-plan acceptance.

## Re-verification pass (2026-09-05, read-only) — orphaned "temporal" sub-thread found

The "Classification backlog"/"Current lane state"/"Structural CST/AST retrieval lane" sections
above are self-consistent and show no drift from re-checking a sample of their claims. **A separate
finding, not previously flagged anywhere in this file**: this change's own directory contains 11
`temporal-*.md` companion documents (`temporal-action-ledger.md`,
`temporal-action-alternative-execution-addendum.md`, `temporal-action-recommendation-addendum.md`,
`temporal-dag-persistence-negative-control.md`, `temporal-dag-proof-harness.md`,
`temporal-live-postgres-alternative-loop-proof.md`, `temporal-post-dispatch-proof-addendum.md`,
`temporal-post-dispatch-recorder-addendum.md`, `temporal-recommendation-history-addendum.md`,
`temporal-recommendation-outcome-addendum.md`) covering a "Temporal Action Ledger / DRY Agent
Runtime" workstream — durable procedural execution history, LangGraph DAG proof harness,
alternative-action-selection and recommendation-outcome receipts. **None of these 11 files are
referenced anywhere in this `tasks.md` or in `proposal.md`** (`rg "temporal"` against both returns
only one unrelated hit — `MEM-05`'s passing mention of "temporal semantic relationships", a
different concept). This is thematically adjacent to but distinct from this change's actual scope
(transport/memory/structural boundaries) and appears to be orphaned rather than intentionally
scoped here — flagged per this repo's "record what you found, even when you don't fix it" rule
(CLAUDE.md's Duplication Prevention §6), not resolved.

**Self-reported status ladder across the 11 files** (by file mtime, oldest first — all dated
2026-08-21 except the last, 2026-08-31):
`temporal-action-ledger.md` / `-action-alternative-execution-addendum.md` /
`-action-recommendation-addendum.md` / `-post-dispatch-recorder-addendum.md` /
`-recommendation-history-addendum.md` → `IMPLEMENTED_UNPROVEN`;
`-dag-persistence-negative-control.md` / `-dag-proof-harness.md` /
`-live-postgres-alternative-loop-proof.md` → `WRITTEN_UNPROVEN`;
`-post-dispatch-proof-addendum.md` → `PARTIAL_PROVEN` (11/11 gates, 2 real bugs found+fixed along
the way); **most current**, `-recommendation-outcome-addendum.md` (mtime 2026-08-31, 10 days after
the others) → `PARTIAL_PROVEN` (12/12 gates verified live, with 2 disclosed remaining caveats:
`DAG-02`'s "selected edge reaches terminal failure" clause, and a shared "K1-seeded not forced live"
caveat). Not independently re-verified against live code/DB in this pass — only the files' own
self-reported status headers were read; a future session picking this up should decide whether to
(a) cross-link these into this file's own task list, (b) split them into their own OpenSpec change
given they're a distinct workstream, or (c) confirm they're already superseded/subsumed elsewhere
before doing either.

## TEMPORAL-CANONICAL-SUPERSESSION-01 (2026-09-09)

- [x] Contract seam added in `packages/parent-atlas/src/core/temporal-supersession-fabric-v1.ts`.
  It separates logical artifact identity from version identity, validates lifecycle states and
  supersession relations, and computes a deterministic current-owner decision.
- [x] Fail-closed fixture proves one active version yields `PROVEN_CURRENT_OWNER` and two active
  versions yield `AMBIGUOUS_CURRENT_OWNER`.
- [ ] Git CRUD ingestion, append-only cross-domain event projection, agent-action linkage,
  temporal query intent, prefill masks, cache invalidation, tournament winner lifecycle, and live
  Postgres readback remain open. `workspaceRevision` is intentionally not synthesized here.

Evidence: `packages/parent-atlas/test/temporal-supersession-fabric-v1.test.ts`.
This is contract/fixture proof only; no canonical lifecycle rows were written.

### TEMPORAL-SCHEMA-SURFACES-AUDIT-01 (2026-09-09)

- [x] Added `scripts/atlas/audit-temporal-schema-surfaces-v1.mjs` and
  `npm run atlas:temporal:schema:audit`.
- [x] Read-only live inventory found all six required tables present and all
  requested indexes present.
- [x] Null workspace revisions are explicitly accepted by this audit while
  snapshot/tournament admission remains unresolved.
- [x] Corrected the audit against the live schema: `semantic_lifecycle_events`
  uses `previous_state` and `new_state`, not a generic `lifecycle` column.
  Recommendation status must not be silently substituted for those states.

Evidence: `docs/reports/temporal-schema-surfaces-v1.json`.

### TEMPORAL-CURRENT-OWNER-PROJECTION-01 (2026-09-09)

- [x] Added the read-only event-to-current-owner projection audit over the
  existing `semantic_lifecycle_events` table.
- [x] The projection reports latest lifecycle, event count, active-event count,
  latest event identity, revision binding, and ambiguity without writing a
  materialized table.
- [x] Live read-only result: `CURRENT_OWNER_NOT_PROVEN_NO_EVENTS`; the table is
  reachable but contains 0 lifecycle events, so no current owner can be claimed.
- [ ] This does not yet establish canonical supersession authority: event
  provenance, explicit replacement targets, agent-action linkage, and current
  workspace revision remain incomplete.

Evidence: `docs/reports/temporal-current-owner-projection-v1.json`.

Recheck (2026-09-09): `npm run atlas:promotion:gates`,
`npm run atlas:temporal:schema:audit`, and
`npm run atlas:temporal:current-owner:audit` remain read-only. The six temporal
tables and required columns are present (`6/6`, zero missing), while the live
ledger still has `0` events and `0` entities. Consolidated promotion remains
`BLOCKED` at `CURRENT-SOURCE-TERMINAL-EXECUTION-01` with
`WORKSPACE_REVISION_UNBOUND_UNTIL_TOURNAMENT`; no authority or writes claimed.

### TEMPORAL-EVENT-CANDIDATE-COMPILER-01 (2026-09-09)

- [x] Added a read-only bounded compiler from current `atlas_packets` revision
  rows to deterministic `OBSERVED` event candidates.
- [x] Candidate output preserves nullable workspace revisions and emits no
  supersession claims; current rows alone cannot prove predecessor/replacement
  history.
- [ ] Do not append candidates yet. Historical snapshot pairing, source CRUD
  deltas, agent-action linkage, and reviewed authority evidence remain required.

Evidence: `docs/reports/temporal-event-candidates-v1.json`.

### TEMP-IDENTITY-CARDINALITY-01 (2026-09-09)

- [x] Added `scripts/atlas/audit-temporal-logical-identity-v1.mjs` and
  `npm run atlas:temporal:identity:audit`.
- [x] Live read-only result: 61,718 observations, 61,718 proposed logical
  packet IDs, 61,718 version IDs, 0 logical IDs with multiple versions, and
  exactly 1 visible history frame.
- [x] Bootstrap event semantics now use `BASELINE_OBSERVED`; an initial
  observation is not treated as a historically proven `CREATED` event.
- [ ] Supersession remains uncomputable until two ordered workspace/source
  snapshots are available. No lifecycle event was appended.

Evidence: `docs/reports/temporal-logical-identity-v1.json`.

### TEMP-PREDECESSOR-COMPILER-01 (2026-09-09)

- [x] Added explicit base/target `WorkspaceSnapshotV1` comparison with
  `CREATED`, `UPDATED`, `UNCHANGED`, and `TOMBSTONED` candidates.
- [x] Both manifests are independently readback-validated before comparison;
  blocked input produces no candidates and no authority claim.
- [ ] Two valid ordered snapshots are not yet available. The compiler emits no
  lifecycle events, supersession authority, or database writes.

Evidence: `docs/reports/temporal-predecessor-candidates-v1.json`.
Verification against the two existing checksum-addressed artifacts returned
`BLOCKED_SNAPSHOT_READBACK` for both inputs, with zero candidates and zero
supersession claims. The compiler therefore demonstrated fail-closed behavior;
the artifacts are historical observations, not valid ordered frames.

### TEMP-EVENT-BOOTSTRAP-PLAN-01 (2026-09-09)

- [x] Added a read-only bootstrap plan that classifies the current one-frame
  population as `BASELINE_OBSERVED` only.
- [x] Live plan contains 61,718 observations, 0 historical creation claims,
  0 supersession claims, and 0 appendable events.
- [ ] Event append remains unauthorized until a second valid ordered snapshot
  and predecessor evidence exist.

Evidence: `docs/reports/temporal-bootstrap-plan-v1.json`.
