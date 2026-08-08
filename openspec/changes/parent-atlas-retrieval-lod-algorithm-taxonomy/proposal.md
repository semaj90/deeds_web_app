# Proposal: Retrieval LOD — a domain classification for Parent Atlas ranking algorithms

## Why

Parent Atlas retrieval today is 13 independently-live fusion/scoring implementations
(`parent-atlas-retrieval-fusion-reachability` RF2) plus a long tail of single-purpose scorer
modules (`ranking-features.ts`, `hybrid-score.ts`, `candidate-scorer.ts`, `graph-scorer.ts`,
`vector-scorer.ts`, `telemetry-scorer.ts`, `signal-normalizer.ts`, `compute-rrf-score.ts`,
`semantic-fusion-metrics.ts`) with no shared feature-matrix abstraction and no agreed answer to
"which signal is a *feature into* the ranker vs. a *ranker itself*". That ambiguity is exactly what
let 13 fusion owners accumulate — a new engineer (or agent) adding a ranking signal has no obvious
place to put it, so each one built its own end-to-end scorer instead of contributing a column.

The fix is not "add more databases" — it's naming the domains that already conceptually exist, so
new work has one home per concern. The organizing idea (elaborated below) is a **retrieval LOD**
(level-of-detail) pattern: never compute the most expensive representation for every candidate.
Score cheap-and-coarse first, oversample the promising set, and only promote survivors to
progressively more expensive representations. This is the same shape as three unrelated fields
independently converged on:

- **DLSS-style rendering**: reconstruct a high-quality frame from cheap low-resolution samples plus
  temporal history, instead of brute-force full-resolution rendering.
- **Elastic's quantized retrieval**: search compressed vectors (INT4/BBQ), oversample ~1.5–4x
  depending on quantization aggressiveness, then rescore the oversampled set against full-precision
  vectors.
- **Ewin Tang's ℓ2-length-squared sampling**: for approximately-low-rank matrices, importance-sample
  rows by squared norm instead of touching every element — directly applicable to "which candidates
  deserve a more expensive representation" if Atlas's feature matrix genuinely has low effective
  rank (must be *measured*, not assumed — see Domain 8).

## Three-engine substrate (target architecture, not new infrastructure)

| Engine | Owns | Role |
|---|---|---|
| Postgres 18 | Canonical truth, lineage | Source of identity, revisions, source_ref, packet_key |
| Qdrant (+ optional cuVS later) | Geometric candidates | Dense/sparse ANN — coarse-to-exact vector search |
| Neo4j (+ optional cuGraph later) | Structural candidates | Traversal, authority, community signals |
| Atlas ranker (feature matrix + scoring) | Decision | Combines the above into one ranked list |

This is a naming exercise over the *existing* three stores already declared canonical in
`CLAUDE.md`'s "Atlas Data Persistence + Retrieval Contract" — it does not add a database. What's
missing is domain 4/5 below: a single feature-matrix assembly step and a single scoring step that
every fusion caller goes through, instead of each caller reimplementing both.

**Critical correction carried into this taxonomy**: PageRank (or any single graph/structural
signal) must be **one column in the feature matrix**, never the final ranking algorithm on its own.
Several of the 13 duplicate fusion implementations effectively did the latter — that's part of why
they diverged.

## The 12 algorithm domains

Each domain gets exactly one canonical owner module (target state) and an honest status against
the live `src/lib/server/retrieval/` tree today. Status vocabulary borrowed from
`parent-atlas-okf-knowledge-layers` (do not invent a new one): `PROVEN | PARTIAL_PROVEN |
NOT_PROVEN | MISSING | BLOCKED`.

