# parent-atlas-agentic-repair-bundle-integration

**One-line summary**: a controlled, 14-phase integration ladder for folding an external
"agentic repair toolkit" reference bundle (HMM-based repair-state tracking, `rrf.ts`/`rff.ts`
oracles, NetworkX/cuGraph/cuVS parity scripts, retrieval-ablation harness) into Parent Atlas —
one structurally-safe lane at a time, never all at once.

**Type**: documentation-only OpenSpec change. No code changed by this change itself.

**Status**: PROPOSED. **The bundle itself is not present in this repository yet** — confirmed by
`Glob` across the whole tree for every filename named in the source instruction
(`observe-error.mts`, `repair-state-hmm.mts`, `localize-symbols.mts`, `build-repair-context.mts`,
`verify-repair.mts`, `record-repair-episode.mts`, `rrf.ts`, `rff.ts`, `networkx_pagerank_oracle.py`,
`cugraph_pagerank_parity.py`, `cuvs_exact_knn.py`, `retrieval_ablation.py`, `repair_eval.py`) — zero
hits. This document records the target integration order so that when the bundle is actually
supplied, execution follows a classified plan instead of ad-hoc wiring. Phase 1's first action
("copy the bundle into a temporary integration area") is blocked until the bundle is provided.

## Relationship to sibling changes (read these first — do not re-derive)

- **`parent-atlas-retrieval-fusion-reachability`** owns the live 13-owner RRF census (RF2) and the
  RF6 fusion-ownership decision. This change's Phase 4 ("make RRF ownership explicit") is the same
  RF6 decision restated with two concrete architecture options (Qdrant-owns-fusion vs.
  Parent-Atlas-owns-fusion) — it does not replace RF6, it hands RF6 a decision framework plus a
  bundle-supplied oracle (`rrf.ts`) to check the eventual canonical implementation against.
- **`parent-atlas-semantic-768-canonical-contract`** already owns the exact invariant this change's
  Phase 3 restates (`semantic_768` is the only canonical dense lane, 384 is legacy-only, no
  runtime mixing). Phase 3 here does not re-litigate that contract — it says: **do not start RFF
  work (Phase 7+) until that contract's outstanding drift item is closed**, because RFF's
  determinism guarantee is worthless if its input representation isn't trustworthy yet.
- **`parent-atlas-graph-retrieval-proof`** owns `symbol_id`/`symbol_version_id`/`tree_node_id`
  identity lineage and graph snapshot promotion gates. This change's Phase 5 (PageRank into the
  feature row) and Phase 11–12 (NetworkX/Neo4j/cuGraph parity) are downstream of that identity
  split — do not promote a `pagerankAuthority` feature signal sourced from an unpromoted graph
  snapshot.
- **`parent-atlas-retrieval-lod-algorithm-taxonomy`** owns the 12-domain classification of
  Parent Atlas's ranking algorithms. This change's `FeatureRowV1`/`V2`/`V3` staged rollout
  (Phase 6) is a concrete instantiation of that taxonomy's Domain 4 (feature matrix assembly) and
  Domain 5 (ranking/scoring) — same target shape, staged into ablatable versions instead of one
  big object. This change's Phase 9 (evaluation gatekeeper) is that taxonomy's Domain 10.
- **`phase-2f1-real-evaluation-corpus`** — check this before building Phase 9's evaluation harness
  from scratch; it may already own the reference query/labeled-result corpus this change's Domain
  10 gate needs.
- **`parent-atlas-gpu-sidecar-patch-tournament`** — owns the cuVS/CAGRA GPU-sidecar readiness
  question. This change's Phase 13 (cuVS as vector-only exact-KNN oracle) is a narrower, read-only
  slice of that broader GPU sidecar work — Phase 13 does not stand up a production cuVS service,
  it runs the bundle's `cuvs_exact_knn.py` once against a frozen `semantic_768` matrix as a
  correctness oracle.

## Existing repo anchors (do not duplicate these — integrate against them)

The bundle's repair-loop scripts (`observe-error.mts` → `repair-state-hmm.mts` →
`localize-symbols.mts` → `build-repair-context.mts` → (external patch) → `verify-repair.mts` →
`record-repair-episode.mts`) are **not a green-field addition** — this repo already has a live
repair spine that the bundle must slot into, not replace:

- `sveltekit-frontend/scripts/agents/repair-loop.ts` — existing pipeline: error event → classify →
  `source_ref` → `feature_id` (Postgres `atlas_feature_map`) → retrieve NES/CHR packets → select
  repair skill → dynamic import from signed manifest → dry-run patch → checks → kanban card.
- `sveltekit-frontend/scripts/phase79-agentic-repair.mts` — existing "Cognitive System" loop: fetch
  high-risk suggestions from `error_suggestions` → apply patch → verify with `svelte-check` →
  learn (store success patterns in Qdrant, failures in Postgres).
- `simd-bridge/rust/hmm-repair/src/lib.rs` — **correction (verified by reading the file, not just
  its name)**: this is a real, correct Viterbi decoder (log-space DP + backpointer array), but for
  **legal document section classification** (7 states: PARTIES/JURISDICTION/FACTS/LEGAL_AUTHORITY/
  CLAIMS/PRAYER/HOLDING), not code-repair state tracking, despite its directory name. Its TS mirror
  is `sveltekit-frontend/src/lib/server/analysis/hmm-section-classifier.ts`. Neither implements
  Baum-Welch — both use fixed, hand-authored transition/emission probabilities. Do not assume this
  crate is a ready-made native implementation for the bundle's `repair-state-hmm.mts` — it solves a
  different problem. The reusable thing here is the *algorithm pattern* (Viterbi with a small fixed
  state space), not the crate's content. See this change's Phase 15 for a second, unrelated
  application of the same pattern to MCP tool selection.

Whoever executes Phase 1 must diff the bundle's repair scripts against these three first and
decide, per script, whether the bundle: (a) replaces a weaker existing implementation, (b) is
redundant with one already proven, or (c) fills a genuine gap. Do not assume (c) by default — that
assumption is exactly how the repo ended up with 13 duplicate RRF owners (see
`parent-atlas-retrieval-fusion-reachability`).

## Hard boundary (per standing session instruction, restated for this bundle specifically)

No RFF, cuVS, cuGraph, PPR, or new graph-traversal work enters production ranking from this bundle
until the phases ahead of it in this document are proven, in order. The bundle is a set of
**reference/oracle implementations**, not a second production system — Parent Atlas remains the
owner of identity, retrieval, graph truth, projections, evidence, and ranking. The bundle fills in
repair/eval/projection *mechanics* around those owners; it does not become a competing owner.
