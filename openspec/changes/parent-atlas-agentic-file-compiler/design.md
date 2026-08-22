# Design

```text
QueryClassificationV1
  -> FileMutationIntentV1
  -> existing retrieval CandidateOrdinal[]
  -> CandidateFeatureRowV1
  -> ExactPromotionV1
  -> existing ContextManifest compiler
  -> PromptPlanV1
  -> PrefillArtifactV1
  -> AtlasWorkflowSpecV1
  -> MastraWorkflowGraphV1 (runtime dialect)
  -> WorkflowActionEventV1
  -> FileMutationPlanV1
  -> bounded filesystem mutation / ast-grep rewrite
  -> Tree-sitter + typecheck + tests
  -> FileMutationReceiptV1 / FailureObservationV1
  -> cache invalidation
  -> incremental AST -> semantic_768 -> graph projection refresh
```

## Workflow ownership

`AtlasWorkflowSpecV1` is canonical meaning. Mastra JSON is a compiled runtime dialect. Mastra snapshots are resumability checkpoints. `WorkflowActionEventV1` is canonical execution history and adapts into existing `agent_run_actions`, `workflow_events`, and `outbox_events`.

## Search ownership

`semantic.search` is one logical lane. Runtime policy chooses Qdrant, cuVS exact, CAGRA, DiskANN, or TurboVec; executor identity never creates an additional ranking vote.

## Graph ownership

Canonical n-ary relations remain in the event/hypergraph authority. `GraphProjectionRequestV1` produces bounded ordinary graph projections for Neo4j/cuGraph algorithms.
