# Tasks: Unordered-Execution Packet Contract + 10-Phase Alignment

This change is **capture/plan-only** for Phases 1-10 — per this repo's
gate-by-gate discipline, each phase gets its own explicit go-ahead before
implementation starts. Phase 0A is being actively worked in this session as
part of unblocking the sibling change
`parent-atlas-graph-analysis-contract` (Patch H precondition).

## Phase 0 — Close current proof debt (BLOCKING, do this before anything else)

- [x] 0A.1 Locate the real writer of `docs/graph/codebase-graph.json` /
      `sveltekit-frontend/docs/graph/codebase-graph.json`. **Found**:
      `sveltekit-frontend/scripts/index-codebase-fast.mjs` (line 1011,
      `fs.writeFileSync(graphJsonPath, ...)`). Confirmed via
      `grep -rl "codebase-graph.json" scripts/` cross-checked against
      `writeFileSync` call sites. This script is **not** wired into any npm
      script, `graphify:daily` chain, or `.vscode/tasks.json` — it must be
      run manually: `node scripts/index-codebase-fast.mjs [--skip-redis]`
      from `sveltekit-frontend/`. This is a real gap (root `CLAUDE.md`
      still carried a stale `graphify:map` alias when this task was first
      written) — flagged, not fixed by this change. The real writer is
      `scripts/index-codebase-fast.mjs`; keep any doc alias updates scoped to
      Phase 0A.3 below.
- [ ] 0A.2 Run `node scripts/index-codebase-fast.mjs --skip-redis` from
      `sveltekit-frontend/` to refresh the graph artifact (**started this
      session, running in background — verify completion + new mtime before
      checking this off**).
- [ ] 0A.3 (small follow-up, not blocking) Add an npm script alias (e.g.
      `"graphify:index-fast": "node scripts/index-codebase-fast.mjs"`) and
      keep all doc references pointing at `scripts/index-codebase-fast.mjs`
      as the real writer; do not reintroduce `graphify:map` as a live
      command name.
- [ ] 0A.4 After refresh, freeze `workspace_revision`, `source_revision`,
      `graph_revision` (topology_hash), `node_count`, `relationship_count`,
      `generated_at` from the refreshed artifact and record them in
      `parent-atlas-graph-analysis-contract/tasks.md`'s Patch H section.
- [ ] 0B.1 Re-run `npx tsx scripts/atlas/verify-graph-analysis-gates.mts`
      (or the project equivalent) — require the existing 6/6 PASS to still
      hold after the graph refresh (pagerank/louvain/leiden/cheirank/kcore +
      atlas_packets-column-count-unchanged).
- [ ] 0C — tracked entirely in `parent-atlas-retrieval-fusion-reachability`
      (RF6 fusion-ownership decision). Do not duplicate that scope here;
      link only.

## Phase 1 — Patch H (betweenness)

- [ ] Tracked in `parent-atlas-graph-analysis-contract/tasks.md`. Gated on
      Phase 0A/0B above. Cost metrics (`node_count`, `edge_count`, `sample`,
      `k`, `seed`, `elapsed_ms`, `backend`) and distinct `algorithmRevision`
      values (`betweenness_exact` vs `betweenness_approx_k`) — no silent
      exact→approx downgrade.

## Phase 2 — NLP sidecar closure

- [ ] Tracked in `parent-atlas-nlp-sidecar-feature-compiler/tasks.md`. One
      canonical live fixture, end to end, zero generative LLM calls by
      default (LangExtract opt-in only), deterministic input/output hashes.

## Phase 3 — GPU substrate status sweep

- [ ] Tracked in `parent-atlas-gpu-graph-vector-substrate/tasks.md`. Produce
      one canonical-owner classification table for every GPU/vector
      component (cuVS brute-force/CAGRA, cuGraph, K-Means, PCA, TurboVec,
      Arrow transport, existing rerank adapters) using the
      `CANONICAL_OWNER | BACKEND | ADAPTER | EXPERIMENT | COMPATIBILITY |
      FIXTURE_ONLY | DEAD` vocabulary from `runtime-ownership-registry.json`.

## Phase 4 — GA8 wide feature ablation

