# Proposal: Parent Atlas Telemetry + Low-Rank + Recommendation + OKF Integration

Status: Proposed

## Intent

Integrate packet telemetry, low-rank approximation, GPU-assisted recommendation scoring, exact
oracle validation, and OKF ontology/domain classification into Parent Atlas without collapsing
their ownership boundaries.

This change is intentionally split into four independently owned lanes:

1. OKF knowledge and ontology
2. telemetry and provenance breadth
3. low-rank approximation and feature construction
4. recommendation scoring and exact-oracle validation

## Core ownership rule

The OKF ontology layer is the durable classification lineage surface.
It is not the owner of telemetry breadth counters, low-rank approximation state, or recommendation
policy.

## Non-goals

- No canonical packet identity rewrite.
- No cache-policy ownership in OKF.
- No direct promotion of approximate features to truth.
- No GPU authority over canonical identity or provenance.
- No merge of model internals with ACE packet selection.

## Primary records

- `OntologyLinkedTupleV1` for ontology / evidence linkage.
- `TelemetryBreadthV1` for HyperLogLog-derived breadth signals.
- `LowRankFeatureBlock` for sampled / compressed approximation features.
- `RecommendationJudgment` for policy output.
- `ExactOracleComparator` for promotion gating.

## Summary

This change makes the lane boundaries explicit:

- telemetry informs policy, but does not decide truth;
- low-rank approximation reduces computation, but does not replace exact evaluation;
- recommendation scoring can be GPU-assisted, but the judge and executor remain separate;
- OKF owns classification and linked knowledge lineage, but not eviction or residency policy.

