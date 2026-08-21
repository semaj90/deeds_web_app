# Null content-hash repairability audit — FULL POPULATION

- Status: **READ_ONLY**
- Collection: `codebase_chunks_768_v2`
- Total null-hash rows: **6945**
- Rows classified: **6945**
- Metadata repair candidates: **6908**
- Reindex/manual review required: **37**
- Manifest checksum: `18ead97b590464f9f6fbccc5737305799eff58d992fc6275c61fb2ea71b61afa`

## Classification counts

- METADATA_REPAIR_CANDIDATE: 6908
- MISSING_SOURCE_CONTENT: 37

No Postgres or Qdrant writes were performed. Apply mode requires --apply plus
--confirm-checksum=<manifestChecksum> matching the checksum above, recomputed
fresh from the manifest file at apply time.
