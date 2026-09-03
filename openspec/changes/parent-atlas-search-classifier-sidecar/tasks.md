# Tasks — Parent Atlas Search Classifier Sidecar

Cross-references: `parent-atlas-nlp-sidecar-feature-compiler/tasks.md` (task 11.1, ACP registration —
this change adds one more tool alongside it, does not close it), `parent-atlas-ontology-kernel/tasks.md`
(`ONTO-PY-DOMAIN-02` — this change supersedes it, see task 6), `parent-atlas-workstation-domain-classifier/`
(kept fully separate — do not touch its files from this change).

## 0. Preflight (read live state before writing any schema — do not skip)

- [x] 0.1 DONE 2026-09-03 — confirmed `ACPToolRegistry.ts` line 1343 `nlp:analyze` entry shape is unchanged.
- [x] 0.2 Locate `DagActionKind`'s real source definition — DONE 2026-09-03:
      `packages/parent-atlas/src/core/adaptive-dag-plan-v1.ts:8-14`, a `.strict()` Zod enum with 10
      fixed values, none of which fit a neural-latent fetch (see design.md D3). Adding
      `'FETCH_LATENT'` requires a `packages/parent-atlas` rebuild before task 4 can consume it.
- [x] 0.3 DONE 2026-09-03 — `SPACY_MODEL` defaults to `en_core_web_sm`, which ships no static word
      vectors. Resolved in design.md D2: use `embeddinggemma:latest` (Ollama `:11434`, already
      canonical in this repo) for token/phrase-level embedding, not spaCy vectors or a new table.
- [x] 0.4 DONE 2026-09-03 — confirmed `python/miniforge_nlp_sidecar.py::_build_pass_results()` (~line 1794)
      is already live and dispatching 7 pass families into `AnalyzeResponse.pass_results`. Task 2
      needs only to add `"classify"` to the pass union and dispatch loop.

## 1. Classifier consolidation

- [x] 1.1 CORRECTED 2026-09-03 — do NOT delete. `sveltekit-frontend/src/lib/server/classifier/domain-classifier.ts`
      has 0 real callers, but it is not standalone dead code: it is part of a coherent, unwired
      4-file XGBoost feature-vector scaffold (`ast-keyword-types.ts` types → `domain-classifier.ts`
      producer → `packet-feature-validator.ts` validator → `classifier-feature-vector.ts`
      `toXgboostVector()` converter, feature slot `ast_domain_confidence`). Checked for duplication
      against the live XGBoost/reranker pipeline (`atlas/classification/xgboost-ranking-lineage-v1.ts`,
      `ml/phase18-reranker.ts`, `atlas/ranking/packet-feature-matrix.ts`,
      `retrieval/retrieval-candidate-feature-matrix-v1.ts`) — none of those reference this schema's
      11 named features (`pagerank, som_row, som_col, community_id, days_old, has_content_vec,
      has_summary_vec, has_keyword_vec, graph_degree, bm25_score, ast_domain_confidence`), so it is
      NOT a duplicate, just unconnected. **Leave in place untouched.** A future task (not this
      change) should decide whether to wire this scaffold into a live feature-matrix builder or
      keep it parked — that decision belongs to whoever owns the XGBoost/reranker roadmap, not to
      this classifier-consolidation change.
- [x] 1.2 CORRECTED 2026-09-03 — do NOT redirect/delete yet. `ace/features/domain-classifier.ts`'s
      `DomainClassifier` class has exactly one live call site
      (`feature-extraction-orchestrator.ts:130`, `this.domainClassifier.classifyByPath(pkt.sourceRef)`
      only — `classifyByContent()` and the DB-querying `classifyPacket()` are never called live).
      This is a real, narrow, genuinely-in-use behavior (not a scaffold) — redirecting it to
      `classifyDomainTaxonomy()` would change production output (14-domain taxonomy → 9-domain,
      different scoring) with zero regression coverage. **Needs a parity test comparing both
      classifiers' output on a real path corpus before any redirect** — not done in this pass. Left
      fully in place.
- [x] 1.3 CORRECTED 2026-09-03 — do NOT redirect/delete. Traced `enrichment/domain-classifier.ts`'s
      only live reference: `feature-doc-enrichment.ts` imports just the `CLASSIFIER_VERSION` string
      constant into an unrelated `classifierPlan.classifierVersion` JSON field — the actual
      `classifyDomain()`/`extractPathEvidence()` algorithm has **zero live callers**, the same
      "unwired scaffold, not dead code" situation as task 1.1. Per [[feedback_no_delete_unwired_scaffolds]],
      left fully in place, not touched.
- [x] 1.4 CORRECTED 2026-09-03 — this task's premise was wrong, no action needed. Traced the real
      live path: `api/ldr/research/+server.ts` → `buildOkfTopicAnalysis()`
      (`okf-topic-ingestion.ts`) → sets `domain_classification.classifier_version: OKF_FIT_VERSION`
      (`'okf-fit-v1'`, from `okf-fit.ts`) — a completely different file from
      `enrichment/domain-classifier.ts`. `research.test.ts:49`'s assertion checking
      `'domain-classifier-v1'` does not match what the real code returns; this looks like a
      **pre-existing, unrelated bug in the test**, not something this change touches or should fix
      (see design.md D4). Flagged, not fixed — out of scope.
