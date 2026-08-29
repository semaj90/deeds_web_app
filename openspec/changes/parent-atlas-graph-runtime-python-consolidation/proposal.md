# Proposal: Parent Atlas Graph Runtime — Python Ownership Consolidation

## Problem

A grep for pagerank/katz/eigenvector/k-truss/networkx/cugraph across `python/` returns 19 files.
Auditing each (file-by-file, caller trace, storage-write trace) found:

- **6 files with zero confirmed callers anywhere in the repo** (`atlas_subgraph_cugraph.py`,
  `atlas_rapids_community_sidecar.py`, `atlas_compute/cugraph_ppr.py`, `atlas_compute/graph_programs.py`,
  `atlas_rapids_graph_runtime.py` — tested but never deployed as a service, no docker-compose entry).
  None of these are in `docs/architecture/runtime-ownership-registry.json` or
  `runtime-ownership-baseline.json` — this whole cluster is currently unaudited by the existing
  governance system.
- **1 file (`parent_atlas_pagerank_reference.py`) hand-rolls PageRank in dependency-free Python**
  (power iteration, no `networkx`/`cugraph` import at all). It is self-documented as an intentional
  third correctness oracle ("not the production PageRank owner"), not an accidental duplicate — but
  it is still a second hand-rolled implementation of the exact algorithm this repo's own policy
  (`sveltekit-frontend/src/lib/server/atlas/graph/graph-algorithm-policy.ts`) says Atlas should never
  own. `graph_snapshot_parity_networkx_oracle.py` vs `graph_snapshot_parity_cugraph_oracle.py` already
  cross-validate CPU vs GPU (`pagerankCorrelation: 1`, live-proven on 162K nodes/108K edges) — a third
  independent-of-libraries implementation may be redundant with that existing pair, not clearly
  additive. This needs a human call, not a unilateral deletion.
