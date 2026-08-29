# Tasks: Parent Atlas Graph Runtime — Python Ownership Consolidation

## T0 — Capture (2026-08-29)

Created from a fork audit of 19 `python/` files matched by a pagerank/katz/eigenvector/k-truss/
networkx/cugraph grep. Nothing implemented yet — this is the reconciliation-and-scoping pass,
matching this repo's established discipline for external/large-surface changes (see
`parent-atlas-graph-runtime-enhancement` T0, `parent-atlas-agentic-repair-bundle-integration` T0).

**Not independently re-verified by a human yet** — the table below is the fork audit's output,
carried forward as-is. Before acting on any DEAD/EXPERIMENT classification, re-confirm the
zero-caller claim with a fresh grep (repo state moves).

## Audit table (source of truth for T1–T4 below)

| file | classification | action |
|---|---|---|
| `graph_snapshot_parity_networkx_oracle.py` | CANONICAL_OWNER (parity role) | leave untouched |
| `graph_snapshot_parity_cugraph_oracle.py` | CANONICAL_OWNER (parity role) | leave untouched |
| `atlas_rapids_sidecar.py` | CANONICAL_OWNER (cuVS domain) | leave untouched — grep false positive, real live service |
| `miniforge_nlp_sidecar.py` | ADAPTER (unrelated capability) | leave untouched — grep false positive |
| `parent_atlas_networkx_pagerank.py` | FIXTURE_ONLY | already correctly classified in registry — no change |
| `atlas_compute/typed_graph_runtime.py` | CANONICAL_OWNER (contract layer) | promote into new package as `identity.py` |
| `atlas_compute/live_graph_fixture.py` | FIXTURE_ONLY | leave as-is (or move to `atlas_graph_runtime/testing/` later, not this pass) |
| `atlas_semantic_ontology_projection.py` | ADAPTER (legitimate domain projection) | leave untouched — correctly scoped already |
| `atlas_rapids_graph_runtime.py` | EXPERIMENT (tested, never deployed) | reclassify in registry |
| `atlas_subgraph_cugraph.py` | DEAD (zero callers) | reclassify in registry |
| `atlas_rapids_community_sidecar.py` | EXPERIMENT (no deployment found) | reclassify in registry |
| `atlas_compute/cugraph_ppr.py` | DEAD (zero callers) | reclassify in registry |
| `atlas_compute/graph_programs.py` | DEAD (zero callers, heapq-based — possible shadow of unstarted GR10) | reclassify in registry, note GR10 collision risk |
| `atlas_rapids_community.py` | ADAPTER (real caller: its own sidecar) | reclassify only if sidecar above is archived |
| `parent_atlas_pagerank_reference.py` | self-declared oracle, second hand-rolled implementation | **human decision required — see T2** |
| `parent_atlas_spectral_multihop.py` | UNCLASSIFIED | needs closer read — see T3 |
| `parent_atlas_context_fanout.py` | UNCLASSIFIED (likely grep false positive) | needs closer read — see T3 |
| `parent_atlas_code_graph_gpu.py` | UNCLASSIFIED (likely grep false positive) | needs closer read — see T3 |
| `gph_proj_cugraph_rtx_proof.py` | EXPERIMENT (proof/benchmark script) | leave or archive per repo convention — low priority |

## T1 — Registry reclassification (cheap, uncontroversial)

- [ ] Add entries to `docs/architecture/runtime-ownership-registry.json` for the 5 zero/near-zero
      caller files above (`atlas_subgraph_cugraph.py`, `atlas_rapids_community_sidecar.py`,
      `atlas_compute/cugraph_ppr.py`, `atlas_compute/graph_programs.py`, `atlas_rapids_graph_runtime.py`)
      with classification + evidence (caller-trace result) per file.
- [ ] Re-run the caller grep fresh at reclassification time (do not trust the fork audit's snapshot
      without re-checking — repo state moves).
