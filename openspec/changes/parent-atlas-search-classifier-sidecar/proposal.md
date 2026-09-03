# Proposal — Parent Atlas Search Classifier Sidecar

## Why

> **Correction, 2026-09-03**: this section originally described (1)-(4) as "four near-duplicate
> live implementations needing consolidation." That framing was wrong — investigated further and
> found (2) and (4)'s actual algorithms have **zero live callers** (unwired scaffolds, not
> competing duplicates — see [[feedback_no_delete_unwired_scaffolds]]), and (3)'s only live usage is
> one narrow method call. **Nothing has been deleted, folded, or redirected.** The "What Changes"
> and "Impact" sections below are updated to match; see `tasks.md` task 1 for the full corrected
> trail. This proposal now documents 8 classifier-adjacent surfaces, not 6.

Domain classification in this repo is spread across **eight** classifier-adjacent surfaces (not the
originally-assumed 3-4 competing duplicates), none using a trained model. This was discovered live
(2026-09-03), not assumed:

1. `sveltekit-frontend/src/lib/server/atlas/domain-taxonomy.ts` — 8 real callers, self-identifies as
   "the authority module for domain_class handling inside the workstation control plane," 9-domain
   taxonomy (`auth, ui, retrieval, network, database, cache, agent, graph, ml`), already has an
   unused `source: 'deterministic' | 'learned' | 'weak_label' | 'reviewed' | 'fallback'` field.
2. `sveltekit-frontend/src/lib/server/classifier/domain-classifier.ts` — **unwired scaffold, not
   dead code**. Its `classifyDomainFromText()` already correctly wraps (1), but has zero live
   callers itself. Part of a coherent 4-file XGBoost feature-vector scaffold (types → this producer
   → a validator → a `toXgboostVector()` converter feeding a declared-but-never-populated
   `ast_domain_confidence` feature slot). Checked against the live XGBoost/reranker pipeline —
   not a duplicate of it, just never connected. **Left in place.**
3. `sveltekit-frontend/src/lib/server/ace/features/domain-classifier.ts` — real, live, but narrowly:
   exactly one call site (`feature-extraction-orchestrator.ts:130`,
   `classifyByPath()` only — its `classifyByContent()` and DB-querying `classifyPacket()` are never
   called). Independent 14-domain regex taxonomy. **Left in place** — any consolidation needs a
   parity test first (not built).
4. `sveltekit-frontend/src/lib/server/enrichment/domain-classifier.ts` — **unwired scaffold**. Its
   18-domain-taxonomy algorithm (`classifyDomain()`/`extractPathEvidence()`) has zero live callers.
   The file's only live reference anywhere is `feature-doc-enrichment.ts` importing just its
   `CLASSIFIER_VERSION` string constant into an unrelated JSON field
   (`classifierPlan.classifierVersion`, not `domain_classification.classifier_version`). **Left in
   place.**
