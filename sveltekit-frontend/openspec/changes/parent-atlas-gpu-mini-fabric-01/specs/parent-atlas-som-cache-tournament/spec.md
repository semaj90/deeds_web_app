## ADDED Requirements

### Requirement: SOM-neighbor prefetch is tournament-tested against graph-neighbor and LRU baselines
The system SHALL run `SOM-CACHE-01` as a tournament comparing four prefetch strategies — no
prefetch, plain LRU, ACE-utility-driven graph-neighbor prefetch, and SOM-BMU-neighbor prefetch —
against the same query-sequence trace, and SHALL report next-query hit rate for each strategy on
equal footing.

#### Scenario: All four strategies run against the identical trace
- **WHEN** a `SOM-CACHE-01` tournament run executes
- **THEN** all four strategies are evaluated against the same fixed query sequence, not independently-generated sequences

### Requirement: SOM only earns production consideration if it beats both baselines
The system SHALL NOT recommend promoting SOM-BMU-neighbor prefetch beyond `STEP-08 experimental`
status unless its measured hit rate exceeds both the graph-neighbor-prefetch and plain-LRU
baselines on the tournament trace.

#### Scenario: SOM underperforms both baselines
- **WHEN** SOM-BMU-neighbor prefetch's hit rate is lower than or equal to both the graph-neighbor and LRU baselines
- **THEN** the result artifact explicitly states SOM should remain `STEP-08 experimental` and not be wired into production BitFrost policy