- [ ] Tracked in `parent-atlas-graph-analysis-contract` Patch I (GA8/GA9).
      Gated on Phase 0-3. No promotion decisions in this phase.

## Phase 5 — GA9 feature promotion

- [ ] Gated on Phase 4. Promote only GA8 winners into `FeatureRowV1`.

## Phase 6 — Learned ranking (XGBRanker)

- [ ] New scope, not yet captured elsewhere. `CandidateJudgment` replay
      corpus grouped by retrieval request (`qid`), benchmark deterministic
      ranker vs `XGBRanker(objective='rank:ndcg', device='cuda')` vs later a
      small differentiable head. Interpret XGBoost via SHAP-style tree
      attribution, not raw partial derivatives (XGBoost is boosted trees,
      not a smooth function). No promotion without held-out
      recall/repair-success improvement over the current deterministic
      ranker.

## Phase 7 — Feature geometry experiment

- [ ] Gated on Phase 4 (GA8 must identify survivors first). Define
      `FeatureRegistry` per-feature `normalization_revision`/
      `expected_range`/`missing_policy` (see design.md D5).
- [ ] Add `RetrievalExecutionBudget` to cap max active lanes, max graph
      depth, max graph nodes, max rerank batch, max GPU bytes, and max
      latency for a single task.
- [ ] Add `GeometryExperimentManifest` to record the experiment revision,
      source/target space, projection algorithm, and diagnostics
      (`jacobianNorm`, `sigmaMax`, `sigmaMin`, `conditionNumber`,
      `localVolumeScale`, `trustworthiness`).
- [ ] Add `RoutingPolicy` as the explicit policy layer above geometry so
      vector math, HMM state, and policy selection do not collapse into one
      owner.
- [ ] Local sensitivity/gradient experiments only after GA8, and only
      over the promoted `FeatureRowV1` space — never redefines
      `semantic_768` identity.

## Phase 8 — Vector LOD (cuVS/CAGRA/Vamana/DiskANN3)

- [ ] cuVS brute-force exact + CAGRA parity first (extends the already-live
      `atlas_rapids_sidecar.py` on :8098, tracked in
      `parent-atlas-gpu-sidecar-patch-tournament`). cuVS-Vamana GPU index
      build → DiskANN3 (Rust) cold search is a later, separate experiment —
      per cuVS's own docs, cuVS builds/serializes a Vamana index but search
      is currently CPU-side DiskANN, not a cuVS GPU search API. TurboVec
      stays an acceleration backend, never the `semantic_768` identity
      owner (per `runtime-ownership-registry.json`'s existing
      `semantic_768: owner UNKNOWN, unproven: true` — do not fill that gap
      by fiat here).

## Phase 9 — N-ary hypergraph projections

- [ ] New scope. `HyperedgeProjectionManifest` (star/incidence or
      normalized-clique projection), reuse existing PageRank/CheiRank/
      Louvain/Leiden/BFS/SSSP against the projection rather than building a
      custom hypergraph algorithm. Ordered process traces (retrieve →
      inspect → patch → compile → test) are modeled as a DAG, never as an
      "ordered hyperedge."

## Phase 10 — AtlasEnvelopeV1 + validator (this change's own deliverable)

**Status: CREATED + unit-proven in isolation (2026-08-09). Not yet wired
into any live producer.** Per this repo's status-language vocabulary, this
is `CREATED`/`WIRED`-in-isolation, explicitly **not** `RUNTIME_SMOKE_PROVEN`
— nothing here has touched a real NLP-sidecar/GPU-sidecar/graph-analysis
call yet.

- [x] Duplication check first: searched `src/lib/server` for existing
      envelope/validator modules before writing anything
      (`grep -rli "envelope.valid|AtlasEnvelope" src/lib/server`). Found
      `src/lib/server/acp/packet-envelope-validator.ts` +
      `src/lib/server/db/packet-topology-envelope.ts`
      (`PacketTopologyEnvelope`) — read in full. Confirmed **different
      capability, not a duplicate**: that pair validates a packet's
      *at-rest* shape when moving between Postgres/Qdrant/Redis/Neo4j/ACP-RPC
      (packet_key, source_ref, manifold_4d, neo4j neighbors, replacement
      lineage — no producer/pass_name/idempotency_key/ordering_scope/
      sequence_number/input_hash/output_hash fields at all). `AtlasEnvelopeV1`
      wraps an async *producer's pass result* before it's joined/
      materialized — a layered, complementary concept, not a peer owner.
      Documented this distinction directly in the new module's docstring so
      the next reader doesn't have to re-derive it.
