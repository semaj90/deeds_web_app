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

## Pipeline build-state audit — registry → packet builders → Go retrieval → offline (2026-09-20)

Read-only audit (3 subagents; static grep + SELECT/catalog/plain EXPLAIN + health GETs; no writes).
Per the root CLAUDE.md status convention no percentage is claimed; 0 stages are APPLY_PROVEN end to end.
Stage counts: DRY_RUN_PROVEN 2, WIRED 8, PARTIAL_PROVEN 1, CREATED 6, NOT_PROVEN 6.

| Stage | Status | Evidence |
|---|---|---|
| Postgres packet registry (`atlas_packets` 61,718; `atlas_packet_registry` 58,304) | CREATED | counts differ by 3,414 — lineage reconcile not done |
| `domain_class` / `title_id` separation | WIRED | 61,718 / 61,660 populated; `title_id`==`feature_id` on 1 row |
| `primary_domain`, `domain_taxonomy_v1` | NOT_PROVEN | 0 rows each; `predicted_domain` only 4,412 rows |
| Drizzle vs live `atlas_packets` | PARTIAL_PROVEN | schema is `db/schema/atlas-packets.ts`; not a full column diff; live still has `content_embedding_384` |
| PG18 bitmap path | DRY_RUN_PROVEN (plan only) | `domain_class`+`tags` chose btree bitmap + tags filter, no BitAnd with tags GIN; no timing |
| pgvector 768 alignment | DRY_RUN_PROVEN | 61,659 rows all `vector_dims`=768 |
| TRACE `context.build_ace_packet` | WIRED | live canary built + cached 3 `ace:packet:*` (TTL ~7d, `from_cache:true` on repeat); call exceeded 300s once |
| TRACE `context.build_kv_packet`, `atlas.build_taxonomy_topology_packet`, `atlas.compact_context` | WIRED | registered; no live agent caller found |
| ACP `/api/acp/*`, A2A `agent.json`, agent packet-injection hooks | NOT_PROVEN | no packet-build exposure found; `.opencode` hooks unread |
| msgpack codec / HyperRAG packet pipeline | WIRED / CREATED | imported by `packet-io`, `ace-packet-swap`; no runtime proof |
| `AcePacket`, `ContextManifest`, `PromptPlanV1` | WIRED / CREATED / CREATED | `PromptPlanV1` has TWO owners (`atlas/prefill/prompt-plan-v1.ts`, `atlas/agentic-file-compiler/prompt-plan.ts`) |
| Go retrieval → ACE injection | WIRED (static) | `/search/codebase` live health OK; `search-unified` passes `includeAcePacket`; `go-search-bridge` not imported by `search-unified`; no live query receipt; `/search/bm25` is `ts_rank_cd` not BM25 |
| Go result identity | NOT_PROVEN | one hit had a chunk UUID as `packet_key`; `representation_revision` missing on hits |
| DuckDB offline | CREATED / WIRED | 906 MB snapshot (Aug 2) has no receipt; not on retrieval path |
| CouchDB MapReduce | CREATED | container healthy; views/design docs not inspected; last ingest receipt May 16 |
| NDJSON MapReduce | NOT_PROVEN (stale) | `ndjson:mapreduce` script not found; `.opencode/ndjson/` from Aug 29, candidates file empty |

Open follow-ups (unchecked; each needs its own live evidence before ticking):
- [x] AUDIT-01 Reconcile `atlas_packets` vs `atlas_packet_registry` by `packet_key`. DONE 2026-09-20 (read-only SELECT): both tables hold 61,718 rows and 0 `packet_key` is missing in either direction. The earlier 58,304 figure came from stale `reltuples` statistics, not real rows; the 3,414-row gap in the audit table above is withdrawn.
- [ ] AUDIT-02 Populate/decide owner for `domain_taxonomy_v1` and `primary_domain` (needs operator decision; writes).
- [ ] AUDIT-03 One live `/search/codebase` → `search-unified` → ACE packet round trip with a receipt.
- [ ] AUDIT-04 Reconcile the two `PromptPlanV1` definitions into one owner.
- [ ] AUDIT-05 Investigate why `context.build_ace_packet` / `ace.compact_search` exceed 300s (rerank :8099 and topology :8101 down).
- [ ] AUDIT-06 Normalize Windows-backslash `source_ref` values emitted in built packets.
- [ ] AUDIT-07 Locate or recreate the `ndjson:mapreduce` script and refresh `.opencode/ndjson/`.

### Embedding-dimension gate for every follow-up above (operator direction 2026-09-20)

