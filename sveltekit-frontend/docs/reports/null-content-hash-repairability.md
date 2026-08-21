# Null content-hash repairability audit

- Status: **READ_ONLY**
- Collection: `codebase_chunks_768_v2`
- Total null-hash rows: **6945**
- Sample: **250** rows at offset 0
- Metadata repair candidates: **247**
- Reindex/manual review required: **3**
- Manifest checksum: `ca25915b743d8b4b2e4c73c9b0852a476ba66ddd86495f0aed249521d73ae505`

## Classification counts

- METADATA_REPAIR_CANDIDATE: 247
- MISSING_SOURCE_CONTENT: 3

No Postgres or Qdrant writes were performed. A later repair command must require the reviewed manifest checksum and re-read every affected row/point before mutation.
