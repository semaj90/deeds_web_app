# Tasks: parent-atlas-retrieval-lod-algorithm-taxonomy

## T1 — Taxonomy authored (this session)

- [x] Write `README.md` + `proposal.md`: 12-domain classification, three-engine substrate
      restatement, honest per-domain status against the live `src/lib/server/retrieval/` tree
      (198 files inventoried via `Glob`), explicit cross-links to the 3 sibling changes that already
      own adjacent concerns (fusion census, OKF layering, graph identity).
- [x] Confirm no duplication: read `parent-atlas-okf-knowledge-layers/proposal.md` (status
      vocabulary source) and `parent-atlas-graph-retrieval-proof/proposal.md` (identity-split
      blocker source) before writing, instead of re-deriving either.
- [ ] Cross-link this change from the 3 siblings' README files (one line each, "see also"). Not yet
      done — do this before considering T1 fully closed.

## T2 — Domain 10 (evaluation harness) — the one domain safe to start now

Everything else in the taxonomy is blocked on work already in-flight in sibling changes. Domain 10
is not — it can be built against the *current* CPU fusion pipeline and gives RF6 (fusion-owner
convergence) a regression harness to converge against, which RF6 doesn't currently have.

- [ ] Reachability check first: confirm no existing Recall@k/NDCG/MRR harness is already live and
      just unwired (do not assume `MISSING` from a single `Glob` pass — grep test fixtures and
      `scripts/atlas/*eval*` too before building).
- [ ] If genuinely missing: scope a minimal harness — fixed query set with known-good top-k
      (hand-labeled or derived from the live entity trace already done in
      `parent-atlas-retrieval-fusion-reachability`), compute Recall@k / NDCG / MRR against
      `SearchRuntime`'s current output.
- [ ] Do not wire this into CI or a build gate yet — first pass is a standalone script, matching
      this repo's `DRY_RUN_PROVEN` before `APPLY_PROVEN` status discipline.

## T3 — Domains 1–5 architecture change

**2026-08-08 update**: T3's "blocked until RF6" gate was overridden by explicit user direction
("three-engine substrate wiring"), scoped narrowly to the canonical spine only — see the
"2026-08-08 addendum" in `proposal.md` for the full disclosed-deviation writeup. Domain 1
(candidate fusion) remains untouched and still blocked on RF6 as originally planned — only domains
3/4/5 moved.

- [x] Domain 4 (`feature-matrix.ts`): built narrower than originally designed — a batched
      Postgres authority lookup (`fetchAuthorityScores`, `resolveAuthorityScore`), not a full N×F
      matrix builder. 8 tests passing.
- [x] Domain 5: **did not** create `packet-ranker.ts`. Found `runtime-reranker.ts::blendScores()`
      already correctly implements `S = X·W`-shaped weighted scoring — reused it instead of
      duplicating it (avoids repeating the Domain 1 13-owner anti-pattern one level down). Fixed
      the real bug found while wiring: `pagerankScore` + `graphScore` were both silently dropped
      before reaching this function (~15% of total blend weight always inert). See
      `search-runtime.ts` Score-stage diff.
- [x] Domain 3 upgraded incidentally: `atlas_graph_authority_scores` (confirmed live, 50,164 rows)
      is now a real feature input. **Confirmed via live query, not assumed**: the newer-looking
      Drizzle-typed `atlas_graph_authority_scores_v2` table is 0 rows — do not join against it.
- [ ] Domain 1 (candidate fusion, 13-owner consolidation) — still untouched, still RF6's job.
- [ ] Full N×F feature-matrix object (beyond the single authority column added here) — still
      future work, not done in this pass.

## T4 — Domains 2–3 (graph traversal + structural features) — blocked

Blocked on `parent-atlas-graph-retrieval-proof`'s `symbol_id`/`symbol_version_id`/`tree_node_id`
identity split landing (graph snapshot promotion is explicitly blocked there until that split is
proven). Do not design `graph-expand.ts` or `graph-authority-features.ts` before that lands — any
API surface designed against unstable identity will need to change anyway.

## T5 — Domains 6–9 (vector/ANN, quantization, storage residency) — blocked, GPU-adjacent

Explicitly deferred per standing session instruction: no CAGRA/cuVS/cuGraph/CUDA-GEMM/quantized-LOD
work until the identity/fusion foundation (RF4–RF6) is proven. When that gate opens:

- [ ] Domain 6 first (cuVS exact-brute-force oracle vs. Qdrant, recall parity gate) — this repo's
      own stated rule: "Recall@k(kANN) / k(kExact) until that passes your gate, don't replace
      Qdrant" — cuVS stays an oracle/experiment lane, not a replacement, until proven.
- [ ] Domain 8 (quantization) requires *measuring* `effective_rank`, `singular_value_decay`,
      `condition_number` on the actual `latent_128` data before assuming low-rank structure exists
      — do not default to INT4 packing on faith.
- [ ] Domain 9 (storage residency) follows domain 8, not before.

## T6 — Domains 11–12 (temporal coherence, learned promotion) — not investigated, do not design yet

Both are genuinely new capability, not renames of existing code. Before any design work:

- [ ] Domain 11 needs its own reachability pass over `context-buffer.ts` and ACE session state to
      establish what temporal state already exists, before proposing new state to carry forward.
- [ ] Domain 12 (execution-feedback-driven promotion) needs domains 1–5 and 10 solid first — there
      is no signal to learn promotion *from* until a stable ranker and an evaluation harness exist.

## Non-goals (repeat from proposal.md — do not action these under this change)

- No `.ts` files written or modified by this change.
- No re-run of the RF2 13-implementation census.
- No attempt to unblock the graph identity split.
- No OKF concept-file registration until `PARENT_ATLAS_KNOWLEDGE_GAP_AUDIT_V1` lands.
