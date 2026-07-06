# Capability: Semantic Fusion Metrics

## ADDED Requirements

### Requirement: Compute NDCG@K (Normalized Discounted Cumulative Gain)
The system SHALL compute NDCG@5 for ranked result sets to measure retrieval quality improvement.

#### Scenario: Perfect ranking
- **WHEN** given ranked results where all top-5 hits are relevant (true positives)
- **THEN** NDCG@5 = 1.0

#### Scenario: Partial ranking
- **WHEN** given ranked results with 3/5 top results relevant
- **THEN** NDCG@5 computed as DCG@5 / ideal_DCG@5, accounting for position decay (log2 penalty for lower ranks)

#### Scenario: No relevant results
- **WHEN** given ranked results with 0/5 top results relevant
- **THEN** NDCG@5 = 0.0

### Requirement: Track rank of first correct result (MRR@10)
The system SHALL measure Mean Reciprocal Rank to track how quickly correct results appear.

#### Scenario: First result correct
- **WHEN** first ranked result is relevant
- **THEN** MRR@10 = 1.0

#### Scenario: Tenth result correct
- **WHEN** first 9 results irrelevant, 10th result relevant
- **THEN** MRR@10 = 0.1

#### Scenario: No result in top 10
- **WHEN** no relevant result in top 10
- **THEN** MRR@10 = 0.0

### Requirement: Measure multi-lane coverage percentage
The system SHALL track what percentage of top-K results receive contributions from 2+ lanes.

#### Scenario: All results have multi-lane agreement
- **WHEN** all top-5 results appear in 3+ lanes
- **THEN** multi-lane coverage = 100%

#### Scenario: Mixed coverage
- **WHEN** top-5 includes 2 hits from 3+ lanes and 3 hits from 1 lane
- **THEN** multi-lane coverage = 40%

### Requirement: Measure retrieval latency impact
The system SHALL track total fusion latency and per-lane ranking time.

#### Scenario: Fusion latency budget
- **WHEN** computing RRF for 100 hits × 5 lanes
- **THEN** total latency < 5ms (per lane ranking ~1ms, merge <1ms)

#### Scenario: Latency regression detection
- **WHEN** total fusion time exceeds 5ms
- **THEN** log warning for investigation

### Requirement: Compare baseline (weighted-sum) vs. RRF scores
The system SHALL optionally run both scoring methods on same query for A/B comparison.

#### Scenario: A/B comparison
- **WHEN** running with `compareScoring=true`
- **THEN** output includes both weighted-sum and RRF scores, NDCG@5 for each

#### Scenario: Improvement tracking
- **WHEN** comparing 10 reference queries
- **THEN** report average NDCG improvement (target: +40%+, current baseline ~0.45, target ~0.65+)
