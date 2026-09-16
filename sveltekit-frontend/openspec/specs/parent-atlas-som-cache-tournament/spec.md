# parent-atlas-som-cache-tournament Specification

## Purpose
TBD - created by archiving change parent-atlas-som-cache-01. Update Purpose after archive.
## Requirements
### Requirement: SOM-neighbor prefetch is tournament-tested against graph-neighbor and LRU baselines
The system SHALL run `SOM-CACHE-01` as a tournament comparing four prefetch strategies — no
prefetch, plain LRU, ACE-utility-driven graph-neighbor prefetch, and SOM-BMU-neighbor prefetch —
against the same query-sequence trace, and SHALL report next-query hit rate for each strategy on
equal footing.

#### Scenario: All four strategies run against the identical trace
- **WHEN** a `SOM-CACHE-01` tournament run executes
- **THEN** all four strategies are evaluated against the same fixed query sequence, not independently-generated sequences

#### Scenario: No-prefetch and plain-LRU are distinct baselines
- **WHEN** the tournament result artifact is produced
- **THEN** it reports `no-prefetch` (utility-score eviction, empty neighbor set) and `plain-LRU`
  (LRU eviction, empty neighbor set) as two separately-labeled strategies, not one strategy reused
  under two names

### Requirement: SOM only earns production consideration if it beats both baselines
The system SHALL NOT recommend promoting SOM-BMU-neighbor prefetch beyond `STEP-08 experimental`
status unless its measured hit rate exceeds both the graph-neighbor-prefetch and plain-LRU
baselines on the tournament trace.

#### Scenario: SOM underperforms both baselines
- **WHEN** SOM-BMU-neighbor prefetch's hit rate is lower than or equal to both the graph-neighbor and LRU baselines
- **THEN** the result artifact explicitly states SOM should remain `STEP-08 experimental` and not be wired into production BitFrost policy

#### Scenario: SOM beats both baselines
- **WHEN** SOM-BMU-neighbor prefetch's hit rate exceeds both the graph-neighbor and LRU baselines
- **THEN** the result artifact explicitly recommends SOM for the next real-data validation step, not an immediate production cutover

