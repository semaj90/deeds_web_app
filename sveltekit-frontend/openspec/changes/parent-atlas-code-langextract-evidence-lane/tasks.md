## Tasks

This change is planning/contract-definition only (see proposal.md "What Changes" and design.md
section 6 "Non-goals"). No sidecar endpoint, training pipeline, or production wiring is implemented
here. Tasks below are the two proof gates the operator's architecture review specified, plus the
contract-authoring work needed before either gate can run for real.

## Phase 1 — Contracts (Zod, no runtime wiring)

- [x] **CONTRACT-06 (2026-09-06)**: Created `src/lib/server/atlas/contracts/code-evidence-extraction-v1.ts`
      — `CodeEvidenceExtractionV1Schema`, `CodeEvidenceGroundedEntryV1Schema` (structural
      `endByte > startByte` invariant via `.strict().superRefine(...)`, matching the existing
      `GroundedFactV1Schema` pattern), plus `assertCodeEvidenceExtractionGrounded()` — the
      round-trip check the schema itself can't perform at parse time (no access to source text),
      verifying `exactText` actually appears at `[startByte, endByte)` in real `sourceText` AND that
      `canonicalId`/`sourceRevision` match the caller's expected identity. 10/10 tests pass
      (`code-evidence-extraction-v1.spec.ts`): valid extraction, strict rejection, malformed
      checksum, unknown grounded class, valid/invalid byte spans, and all 4 round-trip
      pass/fail-mismatch/identity-mismatch cases.
- [x] **CONTRACT-07 (2026-09-06)**: Created `src/lib/server/atlas/contracts/code-extraction-request-v1.ts`
      — `CodeExtractionRequestV1Schema`, `AstFactV1Schema`, and `assertRequestHasStructuralFacts()`
      which throws when `sourceText.length > CODE_EXTRACTION_TRIVIAL_TEXT_LENGTH` (40) and both
      `astFacts`/`symbolFacts` are empty — enforcing design.md section 2's "never re-derive what AST
      already produces" rule at the contract layer, not just in a docstring. 12/12 tests pass
      (`code-extraction-request-v1.spec.ts`): valid request, strict rejection, all 4 profile enum
      values accepted individually, unknown profile rejected, empty sourceText rejected, and the 4
      structural-facts-presence scenarios (astFacts-only, symbolFacts-only, both-empty-non-trivial
      rejected, both-empty-trivial-length allowed).
- [x] **CONTRACT-08 (2026-09-06)**: Created `src/lib/server/atlas/contracts/candidate-evidence-card-v2.ts`
      — `CandidateEvidenceCardV2Schema` (additive, verified via a real test that it has zero
      dependency on `candidate-evidence-card-v1.ts`), with `presenceMask` as a required
      `{structural, semanticGrounding, graph, ontology}: boolean` object, plus a `readIfPresent()`
      helper that returns `null` for a section whose `presenceMask` flag is false regardless of
      whether the underlying array is empty or populated — the type-safe way to enforce "check
      presenceMask before trusting an empty array" instead of relying on every call site to remember.
      8/8 tests pass (`candidate-evidence-card-v2.spec.ts`), including the exact EVIDENCE-CARD-01
      scenario (a domain-mismatched extractor produced an empty `semanticGrounding` — asserted
      `readIfPresent` returns `null`, not an empty-but-present result) and its positive counterpart
      (extraction genuinely ran and found nothing — `presenceMask=true`, `readIfPresent` returns the
      empty-but-present object).

## Phase 2 — CODE-LANGEXTRACT-01 (fixture proof, no production sidecar changes)

