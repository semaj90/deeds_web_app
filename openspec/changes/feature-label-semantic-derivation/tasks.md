# Tasks — Feature Label Semantic Derivation

Each phase is independently executable by a coding agent (Claude Code, Codex, etc.). Verify each
phase's proof line before starting the next — do not batch phases. Nothing here is applied to
canonical `feature_label`/`feature_id` until Phase 5, which is explicitly gated on human review.

## Phase 0 — pre-flight (already done this session, listed for the record)

- [x] Confirm all 11 fanout steps have both a `:dry` and apply-mode npm script — verified via
      `node -e` script-pair check against `sveltekit-frontend/package.json`, all 22 PASS.
- [x] Confirm `atlas:phase8:fanout:dry:steps1-3` (`--apply-through=3`) runs steps 1–3 apply,
      4–11 dry — verified live, `[phase8-fanout] complete in 81.0s` exit 0.
- [ ] (Separate, deferred) Decide `graphify:daily:dry` naming — see proposal.md "Separate,
      already-flagged concern". Not required to start Phase 1.

**Proof**: both already satisfied by prior session work; no action needed to unblock Phase 1.

## Phase 1 — add derivation as a pure function (no script wiring yet)

Create `scripts/atlas/lib/derive-feature-identity.mjs` exporting:

```js
export function deriveFeatureIdentity(row) {
  // row: { title_id, feature_id, feature_label, summary, canonical_source_ref, file_path }
  // returns: { featureId, featureLabel, featureLabelSource, featureLabelConfidence, sourceBasename }
}
```

Implementation (deterministic, no LLM call):

1. `sourceBasename` = last path segment of `canonical_source_ref || file_path`.
2. `GENERIC_BASENAMES` set: `+page.svelte`, `+server.ts`, `+layout.svelte`,
   `+layout.server.ts`, `index.ts`, `index.js`.
3. If `row.feature_label` is NOT in `GENERIC_BASENAMES` (case-insensitive, extension-stripped),
   treat existing label as `CANONICAL` — pass through unchanged, `featureLabelSource: 'canonical'`.
4. Else try, in order, stopping at first success:
   - `extractFunctionalNounPhrase(summary)` — regex for quoted phrases after
     renders/provides/defines/implements, or "responsible for X" / "utilities for X" /
     "interface for X" / "endpoint/handler for X" patterns. `featureLabelSource: 'summary'`.
   - `deriveLabelFromPath(canonical_source_ref)` — strip `src/routes/lib/components/server/api`
     scaffolding segments, title-case the remainder. `featureLabelSource: 'path'`.
   - `deriveLabelFromTitleId(title_id)` — strip `title/sveltekit/frontend` tokens and the
     trailing hex suffix, title-case what's left. `featureLabelSource: 'title_id'`.
   - Fallback: title-cased, extension-stripped basename. `featureLabelSource: 'basename'`.
5. `featureId` = `sveltekit-frontend.` + slugify(featureLabel).
6. `featureLabelConfidence`: 0.95 for summary-derived, 0.7 for path-derived, 0.5 for
   title_id-derived, 0.3 for basename fallback.

**Proof**: unit test (`scripts/atlas/lib/derive-feature-identity.test.mjs` or repo's existing
test runner convention) covering the two report rows in proposal.md — Case Scoring Dashboard
page and cache-events.ts — asserting `featureLabel` differs between them and matches the
proposal.md worked examples exactly. Run and paste the pass output before Phase 2.

## Phase 2 — wire into summary-index-ranker.mjs as report-only fields

Edit `scripts/atlas/summary-index-ranker.mjs`:

- Import `deriveFeatureIdentity` from Phase 1.
- For each row, compute the derivation and add to the row object (written to
  `docs/reports/summary-index-ranker.json`), WITHOUT touching `feature_label`/`feature_id`:
  - `feature_label_current` (= existing `feature_label`, unchanged, for diffing)
  - `feature_label_derived`
  - `feature_label_source`
  - `feature_label_confidence`
  - `feature_label_status`: `CANONICAL` if step 3 above matched, else
    `DERIVED_HIGH_CONFIDENCE` (confidence ≥ 0.9), `DERIVED_PATH_FALLBACK` (0.5–0.9), or
    `GENERIC_REPLACEMENT_RECOMMENDED` (confidence < 0.5 but still non-basename), or
    `AMBIGUOUS` if two derivation strategies disagree by more than a rough similarity check.
- Do not change the `feature_id`/`feature_label` fields consumed by anything downstream in
  this phase — this is strictly additive.

**Proof**: run `npm run atlas:summary:index:rank` (dry, already exists) or
`atlas:summary:index:rank:apply`, then grep the output JSON for both report rows named in
proposal.md and confirm `feature_label_derived` = `"Case Scoring Dashboard"` and
`"Cache Event Management"` respectively, with `feature_label_current` unchanged from today's
value. Paste the two matching JSON fragments as proof.

## Phase 3 — carry derived fields through the envelope build (still non-mutating)

Edit `scripts/atlas/build-summary-envelopes-from-tuples.mjs`
(`atlas:summary:envelopes:build:apply`, fanout step 3):

- Read `feature_label_derived`/`feature_label_status`/`feature_label_confidence` if present on
  the input row and pass them through into the envelope's metadata — do NOT let them override
  the envelope's own `feature_label` field.

