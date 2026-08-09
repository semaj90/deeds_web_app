# Proposal: Agentic Repair Toolkit Bundle — Controlled Integration Ladder

## Why

An external reference bundle exists (repair-loop scripts + RRF/RFF oracle implementations +
graph/vector parity scripts + an evaluation harness) that is useful as **reference algorithms and
bounded integration pieces**, not as a second production system to bolt on wholesale. The failure
mode this proposal exists to prevent: turning everything in the bundle on at once, which would
(a) create a 14th RRF-shaped implementation exactly like the 13 already censused in
`parent-atlas-retrieval-fusion-reachability`, (b) let an unseeded/non-deterministic RFF projection
into ranking before its input representation (`semantic_768`) is even trustworthy, and (c) mix
PageRank/authority into the embedding space instead of keeping it as a separate feature-row
column — a mistake this repo has already made and partially unwound once (see the
`parent-atlas-retrieval-lod-algorithm-taxonomy` 2026-08-08 addendum on the reverted `graphScore`
double-count).

**Core distinction driving the whole ladder**: RRF (candidate fusion) and RFF (a derived geometric
feature from random Fourier features) solve *different* problems and must enter Parent Atlas at
different points, evaluated separately. RRF may improve candidate recall. RFF may improve reranking
discrimination. Conflating them — or wiring either straight into production before it's proven —
repeats this repo's own documented anti-pattern.

## The integration ladder (14 phases)

### Phase 1 — Wire only what is already structurally safe

Copy the bundle into a temporary integration area, **not directly over canonical files**. Use the
existing repair spine (`repair-loop.ts`, `phase79-agentic-repair.mts`, `hmm-repair` Rust crate — see
README "Existing repo anchors") as the reference implementation to diff against, not a blank slate.

Wire only: `observe-error.mts` → `repair-state-hmm.mts` → `localize-symbols.mts` →
`build-repair-context.mts` → `verify-repair.mts` → `record-repair-episode.mts`.

**Explicitly not wired in this phase**: RFF, cuVS, cuGraph, PPR, or any new graph-traversal code.

**Milestone (must pass before Phase 2 starts)**: one known failing test, run end-to-end through
`observe error → fingerprint → repair-state probabilities → ranked symbols → bounded context →
manual surgical patch → targeted verification → episode record`. If that loop closes on one real
failure, the repair spine is real. If it doesn't close, stop and fix the spine — do not proceed to
Phase 2 on a partially-working loop.

### Phase 2 — Connect the repair scripts to `trace_dynamic_context`

The bundle's localization/context scripts ship with simple JSON test inputs. Replace those with
this repo's existing evidence layer instead of letting the bundle grow a second context engine.

Target data flow:
```
observe error → RepairObservation → trace_dynamic_context.ts
  → ast-grep / ts-morph / Tree-sitter → Graphify → Postgres + Qdrant (runtime, test evidence)
  → canonical symbol candidates → localize-symbols.mts (ranks only; does not fetch)
```

`trace_dynamic_context` must supply: `symbolId`, `packetKey`, `filePath`, references, callers,
tests, `denseScore`, `bm25Score`, `pagerankAuthority`. `localize-symbols.mts`'s only job is to rank
those already-assembled candidates — it must not independently query Postgres/Qdrant/Neo4j.

### Phase 3 — Finish `semantic_768` before RFF