- [ ] For `atlas_compute/graph_programs.py` specifically: check `parent-atlas-graph-runtime-enhancement`
      GR10 (semantic best-first, TypeScript, not yet started) before finalizing DEAD — if GR10 work
      begins and this file's heapq-based traversal turns out to be relevant prior art, surface it
      there rather than silently deleting.
- [ ] Update `runtime-ownership-baseline.json` if any of these are judged pre-existing tolerated debt
      rather than new violations (they predate this proposal, so baseline is the right bucket).

## T2 — `parent_atlas_pagerank_reference.py` — human decision

- [ ] Present the two options to a human (not a unilateral agent decision, per this file's own
      Design section on why hand-rolled algorithm code is a review-blocking defect in the new
      package, weighed against this file's legitimate self-declared oracle role and its explicit
      "not the production owner" framing):
      (a) keep as a third independent-of-libraries correctness oracle, formally registered
      `FIXTURE_ONLY` in the ownership registry with rationale recorded, or
      (b) archive it (per this repo's archive-not-delete convention) and fold whatever unique
      correctness coverage it provides into the existing `graph_snapshot_parity_*` oracle pair's
      test suite.
- [ ] Record the decision + rationale in the registry regardless of which option is chosen.

## T3 — Closer read required before classification

- [ ] `parent_atlas_spectral_multihop.py` — confirm whether it calls `nx.eigenvector_centrality`/
      `numpy.linalg.eig` (legitimate) vs. a hand-rolled power-iteration loop (policy violation,
      same shape as T2's file). This is the single highest-priority read in this whole proposal —
      it's the one file the fork audit could not confirm either way.
- [ ] `parent_atlas_context_fanout.py`, `parent_atlas_code_graph_gpu.py` — confirm these are grep
      false positives (no real graph-algorithm content) and drop them from future audit scope if so.
- [ ] `gph_proj_cugraph_rtx_proof.py` — confirm it's a one-off RTX benchmark/proof script (name
      suggests this) with no live caller; if so, archive per repo convention, no registry action
      needed beyond a note.

## T4 — Package scaffold

- [ ] Create `python/atlas_graph_runtime/` with `identity.py` (promoted from
      `atlas_compute/typed_graph_runtime.py`, contracts only, no behavior change) and a `README.md`
      stating the hard rule from `proposal.md`'s Design section.
- [ ] Add empty `cugraph_executor.py`, `networkx_executor.py`, `cuvs_executor.py`, `cuml_executor.py`
      placeholders — docstring only, pointing at this proposal + the future gate (GR7) that
      populates them. No implementation in this pass.
- [ ] Do NOT move or modify `atlas_compute/typed_graph_runtime.py`'s existing test files
      (`test_typed_graph_runtime.py`, `test_atlas_compute_graph_representation.py`) — update their
      imports only if/when the promotion in this task actually moves the module; if kept as a
      re-export shim instead, no test changes needed.

## T5 — Follow-up audit scope (tracked, not resolved here)

- [ ] `python/atlas_rapids_sidecar_graph.py` — distinct file from the live `atlas_rapids_sidecar.py`,
      name-collision risk, not audited in this pass.
- [ ] `scripts/atlas/run_louvain_challenger_v1.py` — "challenger" naming suggests an A/B algorithm
      comparison; check it doesn't collide with the already-settled Louvain/Leiden ownership in
      `parent-atlas-graph-analysis-contract` before it's touched by anything.

## Cross-references

- `openspec/changes/parent-atlas-graph-runtime-enhancement/proposal.md` — GR7 (blocked behind
  GR5.3–GR6) is this package's eventual first real consumer.
- `openspec/changes/parent-atlas-graph-analysis-contract/` — settled TS/Neo4j-GDS PageRank/Louvain
  ownership, unaffected by this proposal.
- `sveltekit-frontend/src/lib/server/atlas/graph/graph-algorithm-policy.ts` — the TypeScript-side
  pattern this package mirrors on the Python/RAPIDS side.
- Root `CLAUDE.md`, "Duplication Prevention" section — the Aug 9 2026 "5 competing PageRank
  implementations" finding this proposal's audit extends to the Python cluster.