- **Everything else in the 19 is either correctly scoped and already live** (the two parity oracles,
  `atlas_rapids_sidecar.py` for cuVS exact-KNN, `miniforge_nlp_sidecar.py` for NLP/AST — three of
  these were grep false-positives, not graph-algorithm files at all), **already correctly classified**
  (`parent_atlas_networkx_pagerank.py` is `FIXTURE_ONLY` in the registry and stays that way), or **a
  legitimately custom domain projection** (`atlas_semantic_ontology_projection.py` — the "K-truss
  needs a custom undirected projection, not a custom K-truss" pattern, done correctly), or **still
  needs a closer read before classifying** (`parent_atlas_spectral_multihop.py`,
  `parent_atlas_context_fanout.py`, `parent_atlas_code_graph_gpu.py`, `gph_proj_cugraph_rtx_proof.py`
  — flagged, not resolved, by the audit).
- There is no canonical Python package boundary for the eventual GR7 gate
  (`openspec/changes/parent-atlas-graph-runtime-enhancement/proposal.md`'s gated rollout — "cuGraph/
  cuVS parity proof against the Neo4j GDS outputs," still blocked behind GR5.3–GR6). When GR7
  unblocks, its `rapids_graph_worker.py` (per that change's captured bundle manifest) has nowhere
  defined to live except as another bespoke top-level `python/*.py` file, repeating this same sprawl
  pattern one gate later.

## Non-goals (explicit)

- **Not** re-proposing PageRank/Louvain/Leiden production ownership. That is already settled:
  `neo4j-gds-client.ts::runPageRankClient()` is the confirmed canonical PageRank owner
  (RUNTIME_SMOKE_PROVEN per `parent-atlas-graph-runtime-enhancement` GR3); Louvain/Leiden adapters
  are proven per that change's GR5. This proposal does not touch TypeScript/Neo4j.
- **Not** touching `graph_snapshot_parity_networkx_oracle.py`, `graph_snapshot_parity_cugraph_oracle.py`
  (live, correctly independent, do not merge or wrap them — that would risk comparing cuGraph to
  cuGraph and calling it CPU/GPU parity), `atlas_rapids_sidecar.py` (live cuVS service), or
  `miniforge_nlp_sidecar.py` (live, unrelated NLP/AST capability).
- **Not** implementing GR7 itself. GR5.3–GR6 are still open in the parent change; this proposal only
  prepares the package boundary GR7's eventual work should land in.
- **Not** writing any new algorithm implementation. Every executor function this proposal adds is a
  direct pass-through to `networkx.*` or `cugraph.*` (or, later, `cuvs.*`/`cuml.*`) — see Design.

## Proposal

1. **Reclassify the 6 zero-caller files** in `runtime-ownership-registry.json` as `DEAD` (or
   `EXPERIMENT` for `atlas_rapids_graph_runtime.py`, which has test coverage but no live deployment)
   with the caller-trace evidence from this audit. No code moves, no deletions — matches the repo's
   archive-not-delete discipline; deletion, if any, is a separate follow-up once flagged as tolerated
   debt for one review cycle.
2. **Create `python/atlas_graph_runtime/` as the canonical package boundary** for future
   Atlas-owned graph work, seeded minimally:
   - `identity.py` — promoted from `atlas_compute/typed_graph_runtime.py` (pure dataclasses/contracts,
     no algorithm code, already the closest existing prior art to what this package should be).
   - `README.md` stating the hard rule: this package contains **no algorithm implementations**. Every
     module is either a contract type, a thin `if backend == X: return library.fn(...)` executor, or
     a receipt/parity/identity helper. A PR adding hand-rolled graph math here should fail review on
     sight.
   - Empty placeholders (not implementations) for `cugraph_executor.py`, `networkx_executor.py`,
     `cuvs_executor.py`, `cuml_executor.py`, each containing only a module docstring pointing at this
     proposal and the future gate that will populate them (GR7 for the RAPIDS executors).
3. **Flag `parent_atlas_pagerank_reference.py` for a human decision**, not act unilaterally: keep as
   a documented third oracle, or fold its role into the existing 2-oracle parity pair's test coverage
   and archive it. Record whichever is chosen in the registry with rationale either way.
4. **Record four files as needing a closer read before classification** (not done as part of this
   proposal — out of budget for the audit pass that produced this document):
   `parent_atlas_spectral_multihop.py`, `parent_atlas_context_fanout.py`,
   `parent_atlas_code_graph_gpu.py`, `gph_proj_cugraph_rtx_proof.py`. Add as a tracked follow-up task,
   not silently dropped.
5. **Note two additional sprawl candidates found but not audited** (discovered incidentally, outside
   the original 19-file grep sweep): `python/atlas_rapids_sidecar_graph.py` (distinct file from the
   live `atlas_rapids_sidecar.py` — name collision risk) and `scripts/atlas/run_louvain_challenger_v1.py`
   ("challenger" naming suggests an A/B algorithm comparison that could collide with the already-settled
   Louvain/Leiden ownership in `parent-atlas-graph-analysis-contract`). Track as follow-up audit scope,
   not resolved here.

## Design: what goes in `atlas_graph_runtime/`, what never does

Matches the pattern already proven correct in
`sveltekit-frontend/src/lib/server/atlas/graph/graph-algorithm-policy.ts`
(`selectGraphAlgorithm()` — deterministic backend selection, explicitly does not execute graph work).
This package is that pattern's Python-side, RAPIDS-facing counterpart:

| In scope (custom Atlas code) | Out of scope (library-owned) |
|---|---|
| `identity.py` — `GraphNodeKeyV1`, `GraphOrdinalMapV1` contracts | PageRank, Katz, eigenvector, HITS, degree, betweenness, BFS, SSSP, k-core, k-truss, triangles, Louvain, Leiden math |
| `snapshot.py` — revision/checksum binding | CAGRA, exact-KNN math |
| `projections.py` — directed→undirected structural-affinity projection for k-truss, hypergraph bipartite projection | PCA, SVD, KMeans, UMAP math |
| `{networkx,cugraph,cuvs,cuml}_executor.py` — thin `if backend==X: return library.fn(...)` dispatch only | any hand-rolled numerical algorithm implementation |
| `parity.py`, `receipts.py` — CPU/GPU parity checksums, `GraphCpuGpuParityReceiptV1` | — |
| `communities.py`, `traversal.py`, `metrics.py` — call-through wrappers around library community/traversal/centrality functions, plus the identity/revision metadata around each call | — |

A file in this package that contains a `for` loop implementing power iteration, spectral
decomposition, or any other numerical graph algorithm is a review-blocking defect, full stop — the
package exists specifically to prevent that pattern from recurring the way it did (once, defensibly)
in `parent_atlas_pagerank_reference.py`.

## Relationship to other changes

- **`parent-atlas-graph-runtime-enhancement`**: this proposal prepares the destination package for
  that change's GR7 (`rapids_graph_worker.py`), without implementing GR7 itself or touching that
  change's Neo4j/GDS gate sequence (GR0–GR6, in progress, GR5.3 currently blocking).
- **`parent-atlas-graph-analysis-contract`**: settled PageRank/Louvain ownership on the TypeScript/
  Neo4j-GDS side is unaffected. This proposal is the Python-side housekeeping companion, not a
  re-litigation.
- **`docs/architecture/runtime-ownership-registry.json` / `runtime-ownership-baseline.json`**: this
  proposal is the first real exercise of that governance layer against the Python graph-algorithm
  cluster, which was previously unaudited by it (only `parent_atlas_networkx_pagerank.py` had an
  entry).
