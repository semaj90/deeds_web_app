# Phase 109A Data Model

## Canonical contract source
- `sveltekit-frontend/src/lib/server/atlas/contracts/semantic-signal-v1.ts`

## Primary records
- `SemanticSignalV1`
- `QueryAnalysisV1`
- `RetrievalPlanV1`
- `TraversalBudgetV1`
- `LoopObservationV1`
- `ContinuityCheckpointV1`
- `AtlasRecommendationV1`

## Required fields
- `subject_id`
- `workspace_revision`
- `producer`
- `producer_revision`
- `evidence_refs`
- `created_at`

## Notes
- Evidence must be explicit.
- Recommendations must be rollback-safe.
- Continuity checkpoints must retain goals, decisions, and unresolved questions.
