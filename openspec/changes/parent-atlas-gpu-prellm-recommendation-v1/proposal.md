## Why

The operator produced an external "patch pack" download (`parent-atlas-gpu-prellm-v1.zip`,
self-described `writesToUserRepo: false`, "intentionally isolated and non-promotional") extending
the pre-LLM retrieval-reduction path with a deterministic query-expansion/taxonomy-scope stage, a
low-rank helper recommender (cuML/CuPy-fittable), a DAG time-budget estimator for a loading UI, an
OAK ontology concept-resolution lane, a GRPO shadow policy evaluator, and an RTX/DLSS
visual-enhancement boundary doc. Before this landed in git, the operator gave 7 specific
corrections to apply (missing-data zero-fill, SVD sign non-determinism, a naive DAG
remaining-time formula, an OAK gate overclaiming relationship validation it doesn't implement, an
unnecessary/unsafe TS cast, a too-strict hardcoded PageRank parity tolerance, and a wrong prior
Ewin Tang citation) and asked for the pack to be reviewed and brought into the repo — not copied
in blind.

## What Changes

- Reviewed all 17 real files in the pack (excluded 4 `__pycache__/*.pyc` build artifacts).
- Independently verified 6 of the 7 named corrections against the actual downloaded code (not
  assumed from the operator's description) — all 6 were real, unfixed defects:
  1. `low_rank_helper_recommender_v1.py` zero-filled every unobserved (task, helper) cell before
     SVD, treating "never tried" identically to "tried and failed." **Fixed**: rewrote the fitter
     to use masked alternating least squares (unobserved cells never enter any normal-equation
     term, on CPU numpy or GPU CuPy via the same code path), added sign canonicalization per rank
     component, and a `reconstructionChecksum` of the rounded reconstructed matrix (not raw factor
     bytes) for replay-parity purposes. Verified live: observed cells now reconstruct tightly
     (e.g. 0.95 → 0.944), unobserved cells are explicitly flagged `"observed": false` rather than
     silently returned as equally-confident recommendations.
  2. Same file: no SVD/ALS sign canonicalization — fixed as part of the same rewrite above.
  3. `dag-time-budget-v1.ts`'s `predictedRemainingMs = criticalPathMs - elapsedMs` doesn't account
     for parallel branches finishing out of critical-path order. **Fixed**: added
     `remainingCriticalPath()`, which recomputes the critical path over only the unfinished-node
     subgraph.
  4. `oak_validation_lane_v1.py`'s docstring/schema claimed it validates "ontology references and
     relationships," but the implementation only calls `adapter.label(curie)` (concept resolution,
     not subject/predicate/object relation validation). **Fixed**: renamed the receipt schema to
     `parent-atlas.oak-concept-resolution-receipt.v1`, added an explicit
     `relationshipValidationImplemented: false` field, and renamed the gate to
     `OAK_CONCEPT_RESOLUTION_PROVEN`.
  5. `reduction-policy-v1.ts` obtained `requiresMutation` via
     `(input.classification as unknown as { requiresMutation?: boolean })` even though
     `QueryClassificationV1.requiresMutation: boolean` already exists as a real, directly-typed
     field (`src/lib/server/atlas/agentic-file-compiler/query-classifier.ts:18`). **Fixed**:
     removed the cast, read the field directly.
  6. `networkx_cugraph_backend_probe_v1.py` gated parity on a raw max-absolute-delta vs. a
     hardcoded `1e-6` with no top-K identity/order check — too strict for float32 GPU vs float64
     CPU accumulation, and not actually checking the thing that matters downstream (ranking).
     **Fixed**: widened the default tolerance to `1e-4` (overridable, always reported explicitly),
     added top-K identity and order checks as separate, distinctly-reported signals.
  - Correction 7 (the Ewin Tang citation, arXiv:1807.04271) is a citation fact, not code — recorded
    as operator-asserted and not independently re-verified against arXiv in this pass.