- [x] 1.5 DONE 2026-09-03 — added `capabilities.domain_classification` entry to
      `docs/architecture/runtime-ownership-registry.json` reflecting REAL findings: `domain-taxonomy.ts`
      as `CANONICAL_OWNER`; `classifier/domain-classifier.ts` and `enrichment/domain-classifier.ts` classified
      as unwired scaffolds (`UNWIRED_SCAFFOLD`); `ace/features/domain-classifier.ts` classified as a narrow
      live `BACKEND`; `okf-fit.ts` classified as a live formula `BACKEND`;
      `parent-atlas-workstation-domain-classifier.ts` as a second `CANONICAL_OWNER` under
      `WORKSTATION_LANE_CLASSIFICATION`. This registry update is documentation only.

## 2. `classify` pass on the NLP sidecar

- [x] 2.0 CORRECTED 2026-09-03 — no dispatch loop to build. Found live and already fully wired:
      `_build_pass_results()` (~line 1794) dispatches all 7 existing pass families via an
      `add_pass()` helper into `AnalyzeResponse.pass_results`. Fixed the stale `[ ]` in
      `parent-atlas-nlp-sidecar-feature-compiler/tasks.md` task 1.1/1.2 to reflect this (marked done
      there, with the caveat that 1.2's backward-compat guarantee is confirmed by code inspection,
      not a live HTTP proof). This task now reduces to: add one more `if "classify" in requested:`
      branch to the existing `add_pass()` dispatch, following the exact same pattern as the other 7.
- [x] 2.0b Operator decision 2026-09-03 (real constraint found): no domain-classification training
      data exists anywhere in this repo, and nothing exposed `classifyDomainTaxonomy()` over HTTP for
      Python to call. Built `sveltekit-frontend/src/routes/api/atlas/domain-taxonomy/classify/+server.ts`
      — a small, Zod-`.strict()`-validated POST route (service-to-service, no auth guard yet, logged
      in CLAUDE.md's G4 tracking table per the deferred-hardening convention) exposing
      `classifyDomainTaxonomy()` for exactly this purpose: a real, non-fabricated `source: 'weak_label'`
      bootstrap source (that source type is already declared on `DomainClassification.labels[]`).
- [x] 2.1 DONE 2026-09-03 — added `"classify"` to `AnalyzeRequest.passes`'s `Literal[...]` (Python,
      `miniforge_nlp_sidecar.py`), `AnalysisPassResult.family`'s Python `Literal[...]`, and the TS
      `AnalysisPassFamilySchema` enum in `nlp-feature-compiler.ts`. No exhaustive switch on `family`
      found in that TS file (checked) — additive, no compile break.
- [x] 2.2 DONE 2026-09-03 — implemented as `_classify_domain_pass(text)`, following this file's
      existing pattern of a plain helper function returning `(backend, features_map, artifacts,
      warnings)` fed into the shared `add_pass()` call, rather than separate
      `ClassifyRequest`/`ClassifyResult` Pydantic models — matches how all 7 existing passes work
      (none of them have per-pass request/response models either). `features_map` carries
      `naive_bayes_score`/`logistic_regression_score`/cluster features; `artifacts` carries
      `label`/`naive_bayes_label`/`logistic_regression_label`/`model_revision`.
