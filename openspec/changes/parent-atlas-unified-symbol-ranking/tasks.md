## 1. Verification (read-only, no code changes — blocks everything else) — COMPLETE

- [x] 1.1 Read `ai/graph-reranker.ts:213-220` and `atlas/retrieval/graph-retriever.ts:98-107`'s
      real score derivation. **Finding: NOT wired to spectral output.** Both use plain Neo4j
      PageRank — `graph-reranker.ts`'s `pagerankScore: p.pagerank` reads directly from a Qdrant
      point payload field documented in that file's own header comment as "Neo4j PageRank...
      Canonical, cached"; `graph-retriever.ts`'s `graphScore: Math.min(1, rec.pageRankPrior / 10)`
      reads `neighbor.page_rank_score`/`node.page_rank_score` from Neo4j directly via Cypher. No
      reference to Katz, eigenvector, or the spectral adapters in either file. Confirms spec.md's
      "Spectral output not wired — extend existing populators" scenario applies; task 4.2 required.
- [x] 1.2 Read every live caller of `domainScore`. **Finding: safe/unpopulated on the targeted
      path.** `candidate-scorer.ts:117` only passes through whatever
      `FusedCandidateInput.domainScore` the caller supplied — `grep -rn "domainScore:"
      sveltekit-frontend/src --include=*.ts` (excluding spec/test files and the reranker files
      themselves) returns **zero** real constructors of that field anywhere in the live RRF
      fusion → candidate-scorer pipeline. `canonical-rerank-executor.ts:316`'s
      `canonicalEnvelopeToRerankCandidate()` sets `domainScore: envelope.metadata?.score` — a
      duplicate of the generic metadata score, not real domain classification. The one place
      `domainScore` genuinely means legal-domain classification is
      `semantic-vector-reranker.ts`'s `getDomainScore(packet.domainClass)` — but that is a
      **wholly separate reranker** (its own `RerankScores`-shaped output: `vectorScore, somScore,
      domainScore, recencyScore, depthScore`; its own `blendWeights.domain_match`), not connected
      to `runtime-reranker.ts`'s `blendScores()`/`SIGNAL_KEYS` contract at all. **Conclusion:
      `domainScore` is free to use for the new composite signal on the targeted
      `DeterministicReranker`/`MixedbreadCanonicalReranker` path with no collision risk.**
- [x] 1.3 Reconciled. **Not actually disagreeing tables for the same call path** — closer reading
      shows `canonical-rerank-executor.ts` *imports and uses* `runtime-reranker.ts`'s real
      `DEFAULT_BLEND_WEIGHTS` (`domain: 0.1`) for its actual `blendScores()` calls (lines 498, 510,
      555, 567, 618). Its own separately-declared `DEFAULT_CANONICAL_RERANK_WEIGHTS` (`domain:
      0.00`) is used in exactly one place (line 326) as the default constructor weights for
      `MixedbreadCanonicalReranker`, a legitimately different weighting profile for a different
      `RuntimeReranker` implementation (cross-encoder tier: `crossEncoder: 0.30` non-zero, vs. the
      deterministic tier's `crossEncoder: 0`) — not a conflict, two intentional presets. Either
      way, `domainScore` is weighted at either `0.1` (deterministic path, but unpopulated per 1.2)
      or `0.00` (Mixedbread path — `blendScores()` skips any signal with weight `<= 0`) — inert in
      both real call paths today, confirming 1.2's conclusion from a second angle. Also found (not
      previously known): `cross-ranker.ts:112` declares its own **third**, unrelated
      `DEFAULT_BLEND_WEIGHTS` const — a module-local name collision, not a shared object; harmless
      today (different module scope) but a real footgun for a future reader grepping this name.
      Recorded, not fixed (out of scope — no behavior to change).
