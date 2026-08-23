# Parent Atlas Canonical 768 Retrieval, Knowledge & Feature Contract

**Status**: ✅ ACCEPTED, 2026-08-23 (operator decision) — supersedes the `semantic_512` freeze
below and resolves the conflict this document previously flagged.

**Resolution record.** This proposal (dated 2026-08-03) was in undocumented conflict with a later
freeze to `semantic_512` (`openspec/changes/parent-atlas-semantic-512-canonicalization/`, Aug 19)
for a month, until an undocumented Aug 22 commit (`cdae3e454b`) silently implemented this
document's position in live code anyway. On 2026-08-23, presented with the full forensic trace
and live ground-truth evidence (Postgres's own truth column and a Qdrant mirror are both natively
768-dim and predate the Aug 19 freeze by weeks — the freeze's own stated premise, "no production
768 corpus exists," did not hold at the time it was written), **the operator confirmed `semantic_768`
as canonical.** Full trace: `openspec/changes/codereview-semantic-dimension-regression-aug22/tasks.md`
section 1. Root `CLAUDE.md`'s embedding-dimensions policy has been updated to match.

**Amendment to this document's original position, per the same operator decision**: lower-dimensional
truncations (512 via MRL-prefix, 384 for Warden/Nomic routing) remain legitimate **derived,
secondary** lanes — this document's original framing of them as "legacy migration artifacts,
never a fallback" is too strong. The actual rule: a truncation may only be produced from a 768-dim
source that has **already been indexed and validated** — never computed speculatively ahead of or
in parallel with 768 indexing. This reconciles with, rather than fully discards, the mechanism the
512-freeze doc itself used (native 768 → MRL prefix → L2 renorm) — it changes which lane is
primary/required versus derived/optional, not the truncation technique itself.
**Corrects/supersedes**: an earlier "384 vs 768" framing found in prior planning docs. Note: the
operator's dictation said "remove 368" — the actual conflicting representation throughout the
supplied material is **384**, not 368. This document uses 384 throughout as the intended target.

## TL;DR

There is exactly **one** native dense semantic lane: `semantic_768` (EmbeddingGemma, 768-dim).
Any 384-dim vectors/collections/schemas/model outputs are **legacy migration artifacts**
(`MIGRATION_SOURCE` or `SUPERSEDED`) — never canonical, never a fallback, never a proof-gate
participant, never concatenated with `semantic_768`. `cuVS brute_force` is an exact-KNN oracle
over `semantic_768`; `cuGraph PageRank` is a background topology-parity lane, not an online
retrieval authority. `latent_64`/`latent_128` must prove derivation from `semantic_768` before
being trusted for routing.

## 1. Store ownership (unchanged, reaffirmed)

| Store | Role | Canonical? |
|---|---|---|
| PostgreSQL | packet ledger, identity, lineage, validation, ledger state | **YES** |
| Qdrant | `semantic_768` ANN + sparse candidate mirror | rebuildable |
| Neo4j | bounded topology facts, k-hop projections | rebuildable |
| Redis/Valkey | hot ACE packets, exact caches, centroid caches | disposable |
| RRF | final multi-lane fusion/ranking authority | — |

No projection store becomes canonical merely because it's faster to query.

Identity/lineage spine every packet must resolve through: `packet_key`, `source_ref`,
`feature_id`, `content_hash`, `workspace_revision`, `source_revision`, `representation_id`,
`representation_revision`, `schema_version`.

## 2. Retrieval sequence (current contract)

workspace/revision resolution → lexical (`rg`) → structural (AST/tree-sitter/ast-grep) evidence
∥ semantic `semantic_768` Qdrant candidates ∥ sparse BM25/BM42(experimental) → bounded Neo4j
topology expansion → canonical packet identity reconciliation (Postgres) → independent-lane RRF
→ optional bounded reranking → top-packet ACE evidence assembly → Gemma4 synthesis.

`searchResultToHyperRagResult` must expose canonical fields **directly** on each hit
(`packetKey`, `sourceRef`, `contentHash`, `workspaceRevision`, `treeNodeId`, `featureId`,
`featureLabel`) — not buried only in an untyped payload blob.

## 3. LDR transport rules

- JSON — structured metadata, inspection/audit schemas, receipts
- MessagePack — compact bounded packet envelopes
- Arrow IPC — columnar feature/identity/vector/benchmark batches
- gRPC — only for true streaming/backpressure/typed-RPC/cross-process boundaries; **do not**
  add gRPC to move small JSON objects between colocated JS modules
- Raw source content may be referenced via bounded evidence spans / immutable content
  locations, but must never replace packet identity/lineage

## 4. Tensor/GPU projections

Tensors are derived projections, never truth. If synthesized, attach `packet_key`, source
lineage, representation version, matrix digest, environment identity; write versioned
artifacts; reject stale workspace/source revisions. PyTorch tensors, CuPy arrays, VRAM caches,
GPU indexes are never canonical truth. TurboVec/cuVS/CAGRA/IVF/Vamana/DiskANN are acceleration
or benchmark lanes that must compare against the existing Qdrant+RRF path, not silently
replace it.

## 5. Canonical feature matrix — one semantic lane, many feature lanes

Not a 384-vs-768 choice. A versioned multi-lane feature matrix with exactly one native dense
semantic lane.

| Lane | representation_id | dims | source | status | notes |
|---|---|---|---|---|---|
| Native semantic | `semantic_768` | 768 | EmbeddingGemma canonical pipeline | `ACTIVE` | requires full lineage fields (below) to be admissible |
| Latent routing | `latent_64` | 64 | derived from `semantic_768` | `ACTIVE` only after lineage proof | routing/centroid/SOM prefilter only — never a synthesis-facing dense evidence substitute |
| Intermediate latent | `latent_128` | 128 | mechanically required by a versioned encoder only | internal / `REFERENCE_ONLY` unless separately promoted | never sourced from `embedding_384` |
| Sparse/lexical | `bm25`, `bm42_experimental`, `miniCOIL/SPLADE/uniCOIL` (optional) | — | — | — | never stored under ambiguous names (`embedding`, `dense`, `AI index`) |
| Structural | AST/symbol/tree-sitter/ast-grep identities, imports/calls/defines/references, spans | — | parser-backed | — | — |
| Topology | `pageRankScore`, `community_id`, degree, fanout, path proximity, k-hop reachability, graph snapshot id | — | Neo4j GDS | — | graph features, not embeddings |
| Geometric routing | `kmeans_cluster_id`, `som_cell_id`, `som_x/y`, `centroid_id`, `centroid_distance`, `latent_64` neighborhood, routing model version | — | — | — | never collapsed into `domain_class`/`feature_id`/`feature_label` |
| Ontology | `ontology_version`, domain/feature registry match, entity/relation type, authority class, evidence rule, exclusion rule, resolution state | — | okf | — | — |
| Classifier | bounded combination of the above lanes | — | derived | — | derived data, never canonical truth |

Every canonical dense vector must carry: `packet_key`, `source_ref`, `content_hash`,
`workspace_revision`, `source_revision`, `representation_id`, `representation_revision`,
`embedding_model_id`, `embedding_model_version`, `dimensions`, `vector_digest`, `created_at`.
A vector lacking this lineage is **not admissible** as a current semantic representation.

## 6. Representation registry

Fields: `representation_id`, `representation_version`, `dimensions`, `dtype`, `metric`,
`source_representation_id`, `producer`, `producer_version`, `schema_version`, `status`,
`created_at`, `superseded_by`.

Status values: `ACTIVE` · `REFERENCE_ONLY` · `MIGRATION_SOURCE` · `SUPERSEDED`.

| representation_id | status |
|---|---|
| `semantic_768` | `ACTIVE` |
| `latent_64` | `ACTIVE` only when `semantic_768` lineage + runtime consumption proven |
| `latent_128` | `REFERENCE_ONLY` (internal derived state) unless separately promoted |
| existing 384-dim collections/artifacts | `MIGRATION_SOURCE` or `SUPERSEDED` |
| `topology_4` | `REFERENCE_ONLY` (visualization/ordering only) |
| token/view multivectors | `REFERENCE_ONLY` or bounded reranking lane until promoted |
| BM42 | `REFERENCE_ONLY`/experimental until benchmarked+promoted |

## 7. Prohibited behavior (hard rules)

- Never concatenate a 384-dim and a 768-dim vector into a synthetic 1152-dim representation
- Never treat `latent_64` as equivalent to `semantic_768`
- Never store PageRank/community IDs/SOM coordinates/cluster IDs inside a semantic embedding vector
- Never derive canonical packet identity from Qdrant point identity, Neo4j node identity, a
  matrix row number, or a centroid assignment
- Never treat legacy 384 collections as a current semantic fallback
- Never let a legacy vector satisfy current embedding-lineage proof
- Never fuse raw coordinates from independently trained latent spaces — fuse ranks,
  calibrated probabilities, or separately named features instead

## 8–9. Knowledge layer & okf ownership

Vectors are not the knowledge model. The knowledge layer defines: okf ontology registry,
ontology version, domain/feature registries, evidence rules, exclusion rules, authority class
per fact (`ast`/`runtime`/`test`/`semantic`/`derived`), and knowledge resolution states
(`RESOLVED`/`UNCLASSIFIED`/`AMBIGUOUS`/`ONTOLOGY_GAP`/`CONFLICTING_EVIDENCE`) — a separate axis
from runtime evidence state (`ACTIVE_VERIFIED`/`ACTIVE_DEGRADED`/`GATED`/`REFERENCE_ONLY`/
`SUPERSEDED`/`FAILED`). A packet can be structurally valid while semantically unresolved.

One ontology source path: repo-root `okf/` manifest (canonical declarative source) → runtime
`okf` loader (generated/validated projection) → export route (serialization boundary) →
Mastra loader (runtime consumer) → HyperRAG/KAG routes (consumers of resolved facts).
Reconciliation must fail loudly when root and runtime ontology definitions disagree.

## 10. Promoted contracts (4)

- **SemanticPacketV1** — canonical retrieval/KAG packet: identity, source evidence,
  workspace/source lineage, ontology entities, representation references, evidence state,
  knowledge resolution, validation state, transport/projection identities.
- **HypergraphFactV1** — a whole semantic fact, not inferred pairwise edges. Persistence:
  `semantic_facts`, `semantic_fact_participants`, `semantic_fact_evidence`. Neo4j edges are
  projections of facts; retrieval must recover the full fact (participants + evidence + lineage).
- **FeatureMatrixRowV1** — derived/versioned row with separately named feature groups
  (semantic/lexical/structural/topology/routing/ontology/classifier/runtime/test), referencing
  canonical packet/source identity rather than owning identity itself.
- **ContractValidationResult** — admission result for packets/facts/rows: `schema_version`,
  `validator_version`, `identity_payload`, `violation_codes`, `severity`, `validated_at`,
  `admission_status`.

## 11. Canonical identity spine

`repository_id`, `source_ref`, `title_id`, `content_hash`, `tree_node_id`, `symbol_id`,
`symbol_version_id`, `chunk_id`, `packet_key`, `packet_version`, `workspace_revision`,
`source_revision`. Use UUID for durable row identity, ULID for ordered run/event/trace/receipt/
materialization instance identity. `source_ref` locates a source occurrence but is **not**
identity — one source can yield multiple chunks/symbols/packets/summaries/facts/representations.
Derive `qdrant_point_id`, Neo4j node identity, matrix row identity, cache keys **from** canonical
packet/symbol-version identity — never the reverse.

## 12. Five independent evidence lanes (keep separate everywhere — schemas, payloads, receipts, scoring)

1. **Structural** — `source_ref`, `tree_node_id`, `symbol_id`, `symbol_version_id`, AST facts
   (`CALLS`/`IMPORTS`/`DEFINES`), spans, parser identity
2. **Lexical/semantic meaning** — summaries, `semantic_768`, BM25/BM42, extracted concepts,
   late-interaction rerank scores
3. **Graph topology** — `pageRankScore`, `community_id`, degree, fanout, path/authority metrics,
   graph snapshot
4. **Geometric routing** — `latent_64`, `kmeans_cluster_id`, SOM cell, centroid identity/distance,
   latent neighborhood
5. **Derived classification** — `domain_class`, `feature_id`, `feature_label`, workflow labels,
   confidence, evidence references, classifier version

Do not collapse topology/routing/ontology/classification/semantic into a generic "cluster" or
"embedding" field.

## 13. PageRank ownership

Neo4j GDS PageRank (`pageRankScore`, canonical property name — matches
`parent-atlas-gpu-sidecar-patch-tournament`'s already-applied alignment) is a **current**
topology/authority signal, not deprecated. May contribute to: graph authority, independent RRF
lane, reranking features, classifier input, bounded graph-expansion priorities. Must **never**
be the sole authority for `domain_class`/`feature_id`/`feature_label`/ontology
membership/source identity/packet identity. A GDS `mutate` call only proves the in-memory
projection received a property — DB persistence needs an explicit write + receipt. `cuGraph`
PageRank is a background parity/acceleration fixture, not an MCP request-time computation, and
does not replace the TypeScript Neo4j execution owner.

## 14. cuVS exact-KNN ownership

`cuVS brute_force` is the exact semantic retrieval oracle. Flow: canonical packet/symbol-version
manifest → `semantic_768` float32 matrix + identity digests → revision-qualified query matrix →
`cuVS brute_force` cosine search → top-k row indexes → `packet_key`/`symbol_version_id`
reconciliation → Qdrant HNSW recall comparison → persisted benchmark receipt.

Matrix manifest required fields: `row_index`, `packet_key`, `symbol_version_id`,
`source_version_id`, `content_hash`, `workspace_revision`, `source_revision`,
`representation_id` (must be `semantic_768`), `representation_revision`.

Reject the fixture if: dims ≠ 768, matrix/identity row counts differ, row indexes non-contiguous,
packet/symbol identity absent, source lineage absent, `representation_id` ≠ `semantic_768`,
matrix/query dims differ, or any returned row can't map to canonical identity.

cuVS is a parity oracle + optional acceleration lane; **Qdrant remains the online ANN owner**
unless a separate promotion gate changes that.

> Cross-reference: `openspec/changes/parent-atlas-gpu-sidecar-patch-tournament/tasks.md`
> already implements and independently-verified `POST /v1/knn/exact` against a synthetic
> fixture (`RAPIDS_EXACT_KNN_ENDPOINT: RUNTIME_SMOKE_PROVEN`) — that work is compatible with
> this contract as written (brute_force-only). The same file's CAGRA endpoint claim is flagged
> there as `UNVERIFIED_CLAIM_CONTRADICTS_RECORDED_DECISION` and must stay that way under this
> contract too (§14 names brute_force as the oracle; CAGRA is explicitly excluded there).
> The `QDRANT_CUVS_RECALL_AT_20` fixture referenced there is not yet built — it must use the
> matrix-manifest shape defined in this section, and per that file, must not source rows from
> the live Qdrant corpus until packet-key lineage is fixed there (GS1.47).

## 15. ANN benchmark gate (corrected)

Replace all "384 vs 768" language with **`semantic_768` exact-vs-approximate retrieval parity**.
Compare: cuVS brute_force exact cosine top-k (canonical `semantic_768`) vs. Qdrant HNSW (same
corpus) vs. optionally cuVS CAGRA/IVF-Flat/IVF-PQ/Vamana vs. online RRF (Qdrant candidate lane)
vs. calibrated score fusion (explicit alternative only). Metrics: recall@k, intersection count,
rank overlap, MRR/NDCG (where judgments exist), latency, index build time, query throughput,
VRAM/RAM, artifact size, identity-reconciliation failures, stale-revision rejection count. Do
**not** benchmark semantic quality by comparing 384 vs 768 — the 384 lane is not a promotion
candidate.

## 16. Phase 108D status correction

Current single-packet cross-store proof stays `PARTIAL_PROVEN`. For target packet
`packet:1f18437ee58f`: Postgres + HyperRAG presence do **not** prove Qdrant/Redis/ACE/graph/full
lineage parity. Corrected lane requirements:
- `semantic_768` Qdrant presence required for current semantic cross-store proof
- legacy 384 Qdrant collections (`MIGRATION_SOURCE`/`SUPERSEDED`) cannot satisfy the proof
- Redis/Valkey ACE presence required for cache/ACE parity
- Neo4j presence required only where a valid topology projection exists for the packet
- `content_hash` + `workspace_revision` parity required across every participating projection
- `qdrant_point_id` must derive from canonical identity and resolve back to `packet_key`

Do not keep 768/hybrid lanes at `REFERENCE_ONLY`. Promote `semantic_768` contract status to
`ACTIVE` while honestly recording current runtime coverage separately (`PARTIAL_PROVEN` or
`NOT_PROVEN`) — contract ownership and data coverage are separate questions.

## 17. Next bounded sequence (after 108D correction)

1. Find/create one packet with a real canonical `semantic_768` representation
2. Verify `packet_key`/`content_hash`/`workspace_revision`/`source_revision`/
   `representation_id`/`qdrant_point_id`
3. Prove Postgres→Qdrant identity reconciliation
4. Exercise the real Redis ACE adapter for that packet
5. Verify HyperRAG exposes canonical identity fields directly
6. Verify Neo4j topology only when a current graph projection exists
7. Build one ACE packet from the same revision-qualified packet
8. Reject every legacy 384 vector as proof evidence
9. Derive any `latent_64` row from that packet's canonical `semantic_768`
10. Persist the cross-store proof receipt + reason codes
11. Only then enable centroid/SOM/KMeans/classifier work for that packet
12. Run the Qdrant-vs-cuVS-exact `semantic_768` parity fixture before adding another ANN index

## 18. Autoencoder/SOM provenance (corrected)

Replace `embedding_384`/`latent_128`/`latent_64`/`SOM 20x20` framing with: `semantic_768` →
optional versioned `latent_128` internal state → `latent_64` routing representation →
KMeans/SOM 20×20 assignment. Required provenance: `packet_key`, `content_hash`,
`workspace_revision`, `source_revision`, source representation id+revision, encoder model
id+version+artifact digest, latent representation id+revision, SOM/KMeans model id+digest,
assignment timestamp. A latent/SOM assignment from a legacy 384 vector must be marked stale and
excluded from current proof.

## 19. Validation gates (add/update, don't rebuild existing lanes)

- XGBoost classifier/reranker inputs preserve separately named feature lanes
- Tree-sitter/ast-grep facts preserve structural identities + source spans
- SOM/KMeans/PageRank payloads remain independent fields
- ACE packets distinguish semantic/lexical/structural/topology/routing/ontology/
  classification/runtime/test evidence
- `semantic_768`, `latent_64`, sparse vectors, late-interaction rerank vectors are separately
  named and versioned
- Legacy 384 representations rejected from active retrieval + cross-store proof
- Late-interaction multivectors bounded to reranking
- okf-generated JSON Schema, Zod, Python validators, DB constraints agree
- `title_id`/`tree_node_id`/`packet_key` UUID/ULID policies agree across TS/Python/Postgres/
  Qdrant/Neo4j
- HyperRAG returns whole facts with participants+evidence, not only pairwise edge fragments
- PageRank contributes only as a bounded topology prior or independent rank lane
- cuVS exact top-k uses the same `semantic_768` matrix + identity manifest as the Qdrant
  comparison
- RRF operates over independent ranked lanes, not raw coordinate concatenation

Evidence statuses: `ABSENT` · `PRESENT` · `STATICALLY_REFERENCED` · `FIXTURE_PROVEN` ·
`RUNTIME_SMOKE_PROVEN` · `PARTIAL_PROVEN` · `CROSS_STORE_PROVEN` · `CONFLICTING` · `BLOCKED`.
Project-wide gate reporting maps these to: `PASS` · `PARTIAL_PROVEN` · `NOT_PROVEN` · `NOT_RUN`
· `BLOCKED` · `FAIL`. Never claim runtime proof from schema inspection or unit tests alone.

## 20. Semantic contract reconciliation artifact (proposed script, not yet built)

`scripts/atlas/reconcile-semantic-contracts.mjs` (**read-only**), outputs:
- `docs/reports/semantic-contracts/semantic-contract-reconciliation.json`
- `docs/reports/semantic-contracts/semantic-contract-conflicts.ndjson`
- `docs/reports/semantic-contracts/semantic-contract-identity-map.json`

Inventories/reconciles: canonical semantic representation IDs, vector dimensions, active Qdrant
collections, vector writers/readers, latent-vector derivation paths, packet identity fields,
source/workspace revisions, okf ownership, Zod/JSON-Schema defs, Python validation schemas,
Postgres constraints, Neo4j property names, Redis key formats, ACE/HyperRAG packet contracts.

Fails the gate on: active 384-dim writer, active 384-dim reader, semantic representation
without packet lineage, `latent_64` not derived from `semantic_768`, root-vs-runtime okf drift,
schema drift, identity drift, cross-store packet mismatch, ambiguous representation name,
topology stored as a semantic embedding, projection identity treated as canonical identity.

## 21. Recommendation/Kanban boundary

Recommendation stage consumes the sorted ranked-packet JSON: packet identity, source lineage,
representation identity, evidence lanes, per-lane RRF ranks, validation status, knowledge
resolution, reason codes. After the relevant proof gate passes, output may attach
`next_steps`/Kanban card updates/required validation commands/approvals/blocking evidence. The
Kanban board is a projection over durable Postgres state — recommendation generation must not
directly promote audit status, mutate canonical knowledge, apply patches, or start training.

> Cross-reference: `openspec/changes/parent-atlas-gpu-sidecar-patch-tournament/tasks.md` Part D
> already flags a related, separate issue — `promote_recommendation`'s status vocabulary
> conflates recommendation lifecycle (`PROPOSED`/`APPROVED`) with semantic lifecycle
> (`ACTIVE`/`SUPERSEDED`/`RETRACTED`/`ARCHIVED`). Still open, own change needed, not folded in
> here.

## 22. Training lane boundary

Colab/A6000 training stays an offline future phase — may eventually support high-RAM tagging,
reranker training, LoRA/QLoRA experiments, artifact export, fixed-corpus evaluation. Must stay:
offline, excluded from startup, separate from online retrieval, separate from proof-gate
promotion, disabled until dataset eligibility/leakage controls exist. WebGPU stays optional,
never required. No training corpus may treat legacy-384-derived retrieval results as current
canonical semantic evidence.

## 23. Verified this pass — RRF identity-field preservation (real bug found, not fixed)

Checked whether the merged RRF path keeps `tree_node_id`/`content_hash`/`workspace_revision`
attached to Qdrant hits through rank fusion, per operator request.

- `npx tsx -e "import('./src/lib/server/retrieval/rrf-integration.ts')..."` → imports cleanly.
- `sveltekit-frontend/src/lib/server/retrieval/rrf-integration.ts` builds `ContextHit[]` per lane
  (`bm25Hits`/postgres_trigram, `qdrantHits`/qdrant_vector, etc.) and every lane that carries
  identity does populate `metadata.{packet_key,source_ref,content_hash,tree_node_id,
  feature_id,feature_label,workspace_revision}` correctly per-hit.
- **The bug is in the fusion step**, `combineViaRRF()` in
  `src/lib/server/retrieval/rrf-combiner.ts`: when two lanes report the same `id` (dedup key,
  default `deduplicateBy: 'id'`), the merged result's `metadata` is chosen by
  `scores.find(score => score.metadata && Object.keys(score.metadata).length > 0)?.metadata` —
  this checks for **key presence, not non-null values**. `bm25Hits` (lane 0, `postgres_trigram`)
  always builds a metadata object with all seven identity keys present, even when their values
  are `null` (common for lexical-only hits that were never joined to a chunk record). Because
  `bm25Hits` is lane index 0 and `.find()` returns the first match, **a postgres_trigram hit
  with all-null identity fields wins over a later qdrant_vector hit for the same doc that has
  real values** — the real `tree_node_id`/`content_hash`/`workspace_revision` from Qdrant get
  silently discarded in favor of an earlier lane's null placeholders. Both lanes derive `id` the
  same way (`qdrant_id ?? stable_key ?? file_path`), so collisions across lanes for the same
  document are the common case, not an edge case — this isn't a rare interaction.
- **Fixed and verified this pass.** `combineViaRRF()` in `rrf-combiner.ts` now merges every
  lane's metadata key-by-key via a new `mergeLaneMetadata()` helper — keeps the first
  non-null/non-undefined value seen per key across lanes in their original order, instead of
  picking one lane's whole object by "has any non-empty keys." Verified two ways:
  1. A standalone fixture (`bm25Hits` with `content_hash`/`tree_node_id`/`workspace_revision`
     explicitly `null`, `qdrantHits` for the same `id` with real values) → merged result now
     shows the real Qdrant values while still keeping `packet_key`/`source_ref` from the bm25
     lane (fields Qdrant didn't report) — exactly the intended fix, not just "Qdrant always
     wins."
  2. `npx vitest run src/lib/server/retrieval/__tests__/rrf-fusion.test.ts` → **29/29 pass**, no
     regression from the change. (`rrf-split.test.ts` has one pre-existing, unrelated failure —
     a module-import-time budget test measured at ~4.8s against a 3000ms budget — already
     flagged in `parent-atlas-gpu-sidecar-patch-tournament/tasks.md` Part D before this session's
     change; not caused by this fix.)
- `RRF_IDENTITY_FIELD_PRESERVATION: FIXED_AND_VERIFIED` (upgraded from `CONTRADICTED`).

## 24. Verified this pass — Phase 89 workflow provenance binding

`npx vitest run src/lib/server/atlas/board/phase89-workflow.spec.ts` → **2/2 pass**, and the
assertions are real, not console-log-only: test 1 asserts `plan.recommendationId ===
'rec:rank-signals'`, `plan.sourceRef === 'sveltekit-frontend/src/lib/server/retrieval/rrf-
integration.ts'`, `plan.treeNodeId` contains `'combineViaRRF'` (the exact function found broken
in §23 above — coincidental fixture choice, not a causal link); test 2 asserts the
null-provenance path is preserved when no recommendation is selected.
`PHASE89_WORKFLOW_PLAN_PROVENANCE: PASS`.

## 25. MCP tool surface — live repo ownership vs. external "14-tool" reference (documentation only)

An external reference groups MCP tools into indexing/query/analysis/code surfaces with one
unified graph API (`index_repository`, `index_status`, `list_projects`, `delete_project`,
`search_graph`, `trace_call_path`, `query_graph`, `ingest_traces`, `detect_changes`,
`get_graph_schema`, `get_architecture`, `get_code_snippet`, `search_code`, `manage_adr`). This
repo splits that responsibility across `src/mcp/codebase_tools.ts`,
`src/mcp/atlas_embedding_tools.ts`, `src/mcp/engram_tools.ts`, `src/mcp/bifrost_tools.ts`,
`src/mcp/topology_mgmt_tools.ts`, and `src/mcp/trace-mcp-server.ts` — not verified line-by-line
this pass (operator-supplied mapping, recorded as-given, not independently re-derived):

| External tool | Current repo owner | Live analog | Gap |
|---|---|---|---|
| `index_repository` | `trace-mcp-server.ts` (indexing lane) | TRACE indexing tools + packet loaders | No single repo-wide indexer tool |
| `index_status` | `trace-mcp-server.ts` | TRACE health/status probes | No dedicated index-progress tool |
| `list_projects` | TRACE admin tools | project/tool listing in TRACE-adjacent code | No project registry tool surfaced here |
| `delete_project` | TRACE admin tools | none | Missing public delete tool |
| `search_graph` | `trace-mcp-server.ts` | `trace.kag_search` | Graph search exists under a different contract |
| `trace_call_path` | `trace-mcp-server.ts` | call-path traversal helpers in TRACE server | No dedicated directional call-path tool surfaced |
| `query_graph` | `trace-mcp-server.ts` | KAG graph query path in TRACE | No explicit Cypher-like public query tool |
| `ingest_traces` | TRACE ingestion lanes | trace ingestion code in TRACE server | No simple public ingest tool surfaced |
| `detect_changes` | codebase replay tooling | diff/replay analysis lanes | No single change-detection MCP tool |
| `get_graph_schema` | TRACE topology docs | schema-introspection helpers in TRACE | No unified schema tool surfaced |
| `get_architecture` | docs/topology notes | architecture summaries in docs | No runtime architecture tool surfaced |
| `get_code_snippet` | `codebase_tools.ts` | TRACE `codebase.rg_search` + file readers | No exact-snippet tool surfaced |
| `search_code` | `codebase_tools.ts` | `codebase.rg_search` | Approximate match exists under a different name |
| `manage_adr` | docs/decision records | ADR docs and notes | No ADR mutation tool surfaced |

Additional live-analog notes (as supplied, not re-verified): `codebase.rg_search` /
`codebase.awk_analyze` are the only two tools `codebase_tools.ts` exposes; broader graph/KAG/ACE/
hypergraph ops live in `trace-mcp-server.ts`, itself namespace-split into `graph.*` (topology),
`graph.topology` (clusters), `trace.kag_search`/`trace.explain_retrieval`/
`trace.validate_ace_hit` (retrieval proof), `ops.*` (operator-gated repair, deliberately
read-only-preview + controlled execution), `hypergraph.*` (hyperedge search/expansion/
explanation — projection and inspection, not authority), `knowledge.legal` (supporting lookups).
`atlas_embedding_tools.ts` is an embedding-derived enrichment helper (Redis/Qdrant reads), not a
knowledge-graph indexing/query/admin API — worth keeping distinct rather than conflating the two.

**Recommendation, not yet actioned**: any missing/unverified public equivalents from the
external reference should be added only after a live proof gate decides ownership, and only if
needed beyond the existing split-ownership model — do not build a unified `graph.*` mega-tool
just to match the external shape.

## 26. Found and fixed this pass — legacy 384 collection was silently zeroing the canonical Qdrant lane

While wiring the "move this to 768" direction, traced `queryQdrantVectorSignal()` in
`rrf-integration.ts` (the function feeding `qdrantHits` into RRF) and found it queried
`['codebase_chunks_768', 'codebase_chunks_384_hybrid']` together. `truncateEmbeddingForCollection()`
requires an exactly-384-length vector for the `_384_hybrid` branch or it throws; the `embedding`
passed in is always the canonical 768-dim EmbeddingGemma output. Because the collection list is
built via `collections.map(...)`, that throw happens **synchronously while constructing the
promise array**, before `Promise.allSettled` is even called — so the exception propagates out of
the whole `try` block, hits the outer `catch (err) { console.error(...); return []; }`, and the
**entire function returns empty, including the canonical `codebase_chunks_768` results**, not
just the legacy collection's. This only doesn't fire when the bm25-seeded fast path (lines
~183–231) already returns non-empty results — meaning for any query where lexical seeding misses
or returns nothing, the whole dense-vector semantic lane silently contributed zero results to
RRF, with no error surfaced to callers (just a console.error swallowed server-side).

Verified live: `curl http://127.0.0.1:6333/collections/codebase_chunks_384_hybrid` →
`points_count: 0` — the collection is completely empty in production, so even a working query
against it would never have added value; it was pure liability.

**Fixed**: `collections` array reduced to `['codebase_chunks_768']` only, with an in-code comment
explaining why. Re-verified: import still clean, `rrf-fusion.test.ts` still 29/29 pass, no new
typecheck errors introduced (pre-existing unused-variable warnings elsewhere in the same file are
unrelated to this change).

**Live end-to-end proof, completed this pass**: hit the running dev server directly —
`GET /api/retrieval/search-unified?q=validate%20user%20session&topK=10` → HTTP 200, 3 packets
returned, `provenance.retrievalSources` includes `"qdrant_768"` alongside `postgres_trigram` and
`exact_symbol`, `fusionMethod: "rrf"`, `rerankerUsed: true`. This is real evidence the canonical
Qdrant 768 lane is now contributing to a live RRF-fused result — before this fix, per the traced
crash path above, this lane would have silently contributed nothing whenever the bm25-seed fast
path didn't already return hits. `QDRANT_384_HYBRID_CRASH_BUG: FIXED_AND_VERIFIED_LIVE` (upgraded
from statically-verified only).

Note: `/api/retrieval/unified` (the endpoint named in this repo's own CLAUDE.md docs) is now a
307 redirect to `/api/retrieval/search-unified` — the docs reference was stale; fixed live in
root CLAUDE.md this session.

## 27. Wired the previously-dead `resolve-embedding-lane.ts` as defense-in-depth

`resolve-embedding-lane.ts` (§25 background: correct legacy-384 blocking logic, but only ever
referenced by its own spec test — never wired into a live path) is now actually used.
`rrf-integration.ts`'s `qdrantHits` construction filters each hit through `resolveEmbeddingLane()`
before it enters RRF, dropping only hits explicitly resolved as
`LEGACY_DIMENSION_EXPLICIT_ONLY` (deliberately does **not** drop `UNKNOWN`-resolution hits, since
the collection/vector-name registries aren't guaranteed exhaustive — an over-eager filter here
would silently cut recall rather than just block real legacy-384 leakage).

This is now genuinely defense-in-depth, not the primary fix — the §26 crash-bug fix already
ensures the query itself never touches a legacy collection. This catches the case where legacy
provenance metadata leaks through some other future/parallel path even if the query-level
exclusion above is ever accidentally reverted.

Verified: `npx tsc --noEmit` clean for this file; `resolve-embedding-lane.spec.ts` (3/3) and
`rrf-fusion.test.ts` (29/29) both still pass; re-ran the same live
`GET /api/retrieval/search-unified` call from §26 — `provenance.retrievalSources` still includes
`qdrant_768`, confirming the new filter doesn't regress the working live path.
`RESOLVE_EMBEDDING_LANE_WIRED: FIXED_AND_VERIFIED_LIVE`.

## Completion condition

Semantic contract alignment is complete only when Parent Atlas can prove, end-to-end for one
packet: Postgres canonical identity → canonical `semantic_768` generation → revision-qualified
Qdrant mirror → exact cuVS top-k parity fixture → lexical+structural candidate lanes → bounded
Neo4j topology evidence → canonical identity reconciliation → independent-lane RRF → ACE packet
with explicit evidence lanes → Gemma4 recommendation → durable proof receipt → Kanban update
after gate passage. No active `dense_384` lane may remain in that path. `latent_64` may
participate only as a routing/clustering projection derived from canonical `semantic_768`.
