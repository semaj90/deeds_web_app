## ADDED Requirements

### Requirement: Five evidence families organize ExperimentFeatureMatrix, not semantic_768's dimensions
The system SHALL treat lexical, semantic, structural, topological, and
execution as five evidence-signal *families* that organize columns of the
wider `ExperimentFeatureMatrix`, and SHALL NOT implement or describe
`semantic_768` as five sub-regions or five dimensions corresponding to these
families.

#### Scenario: A new feature is added to the ranking pipeline
- **WHEN** a new evidence signal (e.g. a new topological metric) is added
- **THEN** it SHALL be added as a new named column in `ExperimentFeatureMatrix`
  under the appropriate family, and SHALL NOT be implemented by splitting or
  reinterpreting `semantic_768`'s existing 768 dimensions

### Requirement: control5 is a derived summary, never a replacement for the full feature matrix
The system SHALL compute `control5` (`lexical_confidence,
semantic_confidence, structural_confidence, topological_confidence,
execution_confidence`) as an optional derived vector for cheap routing/ACE
decisions, computed from the wider `ExperimentFeatureMatrix`, and SHALL NOT
use `control5` alone as the basis for final ranking or promotion decisions.

#### Scenario: An ACE routing decision needs a quick confidence check
- **WHEN** the ACE context materializer needs a fast per-family confidence
  signal to decide whether to expand context further
- **THEN** the system SHALL read `control5`, and SHALL NOT recompute the
  full `ExperimentFeatureMatrix` just to answer that routing question

#### Scenario: Final candidate ranking is computed
- **WHEN** the canonical reranker produces a final ranked candidate order
- **THEN** the system SHALL use the full `ExperimentFeatureMatrix` (or the
  canonical blend/rerank contract already established), and SHALL NOT
  substitute `control5` as a shortcut for the full feature set