| # | Domain | Algorithms | Target owner module | Live status |
|---|---|---|---|---|
| 1 | Candidate fusion | RRF, CombSUM, weighted normalization, dedupe | one canonical `retrieval/candidate-fusion.ts` | **NOT_PROVEN** — 13 competing owners exist (`rrf-integration.ts`, `rrf-combiner.ts`/`rrf-combiner-utils.ts`, `rrf-fusion.ts`, `service.ts::rrfFusion`, `unified-orchestrator.ts::combineRRFLanes`, `rrf-fuse.ts`, `rrf-lane-ranker.ts`, `compute-rrf-score.ts`, plus `SearchRuntime.fuseCandidates` in `search-runtime.ts` — the last is the one canonical production spine per RF3/RF4). Convergence is RF6's job, not this change's. |
| 2 | Graph traversal | BFS, bidirectional BFS, weighted SSSP (Dijkstra), best-first semantic A* | `retrieval/graph-expand.ts` (does not exist yet) | **MISSING** as a dedicated module. Partial coverage: `graph-context.ts`, `subgraph-seed-neighborhood.ts`, `subgraph-structural-multihop.ts` do bounded expansion but not a named BFS/SSSP/A* API. Blocked on `parent-atlas-graph-retrieval-proof`'s identity split. |
| 3 | Graph structural features | PageRank, Personalized PageRank, HITS-like hub/authority, Leiden/Louvain community, WCC | `retrieval/graph-authority-features.ts` (does not exist as unified module) | **PARTIAL_PROVEN** (upgraded 2026-08-08) — `legal-pagerank.ts` exists (domain-specific, not general); `authority-chain.ts` exists. `feature-matrix.ts::fetchAuthorityScores()` now wires the canonical Postgres `atlas_graph_authority_scores` table (50,164 rows, `authority_percentile` = L1-normalised PageRank) into the canonical spine as a real `graph` feature signal, keyed by `packet_key` with `source_ref` fallback, sourced from the single `promoted` authority run. Still no PPR, no HITS, no community detection module. **Correction found while wiring**: `atlas_graph_authority_scores_v2` (Drizzle-typed, `graph-authority-v2.ts`) also exists and looks newer/better-typed but is confirmed **0 rows live** — do not join against it; the untyped manual-SQL v1 table is the one with data. |
| 4 | Feature matrix assembly | N×F ranking matrix: dense sim, BM25, AST sim, PageRank/PPR, hop distance, path cost, community overlap, RFF, latent128 sim, authority, freshness, test coverage | `retrieval/feature-matrix.ts` | **PARTIAL_PROVEN** (2026-08-08) — built as a batched authority-lookup module (`fetchAuthorityScores`, `resolveAuthorityScore`) rather than a full N×F matrix builder; scoped narrowly to closing two live gaps (see Domain 5 note). `ranking-features.ts`, `hybrid-score.ts`, `signal-normalizer.ts`, `candidate-scorer.ts` still each assemble a *subset* ad hoc — a true unified N×F object remains future work. 8 tests in `__tests__/feature-matrix.test.ts` (packet_key/source_ref precedence, empty-input short-circuit, graceful degradation on db failure, non-finite-value rejection, blend-output wiring proof). |
| 5 | Ranking / scoring | `S = X·W` (GEMM-style linear scoring over the feature matrix), calibrated learned ranker, cross-encoder rerank | ~~`retrieval/packet-ranker.ts` (does not exist)~~ **`retrieval/runtime-reranker.ts::blendScores()`** | **PARTIAL_PROVEN** (2026-08-08, plan deviation — see note below). `cross-encoder-reranker.ts`, `cuda-rnn-reranker.ts`, `triton-reranker.ts`, `langextract-reranker.ts`, `boosted-reranker.ts`, `cluster-aware-reranker.ts` still exist as separate rerankers with no shared feature-matrix input — that duplication is untouched. But the canonical spine's own scorer (`runtime-reranker.ts::blendScores()`, weight-normalized weighted average over `SIGNAL_KEYS = [dense, bm25, ast, graph, pagerank, domain, crossEncoder]`) turned out to *already be* a correct, tested Domain 5 implementation — it was never named as one. **Real bug found and fixed**: `search-runtime.ts`'s Score stage built its input to this function while omitting `pagerankScore` and `graphScore` entirely, so 2 of 7 signal weights (0.05 + 0.1 = 15% of total blend weight) silently contributed zero to every ranked result regardless of available signal. Fixed by wiring `feature-matrix.ts`'s authority lookup + the already-populated (but previously dropped) `Candidate.pageRankScore` into that mapping. |
| 6 | Vector/ANN search | Qdrant (operational), cuVS exact-brute-force oracle / CAGRA fast / CAGRA batch (deferred) | `retrieval/cuvs-index.ts` (does not exist) | **BLOCKED** — deferred per standing instruction until RF4-RF6 lands. Qdrant itself is live and canonical (`retrieve-candidates.ts::retrieveQdrant`). |
| 7 | Diversity | MMR, novelty, source/file/community diversity caps | `retrieval/diversity.ts` (does not exist) | **MISSING**. No MMR implementation found in this tree; risk today is near-duplicate chunks (same file, adjacent lines) surviving fusion undiversified. |
| 8 | Quantization / LOD representation | Binary sketch, INT4/INT8 latent packing, softcap bounded-range normalization (`z = tanh(x/s)` before quantizing), Tang-style ℓ2-sampling for promotion — **requires measuring effective_rank / singular_value_decay / condition_number before trusting low-rank assumptions** | `retrieval/quantized-features.ts` (does not exist) | **BLOCKED** — deferred, GPU/storage-format work, out of scope until foundation work lands. `latent_128 BYTEA` column exists in Postgres per `CLAUDE.md` but batch materialization to Arrow/Float32Array is not confirmed wired. |
| 9 | Storage / memory residency | Arrow IPC/mmap matrix store, GPU object LOD cache with explicit promotion (not raw CUDA Unified Memory page-fault-driven eviction) | `storage/arrow-matrix-store.ts` (does not exist) | **BLOCKED** — deferred, same reason as domain 8. |
| 10 | Evaluation | Recall@k, NDCG, MRR, ablation harness | `eval/retrieval-ablation.ts` (does not exist as a named module) | **NOT_PROVEN** — no dedicated ablation/metrics harness found in this tree. This is the one domain that should NOT wait for GPU work; it can and should exist now, scoped to the current CPU fusion pipeline, so RF6's convergence work has a regression harness. |
| 11 | Temporal / agent-state coherence | Carry-forward of recent query/candidate/graph-neighborhood state across a session instead of scoring from zero each call | no owner module identified | **NOT_PROVEN** / not investigated in this pass. Conceptually adjacent to `context-buffer.ts` and ACE's existing session state — needs its own reachability pass before design, not assumed here. |
| 12 | Learned promotion / execution feedback | Utility-scored LOD promotion using demonstrated usefulness (retrieved → opened → edited → test passed → used in final answer) | no owner module identified | **NOT_PROVEN** / not investigated. This is the RL/HF-adjacent piece the user flagged (`rl_hf` in the terse instruction) — genuinely new capability, not a rename of existing code. Needs its own proposal once domains 1–5 and 10 are solid, because there is nothing to measure promotion *from* yet. |

