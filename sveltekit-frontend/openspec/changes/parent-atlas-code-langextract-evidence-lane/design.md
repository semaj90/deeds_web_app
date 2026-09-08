## Context

This design is the direct follow-on to `parent-atlas-retrieval-staging-planes`'s EVIDENCE-CARD-01/02
finding (2026-09-06): the repo's only wired LangExtract path is legal-domain-only and produces zero
output on code candidates. It captures an operator-authored architecture review (2026-09-06) that
proposes a code-domain grounded-extraction lane as a way to make the cross-encoder (mxbai) a
conditional escalation path instead of a mandatory per-candidate call.

## 1. The ordering correction

The staging-planes design doc's diagram (informal, never gated) implicitly ran:

```
RRF → mxbai → CandidateScoreFabric → graph/ontology/LangExtract
```

This makes mxbai unavoidable on every candidate, because nothing cheaper runs before it. The
corrected pipeline:

```
                         RRF
                          |
                  20-32 candidates
                          |
              +-----------+------------+
              v           v            v
           AST/CST     CodeExtract    ontology
         Tree-sitter   LangExtract    tuples
          ast-grep         |         HyperGraphRAG
              |            |            |
              +-----------+------------+
                          v
                CandidateEvidenceCardV2
                          |
                          v
                 CandidateFeatureMatrix
                          |
               cheap utility/routing
                XGB / Logistic / ACE
                          |
                    ambiguous?
                   /            \
                 no              yes
                 |                |
                 |           AtlasGemma
                 |         late/cross-rank
                 |                |
                 |         still ambiguous?
                 |            /        \
                 |          no          yes
                 |          |            |
                 |          |          mxbai
                 +----------+------------+
                            |
                            v
                          ACE
```

Structural facts (AST/ast-grep), code-domain semantic extraction, and ontology/graph signals run in
parallel on the same bounded candidate set (post-RRF, 20-32 candidates — same bound
`CANDIDATE_EVIDENCE_EXTRACTION_MAX_BATCH=30` already enforces). They merge into one card. A cheap
tabular router resolves most candidates without any neural pairwise call. AtlasGemma (once its
`SpanHead`/`RouteHead` exist, per `parent-atlas-retrieval-staging-planes` design.md section 14's
already-recorded, not-yet-built `AtlasGemmaRankV1` proposal) is the first escalation tier; mxbai is
the last-resort tier for genuine disagreement.

**Why this isn't just "add a cache in front of mxbai"**: the cheap router isn't approximating mxbai's
answer — it's answering a categorically different, cheaper question first ("does this candidate
contain a code-exact-symbol-match / a stated constraint / a passing test reference for this query"),
and only falls through to expensive pairwise judgment when that structural/evidentiary signal is
itself ambiguous. This mirrors this repo's own established GPU-primitive-ownership discipline (root
CLAUDE.md's "One Canonical Runtime Owner Per Capability" + LEVEL 1/2/3 escalation ladder for GPU
primitives) applied to inference cost instead of GPU kernels.

## 2. What CodeLangExtractV1 should extract — and what it must NOT re-derive