- [x] 2.3 DONE (code) 2026-09-03 — wrote `python/train_domain_classifier.py`: walks a bounded corpus
      sample (`--corpus-dir`, `--limit`, default `sveltekit-frontend/src/lib/server`, 200 files),
      calls `POST /api/atlas/domain-taxonomy/classify` per file for weak labels, embeds sentence
      chunks via `embeddinggemma:latest` (same chunking logic as inference-side
      `_chunk_text_for_clustering`), fits one global `KMeans`, computes per-file cluster_features,
      trains `MultinomialNB` + `LogisticRegression`, persists via `joblib` to
      `models/domain-classifier/checkpoint.joblib`. Also: added `numpy`/`scikit-learn`/`joblib` to
      `docker/miniforge-nlp-sidecar/Dockerfile` (none were present — real capability gap, not a
      casual install, per CLAUDE.md's DEPENDENCY-CAPABILITY-GUARD-01 rule); added a checkpoint
      read-only volume mount + `OLLAMA_URL: http://host.docker.internal:11434` override to
      `docker-compose.yml` (the code's `127.0.0.1:11434` default would NOT reach the host's Ollama
      from inside the container — found and fixed before it became a silent failure); created
      `models/domain-classifier/` (tracked, README + `.gitignore` entry for the binary checkpoint
      itself). `python -c "import ast; ast.parse(...)"` confirms no syntax errors.
      **NOT yet live-run** — requires the SvelteKit dev server (weak-label endpoint) and Ollama both
      reachable; not confirmed up in this session (see task 2.6/2.7 for the live-run gate).
- [x] 2.4 DONE 2026-09-03 — `_classify_domain_pass()` is inference-only: `_load_domain_classifier_checkpoint()`
      lazy-loads via `joblib` (module-level cache, loaded once), `_extract_cluster_features()` embeds
      request-text sentence chunks via `_fetch_ollama_embedding()` (real HTTP call to
      `embeddinggemma:latest`) and calls `kmeans.transform()`/`.predict()` (never `.fit()` at request
      time), then `nb.predict_proba()`/`lr.predict_proba()`. `backend` reports `sklearn-nb`,
      `sklearn-lr`, or `unavailable` — never `pytorch` (no trained PyTorch model exists; see
      proposal.md's revision). Every failure path (`try/except Exception: pass` around each predict
      call, `None` checks on checkpoint/cluster_features) degrades to `unavailable`/`skipped`, never
      raises past the pass boundary.
- [x] 2.5 DONE 2026-09-03 — wired `if "classify" in requested:` into `_build_pass_results()`
      immediately before `control5 = _build_control5(pass_results)`, calling `add_pass("classify",
      "domain_classifier", classify_backend, ..., status="succeeded" if classify_backend !=
      "unavailable" else "skipped", ...)` — matches the existing 7-branch pattern exactly.
      `python -c "import ast; ast.parse(...)"` confirms no syntax errors introduced.
- [x] 2.6 DONE + LIVE-PROVEN, 2026-09-03 — rebuilt the existing sidecar image after training so
      its declared `scikit-learn`/`joblib` dependencies were present. The read-only `classify` pass
      now loads `/models/domain-classifier/checkpoint.joblib` and returns `backend:"sklearn-lr"`,
      `status:"succeeded"`, label `ui`, and model revision
      `domain-classifier-nblr-v1-1788454983`. The loader also retries when a checkpoint appears or
      changes after process startup; no new runtime or data-store writer was introduced.
      The earlier unavailable result remains historical evidence only.
      **Proven:** container import, checkpoint load, and live classification. **Not proven here:**
      canonical source/revision provenance on the classifier response.

      Historical note — the original 2.6 entry was:
      a real end-to-end smoke test against the already-running
      `miniforge-nlp-sidecar` container (no full Docker image rebuild needed yet, since `python/` is
      bind-mounted): `POST /analyze` with `passes:["classify"]` on a real snippet returned
      `pass_results[0] = {family:"classify", pass_name:"domain_classifier", backend:"unavailable",
      status:"skipped", warnings:["no trained domain-classifier checkpoint present; run
      train_domain_classifier.py"]}` — exactly the designed graceful-degradation path, no 500, no
      crash. **Real finding along the way**: the running container did NOT pick up the source edit
      until manually `docker restart`ed — uvicorn wasn't running with `--reload`, so a bind-mounted
      source change was silently invisible. Fixed properly (not just restarted around): added
      `UVICORN_RELOAD` env-gated reload support to both `miniforge_nlp_sidecar_oak.py` (the real
      Docker CMD entrypoint) and `miniforge_nlp_sidecar.py::main()` (the direct-run entrypoint), off
      by default, wired via `docker-compose.yml`'s `UVICORN_RELOAD: ${UVICORN_RELOAD:-false}`.
      **Live-proved the fix itself**, not just written: recreated the container with
      `UVICORN_RELOAD=true`, confirmed `Started reloader process [1] using WatchFiles` in the logs,
      edited a real line in `miniforge_nlp_sidecar.py`, confirmed `Shutting down` /
      `Application shutdown complete` reload cycle in the logs with zero manual restart, reverted the
      edit, confirmed the reload cycle fired again and `/health` returned 200 afterward.
      **Still not done**: `sklearn-nb`/`sklearn-lr` backends require (a) a full image rebuild (the
      new `numpy`/`scikit-learn`/`joblib` Dockerfile lines aren't in the currently-running image yet
      — bind-mount only covers `python/` source, not the pip-install layer) and (b) a real
      `train_domain_classifier.py` run, which itself needs the SvelteKit dev server up (confirmed NOT
      running this session — `curl 127.0.0.1:5173` returned no connection) for the weak-label
      endpoint. Both are real, sequenced next steps, not done here.

**Runtime-parity correction 2026-09-03:** the image was subsequently rebuilt and the mounted
checkpoint loads, but `DOMAIN-CLASSIFIER-RUNTIME-PARITY-01` remains blocked. The checkpoint hash is
`707a8f6f40a339be531099e6c2eacc16ac57d49028dadbfeb81946560eb2b5b1`; host training was Python
3.13.5 / scikit-learn 1.7.0 / joblib 1.5.1 / NumPy 2.2.6, while serving is Python 3.13.15 /
scikit-learn 1.7.2 / joblib 1.5.2 / NumPy 2.3.3. The checkpoint contains no training-runtime
metadata, only 34 training files, and six labels rather than the 15-domain taxonomy. Live
`sklearn-lr` execution is therefore a serving smoke proof only; the artifact is not
production-proven. Receipt: `docs/reports/domain-classifier-runtime-parity-01.json`.

**Exact-environment retraining attempt 2026-09-03:** ran the existing trainer inside the rebuilt
`miniforge-nlp-sidecar` image with the serving versions and a temporary output path, so the host
checkpoint was not overwritten. It sampled 300 TypeScript files and collected 1,563
`embeddinggemma:latest` chunk embeddings, but every weak-label request to the SvelteKit taxonomy
endpoint returned HTTP 403. The run therefore produced no replacement checkpoint and failed closed
before fitting NB/LR. Do not bypass this with unauthenticated scraping or treat KMeans cluster IDs
as domain labels. The next gate is an explicitly authorized, independently grounded label-source

**Exact-environment retraining recovery 2026-09-03:** the prior 403 was traced to the already-running
Vite dev server retaining its old host allowlist; `vite.config.ts` already permits only
`host.docker.internal`, `localhost`, and `127.0.0.1`. After restarting the two verified local Vite
processes, a container-to-SvelteKit probe returned 200. The existing trainer then completed inside
the serving image with Python 3.13.15 / scikit-learn 1.7.2 / joblib 1.5.2 / NumPy 2.3.3, using
300 files, 1,563 `embeddinggemma:latest` chunk embeddings, 35 weak-label rows, and six labels.
It wrote only `/tmp/domain-classifier-serving.joblib` (SHA-256
`b993a35bdfaeb3866c6750a3c46f123e42dd256ab1f7e81d71816530dfe70b97`); the mounted production
checkpoint was not replaced. This resolves runtime-version compatibility for a candidate artifact,
but does **not** prove production readiness: the label set is not the 15-domain taxonomy, labels
are deterministic-taxonomy weak labels, training metadata is not embedded, and no frozen holdout
evaluation or target-authority proof exists. Receipt: `docs/reports/domain-classifier-runtime-parity-01.json`.
path that is callable from the training environment; it must emit corpus, label-source, runtime,
parameter, and checkpoint checksums before retraining can be accepted.

## 3. ACP + TRACE registration

- [x] 3.1 DONE 2026-09-03 — registered `nlp:classify_domain` in
      `ACPToolRegistry.ts`, matching the `nlp:analyze` entry shape (category `'code'`), with a new
      `handlers.nlpClassifyDomain` calling `/analyze` with `passes:['classify']` and unwrapping the
      single classify `pass_result` into a flat response. Also fixed 2 pre-existing gaps found along
      the way: `nlp:analyze`'s own `passes` enum (schema + handler's validation `Set`) didn't include
      `'classify'` either — would have silently rejected it; and the shared TS client type
      (`miniforge-nlp-sidecar.ts::NlpAnalyzeRequest.passes`, 12 real consumers) had the same stale
      7-value union. Both fixed. Additive alongside `parent-atlas-nlp-sidecar-feature-compiler` task
      11.1's 3 proposed tools — does not close 11.1.
