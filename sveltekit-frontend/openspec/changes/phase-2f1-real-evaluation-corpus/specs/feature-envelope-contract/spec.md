## ADDED Requirements

### Requirement: FeatureEnvelope struct tracks per-signal rank, score, grade, confidence
The system SHALL define FeatureEnvelope as a unified interface tracking chunk retrieval across all signals. Each signal (Dense, Lexical, AST, RRF) SHALL track independently: rank (1-20), score (numeric, signal-dependent), grade (0-3 from evaluation_relevance), confidence (0-1).

#### Scenario: Dense signal within FeatureEnvelope
- **WHEN** Dense ANN retrieval returns chunk C at rank 3 with similarity 0.87
- **THEN** FeatureEnvelope stores dense_rank=3, dense_score=0.87, dense_grade=X (from evaluation_relevance), dense_confidence=Y

#### Scenario: Lexical signal within FeatureEnvelope
- **WHEN** Lexical FTS returns chunk C at rank 5 with ts_rank 2.5
- **THEN** FeatureEnvelope stores lexical_rank=5, lexical_score=2.5, lexical_grade=X, lexical_confidence=Y

#### Scenario: RRF computed as derived signal
- **WHEN** both Dense and Lexical signals populated for chunk C
- **THEN** system computes RRF score from Dense rank and Lexical rank, assigns rrf_rank by sorted RRF score, inherits grade/confidence from evaluation_relevance

### Requirement: FeatureEnvelope enables per-signal ablation
The system SHALL support ablation studies by allowing independent evaluation of each signal. Ablation configurations SHALL select which signals to include in RRF fusion.

#### Scenario: Dense-only ablation
- **WHEN** ablation_id=1 (Dense-only configuration)
- **THEN** evaluation runner computes metrics using only dense_rank, dense_score, dense_grade; ignores lexical/rrf

#### Scenario: RRF with custom weights
- **WHEN** ablation_id=5 (Dense-heavy RRF: 0.50 Dense + 0.25 Lexical + 0.25 AST)
- **THEN** evaluation runner computes RRF score as 0.50·rrfScore(dense_rank) + 0.25·rrfScore(lexical_rank) + 0.25·rrfScore(ast_rank)

### Requirement: FeatureEnvelope avoids signal coupling
The system SHALL ensure FeatureEnvelope fields are independent: modifying one signal's rank/score SHALL NOT affect other signals' values.

#### Scenario: Dense update doesn't affect Lexical
- **WHEN** Dense ranking is recomputed (e.g., new embedding model)
- **THEN** Lexical rank, score, grade remain unchanged; RRF recomputed from new Dense + existing Lexical

#### Scenario: Add AST signal without disrupting existing signals
- **WHEN** Phase 2F.2 adds ast_rank, ast_score, ast_grade fields to FeatureEnvelope
- **THEN** existing Dense/Lexical fields are unmodified; RRF weight configuration is updated separately
