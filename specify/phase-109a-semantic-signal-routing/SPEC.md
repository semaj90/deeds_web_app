# Phase 109A Semantic Signal and Domain Routing

## Goal
Create a versioned semantic signal system that produces compact, validated, evidence-backed routing packets for retrieval, loop continuity, and recommendations.

## Authority
- Postgres remains canonical for identity, revisions, evidence, and validated signals.
- Qdrant, Neo4j, Redis, and agent loop state are projections or runtime state.
- The semantic signal packet must stay bounded and must not replace canonical storage.

## In Scope
- Multi-label domain classification.
- Query analysis and bounded retrieval plan generation.
- Traversal budget and continuity checkpoint contracts.
- Recommendation records with evidence and rollback.
- Compact runtime signal packets for routes and semantic tools.

## Out of Scope
- Production HMM execution.
- New retrieval fusion implementations.
- New graph authority.
- Unbounded multi-hop traversal.

## Success Criteria
- Signals are schema-validated.
- Routes emit compact packets, not raw internals.
- Tests prove bounded lane planning, continuity retention, and recommendation shape.
