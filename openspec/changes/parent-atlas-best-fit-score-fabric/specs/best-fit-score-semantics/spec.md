## ADDED Requirements

### Requirement: Heuristic OKF/HMM fit fields use heuristic-prefixed names

`okf-fit.ts` and `hmm-policy-bridge.ts` SHALL name their hand-written formula outputs with a
`heuristic*` prefix (`heuristicPriorScore`, `heuristicFitScore`, `heuristicFitMargin`) rather than
names borrowed from real ML methods (`naive_bayes_score`, `logistic_regression_score`,
`fit_margin`). The legacy snake_case field names SHALL remain present as deprecated compatibility
aliases, computed from the renamed fields, so existing OKF/HMM consumers do not break.

#### Scenario: Heuristic score is computed under its renamed field

- **WHEN** `okf-fit.ts` computes a fit score for a candidate
- **THEN** the result carries `heuristicPriorScore`, `heuristicFitScore`, and `heuristicFitMargin`
- **AND** the deprecated `naive_bayes_score`/`logistic_regression_score`/`fit_margin` aliases are
  also present and equal to the renamed fields

#### Scenario: hmm-policy-bridge.ts's independent heuristic is renamed the same way

- **WHEN** `hmm-policy-bridge.ts`'s `OkfHmmPolicyEvidence` is built from a different, independently
  hand-tuned formula than `okf-fit.ts`'s
- **THEN** its output also uses `heuristic_prior_score`/`heuristic_fit_score`/`heuristic_fit_margin`
  naming, not the ML-method names
- **AND** `PolicyStateInput.okf.{naiveBayesScore,logisticRegressionScore,fitMargin}` in
  `policy-types.ts` is left unchanged (a separate, more deeply load-bearing contract this
  requirement does not cover)

### Requirement: classifyOkfFit does not clobber domain-taxonomy provenance

`classifyOkfFit()` SHALL preserve `classifyDomainTaxonomy()`'s own `confidence` and
`classifier_version` fields under distinct field names (`domainTaxonomyConfidence`,
`domainTaxonomyRevision`) rather than overwriting them with the heuristic fit score's own values.

#### Scenario: Domain-taxonomy confidence survives OKF fit classification

- **GIVEN** `classifyDomainTaxonomy()` has already produced a `confidence` and `classifier_version`
  for a candidate
- **WHEN** `classifyOkfFit()` runs on the same candidate
- **THEN** the domain-taxonomy `confidence`/`classifier_version` are preserved under
  `domainTaxonomyConfidence`/`domainTaxonomyRevision`
- **AND** the OKF heuristic's own `heuristicFitScore`/`heuristicFitRevision` are recorded
  separately, not overwriting the domain-taxonomy fields

### Requirement: Real sklearn classifier outputs are never named after a formula's heuristic fields

The live `:8095` sidecar's real `MultinomialNB`/`LogisticRegression` `predict_proba()` outputs
SHALL be exposed under `naive_bayes_domain_probability`/`logistic_regression_domain_probability`
(or an equivalent `...TopClassProbability` name) — never the bare `naive_bayes_score`/
`logistic_regression_score` names that `okf-fit.ts`'s unrelated heuristic also produced before this
change, since the two are different prediction tasks (a domain-class probability vs. a hand-tuned
fit heuristic) that must never share a field name.

#### Scenario: Sidecar domain-classification output is distinctly named

- **WHEN** `miniforge_nlp_sidecar.py`'s `_classify_domain_pass()` returns its `features_map`
- **THEN** the real sklearn probabilities appear under `naive_bayes_domain_probability`/
  `logistic_regression_domain_probability`
- **AND** `domain-taxonomy-ml-bridge.ts` prefers those keys, falling back to the old keys only for
  compatibility with data written before this change

### Requirement: Score semantics are explicitly marked, never implied

Every OKF fit result SHALL carry an explicit `scoreSemantics` marker (`kind: 'HEURISTIC'`,
`calibrated: false`, `probability: false`, `learnedModel: false`) so a downstream consumer cannot
mistake a hand-written formula's output for a calibrated probability or a learned-model score.

#### Scenario: OKF fit result declares itself non-probabilistic

- **WHEN** `okf-fit.ts` produces an `OkfFitResult`
- **THEN** it includes `scoreSemantics: { kind: 'HEURISTIC', calibrated: false, probability:
  false, learnedModel: false }`
- **AND** the persisted `OKFDomainClassificationSchema` record carries the same marker
