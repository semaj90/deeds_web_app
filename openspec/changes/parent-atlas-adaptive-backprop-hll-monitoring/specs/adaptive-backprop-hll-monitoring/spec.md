# Adaptive backprop and HLL monitoring governance

## ADDED Requirements

### Requirement: Challenger-only adaptive backprop and telemetry boundary
The system MUST ensure that backpropagation and fine-tuning train challenger models only and NEVER write canonical packet facts, source revisions, or promote lifecycle transitions without revision-qualified receipts and operator approval. HyperLogLog (HLL) counters MUST remain telemetry-only and never determine eviction, promotion, or retrieval votes.

#### Scenario: Backprop training runs on candidates
- **WHEN** adaptive backprop training or reranker fine-tuning executes
- **THEN** it trains a challenger model using reviewed query-grouped pairs only and writes zero mutations to canonical packet tables or source revisions.

#### Scenario: HLL telemetry collection
- **WHEN** HyperLogLog cardinality counters collect observation breadth
- **THEN** counts are stored strictly as telemetry metrics and do not alter retrieval rankings, cache residency, or candidate eviction.

#### Scenario: Promotion gate enforcement
- **WHEN** a challenger model or adapter is evaluated for promotion
- **THEN** promotion requires held-out evaluation metrics, an explicit rollback pointer, and revision-qualified verification receipts before being admitted.