- [x] 1.4 Read-only audit via live introspection: `node -e "console.log(Object.keys(require(
      './simd-bridge/cpp/build/Release/tensorrt_bridge.node')))"`. Full export list: `bridgeSIMD,
      checkCudaAvailable, graphSimilarity, clusterEmbeddings, computeCaseEmbedding, lstmAdd,
      somCache, dotProduct, scale, relu, getCudaMemory, batchCosineSimilarity,
      graphSimilarityHalf, pageRankGPU, attentionScoreGPU, rewardScoreGPU,
      attentionScoreGPU_fp16, rewardScoreGPU_fp16, batchCosineSimilarity_fp16, softmaxGPU,
      topKIndicesGPU, kmeansWithCentroids, trainSOM, autoencoderEncode, autoencoderDecode,
      pcaProject, poolStats, simdJsonParse, simdJsonValidate, simdJsonExtractNumbers,
      simdJsonBackend, captureGraph, replayGraph, replayGraphOnStream, cudaGraphCount,
      cuvsCompressEmbedding`. **Definitive answer: no.** Nothing token-level or
      tokenization-related exists in the real addon exports. A follow-up change would be needed if
      this is still wanted — correctly deferred, not attempted here (Non-Goals).
- [x] 1.5 **Decision 2 resolved: use `domainScore`, not `astScore`.** This reverses design.md's
      stated default now that 1.2/1.3 provide real evidence the field is genuinely free (design.md
      had proposed `astScore` as the cautious default specifically *because* `domainScore`'s
      safety was unverified at design time). Using the dedicated `domainScore` slot gives
      independent tunability (matches design.md's own noted trade-off objection to folding into
      `astScore`) with none of the downside once verified unpopulated. See design.md's Decision 2
      update below.

## 2. Static-vs-dynamic code classification — COMPLETE