Don't ask an LLM-backed extractor to do what a deterministic parser already does reliably. Structural
facts (symbol names, declarations, signatures, imports, calls, exports, byte spans) come from
Tree-sitter/ast-grep — this repo already has real, wired structural-fact producers
(`graphify-structural-intelligence-adapter.ts`, `packages/parent-atlas/src/core/ast-grep-observation-adapter.ts`'s
`AstGrepObservationV1`, per root CLAUDE.md's Aug 30 "audit packages/* before moving anything" note).
LangExtract's job is the semantic layer AST cannot label:

| Source | Fields |
|---|---|
| Tree-sitter / ast-grep (existing, reused) | symbol, declaration, signature, imports, calls, exports, byte spans |
| **New**: LangExtract code profile | purpose, constraint, invariant, failure mode, API relationship, test implication, requirement |
| existing NLP (miniforge sidecar) | domain/entity classification |
| ontology (HyperGraphRAG) | concept/relation/support evidence |
| execution history | prior success/failure, tests, patch utility |

The request to the extractor is built from bounded candidate text **plus** the already-computed
structural observations (never re-derived):

```
SOURCE
<bounded candidate text>

STRUCTURAL OBSERVATIONS  (from AST/ast-grep, not re-discovered)
symbol: combineViaRRF
kind: function
calls: normalizeCanonicalIdentity, resolveCanonicalCandidateId
imports: ...

TASK
Extract only:
- invariants
- ownership constraints
- failure conditions
- API relationships
- test obligations
- requirements

Every extraction must quote exact source text.
```

`AST = syntax oracle; LangExtract = grounded semantic oracle.` This is the same two-tier pattern this
repo already uses elsewhere: a model/regex/NLP classifier proposes structural facts, ast-grep/
Tree-sitter/Graphify evidence is the decision-maker (root CLAUDE.md's Wire Format Layering Rule,
"companion rule" note).

## 3. Contracts

### 3.1 `CodeEvidenceExtractionV1` (output)

```
identity:
  canonicalId
  packetKey
  symbolVersionId
  workspaceRevision
  sourceRevision

grounded[]:
  class: SYMBOL | API | CONSTRAINT | INVARIANT | FAILURE_MODE | TEST | REQUIREMENT | DATA_FLOW | OWNERSHIP
  exactText
  startByte
  endByte
  confidence
  attributes

structuralRefs[]
ontologyRefs[]
checksum
```

Invariant (non-negotiable, matches `GroundedFactV1`'s existing `spanEnd > spanStart` enforcement in
`candidate-evidence-card-v1.ts`): every `grounded[]` entry MUST resolve to exact source bytes
(`startByte`/`endByte` into the bounded candidate text, not the whole file) AND to the same canonical
candidate/revision the request was made against. An extraction that can't cite exact bytes is
rejected, not defaulted to a synthetic span.

### 3.2 `CodeExtractionRequestV1` (input, new 8095 endpoints)

```
candidateId
sourceRevision
language
sourceText

astFacts        # from Tree-sitter/ast-grep — required, not optional
symbolFacts
ontologyHints?  # optional

profile: RERANK_EVIDENCE | ERROR_FIXING | API_ANALYSIS | TEST_ANALYSIS
```

New endpoints on the **existing** `miniforge-nlp-sidecar` (:8095) — NOT a new service, NOT the
native-TS legal extractor, per `DEPENDENCY-CAPABILITY-GUARD-01` (reuse the existing sidecar process
rather than spin up a second one):

- `POST /v1/extract/code`
- `POST /v1/extract/code/batch`

Model backend for the extraction call itself can be Ornith/Gemma via the existing local
OpenAI-compatible `/v1/chat/completions` boundary (llama-server :8090) — this reuses the same
inference target `langextractBatch.ts`'s fallback path already calls
(`resolveLlamaInferenceTarget`), not a new model dependency.

### 3.3 `CandidateEvidenceCardV2` (successor to Phase 1's `CandidateEvidenceCardV1`)

```
identity:
  canonicalId
  candidateOrdinal
  sourceRevision
  featureRevision

structural:
  symbols[]
  APIs[]
  calls[]
  imports[]
  tests[]

semanticGrounding:
  constraints[]
  invariants[]
  requirements[]
  failureModes[]
  ownershipClaims[]

graph:
  pageRank
  personalizedPageRank
  graphDistance

ontology:
  relationTypes[]
  conceptIds[]
  supportCount

rank:
  semanticCosine
  rrf
  atlasGemma?
  mxbaiRaw?
  mxbaiNormalized?

presenceMask
evidenceRefs[]
```

`presenceMask` is new relative to V1 and exists specifically so a downstream consumer (the tabular
router, ACE) can distinguish "this field was never populated because extraction wasn't run" from
"extraction ran and legitimately found nothing" — the exact ambiguity the EVIDENCE-CARD-01 probe
result (0 entities on all 4 candidates) would otherwise leave unresolved for any future caller that
doesn't already know the extractor is domain-mismatched.

`CandidateEvidenceCardV1` (Phase 1, `candidate-evidence-card-v1.ts`) is not deleted or replaced in
place — V2 is additive. Migration of existing V1 consumers is out of scope for this proposal.

## 4. Why this reduces mxbai calls specifically

Today mxbai answers one question for every candidate: "given this query and this candidate text, are
they relevant?" Many Parent Atlas retrieval questions can be answered far more cheaply from
structural/evidentiary signals already available post-RRF:

```
exact symbol match     = 1
API relationship       = IMPLEMENTS
constraint extracted   = "single semantic lane"
test reference found   = 1
graph hops             = 1
ontology relation      = CONSTRAINED_BY
revision match         = 1
```

A cheap router (XGBoost/logistic regression/ACE heuristic) over this feature vector can often
classify a candidate as clearly useful or clearly irrelevant without any neural pairwise call. Only
the ambiguous middle cohort needs AtlasGemma, and only the cohort AtlasGemma itself can't resolve
needs mxbai. Illustrative funnel (not a measured result — this is the shape
`CODE-LANGEXTRACT-RERANK-BYPASS-02` is designed to actually measure):

```
100 candidates -> retrieval
 24 -> RRF
 12 -> after structural/evidence features
  6 -> ambiguous -> AtlasGemma late interaction
2-4 -> still ambiguous -> AtlasGemma cross-rank
0-2 -> disagreement cases -> mxbai
```

This is explicitly not "LangExtract replaces mxbai as a reranker" — LangExtract output is grounded
evidence, not a relevance scalar (the same stage-ownership boundary
`parent-atlas-retrieval-staging-planes`'s `ace-candidate-evidence-card` spec already enforces for
V1: "Stage ownership is explicit and non-overlapping"). It reduces *how often* the relevance-scalar
stage needs to run at all.

## 5. AtlasGemma's role (cross-reference, not new scope — CORRECTED 2026-09-06, same day)

**Correction**: this section originally described `AtlasGemmaRankV1` as future/out-of-scope design
material with no active work. That was stale within hours of being written. A concurrent session is
already executing exactly this transplant, tracked in the ALREADY-EXISTING
`openspec/changes/parent-atlas-best-fit-score-fabric/tasks.md` sections 7-9 (root tree, not this
tree) — real, verified, checksum-bound progress: `AGMR-01` through `AGMR-05` and `AGMR-03A` are done
(standalone-shape derivation, 46-inherited-tensor alignment, in-memory load/init proof, and a
synthetic forward-pass smoke producing finite `[1,5,256]` hidden states + a finite `[1,1]` scalar
score — all against the real `google-gemma4-e4b-assistant` checkpoint, SHA-256
`12875062fc25c51e8fa9b62abd2de7ad48b7d63f8559d5d604fbd5a3d6bcff16`). `MICRO-01` through `MICRO-05`
and an FT-01..06 fine-tuning/quantization boundary are open but well-specified there. **Do not track
AtlasGemma build status in this file going forward — that file is the single owner.** This section
now stays only as a pointer plus the two heads specific to this change's own scope (LangExtract
distillation), which that file's own section 9 (added 2026-09-06, same review) now cross-references
back to this file, closing the loop in both directions:

