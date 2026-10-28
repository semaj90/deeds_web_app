# Parent Atlas Source → Packet → Chunk Read-Only Audit

Date: 2026-10-27  
Mode: PostgreSQL 18 `READ ONLY` transactions; no canonical writes  
Verdict: **PARTIAL SOURCE/CHUNK LINEAGE; CURRENT WORKSPACE ADMISSION NOT CARRIED BY PACKETS**

## Current readback

- `atlas_workspace_source_bindings` contains 24,253 rows for admitted workspace revision `sha256:c63620c45fca8a3f2b3f17a45876925b7c978d4330bff273821de0d51d29a55c`.
- Across all 61,718 `atlas_packets`, 61,717 have a nonempty `source_ref`, 16,151 have a nonempty `source_revision`, and 16,151 have a nonempty `workspace_revision_key`. **Zero** packet rows carry the admitted `c636…` workspace revision key.
- Exact joins on `source_ref = canonical_source_ref` and `source_revision` yielded 15,352 packet rows/source refs from the admitted bindings.
- Joining those packets to `atlas_packet_chunk_lineage` on exact `packet_key`, `source_ref`, and `source_revision` yielded 13,820 distinct source refs and packet keys, 114,397 distinct canonical chunk IDs/rows, with all 13,820 joined sources having `EXACT_SINGLE_MEMBER` or `EXACT_MULTI_MEMBER` plus `revision_status = PROVEN`.
- The lineage table has 127,927 rows total; all have nonempty source refs/revisions and `revision_status = PROVEN` (909 `EXACT_SINGLE_MEMBER`, 127,018 `EXACT_MULTI_MEMBER`). These global counts are not the same as the admitted-binding join cohort.

## What this proves—and does not

This is exact database-key/path/revision linkage from current admitted source bindings through existing packet keys to chunk-lineage rows. It does **not** prove a fresh byte readback in this query, an admitted workspace key on the packet, PacketKeyV2 canonical identity resolution, embedding-representation parity, retrieval execution, SearchRuntime ranking, or ACE `ContextManifestV2` admission. Do not treat 13,820 as a current-workspace packet admission count.

An initial query used the integer `atlas_packets.workspace_revision` and failed on a text comparison; it was rolled back and produced no result. A later sub-count used the wrong workspace-revision literal and was discarded. The reported zero uses the actual text key column `workspace_revision_key` and exact admitted revision. All successful query blocks were explicitly `BEGIN READ ONLY` / `ROLLBACK`.

Machine-readable receipt: `.tmp/atlas/current-source-packet-chunk-readonly-20261027.json`.  
Canonical writes: 0. Cache/projection writes: 0.