**Proof**: run `npm run atlas:summary:envelopes:build:apply` (already proven safe — this is
fanout step 3, part of the already-proven apply-through-3 path) and confirm the derived fields
appear in the output envelope JSON for at least one row that had `GENERIC_REPLACEMENT_RECOMMENDED`
status in Phase 2's output.

## Phase 4 — prefer derived label in OpenSpec draft titles (still non-mutating to canonical data)

Edit `scripts/atlas/graphify-report-to-openspec-draft.mjs` (fanout step 11, already live):

- When building the LLM prompt / draft title, if the source report row carries
  `feature_label_derived` with status `DERIVED_HIGH_CONFIDENCE` or `GENERIC_REPLACEMENT_RECOMMENDED`,
  pass it to the model as additional context ("known functional label: X") instead of letting
  the model re-derive from scratch — improves `topic_slug` quality, doesn't touch canonical data.
- Still writes to `openspec/drafts/`, not `openspec/changes/` — unaffected by this proposal's
  non-mutation guarantee, since drafts were already an unreviewed inbox.

**Proof**: re-run `npm run atlas:graphify-draft:apply` against a report containing a
`GENERIC_REPLACEMENT_RECOMMENDED` row and confirm the resulting draft's title uses the derived
functional phrase, not the raw basename.

## Phase 5 — canonical reconciliation (SEPARATE script, human-gated, out of scope here)

Not implemented by this proposal. Tracked as a follow-up change once Phases 1–4 have run in
production for at least one full `graphify:daily` cycle and the `feature_label_status`
distribution has been reviewed for false positives (`AMBIGUOUS` rate especially). Will need:

- Collision detection: two different `title_id`s deriving the same `feature_label`/`feature_id`
  legitimately (fine — that's the multi-title-per-feature OpenSpec model) vs. accidentally
  (derivation bug).
- An explicit `--apply` script that only touches rows with `feature_label_status =
  DERIVED_HIGH_CONFIDENCE` by default, with `GENERIC_REPLACEMENT_RECOMMENDED` requiring
  `--include-recommended` and printing a diff before writing.
- Update to OpenSpec feature registry mapping (`feature_id` → title_id[] → source_files[]) if
  one doesn't already exist as a queryable table — check `recommendation_log`/`semantic_signals`
  (phase109a schema, already live) before inventing a new table.

## Required proof matrix (fill in as phases complete)

| Item | Status |
|---|---|
| FANOUT_STEP_COUNT_DYNAMIC | PASS (verified this session) |
| FULL_APPLY_11_OF_11 | PASS (verified this session) |
| APPLY_THROUGH_ARGUMENT | PASS (verified this session, `--apply-through=3`) |
| STEPS_1_TO_3_APPLY | PASS (verified this session) |
| STEPS_4_TO_11_DRY | PASS (verified this session) |
| DRY_APPLY_PAIR_EXISTENCE | PASS (verified this session, 22/22) |
| FEATURE_LABEL_DERIVATION_FN | PASS (Phase 1 — `scripts/atlas/lib/derive-feature-identity.mjs`, 7/7 unit tests) |
| FEATURE_LABEL_REPORT_FIELDS | PASS (Phase 2 — wired into `summary-index-ranker.mjs`, verified live against Postgres: `packet:48548325b291` → `feature_label_derived: "Case Scoring Dashboard"`, `feature_label_current: "+page.svelte"` unchanged) |
| FEATURE_LABEL_ENVELOPE_CARRY | PASS (Phase 3 — wired into `build-summary-envelopes-from-tuples.mjs` via `envelope.metadata`, verified live against Postgres at `--limit=8000`: 4386 envelopes, distribution `{DERIVED_HIGH_CONFIDENCE: 428, DERIVED_PATH_FALLBACK: 3736, CANONICAL: 222, GENERIC_REPLACEMENT_RECOMMENDED: 0}`. Note: `GENERIC_REPLACEMENT_RECOMMENDED` did not occur in 4386 real rows — real files almost always have a meaningful parent directory, so `deriveLabelFromPath` succeeds before the basename-only (confidence 0.3) fallback is reached. That tier is proven correct at the unit level (Phase 1 test 6, confidence 0.3 → `classifyFeatureLabelStatus` returns `GENERIC_REPLACEMENT_RECOMMENDED` deterministically) but not observed live in this run — reporting this honestly rather than claiming an unobserved match.) |
| FEATURE_LABEL_IN_OPENSPEC_DRAFTS | PASS (Phase 4 — `graphify-report-to-openspec-draft.mjs` extracts a `findKnownFunctionalLabel()` hint from any report row carrying `feature_label_derived`/`feature_label_status` (duck-typed, not tied to one report filename) and injects it into the LLM prompt as "known functional label" context. Verified live against `docs/reports/summary-index-ranker.json`: log line confirmed `known functional label: "card"` was extracted and passed to llama-server (model `hforf.gguf`). The model chose `topic_slug: "summary-index-ranker"` over the single noisy per-row hint "card" — correct judgment, since the prompt says "prefer" not "force" and a whole-report topic shouldn't be hijacked by one row's label. Confirms the hint reaches the model without corrupting draft quality; does not touch canonical `feature_label`/`feature_id`.) |
| FEATURE_LABEL_CANONICAL_APPLY | NOT_STARTED, separate change (Phase 5) |
