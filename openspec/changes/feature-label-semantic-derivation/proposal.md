# Feature Label Semantic Derivation

**Status**: PROPOSED. Not started. No code changed by this proposal — it is the plan only.

## Problem (verified against the live report, not assumed)

`docs/reports/summary-index-ranker.json` currently sets `feature_label` to a bare basename in
many rows — e.g. `"feature_label": "+page.svelte"` for BOTH:

- `src/routes/(app)/demos/case-scoring/+page.svelte` — summary: *"renders a Case Scoring
  Dashboard... AI-driven risk assessment... priority filtering... risk-level visualization"*
- the Theory/Evidence Board page — summary describes a detective-style evidence board

Both collapse to `feature_id: "sveltekit-frontend.+page"` / `feature_label: "+page.svelte"`.
The summaries already contain enough signal to tell these apart; the label derivation just
throws that signal away. Same failure mode confirmed for:

- `sveltekit-frontend/src/lib/server/cache/cache-events.ts` → `feature_label: "cache-events.ts"`
  (summary describes cache invalidation/storage event handling)
- the model-promotion admin endpoint → labeled only `server.ts`
- the Ollama endpoint resolver → labeled only `ollama-endpoint.ts`

## The three-concept model

| Field | Meaning | Example | Stability |
|---|---|---|---|
| `title_id` | Stable canonical identity (existing, correct, do not touch) | `title.sveltekit.frontend.page.74bfb5ad` | Immutable — joins/lineage/revisions key off this |
| `feature_id` | Stable machine-readable functionality slug | `sveltekit-frontend.case-scoring-dashboard` | Should represent the *implemented feature*, not the route filename |
| `feature_label` | Human-readable functionality description | `Case Scoring Dashboard` | Derived from summary, constrained by title_id + path — never copied from filename |
| `source_basename` (new field) | Physical filename | `+page.svelte` | Was being misused as `feature_label`; needs its own field |

`feature_label` must be a **concise functional noun phrase**, not a concatenation of summary +
title_id. Bad: `"Case Scoring Dashboard. This component renders (title.sveltekit.frontend.page.74bfb5ad)"`.
Good: `"Case Scoring Dashboard"` — with the derivation inputs (`feature_label_source`,
`title_id`, `canonical_source_ref`, `feature_label_version`) retained as **separate** fields for
audit, not baked into the display string.

## Derivation priority (deterministic before LLM)

1. Explicit OpenSpec feature title (if this source_ref is already mapped to an OpenSpec feature)
2. Route or exported component identity
3. `title_id` semantic tokens
4. Summary noun phrase (regex-extracted, e.g. after "renders/provides/defines/implements a/an/the")
5. Canonical path tokens (strip `src/routes/lib/components/server/api` scaffolding segments)
6. Basename fallback (today's only strategy — becomes the last resort, not the default)

No LLM call is required for the common case — the regex-based `extractFunctionalNounPhrase` +
`deriveLabelFromPath` + `deriveLabelFromTitleId` chain in `tasks.md` Phase 2 covers most rows.

## Non-mutation guarantee (hard rule for this change)

The audit pass (`summary-index-ranker.mjs`) computes and **reports** `feature_label_derived`,
`feature_label_status`, `feature_label_source`, `feature_label_confidence` — it must NOT
overwrite `feature_label`/`feature_id` in the same pass. A separate, later apply/reconciliation
script (out of scope for this proposal — tracked as Phase 5 in `tasks.md`) applies accepted
derivations after collision validation against OpenSpec feature mappings.

Suggested `feature_label_status` vocabulary: `CANONICAL` · `DERIVED_HIGH_CONFIDENCE` ·
`DERIVED_PATH_FALLBACK` · `GENERIC_REPLACEMENT_RECOMMENDED` · `AMBIGUOUS` · `MANUAL_REVIEW`.

## OpenSpec relationship

An OpenSpec feature is a functional grouping, not a file:

```
feature_id: "feature.model-weight-promotion"
feature_label: "Model Weight Promotion"
  titles: [title.sveltekit.frontend.server.02bb3847]
  source_files: [src/routes/api/admin/model/promote-weights/+server.ts]
  functionality: [validate promotion request, authorize administrator,
                   promote candidate weight version, mark version as live]
```

i.e. `feature_id`/`feature_label` (one) : `title_id` (one or more) : source files (one or more).
`graphify-report-to-openspec-draft.mjs` (already live, Step 11 of the phase8 fanout) should use
the *derived* label for OpenSpec draft titles once available, while continuing to carry
`title_id`/`packet_key` for lineage — never the raw basename.

## Separate, already-flagged concern (not this proposal's scope)

The previous session's change to `graphify:daily:dry` (making it run `graphify:materialize:apply`
+ phase8 steps 1–3 for real) made that script name misleading — `:dry` now performs canonical
writes. That naming/safety fix is tracked separately; do not conflate it with this proposal.
See `tasks.md` Phase 0 for the one-line follow-up if/when it's picked up.

## Files this proposal will touch (Phase 2+, not yet edited)

- `scripts/atlas/summary-index-ranker.mjs` — add derivation + report fields, no mutation
- `docs/reports/summary-index-ranker.json` — gains `feature_label_derived` et al. on next run
- `scripts/atlas/build-summary-envelopes-from-tuples.mjs` (`atlas:summary:envelopes:build:apply`,
  step 3 of the fanout) — carry the derived fields through into the envelope, still not applied
  to canonical `feature_label`
- `scripts/atlas/graphify-report-to-openspec-draft.mjs` — prefer `feature_label_derived` over
  raw filename when drafting OpenSpec titles, once Phase 2 lands