## What this proposal does NOT do

- Does not write or modify any `.ts` file.
- Does not start cuVS/cuGraph/CUDA-GEMM/quantized-LOD implementation (domains 6, 8, 9) — those stay
  `BLOCKED` until RF4–RF6 land, per standing instruction.
- Does not re-run or duplicate the RF2 13-implementation census — domain 1's status row cites it,
  doesn't redo it.
- Does not resolve `parent-atlas-graph-retrieval-proof`'s identity split — domain 2/3 cite it as a
  blocker, don't attempt to unblock it here.
- Does not register this document as a durable OKF concept file yet — that requires
  `parent-atlas-okf-knowledge-layers`'s `PARENT_ATLAS_KNOWLEDGE_GAP_AUDIT_V1` slice to land first
  (the validator/format that would make the registration honest doesn't exist yet either).

## Ordered next steps (see `tasks.md` for phase detail)

1. Cross-link this taxonomy from the three sibling changes' README "Resume here" sections (small,
   low-risk, improves discoverability — do in this session if time remains).
2. Domain 10 (evaluation harness) is the one domain safe to start immediately, scoped to the
   existing CPU fusion pipeline — everything else in this taxonomy is blocked on work already
   in-flight elsewhere.
3. Once RF6 converges the 13 fusion owners onto `SearchRuntime.fuseCandidates` (or its designated
   successor), re-visit domains 4/5 (feature matrix + GEMM-style ranker) as the next real
   architecture change — not before.

