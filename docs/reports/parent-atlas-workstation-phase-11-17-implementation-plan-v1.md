# Parent Atlas Workstation Phases 11–17 Implementation Plan

Updated: 2026-09-05

## Role

This is an implementation planning projection. It does not own OpenSpec task
status, authorize datastore writes, or create a competing control plane. The
owning OpenSpec change and its `tasks.md` remain authoritative.

## Dependency order

Current P0 gate: `CURRENT-SOURCE-OWNER-RECONCILIATION-01`.

Open: stable source identity owner and repository/source namespace authority.
Proven bounded: source-to-chunk materialization binding for the recorded
physical cohort. Not authorized: chunk `source_ref` mutation, semantic
promotion, graph projection, or GPU residency expansion.

```text
CURRENT SOURCE AUTHORITY
  → QUALIFIED SOURCE / PACKET / CHUNK COHORT
  → CANDIDATE ORDINAL MAP
  → SEMANTIC_768 ADMISSION
  → CURRENT GRAPH SNAPSHOT + GRAPH ORDINAL MAP
  → AST / GRAPH / RETRIEVAL FEATURES
  → LATENT_256 → LATENT_128 / LATENT_64
  → CANDIDATE FEATURE MATRIX
  → ACE / BITFROST RESIDENCY POLICY
  → DAG PARAMETER MATERIALIZATION
  → CONTEXT MANIFEST → PROMPT PLAN
  → BOUNDED AGENT EXECUTION → OUTCOME / EXECUTION RECEIPT
```

## Phase plan

### Phase 11 — Engram / model memory wiring

Status: `PARTIAL`

Owner boundaries:

- Ornith `ornith-1.5-9b` via llama-server `:8090` owns synthesis and tool use.
- Ollama remains only the EmbeddingGemma embedding lane.
- Engram/analysis receipts remain append-only observations; `analysis_pass_results`
  is the existing receipt owner.

Implementation sequence:

1. Complete the bounded analysis-pass caller census.
2. Route active synthesis/NLP fallback calls through the shared Ornith resolver.
3. Persist only revision-qualified, grounded receipts; never hidden thoughts or KV data.
4. Prove replay and current-pass selection before any supersession operation.

Gate: `ORNITH-ANALYSIS-ADAPTER-01` → `ANALYSIS-PASS-CURRENT-SELECTION-01`.

### Phase 12 — Parent Atlas codebase index

Status: `PARTIAL`

Implementation sequence:

1. Keep source identity and byte-span ownership in the existing Atlas contracts.
2. Complete canonical directory/chunk segmentation for code, Markdown, JSON, and YAML.
3. Require exact `sourceRef`, `sourceRevision`, `workspaceRevision`, and chunk preimage.
4. Mark validated chunks eligible for PostgreSQL admission; the owning bounded
   admission gate performs any write before derived projections.

Current evidence: a bounded physical cohort covers 50 sources and 434 chunks;
source-to-chunk materialization binding is proven for that recorded scope.
Stable source-registry/repository-namespace authority remains unresolved, and
full current source authority remains blocked.

Gate: `DIR-INDEX-02C/02D` → `DOC-06A` → `DOC-27` where applicable.

### Phase 13 — Feature-gap registry

Status: `PARTIAL`

Implementation sequence:

1. Scan the current workspace through the existing registry owner.
2. Classify each feature as implemented, partial, missing, eval-only, or blocked.
3. Attach owner, evidence receipt, validation command, and next gate.
4. Keep registry state descriptive; it cannot promote identity or authorize writes.

Gate: live workspace scan plus evidence-resolution replay.

### Phase 14 — Redis exact-card / BitFrost policy

Status: `IMPLEMENTED_BOUNDED`

Implementation sequence:

1. Keep canonical invalidation/key constructors centralized.
2. Treat BitFrost/Valkey as derived residency and cache only.
3. Verify revision-qualified cache keys before consumption.
4. Add live residency adoption only under a separate bounded gate if required by workload.

Do not reopen the completed invalidation primitive or collapse packet/query cache
namespaces. No live writer is required by the current runtime.

### Phase 15 — Qdrant semantic lane

Status: `PARTIAL`

Implementation sequence:

1. Establish a non-empty current packet/chunk cohort.
2. Use the admitted canonical `semantic_768` representation from its existing
   owner. EmbeddingGemma is a model/runtime detail only where the owning
   representation receipt binds it to that representation revision.
3. Project named Qdrant vector `content` only after identity and revision checks.
4. Prove exact readback and bounded replay before scaling 15 candidates → 128
   candidates → 768 candidates.

`384` remains legacy/compatibility only. No new 384 writer is permitted.

Gate: source authority → packet eligibility → semantic projection parity.

### Phase 16 — Graph / KAG / DAG refresh manifest

Status: `PARTIAL`

