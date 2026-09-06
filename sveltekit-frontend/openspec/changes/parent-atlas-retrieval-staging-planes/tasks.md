# Tasks: Retrieval staging-plane separation

Status vocabulary per root CLAUDE.md: CREATED / WIRED / DRY_RUN_PROVEN / APPLY_PROVEN / NOT_PROVEN.
No task below may be marked done from aspiration — each requires the stated live evidence.

This proposal captures a large external architecture review. Per the review's own explicit
prioritization ("the next three things I'd implement") and this repo's evidence-first discipline,
tasks are ordered cheapest-and-most-falsifiable first. Do not skip ahead to the deferred/unspecced
items in design.md sections 7, 10, 11 without first getting real evidence from the tasks below.

## Phase 0 — Contracts (this change's actual deliverable)

- [x] **CONTRACT-01**: Created `src/lib/server/atlas/contracts/helper-card-v1.ts`
      (`HelperCardV1Schema`, `HelperRoutingCandidateV1Schema`, `canDispatchDirectly()`) +
      `helper-card-v1.spec.ts` (7/7 pass, verified live). Placed in the existing
      `src/lib/server/atlas/contracts/` directory (confirmed via `ls` this is where ~40 sibling
      `*-v1.ts` contract files already live, e.g. `feature-vector-5.ts`, `feature-extraction-v1.ts`
      — matched their `.strict()` Zod + `.spec.ts` pattern exactly). Not added to `contracts/index.ts`
      barrel — confirmed that barrel only re-exports 5 of ~50 contract files in the directory
      (a narrow, curated barrel, not an exhaustive one), so omission matches existing convention,
      not an oversight.
- [x] **CONTRACT-02**: **Not created — found existing canonical contracts, extending rather than
      duplicating.** `packages/parent-atlas/src/core/structural-symbol.ts` already defines
      `astGrepObservationSchema`, `treesitterChunkerChunkSchema`, `structuralSymbolNominationSchema`,
      and (bonus finding) `groundedLangExtractObservationSchema` — the latter substantially
      overlaps with this change's own `CandidateEvidenceCardV1.groundedFacts` sub-shape (design.md
      section 8). These are NOT currently re-exported through the package's public barrel
      (`@deeds/parent-atlas` — confirmed via `grep` against `packages/parent-atlas/src/index.ts`;
      no `core/index.ts` exists either), so `sveltekit-frontend` cannot import them today without
      either a deep relative import (fragile, bypasses the package boundary) or the package owner
      adding them to the export surface. **Flagged, not fixed**: exposing these through the barrel
      is a real, valuable follow-up but is the package maintainer's call, not something to do
      silently as a side effect of this task. CONTRACT-03 below proceeds with a local
      `GroundedFactV1` shape and records this cross-package duplication risk explicitly rather than
      pretending it doesn't exist.
