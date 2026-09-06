## ADDED Requirements

### Requirement: Three distinct relevance score types are never conflated
The system SHALL define three distinct score contracts —
`SemanticSimilarityScoreV1` (EmbeddingGemma bi-encoder cosine similarity),
`TextRelevanceScoreV1` (a joint-pair cross-encoder's log-odds relevance, e.g. mxbai's `z1 - z0`),
and `EngineeringUtilityScoreV1` (a Parent Atlas-specific learned score over non-textual evidence:
graph/PageRank, test coverage, symbol/AST hits, prior workflow success, revision match, etc.) — and
SHALL NOT average or otherwise silently collapse them into one undifferentiated "relevance" number
without recording which components contributed.

#### Scenario: A candidate's three scores are independently inspectable
- **WHEN** a candidate has been scored by all three methods
- **THEN** each of `semanticSimilarityScore`, `textRelevanceScore`, and `engineeringUtilityScore` is independently readable, not pre-merged into a single opaque scalar

#### Scenario: Disagreement between text relevance and engineering utility is preserved, not hidden
- **WHEN** a candidate scores high on `TextRelevanceScoreV1` but low on `EngineeringUtilityScoreV1` (or vice versa)
- **THEN** both values remain visible to whatever downstream ranking/gating logic consumes them; the system does not discard one score to produce a false consensus

### Requirement: Expensive text-relevance scoring is admitted only under an ambiguity gate
The system SHALL NOT invoke a joint-pair cross-encoder (`TextRelevanceScoreV1`) on every candidate
by default. It SHALL first evaluate cheaper scores (`SemanticSimilarityScoreV1` and/or
`EngineeringUtilityScoreV1`) and only escalate to the cross-encoder when those cheaper scores leave
an ambiguous margin among top candidates, per a documented threshold.

#### Scenario: Clear cheap-score separation skips the cross-encoder
- **WHEN** the top candidates' cheap scores are well-separated (e.g. `.96, .91, .43, .31`)
- **THEN** the system does not invoke `TextRelevanceScoreV1` scoring for that candidate set

#### Scenario: Ambiguous cheap-score margin triggers cross-encoder escalation
- **WHEN** the top candidates' cheap scores are closely clustered (e.g. `.72, .71, .70, .69`)
- **THEN** the system invokes `TextRelevanceScoreV1` scoring (the cross-encoder) for that candidate set before making a final admission decision

### Requirement: Distillation, if built, targets ordering fidelity against a frozen teacher
If a distilled `EngineeringUtilityScoreV1`-family student model is trained against
`TextRelevanceScoreV1` (mxbai) as a teacher, the system SHALL record which teacher model version and
which labeled pair set produced the training data, and SHALL evaluate the student against ranking
agreement with the teacher (not merely raw score regression error), consistent with this repo's
Status Language rules (no "production-ready" claim without a proven evaluation).

#### Scenario: A distilled student's training provenance is recorded
- **WHEN** a distillation training run produces a new student model
- **THEN** the recorded artifact includes the teacher model version/revision and a reference to the labeled pair dataset used
