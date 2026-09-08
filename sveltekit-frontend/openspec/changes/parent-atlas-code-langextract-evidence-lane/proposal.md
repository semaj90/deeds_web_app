## Why

`parent-atlas-retrieval-staging-planes` (closed 13/13, 2026-09-06) ran a real, empirically-verified
experiment (`scripts/atlas/evidence-card-01-native-extract-probe.mjs`,
`docs/reports/evidence-card-01-native-extract-probe-v1.json`) and found a genuine capability gap: the
only wired "batch LangExtract" path (`langextractFetch()` → native-TS `extractDocumentNative`) is a
**legal-domain regex extractor** (citations, statutes, case names, courts, monetary, dates, persons,
organizations). On 4 real TypeScript code candidates it extracted **zero entities**.
`CandidateEvidenceCardV1`'s code-oriented `extracted` fields (`symbols`/`apis`/`tests`/`constraints`)
have no extractor that can populate them for code corpora. That change correctly recorded this as a
known-blocked gap and stopped there rather than forcing a fix inside an exploratory task.

An operator-authored architecture review (2026-09-06, same day) proposes closing exactly this gap —
not by extending the legal extractor, but by building a **separate, code-domain grounded-extraction
lane** that runs *before* the cross-encoder (mxbai), so mxbai becomes a conditional escalation oracle
for ambiguous cases rather than the mandatory first semantic judge for every candidate. The review's
central architectural correction: the staging-planes change's own diagram implicitly ordered
`RRF → mxbai → CandidateScoreFabric → graph/ontology/LangExtract`, which makes mxbai unavoidable on
every candidate. The corrected order runs cheap, deterministic, structurally-grounded feature
extraction (AST/ast-grep + a new code-domain LangExtract profile + ontology/graph signals) first,
feeds a cheap tabular router (XGBoost/logistic/ACE) that can resolve most candidates without any
neural pairwise call, and only escalates the genuinely ambiguous remainder through AtlasGemma
(late-interaction / cross-rank heads) and, as a last resort, mxbai.

This proposal is a planning/contract-definition change only, matching the discipline established by
`parent-atlas-retrieval-staging-planes`: it records the reviewed architecture, defines the specific
new contracts (`CodeEvidenceExtractionV1`, `CandidateEvidenceCardV2`, `CodeExtractionRequestV1`) and
two concrete proof gates (`CODE-LANGEXTRACT-01`, `CODE-LANGEXTRACT-RERANK-BYPASS-02`), and explicitly
does **not** implement the 8095 sidecar endpoint, retrain AtlasGemma, or modify any running service in
this change. Those are follow-on execution work once this proposal's contracts are agreed.

## What Changes

- Define `CodeEvidenceExtractionV1` — a code-domain grounded-extraction output contract, byte-span
  grounded, distinct from the existing legal-domain `LangExtractOutput`/`LegalEntity` types.
- Define `CodeExtractionRequestV1` — the request contract for a new `POST /v1/extract/code` (and
  `/v1/extract/code/batch`) endpoint on the existing `miniforge-nlp-sidecar` (:8095), carrying
  candidate text, language, pre-computed AST/symbol facts (from Tree-sitter/ast-grep — never
  re-derived by the LLM), optional ontology hints, and an extraction profile enum.
- Define `CandidateEvidenceCardV2` as the explicit successor to `CandidateEvidenceCardV1` (Phase 1 of
  `parent-atlas-retrieval-staging-planes`), adding `structural`, `semanticGrounding`, `graph`,
  `ontology`, and a `presenceMask` so downstream consumers can tell "not extracted" from
  "extracted, empty" without guessing.
- Record the corrected staging-plane pipeline order (RRF → parallel structural/code-extraction/
  ontology → merge into `CandidateEvidenceCardV2` → cheap tabular router → conditional AtlasGemma →
  conditional mxbai → ACE) as the target architecture, explicitly superseding the prior
  `RRF → mxbai → evidence` ordering recorded (but not gated) in the staging-planes design doc.
- Specify two proof gates: `CODE-LANGEXTRACT-01` (does the new extraction profile actually produce
  non-empty, source-grounded output on real code fixtures across 4 languages) and
  `CODE-LANGEXTRACT-RERANK-BYPASS-02` (does conditioning mxbai calls on evidence-feature ambiguity
  measurably reduce mxbai call volume without hurting Recall@5/MRR@10/nDCG@10).
- Explicitly out of scope for this proposal: implementing the 8095 endpoint, training AtlasGemma's
  `SpanHead`/`RouteHead`, building the XGBoost/logistic tabular router, and any production wiring.
  Those become their own execution-phase OpenSpec change(s) once these contracts are settled and
  `CODE-LANGEXTRACT-01`'s fixtures prove the extraction profile actually works.
