# Structural lineage lane

Question: source -> packet -> chunk is current at the expected revisions, at the feature's grain.

Owner: `lineage-qualification-v2.ts` (pure; the caller passes rows). It accepts a chunk only when ALL hold:
- source binding supplies workspaceRevision + sourceRevision (from `atlas_workspace_source_bindings`, never from the chunk row);
- exact `packet_key` and raw `source_ref`;
- `atlas_packet_chunk_lineage.source_revision` equals the binding sourceRevision, `revision_status = PROVEN`, exact `membership_status`;
- `chunk_row_id` equals `codebase_chunk_index.id` and `canonical_chunk_id` equals the indexed `chunk_id`.

Never required: `codebase_chunk_index.source_revision` / `workspace_revision` mirrors. They are nullable diagnostics; null with otherwise exact lineage is ACCEPT.

Independent states (never collapse to one boolean): `PACKET_REVISION_QUALIFIED`, `CHUNK_REVISION_QUALIFIED`, `SEMANTIC_768_AVAILABLE`, `SUMMARY_AVAILABLE`, `SUMMARY_SEMANTIC_AVAILABLE`. Missing representation is not failed lineage.

Measure: `scripts/atlas/measure-mapreduce-chunk-readiness-v2.mts` over an explicitly named overlay manifest, `REPEATABLE READ READ ONLY`.
Trap (cost a false "1,406/1,520 mismatch" finding): join SQL readback rows to inputs by unique `chunkRowId`, never by array index after two different sorts. Fail closed unless the whole identity tuple matches.