Implementation sequence:

1. Keep the completed Graphify coordinator canary as execution evidence.
2. Establish a current completed source authority for the live workspace.
3. Bind an execution-bound graph snapshot to `GraphOrdinalMapV1`.
4. Build NetworkX interchange and GPU/topology projections from that same frozen
   snapshot, binding workspace, graph, source-population, node, edge, and
   ordinal-map checksums into the receipts.
5. Bind graph, feature, and parameter checksums into ContextManifest/PromptPlan.

Graph, KAG, NetworkX, cuGraph, and centroid outputs remain derived projections.
The stale `codebase-graph.json` warning does not authorize a broad refresh.

### Phase 17 — PyTorch feature extraction
4d topology manifold coordinates networkx python ontology linked tuples json graphs link concepts domain classifications nlp passes pytorch classifier ast cst semantic rpc grpc mmap[] from rtx cuda gemm primitives indexed ulid uuid v4-v*
Status: `PARTIAL`

Implementation sequence:

1. Consume only an admitted `semantic_768` candidate population.
2. Produce `latent_256` as the learned representation artifact.yes 
3. Derive `latent_128` and `latent_64` only with explicit parent revision and checksums.
4. Prove the currently registered RAPIDS/cuVS/cuGraph endpoint and capability
   revision, recording the resolved endpoint in the receipt.
5. Keep GPU ordinals reattached to canonical identities before export or caching.

Every representation receipt must bind `parentRepresentationRevision`,
`modelRevision`, `normalizationContract`, `populationChecksum`, and
`artifactChecksum`:

```text
semantic_768@R
  → trained model revision M
  → latent_256@L256
       ├→ latent_128@L128
       └→ latent_64@L64
```

Gate: current candidate/ordinal snapshot → representation ledger → GPU parity.

## Immediate execution queue

1. Complete `CURRENT-SOURCE-OWNER-RECONCILIATION-01`: identify the stable source
   identity and repository namespace owner without rewriting historical Graphify
   rows.
2. Re-run `SOURCE-EVIDENCE-AUTHORITY-01` and require a current completed bound owner.
3. Re-run the bounded packet preflight; do not authorize an empty candidate set.
4. Execute packet-membership 08A-07/08 only after a non-empty exact target exists
   and separate mutation authorization is present.
5. Resume semantic_768 expansion only after packet eligibility is proven.
6. Defer latent/GPU, centroid warming, and broad Qdrant work until those gates pass.

## Upstream execution API map

Upstream APIs are execution mechanisms only; the local OpenSpec contracts,
receipts, and admission gates remain authoritative.

| Workstation lane | Existing execution boundary | Required proof boundary |
| --- | --- | --- |
| Ornith synthesis/tool use | llama-server `GET /v1/models`, `POST /v1/chat/completions` with Jinja/tools | resolved model and synthesis receipt; no hidden-thought persistence |
| Embedding | Ollama `POST /api/embed` for EmbeddingGemma | representation/model/dimension/normalization revision receipt |
| Source structure | Tree-sitter byte ranges and queries; ast-grep pattern observations | Tree-sitter remains structural identity owner; ast-grep is an adapter |
| Bounded PostgreSQL apply | one checked-out node-postgres client, `FOR UPDATE`, exact `UPDATE ... RETURNING` | proposal + authorization + exact preimage + transaction/readback receipt |
| BitFrost/Valkey | `GET` read proof; `SET`/`DEL` only in an explicitly mutating fixture | effect-accurate cache receipt; no canonical writes |
| Qdrant projection | named vector `content`, explicit query name, awaited visibility when required | admitted identity/revision and exact projection readback |
| CPU/GPU graph | NetworkX oracle ↔ cuGraph on one frozen graph and ordinal map | graph, node, edge, and ordinal-map checksums match |
| Neo4j relationship | existing driver owner with managed write transaction and constrained `MERGE` | bounded relationship receipt; separate DOC-14 gate |
| Learned representations | PyTorch encoder, then nested normalized latent views | parent representation, model, normalization, population, and artifact checksums |
| Vector challengers | cuVS brute-force exact oracle; CAGRA/IVF-PQ challengers | same candidate ordinal map and held-out recall/latency receipt |
| Execution telemetry | OpenTelemetry transport/database spans plus Atlas attributes | packet-attributed execution observations; `execution_utility` remains unavailable until real traffic exists |

This map does not authorize implementation or promotion. In particular, it does
not make Qdrant, Neo4j, cuGraph, Valkey, or an upstream model API a canonical
identity owner.

## Validation policy

Every phase tranche must provide:

- an owning OpenSpec task reference;
- a deterministic receipt or proof report;
- independent readback where writes occur;
- explicit mutation scope;
- replay behavior;
- a statement of what remains unproven.

No phase label in this plan is a promotion authorization.
