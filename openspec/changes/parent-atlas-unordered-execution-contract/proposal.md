# Proposal: Unordered-Execution Packet Contract (QUIC-Inspired) + 10-Phase Alignment

## Why

Atlas passes results (Postgres, Qdrant, Redis/Bifrost, Neo4j, sidecars) arrive
asynchronously and out of order today. Nothing in the codebase currently
distinguishes **physical arrival order** (irrelevant, unordered) from
**logical identity/lineage/ordering scope** (must be explicit and validated).
This mirrors QUIC/HTTP-3: UDP datagrams arrive unordered, but QUIC packet
numbers (three separate spaces: Initial/Handshake/Application) plus
AEAD-authenticated headers let the receiver detect gaps, reject stale/replayed
data, and reassemble streams correctly — all without a global sort.

The lesson for Atlas is **not** "adopt QUIC/gRPC/HTTP-3" — it is: stop
conflating arrival order with correctness, and make identity + revision +
idempotency the thing that gets validated on every packet, regardless of which
producer (MiniLM, AST, PageRank, semantic_768, NLP sidecar, GPU sidecar)
finishes first.

This proposal also formalizes a 10-phase execution order (Phase 0-10) that
sequences all currently-open Parent Atlas lanes (graph freshness/ownership,
retrieval fusion, NLP sidecar, GPU substrate, GA8/GA9 promotion, learned
ranking, feature geometry, vector LOD, n-ary hypergraph projections, packet
ordering/validation) so that no later phase starts before its dependency is
`RUNTIME_SMOKE_PROVEN`, matching this repo's existing gate-by-gate discipline
and the `runtime-ownership-registry.json` "one canonical owner" rule already
in `CLAUDE.md`.

## What Changes

- Define `AtlasEnvelopeV1` (canonical packet-result envelope): identity
  (`packet_key`, `source_ref`), revision tuple (`workspace_revision`,
  `source_revision`, `representation_revision`, `graph_revision`), producer
  lineage (`producer`, `producer_revision`, `pass_name`, `pass_revision`),
  `ordering_scope` + optional `sequence_number` (only when a specific
  producer's output is genuinely ordered — most are not), `input_hash`,
  `output_hash`, `schema_version`, `idempotency_key`.
- Define `AtlasEnvelopeValidator`: 10 checks (schema valid → producer/pass
  known → canonical identity resolvable → revision current → input hash valid
  → output hash valid → duplicate idempotency key → predecessor sequence
  valid *only* when `ordering_scope` requires it → representation IDs
  compatible → graph revision compatible). This is data-validation, distinct
  from transport security (out of scope here — Atlas sidecars are
  locally-trusted IPC, not a public network boundary; do not conflate the
  two).
- Formalize the **stable-sort-after-correctness** rule: `Timsort`/any stable
  sort is only ever applied to already-validated, already-joined candidate
  rows (`score DESC, canonical_candidate_id ASC` — the tie-break key is what
  makes re-runs reproducible). It is never a substitute for join validation
  and is never applied to raw async arrival order.
- Formalize the **space separation** rule: `semantic_768` lives on the unit
  hypersphere `S^767 ⊂ R^768` (cosine range `[-1, 1]`) — a genuine Hilbert
  space. `ExperimentFeatureMatrix`/`FeatureRowV1` lives in a *separate*,
  heterogeneous feature space `R^F` with per-feature declared ranges in
  `FeatureRegistry` (see spec). These must never be collapsed into one
  "range".
- Record the 10-phase sequencing (Phase 0-10, below) as the plan every
  subsequent OpenSpec change/patch in this family should check against before
  opening new work.

## Non-Goals

- Do **not** migrate any Atlas transport to gRPC, HTTP/3, or QUIC. Current
  TypeScript-control-plane ↔ Python-sidecar HTTP/JSON boundary is sufficient;
  revisit only if profiling shows real overhead.
- Do **not** implement TLS/AEAD-style transport authentication — that's a
  different problem (network security) from packet-result validation
  (reproducibility/lineage), and Atlas sidecars run as locally-trusted IPC.
- Do **not** build a new hypergraph-specific PageRank/community algorithm —
  n-ary hyperedges get projected (star/incidence or clique) onto existing
  graph algorithms first; a custom hypergraph algorithm is only justified if
  an Atlas evaluation shows ordinary projections failing.
- Do **not** treat this proposal as authorization to start Phase 1+ work.
  Phase 0 (graph freshness + ownership) must close first, per the Stop
  Conditions in tasks.md.

## Phase 0-10 (sequencing reference — see tasks.md for the checklist)

0. **Close current proof debt** — graph artifact ownership + freshness
   freeze (0A), existing 6-gate verifier stays green after refresh (0B),
   retrieval identity/fusion ownership closes (0C — `parent-atlas-retrieval-fusion-reachability`).
1. **Patch H (betweenness)** — only after 0A/0B. Extends the existing
   `GraphAnalysisRunner`, no new dispatcher/owner.
2. **NLP sidecar closure** — prove one canonical live fixture end-to-end
   (`parent-atlas-nlp-sidecar-feature-compiler`), no functional expansion.
3. **GPU substrate status sweep** — classify every GPU/vector component
   (`LIVE | RUNTIME_SMOKE_PROVEN | PARITY_PROVEN | EXPERIMENTAL | STUB | DEAD | COMPATIBILITY`),
   one canonical owner map (`parent-atlas-gpu-graph-vector-substrate`).
4. **GA8** — wide `ExperimentFeatureMatrix` ablation (correlation,
   redundancy, recall@k/MRR/nDCG/repair-success/latency/memory). No
   promotion yet.
5. **GA9** — promote only GA8 winners into `FeatureRowV1`. Everything else
   stays in the wide experimental matrix.
6. **Learned ranking** — `CandidateJudgment` replay corpus, benchmark
   deterministic ranker vs `XGBRanker` (`rank:ndcg`) vs (later) a small
   differentiable head. No promotion without held-out improvement.
7. **Feature geometry** — separate `H_s` (semantic_768 hypersphere), `H_f`
   (promoted feature space), `H_c` (control5). Local sensitivity/gradients
   experiment only after GA8 picks survivors. Never redefines embedding
   identity. The working contracts for this phase are
   `RetrievalExecutionBudget`, `GeometryExperimentManifest`, and
   `RoutingPolicy`: the first caps lane count / depth / batch sizes, the
   second records the geometry experiment inputs/outputs and diagnostics,
   and the third keeps policy choice separate from geometry math.
8. **Vector LOD** — cuVS brute-force exact/CAGRA parity first; cuVS-Vamana
   GPU index build → DiskANN3 (Rust) cold search only as a later experiment.
   TurboVec stays an acceleration *backend*, never the identity owner.
9. **N-ary hypergraph projections** — `HyperedgeProjectionManifest` (star/
   incidence, normalized-clique), reuse existing PageRank/CheiRank/Louvain/
   Leiden/BFS/SSSP against the projection. Ordered process traces become a
   DAG, not a hyperedge.
10. **Packet ordering/validation** — `AtlasEnvelopeV1` + validator (this
    proposal), proven via shuffled-delivery replay tests (same final
    materialization regardless of arrival order).

**Stop conditions** (do not start a later phase while any hold): graph
revision unresolved · canonical owner unresolved · parity unproven ·
representation ID ambiguous · an experimental feature hasn't passed ablation ·
an existing library already owns the numerical primitive being reimplemented.
