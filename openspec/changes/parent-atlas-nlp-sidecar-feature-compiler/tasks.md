Gate-by-gate, matching this repo's established discipline for large external
plans (see `parent-atlas-agentic-repair-bundle-integration`,
`parent-atlas-graph-runtime-enhancement`, and this session's own
`parent-atlas-graph-analysis-contract` Patch C–E precedent — audit before
code, live-verify before calling anything done, record findings in this
file as they're discovered). Nothing past task 0.1 is implied to start just
because an earlier task finished.

## 0. Pre-flight (do this before any pass-registry code)

- [ ] 0.1 Rebuild `docker/miniforge-nlp-sidecar` and hit its `/health`
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
- [ ] 0.5 Add a read-only bind mount to
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

## 1. AnalysisPassResult envelope + pass registry (NLP1)

- [ ] 1.1 Define `AnalysisPassResult` (Python + a matching TypeScript type)
      per design.md D1. Add it as an additive extension to the existing
      `/analyze` endpoint (optional `passes` request field, optional
      `passResults` response field) — verified against task 0.2's findings,
      not assumed compatible.
- [ ] 1.2 Live-verify: send a request with the existing `extractionMode`-only
      shape (no `passes` field) and confirm byte-identical behavior to
      pre-change — this is the backward-compatibility proof, not optional.

## 2. Structural pass (NLP2)

- [ ] 2.1 Wire `treesitter_chunk` pass to emit `AstUnit` records matching
      `atlas_ast_nodes`' live schema exactly (field names verified via `\d
      atlas_ast_nodes` in this change's design.md — don't re-derive from
      scratch). Confirm no `packet_key` is ever written at this stage.
- [ ] 2.2 Live-verify against a real file: run the pass, inspect the
      `AstUnit` output, confirm `parser_revision`/`grammar_revision` are
      populated (needed for the "swap the producer later" guarantee in
      design.md D2).

## 3. Linguistic pass (NLP-adjacent, spaCy)

- [ ] 3.1 Wire the `spacy` pass scoped to comments/docstrings/errors/query
      text only (per design.md D3) — explicitly exclude source identifiers
      from the input set.
- [ ] 3.2 Live-verify with one real docstring/comment example, confirm noun
      chunks / dependency edges come back sensible (not garbage on code
      tokens that slipped through the exclusion).

## 4. AST-conditioned semantic card (NLP3)

- [ ] 4.1 Build the `SemanticCodeCard` assembler (`AstUnit` + linguistic
      facts → bounded card text) per design.md's example shape.
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

- [ ] 6.1 Classify all 14 files in
      `sveltekit-frontend/src/lib/server/retrieval/*reranker*` +
      `canonical-rerank-executor.ts` as live/orphaned/superseded — grep for
      actual call sites of each, not just existence. `canonical-rerank-executor.ts`
      is already confirmed canonical (imports `blendScores`/`RuntimeReranker`
      from `runtime-reranker.ts`); classify the other 13 explicitly.
- [ ] 6.2 Record the classification in this file (or a dedicated audit
      section) before task 7 starts — do not proceed to wiring new reranker
      tiers until this is done, matching this session's established
      "audit before code" discipline.

## 7. MiniLM + Mixedbread reranker tiers (NLP5) — blocked on section 6

- [ ] 7.1 Wire MiniLM (`ms-marco-MiniLM-L6-v2`, `sentence-transformers`
      `CrossEncoder`) as `RERANK_FAST` behind `canonical-rerank-executor.ts`
      — for the ~30-50 candidate tier, not a new standalone file.
- [ ] 7.2 Wire Mixedbread (`mxbai-rerank-base-v2`) as `RERANK_DEEP`, disabled
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

## 9. FeatureCompiler: pass results → ExperimentFeatureMatrix + control5 (NLP7)

- [ ] 9.1 Build the compiler that takes a set of `AnalysisPassResult`s for
      one candidate and produces one `ExperimentFeatureMatrix` row +
      optional `control5` summary, per design.md D6. Coordinate with
      `parent-atlas-retrieval-lod-algorithm-taxonomy` for the canonical
      column set — don't invent a second one.

## 10. LangExtract gating (NLP8)

- [ ] 10.1 Confirm LangExtract is never called unless
      `groundedExtractionRequired: true` is explicitly set, across every
      code path that could reach it (including the 22 files found
      referencing the sidecar in task 0.2 — some may already call
      LangExtract-adjacent code unconditionally; audit, don't assume).

## 11. ACP/A2A tool registration

- [ ] 11.1 Register 2-3 coarse-grained ACP tools
      (`analyze_structural`, `analyze_semantic_card`, `rerank_candidates` —
      or similar, exact names TBD at implementation time) in
      `ACPToolRegistry.ts`, each wrapping one or more sidecar passes behind
      an `inputSchema` that accepts a `passes` selector. Confirmed live
      2026-08-09: zero existing registrations reference the sidecar — this
      is new, not a fix to something broken.
- [ ] 11.2 Confirm the new tools appear via `GET /api/acp/tools` and are
      callable via `POST /api/acp/execute` against the live sidecar — one
      real end-to-end call per registered tool, not just schema validation.
- [ ] 11.3 Check whether `.well-known/agent.json` (A2A AgentCard) needs an
      update to reflect the new capabilities — read
      `src/routes/.well-known/agent.json/+server.ts` first to see whether it
      already derives its capability list from `ACPToolRegistry` (in which
      case 11.1 covers this automatically) or needs a separate edit.

## 12. Docs correction

- [ ] 12.1 Fix `docs/architecture/PACKET-COMPILER-STAGES.md`'s Stage 1
      heading ("AST-Grep (Structural Extraction)") to reflect the layered
      ownership: TreeSitter Chunker (chunking application) as the structural
      extraction owner, ast-grep as a separate structural query/rewrite
      stage — not one conflated stage name.

## 13. Acceptance fixture

- [ ] 13.1 One end-to-end fixture, zero LLM calls in the default path:
      source file → `AstUnit` (2.1) → linguistic facts on its docstring (3.1)
      → `SemanticCodeCard` → `semantic_768` (4) → HMM observation + Viterbi
      state (5) → MiniLM score (7.1) → `ExperimentFeatureMatrix` row +
      `control5` (9.1). Then re-run the same fixture with
      `groundedExtractionRequired: true` and confirm LangExtract only adds
      grounded evidence — it must not change any structural identity or
      `AstUnit` field from the first run.