## 2026-08-08 addendum: Domains 3–5 wired ahead of schedule (deliberate, disclosed deviation)

The user explicitly directed "three-engine substrate wiring" (the broadest option offered), which
overrides step 3 above ("blocked until RF6"). Grounding research first (via a targeted Explore
agent, not assumption) established this specific slice was safe to do early: `SearchRuntime` — the
canonical spine per RF3/RF4 — is independent of the 4 legacy fusion owners RF6 exists to retire, so
work on the spine doesn't need to wait for RF6's decision on the other four.

**What actually shipped, and why it's smaller than the original plan**: the approved plan proposed
a new `retrieval/packet-ranker.ts` for Domain 5. During implementation, `runtime-reranker.ts` was
found to already contain a correct, tested, weight-normalized weighted-average scorer
(`blendScores()`) matching the plan's own design almost exactly — building a second one would have
repeated the *exact* anti-pattern this whole taxonomy exists to stop (Domain 1's 13-owner problem).
Deviated from the approved plan to reuse `blendScores()` as the canonical Domain 5 owner instead of
duplicating it; `feature-matrix.ts` was narrowed to just the piece that was genuinely missing (the
authority signal input). This is a *smaller* diff than what was approved, in the same direction.

**Two real, previously-undetected bugs closed by this work** (not hypothetical — confirmed via
live Postgres query + before/after test evidence):
1. `pageRankScore` was already being populated on candidates (`search-runtime.ts:801`, from lexical
   lane metadata) but silently dropped before reaching `blendScores()` — its 0.1 weight always saw
   `undefined` and no-opped.
2. Neither live authority signal in this repo (`atlas_graph_authority_scores` Postgres table,
   `gpu:karpathy:scores` Redis hash) was wired into `SearchRuntime` at all — the `graph` slot's
   0.05 weight was dead for every single query, always.

Together these mean roughly 15% of the canonical scorer's total weight budget was inert before this
change, for every query, silently. Fixed via `search-runtime.ts`'s Score-stage mapping now including
both `pagerankScore` and `graphScore` (the latter sourced from the new `feature-matrix.ts`).

**What's still explicitly out of scope** (per the approved plan, unchanged): RF6 itself, GPU/cuVS/
cuGraph/quantization work (domains 6, 8, 9), the separate `orchestrator.ts` → `gpu:karpathy:scores`
retrieval path (a different live pipeline, not reconciled with this one), and Domain 2 (still
blocked on `parent-atlas-graph-retrieval-proof`'s identity split).

**Evidence**: `sveltekit-frontend/src/lib/server/retrieval/feature-matrix.ts` (new),
`__tests__/feature-matrix.test.ts` (8 tests, all passing), `search-runtime.ts` Score-stage diff.
Verified via `npx tsgo --noEmit` (0 new errors — 5 pre-existing errors remain, all in unrelated
files: `learning-trainer.tool.ts`, `label-generator.ts`, `policy-trainer.ts`) and a full
`src/lib/server/retrieval` test sweep — 11 pre-existing failures (`cross-ranker.test.ts` ×6,
`executor-tree-test.server.test.ts` ×2, `promote-results.spec.ts` ×1, plus 2 more in the same
files) confirmed identical on the unmodified baseline via `git stash` + rerun, none newly
introduced.
