# Next Agent Prompt

Implement against the real Parent Atlas repo without creating peer owners.

## Scope

1. Finish `CODE_EVIDENCE_INTEGRATION_EVENT_DELIVERY_PROVEN`.
2. Inventory graph identity fields/writers/readers.
3. Wire contracts to real tables without relaxing `tree_node_id` uniqueness.
4. Replace lossy `page_index_path` identity behavior with stable canonical `source_ref` hashing after a dry-run proves zero collisions.
5. Prove `symbol_id` and `symbol_version_id`.
6. Keep canonical graph snapshot BLOCKED until those identity gates pass.
7. Add Merkle checkpoints only after analytics events have deterministic canonical serialization and stable ordering.
8. Feed a frozen Merkle checkpoint to the Python/RAPIDS daily compiler.

## Non-negotiable rules

- Reuse existing `stable-hash.ts`; do not add another stable JSON/hash owner.
- `tree_node_id != symbol_id`.
- `page_index_path != identity`.
- `packet_key != concept_id`.
- Integration events may trigger projections.
- Analytics events may not establish canonical state.
- Recommendation signals are disposable.
- Kafka is analytics/replay, not truth.
- RabbitMQ command queues are not integration-event queues.
- NATS is runtime dispatch, not capability ownership.
- RAPIDS computes features; it does not own identities.
- Merkle roots prove ordered populations; they do not replace Postgres lineage.

Use proof statuses: IMPLEMENTED / EXECUTED / TESTED / LIVE_PROVEN / PROMOTED /
BLOCKED_BY_RUNTIME_DEPENDENCY / NOT_PROVEN.