- [x] **CONTRACT-03**: Created `src/lib/server/atlas/contracts/candidate-evidence-card-v1.ts`
      (`CandidateEvidenceCardV1Schema`, `GroundedFactV1Schema`, `CandidateRetrievalRanksV1Schema`,
      `assertExtractionBatchBounded()` enforcing the spec's 20-30 candidate cap) +
      `candidate-evidence-card-v1.spec.ts` (8/8 pass, verified live). File-level docstring records
      the `GroundedFactV1` vs. `groundedLangExtractObservationSchema` cross-package overlap from
      CONTRACT-02's finding explicitly, rather than silently diverging.
- [x] **CONTRACT-04**: Created `src/lib/server/atlas/contracts/model-resolution-v1.ts`
      (`ModelResolutionV1Schema`, `assertRuntimeIdentityIsMocked()`) +
      `model-resolution-v1.spec.ts` (7/7 pass, verified live). The helper function directly
      encodes the spec's core requirement: refuses to assert against a runtime identity that
      wasn't actually mocked/discovered, and throws a message explaining why rather than silently
      passing.
- **Verification for all 4 contracts**: `npx tsgo --noEmit` before (76 baseline at session start of
  this phase, actually 75 after the two Firecrawl fixes from the prior phase) and after (75,
  unchanged) — zero new type errors from any of the 3 new files (`helper-card-v1.ts` had none to
  begin with; CONTRACT-02 produced no new file). 22/22 new contract tests pass across the three
  `.spec.ts` files (7 + 8 + 7).
- [x] **CONTRACT-05** (added 2026-09-06, per `specs/candidate-relevance-score-types/spec.md`):
      Created `src/lib/server/atlas/contracts/candidate-relevance-scores-v1.ts`
      (`SemanticSimilarityScoreV1Schema`, `TextRelevanceScoreV1Schema`,
      `EngineeringUtilityScoreV1Schema`, `shouldEscalateToTextRelevance()` implementing the
      ambiguity-margin gate) + spec test (11/11 pass, verified live). See design.md section 13 for
      the full mxbai log-odds-scoring explanation and the three-score distinction this formalizes.
      **Real bug caught by its own test**: initial `TEXT_RELEVANCE_ESCALATION_MARGIN = 0.05` exactly
      matched the design's own "well-separated, don't escalate" worked example's gap (0.96 - 0.91),
      and floating-point subtraction rounded that gap to just under 0.05, causing the test for that
      exact example to fail (`expected true to be false`) — the margin would have incorrectly
      escalated the very case the design used as its "no escalation needed" illustration. Fixed to
      `0.03`, chosen to sit strictly between the design's two worked examples (0.05 gap: no
      escalate; 0.01 gap: escalate), and rewrote the boundary test to use a comfortable margin
      instead of relying on floating-point exactness. `tsgo --noEmit`: 75 (unchanged), zero errors
      from the new file.

## Phase 1 — OPENAI-FACADE model-identity trace (uses CONTRACT-04)

Matches the review's own "OPENAI-FACADE-01" recommendation. Verify current test state first — do
not assume the 5 originally-cited failures are still live (this repo has active concurrent-session
editing; `tests/openai-facade.spec.ts` was independently re-verified 2026-09-06 at 14/14 passing,
before this proposal was written — re-check at implementation time, don't trust this note as
permanently current).