Before any RFF experimentation, the canonical semantic input must be trustworthy. Required
invariant (already owned by `parent-atlas-semantic-768-canonical-contract` — this phase is a
go/no-go gate on that contract's outstanding drift item closing, not a new contract):

- EmbeddingGemma raw output length == 768, `semantic_768` Qdrant collection dimension == 768.
- No runtime dependence on 384-dim anywhere in the active retrieval path.
- L1 (in-process) and L2 (Bifrost) precomputed-vector caches are protected/validated too — a cold
  Ollama health check alone does not guarantee end-to-end dimensional correctness of a *cached*
  vector that was written before a model swap.

Only after this closes does RFF get permission to accept `semantic_768` as its source
representation (Phase 7).

### Phase 4 — Make RRF ownership explicit (this is RF6, restated with two concrete options)

The bundle includes a small CPU `rrf.ts`. **Do not let it become an automatic 14th production RRF
owner.** This repo already has multiple RRF implementations (RF2's 13-owner census) and Qdrant
itself can perform server-side fusion. The next RF6 task is choosing exactly one canonical fusion
policy:

- **Option A**: Qdrant owns dense+sparse RRF (`Qdrant dense_768 + Qdrant sparse → Qdrant
  server-side RRF → candidate list`); Parent Atlas fuses only non-Qdrant lanes afterward, only if
  necessary.
- **Option B**: Parent Atlas owns all-lane RRF (`Qdrant dense + BM25 + graph retrieval + other
  lanes → Parent Atlas canonical RRF`). More flexible if Neo4j graph candidates need to participate
  directly in fusion.

The bundle's `rrf.ts` is initially an **oracle test reference only** — run it against frozen lane
rankings and confirm it agrees mathematically with whatever RF6 ultimately declares canonical. It
never becomes a second production implementation.

### Phase 5 — Get PageRank into the feature row correctly

Before RFF, close the structural feature that already exists. Desired path:

```
Graphify → Neo4j graph → Neo4j GDS PageRank → pagerank_raw → L1 percentile normalization
  → Postgres → pickPageRankAuthorityScore() → FeatureRow.pagerankAuthority
```

Use **one** field, `pagerankAuthority: number` — not `pagerank`/`authority`/`graph` as three
separate fields — unless a future measurement genuinely proves they're separate algorithms worth
separate weights. (`pickPageRankAuthorityScore()` already exists in this repo at
`src/lib/server/topology/pagerank-authority.ts` per the audit in
`parent-atlas-retrieval-lod-algorithm-taxonomy`'s 2026-08-08 correction — use it, don't
reimplement it.) Attach provenance alongside the value: `{ pagerankAuthority: 0.83, graphRevision,
normalizationRevision: 'pagerank_percentile_v1' }`.

### Phase 6 — Make `FeatureRow` the convergence point (staged, not all fields at once)

Start with a minimal, shippable shape:

```typescript
type FeatureRowV1 = {
  packetKey: string;
  dense: number;
  sparse: number;
  rrf: number;
  ast: number;
  pagerankAuthority: number;
  freshness: number;
  crossEncoder: number;
  featureRevision: string;
  graphRevision: string;
};
```

Add `rffSimilarity` only in `FeatureRowV2` (after Phase 7–8 prove RFF adds signal), and
`latent128Similarity` only in `FeatureRowV3` (after Phase 10 proves the `latent_128` byte contract).
This staging is what makes ablation (Phase 9) clean — each version is a testable hypothesis, not a
kitchen-sink object nobody can attribute a ranking change to.

### Phase 7 — Turn RFF into an experimental projection with a fixed representation contract

`rff.ts` must not be called ad hoc from retrieval. Give it a full representation contract:

```typescript
{
  representationId: 'rff_256',
  sourceRepresentationId: 'semantic_768',
  algorithm: 'random_fourier_features',
  kernel: 'rbf',
  outputDimension: 256,
  gamma: <fixed>,
  seed: 1337,
  revision: 'atlas_rff_rbf_v1',
}
```

The seed is load-bearing: without a fixed seed, the same `semantic_768` vector produces a different
RFF vector on every run, which destroys reproducibility for anything downstream (caching, ablation,
audit). The projection must be deterministic: `semantic_768 → fixed W, b (seeded) → rff_256`.
Compare `cosine(semantic_768_a, semantic_768_b)` against `dot(rff_256_query, rff_256_candidate)` as
the correctness check that the projection actually approximates the intended kernel.

### Phase 8 — Do not put RFF in Qdrant yet

For the first evaluation round, compute RFF only on the final fused candidate set (e.g. Qdrant
dense top-50 + BM25 top-50 + graph top-30 → RRF union ~80 candidates → RFF similarity computed for
each of those ~80, not for the whole collection). This is far cheaper than standing up a
`qdrant_collection_rff_256` and is reversible if RFF turns out not to help. Only create a dedicated
RFF Qdrant collection if evaluation (Phase 9) shows RFF improves *candidate generation*, not merely
reranking of an already-fused set — those are different claims requiring different evidence.

### Phase 9 — Domain 10 (evaluation) becomes the gatekeeper for everything above it

Turn the bundle's `retrieval_ablation.py` / `repair_eval.py` into real evaluation inputs, not demo
scripts. Run variants:

- **A**: baseline (dense + sparse + AST + PageRank)
- **B**: A + RRF score
- **C**: A + RFF similarity
- **D**: A + RRF + RFF
- **E** (later): D + `latent128`

Measure: Recall@5, Recall@10, MRR, NDCG@10 for retrieval; execution-success repair-localization
Recall@1 / Recall@5, repair success rate, false-edit rate, and latency for the repair loop. This is
the mechanism that distinguishes RRF's effect (candidate recall) from RFF's effect (reranking
discrimination) — they solve different failure modes and must not be credited to each other.
Check `phase-2f1-real-evaluation-corpus` before building a labeled query set from scratch.

### Phase 10 — `latent128` comes after the RFF baseline, and only after its byte contract is proven

Treat `latent_128 BYTEA` as a derived representation, not an opaque database blob. Before using it
as a feature, prove: length, dtype, dimension, producer, source representation, projection revision
— **do not infer shape from byte count alone** (256 bytes could be 128×fp16 or 64×fp32; guessing
wrong silently corrupts every downstream similarity score). Define a decoder contract:

```typescript
interface LatentVectorContract {
  representationId: 'latent_128';
  dimension: 128;
  dtype: 'float16';
  byteLength: 256;
  sourceRepresentation: 'semantic_768';
  revision: string;
}
```

Only after this lineage is proven does `latent128Similarity` become an active `FeatureRowV3` field.

### Phase 11 — Use NetworkX as the graph oracle

Run the bundle's `networkx_pagerank_oracle.py` against a frozen Graphify snapshot (small/medium
size) as a simple, independent reference implementation. Compare NetworkX vs. the live Neo4j GDS
PageRank on the *same* graph snapshot: top-100 overlap, Spearman correlation, max absolute
difference, L1 sum. This proves the graph *interpretation* itself is consistent before trusting any
GPU-accelerated variant. Blocked on `parent-atlas-graph-retrieval-proof`'s identity split landing —
do not run this against an unpromoted/provisional graph snapshot.

### Phase 12 — cuGraph, only after Neo4j/NetworkX parity

Run `cugraph_pagerank_parity.py` on the RTX 3060 Ti only after Phase 11 passes. Now there are three
reference points: NetworkX (CPU correctness oracle), Neo4j GDS (current operational PageRank),
cuGraph (GPU candidate). Promote cuGraph only if: same graph snapshot, same damping factor, same
convergence policy, materially similar rank order, and materially better runtime than Neo4j GDS.
If promoted, the resulting division of labor is: daily full Graphify → cuGraph for operational
graph queries → Neo4j remains canonical for derived/persisted results → Postgres as truth.

### Phase 13 — cuVS next, for vectors only

Use the bundle's `cuvs_exact_knn.py` first as a `semantic_768` matrix exact-KNN oracle: compare
Qdrant ANN top-k against cuVS exact top-k on the same query set. Only after that oracle comparison
is stable should CAGRA (approximate, GPU-accelerated) be tested against the same oracle. For
agentic repair specifically, cuVS is useful for "find code that previously solved a structurally or
semantically similar problem" — it is **supporting evidence**, not the first localizer. The first
localizer remains diagnostic location: TypeScript symbol / call graph / test graph (Phase 1–2's
`localize-symbols.mts` + `trace_dynamic_context`). Semantic ANN augments that; it doesn't replace it.

### Phase 14 — Closed-loop agentic repair

Only once Phases 1–13's foundations are wired does the bundle's full repair loop run on real
failures:

```
Vitest FAIL → observe error → fingerprint → HMM posterior
  → trace_dynamic_context → symbol candidates → localize-symbols → repair context
  → (external patch proposal) → ast-grep targeted edit → verify-repair → test result
  → HMM update → record-repair-episode
```

The behavioral shift this produces: the agent stops behaving like "search files, guess, edit" and
starts behaving like "gather evidence, maintain a belief state, localize the cause, intervene
minimally, test the hypothesis, learn from the outcome."

## Execution order (from the bundle, right now — 16 steps)

This is the literal sequencing to follow once the bundle is actually supplied to this repo (see
README — it is not present yet):

1. Copy bundle into an integration branch / temp area (not over canonical files).
2. Close the `semantic_768` invariant (Phase 3 gate).
3. Refresh Graphify.
4. Connect `observe-error` → `trace_dynamic_context`.
5. Connect `ts-morph` symbol localization.
6. Wire one PageRank/authority signal (Phase 5).
7. Establish `FeatureRowV1` (Phase 6).
8. Establish the Domain 10 evaluation baseline (Phase 9, variant A).
9. Prove the RRF canonical owner (Phase 4 / RF6).
10. Add RFF as an experimental `FeatureRowV2` field (Phase 7).
11. Ablate RFF (Phase 9, variants B–D).
12. Prove the `latent_128` BYTEA contract (Phase 10).
13. NetworkX ↔ Neo4j GDS PageRank parity (Phase 11).
14. Neo4j GDS ↔ cuGraph parity (Phase 12).
15. Qdrant ANN ↔ cuVS exact parity (Phase 13).
16. Closed-loop repair on a replay corpus (Phase 14).

## What this proposal does NOT do

- Does not add the bundle's files to this repo — they are not present; obtaining/placing them is a
  prerequisite this proposal cannot satisfy on its own.
- Does not pick Option A vs. Option B for RF6 (Phase 4) — that decision belongs to
  `parent-atlas-retrieval-fusion-reachability` and needs its own explicit sign-off.
- Does not re-litigate the `semantic_768` contract — cites it as a gate, doesn't reopen it.
- Does not authorize any RFF/cuVS/cuGraph/PPR code to affect production ranking. Every GPU-adjacent
  phase here (10–13) stays in oracle/comparison mode until its parity gate explicitly passes.
- Does not commit to the MoE/GEPA/Engram research material below being built — captured as deferred
  notes only (see Appendix), because none of it has a phase gate, an owner module, or a measurement
  plan yet.

### Phase 15 — Real Viterbi + Baum-Welch HMM for MCP tool selection (correction + upgrade path)

This phase corrects an assumption made earlier in this change's own review process and turns the
correction into a concrete next step. It is a **separate concern from Phases 1–14** (live MCP
query→tool routing, not code-repair state tracking), grouped here because it reuses the same
"don't build a second implementation of something that already exists" discipline and because the
misclassified file that prompted it (`src/lib/server/hmm/tool-router-hmm.ts`, orphaned root tree)
was found during this change's T0a review.

**2026-08-08, later same day — second correction, this time on the router itself**: the file
literally named `sveltekit-frontend/src/lib/server/router/viterbi-router.ts` was checked next,
expecting it to be the real Viterbi implementation this phase would build on. **It is not** — same
misnomer pattern as `hmm/tool-router-hmm.ts`. Its own docstring says "Phase 1: Route decision
without learned probabilities... Phase 3: Bounded recovery (hard state rules, no invalid
transitions)" and the code matches: `classifyToolResult()`/`nextLegalState()` are if/else result
classifiers, `makeRouteDecision()` calls the deterministic ranker and returns its top candidate —
there is no dynamic-programming table, no log-probabilities, no backpointer array anywhere in the
file. Two files in this repo now carry "HMM"/"Viterbi" in their name while containing neither
algorithm; treat every such name in this codebase as unverified until read.

**Third, more serious finding**: `sveltekit-frontend/src/lib/server/router/
telemetry-ranking-bridge.ts` — the module `router-types.ts`'s own Phase 3 plan depends on for
historical success rates and transition priors — has its three DB-loading functions
(`loadHistoricalMetrics`, `loadTransitionCounts`, `loadCacheStats`) **hardcoded to return zero/
neutral mock values**, each with a `// TODO: Implement actual database query` comment. `Grep`
across `sveltekit-frontend/src/lib/server/db/` for `outcome_ledger`, `tool_call_events`, or
`proposed_tool_calls` (the three tables every one of these TODOs names) returns **zero hits** —
none of these tables are declared in the Drizzle schema at all. This means the "confirm 160+
traces exist" checkpoint proposed below is unreachable as stated: there is no code path, mocked or
real, that could have written a real row to begin with. The actual first checkpoint is earlier:
**build the persistence layer**, not verify its row count.

**What's actually in the repo today** (verified by reading the code, not assumed):

- Two **real, working Viterbi decoders** exist — log-space dynamic programming with a backpointer
  array and backtracking — but both are for **legal document section classification** (7 states:
  `PARTIES → JURISDICTION → FACTS → LEGAL_AUTHORITY → CLAIMS → PRAYER → HOLDING`), not tool
  selection: `simd-bridge/rust/hmm-repair/src/lib.rs` (`predict_chunk_rust`, native N-API) and its
  TS mirror `sveltekit-frontend/src/lib/server/analysis/hmm-section-classifier.ts`. Both use
  hand-authored, fixed transition/emission probabilities — **no Baum-Welch training exists
  anywhere in this repo.**
- The actual MCP tool-selection code, `sveltekit-frontend/src/lib/server/router/` (`router-types.ts`
  + `deterministic-tool-ranker.ts`, ~450 lines total), is explicitly staged for this upgrade
  already — its own file header says: "Phase 1: Eligibility gates → weighted ranking (heuristic
  scores, no ML yet). Phase 2: Bounded recovery. **Phase 3: Gold replay dataset (160+ examples for
  later Baum-Welch training)**." It already defines `RouterState` (11 states: START, RETRIEVE,
  STRUCTURE, LEGAL_ANALYZE, OPERATE, VALIDATE, RECOVER, CLARIFY, SYNTHESIZE, ESCALATE, DONE),
  `ALLOWED_TRANSITIONS`, and a full `RouteTrace` telemetry record (decision, proposal, execution,
  recovery, final outcome) — i.e. it's already collecting exactly the sequence data a Baum-Welch
  fit needs, per `memory/SESSION-129B-DETERMINISTIC-ROUTER-WIRING-COMPLETE.md`'s own Phase 3 plan
  ("collect 160+ traces → fit Baum-Welch model → compare learned vs. hard-coded
  `ALLOWED_TRANSITIONS`").
- The orphaned `hmm/tool-router-hmm.ts` (T0a) is neither of the above — no transition/emission
  matrices, no Viterbi, just threshold if/else logic mislabeled as "HMM." Not useful here; not
  salvaged.

**Target design** (do not build a third HMM implementation — port the proven Viterbi pattern, don't
reinvent it):

1. **Reuse the existing Viterbi kernel's shape**, re-parameterized for the router's own state space
   instead of legal-document states:
   - States: `RouterState` (already defined in `router-types.ts` — 11 states, not 7).
   - Emissions: replace "word given legal section" with **"observed signal given router state"** —
     the router already computes exactly this per candidate in `ToolCandidate`
     (`semanticScore`, `intentScore`, `schemaFitness`, `transitionScore`, `healthScore`,
     `historicalSuccessScore`, `provenanceScore`, `latencyScore`, `topologyScore`). Discretize or
     treat as continuous Gaussian emissions per state — do not silently reuse the legal-document
     emission tables, they model a different signal space entirely.
   - Transitions: seed from the existing hand-authored `ALLOWED_TRANSITIONS` (as a hard 0/1 mask on
     which transitions are even legal) combined with soft empirical frequencies once real
     `RouteTrace` sequences exist — this matches Phase 2's own stated plan of "hard gates now,
     learned probabilities later," not a replacement of the gate.
2. **Viterbi decode = "best tool sequence for this query," not "best single tool."** The router
   currently ranks candidates per-step (`ToolCandidate.compositeScore`); Viterbi over the full
   `RouterState` sequence answers a different, more useful question: given the query's observed
   signals across the whole conversation/retrieval path so far, what is the single most probable
   *state path* (not just next state) — which naturally accounts for "cheap tool now sets up a
   better tool later" sequencing that greedy per-step ranking can't see.
3. **Baum-Welch training runs offline, batch, against `RouteTrace` history** — never online, never
   per-request. Per `router-types.ts`'s own Phase 3 note: needs 160+ diverse traces first. **This
   phase cannot start yet at all** — see the correction above: `telemetry-ranking-bridge.ts`'s
   loaders are mocks and `outcome_ledger`/`tool_call_events`/`proposed_tool_calls` don't exist in
   the schema. The real first step is Task 0 below (build the write path), not verifying a row
   count against tables that were never created.

   **Where to persist, and why this is where Bitfrost/Langfuse/Kafka-CDC genuinely become
   relevant** (raised by the user; checked against what's actually stubbed in this repo rather than
   assumed): `getCacheWarmth()` in `telemetry-ranking-bridge.ts` already has a TODO reading
   `// TODO: Query Redis cache statistics` — i.e. this exact file already gestures at Bitfrost
   (this repo's Redis L2 semantic cache, real and documented in root `CLAUDE.md`) as the intended
   fast-path for tool cache-warmth scoring. That's a legitimate, already-half-specified integration
   point: warm/cold tool-result cache stats belong in Bitfrost, not a fresh Postgres table.
   Langfuse (real, port 3030, already used elsewhere in this repo for embedding/search/queue
   traces per `CLAUDE.md`'s "Redis L1 + Bifrost L2 Cache System" section) has **no existing router
   integration** — sending `RouteTrace` spans there would give this phase free observability
   instead of hand-rolled dashboards, and is a reasonable target once traces exist. **Kafka
   CDC is a different case**: `parent-atlas-kafka-projection-initiative` is an explicit ownership
   stub with zero technical spec and its own README lists absorbing/being-absorbed-by other
   initiatives as a non-goal. CDC (Postgres logical replication → Kafka) is a plausible *future*
   way to stream `tool_call_events` writes to Langfuse/a Baum-Welch training job without bespoke
   fan-out code at every call site — but only once the source tables exist and have a real write
   path. Treat it as a candidate downstream consumer to revisit later, not a dependency of Task 0.
4. **Learned transitions are proposed as an addition, not a replacement**, exactly as
   `router-types.ts` already states ("Compare learned vs. hard-coded `ALLOWED_TRANSITIONS`") — keep
   `ALLOWED_TRANSITIONS` as a hard safety mask (a learned model must never be allowed to propose an
   illegal transition, e.g. skipping `VALIDATE` before `SYNTHESIZE` on a query with
   `requiresExactSourceRefs: true`); the learned probabilities only re-weight among transitions the
   hard mask already permits.
5. **Evaluation before promotion**: run the learned (Baum-Welch-fit) transition/emission model
   side-by-side against the current deterministic ranker on the same replay corpus — measure tool
   selection agreement rate, downstream task success rate, and recovery-loop length — before
   replacing `deterministic-tool-ranker.ts`'s output with the HMM's Viterbi path. This is the same
   ablation discipline as Phase 9 (Domain 10) above, applied to a different subsystem.

**Explicitly out of scope for this phase**: modifying `hmm-section-classifier.ts` or
`hmm-repair`'s Rust crate (they serve a correct, unrelated purpose — legal document structure — and
must not be repurposed or renamed to imply they already do tool routing); training via online/live
traffic; removing `ALLOWED_TRANSITIONS` as a hard gate.

### Phase 16 — Proto/RPC tool registry retrieval feeds `RouterObservation.availableTools`

Sourced from `reports/parent-atlas-open-lanes-todo.md` item #12 ("Proto / RPC tool registry") —
that report's own checkboxes are stale and were verified against the actual repo state below
rather than trusted as written, following this change's established discipline.

**What the report claims vs. what's actually true** (checked, not assumed):

| Report's checkbox | Report says | Actually verified |
|---|---|---|
| "Create `audit-proto-registry.mjs`" | listed as `- [ ]` open, "OWNER: to be created" | **Already exists**, 699 lines, real dry-run/apply implementation with a documented lineage contract (`packet_key = sha256(rpc:{service}.{method})`, `source_ref = proto:{service}.{method}`, `feature_id = grpc_service`, `domain_class = mcp_agents`) |
| "packetize gRPC services → atlas_packets" | `- [ ]` open | **Already done** — `docs/reports/proto-registry-audit.json` shows a real `mode: "apply"` run (2026-07-04): 13 proto files scanned, 12 services, 61 RPC methods, 61 rows written to Postgres, Qdrant, and Redis each |
| "embed tool manifests into Qdrant" | `- [ ]` open | **Already done** — same apply run wrote all 61 packets to Qdrant with `qdrant_point_id`s |
| "wire Qdrant RPC retrieval → MCP runtime selection (Gemma4 gets top-K tools, not flat 300+)" | `- [ ]` open | **Confirmed genuinely open** — `Grep` across `router/` and `mcp/` for any narrowed-tool-retrieval call found nothing |
| "wire Neo4j RPC graph → tool dependency edges" | `- [ ]` open | **Confirmed genuinely open** — no `SIMILAR_TOOL`/tool-dependency edge writer found |

**Why this matters for T15/Phase 15 specifically**: `RouterObservation.availableTools:
Map<string, ToolDescriptor>` (the input this whole change's HMM/Viterbi design consumes) has to
come from somewhere. The 61 packetized RPC-method manifests already sitting in Qdrant with
embeddings are exactly the source that call site should query — top-K by semantic similarity to
the current user query, narrowed from "all 61+ tools" to a bounded candidate set — instead of
whatever currently populates `availableTools` (not traced in this pass; check before assuming it's
hardcoded or a flat list).

A second, related stub found in the same review: `sveltekit-frontend/src/lib/server/router/
authority-ranking-bridge.ts`'s `scoreTopologyAuthority()` is *also* a hardcoded-neutral-default
mock (`// TODO: Wire to Redis cache (couchdb:pagerank_scores)`) — it's supposed to implement the
"Karpathy blend" (`0.4·PageRank + 0.3·Authority + 0.3·Attention`, already documented as the
project's canonical hybrid-rerank formula in root `CLAUDE.md`) for ranking *tools themselves* by
graph centrality, the same way Phase 5 above wires PageRank into *packet* ranking. Same pattern,
same fix shape, different target object (tools vs. packets) — worth doing together since they share
the same Neo4j/Redis authority-lookup plumbing.

**Task order** (does not require T15.0's persistence work — this is retrieval, not telemetry):

1. Verify what currently populates `RouterObservation.availableTools` today (static list? another
   stub?) before replacing it — don't assume.
2. Wire a Qdrant top-K query against the 61 existing packetized RPC-method manifests, filtered by
   `domain_class=mcp_agents`, ranked by embedding similarity to the current query — this becomes
   the new `availableTools` source.
3. Wire `authority-ranking-bridge.ts::scoreTopologyAuthority()` to real Neo4j PageRank +
   `couchdb:pagerank_scores` Redis cache, replacing the neutral-0.5 stub — reuse
   `pickPageRankAuthorityScore()` (Phase 5) rather than writing a third PageRank reader.
4. Write `SIMILAR_TOOL` (or equivalently-named) Neo4j edges between tools that are frequently
   selected together or have caller/callee relationships in the gRPC service graph, as the
   "Authority(tool): hub score in SIMILAR_TOPOLOGY edges" input `authority-ranking-bridge.ts`
   already expects but has no writer for.
5. Once both are live, re-run `audit-proto-registry.mjs` in `--apply` mode to confirm the 61-packet
   count is still current (13 proto files could have grown since 2026-07-04).

## Ladder reconciliation: `reports/parent-atlas-open-lanes-todo.md`'s 12-item version

That report carries its own compressed "Controlled Integration Ladder — Deferred Addendum" (its
lines 51–67), evidently describing the same plan as Phases 1–14 above. Checked side-by-side
(2026-08-08) rather than assumed identical:

| That ladder's item | Corresponds to |
|---|---|
| 1–2 (stage bundle, prove one repair loop) | Phase 1 |
| 3 (`trace_dynamic_context`) | Phase 2 |
| 4 (semantic_768 canonical) | Phase 3 |
| 5 (RRF canonical owner) | Phase 4 |
| 6 (`FeatureRowV1`) | Phase 6 |
| 7 (RFF experimental, seeded) | Phase 7 |
| 8 (RRF/RFF stay separate) | Phase 8 |
| 9 (PageRank as one normalized field) | Phase 5 |
| 10 (NetworkX → Neo4j GDS → cuGraph → cuVS oracle order) | Phases 11–13 |
| 11 (defer cuGraph/cuVS promotion) | Phase 12–13's promotion gates |
| 12 (close repair loop after real failures) | Phase 14 |

**Two real gaps in that ladder, not just a numbering difference**:

1. **No evaluation step at all.** The ladder says "add RFF only as an experimental projection"
   (#7) but names no mechanism for judging whether it helped — that's this proposal's Phase 9
   (Domain 10 evaluation gatekeeper), entirely absent from the 12-item version. Without it, "RFF is
   experimental" has no exit criterion — it either stays experimental forever or gets promoted on
   vibes. Phase 9 is not optional scaffolding; it's the thing that makes item #7 meaningful.
2. **`latent_128`'s byte-contract proof (Phase 10) is missing entirely** — the ladder jumps from
   RFF straight to the NetworkX/cuGraph/cuVS oracle sequence (#10) without ever mentioning
   `latent_128`, even though `FeatureRowV3` (this proposal's Phase 6) explicitly depends on it.
3. **Sequencing inconsistency**: the ladder orders PageRank (#9) *after* `FeatureRowV1` (#6),
   which would mean shipping `FeatureRowV1` before its `pagerankAuthority` field has a real data
   source. This proposal's Phase 5 (PageRank) intentionally precedes Phase 6 (`FeatureRowV1`) for
   exactly this reason — a field can't be included in a "small, explicit field set" (the ladder's
   own words for #6) before the thing that populates it exists. Treat this document's Phase
   ordering (1→2→3→4→5→6→7→8→9→10→11→12→13→14) as authoritative; the open-lanes-todo ladder's
   9-after-6 ordering is the one to fix, not the other way around.

This document (Phases 1–16) is the fuller, corrected version. Cross-linked from the source report
so its compressed ladder points here instead of drifting independently.

### Phase 17 — Correction: most of the Appendix's "speculative, no owner module" material already
### has real, wired owner modules (found via broad `rg` sweep, 2026-08-08)

The Appendix below was originally written assuming 4D-topology/hypergraph/token-remap/glyph-cache/
Engram/OKF work was purely conceptual research with no anchor in this codebase. A broad `Grep`
sweep prompted by the user (searching for Kafka CDC, tensor/LLM inference, RotorQuant/TurboQuant
naming, Redis-Valkey centroid/Bitfrost, GPU token remapping, NES/CHR97 glyph caching, 4D topology
manifolds, HypergraphRAG, Engram, KMeans/ontology-linked `.okf` YAML, multi-hop Qdrant/RRF) found
that most of this **already exists as substantial, real code** — this section corrects the record.

**Real and substantial (verified by reading the files, not assumed):**

- **4D topology manifold + quaternion similarity**: `sveltekit-frontend/src/lib/server/search/
  quaternion-manifold.ts` (602 lines) — treats `manifold4 = [som_x, som_y, semantic_z, grpo_w]` as
  a point on the unit 3-sphere, uses quaternion dot-product for similarity, and explicitly notes a
  "bicubic → tricubic upgrade" path (adding `grpo_w` as a depth parameter). This is the "4D
  topology manifold... tricubic" concept the user asked about — it's not speculative, it's shipped.
- **HypergraphRAG, 4D-addressed**: `sveltekit-frontend/src/lib/server/features/cases/
  hypergraph-4d.ts` (1,501 lines) — n-ary hyperedges (`RESEARCH_CLUSTER`, `ACE_CONTEXT`,
  `LEGAL_PRINCIPLE`) over the same 4D manifold, with an HGNN-style propagation formula
  (incidence-weighted hyperedge aggregation, GRPO-reward-weighted edge importance) cited to
  Feng et al. 2019.
- **Manifold-bounded retrieval**: `sveltekit-frontend/src/lib/server/retrieval/
  manifold4-search.ts` — 4D Euclidean neighborhood search directly over
  `codebase_chunk_index.manifold4`, no pgvector required (plain `real[]` column + GIN/B-tree index).
- **Centroid caching (the Bitfrost/Valkey piece)**: `sveltekit-frontend/src/lib/server/retrieval/
  centroid-cache.ts` (583 lines) — precomputed cluster centroids in Redis
  (`taxonomy:clusters:gpu:<id>`, `taxonomy:clusters:som:<x>:<y>`), `getClusterCentroid()` /
  `nearestCluster()` API, fed by the `graphify:semantic` / SOM-topology pipeline.
- **Token remapping**: `sveltekit-frontend/src/lib/server/token-map/` (`token-map-service.ts`,
  `token-map-mapper.ts`, `token-map-types.ts`, plus tests) — builds `NesCartridge`/`TokenMapCard`
  rows keyed by `manifold4`, `turbovecRef`, `tokenCost`/`compressedTokenCost`. This is the "token
  remapping for GPU tokens" / "NES CHR97" piece — real, tested, tied to the same manifold4 identity.
- **Glyph/cartridge caching layer**: `sveltekit-frontend/src/lib/server/cartridge/
  glyph-tile-engine.ts`, `glyph-mappers.ts`, `src/lib/server/glyph/glyph-mappers.ts`,
  `src/lib/types/glyph.ts`, `src/routes/api/glyph/search/+server.ts`, plus a Svelte
  `GlyphAtlasPanel.svelte` component — matches root `CLAUDE.md`'s documented G36–G47 Glyph/
  Cartridge/ACE audit gates. Real, not aspirational.
- **Engram**: `sveltekit-frontend/src/lib/server/search/engram-bigram.ts`,
  `src/lib/server/ai/engram-memory.ts`, `src/lib/server/memory/local-engram-memory-adapter.ts` —
  and critically, these compile into the production build (`build/server/chunks/
  engram-bigram-*.js`, `engram-memory-*.js`), confirming they're live, not dead code. Matches root
  `CLAUDE.md`'s already-recorded decision: "Engram: decided — hint-only, fail-open, 0.05 boost
  max." This is real, not the deferred/unstarted item the Appendix originally implied.
- **OKF (`.okf.yaml`) is further along than this change's own README claimed.** A real file exists
  at `sveltekit-frontend/src/lib/server/okf/mastra-workflows.okf.yaml`, and `docs/okf/parent-atlas/`
  is a fully generated bundle (`index.md` + `architecture/`, `agent-runtime.md`,
  `concepts-and-ontology.md`, `domains-identity.md`, `event-pipeline.md`, `graph-analytics.md`, plus
  a `gaps/` directory with 9 real gap writeups: `agentic-error-fixing.md`,
  `fragmented-representations.md`, `missing-cluster-run-lineage.md`,
  `missing-concept-edge-ledger.md`, `missing-domain-lineage.md`, `missing-library-review.md`,
  `missing-som-run-lineage.md`, `mock-stub-resolution.md`, `topology-schema-drift.md`), with
  frontmatter status `PARTIAL_PROVEN`. **This directly contradicts** this change's earlier claim
  ("registering this taxonomy as an OKF page is blocked on
  `PARENT_ATLAS_KNOWLEDGE_GAP_AUDIT_V1` landing first") and `parent-atlas-okf-knowledge-layers`'s
  own README, which says that slice is "design/audit only, not yet implemented." One of the two is
  stale — the generated bundle on disk is hard evidence of at least partial implementation. This
  needs reconciling in `parent-atlas-okf-knowledge-layers` directly, not silently assumed here.

**Confirmed still absent (Appendix's framing was correct for these)**:

- **Kafka CDC**: zero hits for `kafka` anywhere in `sveltekit-frontend/src/` — still exactly the
  zero-spec stub `parent-atlas-kafka-projection-initiative` describes.
- **Softcap / Ewin Tang ℓ2-sampling**: zero hits for `softcap`, `tanh(x/s)`-style bounded
  normalization, or ℓ2-length-squared sampling anywhere in the codebase. Domain 8 of
  `parent-atlas-retrieval-lod-algorithm-taxonomy` (quantization) is correctly marked `BLOCKED` —
  no correction needed here.
- **"Isoquant" / "Quanterion"**: not found as distinct concepts. The only real, matching
  terminology in this repo is `rotorquant` (the canonical `gemma4-rotorquant:latest` model name)
  and `TurboQuant` (the KV-cache compression scheme, both extensively documented in root
  `CLAUDE.md`) — likely what these terms were referring to. No new concept to track.

**Action items**:
1. File a correction against `parent-atlas-okf-knowledge-layers` — its README's "not yet
   implemented" claim conflicts with the generated `docs/okf/parent-atlas/` bundle already on disk.
2. Before any future phase in this document designs a *new* 4D-manifold, hypergraph, token-remap,
   glyph-cache, or Engram mechanism, check `quaternion-manifold.ts`, `hypergraph-4d.ts`,
   `manifold4-search.ts`, `token-map/`, `cartridge/glyph-tile-engine.ts`, and `engram-*.ts` first —
   duplicating any of these would repeat this change's own core lesson (the RRF 13-owner
   anti-pattern) in a new subsystem.
3. This phase does not itself wire anything new — it's a correction to prevent future phases
   (especially Phase 15's HMM work, which already touches `manifold4` via
   `quaternion-manifold.ts`'s `hmmAxisMultiplier()`) from being designed in ignorance of this
   existing infrastructure.

## Phase 18 — External architecture brief (K3/KDA-inspired), reconciled against Phases 1–17

The user supplied an extensive external architecture brief (Kimi K3/KDA-inspired: bounded recurrent
state vs. occasional expensive exact computation) plus a re-scored gate checklist and a
dependency-ordered "next 10 actions" list. This phase captures the concrete, reusable proposals
from that brief and reconciles them against what's already decided in Phases 1–17, rather than
treating it as a parallel plan. **Nothing in this phase is implemented yet** — it's a design
capture + reconciliation pass.

### The core proposal worth keeping: one canonical `AtlasRoutePacket`

The brief's strongest concrete idea: instead of Redis/Bitfrost/ACE/RLM/KAG/DAG/SOM/cuVS/Hypergraph
each inventing their own overlapping envelope, standardize one small routing object exchanged
through MCP:

```
AtlasRoutePacket {
  packet_key, revision,
  latent64, som_cell, community_id,
  semantic_q, bm25_q, rrf_q, pagerank_q, topology_q, hypergraph_q,
  hot_refs, warm_refs,
  recommended_lanes, recommended_tools,
  uncertainty, budget, trace_id
}
```

This is a **restatement of this proposal's own `FeatureRowV1`/`V2`/`V3` staging (Phase 6) plus
Phase 5's `pagerankAuthority` provenance field**, not a new idea — same "one small object, staged
fields, don't let every subsystem invent its own" principle this whole change already applies to
RRF (Phase 4) and PageRank (Phase 5). Treat `AtlasRoutePacket` as the *routing-time* view and
`FeatureRow` as the *ranking-time* view of the same underlying signals — reconcile field names
between them before either grows further, don't maintain two parallel schemas for the same data.

### Concrete, low-risk clarifications worth adopting as naming/scope fixes

- **`context build_kv_packet` naming collision**: the brief correctly flags that "KV" here should
  mean "key-value context packet" (a compressed evidence card), never "transformer K/V cache
  tensors." If any existing tool or doc uses that name ambiguously, rename for clarity — check
  `src/mcp/tools/` before assuming this is purely hypothetical.
- **KAG selects evidence, DAG controls execution** — these are already conceptually separate in
  this repo (`retrieval lanes` vs. `retrieval/orchestrator.ts`-style execution), the brief just
  states the separation explicitly. No action needed beyond keeping it that way.
- **Trigram/n-gram, not "tricubic," for lexical retrieval** — the brief self-corrects an earlier
  session's "tricubic" terminology (which, per this change's own Phase 17, is real and means
  something different: `quaternion-manifold.ts`'s bicubic→tricubic *interpolation* upgrade for the
  4D manifold, a numerical-analysis term, unrelated to n-gram text matching). Two different
  "tricubic"-adjacent concepts exist now; keep them distinct — don't let n-gram lexical work borrow
  the 4D-manifold interpolation vocabulary or vice versa.
- **A\* belongs to explicit path search over a state graph, not vector ANN.** Consistent with
  Phase 2's existing framing (BFS/SSSP/A* are Domain 2 graph-traversal algorithms, separate from
  Domain 6 vector/ANN search) — the brief just restates this repo's own already-drawn line
  correctly. No correction needed.
- **Quaternion/similarity-learning fits *before* Qdrant, TurboQuant fits *after* the embedding
  space is frozen.** Sequence: train/specialize embedding → validate retrieval → freeze embedding
  space → apply TurboQuant (Qdrant's quantization scheme, added May 2026 per the brief) → revalidate
  recall. This is a real ordering constraint worth remembering before Phase 7's RFF work or any
  future embedding-specialization effort — quantizing a still-changing embedding space wastes the
  quantization-recall validation work. Cross-reference `parent-atlas-semantic-768-canonical-contract`
  before doing anything here, since it owns the embedding-space stability question.
- **`kag record_agent_run` as the learning flywheel entry point** — every agent run's trace
  (retrieval path, activated hyperedges, SOM cells, tool path, patch/compile/test outcome, reward)
  feeding back into memory is a reasonable target shape for Phase 14's closed-loop repair episode
  record — check whether `record-repair-episode.mts` (Phase 1, once the bundle exists) and this
  `kag record_agent_run` concept should be the same tool rather than two.

### Gate checklist reconciliation (external re-scoring vs. this document's Phase numbers)

The brief's G0–G28 checklist maps onto this document as follows — use **this document's** phase
numbers as canonical going forward, since the G-numbers duplicate across two enumeration passes
(G12–G20 repeat verbatim as G21–G28 in the source brief) and would drift immediately if tracked
separately:

| Brief's gate(s) | This change's phase | Status per this session's actual verification |
|---|---|---|
| G0 bundle staging | T0 | Confirmed blocked — bundle not supplied (unchanged) |
| G1 one real repair loop | Phase 1 / T1 | Open — no bundle, can't start |
| G2 `trace_dynamic_context` | Phase 2 / T2 | Open |
| G3 semantic_768 invariant | Phase 3 / T3 | Owned by `parent-atlas-semantic-768-canonical-contract`, cite don't re-derive |
| G4 fresh Graphify revision | (not separately phased here) | Open — worth a T-item if Graphify staleness keeps blocking graph work |
| G5 PageRank authority signal | Phase 5 / T5 | **More done than the brief credits** — not just "the single-field fix exists," but wired, live-verified, 3 real bugs fixed, all 7 gates PASS (this session) |
| G6 canonical RRF ownership | Phase 4 / T4 | Confirmed still missing — blocks on RF6 |
| G7 `FeatureRowV1` | Phase 6 / T6 | Confirmed still missing |
| G8 Domain 10 baseline | Phase 9 / T9 | Confirmed still missing |
| G9 RFF projection | Phase 7 / T7 | Confirmed still missing |
| G10 `latent_128` byte contract | Phase 10 / T10 | Confirmed still missing |
| G11 oracle ladder (NetworkX/Neo4j/cuGraph/cuVS) | Phases 11–13 | Confirmed still missing |
| G12–17, 21–27 (Louvain/Leiden, community taxonomy, BFS, PPR, weighted Dijkstra, A*) | Phase 2/3's graph-traversal scope | **New material this change hadn't itemized** — worth folding into Phase 2/3 as a sub-checklist once `parent-atlas-graph-retrieval-proof`'s identity split unblocks that work; not actioned now |
| G18/26 external MoE routing | Appendix (deferred research) | Correctly still deferred, no owner module |
| G19/27 frozen repair replay corpus | Phase 14 / T14 | Confirmed still missing |
| G20/28 learned-promotion block | Appendix | Correctly still deferred |

### "Next 10 actions" from the brief — cross-checked against this document's phase order

The brief's dependency-ordered list (graph snapshot → NetworkX parity → GDS parity → bounded
traversal → close one repair loop → freeze replay corpus → latent_128 contract → RRF ownership →
`FeatureRowV1` → OpenWiki/crawler work) is **consistent with this document's own phase ordering**
for items 1–9 (matches Phases 11→11→12→2→1→14→10→4→6). Item 10 (OpenWiki/module-crawler
auto-discovery, DB-backed registry, conflict-review queue) is genuinely new scope not covered
anywhere in Phases 1–17 — it's a separate concern (documentation/library indexing, not retrieval
ranking) and does not belong in this change; if pursued, it needs its own OpenSpec change under
`parent-atlas-okf-knowledge-layers` or a new sibling, not folded in here.

## Appendix: deferred research notes (not phased, not scheduled)

The source instruction for this change also included a substantial research discussion connecting
Parent Atlas's existing routing substrate (SOM cells, ontology tags, `latent_64`/`latent_128`
projections) to sparse Mixture-of-Experts architectures, DSPy/GEPA-style prompt-program evolution,
and DeepSeek's "Engram" n-gram/hash-based conditional memory. None of this has a concrete owner
module, phase gate, or measurement plan — it is captured here so it isn't lost, not because it's
scheduled work:

- **Parent Atlas as an external MoE router, before any internal model MoE work**: route a query's
  `latent_64` feature vector through an explicit, auditable "router" (initially just an
  if/else or small classifier) that selects among *policies* (prompts, retrieval strategies,
  context packets, LoRA adapters, reranker weight sets) rather than neural experts. Cheaper to
  validate than training an actual MoE backbone, and this repo's existing SOM-cell / ontology-tag
  structure already resembles the shape of an MoE router's input space (`z → SOM cell → cell has a
  specialized policy`, structurally similar to `x → router → E_k`) — except explicit and auditable
  instead of learned and opaque.
- **PageRank stays a feature-row column, never an embedding-space operation** — this is not new
  guidance, it restates Phase 5/6's rule, included here because the research discussion arrived at
  the same conclusion independently (`f(x) = semanticSimilarity, BM25, RRF, PageRank, graphDegree,
  ontologyMatch, SOMDistance, RFFSimilarity, ASTMatch → ranker`).
- **GEPA-style policy evolution from execution traces**: this repo already produces the trace data
  GEPA-style optimization would need (query, candidate packets, retrieval trace, RRF contribution,
  PageRank score, reranker decision, model output, AST validation, compile/test result, patch
  result) — but the research notes explicitly caution against immediately QLoRA-fine-tuning every
  successful trace; instead accumulate successful policies, cluster them (by ontology + latent
  embedding + SOM cell), and only fine-tune once a cluster has enough evidence to justify it.
  DSPy's own documentation draws the same distinction between prompt optimization and
  weight-fine-tuning dataset construction.
- **An ontology-linked training tuple, not generic instruction/response pairs**, if/when QLoRA
  training is ever pursued: `{packet_key, workspace_revision, source_revision, task_class,
  language, framework, ontology_path, query_embedding, latent64, latent128, retrieved_packet_ids,
  candidate_scores (rrf/pagerank/semantic/reranker), execution_trace, target_patch, ast_delta,
  compile_pass, test_pass, failure_class, repair_class, provenance}`.
- **DeepSeek "Engram"-style n-gram/hash conditional memory** as a complementary feature space to
  RFF: hash structural sequences (AST path-grams, call path-grams, import-grams, error-message
  grams) into compact memory, queried via exact-match before falling back to embedding ANN or graph
  expansion — "don't make the LLM re-derive things the workstation already knows exactly."

None of the above should be read as scheduled phases. If any of it becomes concrete, it needs its
own OpenSpec change with its own owner module and status vocabulary, following this repo's
established pattern.
