# EMB3A Qdrant lineage audit

- status: **EMB3A_BLOCKED_BY_UPSTREAM_LINEAGE**
- mode: **READ_ONLY**
- collection: `codebase_chunks_768_v2`
- expected representation: `semantic_768` (768d)
- sampled live payloads: 250
- first blocking class: EMB3A_BLOCKED_BY_UPSTREAM_LINEAGE
- output checksum: `becda039044f7ccb8939cf1eb5e54fdd275e092f7622e2c66ecbc09be5f981df`

> Existing Qdrant payload indexes are observed configuration only. They do not prove that any sampled point contains a populated value.

| Field | Canonical source | Snapshot | Outbox | Builder | Live payload coverage | Indexed | Classification |
|---|---|---|---|---|---:|---|---|
| `canonical_id` | POPULATED (codebase_chunk_index.id, 100%) | POPULATED | NOT_APPLICABLE_DIRECT_BACKFILL | FIELD_REFERENCED | 100% | YES | EMB3A_LINEAGE_PROVEN |
| `packet_key` | POPULATED (atlas_packets.packet_key, 100%) | NOT_APPLICABLE_OR_NOT_PROJECTED | NOT_APPLICABLE_DIRECT_BACKFILL | FIELD_NOT_REFERENCED | 0% | NO | EMB3A_BLOCKED_BY_PROJECTION_BUILDER |
| `source_ref` | POPULATED (atlas_packets.source_ref, 100%) | POPULATED | NOT_APPLICABLE_DIRECT_BACKFILL | FIELD_REFERENCED | 100% | YES | EMB3A_LINEAGE_PROVEN |
| `tree_node_id` | POPULATED (atlas_packets.tree_node_id, 100%) | NOT_APPLICABLE_OR_NOT_PROJECTED | NOT_APPLICABLE_DIRECT_BACKFILL | FIELD_NOT_REFERENCED | 0% | NO | EMB3A_BLOCKED_BY_PROJECTION_BUILDER |
| `symbol_version_id` | NOT_OWNED_UPSTREAM | NOT_APPLICABLE_OR_NOT_PROJECTED | NOT_APPLICABLE_DIRECT_BACKFILL | FIELD_NOT_REFERENCED | 0% | NO | EMB3A_BLOCKED_BY_UPSTREAM_LINEAGE |
| `workspace_revision` | OWNER_PRESENT_UNPOPULATED (atlas_packets.workspace_revision, 0%) | NOT_APPLICABLE_OR_NOT_PROJECTED | NOT_APPLICABLE_DIRECT_BACKFILL | FIELD_NOT_REFERENCED | 0% | NO | EMB3A_BLOCKED_BY_UPSTREAM_LINEAGE |
| `source_revision` | OWNER_PRESENT_UNPOPULATED (atlas_ast_nodes.source_revision, 0%) | NOT_APPLICABLE_OR_NOT_PROJECTED | NOT_APPLICABLE_DIRECT_BACKFILL | FIELD_NOT_REFERENCED | 0% | NO | EMB3A_BLOCKED_BY_UPSTREAM_LINEAGE |
| `representation_id` | POPULATED (atlas_packets.source_representation_id, 0%) | NOT_APPLICABLE_OR_NOT_PROJECTED | NOT_APPLICABLE_DIRECT_BACKFILL | FIELD_REFERENCED | 0% | NO | EMB3A_BLOCKED_BY_PAYLOAD_POPULATION |
| `representation_revision` | POPULATED (atlas_packets.representation_revision, 0%) | NOT_APPLICABLE_OR_NOT_PROJECTED | NOT_APPLICABLE_DIRECT_BACKFILL | FIELD_NOT_REFERENCED | 0% | NO | EMB3A_BLOCKED_BY_PROJECTION_BUILDER |
| `embedding_model_revision` | POPULATED (atlas_packets.encoder_revision, 0%) | NOT_APPLICABLE_OR_NOT_PROJECTED | NOT_APPLICABLE_DIRECT_BACKFILL | FIELD_REFERENCED | 0% | NO | EMB3A_BLOCKED_BY_PAYLOAD_POPULATION |

## Representation qualification

- dimension matches expected collection contract: YES
- representation_name exact-match coverage: 100.00%
- representation_id is never inferred from vector dimension.
- source_revision/workspace_revision are never synthesized when canonical ownership is absent or unpopulated.

## Safe next action

Patch only the first broken boundary identified above, then rerun this read-only audit and Qdrant readback before changing payload indexes.
