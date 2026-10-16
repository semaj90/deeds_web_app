# NLP sidecar to OKF schema alignment

## ADDED Requirements

### Requirement: NLP sidecar observation boundary and OKF schema alignment
The NLP sidecar outputs MUST align with OKF schema boundaries (`tree_node_id`, `symbol_version_id`), preserve `canonical_authority: false`, and require explicit byte spans and source revisions before structural observations may be admitted to evidence.

#### Scenario: NLP sidecar emits structural features
- **WHEN** the NLP sidecar analyzes a document or code snippet
- **THEN** structural coordinates (`upstream_node_id`) are mapped as syntax coordinates (`tree_node_id`) and marked `canonical_authority: false`.

#### Scenario: Admission to evidence verification
- **WHEN** structural observations are proposed for admission into OKF knowledge layers
- **THEN** admission is rejected if byte spans (`start_byte`, `end_byte`) or source revision hashes are missing.
