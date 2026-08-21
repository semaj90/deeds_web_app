# EMB3A upstream revision owner audit

- Status: **REVISION_OWNER_NOT_PROVEN**
- Read-only: **true**
- Representation writer candidate: `sveltekit-frontend/src/lib/server/embedding/semantic-packet-writer.ts`
- Qdrant projection writer: `sveltekit-frontend/src/lib/server/workers/qdrant-sync-worker.ts -> retrieval/qdrant-sync-payload.ts`
- Source-revision adjacent owner: `atlas_source_revisions`
- Packet binding: **NOT_PROVEN_FOR_ATLAS_PACKETS**

- `atlas_packets`: **PARTIAL_SCHEMA**; fields=packet_key, source_ref, sha256, workspace_revision, representation_revision; missing=source_revision, representation_id
- `atlas_ast_nodes`: **SCHEMA_PRESENT**; fields=source_ref_key, source_revision, workspace_id; missing=none
- `atlas_source_revisions`: **PARTIAL_SCHEMA**; fields=source_revision_id, final_url, content_digest, received_at; missing=packet_key, source_ref
- `atlas_representation_records`: **NOT_FOUND_OR_INCOMPLETE**; fields=none; missing=packet_key, representation_id, representation_revision

No Postgres, Qdrant, Valkey, or canonical data was modified.
