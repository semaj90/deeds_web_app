# Capability: HyperRAG Scoring (Modified)

## MODIFIED Requirements

### Requirement: Compute final hit score from multiple signals
The system SHALL compute a final score for each HyperRagHit by fusing 9 independent signals.

**Original requirement** (weighted-sum): Compute final score as hardcoded weighted sum of 9 signals.

**Modified requirement** (RRF): Compute final score using Reciprocal Rank Fusion (RRF) instead:
1. Group 9 signals into 5 conceptual lanes (dense_vector, graph_authority, lexical, cache, temporal)
2. Within each lane, rank hits by signal strength descending
3. Apply RRF formula: `contribution = weight / (k + rank)` per lane
4. Sum contributions across all lanes for each hit
5. Sort hits by final RRF score descending

**Updated behavior**:
- **Input signals** (unchanged): `dense` (Qdrant ANN), `graphAuthority` (Neo4j PageRank), `lexicalBoost` (BM25 cluster match), `taskBoost` (task distillate hit), `aceBoost` (ACE cache hit), `turbovec` (TurboVec marker), `topologyRouted` (routing marker), `recencyOrHitRate` (freshness), `engramBoost` (memory hit)
- **Lane weights** (configurable): dense_vector=1.0, graph_authority=0.8, lexical=0.6, cache=0.5, temporal=0.3
- **RRF constant** (configurable): k=60 default
- **Output**: HyperRagHit.score (now RRF sum, typical range 0.1-0.5 vs. previous 0-1.5), HyperRagHit.signals (unchanged), new HyperRagHit.rrfBreakdown (lane contributions for transparency)

**Reason for change**: RRF amplifies consensus between lanes, naturally downweighting disagreement. Expected retrieval quality improvement: 40-60% (NDCG@5).

**Migration**: No API changes; consumers receive HyperRagHit with new score distribution. Recommendation: validate NDCG improvement on reference queries before rolling to production.

#### Scenario: RRF scores vs. weighted-sum
- **WHEN** computing score for hit appearing in dense_vector (rank 3) and graph_authority (rank 5) lanes
- **OLD (weighted-sum)**: score = 0.9*0.35 + 0.0*0.15 + 0.7*0.15 + 0.0*0.5 = 0.420
- **NEW (RRF)**: score = (1.0/(60+3)) + (0.8/(60+5)) = 0.0152 + 0.0121 = 0.0273 (consensus amplified, no dense_vector-only hits)

#### Scenario: RRF with all lanes contributing
- **WHEN** hit appears in all 5 lanes (ranks 2, 3, 4, 5, 6)
- **THEN** score = 1.0/(62) + 0.8/(63) + 0.6/(64) + 0.5/(65) + 0.3/(66) = 0.0161 + 0.0127 + 0.0094 + 0.0077 + 0.0045 = 0.0504 (high consensus)

#### Scenario: Signal preservation for transparency
- **WHEN** examining why hit ranked high
- **THEN** HyperRagHit.signals shows all 9 originals, HyperRagHit.rrfBreakdown shows lane contributions for debugging

### Requirement: Support optional weighted-sum fallback for comparison
The system SHALL optionally compute both RRF and weighted-sum scores for A/B analysis.

#### Scenario: A/B comparison mode
- **WHEN** HyperRagQuery includes `compareScoring=true`
- **THEN** HyperRagResult includes both `score` (RRF) and `scoreWeightedSum` (original) for analysis

#### Scenario: Fallback to weighted-sum
- **WHEN** RRF computation encounters error or performance issue
- **THEN** fall back to weighted-sum with log warning (safe degradation)