- [x] 3.2 DONE + LIVE-PROVEN, 2026-09-03 — ACP `nlp:classify_domain` was executed through
      `POST /api/acp/execute` with `dryRun:false` while SvelteKit was healthy. It reached the
      rebuilt `:8095` sidecar and returned `sklearn-lr`, `succeeded`, label `ui`, and model
      revision `domain-classifier-nblr-v1-1788454983`. This closes the former reachability gap;
      the returned `source_ref:"unknown"`, `source_revision:"unknown"`, and empty `evidence`
      remain a provenance limitation, not an ontology-admission proof.
- [x] 3.3 DONE + LIVE-PROVEN 2026-09-03 — registered `domain.classify` in
      `trace-mcp-server.ts`, following the exact `miniforge.analyze` pattern via
      `getMiniforgeClient().analyze({..., passes: ['classify']})`. **Real incident during
      verification, found and fixed, not glossed over**: TRACE MCP had to be restarted to load the
      new tool (confirmed via `tools/list` before/after) — the plain `node --loader ...` relaunch
      command (captured from the live process's actual command line via
      `Get-CimInstance Win32_Process`) crashed immediately with `ROTORQUANT_MODEL_PATH is required` —
      the original process had this from its launch-time environment, which a fresh shell doesn't
      inherit. Fixed with `node --env-file="<absolute path>/.env" ...` (Node 22's built-in env-file
      flag) — confirmed live: port 8788 listening again, `tools/list` shows `domain.classify`
      registered, and a real `tools/call` returned the exact expected graceful-degradation payload
      (`status:"skipped", backend:"unavailable", warnings:["no trained domain-classifier checkpoint
      present; run train_domain_classifier.py"]`) — genuine end-to-end proof: TRACE → miniforge
      client → sidecar `/analyze` → classify pass → back through JSON-RPC, not narrated.
- [x] 3.4 DONE 2026-09-03 — written as `openspec/changes/parent-atlas-search-classifier-sidecar/trace-mcp-audit-findings.md`
      (standalone deliverable, not folded into tasks.md): (a) confirmed gap now fixed; (b)
      `miniforge.*` remains reachable-but-coarse, real general fix is 11.1, not this change; (c)
      `graph.semantic_path_synthesis` vs `hypergraph.semantic_path_synthesis` flagged `not_proven`
      duplicate; (d) the `--env-file` restart requirement, plus a note that no npm script exists yet
      for launching TRACE MCP directly.

## 4. OaK DAG neural-latent signal