- **Found and fixed one additional real bug independently during verification** (not one of the
  original 7): `networkx_cugraph_backend_probe_v1.py`'s original `try/except` around
  `nx.pagerank(g, backend="cugraph")` assumed a missing GPU backend would raise. Verified live on
  a machine with neither `nx_cugraph` nor `cugraph` installed: NetworkX 3.3 does not raise — it
  silently falls through to the CPU implementation and returns a normal result, so the original
  code would have reported a false `gpuStatus: "AVAILABLE"` with a fabricated "speedup" number.
  Fixed by checking `importlib.util.find_spec` for the actual backend package before attempting
  the call.
- **Duplication check performed before copying anything in** (Duplication Prevention rule): the
  pack's `TaxonomyScopeV1` name is close to the repo's existing `QueryTaxonomyScopeV1`
  (`src/lib/server/atlas/classification/reduction-router-v1.ts`). Verified these are genuinely
  different, both-live concepts on two different, both-live classification generations: the new
  `TaxonomyScopeV1`/`ReductionPolicyV1`/`QueryExpansionBundleV1` extend the **V1** lineage
  (`query-classifier.ts` / `retrieval-plan.ts`, still live via `routes/api/search/hyperrag/+server.ts`);
  the existing `QueryTaxonomyScopeV1`/`ReductionRouterPlanV1` serve the **V2** lineage
  (`query-classification-v2.ts` / `query-router-control-plane-v2.ts`). Not a duplicate — added an
  explicit code comment in `taxonomy-scope-v1.ts` cross-referencing both so a future reader
  doesn't conflate them or "clean up" one thinking it's dead.
- Copied in as-is (no defects found): `gpu-capability-matrix-v1.ts`, `low-rank-helper-recommender-v1.ts`
  (TS scoring side only — the Python side is the one that was fitting-buggy),
  `grpo_policy_shadow_v1.py`, `rtx-visual-enhancement-boundary-v1.md`, both example fixtures.
- Minor quality fix applied in passing: `query-expansion-v1.ts`'s checksum preimage now uses a
  sorted-key stable-stringify (matching the existing `stable()` convention in
  `reduction-router-v1.ts`) instead of plain `JSON.stringify`, which doesn't guarantee canonical
  key ordering as a checksum input.

## Capabilities

### New Capabilities

- `gpu-prellm-recommendation`: governs the pre-LLM query-expansion/taxonomy-scope/reduction-policy
  extension to the V1 classification lineage, the masked-ALS low-rank helper recommender (shadow
  only, never a live router), the DAG time-budget estimator, the OAK concept-resolution lane, the
  GRPO shadow policy evaluator, the NetworkX/nx-cugraph parity probe, and the RTX visual-enhancement
  boundary (presentation-only, never retrieval/ACE truth).

### Modified Capabilities

(none — no existing `openspec/specs/` capability covers this scope; the V1/V2 classification
lineages themselves are pre-existing and unowned by any current OpenSpec change found this pass)

## Impact

- **Code** (new files, all additive, zero existing-file edits, zero canonical writes):
  `sveltekit-frontend/src/lib/server/atlas/agentic-file-compiler/{taxonomy-scope-v1,query-expansion-v1,reduction-policy-v1}.ts`,
  `sveltekit-frontend/src/lib/server/atlas/gpu/gpu-capability-matrix-v1.ts`,
  `sveltekit-frontend/src/lib/server/atlas/orchestration/dag-time-budget-v1.ts`,
  `sveltekit-frontend/src/lib/server/atlas/recommendation/low-rank-helper-recommender-v1.ts`,
  `scripts/atlas/gpu/{low_rank_helper_recommender_v1,networkx_cugraph_backend_probe_v1}.py`,
  `scripts/atlas/ontology/oak_validation_lane_v1.py`,
  `scripts/atlas/experiments/grpo_policy_shadow_v1.py`.
- **Docs**: `docs/architecture/rtx-visual-enhancement-boundary-v1.md`, `examples/{grpo-shadow-input,low-rank-input}.json`.
- **No wiring performed** — none of these new files are imported/called from any existing live
  code path yet. This change lands the reviewed, corrected capability; wiring it into the real
  `agentic-file-compiler` pipeline (`index.ts`) is separate, explicitly out of scope here, and
  gated on the proof sequence in `tasks.md`.
- **No Postgres/Qdrant/Neo4j/Valkey writes, no ACE admission, no mutation of Graphify/PKT-LINEAGE
  authority** — matches the pack's own stated non-goals, unchanged by this review.