```
AtlasGemma
  |-- LateInteractionHead   (existing proposal: distilled from mxbai)
  |-- CrossRankHead         (existing proposal: distilled from mxbai)
  |-- SpanHead              (NEW: distilled from CodeLangExtract grounded extractions)
  \-- RouteHead             (NEW: distilled from execution-receipt utility signal)
```

Runtime avoidance loops become two independent, not one:

```
SpanHead confident   -> no LangExtract call
SpanHead uncertain   -> call 8095 LangExtract

RankHead confident   -> no mxbai call
RankHead uncertain   -> call mxbai
```

Building `SpanHead`/`RouteHead` and their training pipeline is explicitly out of scope for this
proposal — recorded here only so a future training-phase change has the target architecture, per
this repo's existing cross-reference discipline (`parent-atlas-gpu-mini-fabric-01`'s `atlas-rapids-cu13`
environment is the mandatory reuse target for any future training work, already documented in the
staging-planes design doc; nothing here changes that).

## 6. Non-goals for this proposal

- Implementing `POST /v1/extract/code(/batch)` on the 8095 sidecar.
- Training AtlasGemma's `SpanHead`/`RouteHead` or building the tabular router (XGBoost/logistic/ACE).
- Migrating any existing `CandidateEvidenceCardV1` consumer to V2.
- Modifying the running `miniforge-nlp-sidecar` process in any way.
- Claiming any measured mxbai-call-reduction number — the funnel in section 4 is illustrative, not a
  result. `CODE-LANGEXTRACT-RERANK-BYPASS-02` is the gate that would produce a real number.