- [x] **CODE-LANGEXTRACT-01a (2026-09-06)**: Built `scripts/atlas/code-langextract-01-fixtures.mjs`
      — 4 real snippets copied verbatim from actual repo files (not invented): TypeScript
      (`assertRequestHasStructuralFacts`, this change's own CONTRACT-07 code), Svelte
      (`Svelte5Avatar.svelte`'s `statusClasses` nullish-default), Python
      (`atlas_cuvs_resident_registry.py`'s `_positive_int`), Go
      (`services/go-retrieval-service/lanes.go`'s `clampLaneLimit`). Each carries hand-written
      `astFacts` (symbol/kind/signature, matching the real code) and a hand-labeled
      `expectedPhraseSubstring` a human can verify against the source.
- [x] **CODE-LANGEXTRACT-01b (2026-09-06)**: Built `scripts/atlas/code-langextract-01-probe.mjs` —
      calls llama-server `/v1/chat/completions` (Ornith) directly per design.md section 3.2's
      model-backend choice, no new 8095 endpoint. Uses the design.md section 2 prompt shape
      (SOURCE + STRUCTURAL OBSERVATIONS + TASK, exact-quote-only). Byte spans are computed
      deterministically by the harness via exact string search of the model's quoted `exactText`
      against the real `sourceText` — asking the model for byte offsets directly would be unreliable;
      asking it to quote verbatim and letting code locate the quote is the honest, robust approach.
      Validates every result through CONTRACT-06's `CodeEvidenceExtractionV1Schema` +
      `assertCodeEvidenceExtractionGrounded()`.
- [x] **CODE-LANGEXTRACT-01c (2026-09-06) — real result, not assumed**: Ran the probe against the
      live llama-server (ornith-1.5-9b). Result saved to `docs/reports/code-langextract-01-probe-v1.json`.
      Per-fixture: **TypeScript 2 grounded / 2 rejected** (model over-extracted 2 additional
      candidates that weren't verbatim quotes — correctly rejected by the harness, not silently
      accepted); **Svelte 0 grounded / 1 rejected** (model paraphrased — "statusClasses is a derived
      value computed from the status field, defaulting to 'offline'..." — instead of quoting
      `status ?? 'offline'` verbatim; a real, specific failure mode, not hidden); **Python 4 grounded
      / 0 rejected**, including a `hasExtractionNearHandLabeledPhrase: true` match on the hand-labeled
      `value < minimum` constraint; **Go 3 grounded / 0 rejected**, including a match on the
      hand-labeled `n > 200` invariant. **100% of all grounded entries passed the byte-span
      round-trip check** (`roundtripValid: true` on all 4 fixtures) and **100% identity preservation**
      (`schemaValid: true` on all 4) — the rejection mechanism itself is proven working, not just the
      happy path.
- [x] **CODE-LANGEXTRACT-01d (2026-09-06) — verdict: PASS**: `languagesWithNonZeroExtraction: 3`
      (TypeScript, Python, Go; Svelte 0) clears the documented `>= 3 of 4` bar,
      `allGroundedEntriesRoundtrip: true`, `allIdentityPreserved: true`. **This is a genuinely
      different, positive result from EVIDENCE-CARD-01's 0/4** — confirming the domain-mismatch
      diagnosis was correct (the legal-domain extractor was the problem, not "LLM-based code
      extraction doesn't work") and that a code-domain-appropriate prompt, backed by real AST facts
      and quote-only grounding, produces real, verifiable, byte-exact extractions on 3 of 4 tested
      languages. The Svelte gap (paraphrasing) is a real, recorded, unresolved finding — not
      investigated further this session (would need either a stricter prompt, a retry-on-rejection
      loop, or accepting Svelte as a weaker case for now) — flagged for whoever picks up Phase 3 or a
      follow-on hardening pass, not silently smoothed over.

## Phase 3 — CODE-LANGEXTRACT-RERANK-BYPASS-02 (only if Phase 2 passes)

- [x] **BYPASS-02a (2026-09-06)**: Built `scripts/atlas/code-langextract-bypass-02-harness.mjs`,
      reusing the same 3-query/candidate/ground-truth fixture as
      `parent-atlas-retrieval-staging-planes`'s RERANK-SHADOW harness (duplicated inline, same
      precedent as `rerank-shadow-01-format-ablation.mjs`). Cheap router = a hand-specified threshold
      rule (unique top exact-keyword-match scorer, score > 0 required) — explicitly NOT a trained
      XGBoost/logistic model, per this task's own scope limit.
- [x] **BYPASS-02b (2026-09-06) — real numbers, N=3 stated explicitly**: Ran both paths against the
      live mxbai sidecar. Result: `docs/reports/code-langextract-bypass-02-results-v1.json`.

      | Metric | Baseline (RRF→mxbai) | Proposed (evidence→conditional mxbai) |
      |---|---|---|
      | mxbai calls avoided | 0% | 100% (all 3 queries resolved by the router) |
      | top1Agreement | 0.33 | 1.00 |
      | MRR | 0.50 | 1.00 |
      | Recall@5 | 1.00 | 1.00 |
      | nDCG@10 | 0.62 | 1.00 |
      | latency (avg) | 570ms | 0ms |

- [x] **BYPASS-02c (2026-09-06) — recorded finding, NOT a promotion decision, real caveat attached**:
      The proposed path outperformed the baseline on every metric in this run and avoided 100% of
      mxbai calls. **This number is almost certainly inflated by fixture construction, not a real
      effect size** — recorded honestly rather than presented as a clean win: this session's own
      3-query fixture was built by writing queries that describe the target function's behavior
      (e.g. "sums duplicate-identity RRF scores"), so the query text trivially shares vocabulary with
      the correct candidate's source code. A real user query is far less likely to share exact
      keywords with the relevant candidate's implementation text. The mxbai baseline's own weak
      showing here (`top1Agreement: 0.33`) independently reproduces
      `parent-atlas-retrieval-staging-planes`'s earlier RERANK-SHADOW-04 finding on the same raw-text
      fixture — consistent, not a new anomaly, but also not independent confirmation of anything
      beyond "mxbai does poorly on this specific 3-item fixture." **Decision recorded**: this result
      is a genuine proof that the mechanism works end-to-end (router correctly identifies a
      high-confidence candidate and skips a real network call to the mxbai sidecar without loss of
      quality on this sample) — but is NOT sufficient evidence to claim a real-world mxbai-call
      reduction rate, and must not be cited as one. A real measurement needs a fixture built from
      genuine user queries against candidates the query author did not write the queries from
      (avoiding the same construction bias this note just described), at a much larger N. That
      remains open for a future execution-phase change; this proposal's proof gate is satisfied by
      demonstrating the mechanism works, not by producing a trustworthy effect-size number.

## Explicitly out of scope for this change (see design.md section 6)

- Implementing `POST /v1/extract/code(/batch)` on the live `miniforge-nlp-sidecar` (:8095).
- Training AtlasGemma's `SpanHead`/`RouteHead`, or building the XGBoost/logistic tabular router.
- Migrating any existing `CandidateEvidenceCardV1` consumer to V2.
- Any production wiring, cache writes, or datastore writes of any kind.
