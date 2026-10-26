# ML and graph retrieval convergence governance

## ADDED Requirements

### Requirement: ML and graph model challenger-only evaluation
The system MUST evaluate ML ranking and graph models as challengers against CPU baselines using frozen query-grouped datasets. Models and projections MUST NOT mutate canonical storage or gain promotion without held-out verification receipts and operator approval.

#### Scenario: Challenger model evaluation
- **WHEN** an ML reranker or GNN model is trained or benchmarked
- **THEN** it is evaluated against CPU baseline oracles on frozen query groups without promoting unverified candidates into canonical indexes.

#### Scenario: Accelerated graph execution parity
- **WHEN** GPU or native C++ acceleration is used for graph traversal or PageRank
- **THEN** parity against the NetworkX CPU reference oracle is verified before results are admitted.
