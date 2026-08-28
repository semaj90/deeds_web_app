# Packet/Chunk Mapping Audit

Generated: 2026-08-28T18:29:53.544Z
Status: WARN

## Summary

- Atlas packets: 61,660
- Codebase chunks: 55,206
- Exact source_ref matches: 90,523
- packet_key matches: 0
- feature_id matches: 0
- tree_node_id matches: 0
- qdrant_id matches: 1,280
- ambiguous mappings: 35,956
- unmapped packets: 54,186
- chunks mapped to multiple packets: 35,956
- packets mapped to multiple chunks: 7,049
- empty-path rows: 37
- invalid source refs: 37

## Samples

### Empty-path rows
```json
[
  {
    "id": "c9276dae-0d44-4610-bb3a-1b0761573025",
    "source_ref": "",
    "relative_path": "",
    "qdrant_id": "3f18cd44-c6df-7d3d-e51a-0c110f3cc224"
  },
  {
    "id": "7e772e02-5660-49a5-806d-1c4ff0129f54",
    "source_ref": "",
    "relative_path": "",
    "qdrant_id": "3368aa7b-aef7-2fb8-2d51-d0a46c9c5527"
  },
  {
    "id": "a84c11d3-f66a-4b4f-9663-d8201145f056",
    "source_ref": "",
    "relative_path": "",
    "qdrant_id": "116f0db7-dba3-5f21-dcbd-7bceaee6c048"
  },
  {
    "id": "89533630-dfb6-49b1-833b-17732bcd0784",
    "source_ref": "",
    "relative_path": "",
    "qdrant_id": "37a44ba8-fdc5-a8fe-0856-13dbf68c2f5d"
  },
  {
    "id": "226a0905-8bc8-4035-b3c0-6e150224d825",
    "source_ref": "",
    "relative_path": "",
    "qdrant_id": "3cb3e712-bf79-6b00-10af-292143c8629a"
  },
  {
    "id": "0e807030-12f0-4473-a5fc-40cfaacab380",
    "source_ref": "",
    "relative_path": "",
    "qdrant_id": "32517993-9ff6-96a7-5cdd-1c7ab69aa9af"
  },
  {
    "id": "3e525552-9a5a-47f6-90b1-b9127f9ee668",
    "source_ref": "",
    "relative_path": "",
    "qdrant_id": "1dbaf674-742b-639c-0f78-07cbc3b1687c"
  },
  {
    "id": "ae0f2a4e-a7ae-41a1-bce3-ba072e597376",
    "source_ref": "",
    "relative_path": "",
    "qdrant_id": "32ad21dd-037e-48c4-10ad-7d51bf805999"
  },
  {
    "id": "ed8bfb24-62ab-42f9-a570-de3c157224ac",
    "source_ref": "",
    "relative_path": "",
    "qdrant_id": "0ca1bc2e-b6f5-cb0e-987b-d345a21eeca2"
  },
  {
    "id": "979b1a34-b719-4dd2-85b0-1f794a62740d",
    "source_ref": "",
    "relative_path": "",
    "qdrant_id": "3153980c-d6ba-1072-8ffe-969d90c3758f"
  }
]
```

### Ambiguous mappings
```json
[
  {
    "chunk_id": "00c5c19b-71dd-4ee7-b363-a24a3ac2e270",
    "source_ref": "src/lib/server/embedding/embed-schema.ts",
    "relative_path": "src/lib/server/embedding/embed-schema.ts",
    "packet_keys": [
      "ace:packet:3949f4499758",
      "packet:9f94b776b3a7"
    ]
  },
  {
    "chunk_id": "6d02a319-af48-4235-8d06-88da8e672f00",
    "source_ref": "src/lib/server/indexer/legal-chunker.ts",
    "relative_path": "src/lib/server/indexer/legal-chunker.ts",
    "packet_keys": [
      "ace:packet:f89dd94b7512",
      "packet:70ffd8ddfd61"
    ]
  },
  {
    "chunk_id": "6d06971d-c469-4ddc-bfb2-52aa9919718e",
    "source_ref": "src/routes/api/statutes/search/+server.ts",
    "relative_path": "src/routes/api/statutes/search/+server.ts",
    "packet_keys": [
      "ace:packet:3dcdb9768f8f",
      "packet:acdd07dfcd4e"
    ]
  },
  {
    "chunk_id": "372aaa78-acd7-4b7b-bf51-87981cdfdb7d",
    "source_ref": "src/lib/components/citations/CitationList.svelte",
    "relative_path": "src/lib/components/citations/CitationList.svelte",
    "packet_keys": [
      "ace:packet:897e7cbf2b3a",
      "packet:2605f6962a90"
    ]
  },
  {
    "chunk_id": "6d098b63-504f-4f72-adbe-febc74fd4068",
    "source_ref": "src/lib/workers/compute-worker.mjs",
    "relative_path": "src/lib/workers/compute-worker.mjs",
    "packet_keys": [
      "ace:packet:3df0e909611c",
      "packet:6b69df5a2956"
    ]
  },
  {
    "chunk_id": "6d13ac7d-28f8-4cf5-8594-b3a7dec9238c",
    "source_ref": "src/lib/webgpu/som-webgpu-cache.ts",
    "relative_path": "src/lib/webgpu/som-webgpu-cache.ts",
    "packet_keys": [
      "ace:packet:356327d10270",
      "packet:4ac67c393668"
    ]
  },
  {
    "chunk_id": "b15c4176-240d-4d2a-badd-d186a83e1cc3",
    "source_ref": "src/lib/server/api-metadata-extractor.ts",
    "relative_path": "src/lib/server/api-metadata-extractor.ts",
    "packet_keys": [
      "ace:packet:8fa193413732",
      "packet:8a6b327877ea"
    ]
  },
  {
    "chunk_id": "376c9c8d-dc0d-49a8-b32d-d72bdc08bf73",
    "source_ref": "src/routes/api/analytics/focus/+server.ts",
    "relative_path": "src/routes/api/analytics/focus/+server.ts",
    "packet_keys": [
      "ace:packet:d9b33961c431",
      "packet:a608d191dc25"
    ]
  },
  {
    "chunk_id": "6d185505-6b6c-42c8-a732-2427f9d95eaf",
    "source_ref": "src/types/webgpu.d.ts",
    "relative_path": "src/types/webgpu.d.ts",
    "packet_keys": [
      "ace:packet:78601ae219c9",
      "packet:17d153e1288d"
    ]
  },
  {
    "chunk_id": "00c61214-d292-4d0e-aebb-2548ef827f60",
    "source_ref": "src/routes/+layout.svelte",
    "relative_path": "src/routes/+layout.svelte",
    "packet_keys": [
      "ace:packet:cc69d6a97e4f",
      "packet:18f5ecfbcd7a"
    ]
  }
]
```
