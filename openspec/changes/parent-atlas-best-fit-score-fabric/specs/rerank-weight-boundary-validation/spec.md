## ADDED Requirements

### Requirement: Externally-reachable blend-weight inputs are schema-validated before use

Any public entry point that accepts a caller-supplied `blendWeights` object SHALL validate it
against `BlendWeightsSchema` (rejecting a non-1.0-summing total or an out-of-`[0,1]`-range weight)
before it is used to blend candidate scores. `runtime-reranker.ts::blendScores()` itself does not
perform this validation — callers that construct weights internally are exempt because their
weights are already valid by construction; only a caller accepting weights from outside the module
must validate.

#### Scenario: scoreCandidates rejects a malformed custom blend-weights object

- **WHEN** `candidate-scorer.ts::scoreCandidates()` is called with an `options.blendWeights` whose
  values do not sum to 1.0
- **THEN** the call rejects with a validation error
- **AND** no candidate is scored using the malformed weights

#### Scenario: scoreCandidates rejects an out-of-range weight

- **WHEN** `scoreCandidates()` is called with a `blendWeights` entry outside `[0, 1]`
- **THEN** the call rejects with a validation error

#### Scenario: A valid custom blend-weights object still scores candidates correctly

- **WHEN** `scoreCandidates()` is called with a valid, 1.0-summing `blendWeights` object
- **THEN** candidates are scored using those weights
- **AND** the resulting `blendedScore` matches the expected weighted combination

#### Scenario: Internal reranker-constructed weights remain exempt from this boundary check

- **WHEN** `canonical-rerank-executor.ts`'s `MixedbreadCanonicalReranker`, `localFallbackRerank`,
  or `retrievalOrderFallback` construct blend weights internally
- **THEN** no additional `BlendWeightsSchema.parse()` call is required at that call site, since the
  weights are valid by construction and never come from an external caller
