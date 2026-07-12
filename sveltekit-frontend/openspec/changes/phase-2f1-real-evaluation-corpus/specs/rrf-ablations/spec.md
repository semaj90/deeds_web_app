## ADDED Requirements

### Requirement: Execute 7 independent ablation configurations
The system SHALL run evaluation 7 times with different signal combinations and RRF weights. Each ablation SHALL be independent, with results stored separately (ablation_id 1-7, ablation_name descriptive).

#### Scenario: Dense-only ablation
- **WHEN** ablation_id=1, ablation_name='dense-only'
- **THEN** system evaluates only Dense signal across 50 queries, computes NDCG@10/MAP/MRR/Recall, stores with ablation_id=1

#### Scenario: Lexical-only ablation
- **WHEN** ablation_id=2, ablation_name='lexical-only'
- **THEN** system evaluates only Lexical signal across 50 queries, computes metrics, stores with ablation_id=2

#### Scenario: RRF equal-weight ablation (production baseline)
- **WHEN** ablation_id=4, ablation_name='rrf-equal'
- **THEN** system computes RRF with weights 0.33 Dense + 0.33 Lexical + 0.34 AST (or 0.50 Dense + 0.50 Lexical if AST unavailable), stores with ablation_id=4

#### Scenario: RRF dense-heavy ablation
- **WHEN** ablation_id=5, ablation_name='rrf-dense-heavy'
- **THEN** system computes RRF with weights 0.50 Dense + 0.25 Lexical + 0.25 AST, stores results with ablation_id=5

#### Scenario: RRF lexical-heavy ablation
- **WHEN** ablation_id=6, ablation_name='rrf-lexical-heavy'
- **THEN** system computes RRF with weights 0.25 Dense + 0.50 Lexical + 0.25 AST, stores results with ablation_id=6

#### Scenario: RRF Dense+Lexical baseline (Phase 2F.1 immediate)
- **WHEN** ablation_id=7, ablation_name='rrf-dense-lexical'
- **THEN** system computes RRF with weights 0.50 Dense + 0.50 Lexical (no AST), stores results with ablation_id=7

### Requirement: Store ablation results with configuration metadata
The system SHALL store each ablation's results with ablation_id, ablation_name, and lane_name. Results table schema SHALL include all IR metrics: precision_at_5, precision_at_10, recall_at_5, recall_at_10, recall_at_20, mrr, ndcg_10, map.

#### Scenario: Query ablation comparison
- **WHEN** analyst runs `SELECT ablation_name, avg(ndcg_10) FROM phase2f_evaluation_results GROUP BY ablation_name`
- **THEN** system returns NDCG@10 averages for all 7 ablations, enabling comparison

#### Scenario: Identify best-performing ablation
- **WHEN** analyst filters results WHERE ndcg_10 > 0.7
- **THEN** system shows which ablations achieved > 0.7 NDCG@10 on which queries

### Requirement: Deterministic RRF weight configuration
The system SHALL use deterministic weight assignment per ablation. RRF score SHALL be computed as: sum(1 / (rank_i + 60) * weight_i) where rank_i is signal-specific rank and weight_i is ablation-specific weight.

#### Scenario: RRF score with equal weights
- **WHEN** Dense rank = 5, Lexical rank = 3, weights = [0.5, 0.5]
- **THEN** RRF score = 0.5 * 1/(5+60) + 0.5 * 1/(3+60) = 0.5 * 0.0158 + 0.5 * 0.0159 = 0.0159

#### Scenario: RRF score with dense-heavy weights
- **WHEN** Dense rank = 5, Lexical rank = 3, weights = [0.5, 0.25, 0.25] (including AST rank = 10)
- **THEN** RRF score = 0.5 * 1/65 + 0.25 * 1/63 + 0.25 * 1/70 (all normalized by total weight)
