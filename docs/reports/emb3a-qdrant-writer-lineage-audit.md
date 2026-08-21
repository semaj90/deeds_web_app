# EMB3A Qdrant writer lineage audit

- Status: **WRITER_CONTRACT_PRESENT_PROJECTION_POPULATION_OPEN**
- Read-only: **true**
- Collection: `codebase_chunks_768`
- Payload writers found: **9**
- Complete lineage writers: **1**

Required fields:
- `packet_key`
- `source_ref`
- `workspace_revision`
- `source_revision`
- `representation_revision`

Writer findings:
- `sveltekit-frontend/src/lib/server/workers/qdrant-sync-worker.ts`: **REVISION_FIELDS_MISSING** (packet_key)
- `sveltekit-frontend/src/lib/server/retrieval/qdrant-sync-payload.ts`: **LINEAGE_COMPLETE_CANDIDATE** (packet_key, source_ref, workspace_revision, source_revision, representation_revision)
- `sveltekit-frontend/src/lib/server/retrieval/qdrant-payload-enricher.ts`: **LINEAGE_COMPLETE_CANDIDATE** (packet_key, source_ref, workspace_revision, source_revision, representation_revision)
- `scripts/atlas/backfill-packets-to-qdrant.mjs`: **REVISION_FIELDS_MISSING** (packet_key, source_ref)
- `scripts/atlas/backfill-packets-to-qdrant-ollama.mjs`: **REVISION_FIELDS_MISSING** (packet_key, source_ref)
- `scripts/atlas/qdrant-upsert-worker.mjs`: **REVISION_FIELDS_MISSING** (packet_key, source_ref)
- `scripts/atlas/backfill-qdrant-payloads-from-postgres.mjs`: **REVISION_FIELDS_MISSING** (packet_key, source_ref)
- `scripts/atlas/backfill-qdrant-payload-upsert.mjs`: **REVISION_FIELDS_MISSING** (packet_key, source_ref)
- `scripts/atlas/backfill-qdrant-payload-complete.mjs`: **REVISION_FIELDS_MISSING** (packet_key, source_ref)
- `scripts/atlas/backfill-qdrant-identity-payload.mts`: **REVISION_FIELDS_MISSING** (packet_key, source_ref)

Conclusion: The live SvelteKit writer contains the EMB3A lineage fields; Qdrant population and non-zero upstream revision values still require proof.

No Qdrant, Postgres, RabbitMQ, Valkey, or canonical data was modified.
