# Design — Parent Atlas Search Classifier Sidecar

## D1. Pass-family literal: `"classify"` vs reusing `"semantic"`

`AnalysisPassResult.family` in `miniforge_nlp_sidecar.py` currently has 7 literals
(`structural|lexical|linguistic|semantic|sequence|rerank|grounded`). Domain classification is not a
variant of semantic analysis — it is a distinct evidence family (label + confidence + backend, not
an embedding/relevance score). **Decision: add `"classify"` as an 8th literal**, not overload
`"semantic"`. Open until implementation: confirm no downstream consumer switches exhaustively on the
7-literal union in a way that breaks on an 8th value (`grep` for `family ===` / pattern matches
before landing).

## D2. Token-embedding source for word clustering

"Cluster of words" = token-level embedding clustering (KMeans) feeding the classifier as a feature,
not raw text-to-label. Two candidate embedding sources, not yet decided:
- Reuse the sidecar's existing spaCy vectors (already loaded for the linguistic pass) — cheapest,
  no new dependency, word-level vectors are lower quality than sentence-transformers.
- A lightweight in-process word-embedding table (word2vec/GloVe-scale, not `semantic_768`) — better
  quality, adds a new artifact to manage (checksum, revision, storage location).
**Resolved 2026-09-03**: `SPACY_MODEL` defaults to `en_core_web_sm` (`miniforge_nlp_sidecar.py:516`)
— confirmed via spaCy's own model docs that `_sm` models ship **no static word vectors** (only
context-sensitive tensors; real vectors require `_md`/`_lg`/`_trf`). Option 1 is not viable without
either swapping the sidecar's default model (new download, resource cost, affects every other pass
that loads `_spacy_nlp`) or requiring `SPACY_MODEL=en_core_web_lg` specifically for this pass.
**Decision: use option 2 instead** — but not a new standalone word2vec/GloVe table either. Reuse the
canonical `embeddinggemma:latest` embedding path (Ollama `:11434`, already this repo's canonical
768-dim embedding source per CLAUDE.md's Embedding Dimensions Policy) for token/phrase-level chunks
of the input text, then KMeans-cluster over those. This avoids a third embedding source and stays
consistent with the existing architecture, at the cost of an HTTP round-trip per classify call
(acceptable — the sidecar already makes network calls for other passes).

## D3. `DagActionKind` extension — located, resolved

`DagActionKind` is defined in `packages/parent-atlas/src/core/adaptive-dag-plan-v1.ts:8-14`:
```ts
export const DAG_ACTION_KIND_VALUES = [
  'FETCH_POSTGRES', 'FETCH_QDRANT', 'FETCH_FILE', 'AST_SCAN',
  'SIMDJSON_SCAN', 'GRAPH_EXPAND', 'WEB_SEARCH', 'RERANK',
  'BUILD_CONTEXT', 'SYNTHESIZE',
] as const;
export const dagActionKindSchema = z.enum(DAG_ACTION_KIND_VALUES);
export type DagActionKind = z.infer<typeof dagActionKindSchema>;
```
Published via `@deeds/parent-atlas`'s `"./core/adaptive-dag-plan-v1": "./dist/core/adaptive-dag-plan-v1.js"`
export map entry, consumed through the pnpm file-link
(`node_modules/.pnpm/@deeds+parent-atlas@file+pa.../node_modules/@deeds/parent-atlas`). None of the
existing 10 values fit "fetch a neural-decoder latent vector" (closest are `FETCH_POSTGRES`/
`FETCH_QDRANT`, both wrong — the neural decoder is a distinct HTTP service, not either store).
**Decision: add `'FETCH_LATENT'`** to `DAG_ACTION_KIND_VALUES`, requiring a `packages/parent-atlas`
rebuild (`npm run build` in that package, `tsc -p tsconfig.json`) before the new value is consumable
from `sveltekit-frontend`. `adaptiveDagActionSchema` is `.strict()` — the new handler's action
objects must match the existing schema shape exactly, no additional fields.

## D4. `research.test.ts` — CORRECTED 2026-09-03, original premise was wrong

Original claim (wrong): the test's `classifier_version` assertion depends on
`enrichment/domain-classifier.ts`'s `CLASSIFIER_VERSION` constant, making the fold a
breaking-contract change. **Traced the actual live path and this is false.**
`src/routes/api/ldr/research/+server.ts` calls `buildOkfTopicAnalysis()`
(`okf-topic-ingestion.ts`), which sets `domain_classification.classifier_version: OKF_FIT_VERSION`
— a constant from `okf-fit.ts` (`= 'okf-fit-v1'`), a completely different file.
`enrichment/domain-classifier.ts`'s `CLASSIFIER_VERSION` (`= 'domain-classifier-v1'`) is used
nowhere near this response shape; its one live reference is `feature-doc-enrichment.ts`'s
`classifierPlan.classifierVersion` field (a different JSON path entirely,
`okf.classifierPlan.*`, not `okf.domain_classification.*`).

**This means `research.test.ts:49`'s assertion — `expect(body.okf.domain_classification
.classifier_version).toBe('domain-classifier-v1')` — checks a value that does not match what the
real code actually returns (`'okf-fit-v1'`).** This looks like a pre-existing, unrelated bug in the
test (or the route changed since the test was written) — flagged here as a finding, not fixed as
part of this change (out of scope; fixing it requires understanding intent, which nobody currently
does). No fold in this change touches this test's real dependency (`okf-fit.ts`).

## D4b. `okf-fit.ts` — an 8th classifier-adjacent surface, and it changes the ML design

`classifyOkfFit()` (`sveltekit-frontend/src/lib/server/atlas/okf-fit.ts`) is real, live (the actual
path `research.test.ts` exercises), and correctly builds on the canonical `domain-taxonomy.ts`
(`classifyDomainTaxonomy()`). It already produces `naive_bayes_score`, `logistic_regression_score`,
`fit_margin`, and `fit_decision` fields on its `OkfFitResult` — **but these are hand-tuned linear/
sigmoid formulas with hardcoded coefficients** (e.g. `0.18 + 0.52*confidence + 0.16*lexicalWeight +
...`), not trained models. They simulate the shape of NB/LR fusion without being NB or LR.

**Design implication**: the new sidecar `classify` pass (task 2) should be designed so its real
trained NB/LR/PyTorch output can plausibly replace or validate against `okf-fit.ts`'s formula-based
approximation for the same `OkfFitResult` contract shape, rather than inventing an unrelated output
schema. This is a stronger, better-grounded design than the original proposal (which didn't know
this contract existed) — but replacing the formula is explicitly **out of scope for this change**;
record it as a follow-up decision point, since `okf-fit.ts` is live and used by a real route today,
and swapping its scoring function is a distinct, separately-reviewable change.

## D5. Two taxonomies stay two taxonomies — not merged

`domain-taxonomy.ts` (9-domain, ACE in-process classification) and
`classify-domain-ontology.mjs` (15-domain, Postgres-row enrichment via `--apply`) are **not the same
capability** despite both being called "domain classification" colloquially:
- `domain-taxonomy.ts` classifies arbitrary evidence text at call time, in-process, for ACE/feature
  callers — no persistence of its own.
- `classify-domain-ontology.mjs` is a standalone batch script that scores `atlas_packets` rows by
  `source_ref`/`feature_id` keyword match and writes `domain_class`/`domain_confidence` directly to
  Postgres — a persistence-owning capability, and the one `ONTO-PY-DOMAIN-02` actually references.

**Decision: do not merge these into one taxonomy.** Extend `domain_mapping.py`'s
`DomainOntologyMappingV1` catalog to cover `classify-domain-ontology.mjs`'s 15 labels specifically
(closing `ONTO-PY-DOMAIN-02` as written), and separately let the new sidecar `classify` pass feed
`domain-taxonomy.ts`'s `source: 'learned'` slot (an unrelated, in-process-only extension). Document
both taxonomies' domain names side by side in a short mapping table during implementation so a
future reader doesn't conflate them a third time.

## D6. Bounded neural-latent feature shape (no raw tensor persistence)

Per CLAUDE.md's hard rule against persisting hidden/raw tensor state in Redis, Postgres, or Qdrant:
the new OaK DAG handler's receipt carries only
`{ latentChecksum: string, latentWidth: 256 | 128 | 64, nearestClusterId?: number, l2Norm: number }`
— never the raw `latent_256`/`latent_128`/`latent_64` float array. `latentChecksum` is computed the
same way every other OaK handler computes its `inputChecksum`/`outputChecksum`
(`oak-dag-execution-adapter-v1.ts:41-53`, stable-JSON-stringify + SHA-256) so the receipt is
independently verifiable without needing to re-fetch the raw vector.
