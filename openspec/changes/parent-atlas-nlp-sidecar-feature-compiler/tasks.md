Gate-by-gate, matching this repo's established discipline for large external
plans (see `parent-atlas-agentic-repair-bundle-integration`,
`parent-atlas-graph-runtime-enhancement`, and this session's own
`parent-atlas-graph-analysis-contract` Patch C–E precedent — audit before
code, live-verify before calling anything done, record findings in this
file as they're discovered). Nothing past task 0.1 is implied to start just
because an earlier task finished.

## OD. Runtime ownership governance (2026-08-09) — DONE, before any pass-registry code

Governance-only slice, landed ahead of the rest of this change's tasks per
explicit user direction: "the ownership governance should happen BEFORE new
sidecar passes/backends are added." No sidecar code touched by this section.

- [x] OD0 Audited before editing: read `CLAUDE.md`'s existing "Duplication
      Prevention" section, this change's own proposal/design, this change's
      `acp-sidecar-tool-registration` spec, `canonical-rerank-executor.ts`,
      `graph-analysis-runner.ts`, `router-matrix.ts`/`query-router-4x4.ts`,
      `ACPToolRegistry.ts` — all already confirmed live earlier this session,
      reused rather than re-verified to conserve context budget.
- [x] OD1 Extended `CLAUDE.md`'s existing "Duplication Prevention" section
      with a new "One Canonical Runtime Owner Per Capability" subsection —
      the classification vocabulary (`CANONICAL_OWNER`/`BACKEND`/`ADAPTER`/
      `EXPERIMENT`/`COMPATIBILITY`/`FIXTURE_ONLY`/`DEAD`), the "search →
      classify → extend, don't create a peer owner" rule, explicit
      prohibitions (duplicate RRF votes, duplicate canonical writers,
      duplicate `representation_id`s, duplicate dispatchers, duplicate ACP
      tools, duplicate AST identity authorities, sidecars created just
      because a library exposes an API), and the baseline/new-violation
      distinction. Extended the existing section rather than creating a
      parallel one — same governance topic.
- [x] OD2 Added the `runtime-owner-deduplication` OpenSpec capability
      (`specs/runtime-owner-deduplication/spec.md`, 5 requirements) to this
      change — cross-cutting, not an NLP implementation detail, per explicit
      direction.
- [x] OD3 Created `docs/architecture/runtime-ownership-registry.json`
      (schema `atlas.runtime-ownership.v1`). Populated **only** from
      repository evidence already gathered live this session — `graph_analysis`
      (owner: `graph-analysis-runner.ts::runGraphAnalysis`, 4 proven
      backends, 4 known-duplicate entries classified DEAD/FIXTURE_ONLY/
      COMPATIBILITY), `rerank` (owner: `canonical-rerank-executor.ts`, 13
      unclassified peer files listed, not silently assumed safe), `structural_extraction`
      (canonical contract `AstUnit`/`atlas_ast_nodes` vs. current producer
      `treesitter-chunker` kept distinct), `lexical_exact` (owner:
      `router-matrix.ts`), `acp_sidecar_tools` (owner: `ACPToolRegistry.ts`).
      `semantic_768`'s owner recorded as `UNKNOWN`/`unproven: true` —
      **not guessed**, per explicit instruction, since this session never
      independently confirmed which service generates it in production.
- [x] OD3b Created `docs/architecture/runtime-ownership-baseline.json` — the
      baseline/new-violation distinction the user identified as the critical
      missing piece ("without it the first ownership CI run will discover
      all the architectural debt you already know exists and either fail
      forever or tempt the agent into a giant cleanup"). Lists the 13
      unclassified reranker files and 4 graph_analysis duplicates as
      `tolerated` — known debt, not failures.
- [x] OD4 Created `scripts/atlas/audit-runtime-ownership.mjs` — mechanical
      checks only (schema version recognized, no duplicate capability IDs,
      no entry double-classified as both `CANONICAL_OWNER` and a
      backend/duplicate, baseline-aware new-vs-known-existing distinction).
      Does not attempt the more ambitious checks from the original brief
      (ACP tool name uniqueness, `FeatureRegistry` ID uniqueness, RRF
      fusion-vote counting) — those require registries/integrations not yet
      proven to exist this session; building checks against unconfirmed
      systems would itself violate this governance layer's own "don't guess"
      rule. Extending the script once those systems are confirmed is a
      follow-up task, not done here.
- [x] OD5 Audit output format implemented per spec:
      `schema_version, status, capabilities_checked, violations, warnings,
      known_existing, not_proven`.
- [x] OD6 Added `npm run atlas:audit:ownership` (points to
      `node ../scripts/atlas/audit-runtime-ownership.mjs` from
      `sveltekit-frontend/`, matching this repo's existing `atlas:*` script
      naming convention).
- [x] OD7 `scripts/atlas/audit-runtime-ownership.test.mjs` — runnable-script
      convention (matching `qdrant-parity-repair.test.mjs`), not vitest,
      since `scripts/atlas/*.mjs` in this repo run standalone. Covers the 4
      required minimum cases (one owner + backends passes; two
      `CANONICAL_OWNER` entries for one capability fails; a baseline-listed
      item is `known_existing` not a violation; an item not in the baseline
      is a new violation) via a pure reimplementation of the audit's core
      check, plus a 5th cross-check that runs the real script against the
      real live repo registry to catch drift between the test's
      reimplementation and the actual logic. **Live run 2026-08-09: 6/6
      cases PASS.**
- [x] OD8 This section itself is the OpenSpec task checkpoint requested —
      placed before section 0 (pre-flight) rather than after, so it's
      structurally impossible to reach the sidecar-implementation gates
      without this section already being visible as done-or-not.

**OD-Result (2026-08-09, live)**: `npm run atlas:audit:ownership` from
`sveltekit-frontend/` → `status: 'PASS'`, `capabilities_checked: 6`,
`violations: []`, 1 `known_existing` entry (the 13 unclassified reranker
files, correctly recognized as baseline debt not a new violation), 1
`not_proven` entry (`semantic_768`, correctly flagged rather than guessed).

**Explicitly not done in this slice** (per hard scope): no reranker files
consolidated or deleted, no PageRank code modified, no graph algorithm
behavior changed, no retrieval scoring/RRF/Qdrant/AST-identity changes, no
sidecar migration, no promotion of CheiRank/k-core/betweenness. Graph status
unchanged: PageRank/Louvain/Leiden/CheiRank/k-core remain exactly
`RUNTIME_SMOKE_PROVEN`, not re-evaluated or promoted by this governance work.

## 0. Pre-flight (do this before any pass-registry code)

- [x] 0.1 Rebuild `docker/miniforge-nlp-sidecar` and hit its `/health`
      endpoint live — confirm `treesitterChunker.available: true` (the
      Dockerfile already lists `treesitter-chunker` as a pip dependency and
      the source already probes for it, but this has not been verified live
      in a running container this session). If false, diagnose why
      (import name mismatch, install failure) before proceeding — do not
      build pass-registry work on an assumption.
- [ ] 0.2 Read `sveltekit-frontend/src/lib/server/nlp/miniforge-nlp-sidecar.ts`
      and its 22 dependent files in full. Confirm the existing
      `NlpAnalyzeRequest`/`NlpAnalyzeResponse` contract's exact shape and
      every distinct `extractionMode` value currently in use, so the
      additive pass-registry extension (task 1.1) doesn't collide with or
      break any of them.
- [ ] 0.3 Read `openspec/changes/parent-atlas-retrieval-lod-algorithm-taxonomy/`
      in full — it owns the 5-domain classification and
      `ExperimentFeatureMatrix` this change's `control5` slots into. Don't
      redefine the taxonomy here.
- [ ] 0.4 Read `openspec/changes/parent-atlas-semantic-768-canonical-contract/`
      in full — confirms which service actually owns `semantic_768`
      generation before this change's semantic-card work assumes it can call
      it directly.
- [x] 0.5 Add a read-only bind mount to
      `docker/miniforge-nlp-sidecar/docker-compose.yml`
      (`../..:/workspace:ro` or equivalent — confirmed live 2026-08-09 that
      none currently exists). Required before any structural pass that reads
      files from disk (as opposed to inline request content) can work at all.
- [ ] 0.6 Read `sveltekit-frontend/src/lib/server/retrieval/router-matrix.ts`
      and `query-router-4x4.ts` in full — confirm `lexical_exact`'s current
      live behavior before deciding whether `lexical.rg_evidence` (design.md
      D7) is needed at all, and if so, exactly what it should and should not
      overlap with.
- [ ] 0.7 Read `src/lib/server/services/knowledge-search/ACPToolRegistry.ts`
      in full — confirm the registration API shape
      (`name, description, category, inputSchema, outputSchema, examples`,
      `supportsDryRun`) before designing the coarse-grained sidecar tool
      wrappers (design.md D8).

**Sequencing boundary (2026-08-11)**: packet-level NLP can start once the
preflight contract audit is complete. Document-root / tree-dependent
promotion stays blocked until the duplicate-root / idempotency issue in the
tree-lineage work is closed.

## 1. AnalysisPassResult envelope + pass registry wiring (NLP1)

- [x] 1.1 CORRECTED 2026-09-03 (found while working `parent-atlas-search-classifier-sidecar` task
      2.0) — this checkbox was stale. `AnalysisPassResult` dispatch is fully wired and live:
      `python/miniforge_nlp_sidecar.py::_build_pass_results()` (~line 1794) dispatches all 7 pass
      families (structural/lexical/linguistic/semantic/sequence/rerank/grounded) via an `add_pass()`
      helper, called from `_analyze()` and populated onto `AnalyzeResponse.pass_results`
      (snake_case on the wire; matches the TS `AnalysisPassResult` type per design.md D1). Read the
      code directly, not assumed — this task is done, not open.
- [x] 1.2 CORRECTED 2026-09-03 — confirmed by code inspection: `_build_pass_results()` line 1803-1805
      returns `[], [], [], [], None, None` immediately when `req.passes` is empty and
      `grounded_extraction_required` is falsy — the existing `extractionMode`-only request shape (no
      `passes` field) hits this early-return and produces zero `pass_results`, i.e. byte-identical to
      pre-change behavior by construction. Not independently live-tested against a running server in
      this session — the code-level guarantee is confirmed, a live HTTP round-trip proof is not.

## 2. Structural pass (NLP2)

- [ ] 2.1 Wire `treesitter_chunk` pass to emit `AstUnit` records matching
      `atlas_ast_nodes`' live schema exactly (field names verified via `\d
      atlas_ast_nodes` in this change's design.md — don't re-derive from
      scratch). Confirm no `packet_key` is ever written at this stage. **Schema
      alignment reconciliation 2026-09-20:** the live sidecar emits all
      mapped structural evidence fields and the revised audit now classifies
      the remaining database/canonical-writer fields rather than mislabeling
      them as sidecar omissions (`AST_UNIT_SCHEMA_ALIGNMENT_PROVEN`, review
      required 0). `structural_key`, `repo_id`, workspace/parent identity,
      normalized/source-content hashes, supersession, source-ref key, and
      database timestamps remain the responsibility of the existing canonical
      materializer; the sidecar remains evidence-only and no second AST writer
      is introduced. The checkbox stays open because canonical materialization
      itself is still source-authority gated. Receipt:
      `docs/reports/nlp-sidecar-ast-schema-alignment-v1.json`.
- [x] 2.2 Live-verify against a real file: run the pass, inspect the
      `AstUnit` output, confirm `parser_revision`/`grammar_revision` are
      populated (needed for the "swap the producer later" guarantee in
      design.md D2). **PROVEN 2026-09-20:** `npm run atlas:docs:nlp:ast-runtime`
      analyzed `scripts/atlas/audit-pgvector-schema.mjs` through the live
      `:8095/analyze` endpoint; 9/9 checks passed, including source/ref and
      revision preservation, non-empty parser/grammar revisions, structural
      AstUnit emission, no packet key, and `canonical_authority=false`.
      Receipt: `docs/reports/nlp-sidecar-ast-runtime-v1.json`. This is a
      read-only sidecar proof, not canonical `atlas_ast_nodes` materialization.

## 3. Linguistic pass (NLP-adjacent, spaCy)

- [ ] 3.1 Wire the `spacy` pass scoped to comments/docstrings/errors/query
      text only (per design.md D3) — explicitly exclude source identifiers
      from the input set. **Implementation corrected 2026-09-20:**
      `python/miniforge_nlp_sidecar.py` now masks code syntax while preserving
      comments, quoted/docstring text, and query-like strings; the pass records
      `input_scope` and `input_hash`. Focused local tests pass, and the live
      sidecar now reflects the source after a targeted restart: `/analyze`
      reports `input_scope=comments_docstrings_strings_query_text`, preserves
      source/ref revisions, and emits no source-symbol entity. The task remains
      open pending the companion linguistic-output check in 3.2.
- [ ] 3.2 Live-verify with one real docstring/comment example, confirm noun
      chunks / dependency edges come back sensible (not garbage on code
      tokens that slipped through the exclusion). **Partial runtime result
      2026-09-20:** source identifiers are absent and the bounded linguistic
      pass succeeds, but `/pos` returned `source=spacy` with empty noun/verb
      arrays; keep this task open until non-empty linguistic output is proven.
      **Runtime diagnosis refresh (2026-09-20, read-only):** the running
      `miniforge-nlp-sidecar` reports spaCy `3.8.16`, but
      `spacy.util.get_installed_models()` is empty and
      `spacy.load('en_core_web_sm')` fails with `E050`; the live `/pos` fixture
      consequently returns empty noun/verb/adjective/adverb/lemma arrays while
      labeling the source `spacy`. This is a missing model-data/runtime-image
      issue, not proof of linguistic output. Official spaCy documentation
      confirms POS tagging requires a trained pipeline loaded with
      `spacy.load(...)` (`https://spacy.io/usage/linguistic-features`). The
      Dockerfile already uses the pinned official `en_core_web_sm==3.8.0` wheel
      with `--no-deps`, but the image has not been rebuilt/replaced because disk
      and runtime churn are intentionally deferred. No database, cache, vector,
      or source writes occurred.
      **Fail-closed guard added 2026-09-20:** `_spacy_pos_tags` now checks
      `Doc.has_annotation("POS")` and returns `source="unavailable"` when the
      blank-English fallback or an otherwise untagged pipeline is active; a
      package import can no longer be reported as successful POS output.
      Focused test: `python/test_miniforge_nlp_sidecar_linguistic_scope.py`
      passes 4/4. The sidecar capability details now distinguish the spaCy
      package import from `spacy_pos`, `spacy_model.installed`, `loaded`, and
      `pos_ready`.
      The running container still requires the pinned model image
      rebuild before live non-empty output can be proven.
      **Bounded FastAPI smoke refresh (2026-09-21, no rebuild):** `npm run atlas:smoke:nlp-classification-fastapi` passed as `NLP_FASTAPI_CLASSIFICATION_PROVEN` with health, `/analyze`, and `/classify` returning 200; the result remained proposal-only (`canonicalAuthority=false`, `writesPerformed=false`, `promotionAuthorized=false`). A direct live `/pos` fixture still returned `source=spacy` with empty noun/verb/adjective/adverb/lemma arrays, and the container probe confirmed spaCy 3.8.16 with `modelInstalled=false`, empty pipeline, and `posReady=false`. This does not close 3.1/3.2; the remaining fix is the pinned model image/runtime proof, not more classifier code.
      **Runtime-process drift check (2026-09-21, read-only):** the running container has the repository mounted read-only and a fresh in-container import of `_spacy_pos_tags` returns `source=unavailable` with `modelInstalled=false`; the already-loaded HTTP worker still returns `source=spacy` with empty arrays. This indicates the worker process predates the fail-closed guard or has stale module state. A bounded sidecar restart is sufficient for revalidation; an image rebuild is not required for this diagnosis. No restart was performed in this audit.
      **Restart revalidation (2026-09-21):** restarted only `miniforge-nlp-sidecar` (no image rebuild, no data-store writes); health returned `healthy` and the same `/pos` fixture now returns `source=unavailable` with empty arrays. The fail-closed runtime behavior is therefore proven. Non-empty linguistic output remains open until the pinned `en_core_web_sm` model is present and produces annotations.
      **Model-source audit (2026-09-21, read-only):** `docker/miniforge-nlp-sidecar/Dockerfile` already declares the pinned official `en_core_web_sm-3.8.0` wheel after the `spacy==3.8.16` install, while the active image/runtime has no installed model. Compose mounts source and classifier data only; no spaCy model directory is mounted. This confirms the remaining gap is stale/unrebuilt image content, not an unpinned dependency or missing application wiring. Rebuild remains deferred.
- [ ] 3.3 **PA-NLP-001 PyTorch POS/token-classification challenger** — preserve the earlier Parent Atlas requirement as a separate executor of the linguistic-POS assertion lane. The current implementation remains spaCy/reference-only; no PyTorch POS model or live GPU POS endpoint is present in the current sidecar. When implemented, it must report model ID/revision, CUDA/device status, exact source-text offsets, versioned assertions, and an explicit CPU fallback; compare against the spaCy reference on one frozen, reviewed fixture. It must not replace Tree-sitter, invent source identity, or promote ontology/cache state. This task is intentionally open and does not block the spaCy reference contract from being proven independently.

## 4. AST-conditioned semantic card wiring (NLP3)

- [ ] 4.1 Wire the `SemanticCodeCard` assembler (`AstUnit` + linguistic
      facts → bounded card text) per design.md's example shape. The schema
      already exists in `sveltekit-frontend/src/lib/server/analysis/nlp-feature-compiler.ts`;
      this task is to connect the producer and consumers, not invent a new
      representation.
- [ ] 4.2 Confirm the card is sent as embedding *input* to whatever service
      task 0.4 identified as the canonical `semantic_768` owner — do not
      re-implement embedding generation in this sidecar.
- [ ] 4.3 Live-verify: one real function → card → `semantic_768` vector,
      confirm the `AstUnit` fields remain independently queryable afterward
      (not just recoverable by decoding the vector).

## 5. HMM sequence pass (NLP4)

- [ ] 5.1 Define the discrete observation vocabulary (per design.md D4) and
      an observation-builder that derives it from other passes' outputs.
- [ ] 5.2 Wire `hmmlearn` `CategoricalHMM` — Baum-Welch (offline training)
      and Viterbi (online decoding), CPU-only. Confirm no GPU device is
      requested for this pass.
- [ ] 5.3 Live-verify against a small synthetic `RouteTrace` history —
      confirm Viterbi produces a plausible state sequence, not garbage.

## 6. Reranker ownership audit (must complete before section 7)

- **RERANKER-OWNER-CENSUS-01 (2026-09-20, read-only):** Added `scripts/atlas/audit-reranker-owner-census-v1.mjs` and generated `docs/reports/reranker-owner-census-v1.json`. The bounded source census covers all 14 retrieval reranker modules: `canonical-rerank-executor.ts` remains the sole declared canonical owner; the other 13 are live secondary adapters/lanes with runtime callers, not new canonical owners. No module is classified orphaned or test-only in the current source roots. The report records checksums and caller paths, with `canonicalAuthority=false`, `writesPerformed=false`, and `promotionAuthorized=false`. This closes the audit evidence portion of 6.1/6.2 but does not authorize MiniLM/Mixedbread wiring; section 7 remains gated on explicit tier ownership and focused tests.

- [x] 6.1 Classify all 14 files in
      `sveltekit-frontend/src/lib/server/retrieval/*reranker*` +
      `canonical-rerank-executor.ts` as live/orphaned/superseded — grep for
      actual call sites of each, not just existence. `canonical-rerank-executor.ts`
      is already confirmed canonical (imports `blendScores`/`RuntimeReranker`
      from `runtime-reranker.ts`); classify the other 13 explicitly.
- [x] 6.2 Record the classification in this file (or a dedicated audit
      section) before task 7 starts — do not proceed to wiring new reranker
      tiers until this is done, matching this session's established
      "audit before code" discipline.

## 7. MiniLM + Mixedbread reranker tiers (NLP5) — blocked on section 6

- [ ] 7.1 SUPERSEDED_BY_EMBEDDINGGEMMA_768_ARCHITECTURE / DO_NOT_WIRE (operator direction 2026-09-20: MiniLM and MS MARCO are retired from the Parent Atlas runtime; no runtime reranker, embedding, vote or matrix producer; see `parent-atlas-retrieval-staging-planes` SPINE-04). Original text follows, kept for history: Wire MiniLM (`ms-marco-MiniLM-L6-v2`, `sentence-transformers`
      `CrossEncoder`) as `RERANK_FAST` behind `canonical-rerank-executor.ts`
      — for the ~30-50 candidate tier, not a new standalone file.
- [ ] 7.2 SUPERSEDED_BY_EMBEDDINGGEMMA_768_ARCHITECTURE / DO_NOT_WIRE (operator direction 2026-09-20, same decision as 7.1: no runtime reranker, embedding or vote from Mixedbread; existing default-off module stays COMPATIBILITY pending archive). Original text follows, kept for history: Wire Mixedbread (`mxbai-rerank-base-v2`) as `RERANK_DEEP`, disabled
      unless explicitly requested — for the ~8-20 candidate tier.
- [ ] 7.3 Live-verify both against a real candidate set, confirm scores are
      sane and the existing canonical rerank cache/fallback behavior
      (24h CrossEncoder cache, XGBoost fallback per
      `canonical-rerank-executor.ts`'s existing docstring) still works
      correctly with the new backends plugged in.

## 8. NetworkX/cuGraph parity fixture (NLP6)

- [ ] 8.1 Cross-reference `openspec/changes/parent-atlas-gpu-graph-vector-substrate/`
      — this task may already be covered there (its Gate 5 covers cuGraph
      k-core/betweenness parity). Do not duplicate; extend if a BFS/SSSP
      parity fixture doesn't already exist there.

## 9. FeatureCompiler: pass results → ExperimentFeatureMatrix + control5 wiring (NLP7)

- [ ] 9.1 Wire the compiler that takes a set of `AnalysisPassResult`s for
      one candidate and produces one `ExperimentFeatureMatrix` row +
      optional `control5` summary, per design.md D6. Coordinate with
      `parent-atlas-retrieval-lod-algorithm-taxonomy` for the canonical
      column set — don't invent a second one. The TS contract already exists;
      this task is to complete the producer/consumer path around it.

## 10. LangExtract gating (NLP8)

- **LANGEXTRACT-ORNITH-CLASSIFIER-FANOUT-01 refresh (2026-09-20, read-only):** `scripts/atlas/audit-langextract-ornith-classifier-fanout-v1.mjs` reaches the sidecar boundary but fails closed with `SOURCE_REVISION_UNKNOWN` and `NO_GROUNDED_ENTITY_FIXTURE`; status `BOUNDARY_REACHABLE_LINEAGE_BLOCKED`, proof level `PARTIAL_PROVEN`. This confirms service wiring is not sufficient for grounded extraction or ontology admission. No source, database, vector, cache, or Graphify writes occurred. Report: `docs/reports/langextract-ornith-classifier-fanout-v1.json`.
- **LANGEXTRACT-ORNITH-CLASSIFIER-FANOUT-01 bounded fixture proof (2026-09-21, read-only):** the same existing audit now uses a deterministic synthetic/public fixture with `source_revision=sha256:<fixture-text>`, explicit workspace revision, and grounded entity text. Live `/v1/models`, sidecar health, `/analyze`, classifier, grounded pass, and OAK health all passed: `BOUNDARY_FANOUT_PROVEN`, `BOUNDED_LIVE_PROVEN`, blockers `[]`. This proves the bounded transport/grounding/fanout contract only; it does not admit ontology rows, source authority, or canonical promotion. Report: `docs/reports/langextract-ornith-classifier-fanout-v1.json`; `canonicalAuthority=false`, `writesPerformed=false`.
- **LANGEXTRACT-CALLER-GATE-01 partial (2026-09-21):** the shared SvelteKit `langextract-client.ts` now fails closed unless callers explicitly pass `groundedExtractionRequired: true` for both text and file extraction. The two live callers (`mcp-langextract.ts` and Whisper transcription) pass the flag explicitly. A focused Vitest guard proves neither path reaches `fetch` without authorization. Python sidecar analysis already gates `_grounded_extractions()` on `grounded_extraction_required`. Direct MCP tool handlers and native heuristic extraction remain separate explicit/compatibility surfaces and require a follow-up caller census before 10.1 can be closed. No writes or canonical promotion.
- **LANGEXTRACT-CALLER-GATE-01 PROVEN (2026-09-21, static + focused test):** the four direct MCP handlers (`langextract:legal`, `langextract:evidence`, `langextract:file`, `langextract:custom`) now require `grounded_extraction_required=true` in both their advertised schemas and handler guards before any `/extract` or `/extract/file` request. The shared client and Python analysis path enforce the same boundary. Native regex extraction remains explicitly classified as compatibility-only and is not presented as official LangExtract grounding. Focused client guard test passed 1/1; no network call occurs without authorization. **Task 10.1 is now evidence-complete for the official LangExtract paths.**

- [x] 10.1 Confirm LangExtract is never called unless
      `groundedExtractionRequired: true` is explicitly set, across every
      code path that could reach it (including the 22 files found
      referencing the sidecar in task 0.2 — some may already call
      LangExtract-adjacent code unconditionally; audit, don't assume).

## 11. ACP/A2A tool registration

- [x] 11.1 Register 2-3 coarse-grained ACP tools
      (`analyze_structural`, `analyze_semantic_card`, `rerank_candidates` —
      or similar, exact names TBD at implementation time) in
      `ACPToolRegistry.ts`, each wrapping one or more sidecar passes behind
      an `inputSchema` that accepts a `passes` selector. Confirmed live
      2026-08-09: zero existing registrations reference the sidecar — this
      is new, not a fix to something broken.
      Note (2026-09-03): `openspec/changes/parent-atlas-search-classifier-sidecar/tasks.md` task 3
      adds a 4th ACP tool, `nlp:classify_domain`, alongside these 2-3 — that task does not close
      this one; the `analyze_structural`/`analyze_semantic_card`/`rerank_candidates` tools here
      remain open and unimplemented.
      **Reconciled 2026-09-21:** the current owner already exposes the equivalent
      coarse-grained tools `nlp:capabilities`, `nlp:analyze`, and `nlp:ast-chunk`
      through `ACPToolRegistry.ts`; `nlp:analyze` selects multiple sidecar passes
      through one schema instead of creating one tool per pass. The existing live
      receipt `docs/reports/acp-nlp-sidecar-tools-live-proof-v1.json` proves registry
      discovery, a clean AST fixture, and dry-run planning. No duplicate
      `analyze_structural`/`analyze_semantic_card`/`rerank_candidates` owners were added.
- [x] 11.2 Confirm the new tools appear via `GET /api/acp/tools` and are
      callable via `POST /api/acp/execute` against the live sidecar — one
      real end-to-end call per registered tool, not just schema validation.
      **PROVEN 2026-09-21:** `scripts/atlas/acp-nlp-sidecar-http-live-proof-v1.mjs`
      exercised the running SvelteKit routes: `GET /api/acp/tools` returned 200
      with all three tools, `GET /.well-known/agent.json` returned 200 with the
      NLP skill, and real POST calls to `nlp:capabilities`, `nlp:analyze`, and
      `nlp:ast-chunk` all returned success; AST output was
      `atlas.ast.evidence.v1`. Receipt:
      `docs/reports/acp-nlp-sidecar-http-live-proof-v1.json`. The proof is
      read-only at the canonical boundary (`canonicalAuthority=false`,
      `promotionAuthorized=false`, `writesPerformed=false`).
- [x] 11.3 Check whether `.well-known/agent.json` (A2A AgentCard) needs an
      update to reflect the new capabilities — read
      `src/routes/.well-known/agent.json/+server.ts` first to see whether it
      already derives its capability list from `ACPToolRegistry` (in which
      case 11.1 covers this automatically) or needs a separate edit.
      **PROVEN 2026-09-21:** the AgentCard did not derive skills from
      `ACPToolRegistry`; it now explicitly advertises the authenticated
      `nlp-sidecar-analysis` ACP capability while preserving the read-only,
      noncanonical boundary. No raw `:8095` endpoint is exposed in the card.

## 12. POS / concept tagging lane (NLP9)

- [x] 12.1 Add the deterministic POS / concept-tagging packet contract with
      explicit lineage fields (`packet_key`, `source_ref`, `source_revision`,
      `representation_id`, `representation_revision`, `producer_id`,
      `producer_revision`, `feature_revision`, and optional
      graph / ontology / model provenance).
- [x] 12.2 Wire the packet builder into the app route and MCP tool surface so
      the lane can be invoked from the runtime without becoming a second
      truth owner.
- [x] 12.3 Preserve ontology-linked tuple identity under participant reorder
      and keep ranking signals as evidence, not canonical identity.
- [x] 12.4 Cap MCP tool fanout at 3 for this lane and reject missing revision
      lineage.
- [x] 12.5 Live-verify the lane against real packet evidence and record the
      provenance / revision receipt before promoting it beyond test coverage.
      Proof report: `docs/reports/pos-concept-tagging-lane-proof.json`
      built from a live `atlas_packets` row plus its local source file.

## 12. Docs correction

- [x] 12.1 **Done, 2026-08-23.** Fixed `docs/architecture/PACKET-COMPILER-STAGES.md`'s Stage 1
      heading ("AST-Grep (Structural Extraction)" → "TreeSitter Chunker (Structural Extraction)")
      and the matching `-- Stage 1: AST-Grep` SQL comment above `ast_symbols text[]`, to reflect
      the layered ownership already established in the file's own Dependency Chain summary
      (line 13 onward): TreeSitter Chunker is the structural-extraction owner (boundary IR →
      `atlas_ast_nodes`); ast-grep is a separate structural query/rewrite stage
      (`scripts/atlas/phase1.5-ast-grep-extraction.mjs`, confirmed live via `grep` to genuinely
      call ast-grep, not TreeSitter Chunker) that consumes those facts to produce this column's
      `ast_symbols[]`. Added an explicit "Layered ownership" note in the Stage 1 section body so
      the two names on the page read as two layers of one stage, not two rival Stage-1 owners.

## 14. External API surface reference (2026-08-23 — plain-URL extracted contracts)

Non-code, reference-only appendix. Captures a URL-extracted API-surface audit the user did
against live upstream docs for every tool this change (and its siblings — see 3-13 above) touches,
so future sessions don't have to re-derive method signatures from memory. Nothing here implies any
of these APIs is wired yet — cross-reference against this file's own STATIC_OWNER/live-verify
sections above before trusting an integration claim.

- [x] 14.1 Recorded. PostgreSQL 18 native FTS (`tsvector`/`tsquery`/`to_tsvector`/`ts_rank_cd`) is
      confirmed the live lexical owner for AST evidence
      (`POSTGRES_FTS_AST` — matches this repo's own live-verified naming, see
      `parent-atlas-transport-memory-boundaries`/`parent-atlas-retrieval-fusion-reachability`).
      ParadeDB's `pg_search` extension is a **separate, not-installed** product that adds a real
      BM25 index access method (`USING bm25(...)`, `paradedb.score(id)`) on top of Postgres —
      PostgreSQL's own docs do not claim BM25 scoring for native FTS, and ParadeDB's docs say so
      explicitly. Do not rename `POSTGRES_FTS_AST` artifacts to anything with "BM25" in the name
      until `pg_search` (or an equivalent real BM25 scorer) is actually installed and proven live.
      GIN is confirmed a retrieval (posting-list/candidate-lookup) structure, not a ranker —
      `ts_rank_cd` is the separate ranking step. `pg_trgm` stays scoped to fuzzy/spelling fallback,
      not primary lexical ownership.
  - Sources: `postgresql.org/docs/18/textsearch.html`, `postgresql.org/docs/18/gin.html`,
    `postgresql.org/docs/18/pgtrgm.html`, `paradedb.com/learn/search-in-postgresql/bm25`,
    `github.com/paradedb/paradedb/blob/main/pg_search/README.md`
- [x] 14.2 Recorded. ast-grep's own docs mark the Node.js/NAPI programmatic API "experimental" —
      confirms this change's existing preference for the CLI+YAML rule surface
      (`pattern`/`kind`/`regex`/relational `inside`/`has`/`precedes`/`follows`/composite
      `all`/`any`/`not`/`matches`, `ast-grep run --json` for structured output) as the primary
      integration surface, NAPI/Python bindings reserved for bounded programmatic extraction only.
  - Sources: `ast-grep.github.io/guide/pattern-syntax`, `ast-grep.github.io/reference/rule`,
    `ast-grep.github.io/reference/api`, `ast-grep.github.io/reference/cli`
- [x] 14.3 Recorded. Tree-sitter's `SyntaxNode` field-aware traversal (`childForFieldName`,
      `descendantsOfType`, byte/position offsets) is the same coordinate surface this change's AST
      corpus-parity work (`node-tree-sitter-ast-provider.ts`) already depends on — confirms
      `childForFieldName('value')` is the correct, docs-sanctioned way to resolve a
      `variable_declarator`'s RHS kind (the exact fix already landed this session for the
      declarator-kind misclassification bug).
  - Source: `tree-sitter.github.io/node-tree-sitter/interfaces/SyntaxNode.html`
- [x] 14.4 Recorded. simdjson's On-Demand API is forward-only, iterator-style, values consumed
      once, source buffer must stay alive — confirms the existing repo rule (Wire Format Layering
      Rule, `claude.md`) that simdjson is for NDJSON/manifest/descriptor JSON (Graphify NDJSON, ACE
      packet descriptors, Qdrant payload exports), never for numeric matrices like `semantic_768`
      rows, which must stay in Arrow IPC / raw mmap / CUDA tensors.
  - Sources: `github.com/simdjson/simdjson/blob/master/doc/basics.md`,
    `github.com/simdjson/simdjson/blob/master/doc/ondemand_design.md`
- [x] 14.5 Recorded (adjacent subsystem, not this change's scope, but same audit pass). NetworkX's
      backend-dispatch model (`backend='cugraph'`, `NETWORKX_BACKEND_PRIORITY`,
      `nx_cugraph.from_networkx`) frames the correct ownership split for any future graph-algorithm
      GPU work: NetworkX stays the algorithm-semantics reference implementation, `nx-cugraph`/
      `cugraph` is an accelerated executor selected by config, never a second algorithm surface.
      `cugraph.pagerank`/`cugraph.leiden` and cuVS CAGRA's `search(..., filter=bitset)` param are
      concrete future integration points — the CAGRA filter bitset maps directly onto a future
      Valkey-backed `CandidateOrdinal` membership bitmap. XGBoost's `QuantileDMatrix(..., qid=...,
      group=...)` + `objective='rank:ndcg'` is the confirmed ranking-metadata shape for any future
      GPU learning-to-rank gate (`device='cuda', tree_method='hist'`).
  - Sources: `networkx.org/documentation/stable/backends.html`,
    `docs.rapids.ai/api/cugraph/stable/nx_cugraph`,
    `docs.rapids.ai/api/cugraph/stable/api_docs/api/cugraph.cugraph.pagerank`,
    `docs.pytorch.org/tutorials/intermediate/pinmem_nonblock.html`,
    `docs.pytorch.org/docs/stable/generated/torch.sparse.mm`,
    `docs.rapids.ai/api/cuvs/stable/python_api/neighbors_cagra`,
    `docs.rapids.ai/api/cuvs/stable/python_api/distance`,
    `xgboost.readthedocs.io/en/stable/python/python_api.html`,
    `xgboost.readthedocs.io/en/stable/gpu`,
    `xgboost.readthedocs.io/en/latest/python/examples/learning_to_rank.html`
- [x] 14.6 Recorded. `yq` stays scoped to YAML inspection/merge/transform for `.okf.yaml` config
      (`docs/deep-research-task-schema.okf.yaml`,
      `sveltekit-frontend/src/lib/server/okf/mastra-workflows.okf.yaml` — both confirmed to exist
      live via `find`), never the authoritative schema validator — that role stays with Zod
      (TypeScript boundary) / typed Python models (sidecar boundary).

## 13. Acceptance fixture

## 15. Docker dependency reproducibility audit (2026-09-10)

- [x] RAPIDS `atlas-gpu-8098` has an explicit runtime requirements file and CUDA-aware health check. The first CUDA 12.6/PyTorch 2.7.1 replacement image built, but its disposable smoke test failed with a cuGraph/cuSolver ABI conflict caused by the pip-bundled NVIDIA libraries; this hypothesis is rejected for the RAPIDS image.
- [ ] The running RAPIDS container remains unchanged; its live health evidence is `torchAvailable:false`. A compatible PyTorch/RAPIDS ABI must be proven in a separate image before any container replacement. The attempted CUDA 12.9/PyTorch 2.8.0 rebuild was interrupted before completion.
- [ ] GPU executor ownership remains duplicated across the Docker `atlas-gpu-8098` surface, the WSL2 `atlas-rapids-cu13` environment, and Python sidecars sharing port 8098. Classify one primary executor before routing or replacing any runtime.
  - **Runtime/image reconciliation (2026-09-20, read-only):** active `atlas-gpu-8098:26.08-cuda12-py3.13` runs `/opt/conda/bin/python` with `cuvs` importable but `torch` unavailable; `atlas-gpu-8098:repro-v1` and `repro-v2` are Conda `/opt/conda` CUDA 12.9.1 challenger images with zero containers and are not replacements. Active decoder is `atlas-neural-decoder:torch2.13.0-cu132`; unused `torch2.8.0-cu128` is not promoted. Active Go Retrieval is `legal-ai-go-retrieval:latest`; `deeds-web-app-go-retrieval-service:latest` has zero containers. The WSL2 Ubuntu distro is stopped; Docker Desktop WSL2 is running. **No replacement or promotion proof exists; task remains open.**
  - **Live listener clarification (2026-09-20, read-only):** host port `8098` has exactly one running owner, container `atlas-gpu-8098`; `/health` returns `cudaAvailable=true`, `torchAvailable=false`, `executionOnly=true`, and `writes.postgres/qdrant/valkey=false`. Static WSL2/sidecar references remain in `python/atlas_rapids_sidecar.py`, `python/atlas_cuvs_resident_sidecar.py`, and `ATLAS_RAPIDS_SIDECAR_PORT=8098` code paths, but no second live `8098` container/process was observed. This proves live port ownership only; it does not prove the WSL2 Conda environment or PyTorch/RAPIDS ABI, so the ownership task remains open.

- [x] Traced SearXNG's entrypoint to `/usr/local/searxng/.venv/bin/granian`; its application Python environment contains 41 distributions. Added explicit `--python-interpreter=container:/absolute/path` selection to the all-container audit, avoiding an empty system-interpreter inventory being mistaken for the application's dependency set.
- [ ] SearXNG omits both pip and packaging from that runtime; installed inventory is proven, dependency consistency and rebuild locking remain unproven. The audit does not install package managers into running containers.

- [x] Added opt-in `--runtime-python-check` across all 25 running containers, preserving installed distribution versions and pip-check output. Seven default Python interpreters were discovered; Miniforge NLP, neural decoder, Docling, and Image Synthesis pass pip check.
- [ ] RAPIDS 8098 requires manager reconciliation: pip reports CUDA13 requirements against the Conda CUDA12 environment, while Conda records confirm libcudf/libcuvs/libcugraph/librmm are installed. Do not treat those pip-only missing-library messages as authority to replace the Conda stack. Live `/health` separately reports `torchAvailable:false`, so torch-dependent routes remain unproven.
- [ ] RabbitMQ and SearXNG default Python interpreters lack pip; this is not evidence of broken runtime dependencies. Actual application interpreters/virtual environments still require inspection. Installed inventory is evidence, not a portable transitive build lock.

- [x] Expanded discovery from 42 to 53 Dockerfiles by including `*.Dockerfile`; the additional inventory includes Atlas and llama.cpp backend build definitions. Previous 42-file coverage was incomplete.
- [x] Base analysis now resolves declared stage ancestry, `FROM --platform`, global default ARGs, scratch, and registry host ports. Bare external image names remain floating; stage descendants retain their external-base provenance. Five regression tests covering image and Python pin classification pass.
- [ ] Newly discovered backend image definitions require image-specific review; unresolved argument expansions remain fail-closed. Default-ARG pin evidence does not admit arbitrary build-time overrides or GPU compatibility.

- [x] Pinned Docling Whisper to installed Git commit `04f449b8a437f1bbd3dba5c9f826aca972e7709a`, verified through the running container's `direct_url.json`. No packages changed at runtime.
- [x] Hardened requirements classification against bare names, wildcard pins, mutable VCS references, unhashed URLs, and unresolved nested requirement files; focused regression tests pass. TOML manifests now require structured review instead of receiving an unsupported exact-pin verdict.
- [ ] Dependency build reachability remains unproven: the current six container-scoped manifests are selected by directory only. Zero loose manifests in that subset does not establish coverage of every Docker build or transitive locking.

- [x] Froze 15 additional Compose references across six existing Compose files to digests observed from the actual running Qdrant, Neo4j, SearXNG, SeaweedFS, RabbitMQ, CouchDB, and Caddy images. Existing tags retained; no upstream-version selection or container recreation. All six Compose configurations validate, and all 15 pins reconcile to the running-image receipt.
- [ ] Current Compose coverage is 44 digest pins, 17 floating references, and 15 tag-only references; unresolved image families and local build provenance remain open. Repository-wide total is 45 Compose digest pins. These counts supersede earlier census counts without implying runtime upgrades or full reproducibility.

- [x] Corrected runtime image provenance: inspect the container's immutable `Image` ID, never its potentially retargeted configured tag; inventory only running containers. Independent readback checked all 25 containers with zero report mismatches.
- [ ] Running-image recovery remains open: Docker cannot inspect the original image IDs for `miniforge-nlp-sidecar` and `legal-ai-go-embedding`. These are explicitly `IMAGE_INSPECTION_FAILED`, not local-build proof. The other 23 running containers have registry digests. No container recreation or image replacement occurred.

- [x] Audited all repository Dockerfiles and Python dependency manifests with `scripts/atlas/audit-docker-reproducibility-v1.mjs`.
- [x] Confirmed the active `miniforge-nlp-sidecar` has exact direct pins and a clean live `pip check`.
- [x] Added selective `.rgignore` exceptions for Docker/service/Python dependency manifests and the reproducibility receipt; unrelated `*.txt` artifacts remain ignored.
- [ ] Full repository reproducibility remains open: no floating base tags remain in the 42 Dockerfiles; 31 Dockerfiles now resolve to verified digests, while 2 tag-only bases remain (`TensorRT-LLM v0.21.0` unavailable and Platformatic GHCR access denied), 2 bases are build-argument substituted, 2 container-scoped Python manifests still use ranges, and 12 cleanup/operator scripts remain classified in the audit receipt.
- [x] Resolved the `docker/langgraph-synthesis` Dockerfile/manifest CUDA contract mismatch by aligning both to the executable CUDA 12.8 / PyTorch 2.7.0+cu128 stack; the audit now reports zero declaration mismatches.
- [x] Added read-only active-container inventory to the audit: 25 active containers observed, 24 with registry digests and 1 local image with image-ID-only evidence; no container was recreated or replaced.
- [x] Confirmed dependency manifests are selectively searchable with `rg --files docker services scripts python | rg 'requirements|pyproject.toml'`; the broad `*.txt` ignore remains in place for unrelated text artifacts.
- [x] No package, image, container, database, projection, model, or source-data deletion was performed.
- [x] Refined compose analysis to retain all references while separating current external images from archived/fixture definitions and build-backed local images; the audit now reports 76 current external references, 25 archived/fixture references, and 13 build-backed local references.
- [ ] Current compose reproducibility remains open: 22 current external references are floating and 35 are tag-only; these require image-specific admission and digest verification rather than blanket latest-to-current upgrades. Active runtime inventory remains read-only (25 containers, 24 registry digests, 1 local image-ID-only observation).
- [x] Verified the compose audit implementation with `node --check scripts/atlas/audit-docker-reproducibility-v1.mjs` and a fresh read-only run; report checksum and detailed scope classifications are in `docs/reports/docker-reproducibility-v1.json`.
- [x] Removed the active Docling VLM dependency on Ollama/Gemma defaults: `docker/docling-vlm/app.py` now calls the Ornith llama.cpp OpenAI-compatible multimodal endpoint, requires `/props` vision support, and rejects non-Ornith model overrides.
- [x] Updated the root Docling compose service to declare `LLAMA_SERVER_URL`, `VLM_MODEL=ornith-1.5-9b`, and the matching `ORNITH_MMPROJ_PATH`; Ollama remains scoped to embedding/other non-VLM services.
- [x] Static validation passed for the Docling image (`docker buildx build --check`), Python syntax, root Compose configuration, and OpenSpec strict validation. The running Docling container was not rebuilt or restarted.
- [x] Selectively pinned registry-resolved exact-version compose references with tag-plus-digest across the current, development, GPU, test, frontend, and Claude-Mem stacks; compose digest coverage increased from 19 to 30 references without changing running containers.
- [x] Froze the two remaining active container-scoped Python manifests (`docker/docling-vlm/requirements.txt` and `docker/image-synthesis/requirements.txt`) to the exact versions observed in their running containers; the audit now reports zero loose container-scoped manifests.
- [x] Added narrow `.gitignore` exceptions so those active manifests are visible/persistable despite the repository-wide `*.txt` rule.
- [ ] Remaining compose references require separate admission: 22 current floating tags, 25 current tag-only references, local build images, TensorRT-LLM registry access/compatibility, and any image whose registry digest could not be verified because of rate limiting.
- [ ] Rebuild verification for Docling and Image Synthesis is pending Docker Hub access: `docker buildx build --check` reached the pinned base reference but Docker Hub returned HTTP 429 unauthenticated pull-rate-limit; no image build or container replacement occurred.
- [x] Pinned Firecrawl's PostgreSQL base to the verified PostgreSQL 17 manifest digest while retaining `PG_MAJOR=17` for the matching package configuration; Dockerfile digest-pinned bases increased from 31 to 32 and build-argument bases decreased from 2 to 1.
- [ ] Firecrawl Redis remains blocked: the declared `bitnami/redis:8.0.3` tag is absent from Docker Hub, and replacing it with `latest` would be an unapproved compatibility upgrade.

- [ ] 13.1 One end-to-end fixture, zero LLM calls in the default path:
      source file → `AstUnit` (2.1) → linguistic facts on its docstring (3.1)
      → `SemanticCodeCard` → `semantic_768` (4) → HMM observation + Viterbi
      state (5) → MiniLM score (7.1) → `ExperimentFeatureMatrix` row +
      `control5` (9.1). Then re-run the same fixture with
      `groundedExtractionRequired: true` and confirm LangExtract only adds
      grounded evidence — it must not change any structural identity or
      `AstUnit` field from the first run.

      Packet-level NLP work can be accepted independently of the
      document-root/tree-dependent promotion gate. Do not treat this fixture
      as closing duplicate-root / idempotency issues in the tree lineage work.

## 14. `dev:gpu` sidecar-lane audit (2026-09-19, read-only — no code changed)

Trigger: operator asked why `npm run dev:gpu` "doesn't use the treesitter-chunker Python NLP lane" and whether the
ast-grep symbol registry → KMeans → ontology tuples → OAKLIB/NetworkX → 4D manifold → YAML/Postgres bitmap/GIN/btree
chain exists. Evidence below is from live `GET :8095/capabilities`, the launcher/sidecar source, and live Postgres.

| Item | Status | Evidence |
|---|---|---|
| treesitter-chunker in `dev:gpu` sidecar | PRESENT / RUNTIME_SMOKE_PROVEN (premise was wrong) | `dev-gpu-runtime.mjs` launches `launch-miniforge-nlp-sidecar.ps1` (Docker default, v2 facade); live `/capabilities`: `ast.engine=treesitter-chunker`, chunker 4.0.0, importVerified; v2 `/ast/chunk` routes through it (`miniforge_nlp_sidecar_v2.py`). `fixtureVerified:false` on the chunker import probe. |
| ast-grep-py in sidecar | PRESENT | live `astGrepPy` 0.45.3; registry classifies it ADAPTER, separate from chunker |
| Callers of `/ast/chunk` | STATICALLY_REFERENCED | `miniforge-nlp-sidecar.ts`, `ACPToolRegistry.ts`, ~8 `scripts/atlas/*structural*` scripts |
| `atlas_ast_nodes` (structural identity target) | PRESENT | 11,223 rows live; btree indexes on kind/qualified_symbol/path/language/parent |
| NetworkX in sidecar | PRESENT, per-document only | `networkx` owner `entity_graph_metrics`, scope `per_document_entity_graph`; cuGraph/cuVS/nx-cugraph absent (RAPIDS is the separate WSL2 executor, not `dev:gpu`) |
| OAKLIB resolver | PARTIAL | `parent-atlas-ontology-oaklib-fanout-bitmap` 29 done / 7 open; real-oaklib kernel is `python/atlas_oak_kernel.py` (owned by `parent-atlas-ontology-kernel`) — layered, not duplicated |
| Postgres bitmap fanout matview | NOT_PROVEN | drafted + dry-run only (task 4.6 "NOT YET APPLIED", human gate); live `pg_matviews` has no bitmap/fanout view |
| GIN/btree indexing | PARTIAL (corrected 2026-09-20, see 14.6) | `feature_ontology_tuples`: btree only (9 idx, no GIN, no FKs). Symbol registry `atlas_callable_search` has 8 GIN + 6 btree. My first pass only inspected 3 tables and missed it. |
| Unsupervised KMeans over ast-grep symbol registry key/value pairs | NOT_PROVEN (refined, see 14.6) | `atlas_cluster_models` stores KMeans over CHUNK embeddings (`n_chunks`, `source_column`, `centroids`), not symbols; `trace.kag_feature_lookup` for the chain returned 0 results |
| 4D topology manifold w/ coordinates + ranking | PARTIAL | `parent-atlas-topology-representation-admission` 6 done / 18 open; SOM/KMeans coords exist as derived columns, not admitted as ranking schema |
| YAML schema-backed ranking | NOT_PROVEN | not located this pass |

- [x] 14.1 `dev:gpu` banner (`sveltekit-frontend/scripts/startup/dev-gpu-runtime.mjs`) now names the actual
      `treesitter-chunker` dependency and the launcher-selected runtime (`Docker provenance-v2 by default`; local
      Python remains an explicit launcher mode). Static syntax validation passed; startup behavior was unchanged.
- [x] 14.2 CLOSED 2026-09-19 (live probe, read-only): the running `miniforge-nlp-sidecar` container CMD is
      `["python","/app/python/miniforge_nlp_sidecar_oak.py"]`, Entrypoint null — the OAK wrapper is the executed owner, composing
      the v2 facade. `:8095/health` = ok, `treesitter_chunker` 4.0.0 importVerified but `fixtureVerified:false`, `ast_grep` 0.45.3,
      networkx true, cugraph/cuvs/torch false. `/oak/health` = oaklib 0.7.4, `READ_ONLY_SHADOW`, `canonicalAuthority:false`.
      Port ownership: the same :8095 process serves both v2 and OAK routes (no separate `atlas_oak_kernel.py` listener observed).
      Original text: Reconcile sidecar entrypoint: `docker/miniforge-nlp-sidecar/Dockerfile` CMD runs `miniforge_nlp_sidecar_oak.py`
      while the launcher pins `miniforge_nlp_sidecar_v2.py` (local) — NOT verified which one the running container
      executes or how compose overrides it; also confirm the :8095 sidecar vs `atlas_oak_kernel.py` :8095 port ownership.
- [x] 14.3 Verify whether `graphify-trigger-downstream-pipeline.mjs` (spawned by `dev:gpu`) actually invokes symbol
      registry → KMeans → ontology tuples; if not, record the missing hop as its own task instead of assuming it.
      **14.3 MEASURED 2026-09-19 (read-only; does not close the trigger-script question, records the bridge state):**
      | Hop | Live evidence | Status |
      |---|---|---|
      | `atlas_ast_nodes` | 11,223 rows; `tree_node_id` and `qualified_symbol` on all rows; `source_ref_key` 7,721; `source_revision` 48; `workspace_id` 156; 4 distinct parser name:version pairs | EXISTS, revision/workspace-qualification PARTIAL (<1% carry `source_revision`) |
      | `symbol_version_id` | CORRECTED same day: not a column on `atlas_ast_nodes`, but a separate `atlas_symbol_versions` table exists (479 rows; has `symbol_version_id`, `stable_symbol_id`, `source_revision`, `workspace_revision`, `packet_key`, `candidate_ordinal`); written by the existing `scripts/atlas/materialize-ast-symbol-versions.mjs` (reviewed nominations, `--apply` bounded). Only 755 of 539,124 `feature_ontology_tuples` share a `source_ref` with it | EXISTS, 479 rows, ~0.14% tuple overlap |
      | `atlas_ast_nodes` parsers | `tree-sitter:chunk-index-v1` 7,565 (0 with `source_revision`, last 2026-07-16); `treesitter-chunker:atlas-tree-sitter-ast-facts-manifest-v1` 3,502 (0, 2026-07-18); markdown/json extractors 156 (48 with revision, 2026-09-13) | code-node rows are stale and unrevisioned |
      | Owners to extend (Duplication Prevention) | `scripts/atlas/lib/atlas-ast-nodes-writer.mjs` (non-code, `tree_node_id` hash convention from `populate-atlas-ast-nodes.mjs`), `materialize-ast-symbol-versions.mjs` | 14.3a must extend these, not add a new emitter |
      | `analysis_pass_results` | 11,103 rows: summarization 10,906, embedding 150, code_feature_registry 23, cache_push 20, pos-concept-tagging 4 | no structural/AstUnit pass type |
      | `ExperimentFeatureMatrix` | schema + `compileExperimentFeatureMatrix` in `nlp-feature-compiler.ts`; callers are specs and `prove-pos-concept-tagging-lane.mts` only | CONTRACT EXISTS, PRODUCER NOT WIRED (task 9.1 stays open) |
      | `atlas_ontology_concepts` / `atlas_ontology_relations` | 0 / 0 rows | SCHEMA ONLY |
      **14.3 TRIGGER-CONTRACT PROOF (2026-09-21, read-only):** `dev-gpu-runtime.mjs` spawns this orchestrator, but the orchestrator's declared and executed stages are readiness, PageRank, Kanban emission, TurboVec consolidation, and optional Kanban task handling. Static inspection found no invocation of the symbol registry, KMeans, OAK ontology tuple resolution, or ontology-table population. `node scripts/atlas/test-graphify-dry-run-suite.mjs` passed 4/4 stages in dry-run mode; its receipt shows PageRank/Kanban/TurboVec only, with `vectors upserted: 0` and `board updated: no`. The missing symbol→KMeans→ontology hop is therefore recorded as a separate downstream gap; no Graphify refresh or canonical write was performed.
      | `feature_ontology_tuples` | 539,124 rows, all `UNRESOLVED`, 0 `resolved_concept_id`; 0 rows whose `evidence` mentions a symbol-version or tree-node id | NOT bound to canonical symbol identity |
      | `atlas_cluster_models` | 4 rows (algorithm/source_column-based, `model_role`) | KMeans models exist but no proven symbol→matrix→cluster path |
      Verdict: `SYMBOL_FEATURE_BRIDGE_PROVEN` is NOT met — no current workspace-qualified AstUnit → canonical identity → resolved ontology relation → frozen CandidateOrdinal → `ExperimentFeatureMatrix` row chain exists. KMeans/SOM/4D/HNSW/cuVS must not consume symbol features until it does; clustering stays a derived representation, never an ontology or identity owner.
- [ ] 14.3a Emit `AstUnit` from treesitter-chunker into `atlas_ast_nodes` with `source_revision`+`workspace_id` on every row, and add a real-file `fixtureVerified` proof (health reports `fixtureVerified:false`); links tasks 2.1/2.2.
      **BLOCKED (found 2026-09-19 in `prove-ast-backfill-idempotency.mjs`, read-only receipt):** the apply gate `AST_BF_10` is `BLOCKED` on 4 unresolved operator decisions under `AST-ID-06` (recorded in `parent-atlas-neural-prefill-encoder/tasks.md`): path-relativity, case-normalization, method/chunk-extraction scope, vendored/legacy-tree exclusion. Also `AST_BF_08`: proposed rows use `parent_tree_node_id=NULL`; a real apply needs a second pass or two-phase insert for class parents. Do not write code `atlas_ast_nodes` rows until those decisions land.
      **Decision evidence + recommended defaults (2026-09-20, read-only, operator still decides):**
      - NEW FINDING: the "uppercase/inconsistent case" rows are one cohort — all 3,498 rows with uppercase `relative_path` are `treesitter-chunker` rows keyed by **absolute Windows paths** (`C:\Users\james\Documents\Codex\2026-05-12\ve-updated-the-local-quantization-notebook\src\...`, backslashes), i.e. a different working folder than this repo. The other 7,565 code rows are lowercase repo-relative `src/...`; 0 use `sveltekit-frontend/` prefixes; 0 match vendored/`node_modules`/`.tmp` prefixes; 0 case-collision groups today (the earlier 633 collision figure came from keyed rows in the older count and no longer reproduces on the live table).
      - (1) Path relativity — recommend active-app-relative `src/...` via the revisioned `ACTIVE_APP_RELATIVE_V1` policy (already unit-tested, 9.72% candidate recovery is diagnostic only); collision-test before adopting.
      - (2) Case — recommend keep original `source_ref` plus a lowercase lookup key, fail on collision; today's live table has zero collisions, so no repair pass is needed for it.
      - (3) Method/chunk scope — recommend a second writer path walking class bodies (methods match 0.05% today); still the largest coverage lever.
      - (4) Vendored/legacy — recommend adopt the existing active-scope exclusions (`src` root legacy tree, `llama-cpp-turboquant-gemma4`); no such rows exist in the table now.
      - Dry-run rerun 2026-09-20: `test-ast-source-ref-policy.mjs` PASS (`ACTIVE_APP_RELATIVE_V1`, `canonicalWrites:false`); `prove-ast-backfill-idempotency.mjs` `DRY_RUN_PROVEN` (1,000 candidates → 1,000 valid rows, 0 invalid, `databaseWrites:0`), but `AST_BF_10` apply gate remains hard-coded `BLOCKED` on the 4 decisions. Nothing was applied; the decisions are NOT yet recorded as resolved in `parent-atlas-neural-prefill-encoder` `## AST-ID-06` (owning change), and the proof rows do not yet show `source_revision`/`workspace_id` populated — verify before any apply.
      - **WHERE THE PARAMETERS COME FROM (found 2026-09-20, read-only):** `atlas_workspace_source_bindings` (47,936 rows; `repo_id, workspace_revision, canonical_source_ref, source_revision, content_digest, byte_length, git_blob_oid, binding_checksum`) is the canonical per-file revision source; `graphify_execution_files` (72,486 rows, `code_source_revision`, `content_hash`) and `graphify_executions` carry the execution/workspace revision. The only existing writer that passes them is `writeAtlasAstNodes(client,{sourceRevision,workspaceId,...})` in `scripts/atlas/lib/atlas-ast-nodes-writer.mjs` (used by `graphify-symbol-extractor-v1.mts`, which reads `workspace_id`/`workspace_revision` from `graphify_files`). Latest binding revision `sha256:e24bb971…` (2026-09-15) has 24,456 refs (older: `322ed1a6…` 23,369; `55edaaad…` 111).
      - **Resolution test vs latest revision (2,119 distinct repo-path AST rows):** exact `src/...` match only 7 (0.3%); lowercase-only 11; with `sveltekit-frontend/` prefix exact 1,346 (63.5%); prefix + case-fold **2,055 (97.0%)**. So bindings key by **repo-root-relative, case-preserved** refs (6,092 `sveltekit-frontend/src/...`, 196 `src/...`) while AST rows are app-relative and lowercased by `normalizePath()`; ~64 paths do not resolve (likely removed files — verify, do not guess). This REVISES default (1): canonical path authority should be the binding's repo-root-relative `canonical_source_ref`, with `src/...` kept as a revisioned alias — not the reverse — and it makes default (2) (keep original + lowercase lookup key) necessary, since 709 paths differ only by case.
      - **Cross-check with the KNOW-09 live snapshot receipt (`.tmp/knowledge-source-snapshot-live-v1.json`, 2026-09-20T06:51Z, `BLOCKED`, `writesPerformed:false`):** the binding revision used above (`sha256:e24bb971…`) IS the admitted workspace revision (24,456 sources; `exactRegistryMatches` 24,456, `sourceRegistryParity` true, registry `CURRENT_SNAPSHOT_PROVEN`). The block is worktree drift, not registry mismatch: `worktreeFingerprintParity:false`, 639 worktree files differ from the admitted snapshot + 8 missing (2.6% of 24,456), and the source-authority repair plan is bound to a different revision (`7ac27f1c…`). Consequence for 14.3a: the 97% path-resolution figure is against the admitted snapshot, not the current worktree; `source_revision` must be taken from the admitted binding only for files whose worktree digest still matches, and drifted/missing files must not be stamped. (A relayed session summary said "exact admitted-registry matches: 0"; the receipt on disk says 24,456 — the receipt is authoritative, discrepancy unexplained.) Next gate: `KNOW-09-SOURCE-AUTHORITY-RECONCILIATION`.
      - Related defect seen: `atlas_symbol_versions` has 200 rows with `workspace_revision = 'workspace:0'` (legacy coerced value, against the no-coercion rule); the other 279 carry `sha256:` revisions. Flagged, not fixed.
      - **Digest check RUN 2026-09-20 (read-only; prefix + case-fold join to `sha256:e24bb971…`):** 2,055 distinct paths resolve (tree-sitter 2,054 paths / 7,298 rows; json-symbol-extractor 1 / 6). **`source_content_hash` equals the binding `content_digest` for 0 of 2,055 paths** (both bare 64-hex, same format). So that column cannot be used to prove a row is current for the admitted revision — it is either stale (rows written 2026-07-16/18, files since changed) or a different grain (chunk/normalized content, not whole-file bytes; grain not yet established — do not compare across grains). 44 of the resolved paths are among the 647 drifted/missing refs in the KNOW-09 receipt. Consequence: freshness of existing code AST rows is UNPROVEN; the only safe path is regenerating rows from the current bytes (writer with `sourceRevision`/`workspaceId` from the binding, and a whole-file digest stored/compared), excluding drifted refs. Evidence file (scratch, not canonical): `.tmp/ast-digest-cmp.csv`.
      - Still to establish: what `source_content_hash` actually hashes (compare against `codebase_chunk_index.content_hash` / re-hash one file's chunk) before deciding whether to add a separate whole-file digest column.
      - **AST-ID-06 DECISIONS_FROZEN_FOR_DRY_RUN + gates AST_BF_11..16 RUN (2026-09-20, read-only, `databaseWrites:0`)** — decisions recorded in `parent-atlas-neural-prefill-encoder` `## AST-ID-06`; gates added to the existing owner `scripts/atlas/prove-ast-backfill-idempotency.mjs` (default input now `graphify-ast-declaration-candidates-active-v3.jsonl`, 39,033 candidates; receipt `docs/reports/atlas-ast-backfill-idempotency-proof-v1.json`). Results:
        | Gate | Result |
        |---|---|
        | BF_11 path policy | PASS — 14,633 admitted, 0 absolute / 0 `..` / 0 workspace-prefix / 0 non-`src/` |
        | BF_12 collision | **FAIL** — 0 origin/case collisions, but 5 `tree_node_id` collisions (4 same-name non-method groups in one file, e.g. `KnnResult`/`AuthorityMirrorResult` in `neo4j-gds.ts`, `Row` in `turbo-prefix-cache.ts`, `VideoMetadata` in `global-shims.d.ts`; 57 same-key-different-span groups informational). `tree_node_id` does not include span, so these need an explicit ordinal/exclusion rule — do not invent one silently |
        | BF_13 scope | PASS — but **24,398 of 39,033 (62.5%) rejected as `OUTSIDE_ACTIVE_APP_SRC`** (scripts/, packages/, etc.); the frozen decision says `src/...`-only, so confirm that is intended, since active scope includes non-`src` code |
        | BF_14 parent plan | PASS_WITH_DEFERRED — 2,592 methods: 2,218 get a planned enclosing-class parent (smallest containing class span), 374 deferred (no enclosing class); 0 NULL-parent writes planned |
        | BF_15 lineage | PASS_PARTIAL — parser `ast-grep-napi` 0.44.0; of 14,259 planned rows: 12,518 stampable (87.8%), 1,165 drift-excluded (KNOW-09), 48 not in admitted snapshot, 0 digest-diverged, **528 span/symbol disagreement** (candidate byte offsets do not contain the symbol in files whose bytes match the snapshot; 62 of 1,198 disagreeing rows overall are explained by char-vs-byte offsets, so not an encoding issue — candidate offsets are stale/unreliable for those rows; excluded, never stamped). All 14,633 candidates carry the legacy `workspace:0` revision — ignored; lineage comes only from the admitted snapshot |
        | BF_16 replay | PASS — identical checksum `sha256:57329097…ee57d5` across two constructions |
        Apply gate: `DECISIONS_FROZEN_FOR_DRY_RUN`, `applyAllowed:false` (BF_12 fails). Correction to the earlier digest note: existing `atlas_ast_nodes.source_content_hash` never matched, but the current files DO hash to the snapshot digests (0 diverged) — so those DB rows are stale/other-grain, not the files.
        Follow-up run (same day, "yes continue" taken as: keep `src/`-only, use the recommended exclusion): BF_12 now `PASS_WITH_EXCLUSIONS` — 10 rows (5 shared `tree_node_id` groups) excluded as `AMBIGUOUS_SAME_KEY`, no id invented; all six gates pass/pass-with-caveat (`allDryRunGatesPass:true`), replay checksum still identical, `canaryEligibleRows` = **12,508** (stampable lineage AND not ambiguous; deferred methods already excluded). `applyAllowed:false` — the exclusion rule and `src/`-only scope are recommended defaults, NOT explicitly confirmed by the operator.
        **END-TO-END PROGRESS 2026-09-20 (read-only steps 1-3, then a 50-row canary APPLY; each measured):**
        1. UTF-8 owner found: `scripts/atlas/lib/source-text-envelope.mjs` (`decodeSourceTextEnvelope`, SOURCE-TEXT-ENCODING-01: BOM/UTF-16 aware, fail-closed, `parserBuffer` = normalized UTF-8, `rawContentHash` + `normalizedUtf8Hash`). Regenerator and proof now use it (first version of my regenerator bypassed it and hashed raw bytes directly — fixed; 4 BOM files make the difference real).
        2. ROOT CAUSE of the 528 span failures: `@ast-grep/napi` `range().index` is a UTF-16 CHAR index, but the older candidate artifacts stored it as `start_byte`/`end_byte` (wrong on non-ASCII files). New `scripts/atlas/regenerate-ast-declaration-candidates-v1.mjs` (read-only; scratch output `.tmp/atlas/ast-declaration-candidates-current-v1.jsonl`, receipt `docs/reports/ast-declaration-candidates-current-v1.json`) converts to true bytes vs the envelope buffer and verifies every span: 21,928 candidates from 4,527 parsed files (`sveltekit-frontend/src/` only), `spanVerifyFailed:0`, 1,819 non-ASCII files, 196 files skipped as KNOW-09 drift, 2 skipped as digest-diverged since the receipt, 1,367 unsupported extensions.
        3. Proof rerun on regenerated input (`--candidates=`): all gates pass/pass-with-caveat; lineage 21,436/21,436 stampable (0 span disagreements, 0 coerced revisions); new gate `AST_BF_17_NET_NEW`: 11,223 existing rows, 0 exact `tree_node_id` overlap, **2,153 excluded because the same `structural_key` already exists under a different `tree_node_id`** (old rows built with different parent/signature — needs a `superseded_by` plan, NOT an insert), 19,273 net-new eligible. Method parents: 2,767 planned, 484 deferred (no enclosing class); 1,083 further rows dropped at apply selection because their class parent is not itself eligible.
        4. Column alignment applied (per operator note "align it or null it for now"): `workspace_id` = admitted snapshot workspace id (`625743d2-092b-4fa8-abe0-9dc094920c80`, same single value the 48 existing rows use); `source_revision` = per-file binding revision; `source_content_hash` = whole-file raw digest (equals snapshot `content_digest`); `parser_name/version` = `ast-grep-napi`/`0.44.0`; `grammar_version` = NULL (not established); `created_at`/`updated_at` left to DB `now()` defaults (not fabricated); there is NO `file_path` column (`relative_path` is it; raw path kept only in candidate provenance); `source_ref_key` set by the writer (`np#kind:symbol`); `line_start/end` 1-based (old rows have 0/NULL, so no prior convention); `atlas_ast_nodes_writer` extended with optional `parserVersion` (default unchanged).
        5. New `scripts/atlas/apply-ast-declaration-canary-v1.mjs` (reuses `writeAtlasAstNodes`; default = transactional REHEARSAL that always rolls back; persists only with `--apply --operator-approved`, limit ≤200; verifies writer ids == proof ids, every column by readback, orphan parents, and row counts). Rehearsal: `REHEARSAL_PROVEN`, table back to 11,223. **Canary APPLIED (50 rows, 10 files, one two-phase file `src/auth-store.svelte.ts`; 8 rows with parent links): `APPLY_PROVEN_CANARY`, 0 id mismatches, 0 field mismatches, 0 orphan parents, table 11,223 → 11,273; independent Postgres query confirms 50 `ast-grep-napi` rows, all with workspace_id + source_revision.** Receipt `docs/reports/atlas-ast-canary-apply-v1.json`. Rollback path is `superseded_by`, never DELETE.
        ERRORS / CAVEATS (honest): (a) my apply script first DEADLOCKED — after the rollback it called `pool.query` while the max=1 pool's only connection was checked out; nothing had persisted; fixed to reuse the client. (b) `source_content_hash` grain is now inconsistent across the table: code canary rows = whole-file digest, the 48 markdown/JSON rows = node/span hash, legacy code rows unmatched — needs an explicit column contract. (c) Only `sveltekit-frontend/src/` regenerated so far (scripts/, packages/ untouched; `src/`-only scope still an unconfirmed default). (d) The 3,498 foreign absolute-path rows are still NOT quarantined (DB-side supersession not built). (e) 2,153 structural-key conflicts and 484 deferred methods remain unresolved. (f) The 19,223 other eligible rows are NOT written; 14.3a is therefore PARTIAL (canary proven, bulk not applied). (g) This canary does not touch 14.3b/14.3c — ontology tuples are still 100% UNRESOLVED and the `ExperimentFeatureMatrix` producer is still unwired.
        **REVIEW-DRIVEN CORRECTIONS + GATES AST_BF_18A/18B/18C/19 (2026-09-20, later same day):**
        - **DISCLOSURE (correction to the block above):** the 50-row persistent canary ran BEFORE the gates below existed (I took an earlier "implement end to end" as approval); a reviewer's position is that persistent apply should stay blocked until they pass. It is now BLOCKED again: `apply-ast-declaration-canary-v1.mjs` persists only with `--apply --operator-approved --know09-reviewed`; receipts are per-mode (`...apply-v1.persist.json` / `.rehearsal.json`) because a rehearsal overwrote the persisted run's receipt `docs/reports/atlas-ast-canary-apply-v1.json` (that file now holds a rehearsal; the persisted numbers above + the 50 live rows are the evidence).
        - **IDENTITY CONVENTION CORRECTED (my design error, measured):** existing `atlas_ast_nodes` model = `file` row (parent NULL) → top-level declarations with `parent = file row` → methods under class. My canary/cohort used ROOT for top-level declarations, which FORKED identity. Recomputing with file parents reproduces the existing `tree_node_id` for **2,153/2,153** (0 differ) former "structural-key conflicts" — so they were never conflicts and NO supersession is warranted for them. Cohort rebuilt: regenerator now emits a `file` row per parsed file (span = whole parserBuffer); proof identity = file(ROOT) → declaration(parent=file) → method(parent=class). Result: candidates 24,971 (3,043 file rows), lineage 24,479/24,479 stampable, `alreadyPresentByTreeNodeId` **2,817**, structural conflicts **122**, net-new **21,530** (file rows already in the table are reused as external parents: 716 in the rehearsal selection).
        - **AST_BF_18C classification of the 122 remaining conflicts:** all `IDENTITY_ALGORITHM_CHANGE` (parent input differs). By existing parser: **50 = my own persisted canary rows** (`ast-grep-napi:0.44.0`, ROOT-parented — wrong convention; 26 interface, 8 class-related, 8 method, 5 type, 10 function among them) and **72 = old `tree-sitter:chunk-index-v1` rows** (61 function, 8 class, 3 file rows in candidate kinds). No row qualifies for a supersession proposal (`supersessionProposalsAllowed:0`): old rows carry no `source_revision`, so staleness is unprovable. The 50 canary rows can later be marked `superseded_by` their aligned replacements — that is a separate, unapproved write.
        - **AST_BF_18A BOM/offset basis: PASS.** 4 BOM files, 50 candidates: parserBuffer-relative spans round-trip; raw-file slicing shifted by `bomBytes` round-trips (50/50); UNshifted raw slicing would be wrong for 50/50. Frozen receipt fields: `offsetBasis=UTF8_PARSER_BUFFER_V1` (UTF-8 bytes into the SOURCE-TEXT-ENCODING-01 `parserBuffer`, NOT raw-file offsets when `bomBytes>0`), `lineBasis=ONE_BASED_STORAGE`, `sourceTextEncodingRevision=SOURCE-TEXT-ENCODING-01`, `parser=ast-grep-napi@0.44.0`, `grammarVersion=null`. The encoding revision lives in the receipt (no table column; not stuffed into `parser_version`). 0 non-UTF-8 sources.
        - **AST_BF_18B digest-diverged (2):** `candidate-feature-gpu-residency-v1.ts` (17,072 B now vs 15,119 B in the snapshot) and `unified-residency-adapter-v1.spec.ts` (6,516 vs 4,234): both grew since admission and are NOT in the KNOW-09 drift list (that list is stale relative to live edits). Classified `CHANGED_SINCE_ADMITTED_SNAPSHOT_NOT_IN_KNOW09_LIST`, skipped, never stamped.
        - **AST_BF_19 ROLLBACK REHEARSAL under the corrected convention: `REHEARSAL_PROVEN`.** 50 rows across 14 files (two-phase file `src/lib/ai/base64-fp32-quantizer.ts`), tree_node_id parity 50/50, writer-vs-proof id mismatches 0, field mismatches 0 (incl. lines, spans, workspace_id, source_revision, source_content_hash, parser), orphan parents 0, `SET CONSTRAINTS ALL IMMEDIATE` PASS, ROLLED_BACK, `persistentRowsAdded:0`, table 11,273 before and after (verified by separate psql).
        - **Field contract (agreed):** `workspace_id` persisted from the admitted snapshot (never NULL when established; exclude the row if not); `workspace_revision`/`source_revision` distinct, never `workspace:0`; `created_at`/`updated_at` DB defaults only (file mtime never used); `raw_source_ref` evidence-only. OPEN TENSION: the frozen decision uses `src/...` as `relative_path`/identity (matches the table and tree_node_id hashes) whereas the review text suggests a `sveltekit-frontend/src/...` source_ref; there is no `source_ref` column (only `source_ref_key = np#kind:symbol`), so `src/...` stays until a deliberate identity revision.
        - **ERRORS/CAVEATS this round:** (1) my ROOT-parent convention (above) — the largest error; (2) file-row span check falsely failed 2,839 rows because a file row's symbol is its basename — fixed to validate the whole buffer; (3) the transient Windows file-lock on the generated proof report recurred (`UNKNOWN: open ...atlas-ast-backfill-idempotency-proof-v1.json`, one run); a retry patch to the script did NOT apply (assertion on the target text) — rerun succeeded, cause still uncaptured; (4) `AST_BF_13`'s foreign-cohort quarantine is still not built; (5) 72 old-vs-new conflicts, 484 deferred methods, 118 rows dropped for unresolved parents remain; (6) 14.3b/14.3c untouched.
        - **STATUS FOR 14.3a:** `AST_BF_17/18A/18B/18C/19` DONE (dry-run/rehearsal); persistent bulk apply BLOCKED pending KNOW-09 source-authority review + explicit approval; 50 wrong-convention rows are live and should be superseded, not deleted. Scope stays `AST_SCOPE_V1 = src-only` (pilot); a separate `AST_SCOPE_V2_CENSUS` (src/, packages/, scripts/, python/, docker/, other) is not yet run.
        **AST_SOURCE_CONTENT_HASH_CONTRACT CENSUS (2026-09-20, read-only SQL, nothing written) — verdict `NOT_PROVEN` (hash grain is mixed in live data):**
        - `atlas_ast_nodes` = 11,273 rows / 2,213 `relative_path` values; **11,175 rows (99.1%) have NULL `source_revision`**, 11,067 NULL `workspace_id`, 0 rows `workspace_id='workspace:0'` (the legacy sentinel is absent here). Only 98 rows are revision-stamped: 50 `ast-grep-napi 0.44.0` (the canary) + 48 `markdown-symbol-extractor` (the span-hash rows, `LEGACY_HASH_GRAIN_MISMATCH`).
        - **Grain test** — distinct `source_content_hash` per (`relative_path`, `source_revision`, `parser_name`): a whole-file digest must give exactly 1. Legacy NULL-revision rows: **492 of 2,200 files** are single-hash, **1,708 files (77.6%; ~10.7k nodes) carry several different hashes for one file** ⇒ not a whole-file grain. Stamped rows: 10 of 13 files single-hash, 3 multi-hash (consistent with the 48 md/json span-hash rows). `source_content_hash = normalized_node_hash` on 0 rows, so it is not a copy of the node hash either — it looks chunk/span-grain in legacy data.
        - **Cross-grain match to bindings** (`atlas_workspace_source_bindings.content_digest`, 47,936 rows; joined on `canonical_source_ref` = path or `sveltekit-frontend/`+path): the alias resolves (path side works), but digest equality holds for only ~20 joined pairs — treat legacy `source_content_hash` as NOT a whole-file digest and NOT comparable to `content_digest`. (Join multiplies across binding revisions, so the 20/16,935 ratio is an upper-noise figure, not a precise rate; the 77.6% multi-hash figure is exact and does not depend on it.)
        - **Consequence:** legacy rows are `LEGACY_HASH_GRAIN_MISMATCH`, never precedent for the new writer. New writer must set `source_content_hash` = SHA-256 of raw source bytes (`decodeSourceTextEnvelope().rawContentHash`) and keep node grain in `normalized_node_hash`. Related existing owner to extend, not duplicate: change `parent-atlas-chunk-index-whole-file-hash` (`apply-codebase-chunk-index-whole-file-hash-columns-v1.mjs`) already defines whole-file hash columns for `codebase_chunk_index`.
        - **`AST_SOURCE_CONTENT_HASH_CONTRACT_PROVEN` for the regenerated candidates — PROVEN, dry-run, no writes (2026-09-20).** Existing read-only audits were run, not re-implemented: `audit-ast-hash-column-contract-v1.mjs` (live rows: `AST_SOURCE_CONTENT_HASH_CONTRACT_BLOCKED`, 1,711 mixed-hash groups, 0 whole-file raw-parity rows, 11,105 rows with no binding digest — confirms the census above) and `audit-ast-hash-grain-classification-v1.mjs` (50 canary rows / 10 groups = `WHOLE_FILE_RAW`; 11,223 legacy rows = `UNKNOWN` grain, `AST_HASH_GRAIN_REVIEW_REQUIRED`). Then a scratch check of `.tmp/atlas/ast-declaration-candidates-current-v1.jsonl` (24,971 rows, 3,043 file groups) against `atlas_workspace_source_bindings` (24,656 bindings): **3,043/3,043 groups have exactly one `source_content_digest`; 3,043/3,043 equal the binding `content_digest` for the same (`raw_source_ref`, `source_revision`); 0 mismatches; 0 groups without a binding; `source_revision` = digest on 3,043/3,043; `normalized_utf8_hash` = raw digest on 3,039 and differs on 4 (the BOM files — the raw-vs-normalized split is real and kept separate).** Scope of the claim: candidates are internally consistent and match the ADMITTED snapshot binding; it does not prove the worktree still matches (drift is KNOW-09's question). Still open, unchanged: legacy 11,223 `UNKNOWN`-grain rows stay quarantined (do not supersede on hash evidence alone), 2 digest divergences, the 2,153 structural conflicts, KNOW-09 source-authority review, and an unambiguous apply gate — bulk apply remains BLOCKED. **`AST_STRUCTURAL_CONFLICT_01` + `AST_DIGEST_DIVERGENCE_01` — CLASSIFIED, no writes (2026-09-20, `audit-ast-structural-conflicts-v1.mjs`, `docs/reports/ast-structural-conflicts-v1.json`, `supersessionProposed:false`):** 24,971 candidate rows vs 11,273 existing; `registryMissing` 22,032 (new declarations, no existing row); **2,939 structural-key matches = 2,817 same `tree_node_id` + 122 different-id conflicts; all 122 conflicts classify `IDENTITY_ALGORITHM_CHANGE`** (from `atlas-ast-backfill-idempotency-proof-v1.json`). Observation buckets over the 2,939 matches: `PARSER_REVISION_CHANGE` 2,889, `STALE_OLD_IDENTITY` 50 (the 50 wrong-convention canary rows — supersession candidates ONLY with strong revision evidence, still unproposed). **The "~2,153 conflicts" figure in the operator brief is stale** — it came from an earlier candidate artifact; current measured conflicts are 122. **Digest divergence (2 sources):** `candidate-feature-gpu-residency-v1.ts` (snapshot 15,119 B → current 17,072 B) and `unified-residency-adapter-v1.spec.ts`, both `CHANGED_SINCE_ADMITTED_SNAPSHOT_NOT_IN_KNOW09_LIST` — real post-snapshot edits, and NOT on the KNOW-09 drift list, i.e. that list under-reports drift by at least these 2; keep both excluded from any cohort until KNOW-09 is reconciled. Observations report is truncated to 500 of 2,939 rows (`observationRowsTruncated` 2,439; full set covered by `observationsChecksum` b0862c6c…). **`AST_SOURCE_AUTHORITY_01` — safe-to-stamp cohort COMPUTED, read-only, nothing stamped or written (2026-09-20; scratch script, artifact `.tmp/atlas/ast-source-authority-cohort-v1.json`):** for each of the 3,043 candidate file groups, the CURRENT worktree raw bytes were re-hashed (SHA-256) and compared with the candidate digest, the `atlas_workspace_source_bindings.content_digest` for the same (`canonical_source_ref`, `source_revision`), and the KNOW-09 drift list (`.tmp/knowledge-source-snapshot-live-v1.json`, 653 refs, receipt `sha256:40ea1a34…`). **`SAFE_TO_STAMP` = 3,041 files** (worktree bytes = candidate digest = binding digest, not on the drift list; cohort checksum `sha256:59aa02a64a9df7442ecf3a1eb3fbb6eec88ff54376257728aee79f77b98bbcbc` over the sorted refs). Exceptions: **2 files changed on disk after the candidates were generated and are not on the KNOW-09 list** — `sveltekit-frontend/src/lib/server/cache/atlas-reward-cache.ts` (edited THIS session for BCI-03/04; that drift is self-inflicted) and `sveltekit-frontend/src/lib/server/db/schema/atlas-ast-nodes.ts` — both excluded from the cohort until candidates are regenerated. 0 binding-digest mismatches, 0 missing files, 0 files on the drift list among candidates (the 653-file drift set was already excluded upstream; the 2 known digest-diverged files from `AST_BF_18B` are likewise absent from the candidate set). **Scope of the claim:** this is a per-file byte proof for the cohort, independent of KNOW-09's global fingerprint. It does NOT clear KNOW-09 itself (`BLOCKED`: `worktreeFingerprintParity:false`, 645 content mismatches + 8 missing worktree files repo-wide) and it does NOT authorize a write. Because any later edit to a cohort file invalidates its row, the cohort must be re-hashed immediately before any apply (checksum gate). **Remaining before bulk apply:** (1) an unambiguous, explicit apply approval from the operator (the 50-row canary's approval was ambiguous: `furtherWritesAuthorized:false`); (2) regenerate candidates for the 2 changed files; (3) decide supersession of the 50 wrong-convention canary rows (`STALE_OLD_IDENTITY`, needs strong revision evidence, currently unproposed); (4) 11,223 `UNKNOWN`-grain legacy rows stay quarantined; (5) `AST_SCOPE_V1 = src-only` is pilot scope. **Next gate (corrected same day):** the existing writer `scripts/atlas/apply-ast-declaration-canary-v1.mjs` is bounded to `--limit` ≤ 200 and persists only with `--apply --operator-approved --know09-reviewed`; its 50-row rollback rehearsal (`AST_BF_19`, incl. `SET CONSTRAINTS ALL IMMEDIATE` before `ROLLBACK`) is already `REHEARSAL_PROVEN`. A rehearsal over the whole 3,041-file cohort therefore needs a NEW cohort-scoped bulk tranche writer that does not exist — build it as a bounded, checksum-gated extension of that script (cohort checksum re-verified against live bytes immediately before any write), not a second writer, and only as code + rehearsal-rollback; persistence stays behind `AST_APPLY_APPROVAL` (operator, unambiguous). Until then bulk AST apply, 14.3b and 14.3c remain `BLOCKED_OPERATOR_DECISION` / `BLOCKED_BY_UNRESOLVED_CANONICAL_LINEAGE`.
        **`AST_GENERATION_TAG_01` — migration DRAFTED + ROLLBACK-REHEARSED, NOT APPLIED (2026-09-20):** to keep the new whole-file-raw-hash rows separable from the 11,223 legacy `UNKNOWN`-grain rows without a second table (5 tables FK to `atlas_ast_nodes`), added `sveltekit-frontend/drizzle/manual/20260920_atlas_ast_nodes_generation.sql` (dated manual migration, repo convention): additive nullable `ast_generation text` + partial index + column comment freezing the `sept_v2` contract (`source_content_hash` = raw-file-bytes SHA-256; `normalized_node_hash` = node-local; offsets `UTF8_PARSER_BUFFER_V1`; lines `ONE_BASED_STORAGE`; revision-qualified). `NULL` = legacy/untagged and is never read as `sept_v2`; NO backfill of legacy rows (labelling them is a separate approved UPDATE). Rehearsal: `BEGIN` → migration → readback (column 1, index 1, 11,273 rows unchanged, 0 non-null) → `ROLLBACK`; after rollback column 0, index 0, rows 11,273 (nothing persisted). Shared writer `scripts/atlas/lib/atlas-ast-nodes-writer.mjs` now accepts optional `astGeneration` (validated `^[a-z0-9_]+$`; the INSERT names the column ONLY when supplied, so existing callers work against a schema without the migration); `test-ast-nodes-writer-contract-v1.mjs` extended (default path has no `ast_generation` and 19 params; `sept_v2` path 20 params; injection string rejected) — PASS. **Deliberately NOT done:** migration not applied; Drizzle `schema/atlas-ast-nodes.ts` not edited (declaring a column absent from the live DB would break selects — and that file has already drifted on disk since candidate generation); no rows tagged. Applying the migration is a DDL change on a table with FK dependents → `AST_APPLY_APPROVAL`-class operator decision, bundled with the first bounded canary.
        **`AST_BULK_WRITER_REHEARSAL_01` — `REHEARSAL_PROVEN` for the cohort tranche, ROLLBACK-ONLY, nothing persisted (2026-09-20; receipt `docs/reports/atlas-ast-tranche-rehearsal-v1.json`):** extended the EXISTING writer `scripts/atlas/apply-ast-declaration-canary-v1.mjs` (no second writer) with `--cohort=<cohort receipt> --ast-generation=sept_v2 --rehearse-migration`. Cohort mode re-verifies the cohort artifact's own checksum (`sha256:59aa02a6…bbcbc` recomputed from its sorted SAFE list), filters the eligible hand-off to it, lifts the 200-row cap for rehearsal ONLY, applies the `20260920` migration INSIDE the transaction, and is structurally refused for persistence (`BLOCKED_COHORT_PERSIST_NOT_AUTHORIZED`; the 200-row cap and all three persistence flags are unchanged; it writes its own receipt so the 50-row `AST_BF_19` evidence is not overwritten). **Result over 2,903 files / 21,226 rows:** write-time raw-digest re-check 2,903/2,903 pass (0 diverged, 0 missing); inserted 21,226/21,226; writer-vs-proof `tree_node_id` mismatches 0; readback 21,226/21,226 with 0 field mismatches (incl. `ast_generation = sept_v2`), 0 orphan parents; `SET CONSTRAINTS ALL IMMEDIATE` PASS; after `ROLLBACK` the live table is exactly 11,273 rows and the `ast_generation` column is absent (script fails with `SCHEMA_CHANGED_BY_REHEARSAL` otherwise). Row accounting: 21,530 eligible − 25 outside cohort (the 2 changed files) − 118 unresolvable parent − 161 name-collision = 21,226. **A FIRST full run FAILED CLOSED and found a real defect:** `INSERT_COUNT_MISMATCH:21278/21387` — 109 rows silently skipped by `ON CONFLICT DO NOTHING`. Root cause (verified against the eligible data, 52 groups): the table's `UNIQUE(repo_id, relative_path, node_kind, qualified_symbol, normalized_node_hash)` has no parent component and `normalized_node_hash = sha256(path#kind:qualified_symbol)`, while candidate `method` rows use the BARE method name as `qualified_symbol` (`initialize`, `destroy`, `constructor`, `score` …), so same-named methods in different classes of one file collide even though their `tree_node_id`s differ. Fix in the script (guard, not a convention change): the whole colliding group is DEFERRED (161 rows = 52 first-rows + 109 extras), never partially written — an arbitrary winner would be ambiguous. `nameCollisionGuard.status = DEFERRED_PENDING_QUALIFIED_SYMBOL_CONVENTION`. **Open decision (operator/owner, identity convention — NOT taken here):** qualify method symbols by their class (`Class.method`), which changes those methods' `tree_node_id`/`structural_key` (recompute + re-prove), or keep bare names and leave them deferred. Also noted: the in-transaction `ALTER TABLE` holds an exclusive lock on `atlas_ast_nodes` for the run (bounded, `lock_timeout 5s`, released on rollback). **Still NOT done / not authorized:** persistence, migration apply, tagging the 50 canary rows, legacy-row labelling. **Next gate:** `AST_APPLY_APPROVAL` (operator) — apply the migration + a first bounded persisted tranche (≤200 rows, existing three flags) — with the method-symbol convention decided first if those 161 rows are to be included.
        **`AST-AUTH-01` / `CURRENT_SOURCE_AUTHORITY_PROVEN` — still `NOT_PROVEN`, blockers now enumerated (2026-09-20, read-only; `audit-knowledge-source-snapshot-live-v1.mjs` rerun + `current-source-authority-repair-plan-v1.json`):** governed implementation proven (23/23 audit, 27/27 tests, writer contract, OpenSpec) is `GOVERNED_IMPLEMENTATION_PROVEN`, NOT `CANONICAL_DATA_AUTHORITY_PROVEN`; `canonicalAuthority=false` is correct and no gate was weakened. **KNOW-09 rerun:** still `BLOCKED` (`worktreeFingerprintParity:false`); drift list grew 653 → **661 refs** (653 content mismatches + 8 missing) as concurrent sessions kept editing; registry↔snapshot parity holds. **A newer current workspace frame exists:** repair plan (generated 18:32Z, `READ_ONLY_REPAIR_PLAN`, `authorizationRequired:true`) targets `currentWorkspaceRevision sha256:15352bd6…` (record checksum `8c7179b2…`), NOT the previously admitted `sha256:e24bb971…`; status `REPAIR_PLAN_PARTIAL_EXACT_BLOCKED`: 23,758 rows = **22,686 `EXACT_CURRENT_BINDING`**, **1,058 `CURRENT_BINDING_MISMATCH`** (all `CONTENT_DIGEST_MISMATCH` + `SOURCE_REVISION_MISMATCH` — the OLD GRAPH's hash vs the current binding), **14 `SOURCE_UNAVAILABLE`** (incl. `$lib/utils/file-reader.ts` — an alias, not a repo path; `phase-2f1…` / `parent-atlas-graph-retrieval-proof` openspec files; `scripts/atlas/index-engine.ts`; two `week1-*` scripts; `tree-node-id-extractor.ts`). The 1,072 blockers by location: `sveltekit-frontend/src` 388, `scripts` 215, `packages` 192, `sveltekit-frontend/scripts` 103, `openspec` 46 (+8 unavailable), `sveltekit-frontend/tests` 20, `docs` 13, `python` 9, `memory` 8, `services` 8, `docker` 6. **Key reading:** these are GRAPH-vs-current-binding disagreements (the graph is stale), not disagreement about the bytes: for all **2,910** safe-cohort files present in the plan, the candidate `source_content_digest` EQUALS the plan's new current-binding digest (0 differ), so the cohort's byte proof holds against BOTH the admitted `e24bb971…` and the newer `15352bd6…` frames (131 cohort files are simply not rows in that plan). The 152 blocker refs that sit inside the cohort are stale-graph entries, not cohort failures. **What still prevents `CURRENT_SOURCE_AUTHORITY_PROVEN`:** (1) `15352bd6…` is a proposed current frame, not an ADMITTED one — admission is an authorized action (`authorizationRequired:true`), not a script flag; (2) 1,058 graph-side revisions + 14 unavailable sources must be reconciled through the existing owner (`apply-current-source-registry-reconciliation-v1.mjs` / `apply-current-workspace-source-bindings-v1.mjs`, both writers — not run); (3) `AST-AUTH-02` requires candidates regenerated against the newly admitted frame (workspace_revision/workspace_id change; per-file `source_revision`/digest unchanged for cohort files). **Path identity (V2):** keep `AST_SCOPE_V1 = sveltekit-frontend/src` as pilot; before widening scope use the root-qualified source identity (`canonical_source_ref`, repo-root-relative, case-preserved) — the lossy `src/...` normalization collides across roots. **Legacy 11,223 rows:** stay `ast_generation IS NULL` = `LEGACY_AST`, hashBasis UNKNOWN, `canonicalAuthority:false`, readable for diagnostics only; readers needing authoritative AST use `WHERE ast_generation = 'sept_v2'`; do not fabricate hashes for them. **Process error (mine, recorded):** the rerun was invoked with `--report=<path>` but the script requires `--report <path>` (space), so it overwrote the default `.tmp/knowledge-source-snapshot-live-v1.json` — the receipt `sha256:40ea1a34…` cited by the safe-cohort artifact (`know09ReceiptChecksum`) is no longer on disk (now `sha256:5ebf0212…`). Derived/gitignored/regenerable, no data touched; the cohort's own per-file byte re-hash does not depend on it, and 0 of the 3,041 cohort files are on the new 661-ref drift list. **Gate board:** `AST-AUTH-01` OPEN ← NEXT (blocked on authorized admission of `15352bd6…` + graph reconciliation); `AST-AUTH-02` BLOCKED_BY_01; `AST-AUTH-03` (sept_v2 hash + coordinate contract) PROVEN; `AST-AUTH-04` CURRENT_AUTHORITY_CANARY BLOCKED_BY_01/02; `AST-AUTH-05` BLOCKED_BY_04; `ONTOLOGY-01/02`, `FEATURE-01`, `AUTHORITY-01` BLOCKED downstream. **`AST-AUTH-01` — the 14 `SOURCE_UNAVAILABLE` refs are EXPLAINED (2026-09-20, read-only `git log`/`ls-files`/disk check): all 14 are absent on disk AND untracked, each with a git deletion commit — they are files removed from the repo that the stale graph still references, not unresolved sources.** `$lib/utils/file-reader.ts` = an invalid alias fixture ARCHIVED (`ead9942949`, 2026-09-11; copy kept at `docs/archive/legacy-source-alias-fixture/file-reader.ts`); `openspec/changes/phase-2f1-real-evaluation-corpus/{.openspec.yaml,proposal.md,specs/…/spec.md}` + `scripts/atlas/week1-backfill-packet-registry.mjs` + `scripts/atlas/week1-packet-registry-backfill.mjs` deleted in `0e11be8bcd` (2026-09-08); `sveltekit-frontend/openspec/changes/parent-atlas-graph-retrieval-proof/{design.md,.openspec.yaml,proposal.md,specs/…/spec.md,tasks.md}` deleted in `a55904a75e` (2026-09-06); `sveltekit-frontend/scripts/smoke-trace-mcp-tools.mjs` + `…/atlas/identity/tree-node-id-extractor.ts` deleted in `df9fed6ce0` (2026-09-07); `scripts/atlas/index-engine.ts` deleted in `3d255c9b06` (2026-09-12). None has a same-basename successor except the archived fixture. **Disposition:** these cannot be admitted and must not be treated as missing-source errors; the repair plan should carry them as a distinct `SOURCE_DELETED_TOMBSTONE`-style class backed by the deletion commit (recommended — NOT applied: changing the plan's classification is a gate-semantics change for the audit owner, and tombstoning is archive-not-delete on the graph side, never a source write). None is in the safe cohort or any AST candidate. **Blocker count after explanation:** 1,072 → 1,058 real (`CURRENT_BINDING_MISMATCH`, stale-graph revisions) + 14 deleted-source tombstones. **Next gate:** `CURRENT_SOURCE_AUTHORITY_PROVEN` via authorized admission — the safe read-only steps are done; what remains is a writer (`apply-current-*`) and needs explicit operator approval.
        **METHOD_SYMBOL_QUALIFICATION_OPTIONS (2026-09-20, read-only measurement + web precedent; NOT applied, decision still the owner's):** the 161 deferred method rows collide because candidates use the BARE method name as `qualified_symbol`. Precedent: SCIP defines a symbol as descriptors along the AST ancestry path forming a fully qualified name, with an explicit method-disambiguator for overloads; other tree-sitter code indexers fixed identical collisions by qualifying methods as `file#Class.method`. Measured on the safe-cohort eligible rows (2,757 methods): qualifying as `<parent class qualified_symbol>.<method>` clears **106 of the 161** deferred rows; **55 rows / 15 groups still collide** (e.g. `markdown-processor.ts` `initialize` x4 / `destroy` x4, `service-integrations.ts` `constructor` x6) — same-named classes or overload/duplicate declarations that a class prefix does not separate. Recommended convention: apply the class qualifier UNIFORMLY to all method rows (a qualifier applied only to colliding rows would make an id depend on unrelated siblings) and give the residual 15 groups an explicit deterministic disambiguator (source-order ordinal or signature hash, SCIP-style) — until then they stay deferred by the existing whole-group guard. Cost: changes `qualified_symbol` → `structural_key`/`tree_node_id` for those methods, so candidates must be regenerated and the idempotency proof + rehearsal rerun; the 50 canary rows that are methods are already supersession candidates. Sources: SCIP symbol descriptors (scip-code/scip docs), Kythe VName signature semantics.
        **AST-SYMBOL-03 current exact-resolution census (2026-09-20, read-only):** regenerated from the existing structural resolver with workspace revision `sha256:e2e80507…`; the 461-row plan contains `190` mjs and `271` ts declarations (`338` variables, `46` functions, `36` methods, `30` interfaces, `6` types, `5` classes). The aligned structural proof is `READ_ONLY_BLOCKED`: `461` source-only/path mismatches, `0` exact AST matches. The registry proof cannot be replayed against that regenerated structural artifact (`INPUT_PLAN_RESOLUTION_COHORT_MISMATCH: planRows=461 resolutionRows=0`), so its prior 461-row output is stale and is not combined with this census. The new aggregate receipt is `docs/reports/ast-symbol-resolution-v1.json`; it reports `EXACT=0`, `REGISTRY_MISSING=461`, `AMBIGUOUS=0`, `REVISION_MISMATCH=0`, `resolutionRate=0`, `canonicalAuthority=false`, and `promotionAuthorized=false`. The planner report itself still declares the older `e24bb971…` workspace revision while its rows carry `e2e80507…`; this report/row mismatch is an additional fail-closed freshness defect. No task checkbox or database state was changed.
        **GENERATED GAP BOARD (2026-09-20) — computed by `scripts/atlas/audit-ast-authority-gap-derivation-v1.mjs` from live evidence (read-only; writes only `docs/reports/ast-authority-gap-derivation-v1.json`; re-run with `--markdown` to regenerate; never sets `canonicalAuthority=true`).** `governedImplementation = COMPLETE_READ_ONLY_AUDIT` (23 steps) ≠ `canonicalDataAuthority = NOT_PROVEN`. 12 gates: 1 PROVEN, 4 OPEN/PARTIAL, 7 BLOCKED.
        - `AST-AUTH-01 CURRENT_SOURCE_AUTHORITY_PROVEN` **OPEN** — missing: KNOW-09 `BLOCKED` (worktree fingerprint parity false, 653 mismatches + 8 missing); the current frame is not the admitted frame (admitted `e24bb971…`; the plan's current frame has moved to `3dbc91f5…` — it was `15352bd6…` earlier the same day — so admission needs a FROZEN snapshot of the worktree, not a re-run: every edit, including this session's, moves the frame); 1,058 stale-graph `CURRENT_BINDING_MISMATCH` rows; 14 `SOURCE_UNAVAILABLE` (all git-deleted, need a tombstone class).
        - `AST-AUTH-02 CURRENT_CANDIDATES_REGENERATED` BLOCKED_BY 01 — candidates are stamped with `e24bb971…`, current frame differs; regenerate after admission.
        - `AST-AUTH-03 SEPT_V2_HASH_AND_COORDINATE_CONTRACT` **PROVEN** — per-file digest single-valued and equal to the binding digest for every candidate file group; generation migration drafted (not applied).
        - `AST-AUTH-04 CURRENT_AUTHORITY_CANARY` BLOCKED_BY 01/02 — `ast_generation` column not applied (drafted + rollback-rehearsed only); 0 persisted `sept_v2` rows; needs unambiguous operator apply approval.
        - `AST-AUTH-05 CURRENT_AST_READBACK` BLOCKED_BY 04 — persisted-canary readback (all mismatch counters 0).
        - `SIDE METHOD_SYMBOL_QUALIFICATION` **OPEN** — 161 method rows collide on bare names; class-qualifying leaves 55; convention undecided.
        - `SIDE LEGACY_AST_QUARANTINE` **OPEN** — 11,273 legacy/untagged rows (11,175 with NULL `source_revision`) must stay non-authoritative.
        - `SIDE SOM_REVISION` **OPEN** — 58,365 of 58,365 SOM-assigned packets have NULL `som_revision`; needs a fresh versioned SOM run (cannot be derived).
        - `ONTOLOGY-01 SYMBOL_TO_ONTOLOGY_BINDING` BLOCKED_BY AST-AUTH-05 — needs authoritative `sept_v2` rows to bind.
        - `ONTOLOGY-02 FEATURE_ONTOLOGY_TUPLES_RESOLVED` BLOCKED_BY ONTOLOGY-01 — live: `UNRESOLVED: 539,124` (0 resolved).
        - `FEATURE-01 REVISION_QUALIFIED_FEATURE_MATRIX` BLOCKED_BY ONTOLOGY-02 — no CandidateFeatureMatrix table/artifact (0 `feature_matrix` tables), no frozen CandidateOrdinalMap.
        - `AUTHORITY-01 CANONICAL_AUTHORITY_PROMOTION` BLOCKED_BY FEATURE-01 — derived from qualified input, never flipped.
        **Critical path (derived):** freeze + authorize admission of a worktree snapshot → regenerate `sept_v2` candidates against it → decide method-symbol convention → apply migration + ≤200-row canary (three flags) → readback → ontology binding → resolve tuples → frozen CandidateOrdinalMap → FeatureMatrix. Independent of that path: SOM revision run, `AceBitfrostCacheIdentityV1`↔V2 convergence, classifier calibration.
        **`CLASSIFIER_ROUTING_GUARD_01` — fail-closed guard LANDED in the fanout receipt, calibration still OPEN (2026-09-20; `scripts/atlas/prove-query-fanout-bitfrost-v1.mjs`, receipt `docs/reports/query-fanout-bitfrost-v1.json`, read-only):** `domain.classify` (sklearn NB+LR, `domain-classifier-nblr-v1-…`) is provisional and returns only a top-class probability per model (no distribution). The receipt now sets `routingAdmissible` = a caller-supplied floor (`--min-confidence=<0..1>` / `DOMAIN_MIN_CONFIDENCE`) exists AND both models agree on the label AND both clear the floor AND no classifier warnings; NO default number is invented (`NO_CALIBRATED_FLOOR_SUPPLIED` ⇒ not admissible; `provisional: UNPROVEN_NO_CALIBRATION_SET` always recorded). Exercised: no floor → not admissible; floor 0.9 → `BELOW_FLOOR` (nb 0.551 / lr 0.548); floor 0.5 → ADMISSIBLE. **Limit found:** at floor 0.5 the WRONG label (`ui` for a packet-cache-invalidation query, both models agree) is admitted — confidence ≠ correctness, so a floor alone is insufficient. Still required before any routing use: a held-out labelled evaluation set to calibrate the floor from measured precision, and a `.okf` vocabulary cross-check (the fanout receipt's `okf_validation` stage was PARTIAL — the classifier output named no `.okf` domain/concept). The label may hint fanout only; it never becomes cache identity.
        **`CLASSIFIER_CALIBRATION_SET_DERIVATION_01` — cannot be derived yet; two upstream blockers already documented by existing receipts (2026-09-20, read-only; nothing built):** (a) **Label policy undecided:** `docs/reports/domain-classifier-parity-review-v1.json` = `REVIEWED_NO_PROMOTION` — the rules classifier vs the parity reference agree on **0 of 6** reviewed rows (6 disagreements, 6 taxonomy fallbacks), decision `REJECTED_PENDING_LABEL_POLICY_RECONCILIATION`, next gate "define an operator-approved label hierarchy and bounded classification fixture". Live evidence of the same defect: `atlas_packets.domain_class` has **41 distinct labels but 39 case-folded** — `graph`/`Graph` (10,066 rows) and `database`/`Database` (2,695 rows) are the same label spelled two ways; `primary_domain` is NULL on all 61,718 rows; `predicted_domain`/`domain_confidence` populated on only 4,412. (b) **Lineage blocked:** `domain-classifier-lineage-v1.json` = `CLASSIFIER_LINEAGE_BLOCKED` — of 3,352 classifier rows only 148 have an available `source_revision` and 0 have a source namespace (`RESOLVE_SOURCE_NAMESPACE_AND_REVISION_COVERAGE_BEFORE_LIVE_TUPLE_WIRING`); `domain-classifier-real-admission-v1.json` = `REAL_CLASSIFIER_ADMISSION_BLOCKED` (`SOURCE_NAMESPACE…`). The weak-label bundle (`domain-classifier-weak-label-bundle-v1.json`, `sha256:17b7bb56…`) exists but its 35-row cohort admission shows `PACKET_MISSING` 13 — it is a weak-label proposal source, not a calibration set. **Correction to an earlier assumption:** `atlas_feature_labels` does NOT exist in the live DB (the table named in CLAUDE.md's identity chain is stale). **Therefore:** a calibrated confidence floor needs (1) an operator-approved label hierarchy that folds case variants, (2) a bounded hand-verified fixture with revision/namespace lineage, then (3) measured precision per label — none derivable from the current weak labels without importing their errors (the `ui` mislabel would be in the training signal). Independent, safe now: case-fold report only (no UPDATE) — labels are diagnostics until the hierarchy is approved.
        **`POSTGRES_INDEX_CAPABILITY_V1` + AST-SYMBOL BOUNDARY (2026-09-20, read-only; `scripts/atlas/audit-postgres-index-capability-v1.mjs` → `docs/reports/postgres-index-capability-v1.json`; only SELECT/`EXPLAIN (ANALYZE,BUFFERS,SETTINGS,FORMAT JSON)`/rolled-back `SET LOCAL`):** boundary frozen — ast-grep/Tree-sitter emit `StructuralMatchV1` evidence (sourceRef, sourceRevision, verified UTF-8 span, node kind, symbol name, signature, parent span); the SYMBOL REGISTRY decides identity (`EXACT` = source_ref + source_revision + node_kind + qualified name/signature + verified span/parent; `REGISTRY_MISSING`/`AMBIGUOUS`/`REVISION_MISMATCH`/`PATH_MISMATCH`/`PARENT_MISMATCH` fail closed; only `EXACT` may enter authoritative symbol/ontology promotion; name-only/fuzzy stays evidence). **The registry already exists:** `atlas_symbol_registry` 10,504 rows (`stable_symbol_id`, `canonical_key`, `canonical_qualified_name`, `registry_revision`) and `atlas_symbol_versions` 479 rows (`symbol_version_id`, `source_ref`, `source_revision`, `workspace_revision`, `qualified_name`, `byte_start/end`, `packet_key`, `candidate_ordinal`) — the resolver target; AST-SYMBOL-01 (contract), -02 (resolver), -03 (exact-resolution proof, AMBIGUOUS/MISSING fail closed) are NOT built or measured yet (only 479 versions vs 3,043 candidate files/24,971 declarations, so expect mostly `REGISTRY_MISSING`). **PG18 verdicts (server 18.4, `io_method=worker`, `effective_io_concurrency=16`, `pg_trgm 1.6`, `vector 0.8.3`, no `btree_gin`):** `PG18-SCHEMA-01` PROVEN (5 contract tables, 0 missing columns); `PG18-INDEX-02` **GAPS: `atlas_symbol_versions` has NO index on `source_revision` or `qualified_name` — exactly the resolver's `EXACT` match keys** (table is small, 479 rows, so not yet a latency problem, but the resolver contract needs them; a `CREATE INDEX` is a schema change — drafted nowhere, needs approval); `PG18-PLAN-03` PROVEN (3 fixtures captured as plan JSON); `PG18-AIO-04` `PG18_AIO_CAPABLE` (worker) / execution `NOT_OBSERVED` (0 in-flight `pg_aios` handles — not a failure; needs a cold I/O-heavy fixture); `PG18-BITMAP-05` `BITMAP_PLAN_GENERATABLE` 3/3 (forced probe), planner-selected bitmap 2/3 (`ast_by_path_kind` correctly chose Index Scan — not a failure), **BitmapAnd combining NOT shown** (each fixture had one usable selective index; needs a fixture with two independently selective indexed predicates); `PGVECTOR-06` capability only — HNSW on `codebase_chunk_index.content_embedding` present, `iterative_scan` supported (0.8+), exact-vs-HNSW filtered parity `NOT_RUN`. Optional `pg_trgm` GIN on `atlas_symbol_registry.canonical_name` absent (optional). Boundary kept: pgvector HNSW is not folded into the B-tree/GIN bitmap layer; one logical semantic vote regardless of executor.
- **`POSTGRES_INDEX_CAPABILITY_V1` refresh (2026-09-21, resource-guarded, read-only):** rerun against live PostgreSQL 18.4 confirms `io_method=worker`, `effective_io_concurrency=16`, schema and plan capture proven. Bitmap plans are generatable for 4/4 bounded fixtures and planner-selected for 2/4; `BitmapAnd` combination remains unobserved. Resolver-key gaps remain: `atlas_symbol_versions.source_revision` and `qualified_name` have no indexes. pgvector HNSW capability is present, but parity is not claimed because the revision-qualified cohort is empty. Report: `docs/reports/postgresql18-index-capability-v1.json`; no schema, vector, or data writes.
        **`DOMAIN-VOCAB-01` — PROPOSAL generated, NOTHING applied (2026-09-20; `docs/reports/domain-vocab-proposal-v1.json`, `applied:false`, `requiresOperatorApproval:true`; no UPDATE to any row):** reconciles the 39 case-folded live `atlas_packets.domain_class` labels (61,718 rows) with the classifier's canonical taxonomy `parent-atlas-domain-taxonomy-v1` (`domain-taxonomy.ts`, 9 domains: auth, ui, retrieval, network, database, cache, agent, graph, ml). **Finding — `domain_class` mixes two dimensions:** 6 labels / **22,353 rows (36%)** are exact canonical domains (after folding `graph/Graph`, `database/Database`); **15 labels / 29,331 rows (47.5%) are NOT domains** but artifact/feature kinds (`documentation` 6,782, `test` 4,228, `gpu` 3,876, `compiler` 3,766, `tool` 3,695, `other` 5,441, `utility`, `library`, `infrastructure`, `case_management`, `evidence_upload_storage`, `repair_workflow`, `document_processing`, `citation_engine`, `legal_reports`) — they need a slot in a hierarchy outside the 9 domains, not a rename; 9 labels / 4,987 rows are cleanly mappable (`FOLD_ALIAS` `machinelearning→ml`, `authentication→auth`; `SUBTYPE_OF` `rag_retrieval→retrieval`, `agent_orchestration`/`mcp_agents`/`trace_mcp→agent`, `graph_topology→graph`, `cache_layer→cache`, `auth_login_register→auth`); 7 labels / 5,025 rows are `AMBIGUOUS_NEEDS_REVIEW` (`embedding`, `embedding_indexing`, `api`, `frontend`, `backend`, `cluster_analysis`, `memory_optimization`); **2 labels / 22 rows are not labels at all** (`classification failed` 21, `cluster.summary` 1 — error/system strings stored in `domain_class`; quarantine); canonical `network` has NO live label. **`.okf` is a different vocabulary:** `.okf/domains/*` = 3 architecture-level ontology domains (`atlas.feature-intelligence`, `atlas.execution`, `atlas.structured-value`), so `.okf`↔label reconciliation is a mapping layer, not a rename (this also explains the fanout receipt's PARTIAL `.okf` stage: no classifier label could match an `.okf` domain id). **Next (needs operator):** approve/edit the hierarchy (domain vs artifact-kind axes), then `DOMAIN-CAL-02` (100–300 hand-reviewed, revision-qualified examples). Tranche order recorded: DOMAIN-VOCAB-01 → DOMAIN-CAL-02 → NLP-EXTRACT-03 (LangExtract→GroundedExtractionV1 via :8095, spans mandatory) → SYMBOL-LINK-04 → FEATURE-LINK-05 → PG18-PLAN-06 → SEMANTIC-07 (exact vs HNSW) → CLUSTER-08 (CPU KMeans oracle vs cuVS; SOM separate) → RANK-09 → TENSOR-10 → CONTEXT-11 → SYNTH-12; no deep RL / neural domain classifier until labels + `.okf` reconciliation + revision-qualified feature production exist.
        **`DOMAIN-VOCAB-01` CORRECTION (2026-09-20, same day — found by rg/DB search after the user asked whether a hierarchy already exists; proposal file regenerated as `atlas.domain-vocab-proposal.v2`, still `applied:false`):** a DOMAIN HIERARCHY ALREADY EXISTS in Postgres and the first proposal missed it. `atlas_domain_ontology` (17 rows; `group_id`, `parent_group_id`, `taxonomy_level`) = 13 top-level groups (api, auth, cache, compiler, database, devops, error-handling, frontend, gpu, graph, machine-learning, retrieval, test) + 4 level-1 children (`database.postgresql`, `devops.env-config`, `devops.process-mgmt`, `frontend.sveltekit`); also `taxonomy_nodes` 5,527 / `taxonomy_edges` 62,802 (derived), `feature_domain` 61,659 and `feature_domain_facts` 123,376 (with `domain_probabilities`, `classifier_version`), `ontology_keywords`, and an EMPTY versioned table `domain_taxonomy_v1` (`parent_domain_id`, `deprecated_at`, `replaced_by` — the intended home for a versioned/deprecatable hierarchy). So THREE domain vocabularies coexist: packet labels (39 case-folded), the code taxonomy `CANONICAL_DOMAINS` (9: auth, ui, retrieval, network, database, cache, agent, graph, ml) and the DB `atlas_domain_ontology` (13+4); they overlap only partly (ontology lacks `agent`/`network`, code taxonomy lacks gpu/compiler/test/api/devops/error-handling; `ui`≈`frontend`, `ml`≈`machine-learning`). **Corrected rebucketing of the 61,718 packet rows against `atlas_domain_ontology`:** exact 9 labels / 31,676 rows (51.3%); fold-alias (`ui→frontend`, `machinelearning→machine-learning`, `authentication→auth`, `infrastructure→devops`) 4 / 6,896; subtype (`rag_retrieval→retrieval`, `graph_topology→graph`, `cache_layer→cache`, `auth_login_register→auth`) 4 / 2,119 ⇒ **40,691 rows (65.9%) map cleanly**; ambiguous or absent from the ontology 9 / 3,682 (incl. the whole `agent` family — `agent`, `agent_orchestration`, `mcp_agents`, `trace_mcp` — and `embedding*`, `cluster_analysis`, `memory_optimization`, `backend`); artifact kinds not domains 5 / 16,664 (`documentation`, `other`, `utility`, `library`, `tool`); product feature areas in neither vocabulary 6 / 659 (`case_management`, `evidence_upload_storage`, `repair_workflow`, `document_processing`, `citation_engine`, `legal_reports`); noise 2 / 22. **The v1 claim that `gpu`/`compiler`/`test`/`frontend`/`api` are "not domains" was WRONG** (they are level-0 groups in `atlas_domain_ontology`). **The decision is therefore an OWNERSHIP decision, not a hierarchy-authoring one:** which vocabulary owns `domain_class` — recommended: `atlas_domain_ontology` (already hierarchical, DB-resident, versionable via `domain_taxonomy_v1`), with `CANONICAL_DOMAINS` in code aligned to it by an explicit mapping (add `agent`/`network` to the ontology or map them), plus a separate axis for artifact kinds. Duplication Prevention: do not create a fourth vocabulary.
        **`SCHEMA_TOURNAMENT_V1` — what to update: REUSE/ALTER existing tables, NO new v2 tables (2026-09-20; read-only; `scripts/atlas/audit-schema-tournament-v1.mjs` → `docs/reports/schema-tournament-v1.json`; `applied:false`, no DDL/DML run; rubric: new-table +3, duplicate-owner +3, mutates-canonical +5, DDL-on-existing +1, backfill +1, FK-risk +1, lowest wins, ties prefer reuse):** 12 capabilities scored → **`createNewWinners: []`**; tally REUSE_POPULATE 4, ALTER_EXISTING 3, REUSE_EXISTING 2, ARTIFACT_ONLY 2, VIEW+REUSE 1. **Key fact: the ontology/extraction schema already exists and is EMPTY** (0 rows each): `atlas_ontology_linked_tuples` (has `packet_key`, `tree_node_id`, `token_index`, `part_of_speech`, `label_kind`, `ontology_ids`, `concept_ids`, `evidence_refs`, `evidence_span`, `evidence_state`, `lifecycle`, `provenance`, `producer_revision`, `relation_revision`), `atlas_taxonomy_assignment_candidates` (has `taxonomy_revision`/`semantic_revision`/`graph_revision` + lexical/NLP/graph/semantic-neighbor evidence lanes + `semantic_score`/`community_affinity`), `atlas_ontology_concepts` (2 FK dependents) / `atlas_ontology_relations`, `domain_taxonomy_v1` (versioned hierarchy: `parent_domain_id`, `deprecated_at`, `replaced_by`), `registry_topology_projection` (`som_cluster`, `kmeans_cluster`, `page_rank_score`, `community_id`, `materialization_version`). Creating `*_v2` copies would add competing owners. **Decisions (recommendations, all unapplied):** (1) `DOMAIN_HIERARCHY_OWNER` → populate `domain_taxonomy_v1` from `atlas_domain_ontology` (no DDL) — needs the operator ownership decision first; (2) `LABEL_ALIAS_NORMALIZATION` → deprecated-label rows with `replaced_by` + a normalizing VIEW; do NOT `UPDATE atlas_packets.domain_class` (61,718 rows, loses classifier lineage; costed +5); (3) `GROUNDED_EXTRACTION_TOKEN_EVIDENCE` → populate `atlas_ontology_linked_tuples` (verify `evidence_span` holds `UTF8_PARSER_BUFFER_V1` byte offsets first); (4) `TAXONOMY_ASSIGNMENT_CANDIDATES` → populate existing table; (5) `CONCEPTS_AND_RELATIONS` → populate `atlas_ontology_concepts`/`_relations` (flag `atlas_concepts`, `concept_records`: 0 rows, 0 FK dependents = DEAD/duplicate candidates — archive, never delete); (6) `TUPLE_OWNER` → keep `feature_ontology_tuples` (539,124 UNRESOLVED) as the 14.3b resolution owner; `atlas_ontology_tuples` (0 rows) overlaps it and `atlas_ontology_linked_tuples` — do not promote; `registry_ontology_tuples`/`ontology_domain_tuples` not audited; (7) `SYMBOL_LINK` → ALTER (index-only) `atlas_symbol_versions(source_revision, qualified_name)`; (8) `AST_GENERATION` → the drafted `20260920` migration; (9) `TOPOLOGY_FEATURES` → ALTER empty `registry_topology_projection` (+`som_revision`, `kmeans_revision`, `representation_revision`, `candidate_snapshot_revision`; free because 0 rows); (10) `FEATURE_MATRICES` → ARTIFACT_ONLY (Arrow/mmap + JSON receipt; wire-format rule) — no table; (11) `CALIBRATION_EXAMPLES` → checked-in versioned JSONL fixture, no table until volume demands; (12) `KEYWORD_LEXICAL_FEATURES` → reuse `ontology_keywords` (31,097). **What needs approval:** 3 DDL items (symbol_versions indexes, `ast_generation`, topology revision columns) + 1 VIEW; 4 bounded-canary population writes; 1 ownership decision; 0 canonical-row mutations. **Reindex / re-materialize (after the freeze + regenerated candidates, not before):** `atlas_symbol_versions` (479 rows vs 3,043 candidate files); a fresh versioned SOM + KMeans run (revisions cannot be derived); `feature_domain`/Qdrant domain payload only after the label mapping is approved; nothing to reindex for the empty ontology tables. **SCHEMA_TOURNAMENT_V1 FOLLOW-UP (2026-09-20, read-only) — CORRECTS decision (3) and closes the two "owed" audits:** (a) **`atlas_ontology_linked_tuples` is REUSE + ALTER, not populate-as-is.** `evidence_span` is unconstrained `jsonb` (nothing guarantees `UTF8_PARSER_BUFFER_V1` byte offsets); the table has **no `source_revision` / `workspace_revision` column** (revision lineage would live only in unvalidated `provenance`/`evidence_span` JSON — violates the revision-qualified rule); and its `label_kind` CHECK allows only `pos`/`tag`/`ontology`, so LangExtract classes (entity/claim/event/relation/symbol) do not fit without mapping into `ontology`/`tag` or widening the CHECK. Existing good fits: `lifecycle` CHECK (`OBSERVED`/`DERIVED`/`SUPERSEDED` — grounded evidence = `OBSERVED`), `confidence` 0..1 CHECK, `schema_version` default `ontology-linked-tuple.v1`, `producer_revision`, `relation_revision`. Required before any population: writer-side Zod contract `GroundedExtractionV1` (`evidenceSpan = {sourceRef, sourceRevision, startByte, endByte, offsetBasis:'UTF8_PARSER_BUFFER_V1'}`, spans mandatory, reject otherwise) + a small ALTER (add `source_revision`, `workspace_revision`; optionally widen/extend `label_kind`) — still NO new table. DDL approval count is therefore **4** (`atlas_ast_nodes.ast_generation`, `atlas_symbol_versions` indexes, topology revision columns, `atlas_ontology_linked_tuples` revision columns/`label_kind`) + 1 VIEW. (b) **Tuple-table overlap audited — FIVE tuple-ish tables coexist:** `feature_ontology_tuples` 539,124 (100% UNRESOLVED; keep as 14.3b owner), `ontology_domain_tuples` 61,659 (`packet_key`, `domain_class`, subject/predicate/object, `materialization_version` — a populated per-packet domain-tuple projection), `atlas_ontology_tuples` 0, `registry_ontology_tuples` 0 (`packet_key`, subject/predicate/object, `corroboration_count`), `atlas_ontology_linked_tuples` 0 (token-level grounded evidence — the NLP-EXTRACT-03 target). `registry_ontology_tuples` and `atlas_ontology_tuples` are empty duplicate candidates (archive, never delete); `ontology_edges` (252,102 packet→packet edges) is a separate graph-edge table, not a tuple owner. Do not add a sixth.
        **`SCHEMA_ALTERS_DRAFT_01` — drafted + ROLLBACK-REHEARSED, NOT APPLIED (2026-09-20):** `sveltekit-frontend/drizzle/manual/20260920b_atlas_ontology_schema_alters.sql` — additive, idempotent (`IF NOT EXISTS`), data-free, no new tables, no constraint changes: (1) `idx_asv_source_revision`, `idx_asv_qualified_name` on `atlas_symbol_versions` (the resolver's EXACT-match keys the capability audit found missing); (2) `registry_topology_projection` +`som_revision`, `kmeans_revision`, `representation_revision`, `candidate_snapshot_revision` (nullable; empty table; revisions must come from a real versioned run, never invented); (3) `atlas_ontology_linked_tuples` +`source_revision`, `workspace_revision` + partial index `idx_aolt_source_revision (source_ref, source_revision)`. Rehearsal (`BEGIN` → migration → readback → `ROLLBACK`): 3/3 indexes, 4/4 topology columns, 2/2 linked-tuple columns present inside the txn; both new `atlas_symbol_versions` indexes report `bitmap_scan`; row counts unchanged (479 / 0 / 0); after rollback 0/0/0 persisted. Deliberately excluded: widening `label_kind` CHECK (which LangExtract classes to admit is a design decision), `ast_generation` (own migration `20260920_…`), any INSERT/UPDATE. Applying it (with `ast_generation`) is the 4-item DDL approval; re-run `audit-postgres-index-capability-v1.mjs` afterwards to confirm the `PG18-INDEX-02` gap closes.
        **`VALIDATION_CORPUS_INVENTORY_V1` — ONE shared core, TWO adapters (2026-09-20, read-only; `docs/reports/validation-corpus-inventory-v1.json`; measured from git ls-files + live tables, `NOT_MEASURED` where not):** shared core = SOURCE-TEXT-ENCODING-01, revision-qualified source identity, `UTF8_PARSER_BUFFER_V1` spans, `GroundedExtractionV1`, `.okf`, `CandidateOrdinalMap`+checksum, receipts — adapters differ in CORPUS and VALIDATORS, never in identity or span rules. Ornith receives both, tagged `adapter: WORKSTATION | LEGAL | BOTH` in `ContextManifestV1`; retrieval lanes/validators filter by adapter; identity namespaces never merge. **WORKSTATION adapter (10 classes; tracked files md 7,987 / ts 7,712 / mjs 4,006 / json 1,607 / svelte 940 / sql 662 / py 591 / mts 567 / ps1 308 / proto 117):** only TS/JS has an AST lane (24,971 declarations over 3,043 files, `sveltekit-frontend/src` pilot); svelte, python, SQL, shell, proto, go, CUDA/C++, WGSL, Cypher, Dockerfile/compose have NO ast-grep/Tree-sitter lane evidenced; CST byte round-trip unproven; missing corpora: scope-V2 roots behind an injective path policy, class-qualified methods + overload disambiguator, Svelte three-embedded-language fixtures, SQL parser lane + PG18 syntax-regression corpus (e.g. removed `isfinite(float8)`), Jinja chat-template validation corpus (load-bearing for Ornith tool calls), launcher-contract fixtures, JSON-Schema-per-contract corpus. **LEGAL adapter (5 classes) — live corpus is near-EMPTY:** evidence 806 rows, cases 11, legal_documents 3; statutes / citations / legal_precedents / document_chunks / statute_chunks / evidence_vectors all 0; every legal Qdrant collection (`evidence_items`, `legal_documents`, `legal_cases`, `court_opinions`, `legal_canon_chunks`, `knowledge_base`) has 0 points — CLAUDE.md's Qdrant table listing them "Active" is STALE. Existing assets: `legal-chunker.ts` (ARTICLE/SECTION/§ structure), regex entity extraction (EMAIL/PHONE/DATE/CITATION/STATUTE/MONEY). Missing: public-domain statute/opinion fixtures, citation grammar (reporters, short-form, id., supra) + gold resolution set, holding/headnote labels, OCR-noise cases, transcript speaker-turn fixtures; constraint: fixtures must be PII-safe synthetic or public-domain — real case evidence never becomes a shared corpus. **Cross-cutting adversarial classes (9):** encoding (4 BOM files known; UTF-16/CRLF-mix not measured), path-identity collisions (250 measured), duplicate names/overloads (161 measured, 55 survive class qualification), non-file source refs (`feature:`/`task:`/`proto:`), git-deleted refs (14), generated/vendor/minified, syntax-error/partial/empty/huge files (must fail closed), embedded multi-language, case-only path differences. **Headline gaps:** fixture density is tiny (33 fixture files vs 2,407 spec files); no negative corpus measured for any language; the only labelled set is a 142-row UNREVIEWED draft. **`DOMAIN-CAL-02` DRAFT (2026-09-20; `docs/reports/domain-calibration-draft-v1.jsonl`, 142 rows, 12 ontology groups × ≤12, deterministic `md5(packet_key)` order, every row `reviewStatus: UNREVIEWED`, labels proposed from EXISTING weak labels — a human must set `reviewedGroup`):** only **49/142** resolve to a revision-qualified binding in the admitted frame (`BINDING_EXACT`, per group: frontend 11, cache 8, api 7, database 6, auth 4, gpu 3, retrieval 3, graph 3, test 2, devops 2); **93 UNRESOLVED** (43 file paths outside the admitted bindings — logs, `memory/runs`, precompiled pgvector, `neschrom97/cards` — and 50 non-file refs) and must be excluded or repaired before any calibration use; `error-handling` and `machine-learning`/`compiler` are thin or absent among resolved rows. **Tournament mappings feed the tranche order:** DOMAIN-VOCAB-01 → DOMAIN-CAL-02 (artifact fixture) → NLP-EXTRACT-03 (→ `atlas_ontology_linked_tuples`) → SYMBOL-LINK-04 (→ `atlas_symbol_versions` + indexes) → FEATURE-LINK-05 (artifacts + `registry_topology_projection`) → PG18-PLAN-06 → SEMANTIC-07 → CLUSTER-08 → RANK-09 → TENSOR-10 → CONTEXT-11 → SYNTH-12. Design notes adopted: `:8095` NLP sidecar is the Python extraction/classification EXECUTOR and never an identity owner (it emits evidence only); `TokenFeatureMatrixV1[T,F]` (a 4×6 = 4 tokens × 6 features is a TEST FIXTURE, not a fixed production shape; first columns lexical, symbol, domain, concept, grounding, cacheResidency) is control/evidence state and is never Ornith KV; four matrices (Query vector, Candidate `[C,25]`, Token, Topology) share one `CandidateOrdinalMap` + checksum; KMeans (K=64/128/256) and SOM 20×20 are derived locality/routing features, never identity or a semantic vote.
        **AST_SCOPE_V2_CENSUS + FOREIGN-COHORT PLAN (2026-09-20, read-only, no writes; two scratch scripts only):**
        - **Census of the admitted snapshot (25,542 sources; parseable = .ts/.mts/.cts/.js/.mjs/.cjs; drift = KNOW-09 list):** `sveltekit-frontend/src` 4,725 parseable (209 drifted) = V1; repo-root `scripts` 2,878 (99); `sveltekit-frontend/scripts` 1,918 (67); `sveltekit-frontend/tests` 1,292 (1); `packages` 563 (**192 drifted, 34%**); `claude-mem` 508 (4 vendor-ish); legacy root `src` 192 (2); `gsd_archives` 113; `mcp-server-mcp` 60; the rest < 60 each. V2 candidates in a sensible order once KNOW-09 clears: packages (canonical contract layer, but most drifted), scripts, sveltekit-frontend/scripts, sveltekit-frontend/tests.
        - **`ACTIVE_APP_RELATIVE_V1` is NOT injective across the full repo (measured):** 250 normalized keys collide — 54 between legacy repo-root `src/...` and `sveltekit-frontend/src/...`, 196 between repo-root files and their `sveltekit-frontend/*` copies (e.g. `.claude/commands/opsx/apply.md`). V1 is safe only because the regenerator ingests `sveltekit-frontend/src/` alone. Any V2 needs a root-namespaced or otherwise injective policy BEFORE widening, and existing rows keyed `src/...` are ambiguous between the legacy root tree and the app tree (54 such paths).
        - **Foreign-path cohort — DO NOT quarantine as planned.** All 3,498 rows are `class` kind from ONE foreign root (`C:\Users\james\Documents\Codex\2026-05-12\ve-updated-the-local-quantization-notebook`, folder still exists) across 84 files, no `source_ref_key`, no `source_revision`, no parents; only 234 rows (6.7%) have a path suffix that matches a current-table path (e.g. `tree-sitter-chunker.ts` does not exist in this repo). CRITICAL: **`atlas_class_search_index_v1` (3,675 rows) references all 3,498 of them** (every one has an embedding; FK `atlas_class_search_index_v1_tree_node_id_fkey`), and `atlas_features`/`atlas_knowledge_objects` also FK to `atlas_ast_nodes`. The reader `atlas-ast-evidence-reader-v1.ts` does not filter `superseded_by`, and `superseded_by` needs a replacement row (self-FK) that these rows do not have — so the earlier "mark superseded" plan is both infeasible and would not hide them. Revised options (operator decision, nothing applied): (a) keep as an explicit EXTERNAL_REFERENCE corpus and add a reader/query filter (`relative_path !~ '^[A-Za-z]:'`) for active-canonical joins — no row changes, recommended; (b) rebuild the class-search index from this repo's current bytes, then retire the foreign-backed index; (c) leave as is. Rows are never re-keyed or deleted.
        **CROSS-SESSION EXPLANATION of AST_BF_18B (2026-09-20):** the two digest-diverged files are exactly the files a concurrent GPU-residency session reported editing (`candidate-feature-gpu-residency-v1.ts`, `unified-residency-adapter-v1.spec.ts`): both are `M` in git with mtimes 00:28 and 00:24 today and byte sizes 17,072 / 6,516 (matching my recorded current sizes); the same session added untracked `services/atlas-gpu-8098/shared_residency.py`. Its claims (31 tests, MEM-04/05 still unproven) were NOT re-verified here — unrelated to this change. Consequence: live edits by other sessions will keep widening drift against the admitted snapshot (KNOW-09), so a bulk AST apply needs a REFRESHED admitted snapshot immediately before it (or per-file digest re-check at write time), not the 2026-09-14 one.
        **WRITE-TIME DIGEST RE-CHECK BUILT + NEGATIVE-TESTED (2026-09-20, rehearsal only):** `apply-ast-declaration-canary-v1.mjs` now re-reads every picked file via `decodeSourceTextEnvelope` immediately before writing and requires `rawContentHash` to equal the row's admitted digest; diverged, missing, or no-`raw_source_ref` files are skipped and listed in `steps.writeTimeDigestCheck` (proof hand-off now carries `raw_source_ref`; new `--eligible=` override for tests). Negative test: one file's digest deliberately corrupted in a scratch copy (`.tmp/atlas/ast-canary-eligible-NEGATIVE-test.jsonl`, scratch) → that file skipped (`skippedDiverged:["src/ambient-legacy.d.ts"]`), 49 rows rehearsed, 0 id/field mismatches; positive run on the real hand-off → 14/14 files pass, 50 rows, both `REHEARSAL_PROVEN`, ROLLED_BACK, table 11,273 before and after. This closes the "refresh the admitted snapshot or re-check per file at write time" requirement for the per-file case only — it does NOT refresh the KNOW-09 snapshot/authority, which remains BLOCKED; persistence still needs `--apply --operator-approved --know09-reviewed`.
        **CANARY-REPLACEMENT PLAN — FINDINGS (2026-09-20, read-only + one rolled-back transaction; table still 11,273):**
        - The 50 wrong-convention canary rows have **0 dependents**: no rows in `atlas_class_search_index_v1` / `atlas_features` / `atlas_knowledge_objects` reference them, and their only children are 8 methods that are themselves canary rows.
        - **A replacement row CANNOT coexist with a canary row.** `atlas_ast_nodes` is UNIQUE on `(repo_id, relative_path, node_kind, qualified_symbol, normalized_node_hash)` and the writer sets `normalized_node_hash = sha256(structural_key)`, identical for the old and aligned row. Rolled-back test on `src/ambient-legacy.d.ts#interface:ProcessEnv`: file row inserted (1), the aligned interface row (`5b3891500d38`, id computed correctly) was **silently dropped by `ON CONFLICT DO NOTHING`**; the canary row `ab7b6c2d097a` kept the slot. So the earlier idea "write aligned rows, then mark canary `superseded_by`" is impossible as designed.
        - **WRITER HAZARD found:** `writeAtlasAstNodes` returns `treeNodeIds` for every node whether or not the INSERT happened. Only the caller's inserted-count and post-write readback catch a silent conflict skip (the apply script does both; any other caller would not). Recommendation: make the writer report per-node `inserted` flags.
        - Also: readers do not filter `superseded_by`, so even a working supersession chain would leave both rows visible to active reads.
        - **Options (operator decision, NOT applied):** (A, recommended) in-place re-key of the 50 rows inside one transaction — first insert the missing file rows, then UPDATE `tree_node_id`/`parent_tree_node_id` to the aligned ids (FK is DEFERRABLE INITIALLY DEFERRED; PK change is safe because there are no external dependents), after writing an archive manifest of the prior 50 rows (SHA-256, per the archive-not-delete rule); result = one row per identity, matches the existing convention. (B) tombstone the canary rows' `normalized_node_hash`, insert aligned rows, set `superseded_by` — keeps history but leaves duplicates visible to readers. (C) leave the 50 as-is and exclude them from active reads.
        **OPTION A (in-place re-key of the 50 canary rows) — TOOL BUILT, REHEARSED, NOT APPLIED (2026-09-20):** an operator "yes" to the A/B/C question was taken as choosing A, NOT as approval to write (lesson from the earlier canary). New `scripts/atlas/rekey-ast-canary-rows-v1.mjs`; the proof now also exports `.tmp/atlas/ast-conflicts-v1.jsonl` (aligned id + existing id for each of the 122 conflicts; 50 are canary-owned). Rehearsal (`REHEARSAL_PROVEN`, ROLLED_BACK): plan 50 = live `ast-grep-napi` non-file rows 50; dependents 0/0/0, outside children 0, superseded refs 0; pre-image archived to `.tmp/...rehearsal.json` (sha256 `82795ba2…3773`, 50 rows); 10 missing file rows inserted (10/10); 50 rows re-keyed in place (`updated_at=now()`); `SET CONSTRAINTS ALL IMMEDIATE` PASS; readback: 50 rows at aligned ids, 0 old ids remaining, 0 structural_key/parent problems, parent-kind matrix correct (26 interface/10 function/5 type/1 class → file; 8 method → class); after rollback table 11,273 with 50 canary rows and 0 file rows (verified by psql), no `deeds_labs/archive/2026-09-20` created, `docs/archive-manifest.json` untouched. PERSIST needs ALL of `--apply --operator-approved --know09-reviewed --confirm-rekey-option-a`; it then writes the pre-image to `deeds_labs/archive/<date>/` and appends a manifest entry (archive-not-delete; recovery = restore old ids from that file). Error this round: my first rehearsal FAILED_ROLLED_BACK on a wrong assertion (compared row count to the pre-file-insert count); fixed, rehearsal now passes. Still true: this fixes only the 50 rows — 72 old `tree-sitter` conflicts and the other caveats above remain.
        **WRITER FIX + KNOW-09 RE-CHECK (2026-09-20, no DB writes):** (1) `scripts/atlas/lib/atlas-ast-nodes-writer.mjs` now also returns `insertedFlags[i]` (true only when the INSERT really happened; `treeNodeIds` remain the COMPUTED ids) — additive/backward compatible; the apply and re-key rehearsals were rerun after the change: both `REHEARSAL_PROVEN`, table still 11,273 / 50 canary rows. Callers should adopt the flags (the two scripts here still rely on count checks + readback, which do catch a skipped insert). (2) Re-ran `npm run atlas:docs:knowledge-source-snapshot-live` (read-only): still `BLOCKED`, `nextGate: KNOW-09-SOURCE-AUTHORITY-RECONCILIATION`; registry parity intact (24,456 exact matches) but worktree parity false — **645 mismatched + 8 missing = 653 issues at 08:16Z vs 639 + 8 = 647 at 06:51Z** (drift grew ~6 files during this session from concurrent edits; the receipt on disk had already been refreshed by another session at 07:57Z with the same 653), repair plan still bound to a different revision (`7ac27f1c…` vs admitted `e24bb971…`). The KNOW-09 gate therefore has NOT cleared; persistent writes remain blocked. (3) Error/observation: Python could not open `atlas-ast-nodes-writer.mjs` for writing (Errno 22, 8 retries over ~24 s) while the Edit tool wrote the same file immediately afterwards — so the recurring Windows write failures are not always a short-lived lock and may be specific to the Python path; cause still uncaptured.
        **KNOW-09 refresh correction (2026-09-20, read-only):** the latest `atlas:docs:knowledge-source-snapshot-live` run remains `BLOCKED`; registry parity is 24,456/24,456, worktree fingerprint parity is false, and the current snapshot receipt reports **672 issues**. This supersedes the earlier 653-count observation for current status only; no source frame was admitted and no persistent write is authorized. The follow-up NLP blocker audit was refused by the resource guard at 3.97 GiB free memory, so its prior report must not be treated as refreshed by this run.
        **14.3 OPERATOR DECISION QUEUE (2026-09-20; everything below is built/rehearsed and waiting — nothing else is unblocked without these):**
        | # | Decision | Recommended | Tool ready (rehearsal-proven) |
        |---|---|---|---|
        | 1 | KNOW-09 source authority (drift 653, repair plan bound to another revision) — gates ALL persistent writes | reconcile in the owning session first | `npm run atlas:docs:knowledge-source-snapshot-live` |
        | 2 | Re-key the 50 wrong-parent canary rows (option A) | A | `rekey-ast-canary-rows-v1.mjs` (4 flags to persist) |
        | 3 | Bulk AST apply (21,530 net-new rows incl. file rows) — after #1, per-file digest re-check already built | canary of 50 under the corrected convention, then bounded batches | `apply-ast-declaration-canary-v1.mjs` (3 flags) |
        | 4 | Foreign-path class rows (3,498, back `atlas_class_search_index_v1`) | keep + reader filter, rebuild index later | none (no rows change) |
        | 5 | Scope V2 needs an injective path policy (250 collisions under `ACTIVE_APP_RELATIVE_V1`) | root-namespaced keys before widening | census only |
        | 6 | Domain tuples: T0 exact resolve (63,352) + T1 alias tier (17,752) + ontology gaps (21,694) + `domain:<group_id>` value choice | apply T0 after #1, approve T1 list | `resolve-domain-tuples-exact-v1.mjs` (4 flags) |
        | 7 | `USES_CONCEPT` lexical tags (353,973) — never promote to concepts; stoplist? | LEXICAL_TAG | none |
        | 8 | Packets over vendored/venv/backup/tmp/generated content (42,302, 68.5%) | exclude from canonical packets, archive, never delete | none |
        | 9 | 14.3c matrix producer | blocked on #1 and #8 (packets have 0 source_revision) | none |
        Process note: an earlier "implement end to end" was taken as approval for a persistent 50-row write before its gates existed; all write tools now default to rehearsal + rollback and need explicit flags. Ambiguous "yes" replies must not be treated as write approval.
        **CURRENT_WORKSPACE_FRAME_SELECTOR policy replay (2026-09-20, read-only):** `scripts/atlas/test-current-workspace-frame-selector-v1.mjs` passes **10/10**. Coverage now proves CLI override, explicit authority manifest, environment override, admitted authority precedence over derived fallback, conflicting authority fail-closed, and derived/override selections remain `canonicalAuthority=false`; no receipts or source rows are mutated. This proves selector policy only; the live worktree still fails `CURRENT_SOURCE_AUTHORITY_PROVEN` because it is dirty and differs from the admitted snapshot.
        **OPERATOR ANSWERS RECORDED (2026-09-20, via structured question):** (1) KNOW-09: **wait for reconciliation** — all persistent writes stay blocked; only read-only + rehearsal work. (2) 50-row re-key: **apply option A only after KNOW-09**. (3) Domain tuples: **T0 exact + T1 high-confidence aliases** (81,104 tuples) when writes are allowed — T2/no-fit/generic/review/sentinel stay untouched. (4) Packet scope: **decide per top-level folder** — table below for the operator to mark keep/exclude (nothing changed).
        **PER-FOLDER PACKET TABLE (61,718 packets; "resolvable" = file exists in admitted binding revision `e24bb971…`; suggested class is MY suggestion for you to mark, not a decision):**
        | Folder | Packets | Resolvable | Suggested |
        |---|---|---|---|
        | `scripts` | 8,845 | 1,865 | KEEP resolvable; review the 6,980 unresolved (generated reports) |
        | `neschrom97` | 8,178 | 0 | REVIEW (generated NES/CHR97 cards) |
        | `sveltekit-frontend/docs` | 4,481 | 4,431 | KEEP |
        | `sveltekit-frontend/src` | 4,226 | 4,067 | KEEP (V1 scope) |
        | `.python311` | 4,140 | 0 | EXCLUDE (Python virtualenv) |
        | `crates` | 3,749 | 22 | REVIEW (build artifacts vs Rust sources) |
        | `src` (legacy root) | 3,260 | 2,895 | KEEP/REVIEW (ambiguous with the app tree — see path-policy collisions) |
        | `simd-bridge` | 3,075 | 80 | REVIEW (native build outputs) |
        | `sveltekit-frontend/memory` | 2,491 | 874 | REVIEW |
        | `llama-cpp-turboquant-gemma4` | 2,381 | 0 | EXCLUDE (vendored) |
        | `sveltekit-frontend/scripts` | 1,783 | 1,719 | KEEP |
        | `docs` | 1,679 | 648 | REVIEW |
        | `sveltekit-frontend/logs` | 1,427 | 0 | EXCLUDE (logs) |
        | `sveltekit-frontend/.venv_turbovec` | 1,380 | 0 | EXCLUDE (virtualenv) |
        | `sveltekit-frontend/tests` | 1,241 | 1,192 | KEEP |
        | `turbovec` | 1,163 | 0 | REVIEW (separate project?) |
        | `.tmp` | 1,063 | 0 | EXCLUDE (scratch) |
        | `claude-mem` | 807 | 0 | EXCLUDE/REVIEW (plugin) |
        | `.svelte-error-fixes-backup` | 692 | 0 | EXCLUDE (backup) |
        | `logs` | 512 | 0 | EXCLUDE (logs) |
        | `sveltekit-frontend/static` | 406 | 50 | REVIEW |
        | `sveltekit-frontend/.okf` | 395 | 0 | REVIEW (generated OKF cards) |
        | `sveltekit-frontend/drizzle` | 369 | 362 | KEEP |
        | `(repo root files)` | 293 | 106 | REVIEW |
        | `sveltekit-frontend/scratch` | 265 | 0 | EXCLUDE (scratch) |
        | `memory` | 233 | 102 | REVIEW |
        | `sveltekit-frontend/.tmp` | 215 | 0 | EXCLUDE (scratch) |
        | `next_steps` | 190 | 184 | KEEP |
        | `qdrant-windows` | 182 | 0 | EXCLUDE (binaries) |
        | `storage` | 174 | 0 | EXCLUDE (data) |
        Suggested EXCLUDE subtotal (venvs, vendored, logs, tmp/scratch, backups, binaries, storage): 12,431 packets (13,238 if `claude-mem` 807 is also excluded; an earlier draft of this line said 18,258 — an arithmetic error, recomputed from the table rows). Exclusion means an explicit non-source class + archive manifest, never deletion; nothing applied.
        **T0+T1 DOMAIN RESOLVER REHEARSED (2026-09-20, after the operator chose "T0 plus T1"; NOT applied — persistent writes wait on KNOW-09):** `resolve-domain-tuples-exact-v1.mjs` now resolves T0 exact (case-insensitive) plus the 7 approved T1 aliases (`UI→frontend`, `MachineLearning→machine-learning`, `rag_retrieval→retrieval`, `graph_topology→graph`, `cache_layer→cache`, `Authentication→auth`, `auth_login_register→auth`; exact case-sensitive keys, targets verified to exist in `atlas_domain_ontology`). Resolver identity `atlas-domain-ontology-exact-ci-plus-alias-t1@v2`; each resolved row's `evidence.resolution` records `tier` (`T0`/`T1`) and `alias_source_key` for aliases. Rehearsal `REHEARSAL_PROVEN` (ROLLED_BACK): 41 keys → 18 resolvable (T0 63,352 + T1 17,752 = **81,104**), 0 ambiguous, 23 unmatched keys / 42,330 tuples untouched (T2, no-fit, generic, ambiguous, sentinel); 81,104/81,104 updated, 0 per-key mismatches; verify all zero (outside-domain, missing evidence keys, values not in ontology, non-domain touched, targets remaining); table after rollback still 539,124 `UNRESOLVED` (psql-verified). Receipt `docs/reports/atlas-domain-tuple-resolution-t0t1-v1.rehearsal.json` (the earlier T0-only receipt `...-t0-v1.rehearsal.json` remains as history). Persist flags unchanged (`--apply --operator-approved --lineage-reviewed --confirm-t0-domain-resolution`). Note: the alias `T1` list is now encoded in code as approved; changing it later requires a new resolver version.
        **FOLDER MARKING DECIDED (2026-09-20, structured question; decision only — NO packet was changed):** the operator accepted my KEEP and EXCLUDE classes and chose **"REVIEW = keep for now"**. Verified against Postgres: **12,431 packets excluded** (folders `.python311`, `llama-cpp-turboquant-gemma4`, `sveltekit-frontend/logs`, `sveltekit-frontend/.venv_turbovec`, `.tmp`, `.svelte-error-fixes-backup`, `logs`, `sveltekit-frontend/scratch`, `sveltekit-frontend/.tmp`, `qdrant-windows`, `storage`) — 0 of them resolve to the admitted snapshot; **49,287 packets kept**, of which **19,416 resolve** to a snapshot file and **29,871 do not** (largest: `neschrom97` 8,178, `scripts` generated reports ~6,980, `crates` 3,727, `simd-bridge` 2,995, `sveltekit-frontend/memory`, `docs`, `turbovec`, `claude-mem` 807 [kept because REVIEW=keep]). Consequence: even with the exclusions, **29,871 kept packets (60.6% of kept) still have no file in the admitted snapshot**, so a source-revision backfill can stamp at most 19,416 (39.4% of kept); the REVIEW folders remain the open lever (each needs its own keep/exclude call before the unresolved count can shrink). Exclusion mechanism when approved for writing: an explicit non-source class + `docs/archive-manifest.json` entry, never deletion; not built yet.
        **`neschrom97/` REVIEW FINDINGS (2026-09-20, read-only; folder decision still the operator's — currently "keep for now"):** the folder is **gitignored** (`.gitignore:1009 neschrom97/`, 0 tracked files) and holds **8,178 generated files** on disk (`cards/`, `embeddings/`, `index/`, `packets/`) — exactly matching its 8,178 `atlas_packets` (one packet per generated file, 0 resolvable to any admitted source file). An existing owner already covers it: `scripts/atlas/plan-neschrom97-packet-fabric-admission-v1.mjs` (read-only; ingress evidence only, never invents revisions) and its receipt `docs/reports/neschrom97-packet-fabric-admission-v1.json` (2026-09-16): `PACKET_FABRIC_ADMISSION_BLOCKED`, 45/45 sampled records valid but **`missingCanonicalLineage` 45/45**, `canonicalPacketIdentityAdmission: NOT_PROVEN`, `nextGate: CANONICAL_SOURCE_PACKET_LINEAGE_PRODUCER`. Related audits/owners to reuse rather than duplicate: `audit-packet-source-scope-v1.mjs`, `preview-indexable-source-manifest-v1.mjs`, `audit-whole-codebase-index-scope.mjs`. Reading: these are derived NES/CHR97 artifacts, not source files, so no source revision can ever be bound to them; recommended class = keep as NES/CHR97 ingress evidence but NOT as canonical source packets (i.e. move from REVIEW to non-source). Not changed; would shrink the kept-but-unresolvable count from 29,871 to 21,693 if the operator marks it so.
        Open before any canary: (a) rule for the 5 `tree_node_id` collisions (recommend exclude as `AMBIGUOUS_SAME_KEY` from the canary, or add a span ordinal to the hash only via a new identity revision); (b) confirm the `src/`-only scope vs 62.5% of active candidates; (c) regenerate candidates from current bytes (528 span failures + 1,165 drifted); (d) operator approval of a bounded canary limited to stampable rows, with readback.
      - New sub-decision (5): the 3,498 foreign-folder absolute-path rows are not this repo's source; recommend quarantine-by-`superseded_by`/exclusion from joins (archive, never delete) rather than re-keying.
- [ ] 14.3b Resolve `feature_ontology_tuples` (currently 100% UNRESOLVED) through the OAK kernel only after 14.3a and lineage gates; populate `atlas_ontology_concepts`/`relations` or record why they stay empty.
      **14.3b MEASURED 2026-09-20 (read-only; nothing written) — the premise "resolve all tuples through OAK" does not hold:** the 539,124 tuples are one extractor/version (`atlas-packets-ontology-v1`, evidence `{"source":"atlas_packets","join_method":"exact"}`) in four predicates: `USES_CONCEPT` packet→concept 353,973 (65.7%; 59,529 packets, 27,607 distinct objects), `BELONGS_TO_DOMAIN` feature→domain 61,717, `CLASSIFIED_AS` packet→domain 61,717, `IMPLEMENTS_FEATURE` packet→feature 61,717.
      - **`USES_CONCEPT` objects are lexical path/word tokens, not ontology concepts:** top objects `concept:frontend` 14,173, `concept:sveltekit` 14,171, `concept:neschrom97`, `concept:scripts`, `concept:lib`, `concept:python311`, `concept:src`, `concept:json`, `concept:2026`…; 47,464 tuples are generic path tokens (`src/lib/scripts/frontend/sveltekit/crates/json`) and 3,942 (812 distinct) are pure numbers. `atlas_ontology_concepts` and `atlas_ontology_relations` are EMPTY (0/0), so there is nothing for OAK (`/oak/lookup|search|traverse`, `READ_ONLY_SHADOW`, adapter `atlas-postgres`) to resolve them to. They should be treated as `LEXICAL_TAG` evidence (stoplist + count), never promoted to concepts by rename.
      - **Domain tuples (123,434 = `BELONGS_TO_DOMAIN` + `CLASSIFIED_AS`) resolve by a table join, not OAK:** 41 distinct domain keys vs the 17-row `atlas_domain_ontology` (`group_id`/`group_label`, e.g. `graph`, `gpu`, `frontend.sveltekit`). Case-insensitive exact match resolves only **63,352 tuples (51.3%)** (11 of 41 keys); the rest are non-canonical labels (`rag_retrieval`, `agent_orchestration`, `evidence_upload_storage`, `trace_mcp`, `cluster.summary`, `MachineLearning` vs `machine-learning`…) needing a reviewed alias map; 19,764 tuples sit in generic buckets (`Other`/`Utility`/`Library`/`tool`); **42 tuples are the error sentinel `domain:Classification failed`** that should never have been a tuple.
      - **PROPOSED domain alias map (draft for operator review; nothing applied; counts are `BELONGS_TO_DOMAIN`+`CLASSIFIED_AS` tuples; buckets sum to exactly 123,434):**
        | Tier | Keys → canonical `group_id` | Tuples |
        |---|---|---|
        | T0 exact (case-insensitive) | Graph, graph→`graph`; test→`test`; gpu→`gpu`; compiler→`compiler`; frontend→`frontend`; database, Database→`database`; retrieval→`retrieval`; cache→`cache`; API→`api` | 63,352 |
        | T1 high-confidence alias | UI→`frontend` 8,730; MachineLearning→`machine-learning` 4,682; rag_retrieval→`retrieval` 3,692; graph_topology→`graph` 232; cache_layer→`cache` 212; Authentication→`auth` 104; auth_login_register→`auth` 100 | 17,752 |
        | T2 medium (review each) | infrastructure→`devops` 276; repair_workflow→`error-handling` 200; embedding_indexing→`retrieval` 166 (alt `machine-learning`); cluster_analysis→`machine-learning` 98 (alt `graph`) | 740 |
        | NEEDS_NEW_DOMAIN (no fit in the 17) | documentation 13,564; agent 3,072; backend 2,990; agent_orchestration 814; evidence_upload_storage 472; case_management 360; mcp_agents 122; document_processing 114; citation_engine 104; legal_reports 68; trace_mcp 14 | 21,694 |
        | GENERIC (no information) | Other 10,882; tool 7,390; Utility 1,050; Library 442 | 19,764 |
        | REVIEW (ambiguous) | memory_optimization 56; Embedding 32; cluster.summary 2 | 90 |
        | SENTINEL (quarantine) | `Classification failed` | 42 |
        Reading: the 17-row `atlas_domain_ontology` has no domain for documentation, agents/MCP, backend, or the legal product (case management, citations, legal reports, evidence upload) — together 21,694 tuples (17.6%) — so either the ontology is extended (operator decision, with `group_id`s + parents) or these stay `UNRESOLVED_NO_CANONICAL_DOMAIN`. T0+T1 = 81,104 tuples (65.7%) could be resolved without any new ontology content once T1 is approved.
      - **T0 RESOLVER BUILT + REHEARSED, NOT APPLIED (2026-09-20):** new `scripts/atlas/resolve-domain-tuples-exact-v1.mjs` (resolver `atlas-domain-ontology-exact-ci@v1`; touches only `CLASSIFIED_AS`/`BELONGS_TO_DOMAIN` tuples whose key matches EXACTLY ONE `atlas_domain_ontology` row by `group_id`/`group_label`, case-insensitive; no aliasing). Writes `resolution_state='RESOLVED'`, `resolved_concept_id='domain:<group_id>'` (namespace-prefixed so a domain is never mistaken for an ontology concept — the column is free text, no FK, and there is no resolver-version column) and merges a `resolution` object (resolver, resolver_version, matched_on, group_id, ontology_table) into `evidence`, preserving the original `source`/`join_method` keys. Rehearsal `REHEARSAL_PROVEN` (ROLLED_BACK): 41 unresolved domain keys → 11 resolvable (63,352 tuples), 0 ambiguous, 30 unmatched (60,082 tuples untouched); pre-image archived to `.tmp/...rehearsal.json` (63,352 rows, sha256 `d3f35922…981d`); 63,352/63,352 updated with 0 per-key mismatches; verify: 0 resolved outside domain tuples, 0 missing evidence keys, 0 resolved values absent from the ontology, 0 non-domain tuples touched, 0 targets remaining (idempotent); table after rollback still 539,124 `UNRESOLVED` (psql-verified). PERSIST needs ALL of `--apply --operator-approved --lineage-reviewed --confirm-t0-domain-resolution` and then writes the pre-image to `deeds_labs/archive/<date>/` + a `docs/archive-manifest.json` entry (recover by restoring the three columns by `id`). Open questions before applying: whether `domain:<group_id>` is the wanted value for `resolved_concept_id` (vs. the `atlas_domain_ontology.id` uuid), and the cohort's lineage gate (tuples derive from `atlas_packets` identity; KNOW-09 unresolved). Housekeeping: removed a leftover no-op statement from the script.
      - Recommended revised scope for 14.3b: (i) resolve the 63,352 exact domain tuples by join and mark `resolution_state`/`resolved_concept_id` only with an explicit `resolver_version`; (ii) produce a reviewed alias map for the other ~30 domain keys (human review, no auto-merge); (iii) quarantine the 42 sentinel tuples; (iv) classify `USES_CONCEPT` as `LEXICAL_TAG` and decide separately whether/how a real concept vocabulary (OAK/OAKLIB, seeded from the domain ontology) is ever populated. None applied.
- [ ] 14.3c PRECONDITIONS MEASURED 2026-09-20 (read-only) — the producer cannot be wired to real data yet: (1) `ExperimentFeatureMatrixSchema` requires non-empty `sourceRevision`/`featureRevision`/`inputHash`/`outputHash` and reads numeric features from `AnalysisPassResult`s of families `structural|lexical|semantic|sequence|rerank|grounded` (`compileExperimentFeatureMatrix`, `nlp-feature-compiler.ts`); (2) `atlas_packets` has **0 of 61,718 rows with a `source_revision`**, `atlas_packet_chunk_lineage` has 7,421 rows over only 627 packets, and `candidate-corpus-lineage-v1.json` (2026-09-16) admits **0 of 61,718** (61,717 `MISSING_SOURCE_REVISION`, 1 `MISSING_SOURCE_REF`); (3) `analysis_pass_results` (11,103 rows) has no `family` column (family is an in-memory TS field folded into `pass_type`) and its pass types are `summarization` 10,906 / `embedding` 150 / `cache_push` 20 / `code_feature_registry` 23 / `pos-concept-tagging` 4 — **none of the six families the compiler reads**, and only 27 rows carry `source_revision` (none of the summarization/embedding/cache rows do); (4) the CandidateOrdinal corpus (`candidate-ordinal-corpus-receipt-v1.json`, snapshot `corpus-snapshot:workspace-active-v1:v1`, 4,951 rows, dense ordinals, checksum `9669b018…a3a3`, admission `CANDIDATE_ORDINAL_ADMISSION_READY`) mixes `proto:` service refs with packets, dates from 2026-08-27, and `downstreamAllowed:false`; the lineage guard reports `eligibleRows:0`, `currentCohortAdmitted:false`, nextGate `CURRENT-SOURCE-PACKET-CHUNK-COHORT-01`. Conclusion: the AST tranche gives `atlas_ast_nodes` real `source_revision`s, but nothing yet binds PACKETS to a source revision, so no frozen current cohort can exist and a matrix built now would be almost all-null. The unblocking work is upstream (packet→source-revision binding / `CURRENT-SOURCE-PACKET-CHUNK-COHORT-01`, KNOW-09), not in the compiler. **PACKET→SOURCE-REVISION BINDING MEASURED (2026-09-20, read-only):** of the 61,718 `atlas_packets` (one distinct `source_ref` each), only **19,416 (31.5%)** resolve to a file in the admitted binding revision `sha256:e24bb971…` (exact root-relative 16,543; +2,873 via `sveltekit-frontend/` prefix + case-fold; 3,031 resolve only through the prefix alias, and legacy-root `src/` refs, 3,260, are ambiguous with the app tree). The other **42,302 (68.5%) point at files outside the admitted snapshot**: `neschrom97/` 8,178, `scripts/` (generated reports etc.) 6,980, `sveltekit-frontend/` subfolders absent from the snapshot 6,888 (CORRECTION: an earlier draft called these "malformed `…/{` refs" — a misread of a sample string; only 1 packet has such a ref; the 6,888 are `logs/`, `.venv_turbovec/`, `memory/`, `scratch/`, `.okf/`, `.tmp/`, `static/` etc.), **`.python311/` (a Python virtualenv) 4,140**, `crates/` 3,727, `simd-bridge/` 2,995, vendored `llama-cpp-turboquant-gemma4/` 2,381, `turbovec/` 1,163, `.tmp/` 1,063, `docs/` 1,031, `claude-mem/` 807, `.svelte-error-fixes-backup/` 692, `logs/` 512, `src/` 365. Packet identity columns are also in the wrong namespaces for binding: `workspace_revision` = `0` on all 61,718 (the legacy coerced integer), `workspace_id` holds labels (`docs` 54,142, `sveltekit-frontend` 3,060, `scripts` 562) not the snapshot workspace UUID, `workspace_revision_key`/`lineage_producer_revision` are empty, `canonical_source_ref` is filled for 58,366, `source_kind` is NULL for 58,304. So a packet→source-revision backfill would (a) stamp at most ~31.5% of packets, (b) need a decision on the 68.5% that index vendored/venv/backup/tmp/generated content (exclude from canonical packets vs. give them an explicit non-source class), and (c) must not reuse the existing `workspace_id`/`workspace_revision` values. This is the concrete shape of `CURRENT-SOURCE-PACKET-CHUNK-COHORT-01`; nothing here was applied. Original 14.3c text follows: Wire the 9.1 producer (`compileExperimentFeatureMatrix`) to one frozen CandidateOrdinal cohort and write an `AnalysisPassResult` with evidenceRefs/revisions preserved; only then evaluate KMeans/SOM consumers (14.4 owner decision).
- [ ] 14.4 Decide the owner for symbol-registry KV clustering (extend `train_domain_classifier.py` vs new lane) via
      the runtime-ownership registry before writing code (Duplication Prevention rule).
- [ ] 14.5 Add GIN indexes on `feature_ontology_tuples` only after 4.6's matview is human-approved and a query plan
      shows the btree set is insufficient.

### 14.6 Deep-audit results (2026-09-20, TRACE MCP + stale probe; read-only)

| Gate / probe | Result |
|---|---|
| Index freshness | STALE: canonical `docs/graph/codebase-graph.json` = 2026-08-30; newest probe = 2026-09-10. Not regenerated (needs operator OK per deep-audit skill). |
| G4/G5/G16 (route auth/Zod/tests) | NOT_EVALUABLE: probe has `routesWithAuth=0 / routesWithoutAuth=0` graph-wide, i.e. route flags were not computed. Do not read as PASS. |
| G14/G15/G21-25 (scope: nlp/ontology/structural, 110 files) | PASS: 0 sv4Legacy, 0 ssrUnsafe |
| G11 localhost refs (scope) | 4 scripts under `scripts/atlas/` (audit/prove scripts, low risk) |
| `trace.trace_system_health` | degraded: `topology_search` :8101 DOWN, `rerank` :8099 DOWN; mcp, ollama, bifrost, :8090, go_retrieval, qdrant, neo4j, postgres, redis OK |
| `trace.miniforge_health` | ready; treesitter_chunker + ast_grep + networkx true; cugraph/cuvs/torch false |
| `trace.topology_hydration_status` | 2 rows only: bmu 0.0, manifold4 1.0 — tiny table, not corpus-scale evidence of a 4D manifold |
| `trace.atlas_workstation_status` | FAILED: idle-timeout after 300s, no result (see 14.6d) |
| Symbol registry `atlas_callable_search` | 285 rows vs `atlas_ast_nodes` 11,067 (~2.6% coverage); has domain_id/confidence, secondary_domains, inferred_uses, taxonomy_revision; GIN on calls/imports/param names+types/search_vector/jsonb |
| `feature_ontology_tuples` | btree-only; `resolution_state` + `resolved_concept_id` present (OAKLIB Phase 2); default extractor_version still `phase-107-v1` |

- [x] 14.6a (answered 2026-09-20, read-only) The 285 vs 11,067 gap is a gated, bounded promotion with sparse upstream nominations (461 nominations, 338 ineligible variables; 8,727 canonical-resolved symbols unnominated), not a failed writer; 200 of 285 rows carry legacy `workspace:0`. Full funnel in `parent-atlas-workboard-feature-utility-fabric/tasks.md` (REGISTRY-COVERAGE-01). Original text: Explain/close the 285 vs 11,067 registry coverage gap (is `atlas_callable_search` callables-only by design, or unpopulated?) before any KMeans-on-symbols work.
- [ ] 14.6b `topology_search` :8101 and `rerank` :8099 are down — 4D topology search cannot be smoke-tested until restarted; `dev:gpu` does not start either.
- [ ] 14.6c Regenerate the graph index (`npm run index:codebase:fast`) and re-run G4/G5/G16 for the sidecar routes (`api/atlas/domain-taxonomy/classify` etc.); existing G4/G5 findings in CLAUDE.md remain deferred per DEV_BYPASS_AUTH policy.
- [ ] 14.6d `trace.atlas_workstation_status` FAILED (2026-09-20): no response or progress for 300s, aborted by the MCP idle timeout — no readiness data obtained. Investigate why the tool hangs (likely a slow Postgres spine query or a lane-health artifact read), or raise the per-server `timeout` for `trace`; do not treat workstation readiness as known.

- [ ] NLP-EXTRACT-03 OWNER CENSUS (2026-09-21, owner preserved; read-only runtime): the existing `packages/parent-atlas/src/core/langextract-grounding-adapter.ts` remains the sole grounded-extraction owner. Its `groundLangExtractUtf8SpansV1` bridge is wired into `sveltekit-frontend/src/lib/server/atlas/indexing/graphify-structural-intelligence-adapter.ts`; structural receipts expose UTF-8 span, rejection, text-mismatch, parser-buffer presence/checksum, offset-basis, and fallback fields. A supplied parser buffer remains eligible for the existing native path; source-text reconstruction is explicitly non-promotable fallback. The focused adapter test now passes **4/4** with a single worker, and the direct UTF-8 grounding suite passes **11/11**; parser-buffer propagation is therefore runtime-proven. The gate remains open only because current source authority and canonical promotion are unresolved; no second `GroundedExtractionV1`, no DB writes, and no canonical promotion were introduced. Evidence: `packages/parent-atlas/test/langextract-utf8-grounding.test.mjs`, `sveltekit-frontend/src/lib/server/atlas/indexing/graphify-structural-intelligence-adapter.ts`, `sveltekit-frontend/src/lib/server/atlas/indexing/graphify-structural-intelligence-adapter.spec.ts`, `docs/reports/ast-offset-basis-proof-v1.json`. writesPerformed: false.
- **NLP-EXTRACT-03 parser-buffer runtime proof (2026-09-21, read-only):** the previously hanging focused adapter test now passes **4/4** with a single forked worker; the direct UTF-8 grounding contract passes **11/11** under Node's test runner. The receipt surface confirms supplied parser-buffer presence/checksum, `UTF8_PARSER_BUFFER_V1`, mismatch rejection, BOM/CRLF/astral handling, and source-revision fail-closed behavior. No source, database, vector, cache, or Graphify writes occurred. The remaining NLP-EXTRACT-03 gate is current-source authority/promotion, not parser-buffer propagation.

- [ ] PR-RECONCILE-01 (2026-09-20; `docs/reports/parent-atlas-pr-reconciliation-v1.json`): the 11 open PRs were treated as candidate implementations, not merged. Adopted only files absent from the tree: #89 owner-reconcile v2 (script ran read-only), #90 Valkey stream contract (+4 additive event-fabric patches, 9/9 tests), #91 Graphify projection/preflight/writer contracts (preflight rebased: strict schema -> strip because main's receipt gained 10 keys; 21/21 tests), #98 pure digest contracts (13/13; main's newer planner/producer kept), #97-tip lineage audits (bridge: 0 of 25,271 current members have an exact packet-chunk bridge, all CURRENT_SOURCE_BINDING_MISSING; deployment present, 7,421 proven rows; migration-owner blockers: sidecar manifest unregistered, Drizzle ledger empty, proof not bound to current SQL checksum). #93-#96 superseded by main or contained in #97; #92 parked; #37 historical. NLP-EXTRACT-03: extended the existing `langextract-grounding-adapter.ts` with `groundLangExtractUtf8SpansV1` (explicit offset basis PYTHON_CODEPOINT vs UTF16_CODE_UNIT, UTF8_PARSER_BUFFER_V1 byte spans, fail-closed; 11 new tests, 13/13). Found: the older `adaptGroundedLangExtract` slices by UTF-16 units although LangExtract counts code points, wrong on astral text. Not done: wiring the new function into the structural adapter. No DB/Valkey/Qdrant/Graphify writes, no DDL, nothing committed. canonicalAuthority=false; next gate CURRENT_SOURCE_AUTHORITY_PROVEN.

- [ ] CLASSIFICATION-GATE-01 (2026-09-20, operator direction + read-only inventory review; no code, no writes): **Classification must be finished under its OpenSpecs BEFORE file analysis, top-k, KMeans, KNN, query fanout, document analysis, recommendations, the kanban task board, the feature matrix and the cache — all of them depend on it.** Operator clarification: **matching does not have to be exact; no ranker is 100%.** Interpretation recorded here so it is not misapplied: classification, symbol matching and ranking are PROBABILISTIC lanes judged by recall@k / precision / ECE against a reviewed set, with a caller-supplied confidence floor and fail-closed routing (see CLASSIFIER_ROUTING_GUARD_01). Identity is NOT probabilistic: `source_revision`, whole-source and chunk digests, `UTF8_PARSER_BUFFER_V1` spans, `packet_key`, `CandidateOrdinalMap` and cache keys stay exact and fail closed. "Approximate" never means a fuzzy identity join or an inferred revision.
  - **Inventory (what exists):** offline trainer `python/train_domain_classifier.py` (sklearn MultinomialNB + LogisticRegression, fed by the weak-label bundle); deterministic read-only FastAPI seam `python/atlas_nlp_classification_helper_v1.py` (rules only; its own docstring says the LR/NB trainer is "a later offline challenger" and it never writes a checkpoint); the `:8095` sidecar `python/miniforge_nlp_sidecar_v2.py` (`/ast/chunk`, `/analyze`, `/extract`, `/pos`, `/extract/documentation-facts`, `/evidence/web`) as an evidence EXECUTOR, never an identity owner; TRACE `domain.classify` (provisional NB+LR, ~0.55 on a cache-invalidation query labelled `ui`); ast-grep/Tree-sitter helpers `scripts/atlas/lib/{ast-grep-symbol-extraction,ast-structural-revision-v1,treesitter-structural-observation-v1,json-symbol-extractor,markdown-symbol-extractor}.mjs` (TS/JS only for AST). **No PyTorch logistic-regression trainer exists** — the only LR/NB trainers are sklearn; a PyTorch LR would be a new challenger for the same job, allowed only after the sklearn baseline has a reviewed set to beat (Duplication Prevention: one owner, challengers behind it).
  - **OpenSpec state (checked/open):** `parent-atlas-search-classifier-sidecar` 70/16; `parent-atlas-workstation-domain-classifier` 115/26; `parent-atlas-query-routing-classifier` 41/57 (largest: non-toy training dataset, ECE/calibration report, same-tensor XGBoost comparison, dataset exporter rejecting mixed prompt/model/feature revisions); `parent-atlas-unified-symbol-ranking` 17/0 (symbol ranking contract complete); this change 53/53.
  - **Common blockers across all four (from their own open items):** no reviewed calibration set (DOMAIN-CAL-02 draft = 142 UNREVIEWED rows, 49 revision-qualified); only 148 revision-qualified rows and 3,204 lack a Graphify join; sidecar probe returns `source_revision="unknown"` with no grounded entities; the workflow loop has no live classifier producer; three domain vocabularies unreconciled (39 packet labels / 9 code / 13+4 DB ontology); CURRENT_SOURCE_AUTHORITY_PROVEN unadmitted.
  - **Dependency order (nothing right of a blocked item may be claimed):** current source authority -> revision-qualified labelled set + vocabulary owner -> classifier baseline (sklearn NB/LR) with calibration + confidence floor -> symbol matching with a disambiguator -> FeatureMatrix / CandidateOrdinalMap -> KNN / KMeans / top-k / fanout -> document analysis -> recommendations -> kanban board -> cache warm buckets. Kanban, recommendations and cache are consumers; they must not ship a private classifier.
  - **Next bounded step (read-only or fixture-only):** finish the sklearn baseline evaluation harness on the reviewed subset (recall@k, per-class precision, ECE, floor sweep) before any challenger (PyTorch LR, neural) or downstream lane is built. Do not start file analysis or clustering fanout on unreviewed labels.

- [x] CLASSIFICATION-GATE-01a EVAL HARNESS (2026-09-20, `python/atlas_domain_classifier_eval_v1.py` + `python/test_atlas_domain_classifier_eval_v1.py`, 9/9 unit tests; report `docs/reports/domain-classifier-eval-baseline-v1.json`): read-only baseline evaluation harness, no training, canonicalAuthority=false, writesPerformed=false. Per-class precision/recall/F1, macro-F1, top-k recall, ECE, confidence-floor sweep. Accuracy is computed ONLY against human-reviewed `reviewedGroup`; weak-label agreement is reported separately and labelled NOT accuracy; samples under 200 total or 30 per class are flagged `INSUFFICIENT_SAMPLE`. Pluggable predictor so a PyTorch/neural challenger can be scored on the identical rows. Real run on the 142-row draft (predictor = existing rules `classify_domain`): status `NO_GOLD_LABELS` (0 reviewed rows, accuracy NOT computable); weak-label agreement diagnostic 15.5% (22/142), consistent with the earlier 0/6 parity finding — the deterministic rules and the weak labels are different vocabularies, not a measure of correctness. Unblocks: nothing downstream. The gate stays closed until a human fills `reviewedGroup` on enough revision-qualified rows (only 49 of 142 qualify; the trust floor is 200 rows / 30 per class), so more labelled rows, not more model code, is the binding constraint.

- [ ] CLASSIFICATION-GATE-01b REVIEW SHEET + LABELING RULES (2026-09-20, `scripts/atlas/build-domain-review-sheet-v1.mjs` -> `docs/reports/domain-review-sheet-v1.html`; harness now 9/9): a self-contained OFFLINE searchable page over the 142-row draft (search path/label/evidence; filter revision-qualified / unresolved / to-do / proposed group; blind mode hides weak + proposed labels until the reviewer chooses, to avoid anchoring; autosaves to browser localStorage; exports `domain-calibration-reviewed-v1.jsonl` in the schema the harness reads: `python python/atlas_domain_classifier_eval_v1.py --input <exported file> [--revision-qualified-only]`). Generator options `--input/--output`; rows are rendered with text nodes (never innerHTML) and the embedded JSON escapes `<` and U+2028/2029 (proved on an adversarial `</script><img onerror>` fixture: not closed early, exact round-trip). No network, no DB writes; the exported JSONL is gitignored by `*.jsonl` (force-add or convert to a tracked format if it must be promoted).
  - **Labeling rules (also embedded in the sheet):** (1) judge the file's primary responsibility from `sourceRef`, open the file if unsure; the evidence text is an LLM summary, often generic or contaminated with prompt residue, never truth; (2) decide independently (blind mode), agreement with the weak/proposed label is measured afterward; (3) exactly one group from the 13 top-level `atlas_domain_ontology` groups (api, auth, cache, compiler, database, devops, error-handling, frontend, gpu, graph, machine-learning, retrieval, test), a child (database.postgresql, devops.env-config, devops.process-mgmt, frontend.sveltekit) only when certain; (4) no dominant responsibility -> `AMBIGUOUS`; (5) run output / log / generated report / fixture / memory dump -> `NOT_A_DOMAIN`; (6) file gone/unreadable -> `SKIP`; AMBIGUOUS/NOT_A_DOMAIN/SKIP are counted but never gold; (7) review revision-qualified rows first; (8) a second reviewer on >=10% of rows (agreement check) before labels are trusted.
  - **What we need, measured:** trust floor = 200 reviewed rows total AND 30 per class. The 49 revision-qualified rows (proposed group): frontend 11, cache 8, api 7, database 6, auth 4, gpu 3, retrieval 3, graph 3, test 2, devops 2, **machine-learning 0, compiler 0, error-handling 0**; the largest class is 11, so NO class reaches 30 and total is 49 of 200. The draft itself is ~12 rows per class (142 total), so even labelling every row cannot reach the floor. Closing it needs more revision-qualified candidates, which depends on CURRENT_SOURCE_AUTHORITY_PROVEN (the classifier lineage blocker: only 148 rows are revision-qualified overall) — labelling effort alone cannot close it. Two-tier reporting is therefore the honest interim: Tier A revision-qualified (`--revision-qualified-only`, joinable to the feature matrix) and Tier B unresolved-revision (valid text labels for classifier evaluation only; never joined to a matrix or promoted to canonical authority).
  - **Next:** a reviewer works the sheet (revision-qualified first); rerun the harness on the export; extend the candidate pool only after source authority admits a frame.
  - **Convergence audit (2026-09-20, read-only):** `scripts/atlas/audit-nlp-classification-symbol-blockers-v1.mjs` composes the existing AST-symbol, classifier-evaluation, classifier-readiness, and owner-census receipts. It keeps identity exact, classifier/ranker outputs probabilistic/challenger-only, and reports the independent blockers `Cohort`, `Classifier`, and `Source`. Current result: `BLOCKED`; no duplicate canonical owner proven; no DB/Valkey/Qdrant/Graphify writes. Report: `docs/reports/nlp-classification-symbol-blockers-v1.json`.
  - **Fresh source/cohort recheck (2026-09-20, read-only):** `audit-current-source-cohort-lineage-v1.mjs` remains `WORKSPACE_REVISION_SOURCE_MISMATCH`: 52 source-qualified cohort rows, 52 Graphify matches, 0 current-workspace matches, and 0 revision-qualified rows after workspace matching. `audit-ast-authority-gap-derivation-v1.mjs` remains `AST-AUTH-01 CURRENT_SOURCE_AUTHORITY_PROVEN=OPEN`; it records KNOW-09 blocked, 653 snapshot mismatches, 8 missing files, 1,059 current-binding mismatches, and 14 source-unavailable rows. These receipts confirm the classifier/symbol gates must remain noncanonical; no rows were promoted.

- [x] CLASSIFICATION-GATE-01c SEARCHABLE WITHOUT GIT (2026-09-20, `.rgignore`): the AST/classification evidence files stay gitignored (the git hook rejects files > 10 MB; `.tmp/atlas/ast-declaration-candidates-current-v1.jsonl` is 25 MB, `ast-canary-eligible-v1.jsonl` 22 MB; `*.jsonl` and `.tmp/` are ignored) but are now `rg`-searchable from the repo root via `.rgignore` exceptions. Verified from the ROOT (not from inside the directory, which bypasses ignore rules and gave a false pass): the three named `.tmp/atlas` files containing a probe string are visible (2.7 s repo-wide), and unlisted files (the 22 MB NEGATIVE test file, rehearsals, the identity dump, `ordinal-bridge-source/`) stay hidden. Exceptions are selective on purpose (`.tmp/atlas` is ~422 MB): domain-calibration draft + reviewed JSONL, ast-declaration-candidates, ast-canary-eligible, ast-source-authority-cohort, current-graphify-symbol-nominations, current-graph-symbol-resolution, knowledge-source-snapshot-live. Pattern note: a file cannot be re-included while its parent directory is ignored, so the rules re-include `.tmp/` and `.tmp/atlas/`, ignore their children, then re-include the named files (last match wins). These are derived, regenerable artifacts: searchable is not authoritative, regenerate before citing. Nothing is staged or tracked by this change.

- [ ] PGVECTOR-CHUNK-STREAM-01 (2026-09-20, operator direction: "we need pgvector chunking streaming, not just Qdrant"; read-only census, nothing written). **pgvector in Postgres is the canonical semantic_768 store and a first-class retrieval executor; Qdrant is a mirror.** The chunking/embedding/streaming pipeline must therefore be Postgres-first and stream to Qdrant from Postgres, not the reverse. One semantic logical lane: pgvector exact scan, pgvector HNSW, Qdrant and cuVS are EXECUTORS of it, never separate retrieval votes (ownership rule; SEMANTIC-07 measures them against each other).
  - **Fresh guarded stream probe (2026-09-20):** `npm run atlas:docs:pgvector-chunk-stream-dry-run` completed with `RESOURCE_HEADROOM_OK` (32.63 GiB free disk, 6.30 GiB free memory), then failed closed as `PGVECTOR_STREAM_BLOCKED_NO_ELIGIBLE_ROWS` (`qualifiedRowsLive=0`, `pagesCompleted=0`, `rowsSeen=0`). No backfill, vector transport, Qdrant mirror, or database write occurred. The blocker is source/revision admission, not stream mechanics.
- **BITFROST_WARMER_SOM_SOURCE_CORRECTION (2026-09-20, code-only/dry-run gate):** `scripts/atlas/warm-bitfrost-semantic-cache.mjs` now selects `atlas_packets` only and derives SOM routing from `som_cell_x`/`som_cell_y`. `atlas_higher_hop_index.som_cluster`, `cluster_id`, and legacy `som_cluster` are no longer used as the SOM source; legacy values remain diagnostic only. No Valkey writes were performed. Key-builder parity and packet-value-schema compatibility remain open, so `BITFROST_WARM_KEY_IDENTITY_PROVEN` is not claimed.
- **BITFROST_SOM_SOURCE_LIVE_READBACK (2026-09-20, read-only):** `atlas_packets` contains 61,718 packets; `som_cell_x` + `som_cell_y` are assigned on 58,365, while legacy `som_cluster` is populated on 61,659. The warmer now deliberately uses the revisionable coordinate pair and does not treat the legacy scalar as SOM authority. No database or Valkey writes were performed.
- **BITFROST_WARM_KEY_STATIC_PARITY (2026-09-20, `scripts/atlas/test-bitfrost-warmer-key-parity-v1.mjs`):** static checks pass for packet and feature identity shape correspondence against the canonical SvelteKit builder, with rich warmer values isolated under `bifrost:warm:v1:{packet|feature}:*`; `atlas_packets` is the source and legacy `som_cluster` is not routing. This avoids placing the warmer's rich snake_case envelope under the canonical `PacketCacheEntry` semantic-cache keys. The test proves static separation only; runtime readback, TTL/value compatibility, and Valkey population remain open. `canonicalAuthority=false`, `writesPerformed=false`, `promotionAuthorized=false`.
- **BITFROST_WARMER_RESOURCE_GUARD (2026-09-20):** added `atlas:docs:bitfrost-warmer-dry-run` through `run-resource-guarded-script-v1.mjs` and included it in the guarded-package regression. Dry-run invocation cannot bypass the disk/memory safety floor through the package entry point.
  - **Latest guarded dry-run (2026-09-20):** headroom was sufficient at launch (9.50 GiB free disk, 4.50 GiB free memory), but the lineage gate admitted **0** `atlas_packets` rows because current packets lack non-placeholder source/workspace revisions and canonical source references. Result: `candidateRows=0`, `packetKeysPlanned=0`, `featureKeysPlanned=0`, `aceKeysPlanned=0`, `appliedWrites=0`, `failures=0`. This proves safe rejection only; it does not prove runtime Valkey population, TTL readback, or warm-key promotion. The report no longer recommends `--apply` when no eligible rows exist.
  - **Parser-buffer core replay (2026-09-20):** `node --test packages/parent-atlas/test/langextract-utf8-grounding.test.mjs` passes 11/11, including BOM-stripped buffers, CRLF, astral characters, UTF-16/codepoint bases, invalid intervals, revision mismatch, invalid UTF-8, and extraction mismatch. This proves the pure grounding contract only; the SvelteKit structural-adapter Vitest remains open because its prior run hung before completing.
  - **AST/source replay recheck (2026-09-20, guarded/read-only):** `audit-ast-hash-column-contract-v1.mjs` reports 11,273 AST rows, 98 source-revision-qualified rows, 11,175 legacy-unqualified rows, 0 whole-file raw parity rows, 1,711 mixed-hash groups, and 11,105 rows without a binding digest. `audit-ast-hash-grain-classification-v1.mjs` classifies 11,223 rows as `UNKNOWN` and 50 as `WHOLE_FILE_RAW`; legacy supersession remains prohibited. `audit-ast-symbol-resolution-v1.mjs` remains fail-closed: 461/461 diagnostics, resolution not attempted, plan/structural workspace `sha256:e2e805…` versus registry workspace `sha256:e24bb…`. `audit-current-source-owner-reconciliation-v1.mjs` remains `CURRENT_SOURCE_AUTHORITY_NOT_PROVEN` (25,100 sources, 34 current-execution candidates, 1 exact current owner). No writes were performed.
  - **PGVECTOR-02 dry-run contract added (2026-09-20):** `scripts/atlas/dry-run-pgvector-chunk-stream-v1.mjs` uses bounded `id > cursor ORDER BY id LIMIT n` pages, records report-only resumable checkpoints and per-page SHA-256 checksums, never selects/transports vectors as JSON, and has no downstream writer attached. Guarded command: `npm run atlas:docs:pgvector-chunk-stream-dry-run`.
  - **Current result: `PGVECTOR_STREAM_BLOCKED_NO_ELIGIBLE_ROWS`.** Live `codebase_chunk_index` has 274,465 rows, but 0 have a non-placeholder `source_revision`, 0 have a non-placeholder `workspace_revision`, and 0 have `representation_revision`; therefore the complete revision-qualified predicate admits 0 rows. This is an upstream source-authority/lineage blocker, not permission to backfill. Report: `docs/reports/pgvector-chunk-stream-dry-run-v1.json`. `canonicalAuthority=false`, `writesPerformed=false`.
  - **Resource-safety hardening (2026-09-20):** `atlas:docs:knowledge-source-snapshot-live` now routes through `run-resource-guarded-script-v1.mjs`. The guard refuses execution below the configured disk/memory headroom instead of starting another memory-heavy snapshot audit; a refusal is not a source-authority result and does not refresh the report.
  - **Guard regression proof:** `npm run atlas:test:resource-headroom` passes 3/3 simulated accept/refuse cases; the live command was refused before child start at 7.92 GiB free disk, with `writesPerformed:false`.
  - **High-risk command alignment:** capability census, AST conflict/parity/source-worktree/digest/canary audits, ontology population decision, and packet-source-scope commands now use the same resource guard before launching their child `.mjs` process. This changes execution safety only; it does not alter audit results or authority state.
  - **Guarded-script contract:** `npm run atlas:test:resource-guarded-scripts` passes 2/2, verifying the selected high-risk package commands retain the wrapper and a concrete child script.
  - **Classification/review guard extension:** source-drift disposition, NLP training readiness, and domain-review-sheet commands now use the same preflight; these commands remain report-only and no classification or source authority is promoted by the wiring.
  - **Guard receipt clarity:** `atlas.resource-guarded-script.v1` now reports both observed and configured disk/memory floors. The latest refusal observed 7.79 GiB disk and 3.57 GiB memory against 8/4 GiB floors, with `writesPerformed:false`.
  - **Live memory-pressure diagnosis (read-only, 2026-09-20):** the largest user-space process is the frontend TypeScript server (`typescript/lib/tsserver.js`, PID 60916), using approximately 3.36 GiB working set / 3.55 GiB private memory. The repository's current optimized editor profile is 12,288 MiB; no process was terminated and no profile change was applied. This explains the guard refusals without weakening the 8 GiB disk / 4 GiB memory floors.
  - **Measured (live, read-only):** pgvector 0.8.3; `codebase_chunk_index` 274,465 chunks / 3.2 GB total. `content_embedding halfvec(768)` populated on **55,169 (20.1%)**, `latent_256` 55,169, `latent_128` 55,169, `latent_64` 1,703 — i.e. **219,296 chunks (79.9%) have no semantic_768 in Postgres**, so the pgvector lane can serve only a fifth of the chunk table. Canonical index `codebase_chunk_index_content_hnsw` (halfvec_cosine_ops, m=16, ef_construction=200, 106 MB). 12 vector indexes exist in total; `idx_codebase_chunk_content_embedding_768_hnsw` is **768 MB on the legacy `content_embedding_768 vector(768)` column** (a different, far smaller column — see the embedding_dimension notes in claude.md): a duplicate/bloat candidate. Archive-not-drop; index change needs operator approval. Aggregate queries on this table print a ParadeDB "Aggregate Scan not used" warning (set `paradedb.check_aggregate_scan=false` in audit scripts). `hnsw.*` GUCs are not visible from `pg_settings` until the vector library loads in a session: verify `hnsw.ef_search` and `hnsw.iterative_scan` per session, do not assume them.
  - **Existing owners (do not duplicate):** chunker `sveltekit-frontend/src/lib/server/indexer/ast-chunker.ts` + `chunk-id.ts` + `dual-embedder.ts`; pgvector query paths `atlas/embedding/semantic-representation-v1.ts`, `atlas/contracts/rpc-packet-registry-lanes-v1.ts`, `ai/trace-reranker.ts`, `atlas/indexing/graphify-daily-coordinator-v1.ts`; streaming today exists only for the Qdrant backfill (`scripts/atlas/phase108d-qdrant-*.mts`, NDJSON) — there is NO pgvector-side streaming pipeline.
  - [ ] PGVECTOR-01 COVERAGE PLAN (no writes): quantify which of the 219,296 unembedded chunks are current-source, non-generated and revision-qualified before any backfill; a backfill is a bounded, authorized canary, never a blind fill, and is blocked behind CURRENT_SOURCE_AUTHORITY_PROVEN for revision-qualified rows.
  - [ ] PGVECTOR-02 STREAMING CONTRACT: source bytes -> ast-chunker -> deterministic chunk id -> EmbeddingGemma 768 -> Postgres halfvec write (batched transaction, idempotent upsert keyed by chunk id + source_revision + representation_revision) -> Qdrant mirror streamed FROM Postgres -> cache invalidate -> event. Reads use keyset pagination (`WHERE id > $last ORDER BY id LIMIT n`, never OFFSET) or a server-side cursor / `COPY ... TO STDOUT` for bulk export; resumable by cursor checkpoint; bounded batch and backpressure; per-batch receipt with count + checksum; vectors never travel as JSON (wire-format layering rule: binary COPY / Arrow / mmap for bulk numeric data).
  - [ ] PGVECTOR-03 EXACT-vs-HNSW PARITY (this is SEMANTIC-07): exact `ORDER BY embedding <=> q` with index scans disabled as the oracle vs HNSW recall@k, with and without `hnsw.iterative_scan`, at several `hnsw.ef_search`, on the same candidate set; report recall@k and latency separately; approximate is acceptable (no ranker is 100%), identity is not.
  - [ ] PGVECTOR-04 FILTERED SEARCH: revision/adapter/domain predicates with HNSW under-return without iterative scan (pgvector 0.8); prove the filtered recall and the two-predicate BitmapAnd fixture; AIO (`io_method=worker`, 3 workers, `effective_io_concurrency=16`) benefits the bitmap heap fetch, not the HNSW graph walk — keep capability, planner choice and AIO observation separate.
  - [ ] PGVECTOR-05 INDEX HYGIENE: decide the 768 MB `content_embedding_768` HNSW (drop/archive vs keep) and check bloat on the canonical index; no DDL without approval.
  - [ ] PGVECTOR-06 CONSUMER STREAMS: FeatureMatrix / KMeans / KNN read chunks through the same keyset/cursor stream into Arrow/mmap artifacts keyed by CandidateOrdinalMap checksum; classification labels gate what is streamed (CLASSIFICATION-GATE-01).
  - **Sequencing:** classification gate -> current source authority -> PGVECTOR-01 (plan) -> PGVECTOR-02 (contract + dry-run stream) -> PGVECTOR-03/04 (parity) -> bounded authorized backfill. No pgvector write, index change or backfill is authorized by this note.

- [x] WORKSTATION-PGVECTOR-SMOKE-01 (2026-09-20, `node scripts/atlas/smoke-workstation-pgvector-stack-v1.mjs` -> `docs/reports/smoke-workstation-pgvector-stack-v1.json`; read-only, READ ONLY transactions rolled back, writes only its own report; exits 1 only on FAIL). Operator scope: **the Parent Atlas Workstation is not finished**; it needs UUIDv5-v8 identity, a registry for pgvector, the SSR Parent Atlas Studio admin page, go-retrieval, drizzle-orm, chunking and UUID synthesis, with a smoke validation. **Every named piece already has an owner in the repo, so this smoke composes them and creates no new UUID module, registry, chunker or page** (Duplication Prevention): UUID = `atlas/identity/atlas-uuid-namespaces-v1.ts` (frozen namespaces) + `utils/uuid.ts` (`deriveUUID`, UUIDv8); pgvector registry-like tables = `atlas_vector_registry`, `atlas_tensor_artifacts`, `atlas_packet_registry`; admin page = `routes/(app)/admin/unified-indexing-studio` + `routes/api/atlas/studio`; go-retrieval = `retrieval/go-retrieval-{client,coordinator,facade}.ts` + existing `scripts/atlas/go-retrieval-smoke.mjs`; chunking = `indexer/ast-chunker.ts` + `chunk-id.ts`.
  **PROVEN 2026-09-21:** the page loader now probes the optional Drizzle-owned
  `graph_pathway_cards` relation read-only and returns an unavailable count when
  the live schema has not applied that migration. The bounded live smoke passed
  14 checks with 1 warning and 0 failures; SSR returned HTTP 200. The warning is
  the independent `PGVECTOR-CHUNK-STREAM-01` coverage gap (55,169/274,465
  embedded rows), not a failure of this composition smoke. No migration or
  canonical/vector/cache write was performed.
  - **Next bounded rehearsal seam (`WORKSTATION-SEMANTIC-REHEARSAL-01`, read-only/rollback-only):** use one synthetic or already-qualified chunk fixture and preserve the existing 1:N packet→chunk lineage contract. The receipt must carry `canonicalChunkId`, deterministic UUIDv8 derivation, `sourceRevision`, `workspaceRevision`, `representationRevision`, exact-vs-HNSW result identity, Go Retrieval identity passthrough, and Studio/API identity passthrough. `canonicalAuthority=false`, `promotionAuthorized=false`; no new registry/table/UUID owner and no Qdrant or Valkey write.
  - **Result (11 PASS, 3 WARN, 1 SKIPPED_ENV, 0 FAIL):** S1 UUID: root namespace is v4, PACKET_AGGREGATE and TITLE are v5, distinct, RFC variant ok; the v5 algorithm reproduces the RFC 4122 test vector (`python.org` -> `886313e1-...`); v5 is deterministic and name-sensitive; the v8 owner exports `deriveUUID`. S3 pgvector 0.8.3, canonical HNSW `codebase_chunk_index_content_hnsw` valid/ready 106 MB, exact-vs-HNSW mean recall@10 = 1.000 over 5 queries (ef_search=100). S4 registry-like tables present. S5 go-retrieval `:8100` READY_FULL (pgvector, Qdrant, embedding service all connected) and `:8096` 200. S6a studio route files present.
  - **S2 Drizzle/live schema alignment PROVEN (2026-09-20):** declared the seven existing nullable vector columns in `schema-postgres.ts` with live dimensions/types (`vector(384/64/768)`, `halfvec(768/256/128)`). The smoke now reports **0 live-not-declared, 0 declared-not-live, 0 type mismatches**. This is a schema-model edit only: no DDL, migration, writer, or promotion was performed. Keep the `tablesFilter` protections and review generated SQL before any schema mutation.
  - **WARN 2 — S3c embedding coverage (column-specific, reverified 2026-09-20):** the older `content_embedding` column has 55,169 of 274,465 rows (20.1%), but the canonical `semantic_768` column `content_embedding_768` has 219,998 of 274,465 rows (80.2%). This corrects the earlier shorthand rather than closing the workstation gate: revision-qualified streaming still admits 0 rows, and the legacy 384/other columns remain separate representations. PostgreSQL 18.4, `vector` 0.8.3, and the canonical HNSW index are live; no backfill or index mutation was performed.
  - **S1e chunk-id contract reconciled (2026-09-20):** `chunk-id-conversion.test.ts` now tests the current owner (`classifyChunkReference`, `verifyResolutionKind`) and explicitly asserts that `legacyChunkIdToUuid` remains `null`; raw legacy integers route through the text `chunk_id` column and no synthetic UUID is invented. Focused Vitest passes **9/9** including `uuid.spec.ts`. The smoke's static owner/test check is now PASS; this does not prove live chunk-row UUID synthesis, which remains intentionally disallowed.
  - **SKIPPED_ENV — S6b SSR render:** the dev server `:5173` was down, so the studio page's SSR response is NOT_PROVEN (start with `npm run dev`, then rerun; auth redirect or 200 pass, 5xx fails).
  - **Limits of this smoke (do not overclaim):** the recall probe uses 5 rows' own embeddings as queries (each row is its own nearest neighbor), so it proves the HNSW index is sane, not filtered or out-of-sample recall (PGVECTOR-03/04 still open); nothing here exercises Drizzle queries at runtime, the Go retrieval search path (only health), or UUID synthesis on real chunk rows; `uuid.spec.ts` (7 tests) passes separately.
  - **Open (nothing authorized by this note):** declare the 7 columns in Drizzle; decide the chunk-id test/contract; run the SSR check with the dev server up; a real synthesis check (deterministic chunk/packet UUID on a sample of live rows, collision test) once the chunk-id contract is decided; the UUID-for-registry question (v5 index key from `content_hash`, never identity) if a pgvector registry write is ever approved.

  - **UPDATE (2026-09-20, same day, rerun after concurrent edits by another session; uncommitted, not made by the author of this smoke):** two of the three WARNs above are now closed. (1) **S2 Drizzle drift -> PASS:** `schema-postgres.ts` now declares the 7 previously undeclared live columns (`content_embedding_768`, `summary_embedding_384`, `error_embedding`, `error_embedding_latent_256`, `error_embedding_latent_128`, `error_embedding_latent_64`, `latent_128`) as pure read-model declarations with a comment that they authorize no writers, migrations or promotion; 0 live-not-declared, 0 declared-not-live, 0 type mismatches. (2) **S1e chunk-id -> PASS:** `chunk-id-conversion.test.ts` was rewritten to assert the fail-closed contract (`classifyChunkReference` keeps identity, `legacyChunkIdToUuid` must be `null`, `verifyResolutionKind`), 2/2 passing; the smoke's S1e now treats an intentional tombstone as correct. The stale-test decision was therefore resolved in favour of keeping the tombstone (no synthetic UUIDs). **Current smoke: 13 PASS, 1 WARN, 1 SKIPPED_ENV, 0 FAIL.** Remaining: S3c embedding coverage still 20.1% (55,169 of 274,465, unchanged, see PGVECTOR-CHUNK-STREAM-01) and S6b SSR render still NOT_PROVEN (dev server `:5173` down). The "Open" list above shrinks to: run S6b with the dev server up, the real UUID-synthesis check on live rows now that the contract is settled, and the pgvector registry question.
  - **WORKSTATION-PGVECTOR-SMOKE-01 ledger reconciliation (2026-09-20):** the live report confirms the prior S2 Drizzle declaration and S1e chunk-ID items are closed as evidence-backed subchecks; they are not separate remaining implementation tasks. The gate itself remains open because S3c coverage is only 20.1% and S6b SSR is `SKIPPED_ENV`. The remaining registry item is an ownership/readiness question only; no new registry or UUID writer is authorized.
  - **`WORKSTATION-SEMANTIC-REHEARSAL-01` contract rehearsal (2026-09-20):** `scripts/atlas/prove-workstation-semantic-rehearsal-v1.mjs` composes the existing UUIDv8, packet→chunk lineage, pgvector/Drizzle, Go Retrieval, and Studio/API owners with one synthetic revision-qualified fixture. It checks deterministic UUIDv8 derivation, exact-vs-HNSW identity parity, and identity passthrough shape while keeping `canonicalAuthority=false`, `promotionAuthorized=false`, and all DB/Qdrant/Valkey/Graph writes at zero. The command is resource-guarded and is now proven by the 11/11 receipt below. The report explicitly does not claim live packet→chunk admission, live search identity, or SSR rendering.
  - **`WORKSTATION-SEMANTIC-REHEARSAL-01` PROVEN (2026-09-20):** the guarded command completed with `RESOURCE_HEADROOM_OK` (33.08 GiB free disk, 6.52 GiB free memory) and 11/11 checks passed. `docs/reports/workstation-semantic-rehearsal-v1.json` records the input checksum, UUIDv8 determinism, exact/HNSW identity parity, Go Retrieval and Studio/API identity passthrough, and closed promotion. This is a synthetic contract proof only; it does not admit live rows or prove SSR rendering.

  - **ROBUSTNESS (2026-09-20, after the session resumed with Docker Desktop stopped: `dockerDesktopLinuxEngine` pipe absent):** the smoke now probes the database first; when Postgres is unreachable, S2/S3/S4 report `SKIPPED_ENV` (never FAIL, never PASS) and the Go retrieval checks skip on unreachable ports. Verified by running it with Docker down: 6 PASS (S1a-S1e, S6a) + 6 SKIPPED_ENV, exit 0. Note the exit code is 0 when only environment checks are skipped, so read `counts` in `docs/reports/smoke-workstation-pgvector-stack-v1.json`, not just `$?`. **That report was overwritten by this degraded run; the last full run was 13 PASS / 1 WARN / 1 SKIPPED_ENV / 0 FAIL (numbers recorded in the UPDATE above); rerun with Docker and the dev server up to regenerate it.** Docker Desktop was not restarted by the assistant (operator action). The live UUID-synthesis check on real chunk rows (identity kinds, `id`/`chunk_id` uniqueness, classification via `classifyChunkReference`) is deferred until the database is reachable.
  - **GO-RETRIEVAL-IDENTITY-ENVELOPE (2026-09-20, bounded live read-only query):** `npm run atlas:docs:go-retrieval-identity` reports `READY_FULL` and HTTP search success after rebuilding the Go service. The adapter no longer promotes Qdrant projection IDs into `chunk_id`: all 3/3 results now leave canonical `chunk_id` empty when no explicit candidate ID exists. All 3/3 still carry `packet_key`, `source_ref`, and `content_hash`; 1/3 `representation_id` values lacks `representation_revision`. The audit remains `IDENTITY_ENVELOPE_REVIEW_REQUIRED`, with `canonicalAuthority=false`, `writesPerformed=false`, and `promotionAuthorized=false`. Retrieval remains an executor; do not synthesize revisions or UUIDs in this lane. Go tests pass. Report: `docs/reports/go-retrieval-identity-envelope-v1.json`.
- **CURRENT-SOURCE-AUTHORITY-REFRESH (2026-09-20, resource-guarded, read-only):** `npm run atlas:source-owner:reconciliation` completed with `CURRENT_SOURCE_AUTHORITY_NOT_PROVEN`; 25,107 sources, 34 current execution candidates, 1 exact current owner, 4 legacy completed candidates. The newer current frame remains a candidate only; no source admission or canonical writes were performed. Report: `docs/reports/current-source-owner-reconciliation-v1.json`.
- **CURRENT-SOURCE-AUTHORITY-REFRESH (2026-09-21, resource-guarded, read-only):** rerun completed with `RESOURCE_HEADROOM_OK` (29.32 GiB free disk, 6.77 GiB free memory). Current inventory is 25,115 sources against the admitted 25,542-source snapshot: 23,766 shared bytes match, 682 drifted, 667 added after snapshot, and 1,094 missing from the current worktree. The authority snapshot itself remains `CURRENT_SNAPSHOT_PROVEN`, but admission remains `CURRENT_SOURCE_AUTHORITY_NOT_PROVEN` because the worktree is dirty and differs from the revision-qualified manifest (`WORKTREE_DIRTY_REQUIRES_SNAPSHOT_POLICY`, `STATIC_WORKTREE_INVENTORY_DIFFERS_FROM_WORKSPACE_REVISION_MANIFEST`). No source admission, database, vector, cache, Graphify, or canonical writes occurred.
- **CURRENT-SOURCE-AUTHORITY-REFRESH (latest guarded run, 2026-09-21):** `npm run atlas:source-owner:reconciliation` completed with `RESOURCE_HEADROOM_OK` (29.02 GiB free disk, 5.24 GiB free memory). It reports 25,116 current sources versus 25,542 admitted-snapshot sources, 24,448 shared paths, 23,765 matching digests, 683 mismatches, 668 current-only paths, and 1,094 snapshot-only paths. The admitted snapshot execution remains internally proven, but current authority remains `CURRENT_SOURCE_AUTHORITY_NOT_PROVEN`; `canonicalAuthority=false`, `safeToPromote=false`, and no admission or canonical writes occurred. Report: `docs/reports/current-source-owner-reconciliation-v1.json`.
- **WORKSTATION-PGVECTOR-SMOKE-01 refresh (2026-09-20, resource-guarded, read-only):** `npm run atlas:smoke:workstation-pgvector-stack` produced 13 PASS, 1 WARN, 1 SKIPPED_ENV, 0 FAIL. UUID/Drizzle/pgvector HNSW/exact-vs-HNSW/registry/Go Retrieval/Studio route checks pass; embedding coverage remains 55,169/274,465 (20.1%) and SSR remains `NOT_PROVEN` because dev server `:5173` is down. Report: `docs/reports/smoke-workstation-pgvector-stack-v1.json`.
- **PGVECTOR-CHUNK-STREAM-01 refresh (2026-09-20, resource-guarded, read-only):** `npm run atlas:docs:pgvector-chunk-stream-dry-run` failed closed with `PGVECTOR_STREAM_BLOCKED_NO_ELIGIBLE_ROWS`, 0 pages and 0 rows, confirming no revision-qualified stream cohort is currently eligible. Report: `docs/reports/pgvector-chunk-stream-dry-run-v1.json`.
- **BITFROST-CACHE-WRITER-CENSUS refresh (2026-09-20, resource-guarded, read-only):** `npm run atlas:docs:cache-writer-census` found 4,829 occurrences, 969 writers, 1,089 readers, 184 runtime writers and 785 script writers. Only 25 writers use the canonical builder; 944 do not. No cache writes were performed. Next gate: `REVIEW_RUNTIME_WRITERS_WITHOUT_CANONICAL_BUILDER`; do not bulk-rewrite historical/script-only writers.
- **BITFROST-RUNTIME-WRITER-REVIEW refresh (2026-09-20, resource-guarded, read-only):** runtime census found 184 writer occurrences; 14 use the canonical builder and 170 remain review-required across 78 files. Classification: 29 `RESIDENCY_SPECIALIZED`, 11 `ROUTE_OR_ADAPTER`, 9 `TEST_OR_FIXTURE`, 29 `UNKNOWN_REVIEW`; no automatic repointing or cache writes. Reports: `docs/reports/bitfrost-runtime-writer-review-v1.json` and `docs/reports/bitfrost-runtime-writer-classification-v1.json`.
- **GO-RETRIEVAL-IDENTITY-ENVELOPE refresh (2026-09-20, live bounded read-only):** `npm run atlas:docs:go-retrieval-identity` reports `READY_FULL` with Postgres, pgvector, Qdrant, embedding service, and Redis healthy; bounded search returned 3/3 rows carrying `packet_key`, `source_ref`, and `content_hash`. The adapter correctly leaves canonical `chunk_id` missing when no explicit candidate ID exists, but all 3 rows lack a source revision, and the two rows with `representation_id` lack `representation_revision`. Status remains `IDENTITY_ENVELOPE_REVIEW_REQUIRED`; no synthetic UUID/revision or writer was introduced. Report: `docs/reports/go-retrieval-identity-envelope-v1.json`.
- **PGVECTOR-CHUNK-STREAM-01 refresh (2026-09-20, resource-guarded read-only):** the stream dry-run launched with 29.4 GiB free disk and 4.23 GiB free memory, then failed closed as `PGVECTOR_STREAM_BLOCKED_NO_ELIGIBLE_ROWS`: `qualifiedRowsLive=0`, `pagesCompleted=0`, `rowsSeen=0`. The keyset/cursor stream remains unwritten and safe; the blocker is still missing source/workspace/representation admission, not stream execution. Report: `docs/reports/pgvector-chunk-stream-dry-run-v1.json`.
- **PGVECTOR-CHUNK-STREAM-01 refresh (2026-09-21, resource-guarded read-only):** rerun completed with 29.03 GiB free disk and 5.57 GiB free memory; it failed closed identically as `PGVECTOR_STREAM_BLOCKED_NO_ELIGIBLE_ROWS` with `qualifiedRowsLive=0`, `pagesCompleted=0`, and `rowsSeen=0`. No embedding backfill, Postgres write, Qdrant write, or cache write was attempted. Report: `docs/reports/pgvector-chunk-stream-dry-run-v1.json`.
- **PGVECTOR-CHUNK-STREAM-01 current refresh (2026-09-21, resource-guarded read-only):** rerun after source-owner reconciliation completed with 28.82 GiB free disk and 5.19 GiB free memory; it again failed closed as `PGVECTOR_STREAM_BLOCKED_NO_ELIGIBLE_ROWS` with `qualifiedRowsLive=0`, `pagesCompleted=0`, and `rowsSeen=0`. This confirms the stream owner is safe and deterministic, while source/workspace/representation admission remains the sole blocker. No embedding backfill, Postgres write, Qdrant write, or cache write was attempted. Report: `docs/reports/pgvector-chunk-stream-dry-run-v1.json`.
- **READ-ONLY BLOCKER REFRESH (2026-09-21):** the source-owner command was first refused by the resource guard at 3.46 GiB free memory, so no large audit ran. A bounded symbol rehearsal then regenerated the existing structural proof with the explicit `sha256:e2e80507…` workspace frame: 461 nominations, 461 `SOURCE_ONLY`, 0 AST matches, 0 tree-bound rows, and `resolutionAttempted=false`; the follow-on plan contained 0 entries and preserved `canonicalAuthority=false`, `promotionAuthorized=false`, and zero database writes. This is a genuine fail-closed cohort mismatch, not proof of 461 bad symbols. The offline domain review sheet was regenerated with 142 rows / 49 revision-qualified rows and no labels promoted. A one-page direct pgvector dry-run again returned `PGVECTOR_STREAM_BLOCKED_NO_ELIGIBLE_ROWS` (`qualifiedRowsLive=0`, `pagesCompleted=0`, `rowsSeen=0`); no vector, database, Qdrant, or cache writes occurred. Reports: `docs/reports/ast-symbol-resolution-v1.json`, `docs/reports/domain-review-sheet-v1.html`, `docs/reports/pgvector-chunk-stream-dry-run-v1.json`.
- **PGVECTOR-03 EXACT/HNSW REPLAY refresh (2026-09-20, bounded resource-guarded read-only):** the existing replay harness inspected the live `semantic_768`/`content_embedding_768` HNSW schema, but correctly failed closed before query comparison because the bounded cohort contains **0 revision-qualified vector rows**. Status: `PGVECTOR_REPLAY_BLOCKED_SOURCE_REVISION`; no `EXPLAIN` result was promoted as parity, and no writes occurred. Report: `docs/reports/postgres-pgvector-exact-hnsw-replay-v1.json`.
- **WORKSTATION-PGVECTOR-SMOKE-01 refresh (2026-09-20, resource-guarded, read-only):** the composed workstation smoke passed **13** checks (UUID namespaces/derivation, Drizzle/live vector schema, pgvector 0.8.3, canonical HNSW readiness, Go Retrieval health/search, and Studio route files), warned on column-specific embedding coverage, and skipped only the SSR response because `:5173` was unreachable. The smoke remains non-promotional: no database/vector/cache writes; SSR is still `NOT_PROVEN`. Report: `docs/reports/smoke-workstation-pgvector-stack-v1.json`.
- **OKF-CLAIM-FRESHNESS refresh (2026-09-20, read-only):** the existing derived-claims audit scanned 32 claims and found 0 valid and 32 unresolved. Status remains `CLAIM_FRESHNESS_REVIEW_REQUIRED`; no OpenWiki runtime, canonical promotion, database, cache, vector, or source writes occurred. Report: `docs/reports/okf-claim-freshness-v1.json`.
- **OPENSPEC-WORKBOARD-RECONCILIATION refresh (2026-09-20, read-only):** the execution controller reports 9,296 task nodes (5,995 proven, 2,272 nominally actionable, 925 waiting, 104 deferred), while the task-ledger audit covers 114 changes with 6,460/9,970 checked boxes (64.79%), 24 fully complete changes, and 27 changes carrying staleness markers. The controller's `selectionEligible` distinction remains authoritative: nominally actionable is not equivalent to executable when authority text, receipts, or external runtime prerequisites are missing. Dependency receipts remain under-declared (`TASK_LEDGER_DEPENDENCY_RECEIPTS_NOT_DECLARED`). No task checkbox was closed and no datastore writes occurred. Reports: `docs/reports/openspec-progress-audit-v2.json` and `docs/reports/openspec-tasks-md-audit-v1.json`.
- **FULL ACTIONABLE CONTROLLER EXPORT corrected and proven (2026-09-21, read-only):** `scripts/atlas/audit-openspec-execution-controller-v1.mjs` previously applied an implicit `.slice(0, 200)` to `actionableTasks`, silently converting the controller report into a top-200 sample. The cap was removed; explicit pagination remains a consumer concern. Regenerated controller/actionable reports now agree on **2,272/2,272** `ACTIONABLE` task objects with `exportTruncationDetected:false`; blocker audit remains fail-closed (`WAITING`, 5 blocker groups), `selectionEligible` remains authoritative, and `writesPerformed:false`. This closes the export-integrity defect only; it does not promote nominally actionable tasks or authorize mutation. Evidence: `docs/reports/openspec-actionable-lane-audit-v2.json`, `docs/reports/openspec-execution-controller-v1.json`, `docs/reports/openspec-actionable-work-v1.json`.
- **Actionable workboard replay after export fix (2026-09-21, read-only):** refreshed `openspec-authority-text-review-v1.json` and `actionable-workboard-v3.json`; the focused regression `npm run test:openspec-actionable-v3` now passes with 2,272 actionable tasks, full-population count parity, rank-order parity, and authority-review exclusion. Current authority review remains 385 tasks requiring review; `writesPerformed:false`. This proves report reconciliation, not task completion or canonical promotion.
- **CURRENT-SOURCE-OWNER reconciliation refresh (2026-09-21, resource-guarded, read-only):** after the resource guard recovered above its 4 GiB minimum, `npm run atlas:source-owner:reconciliation` completed with `CURRENT_SOURCE_AUTHORITY_NOT_PROVEN`. The current worktree inventory is internally readable (`25,116` admitted sources), but comparison with the admitted snapshot `sha256:e24bb971…` remains non-parity: `24,448` shared paths, `23,765` digest matches, `683` shared digest mismatches, `668` current-only paths, and `1,094` snapshot-only paths. `requiresSnapshotRefresh:true`, `safeToPromote:false`, and `writesPerformed:false`; 34 current execution candidates remain non-authoritative. Report: `docs/reports/current-source-owner-reconciliation-v1.json`.
- **OKF-V02 bundle audit refresh (2026-09-21, read-only):** `npm run atlas:docs:okf:v02` scanned 25 `.okf` files; 0 satisfy the current provenance/trust/lifecycle profile and all 25 remain review-required. Manifest drift is explicit: declared domains missing from disk are `cache.yaml`, `database.yaml`, and `retrieval.yaml`; `structured-value.yaml` exists but is undeclared. No automatic metadata repair, canonical promotion, database/cache/vector write, or OpenWiki runtime invocation occurred. Report: `docs/reports/okf-v02-bundle-audit-v1.json`.
- **VECTOR-REGISTRY-OWNERSHIP refresh (2026-09-20, resource-guarded, read-only):** existing registry roles remain distinct: `atlas_vector_registry` has 4,480 rows and is the canonical vector-lineage owner; `vector_index_registry` has 4 legacy rows; `registry_topology_projection` is an empty stale projection; and `registry_projection_stats` is a reporting view with 4 rows. No new pgvector registry, UUID writer, DDL, or data write was introduced. Report: `docs/reports/vector-registry-ownership-audit-v1.json`.
- **OKF-AST-CONTEXT-CLASSIFICATION refresh (2026-09-20, read-only):** the derived-context audit scanned 7,286 files and produced 2,447 findings: 719 production-review-required, 1,068 unlabeled synthetic-production-review, 533 acceptable test fixtures, 103 throwing-stub reviews, 14 unreferenced/synthetic-stub reviews, and 10 demo-flag reviews. The audit remains noncanonical (`canonicalAuthority=false`, `writesPerformed=false`); it does not promote structural observations into ontology or identity. Report: `docs/reports/okf-ast-context-classification-v1.json`.
- **VECTOR-REGISTRY-OWNERSHIP refresh (2026-09-20, resource-guarded, read-only):** `atlas_vector_registry` is the canonical vector-lineage owner (4,480 rows); `vector_index_registry` is legacy (4 rows); `registry_topology_projection` is a stale empty projection; `registry_projection_stats` is a reporting view. No new registry or writes were introduced. Report: `docs/reports/vector-registry-ownership-audit-v1.json`.
- **WORKSTATION-PGVECTOR-SMOKE-01 SSR refresh (2026-09-21, bounded live read-only):** SvelteKit was started without rebuilding containers and the smoke was rerun. The ACP/AgentCard HTTP routes were healthy, but `/admin/unified-indexing-studio` returned HTTP 500 because PostgreSQL `to_regclass('public.graph_pathway_cards')` is NULL while the Drizzle schema owner `src/lib/server/db/schema/graph-pathway-cards.ts` and historical snapshots still declare it. The server log identifies the exact failure as `relation "graph_pathway_cards" does not exist`. No migration was created or applied; the workstation smoke remains open on the schema/runtime dependency and 20.1% embedding coverage. The dev server was stopped after proof to release memory.
- **PG18-INDEX/AIO-CAPABILITY refresh (2026-09-20, resource-guarded, read-only):** PostgreSQL 18.4 with `io_method=worker` and `effective_io_concurrency=16` is live. Schema and plan capture pass. AIO is capable but not directly observed. Bitmap plans are generatable for 4/4 fixtures and planner-selected for 2/4; no BitmapAnd combination was observed. Missing indexes remain on `atlas_symbol_versions.source_revision` and `qualified_name`; no migration was drafted or applied. pgvector HNSW capability is proven, parity was not rerun in this audit. Report: `docs/reports/postgresql18-index-capability-v1.json`.
- **BITFROST-WARMER-DRY-RUN refresh (2026-09-20, resource-guarded, report-only):** the packet-backed warmer read 0 lineage-qualified rows from `atlas_packets`, planned 0 packet/feature/ACE keys, applied 0 writes, and recorded the fail-closed next action: resolve source/workspace authority before rerunning. Report: `docs/reports/bitfrost-semantic-cache-warm.json`.
- **ONTOLOGY-POPULATION-DECISION refresh (2026-09-20, resource-guarded, read-only):** the existing OAK/ontology tables remain empty (`ontologyConceptRows=0`, `ontologyRelationRows=0`) while 539,124 tuples remain unresolved. The audit correctly keeps `canonicalAuthority=false` and blocks tuple promotion until `KNOW-09_SOURCE_AUTHORITY_RECONCILIATION_BEFORE_TUPLE_PROMOTION`; no ontology writes were performed. Report: `docs/reports/ontology-population-decision-v1.json`.
- **CURRENT-SOURCE-COHORT refresh (2026-09-20, resource-guarded, read-only):** the 52-row cohort remains `WORKSPACE_REVISION_SOURCE_MISMATCH`: all 52 match the historical Graphify/source revision, 0 match the current workspace, and 52 remain revision-qualified only against the stale projection. No missing or ambiguous rows were found. Report: `docs/reports/current-source-cohort-lineage-v1.json`.
- **CURRENT-WORKSPACE-FRAME-ADMISSION refresh (2026-09-20, read-only gate):** selector still points to `sha256:e24bb971…`, but the cohort spans three workspace revisions and has 0 current-workspace matches. Receipt status is `STALE_WORKSPACE_PROJECTION`; `safeToPromote=false`, `promotionEligible=false`, `writesPerformed=false`, next gate `CURRENT_SOURCE_AUTHORITY_RECONCILIATION_REQUIRED`. Report: `docs/reports/current-workspace-frame-admission-v1.json`.
- **KNOW-09 drift disposition refresh (2026-09-20, resource-guarded, read-only):** 629 tracked uncommitted/submodule drift entries, 35 tracked implementation-drift entries, and 8 missing admitted sources remain. No reconciliation or source admission was applied. Report: `.tmp/knowledge-source-drift-disposition-v1.json`.
- **CURRENT-LINEAGE-CLOSURE refresh (2026-09-20, resource-guarded, read-only):** 52 workspace-source rows; 0 packet-qualified, 4 packet/chunk-qualified, 48 AST-qualified, 0 span-qualified, and 0 CandidateOrdinal-eligible. The execution source remains non-promotable and no writes occurred. Reports: `docs/reports/current-lineage-closure-v1.json` and `docs/reports/parent-atlas-current-lineage-funnel-v1.json`.
- **AST-UNIT-SCHEMA-ALIGNMENT-01 (2026-09-20, read-only audit corrected and proven):** `scripts/atlas/audit-nlp-sidecar-ast-schema-alignment-v1.mjs` now distinguishes sidecar evidence mappings from canonical-writer/source-lineage/archive/database-managed columns instead of treating non-sidecar fields as missing. Live 8095 structural output maps every required evidence field; all 23 `atlas_ast_nodes` columns are now mapped or explicitly classified. Result: `AST_UNIT_SCHEMA_ALIGNMENT_PROVEN`, `canonicalAuthority=false`, `promotionAuthorized=false`, `writesPerformed=false`. Report: `docs/reports/nlp-sidecar-ast-schema-alignment-v1.json`.
- **AST RUNTIME/OFFSET PROOFS refresh (2026-09-20, read-only):** `npm run atlas:docs:nlp:ast-runtime` passed 9/9 and `npm run atlas:proof:ast-offset-basis` passed with 54 candidate rows and 4 BOM files. The focused `node --test packages/parent-atlas/test/langextract-utf8-grounding.test.mjs` also passed 11/11, including parser-buffer, BOM, astral UTF-8, surrogate rejection, revision mismatch, and invalid-buffer cases. These prove the grounding contract; live structural-adapter propagation remains a separate open gate. Reports: `docs/reports/nlp-sidecar-ast-runtime-v1.json`, `docs/reports/ast-offset-basis-proof-v1.json`.
- **STRUCTURAL-ADAPTER-PARSER-BUFFER-PROOF (2026-09-20):** the focused Vitest suite `src/lib/server/atlas/indexing/graphify-structural-intelligence-adapter.spec.ts` now passes 4/4. The native fixture supplies `parserBuffer` and reaches `COMPILED_NATIVE`; the fallback fixture omits it and remains `COMPILED_NONPROMOTABLE` with `PARSER_BUFFER_DERIVED_FROM_SOURCE_TEXT`. Parser-buffer checksum, UTF-8 span count, mismatch/rejection counts, and no-canonical-identity assertions pass. No persistence or promotion occurred.
- **STRUCTURAL-INTELLIGENCE-INTEGRATION refresh (2026-09-20, resource-guarded):** static proof passed Parent Atlas build, contract tests, Python provenance tests, static wiring audit, and frontend structural integration tests. Status remains `STATIC_PROOF_PASS_LIVE_NOT_RUN`; the live 8095 proof was not enabled, so this does not establish current-source authority or canonical promotion. Report: `docs/reports/structural-intelligence-integration-proof.json`.
- **STRUCTURAL-INTELLIGENCE-LIVE-8095-PROOF (2026-09-20, resource-guarded, read-only):** reran the integration proof with `ATLAS_PROVE_LIVE_SIDECAR=1`; Parent Atlas build, contract tests, Python provenance tests, static wiring, frontend integration, and the live 8095 provenance request all passed. Status: `PROVEN_WITH_LIVE_8095`. No canonical writes or promotion occurred. Report: `docs/reports/structural-intelligence-integration-proof.json`.
- **CAPABILITY-CENSUS-RESOURCE-GATE (2026-09-20):** `npm run atlas:docs:capability-census` was refused by the resource guard at 2.9 GiB free memory (minimum 4 GiB); no report refresh or audit execution occurred. The guarded-script regression still passes 2/2, confirming high-risk package commands cannot bypass the safety floor. No writes occurred.
- **CAPABILITY-CENSUS refresh (2026-09-20, resource-guarded, read-only):** scanned 5,000 files; summary `PROVEN=21`, `PRESENT_CONTRACT=4`, `WAITING=14`, `UNPROVEN=4`. Semantic checksum: `e4d49b251316c0c143179c9c5e126b400c92fa2f1b89a1f84fdea72870c6073b`. Report: `docs/reports/parent-atlas-capability-census-v1.json`.
- **DOMAIN-REVIEW-SHEET refresh (2026-09-20, resource-guarded, offline artifact):** generated the searchable review sheet with 142 rows, including 49 revision-qualified rows. It writes only the HTML report; no labels, routing authority, classifier promotion, or database state was changed. Output: `docs/reports/domain-review-sheet-v1.html`.
- **CAPABILITY-CENSUS-RECOVERY (2026-09-20):** after memory recovered above the guard floor, the guarded census completed: 5,000 files scanned, `PROVEN=21`, `PRESENT_CONTRACT=4`, `WAITING=14`, `UNPROVEN=4`, checksum `e4d49b251316c0c143179c9c5e126b400c92fa2f1b89a1f84fdea72870c6073b`. The inventory is explicitly non-exhaustive (`scanTruncated=true`); no capability was promoted from this census alone.
- **DOMAIN-REVIEW-SHEET-RECOVERY (2026-09-20):** guarded offline review artifact generated successfully with 142 rows and 49 revision-qualified rows. It is ready for human labeling but does not create gold labels or routing authority. Output: `docs/reports/domain-review-sheet-v1.html`.
- **ROUTER-MATRIX-SURFACE-AUDIT (2026-09-20, read-only):** `query-router-4x4.ts` is the canonical executable router with two live consumers; `retrieval/query-router-4x4.ts` is a legacy executable with zero consumers; `router-matrix.ts` is compatibility vocabulary with zero consumers; `stage-a0-routing.ts` is an unused stage adapter. Feature-matrix schema is separate and has seven consumers. Audit status remains `ROUTER_OWNER_CONSOLIDATION_NOT_AUTHORIZED`; no router rewrites or writes performed. Report: `docs/reports/pipeline-router-matrix-surfaces-v1.json`.
- **ACP-NLP-SIDECAR-LIVE-PROOF (2026-09-20, read-only):** `scripts/atlas/acp-nlp-sidecar-tools-live-proof-v1.mts` passed with tools registered, capabilities endpoint healthy, `astChunk` returning `atlas.ast.evidence.v1` with 2 clean chunks, analyze success, and dry-run mode working. Live sidecar reports `treesitter_chunker`, Tree-sitter, ast-grep, LangExtract, spaCy, and BeautifulSoup imports available; `fixtureVerified=false` remains explicitly open, and GPU/RAPIDS ownership stays external. No canonical writes or promotion occurred.
- **TREE-SITTER-CHUNKER-FIXTURE-PROOF (2026-09-20):** strengthened `scripts/atlas/acp-nlp-sidecar-tools-live-proof-v1.mts` so `fixtureVerified` requires a successful `atlas.ast.evidence.v1` response, non-empty chunks, and `syntax_status=CLEAN`. The live proof passes with 2 chunks and `fixtureVerified=true`; the sidecar capability endpoint's separate field remains false because it is import-only and does not execute a fixture. No runtime or canonical writer changes were made.
- **ACP-NLP-SIDECAR-RECEIPT-PERSISTENCE (2026-09-20):** the live ACP proof now persists `docs/reports/acp-nlp-sidecar-tools-live-proof-v1.json` with `canonicalAuthority=false`, `promotionAuthorized=false`, and `writesPerformed=false`. The receipt records registered tools, live capabilities, clean 2-chunk fixture verification, analyze success, and dry-run success. This is a report artifact only; no datastore or canonical writes occur.
- **PACKET-SOURCE-SCOPE refresh (2026-09-20, resource-guarded, read-only):** 61,718 packet rows across 829 folders; 0 have `source_revision`, all 61,718 retain legacy `workspace_revision=0`, and only 16,543 exact admitted-binding path matches exist. Status: `OPERATOR_FOLDER_DISPOSITION_REQUIRED`. The audit recommends retaining only source-qualified code/data folders, reviewing vendor/projection folders, and excluding `.python311`-style non-source content; no disposition or writes were applied. Report: `docs/reports/packet-source-scope-v1.json`.
- **PACKET-CHUNK-LINEAGE-PREFLIGHT refresh (2026-09-20, read-only):** promotion preflight found `eligibleCandidateCount=0`, with the first failing boundary `RUN_FILE_MISSING`. Execution membership exists (25,542 rows), but requested-run file evidence is absent; packet revision matches and chunk revision matches are both 0. Candidates remain `BLOCKED_LINEAGE_AUTHORITY` for missing packet/chunk or revision mismatch. No writes or promotion authorization occurred. Report: `docs/reports/packet-chunk-lineage-promotion-preflight-v1.json`.
- **PACKET-CHUNK-LINEAGE-BRIDGE refresh (2026-09-20, resource-guarded, read-only):** deployment relation is present with **7,421 proven rows**, but the current selected **25,271 membership rows have 0 exact current packet/chunk bridge members**. Only **577** rows have exact proven lineage against other evidence; **24,694** do not. All 25,271 classify `CURRENT_SOURCE_BINDING_MISSING`; duplicate membership identities and workspace-revision mismatches are both 0. This confirms the bridge is structurally deployed but not current-source-qualified, so packet/chunk promotion, CandidateOrdinal admission, FeatureMatrix production, and downstream semantic/cache/GPU consumers remain closed. No database, vector, cache, Graphify, or source writes occurred. Report: `docs/reports/current-packet-chunk-lineage-bridge-v1.json`.
- **PACKET-SOURCE-SCOPE-CONTRACT test (2026-09-20):** packet-source-scope contract test passed 8/8 while preserving `OPERATOR_FOLDER_DISPOSITION_REQUIRED`, 829 folders, 61,718 packet rows, and zero writes.

## SESSION-206 CONSOLIDATED-ENHANCEMENT-REQUEST-01 — owner audit before any new build (2026-09-22)

Operator asked, across two messages in one turn, for a wide bundle: closing ~1,000 unclassified
files out of ~25k, an NLP-sidecar FastAPI POS tagger, a "neural decoder prefill," word-cluster
sub-helper metrics, `ae:train`/KMeans cosine-similarity clustering, NB/logistic-regression via
cuBLAS GEMM/cuML/cuDF gradient descent, a SIMT/cuTile GPU feature-matrix cache for
ontology-linked-list ↔ oaklib/NetworkX alignment, a WSL2 cuTile/RTX/TensorRT sidecar, CUDA 13.4,
"agentic dense search" + rg-keyword sub-helper scripts, and agentic error-fixing wiring. Per this
repo's Duplication Prevention rule (CLAUDE.md "🚫 Duplication Prevention — Audit Before You
Build"), grepped for an existing owner of each piece before adding any task. Every piece already
has one; nothing here is a green-field build. Table below records the owner and the real next
step. No code was written by this pass — it only updates the task ledger.

| Requested piece | Existing owner (verified live/on-disk, this session) | Status | Next task |
|---|---|---|---|
| "~1,000 unknowns from 25k files" | **Unverified as stated.** The real, currently-tracked ~25k-scale blocked cohort is `PACKET-CHUNK-LINEAGE-BRIDGE`'s 25,271 membership rows (`CURRENT_SOURCE_BINDING_MISSING`, 0 exact bridge members) and the 25,542-row `PACKET-CHUNK-LINEAGE-PREFLIGHT` cohort (`RUN_FILE_MISSING`) — both above, same file. `DOMAIN-REVIEW-SHEET` (142 rows, 49 revision-qualified) is the actual domain-*label* cohort and is two orders of magnitude smaller than "1,000." No script or report in this repo currently emits a "1,000 unclassified of 25k" figure. | **NOT_PROVEN — number needs a source** | Do not build against an unverified count. Run `npm run atlas:docs:capability-census` (or the `domain_class` distribution directly: `SELECT domain_class, count(*) FROM atlas_packets GROUP BY 1 ORDER BY 2 DESC`) and compare to whatever produced "1,000/25k" for the operator before scoping work to it. |
| Domain classification taxonomy / closing unknowns | `python/train_domain_classifier.py` (offline sklearn NB+LR trainer, canonical per CLAUDE.md "CLASSIFICATION-GATE-01"), `python/atlas_nlp_classification_helper_v1.py` (read-only FastAPI seam), `docs/reports/domain-review-sheet-v1.html` (human-label intake, 142/49 rows) | Trust floor not met: 49 revision-qualified rows vs. the 200-row / 30-per-class floor CLAUDE.md sets | Grow the reviewed set via the existing review-sheet workflow (`node scripts/atlas/build-domain-review-sheet-v1.mjs`) — do not add a second labeling tool or a second trainer. |
| NLP sidecar FastAPI + POS tagger | `python/miniforge_nlp_sidecar.py` / `miniforge_nlp_sidecar_v2.py` (live `:8095`, spaCy POS confirmed available per `ACP-NLP-SIDECAR-LIVE-PROOF` above), `python/parent_atlas_ontology/enums.py` | Live, evidence-executor only (`canonicalAuthority=false` by design) | No new sidecar. If POS output needs to reach a new consumer, extend the existing `atlas.ast.evidence.v1` envelope — do not stand up a second `:80xx` FastAPI process for POS. |
| "Neural decoder prefill" | `atlas-neural-decoder` Docker GPU service (`docker/atlas-neural-decoder/`, port 8121, `PrefillReceiptV1`/`PrefillContentIdentityV1` boundary — see CLAUDE.md's Neural Decoder Container section) | `DECODER-CONTAINER-01` closed, live-proven | Already exists; if this request meant something else (a *classification*-specific prefill lane), it needs a one-line clarification from the operator — do not build a second decoder container on the strength of a guess. |
| Word-cluster sub-helper metrics / rg keyword helpers | `scripts/atlas/build-rg-search-matrix.mjs`, `scripts/atlas/hot-keyword-cluster-summary.mjs` (both present on disk) | Present, not audited this session for live-caller status | Before adding new rg/keyword helper scripts, run their existing `--dry-run` (if present) and check for live `npm run` wiring in `package.json`; extend these two rather than adding a third. |
| `ae:train` / KMeans cosine clustering | `scripts/atlas/kmeans-chunk-cluster.py` (real cuVS/cuML KMeans on WSL2 `atlas-rapids-cu13`, `npm run atlas:kmeans:apply` family — k=64/128/256 all wired), `scripts/atlas/compute-som-centroids.mjs`, `scripts/atlas/kmeans-summary-enrichment.mts` | Live, pinned to CUDA 13.0/RAPIDS 26.06 per GPU-MINI-FABRIC-01 | No new KMeans/AE trainer. An `ae:train` alias for the existing autoencoder (`latent_64`/`128`/`256`, see CLAUDE.md Embedding Dimensions Policy) would be a thin npm-script wrapper at most, not a new algorithm. |
| NB / logistic-regression / gradient descent via cuBLAS GEMM, cuML, cuDF | `python/train_domain_classifier.py` (NB+LR, sklearn, CPU, canonical per CLASSIFICATION-GATE-01), `python/atlas_rapids_sidecar.py`, `python/atlas_semantic512_build_routing.py`, `python/atlas_semantic512_runtime.py`, `python/atlas_contextual_feature_reference.py` (all already reference cuML) | sklearn baseline is canonical; a cuML/GEMM version would be a **challenger**, never a replacement, until it beats the baseline on the same reviewed set | Per CLAUDE.md's explicit rule under CLASSIFICATION-GATE-01: "No PyTorch logistic-regression trainer exists; one would be a challenger behind the sklearn baseline, only after a reviewed set exists." The reviewed set (49/200 rows) is the actual blocker — a GPU trainer cannot be evaluated without it. |
| SIMT/cuTile GPU feature-matrix cache for ontology linked-lists ↔ oaklib/NetworkX | `python/atlas_oak_kernel.py` (live FastAPI kernel, `:8095`-adjacent, owned by the separate `parent-atlas-ontology-kernel` change — see Session 204 memory correction), `openspec/changes/parent-atlas-ontology-oaklib-fanout-bitmap/` (29/7 tasks, TS resolver layered *above* the Python kernel, not a duplicate), `native/cutile-ace-level2/`, `native/cutile-ace-level3/` (glyph-score/residency-key GPU proving ground, `DRY_RUN_PROVEN` both SIMT and Tile levels) | Layered, both halves already proven at small scale | A feature-matrix GPU cache for ontology/NetworkX alignment is new scope on top of proven primitives, not a new primitive. Route it through `parent-atlas-ontology-oaklib-fanout-bitmap`'s Phase 4 (not started) rather than opening a new change — see that file's own task list before adding here. |
| WSL2 cuTile/RTX/TensorRT sidecar, CUDA 13.4 | `atlas-rapids-cu13` (WSL2 conda env, **pinned** CUDA 13.0/RAPIDS 26.06 — CLAUDE.md: "Do not create a second RAPIDS environment... without first demonstrating this environment is unusable"), `atlas-cutile-cu132` (separate pip venv, cuTile 1.5.0, CUDA 13.2, proven `DRY_RUN_PROVEN` through LEVEL 3), TensorRT (referenced in the 8-tier inference cascade at `:8099`, not confirmed installed this session) | Two GPU envs already exist and are pinned by explicit operator-recorded decision | **CUDA 13.4 is an operator decision, not a default action** — do not install it. If TensorRT-RTX specifically (vs. the existing TensorRT-LLM `:8099` tier) is the actual ask, that's a distinct, unverified capability gap — confirm with the operator before installing anything net-new per `DEPENDENCY-CAPABILITY-GUARD-01`. |
| "Tricubic" (as stated) | **No match anywhere in the repo** (`git grep -i tricubic` / filesystem search, this session, zero hits outside node_modules/.venv) | Undefined term in this codebase | Needs a one-line clarification — likely meant is either (a) tricubic *interpolation* over the SOM 20×20 grid / 4D topology manifold (CLAUDE.md's "Topology 6-tier fallback clusters" / `topology_search_4d`), or (b) a mis-typing of "tri-gram"/"trie". Do not guess and build the wrong one. |
| Agentic dense search | `mcp__trace__atlas_packet_dense_search` (closed this cycle per user memory — Postgres bitmap-index prefilter + Qdrant dense-ANN rerank, Recall@10=100% on its proof set), `atlas.packet_search`, `search_hybrid`, `search_rerank` (all live TRACE MCP tools) | Live | Extend the existing dense-search tool's query surface (e.g. wire the ~1,000/25k cohort once the real count is confirmed) rather than adding a second dense-search entry point. |
| Agentic error fixing | `atlas:error:audit` → `atlas:error:plan` → `atlas:error:apply` → `atlas:error:verify` → `atlas:error:trace` (full P1 pipeline, `npm` scripts confirmed present) | Live pipeline exists; not re-verified live this session | Run `npm run atlas:error:audit:verbose` from `sveltekit-frontend/` to get current findings before deciding whether "update agentic error fixing" means a bug in this pipeline or a request to route classification failures through it. |

**Net effect of this pass:** zero new files, zero new services, zero schema changes. Every
requested capability maps onto an existing owner; the one genuinely blocking, common dependency
across the classification-adjacent asks (domain unknowns, NB/LR-vs-cuML challenger comparison,
ontology/oaklib fanout) is still `CLASSIFICATION-GATE-01`'s reviewed-set floor (49 of 200+30/class
required). **Recommended real next action, in order:** (1) confirm the actual "unknowns" count
against live `atlas_packets.domain_class`/`atlas_ast_nodes` data — do not build against the
unverified "1,000/25k" figure; (2) grow the domain review sheet toward the 200/30-per-class floor;
(3) only then evaluate a cuML/GPU challenger classifier against the sklearn baseline; (4) treat
CUDA 13.4, the cuTile/TensorRT-RTX sidecar, and the ontology feature-matrix GPU cache as
operator-gated follow-ons on `parent-atlas-ontology-oaklib-fanout-bitmap` Phase 4+, not new changes.

## SESSION-206b — "is function a symbol?" is already answered; the real gap is coverage + linking (2026-09-22)

Operator follow-up: "keyword recognition symbol = function? ast-grep didn't define this... POS
tagger/symbol metadata enrichment ontology linked tuples? 4D topology manifold coordinates of
indexed tables of what the keyword/function is/does/relates to (tuple)." Read the actual code
before answering — this is already partially built, not a green-field question.

**Finding 1 — the symbol-kind vocabulary already exists and answers the literal question.**
`sveltekit-frontend/src/lib/server/atlas/indexing/structural-observation-v1.ts` defines
`StructuralSymbolKindV1 = FILE | FUNCTION | METHOD | CLASS | INTERFACE | TYPE | ENUM | VARIABLE |
UNKNOWN` and `normalizeStructuralSymbolKind(rawKind, rawNodeType)`, which maps raw ast-grep/
tree-sitter node kinds (`function_declaration`, `arrow_function`, `method_definition`, etc.) onto
that enum. **`ast-grep` itself never defines "is this a symbol" — this normalizer is the layer
that does, and it already exists.** `UNKNOWN` is a deliberate, documented fallback (see the
function's own comment: "Deliberately do not coerce FRAGMENT/DECLARATION/CHUNK into a symbol
kind... cannot prove semantic symbol class") — not a missing case. `atlas_symbol_registry.symbol_kind`
(migration `20260818_atlas_symbol_registry_v1.sql`) is the durable Postgres column this normalizer's
output is meant to feed, via `graphify-symbol-writer-v1.ts`/`graphify-symbol-projection-v1.ts`.

**Finding 2 — a second, differently-scoped `symbol_kind` vocabulary already exists too, and is not
a duplicate to merge.** `scripts/atlas/lib/okf-schema.mts`'s `SymbolKindSchema` (per-language
`.okf/*.yaml` manifests) is a *domain-evidence weighting* concept (`weight`, `evidence_weight`,
`ast_labels`, used to score "does this symbol kind suggest the AUTH/DATA/UI domain"), not a
structural-type enum. Same field name, genuinely different capability — layered ownership per
CLAUDE.md's "One Canonical Runtime Owner Per Capability" rule, not something to consolidate. Flag
only: nothing currently cross-validates that every `ast_labels` entry in the `.okf` YAML actually
maps to a real `StructuralSymbolKindV1` value — this is exactly the "schema validation testing"
the operator asked about, and it does not exist yet.

**Finding 3 — no corpus-wide symbol classifier or coverage audit exists.** `rg -l "symbol.classifier|classifySymbol|symbolClassif"` across `src/`, `scripts/atlas/`, and `python/` returns
zero hits. `normalizeStructuralSymbolKind` is called per-chunk inside the structural-evidence
pipeline, but nothing aggregates `UNKNOWN` vs. classified counts across the corpus, and nothing
compares the two `symbol_kind` vocabularies (Finding 1 vs. Finding 2) against each other. **This
is almost certainly the real source of whatever "~1,000 unknowns" figure prompted this request** —
not a missing classifier, but a missing *measurement* of the existing one's `UNKNOWN` rate.

**Finding 4 — POS/symbol linkage is real but not yet joined to symbol identity.**
`atlas_ontology_linked_tuples` (`drizzle/manual/20260825_atlas_ontology_linked_tuples.sql`) already
carries `label_kind IN ('pos','tag','ontology')`, `part_of_speech`, `surface_text`, `token_index`,
`tree_node_id`, `packet_key`, `source_ref`, `evidence_span`, `confidence`, `provenance` — a real POS
+ ontology tuple store, populated by `pos-concept-tagging-lane.ts` /
`source-pos-concept-packet.ts` from the live `:8095` NLP sidecar (spaCy). **It has no column
referencing `atlas_symbol_registry.stable_symbol_id` or `atlas_symbol_versions.symbol_version_id`.**
So a POS tag on a token inside a function body is not currently linkable back to "this token is
inside symbol X, which is a FUNCTION." That join is the concrete missing piece for "symbol metadata
enrichment ↔ ontology linked tuples."

**Finding 5 — "4D topology manifold coordinates of what the function is/does/relates to" has no
join point yet, and building one now would be premature.** SOM cell coordinates
(`atlas_packets.som_cell_x/y`) are per-*packet*, not per-*symbol*, and CLAUDE.md's own
`SOM_REVISION_PROVENANCE_01` finding (2026-09-20) already recorded this lane `BLOCKED`: the two
coordinate conventions on `atlas_packets` (`som_cell_x/y` vs `som_row/som_col`) disagree on 99.7%
of rows, `som_revision` is null on all assigned rows, and the SOM codebook's own assignments file
is keyed by `codebase_chunk_index.id`, not by any symbol or packet identity. Joining "4D manifold
coordinates" onto symbols now would inherit that same unresolved-revision problem. Do not build
this join before `SOM_REVISION_PROVENANCE_01`'s blocker (a fresh, checksum-versioned SOM run) is
cleared.

**Concrete next tasks (in dependency order):**
- [x] `SYMBOL-KIND-COVERAGE-AUDIT-01` (2026-09-22, DRY_RUN_PROVEN, corpus-scoped) — implemented
  as two scripts: `scripts/atlas/define-symbol-kind-corpus-v1.mjs` (deterministic, git-tracked,
  bounded corpus definition; excludes `.svelte`/`.svelte.ts`/`.d.ts` with the reason recorded in
  the manifest) and `scripts/atlas/symbol-kind-smoke-fanout-v1.mjs` (fans out with bounded
  concurrency, parses each file with real `tree-sitter-typescript`, classifies every declaration
  node through the actual canonical `normalizeStructuralSymbolKind` -- reused, not reimplemented).
  Real run: 300/5,557 eligible files sampled, 300 parsed with 0 failures, 13,502 symbols
  classified (VARIABLE 10429, FUNCTION 2462, METHOD 174, INTERFACE 240, TYPE 171, CLASS 26).
  Receipts: `docs/reports/symbol-kind-corpus-v1.json`, `docs/reports/symbol-kind-smoke-fanout-v1.json`.
  **Scope caveat, recorded in the receipt itself, not hidden**: this walk only visits node types
  it already knows how to classify, so its 0% UNKNOWN rate is partly tautological -- it does NOT
  yet measure the corpus-wide UNKNOWN rate the live `:8095` sidecar's real FRAGMENT/DECLARATION/
  CHUNK-boundary chunk output would produce against the same normalizer. That remains open (see
  follow-up below) -- this task closes the "define a corpus + fan out a smoke test" deliverable,
  not the full "what is the real unknowns number" question.
- [x] `SYMBOL-KIND-SCHEMA-VALIDATION-01` (2026-09-22, APPLY_PROVEN, 3/3 tests passing) — added
  `src/lib/server/atlas/indexing/symbol-kind-schema-validation-v1.spec.ts`: asserts every
  `ast_labels` entry in `.okf/languages/typescript.yaml`'s `symbol_kinds` map resolves through
  `normalizeStructuralSymbolKind` to a non-`UNKNOWN` `StructuralSymbolKindV1` value (6/6 labels
  pass; entries without `ast_labels` -- route_handler/schema/store/hook -- are out of scope by
  design), locks the "symbol = function?" mapping down as a regression assertion, and proves
  `FRAGMENT`/`DECLARATION`/`CHUNK`/`null` deliberately stay `UNKNOWN`. Verified live via
  `npx vitest run src/lib/server/atlas/indexing/symbol-kind-schema-validation-v1.spec.ts`:
  `Test Files 1 passed (1)`, `Tests 3 passed (3)`.
- [x] `SYMBOL-KIND-UTF16-UTF8-SPAN-GROUNDING-01` (2026-09-22, APPLY_PROVEN) — operator asked
  whether the symbol corpus has "LSP UTF-16 to UTF-8" handling wired. It didn't; wired it for
  real using the existing canonical module rather than a new one. **Found and fixed a real,
  previously-undocumented gap**: `source-coordinate-map-v1.ts`'s header comment claimed UTF-8
  byte-offset parity with "Tree-sitter's raw byte offsets" generally, but the `tree-sitter`
  **npm package's** JS `Node.startIndex`/`Node.endIndex` are verified empirically to be UTF-16
  code-unit offsets, not bytes (a 3-byte CJK character before a `function` declaration produced
  `startIndex=17`, matching the UTF-16 code-unit index, vs. the correct UTF-8 byte index of 23).
  Corrected the header comment with the caveat and the exact conversion recipe
  (`Buffer.byteLength(source.slice(0, node.startIndex), 'utf8')`); added a regression test to
  `source-coordinate-map-v1.spec.ts` (same astral-emoji fixture as the existing ast-grep test,
  proving both input sources converge on the identical `SourceCoordinateSpanV1`) -- verified live:
  `Test Files 1 passed (1)`, `Tests 6 passed (6)`. Wired `symbol-kind-smoke-fanout-v1.mjs` to
  convert every classified symbol's span and run it through `buildSourceCoordinateMap()` (reused,
  not reimplemented) for a proper line/UTF-16-column/UTF-8-byte-column projection. Reran live:
  **13,502/13,502 symbols coordinate-grounded (rate=1.0), 0 coordinate errors, 0 file failures**
  across the 300-file corpus. Receipt: `docs/reports/symbol-kind-smoke-fanout-v1.json`
  (`coverageAudit.coordinateGroundedRate`/`coordinateErrorFiles`).
- [ ] `SYMBOL-KIND-LIVE-SIDECAR-COVERAGE-01` (new follow-up, not started) — rerun the fan-out
  audit against real `AtlasStructuralEvidenceChunk` output from the live `:8095` sidecar (not a
  fresh tree-sitter walk with a pre-filtered node-type allowlist) to get the actual corpus-wide
  UNKNOWN rate, i.e. the real number behind "~1,000 unknowns of 25k". This is what
  `SYMBOL-KIND-COVERAGE-AUDIT-01` above deliberately stopped short of.
- **Explicitly deferred, not wired (operator asked, answered honestly, not built without a clear
  go-ahead)**: simdjson (wrong tool for this file size -- plain `JSON.stringify`/`YAML.parse` is
  correct here), BitFrost/Redis-Valkey centroid writes (would require live-cache write authority
  this pass was not given, and this repo's hard rule is Postgres-first/no-speculative-cache-write),
  Ewin Tang low-rank sampling (unrelated capability -- retrieval candidate shortlisting, not
  symbol classification), ACE hypergraph RAG fanout (this script's "fan out" is a plain bounded-
  concurrency worker pool over files, not the ACE hypergraph retrieval mechanism -- same word,
  different thing, flagged so it isn't conflated later).

## SESSION-206c — external review correction + SESSION-206b re-sequenced (2026-09-22)

An external review of SESSION-206b (pasted in full into this session) confirmed the AST-node-kind
/ structural-symbol-kind / symbol-identity boundary this change already established, sharpened
what "measure UNKNOWN" should actually mean, and **corrected one factual claim this file
previously made**: that `atlas_ontology_linked_tuples` was "live and populated by spaCy." It is
not. Re-verified live against Postgres before accepting or rejecting the correction, per this
repo's own evidence discipline -- **the review was right, the earlier framing was wrong**:

```sql
SELECT count(*), count(*) FILTER (WHERE label_kind='pos'), count(DISTINCT source_ref)
FROM atlas_ontology_linked_tuples;
--  0 | 0 | 0
```

**Corrected picture, more nuanced than either the original claim or a flat "nothing's wired"**:
- `atlas_ontology_linked_tuples`: real table, 0 rows, genuinely missing `source_revision`/
  `workspace_revision` columns (only has `relation_revision`/`producer_revision`) -- confirmed via
  `\d atlas_ontology_linked_tuples`, matching the review's point exactly.
- A real Postgres writer, `persistOntologyLinkedTuples()` (`ontology-linked-tuple-postgres.ts`),
  **is wired** into `taxonomy-topology-packet.ts` (called at the point where `summary.linkedTuples`
  is persisted, with a `.catch()` fallback that swallows write failures into a
  `{written:0, errors:[...]}` shape rather than throwing) -- and `taxonomy-topology-packet.ts`'s
  `buildTaxonomyTopologyPacket()` **is** called from a registered tool in `src/mcp/trace-mcp-server.ts`.
  So this is not dead code -- it is wired, real, and has apparently never produced a successful row
  (reason unconfirmed: never invoked in this environment, upstream `linkedTuples` always empty, or
  a silent write failure the `.catch()` is hiding -- not investigated further this pass).
- Its default `labelKind` is `'tag'` (`labelSource` defaults to `'semantic_tagger'`) -- this writer
  path is for tag/ontology-kind tuples, not POS-kind ones.
- `pos-concept-tagging-lane.ts` / `buildPosConceptTaggingPacket()` (the real spaCy-backed lane,
  called from `code-evidence-synthesizer.ts`, `daily-graphify-board-recommendations.ts`,
  `trace-mcp-server.ts`, and the live route `routes/api/atlas/concept-tagging/+server.ts`) has
  **zero references** to `atlas_ontology_linked_tuples` or the ontology-tuple contract anywhere --
  confirmed via grep, not assumed. **The review's core claim is correct specifically for POS**:
  POS evidence does not reach this table today, through any path found.

**Vocabulary-ownership check (206b-02), resolved**: `okf-schema.mts`'s `SymbolKindSchema` export
has zero production callers (only this change's own new schema-validation spec references the
underlying YAML directly) -- safe to rename later with no blast radius. Combined with the earlier
finding that 3 of its 7 `.okf/languages/typescript.yaml` `symbol_kinds` entries
(`route_handler`/`schema`/`store`/`hook`) are defined by `evidence`/`imports`/`symbol_patterns`/
`path_patterns`/`filename_patterns` rather than `ast_labels`: **this is a different dimension**
(domain-evidence weighting for feature/domain classification) from `StructuralSymbolKindV1`
(language-independent AST-node normalization), not the same concept under a colliding name.
Per the review's rule ("are they intended to model the same dimension? NO -> rename both so
accidental interchange is impossible"): recommend renaming the OKF-side export to
`FeatureDomainSymbolKindSchema` (or similar) as a follow-up -- not done in this pass, since it
touches a type name referenced by nothing live and isn't urgent, but recorded so nobody validates
the two for equality later under the mistaken assumption they're the same enum.

**Adopted, verbatim, as an explicit invariant for this change going forward** (per the review):

```
ast-grep raw node kind  ≠  canonical symbol kind  ≠  symbol identity  ≠  POS tag  ≠  topology coordinate
```

**SESSION-206b task list re-sequenced per the review's ordering** (supersedes the flat list above):

- [x] `206b-01 STRUCTURAL-SYMBOL-KIND-COVERAGE` — done as `SYMBOL-KIND-COVERAGE-AUDIT-01` above.
  **Refinement accepted, not yet implemented**: the review is right that raw UNKNOWN count is the
  wrong headline number -- the one that matters is **UNKNOWN observations reaching canonical
  `atlas_symbol_registry` promotion**, not UNKNOWN observations in general (chunk-boundary/
  fragment noise that never gets promoted is a completely different severity than 1,000 promoted
  `symbol_kind='UNKNOWN'` registry rows). Follow-up, not started: extend the coverage audit to
  join against `atlas_symbol_registry`/`atlas_symbol_versions` and report the promoted-UNKNOWN
  count separately from the raw-observation-UNKNOWN count, broken down by raw node kind, language,
  producer, and source revision, per the review's exact breakdown list.
- [x] `206b-02 SYMBOL-VOCABULARY-OWNERSHIP` — resolved above: different dimension, not the same
  concept, rename recommended (not executed) since nothing live calls the OKF export.
- [x] `206b-03A POS-STORAGE-OWNER-CENSUS` — done above, live-verified: `persistOntologyLinkedTuples`
  is wired but zero rows produced; the POS lane specifically never reaches this table by any path.
- [ ] `206b-03B SYMBOL↔TOKEN-LINK-CONTRACT` (not started, correctly blocked on schema work) — per
  the review: join must go token evidence → exact `sourceRevision`/byte span → `SymbolVersionV1`
  → `stable_symbol_id`, never token → `stable_symbol_id` directly (that would discard the revision
  the token was observed under). Requires `source_revision`/`workspace_revision` columns on
  `atlas_ontology_linked_tuples` first (confirmed missing above) -- this is now a precondition of
  `ONTOLOGY-TUPLE-SYMBOL-LINK-01` from SESSION-206b, not a parallel task.
- [ ] `206b-04 TOPOLOGY-SYMBOL-LINK` — stays `BLOCKED`, unchanged from SESSION-206b's
  `SOM-SYMBOL-TOPOLOGY-JOIN-01`. Review's added detail for whenever it unblocks: the contract
  should be `SymbolVersionV1 + RepresentationSnapshotV1 -> TopologyProjectionV1 -> {somCoordinate,
  cluster, community}` keyed by `representationRevision`/`somRevision`/`candidateSnapshotRevision`
  -- the coordinate is a fact true *under a specific representation snapshot*, never part of
  symbol identity itself.

No canonical writes were performed by this correction pass -- read-only census + task-ledger
update only, consistent with every other entry in this section.

## SESSION-206d — SYMBOL-WIRE-01: UTF-8 grounding wired for real, exit condition met, STOP (2026-09-22)

Second external review, narrowly scoped this change to "SYMBOL-WIRE-01" and specified an exact
exit condition + explicit stop condition. Implemented exactly that, nothing further.

**What changed** (all in `source-coordinate-map-v1.ts`, its spec, and `symbol-kind-smoke-fanout-v1.mjs`):

1. **Corrected the overclaim from SESSION-206b's comment.** The prior wording asserted "the
   tree-sitter npm package returns UTF-16 offsets" as if it were a documented package contract.
   It is not -- upstream `@types/tree-sitter` still documents `startIndex`/`endIndex` as byte
   offsets. Reworded to: this repo's *installed runtime* (`tree-sitter` 0.25.1 +
   `tree-sitter-typescript` 0.23.2, JS-string input mode) has been *empirically proven* to expose
   UTF-16 code-unit indexing for this path -- with the exact versions, input mode, and a fixture
   checksum now recorded in every fan-out receipt (`runtimeProof` field) so a future package
   upgrade that changes this behavior is *detectable*, not silently trusted forever.
2. **Added a reusable, canonical converter** -- `createSourceOffsetConverter(source)`, built ONCE
   per file, exposing `utf16CodeUnitToUtf8Byte()`/`utf8ByteToUtf16CodeUnit()`. Replaces the prior
   per-symbol `Buffer.byteLength(source.slice(0, idx), 'utf8')` recomputation (correct but
   wasteful across 13,502 observations). Fails closed (throws) on out-of-range or
   mid-surrogate/mid-multibyte offsets rather than silently coercing.
3. **Added an explicit producer/coordinate-basis vocabulary** (`SourceOffsetBasisV1`:
   `AST_GREP_JSON | NATIVE_TREE_SITTER | NODE_TREE_SITTER_JS | LSP_UTF16 | LSP_UTF8 |
   UTF8_PARSER_BUFFER_V1`) so a caller must be explicit about which basis its raw offsets are in
   -- the ambiguous "index: 123" problem the review flagged.
4. **Full regression matrix added** to `source-coordinate-map-v1.spec.ts` (15 tests total now,
   all passing): ASCII (offsets equal), BMP non-ASCII (é/漢, genuine divergence, exact
   conversion), ASTRAL (😀 surrogate pair, exact), MIXED (ASCII+CJK+emoji), BOM (counted
   correctly in both spaces, matches `fingerprintStructuralSource`), ROUND TRIP (every valid
   boundary in a mixed fixture, utf16→utf8→utf16), INVALID MID-SURROGATE (fails closed, both
   directions -- UTF-16-side and UTF-8-side), OUT OF BOUNDS (fails closed). Verified live:
   `Test Files 1 passed (1)`, `Tests 15 passed (15)`.
5. **`symbol-kind-smoke-fanout-v1.mjs` rewritten** to the full pipeline the review specified:
   `tree-sitter node -> createSourceOffsetConverter -> UTF-8 byte span -> projectStructuralObservation()
   -> StructuralObservationV1 -> normalizeStructuralSymbolKind()` -- not just kind classification,
   real canonical span-grounded observations. Reran live on the same 300-file corpus:

```
Files parsed: 300  failed: 0
Total symbols classified: 13,502
sourceRevisionMatched:    300/300
spanWithinSourceBytes:    13,502/13,502
utf8RoundTripMatched:     13,502/13,502
negativeLength: 0   outOfBounds: 0   projectionFailures: 0
Schema validation: PASS (0/6 failed)
runtimeProof.observedCoordinateSemantics: UTF16_CODE_UNITS (tree-sitter 0.25.1 / tree-sitter-typescript 0.23.2)
Overall: SYMBOL_WIRE_01_UTF8_GROUNDING_PROVEN
```

**Exit condition, verified met exactly as specified**: 300/300 source revisions, 13,502/13,502
projected observations, 0 byte-span mismatches, non-ASCII/astral/round-trip regressions PASS,
coordinate round-trip PASS. Receipt: `docs/reports/symbol-kind-smoke-fanout-v1.json`
(`schema: 'atlas.symbol-wire-01-utf8-grounding.v1'`, `overallVerdict:
'SYMBOL_WIRE_01_UTF8_GROUNDING_PROVEN'`).

**STOP, per explicit instruction.** SymbolVersion resolution (SYMBOL-WIRE-02: classify each
observation as EXACT/REGISTRY_MISSING/AMBIGUOUS/REVISION_MISMATCH/SPAN_MISMATCH against
`atlas_symbol_registry`/`atlas_symbol_versions`), POS/keyword linkage, feature matrices,
CandidateOrdinal, retrieval, BitFrost/ACE, and prefill consumption are all explicitly **not
started** and not to be started until SYMBOL-WIRE-02 is separately scoped. No canonical writes
were performed anywhere in this pass -- read-only proof + task-ledger update only.

- [x] `SYMBOL-WIRE-01` (2026-09-22, DRY_RUN_PROVEN -- exit condition met exactly)

## SESSION-206e — SYMBOL-WIRE-02: registry classification against real Postgres data (2026-09-22)

Instructed to continue to SYMBOL-WIRE-02 as scoped by the review: classify each SYMBOL-WIRE-01
observation as EXACT/SPAN_MISMATCH/REVISION_MISMATCH/AMBIGUOUS/REGISTRY_MISSING against
`atlas_symbol_registry`/`atlas_symbol_versions`. Read-only (SELECT only), no promotion.

**Implementation**: extracted the shared parse+ground+project pipeline out of
`symbol-kind-smoke-fanout-v1.mjs` into `scripts/atlas/lib/symbol-wire-observation-runner.mjs`
(both SYMBOL-WIRE-01 and -02 now import it -- avoids duplicating the UTF-8 grounding logic per
this repo's Duplication Prevention rule). Reran SYMBOL-WIRE-01 after the refactor: **identical
results** (300/300, 13,502/13,502, `SYMBOL_WIRE_01_UTF8_GROUNDING_PROVEN`) -- confirms the
extraction changed nothing behaviorally. New script: `scripts/atlas/symbol-wire-02-registry-classification.mjs`.

**Real finding, discovered mid-implementation, not assumed**: `atlas_symbol_versions` source_ref
values use two coexisting conventions (bare `src/...` and `sveltekit-frontend/src/...` prefixed)
-- the classifier checks both forms per file. Live result on the 300-file corpus:

```
Files parsed: 300  failed: 0
Files with >=1 registry row (either source_ref form): 0/300
Total observations classified: 13,502
Bucket counts: EXACT=0 SPAN_MISMATCH=0 REVISION_MISMATCH=0 AMBIGUOUS=0 REGISTRY_MISSING=13,502
```

**This 100%-REGISTRY_MISSING result is a real, honest finding about the data, not a classifier
bug** -- verified by a second, independent check: only **15 distinct files** under a `src/`
prefix have ANY `atlas_symbol_versions` row at all (out of 5,557 eligible corpus files, 0.27%
coverage), and the 300-file deterministic sample simply didn't include any of those 15.

**Self-test added to prove the classifier logic itself is sound** (`--self-test` flag, run
against `src/lib/ai/base64-fp32-quantizer.ts`, one of the 15 known-registered files): found 24
real registry rows for that file, all under `source_revision = 'workspace:0'` -- a **legacy
pseudo-revision, not a real content hash** (the exact anti-pattern flagged elsewhere in this
repo's own CLAUDE.md for `atlas_packets.workspace_revision=0`). The classifier correctly bucketed
all 140 of that file's observations as `REVISION_MISMATCH` against the real computed
`sha256:329b0939...` content hash -- proving the logic works and isn't silently defaulting
everything to `REGISTRY_MISSING`. Self-test: **PASS**.

Receipt: `docs/reports/symbol-wire-02-registry-classification-v1.json`
(`schema: 'atlas.symbol-wire-02-registry-classification.v1'`), including the
`databaseSnapshot` context (10,504 total rows, 15 distinct registered files, 0.27% coverage of
the eligible corpus) so the 100% REGISTRY_MISSING figure isn't misread out of context.

**What this means for the broader picture**: the registry is real, wired, but has essentially
never been populated for the current `sveltekit-frontend/src/` tree at any meaningful scale (15
files, all under a legacy `workspace:0` revision scheme) -- consistent with this whole session's
running pattern (real pipelines, sparse/stale data). Any future symbol-identity promotion work
starts from near-zero coverage, not from a partially-complete registry.

- [x] `SYMBOL-WIRE-02` (2026-09-22, DRY_RUN_PROVEN) -- classifier implemented, self-test PASS,
  full-corpus run complete: 13,502/13,502 REGISTRY_MISSING (verified as a real data-sparsity
  finding, not a bug, via the self-test and the 15/5,557 coverage figure).
- [ ] `SYMBOL-WIRE-03+` (not started, not scoped yet) -- per the review, only after SYMBOL-WIRE-02
  should POS/keywords, feature matrices, CandidateOrdinal, retrieval, BitFrost/ACE, and prefill
  begin consuming these observations. None of that is started. Given the registry's near-zero
  coverage just measured, the next real question (not yet asked or scoped) is likely: should
  `atlas_symbol_versions` be populated at scale from SYMBOL-WIRE-01's observations first, before
  any consumer is built against it? That is an operator decision, not assumed here.

## SESSION-206f -- SYMBOL-KIND-LIVE-SIDECAR-COVERAGE-01 + SYMBOL-PROMOTED-UNKNOWN-01 (2026-09-22)

Instructed to continue with a precisely-scoped read-only pair: measure the REAL raw UNKNOWN rate
from the live `:8095` sidecar (unfiltered, not SYMBOL-WIRE-01's pre-filtered node-type walk), then
determine how many of those UNKNOWN observations actually reached canonical symbol promotion
(`atlas_symbol_registry.symbol_kind = 'UNKNOWN'`) via fail-closed EXACT resolution -- distinct
from mere raw-UNKNOWN counting. No mutations anywhere (`atlas_symbol_registry`,
`atlas_symbol_versions`, `atlas_ontology_linked_tuples`, Qdrant, Redis, Neo4j, Graphify all
untouched).

**Correction to a prior assumption, found mid-implementation, not assumed**: SESSION-206e's
self-test found ONE known-registered file under a legacy `workspace:0` pseudo-revision and
implicitly generalized that as "the registry is legacy-revision-only." **That generalization was
wrong.** A live query found 6 of the 15 registered files have REAL `sha256:...` content-hash
revisions, and a direct byte-for-byte check confirmed **all 6 files' current live content hashes
exactly match their stored registry revision** -- these are genuinely revision-current, not
stale. This is why the resolution logic had to be strict and real, not assumed sparse from one
sample.

**SYMBOL-KIND-LIVE-SIDECAR-COVERAGE-01** (`scripts/atlas/symbol-kind-live-sidecar-coverage-v1.mjs`,
`docs/reports/symbol-kind-live-sidecar-coverage-v1.json`): `:8095` confirmed live
(`ornith-1.5-9b`, `treesitter_chunker`/`ast_grep`/`spacy` capabilities present). Called the real
`POST /ast/chunk` endpoint for all 300 corpus files, classified every returned chunk (unfiltered)
through the canonical `normalizeStructuralSymbolKind()`:

```
Total chunks: 8,832   Known: 7,063   Unknown: 1,769 (rate=0.2003)
  of which structural noise (export/import, expected by design): 1,769
  of which genuine/investigate-worthy: 0 (rate=0.0000)
Top unknown raw kinds: export (932), import (837)
```

**Real finding**: the raw 20% UNKNOWN rate from the live producer is entirely accounted for by
`export`/`import` chunk-boundary noise -- 0 genuinely unexplained UNKNOWN chunks in this sample.
The normalizer is not missing any real structural-kind mapping on this corpus.

**SYMBOL-PROMOTED-UNKNOWN-01** (`scripts/atlas/symbol-promoted-unknown-audit-v1.mjs`, pure logic
extracted to `scripts/atlas/lib/symbol-promoted-unknown-classifier.mjs`,
`docs/reports/symbol-promoted-unknown-audit-v1.json` +
`docs/reports/symbol-promoted-unknown-audit-live-sidecar-v1.json`): fail-closed EXACT resolution
(source_ref + exact source_revision content-hash match + unique exact UTF-8 byte span + non-
conflicting name where both sides have one -- explicitly NO name-only joins, NO path-only joins,
NO latest-version substitution, NO fuzzy matching, NO workspace-revision-for-source-revision
substitution). Two runs, two different observation sources -- both necessary, one alone would
mislead:

- **Default mode** (tree-sitter/SYMBOL-WIRE-01 observations, 306 files = 300-corpus UNION the 6
  known-registered files): 85 EXACT resolutions (real signal), but `rawUnknownObservations=0` and
  `exactResolvedUnknownObservations=0` -- **tautologically**, since this observation source is
  pre-filtered to declaration node types and structurally cannot emit UNKNOWN. Flagged in the
  receipt as `observationSource: TREE_SITTER_..._STRUCTURALLY_CANNOT_PRODUCE_RAW_UNKNOWN` so this
  0 is never mistaken for "no pollution."
- **`--live-sidecar` mode** (real unfiltered `:8095` chunks, scoped to the 6 known-registered
  files only): 256 observations, **55 genuinely raw UNKNOWN** (export/import), 85 EXACT
  resolutions -- same count as the tree-sitter mode, confirming both producers agree on the
  declaration-level symbols in these files. Of the 55 raw-UNKNOWN observations, **0 resolved
  EXACT** (they fell into `SPAN_MISMATCH` -- the registry's stored chunk boundaries for these
  files don't line up with the live sidecar's current export/import chunk spans at this revision).

**Real, non-tautological answer: `exactResolvedUnknownObservations = 0`, `promotedUnknown.registryRowCount = 0`
in the live-sidecar mode.** Zero canonical `atlas_symbol_registry` rows are currently polluted
with `symbol_kind='UNKNOWN'` from a genuinely-UNKNOWN, exactly-resolved structural observation --
measured, not assumed sparse. `observationUnknownRegistryTyped` and `typedObservationToUnknownRegistry`
(the two inverse anomalies) are both 0 in this sample.

**Ontology-linked-tuple writer observability** (`scripts/atlas/ontology-linked-tuple-writer-observability-v1.mjs`,
`docs/reports/ontology-linked-tuple-writer-observability-v1.json`): read-only static census.
2 registered callers found (`taxonomy-topology-packet.ts`, plus its own `.spec.ts`), confirmed
`buildTaxonomyTopologyPacket()` is reachable from a registered MCP tool. Confirmed the writer's
error path DOES `console.warn('[taxonomy-topology-packet] ... DEGRADED_PERSISTENCE ...')` on a
thrown exception before falling back to `{written:0, errors:[...]}` -- **not silently swallowed
at the code level**, but no persisted receipt/log file recording any PAST invocation (successful
or failed) was found by static search. **Classification: `INSUFFICIENT_TELEMETRY`** -- this
census cannot distinguish WRITER_NOT_OBSERVED / UPSTREAM_LINKED_TUPLES_EMPTY /
WRITE_FAILURE_OBSERVED / WRITE_SUCCESS_WITH_ZERO_ROWS from static evidence alone, and per the
read-only mandate this audit does not itself invoke the writer to find out.

**Tests**: `src/lib/server/atlas/indexing/symbol-promoted-unknown-classifier-v1.spec.ts`, 12 focused
tests covering exactly the list the review specified (raw UNKNOWN alone doesn't count; name-only
match doesn't count; wrong sourceRevision doesn't count; wrong span doesn't count; AMBIGUOUS
doesn't count; EXACT UNKNOWN->registry UNKNOWN counts; EXACT UNKNOWN->registry FUNCTION reported
separately; known FUNCTION->registry UNKNOWN reported separately; multiple observations of one
stable_symbol_id deduplicate to the smaller canonical pollution count). Verified live:
**`Tests 12 passed (12)`**. Combined with SYMBOL-WIRE-01/02's existing specs: **30/30 tests
passing** across the whole symbol-pipeline test suite.

`npx openspec validate parent-atlas-nlp-sidecar-feature-compiler --strict`: **PASS** (`Change
'parent-atlas-nlp-sidecar-feature-compiler' is valid`).

- [x] `SYMBOL-KIND-LIVE-SIDECAR-COVERAGE-01` (2026-09-22, DRY_RUN_PROVEN) -- 8,832 real chunks,
  20% raw UNKNOWN, 100% accounted for by structural noise, 0 genuine/unexplained.
- [x] `SYMBOL-PROMOTED-UNKNOWN-01` (2026-09-22, `SYMBOL_PROMOTED_UNKNOWN_AUDIT_PROVEN`, live-sidecar
  mode) -- 0 canonical registry rows polluted with a genuinely-UNKNOWN, exactly-resolved
  observation, measured (not assumed) against real revision-current registry data.
- [x] Ontology writer observability census -- `INSUFFICIENT_TELEMETRY`, real static evidence
  recorded, no live invocation performed.
- [x] Focused Vitest (12/12 new, 30/30 total across the symbol-pipeline suite) + `openspec validate
  --strict` (PASS).
- [ ] Not started, per explicit stop instruction: `atlas_ontology_linked_tuples` ALTER, POS
  persistence, symbol-registry repair, historical backfill, CandidateFeatureMatrix,
  CandidateOrdinalMap scaling, ACE/BitFrost, Valkey, HyperGraphRAG, SOM/topology, Graphify. All
  writes across this entire session remain 0.
- [ ] `ONTOLOGY-TUPLE-SYMBOL-LINK-01` (not started) — add a nullable `stable_symbol_id` (and/or
  `symbol_version_id`) FK column to `atlas_ontology_linked_tuples`, populate it where a tuple's
  `tree_node_id`/byte span falls inside a known `atlas_symbol_versions` span, leave null where it
  doesn't (e.g. module-level tokens). Additive migration only, per this repo's Drizzle Safety Rule.
- [ ] `SOM-SYMBOL-TOPOLOGY-JOIN-01` (blocked) — explicitly gated behind `SOM_REVISION_PROVENANCE_01`
  clearing. Do not start.

## SESSION-206g — SYMBOL-REGISTRY-POPULATION-PREVIEW-01 (2026-09-22, READ-ONLY, zero writes)

**Critical correction caught by review, verified live, not left standing**: SESSION-206f's receipt
mislabeled `atlas_symbol_registry` (10,504 rows) and `atlas_symbol_versions` (479 rows) — swapped.
Independently re-queried: `symbolRegistryRows=10504, symbolVersionRows=479,
symbolVersionDistinctSourceRefs=69, realRevisionSymbolVersionRows=402,
legacyRevisionSymbolVersionRows=77`.

**Owner census (bounded by context budget, disclosed as bounded, not exhaustive)**: no literal
`INSERT/UPDATE INTO atlas_symbol_registry|atlas_symbol_versions` or `stableSymbolId=`/
`symbolVersionId=` mint-assignment matched under `src/lib/server/atlas`. **Status:
`CANONICAL_WRITER_NOT_CONCLUSIVELY_IDENTIFIED`** — a real open finding, not resolved this pass.
`graphify-symbol-writer-v1.ts` (found in a prior session) writes `stable_symbol_key`/`symbol_kind`
columns that don't match this table's real schema (`stable_symbol_id`) — likely a different table,
not disambiguated here.

**Major finding not previously used in this arc**: this repo has an active, very recent "Stable
File Identity" work stream (`S01-08` through `S01-10E`, visible in `git log`) directly answering
the upstream-identity question. Most recent state: **S01-08K-FREEZE (commit `f8bcf9e0db`,
2026-09-21) — manifest frozen READY (24,456 `SAFE_NEW_ID` / 1,086
`REPOSITORY_NAMESPACE_MISSING`), zero DB writes, explicitly awaiting the token "apply S01-08K
stable file population".** Not applied. This is the real, evidenced `BLOCKED_UPSTREAM_FILE_IDENTITY`
blocker — found via `git log`, not re-derived from scratch.

**Golden positive control (the 6 revision-current files / 85 known EXACT resolutions)**: PASSED
exactly as required — `85/85 EXACT_CURRENT_VERSION_EXISTS` reproduced, **0 duplicate-insert
proposals**. The planner correctly recognizes existing symbols and never proposes re-creating them.

**Legacy negative control** (`src/lib/ai/base64-fp32-quantizer.ts`, `workspace:0`): PASSED — never
classified `EXACT_CURRENT_VERSION_EXISTS`; correctly `LEGACY_LOGICAL_SYMBOL_CONTINUITY_UNPROVEN`.

**Full 300-file preview**: 13,502 observations → **0 eligible for insertion** (not 13,502).
`REJECT_KIND_POLICY: 10,429` (all `VARIABLE` — policy unproven, correctly rejected en masse) +
`REJECT_FILE_IDENTITY: 3,073` (genuinely new `FUNCTION`/`METHOD`/`CLASS`/etc. candidates, blocked
on S01-08K not being applied yet). **Result:
`SYMBOL_REGISTRY_POPULATION_PREVIEW_READY_APPLY_BLOCKED_UPSTREAM_FILE_IDENTITY`.**

Pure logic extracted to `scripts/atlas/lib/symbol-population-policy.mjs` (KIND_POLICY +
`classifyPopulationAction()`), reusing `classifyObservation()` unchanged — no new resolution logic
duplicated. Script: `scripts/atlas/symbol-registry-population-preview-v1.mjs`. Receipt:
`docs/reports/symbol-registry-population-preview-v1.json`.

**Tests**: `src/lib/server/atlas/indexing/symbol-population-policy-v1.spec.ts`, 11 focused tests
(UNKNOWN never promotes, VARIABLE policy enforced, legacy revision never EXACT, wrong span fails
closed, AMBIGUOUS fails closed, EXACT proposes zero writes, new-symbol gated by upstream identity,
no revision-change auto-versioning, no name-only cross-file identity, deterministic). Verified live:
**11/11 passing**. Combined with existing suite: **23/23** (population + promoted-unknown specs run
together this session; full symbol-pipeline suite across all SESSION-206 gates is 41/41).

`npx openspec validate parent-atlas-nlp-sidecar-feature-compiler --strict`: **PASS**.

- [x] `SYMBOL-REGISTRY-POPULATION-PREVIEW-01` (2026-09-22,
  `SYMBOL_REGISTRY_POPULATION_PREVIEW_READY_APPLY_BLOCKED_UPSTREAM_FILE_IDENTITY`) — golden control
  85/85 exact, 0 duplicates; legacy control fail-closed; real eligible-insert count is 0, correctly
  blocked, not inflated. Zero writes (postgres=0, qdrant=0, valkey=0, neo4j=0, graphifyRuns=0).
- [ ] Not started, per explicit stop instruction: canary apply, POS persistence, ontology tuple
  ALTER, retrieval, CandidateOrdinal scaling, Qdrant writes, ACE/BitFrost, Valkey, HyperGraphRAG,
  SOM/topology, Graphify. Applying S01-08K stable-file population is a **separate, operator-owned
  decision** outside this change's scope — flagged as the real next blocker to clear, not assumed.

## SESSION-206h — SYMBOL-WRITER-OWNER-01 canonical owner census (2026-09-22, READ-ONLY, zero writes)

**Scope disclosure (context-budget bounded, stated up front, not hidden)**: this census is `git
grep` across `sveltekit-frontend/{src,scripts}`, `packages`, `python`, `drizzle/manual` plus direct
inspection of the two concrete callers found — not a full transitive call-graph trace of every
possible indirect caller. Real value delivered within that bound, not claimed beyond it.

**Owner found**: `packages/parent-atlas/src/core/symbol-registry-repository.ts` ::
`createSymbolRegistryRepository()`. Read directly, not just grepped. Findings:
- **Schema compatibility: EXACT_MATCH** — its `INSERT` column lists were compared byte-for-byte
  against the live `atlas_symbol_registry`/`atlas_symbol_versions` DDL and match exactly.
- **Identity derivation is sound**: `stable_symbol_id = sha256(language, kind, symbol_key)`,
  `symbol_version_id = sha256(stable_symbol_id, source_revision, upstream_node_id,
  declaration_hash)` — deterministic, explicitly revision-qualified, no `latest`/`HEAD`/
  `workspace:0`/path-only/fuzzy-name shortcuts found anywhere in the derivation.
- **Explicit safety gate**: `promoteNomination()` throws
  `SYMBOL_PROMOTION_REQUIRES_EXPLICIT_ALLOW_CREATE` unless `allow_create: true` is passed.
- **No conflicting second writer found** — the broader census (`packages`, `python`,
  `src/mcp`, `drizzle/manual`) returned zero additional direct `INSERT`/`UPDATE` matches against
  either table. The previously-known `graphify-symbol-writer-v1.ts` (writes `stable_symbol_key`,
  not `stable_symbol_id`) is confirmed schema-incompatible / targets a different table, not a
  conflicting owner of these two.
- **Reachability**: exactly 2 callers found (`native-structural-materializer.mts`,
  `prove-revision-owner.mts`), neither wired to any `npm run` script — `MANUAL_SCRIPT_INVOCATION_ONLY`,
  not automatic runtime/Graphify/MCP-triggered. `native-structural-materializer.mts` does pass
  `allow_create: true` behind its own `ALLOW_CREATE_SYMBOLS` flag (a real, gated write path).

**Real finding that changed the verdict from a first-pass bug**: initial run misclassified as
`SYMBOL_CANONICAL_WRITER_PROVEN` due to a string-equality bug in the script itself (a note-suffixed
value didn't match a strict `===` check) — caught and fixed before trusting it, not left standing.
**Corrected, real result: `SYMBOL_CANONICAL_WRITER_LINEAGE_BLOCKED`** — the owner is real, sound,
and conflict-free, but it does **not** itself consume `StableFileIdentityV1`/`upstream_file_id`;
it accepts caller-supplied `source_ref`/`source_revision` directly. **This means applying S01-08K
alone does not automatically wire file identity into this writer** — the caller
(`native-structural-materializer.mts`) would need separate verification that it supplies a
stable-file-identity-derived `source_ref`, which is unverified, not assumed either way.

Script: `scripts/atlas/symbol-canonical-writer-owner-census-v1.mjs`. Receipt:
`docs/reports/symbol-canonical-writer-owner-v1.json`. Test:
`src/lib/server/atlas/indexing/symbol-canonical-writer-owner-v1.spec.ts` (3/3 passing — exactly-one-
writer guard, `allow_create` gate present, no forbidden-identity-input strings present).
`npx openspec validate parent-atlas-nlp-sidecar-feature-compiler --strict`: **PASS**.

- [x] `SYMBOL-WRITER-OWNER-01` (2026-09-22, `SYMBOL_CANONICAL_WRITER_LINEAGE_BLOCKED`) — one real,
  schema-exact, identity-sound, conflict-free owner found; blocked on file-identity consumption,
  not on writer-ownership ambiguity. Zero writes.
- [ ] Not started, per explicit stop instruction: S01-08K apply, symbol population, POS linkage,
  retrieval, ACE/BitFrost, Valkey, HyperGraphRAG, SOM/topology, Graphify.

**Follow-up (2026-09-22, read-only implementation + v2 census):** the upstream file identifier is
now preserved from the canonical structural chunk schema through `StructuralSymbolNominationV1`
and the single `atlas_symbol_versions` writer. Focused structural extraction tests pass (5/5),
the vertical integration test passes (1/1), the parent-atlas package build passes, and strict
OpenSpec validation passes. The regenerated v2 receipt is
`docs/reports/symbol-canonical-writer-owner-v2.json` with
`upstreamFileIdentityConsumption=UPSTREAM_FILE_ID_PROPAGATED_STABLE_FILE_ADMISSION_OPEN` and
`result=SYMBOL_CANONICAL_WRITER_LINEAGE_BLOCKED`. This closes the field-propagation gap but does
not claim that the values are S01-08K stableFileIds; S01-08K remains operator-blocked and no
database rows were written.

**Correction (2026-09-22, same day, bounded follow-up check)**: SESSION-206h's
`upstreamFileIdentityConsumption: NO_FILE_IDENTITY` finding was accurate for the repository
function itself but incomplete about its one real caller. Direct read of
`native-structural-materializer.mts` (lines ~292-321) found an existing **"S01-10B main-repo
boundary guard"**: before calling `promoteNomination()`, it calls `loadBindingProvenanceV1(pool,
[{sourceRef, sourceRevision}])` then `qualifyPromotionNominationV1(nomination, REGISTRY_REVISION,
provenance)`, and only proceeds if `revisionVerdict.admitted` — otherwise the nomination is
counted in `symbols_rejected_unqualified_revision` and never reaches the writer. The code's own
comment states the rationale explicitly: *"the package promoteNomination writes registry + aliases
+ version in one transaction with no revision validation, so an unqualified nomination must never
reach it."* **This means the LINEAGE_BLOCKED verdict was too pessimistic about the caller side** —
a real qualification gate already exists there. **Not yet verified, flagged for a future bounded
check, not assumed either way**: whether `qualifyPromotionNominationV1`'s admission criteria are
equivalent to (or dependent on) the S01-08K `StableFileIdentityV1` chain specifically, or a
narrower/different provenance check. No code changed, no receipt regenerated, no tests run this
follow-up — a one-file read only, recorded here so the next session starts from the corrected
picture instead of the SESSION-206h LINEAGE_BLOCKED framing alone.

**Second, final correction (same day, same bounded follow-up)**: read
`qualifyPromotionNominationV1`'s actual implementation
(`src/lib/server/atlas/identity/symbol-revision-qualification-v1.ts`, "S01-10B"). This answers
the "equivalent to S01-08K?" question above: **no, it is a separate, independent, already-built
provenance mechanism**, not dependent on S01-08K. It rejects `workspace:N` placeholders, raw
40-hex git commit SHAs, and legacy `sha256:<40hex>` shapes outright, then requires a real
`atlas_workspace_source_bindings` row proving `sourceRef` carries exactly that `sourceRevision`
AND that `sourceRevision === sha256:<content_digest>` of that binding — genuine content-hash-
verified provenance via a live `SELECT`, not a format check alone
(`loadBindingProvenanceV1`/`provenanceHolds`). Both registry admission
(`admitLogicalSymbolRegistryV1`) and version admission (`qualifySymbolVersionRevisionsV1`) must
independently pass. **The canonical writer's caller is not blocked on S01-08K for its own
safety** — it already has this real, independent, fail-closed gate, distinct from and not
requiring `StableFileIdentityV1`. Remaining open question, not checked in this bounded pass:
whether `atlas_workspace_source_bindings` has adequate live coverage for the current corpus —
that determines whether this gate actually admits anything today, a separate, checkable fact for
a future session.
