# Qdrant 768 historical embedding provenance census

Status: **QDRANT_768_PROVENANCE_CENSUS_COMPLETE**

This is a read-only PROV 00-02 census. It requested payloads but no vector bytes and performed no store writes.

## Collections

- `codebase_chunks_768_v2`: points=52380, vectors=[{"vector_name":"content","size":768,"distance":"Cosine","datatype":null,"on_disk":null},{"vector_name":"error","size":768,"distance":"Cosine","datatype":null,"on_disk":null},{"vector_name":"signature","size":768,"distance":"Cosine","datatype":null,"on_disk":null}]
- `codebase_chunks_768`: points=109776, vectors=[{"vector_name":"content","size":768,"distance":"Cosine","datatype":null,"on_disk":null},{"vector_name":"error","size":768,"distance":"Cosine","datatype":null,"on_disk":null},{"vector_name":"signature","size":768,"distance":"Cosine","datatype":null,"on_disk":null}]

## Payload cohort status

- MIXED_HISTORY: 1
- PARTIAL: 1

## Promotion boundary

PROV 03 exact packet lineage and PROV 05 numerical corroboration are intentionally not performed here. A 768/Cosine collection or an embedding_model string is not sufficient evidence for full model/prompt/runtime provenance.