- [x] **OPENAI-FACADE-01**: Re-ran `tests/openai-facade.spec.ts` live — still 14/14 (re-confirmed
      twice this session). Moot for that file. Broadened the grep per the task's own instruction:
      `rg -n "toBe\('gemma4|toBe\('hforf|toBe\('ornith|..." tests --type ts` found 30+ hits across
      ~15 files. Spot-checked several before assuming they're all bugs:
      - Most are **self-consistent mock+assert pairs** (e.g. `ai-routes-comprehensive.spec.ts`
        mocks the upstream Ollama response body to include `model: 'gemma4-rotorquant:latest'` and
        then asserts the route echoes it back — this tests pass-through behavior and would pass
        regardless of which model is actually live in production. Not the bug pattern.
      - `embeddinggemma:latest` / `nomic-embed-text:latest` assertions are correctly stable — the
        embeddings lane is explicitly frozen per this repo's architecture (design.md section 1),
        unlike the volatile chat/synthesis model.
      - **2 files confirmed to have the real bug** via live test runs (not just grep):
        `tests/opencode-mcp-config.spec.ts` (2 failing tests — one asserts a model *file* no longer
        exists at the expected path, one asserts `cfg.model === 'ollama/gemma4-rotorquant:latest'`
        but the live `.opencode/opencode.jsonc` now says `'llama-server/hforf.gguf'`, which is
        *also* stale, not Ornith — this is live **config drift**, not just a test bug, and needs an
        operator decision about the correct current config value, not a guessed fix) and
        `tests/infra-ollama-cache-routes.spec.ts` (`GET returns service info` — confirmed via
        reading `src/routes/api/ollama/pull/+server.ts` that the route correctly reports
        `EMBEDDING_MODEL` per the Ollama-embeddings-only rule; only the test's hardcoded
        `'gemma4-rotorquant:latest'` expectation was stale).
      - **Not attempted**: a blanket fix across all ~15 files. This is the same ~85-file test-sweep
        scope already recorded as deferred in `parent-atlas-retrieval-fusion-reachability/tasks.md`
        (a concurrent session, commit `732c66f6bb`, is actively working through it) — redoing that
        full sweep here would duplicate effort against a moving target, not add value.
- [x] **OPENAI-FACADE-02**: Fixed the one confirmed-safe case:
      `tests/infra-ollama-cache-routes.spec.ts`'s `GET returns service info` test now asserts
      `data.model === 'embeddinggemma:latest'` (matching the route's real, correct behavior) instead
      of the stale `'gemma4-rotorquant:latest'`. Verified live: that specific assertion now passes;
      the test still fails on the *next* line (`data.url`), a separate, pre-existing, unrelated
      env-mock bug (`http://ollama.test` mock not intercepting, real default `127.0.0.1:11434`
      returned instead) — out of scope for this task, not fixed, not hidden.
      **`opencode-mcp-config.spec.ts` left unfixed** — its failure is live-config drift
      (`.opencode/opencode.jsonc`'s actual `model` field doesn't match either the old test
      expectation or any currently-documented canonical model name), which needs an operator
      decision about what the config *should* say, not a test-only patch guessing at an answer.

## Phase 2 — ORNITH-RERANK-SHADOW-01 (the review's top-priority experiment)

- [x] **RERANK-SHADOW-01, CORRECTED (2026-09-06)**: Original task assumed no cross-encoder existed
      and required an acquisition decision. **That assumption was wrong** — found via
      `find . -iname "*rerank*"` (not run before the task was first written) that
      `scripts/reranker-sidecar.py` already implements a real `sentence_transformers.CrossEncoder`
      over `mixedbread-ai/mxbai-rerank-base-v2`, wired through `triton-reranker.ts` and
      `canonical-rerank-executor.ts`, with a complete launcher and pinned requirements file. See
      design.md section 12's corrected capability-gap record for full detail.
      **Live-checked, not currently running**: `.env` has neither `RERANKER_SIDECAR_URL` nor
      `TRITON_URL` set; `curl http://127.0.0.1:8099/health` was unreachable.
      **Completed and live-verified 2026-09-06 (with explicit confirmation before the GPU-resource
      action)**:
      1. Checked Python deps directly (`python -c "import sentence_transformers, torch, ..."`) —
         `sentence_transformers 5.0.0`, `torch 2.8.0+cu128` (`cuda: True`), `fastapi 0.104.1`,
         `uvicorn 0.24.0`, `pydantic 2.11.7` all already installed. `fastapi`/`uvicorn` sit slightly
         below the pinned minimums in `requirements-reranker.txt` (`>=0.111.0`/`>=0.29.0`) — not
         upgraded preemptively per `DEPENDENCY-CAPABILITY-GUARD-01` (no proven need to), and the
         sidecar ran correctly with the installed versions.
      2. **Found and fixed a real bug in `scripts/launch-reranker.ps1`** while starting it:
         `Start-Process @startArgs -PassThru` failed with
         `A parameter cannot be found that matches parameter name 'EnvironmentVariables'` —
         `-EnvironmentVariables` is a `.NET ProcessStartInfo` member, not a real `Start-Process`
         cmdlet parameter; this line had never actually been exercised before. Fixed by removing it
         — `$env:PATH`/`$env:RERANKER_PORT` are already set on the parent process earlier in the
         script, and `Start-Process` children inherit the parent's environment by default, so no
         explicit env-passing was needed at all.
      3. Launched successfully (PID confirmed, logs at `logs/reranker-*.log`).
      4. `curl http://127.0.0.1:8099/health` (after ~15s model-load wait): `{"status":"healthy",
         "model_loaded":true,"device":"cuda","model_id":"mixedbread-ai/mxbai-rerank-base-v2",
         "vram_current_mb":950.17}` — genuinely loaded on GPU, not a stub response.
      5. Real `/rerank` call with one deliberately relevant and one deliberately irrelevant
         candidate: **relevant scored 0.608, irrelevant scored 0.0037** — correct ordering with a
         large, meaningful separation, not constant/random output. `latency_ms: 1003.6`,
         `vram_peak_mb: 963.98`.
      6. Set `RERANKER_SIDECAR_URL=http://127.0.0.1:8099` in `sveltekit-frontend/.env` (confirmed
         gitignored before editing; confirmed `env.server.ts` already surfaces this exact key onto
         `ENV.RERANKER_SIDECAR_URL`, so no additional wiring was needed).
      7. Re-ran the full `src/lib/server/retrieval/` direct test suite (298 tests): 281 pass, 7
         skipped, 10 fail — all 10 failures are `executor-tree-test.server.test.ts`'s
         `ECONNREFUSED :5173` cases, a pre-existing, already-documented dependency on a running dev
         server (unrelated to the reranker, confirmed by file name matching this session's earlier
         "modules never touched by this change" list). No new failures.
      **Attempted, blocked by an unrelated pre-existing issue**: tried running the repo's own
      `scripts/smoke/mixedbread-reranker-live-smoke.mjs` to exercise `canonical-rerank-executor.ts`'s
      full cache/fallback chain end-to-end against the now-live sidecar. It failed before ever
      reaching the reranker: `retrieveBM25Trigram()`'s Postgres query failed with
      `SASL: SCRAM-SERVER-FIRST-MESSAGE: client password must be a string` — a Postgres
      connection/credential-loading problem in this specific execution context (`node --import tsx`
      from `sveltekit-frontend/`), not a reranker issue. Qdrant was independently confirmed
      reachable (`curl :6333/collections` succeeded) in the same session, so this is scoped to
      Postgres auth/env loading specifically. **Not investigated further** — this is the same class
      of execution-context sensitivity root CLAUDE.md's own "NPX Execution Context & Module Alias
      Resolution" section documents, and debugging Postgres credential plumbing is out of scope for
      a reranker-verification task. The sidecar itself remains independently proven live and correct
      via the direct `curl` calls above; only the *executor's* end-to-end integration with the rest
      of the live retrieval stack (BM25/Qdrant/graph fusion feeding into the reranker) is unverified.
- [x] **RERANK-SHADOW-02 (2026-09-06)**: Built `scripts/atlas/rerank-shadow-01-harness.mjs` with a
      frozen 3-query fixture (5 candidates each). `canonical_production_data_touched: false` —
      candidates are hand-written excerpts of this session's own real code (not fetched from live
      Qdrant/Postgres), with ground-truth `relevant` labels assigned directly against files actually
      read/written this session, not fabricated or guessed.
- [x] **RERANK-SHADOW-03 (2026-09-06)**: Ran the harness against all 3 real, live backends — no
      mocks: `Ollama /api/embed` (EmbeddingGemma), `:8099/rerank` (the now-live mxbai sidecar),
      `llama-server /v1/chat/completions` (Ornith-1.5-9b, 0-100 relevance-score judge prompt).
      Real results, saved to `docs/reports/rerank-shadow-01-results-v1.json`:
      ```
      EmbeddingGemma (bi-encoder cosine):    top1Agreement=1.00  mrr=1.00  recallAt3=1.00
      mxbai-rerank-base-v2 (cross-encoder):  top1Agreement=0.33  mrr=0.50  recallAt3=0.33
      Ornith-1.5-9b (LLM judge):             top1Agreement=1.00  mrr=1.00  recallAt3=1.00
      ```
      **A likely confound was found and is NOT papered over**: `scripts/reranker-sidecar.py`'s own
      docstring specifies candidates should be formatted as `SOURCE: <path>\nSYMBOL: <name>\nKIND:
      <kind>\nCALLS: ...\n\n<content>` ("matches Atlas canonical shape"). This harness's fixture
      passed raw code-snippet text with no such prefix — a real mismatch with the format the model
      was documented as expecting. mxbai's poor showing here is very plausibly an artifact of that
      formatting gap, not evidence of genuine model-quality inferiority to EmbeddingGemma cosine
      similarity or Ornith's judge prompt. **Not re-run with corrected formatting this session** —
      flagged as the required next step before any real conclusion, per RERANK-SHADOW-04 below.
- [x] **RERANK-SHADOW-04 (2026-09-06) — `NOT_PROVEN`, correctly scoped, not forced**: Per the spec's
      "evidence-scoped, not blanket" requirement, this is explicitly NOT a conclusion that "Ornith
      matches EmbeddingGemma and beats mxbai" or that "mxbai underperforms." The sample is far too
      small (3 queries) to be statistically meaningful, and the identified candidate-format confound
      above means mxbai's real quality was not fairly measured in this run at all. **Recorded
      finding, not a promotion decision**: (1) the harness and all 3 live backends are proven to
      work end-to-end — this was the main open risk before this task, now closed; (2) the candidate-
      format mismatch is a real methodological gap that must be fixed (reformat fixture candidates
      to the sidecar's own documented `SOURCE/SYMBOL/KIND` shape) before mxbai's real quality can be
      assessed; (3) no promotion of any method to a production reranking role is authorized by this
      result. **Next step for whoever continues this**: reformat the fixture per the sidecar's
      documented shape, re-run, and only then draw a real comparative conclusion — ideally also
      expand past 3 queries for statistical meaning.

**Format-ablation follow-up (2026-09-06) — hypothesis tested and FALSIFIED, not confirmed**: ran
`scripts/atlas/rerank-shadow-01-format-ablation.mjs`, reformatting the same 3-query fixture's
candidates into the sidecar's documented `SOURCE:/SYMBOL:/KIND:/CALLS:` shape, holding query/model/
ground-truth constant. Result, saved to `docs/reports/rerank-shadow-01-format-ablation-v1.json`:
**top1Agreement dropped from 0.33 (raw text) to 0.00 (formatted)** — the opposite of what the
confound hypothesis predicted. This directly falsifies "candidate format explains mxbai's poor
showing" as stated. Not chased further this session (context-budget-bounded) — the real
explanation remains open. Two honest possibilities, neither confirmed: (a) the 3-query fixture is
still too small/noisy for either result to mean much statistically, or (b) mxbai genuinely
struggles on this specific kind of near-duplicate, terse TypeScript-contract text regardless of
formatting, which — if true on a larger sample — would itself be a real, useful finding about where
this reranker is weak. **`RERANK-SHADOW-04`'s `NOT_PROVEN` verdict stands, now more clearly
justified**: two contradictory small-sample signals, no confirmed explanation, definitely not
enough evidence to promote or dismiss any method.

**Separate, unrelated fix found while investigating this (2026-09-06)**: the Postgres
`SASL: client password must be a string` error from the original smoke-script attempt was
**not** a wrong-credential problem — `.env` already had the correct `DATABASE_URL`
(`legal_admin:123456@127.0.0.1:5434/legal_ai_db`, confirmed working via direct `docker exec psql`
and a direct `pg.Client` connection). The real cause: `node --import tsx <script>.mjs` does not load
`.env` at all — confirmed via `process.env.DATABASE_URL` printing `undefined` in that exact
invocation shape. **Fix**: Node 22's native `--env-file=.env` flag
(`node --env-file=.env --import tsx <script>.mjs`) loads it correctly — verified live, the
smoke script's retrieval stage then ran for real (14 packets fetched, 28 promotion jobs enqueued).
This is the same class of issue root CLAUDE.md's "NPX Execution Context & Module Alias Resolution"
section already documents for `$lib` aliases — env-var loading has the identical gotcha, just not
previously written down. **Recorded, not fixed at the script level**: `mixedbread-reranker-live-
smoke.mjs`'s own `main().catch()` handler regex-matches any error message containing `/sidecar|
rerank/i` and replaces it with a generic "sidecar unavailable" message — even though the sidecar
was independently confirmed live via direct `curl :8099/health` at the same moment the script
reported it "unavailable." This swallows the real underlying error text; not fixed this session
(would need to see the suppressed original error first, which requires a small script edit to stop
swallowing it — flagged, not done, given context budget).

## Phase 3 — CandidateEvidenceCardV1 shadow proof (only after Phase 2's cross-encoder is real)

- [x] **EVIDENCE-CARD-01 (2026-09-06) — real domain-mismatch finding, not the originally-scoped
      experiment**: Before feeding candidates through "batch LangExtract," checked what "batch
      LangExtract" actually resolves to in this repo (per this session's Duplication Prevention /
      capability-guard discipline — never assume, verify). Found a real, wired `langextract_batch`
      tool handler (`src/lib/server/tools/handlers/langextractBatch.ts`) plus the underlying
      extractor it (and 6 other call sites) route through: `src/lib/server/langextract-client.ts`'s
      `langextractFetch()`, which by default (`LANGEXTRACT_NATIVE='true'`, the documented default in
      `env.server.ts`) short-circuits to a **pure-TS, legal-domain regex extractor**
      (`src/lib/server/langextract/native.ts::extractDocumentNative`) — no external sidecar process
      required at all (answers this session's earlier open question "did we add langextract nlp
      sidecar passes?": no new sidecar was added, but a real native-TS extractor already exists and
      is the live default; the Python `miniforge-nlp-sidecar` on :8095 is now an opt-out fallback,
      not the primary path). Read the extractor's entity-type union
      (`citation|statute|case_name|court|monetary|date|person|organization`) against
      `CandidateExtractedEvidenceV1Schema`'s target fields (`symbols|apis|tests|constraints`,
      CONTRACT-03) and found **zero overlap** — this extractor is legal-domain-tuned, not
      code-domain. Verified empirically rather than trusting the regex-reading alone: built
      `scripts/atlas/evidence-card-01-native-extract-probe.mjs`, ran it against 4 real TypeScript
      code candidates from this session's own RERANK-SHADOW fixture, result saved to
      `docs/reports/evidence-card-01-native-extract-probe-v1.json`: **0 entities extracted across
      all 4 candidates** (sub-millisecond latency each — fast, but empty). This confirms the domain
      mismatch with real evidence, not inference from reading patterns.
- [x] **EVIDENCE-CARD-02 (2026-09-06) — recorded decision: do not invest further yet**: Per the
      spec's "no hard pass/fail gate, exploratory" framing, this is the actual decision point the
      phase asked for. **Finding**: `CandidateEvidenceCardV1`'s code-oriented `extracted` shape
      (symbols/apis/tests/constraints) has **no existing extractor to populate it**. The only wired
      "batch LangExtract" path is legal-entity extraction (citations/statutes/case names/courts),
      useful for a legal-document corpus but empirically empty on code candidates. Building a
      code-symbol/API/test/constraint extractor would be a genuinely new capability (not a reuse of
      an existing one), which — per root CLAUDE.md's `DEPENDENCY-CAPABILITY-GUARD-01` — needs its
      own explicit capability-gap justification and design, not a quick addition inside an
      exploratory proof task. **Decision recorded, not forced**: do NOT invest further in wiring
      `CandidateEvidenceCardV1` extraction against code-candidate corpora until a deliberate
      follow-on change designs a code-domain extractor (e.g., leaning on the AST/ast-grep structural
      facts this repo already produces elsewhere, per `graphify-structural-intelligence-adapter.ts`,
      rather than a regex-based approach). The contract (`CandidateEvidenceCardV1`) and its bounded-
      batch guard (`assertExtractionBatchBounded`) remain valid and tested (CONTRACT-03, 8/8 pass);
      only the "wire it to a real extractor for code candidates" step is now known-blocked with a
      documented reason, not silently unattempted. Token-count/grounding-coverage/downstream-answer-
      quality measurements from the original task description were not executed — they are moot
      until an extractor exists that can produce non-empty output on this corpus.

## Explicitly out of scope for this change (see design.md sections 7, 9, 10, 11)

Do not attempt these under this proposal — each needs its own follow-on OpenSpec change once the
phases above produce real evidence to design against:
- Transport-plane separation (gRPC control / Arrow Flight / Arrow mmap / CUDA-IPC)
- Token-cache tier (L1, between BitFrost object cache and llama-server's KV/recurrent cache)
- `ContextSegmentV1` budget-constrained context optimization
- Tabular RandomForest/XGBoost/PyTorch capability-selection classifier
- `HelperDagV1` + Tang-style low-rank helper recommender
- `AgentWorkItemV1` Kanban-as-LangGraph-projection
