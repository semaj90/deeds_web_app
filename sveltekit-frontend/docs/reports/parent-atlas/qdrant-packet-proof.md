# Qdrant Packet Join-Back Proof

- Fixture collection: `codebase_chunks_768_packet_proof`
- Proof level: `FIXTURE_PROVEN`
- Packet qualified rows: `20`
- Writer rejected: `0`
- Upserted: `20`
- Read back: `20`
- Joined back: `20`
- Join failures: `0`

## Field Coverage

- packet_key: `20`
- source_ref: `20`
- workspace_id: `20`
- workspace_revision: `20`
- source_revision: `0`
- representation_id: `20`
- representation_revision: `20`
- schema_version: `20`
- stable_symbol_id: `0`
- symbol_version_id: `0`

## Negative Cases

- missing_workspace_id_rejected: `1`
- missing_packet_key_rejected: `1`
- missing_source_ref_rejected: `1`
- changed_qdrant_point_id_joins_through_packet_key: `1`
- nonexistent_packet_key_join_failure: `1`

## Source Classifications

- packet_key: `STORED_IN_ATLAS_PACKETS`
- qdrant_point_id: `STORED_IN_ATLAS_PACKETS`
- workspace_id: `STORED_IN_ATLAS_PACKETS`
- workspace_revision: `STORED_IN_ATLAS_PACKETS`
- source_revision: `SOURCE_NOT_LOCATED`
- representation_id: `CONSTANT_FOR_VERSIONED_LANE`
- representation_revision: `STORED_IN_ATLAS_PACKETS`
- schema_version: `OWNED_BY_REPRESENTATION_CONTRACT`
- stable_symbol_id: `SOURCE_NOT_LOCATED`
- symbol_version_id: `SOURCE_NOT_LOCATED`
- source_ref: `STORED_IN_ATLAS_PACKETS`