5. `sveltekit-frontend/src/lib/server/ai/parent-atlas-workstation-domain-classifier.ts` — built,
   type-checked, **not wired into any live route** (own proposal.md's words), 10-domain taxonomy
   scoped to workstation lanes (`IDENTITY, EXPORT_STORAGE, GRAPH, ...`) — a genuinely distinct scope
   from (1)-(4), not source-code domain classification.
6. `scripts/atlas/classify-domain-ontology.mjs` — a standalone Node script, Postgres-writing
   (`--apply`/dry-run), 15-domain taxonomy (`auth_login_register, case_management,
   evidence_upload_storage, rag_retrieval, agent_orchestration, graph_topology, ...`). **This is the
   taxonomy `ONTO-PY-DOMAIN-02` in `parent-atlas-ontology-kernel/tasks.md` actually references** —
   confirmed by reading that task's own text, which names `agent_orchestration`, `rag_retrieval`, and
   `graph_topology` verbatim.
7. `sveltekit-frontend/src/lib/server/atlas/okf-fit.ts::classifyOkfFit()` — found during this pass,
   not in the original inventory. Real, live (the actual path
   `api/ldr/research/+server.ts` exercises via `okf-topic-ingestion.ts`). Correctly wraps (1), then
   adds `naive_bayes_score`/`logistic_regression_score`/`fit_margin`/`fit_decision` fields — but
   these are **hand-tuned linear/sigmoid formulas with hardcoded coefficients**, not trained models.
8. `sveltekit-frontend/src/lib/server/atlas/phase109a-mcp-tools.ts::baselineDomainClassifier()` —
   found during this pass (an earlier grep initially mismatched it for (3) via a substring
   coincidence). Not investigated further — flagged for a future pass, out of scope here.

None of the eight use PyTorch, Naive Bayes, Logistic Regression, or any trained model — (7)'s
NB/LR-named fields are hand-tuned formulas, and the rest are regex/keyword scoring. Separately:

- **TRACE MCP** (`sveltekit-frontend/src/mcp/trace-mcp-server.ts`) has **118 live tools** (verified
  via `server.registerTool(...)` grep, not the "4 tools" originally assumed) covering graph search,
  cluster sub-search, topK KNN, HypergraphRAG, taxonomy, and ontology-linked tuples
  (`atlas.pos_concept_tagging`) — but **no dedicated domain-classification tool**.
- The NLP sidecar (`python/miniforge_nlp_sidecar.py`, port 8095, Dockerized FastAPI) has zero ACP
  registrations (confirmed live 2026-08-09 per `parent-atlas-nlp-sidecar-feature-compiler` task
  11.1) and no ML-backed classify pass.
- The neural decoder (`python/atlas_neural_decoder_service.py`, port 8121) has no relationship to any
  DAG system. The only real DAG system in the repo is `oak-dag-runtime-registry-v1.ts` (OaK
  policy/replay), which has 6 handlers and no signal derived from the neural decoder's latent output.

## What Changes

- **Do NOT consolidate, delete, or redirect (2)-(4).** Corrected 2026-09-03: they are not competing
  live duplicates — (2) and (4) are unwired scaffolds with zero real callers of their algorithms,
  and (3) has exactly one narrow live call site. Recorded accurately in
  `docs/architecture/runtime-ownership-registry.json`'s new `capabilities.domain_classification`
  entry (documentation only, no code changes). A future, separately-scoped change may build the
  parity tests needed to actually fold (3), but that is not this change.
- Extend (1), `domain-taxonomy.ts`, with a real ML label (`source: 'learned'`) fed by a new sidecar
  pass — this remains the ML-extension target, unaffected by the correction above.
- Reconcile (6)'s Postgres-writing taxonomy separately, since it is a distinct capability (packet
  enrichment at the `atlas_packets` row level, not in-process ACE classification) with its own
  15-domain taxonomy that `ONTO-PY-DOMAIN-02` is blocked on mapping.
- Add a `classify` pass to `miniforge_nlp_sidecar.py`. **Revised 2026-09-03**: no domain-classification
  training data exists anywhere in this repo, so "PyTorch primary" isn't honestly buildable yet —
  there's nothing to train it on. Built a small new route
  (`api/atlas/domain-taxonomy/classify`) exposing the canonical `classifyDomainTaxonomy()` for the
  sidecar to bootstrap real `source: 'weak_label'` training data (a source type already declared on
  `DomainClassification.labels[]`), then train `sklearn` `MultinomialNB` + `LogisticRegression` on
  KMeans word-cluster features (via `embeddinggemma:latest`) offline, persisted via `joblib`. NB/LR
  on real weak labels is the honest first deliverable; a PyTorch upgrade over the same feature
  pipeline is a documented future step, not built here. Per design.md D4b, design this so its output
  can later be compared against or feed (7)'s formula-based `OkfFitResult` contract shape — a real
  trained-model upgrade path for a live consumer, not a parallel invention. Replacing (7)'s formula
  is explicitly a separate, future decision — not part of this change.
- Register the new classify capability in both ACP (`ACPToolRegistry.ts`) and TRACE MCP
  (`trace-mcp-server.ts`), closing the one confirmed TRACE gap.
- Add a new OaK DAG handler that exposes a bounded, checksum-referenced feature derived from the
  neural decoder's latent output (never raw tensor state) as an additional policy signal.
- Extend `python/parent_atlas_ontology/domain_mapping.py`'s mapping catalog to cover (6)'s taxonomy,
  closing `ONTO-PY-DOMAIN-02`.

## Capabilities

- **New**: `domain-classification-ml-extension`, `oak-dag-neural-latent-signal`
- **Modified**: `acp-sidecar-tool-registration` (adds one tool alongside the 3 already proposed in
  `parent-atlas-nlp-sidecar-feature-compiler` task 11.1 — does not close 11.1), `runtime-owner-deduplication`
  registry (`docs/architecture/runtime-ownership-registry.json` gets a new
  `capabilities.domain_classification` entry — done, documentation only)

## Impact

- **No files deleted, folded, or redirected.** The only file-tree change from task 1 is the registry
  documentation entry above.
- Does not touch (5) — cross-referenced, not duplicated, per
  `openspec/changes/parent-atlas-workstation-domain-classifier/`.
- Does not touch HypergraphRAG (`hyperrag-*.ts`), taxonomy tables (`taxonomy_nodes`/`taxonomy_edges`),
  or the Qdrant `taxonomy_nodes_768` collection — all reused as-is.
- Does not touch (7) `okf-fit.ts` or its live route — a future decision, not this change.
- Supersedes `ONTO-PY-DOMAIN-02` in `openspec/changes/parent-atlas-ontology-kernel/tasks.md` (marked
  there, not duplicated).
