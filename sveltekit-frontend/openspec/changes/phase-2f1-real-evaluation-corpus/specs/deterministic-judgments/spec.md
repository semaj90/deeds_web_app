## ADDED Requirements

### Requirement: Extract deterministic judgments from four canonical sources
The system SHALL extract evaluation ground-truth from four deterministic sources: AST declarations/calls, route manifests, PostgreSQL schema definitions, and test file locations. Each judgment SHALL carry provenance metadata (source_type, extractor_version, confidence) enabling audit trails.

#### Scenario: Audit trail shows AST-sourced judgment
- **WHEN** judgment has source_type='AST' and extractor_version='0.95'
- **THEN** operator can verify judgment by checking tree-sitter declaration at file_path + line_number

#### Scenario: Confidence reflects provenance quality
- **WHEN** AST declaration match is exact (function name + signature match)
- **THEN** confidence is 0.95

#### Scenario: Confidence is lower for indirect matches
- **WHEN** route match requires inference (e.g., "which route uploads?" → infer from URL pattern)
- **THEN** confidence is 0.70

### Requirement: Provenance metadata schema
The system SHALL store provenance as follows: source_type (VARCHAR, one of: 'AST', 'route', 'schema', 'test'), extractor_version (VARCHAR, semantic versioning), confidence (REAL, 0-1).

#### Scenario: Store provenance in evaluation_relevance
- **WHEN** AST extractor v0.95 identifies function declaration with 95% confidence
- **THEN** system stores row with source_type='AST', extractor_version='0.95', confidence=0.95

#### Scenario: Query judgments by provenance source
- **WHEN** analyst runs `SELECT * FROM evaluation_relevance WHERE source_type='schema'`
- **THEN** system returns all schema-sourced judgments with their confidence scores