Applies to AUDIT-01..07 and to any BitFrost/ACE packet warming, Go/TurboVec/NLP-sidecar parity work
and registry backfill under this change. Source of truth is root CLAUDE.md "Embedding Dimensions Policy".

| Lane | Allowed role | Rule |
|---|---|---|
| `semantic_768` (embeddinggemma, native) | PRIMARY, the only authoritative vector | Postgres `atlas_packets.embedding` / `codebase_chunk_index.content_embedding` and Qdrant `content` vector must be 768 |
| 512 / 256 / 128 MRL prefix truncation (L2-renormalized) | DERIVED, optional | may only be produced from an already-indexed, validated 768 source; never primary, never a separate RRF vote |
| `latent_256` / `latent_128` / `latent_64` (autoencoder) | DERIVED routing/challenger | separate mechanism from MRL truncation; not identity, not retrieval authority; Postgres-only for 64/128 (no Qdrant collections); TurboVec 64-dim is this class |
| 384 | RETIRED | do not reintroduce |

Live state observed this session: `atlas_packets.embedding` is 768 on 61,659 rows (verified `vector_dims`);
`latent_64` has 1,703 populated rows per CLAUDE.md (not re-measured here); `content_embedding_384` still exists
on a table the CLAUDE.md says had it dropped (unconfirmed which table).

- [~] DIM-01 (2026-09-20 finding: NOT APPLICABLE to today's warm paths — `scripts/atlas/warm-bitfrost-semantic-cache.mjs`, `cache/atlas-reward-cache.ts`, `cache/ace-packet-cache.ts` and the ACE identity module contain no embedding/vector references, so there is no vector to dimension-check; the 768 guarantee for caches is carried by DIM-04's `representationRevision`. Keep this task as a guard for any FUTURE vector-carrying warm path; do not add an unused helper now.) Original: Add a read-only check that any packet/cache warm batch rejects vectors whose `vector_dims` is not 768 (or an admitted derived lane tagged with its source-768 revision). Note 2026-09-20: an existing owner already guards 384 WRITERS — `src/lib/server/atlas/embedding-384-writers.guard.spec.ts` — extend that (do not add a second guard). ~15 files still reference the 384 columns (e.g. `packages/atlas-duckdb/src/vector-snapshots.ts`, `packages/semantic-contracts/src/vector-manifest.ts`, `vector/embeddinggemma-contracts.ts`, several `scripts/atlas/*` audits); classified 2026-09-20 (first 8 of ~15 read in context, read-only):
      - Declared LEGACY/REFERENCE (guarded, OK): `vector/embeddinggemma-contracts.ts` (`EMBEDDINGGEMMA_LEGACY_DIRECT_SLICE384_SNAPSHOT`, `LEGACY_MIGRATION_ONLY`), `semantic-contracts/vector-manifest.ts` (`status: REFERENCE_ONLY`, `supersededBy: semantic_768`), `scripts/atlas/audit-latent-representation-identity.mjs` (labels it `LEGACY`), `arrow-batch-export.mjs` (exports it as `legacy_embedding_384`).
      - Schema only: `db/schema-atlas-registry.ts` (`latent_384d vector(384)`). Optional switch: `atlas-duckdb/src/vector-snapshots.ts` defaults to 768 and only uses the 384 column if the caller passes it.
      - Needs a look: `scripts/atlas/apply-naive-bayes-predictions.mjs:163` conditionally SELECTs `ap.content_embedding_384` into the classifier input row — CHECKED 2026-09-20: NB uses only a boolean token `has_embedding` (`apply-naive-bayes-predictions.mjs:101,198`); vector values never enter the feature row. Residual defect: line 198 computes `has_embedding = row.embedding || row.content_embedding_384 || row.latent_64`, so a packet with ONLY a legacy 384 (or latent_64) vector counts as embedded — should test `row.embedding` (768) only. Not changed here. `task-2-materialize-envelope-fields.mjs` only reads it for a has-embedding print.
      - Remaining files read 2026-09-20 (read-only): audits that only DETECT/list the legacy lane, OK: `audit-atlas-indexing-surfaces.mjs`, `audit-qdrant-collection-roles-v1.mjs`, `audit-semantic-owner-consistency-v1.mjs`. Validators that COUNT 384 AS "the embedding" (contradicts the 768-only policy; readiness numbers can be inflated by legacy rows): `validate-progressive-semantic-compiler.mjs:138` (accepts `content_embedding_384` as an `embedding` candidate), `validate-parent-atlas-training-readiness.mjs:72` (`embedding IS NOT NULL OR content_embedding_384 IS NOT NULL`), `validate-feature-set-alignment-smoke.mjs:14,108-112` (defines "Lane 5: Embedding" AS `content_embedding_384`). Still-active 384 WRITER: `embedding-384-writers.guard.spec.ts:24` allowlists `scripts/atlas/phase-17-hyperrag-indexing-e2e.mjs` as writing `atlas_packets.content_embedding_384` via `:8081` model `embeddinggemma-384` — so the 384 column is not frozen, it has a sanctioned writer.
      - DIM-01a DONE 2026-09-20: the three validators now count `embedding` (768) only (`validate-progressive-semantic-compiler.mjs:138`, `validate-parent-atlas-training-readiness.mjs:72`, `validate-feature-set-alignment-smoke.mjs` Lane 5); `node --check` passes on all three. Live measurement: 61,659 packets have a 768 `embedding` and 0 rows are 384-only, so the reported numbers do not change today — the edit prevents future inflation. The validators were NOT executed end to end. Still open: DIM-01b DONE 2026-09-20 (operator chose convert-to-768): `scripts/atlas/phase-17-hyperrag-indexing-e2e.mjs` now embeds via Ollama `embeddinggemma:latest` `/v1/embeddings` (live probe: 768 dims), writes `atlas_packets.embedding` (not `content_embedding_384`), requires `vectorDim===768`, is dry-run unless `--apply`, and requires an explicit `--collection` (no default). It was removed from `KNOWN_LEGACY_WRITERS` in `embedding-384-writers.guard.spec.ts`; that guard passes 1/1. NOT_PROVEN: the converted script itself was never run; it is now a second 768 writer beside the canonical `codebase_chunk_index` path (explicit-opt-in only); even its dry-run still creates tables/inserts an `atlas_index_runs` row (pre-existing, unchanged); a hardcoded DB password fallback remains in its config. Original wording: decide whether the phase-17 allowlisted writer should be retired (operator decision).