- [x] Implemented `AtlasEnvelopeV1` zod schema/type +
      `validateAtlasEnvelope()` (all 10 D3 checks, in order) +
      `joinIntoFeatureRows()` at
      `sveltekit-frontend/src/lib/server/atlas/envelope-validator.ts`.
      Checks 9 (representation revision compatible) and 10 (graph revision
      compatible) now fail closed when no frozen source is wired, instead of
      silently passing. The live `representation_id` / `representation_revision`
      writer is now proven in `sveltekit-frontend/src/lib/server/topology/
      canonical-id-hierarchy.ts` + its focused spec; the semantic_768
      contract wrapper now exists in `sveltekit-frontend/src/lib/server/
      embedding/semantic-lineage.ts` and the packet-level writer in
      `sveltekit-frontend/src/lib/server/embedding/semantic-packet-writer.ts`.
      What remains blocked is only the frozen `topology_hash` / graph
      freshness source (Phase 0A graph-refresh work). The code now treats
      both as explicit lineage gates, not fake passes.
- [x] "Producer/pass known" check (D3.2) takes a `KnownProducerRegistry`
      interface rather than hardcoding a lookup — real callers pass a view
      over `docs/architecture/runtime-ownership-registry.json`; the module
      itself doesn't parse that file (kept swappable/testable).
- [x] Shuffled-delivery replay test:
      `sveltekit-frontend/tests/atlas/envelope-validator.spec.ts` — 7
      tests, including a deterministic-pseudo-shuffle (no `Math.random`, so
      it's reproducible) join proof: same 4 pass results fed to
      `joinIntoFeatureRows` in 5 different orderings all produce an
      identical materialized `FeatureRow[]`, and `missingMask` correctly
      flags each row's one absent required feature without blocking
      materialization. **Ran: 7/7 PASS**
      (`npx vitest run tests/atlas/envelope-validator.spec.ts`).
- [ ] NOT done: wiring into a real producer. Per the original instruction
      ("start with one canonical producer, prove it end to end before
      expanding"), the next step is wiring this validator into the NLP
      sidecar pass registry (Phase 2,
      `parent-atlas-nlp-sidecar-feature-compiler`'s `AnalysisPassResult`)
      once that registry has a live call path to validate against — doing
      that now would mean validating against a mocked registry, which is
      exactly the kind of unproven claim this repo's Agent Execution
      Integrity rules forbid representing as more than it is.
- [x] `docs/architecture/runtime-ownership-registry.json` updated: added
      `atlas_envelope_validation` (this module, CANONICAL_OWNER) and
      `packet_envelope_validation` (the pre-existing
      `db/packet-topology-envelope.ts`, CANONICAL_OWNER for the *different*
      at-rest-shape capability) as two distinct, cross-referenced entries so
      the layering is explicit in the registry, not just in code comments.
      Re-ran `npm run atlas:audit:ownership` — **PASS**, 8 capabilities
      checked (was 6), 0 new violations, 1 known-existing (unchanged), 1
      not-proven (unchanged, `semantic_768`).
- [x] Typecheck: `npx tsc --noEmit` and `npx tsgo --noEmit` both clean
      against `envelope-validator.ts` (zero matching diagnostics in either
      output).

## Stop Conditions (apply throughout, not just at phase boundaries)

Do not start a later phase while: graph revision is unresolved · a
capability's canonical owner is unresolved in
`runtime-ownership-registry.json` · GPU parity is unproven · a
representation ID is ambiguous · an experimental feature hasn't passed GA8
ablation · an existing library (cuGraph BFS/SSSP, cuVS brute-force/CAGRA/
KMeans/PCA) already owns the numerical primitive being considered for
reimplementation.