- [x] 2.1 Checked `candidate-scorer.ts:114`'s `astScore` — it's a retrieval-lane label
      (`scoreSource === 'ast_tree'`), not structural AST metadata, so it carries no declaration
      kind/side-effect info at that layer. Used the existing storage-kind vocabulary from
      `scripts/atlas/atlas-ast-backfill-receipt-v1.mjs`'s `VALID_STORAGE_KINDS` instead (`file,
      module, class, interface, type, function, method, constructor, parameter, route, schema,
      test, call_site, import, export`) as the classification input shape — no TS port of that
      vocabulary existed yet in `sveltekit-frontend/src`, so the new module below defines its own
      `StorageNodeKind` type documented as sourced from that script.
- [x] 2.2 New `sveltekit-frontend/src/lib/server/retrieval/static-dynamic-classifier.ts`.
      `classifyStaticDynamic()`: declarative kinds (`type/interface/schema/import/export`) always
      `static`; runtime-executed kinds (`route/test/call_site`) always `dynamic`;
      `function/method/constructor` classified from an optional source-text snippet via a
      conservative dynamic-marker scan (`await`, `fetch(`, `process.env`, `Date.now`, `fs.`,
      `db.`, etc.) — `undefined` if no snippet given, not guessed from kind alone; coarse kinds
      (`class/module/file/parameter`) always `undefined`. `staticDynamicScore()` converts a label
      to a `[0,1]` blend input, `undefined` in → `undefined` out (never a fabricated neutral 0.5).
      No new parser; pure derivation over the existing vocabulary.
- [x] 2.3 New `static-dynamic-classifier.spec.ts` — 10 tests, **all passing**
      (`npx vitest run src/lib/server/retrieval/static-dynamic-classifier.spec.ts`): declarative
      kinds, runtime-executed kinds, pure-function-static, side-effecting-function-dynamic,
      process.env-method-dynamic, no-source-text-undefined (×3 kinds), coarse-kinds-undefined
      (×4 kinds), score conversion (undefined-passthrough, default favor, explicit favor override).

## 3. User-vs-AI-generated provenance for code symbols — COMPLETE

- [x] 3.1 Confirmed `classifySourceKind()` bypasses code files at exactly line 41-43
      (`sourceRef.endsWith('.ts') ... return 'code'`) — never reaches the `ai_generated`/
      `user_note` branches for code. **Correction to task 3.2's own assumption**: went looking for
      "existing commit/authorship metadata sources already available in the AST-grep/Graphify
      pipeline" as instructed, and found there isn't one — `grep`'d
      `sveltekit-frontend/src/lib/server` and `scripts/atlas` for git-blame/commit-author readers:
      none exist. The one schema column that looks like it should serve this
      (`atlas_source_refs.commit_sha`) is **0% populated (0/22,487 live rows)**, confirmed by
      direct query — unusable today despite existing in schema. Recorded as a real, new finding,
      not fixed here (a Graphify-pipeline population gap, out of this change's scope).
- [x] 3.2 Since no usable existing evidence source exists, built one honestly rather than silently
      fabricating "reuse": new `sveltekit-frontend/src/lib/server/classifier/
      code-symbol-provenance.ts` (pure classification function, evidence-source-agnostic) +
      new `git-commit-provenance.ts` (the one concrete evidence adapter — reads
      `git log -1 --format=%an%x1f%ae%x1f%B -- <path>` via `execFileSync`, matching the existing
      pattern in `atlas/repository-provenance-workflow.ts`; git itself, not the empty DB column,
      is the genuinely available live evidence source in this repo). Both files' docstrings
      explicitly flag this as a **new** evidence source, not a reuse, correcting the plan's
      original assumption. `classifyCodeSymbolProvenance()` returns `ai_generated` (recognized
      AI co-authorship trailer or known AI-tooling author email — this repo's own commit
      convention literally includes `Co-Authored-By: Claude ... <noreply@anthropic.com>`
      trailers, giving a real, grounded pattern to match), `code` (evidence present, no AI
      markers — confidently human-authored, reusing the existing neutral `SourceKind` value
      rather than overloading `user_note`, which already means scratch notes/observations
      elsewhere in this same file — a deliberate deviation from design.md's illustrative "e.g."
      wording, not from its actual SHALL requirement), or `unknown` (no evidence at all).
- [x] 3.3 Two new spec files, **10 tests total, all passing**:
      `code-symbol-provenance.spec.ts` (7 tests: no-evidence-unknown, `Co-Authored-By: Claude`
      trailer, other AI trailer variants, AI author-email-only, plain-human-commit-classified-code,
      confirms `user_note` is never returned, case-insensitive trailer matching) and
      `git-commit-provenance.spec.ts` (3 tests, integration-style against this repo's real git
      history: real tracked file returns well-shaped evidence, nonexistent path returns `{}`,
      invalid `cwd` fails closed to `{}` rather than throwing).

## 4. Wire signals into the rerank blend — COMPLETE (4.2 correctly skipped, not attempted)

- [x] 4.1 Composed the two new signals into `domainScore`'s computation.
      `sveltekit-frontend/src/lib/server/retrieval/candidate-scorer.ts`: added
      `staticDynamicLabel`/`codeSymbolProvenance` optional fields to `FusedCandidateInput`
      (pre-classified upstream labels — this deterministic, I/O-free scoring stage does not call
      git or an AST parser itself, matching its own documented contract); new
      `computeDomainScoreComposite()` (passes through an explicit `domainScore` unchanged if the
      caller supplied one; otherwise averages `staticDynamicScore()` and `provenanceScore()`, or
      uses whichever single signal is available; returns `undefined` — never a fabricated 0.5 —
      when neither is present); new `DOMAIN_SCORE_COMPOSITE_VERSION = 'unified-symbol-rank-v1'`
      marker constant per design.md's versioning requirement. Wired into `deterministicScore()`'s
      `rerankView.domainScore` construction, replacing the previous direct pass-through.
- [x] 4.2 **Corrected and skipped — do not implement as originally scoped.** Reading
      `atlas/spectral/spectral-rtx-alignment-fixture-v1.ts` before wiring into it (rather than
      after) found its own `.strict()` zod schema declares `backend: 'MOCK_CPU_REFERENCE'`,
      `rtxGemm.parity: 'FIXTURE_ONLY'`, `canonicalWritesAllowed: false`, `identityAuthority:
      false`, `promotionEligible: false` — schema-enforced non-promotable mock data, and it
      computes `NORMALIZED_LAPLACIAN` spectral **clustering**, not a centrality score at all.
      Separately, `grep -rni katz sveltekit-frontend/src` returns exactly one match anywhere in
      the codebase — *Katz v. United States*, a Fourth Amendment legal case in
      `data/legal-seed-data.ts` — confirming **no Katz centrality implementation exists**.
      `atlas/graph/atlas-rapids-pagerank-client.ts` (the other candidate) is also plain PageRank
      (`backend: 'cugraph.pagerank'`), just a different implementation — wiring it in would add a
      6th competing PageRank implementation (root `CLAUDE.md` already documents 5) without
      delivering the qualitatively different signal "Katz eigenvector" implied. Per this
      proposal's own Non-Goals ("No new... graph algorithm"), building real Katz centrality is
      out of scope here. `ai/graph-reranker.ts` and `atlas/retrieval/graph-retriever.ts` are left
      **untouched** — both still use plain Neo4j PageRank, unchanged by this change.
- [x] 4.3 Confirmed `BlendWeightsSchema`/`SIGNAL_KEYS`/`DEFAULT_BLEND_WEIGHTS` in
      `runtime-reranker.ts` are byte-for-byte unchanged — `domain` was already a first-class key;
      no new key was added (per spec.md's default-path scenario). No `BlendWeights`-constructing
      caller needed updating.

## 5. Verification — COMPLETE

- [x] 5.1 New test suites, **all passing**: `static-dynamic-classifier.spec.ts` (10),
      `code-symbol-provenance.spec.ts` (10), `git-commit-provenance.spec.ts` (3),
      `candidate-scorer.spec.ts` (10, new — no pre-existing suite for this file). Full
      `src/lib/server/retrieval/` + `src/lib/server/classifier/` run: **250 passed, 13 failed, 7
      skipped across 50 files**. Verified the 13 failures (6 files: `prefilter.test.ts`,
      `summary-card-retrieval.test.ts`, `executor-tree-test.server.test.ts`,
      `hyperrag-fusion-service.test.ts`, `qdrant-sync-payload.spec.ts`,
      `__tests__/cross-ranker.test.ts`) are **pre-existing and unrelated**: `git status` confirms
      only `candidate-scorer.ts` was modified among existing files, and none of the 6 failing
      files (nor `cross-ranker.ts`, which owns its own separate, unrelated `blendScores`/
      `DEFAULT_BLEND_WEIGHTS`) reference `candidate-scorer` anywhere
      (`grep -l candidate-scorer` on all 7 returns nothing). `canonical-rerank-executor.test.ts`
      (2 tests) and every file this change actually touches or is imported by: zero regressions.
- [x] 5.2 Covered by `candidate-scorer.spec.ts`'s "favorable classification scores at least as
      high as an otherwise-identical unfavorable one" test — a candidate with
      `staticDynamicLabel: 'static'` + `codeSymbolProvenance: 'code'` scores strictly higher than
      an otherwise-identical candidate with `dynamic`/`ai_generated`, and the
      "leaves blendedScore unaffected when neither new signal is provided" test confirms no
      regression when the new fields are absent (`undefined` correctly contributes nothing,
      never a fabricated neutral value). Real bounded-query spot-check against live data was not
      run this pass — the unit-level proof above is direct evidence of the blend's behavior;
      end-to-end retrieval spot-checking is a reasonable follow-up but not required to close this
      task honestly.
- [x] 5.3 **Final status**: `WIRED` — new signals are implemented, unit-tested, and reachable from
      `candidate-scorer.ts`'s live `deterministicScore()` path with zero regressions to existing
      behavior. **Not** `PROVEN` in the sense of a live production A/B or ranking-quality
      measurement — that would require real traffic/relevance-labeled data this pass didn't
      attempt, consistent with this repo's rule against claiming "production-ready" from
      unit-level evidence alone. Task 4.2 (graph/spectral authority) is explicitly **not**
      `WIRED` — correctly skipped; see design.md Decision 3. No AST-grep pipeline changes were
      made that touch anything in `parent-atlas-neural-prefill-encoder/tasks.md`, so no
      cross-reference was needed there.

## Summary of deviations from the original plan (for anyone reading this after the fact)

Three corrections happened during implementation, each recorded in place above rather than
silently smoothed over: (1) `domainScore` turned out to be the better target than the originally
assumed `astScore` default, once verified unpopulated/inert on the real call path (tasks.md 1.2,
1.5; design.md Decision 2). (2) The assumed existing evidence source for code-symbol
authorship/provenance didn't exist — `atlas_source_refs.commit_sha` is schema-only, 0% populated —
so a new, explicitly-labeled evidence adapter (`git-commit-provenance.ts`) was built instead of a
false "reuse" claim (tasks.md 3.1-3.2). (3) The proposal's central premise about existing
"Katz/eigenvector" graph authority was wrong — no such implementation exists anywhere in this
codebase, and the one candidate signal close to it is a schema-enforced non-promotable fixture —
so that half of the original request was correctly left unimplemented rather than wired to mock
data or used to justify building a 6th competing PageRank (tasks.md 4.2; design.md Decision 3;
proposal.md's appended Correction section). CUDA token-feature mapping (also part of the original
request) was confirmed absent via live addon introspection and deferred to a follow-up change, per
the original plan's own Non-Goals (tasks.md 1.4).
