# Execution Order / Proof Gates

## A — CODE_EVIDENCE_INTEGRATION_EVENT_DELIVERY_PROVEN

Required:

1. real synthesized receipt enters writer
2. BEGIN
3. insert `analysis_pass_results`
4. insert `integration_event_outbox`
5. COMMIT
6. canonical evidence readback agrees with event hashes/revision
7. publisher claims event
8. RabbitMQ receives `atlas.code-evidence.persisted.v1`
9. dedicated projection consumer receives it
10. consumer calls canonical readback
11. hash/revision checks PASS
12. ACK
13. `delivered_at` only after successful publish
14. duplicate delivery harmless
15. broker unavailable => pending/retryable
16. forced outbox insert failure => evidence insert rolls back
17. command/work queues receive zero copies

## B — Graph identity audit

Inventory across:

- `atlas_tree_nodes`
- `atlas_packets`
- `graphify_files`
- `graphify_symbols`
- `graphify_edges`
- topology/projection tables

For every identity field record:

`field, owner, scope, revision-bound?, stable-across-revision?, derived-from, unique constraint, FKs, writers, readers, fallbacks`

### Required identity gates

- `PARSE_NODE_IDENTITY_PROVEN`
- `STABLE_SYMBOL_IDENTITY_PROVEN`
- `SYMBOL_VERSION_IDENTITY_PROVEN`
- `PACKET_TO_SYMBOL_LINEAGE_PROVEN`
- `GRAPH_NODE_KEY_CONTRACT_PROVEN`

Until then:

- provisional structural snapshot: allowed
- canonical graph snapshot: blocked
- relaxing `tree_node_id` uniqueness: blocked

## C — Retrieval proof order

`semantic_768 coverage → exact KNN oracle → ANN parity → KMeans → SOM 20x20 → PageRank`

Every materialization carries run id, source/workspace revision, representation revision, algorithm revision, population hash, row counts and missing/duplicate counts.

## D — Analytics / Merkle / Daily compiler

`AnalyticsEventV1 → Kafka → deterministic event ordering → stableStringify → Merkle checkpoint → RAPIDS batch features → RecommendationSignal → ACE prefetch/prefill → evidence-backed Kanban`

The LLM may phrase a Kanban card. It may not invent its evidence.