- [x] DIM-02 Confirm which table still carries a 384 lane; record it. DONE 2026-09-20 (read-only, information_schema + count). Retired-384 is NOT gone from the data: `atlas_packets.content_embedding_384` (vector) has 58,109 non-null rows; `atlas_packet_registry.latent_384d` (vector) exists; `codebase_chunk_index` still has `summary_embedding_384` and the `kmeans384_*` columns; `codebase_chunk_index_backup` holds both 384 vector columns (the archived copy). The CLAUDE.md note that `content_embedding_384` was dropped is true only for `codebase_chunk_index`. No drop was run; any drop/archive is a schema change needing operator approval and the archive-not-delete convention. Follow-up (unchecked): decide whether `atlas_packets.content_embedding_384` (58,109 rows) is archived, and make sure no ACE/warm/retrieval path reads it (DIM-01).
- [ ] DIM-06 (finding 2026-09-20, read-only; operator remark 'we copied over / replaced content_embedding_384 with 768' checked against live data) The 768 lane is SPLIT across two `codebase_chunk_index` columns and the columns are NOT copies of each other. Live counts (274,465 chunk rows): canonical `content_embedding` `halfvec(768)` = 55,169 rows; newer `content_embedding_768` `vector(768)` = 219,998 rows (all `vector_dims` 768); rows with BOTH = 739; only `content_embedding_768` = 219,259; only `content_embedding` = 54,430; together they cover all but 37 rows. On the 739 shared rows cosine(`content_embedding`, `content_embedding_768`) averages 0.90, min 0.726, and 0 rows reach 0.999 — a different embedding path/prefix/precision, not a copy. Provenance labels on `content_embedding_768` rows: `embeddinggemma:latest` 768 for 219,422 rows and `embeddinggemma:latest:eg-task-prefix-v1` 768 for 576 rows (the EG-GGUF task-prefix executor). Separately: no 384-named column contains 768 data — `atlas_packets.content_embedding_384` is `vector(384)` (58,109 rows, last written 2026-09-08), so a 768 vector cannot be stored there. IMPLICATIONS: (1) root CLAUDE.md is stale — it calls `content_embedding_768` a small separate column (~1,386 rows) and `content_embedding` the only canonical one; (2) which column is the authoritative `semantic_768` source is now an open owner decision, and retrieval/warm/validator code that reads only `content_embedding` sees roughly a fifth of the rows while code reading `content_embedding_768` sees the rest, so mixing them in one index or one RRF lane would mix two non-identical vector spaces; (3) the `representationRevision` in cache identities must distinguish them. NOT done: no data changed; no decision on which column is canonical; whether Qdrant `codebase_chunks_768*` was built from one column or both was not checked. Action needed from the operator: name the authoritative column (or a re-embed/backfill plan) before any warm batch, benchmark or cuVS/Qdrant rebuild reads 768 vectors.
- [ ] DIM-07 (finding 2026-09-20, read-only; follows DIM-06) Qdrant 768 collections vs Postgres columns — sample parity check (scratch script in the session scratchpad; SELECT-only on Postgres, scroll-only on Qdrant; first 150 points of each collection, NOT a random sample). `codebase_chunks_768` (328,348 points; named vectors content/error/signature, payload has `chunk_id`, `packet_key`, `source_ref`): 0 of 150 sampled `chunk_id`s matched `codebase_chunk_index.id` — that collection's `chunk_id` is a different id space (or a different key form), so THIS test could not say which Postgres column it was built from (inconclusive, not a pass). `codebase_chunks_768_v2` (52,816 points; payload has `postgres_id`, `chunk_id`, `projection_revision`): 99 of 150 matched a Postgres row; against canonical `content_embedding` cosine avg 0.949 / min 0.738 with 0 of 99 at >=0.999; against `content_embedding_768` (only 4 of the 99 have it) avg 0.883 / min 0.629 with 0 at >=0.999. So the sampled v2 vectors match NEITHER Postgres 768 column; halfvec rounding alone would give ~0.9999, so this is a real difference (different input text/task prefix, a different embedder revision, or a stale mirror), not precision. IMPLICATION: the 'Postgres is truth, Qdrant is a rebuildable mirror' invariant is not currently demonstrated for the 768 lane; any 'recall vs exact' or cuVS/Qdrant comparison that treats one as ground truth for the other needs this resolved first. CAVEATS: n=99 for v2, non-random; 51 of 150 v2 points had no matching Postgres id (unexplained); the older collection could not be tested by `chunk_id`. NEXT (unchecked): join the older collection through `packet_key`/`source_ref`+`content_hash` instead; take a random sample; compare against a fresh embedding of the same chunk text through the current embedder to see which column, if any, reproduces. Decision needed alongside DIM-06: name the authoritative `semantic_768` source.
- [ ] DIM-08 (RECOMMENDATION 2026-09-20, operator asked the agent to decide; read-only evidence, nothing applied) Authoritative `semantic_768` source = `codebase_chunk_index.content_embedding` (`halfvec(768)`), input recipe `title: {source_ref} | text: {content}` (EmbeddingGemma's documented document format). Evidence: 40 random chunks per group re-embedded with the current `embeddinggemma:latest` (Ollama `/api/embed`) under four input formats and compared by cosine with each stored column. `content_embedding_768` rows that have only that column reproduce under RAW `content` (no prefix) at avg 1.0000, 40/40 above 0.995. `content_embedding` rows that have only that column reproduce best under `title: {source_ref} | text: {content}` at avg 0.9951 (max 1.0, 28/40 above 0.995); on the 739 rows that have both, `content_embedding` matches the titled format at avg 0.9758 (18/40 above 0.995) while `content_embedding_768` matches raw content only at avg 0.8623 (max 0.98, 0/40) — so those 739 rows use a third recipe, plausibly the 576 rows labelled `embeddinggemma:latest:eg-task-prefix-v1`. A summary-text recipe matches neither column. CONSEQUENCES: (1) the two 768 columns are two different, each-reproducible vector spaces (cosine about 0.89-0.94 between recipes for the same text) and must never share one index, one Qdrant collection or one RRF lane; (2) `content_embedding_768` should be treated as a distinct non-authoritative representation (e.g. `semantic_768_rawcontent`) with its own representationId/Revision; (3) coverage gap: 219,259 chunks have only the raw-recipe vector while the authoritative column covers 55,169. PROPOSED (NOT DONE, needs operator approval and a dry run first): backfill the missing rows into `content_embedding` using the titled recipe (about 219k local embeddings + a write), rebuild the mirrors after, and only then let cuVS/Qdrant/benchmarks read 768 vectors. Alternative the operator may prefer: adopt the raw recipe as authoritative (cheaper: about 55k re-embeds) at the cost of not following the model's official document format. LIMITS: n=40 per group; 12 of 40 canonical-only rows did not reproduce above 0.995 (cause unknown: title string, truncation, or halfvec rounding); valid only if the embedder is unchanged since the vectors were written (both columns reproduced to about 1.0 for some rows, so it appears unchanged); which recipe the Qdrant `codebase_chunks_768_v2` mirror used was NOT tested (it matched neither column at cosine avg 0.949/0.883 — DIM-07). Root CLAUDE.md remains stale on `content_embedding_768` until this is approved. BACKFILL COST (measured 2026-09-20, read-only; approved in principle, apply NOT run): dry run on 300 rows: 0 bad dims, norms exactly 1.0, cosine(new titled, existing raw) min 0.71 / median 0.89 / max 0.97; 219,259 rows need it, none lack content (chunks median 800 chars, max 1,694). Throughput ceiling about 60 embeddings/s (batch 16x1 54/s; batch 32x1 62/s; batch 64x1 61/s; concurrency 2-4 gives no gain, GPU-bound; `dev:gpu` and CPU workers do not help — it only starts llama-server :8090 + Vite) so about 1 hour of embedding; the RTX 3060 Ti has 7.6 of 8 GiB in use by the chat model. Write shape: `UPDATE codebase_chunk_index SET content_embedding = $vec::halfvec(768) WHERE id = $id AND content_embedding IS NULL` in batches of ~1,000, never overwrites an existing vector. Size: avg stored halfvec 1,540 bytes -> about 338 MB (about 350 MB with TOAST chunk overhead; column storage is EXTERNAL, i.e. uncompressed, and float vectors do not compress); new row versions about 0.4 GB heap; HNSW `codebase_chunk_index_content_hnsw` 106 MB for 55,169 entries -> about +420 MB (about 530 MB total); every other index also gets an entry per row (update is non-HOT because an indexed column changes; GIN `idx_codebase_chunk_bm25_search` about +80 MB, btrees ~10-15 MB each); `trig_update_codebase_chunk_search_vector` recomputes `search_vector` on every updated row. Net about +1.6 GB persistent, transient WAL about 2-3 GB (`max_wal_size` 1 GB, `wal_compression` off, so frequent checkpoints/full-page images); `C:` has 22 GB free at 98% used. For scale: `content_embedding_768` is float32 (3,076 B/vector, 768 MB HNSW), so the halfvec column is half the size per vector. Optional levers needing operator approval: `wal_compression` on. NOT decided: provenance labelling — `embedding_model`/`embedding_version` are ONE label per row shared by both vector columns, so a backfill must not overwrite them (record the recipe in a receipt instead), and the Qdrant mirror plus cache invalidation must follow (DIM-07). The existing `scripts/atlas/apply-lineage-qualified-semantic-768-backfill-v1.mjs` is a frozen 15-row canary writing `content_embedding_768` with a third recipe (path+symbol+kind+summary+content+ast_symbols); it is not a general backfill owner.
- [x] DIM-05 Describe all seven lanes in one contract vocabulary (operator direction 2026-09-20: 768, MRL 512/256/128, latent 256/128/64). DONE: `vector/embeddinggemma-contracts.ts` gained `EMBEDDINGGEMMA_LATENT256/128/64_CONTRACT` (`representationFamily: latent_autoencoder`, `projectionKind: learned_autoencoder`, `canonical:false`, `queryCompatible:false`, `REFERENCE_ONLY`); `latent_128` is declared as `latent_slice_first_n` of `latent_256` (sourceDimension 256), NOT an MRL truncation of 768. `projectEmbeddingForContract` now throws `LATENT_LANE_REQUIRES_NESTED_AUTOENCODER_SERVICE` for these, closing a hole where the `truncation:'none'` pass-through would have returned the raw 768 vector for a latent contract. Descriptors only: the encoder owner stays `python/atlas_compute/latent_autoencoder.py` (NestedSemanticAutoencoder) — no second encoder was added. Proof: `vector-index-registry.test.ts` 7/7 pass (1 new test). NOT_PROVEN / not done: no entry in `VECTOR_INDEX_REGISTRY` uses the latent contracts yet; live latent row counts and any Qdrant latent collection were not re-measured here (CLAUDE.md records `latent_256` 55,169 rows + Qdrant `codebase_chunks_latent256`; `latent_128` 55,169 rows Postgres-only; `latent_64` 1,703 rows Postgres-only as of 2026-09-16).
- [ ] DIM-03 Verify Go `/search/codebase` hits and TurboVec results state their representation (`semantic_768` vs `latent_64`) and never mix them in one fused score.
- [~] DIM-04 Ensure ACE packet cache identity includes `representationRevision`, so a latent/truncated lane cannot be served as a 768 hit. PARTIAL 2026-09-20 (read-only): SATISFIED for `AceBitfrostCacheIdentityV1` (`atlas/cache/ace-bitfrost-cache-identity-v1.ts`: `representationId` + `representationRevision` are REQUIRED in a `.strict()` schema) and `PacketSemanticCacheIdentityV2` (`cache-keys.ts:484-523`, `representationRevision` required). NOT satisfied for the TRACE `ace:packet:<packet_id>` store written by `context.build_ace_packet`: the canary keys were bare 16-hex ids (`ace:packet:54a414be14cadf22` …) with no representation/revision segment, so nothing in the key stops a packet built under one representation from being served under another. Close together with ACEPKT-02 (route the TRACE packet store through one of the two revision-qualified identities; do not add a third). BLOCKED 2026-09-20 (read-only investigation): the writer is `buildAcePacketFromSource` behind `context.build_ace_packet` (`trace-mcp-server.ts:10314`); the revision-qualified path already exists in `cache/ace-packet-cache.ts` (`buildRevisionedAcePacketCacheKeyV1` / `redisSetRevisionedAcePacketV1`, spec `ace-packet-cache-v1.spec.ts`) but its `AceBitfrostCacheIdentityV1Schema` requires ~12 revision fields (`candidateSnapshotRevision`, `ordinalMapChecksum`, `graphRevision`, `featureRevision`, `producerRevision`, `normalizationPolicyRevision`, `artifactChecksum`, `representationRevision`, …). Those cannot be supplied honestly until a frozen CandidateOrdinalMap/FeatureMatrix and a current source-authority cohort exist (the same gate recorded in the query-fanout receipt: CURRENT_SOURCE_AUTHORITY_PROVEN). Do NOT fill them with placeholders — that would mint trustworthy-looking keys with no evidence behind them. Unblocks when: candidate-ordinal/feature-matrix revisions exist. Until then the TRACE `ace:packet:*` store stays a convenience cache, not an identity-safe one, and must not be cited as a token-savings proof across representations.
- [ ] ACEPKT-01 Define `AceContextPacketV1` as the cached context product (evidence packet + bounded Ornith summary), extending the existing `AcePacket` (`cache/ace-packet-cache.ts:14`) rather than adding a parallel type. Required fields: `packetId`, `logicalTaskKey`, `taskRevision`, `workspaceRevision`, `evidenceRefs[]`, `evidenceChecksum`, `facts[]`, `unresolved[]`, `summary{text, modelRevision, promptRevision}`, `tokenCounts{input, summary, saved}`, `cache{cacheIdentity, hit, ttlClass}`, `canonicalAuthority:false`. Observed gap: packets built by the 2026-09-20 canary (`context.build_ace_packet`) return `packet_id`, `query_hash`, `source_refs`, `feature_ids` and a prompt preview, but carry no model/prompt revision, evidence checksum or token counts.
- [ ] ACEPKT-02 (BLOCKED on the same revision inputs as DIM-04 — see there) Cache key must include `packetKey`, `workspaceRevision`, `sourceRevision`, `representationRevision`, `summaryModelRevision`, `promptTemplateRevision`, `evidenceChecksum`; SOM cell, KMeans cluster, domain, TTL class and HOT/WARM/COLD are routing/residency signals and must stay OUT of the identity key. Ornith compresses facts; deterministic validators verify them; the controller (not the LLM) decides task state.

### Dynamic OpenSpec workboard + recommendations — ACP / A2A alignment (2026-09-20 audit)

Duplication-prevention finding: a dynamic board already exists. Do NOT build a second workboard or ranker.

| Piece | Status | Evidence |
|---|---|---|
| Board snapshot reader | WIRED | `src/lib/server/atlas/openspec-board/report-reader.ts` `readOpenSpecBoardSnapshot()` + `computeOpenSpecReportFingerprint()`; consumed by `routes/atlas/studio/openspec/+page.server.ts` and its `events/+server.ts` (SSE) |
| Report generators | CREATED | `npm run atlas:docs:workboard` (`build-openspec-workboard-v1.mjs`), `atlas:docs:ranker:adapt` (v3), `audit-openspec-execution-controller-v1.mjs` |
| Recommendation ranker | CREATED, advisory | `docs/reports/low-rank-task-recommendation-v2.json` (2026-09-19): `TANG_INSPIRED_LOW_RANK_SHORTLIST`, `advisoryOnly:true`, `canonicalAuthority:false`; stays a shadow challenger per the Tang-lane rules |
| ACP exposure (`ACPToolRegistry.ts`) | NOT_PROVEN | no workboard/openspec tool registered; `/api/acp/tools` cannot discover it |
| A2A exposure (`/.well-known/agent.json`) | NOT_PROVEN | no workboard skill advertised |
| Blocker-aware ready-set | NOT_PROVEN | all 200 `openspec-actionable-work-v1.json` tasks carry `executionState: ACTIONABLE`; ~98 are actually identity/source-revision gated (subagent classification, approximate) |

- [x] WORKBOARD-01 Regenerate the reports (`atlas:docs:workboard`, `atlas:docs:ranker:adapt`) so the board reflects current tasks.md files; record the fingerprint. DONE 2026-09-20: `OPENSPEC_WORKBOARD_BUILT changes=88 tasks=9296 open=3303`; ranker adapter `semanticChecksum 3522f874b51748d59ae2e11cd613c07cc6671d565483f6cfbe17a6e5f6d3b0b5`. Board snapshot read after regeneration: total 9,275, proven 5,989, actionable 2,267, waiting 916, deferred 103 (`freshness.stale:true` — newest report is `openspec-progress-audit-v2.json`, older than the 15 min window; the execution-controller/actionable reports were not re-run here).
- [x] WORKBOARD-02 Register ONE read-only ACP tool (e.g. `openspec:workboard_recommend`) in `ACPToolRegistry.ts` that wraps `readOpenSpecBoardSnapshot()` and returns ready-set + advisory recommendations; must not write, must carry `canonicalAuthority:false`. CREATED + WIRED: `openspec:workboard_recommend` (handler `openspecWorkboardRecommend`), dynamic import of the existing reader, `limit` 1-50 and `change_id` filter, dry-run plan supported. Proven: `tsgo --noEmit` reports no errors in the file; the reader itself was run live (numbers above). NOT_PROVEN: an actual `POST /api/acp/execute` round trip with the dev server up (SvelteKit was down at the time).
- [x] WORKBOARD-03 Advertise it as an A2A skill in `/.well-known/agent.json` and route it through `/api/ai/agent`, reusing the same handler (no second implementation). CREATED + WIRED 2026-09-20: skill `openspec-workboard` on the card; `/api/ai/agent` A2A branch on `metadata.skill === 'openspec-workboard'` calls `executeACPTool('openspec:workboard_recommend')`; `tsgo --noEmit` clean for all three files. NOT_PROVEN: live A2A `tasks/send` round trip (dev server down).
- [x] WORKBOARD-04 Make the ready-set blocker-aware: emit `blockerClass` (identity/source-revision, DB-or-cache-write, runtime-service, operator-decision) so IDENTITY-gated tasks stop showing as ACTIONABLE. CREATED 2026-09-20 as a KEYWORD HEURISTIC (`blockerClassMethod: KEYWORD_HEURISTIC_NOT_AUTHORITATIVE`); `ready` now returns only `UNCLASSIFIED_POSSIBLY_READY`. Live split over the board's 308 task-list ACTIONABLE rows: identity/source-revision 142, possibly ready 96, runtime service 28, operator decision 22, DB/cache write 20. Note: the board's controller summary reports 2,267 actionable while the task-report list holds 308 — the two counts disagree and are not reconciled here. A real classifier from `TaskAttemptReceiptV1` receipts is still WORKBOARD-05.
- [~] WORKBOARD-05 Emit a `TaskAttemptReceiptV1` (`logicalTaskKey`, `taskRevision`, `missingPreconditions`, `result`, `blockerClass`) per attempt and feed it back into the next ready-set. PARTIAL 2026-09-20: contract CREATED at `src/lib/server/atlas/contracts/task-attempt-receipt-v1.ts` (+ `shouldRetryTask()`), spec 7/7 pass via vitest. `COMPLETED` requires a passing validation and no missing preconditions; `canonicalAuthority` locked false. READ SIDE WIRED 2026-09-20: `openspec:workboard_recommend` now reads `task-attempt-receipts-v1.jsonl` from the reports dir (`resolveOpenSpecReportDirectory()`), keeps the latest receipt per `logicalTaskKey`, validates each line with `TaskAttemptReceiptV1Schema.safeParse` (bad lines and a missing file are ignored, fail open), and drops tasks where `shouldRetryTask()` is false; output reports `receiptsRead` and `suppressedByReceipts`. `tsgo --noEmit` clean (after repairing a corrupted regex literal from my own edit). WRITER ADDED 2026-09-20: `atlas/openspec-board/receipt-store.ts` (`appendTaskAttemptReceipt` validates with the schema then appends one JSONL line; `readLastTaskAttemptReceipts` returns the latest per key; the ACP handler now uses this shared reader, not its own copy); `receipt-store.spec.ts` 4/4 + contract spec 7/7 pass, `tsgo` clean. KEY CORRECTION: board task `id` is a derived hash (`derived:<20 hex>`), so receipts key on `stableKey` (e.g. `atlas-feature-intelligence#49497dc7828f92b4`, from the report's `stableKey`); the handler matches on it and returns `stableKey` per ready task. Earlier 'assumed id mapping' note is superseded. PRODUCER ADDED 2026-09-20: ACP tool `openspec:record_attempt` (handler `openspecRecordAttempt`) validates a `TaskAttemptReceiptV1`, supports dry-run, and appends via `appendTaskAttemptReceipt`; `tsgo --noEmit` clean. LIVE PROOF 2026-09-20 (dev server on :5173, DEV_BYPASS_AUTH): (a) `GET /api/acp/tools` lists 32 tools including `openspec:workboard_recommend` and `openspec:record_attempt`; (b) `POST /api/acp/execute` `openspec:workboard_recommend {limit:3}` -> success, board total 9,296 / proven 5,995 / actionable 2,272 / waiting 925 / deferred 104, blocker split 145 identity-gated / 93 possibly-ready / 28 runtime-service / 22 operator-decision / 20 db-or-cache-write, `receiptsRead:0`, 3 ready tasks each with a `stableKey`; (c) `POST /api/ai/agent` A2A `tasks/send` with `metadata.skill:'openspec-workboard'` -> `state:completed`, artifact `workboard`, advisoryOnly true; `/.well-known/agent.json` lists skill `openspec-workboard`; (d) `openspec:record_attempt` dry-run returns a plan without writing, and an invalid BLOCKED (blockerClass NONE) and an invalid COMPLETED (no validation) are both rejected with the schema's messages. ROUND TRIP PROVEN LIVE later the same day: recorded ONE genuine receipt via `openspec:record_attempt` — `parent-atlas-ace-rlm-bitfrost-integration#3c87c428ed86e031` ("Resolve incomplete source/revision lineage and prove the full current cohort…") as `BLOCKED` / `IDENTITY_SOURCE_REVISION_GATED` with missing precondition `CURRENT_SOURCE_AUTHORITY_PROVEN` (true per the task's own text). Effect on the next `openspec:workboard_recommend`: `receiptsRead` 0→1, `suppressedByReceipts` 0→1, identity-gated actionable count 145→144. The receipt lives in `docs/reports/task-attempt-receipts-v1.jsonl` (1 line). RELEASED-EVENTS WIRED 2026-09-20: `openspec:workboard_recommend` (and the A2A skill via `metadata.released_events`) accept `released_events: string[]` (max 20, each <=200 chars) and pass them to `shouldRetryTask`. Live proof against the recorded receipt: no event -> suppressed 1 / identity-gated 144; unrelated event `SOMETHING_ELSE` -> suppressed 1 / 144; matching `CURRENT_SOURCE_AUTHORITY_PROVEN` -> suppressed 0 / identity-gated 145 (task re-offered). LIMITS: the events are CALLER-ASSERTED — nothing verifies that the gate was actually proven (the blocker audit's `releaseEvent` values are prose, not machine-checkable), so a caller must only pass an event after a real proof receipt exists; there is still no receipt-clearing path (append-only; a newer receipt for the same key replaces the older one for reads). STILL NOT DONE: (1) no real agent has yet recorded a receipt, so the read->record->suppress round trip is proven only piecewise; (2) the handler has not been executed live with a receipts file present (needs the dev server for the `$lib` alias); (3) suppression matching on `stableKey` is verified only against the report shape (601 board tasks have unique ids; `stableKey` present in the raw report rows), not against a live handler call with a receipt file.
- [ ] WORKBOARD-06 Any tool added here inherits the DIM gate above (768-only or tagged derived lane) and the G4/G5 deferral: register auth/Zod with the tool, but the production-hardening pass stays deferred while `DEV_BYPASS_AUTH` is active.

## Explicitly out of scope for this change (see design.md sections 7, 9, 10, 11)

Do not attempt these under this proposal — each needs its own follow-on OpenSpec change once the
phases above produce real evidence to design against:
- Transport-plane separation (gRPC control / Arrow Flight / Arrow mmap / CUDA-IPC)
- Token-cache tier (L1, between BitFrost object cache and llama-server's KV/recurrent cache)
- `ContextSegmentV1` budget-constrained context optimization
- Tabular RandomForest/XGBoost/PyTorch capability-selection classifier
- `HelperDagV1` + Tang-style low-rank helper recommender
- `AgentWorkItemV1` Kanban-as-LangGraph-projection