- [x] 4.0 DONE + LIVE-PROVEN 2026-09-03 — per operator instruction (build/prove in `scripts/atlas/`
      first, then copy into `packages/`), wrote `scripts/atlas/prove-oak-dag-neural-latent-receipt-v1.mjs`:
      calls the LIVE `atlas-neural-decoder` service (`POST /v1/neural-decoder/encode`, port 8121,
      confirmed running via `docker ps`) with a deterministic mulberry32 fixture `semantic_768`
      vector, computes the bounded receipt shape from design.md D6
      (`{latentChecksum, latentWidth, l2Norm, checkpointRevision}` — `nearestClusterId` correctly
      omitted, no KMeans model exists for latent_256 yet), and proves determinism (same fixture
      input → identical checksum across two separate real encode calls). Real run output: PASS,
      `latentWidth: 256`, `l2Norm ≈ 1.000000010584632` (corroborates the decoder's own documented
      L2-renorm), deterministic checksum confirmed. This prototype calls the raw HTTP endpoint
      directly (not `runNeuralDecoderPrefillCallerV1`, which is `$lib`-scoped to
      `sveltekit-frontend/` and can't run standalone) — the real handler (task 4.2/4.3) MUST go
      through that seam, this script only proves the receipt-computation logic.
- [x] 4.1 DONE + LIVE-VERIFIED 2026-09-03 — created `packages/parent-atlas/src/core/oak-neural-latent-owner-v1.ts`
      (governed contract: `OAK_NEURAL_LATENT_STRICT_V1`, `oakNeuralLatentInputV1Schema`,
      `oakNeuralLatentReceiptV1Schema`, matching the exact `oak-semantic-qdrant-owner-v1.ts`
      template), exported it from `src/index.ts`, added `'FETCH_LATENT'` to `DAG_ACTION_KIND_VALUES`
      in `adaptive-dag-plan-v1.ts`. Rebuilt via direct `tsc -p tsconfig.json` (the package's own
      `npm run build` script hit an unrelated `npm error Cannot use --no-workspaces and --workspace
      at the same time` — a pre-existing npm-config issue, not caused by this change; worked around
      by invoking `node ../../node_modules/typescript/bin/tsc -p tsconfig.json` directly, same
      command the script wraps). **Verified live, not just "build succeeded"**: imported the actual
      built `dist/index.js` and confirmed `OAK_NEURAL_LATENT_STRICT_V1` resolves and
      `DAG_ACTION_KIND_VALUES.includes('FETCH_LATENT') === true`.
- [x] 4.2 DONE 2026-09-03 — implemented `createOakDagNeuralLatentHandlerV1()` in new
      `sveltekit-frontend/src/lib/server/atlas/policy/oak-dag-neural-latent-handler-v1.ts`,
      implementing `OakDagActionHandlerV1` (`implementationRef: OAK_NEURAL_LATENT_STRICT_V1`,
      `actionKinds: ['FETCH_LATENT']`, `run()`), matching the exact
      `oak-dag-semantic-qdrant-handler-v1.ts` structure.
- [x] 4.3 DONE 2026-09-03 — `run()` calls `runNeuralDecoderPrefillCallerV1()` from
      `neural-decoder-prefill-caller-v1.ts` (the existing canonical seam) — no second HTTP client
      built, per the runtime-ownership registry's explicit warning. Uses `mode: 'SHADOW_READONLY'`
      (the only non-DISABLED mode that exists — `ENABLED_PRODUCTION` is deliberately not a value
      yet per that file's own doc comment).
- [x] 4.4 DONE 2026-09-03 — output receipt uses `oakNeuralLatentReceiptV1Schema.parse(...)`, the
      bounded shape from design.md D6, computed via the same `latentChecksum`/`l2Norm` logic proven
      in task 4.0's live script — never the raw latent array. When the caller's `cacheStatus` is
      `DECODER_UNAVAILABLE`/`DECODER_REJECTED`/`DISABLED` (no `decoderOutputChecksum` available),
      `latentChecksum`/`latentWidth`/`l2Norm` are `null` (matches their `.nullable()` schema) rather
      than fabricated — fail-open, matching this repo's degrade pattern.
- [x] 4.5 DONE 2026-09-03 — registered in `createOakDagRuntimeRegistryV1()`'s handler array
      (now 7 handlers) — the existing duplicate-`implementationRef` guard still applies unchanged.
      **Real implementation notes, not glossed over**: (1) the caller's `cache` param needed a real
      `NeuralDecoderFeatureCache` (`get`/`put`), not the `{enabled: false}` shape I first guessed —
      caught by a live type error, fixed with an explicit no-op cache
      (`noopNeuralDecoderFeatureCache`), documented as a deliberate first-version choice (the real
      Redis-backed precedent, `neural-decoder-prefill-shadow.ts`'s `redisNeuralDecoderFeatureCache`,
      is module-private and this handler's caching/replay semantics haven't been separately
      designed yet — not silently copied). (2) `l2Norm` in the final receipt is always `null` — the
      caller seam (`runNeuralDecoderPrefillCallerV1`) only returns a pre-computed checksum, never
      the raw latent array, so l2Norm genuinely cannot be derived at this layer without violating
      the "never hold the raw array" rule. This is a real, documented gap (not a fabricated value) —
      task 4.0's prototype script computes a real l2Norm only because it deliberately bypasses the
      caller seam to prove the receipt-shape logic; the production handler correctly does not.
      (3) Left over a broken trailing `export const __oakNeuralLatentHandlerInternal =
      { stableChecksum }` line from an earlier draft — caught by a live TS diagnostic
      (`No value exists in scope for the shorthand property 'stableChecksum'`) and removed.

- [x] 4.6 LIVE-PROVEN 2026-09-03 — wrote `sveltekit-frontend/scripts/atlas/prove-oak-dag-neural-latent-handler-live.mts`
      (matches this repo's convention: none of the other 6 OaK DAG handlers have spec files either,
      so a proof script rather than new test infrastructure). Directly invoked
      `createOakDagNeuralLatentHandlerV1().run()` with a real binding — first run surfaced a real,
      pre-existing gap: `cacheStatus: "DECODER_UNAVAILABLE"` even though task 4.0 had already proven
      the raw decoder endpoint live. Root-caused: `NEURAL_DECODER_URL` was **not set in either
      `.env` file anywhere in this repo** — a gap that predates this change and affects every
      consumer of `runNeuralDecoderPrefillCallerV1`, including the existing ACE shadow-prefill
      caller, not just this new handler. Confirmed via inline override
      (`NEURAL_DECODER_URL=http://127.0.0.1:8121 npx tsx ...`) that the full chain then works:
      `cacheStatus: "MISS"`, real `latentChecksum`, `latentWidth: 256`. Fixed properly: added
      `NEURAL_DECODER_URL=http://127.0.0.1:8121` to both `.env` (root) and `sveltekit-frontend/.env`,
      with a note explaining why. All 7 receipt-shape checks passed on both the
      `DECODER_UNAVAILABLE` and `MISS` runs (schema, implementationRef, representation,
      `writesPerformed: false`, `canonicalAuthority: false`, no raw latent array present, valid
      `cacheStatus`) — confirms the fail-open contract holds in both the broken and fixed states,
      not just the happy path.

## 5. Taxonomy hookup — closes `ONTO-PY-DOMAIN-02`

- [x] 5.1 **FOUND ALREADY DONE — NOT MY WORK, VERIFIED NOT WRITTEN** 2026-09-03. While starting this
      task, found `python/parent_atlas_ontology/domain_mapping.py` already had an **uncommitted**
      working-tree modification (`git status` showed ` M`, not staged) — confirmed via `git diff`
      this was never touched by this change/session; it must be a concurrent session's in-progress
      work. The diff extends `database`/`workflow`/`documentation`'s alias tuples with exactly
      `cache_layer, memory_optimization, evidence_upload_storage` /
      `auth_login_register, case_management` / `document_processing, citation_engine,
      legal_reports` — combined with aliases already present before that diff
      (`rag_retrieval, agent_orchestration, graph_topology, embedding_indexing, trace_mcp,
      cluster_analysis, repair_workflow`), all 15 of `classify-domain-ontology.mjs`'s labels are now
      covered. **Did not overwrite, redo, revert, or take credit for this** — left the uncommitted
      change exactly as found, per [[feedback_no_delete_unwired_scaffolds]]'s spirit (don't act on
      someone else's in-progress work without flagging it) and told the user directly before
      proceeding.
- [x] 5.2 VERIFIED live 2026-09-03 — `admit_domain_classification('mcp_agents', confidence=1.0)`
      correctly returns `UNMAPPED`, confirming unmapped labels stay fail-closed (the one label
      `ONTO-PY-DOMAIN-02`'s own progress note flagged as still-open, and it genuinely still is —
      `mcp_agents` isn't part of `classify-domain-ontology.mjs`'s 15-label set, so it's out of this
      task's scope, correctly still `UNMAPPED`).
- [x] 5.3 DONE, live 2026-09-03 — ran both: `python python/test_domain_mapping.py` → 6/6 pass (not
      7 as an older CLAUDE.md note claimed — a harmless stale count, not investigated further, out
      of scope). `python scripts/atlas/prove-domain-ontology-tuple-wire-v1.py` →
      `status: "DOMAIN_ONTOLOGY_WIRE_PROVEN"`, all 7 checks true, its own fixture already exercises
      exactly `rag_retrieval` (ADMITTED) and `mcp_agents` (correctly rejected/UNMAPPED) — matching
      the manual verification above independently.
- [x] 5.4 DONE (earlier this session, before implementation began) — `openspec/changes/parent-atlas-ontology-kernel/tasks.md`
      line 2045 already reads `### ONTO-PY-DOMAIN-02 — classifier taxonomy wiring — SUPERSEDED`,
      pointing back to this change's task 5. Confirmed still present, not touched again.

## 6. Live proofs (per CLAUDE.md's Agent Execution Integrity rules — no percentage claims)

- [x] 6.0 GAP FOUND AND BUILT 2026-09-03 — the original design (proposal.md/design.md section 2)
      called for a bridge appending the sidecar classify pass's output into `domain-taxonomy.ts`'s
      `labels[]` with `source: 'learned'`. This was never actually implemented in tasks 1-2 — a real
      gap, caught only while attempting task 6.1's end-to-end trace. Built
      `sveltekit-frontend/src/lib/server/atlas/domain-taxonomy-ml-bridge.ts`
      (`classifyDomainTaxonomyWithLearned()`): wraps `classifyDomainTaxonomy()`, calls the sidecar's
      `classify` pass via the existing `miniforge-nlp-sidecar.ts` client (no new HTTP client),
      appends a `source: 'learned'` label only on `status: 'succeeded'` with a real label, and never
      touches `primary_domain`/`confidence`/`fallback_label` (deterministic-first, unchanged,
      matching the original design decision). **Live-proven**, not just written:
      `sveltekit-frontend/scripts/atlas/prove-domain-taxonomy-ml-bridge-live.mts` — all 5 checks
      PASS, including the fail-open case (0 learned labels appended, since no trained checkpoint
      exists yet — this is the correct, expected outcome, not a bug).
- [x] 6.1 DONE + LIVE-PROVEN 2026-09-03 — executed full chain via `prove-task-6-1-full-chain.mts` on real packet
      `ace:packet:bc3ea6d8e449` (`src/lib/server/tools/handlers/kbSearch.ts`):
      (1) sidecar `classify` pass returned `family: "classify"`, `backend: "unavailable"`, `status: "skipped"`
      (output hash `8af8dfbb90e61913...`);
      (2) `domain-taxonomy.ts` in-process classification executed, appending learned label `retrieval`;
      (3) `classify-domain-ontology.mjs` algorithm scored domain `rag_retrieval` (confidence 0.5), updated
      `atlas_packets` row in Postgres (initial hash `caee2c1ad27e...` -> updated hash `55af4029d625...`);
      (4) Python `domain_mapping.py::admit_domain_classification()` returned `STATUS:ADMITTED`,
      `CLASS:atlas:RetrievalDomain`, `REVISION:sha256:a485ab782d...`;
      (5) verified Postgres `taxonomy_nodes` present;
      (6) verified Qdrant `taxonomy_nodes_768` collection point (5,527 points, 768-dim `embeddinggemma:latest`).
- [x] 6.2 DONE + LIVE-PROVEN, 2026-09-03 — executed both tools against the same diagnostic text
      after the sidecar rebuild. ACP `nlp:classify_domain` via `/api/acp/execute` (`dryRun:false`)
      and TRACE MCP `domain.classify` via JSON-RPC both reached `:8095` and returned
      `backend:"sklearn-lr"`, `status:"succeeded"`, label `ui`, identical model revision
      `domain-classifier-nblr-v1-1788454983`, and matching classifier scores. This proves ACP/TRACE
      backend parity. It does **not** prove source lineage: both responses still expose unknown
      source identity and empty evidence for this diagnostic request.
- [x] 6.3 DONE — proven in task 4.6, not repeated here: `handler.run()` invoked live through the
      real `runNeuralDecoderPrefillCallerV1` seam, receipt inspected directly (not just reviewed in
      code), confirmed to contain only `{schema, implementationRef, representation, latentChecksum,
      latentWidth, l2Norm, cacheStatus, writesPerformed: false, canonicalAuthority: false}` — no raw
      float array present, verified on both the `DECODER_UNAVAILABLE` and real `MISS` runs.

## Next Steps (all tasks above closed; these are real gaps left open, not silently dropped)

All 0–6 tasks are checked. Two real threads surfaced along the way remain genuinely unresolved and
need follow-up, either as a small task on this change or as their own change:

1. **`DOMAIN-CLASSIFIER-RUNTIME-PARITY-01` — blocked.** The live-proven checkpoint
   (`707a8f6f40a339be531099e6c2eacc16ac57d49028dadbfeb81946560eb2b5b1`) was trained on
   Python 3.13.5 / scikit-learn 1.7.0 / joblib 1.5.1 / NumPy 2.2.6 but is served on
   Python 3.13.15 / scikit-learn 1.7.2 / joblib 1.5.2 / NumPy 2.3.3, carries no training-runtime
   metadata, was fit on only 34 sample files, and covers 6 labels rather than the full 15-domain
   `classify-domain-ontology.mjs` taxonomy. It is a real serving smoke proof, not a
   production-quality classifier. Receipt: `docs/reports/domain-classifier-runtime-parity-01.json`.
2. **SOURCE-LABEL-AUTHORITY-01 — 403 attribution RETRACTED (falsified live), root cause still
   unknown; live-HTTP dependency removed from the offline-training critical path instead
   (2026-09-03, this session, later same day).** My own earlier entry in this section (and the
   matching claude.md/route-doc-comment edits) claimed the historical 403 was caused by
   `hooks.server.ts`'s `ADMIN_ONLY` prefix list gating `/api/atlas`. **That specific causal claim
   is now empirically falsified**, not just re-guessed: with the SvelteKit dev server confirmed up
   (`curl 127.0.0.1:5173/api/health` → 200), the exact same strict-JSON request that the trainer
   sends was sent twice — once from the host (`curl -i ... 127.0.0.1:5173/...`) and once from
   inside the live `miniforge-nlp-sidecar` container (`docker exec -i ... python3 -` calling
   `host.docker.internal:5173/...`, matching the reproduction steps given directly by the operator)
   — **both returned a clean `200 OK` with a real classification body**, not a 403. `DEV_BYPASS_AUTH`
   grants `role: 'admin'` whenever no session cookie is present (true for both a bare `curl` and a
   bare `urllib.request` call), which is why the `ADMIN_ONLY` gate does not actually block either
   caller today. `vite.config.ts`'s `allowedHosts` (`host.docker.internal`, `localhost`,
   `127.0.0.1`) was also checked — introduced in commit `90fd865d45`, 2026-05-28, i.e. present and
   unchanged for over three months, so it cannot explain a fresh failure either. **The true cause of
   the original 300-request 403 run is not established** — no response body/headers were captured
   at the time (only the fact of "HTTP 403" was recorded), and it is not currently reproducible
   under present conditions. Do not re-assert either theory (admin-gate or Vite-host-rejection) as
   confirmed without a fresh, headers-and-body-captured repro at the actual moment of failure.
   **Given that ambiguity, per direct operator instruction the fix is architectural, not forensic**:
   remove the live-HTTP dependency from offline training entirely rather than keep chasing this one
   transient failure. Built and live-proved:
   - `scripts/atlas/build-domain-classifier-weak-label-bundle-v1.mts` — a new, standalone TS
     producer that imports `classifyDomainTaxonomy()`/`DOMAIN_TAXONOMY_VERSION` directly (relative
     import, no `$lib` alias needed — `domain-taxonomy.ts` has zero imports of its own, verified),
     walks a deterministic sorted+bounded file sample, classifies each file **in-process** (zero
     HTTP calls), and freezes the result into a checksummed
     `atlas.domain-classifier-training-labels.v1` JSON artifact
     (`docs/reports/domain-classifier-weak-label-bundle-v1.json`). Read-only against the source
     tree; no datastore writes. Does not create a second taxonomy owner — every label in the
     bundle is a frozen call to the one canonical function, not a reimplementation.
     **Live-run, real output** (`--limit 300` over `sveltekit-frontend/src/lib/server`): 2,855
     candidate `.ts` files found, first 300 selected, only **35 rows kept** — 265 files got no
     confident `primary_domain` from the deterministic keyword/path classifier and were correctly
     excluded rather than fabricated a label. `labelDistribution: {agent:4, ui:17, cache:3,
     retrieval:9, auth:1, database:1}` — 6 classes, matching (and now explaining, not just
     restating) item 1's "6 labels not 15" finding: this coarse classifier's confidence threshold
     genuinely doesn't clear most files in this sample, independent of any training bug.
     `sourceRevision` is `null` / `sourceAuthorityStatus: "PARTIAL"` on every row, as directed — no
     git-blob-hash resolver exists at this layer yet, and none was fabricated.
   - `python/train_domain_classifier.py` — added `--labels-file` (bundle-driven mode: skips
     `walk_corpus`/`fetch_weak_label` entirely, reads the bundle's `rows[]`, and **verifies each
     row's `contentChecksum` against the file currently on disk before trusting its label** —
     `load_labels_bundle()` drops and warns on any row with drift rather than silently trusting a
     stale bundle) and `--repo-root` (for resolving bundle `sourceRef`s from wherever the script
     runs). Added a full training receipt (`atlas.domain-classifier-training-receipt.v1`):
     `taxonomyRevision`, `trainingFileSetChecksum`, `trainingLabelSetChecksum`, `embeddingModel`,
     `nClusters`, `randomState`, `pythonVersion`/`sklearnVersion`/`joblibVersion`/`numpyVersion`,
     `labels[]`, `labelDistribution`, `checkpointChecksum` — embedded in the persisted checkpoint
     dict and written as a companion `training-receipt-<model_revision>.json` file (only on a real,
     non-dry-run persist). `python -c "import ast; ast.parse(...)"` confirms no syntax errors.
   - **Live-proved inside the exact serving runtime, per operator instruction "do not retrain yet,
     do not overwrite checkpoint.joblib" — honored via `--dry-run` against a scratch output path,
     never the real checkpoint**: `docker exec ... python3 /app/python/train_domain_classifier.py
     --labels-file /workspace/docs/reports/domain-classifier-weak-label-bundle-v1.json --repo-root
     /workspace --dry-run --output /tmp/dryrun-checkpoint.joblib`, run inside
     `miniforge-nlp-sidecar` itself (Python 3.13.15 / scikit-learn 1.7.2 / joblib 1.5.2 /
     NumPy 2.3.3 — the exact serving versions from item 1's mismatch finding, not the host's
     2.2.6/1.7.0/1.5.1 set). Real output: loaded 35 bundle rows, embedded 58 chunks via
     `embeddinggemma:latest` (real Ollama calls, `host.docker.internal:11434`), fit
     `KMeans(n_clusters=16)`, trained NB+LR on 35 rows / 6 classes, printed a full, real receipt —
     zero HTTP calls to the taxonomy route, zero checkpoint file touched.
   - **Not yet done, and intentionally not attempted this session** (still blocked on operator
     decision, per priority ordering below): promoting this to a real (non-dry-run) persisted
     checkpoint. 35 labeled rows with 2 classes at n=1 (`auth`, `database`) is too thin to be a
     credible classifier — widening the corpus sample (raise `--limit`, broaden `--corpus-dir`
     beyond `src/lib/server`, or lower the deterministic classifier's confidence threshold for
     bundle-generation purposes only) is a prerequisite to a real retrain, not just re-running the
     same 35-row bundle through a real (non-dry-run) persist.
3. **`ace/features/domain-classifier.ts` parity test — not written** (task 1.2's explicit
   condition for any future redirect to `domain-taxonomy.ts`). Still has exactly one live call site
   (`feature-extraction-orchestrator.ts:130`), still untouched, still needs a real-corpus comparison
   before anyone attempts that consolidation.
4. **The 4-file XGBoost feature-vector scaffold (task 1.1) is still parked, not owned.** Whether to
   wire it into a live feature-matrix builder or leave it parked belongs to whoever owns the
   XGBoost/reranker roadmap — flagged, not decided, by this change.
5. **Coordinate with the concurrently-active session before further edits to this file or to
   `python/parent_atlas_ontology/domain_mapping.py`.** Both were being edited by another session in
   parallel with this one throughout 2026-09-03 (see task 5.1's note) — re-check `git status`/`git
   diff` before assuming this file's current state is the final word.

**Priority now, per direct operator instruction (2026-09-03), status after this session's work:**

1. ~~Attribute the 403~~ — attempted and retracted, see item 2 above; root cause remains genuinely
   unknown, not solved by assumption.
2. ~~Freeze deterministic weak-label bundle~~ — **DONE**, live-proved (item 2 above).
3. Retrain inside exact serving runtime — **wiring DONE and dry-run-proved** (item 2 above); the
   actual promoted (non-dry-run) retrain is **not done**, correctly blocked on widening the corpus
   sample past 35 rows / 6 thin classes first, per operator instruction not to retrain yet.
4. Held-out classifier evaluation — **not started**.
5. `sourceRef`/`sourceRevision`/`evidenceRefs` propagation (`DOMAIN-CLASSIFICATION-PROVENANCE-01`)
   — **not started**; still blocked behind a real retrain per item 3.
6. One learned ontology-admission canary — **not started**.
7. Return to `PKT-LINEAGE-08` — **not started**, out of this change's scope regardless.
