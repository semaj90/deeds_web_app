# Parent Atlas Temporal Action Index

## Invariant

`DO NOT REPEAT YOURSELF unless the relevant world state changed.`

OpenSpec remains the intended-work contract. The action ledger is observed execution history. Do not turn `tasks.md` into an execution log.

## EVT-01 AgentActionEventV1

- [x] Add immutable, revision-qualified `AgentActionEventV1`.
- [x] Add typed lifecycle states and action outcome vocabulary.
- [x] Derive `executionKey` from opcode + target + input hash + applicable revisions + producer revision.
- [x] Include observed time plus validity-revision fields without requiring full bitemporal storage on day one.
- [ ] Adapt finalized action events into the existing `atlas.event.hypergraph.v1` owner instead of creating a competing event store.
- [ ] Add durable Postgres append-only persistence and readback receipt.

## IDX-01 TemporalActionIndexV1

- [x] Add pure latest-state projection keyed by `executionKey`.
- [x] Preserve last success, last failure, retry count, stale state and result reference.
- [ ] Add durable/latest projection table or Arrow index after persistence owner audit.
- [ ] Add indexes by target, opcode, result, error and applicable revision.

## DRY-01 ExecutionReuseDecisionV1

- [x] Reuse `FINALIZED + SUCCESS_EXACT` and `CACHE_HIT` results for an identical execution key.
- [x] Block identical failed actions unless retry policy or changed evidence authorizes another attempt.
- [x] Invalidate stale results instead of silently reusing them.
- [ ] Add ContextManifest evidence-frontier hash so failed generative synthesis is not repeated without new evidence.
- [ ] Add artifact dependency hash so unchanged feature artifacts are not recomputed.

## REC-04 ActionFeatureRowV1

- [x] Add action-candidate features for semantic/structural/query affinity, historical success, failure similarity, cache probability, information gain, cost, latency, mutation risk, token savings and dependency readiness.
- [x] Add deterministic `NextActionRecommendationV1` challenger scorer.
- [x] Require exact gate before execution.
- [ ] Feed historical outcome aggregates from the temporal index rather than hand-built fixtures.
- [ ] Evaluate low-rank / length-square-inspired candidate sampling as a computation-reduction challenger; do not call it Tang's algorithm unless its data-access assumptions are actually satisfied.
- [ ] Connect accepted action recommendations to the existing recommendation/Kanban owner rather than creating another task authority.

## OS-01 OpenSpecActionLinkV1

- [ ] Define links `EXECUTED_BY`, `VERIFIED_BY`, `FAILED_BY`, `SUPERSEDED_BY` between OpenSpec task revision and action event IDs.
- [ ] Preserve task revision identity separately from action event identity.

## GRAPH-01 Temporal graph projection

- [ ] Project `PRECEDES`, `DEPENDS_ON`, `RETRIED_AS`, `SUPERSEDED_BY`, `INVALIDATED_BY`, `PRODUCED`, `CONSUMED`, `VERIFIED_BY`, `FAILED_BECAUSE` through Graphify.
- [ ] Keep graph projection downstream of the append-only action ledger.

## ACE-01 Procedural feedback

- [ ] Aggregate action outcomes into ACE procedural features only after execution/readback proof.
- [ ] Keep ACE responsible for learned procedural/residency guidance, not canonical execution truth.

## Revision-owner gate

- [ ] Do not declare action reuse valid across canonical Atlas mutations until workspace/source revision owners are proven.
- [ ] Current origin/proof work remains a prerequisite for durable cross-session reuse.

## Intended loop

```text
CURRENT WORKSPACE
  -> OpenSpec task / DAG frontier
  -> proposed actions
  -> temporal lookup
       HIT / BLOCK / RETRY / EXECUTE / INVALIDATE
  -> ActionFeatureMatrix
  -> bounded candidate sampler
  -> NextActionRecommendation
  -> exact gate
  -> execute
  -> append AgentActionEvent
  -> Graphify event/hypergraph projection
  -> outcome receipt
  -> ACE procedural feature update
```
