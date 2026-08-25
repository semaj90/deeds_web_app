# Packet/Chunk Mapping Audit

Generated: 2026-08-25T16:59:53.429Z
Status: WARN

## Summary

- Atlas packets: 61,660
- Codebase chunks: 52,417
- Exact source_ref matches: 87,950
- packet_key matches: 0
- feature_id matches: 0
- tree_node_id matches: 0
- qdrant_id matches: 1,280
- ambiguous mappings: 35,570
- unmapped packets: 54,319
- chunks mapped to multiple packets: 35,570
- packets mapped to multiple chunks: 6,921
- empty-path rows: 37
- invalid source refs: 37

## Samples

### Empty-path rows
```json
[
  {
    "id": "7cc9ccf5-284f-4850-97f1-b507a59c819e",
    "source_ref": "",
    "relative_path": "",
    "qdrant_id": "2de82a06-4b76-39f1-2ea5-93751c8622a3"
  },
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
  }
]
```

### Ambiguous mappings
```json
[
  {
    "chunk_id": "fff9c969-67ff-4035-9b3e-2ab53ce1dc02",
    "source_ref": "src/lib/components/ai/AskAI.svelte",
    "relative_path": "src/lib/components/ai/AskAI.svelte",
    "packet_keys": [
      "ace:packet:bf1ba0960873",
      "packet:fd332143ebba"
    ]
  },
  {
    "chunk_id": "48b5ea69-df09-4afc-9a37-00522ee7c5bf",
    "source_ref": "src/routes/api/library/documents/[documentId]/+server.ts",
    "relative_path": "src/routes/api/library/documents/[documentId]/+server.ts",
    "packet_keys": [
      "ace:packet:d9d032471c1a",
      "packet:ef9304444044"
    ]
  },
  {
    "chunk_id": "144ab32c-f194-4a46-a5b1-c1bd8bd162d4",
    "source_ref": "src/lib/server/unified/legal-ai-service.ts",
    "relative_path": "src/lib/server/unified/legal-ai-service.ts",
    "packet_keys": [
      "ace:packet:89fae5beb02d",
      "packet:a603f38b3028"
    ]
  },
  {
    "chunk_id": "bf643b39-7d60-4d5a-9fdd-ca8a47b01d5c",
    "source_ref": "src/lib/server/reconstruction/scene-compiler.ts",
    "relative_path": "src/lib/server/reconstruction/scene-compiler.ts",
    "packet_keys": [
      "ace:packet:02b21744c68f",
      "packet:c08285d4a340"
    ]
  },
  {
    "chunk_id": "48bf981e-b0ae-412b-bf09-bdc1cb711c53",
    "source_ref": "src/routes/api/codebase/auto-research/+server.ts",
    "relative_path": "src/routes/api/codebase/auto-research/+server.ts",
    "packet_keys": [
      "ace:packet:cf66d7e0d0a9",
      "packet:7057de19ac80"
    ]
  },
  {
    "chunk_id": "bc875738-a4a4-4a3b-8668-7fcf5e7da53b",
    "source_ref": "src/lib/components/evidence/DraggableEvidenceNode.svelte",
    "relative_path": "src/lib/components/evidence/DraggableEvidenceNode.svelte",
    "packet_keys": [
      "ace:packet:0d952c0c1f45",
      "packet:0dfe7d28a987"
    ]
  },
  {
    "chunk_id": "aac88f4d-df5b-44e7-a403-41a5a6f4f94c",
    "source_ref": "src/lib/server/reconstruction/aesthetic-presets.ts",
    "relative_path": "src/lib/server/reconstruction/aesthetic-presets.ts",
    "packet_keys": [
      "ace:packet:98442a594d30",
      "packet:d8d110d5ce64"
    ]
  },
  {
    "chunk_id": "4821e199-c90a-46bc-adde-e249e1f7a020",
    "source_ref": "src/routes/api/statutes/+server.ts",
    "relative_path": "src/routes/api/statutes/+server.ts",
    "packet_keys": [
      "ace:packet:c045fd4f0b5d",
      "packet:ff27d64e625e"
    ]
  },
  {
    "chunk_id": "074e8c2c-c08c-4412-9b9e-8f652d823a6c",
    "source_ref": "src/routes/(app)/couchdb-analytics/ClusterInspector.svelte",
    "relative_path": "src/routes/(app)/couchdb-analytics/ClusterInspector.svelte",
    "packet_keys": [
      "ace:packet:93a84b238108",
      "packet:2e3c4fc6c170"
    ]
  },
  {
    "chunk_id": "91ee8218-b84b-4071-bc8d-4ec88b9a4aae",
    "source_ref": "src/routes/api/phase89/graph/top-errors/+server.ts",
    "relative_path": "src/routes/api/phase89/graph/top-errors/+server.ts",
    "packet_keys": [
      "ace:packet:9870feefc4f5",
      "packet:d5be75d566e7"
    ]
  }
]
```
