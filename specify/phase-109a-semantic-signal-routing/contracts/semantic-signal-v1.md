# Semantic Signal v1

Canonical source:
- `sveltekit-frontend/src/lib/server/atlas/contracts/semantic-signal-v1.ts`

This contract defines:
- `DomainClassificationV1`
- `QueryAnalysisV1`
- `RetrievalPlanV1`
- `TraversalBudgetV1`
- `LoopObservationV1`
- `ContinuityCheckpointV1`
- `AtlasRecommendationV1`
- `SemanticSignalProofManifestV1`

Rules:
- Every record must carry schema version, subject ID, workspace revision, producer, producer revision, evidence references, and timestamps.
- Recommendations require evidence and rollback criteria.
- Traversal budgets are hard caps, not suggestions.
